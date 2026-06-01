import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, TextInput, View, Platform } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/hooks/useAuth';
import { SelectedImage } from '../../lib/imagePicker';
import { SelectedFile } from '../../lib/filePicker';
import { uploadMultipleFiles, uploadMultipleImages } from '../../lib/attachmentUpload';
import { getActiveMentionQuery, getMentionedMembers, getMentionSuggestions, hasBroadcastMention, insertMention, type MentionTarget } from '../../lib/mentions';
import { useMentionableMembers } from '../../lib/hooks/useMentionableMembers';
import { fetchCommunityMentionableMembers } from '../../lib/mentionableMembers';
import { useWebAttachmentDropZone } from '../../lib/hooks/useWebAttachmentDropZone';
import { usePersistentTextDraft } from '../../lib/hooks/usePersistentTextDraft';
import { submitOnEnter } from '../../lib/submitOnEnter';
import type { Attachment, Profile } from '../../types';
import { AttachmentPicker } from '../ui/AttachmentPicker';
import { VoiceMicButton } from '../ui/VoiceMicButton';
import { MentionSuggestions } from './MentionSuggestions';
import { SelectedFilePreview } from '../ui/SelectedFilePreview';

interface BoardReplyComposerProps {
  postId: string;
  postAuthorId?: string;
  boardName?: string;
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
  mentionableMembers = [],
  parentReplyId = null,
  replyingToName,
  onCancelReplyingTo,
  onSubmitted,
  placeholder = 'Reply to the thread...',
}: BoardReplyComposerProps) {
  const { profile, communityId } = useAuth();
  const replyDraftKey = profile?.id
    ? `the-hive:board-reply-draft:${profile.id}:${postId}:${parentReplyId ?? 'root'}`
    : null;
  const [reply, setReply, clearReplyDraft] = usePersistentTextDraft(replyDraftKey);
  const [replySelection, setReplySelection] = useState({ start: 0, end: 0 });
  const [replySelectionOverride, setReplySelectionOverride] = useState<{ start: number; end: number } | null>(null);
  const [selectedImages, setSelectedImages] = useState<SelectedImage[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<SelectedFile[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const voiceBaseTextRef = useRef<string | null>(null);
  const { members: activeMentionableMembers, loading: mentionMembersLoading } = useMentionableMembers(
    communityId,
    mentionableMembers
  );

  const replyCursorIndex = replySelection.start === 0 && replySelection.end === 0 && reply.length > 0
    ? reply.length
    : replySelection.start;
  const mentionQuery = getActiveMentionQuery(reply, replyCursorIndex);
  const mentionSuggestions = mentionQuery === null
    ? []
    : getMentionSuggestions(mentionQuery, activeMentionableMembers, profile?.id);
  const selectedMentionsEveryone = hasBroadcastMention(reply);
  const selectedMentionMembers = getMentionedMembers(reply, activeMentionableMembers, profile?.id);
  const hasContent = reply.trim().length > 0 || selectedImages.length > 0 || selectedFiles.length > 0;
  const inputPlaceholder = replyingToName ? 'Write your reply...' : placeholder;

  useEffect(() => {
    if (!replySelectionOverride) return;

    const timeout = setTimeout(() => setReplySelectionOverride(null), 0);
    return () => clearTimeout(timeout);
  }, [replySelectionOverride]);

  const reset = () => {
    clearReplyDraft();
    setReplySelection({ start: 0, end: 0 });
    setReplySelectionOverride(null);
    setSelectedImages([]);
    setSelectedFiles([]);
    voiceBaseTextRef.current = null;
  };

  const handleReplyChange = (text: string) => {
    setReply(text);
    setReplySelection((previousSelection) => {
      const wasAtTextEnd = previousSelection.start === reply.length && previousSelection.end === reply.length;
      const lookedUnreported = previousSelection.start === 0 && previousSelection.end === 0 && text.length > 0;
      if (wasAtTextEnd || lookedUnreported) {
        return { start: text.length, end: text.length };
      }
      return previousSelection;
    });
  };

  const handleSelectMention = (member: MentionTarget) => {
    const inserted = insertMention(reply, replyCursorIndex, member);
    const nextSelection = { start: inserted.cursorIndex, end: inserted.cursorIndex };
    setReply(inserted.text);
    setReplySelection(nextSelection);
    setReplySelectionOverride(nextSelection);
  };

  const mergeTranscript = (baseText: string, transcript: string) => {
    const cleanBase = baseText.trimEnd();
    const cleanTranscript = transcript.trim();
    if (!cleanTranscript) return cleanBase;
    return cleanBase ? `${cleanBase} ${cleanTranscript}` : cleanTranscript;
  };

  const handleSubmit = async () => {
    if (!hasContent || !profile || !communityId || submittingRef.current) return;

    submittingRef.current = true;
    setSubmitting(true);
    try {
      let attachments: Attachment[] | undefined;
      if (selectedImages.length > 0) {
        const result = await uploadMultipleImages(profile.id, selectedImages);
        if (result.attachments.length > 0) attachments = result.attachments;
      }
      if (selectedFiles.length > 0) {
        const result = await uploadMultipleFiles(profile.id, selectedFiles);
        if (result.attachments.length > 0) {
          attachments = [...(attachments ?? []), ...result.attachments];
        }
      }

      const replyText = reply.trim();
      const { error } = await supabase.from('board_replies').insert({
        community_id: communityId,
        post_id: postId,
        parent_reply_id: parentReplyId,
        author_id: profile.id,
        content: replyText,
        attachments: attachments && attachments.length > 0 ? attachments : null,
      });

      if (error) throw error;

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
      const mentionedMembers = getMentionedMembers(replyText, mentionableMembersForNotification, profile.id)
        .filter((member) => replyMentionsEveryone || member.id !== postAuthorId);
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
      Alert.alert('Reply Not Posted', 'Something went wrong while posting this reply. Please try again.');
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const enterToSubmitCaptureProps = Platform.OS === 'web'
    ? ({ onKeyDownCapture: submitOnEnter(handleSubmit) } as any)
    : {};
  const { dragDropProps, isDragActive } = useWebAttachmentDropZone({
    selectedImages,
    selectedFiles,
    onImagesChange: setSelectedImages,
    onFilesChange: setSelectedFiles,
    disabled: submitting,
  });

  return (
    <View {...dragDropProps}>
      {replyingToName && (
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
      )}

      <MentionSuggestions
        active={mentionQuery !== null}
        query={mentionQuery}
        loading={mentionMembersLoading}
        suggestions={mentionSuggestions}
        onSelect={handleSelectMention}
        placement="above"
      />
      {selectedMentionsEveryone ? (
        <View className="flex-row flex-wrap mb-2" style={{ gap: 6 }}>
          <View className="bg-blue-50 border border-blue-200 rounded-full px-3 py-1">
            <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-blue-700 text-xs">
              Tagged everyone in HIVE
            </Text>
          </View>
        </View>
      ) : selectedMentionMembers.length > 0 && (
        <View className="flex-row flex-wrap mb-2" style={{ gap: 6 }}>
          {selectedMentionMembers.map((member) => (
            <View key={member.id} className="bg-blue-50 border border-blue-200 rounded-full px-3 py-1">
              <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-blue-700 text-xs">
                Tagged {member.name.split(/\s+/)[0]}
              </Text>
            </View>
          ))}
        </View>
      )}

      {(selectedImages.length > 0 || selectedFiles.length > 0) && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          className="mb-2"
          contentContainerStyle={{ gap: 8 }}
        >
          {selectedImages.map((image, index) => (
            <View key={image.uri} className="relative">
              <Image
                source={{ uri: image.uri }}
                style={{ width: 56, height: 56, borderRadius: 10, backgroundColor: '#f3f4f6' }}
                contentFit="cover"
              />
              <Pressable
                onPress={() => setSelectedImages((prev) => prev.filter((_, imageIndex) => imageIndex !== index))}
                className="absolute -top-1 -right-1 bg-charcoal rounded-full w-5 h-5 items-center justify-center"
              >
                <Ionicons name="close" size={12} color="white" />
              </Pressable>
            </View>
          ))}
          {selectedFiles.map((file, index) => (
            <SelectedFilePreview
              key={`${file.uri}-${index}`}
              file={file}
              onRemove={() => setSelectedFiles((prev) => prev.filter((_, fileIndex) => fileIndex !== index))}
              className="bg-white border border-gold/20"
              widthClassName="w-44"
            />
          ))}
        </ScrollView>
      )}

      {isDragActive && (
        <View className="mb-2 rounded-xl border border-gold/30 bg-gold/10 px-3 py-2">
          <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-gold text-sm">
            Drop photos, videos, or files to attach
          </Text>
        </View>
      )}

      <View
        className={`flex-row items-end rounded-2xl px-3 py-2 border ${
          isDragActive ? 'bg-gold/10 border-gold' : 'bg-cream border-transparent'
        }`}
        {...enterToSubmitCaptureProps}
      >
        <AttachmentPicker
          compact
          selectedImages={selectedImages}
          onImagesChange={setSelectedImages}
          selectedFiles={selectedFiles}
          onFilesChange={setSelectedFiles}
          disabled={submitting}
        />
        <TextInput
          value={reply}
          onChangeText={handleReplyChange}
          onSelectionChange={(event) => setReplySelection(event.nativeEvent.selection)}
          selection={replySelectionOverride ?? undefined}
          placeholder={inputPlaceholder}
          placeholderTextColor="#9CA3AF"
          selectionColor="#313130"
          multiline
          blurOnSubmit={Platform.OS === 'web'}
          submitBehavior={Platform.OS === 'web' ? 'submit' : 'newline'}
          returnKeyType="send"
          enterKeyHint="send"
          onSubmitEditing={handleSubmit}
          onKeyPress={submitOnEnter(handleSubmit)}
          maxLength={2000}
          className="flex-1 max-h-32 text-base text-charcoal py-1 px-1"
          style={{ fontFamily: 'Lato_400Regular', outlineStyle: 'none', caretColor: '#313130' } as any}
          editable={!submitting}
        />
        <Pressable
          onPress={handleSubmit}
          disabled={!hasContent || submitting}
          className={`w-8 h-8 rounded-full items-center justify-center ml-2 ${
            hasContent && !submitting ? 'bg-gold active:opacity-80' : 'bg-gray-300'
          }`}
        >
          {submitting ? (
            <ActivityIndicator size="small" color="white" />
          ) : (
            <Text className="text-sm text-white" style={{ marginTop: -1 }}>↑</Text>
          )}
        </Pressable>
        <VoiceMicButton
          size={20}
          style={{ marginLeft: 6 }}
          onTranscript={(text) => {
            const merged = mergeTranscript(voiceBaseTextRef.current ?? reply, text);
            handleReplyChange(merged);
            voiceBaseTextRef.current = null;
          }}
          onInterimTranscript={(text) => {
            if (!text) {
              voiceBaseTextRef.current = null;
              return;
            }
            if (voiceBaseTextRef.current === null) voiceBaseTextRef.current = reply;
            handleReplyChange(mergeTranscript(voiceBaseTextRef.current, text));
          }}
        />
      </View>
    </View>
  );
}
