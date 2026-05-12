import { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, Modal, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { BoardCategory } from '../../types';

interface BoardTopicComposerProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (name: string, description: string, icon: string) => Promise<boolean>;
  existingCategory?: BoardCategory | null;
}

// Common emojis for topic icons
const EMOJI_OPTIONS = [
  { code: '1F4AC', emoji: '💬' }, // General
  { code: '1F4A1', emoji: '💡' }, // Ideas
  { code: '2753', emoji: '❓' }, // Questions
  { code: '1F389', emoji: '🎉' }, // Events
  { code: '1F4DD', emoji: '📝' }, // Notes
  { code: '1F3AF', emoji: '🎯' }, // Goals
  { code: '1F4E6', emoji: '📦' }, // Projects
  { code: '1F91D', emoji: '🤝' }, // Collaboration
  { code: '1F4B0', emoji: '💰' }, // Money
  { code: '1F3E0', emoji: '🏠' }, // Home
  { code: '1F4DA', emoji: '📚' }, // Books
  { code: '1F3A8', emoji: '🎨' }, // Art
  { code: '1F3B5', emoji: '🎵' }, // Music
  { code: '1F374', emoji: '🍴' }, // Food
  { code: '1F4AA', emoji: '💪' }, // Fitness
  { code: '2764', emoji: '❤️' }, // Love
  { code: '1F331', emoji: '🌱' }, // Growth
  { code: '1F680', emoji: '🚀' }, // Launch
  { code: '1F9E0', emoji: '🧠' }, // Mind
  { code: '1F4C5', emoji: '📅' }, // Calendar
];

function getEmojiOption(icon?: string) {
  return EMOJI_OPTIONS.find((option) => option.code === icon) || EMOJI_OPTIONS[0];
}

export function BoardTopicComposer({ visible, onClose, onSubmit, existingCategory }: BoardTopicComposerProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedIcon, setSelectedIcon] = useState(EMOJI_OPTIONS[0]);
  const [submitting, setSubmitting] = useState(false);
  const isEditMode = !!existingCategory;

  useEffect(() => {
    if (!visible) return;

    if (existingCategory) {
      setName(existingCategory.name);
      setDescription(existingCategory.description || '');
      setSelectedIcon(getEmojiOption(existingCategory.icon));
    } else {
      setName('');
      setDescription('');
      setSelectedIcon(EMOJI_OPTIONS[0]);
    }
  }, [visible, existingCategory]);

  const handleSubmit = async () => {
    if (!name.trim()) return;

    setSubmitting(true);
    try {
      const success = await onSubmit(name.trim(), description.trim(), selectedIcon.code);
      if (success) {
        setName('');
        setDescription('');
        setSelectedIcon(EMOJI_OPTIONS[0]);
        onClose();
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    setName('');
    setDescription('');
    setSelectedIcon(EMOJI_OPTIONS[0]);
    onClose();
  };

  const isValid = name.trim().length > 0;

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
              {isEditMode ? 'Edit Topic' : 'New Topic'}
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
                {submitting ? (isEditMode ? 'Saving...' : 'Creating...') : (isEditMode ? 'Save' : 'Create')}
              </Text>
            </Pressable>
          </View>

          <ScrollView className="flex-1 p-4">
            {/* Preview */}
            <View className="items-center mb-6">
              <View className="flex-row items-center px-4 py-2 bg-gold rounded-full">
                <Text className="mr-1 text-lg">{selectedIcon.emoji}</Text>
                <Text
                  style={{ fontFamily: 'Lato_700Bold' }}
                  className="text-white"
                >
                  {name || 'Topic Name'}
                </Text>
              </View>
              <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-charcoal/50 text-xs mt-2">
                Preview
              </Text>
            </View>

            {/* Icon picker */}
            <View className="mb-4">
              <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-charcoal mb-2">
                Choose an Icon
              </Text>
              <View className="bg-white rounded-xl p-3">
                <View className="flex-row flex-wrap">
                  {EMOJI_OPTIONS.map((option) => (
                    <Pressable
                      key={option.code}
                      onPress={() => setSelectedIcon(option)}
                      className={`w-10 h-10 items-center justify-center rounded-lg m-1 ${
                        selectedIcon.code === option.code ? 'bg-gold/20' : 'bg-cream'
                      }`}
                    >
                      <Text className="text-xl">{option.emoji}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            </View>

            {/* Name input */}
            <View className="mb-4">
              <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-charcoal mb-2">
                Topic Name *
              </Text>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="e.g., Book Club, Recipes, Travel Plans..."
                placeholderTextColor="#9ca3af"
                maxLength={50}
                className="bg-white rounded-xl px-4 py-3 text-charcoal"
                style={{ fontFamily: 'Lato_400Regular' }}
              />
              <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-charcoal/40 text-xs mt-1 text-right">
                {name.length}/50
              </Text>
            </View>

            {/* Description input */}
            <View className="mb-4">
              <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-charcoal mb-2">
                Description
              </Text>
              <TextInput
                value={description}
                onChangeText={setDescription}
                placeholder="What is this topic about? (optional)"
                placeholderTextColor="#9ca3af"
                multiline
                textAlignVertical="top"
                maxLength={200}
                className="bg-white rounded-xl px-4 py-3 text-charcoal min-h-[100px]"
                style={{ fontFamily: 'Lato_400Regular' }}
              />
              <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-charcoal/40 text-xs mt-1 text-right">
                {description.length}/200
              </Text>
            </View>

            {/* Info note */}
            <View className="bg-gold/10 rounded-xl p-4">
              <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-charcoal/70 text-sm">
                Custom topics allow the community to organize discussions around specific interests or projects.
                All members will be able to post in your new topic.
              </Text>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}
