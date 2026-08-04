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

/** The room above all the HIVEs. It has a row of its own now (migration 139). */
export const HIVE_WIDE_ROOM_NAME = 'HIVE-Wide';
export const HIVE_WIDE_ROOM_SUBTITLE = 'Every HIVE, in one room';

/**
 * HIVE-Wide's mark, and its soft/edge shades.
 *
 * These were green — #3F7D5C — and green was retired everywhere else on
 * 2026-08-03 when HIVE-Wide became space. The rail and the header have said
 * #0B0B12 since; messaging never got the memo, so the HIVE-Wide row in Messages
 * was green while the HIVE-Wide row in the rail two inches away was black.
 * One colour now, and it lives here rather than in HiveWideWelcome, which is no
 * longer rendered anywhere.
 */
export const HIVE_WIDE_MARK = '#0B0B12';
export const HIVE_WIDE_SOFT = 'rgba(11,11,18,0.08)';
export const HIVE_WIDE_EDGE = 'rgba(11,11,18,0.34)';

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
  // The shared room is checked FIRST, before the community-room rule below it.
  // It is a `community` room by type — that is how it gets its everyone-in-it
  // membership — so without this it fell through to `return hiveName` and wore
  // the name of whichever HIVE you happened to be signed into. Nat opened it at
  // HIVE-Wide and the header said "Production HIVE · Everyone in this HIVE"
  // (2026-08-03), which is the opposite of what the room is.
  if ((room as { reach?: string }).reach === 'all_hives') return HIVE_WIDE_ROOM_NAME;
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
  // Same first-check as the label: "Everyone in this HIVE" is wrong for the one
  // room that is not in a HIVE.
  if ((room as { reach?: string }).reach === 'all_hives') return HIVE_WIDE_ROOM_SUBTITLE;
  if (room.room_type === 'community') {
    const ownTitle = getRoomCustomization(room, currentUserId).title;
    // If somebody renamed their copy to the HIVE's own name, showing it twice
    // reads like a stutter, so fall through to who's in here (2026-08-03).
    return ownTitle && ownTitle !== hiveName ? hiveName : 'Everyone in this HIVE';
  }
  return getRoomSubtitle(room, currentUserId);
}

/**
 * What the fallback panel says when the shared room cannot be found.
 *
 * It used to say the room was "still being built", which was true for a day.
 * The room is real now (migration 139), so this copy only shows if the row is
 * missing — an unexpected state, not a planned one — and it should not promise
 * a future that already arrived. It says the room could not be reached and
 * points at the thing that definitely works.
 */
export function getHiveWideEmptyCopy(hiveName: string) {
  return {
    heading: 'The room every HIVE shares',
    body:
      'This one belongs to all the HIVEs at once, and it is not answering just '
      + 'now. Nothing has been lost — try again in a moment.',
    footer: `${hiveName} is a tap away, and what you say there stays inside ${hiveName}.`,
  };
}
