/** Selecting an existing wish changes its focus, never its audience. */
export async function fileCheckInWish(
  client: any,
  userId: string,
  communityId: string | null,
  answers: Record<string, unknown>,
  clearSpotlight: (userId: string) => Promise<{ error: unknown }>,
): Promise<void> {
  const description = typeof answers.q_hd_wish === 'string' ? answers.q_hd_wish.trim() : '';
  if (!description) return;
  const { data, error } = await client.from('wishes')
    .select('id, description')
    .eq('user_id', userId).eq('status', 'public').eq('is_active', true)
    .or(`community_id.eq.${communityId},share_scope.eq.all_hives`);
  if (error) throw error;
  const existing = (data ?? []).find((wish: { id: string; description?: string }) =>
    (wish.description ?? '').trim() === description &&
    (!answers.q_hd_wish_id || wish.id === answers.q_hd_wish_id));
  if (answers.q_hd_wish_id && !existing) throw new Error('The selected wish is no longer available.');
  if (!existing && !communityId) throw new Error('Choose a HIVE for your new wish.');
  const cleared = await clearSpotlight(userId);
  if (cleared.error) throw cleared.error;
  const result = existing
    ? await client.from('wishes').update({ is_spotlight: true }).eq('id', existing.id).eq('user_id', userId)
    : await client.from('wishes').insert({
        user_id: userId, community_id: communityId, description, raw_input: description,
        status: 'public', is_active: true, is_spotlight: true,
        share_scope: answers.q_hd_wish_reach === 'all_hives' ? 'all_hives' : 'hive',
        extracted_from: 'onboarding',
      });
  if (result.error) throw result.error;
}
