import { useState, useEffect } from 'react';
import { View, Text, TextInput, Pressable, Modal, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { BoardCategory, BoardPost, Attachment } from '../../types';
import { SelectedImage } from '../../lib/imagePicker';
import { uploadMultipleImages } from '../../lib/attachmentUpload';
import { AttachmentPicker } from '../ui/AttachmentPicker';

interface BoardComposerProps {
  visible: boolean;
  category: BoardCategory | null;
  userId: string;
  onClose: () => void;
  onSubmit: (title: string, content: string, attachments?: Attachment[]) => Promise<boolean>;
  existingPost?: BoardPost | null; // For edit mode
}

export function BoardComposer({ visible, category, userId, onClose, onSubmit, existingPost }: BoardComposerProps) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [selectedImages, setSelectedImages] = useState<SelectedImage[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [uploadStatus, setUploadStatus] = useState('');

  const isEditMode = !!existingPost;

  // Pre-fill fields when editing
  useEffect(() => {
    if (visible && existingPost) {
      setTitle(existingPost.title);
      setContent(existingPost.content);
      // Note: existing attachments are shown but not editable for simplicity
    } else if (!visible) {
      // Reset when modal closes
      setTitle('');
      setContent('');
      setSelectedImages([]);
    }
  }, [visible, existingPost]);

  const handleSubmit = async () => {
    console.log('BoardComposer handleSubmit called', { title: title.trim(), content: content.trim() });
    if (!title.trim() || !content.trim()) {
      console.log('Empty title or content, returning');
      return;
    }

    setSubmitting(true);
    try {
      // Upload images first if any are selected
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

      setUploadStatus('');
      console.log('Calling onSubmit...');
      const didPost = await onSubmit(title.trim(), content.trim(), attachments);
      console.log('onSubmit returned:', didPost);
      if (didPost) {
        setTitle('');
        setContent('');
        setSelectedImages([]);
        onClose();
      }
    } finally {
      setSubmitting(false);
      setUploadStatus('');
    }
  };

  const handleClose = () => {
    setTitle('');
    setContent('');
    setSelectedImages([]);
    onClose();
  };

  const isValid = title.trim().length > 0 && content.trim().length > 0;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
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
              {isEditMode ? 'Edit Post' : 'New Post'}
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

            {/* Title input */}
            <View className="mb-4">
              <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-charcoal mb-2">
                Title
              </Text>
              <TextInput
                value={title}
                onChangeText={setTitle}
                placeholder="Give your post a title..."
                placeholderTextColor="#9ca3af"
                maxLength={150}
                className="bg-white rounded-xl px-4 py-3 text-charcoal"
                style={{ fontFamily: 'Lato_400Regular' }}
              />
              <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-charcoal/40 text-xs mt-1 text-right">
                {title.length}/150
              </Text>
            </View>

            {/* Content input */}
            <View className="mb-4">
              <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-charcoal mb-2">
                Content
              </Text>
              <TextInput
                value={content}
                onChangeText={setContent}
                placeholder="What would you like to share?"
                placeholderTextColor="#9ca3af"
                multiline
                textAlignVertical="top"
                className="bg-white rounded-xl px-4 py-3 text-charcoal min-h-[200px]"
                style={{ fontFamily: 'Lato_400Regular' }}
              />
            </View>

            {/* Attachments */}
            <View className="mb-4">
              <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-charcoal mb-2">
                Photos
              </Text>
              <AttachmentPicker
                selectedImages={selectedImages}
                onImagesChange={setSelectedImages}
                disabled={submitting}
              />
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}
