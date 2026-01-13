import { useState } from 'react';
import { View, Text, TextInput, Pressable, Modal, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { BoardCategory } from '../../types';

interface BoardComposerProps {
  visible: boolean;
  category: BoardCategory | null;
  onClose: () => void;
  onSubmit: (title: string, content: string) => Promise<boolean>;
}

export function BoardComposer({ visible, category, onClose, onSubmit }: BoardComposerProps) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!title.trim() || !content.trim()) return;

    setSubmitting(true);
    try {
      const didPost = await onSubmit(title.trim(), content.trim());
      if (didPost) {
        setTitle('');
        setContent('');
        onClose();
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    setTitle('');
    setContent('');
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
              New Post
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
                {submitting ? 'Posting...' : 'Post'}
              </Text>
            </Pressable>
          </View>

          <ScrollView className="flex-1 p-4">
            {/* Category badge */}
            {category && (
              <View className="flex-row items-center mb-4">
                <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-charcoal/60 text-sm">
                  Posting to:
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
            <View className="flex-1">
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
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}
