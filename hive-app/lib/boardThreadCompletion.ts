import { supabase } from './supabase';
import type { BoardCategory, BoardPost } from '../types';

function createGrantedWishDescription(post: Pick<BoardPost, 'title' | 'content'>) {
  const cleanContent = post.content.replace(/\s+/g, ' ').trim();
  if (!cleanContent) return post.title.trim();

  const prefix = `${post.title.trim()}: `;
  const remaining = Math.max(40, 240 - prefix.length);
  const preview = cleanContent.length > remaining
    ? `${cleanContent.slice(0, remaining).trim()}...`
    : cleanContent;

  return `${prefix}${preview}`;
}

export async function markBoardThreadGranted({
  post,
  category,
  communityId,
  completedBy,
  completionNote,
}: {
  post: Pick<BoardPost, 'id' | 'title' | 'content' | 'author_id' | 'category_id'>;
  category?: Pick<BoardCategory, 'id' | 'owner_user_id' | 'topic_kind'> | null;
  communityId: string;
  completedBy: string;
  completionNote?: string | null;
}) {
  const completedAt = new Date().toISOString();
  const wishOwnerId = category?.owner_user_id || post.author_id;
  const note = completionNote?.trim() || 'Granted from Boards.';

  const { data: existingWishes, error: existingWishError } = await supabase
    .from('wishes')
    .select('id')
    .eq('community_id', communityId)
    .eq('source_board_post_id', post.id)
    .limit(1);

  if (existingWishError) throw existingWishError;

  let grantedWishId = existingWishes?.[0]?.id;
  const wishUpdate = {
    status: 'fulfilled',
    is_active: false,
    fulfilled_at: completedAt,
    fulfilled_by: completedBy,
    thank_you_message: note,
    board_category_id: category?.id || post.category_id,
    source_board_post_id: post.id,
  };

  if (grantedWishId) {
    const { error } = await supabase
      .from('wishes')
      .update(wishUpdate)
      .eq('id', grantedWishId)
      .eq('community_id', communityId);

    if (error) throw error;
  } else {
    const { data, error } = await supabase
      .from('wishes')
      .insert({
        user_id: wishOwnerId,
        community_id: communityId,
        description: createGrantedWishDescription(post),
        raw_input: post.content || post.title,
        status: 'fulfilled',
        is_active: false,
        extracted_from: 'manual',
        fulfilled_at: completedAt,
        fulfilled_by: completedBy,
        thank_you_message: note,
        board_category_id: category?.id || post.category_id,
        source_board_post_id: post.id,
      })
      .select('id')
      .single();

    if (error) throw error;
    grantedWishId = data.id;
  }

  const { error: postError } = await (supabase as any)
    .from('board_posts')
    .update({
      status: 'completed',
      completed_at: completedAt,
      completed_by: completedBy,
      completion_note: note,
      granted_wish_id: grantedWishId,
    })
    .eq('id', post.id)
    .eq('community_id', communityId);

  if (postError) throw postError;

  return grantedWishId;
}
