/**
 * The shared boards — HIVE Approved, Announcements, HIVE Helpers, the
 * Favourites, Compliment Corner, HIVE-Wide General Discussion.
 *
 * It is the same screen as /board, asked a different question. Boards behave
 * identically wherever they live: you search them, open them, post in them,
 * moderate them. A second hand-written copy of two thousand lines would only
 * have started drifting from the first one the same week (Nat 2026-08-03).
 */
import BoardScreen from './board';

export default function HiveWideBoardsScreen() {
  return <BoardScreen reach="all_hives" />;
}
