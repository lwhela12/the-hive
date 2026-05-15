import { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, Alert, RefreshControl, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/hooks/useAuth';
import { formatDateMedium } from '../../lib/dateUtils';
import { markBoardThreadGranted } from '../../lib/boardThreadCompletion';
import { BoardReactionBar } from './BoardReactionBar';
import { BoardReplyItem } from './BoardReplyItem';
import { BoardComposer } from './BoardComposer';
import { BoardReplyComposer } from './BoardReplyComposer';
import { AttachmentGallery } from '../ui/AttachmentGallery';
import { LinkifiedText } from '../ui/LinkifiedText';
import type { BoardPost, BoardReply, BoardReaction, Profile, Attachment, BoardCategory } from '../../types';

interface BoardPostDetailProps {
  postId: string;
  onBack: () => void;
}

type PostWithAuthor = BoardPost & { author?: Profile; reactions?: BoardReaction[]; category?: BoardCategory };
type ReplyWithAuthor = BoardReply & { author?: Profile; reactions?: BoardReaction[]; nested_replies?: ReplyWithAuthor[] };

function showBoardAlert(title: string, message: string) {
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.alert) {
    window.alert(`${title}\n\n${message}`);
    return;
  }

  Alert.alert(title, message);
}

function confirmBoardAction({
  title,
  message,
  confirmLabel,
  destructive = false,
  onConfirm,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  destructive?: boolean;
  onConfirm: () => Promise<void>;
}) {
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.confirm) {
    if (window.confirm(message)) {
      onConfirm().catch((error) => {
        console.error(`[BoardPostDetail] ${title} failed`, error);
        showBoardAlert('Error', error instanceof Error ? error.message : 'Something went wrong.');
      });
    }
    return;
  }

  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    {
      text: confirmLabel,
      style: destructive ? 'destructive' : 'default',
      onPress: async () => {
        try {
          await onConfirm();
        } catch (error) {
          console.error(`[BoardPostDetail] ${title} failed`, error);
          showBoardAlert('Error', error instanceof Error ? error.message : 'Something went wrong.');
        }
      },
    },
  ]);
}

export function BoardPostDetail({ postId, onBack }: BoardPostDetailProps) {
  const { profile, communityId, communityRole } = useAuth();
  const [post, setPost] = useState<PostWithAuthor | null>(null);
  const [replies, setReplies] = useState<ReplyWithAuthor[]>([]);
  const [mentionableMembers, setMentionableMembers] = useState<Pick<Profile, 'id' | 'name'>[]>([]);
  const [replyingTo, setReplyingTo] = useState<{ id: string; authorName: string } | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [showEditComposer, setShowEditComposer] = useState(false);
  const editComposerStorageKey = communityId ? `the-hive:board-edit-open:${communityId}:${postId}` : null;
  const editDraftStorageKey = communityId ? `the-hive:board-edit-draft:${communityId}:${postId}` : null;

  const isAuthor = profile?.id === post?.author_id;
  const isAdmin = communityRole === 'admin' || profile?.role === 'admin';
  const isBoardOwner = !!post?.category?.owner_user_id && post.category.owner_user_id === profile?.id;
  const canManagePost = !!post && (isAuthor || isAdmin || isBoardOwner);
  const canCompletePost = !!post
    && post.status !== 'completed'
    && !post.archived_at
    && (isAdmin || (post.category?.owner_user_id ? post.category.owner_user_id === profile?.id : isAuthor));

  const fetchPost = useCallback(async () => {
    const { data, error } = await supabase
      .from('board_posts')
      .select('*, author:profiles!board_posts_author_id_fkey(*), category:board_categories!board_posts_category_id_fkey(*)')
      .eq('id', postId)
      .single();

    if (!error && data) {
      // Fetch reactions for the post
      const { data: reactions } = await supabase
        .from('board_reactions')
        .select('*')
        .eq('post_id', postId);

      setPost({ ...data, reactions: reactions || [] } as PostWithAuthor);
    }
  }, [postId]);

  const fetchReplies = useCallback(async () => {
    // Fetch all replies for this post
    const { data: allReplies, error } = await supabase
      .from('board_replies')
      .select('*, author:profiles!board_replies_author_id_fkey(*)')
      .eq('post_id', postId)
      .order('created_at', { ascending: true });

    if (!error && allReplies) {
      // Fetch reactions for all replies
      const replyIds = allReplies.map((r) => r.id);
      const { data: reactions } = await supabase
        .from('board_reactions')
        .select('*')
        .in('reply_id', replyIds);

      // Organize into nested structure
      const replyMap = new Map<string, ReplyWithAuthor>();
      const topLevelReplies: ReplyWithAuthor[] = [];

      allReplies.forEach((reply) => {
        const replyReactions = reactions?.filter((r) => r.reply_id === reply.id) || [];
        const replyWithData: ReplyWithAuthor = {
          ...reply,
          reactions: replyReactions,
          nested_replies: [],
        };
        replyMap.set(reply.id, replyWithData);
      });

      allReplies.forEach((reply) => {
        const replyWithData = replyMap.get(reply.id)!;
        if (reply.parent_reply_id) {
          const parent = replyMap.get(reply.parent_reply_id);
          if (parent) {
            parent.nested_replies = parent.nested_replies || [];
            parent.nested_replies.push(replyWithData);
          }
        } else {
          topLevelReplies.push(replyWithData);
        }
      });

      setReplies(topLevelReplies);
    }
  }, [postId]);

  useEffect(() => {
    fetchPost();
    fetchReplies();
  }, [fetchPost, fetchReplies]);

  useEffect(() => {
    if (!communityId) return;

    let cancelled = false;
    const loadMembers = async () => {
      const { data: memberships, error: membershipError } = await supabase
        .from('community_memberships')
        .select('user_id')
        .eq('community_id', communityId);

      if (membershipError) {
        console.warn('[BoardPostDetail] mention memberships load failed', membershipError);
        return;
      }

      const userIds = (memberships ?? []).map((row: any) => row.user_id).filter(Boolean);
      if (userIds.length === 0) {
        if (!cancelled) setMentionableMembers([]);
        return;
      }

      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('id, name')
        .in('id', userIds);

      if (profilesError) {
        console.warn('[BoardPostDetail] mention profiles load failed', profilesError);
        return;
      }

      if (!cancelled) {
        setMentionableMembers(
          (profilesData || [])
            .filter((user: any): user is Pick<Profile, 'id' | 'name'> => !!user?.id && !!user?.name)
        );
      }
    };

    loadMembers();
    return () => {
      cancelled = true;
    };
  }, [communityId]);

  useEffect(() => {
    if (!editComposerStorageKey || typeof window === 'undefined') return;

    setShowEditComposer(window.localStorage.getItem(editComposerStorageKey) === 'true');
  }, [editComposerStorageKey]);

  const handleOpenEditComposer = useCallback(() => {
    setShowEditComposer(true);
    if (editComposerStorageKey && typeof window !== 'undefined') {
      window.localStorage.setItem(editComposerStorageKey, 'true');
    }
  }, [editComposerStorageKey]);

  const handleCloseEditComposer = useCallback(() => {
    setShowEditComposer(false);
    if (editComposerStorageKey && typeof window !== 'undefined') {
      window.localStorage.removeItem(editComposerStorageKey);
    }
    if (editDraftStorageKey && typeof window !== 'undefined') {
      window.localStorage.removeItem(editDraftStorageKey);
    }
  }, [editComposerStorageKey, editDraftStorageKey]);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchPost(), fetchReplies()]);
    setRefreshing(false);
  };

  const handleSetReplyingTo = (replyId: string, authorName: string) => {
    setReplyingTo({ id: replyId, authorName });
  };

  const handlePostReaction = async (emoji: string) => {
    if (!profile || !communityId) return;

    try {
      await supabase.from('board_reactions').insert({
        community_id: communityId,
        post_id: postId,
        user_id: profile.id,
        emoji,
      });
      await fetchPost();
    } catch (error) {
      console.error('Error adding reaction:', error);
    }
  };

  const handleRemovePostReaction = async (emoji: string) => {
    if (!profile) return;

    try {
      await supabase
        .from('board_reactions')
        .delete()
        .eq('post_id', postId)
        .eq('user_id', profile.id)
        .eq('emoji', emoji);
      await fetchPost();
    } catch (error) {
      console.error('Error removing reaction:', error);
    }
  };

  const handleReplyReaction = async (replyId: string, emoji: string) => {
    if (!profile || !communityId) return;

    try {
      await supabase.from('board_reactions').insert({
        community_id: communityId,
        reply_id: replyId,
        user_id: profile.id,
        emoji,
      });
      await fetchReplies();
    } catch (error) {
      console.error('Error adding reaction:', error);
    }
  };

  const handleRemoveReplyReaction = async (replyId: string, emoji: string) => {
    if (!profile) return;

    try {
      await supabase
        .from('board_reactions')
        .delete()
        .eq('reply_id', replyId)
        .eq('user_id', profile.id)
        .eq('emoji', emoji);
      await fetchReplies();
    } catch (error) {
      console.error('Error removing reaction:', error);
    }
  };

  const handleEditReply = async (replyId: string, content: string) => {
    try {
      const { error } = await supabase
        .from('board_replies')
        .update({ content, edited_at: new Date().toISOString() })
        .eq('id', replyId);

      if (error) throw error;
      await fetchReplies();
    } catch (error) {
      console.error('Error editing reply:', error);
      showBoardAlert('Error', 'Failed to edit reply.');
    }
  };

  const handleDeleteReply = async (replyId: string) => {
    confirmBoardAction({
      title: 'Delete Reply',
      message: 'Are you sure you want to delete this reply?',
      confirmLabel: 'Delete',
      onConfirm: async () => {
        const { data, error } = await supabase
          .from('board_replies')
          .delete()
          .eq('id', replyId)
          .select('id');

        if (error) throw error;
        if (!data || data.length === 0) {
          throw new Error('Reply was not deleted. You may not have permission to delete it.');
        }

        await fetchReplies();
      },
    });
  };

  const handleEditPost = async (title: string, content: string, attachments?: Attachment[]) => {
    try {
      const { error } = await supabase
        .from('board_posts')
        .update({
          title,
          content,
          edited_at: new Date().toISOString(),
          // Only update attachments if new ones were provided
          ...(attachments && attachments.length > 0 ? { attachments } : {}),
        })
        .eq('id', postId);

      if (error) throw error;

      await fetchPost();
      if (editComposerStorageKey && typeof window !== 'undefined') {
        window.localStorage.removeItem(editComposerStorageKey);
      }
      if (editDraftStorageKey && typeof window !== 'undefined') {
        window.localStorage.removeItem(editDraftStorageKey);
      }
      return true;
    } catch (error) {
      console.error('Error editing post:', error);
      showBoardAlert('Error', 'Failed to edit post.');
      return false;
    }
  };

  const handleCompletePost = async (onDone?: () => void) => {
    if (!post || !profile || !communityId || !canCompletePost) return;

    confirmBoardAction({
      title: 'Wish Granted',
      message: `Mark "${post.title}" as granted? It will show as Granted here and be added to Completed Community Wishes.`,
      confirmLabel: 'Mark Granted',
      onConfirm: async () => {
        await markBoardThreadGranted({
          post,
          category: post.category || null,
          communityId,
          completedBy: profile.id,
          completionNote: `Granted from ${post.category?.name || 'Boards'}.`,
        });
        await fetchPost();
        onDone?.();
      },
    });
  };

  const handleArchivePost = async (onDone?: () => void) => {
    if (!post || !profile || !communityId || !canManagePost) {
      showBoardAlert('Not allowed', 'You do not have permission to archive this thread.');
      return;
    }

    const restore = !!post.archived_at;
    confirmBoardAction({
      title: restore ? 'Restore Thread' : 'Archive Thread',
      message: restore
        ? `Restore "${post.title}" to this board?`
        : `Archive "${post.title}"? It will move out of the active thread list, but you can restore it from Archived.`,
      confirmLabel: restore ? 'Restore' : 'Archive',
      destructive: false,
      onConfirm: async () => {
        const { error } = await (supabase as any)
          .from('board_posts')
          .update({
            archived_at: restore ? null : new Date().toISOString(),
            archived_by: restore ? null : profile.id,
          })
          .eq('id', postId)
          .eq('community_id', communityId);

        if (error) throw error;
        await fetchPost();
        onDone?.();
      },
    });
  };

  const handleDeletePost = async (onDone?: () => void) => {
    if (!post || !communityId || !canManagePost) {
      showBoardAlert('Not allowed', 'You do not have permission to delete this thread.');
      return;
    }

    confirmBoardAction({
      title: 'Delete Thread',
      message: 'Delete this thread? This will also delete all replies.',
      confirmLabel: 'Delete',
      destructive: true,
      onConfirm: async () => {
        const { data, error } = await supabase
          .from('board_posts')
          .delete()
          .eq('id', postId)
          .eq('community_id', communityId)
          .select('id');

        if (error) throw error;
        if (data.length === 0) {
          throw new Error('Thread was not deleted. You may not have permission to delete it, or it may already be gone.');
        }

        onDone?.();
        onBack();
      },
    });
  };

  if (!post) {
    return (
      <SafeAreaView className="flex-1 bg-cream items-center justify-center" edges={['top']}>
        <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-charcoal/50">
          Loading...
        </Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-cream" edges={['top']}>
      {/* Header */}
      <View className="flex-row items-center px-4 py-3 bg-white border-b border-cream">
        <Pressable onPress={onBack} className="mr-4">
          <Text className="text-2xl">←</Text>
        </Pressable>
        <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-charcoal text-lg flex-1">
          Thread
        </Text>
        {canManagePost && (
          <View className="flex-row items-center" style={{ gap: 4 }}>
            <Pressable
              onPress={() => handleArchivePost(() => {
                if (!post.archived_at) onBack();
              })}
              className="p-2"
              accessibilityRole="button"
              accessibilityLabel={post.archived_at ? 'Restore thread' : 'Archive thread'}
              hitSlop={8}
            >
              <Ionicons
                name={post.archived_at ? 'arrow-undo-outline' : 'archive-outline'}
                size={20}
                color="#4A4A4A"
              />
            </Pressable>
            <Pressable
              onPress={handleOpenEditComposer}
              className="p-2"
              accessibilityRole="button"
              accessibilityLabel="Edit thread"
              hitSlop={8}
            >
              <Ionicons name="pencil-outline" size={20} color="#4A4A4A" />
            </Pressable>
          </View>
        )}
      </View>

      <ScrollView
        className="flex-1"
        contentContainerClassName="pb-24"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#bd9348" />
        }
      >
        {/* Post content */}
        <View className="bg-white p-4 mb-2">
          {post.is_pinned && (
            <View className="flex-row items-center mb-2">
              <Text className="text-xs text-gold">📌 Pinned</Text>
            </View>
          )}
          {post.status === 'completed' && (
            <View className="flex-row items-center self-start bg-gold/10 border border-gold/20 rounded-full px-3 py-1 mb-3">
              <Ionicons name="checkmark-circle-outline" size={15} color="#bd9348" />
              <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-gold text-xs ml-1">
                Wish Granted
              </Text>
            </View>
          )}
          {post.archived_at && (
            <View className="flex-row items-center self-start bg-charcoal/10 border border-charcoal/10 rounded-full px-3 py-1 mb-3">
              <Ionicons name="archive-outline" size={15} color="rgba(49,49,48,0.58)" />
              <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-charcoal/60 text-xs ml-1">
                Archived
              </Text>
            </View>
          )}
          <Text style={{ fontFamily: 'LibreBaskerville_700Bold' }} className="text-charcoal text-xl mb-2">
            {post.title}
          </Text>
          <View className="flex-row items-center mb-3">
            <View className="w-8 h-8 rounded-full bg-gold/20 items-center justify-center mr-2">
              <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-gold text-sm">
                {post.author?.name?.charAt(0) || '?'}
              </Text>
            </View>
            <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-charcoal">
              {post.author?.name || 'Unknown'}
            </Text>
            <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-charcoal/50 text-sm ml-2">
              {formatDateMedium(post.created_at)}
              {post.edited_at && ' (edited)'}
            </Text>
          </View>
          <LinkifiedText
            style={{ fontFamily: 'Lato_400Regular', fontSize: 16, lineHeight: 24, color: '#313130' }}
            linkStyle={{ color: '#bd9348' }}
          >
            {post.content}
          </LinkifiedText>
          <View className="mb-4" />

          {post.attachments && post.attachments.length > 0 && (
            <View className="mb-4">
              <AttachmentGallery attachments={post.attachments} />
            </View>
          )}

          <BoardReactionBar
            reactions={post.reactions || []}
            currentUserId={profile?.id}
            onReact={handlePostReaction}
            onRemoveReaction={handleRemovePostReaction}
          />
        </View>

        {/* Replies */}
        <View className="bg-white p-4">
          <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-charcoal mb-4">
            {post.reply_count} {post.reply_count === 1 ? 'Reply' : 'Replies'}
          </Text>

          {replies.length === 0 ? (
            <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-charcoal/50 text-center py-4">
              No replies yet. Be the first to respond!
            </Text>
          ) : (
            replies.map((reply) => (
              <View key={reply.id} className="border-t border-cream">
                <BoardReplyItem
                  reply={reply}
                  currentUserId={profile?.id}
                  onReact={handleReplyReaction}
                  onRemoveReaction={handleRemoveReplyReaction}
                  onReply={handleSetReplyingTo}
                  onEdit={handleEditReply}
                  onDelete={handleDeleteReply}
                  canModerate={isAdmin}
                />
              </View>
            ))
          )}
        </View>
      </ScrollView>

      {/* Reply input */}
      {!post.is_locked && (
        <View className="absolute bottom-0 left-0 right-0 bg-white border-t border-cream">
          <View className="p-4">
            <BoardReplyComposer
              postId={postId}
              postAuthorId={post.author_id}
              boardName={post.category?.name || post.title}
              mentionableMembers={mentionableMembers}
              parentReplyId={replyingTo?.id || null}
              replyingToName={replyingTo?.authorName || null}
              onCancelReplyingTo={() => setReplyingTo(null)}
              onSubmitted={async () => {
                setReplyingTo(null);
                await Promise.all([fetchPost(), fetchReplies()]);
              }}
            />
          </View>
        </View>
      )}

      {/* Edit post modal */}
      <BoardComposer
        visible={showEditComposer}
        category={post.category || null}
        userId={profile?.id || ''}
        onClose={handleCloseEditComposer}
        onSubmit={handleEditPost}
        existingPost={post}
        draftStorageKey={editDraftStorageKey}
        mentionableMembers={mentionableMembers}
        managementActions={(
          <>
            {canCompletePost && (
              <Pressable
                onPress={() => handleCompletePost(handleCloseEditComposer)}
                className="flex-row items-center bg-gold/10 border border-gold/20 rounded-full px-3 py-2 active:opacity-75"
              >
                <Ionicons name="checkmark-circle-outline" size={16} color="#bd9348" />
                <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-gold text-xs ml-1">
                  Granted
                </Text>
              </Pressable>
            )}
            {canManagePost && (
              <Pressable
                onPress={() => handleArchivePost(handleCloseEditComposer)}
                className="flex-row items-center bg-charcoal/5 border border-charcoal/10 rounded-full px-3 py-2 active:opacity-75"
              >
                <Ionicons
                  name={post.archived_at ? 'arrow-undo-outline' : 'archive-outline'}
                  size={16}
                  color="rgba(49,49,48,0.62)"
                />
                <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-charcoal/60 text-xs ml-1">
                  {post.archived_at ? 'Restore' : 'Archive'}
                </Text>
              </Pressable>
            )}
            {canManagePost && (
              <Pressable
                onPress={() => handleDeletePost(handleCloseEditComposer)}
                className="flex-row items-center bg-red-50 border border-red-100 rounded-full px-3 py-2 active:opacity-75"
              >
                <Ionicons name="trash-outline" size={16} color="#ef4444" />
                <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-red-500 text-xs ml-1">
                  Delete
                </Text>
              </Pressable>
            )}
          </>
        )}
      />
    </SafeAreaView>
  );
}
