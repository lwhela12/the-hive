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
import { MemberProfileLink } from '../ui/MemberProfileLink';
import { formatDateShort } from '../../lib/dateUtils';
import { GrantWishModal } from './GrantWishModal';
import { submitOnEnter } from '../../lib/submitOnEnter';
import { getWishDetailText, getWishQuickTitle, shouldShowWishDescription } from '../../lib/wishDisplay';
import { useMentionableMembers } from '../../lib/hooks/useMentionableMembers';
import { useMentionInput } from '../../lib/hooks/useMentionInput';
import { notifyWishMentions } from '../../lib/wishMentions';
import { LinkifiedText } from '../ui/LinkifiedText';
import { MentionSuggestions } from '../ui/MentionSuggestions';
import { AttachmentGallery } from '../ui/AttachmentGallery';
import type { Wish, Profile, WishComment, WishGranter } from '../../types';

type WishWithGranters = Wish & {
  user?: Profile | null;
  granters?: (WishGranter & { granter?: Profile })[];
};

type WishCommentWithUser = WishComment & { user?: Profile | null };

interface WishDetailProps {
  wish: WishWithGranters;
  onClose: () => void;
  onGrant?: (data: {
    wishId: string;
    granterIds: string[];
    thankYouMessage?: string;
  }) => Promise<{ error: Error | null }>;
  canManage?: boolean;
  onManage?: () => void;
  onBeforeProfileNavigate?: () => void;
}

export function WishDetail({
  wish,
  onClose,
  onGrant,
  canManage = false,
  onManage,
  onBeforeProfileNavigate,
}: WishDetailProps) {
  const { profile, communityId } = useAuth();
  const [comments, setComments] = useState<WishCommentWithUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [newComment, setNewComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showGrantModal, setShowGrantModal] = useState(false);
  const { members: mentionableMembers, loading: mentionMembersLoading } = useMentionableMembers(communityId);
  const commentMentionInput = useMentionInput({
    value: newComment,
    onChangeText: setNewComment,
    members: mentionableMembers,
    currentUserId: profile?.id,
  });

  // Check if this is the user's own wish and can be granted
  const isOwnWish = profile?.id === wish.user_id;
  const canGrant = isOwnWish && wish.status === 'public' && onGrant;
  const isGranted = wish.status === 'fulfilled';
  const wishTitle = getWishQuickTitle(wish, 90);
  const wishDetailText = getWishDetailText(wish);
  const showDescription = shouldShowWishDescription(wish);
  const wishOwnerId = wish.user?.id ?? wish.user_id;
  const wishOwnerName = wish.user?.name?.trim() || 'HIVE member';
  const wishOwnerAvatarUrl = wish.user?.avatar_url;
  const handleBeforeProfileNavigate = onBeforeProfileNavigate ?? onClose;

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
      setComments((data as WishCommentWithUser[]) || []);
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

      setComments((prev) => [...prev, data as WishCommentWithUser]);
      notifyWishMentions({
        wishId: wish.id,
        senderId: profile.id,
        communityId,
        content: newComment.trim(),
        members: mentionableMembers,
        wishOwnerName,
      });
      setNewComment('');
      commentMentionInput.resetMentionSelection();
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
        {canManage && onManage ? (
          <Pressable
            onPress={onManage}
            className="w-10 h-10 items-center justify-center rounded-full active:bg-cream"
            accessibilityRole="button"
            accessibilityLabel="Manage wish"
            hitSlop={8}
          >
            <Ionicons name="pencil-outline" size={19} color="#4A4A4A" />
          </Pressable>
        ) : (
          <View className="w-10" />
        )}
      </View>

      <ScrollView className="flex-1" contentContainerClassName="p-4">
        {/* Wish Card */}
        <View className={`rounded-xl p-4 mb-6 ${isGranted ? 'bg-gold/10' : 'bg-cream/30'}`}>
          <View className="flex-row items-start">
            <MemberProfileLink
              memberId={wishOwnerId}
              memberName={wishOwnerName}
              onBeforeNavigate={handleBeforeProfileNavigate}
              hitSlop={8}
              className="active:opacity-70"
            >
              <Avatar name={wishOwnerName} url={wishOwnerAvatarUrl} size={48} />
            </MemberProfileLink>
            <View className="flex-1 ml-3">
              <View className="flex-row items-center">
                <MemberProfileLink
                  memberId={wishOwnerId}
                  memberName={wishOwnerName}
                  onBeforeNavigate={handleBeforeProfileNavigate}
                  hitSlop={8}
                  className="active:opacity-70"
                >
                  <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-charcoal text-base">
                    {wishOwnerName}
                  </Text>
                </MemberProfileLink>
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
              <Text
                style={{ fontFamily: 'Lato_700Bold', color: '#2d2d2d', marginTop: 8, fontSize: 20, lineHeight: 26 }}
              >
                {wishTitle}
              </Text>
              {showDescription && (
                <LinkifiedText
                  style={{ fontFamily: 'Lato_400Regular', color: 'rgba(49,49,48,0.8)', marginTop: 8, fontSize: 16, lineHeight: 23 }}
                  mentionStyle={{ color: '#1d4ed8', backgroundColor: 'rgba(37,99,235,0.1)' }}
                >
                  {wishDetailText}
                </LinkifiedText>
              )}
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
                  {wish.granters.filter((g) => g.granter).map((g) => (
                    <MemberProfileLink
                      key={g.id}
                      memberId={g.granter?.id ?? g.granter_id}
                      memberName={g.granter?.name}
                      onBeforeNavigate={handleBeforeProfileNavigate}
                      hitSlop={4}
                      className="flex-row items-center bg-cream px-3 py-2 rounded-full"
                    >
                      <Avatar
                        name={g.granter?.name || 'Unknown'}
                        url={g.granter?.avatar_url}
                        size={24}
                      />
                      <Text
                        style={{ fontFamily: 'Lato_700Bold' }}
                        className="text-charcoal text-sm ml-2"
                      >
                        {g.granter?.name || 'Unknown'}
                      </Text>
                    </MemberProfileLink>
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
                    Thank you from {wishOwnerName}
                  </Text>
                </View>
                <Text
                  style={{ fontFamily: 'Lato_400Regular', color: 'rgba(49,49,48,0.8)', marginTop: 4 }}
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
          comments.map((comment) => {
            const commentAttachments = Array.isArray(comment.attachments) ? comment.attachments : [];
            const commentAuthorName = comment.user?.name?.trim() || 'HIVE member';
            const commentAuthorAvatarUrl = comment.user?.avatar_url;
            const commentAuthorId = comment.user?.id ?? comment.user_id;

            return (
              <View key={comment.id} className="flex-row mb-4">
                <MemberProfileLink
                  memberId={commentAuthorId}
                  memberName={commentAuthorName}
                  onBeforeNavigate={handleBeforeProfileNavigate}
                  hitSlop={8}
                  className="active:opacity-70"
                >
                  <Avatar name={commentAuthorName} url={commentAuthorAvatarUrl} size={36} />
                </MemberProfileLink>
                <View className="flex-1 ml-3 bg-gray-50 rounded-xl p-3">
                  <View className="flex-row items-center justify-between">
                    <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-charcoal text-sm">
                      {commentAuthorName}
                    </Text>
                    <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-xs text-charcoal/40">
                      {formatDateShort(comment.created_at)}
                    </Text>
                  </View>
                  <LinkifiedText
                    style={{ fontFamily: 'Lato_400Regular' }}
                    mentionStyle={{ color: '#1d4ed8', backgroundColor: 'rgba(37,99,235,0.1)' }}
                  >
                    {comment.content}
                  </LinkifiedText>
                  {commentAttachments.length > 0 && (
                    <AttachmentGallery attachments={commentAttachments} maxWidth={260} />
                  )}
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      {/* Mark as HD Granted Button (for own public wishes) */}
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
              Mark as HD Granted
            </Text>
          </Pressable>
        </View>
      )}

      {/* Comment Input */}
      <View className="border-t border-gray-100 px-4 py-3">
        <MentionSuggestions
          active={commentMentionInput.mentionQuery !== null}
          query={commentMentionInput.mentionQuery}
          loading={mentionMembersLoading}
          suggestions={commentMentionInput.mentionSuggestions}
          onSelect={commentMentionInput.selectMention}
          placement="above"
        />
        {commentMentionInput.mentionedMembers.length > 0 && (
          <View className="flex-row flex-wrap mb-2" style={{ gap: 6 }}>
            {commentMentionInput.mentionedMembers.map((member) => (
              <View key={member.id} className="bg-blue-50 border border-blue-200 rounded-full px-3 py-1">
                <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-blue-700 text-xs">
                  Tagged {member.name.split(/\s+/)[0]}
                </Text>
              </View>
            ))}
          </View>
        )}
        <View className="flex-row items-end">
          <TextInput
            className="flex-1 bg-gray-50 rounded-xl px-4 py-3 mr-2 max-h-24"
            style={{ fontFamily: 'Lato_400Regular' }}
            placeholder="Write a comment..."
            placeholderTextColor="#9ca3af"
            value={newComment}
            onChangeText={commentMentionInput.textInputMentionProps.onChangeText}
            onSelectionChange={commentMentionInput.textInputMentionProps.onSelectionChange}
            selection={commentMentionInput.textInputMentionProps.selection}
            multiline
            blurOnSubmit={false}
            onKeyPress={submitOnEnter(handleSubmitComment)}
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
