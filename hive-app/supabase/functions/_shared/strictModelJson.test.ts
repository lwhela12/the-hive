import { parseCompleteModelJson } from './strictModelJson.ts';

Deno.test('accepts a complete fenced JSON object', () => {
  const parsed = parseCompleteModelJson('```json\n{"summary":"Ready","items":[]}\n```');
  if (parsed.summary !== 'Ready') throw new Error('complete JSON was not parsed');
});

Deno.test('rejects a response cut off mid-object', () => {
  let rejected = false;
  try {
    parseCompleteModelJson('{"summary":"Ready","items":[{"name":"Finn"');
  } catch {
    rejected = true;
  }
  if (!rejected) throw new Error('truncated JSON was accepted');
});

Deno.test('accepts a complete object surrounded by harmless preamble', () => {
  const parsed = parseCompleteModelJson('Here is the result:\n{"summary":"Ready"}\nDone.');
  if (parsed.summary !== 'Ready') throw new Error('embedded JSON object was not parsed');
});
