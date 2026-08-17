/**
 * The HIVE Creed — what everybody agrees to on the way in.
 *
 * Nat, 2026-08-17: *"we need to make a HIVE wide creed that everyone has to
 * agree to"*, and on where the agreeing happens: *"i think you have to click
 * that you agree to the terms in order to accept the invitation to HIVE."* So
 * it is a gate at the door rather than a paragraph in an email — an email you
 * can skim is not an agreement.
 *
 * **The words live on a board, not in this file.** There is one HIVE-Wide
 * board, `The HIVE Creed`, holding one pinned page, and every HIVE sees it
 * because a board with `reach: 'all_hives'` shows up in all of their board
 * lists. That means Nat can rewrite a line whenever she likes and nobody has to
 * deploy anything — and members can reply to it, which matters. A creed you can
 * argue with is shared; one you cannot is imposed.
 *
 * What lives HERE is the version stamp and the sentence somebody sees if the
 * board is unreachable at the exact moment they are joining. Nobody gets held
 * at the door by a network hiccup, and nobody gets in without agreeing either.
 */

/** The board that holds the creed. Matched by name, so it can be moved. */
export const CREED_BOARD_NAME = 'The HIVE Creed';

/** The pinned page on it. */
export const CREED_POST_TITLE = 'The HIVE Creed';

/**
 * Stamped, so a change is visible as a change.
 *
 * Somebody who agreed in August agreed to the August words. When the creed is
 * rewritten this moves, and what people accepted stays answerable.
 */
export const CREED_VERSION = '2026-08';

/** The one line that is true even when the page will not load. */
export const CREED_FALLBACK =
  'Ask out loud. Help when you can. Say when you are stuck. What is said here '
  + 'stays here. Come as you are. Credit the person. Campsite rules: leave this '
  + 'place, and everyone in it, better than you found it.';

/** What the tick-box says. Short enough to read, which is the whole point. */
export const CREED_AGREE_LABEL = 'I have read the creed and I am in.';
