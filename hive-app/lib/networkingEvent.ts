/** Tech networking details travel with the calendar event, including exports. */
export type NetworkingEventDetails = {
  focus: string;
  cost: string;
  infoUrl: string;
};

export function normalizeEventInfoUrl(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return '';
  try {
    const url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname.includes('.') || url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function networkingEventDescription(details: NetworkingEventDetails): string {
  return [
    details.focus.trim() ? `Focus: ${details.focus.trim()}` : null,
    details.cost.trim() ? `Cost: ${details.cost.trim()}` : null,
    details.infoUrl ? `Info: ${details.infoUrl}` : null,
  ].filter(Boolean).join('\n');
}

/** Recognize only the fields this form writes; leave ordinary event prose alone. */
export function readNetworkingEventDetails(description?: string | null): NetworkingEventDetails | null {
  if (!description) return null;
  const lines = description.split('\n');
  const field = (label: string) => lines.find((line) => line.startsWith(`${label}: `))?.slice(label.length + 2).trim() ?? '';
  const focus = field('Focus');
  const cost = field('Cost');
  const infoUrl = normalizeEventInfoUrl(field('Info')) || '';
  return focus || cost || infoUrl ? { focus, cost, infoUrl } : null;
}

export function networkingDescriptionWithoutLink(description?: string | null): string {
  return (description ?? '').split('\n').filter((line) => !line.startsWith('Info: ')).join('\n').trim();
}
