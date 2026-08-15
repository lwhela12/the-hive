import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { verifySupabaseJwt, isAuthError } from '../_shared/auth.ts';
import { corsHeaders, handleCors, errorResponse } from '../_shared/cors.ts';

/**
 * The video room for one HIVE's meeting.
 *
 * Nat, 2026-08-15, on the dining room as it actually is — a laptop on a stand
 * at one end of the table, a second laptop under the frame TV so the camera is
 * not at boob level, and Nick on Zoom from Washington with nobody sitting near
 * the machine she can see: *"trying to figure out transcripts and trying to
 * figure out meeting recording has always been such a pain in the ass ... it'd
 * be fucking dope if all the hive stuff just lived in the hive."*
 *
 * So the call lives in the app, next to the deck, and this function is the only
 * thing that ever touches `DAILY_API_KEY` — it never goes near the browser
 * bundle. The client asks for a room, gets back a URL and a short-lived token
 * with their own name already on it, and joins.
 *
 * One permanent room per HIVE, named `hive-<slug>`. Permanent because a HIVE
 * meets in the same place every month and there is nothing to clean up, and
 * prefixed because this Daily account is shared with Jasmine's Jammin Sprouts
 * (Nat's call, 2026-08-15: *"we can put it all in one account"*) and two apps
 * must not be able to name the same room.
 */

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const dailyApiKey = Deno.env.get('DAILY_API_KEY') ?? '';

const DAILY = 'https://api.daily.co/v1';

/** Four hours: longer than any meeting has ever run, shorter than a leak. */
const TOKEN_TTL_SECONDS = 4 * 60 * 60;

async function daily(path: string, init?: RequestInit) {
  const res = await fetch(`${DAILY}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${dailyApiKey}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body } as const;
}

serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    if (!dailyApiKey) {
      return errorResponse('Video is not configured yet (no DAILY_API_KEY).', 503);
    }

    const authHeader = req.headers.get('Authorization') ?? req.headers.get('authorization');
    const auth = await verifySupabaseJwt(authHeader);
    if (isAuthError(auth)) return errorResponse(auth.error, auth.status);
    const { userId, token } = auth;

    const { community_id } = await req.json().catch(() => ({}));
    if (!community_id) return errorResponse('community_id is required', 400);

    // Everything below reads as the caller, so RLS is what decides whether
    // they are allowed to know this HIVE exists — this function never widens
    // anyone's reach.
    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}`, apikey: supabaseAnonKey } },
    });

    const { data: membership } = await supabaseClient
      .from('community_memberships')
      .select('role, community:communities(slug, name)')
      .eq('community_id', community_id)
      .eq('user_id', userId)
      .maybeSingle();

    if (!membership) {
      return errorResponse('You are not in this HIVE.', 403);
    }

    const community = (membership as Record<string, any>).community as
      | { slug: string; name: string }
      | null;
    if (!community?.slug) {
      return errorResponse('That HIVE has no slug to name a room after.', 400);
    }

    const { data: profile } = await supabaseClient
      .from('profiles')
      .select('name')
      .eq('id', userId)
      .maybeSingle();

    const roomName = `hive-${community.slug}`;

    // Make the room if it is not there yet. A 400 from Daily on create is
    // almost always "already exists", so we look before we conclude anything —
    // the GET is the real answer either way.
    let room = await daily(`/rooms/${roomName}`);
    if (!room.ok) {
      const created = await daily('/rooms', {
        method: 'POST',
        body: JSON.stringify({
          name: roomName,
          privacy: 'private',
          properties: {
            // Straight in. The deck is already on screen and the meeting has
            // started; a lobby screen between the two is a stumble.
            enable_prejoin_ui: false,
            enable_screenshare: true,
            enable_chat: false, // the HIVE has Messages; two chats is one too many
            // Owners (a HIVE's admins) can start transcription. Nat wants it on
            // for Tech HIVE, where everyone is remote on their own device and
            // the speaker labels are therefore real names.
            enable_transcription_storage: false,
            start_video_off: false,
            start_audio_off: false,
          },
        }),
      });
      if (!created.ok) {
        // Two people pressing Join at the same moment both try to create it.
        // Ask once more before calling it a failure.
        room = await daily(`/rooms/${roomName}`);
        if (!room.ok) {
          return errorResponse(
            `Could not open ${community.name}'s video room: ${JSON.stringify(created.body)}`,
            502
          );
        }
      } else {
        room = created;
      }
    }

    const url = (room.body as Record<string, any>)?.url as string | undefined;
    if (!url) return errorResponse('Daily gave back a room with no URL.', 502);

    // A private room needs a token to enter, and the token is where the
    // person's name comes from — so the tiles say "Charlee", not "Guest".
    const isOwner = (membership as Record<string, any>).role === 'admin';
    const meetingToken = await daily('/meeting-tokens', {
      method: 'POST',
      body: JSON.stringify({
        properties: {
          room_name: roomName,
          user_id: userId,
          user_name: (profile as Record<string, any>)?.name ?? 'A HIVE member',
          is_owner: isOwner,
          exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS,
        },
      }),
    });

    if (!meetingToken.ok) {
      return errorResponse(
        `Could not make a way in: ${JSON.stringify(meetingToken.body)}`,
        502
      );
    }

    return new Response(
      JSON.stringify({
        url,
        token: (meetingToken.body as Record<string, any>).token,
        roomName,
        isOwner,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    return errorResponse(
      error instanceof Error ? error.message : 'Something went wrong opening the video room.',
      500
    );
  }
});
