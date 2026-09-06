import type { Community, Profile } from '../types';
import { hiveTagMark } from './hiveBrand';
import {
  getMentionedGroups,
  getMentionedMembers,
  type MentionReach,
  type TaggableHive,
} from './mentions';
import { supabase } from './supabase';

/**
 * Who a picker can offer, which HIVEs can be tagged as a whole — and, since
 * 2026-08-12, the one place a mention actually gets delivered from.
 *
 * The people half has always been one HIVE at a time, and stays that way: a
 * screen asks for the HIVE it is standing in, row-level security decides what
 * comes back. The HIVE half is new — see `lib/mentions.ts` for why "everyone"
 * needed to start saying whose everyone. Delivery lives at the bottom of this
 * file (`sendMentionNotifications`), because five screens each hand-rolled
 * the same "one edge-function call per tagged person" loop and none of them
 * could reach a whole HIVE the sender stands outside of.
 */

export type MentionableMember = Pick<Profile, 'id' | 'name'> & { avatar_url?: string | null };

/** Just enough of a membership row to name and colour a HIVE. */
type MembershipLike = {
  community_id: string;
  community?: Pick<Community, 'id' | 'name' | 'slug' | 'accent_color'> | null;
};

/**
 * The people, out of the membership rows and their profiles together.
 *
 * `profiles!inner(...)` is the whole shape: a membership row comes back with
 * the person attached, because `community_memberships` has a foreign key to
 * `profiles` and the database can follow it itself. It was two trips — ask who
 * is in the HIVE, wait, then ask who those people are — and the second could
 * not start until the first had landed. Measured against the live database on
 * 2026-08-06: 141 ms then 148 ms, against 145 ms for the pair as one question.
 *
 * Row-level security is unchanged by this. `!inner` drops a membership whose
 * profile you may not read, which is the same answer the second query used to
 * give by simply not returning that row. Proven from two accounts on
 * 2026-08-06: asking for a HIVE you are not in returns nothing, either way.
 */
function membersFromJoinedRows(rows: any[] | null | undefined): MentionableMember[] {
  const byId = new Map<string, MentionableMember>();
  for (const row of rows ?? []) {
    const person = row?.profiles;
    if (!person?.id || !person?.name) continue;
    byId.set(person.id, person as MentionableMember);
  }
  return Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name));
}

export async function fetchCommunityMentionableMembers(communityId: string): Promise<MentionableMember[]> {
  const { data, error } = await supabase
    .from('community_memberships')
    .select('user_id, profiles!inner(id, name, avatar_url)')
    .eq('community_id', communityId);

  if (error) {
    console.warn('[Mentions] community members load failed', error);
    return [];
  }

  return membersFromJoinedRows(data as any[]);
}

/**
 * The HIVEs a person belongs to, in the shape a mention picker wants.
 *
 * Straight off the memberships already in the auth context, so offering
 * "@OG" costs nothing and needs no round trip. It is deliberately only the
 * HIVEs this person is IN: those are the ones whose member list they are
 * allowed to read, so those are the ones a client can turn into notifications
 * on its own. Tagging a HIVE somebody is not a member of needs the fan-out to
 * happen server-side — see `lib/mentions.ts`.
 */
export function taggableHivesFromMemberships(memberships?: MembershipLike[] | null): TaggableHive[] {
  return (memberships ?? [])
    .map((membership) => {
      const community = membership.community;
      const id = community?.id || membership.community_id;
      if (!id) return null;
      return {
        id,
        name: (community?.name ?? '').trim() || 'HIVE',
        accent: hiveTagMark(community),
      } as TaggableHive;
    })
    .filter((hive): hive is TaggableHive => !!hive)
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** One HIVE, in the same shape, for the place you are standing right now. */
export function taggableHiveFromCommunity(
  community?: Pick<Community, 'id' | 'name' | 'slug' | 'accent_color'> | null
): TaggableHive | null {
  if (!community?.id) return null;
  return {
    id: community.id,
    name: (community.name ?? '').trim() || 'HIVE',
    accent: hiveTagMark(community),
  };
}

/**
 * Everybody in several HIVEs at once, de-duplicated — somebody in two HIVEs is
 * one person and gets one notification.
 *
 * Row-level security still decides: ask for a HIVE you are not in and its
 * members simply do not come back. A short list is the honest answer to "who
 * can this client reach", never a reason to widen the query.
 */
export async function fetchMentionableMembersForHives(
  communityIds: string[],
  options: { throwOnError?: boolean } = {},
): Promise<MentionableMember[]> {
  const ids = Array.from(new Set(communityIds.filter(Boolean)));
  if (ids.length === 0) return [];

  // One trip, same as the single-HIVE version above, and the de-duplication
  // that already had to happen anyway now does both jobs: somebody in two of
  // these HIVEs arrives on two membership rows and leaves as one person.
  const { data, error } = await supabase
    .from('community_memberships')
    .select('user_id, profiles!inner(id, name, avatar_url)')
    .in('community_id', ids);

  if (error) {
    console.warn('[Mentions] multi-HIVE members load failed', error);
    if (options.throwOnError) throw error;
    return [];
  }

  return membersFromJoinedRows(data as any[]);
}

/**
 * Every HIVE there is, in taggable shape.
 *
 * Any member of any HIVE may read every HIVE's name and colour — that is
 * migration 137, Nat's call, made knowingly — and a name, slug and colour are
 * exactly the three facts a typed "@og" needs in order to resolve and wear
 * the same small mark as the rest of the app. Members
 * stay private; this list says nothing about who is inside.
 *
 * Cached in the module for the same ten minutes as the member lists: new
 * HIVEs appear rarely, and a shout-out should not pay a round trip to learn
 * names that have not changed since the last one.
 */
const ALL_HIVES_STALE_MS = 10 * 60 * 1000;
let allHivesCache: { at: number; hives: TaggableHive[] } | null = null;

export async function fetchAllTaggableHives(): Promise<TaggableHive[]> {
  if (allHivesCache && Date.now() - allHivesCache.at < ALL_HIVES_STALE_MS) {
    return allHivesCache.hives;
  }

  const { data, error } = await supabase
    .from('communities')
    .select('id, name, slug, accent_color');

  if (error) {
    console.warn('[Mentions] HIVE list load failed', error);
    // A stale list of HIVE names still beats no list at all.
    return allHivesCache?.hives ?? [];
  }

  const hives = (data ?? [])
    .map((community: any) => taggableHiveFromCommunity(community))
    .filter((hive): hive is TaggableHive => !!hive)
    .sort((a, b) => a.name.localeCompare(b.name));

  allHivesCache = { at: Date.now(), hives };
  return hives;
}

/**
 * Delivery. One call, whatever was typed.
 *
 * Until 2026-08-12 every composer ran the same loop by hand: expand the @s
 * against the member list it could see, then one edge-function call per
 * person. That loop cannot notify a whole HIVE the sender stands outside of —
 * row-level security hides that HIVE's member list from the client, which is
 * correct and must stay. So whole-group tags go to the server as ONE call
 * naming the group, and the edge function (service role, and it checks who is
 * calling) resolves the members there. What still happens client-side:
 *
 * - people named by hand → one call each, exactly as before
 * - `@everyone` in a closed room (a group DM) → one call per room member,
 *   exactly as before, because the client's list IS the room
 * - a whole HIVE, or everyone HIVE-Wide → one call naming the group
 *
 * When a group goes server-side, the client deliberately stops expanding the
 * everyone words itself — otherwise everybody the sender CAN see would be
 * told twice, once by name and once with the group.
 */

type MentionMember = Pick<Profile, 'id' | 'name'>;

/** Which thing was written on. Decides the edge function and its id field. */
export type MentionNotificationTarget =
  | { kind: 'board'; postId: string; boardName?: string }
  | { kind: 'chat'; roomId: string; roomName?: string }
  | { kind: 'wish'; wishId: string; wishOwnerName?: string };

type SendMentionNotificationsOptions = {
  target: MentionNotificationTarget;
  senderId: string;
  /** The HIVE hosting the thing that was written on. */
  communityId: string;
  /** The full written text — where the @-handles are found. */
  content: string;
  /** What the notification shows. Defaults to the content itself. */
  preview?: string;
  /** The people this screen could see. People named by hand resolve from here. */
  members: MentionMember[];
  /** How far the writing travels. Build it with `useMentionReach()`. */
  reach?: MentionReach | null;
  /**
   * People who must not get an individual "mentioned you" call — a board
   * reply's post author, say, whom notify-board-reply already told. A
   * whole-group tag still reaches them, same as the old @everyone expansion
   * always did.
   */
  excludePersonIds?: string[];
};

function mentionFunctionAndPayload(
  target: MentionNotificationTarget,
  senderId: string,
  communityId: string,
  preview: string
): { functionName: string; payload: Record<string, unknown> } {
  const base = {
    sender_id: senderId,
    community_id: communityId,
    message_preview: preview,
  };
  if (target.kind === 'board') {
    return {
      functionName: 'notify-board-mention',
      payload: { ...base, post_id: target.postId, board_name: target.boardName },
    };
  }
  if (target.kind === 'chat') {
    return {
      functionName: 'notify-chat-mention',
      payload: { ...base, room_id: target.roomId, room_name: target.roomName },
    };
  }
  return {
    functionName: 'notify-wish-mention',
    payload: { ...base, wish_id: target.wishId, wish_owner_name: target.wishOwnerName },
  };
}

/** Fire-and-forget, like every mention call before it. Never throws. */
export function sendMentionNotifications(options: SendMentionNotificationsOptions): void {
  dispatchMentionNotifications(options).catch((err) =>
    console.log('Mention notification error (non-blocking):', err)
  );
}

async function dispatchMentionNotifications({
  target,
  senderId,
  communityId,
  content,
  preview,
  members,
  reach = null,
  excludePersonIds,
}: SendMentionNotificationsOptions): Promise<void> {
  const text = content.trim();
  const shownPreview = (preview ?? content).trim();
  if (!text || !shownPreview) return;

  // Resolve typed handles against every HIVE there is, not only the ones the
  // screen's reach object happened to know. An owner tags "@production" from
  // a HIVE she is standing outside of; detection has to know Production HIVE
  // exists before the server can be asked to reach it.
  let sendReach = reach;
  if (sendReach && !sendReach.noGroups && !sendReach.closedRoom && sendReach.hive && text.includes('@')) {
    try {
      const allHives = await fetchAllTaggableHives();
      if (allHives.length > 0) {
        const homeId = sendReach.hive.id;
        sendReach = {
          ...sendReach,
          otherHives: allHives.filter((hive) => hive.id !== homeId),
        };
      }
    } catch {
      // The reach we were handed still resolves the home HIVE and HIVE-Wide.
    }
  }

  const groups = getMentionedGroups(text, sendReach);
  const saidHiveWide = groups.some((group) => group.kind === 'hive_wide');
  // Groups the server fans out. Every HIVE is already inside HIVE-Wide, so a
  // named HIVE alongside @everyone would only push people twice — drop it.
  const serverGroups = groups.filter(
    (group) => group.kind === 'hive_wide' || (group.kind === 'hive' && !saidHiveWide)
  );

  // Once the server owns the group, the client stops expanding the everyone
  // words itself — `noGroups` leaves exactly the people named by hand. With no
  // server group (a closed room, or a screen with no HIVE context), the old
  // expansion still happens here, against the list the screen already holds.
  const personReach = serverGroups.length > 0 && sendReach
    ? { ...sendReach, noGroups: true }
    : sendReach;
  const excluded = new Set(excludePersonIds ?? []);
  const people = getMentionedMembers(text, members, senderId, personReach)
    .filter((member) => member.id && !excluded.has(member.id));

  const { functionName, payload } = mentionFunctionAndPayload(
    target,
    senderId,
    communityId,
    shownPreview
  );

  people.forEach((member) => {
    supabase.functions
      .invoke(functionName, { body: { ...payload, recipient_id: member.id } })
      .catch((err) => console.log('Mention notification error (non-blocking):', err));
  });

  serverGroups.forEach((group) => {
    const recipient_group = group.kind === 'hive_wide'
      ? { kind: 'hive_wide' }
      : { kind: 'hive', community_id: (group as { id: string }).id };
    supabase.functions
      .invoke(functionName, { body: { ...payload, recipient_group } })
      .catch((err) => console.log('Mention notification error (non-blocking):', err));
  });
}
