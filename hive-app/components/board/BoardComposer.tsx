import { useState, useEffect, useRef, type ReactNode } from 'react';
import { View, Text, TextInput, Pressable, Modal, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { BoardCategory, BoardPost, Attachment, Profile } from '../../types';
import { SelectedImage } from '../../lib/imagePicker';
import { SelectedFile } from '../../lib/filePicker';
import { uploadMultipleFiles, uploadMultipleImages } from '../../lib/attachmentUpload';
import { getActiveMentionQuery, getMentionedMembers, getMentionSuggestions, hasBroadcastMention, insertMention, type MentionTarget } from '../../lib/mentions';
import { useMentionableMembers } from '../../lib/hooks/useMentionableMembers';
import { useWebAttachmentDropZone } from '../../lib/hooks/useWebAttachmentDropZone';
import { submitOnEnter } from '../../lib/submitOnEnter';
import { getStoredItem, removeStoredItem, setStoredItem } from '../../lib/webStorage';
import { AttachmentPicker } from '../ui/AttachmentPicker';
import { VoiceMicButton } from '../ui/VoiceMicButton';
import { useDictation } from '../../lib/hooks/useDictation';
import { MentionSuggestions } from './MentionSuggestions';

interface BoardComposerProps {
  visible: boolean;
  category: BoardCategory | null;
  userId: string;
  onClose: () => void;
  onSubmit: (title: string, content: string, attachments?: Attachment[]) => Promise<boolean>;
  existingPost?: BoardPost | null; // For edit mode
  draftStorageKey?: string | null;
  mentionableMembers?: Pick<Profile, 'id' | 'name'>[];
  managementActions?: ReactNode;
}

export function BoardComposer({
  visible,
  category,
  userId,
  onClose,
  onSubmit,
  existingPost,
  draftStorageKey,
  mentionableMembers = [],
  managementActions,
}: BoardComposerProps) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [contentSelection, setContentSelection] = useState({ start: 0, end: 0 });
  const [contentSelectionOverride, setContentSelectionOverride] = useState<{ start: number; end: number } | null>(null);
  const [selectedImages, setSelectedImages] = useState<SelectedImage[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<SelectedFile[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [uploadStatus, setUploadStatus] = useState('');
  // Dictation goes straight to setContent rather than through
  // handleContentChange: mention tracking is about somebody typing "@", and
  // speech recognition does not produce one.
  const contentDictation = useDictation(setContent);
  const titleDictation = useDictation(setTitle);
  const submittingRef = useRef(false);
  const { members: activeMentionableMembers, loading: mentionMembersLoading } = useMentionableMembers(
    category?.community_id,
    mentionableMembers
  );

  const isEditMode = !!existingPost;
  const contentCursorIndex = contentSelection.start === 0 && contentSelection.end === 0 && content.length > 0
    ? content.length
    : contentSelection.start;
  const mentionQuery = getActiveMentionQuery(content, contentCursorIndex);
  const mentionSuggestions = mentionQuery === null
    ? []
    : getMentionSuggestions(mentionQuery, activeMentionableMembers, userId);
  const selectedMentionsEveryone = hasBroadcastMention(content);
  const selectedMentionMembers = getMentionedMembers(content, activeMentionableMembers, userId);

  // Pre-fill fields when editing
  useEffect(() => {
    if (visible && draftStorageKey) {
      const savedDraft = getStoredItem(draftStorageKey);
      if (savedDraft) {
        try {
          const draft = JSON.parse(savedDraft) as { title?: string; content?: string };
          setTitle(draft.title || '');
          setContent(draft.content || '');
          return;
        } catch {
          removeStoredItem(draftStorageKey);
        }
      }
    }

    if (visible && existingPost) {
      setTitle(existingPost.title);
      setContent(existingPost.content);
      // Note: existing attachments are shown but not editable for simplicity
    } else if (!visible) {
      // Reset when modal closes
      setTitle('');
      setContent('');
      setContentSelection({ start: 0, end: 0 });
      setContentSelectionOverride(null);
      setSelectedImages([]);
      setSelectedFiles([]);
    }
  }, [visible, existingPost, draftStorageKey]);

  useEffect(() => {
    if (!contentSelectionOverride) return;

    const timeout = setTimeout(() => setContentSelectionOverride(null), 0);
    return () => clearTimeout(timeout);
  }, [contentSelectionOverride]);

  useEffect(() => {
    if (!visible || !draftStorageKey) return;

    setStoredItem(draftStorageKey, JSON.stringify({ title, content }));
  }, [visible, draftStorageKey, title, content]);

  const handleSubmit = async () => {
    if (!title.trim() || !content.trim() || submittingRef.current) {
      return;
    }

    submittingRef.current = true;
    setSubmitting(true);
    try {
      // Upload attachments first if any are selected
      let attachments: Attachment[] | undefined;
      if (selectedImages.length > 0) {
        setUploadStatus('Uploading images...');
        const result = await uploadMultipleImages(userId, selectedImages, (progress) => {
          setUploadStatus(`Uploading ${progress.current}/${progress.total}...`);
        });
        if (result.attachments.length > 0) {
          attachments = result.attachments;
        }
      }
      if (selectedFiles.length > 0) {
        setUploadStatus('Uploading files...');
        const result = await uploadMultipleFiles(userId, selectedFiles, (progress) => {
          setUploadStatus(`Uploading file ${progress.current}/${progress.total}...`);
        });
        if (result.attachments.length > 0) {
          attachments = [...(attachments ?? []), ...result.attachments];
        }
      }

      setUploadStatus('');
      const didPost = await onSubmit(title.trim(), content.trim(), attachments);
      if (didPost) {
        setTitle('');
        setContent('');
        setContentSelection({ start: 0, end: 0 });
        setContentSelectionOverride(null);
        setSelectedImages([]);
        setSelectedFiles([]);
        if (draftStorageKey) {
          removeStoredItem(draftStorageKey);
        }
        onClose();
      }
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
      setUploadStatus('');
    }
  };

  const handleClose = () => {
    setTitle('');
    setContent('');
    setContentSelection({ start: 0, end: 0 });
    setContentSelectionOverride(null);
    setSelectedImages([]);
    setSelectedFiles([]);
    if (draftStorageKey) {
      removeStoredItem(draftStorageKey);
    }
    onClose();
  };

  const isValid = title.trim().length > 0 && content.trim().length > 0;

  const handleSelectMention = (member: MentionTarget) => {
    const inserted = insertMention(content, contentCursorIndex, member);
    setContent(inserted.text);
    const nextSelection = { start: inserted.cursorIndex, end: inserted.cursorIndex };
    setContentSelection(nextSelection);
    setContentSelectionOverride(nextSelection);
  };

  const handleContentChange = (text: string) => {
    setContent(text);
    setContentSelection((previousSelection) => {
      const wasAtTextEnd = previousSelection.start === content.length && previousSelection.end === content.length;
      const lookedUnreported = previousSelection.start === 0 && previousSelection.end === 0 && text.length > 0;
      if (wasAtTextEnd || lookedUnreported) {
        return { start: text.length, end: text.length };
      }
      return previousSelection;
    });
  };

  const titleEnterToSubmitCaptureProps = Platform.OS === 'web'
    ? ({ onKeyDownCapture: submitOnEnter(handleSubmit) } as any)
    : {};
  const contentEnterToSubmitCaptureProps = Platform.OS === 'web'
    ? ({ onKeyDownCapture: submitOnEnter(handleSubmit) } as any)
    : {};
  const { dragDropProps, isDragActive } = useWebAttachmentDropZone({
    selectedImages,
    selectedFiles,
    onImagesChange: setSelectedImages,
    onFilesChange: setSelectedFiles,
    captureDocumentDrops: visible,
    disabled: submitting || !visible,
  });

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
      <SafeAreaView className="flex-1 bg-cream" edges={['top']}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          className="flex-1"
        >
          {/* Header */}
          <View className="flex-row items-center justify-between px-4 py-3 border-b border-cream bg-white">
            <Pressable onPress={handleClose}>
              <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-charcoal">
                Cancel
              </Text>
            </Pressable>
            <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-charcoal text-lg">
              {isEditMode ? 'Edit Thread' : 'New Thread'}
            </Text>
            <Pressable
              onPress={handleSubmit}
              disabled={!isValid || submitting}
              className={`px-4 py-2 rounded-lg ${isValid && !submitting ? 'bg-gold' : 'bg-cream'}`}
            >
              <Text
                style={{ fontFamily: 'Lato_700Bold' }}
                className={isValid && !submitting ? 'text-white' : 'text-charcoal/30'}
              >
                {uploadStatus || (submitting ? (isEditMode ? 'Saving...' : 'Posting...') : (isEditMode ? 'Save' : 'Post'))}
              </Text>
            </Pressable>
          </View>

          <ScrollView className="flex-1 p-4">
            {/* Category badge */}
            {category && (
              <View className="flex-row items-center mb-4">
                <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-charcoal/60 text-sm">
                  {isEditMode ? 'Editing in:' : 'Posting to:'}
                </Text>
                <View className="ml-2 px-3 py-1 bg-gold/10 rounded-full">
                  <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-gold text-sm">
                    {category.name}
                  </Text>
                </View>
              </View>
            )}

            {isEditMode && managementActions && (
              <View className="flex-row flex-wrap mb-4" style={{ gap: 8 }}>
                {managementActions}
              </View>
            )}

            {/* Title input */}
            <View className="mb-4" {...titleEnterToSubmitCaptureProps}>
              <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-charcoal mb-2">
                Title
              </Text>
              <TextInput
                value={title}
                onChangeText={setTitle}
                placeholder="Give this thread a title..."
                placeholderTextColor="#a09274"
                maxLength={150}
                returnKeyType="send"
                onSubmitEditing={handleSubmit}
                className="bg-white rounded-xl px-4 py-3 text-charcoal"
                style={{ fontFamily: 'Lato_400Regular' }}
              />
              <View className="flex-row items-center justify-between mt-1">
                {/* Mic, no clip. You cannot attach a photograph to a title. */}
                <VoiceMicButton
                  size={18}
                  onTranscript={titleDictation.onTranscript}
                  onInterimTranscript={titleDictation.onInterimTranscript}
                />
                <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-charcoal/40 text-xs">
                  {title.length}/150
                </Text>
              </View>
            </View>

            {/* Content input */}
            <View className="mb-4">
              <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-charcoal mb-2">
                Content
              </Text>
              <View {...contentEnterToSubmitCaptureProps}>
                <TextInput
                  value={content}
                  onChangeText={handleContentChange}
                  onSelectionChange={(event) => setContentSelection(event.nativeEvent.selection)}
                  selection={contentSelectionOverride ?? undefined}
                  placeholder="What would you like to share?"
                  placeholderTextColor="#a09274"
                  multiline
                  blurOnSubmit={Platform.OS === 'web'}
                  submitBehavior={Platform.OS === 'web' ? 'submit' : 'newline'}
                  returnKeyType="send"
                  enterKeyHint="send"
                  onSubmitEditing={handleSubmit}
                  onKeyPress={submitOnEnter(handleSubmit)}
                  textAlignVertical="top"
                  className="bg-white rounded-xl px-4 py-3 text-charcoal min-h-[200px]"
                  style={{ fontFamily: 'Lato_400Regular' }}
                />
              </View>
              {/* Talk instead of typing. Board replies have had this for ages;
                  the box you write the actual POST in never did. */}
              <View className="flex-row items-center mt-2">
                <VoiceMicButton
                  size={20}
                  onTranscript={contentDictation.onTranscript}
                  onInterimTranscript={contentDictation.onInterimTranscript}
                />
                <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-charcoal/40 text-xs ml-2">
                  Talk instead of typing
                </Text>
              </View>
              <MentionSuggestions
                active={mentionQuery !== null}
                query={mentionQuery}
                loading={mentionMembersLoading}
                suggestions={mentionSuggestions}
                onSelect={handleSelectMention}
              />
              {selectedMentionsEveryone ? (
                <View className="flex-row flex-wrap mt-2" style={{ gap: 6 }}>
                  <View className="bg-blue-50 border border-blue-200 rounded-full px-3 py-1">
                    <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-blue-700 text-xs">
                      Tagged everyone in HIVE
                    </Text>
                  </View>
                </View>
              ) : selectedMentionMembers.length > 0 && (
                <View className="flex-row flex-wrap mt-2" style={{ gap: 6 }}>
                  {selectedMentionMembers.map((member) => (
                    <View key={member.id} className="bg-blue-50 border border-blue-200 rounded-full px-3 py-1">
                      <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-blue-700 text-xs">
                        Tagged {member.name.split(/\s+/)[0]}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </View>

            {/* Attachments */}
            <View
              className={`mb-4 rounded-2xl border p-3 ${
                isDragActive ? 'border-gold bg-gold/10' : 'border-transparent'
              }`}
              {...dragDropProps}
            >
              <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-charcoal mb-2">
                Attachments
              </Text>
              {isDragActive && (
                <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-gold text-sm mb-2">
                  Drop photos, videos, or files to attach
                </Text>
              )}
              <AttachmentPicker
                selectedImages={selectedImages}
                onImagesChange={setSelectedImages}
                selectedFiles={selectedFiles}
                onFilesChange={setSelectedFiles}
                disabled={submitting}
              />
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}
