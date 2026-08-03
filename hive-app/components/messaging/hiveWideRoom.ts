import {
  getRoomCustomization,
  getRoomDisplayName,
  getRoomSubtitle,
} from '../../lib/chatRoomDisplay';

/**
 * What Messages calls the two rooms everybody has.
 *
 * Nat, 2026-08-03: "inside each hive, we can make sure there is a your hive & a
 * hive wide. So instead of General this would say OG HIVE."
 *
 * The database row is still called General and stays called General — the
 * mention notifier, the delete guard and older migrations all key off that
 * name. This is the screen's vocabulary only, so the two never have to agree.
 */

type DisplayRoom = Parameters<typeof getRoomDisplayName>[0];

/** The room above all the HIVEs. It has no row of its own yet. */
export const HIVE_WIDE_ROOM_NAME = 'HIVE-Wide';
export const HIVE_WIDE_ROOM_SUBTITLE = 'Every HIVE, in one room';

/** HIVE-Wide's green, softened for a panel and for an edge. */
export const HIVE_WIDE_SOFT = 'rgba(63,125,92,0.10)';
export const HIVE_WIDE_EDGE = 'rgba(63,125,92,0.4)';

/**
 * The name a room wears on screen. Your HIVE's own room takes the HIVE's name,
 * so "OG HIVE" and "HIVE-Wide" sit side by side and it is obvious which is
 * which. Anything a member renamed for themselves keeps their name for it.
 */
export function getMessagesRoomLabel(
  room: DisplayRoom,
  currentUserId: string | undefined,
  hiveName: string
): string {
  const ownTitle = getRoomCustomization(room, currentUserId).title;
  if (ownTitle) return ownTitle;
  if (room.room_type === 'community') return hiveName;
  return getRoomDisplayName(room, currentUserId);
}

/**
 * The line under the name. The stock subtitle falls back to the row's own name,
 * which would put "General" back on screen the moment somebody renames their
 * copy of the room — so the HIVE room answers the question that line is really
 * asking: who is in here.
 */
export function getMessagesRoomSubtitle(
  room: DisplayRoom,
  currentUserId: string | undefined,
  hiveName: string
): string | null {
  if (room.room_type === 'community') {
    const ownTitle = getRoomCustomization(room, currentUserId).title;
    // If somebody renamed their copy to the HIVE's own name, showing it twice
    // reads like a stutter, so fall through to who's in here (2026-08-03).
    return ownTitle && ownTitle !== hiveName ? hiveName : 'Everyone in this HIVE';
  }
  return getRoomSubtitle(room, currentUserId);
}

/**
 * What HIVE-Wide says while it is empty.
 *
 * There is no cross-HIVE chat room in the data yet, so the honest thing is to
 * show the room, say so, and invent nothing. Written without naming the other
 * HIVEs by name because a fourth one arriving shouldn't make this line wrong.
 *
 * 2026-08-03, second pass: the first draft said the room "fills as the other
 * HIVEs settle in", which would leave a member waiting on messages that have
 * nowhere to come from — nothing writes to this room, because there is no row
 * behind it. It now says where it actually stands.
 */
export function getHiveWideEmptyCopy(hiveName: string) {
  return {
    heading: 'The room every HIVE shares',
    body:
      'This one belongs to all the HIVEs at once. It is still being built — '
      + 'when it opens, whatever is said here reaches every HIVE.',
    footer: `${hiveName} is a tap away, and what you say there stays inside ${hiveName}.`,
  };
}
