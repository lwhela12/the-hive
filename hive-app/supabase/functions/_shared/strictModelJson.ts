/**
 * Parse a model response only when it contains one complete JSON object.
 * Preamble and Markdown fences are tolerated; a cut-off object is rejected.
 */
export function parseCompleteModelJson(text: string): Record<string, unknown> {
  const raw = text.trim()
    .replace(/^```json\s*\n?/, '')
    .replace(/\n?```\s*$/, '')
    .replace(/^```\s*\n?/, '')
    .replace(/\n?```\s*$/, '');
  const firstBrace = raw.indexOf('{');
  const lastBrace = raw.lastIndexOf('}');
  if (firstBrace < 0 || lastBrace < firstBrace) {
    throw new Error('Model response returned incomplete JSON.');
  }
  const parsed = JSON.parse(raw.slice(firstBrace, lastBrace + 1));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Model response did not return a JSON object.');
  }
  return parsed as Record<string, unknown>;
}
