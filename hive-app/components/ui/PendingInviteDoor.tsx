import { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/hooks/useAuth';
import { accentOnDark, accentWash, hiveAccent, hiveDisplayName } from '../../lib/hiveBrand';
import { formatDateLong } from '../../lib/dateUtils';
import { showAlert } from '../../lib/showAlert';
import { startHiveTour } from '../../lib/hooks/useTourMarks';
import { HiveMark } from './HiveMark';
import type { Community, CommunityInvite, Profile } from '../../types';

/**
 * The in-app door for a pending invitation.
 *
 * On 2026-08-04 Lucas was invited to Tech HIVE. The invite email never arrived
 * (the send failed silently — see supabase/functions/invite/index.ts), and when
 * he signed into the app to look for the invitation instead, there was nowhere
 * that showed him one. The invite row was real, addressed to him, readable
 * under his own row-level security — and invisible.
 *
 * This card is the fix: a signed-in member whose email has a pending, unexpired
 * invite to a HIVE they are not already in sees the invitation itself, named
 * and coloured, with the same Accept that the email link offers. The email is
 * now one of two doors rather than the only one.
 *
 * The acceptance logic lives here too, exported as `acceptCommunityInvite`, and
 * `app/join.tsx` — the email-link path — imports it rather than keeping its own
 * copy. One join, two doors.
 */

/** The slice of an invite the card draws and the acceptance needs. */
export type PendingInviteForMe = Pick<
  CommunityInvite,
  'id' | 'community_id' | 'email' | 'role' | 'expires_at' | 'created_at'
> & {
  community: Pick<Community, 'id' | 'name' | 'accent_color'> | null;
  inviter: Pick<Profile, 'id' | 'name'> | null;
};

export type AcceptInviteResult =
  /** The membership exists now. The invite row carries `accepted_at`. */
  | { outcome: 'joined' }
  /** They were already inside — the invite row just never got tidied up. */
  | { outcome: 'already-member' }
  /**
   * The database refused the join: the invite was used, expired or revoked
   * while the screen sat open. Only a fresh invite fixes this one.
   */
  | { outcome: 'closed' }
  /** No profile row could be found or created for this session. */
  | { outcome: 'no-profile' };

/**
 * Find the signed-in person's profile row, creating it if this is their very
 * first arrival. Moved here from app/join.tsx with the rest of the acceptance.
 */
async function ensureProfile(profile: Profile | null, session: Session | null): Promise<Profile | null> {
  if (profile) return profile;
  if (!session?.user) return null;

  const { data: existingProfile, error: fetchError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', session.user.id)
    .maybeSingle();

  if (existingProfile) return existingProfile as Profile;
  if (fetchError) console.warn('Could not fetch profile before accepting invite:', fetchError.message);

  const { data: createdProfile, error: createError } = await supabase
    .from('profiles')
    .insert({
      id: session.user.id,
      name: session.user.user_metadata?.full_name || session.user.email?.split('@')[0] || 'New Member',
      email: session.user.email || '',
      avatar_url: session.user.user_metadata?.avatar_url || null,
      role: 'member',
    })
    .select()
    .single();

  if (createError) throw createError;
  return createdProfile as Profile;
}

/**
 * Accept an invitation — the one join in the whole app.
 *
 * Extracted from app/join.tsx on 2026-08-11 so the email-link path and the
 * in-app card run the very same steps. Both callers still decide their own
 * navigation and wording; this does the joining.
 *
 * What it deliberately does NOT do: send a role. Migration 151's trigger
 * (`role_comes_from_the_invite`) copies the role off the invite row when
 * somebody adds themselves, so the database — never the browser — decides what
 * seat the invite granted. Migration 155's trigger then lets the invitee stamp
 * `accepted_at` once, and nothing else, on their own invite.
 *
 * Throws on unexpected database errors; the named outcomes cover the expected
 * ones.
 */
export async function acceptCommunityInvite({
  invite,
  profile,
  session,
}: {
  invite: Pick<CommunityInvite, 'id' | 'community_id'>;
  profile: Profile | null;
  session: Session | null;
}): Promise<AcceptInviteResult> {
  const activeProfile = await ensureProfile(profile, session);
  if (!activeProfile) return { outcome: 'no-profile' };

  const { data: existingMembership } = await supabase
    .from('community_memberships')
    .select('id')
    .eq('community_id', invite.community_id)
    .eq('user_id', activeProfile.id)
    .maybeSingle();

  if (existingMembership) return { outcome: 'already-member' };

  // Create the membership. No role goes up from here — see the note above.
  const { error: membershipError } = await supabase
    .from('community_memberships')
    .insert({
      community_id: invite.community_id,
      user_id: activeProfile.id,
    });

  if (membershipError) {
    // A refusal here is the database saying this invite no longer opens the
    // door — used, expired, or withdrawn while the screen sat open.
    const refused =
      membershipError.code === '42501' ||
      /row-level security|violates row-level/i.test(membershipError.message || '');
    if (refused) return { outcome: 'closed' };
    throw membershipError;
  }

  // Update profile with current community
  const { error: profileError } = await supabase
    .from('profiles')
    .update({ current_community_id: invite.community_id })
    .eq('id', activeProfile.id);

  if (profileError) throw profileError;

  // Mark invite as accepted (try update first, then delete if that fails)
  const { error: inviteError } = await supabase
    .from('community_invites')
    .update({ accepted_at: new Date().toISOString() })
    .eq('id', invite.id);

  if (inviteError) {
    console.error('Failed to mark invite as accepted:', inviteError);
    await supabase
      .from('community_invites')
      .delete()
      .eq('id', invite.id);
  }

  // Create the welcome conversation with initial greeting
  const { data: welcomeConv } = await supabase
    .from('conversations')
    .insert({
      user_id: activeProfile.id,
      community_id: invite.community_id,
      title: 'Welcome to HIVE!',
      mode: 'default',
      is_active: true,
    } as any)
    .select()
    .single();

  if (welcomeConv) {
    const welcomeMessage = `Welcome to HIVE! Feel free to look around! You can see what's going on with the group on HIVE, add topics for discussion on the Board, chat with other members in the messages, or fill out your profile. When you're ready I'd love to chat with you about your goals and the skills you bring to the group!`;

    await supabase.from('chat_messages').insert({
      user_id: activeProfile.id,
      community_id: invite.community_id,
      conversation_id: (welcomeConv as any).id,
      role: 'assistant',
      content: welcomeMessage,
    } as any);
  }

  return { outcome: 'joined' };
}

/** The palette the page hands down, so the card wears the page's own colours. */
type DoorColours = {
  ink: string;
  inkSoft: string;
  fill: string;
  border: string;
  accent: string;
  scrim: string;
};

const normalizeEmail = (email?: string | null) => (email ?? '').trim().toLowerCase();

/**
 * The card itself. Renders nothing at all for the everyday case — no pending
 * invite — so every screen that mounts it pays one cheap query and no pixels.
 */
export function PendingInviteDoor({
  colours,
  onJoined,
}: {
  colours: DoorColours;
  /** Called once the person is in (newly joined or already a member). */
  onJoined: (communityId: string) => void | Promise<void>;
}) {
  const { session, profile, memberships } = useAuth();
  const [invites, setInvites] = useState<PendingInviteForMe[]>([]);
  const [joiningId, setJoiningId] = useState<string | null>(null);
  // "Not now" hides the card for this visit only. A pending invitation is a
  // real fact and comes back next time — quiet, but never lost again.
  const [dismissed, setDismissed] = useState(false);

  const myEmail = normalizeEmail(session?.user?.email || profile?.email);

  const load = useCallback(async () => {
    if (!myEmail) {
      setInvites([]);
      return;
    }
    try {
      const nowIso = new Date().toISOString();
      // Row-level security already limits this to invites addressed to your own
      // email (plus, for admins, the HIVEs they run) — the filter below narrows
      // it back to "mine", case-insensitively, on the client where lower() is
      // free. Same narrowed joins as app/join.tsx: only names are rendered.
      const { data, error } = await supabase
        .from('community_invites')
        .select('id, community_id, email, role, expires_at, created_at, community:communities(id, name, accent_color), inviter:profiles!community_invites_invited_by_fkey(id, name)')
        .is('accepted_at', null)
        .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const memberOf = new Set(memberships.map((m) => m.community_id));
      const seenHive = new Set<string>();
      const mine: PendingInviteForMe[] = [];
      ((data ?? []) as unknown as PendingInviteForMe[]).forEach((invite) => {
        if (normalizeEmail(invite.email) !== myEmail) return;
        // A HIVE they already walked into is a membership, not an invitation.
        if (memberOf.has(invite.community_id)) return;
        // Newest per HIVE — resending writes a fresh window onto the same row,
        // but an older duplicate row should not draw a second card.
        if (seenHive.has(invite.community_id)) return;
        seenHive.add(invite.community_id);
        mine.push(invite);
      });
      setInvites(mine);
    } catch (error) {
      // No card is the safe answer when the check falls over; the next visit
      // asks again.
      console.warn('Could not check for pending invites', error);
    }
  }, [myEmail, memberships]);

  useEffect(() => { void load(); }, [load]);

  const accept = async (invite: PendingInviteForMe) => {
    if (joiningId) return;
    setJoiningId(invite.id);
    try {
      const result = await acceptCommunityInvite({ invite, profile, session });

      if (result.outcome === 'joined' || result.outcome === 'already-member') {
        setInvites((current) => current.filter((i) => i.id !== invite.id));
        // A genuinely fresh join gets the welcome tour — same signal the
        // email-link door sends (see lib/hooks/useTourMarks.ts). Someone who
        // was already a member is not brand new, so no tour for them.
        if (result.outcome === 'joined') startHiveTour(invite.community_id);
        await onJoined(invite.community_id);
        return;
      }

      if (result.outcome === 'closed') {
        setInvites((current) => current.filter((i) => i.id !== invite.id));
        const inviterName = invite.inviter?.name?.trim();
        showAlert(
          'This invite has closed',
          `It was used, expired or taken back while this page was open. Ask ${inviterName || 'whoever invited you'} to send a fresh one.`,
        );
        return;
      }

      // no-profile
      showAlert('Your profile has not loaded yet', 'Refresh the page and try again.');
    } catch (error) {
      console.error('Error accepting invite:', error);
      showAlert('Could not join', 'That invite did not go through. Please try again.');
    } finally {
      setJoiningId(null);
    }
  };

  if (dismissed || invites.length === 0) return null;

  return (
    <View style={{ gap: 12 }}>
      {invites.map((invite) => {
        const name = hiveDisplayName(invite.community?.name);
        const raw = hiveAccent(invite.community);
        const colour = accentOnDark(raw);
        const inviterName = invite.inviter?.name?.trim();
        const joining = joiningId === invite.id;
        return (
          <View
            key={invite.id}
            style={{
              borderRadius: 16,
              borderWidth: 1.5,
              borderColor: colour,
              backgroundColor: colours.scrim,
              overflow: 'hidden',
            }}
          >
            <View style={{ backgroundColor: accentWash(raw, 0.22), padding: 16, gap: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
                <HiveMark size={16} colour={colour} />
                <Text
                  style={{
                    flex: 1,
                    fontFamily: 'Lato_700Bold',
                    fontSize: 12,
                    letterSpacing: 1.4,
                    textTransform: 'uppercase',
                    color: colour,
                  }}
                >
                  You have an invitation
                </Text>
                {/* Quiet, for this visit only — the invitation returns next time. */}
                <Pressable
                  onPress={() => setDismissed(true)}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel="Put this invitation away for now"
                >
                  <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 12.5, color: colours.inkSoft }}>
                    Not now
                  </Text>
                </Pressable>
              </View>

              <Text style={{ fontFamily: 'LibreBaskerville_700Bold', fontSize: 19, lineHeight: 26, color: colours.ink }}>
                {inviterName ? `${inviterName} invited you to join ${name}` : `You're invited to join ${name}`}
              </Text>

              <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 13.5, lineHeight: 19, color: colours.inkSoft }}>
                {invite.role && invite.role !== 'member' ? `You'd come in as ${invite.role}. ` : ''}
                {invite.expires_at
                  ? `This invitation is open until ${formatDateLong(invite.expires_at)}.`
                  : 'This invitation is open.'}
              </Text>

              <Pressable
                onPress={() => { void accept(invite); }}
                disabled={joining}
                accessibilityRole="button"
                accessibilityLabel={`Accept the invitation and join ${name}`}
                style={{
                  marginTop: 2,
                  paddingVertical: 12,
                  borderRadius: 999,
                  alignItems: 'center',
                  backgroundColor: joining ? accentWash(raw, 0.4) : raw,
                }}
              >
                <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 15, color: '#ffffff' }}>
                  {joining ? 'Joining…' : `Accept & join ${name}`}
                </Text>
              </Pressable>
            </View>
          </View>
        );
      })}
    </View>
  );
}
