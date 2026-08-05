import { useState, useEffect, useRef, type ReactNode } from 'react';
import { View, Text, Pressable, Modal, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { BoardCategory, BoardPost, Attachment, Profile } from '../../types';
import { SelectedImage } from '../../lib/imagePicker';
import { SelectedFile } from '../../lib/filePicker';
import { uploadMultipleFiles, uploadMultipleImages } from '../../lib/attachmentUpload';
import { useMentionableMembers } from '../../lib/hooks/useMentionableMembers';
import { useWebAttachmentDropZone } from '../../lib/hooks/useWebAttachmentDropZone';
import { getStoredItem, removeStoredItem, setStoredItem } from '../../lib/webStorage';
import { AttachmentPicker } from '../ui/AttachmentPicker';
import { ComposerBar } from '../ui/ComposerBar';

const TITLE_MAX_LENGTH = 150;

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
  const [selectedImages, setSelectedImages] = useState<SelectedImage[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<SelectedFile[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [uploadStatus, setUploadStatus] = useState('');
  const submittingRef = useRef(false);
  const { members: activeMentionableMembers, loading: mentionMembersLoading } = useMentionableMembers(
    category?.community_id,
    mentionableMembers
  );

  const isEditMode = !!existingPost;

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
      setSelectedImages([]);
      setSelectedFiles([]);
    }
  }, [visible, existingPost, draftStorageKey]);

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
    setSelectedImages([]);
    setSelectedFiles([]);
    if (draftStorageKey) {
      removeStoredItem(draftStorageKey);
    }
    onClose();
  };

  const isValid = title.trim().length > 0 && content.trim().length > 0;

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

            {/* Title. One line, mic inside the box — you cannot attach a
                photograph to a title, so there is no clip on this one. */}
            <ComposerBar
              variant="form"
              containerClassName="mb-4"
              label="Title"
              value={title}
              onChangeText={setTitle}
              placeholder="Give this thread a title..."
              multiline={false}
              maxLength={TITLE_MAX_LENGTH}
              onSubmit={handleSubmit}
              canSubmit={isValid}
              submitting={submitting}
            />

            {/* The post itself. */}
            <ComposerBar
              variant="form"
              containerClassName="mb-4"
              label="Content"
              value={content}
              onChangeText={setContent}
              placeholder="What would you like to share?"
              minHeight={200}
              onSubmit={handleSubmit}
              canSubmit={isValid}
              submitting={submitting}
              mentionMembers={activeMentionableMembers}
              mentionsLoading={mentionMembersLoading}
              currentUserId={userId}
            />

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
