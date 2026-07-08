import { supabase } from './supabase';
import { getMemberHdBoardName, getWishGoalTitle } from './boardWishLinks';
import type { BoardCategory, BoardPost, Wish } from '../types';

type LinkableWish = Pick<
  Wish,
  'id' | 'description' | 'raw_input' | 'status' | 'user_id' | 'board_category_id' | 'source_board_post_id'
> & {
  user?: { name?: string | null } | null;
};

type LinkableThread = Pick<
  BoardPost,
  | 'id'
  | 'title'
  | 'content'
  | 'author_id'
  | 'category_id'
  | 'status'
  | 'granted_wish_id'
  | 'completed_at'
  | 'completed_by'
  | 'completion_note'
>;

function createWishDescriptionFromThread(post: Pick<BoardPost, 'title' | 'content'>) {
  const cleanContent = post.content.replace(/\s+/g, ' ').trim();
  if (!cleanContent) return post.title.trim();

  const prefix = `${post.title.trim()}: `;
  const remaining = Math.max(40, 240 - prefix.length);
  const preview = cleanContent.length > remaining
    ? `${cleanContent.slice(0, remaining).trim()}...`
    : cleanContent;

  return `${prefix}${preview}`;
}

export async function getOrCreateMemberHdBoard({
  communityId,
  actorId,
  ownerUserId,
  ownerName,
}: {
  communityId: string;
  actorId: string;
  ownerUserId: string;
  ownerName?: string | null;
}) {
  const { data: existingHdBoards, error: existingBoardError } = await (supabase as any)
    .from('board_categories')
    .select('*')
    .eq('community_id', communityId)
    .eq('topic_kind', 'hd_board')
    .eq('owner_user_id', ownerUserId)
    .is('goal_title', null)
    .limit(1);

  if (existingBoardError) throw existingBoardError;

  let category = existingHdBoards?.[0] as BoardCategory | undefined;

  if (!category) {
    const boardName = getMemberHdBoardName(ownerName);
    const { data: existingCategories, error: orderError } = await (supabase as any)
      .from('board_categories')
      .select('display_order')
      .eq('community_id', communityId);

    if (orderError) throw orderError;

    const maxOrder = (existingCategories ?? []).reduce(
      (max: number, existingCategory: Pick<BoardCategory, 'display_order'>) =>
        Math.max(max, existingCategory.display_order ?? 0),
      0
    );

    const { data: createdCategory, error: createError } = await (supabase as any)
      .from('board_categories')
      .insert({
        community_id: communityId,
        name: boardName,
        description: `${boardName.replace(/'s HD Board$/, '')}'s home base for HD wishes, asks, updates, recommendations, and helper threads.`,
        category_type: 'custom',
        icon: '💎',
        display_order: maxOrder + 1,
        is_system: false,
        requires_admin: false,
        requires_approval: false,
        created_by: actorId,
        topic_kind: 'hd_board',
        owner_user_id: ownerUserId,
        goal_title: null,
        audience: 'members',
      })
      .select()
      .single();

    if (createError) throw createError;
    category = createdCategory as BoardCategory;
  }

  await (supabase as any)
    .from('board_category_member_tags')
    .upsert({
      community_id: communityId,
      category_id: category.id,
      tagged_user_id: ownerUserId,
      tagged_by: actorId,
    }, { onConflict: 'category_id,tagged_user_id' });

  return category;
}

export async function linkWishToHdBoard({
  wish,
  communityId,
  actorId,
}: {
  wish: LinkableWish;
  communityId: string;
  actorId: string;
}) {
  const category = await getOrCreateMemberHdBoard({
    communityId,
    actorId,
    ownerUserId: wish.user_id,
    ownerName: wish.user?.name,
  });

  const threadTitle = getWishGoalTitle(wish.description, 70);
  let sourceBoardPostId = wish.source_board_post_id ?? null;

  if (sourceBoardPostId) {
    const { data: sourcePost, error: sourcePostError } = await (supabase as any)
      .from('board_posts')
      .select('id, category_id')
      .eq('id', sourceBoardPostId)
      .eq('community_id', communityId)
      .maybeSingle();

    if (sourcePostError) throw sourcePostError;
    if (!sourcePost || sourcePost.category_id !== category.id) {
      sourceBoardPostId = null;
    }
  }

  if (!sourceBoardPostId) {
    const { data: existingPosts, error: existingPostError } = await (supabase as any)
      .from('board_posts')
      .select('id')
      .eq('community_id', communityId)
      .eq('category_id', category.id)
      .eq('title', threadTitle)
      .limit(1);

    if (existingPostError) throw existingPostError;
    sourceBoardPostId = existingPosts?.[0]?.id ?? null;
  }

  if (!sourceBoardPostId) {
    const { data: createdPost, error: postError } = await (supabase as any)
      .from('board_posts')
      .insert({
        community_id: communityId,
        category_id: category.id,
        author_id: actorId,
        title: threadTitle,
        content: wish.description,
      })
      .select('id')
      .single();

    if (postError) throw postError;
    sourceBoardPostId = createdPost?.id ?? null;
  }

  const { error: wishError } = await (supabase as any)
    .from('wishes')
    .update({
      board_category_id: category.id,
      source_board_post_id: sourceBoardPostId,
      status: wish.status === 'private' ? 'public' : wish.status,
      is_active: wish.status === 'fulfilled' ? false : true,
    })
    .eq('id', wish.id)
    .eq('community_id', communityId);

  if (wishError) throw wishError;
  return category;
}

export async function syncWishEditToLinkedBoard({
  wishId,
  communityId,
  title,
  description,
}: {
  wishId: string;
  communityId: string;
  title?: string | null;
  description: string;
}) {
  const { data: wishLink, error: linkError } = await (supabase as any)
    .from('wishes')
    .select('source_board_post_id')
    .eq('id', wishId)
    .eq('community_id', communityId)
    .maybeSingle();

  if (linkError) {
    console.warn('Linked thread edit sync skipped:', linkError);
    return;
  }

  const threadTitle = title?.trim() || getWishGoalTitle(description, 70);

  // If this wish mirrors an HD-board thread, keep the thread's title/content in sync.
  if (wishLink?.source_board_post_id) {
    const { error: postError } = await (supabase as any)
      .from('board_posts')
      .update({
        title: threadTitle,
        content: description,
      })
      .eq('id', wishLink.source_board_post_id)
      .eq('community_id', communityId);

    if (postError) {
      console.warn('Linked thread edit sync skipped:', postError);
    }
  }

  // If this wish was turned into a board, keep the board's goal label in sync too.
  const { error: categoryError } = await (supabase as any)
    .from('board_categories')
    .update({ goal_title: threadTitle })
    .eq('source_wish_id', wishId)
    .eq('community_id', communityId);

  if (categoryError) {
    console.warn('Linked board edit sync skipped:', categoryError);
  }
}

export async function unlinkWishFromBoard({
  wishId,
  communityId,
}: {
  wishId: string;
  communityId: string;
}) {
  const { error } = await (supabase as any)
    .from('wishes')
    .update({
      board_category_id: null,
      source_board_post_id: null,
    })
    .eq('id', wishId)
    .eq('community_id', communityId);

  if (error) throw error;

  const { error: categoryError } = await (supabase as any)
    .from('board_categories')
    .update({ source_wish_id: null })
    .eq('source_wish_id', wishId)
    .eq('community_id', communityId);

  if (categoryError) {
    console.warn('Linked board source cleanup skipped:', categoryError);
  }

  const { error: postError } = await (supabase as any)
    .from('board_posts')
    .update({ granted_wish_id: null })
    .eq('granted_wish_id', wishId)
    .eq('community_id', communityId);

  if (postError) {
    console.warn('Linked thread cleanup skipped:', postError);
  }
}

export async function linkThreadToCommunityWish({
  post,
  category,
  communityId,
  actorId,
}: {
  post: LinkableThread;
  category: Pick<BoardCategory, 'id' | 'owner_user_id'>;
  communityId: string;
  actorId: string;
}) {
  const wishOwnerId = category.owner_user_id || post.author_id;
  const isGranted = post.status === 'completed';
  const now = new Date().toISOString();
  const existingWishId = post.granted_wish_id ?? null;

  let wishId = existingWishId;

  if (!wishId) {
    const { data: existingWishes, error: existingWishError } = await (supabase as any)
      .from('wishes')
      .select('id')
      .eq('community_id', communityId)
      .eq('source_board_post_id', post.id)
      .limit(1);

    if (existingWishError) throw existingWishError;
    wishId = existingWishes?.[0]?.id ?? null;
  }

  const wishPayload = {
    board_category_id: category.id,
    source_board_post_id: post.id,
    status: isGranted ? 'fulfilled' : 'public',
    is_active: !isGranted,
    ...(isGranted ? {
      fulfilled_at: post.completed_at || now,
      fulfilled_by: post.completed_by || actorId,
      thank_you_message: post.completion_note || 'Granted from Boards.',
    } : {}),
  };

  if (wishId) {
    const { error } = await (supabase as any)
      .from('wishes')
      .update(wishPayload)
      .eq('id', wishId)
      .eq('community_id', communityId);

    if (error) throw error;
  } else {
    const { data, error } = await (supabase as any)
      .from('wishes')
      .insert({
        user_id: wishOwnerId,
        community_id: communityId,
        description: createWishDescriptionFromThread(post),
        raw_input: post.content || post.title,
        extracted_from: 'manual',
        ...wishPayload,
      })
      .select('id')
      .single();

    if (error) throw error;
    wishId = data.id;
  }

  if (isGranted && wishId) {
    const { error: postError } = await (supabase as any)
      .from('board_posts')
      .update({ granted_wish_id: wishId })
      .eq('id', post.id)
      .eq('community_id', communityId);

    if (postError) {
      console.warn('Granted wish back-link skipped:', postError);
    }
  }

  if (!wishId) {
    throw new Error('Could not link this thread to a wish.');
  }

  return wishId;
}
