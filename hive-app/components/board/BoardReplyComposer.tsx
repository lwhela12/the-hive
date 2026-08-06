import { useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/hooks/useAuth';
import { queryKeys } from '../../lib/queryClient';
import { SelectedImage } from '../../lib/imagePicker';
import { SelectedFile } from '../../lib/filePicker';
import { uploadAttachments } from '../../lib/attachmentUpload';
import { getMentionedMembers, hasBroadcastMention } from '../../lib/mentions';
import { useMentionableMembers, useMentionReach } from '../../lib/hooks/useMentionableMembers';
import { fetchCommunityMentionableMembers } from '../../lib/mentionableMembers';
import { usePersistentTextDraft } from '../../lib/hooks/usePersistentTextDraft';
import { showAlert } from '../../lib/showAlert';
import type { Attachment, Profile } from '../../types';
import { ComposerBar } from '../ui/ComposerBar';

/**
 * A reply cap of 2,000 characters used to sit here for no stated reason, while
 * the same person writing to Clive got 12,000. Nat has already objected once to
 * a cap that was tighter than the thought — so a reply now gets what a message
 * gets.
 */
const REPLY_MAX_LENGTH = 12000;

interface BoardReplyComposerProps {
  postId: string;
  postAuthorId?: string;
  boardName?: string;
  /**
   * How far the board this reply is on travels — `board_categories.reach`. A
   * reply reaches the people who can read the thread, so the board is what
   * tells the "@" picker who "everyone" is. Left out, the picker offers the
   * group that cannot leak: everyone who can already see this.
   */
  boardReach?: 'hive' | 'all_hives' | null;
  mentionableMembers?: Pick<Profile, 'id' | 'name'>[];
  parentReplyId?: string | null;
  replyingToName?: string | null;
  onCancelReplyingTo?: () => void;
  onSubmitted?: () => void | Promise<void>;
  placeholder?: string;
}

export function BoardReplyComposer({
  postId,
  postAuthorId,
  boardName = 'a board post',
  boardReach = null,
  mentionableMembers = [],
  parentReplyId = null,
  replyingToName,
  onCancelReplyingTo,
  onSubmitted,
  placeholder = 'Reply to the thread...',
}: BoardReplyComposerProps) {
  const { profile, communityId } = useAuth();
  const queryClient = useQueryClient();
  const replyDraftKey = profile?.id
    ? `the-hive:board-reply-draft:${profile.id}:${postId}:${parentReplyId ?? 'root'}`
    : null;
  const [reply, setReply, clearReplyDraft] = usePersistentTextDraft(replyDraftKey);
  const [selectedImages, setSelectedImages] = useState<SelectedImage[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<SelectedFile[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const { members: activeMentionableMembers, loading: mentionMembersLoading } = useMentionableMembers(
    communityId,
    mentionableMembers
  );
  // Offered from the board's own reach, and read back from it when the reply is
  // sent, so the group the picker named is the group that gets notified.
  const mentionReach = useMentionReach({ reach: boardReach });

  const hasContent = reply.trim().length > 0 || selectedImages.length > 0 || selectedFiles.length > 0;
  const inputPlaceholder = replyingToName ? 'Write your reply...' : placeholder;

  const reset = () => {
    clearReplyDraft();
    setSelectedImages([]);
    setSelectedFiles([]);
  };

  const handleSubmit = async () => {
    if (!hasContent || !profile || !communityId || submittingRef.current) return;

    submittingRef.current = true;
    setSubmitting(true);
    try {
      let attachments: Attachment[] | undefined;
      if (selectedImages.length > 0 || selectedFiles.length > 0) {
        const outcome = await uploadAttachments({
          userId: profile.id,
          images: selectedImages,
          files: selectedFiles,
        });

        // Every attachment failed. `uploadAttachments` has already said so, and
        // stopping here keeps the reply and its pictures in the box to retry.
        if (!outcome.readyToSend) return;
        attachments = outcome.attachments;
      }

      const replyText = reply.trim();

      // A reply with no words and nothing attached has nothing to say.
      if (!replyText && (attachments?.length ?? 0) === 0) return;

      const { error } = await supabase.from('board_replies').insert({
        community_id: communityId,
        post_id: postId,
        parent_reply_id: parentReplyId,
        author_id: profile.id,
        content: replyText,
        attachments: attachments && attachments.length > 0 ? attachments : null,
      });

      if (error) throw error;

      await queryClient.invalidateQueries({
        queryKey: queryKeys.boardSearchIndex(communityId),
      });

      supabase.functions.invoke('notify-board-reply', {
        body: {
          post_id: postId,
          reply_author_id: profile.id,
          reply_preview: replyText || 'Sent an attachment',
          community_id: communityId,
        },
      }).catch((err) => console.log('Board reply notification error (non-blocking):', err));

      const replyMentionsEveryone = hasBroadcastMention(replyText);
      const mentionableMembersForNotification = replyMentionsEveryone && activeMentionableMembers.length === 0
        ? await fetchCommunityMentionableMembers(communityId)
        : activeMentionableMembers;
      const mentionedMembers = getMentionedMembers(
        replyText,
        mentionableMembersForNotification,
        profile.id,
        mentionReach
      ).filter((member) => replyMentionsEveryone || member.id !== postAuthorId);
      mentionedMembers.forEach((member) => {
        supabase.functions.invoke('notify-board-mention', {
          body: {
            post_id: postId,
            sender_id: profile.id,
            recipient_id: member.id,
            message_preview: replyText || 'Sent an attachment',
            community_id: communityId,
            board_name: boardName,
          },
        }).catch((err) => console.log('Board mention notification error (non-blocking):', err));
      });

      reset();
      await onSubmitted?.();
    } catch (error) {
      console.error('Error submitting board reply:', error);
      // `Alert.alert` is an empty method on web, so this apology was never once
      // read by anybody until it moved to showAlert.
      showAlert('Reply Not Posted', 'Something went wrong while posting this reply. Please try again.');
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  return (
    <ComposerBar
      variant="chat"
      value={reply}
      onChangeText={setReply}
      placeholder={inputPlaceholder}
      maxLength={REPLY_MAX_LENGTH}
      onSubmit={handleSubmit}
      submitting={submitting}
      canSubmit={hasContent}
      attachments="compact"
      selectedImages={selectedImages}
      onImagesChange={setSelectedImages}
      selectedFiles={selectedFiles}
      onFilesChange={setSelectedFiles}
      captureDocumentDrops
      mentionMembers={activeMentionableMembers}
      mentionsLoading={mentionMembersLoading}
      mentionReach={mentionReach}
      currentUserId={profile?.id}
      header={replyingToName ? (
        <View className="flex-row items-center bg-cream/50 px-3 py-2 rounded-xl mb-2">
          <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-sm text-charcoal">
            Replying to{' '}
          </Text>
          <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-sm text-charcoal">
            {replyingToName}
          </Text>
          {onCancelReplyingTo && (
            <Pressable onPress={onCancelReplyingTo} className="ml-auto p-1">
              <Ionicons name="close" size={18} color="#4A4A4A" />
            </Pressable>
          )}
        </View>
      ) : null}
    />
  );
}
