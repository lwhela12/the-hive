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
  /** Ready-to-render muted context, e.g. "@hive · re: Charlee's HummDinger". */
  context: string | null;
}

export function parseActionItemDescription(description: string): ParsedActionItemDescription {
  let text = description.trim();

  const mentionMatch = text.match(/^((?:@[\w.-]+[,\s]+)+)/);
  const mentionTag = mentionMatch ? mentionMatch[1].trim().split(/[\s,]+/).join(' ') : null;
  if (mentionMatch) text = text.slice(mentionMatch[0].length).trim();

  const reMatch = text.match(/\s*\(re:\s*([^)]+)\)$/i);
  const reLabel = reMatch ? reMatch[1].trim() : null;
  if (reMatch) text = text.slice(0, text.length - reMatch[0].length).trim();

  const context = [mentionTag, reLabel ? `re: ${reLabel}` : null].filter(Boolean).join(' · ') || null;

  return { text: text || description.trim(), mentionTag, reLabel, context };
}
