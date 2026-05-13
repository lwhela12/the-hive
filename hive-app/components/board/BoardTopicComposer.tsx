import { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, Modal, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { BoardCategory, Profile } from '../../types';

export type BoardTopicAudience = 'community' | 'members';

interface BoardTopicComposerProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (name: string, description: string, icon: string, audience: BoardTopicAudience, taggedMemberIds: string[]) => Promise<boolean>;
  existingCategory?: BoardCategory | null;
  members?: Pick<Profile, 'id' | 'name' | 'avatar_url'>[];
}

const DEFAULT_EMOJI = '💬';
const EMOJI_SUGGESTIONS = ['💬', '💡', '❓', '🎉', '📝', '🎯', '📦', '🤝', '💰', '🏠', '📚', '🎨', '🎵', '🍴', '💪', '❤️', '🌱', '🚀', '🧠', '📅'];

const LEGACY_EMOJI_MAP: Record<string, string> = {
  '1F4E2': '📢',
  '1F4AC': '💬',
  '1F451': '👑',
  '1F4DA': '📚',
  '1F44B': '👋',
  '1F4A1': '💡',
  '2753': '❓',
  '1F389': '🎉',
  '1F4DD': '📝',
  '1F3AF': '🎯',
  '1F4E6': '📦',
  '1F91D': '🤝',
  '1F4B0': '💰',
  '1F3E0': '🏠',
  '1F3A8': '🎨',
  '1F3B5': '🎵',
  '1F374': '🍴',
  '1F4AA': '💪',
  '2764': '❤️',
  '1F331': '🌱',
  '1F680': '🚀',
  '1F9E0': '🧠',
  '1F4C5': '📅',
};

function getDisplayEmoji(icon?: string | null) {
  if (!icon) return DEFAULT_EMOJI;
  return LEGACY_EMOJI_MAP[icon] || icon;
}

function getFirstGrapheme(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return '';

  const segmenter = typeof Intl !== 'undefined' && 'Segmenter' in Intl
    ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
    : null;

  if (segmenter) {
    const [first] = Array.from(segmenter.segment(trimmed));
    return first?.segment ?? '';
  }

  return Array.from(trimmed)[0] ?? '';
}

export function BoardTopicComposer({ visible, onClose, onSubmit, existingCategory, members = [] }: BoardTopicComposerProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedEmoji, setSelectedEmoji] = useState(DEFAULT_EMOJI);
  const [audience, setAudience] = useState<BoardTopicAudience>('community');
  const [taggedMemberIds, setTaggedMemberIds] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const isEditMode = !!existingCategory;

  useEffect(() => {
    if (!visible) return;

    if (existingCategory) {
      setName(existingCategory.name);
      setDescription(existingCategory.description || '');
      setSelectedEmoji(getDisplayEmoji(existingCategory.icon));
      setAudience(existingCategory.audience === 'members' ? 'members' : 'community');
      setTaggedMemberIds((existingCategory.member_tags ?? []).map((tag) => tag.tagged_user_id));
    } else {
      setName('');
      setDescription('');
      setSelectedEmoji(DEFAULT_EMOJI);
      setAudience('community');
      setTaggedMemberIds([]);
    }
  }, [visible, existingCategory]);

  const handleSubmit = async () => {
    if (!name.trim()) return;

    setSubmitting(true);
    try {
      const finalAudience = audience === 'members' && taggedMemberIds.length > 0 ? 'members' : 'community';
      const success = await onSubmit(name.trim(), description.trim(), selectedEmoji, finalAudience, finalAudience === 'members' ? taggedMemberIds : []);
      if (success) {
        setName('');
        setDescription('');
        setSelectedEmoji(DEFAULT_EMOJI);
        setAudience('community');
        setTaggedMemberIds([]);
        onClose();
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    setName('');
    setDescription('');
    setSelectedEmoji(DEFAULT_EMOJI);
    setAudience('community');
    setTaggedMemberIds([]);
    onClose();
  };

  const handleEmojiChange = (value: string) => {
    const nextEmoji = getFirstGrapheme(value);
    if (nextEmoji) setSelectedEmoji(nextEmoji);
  };

  const isValid = name.trim().length > 0;
  const toggleMember = (memberId: string) => {
    setAudience('members');
    setTaggedMemberIds((current) => (
      current.includes(memberId)
        ? current.filter((id) => id !== memberId)
        : [...current, memberId]
    ));
  };

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
                <Text className="mr-1 text-lg">{selectedEmoji}</Text>
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
                Choose an Emoji
              </Text>
              <View className="bg-white rounded-xl p-4">
                <View className="flex-row items-center">
                  <TextInput
                    value={selectedEmoji}
                    onChangeText={handleEmojiChange}
                    placeholder="🙂"
                    placeholderTextColor="#9ca3af"
                    autoCorrect={false}
                    autoCapitalize="none"
                    className="w-16 h-16 bg-cream rounded-2xl text-center text-4xl"
                    style={{ fontFamily: Platform.OS === 'ios' ? undefined : 'Lato_400Regular' }}
                  />
                  <View className="flex-1 ml-4">
                    <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-charcoal">
                      Tap the square and use your emoji keyboard
                    </Text>
                    <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-charcoal/50 text-sm mt-1">
                      Any standard phone emoji works here.
                    </Text>
                  </View>
                </View>

                <View className="flex-row flex-wrap mt-3">
                  {EMOJI_SUGGESTIONS.map((emoji) => (
                    <Pressable
                      key={emoji}
                      onPress={() => setSelectedEmoji(emoji)}
                      className={`w-10 h-10 items-center justify-center rounded-lg m-1 ${
                        selectedEmoji === emoji ? 'bg-gold/20' : 'bg-cream'
                      }`}
                    >
                      <Text className="text-xl">{emoji}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            </View>

            {/* Audience picker */}
            <View className="mb-4">
              <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-charcoal mb-2">
                Tag
              </Text>
              <View className="bg-white rounded-xl p-3">
                <View className="flex-row flex-wrap">
                  <Pressable
                    onPress={() => {
                      setAudience('community');
                      setTaggedMemberIds([]);
                    }}
                    className={`px-4 py-2.5 rounded-full mr-2 mb-2 border ${
                      audience === 'community' ? 'bg-gold border-gold' : 'bg-cream border-gold/20'
                    }`}
                  >
                    <Text
                      style={{ fontFamily: 'Lato_700Bold' }}
                      className={audience === 'community' ? 'text-white' : 'text-charcoal'}
                    >
                      Everyone
                    </Text>
                  </Pressable>

                  {members.map((member) => {
                    const selected = audience === 'members' && taggedMemberIds.includes(member.id);
                    return (
                      <Pressable
                        key={member.id}
                        onPress={() => toggleMember(member.id)}
                        className={`px-4 py-2.5 rounded-full mr-2 mb-2 border ${
                          selected ? 'bg-gold border-gold' : 'bg-cream border-gold/20'
                        }`}
                      >
                        <Text
                          style={{ fontFamily: 'Lato_700Bold' }}
                          className={selected ? 'text-white' : 'text-charcoal'}
                          numberOfLines={1}
                        >
                          {member.name.split(' ')[0]}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-charcoal/50 text-sm mt-1">
                  Use Everyone for all-HIVE projects, or pick one or more members when the board belongs to specific people.
                </Text>
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
