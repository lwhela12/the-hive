// Meeting jots land in action_items as the raw note text, e.g.
// "@hive Continued front door doggy manners help! (re: Charlee's HummDinger)".
// The leading mention token and trailing "(re: ...)" suffix are routing info,
// not reading material — surfaces that show to-dos can lift them out of the
// title and render them as a muted context line instead.

export interface ParsedActionItemDescription {
  /** The description with routing tokens stripped. */
  text: string;
  /** Leading mention token(s), e.g. "@hive" — null when none. */
  mentionTag: string | null;
  /** The "(re: ...)" subject, e.g. "Charlee's HummDinger" — null when none. */
  reLabel: string | null;
  /** The riff after " — " when the jot reads "Thing — elaboration". */
  elaboration: string | null;
  /** Ready-to-render muted context, e.g. "@hive · re: Charlee's HummDinger". */
  context: string | null;
}

/**
 * The part of a to-do that describes an actual action.
 *
 * Meeting Helper jots often start with routing tokens ("@nat", "@og") and
 * end with context ("re: someone's HummDinger"). Those pieces decide where a
 * row goes, but they are not a task by themselves. Keeping this test next to
 * the display parser means every composer can reject the same accidental
 * "@name"-only save before it becomes a blank-looking row on Home.
 */
export function getMeaningfulActionItemText(description: string): string {
  let text = description.trim();
  text = text.replace(/\s*\(re:\s*[^)]+\)\s*$/i, '').trim();
  text = text.replace(/^(?:@[\w.-]+(?:[\s,]+|$))+/, '').trim();
  text = text.replace(/^[\s,;:·&/\\|\-_]+|[\s,;:·&/\\|\-_]+$/g, '').trim();
  return text;
}

export function hasMeaningfulActionItemText(description: string): boolean {
  return /[\p{L}\p{N}]/u.test(getMeaningfulActionItemText(description));
}

export function parseActionItemDescription(description: string): ParsedActionItemDescription {
  let text = description.trim();

  const mentionMatch = text.match(/^((?:@[\w.-]+[,\s]+)+)/);
  const mentionTag = mentionMatch ? mentionMatch[1].trim().split(/[\s,]+/).join(' ') : null;
  if (mentionMatch) text = text.slice(mentionMatch[0].length).trim();

  const reMatch = text.match(/\s*\(re:\s*([^)]+)\)$/i);
  const reLabel = reMatch ? reMatch[1].trim() : null;
  if (reMatch) text = text.slice(0, text.length - reMatch[0].length).trim();

  // "Thing — elaboration" jots split too: the action leads, the riff joins
  // the detail line (only when both halves are substantial).
  let elaboration: string | null = null;
  const dashIndex = text.indexOf(' — ');
  if (dashIndex >= 12 && dashIndex < text.length - 4) {
    elaboration = text.slice(dashIndex + 3).trim();
    text = text.slice(0, dashIndex).trim();
  }

  const context = [elaboration, mentionTag, reLabel ? `re: ${reLabel}` : null]
    .filter(Boolean)
    .join(' · ') || null;

  return { text: text || description.trim(), mentionTag, reLabel, elaboration, context };
}
