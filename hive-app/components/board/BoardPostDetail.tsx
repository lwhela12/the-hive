import { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, Alert, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/hooks/useAuth';
import { formatDateMedium } from '../../lib/dateUtils';
import { BoardReactionBar } from './BoardReactionBar';
import { BoardReplyItem } from './BoardReplyItem';
import type { BoardPost, BoardReply, BoardReaction, Profile } from '../../types';

interface BoardPostDetailProps {
  postId: string;
  onBack: () => void;
}

type PostWithAuthor = BoardPost & { author?: Profile; reactions?: BoardReaction[] };
type ReplyWithAuthor = BoardReply & { author?: Profile; reactions?: BoardReaction[]; nested_replies?: ReplyWithAuthor[] };

export function BoardPostDetail({ postId, onBack }: BoardPostDetailProps) {
  const { profile, communityId } = useAuth();
  const [post, setPost] = useState<PostWithAuthor | null>(null);
  const [replies, setReplies] = useState<ReplyWithAuthor[]>([]);
  const [newReply, setNewReply] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const fetchPost = useCallback(async () => {
    const { data, error } = await supabase
      .from('board_posts')
      .select('*, author:profiles(*)')
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
      .select('*, author:profiles(*)')
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

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchPost(), fetchReplies()]);
    setRefreshing(false);
  };

  const handleSubmitReply = async () => {
    if (!newReply.trim() || !profile || !communityId) return;

    setSubmitting(true);
    try {
      const { error } = await supabase.from('board_replies').insert({
        community_id: communityId,
        post_id: postId,
        author_id: profile.id,
        content: newReply.trim(),
      });

      if (error) throw error;

      setNewReply('');
      await fetchReplies();
    } catch (error) {
      console.error('Error submitting reply:', error);
      Alert.alert('Error', 'Failed to post reply.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleNestedReply = async (parentReplyId: string, content: string) => {
    if (!profile || !communityId) return;

    try {
      const { error } = await supabase.from('board_replies').insert({
        community_id: communityId,
        post_id: postId,
        parent_reply_id: parentReplyId,
        author_id: profile.id,
        content,
      });

      if (error) throw error;
      await fetchReplies();
    } catch (error) {
      console.error('Error submitting nested reply:', error);
      Alert.alert('Error', 'Failed to post reply.');
    }
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
      await supabase
        .from('board_replies')
        .update({ content, edited_at: new Date().toISOString() })
        .eq('id', replyId);
      await fetchReplies();
    } catch (error) {
      console.error('Error editing reply:', error);
      Alert.alert('Error', 'Failed to edit reply.');
    }
  };

  const handleDeleteReply = async (replyId: string) => {
    Alert.alert('Delete Reply', 'Are you sure you want to delete this reply?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await supabase.from('board_replies').delete().eq('id', replyId);
            await fetchReplies();
          } catch (error) {
            console.error('Error deleting reply:', error);
            Alert.alert('Error', 'Failed to delete reply.');
          }
        },
      },
    ]);
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
          Post
        </Text>
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
            </Text>
          </View>
          <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-charcoal leading-6 mb-4">
            {post.content}
          </Text>

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
                  onReply={handleNestedReply}
                  onEdit={handleEditReply}
                  onDelete={handleDeleteReply}
                />
              </View>
            ))
          )}
        </View>
      </ScrollView>

      {/* Reply input */}
      {!post.is_locked && (
        <View className="absolute bottom-0 left-0 right-0 bg-white border-t border-cream p-4">
          <View className="flex-row items-center">
            <TextInput
              value={newReply}
              onChangeText={setNewReply}
              placeholder="Write a reply..."
              placeholderTextColor="#9ca3af"
              multiline
              className="flex-1 bg-cream rounded-xl px-4 py-3 mr-2 max-h-24"
              style={{ fontFamily: 'Lato_400Regular' }}
            />
            <Pressable
              onPress={handleSubmitReply}
              disabled={!newReply.trim() || submitting}
              className={`px-4 py-3 rounded-xl ${
                newReply.trim() && !submitting ? 'bg-gold' : 'bg-cream'
              }`}
            >
              <Text
                style={{ fontFamily: 'Lato_700Bold' }}
                className={newReply.trim() && !submitting ? 'text-white' : 'text-charcoal/30'}
              >
                Send
              </Text>
            </Pressable>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}
