type HelpPost = { title: string; content: string | null; created_at: string };

/** The previous month permits a focus to be announced before its quarter starts. */
export function monthlyHelpWindow(month: string) {
  const [year, number] = month.split('-').map(Number);
  const quarterStart = Math.floor((number - 1) / 3) * 3;
  const earliest = new Date(Date.UTC(year, quarterStart - 1, 1)).toISOString().slice(0, 10);
  const label = new Intl.DateTimeFormat('en-US', { month: 'long', timeZone: 'UTC' })
    .format(new Date(Date.UTC(year, number - 1, 1)));
  return { earliest, label };
}

/** A quarter overview and future month threads never become today's focus. */
export function currentMonthlyHelpPost<T extends HelpPost>(posts: T[], month: string): T | null {
  const { earliest, label } = monthlyHelpWindow(month);
  const title = new RegExp(`^${label}\\s+HIVE Help(?:ers)?\\s*[—–-]+\\s*\\S`, 'i');
  return posts.filter(post => post.created_at.slice(0, 10) >= earliest && title.test(post.title))
    .sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null;
}

/** The board's owner-written plan explains the focus before the current action. */
export function quarterHelpContext(content: string | null): string | null {
  if (!content) return null;
  return content.trim() || null;
}

/** Use the board post's action once, while keeping any extra owner-written detail. */
export function monthlyHelpFocusCopy(title: string, content: string | null) {
  const match = title.match(/^([A-Za-z]+)\s+HIVE Help(?:ers)?\s*[—–-]+\s*(.+)$/i);
  const action = match?.[2]?.trim() ?? '';
  const heading = match ? `${match[1]} focus: ${action.charAt(0).toUpperCase()}${action.slice(1)}` : title;
  const normalize = (value: string) => value.toLowerCase().replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, ' ').trim();
  const normalizedAction = normalize(action);
  const details = (content ?? '').split(/\n\s*\n/).map(part => part.trim()).filter(part => {
    if (!part || !normalizedAction) return !!part;
    const text = normalize(part);
    return !(text.endsWith(normalizedAction) && text.length - normalizedAction.length <= 45);
  }).join('\n\n');
  return { heading, details };
}
