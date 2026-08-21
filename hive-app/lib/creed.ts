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
export const CREED_VERSION = '2026-08-21c';

/**
 * What somebody reads if the creed page will not load.
 *
 * It is the promises themselves, one per line, rather than the paragraph it
 * used to be — because for a while this WAS what everybody read. The join
 * screen fetches the words from the board, board reads require membership, and
 * a person standing at an invitation is not a member yet. So the fetch quietly
 * returned nothing every single time and this sentence stood in for the creed
 * at every door (found 2026-08-21; `hive_creed()`, migration 201, is the fix).
 *
 * Kept in step with the board by hand. If the two ever disagree, the board is
 * the creed and this is the apology.
 */
export const CREED_FALLBACK = [
  '**Ask out loud.**',
  '**Always be curious.**',
  '**Help when you can.**',
  '**Say thank you more than feels necessary.**',
  "**Don't take it personally.**",
  "**What's said here stays here.**",
  '**Come as you are.**',
  '**Lead with love.**',
  '**Credit the person.**',
  '**If something here makes you money, share the wealth.**',
  '**Campsite rules.**',
  'Leave this place, and everyone in it, better than you found it.',
].join('\n');

/* ----------------------------------------------------------- reading it out */

/**
 * One promise: the line everybody remembers, and the line under it that says
 * what it means. The second is optional — several promises say everything they
 * need to in their own title.
 */
export type CreedLine =
  | { kind: 'aside'; text: string }
  | { kind: 'promise'; title: string; detail?: string }
  | { kind: 'note'; text: string };

/**
 * Turn the creed page into promises that can be drawn as a list.
 *
 * Nat, 2026-08-21, looking at the join screen: *"i think i want them bulleted,
 * not in one long sentence."* It was one long sentence because the screen
 * stripped every asterisk out and printed what was left as a single block, so
 * a page written as thirteen separate promises arrived as a wall.
 *
 * The rules are the ones she already writes in:
 * - `**A line in bold.**` starts a promise.
 * - Plain lines under it are that promise's detail.
 * - `*A line in single stars*` is an aside, set quieter.
 * - `---` and everything after it is the footnote about where this came from.
 */
export function parseCreed(text: string): CreedLine[] {
  const out: CreedLine[] = [];
  let footnote = false;

  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;

    if (line === '---') { footnote = true; continue; }

    if (footnote) {
      out.push({ kind: 'note', text: line.replace(/\*/g, '') });
      continue;
    }

    const bold = line.match(/^\*\*(.+?)\*\*$/);
    if (bold) {
      out.push({ kind: 'promise', title: bold[1].trim() });
      continue;
    }

    const aside = line.match(/^\*(.+?)\*$/);
    if (aside) {
      out.push({ kind: 'aside', text: aside[1].trim() });
      continue;
    }

    // A plain line belongs to the promise above it, when there is one.
    const last = out[out.length - 1];
    if (last && last.kind === 'promise' && !last.detail) {
      last.detail = line.replace(/\*/g, '');
      continue;
    }
    out.push({ kind: 'note', text: line.replace(/\*/g, '') });
  }

  return out;
}

/** What the tick-box says. Short enough to read, which is the whole point. */
export const CREED_AGREE_LABEL = 'I have read the creed and I am in.';
