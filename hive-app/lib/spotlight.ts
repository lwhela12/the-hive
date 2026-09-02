import { supabase } from './supabase';

/**
 * One starred HD per member, and the database means it.
 *
 * `wishes_one_spotlight_per_user` is a PARTIAL unique index —
 * `unique (user_id) where is_spotlight` — so a member can hold exactly one
 * spotlight wish across every HIVE they are in. Starring a second one without
 * unstarring the first is refused outright with a duplicate-key error.
 *
 * That order was written down once, in the monthly tune-up, as a comment on
 * the two calls it governs. On 2026-09-01 the check-in learned to file an HD
 * wish and did not know the rule: Nat answered the question, the insert was
 * rejected because a fulfilled wish from July still held her star, and the
 * whole thing failed in a `console.warn` nobody was reading. Her profile said
 * "HD Wishes (0)" over an answer she had just written.
 *
 * So the rule lives here now, and both callers ask for it rather than
 * remembering it.
 */
export async function clearSpotlight(userId: string): Promise<{ error: unknown }> {
  const { error } = await (supabase as any)
    .from('wishes')
    .update({ is_spotlight: false })
    .eq('user_id', userId)
    .eq('is_spotlight', true);
  return { error: error ?? null };
}
