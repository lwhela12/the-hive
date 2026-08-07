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
 * Nat, 2026-08-06: *"we need to update this in a big way: because @all
 * @everyone (and maybe one more that i'm forgetting) used to tag everyone in OG
 * HIVE... but that has a different meaning now that there are more HIVEs."*
 *
 * ## The one rule
 *
 * **An @ tag reaches the people who can already see the thing it is written
 * on.** The picker names them out loud, every time — "Everyone in OG HIVE",
 * "Everyone in every HIVE" — so the word "everyone" never has to be guessed at.
 *
 * That rule is what keeps this safe. A notification is a copy of the thing:
 * it carries a preview and a link. Sending one to somebody who cannot open the
 * thing either leaks what it says or hands them a door that is locked. So the
 * options this file offers are derived from how far the writing can actually
 * travel — `chat_rooms.reach`, `board_categories.reach`, `wishes.share_scope`,
 * narrowed by the host HIVE's ceiling `communities.max_share_scope` — and never
 * from what the writer happens to type.
 *
 * In a HIVE-only room the furthest "everyone" can mean is that HIVE, so that is
 * the only group row on offer, and the everyone words land on it. In a room
 * that already reaches HIVE-Wide, the furthest is every HIVE, so that is what
 * the everyone words land on, and each HIVE is offered separately underneath.
 *
 * ## What the words do
 *
 * | you type | you get |
 * |---|---|
 * | `@all` `@everyone` `@everybody` `@wide` | the furthest row this writing can reach |
 * | `@hive` | the HIVEs on offer, to pick one |
 * | `@og` `@tech` `@production` | that HIVE, by its own name |
 *
 * ## Existing `@all` text does not change meaning
 *
 * Every `@all`, `@everyone` and `@hive` already sitting in a message, a board
 * reply or a wish comment was typed inside one HIVE, on something whose reach
 * is `hive`. Meaning is read from where the writing sits, not from the word —
 * so those tags resolve today to exactly the group they resolved to when they
 * were typed: that HIVE. Nothing was rewritten, nothing widened, and no old
 * notification can suddenly reach a HIVE that was not there at the time.
 *
 * The only way an everyone word reaches further is if it is typed on something
 * that already travels, and then the picker said so in the row that was picked.
 *
 * ## Resolution stays inside the caller's list
 *
 * `getMentionedMembers` has always expanded an everyone word to the member list
 * the calling screen handed it — that screen's room, that screen's HIVE. It
 * still does, and it will never invent a recipient that was not in that list.
 * Reaching a HIVE the writer is not standing in is reported as a group by
 * `getMentionedGroups` and fanned out server-side, where row-level security can
 * still referee it.
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
};

/** One HIVE, small enough to hand to a picker. */
export type TaggableHive = {
  id: string;
  name: string;
  /** `communities.accent_color`. Blank falls back to HIVE gold. */
  accent?: string | null;
};

/**
 * How far the thing being written can travel, and which HIVEs are on offer.
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
   * read as `hive`, the rung that travels least.
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
   * Other HIVEs this writer can actually reach — normally the rest of their own
   * memberships. Offered only when the writing already travels HIVE-Wide.
   */
  otherHives?: TaggableHive[];
  /**
   * A fixed handful of people: a DM or a group chat. When this is set it is the
   * whole answer — "everyone" is the people in the room and nothing wider is
   * offered, whatever HIVE it is hosted in.
   */
  closedRoom?: { label: string; description?: string } | null;
};

/** What resolution and the picker both work from. */
type SettledReach = {
  rung: ScopeKey;
  /** True when the writing already reaches every HIVE. */
  wide: boolean;
  hives: TaggableHive[];
  closedRoom: { label: string; description?: string } | null;
};

const GROUP_ID_WIDE = '__mention_group_hive_wide__';
const GROUP_ID_ROOM = '__mention_group_room__';
const GROUP_ID_HIVE_PREFIX = '__mention_group_hive__:';
/** The unnamed group, for a screen that has not said which HIVE it is in. */
const GROUP_ID_HERE = '__mention_group_here__';

/**
 * The words that have always meant "everybody who can read this".
 *
 * `hive` is deliberately in here as well as in the HIVE row's own handles: it
 * meant everyone for the app's whole life so far, and every old message that
 * says `@hive` has to keep meaning what it meant. Typing it fresh now offers
 * the HIVEs to pick from, which is the change Nat asked for; reading it back
 * out of old text still reaches the group that could always see it.
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

/** The everyone words, without `hive` — those are the ones that point furthest. */
const FURTHEST_WORDS = new Set(
  Array.from(BROADCAST_MENTION_HANDLES).filter((word) => word !== 'hive')
);

/** Typing this asks for a HIVE by name, so the picker lists the ones on offer. */
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
 * can go, and which HIVEs it may name.
 *
 * With nothing passed, this settles on the rung that travels least and a single
 * unnamed group. That is on purpose — a screen that has not said how far its
 * writing goes gets the answer that cannot leak, and the label says "this HIVE"
 * rather than naming a HIVE it is only guessing at.
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
    return { rung: 'hive', wide: false, hives: [], closedRoom };
  }

  const seen = new Set<string>();
  const hives: TaggableHive[] = [];
  const add = (hive?: TaggableHive | null) => {
    if (!hive?.id || seen.has(hive.id)) return;
    seen.add(hive.id);
    hives.push(hive);
  };

  add(reach?.hive);
  // Other HIVEs are only worth naming once the writing already reaches every
  // HIVE. Inside one HIVE's room, tagging a different HIVE would send a
  // notification about something its members cannot open.
  if (wide) (reach?.otherHives ?? []).forEach(add);

  return { rung, wide, hives, closedRoom: null };
}

/** Every handle that lands on a given HIVE row. */
function hiveRowHandles(hive: TaggableHive, settled: SettledReach): string[] {
  const own = getHiveMentionHandles(hive.name);
  const handles = [...own, HIVE_WORD];

  // Inside one HIVE, that HIVE IS the furthest anything goes, so the everyone
  // words belong to it. This is the line that keeps every old `@all` pointing
  // exactly where it always pointed.
  if (!settled.wide) handles.push(...Array.from(FURTHEST_WORDS));

  return Array.from(new Set(handles));
}

/**
 * The group rows on offer for what is being written, in reach order: the
 * furthest first, then each HIVE by name.
 *
 * Every label names who it reaches. That is the whole fix — "Everyone in HIVE"
 * meant one thing when there was one HIVE and means two things now.
 */
export function getGroupMentionSuggestions(
  query: string | null | undefined,
  reach?: MentionReach | null
): MentionTarget[] {
  const settled = settleReach(reach);
  const rows: MentionTarget[] = [];

  if (settled.closedRoom) {
    const handles = [...Array.from(FURTHEST_WORDS), ...Array.from(ROOM_WORDS)];
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

  if (settled.wide) {
    const handles = [...Array.from(FURTHEST_WORDS), 'hives'];
    if (matchesHandles(query, handles)) {
      rows.push({
        id: GROUP_ID_WIDE,
        name: 'Everyone HIVE-Wide',
        handle: 'wide',
        isBroadcast: true,
        group: 'hive_wide',
        description: 'Every member of every HIVE — @all, @everyone and @wide',
      });
    }
  }

  // Where the HIVE rows go. Furthest-first is the right default — hit "@" with
  // nothing typed and the widest thing you can do is at the top. But Nat asked
  // for one specific behaviour by name: *"typing @hive should offer the HIVEs
  // you are in, so you can pick one."* So asking for a HIVE puts the HIVEs
  // first, and "everyone in every HIVE" waits underneath rather than being the
  // thing your thumb lands on.
  const askedForAHive = settled.hives.length > 0 && matchesHandles(query, [HIVE_WORD])
    && normalizeMentionHandle(query).length > 0;
  const hiveRows: MentionTarget[] = [];

  settled.hives.forEach((hive) => {
    if (!matchesHandles(query, hiveRowHandles(hive, settled))) return;
    const handle = getHiveMentionHandle(hive.name);
    const name = hiveDisplayName(hive.name);
    hiveRows.push({
      id: `${GROUP_ID_HIVE_PREFIX}${hive.id}`,
      name: `Everyone in ${name}`,
      handle,
      isBroadcast: true,
      group: 'hive',
      communityId: hive.id,
      accent: hive.accent || HIVE_GOLD,
      description: settled.wide
        ? `Just ${name} — @${handle}`
        : `Everyone who can see this — @${handle}, @all and @everyone`,
    });
  });

  const ordered = askedForAHive ? [...hiveRows, ...rows] : [...rows, ...hiveRows];

  // A screen that has not said how far its writing goes still needs an
  // "everyone" to offer, and it has to be the one that cannot leak.
  if (ordered.length === 0 && !settled.wide) {
    const handles = [...Array.from(FURTHEST_WORDS), HIVE_WORD];
    if (matchesHandles(query, handles)) {
      ordered.push({
        id: GROUP_ID_HERE,
        name: 'Everyone in this HIVE',
        handle: 'all',
        isBroadcast: true,
        group: 'hive',
        description: 'Everyone who can see this (@all, @everyone and @hive)',
      });
    }
  }

  return ordered;
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
 * Deliberately narrow: only the words that have always meant everybody, plus
 * Nat's `@wide`. A HIVE's own name — `@og`, `@tech` — is NOT counted here,
 * because the screens that call this expand a true answer to the member list
 * they are holding, and that list is one HIVE's. `@tech` typed in OG HIVE would
 * then notify OG. Named HIVEs go through `getMentionedGroups` instead, which
 * says which HIVE it was.
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
 * Read against the same `MentionReach` the picker was given, so a tag means the
 * same thing when it is sent as it did when it was offered. An everyone word
 * lands on the furthest row this writing reaches; a HIVE's name lands on that
 * HIVE.
 */
export function getMentionedGroups(
  content: string,
  reach?: MentionReach | null
): MentionedGroup[] {
  const settled = settleReach(reach);
  const handles = getMentionHandles(content);
  if (handles.size === 0) return [];

  const groups: MentionedGroup[] = [];
  const saidFurthest = Array.from(handles).some(
    (handle) => FURTHEST_WORDS.has(handle) || (!settled.wide && handle === HIVE_WORD)
  );

  if (settled.closedRoom) {
    const saidRoom = saidFurthest || Array.from(handles).some((handle) => ROOM_WORDS.has(handle));
    return saidRoom ? [{ kind: 'room' }] : [];
  }

  if (settled.wide && saidFurthest) groups.push({ kind: 'hive_wide' });

  settled.hives.forEach((hive) => {
    const own = getHiveMentionHandles(hive.name);
    const named = own.some((handle) => handles.has(handle));
    // Inside one HIVE the everyone words are that HIVE's, so they name it too.
    const reachedByEveryone = !settled.wide && saidFurthest;
    if (named || reachedByEveryone) {
      groups.push({ kind: 'hive', id: hive.id, name: hiveDisplayName(hive.name) });
    }
  });

  if (groups.length === 0 && saidFurthest) groups.push({ kind: 'here' });

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
 */
export function getMentionedMembers(
  content: string,
  members: Pick<Profile, 'id' | 'name'>[],
  currentUserId?: string,
  reach?: MentionReach | null
): Pick<Profile, 'id' | 'name'>[] {
  const mentionHandles = getMentionHandles(content);

  if (mentionHandles.size === 0) return [];

  const everyone = Array.from(mentionHandles).some((handle) =>
    BROADCAST_MENTION_HANDLES.has(handle)
  );

  const homeHive = reach?.hive;
  const namedHomeHive = !!homeHive
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
