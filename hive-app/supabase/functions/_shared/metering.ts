/**
 * Clive keeps receipts — one row per Anthropic API call, in `assistant_usage`.
 *
 * Why this exists (Nat, parked item, built 2026-08-12): two jobs run
 * unattended every night and bill with nobody watching. Before anyone is ever
 * charged "start your own HIVE for $X/month", we have to know what a HIVE
 * actually costs. Tokens are the durable fact; prices change, so no price
 * lives here or in the schema — cost is computed at query time.
 *
 * THE ONE RULE: a metering failure must NEVER break Clive's reply or a
 * nightly job. Everything here is wrapped, logged, and swallowed. Nothing is
 * awaited by the caller; the insert rides `EdgeRuntime.waitUntil` when the
 * runtime offers it so it survives the response being returned.
 *
 * Writes go straight to PostgREST with the service-role key rather than
 * through a supabase-js client, for two reasons: the calling functions pin
 * different supabase-js versions, and several of them (chat, generate-title)
 * only hold a user-scoped client — the table is service-role-write-only on
 * purpose, so members can never forge or read usage rows.
 */

/**
 * The slice of Anthropic's `usage` object we keep. Every SDK version in this
 * repo (0.20.0 and 0.115.0 alike) returns `input_tokens`/`output_tokens`;
 * the cache fields arrived later and may be absent or null, so everything
 * defaults to 0.
 */
export interface AnthropicUsageLike {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
}

/**
 * Record one Anthropic API call. Fire-and-forget: never await this, never
 * let it throw. `communityId` is null when the call genuinely has no HIVE
 * (distil-answers batches answers from every HIVE into one call).
 */
export function recordAssistantUsage(args: {
  functionName: string;
  model: string;
  usage: AnthropicUsageLike | null | undefined;
  communityId?: string | null;
}): void {
  try {
    const { functionName, model, usage, communityId } = args;
    if (!usage) {
      console.warn(`metering: ${functionName} got a reply with no usage object; nothing recorded.`);
      return;
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceKey) {
      console.warn(`metering: ${functionName} has no service credentials; usage not recorded.`);
      return;
    }

    const row = {
      community_id: communityId ?? null,
      function_name: functionName,
      model,
      input_tokens: usage.input_tokens ?? 0,
      output_tokens: usage.output_tokens ?? 0,
      cache_creation_input_tokens: usage.cache_creation_input_tokens ?? 0,
      cache_read_input_tokens: usage.cache_read_input_tokens ?? 0,
    };

    const insert = fetch(`${supabaseUrl}/rest/v1/assistant_usage`, {
      method: 'POST',
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(row),
    })
      .then(async (res) => {
        if (!res.ok) {
          console.warn(`metering: insert failed for ${functionName} (${res.status}): ${await res.text()}`);
        }
      })
      .catch((error) => {
        console.warn(`metering: insert errored for ${functionName}:`, error);
      });

    // Keep the isolate alive long enough for the insert to land even after
    // the HTTP response has been returned. Older runtimes without waitUntil
    // still usually complete it; if not, we lose one row, never the reply.
    try {
      (globalThis as unknown as {
        EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void };
      }).EdgeRuntime?.waitUntil?.(insert);
    } catch {
      // waitUntil is a nicety, not a requirement.
    }
  } catch (error) {
    console.warn('metering: recordAssistantUsage swallowed an error:', error);
  }
}
