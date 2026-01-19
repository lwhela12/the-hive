import { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, Alert, RefreshControl, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/hooks/useAuth';
import { formatDateMedium } from '../../lib/dateUtils';
import { BoardReactionBar } from './BoardReactionBar';
import { BoardReplyItem } from './BoardReplyItem';
import { BoardComposer } from './BoardComposer';
import { AttachmentGallery } from '../ui/AttachmentGallery';
import { LinkifiedText } from '../ui/LinkifiedText';
import { pickMultipleImages, SelectedImage } from '../../lib/imagePicker';
import { uploadMultipleImages } from '../../lib/attachmentUpload';
import type { BoardPost, BoardReply, BoardReaction, Profile, Attachment, BoardCategory } from '../../types';

interface BoardPostDetailProps {
  postId: string;
  onBack: () => void;
}

type PostWithAuthor = BoardPost & { author?: Profile; reactions?: BoardReaction[]; category?: BoardCategory };
type ReplyWithAuthor = BoardReply & { author?: Profile; reactions?: BoardReaction[]; nested_replies?: ReplyWithAuthor[] };

export function BoardPostDetail({ postId, onBack }: BoardPostDetailProps) {
  const { profile, communityId } = useAuth();
  const [post, setPost] = useState<PostWithAuthor | null>(null);
  const [replies, setReplies] = useState<ReplyWithAuthor[]>([]);
  const [newReply, setNewReply] = useState('');
  const [selectedImages, setSelectedImages] = useState<SelectedImage[]>([]);
  const [replyingTo, setReplyingTo] = useState<{ id: string; authorName: string } | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showEditComposer, setShowEditComposer] = useState(false);

  const isAuthor = profile?.id === post?.author_id;

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

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchPost(), fetchReplies()]);
    setRefreshing(false);
  };

  const handlePickImages = async () => {
    const images = await pickMultipleImages(5 - selectedImages.length);
    if (images.length > 0) {
      setSelectedImages((prev) => [...prev, ...images].slice(0, 5));
    }
  };

  const handleRemoveImage = (index: number) => {
    setSelectedImages((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmitReply = async () => {
    if ((!newReply.trim() && selectedImages.length === 0) || !profile || !communityId) return;

    setSubmitting(true);
    try {
      // Upload images if any
      let attachments: Attachment[] | undefined;
      if (selectedImages.length > 0) {
        const result = await uploadMultipleImages(profile.id, selectedImages);
        if (result.attachments.length > 0) {
          attachments = result.attachments;
        }
      }

      const { error } = await supabase.from('board_replies').insert({
        community_id: communityId,
        post_id: postId,
        parent_reply_id: replyingTo?.id || null,
        author_id: profile.id,
        content: newReply.trim(),
        attachments: attachments && attachments.length > 0 ? attachments : null,
      });

      if (error) throw error;

      setNewReply('');
      setSelectedImages([]);
      setReplyingTo(null);
      await Promise.all([fetchPost(), fetchReplies()]);
    } catch (error) {
      console.error('Error submitting reply:', error);
      Alert.alert('Error', 'Failed to post reply.');
    } finally {
      setSubmitting(false);
    }
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
      return true;
    } catch (error) {
      console.error('Error editing post:', error);
      Alert.alert('Error', 'Failed to edit post.');
      return false;
    }
  };

  const handleDeletePost = async () => {
    Alert.alert('Delete Post', 'Are you sure you want to delete this post? This will also delete all replies.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await supabase.from('board_posts').delete().eq('id', postId);
            onBack(); // Navigate back after deletion
          } catch (error) {
            console.error('Error deleting post:', error);
            Alert.alert('Error', 'Failed to delete post.');
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
        {isAuthor && (
          <View className="flex-row items-center gap-2">
            <Pressable
              onPress={() => setShowEditComposer(true)}
              className="p-2"
              hitSlop={8}
            >
              <Ionicons name="pencil-outline" size={20} color="#4A4A4A" />
            </Pressable>
            <Pressable
              onPress={handleDeletePost}
              className="p-2"
              hitSlop={8}
            >
              <Ionicons name="trash-outline" size={20} color="#ef4444" />
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
                />
              </View>
            ))
          )}
        </View>
      </ScrollView>

      {/* Reply input */}
      {!post.is_locked && (
        <View className="absolute bottom-0 left-0 right-0 bg-white border-t border-cream">
          {/* Replying to context */}
          {replyingTo && (
            <View className="flex-row items-center bg-cream/50 px-4 py-2">
              <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-sm text-charcoal">
                Replying to{' '}
              </Text>
              <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-sm text-charcoal">
                {replyingTo.authorName}
              </Text>
              <Pressable onPress={() => setReplyingTo(null)} className="ml-auto p-1">
                <Ionicons name="close" size={18} color="#4A4A4A" />
              </Pressable>
            </View>
          )}

          <View className="p-4">
          {/* Image previews */}
          {selectedImages.length > 0 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              className="mb-3"
              contentContainerStyle={{ gap: 8 }}
            >
              {selectedImages.map((image, index) => (
                <View key={index} className="relative">
                  <Image
                    source={{ uri: image.uri }}
                    className="w-16 h-16 rounded-lg"
                    resizeMode="cover"
                  />
                  <Pressable
                    onPress={() => handleRemoveImage(index)}
                    className="absolute -top-2 -right-2 bg-charcoal rounded-full w-5 h-5 items-center justify-center"
                  >
                    <Ionicons name="close" size={12} color="white" />
                  </Pressable>
                </View>
              ))}
            </ScrollView>
          )}

          <View className="flex-row items-center">
            <Pressable
              onPress={handlePickImages}
              disabled={selectedImages.length >= 5 || submitting}
              className="mr-2 p-2"
            >
              <Ionicons
                name="image-outline"
                size={24}
                color={selectedImages.length >= 5 ? '#9ca3af' : '#bd9348'}
              />
            </Pressable>
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
              disabled={(!newReply.trim() && selectedImages.length === 0) || submitting}
              className={`px-4 py-3 rounded-xl ${
                (newReply.trim() || selectedImages.length > 0) && !submitting ? 'bg-gold' : 'bg-cream'
              }`}
            >
              <Text
                style={{ fontFamily: 'Lato_700Bold' }}
                className={(newReply.trim() || selectedImages.length > 0) && !submitting ? 'text-white' : 'text-charcoal/30'}
              >
                Send
              </Text>
            </Pressable>
          </View>
          </View>
        </View>
      )}

      {/* Edit post modal */}
      <BoardComposer
        visible={showEditComposer}
        category={post.category || null}
        userId={profile?.id || ''}
        onClose={() => setShowEditComposer(false)}
        onSubmit={handleEditPost}
        existingPost={post}
      />
    </SafeAreaView>
  );
}
