import { useState, useEffect } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/hooks/useAuth';
import { Avatar } from '../ui/Avatar';
import { formatDateShort } from '../../lib/dateUtils';
import { GrantWishModal } from './GrantWishModal';
import type { Wish, Profile, WishComment, WishGranter } from '../../types';

type WishWithGranters = Wish & {
  user: Profile;
  granters?: (WishGranter & { granter: Profile })[];
};

interface WishDetailProps {
  wish: WishWithGranters;
  onClose: () => void;
  onGrant?: (data: {
    wishId: string;
    granterIds: string[];
    thankYouMessage?: string;
  }) => Promise<{ error: Error | null }>;
}

export function WishDetail({ wish, onClose, onGrant }: WishDetailProps) {
  const { profile, communityId } = useAuth();
  const [comments, setComments] = useState<(WishComment & { user: Profile })[]>([]);
  const [loading, setLoading] = useState(true);
  const [newComment, setNewComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showGrantModal, setShowGrantModal] = useState(false);

  // Check if this is the user's own wish and can be granted
  const isOwnWish = profile?.id === wish.user_id;
  const canGrant = isOwnWish && wish.status === 'public' && onGrant;
  const isGranted = wish.status === 'fulfilled';

  useEffect(() => {
    fetchComments();
  }, [wish.id]);

  const fetchComments = async () => {
    try {
      const { data, error } = await supabase
        .from('wish_comments')
        .select('*, user:profiles!user_id(*)')
        .eq('wish_id', wish.id)
        .order('created_at', { ascending: true });

      if (error) throw error;
      setComments((data as (WishComment & { user: Profile })[]) || []);
    } catch (error) {
      console.error('Error fetching comments:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitComment = async () => {
    if (!newComment.trim() || !profile || !communityId) return;

    setSubmitting(true);
    try {
      const { data, error } = await supabase
        .from('wish_comments')
        .insert({
          wish_id: wish.id,
          user_id: profile.id,
          community_id: communityId,
          content: newComment.trim(),
        })
        .select('*, user:profiles!user_id(*)')
        .single();

      if (error) throw error;

      setComments((prev) => [...prev, data as WishComment & { user: Profile }]);
      setNewComment('');
    } catch (error) {
      console.error('Error submitting comment:', error);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-white"
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* Header */}
      <View className="flex-row items-center justify-between px-4 py-3 border-b border-gray-100">
        <Pressable onPress={onClose} className="p-2 -ml-2">
          <Ionicons name="arrow-back" size={24} color="#333" />
        </Pressable>
        <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-lg text-charcoal">
          Wish Details
        </Text>
        <View className="w-10" />
      </View>

      <ScrollView className="flex-1" contentContainerClassName="p-4">
        {/* Wish Card */}
        <View className={`rounded-xl p-4 mb-6 ${isGranted ? 'bg-gold/10' : 'bg-cream/30'}`}>
          <View className="flex-row items-start">
            <Avatar name={wish.user.name} url={wish.user.avatar_url} size={48} />
            <View className="flex-1 ml-3">
              <View className="flex-row items-center">
                <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-charcoal text-base">
                  {wish.user.name}
                </Text>
                {isGranted && (
                  <View className="ml-2 bg-gold px-2 py-0.5 rounded-full flex-row items-center">
                    <Ionicons name="checkmark-circle" size={12} color="#fff" />
                    <Text
                      style={{ fontFamily: 'Lato_700Bold' }}
                      className="text-white text-xs ml-1"
                    >
                      Granted
                    </Text>
                  </View>
                )}
              </View>
              <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-charcoal/80 mt-1 text-base">
                {wish.description}
              </Text>
              <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-xs text-charcoal/40 mt-2">
                {formatDateShort(wish.created_at)}
                {isGranted && wish.fulfilled_at && (
                  <Text> · Granted {formatDateShort(wish.fulfilled_at)}</Text>
                )}
              </Text>
            </View>
          </View>
        </View>

        {/* Granted Info Section */}
        {isGranted && (
          <View className="mb-6">
            {/* Granters */}
            {wish.granters && wish.granters.length > 0 && (
              <View className="bg-white rounded-xl p-4 mb-4 border border-gold/20">
                <Text
                  style={{ fontFamily: 'Lato_700Bold' }}
                  className="text-charcoal text-sm mb-3"
                >
                  Granted by
                </Text>
                <View className="flex-row flex-wrap gap-2">
                  {wish.granters.map((g) => (
                    <View
                      key={g.id}
                      className="flex-row items-center bg-cream px-3 py-2 rounded-full"
                    >
                      <Avatar
                        name={g.granter.name}
                        url={g.granter.avatar_url}
                        size={24}
                      />
                      <Text
                        style={{ fontFamily: 'Lato_700Bold' }}
                        className="text-charcoal text-sm ml-2"
                      >
                        {g.granter.name}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* Thank You Message */}
            {wish.thank_you_message && (
              <View className="bg-gold/10 rounded-xl p-4 border border-gold/20">
                <View className="flex-row items-center mb-2">
                  <Ionicons name="heart" size={16} color="#bd9348" />
                  <Text
                    style={{ fontFamily: 'Lato_700Bold' }}
                    className="text-gold text-sm ml-2"
                  >
                    Thank you from {wish.user.name}
                  </Text>
                </View>
                <Text
                  style={{ fontFamily: 'Lato_400Regular' }}
                  className="text-charcoal/80 text-base italic"
                >
                  "{wish.thank_you_message}"
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Comments Section */}
        <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-charcoal mb-3">
          Comments ({comments.length})
        </Text>

        {loading ? (
          <ActivityIndicator color="#bd9348" className="py-8" />
        ) : comments.length === 0 ? (
          <View className="py-8 items-center">
            <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-charcoal/50">
              No comments yet. Be the first to reply!
            </Text>
          </View>
        ) : (
          comments.map((comment) => (
            <View key={comment.id} className="flex-row mb-4">
              <Avatar name={comment.user.name} url={comment.user.avatar_url} size={36} />
              <View className="flex-1 ml-3 bg-gray-50 rounded-xl p-3">
                <View className="flex-row items-center justify-between">
                  <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-charcoal text-sm">
                    {comment.user.name}
                  </Text>
                  <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-xs text-charcoal/40">
                    {formatDateShort(comment.created_at)}
                  </Text>
                </View>
                <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-charcoal/80 mt-1">
                  {comment.content}
                </Text>
              </View>
            </View>
          ))
        )}
      </ScrollView>

      {/* Mark as Granted Button (for own public wishes) */}
      {canGrant && (
        <View className="border-t border-gray-100 px-4 py-3">
          <Pressable
            onPress={() => setShowGrantModal(true)}
            className="bg-gold py-3 rounded-xl flex-row items-center justify-center active:bg-gold/80"
          >
            <Ionicons name="checkmark-circle" size={20} color="#fff" />
            <Text
              style={{ fontFamily: 'Lato_700Bold' }}
              className="text-white text-base ml-2"
            >
              Mark as Granted
            </Text>
          </Pressable>
        </View>
      )}

      {/* Comment Input */}
      <View className="border-t border-gray-100 px-4 py-3">
        <View className="flex-row items-end">
          <TextInput
            className="flex-1 bg-gray-50 rounded-xl px-4 py-3 mr-2 max-h-24"
            style={{ fontFamily: 'Lato_400Regular' }}
            placeholder="Write a comment..."
            placeholderTextColor="#9ca3af"
            value={newComment}
            onChangeText={setNewComment}
            multiline
            editable={!submitting}
          />
          <Pressable
            onPress={handleSubmitComment}
            disabled={!newComment.trim() || submitting}
            className={`p-3 rounded-full ${
              newComment.trim() && !submitting ? 'bg-gold' : 'bg-gray-200'
            }`}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Ionicons
                name="send"
                size={20}
                color={newComment.trim() ? '#fff' : '#9ca3af'}
              />
            )}
          </Pressable>
        </View>
      </View>

      {/* Grant Wish Modal */}
      {onGrant && (
        <GrantWishModal
          visible={showGrantModal}
          onClose={() => setShowGrantModal(false)}
          wish={wish}
          communityId={communityId}
          onGrant={async (data) => {
            const result = await onGrant(data);
            if (!result.error) {
              onClose(); // Close detail view after granting
            }
            return result;
          }}
        />
      )}
    </KeyboardAvoidingView>
  );
}
