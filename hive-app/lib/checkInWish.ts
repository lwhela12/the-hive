/** Saving a selected wish is atomic and preserves its existing audience. */
export async function fileCheckInWish(
  client: any,
  _userId: string,
  communityId: string | null,
  answers: Record<string, unknown>,
  _clearSpotlight: (userId: string) => Promise<{ error: unknown }>,
): Promise<void> {
  const description = typeof answers.q_hd_wish === 'string' ? answers.q_hd_wish.trim() : '';
  if (!description) return;
  if (!communityId) throw new Error('Choose a HIVE for your wish.');
  const { error } = await client.rpc('file_check_in_wish', {
    p_community_id: communityId,
    p_description: description,
    p_wish_id: typeof answers.q_hd_wish_id === 'string' && answers.q_hd_wish_id ? answers.q_hd_wish_id : null,
    p_reach: answers.q_hd_wish_reach === 'all_hives' ? 'all_hives' : 'hive',
  });
  if (error) throw error;
}
