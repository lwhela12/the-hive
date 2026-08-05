/**
 * distil-answers — give each answer a meaning, once, and store it
 *
 * Nat, 2026-08-05, on the Swarm Report: "how smart are the analytics?"
 *
 * Not very. Two people were being called a match because their answers used
 * the same words. "Pizza" and "pasta" scored zero together. "I love my dog"
 * and "I hate my dog" scored nearly identical. Word overlap gets both of those
 * backwards, and with three HIVEs asking three different decks of questions,
 * it was about to start doing it across communities too.
 *
 * A language model can tell the difference. The obvious way to use one is to
 * ask it to compare every pair of answers — which is O(n squared) model calls,
 * far too slow and too expensive to run when somebody opens a page.
 *
 * So this is ONE CALL PER ANSWER, not per pair. Each answer gets a small
 * "gist" — what it is about, how the person feels, how strongly — computed
 * once here and stored on the row (migration 150). Comparing two gists
 * afterwards is arithmetic that runs instantly on the client, over any number
 * of members, across any number of HIVEs.
 *
 * The batching is the point. 200 answers a night, twenty per model call, so a
 * backlog drains over several nights instead of timing out on the first one.
 *
 * The one rule that matters: NEVER WRITE A HALF-PARSED GIST. A malformed
 * reply leaves the row null and tomorrow tries again. A missing gist fixes
 * itself; a wrong one is invisible and permanent.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Anthropic from 'https://esm.sh/@anthropic-ai/sdk@0.115.0';
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { verifySupabaseJwt, isAuthError, isOwner } from '../_shared/auth.ts';

/** How many answers one run will attempt. The rest wait for tomorrow. */
const BATCH_SIZE = 200;

/** How many answers ride in a single model call. */
const CHUNK_SIZE = 20;

/**
 * Small structured extraction, not reasoning. Haiku reads an answer and says
 * what it is about; there is nothing here worth a bigger model's time or
 * money, and this runs every night forever.
 */
const MODEL = 'claude-haiku-4-5';

/** Twenty gists of six short phrases each. 4000 is generous. */
const MAX_TOKENS = 4000;

/** Long enough for anything anyone actually types into a daily question. */
const MAX_ANSWER_CHARS = 1500;

/** The four feelings a gist may carry. Anything else is a malformed reply. */
const SENTIMENTS = ['positive', 'negative', 'mixed', 'neutral'] as const;
type Sentiment = (typeof SENTIMENTS)[number];

/** Up to six concepts. More than that stops being "what it is about". */
const MAX_CONCEPTS = 6;

interface AnswerRow {
  id: string;
  answer: string;
}

interface Gist {
  concepts: string[];
  sentiment: Sentiment;
  intensity: number;
}

/**
 * The shape the model must return. Structured outputs constrains generation to
 * this, so we are not fishing JSON out of prose — but everything is still
 * checked by hand below, because "the API promised" is not the same as "the
 * row is safe to write".
 */
const GIST_SCHEMA = {
  type: 'object',
  properties: {
    gists: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: {
            type: 'integer',
            description: 'The number this answer was given in the list.',
          },
          concepts: {
            type: 'array',
            items: { type: 'string' },
            description:
              'Up to 6 short lowercase noun phrases: the thing being talked about, not the words used.',
          },
          sentiment: {
            type: 'string',
            enum: SENTIMENTS,
            description: 'How the person feels about the thing.',
          },
          intensity: {
            type: 'integer',
            enum: [1, 2, 3, 4, 5],
            description: 'How strongly they feel it, 1 (mildly) to 5 (deeply).',
          },
        },
        required: ['id', 'concepts', 'sentiment', 'intensity'],
        additionalProperties: false,
      },
    },
  },
  required: ['gists'],
  additionalProperties: false,
};

/**
 * The prompt.
 *
 * Two things it must get right, and they pull against each other. It has to
 * say enough about a member's answer that another member's answer can be
 * recognised as the same kind of thing — and it must not carry any of that
 * member's life out of their HIVE while doing it. So: the topic, never the
 * telling. "grief" and "a parent's health", never who, never where, never
 * what happened.
 */
const SYSTEM_PROMPT = [
  'These are answers members wrote to a daily question inside HIVE, a warm',
  'small-community app where people say what they are working on and help each',
  'other with it. Different HIVEs ask different questions on different days.',
  '',
  'Your job is to describe WHAT EACH PERSON IS TALKING ABOUT, so that two',
  'members who reached for the same thing can be shown to each other — even',
  'when they were answering two completely different questions.',
  '',
  'For each answer give:',
  '',
  '  concepts   Up to 6 short lowercase noun phrases naming the thing being',
  '             talked about, NOT the words used to talk about it. Normalise',
  '             them, so two people who mean the same thing land on the same',
  '             phrase: "pizza" and "pasta" both include "italian food";',
  '             "my morning run" and "lifting weights" both include "exercise".',
  '             Two to four is usually right. Fewer good ones beat six loose',
  '             ones.',
  '',
  '  sentiment  Exactly one of: positive, negative, mixed, neutral. How the',
  '             person feels about the thing. This is what keeps "I love my',
  '             dog" and "I hate my dog" apart — same subject, opposite',
  '             answer.',
  '',
  '  intensity  A whole number 1 to 5. How strongly they feel it. 1 is a',
  '             passing mention, 5 is something that clearly matters a lot.',
  '',
  'HARD RULES:',
  '- Concepts only. Do not judge the answer, do not summarise it, and do not',
  '  repeat anything personal from it. No names of people, pets, places,',
  '  employers or events. No health details, no relationship details, no',
  '  numbers, no quotes. If the answer is about a person\'s father being ill,',
  '  the concepts are "family" and "illness" — nothing more.',
  '- Never invent. If an answer is too short or too vague to be about',
  '  anything, return an empty concepts list, "neutral", and 1.',
  '- Return exactly one entry for every answer you were given, using the same',
  '  id number, in the same order. Never merge two answers, never skip one.',
].join('\n');

/**
 * A blank answer distils to nothing — and if it were left null it would be
 * picked up again every single night forever. So it gets an honest empty gist:
 * there is genuinely nothing here to match on, and now we stop asking.
 */
const EMPTY_GIST: Gist = { concepts: [], sentiment: 'neutral', intensity: 1 };

/** Tidy one concept, or reject it. */
function cleanConcept(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const cleaned = raw.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!cleaned || cleaned.length > 60) return null;
  return cleaned;
}

/**
 * The gate. Everything the model sends back comes through here, and anything
 * that is not exactly the right shape is refused — the row keeps its null and
 * tomorrow's run tries again.
 */
function validateGist(raw: unknown): Gist | null {
  if (!raw || typeof raw !== 'object') return null;
  const candidate = raw as Record<string, unknown>;

  if (!Array.isArray(candidate.concepts)) return null;
  const concepts: string[] = [];
  for (const entry of candidate.concepts) {
    const cleaned = cleanConcept(entry);
    if (cleaned === null) return null; // a bad concept means a bad reply
    if (!concepts.includes(cleaned)) concepts.push(cleaned);
  }
  if (concepts.length > MAX_CONCEPTS) concepts.length = MAX_CONCEPTS;

  const sentiment = candidate.sentiment;
  if (typeof sentiment !== 'string') return null;
  if (!(SENTIMENTS as readonly string[]).includes(sentiment)) return null;

  const intensity = candidate.intensity;
  if (typeof intensity !== 'number' || !Number.isInteger(intensity)) return null;
  if (intensity < 1 || intensity > 5) return null;

  return { concepts, sentiment: sentiment as Sentiment, intensity };
}

/** The only parts of a reply this function reads. */
interface ModelReply {
  content: Array<{ type: string; text?: string }>;
  stop_reason?: string;
}

/** Pull the model's text back out, whatever blocks it came in. */
function textOf(reply: ModelReply): string {
  return reply.content
    .filter((block) => block.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text as string)
    .join('')
    .trim();
}

/**
 * One model call for up to CHUNK_SIZE answers. Returns a gist per row id for
 * the ones that came back clean; a row missing from the map keeps its null.
 */
async function distilChunk(
  anthropic: Anthropic,
  rows: AnswerRow[]
): Promise<Map<string, Gist>> {
  const results = new Map<string, Gist>();

  // The model is given plain numbers, never the database ids — an id is not
  // information it needs, and asking it to echo a uuid twenty times is twenty
  // chances to get one character wrong.
  const numbered = rows
    .map((row, index) => {
      const text = row.answer.trim().slice(0, MAX_ANSWER_CHARS);
      return `${index + 1}. ${text}`;
    })
    .join('\n\n');

  const params = {
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: SYSTEM_PROMPT,
    output_config: { format: { type: 'json_schema', schema: GIST_SCHEMA } },
    messages: [
      {
        role: 'user' as const,
        content: `Here are ${rows.length} answers. Give a gist for each.\n\n${numbered}`,
      },
    ],
  };

  // `output_config` is newer than the SDK typings pinned here, so the call is
  // cast rather than typed. The wire shape is right, and every field that comes
  // back is checked below regardless of what any type says.
  //
  // It has to be called ON `anthropic.messages`, not lifted off it first. The
  // first version did `const create = anthropic.messages.create` and then
  // `create(params)`, which detaches the method from its object — inside the
  // SDK it reads `this._client` and got `undefined`. Every one of the 172
  // answers failed with the same TypeError. The skip-and-retry path did its job
  // (nothing was written, nothing was corrupted, every row kept its null), but
  // the run distilled nothing at all.
  const reply = await ((anthropic.messages as unknown as {
    create: (p: unknown) => Promise<ModelReply>;
  }).create(params));

  if (reply.stop_reason === 'refusal') {
    console.warn('Model refused a chunk; those rows keep their null and retry tomorrow.');
    return results;
  }

  const body = textOf(reply);
  if (!body) return results;

  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch (_error) {
    console.warn('Reply was not JSON; skipping this chunk.');
    return results;
  }

  const gists = (parsed as { gists?: unknown })?.gists;
  if (!Array.isArray(gists)) {
    console.warn('Reply had no gists array; skipping this chunk.');
    return results;
  }

  // If the model numbers two entries the same, one of them is somebody else's
  // answer — and a gist attached to the wrong member is exactly the invisible,
  // permanent kind of wrong this whole function is built to avoid. So a
  // repeated number throws away BOTH entries, not just the later one: there is
  // no way to tell which of the two was the honest one.
  const claimed = new Set<number>();

  for (const entry of gists) {
    if (!entry || typeof entry !== 'object') continue;
    const position = (entry as { id?: unknown }).id;
    if (typeof position !== 'number' || !Number.isInteger(position)) continue;
    const row = rows[position - 1];
    if (!row) continue; // a number pointing at nothing is a malformed reply

    if (claimed.has(position)) {
      console.warn(`Answer ${position} was numbered twice; dropping both gists.`);
      results.delete(row.id);
      continue;
    }
    claimed.add(position);

    const gist = validateGist(entry);
    if (!gist) {
      console.warn(`Gist for answer ${row.id} failed validation; leaving it null.`);
      continue;
    }
    results.set(row.id, gist);
  }

  return results;
}

serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const supabaseAdmin = createClient(Deno.env.get('SUPABASE_URL') ?? '', serviceKey);

  // The same door meeting-reminder uses, which was fixed on 2026-08-04 and is
  // the current correct pattern: the nightly cron arrives carrying the service
  // key, Nat and Lucas can fire it by hand to drain a backlog faster, and
  // everybody else gets one flat answer whether they never signed in or signed
  // in and are not an owner. A refusal should not teach you what is behind it.
  const authHeader = req.headers.get('Authorization') ?? '';
  const calledByCron = !!serviceKey && authHeader === `Bearer ${serviceKey}`;
  if (!calledByCron) {
    const refusal = 'Answers are distilled on their own schedule.';
    const auth = await verifySupabaseJwt(authHeader);
    if (isAuthError(auth)) return errorResponse(refusal, 403);
    if (!(await isOwner(supabaseAdmin, auth.userId))) return errorResponse(refusal, 403);
  }

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) {
    console.error('ANTHROPIC_API_KEY is not set; nothing can be distilled.');
    return errorResponse('Distilling is not configured', 500);
  }

  try {
    // Oldest first, so the backlog drains in the order it arrived and a member
    // who answered months ago is not permanently behind today's writers.
    const { data: rows, error: selectError } = await supabaseAdmin
      .from('daily_question_answers')
      .select('id, answer')
      .is('gist', null)
      .order('created_at', { ascending: true, nullsFirst: true })
      .limit(BATCH_SIZE);

    if (selectError) {
      console.error('Could not read the answers awaiting a gist:', selectError);
      return errorResponse('Failed to read answers', 500);
    }

    const waiting = (rows ?? []) as AnswerRow[];
    if (waiting.length === 0) {
      return jsonResponse({ distilled: 0, skipped: 0, remaining: 0 });
    }

    // Blank answers never reach the model. There is nothing in them to be
    // about, and sending whitespace to Claude twenty times a night is a bill
    // for nothing.
    const blank = waiting.filter((row) => !row.answer || !row.answer.trim());
    const real = waiting.filter((row) => row.answer && row.answer.trim());

    const gists = new Map<string, Gist>();
    for (const row of blank) gists.set(row.id, EMPTY_GIST);

    const anthropic = new Anthropic({ apiKey });

    for (let start = 0; start < real.length; start += CHUNK_SIZE) {
      const chunk = real.slice(start, start + CHUNK_SIZE);
      try {
        const chunkGists = await distilChunk(anthropic, chunk);
        for (const [id, gist] of chunkGists) gists.set(id, gist);
      } catch (error) {
        // One bad chunk does not sink the run. Those rows keep their null.
        console.error('A chunk failed to distil; it will be retried tomorrow:', error);
      }
    }

    const distilledAt = new Date().toISOString();
    let distilled = 0;

    for (const [id, gist] of gists) {
      const { error: updateError } = await supabaseAdmin
        .from('daily_question_answers')
        .update({ gist, gist_at: distilledAt })
        .eq('id', id);

      if (updateError) {
        console.error(`Could not store the gist for answer ${id}:`, updateError);
        continue;
      }
      distilled++;
    }

    const { count, error: countError } = await supabaseAdmin
      .from('daily_question_answers')
      .select('id', { count: 'exact', head: true })
      .is('gist', null);

    if (countError) {
      console.error('Could not count what is left:', countError);
    }

    const summary = {
      distilled,
      skipped: waiting.length - distilled,
      remaining: countError ? null : (count ?? 0),
    };
    console.log('distil-answers:', JSON.stringify(summary));
    return jsonResponse(summary);
  } catch (error) {
    console.error('distil-answers failed:', error);
    return errorResponse('Internal server error', 500);
  }
});
