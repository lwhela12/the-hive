import type { Profile } from '../types';
import { hiveDisplayName, HIVE_GOLD } from './hiveBrand';
import { normaliseScope, type ScopeKey } from './scopeLook';
import {
  expandMemberAliasTerms,
  getMemberAliasesForName,
  normalizeMemberHandle,
  normalizeMemberSearchText,
} from './memberAliases';

/**
 * Who "@everyone" reaches, now that there is more than one HIVE.
 *
 * Nat, 2026-08-11: *"We dont want those commands to behave differently
 * depending on which HIVE you're in. I say at all, everyone or wide should
 * ALWAYS be HIVE wide."* That replaces the rule this file ran on until today —
 * "everyone" used to mean the furthest a room/board/wish could travel, so the
 * same word reached a different group depending on where it was typed: OG
 * HIVE's `@all` meant OG, Production's `@all` meant Production. Nat's point is
 * that a member should be able to trust the word means the same thing every
 * time they read it.
 *
 * ## The one rule now
 *
 * **The everyone words — `@all`, `@everyone`, `@wide`, `@hive` and the rest of
 * `BROADCAST_MENTION_HANDLES` — always mean HIVE-Wide.** Not "the furthest
 * this particular thing happens to reach" — always literally every HIVE. To
 * tag one HIVE specifically, its own name is what you type: `@og`, `@tech`,
 * `@production`. Those keep meaning exactly what they always meant, that HIVE
 * and nothing wider.
 *
 * ## What the words do
 *
 * | you type | you get |
 * |---|---|
 * | `@all` `@everyone` `@everybody` `@wide` `@hive` | Everyone HIVE-Wide — every member of every HIVE |
 * | `@og` `@tech` `@production` | that HIVE, by its own name |
 *
 * ## The picker shows two rows, not a directory of every HIVE
 *
 * Composing inside OG HIVE offers exactly "Everyone HIVE-Wide" and "Everyone
 * in OG HIVE" — never Tech's or Production's handle, even from a screen (the
 * HIVE-Wide board, say) that happens to know every HIVE the writer belongs to.
 * `getGroupMentionSuggestions` only ever names the HIVE the writing is
 * actually hosted in, plus the one HIVE-Wide row.
 *
 * ## A tag still cannot outrun what can be seen
 *
 * A notification is a copy of the thing: it carries a preview and a link.
 * Sending one to somebody who cannot open the thing either leaks what it says
 * or hands them a door that is locked. So even though the everyone words now
 * always MEAN HIVE-Wide, what actually gets reported for notifying people
 * (`getMentionedGroups`) still cannot travel further than `reach` —
 * `chat_rooms.reach`, `board_categories.reach`, `wishes.share_scope`, narrowed
 * by the host HIVE's ceiling `communities.max_share_scope` — allows. Typed
 * somewhere that has not been set to travel HIVE-Wide, the everyone words
 * still land on the one HIVE that IS reachable, same as they always have.
 *
 * That is also why the "Everyone HIVE-Wide" picker row greys out instead of
 * just working, when the room/board/wish it is offered on has not been set to
 * travel that far (Nat, 2026-08-11: *"can that option be grayed out if the
 * board or convo or whatever isnt shared? Like 'change visibility settings to
 * HIVE wide in order to tag someone HIVE wide'?"*). Tagging people who cannot
 * see the content would be exactly the leak this file exists to prevent, so
 * the row says why instead of pretending the tap would work.
 *
 * ## A closed room stays closed
 *
 * `getMentionedMembers` has always expanded an everyone word to the member
 * list the calling screen handed it, and never further. A DM or group chat
 * sets `closedRoom` on its `MentionReach`, and that stays the whole answer —
 * "everyone" there is the handful of people in the chat, never HIVE-Wide,
 * whatever anyone types. `getMentionedGroups` reports that as `{ kind: 'room'
 * }`, never `hive_wide`, so a closed room can never fan out past its own
 * members even server-side.
 *
 * A private 1:1 with Clive goes one step further: nobody else can ever read
 * it (`conversations` is row-locked to its one `user_id`, and there is no
 * function that notifies anyone about it), so there is no group to tag at
 * all. `ChatInterface.tsx` marks its `MentionReach` with `noGroups: true`, and
 * every function below returns nothing rather than offering a picker row that
 * would be a promise the app cannot keep. Naming one *person* still works
 * there — that is just useful context for Clive to read — only the whole-HIVE
 * rows are turned off.
 *
 * ## Naming another HIVE by hand delivers now (2026-08-12)
 *
 * Nat's shout-out idea from 2026-08-06: *"@OG HIVE dont forget ___ & @tech
 * HIVE dont forget ___"* — one message, two HIVEs, everyone in each actually
 * told. The picker still shows its two rows (Nat's 2026-08-11 call stands),
 * but a handle TYPED by hand — `@og`, `@tech`, `@production` — now resolves
 * to that HIVE even when it is not the one hosting the writing, so long as
 * the writing travels HIVE-Wide. `getMentionedGroups` reports it, and
 * delivery happens server-side (`sendMentionNotifications` in
 * `lib/mentionableMembers.ts`), because the sender may stand outside the
 * tagged HIVE and row-level security rightly hides its member list from
 * them. Only the notify-* edge functions, holding the service role and
 * checking who is asking, can turn "@tech" into Tech HIVE's people.
 */

export type MentionGroupKind = 'hive' | 'hive_wide' | 'room';

export type MentionTarget = Pick<Profile, 'id' | 'name'> & {
  handle?: string;
  /** True for any row that reaches a group of people rather than one person. */
  isBroadcast?: boolean;
  description?: string;
  /** Which kind of group this row reaches. Absent on a person. */
  group?: MentionGroupKind;
  /** For a `hive` row: which HIVE. */
  communityId?: string;
  /** For a `hive` row: that HIVE's colour, so it can wear its own hexagon. */
  accent?: string;
  /**
   * True when this row is shown but cannot be tapped — right now only the
   * HIVE-Wide row, when the thing being written on has not been set to travel
   * that far. `description` carries the reason so the picker can show it.
   */
  disabled?: boolean;
};

/** One HIVE, small enough to hand to a picker. */
export type TaggableHive = {
  id: string;
  name: string;
  /** `communities.accent_color`. Blank falls back to HIVE gold. */
  accent?: string | null;
};

/**
 * How far the thing being written can travel, and which HIVE it may name.
 *
 * A screen builds one of these and hands it to the picker. Everything the
 * picker offers comes out of it, which is the point: the offer and the
 * resolution read the same object, so a row can never appear that resolution
 * would then quietly drop.
 */
export type MentionReach = {
  /** The HIVE this is being written inside. */
  hive?: TaggableHive | null;
  /**
   * The rung the writing itself sits on — `chat_rooms.reach`,
   * `board_categories.reach`, `wishes.share_scope`. Anything unrecognised is
   * read as `hive`, the rung that travels least. This is what decides whether
   * the HIVE-Wide row is tappable or greyed out — it no longer decides what
   * the everyone words MEAN, only how far a tag of them can actually go.
   */
  reach?: string | null;
  /**
   * The host HIVE's ceiling, `communities.max_share_scope`. It only ever
   * narrows. Left out, the writing's own reach stands on its own — that value
   * is the one row-level security already enforces, and the ceiling is a second
   * guard on top of it rather than a replacement for it.
   */
  ceiling?: string | null;
  /**
   * HIVEs beyond the one hosting the writing, whose typed handles may resolve.
   *
   * The picker never offers these — it shows the two rows Nat asked for
   * (2026-08-11) and nothing more. But `getMentionedGroups` reads this list
   * again as of 2026-08-12, for handles the writer TYPED by hand: "@tech"
   * written on a HIVE-Wide board should reach Tech HIVE, and this is where
   * detection learns Tech HIVE exists. `useMentionReach()` fills it with the
   * writer's own other HIVEs; `sendMentionNotifications` swaps in every HIVE
   * there is at send time, since any member may read every HIVE's name
   * (migration 137).
   */
  otherHives?: TaggableHive[];
  /** A HIVE-Wide form may offer all its named HIVEs as clickable choices. */
  offerOtherHives?: boolean;
  /**
   * A fixed handful of people: a DM or a group chat. When this is set it is the
   * whole answer — "everyone" is the people in the room and nothing wider is
   * offered, whatever HIVE it is hosted in.
   */
  closedRoom?: { label: string; description?: string } | null;
  /**
   * True where nobody else could ever read a group tag at all — a private 1:1
   * with Clive. Naming a person is still fine; there is simply no "everyone"
   * for a whole-group row to mean, so every group row and every whole-group
   * resolution is left off rather than offering a broadcast that goes nowhere.
   */
  noGroups?: boolean;
};

/** What resolution and the picker both work from. */
type SettledReach = {
  rung: ScopeKey;
  /** True when the writing already reaches every HIVE. */
  wide: boolean;
  /** The one HIVE the picker may offer: the HIVE hosting the writing. */
  hives: TaggableHive[];
  /**
   * The HIVEs a handle typed by hand may resolve to. The home HIVE always
   * may. Any other HIVE counts only once the writing travels HIVE-Wide,
   * because a tag cannot outrun what can be seen — members of a HIVE that
   * cannot open the thing must not be told what it says.
   */
  named: TaggableHive[];
  closedRoom: { label: string; description?: string } | null;
};

const GROUP_ID_WIDE = '__mention_group_hive_wide__';
const GROUP_ID_ROOM = '__mention_group_room__';
const GROUP_ID_HIVE_PREFIX = '__mention_group_hive__:';

/**
 * The words that have always meant "everybody who can read this" — and, as of
 * 2026-08-11, always mean HIVE-Wide specifically, never "whichever HIVE this
 * happens to be typed in." `hive` sits in here on equal footing with the rest
 * now: asking for "the HIVE" and asking for "everyone" are the same request.
 */
const BROADCAST_MENTION_HANDLES = new Set([
  'hive',
  'all',
  'everyone',
  'every',
  'everybody',
  'group',
  'community',
  'members',
  // Nat's suggestion, 2026-08-06 — a word that says "wide" out loud.
  'wide',
  'hivewide',
  'allhives',
]);

/** Typing this asks for a HIVE by name, kept only for the display-name trim below. */
const HIVE_WORD = 'hive';

/** Extra words that reach the handful of people in a DM or group chat. */
const ROOM_WORDS = new Set(['here', 'chat', 'room', 'thread']);

function normalizeMentionHandle(value?: string | null): string {
  return normalizeMemberHandle(value);
}

function getFirstName(name?: string) {
  return name?.trim().split(/\s+/)[0] || '';
}

function getMemberMentionHandles(name?: string) {
  const handles = [
    getFirstName(name),
    name,
    ...getMemberAliasesForName(name),
  ].map(normalizeMentionHandle).filter(Boolean);

  return Array.from(new Set(handles));
}

function getMentionQueryHandles(value: string) {
  const handles = [
    normalizeMentionHandle(value),
    ...expandMemberAliasTerms(value).map(normalizeMentionHandle),
  ].filter(Boolean);

  return Array.from(new Set(handles));
}

function getMentionHandles(content: string) {
  return new Set(
    Array.from(content.matchAll(/@([a-z0-9._-]+)/gi))
      .flatMap((match) => getMentionQueryHandles(match[1]))
      .filter(Boolean)
  );
}

/** Does anything the writer typed point at this row? */
function matchesHandles(query: string | null | undefined, handles: string[]): boolean {
  const normalizedQuery = normalizeMentionHandle(query);
  if (!normalizedQuery) return true;

  const queryHandles = getMentionQueryHandles(query || '');
  return queryHandles.some((candidate) =>
    handles.some((handle) => handle.startsWith(candidate) || handle.includes(candidate))
  );
}

/**
 * What to type for a HIVE: its own name with the word HIVE taken off, so "OG
 * HIVE" is `@og` and "Tech HIVE" is `@tech` — the shape Nat asked for. The full
 * squashed name comes back too, so `@oghive` finds it as well.
 */
export function getHiveMentionHandles(name?: string | null): string[] {
  const display = hiveDisplayName(name);
  const words = normalizeMemberSearchText(display).split(/\s+/).filter(Boolean);
  const compact = words.join('');
  const short = words.length > 1 && words[words.length - 1] === HIVE_WORD
    ? words.slice(0, -1).join('')
    : compact;

  return Array.from(new Set([short, compact].filter(Boolean)));
}

/** The one you type. */
export function getHiveMentionHandle(name?: string | null): string {
  return getHiveMentionHandles(name)[0] || HIVE_WORD;
}

const RUNG_RANK: Record<ScopeKey, number> = { hive: 0, all_hives: 1, public: 2 };

/**
 * Turn what a screen knows into the two facts the picker needs: how far this
 * can go, and which HIVE it may name.
 *
 * With nothing passed, this settles on the rung that travels least and no
 * named HIVE. That is on purpose — a screen that has not said how far its
 * writing goes gets the answer that cannot leak.
 */
function settleReach(reach?: MentionReach | null): SettledReach {
  const closedRoom = reach?.closedRoom ?? null;
  const own = normaliseScope(reach?.reach);
  const ceiling = reach?.ceiling == null ? own : normaliseScope(reach.ceiling);
  const rung: ScopeKey = RUNG_RANK[ceiling] < RUNG_RANK[own] ? ceiling : own;
  const wide = RUNG_RANK[rung] >= RUNG_RANK.all_hives;

  // A closed room's reach is the people in it, full stop. It can be hosted in a
  // HIVE that shares everything with everybody and it still only reaches the
  // handful who are in the chat.
  if (closedRoom) {
    return { rung: 'hive', wide: false, hives: [], named: [], closedRoom };
  }

  // Only the HIVE hosting this writing is ever OFFERED — see the file's own
  // doc comment. `otherHives` used to be added to the picker whenever the
  // writing reached HIVE-Wide, which is exactly the multi-row picker Nat asked
  // to have removed (2026-08-11).
  const home = reach?.hive ?? null;
  const hives: TaggableHive[] = home ? [home] : [];

  // A handle TYPED by hand is a different question from a row on offer
  // (2026-08-12, Nat's "@OG HIVE dont forget ___ & @tech HIVE dont forget ___"
  // shout-out). Another HIVE's name resolves only where the writing already
  // travels HIVE-Wide, so its members can open the thing they are told about.
  const named: TaggableHive[] = [...hives];
  if (wide) {
    for (const hive of reach?.otherHives ?? []) {
      if (hive?.id && !named.some(candidate => candidate.id === hive.id)) {
        named.push(hive);
        if (reach?.offerOtherHives) hives.push(hive);
      }
    }
  }

  return { rung, wide, hives, named, closedRoom: null };
}

/**
 * The group rows on offer for what is being written, in reach order: HIVE-Wide
 * first, then the HIVE this is hosted in.
 *
 * Every label names who it reaches. "Everyone HIVE-Wide" always means every
 * HIVE now (Nat, 2026-08-11) — it shows up even where the writing cannot
 * actually travel that far, but greyed out and saying why, rather than being
 * left off or silently working when it should not.
 */
export function getGroupMentionSuggestions(
  query: string | null | undefined,
  reach?: MentionReach | null
): MentionTarget[] {
  // A private 1:1 with Clive has nobody else who could ever read a group tag —
  // see the file's own doc comment.
  if (reach?.noGroups) return [];

  const settled = settleReach(reach);
  const rows: MentionTarget[] = [];

  if (settled.closedRoom) {
    const handles = [...Array.from(BROADCAST_MENTION_HANDLES), ...Array.from(ROOM_WORDS)];
    if (matchesHandles(query, handles)) {
      rows.push({
        id: GROUP_ID_ROOM,
        name: settled.closedRoom.label,
        handle: 'all',
        isBroadcast: true,
        group: 'room',
        description: settled.closedRoom.description
          ?? 'Everyone in this chat (@all and @everyone both work)',
      });
    }
    return rows;
  }

  const homeHive = settled.hives[0] ?? null;
  const homeHiveName = homeHive ? hiveDisplayName(homeHive.name) : null;

  if (matchesHandles(query, Array.from(BROADCAST_MENTION_HANDLES))) {
    rows.push({
      id: GROUP_ID_WIDE,
      name: 'Everyone HIVE-Wide',
      handle: 'wide',
      isBroadcast: true,
      group: 'hive_wide',
      disabled: !settled.wide,
      description: settled.wide
        ? 'Every member of every HIVE — @all, @everyone and @wide'
        : `Change ${homeHiveName ?? 'this'}'s visibility to HIVE-Wide to tag everyone`,
    });
  }

  for (const hive of settled.hives) {
    if (!matchesHandles(query, getHiveMentionHandles(hive.name))) continue;
    const handle = getHiveMentionHandle(hive.name);
    const name = hiveDisplayName(hive.name);
    rows.push({
      id: `${GROUP_ID_HIVE_PREFIX}${hive.id}`,
      name: `Everyone in ${name}`,
      handle,
      isBroadcast: true,
      group: 'hive',
      communityId: hive.id,
      accent: hive.accent || HIVE_GOLD,
      description: `Just ${name} — @${handle}`,
    });
  }

  return rows;
}

/**
 * The furthest single group this writing can reach, or nothing when the query
 * points elsewhere. Kept as a one-row convenience for anywhere that has room
 * for one suggestion rather than a list.
 */
export function getBroadcastMentionSuggestion(
  query: string | null | undefined,
  reach?: MentionReach | null
): MentionTarget | null {
  return getGroupMentionSuggestions(query, reach)[0] ?? null;
}

/**
 * Did the writer tag a whole group with one of the everyone words?
 *
 * Deliberately narrow: only the words that have always meant everybody. A
 * HIVE's own name — `@og`, `@tech` — is NOT counted here, because the screens
 * that call this expand a true answer to the member list they are holding,
 * and that list is one HIVE's. `@tech` typed in OG HIVE would then notify OG.
 * Named HIVEs go through `getMentionedGroups` instead, which says which HIVE
 * it was.
 */
export function hasBroadcastMention(content: string): boolean {
  const mentionHandles = getMentionHandles(content);
  return Array.from(mentionHandles).some((handle) => BROADCAST_MENTION_HANDLES.has(handle));
}

/**
 * One group tag found in written text.
 *
 * `here` is the honest answer for a screen that has not told us which HIVE it
 * is standing in: everybody who can see the thing, whoever that turns out to
 * be. It reaches no further than the member list the screen already holds.
 */
export type MentionedGroup =
  | { kind: 'hive_wide' }
  | { kind: 'hive'; id: string; name: string }
  | { kind: 'room' }
  | { kind: 'here' };

/**
 * Which whole-group tags are in this text, and who each one reaches.
 *
 * The everyone words always MEAN HIVE-Wide now, but this is also the function
 * a notification fan-out reads, so it still will not report `hive_wide`
 * unless the writing itself can actually travel that far (`settled.wide`).
 * Typed somewhere that cannot, the everyone words fall back to the one HIVE
 * that IS reachable — the same group the greyed-out picker row would have
 * named, had it been tappable. See the file's own doc comment.
 */
export function getMentionedGroups(
  content: string,
  reach?: MentionReach | null
): MentionedGroup[] {
  if (reach?.noGroups) return [];

  const settled = settleReach(reach);
  const handles = getMentionHandles(content);
  if (handles.size === 0) return [];

  const groups: MentionedGroup[] = [];
  const saidEveryone = Array.from(handles).some((handle) => BROADCAST_MENTION_HANDLES.has(handle));

  if (settled.closedRoom) {
    const saidRoom = saidEveryone || Array.from(handles).some((handle) => ROOM_WORDS.has(handle));
    return saidRoom ? [{ kind: 'room' }] : [];
  }

  if (settled.wide && saidEveryone) groups.push({ kind: 'hive_wide' });

  const homeId = settled.hives[0]?.id ?? null;
  settled.named.forEach((hive) => {
    const own = getHiveMentionHandles(hive.name);
    const namedByHand = own.some((handle) => handles.has(handle));
    // Can't reach HIVE-Wide from here, so the everyone words land on the one
    // HIVE that IS reachable instead — same as they always have. Only the home
    // HIVE ever catches them; a different HIVE has to be named on purpose.
    const reachedByEveryone = hive.id === homeId && !settled.wide && saidEveryone;
    if (namedByHand || reachedByEveryone) {
      groups.push({ kind: 'hive', id: hive.id, name: hiveDisplayName(hive.name) });
    }
  });

  if (groups.length === 0 && saidEveryone) groups.push({ kind: 'here' });

  return groups;
}

/**
 * The people a piece of writing tags, out of the list the calling screen holds.
 *
 * This never reaches past that list. An everyone word expands to it; a HIVE
 * named by hand expands to it only when that HIVE is the one the list came from
 * (`reach.hive`). Tagging a different HIVE returns nobody here on purpose —
 * `getMentionedGroups` reports it and the fan-out belongs server-side, where
 * row-level security can still referee who is allowed to hear about it.
 *
 * `reach.noGroups` (a private Clive chat) turns off both of those group
 * expansions — there is no "everyone" to reach — while still matching a named
 * person by hand, since naming someone is just useful context, not a promise
 * of a notification.
 */
export function getMentionedMembers(
  content: string,
  members: Pick<Profile, 'id' | 'name'>[],
  currentUserId?: string,
  reach?: MentionReach | null
): Pick<Profile, 'id' | 'name'>[] {
  const mentionHandles = getMentionHandles(content);

  if (mentionHandles.size === 0) return [];

  const groupsAllowed = !reach?.noGroups;

  const everyone = groupsAllowed && Array.from(mentionHandles).some((handle) =>
    BROADCAST_MENTION_HANDLES.has(handle)
  );

  const homeHive = reach?.hive;
  const namedHomeHive = groupsAllowed && !!homeHive
    && getHiveMentionHandles(homeHive.name).some((handle) => mentionHandles.has(handle));

  if (everyone || namedHomeHive) {
    return members.filter((member) => member.id && member.id !== currentUserId);
  }

  const mentioned = new Map<string, Pick<Profile, 'id' | 'name'>>();

  members.forEach((member) => {
    if (!member.id || member.id === currentUserId || !member.name) return;

    const memberHandles = getMemberMentionHandles(member.name);

    if (memberHandles.some((handle) => mentionHandles.has(handle))) {
      mentioned.set(member.id, member);
    }
  });

  return Array.from(mentioned.values());
}

/**
 * What to put on the "you tagged everyone" pill above a composer, so it names
 * the same people the picker named. Returns null when no group was tagged.
 */
export function getGroupMentionLabel(
  content: string,
  reach?: MentionReach | null
): string | null {
  const groups = getMentionedGroups(content, reach);
  if (groups.length === 0) return null;

  const parts = groups.map((group) => {
    if (group.kind === 'hive_wide') return 'everyone HIVE-Wide';
    if (group.kind === 'room') return 'everyone in this chat';
    if (group.kind === 'here') return 'everyone who can see this';
    return `everyone in ${group.name}`;
  });

  const unique = Array.from(new Set(parts));
  const listed = unique.length === 1
    ? unique[0]
    : `${unique.slice(0, -1).join(', ')} and ${unique[unique.length - 1]}`;

  return `Tagged ${listed}`;
}

export function getActiveMentionQuery(text: string, cursorIndex: number): string | null {
  const beforeCursor = text.slice(0, cursorIndex);
  const match = beforeCursor.match(/(^|\s)@([a-z0-9._-]*)$/i);
  return match ? match[2] : null;
}

export function getMentionSuggestions(
  query: string,
  members: Pick<Profile, 'id' | 'name'>[],
  currentUserId?: string,
  limit = 6,
  reach?: MentionReach | null
): MentionTarget[] {
  const normalizedQuery = normalizeMentionHandle(query);
  const queryHandles = getMentionQueryHandles(query);
  const groupSuggestions = getGroupMentionSuggestions(query, reach);

  // Groups sit at the top, so a long list of HIVEs never buries the people. Two
  // members always survive the trim — the list scrolls, and a picker that shows
  // only groups when you have typed a person's name is the wrong answer.
  const memberRoom = Math.max(limit - groupSuggestions.length, 2);

  const memberSuggestions = members
    .filter((member) => member.id && member.id !== currentUserId && member.name)
    .filter((member) => {
      if (!normalizedQuery) return true;
      const memberHandles = getMemberMentionHandles(member.name);
      return queryHandles.some((candidate) =>
        memberHandles.some((handle) => handle.startsWith(candidate) || handle.includes(candidate))
      );
    })
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, memberRoom);

  return [...groupSuggestions, ...memberSuggestions];
}

export function getMentionTargetHandle(member: Pick<Profile, 'name'> & Pick<MentionTarget, 'handle'>): string {
  return member.handle || getFirstName(member.name);
}

export function insertMention(
  text: string,
  cursorIndex: number,
  member: Pick<Profile, 'name'> & Pick<MentionTarget, 'handle'>
): { text: string; cursorIndex: number } {
  const beforeCursor = text.slice(0, cursorIndex);
  const afterCursor = text.slice(cursorIndex);
  const match = beforeCursor.match(/(^|\s)@([a-z0-9._-]*)$/i);
  const handle = `@${getMentionTargetHandle(member)} `;

  if (!match) {
    const prefix = beforeCursor.endsWith(' ') || beforeCursor.length === 0 ? '' : ' ';
    const nextText = `${beforeCursor}${prefix}${handle}${afterCursor}`;
    return {
      text: nextText,
      cursorIndex: beforeCursor.length + prefix.length + handle.length,
    };
  }

  const mentionStart = beforeCursor.length - match[2].length - 1;
  const nextText = `${beforeCursor.slice(0, mentionStart)}${handle}${afterCursor}`;
  return {
    text: nextText,
    cursorIndex: mentionStart + handle.length,
  };
}
