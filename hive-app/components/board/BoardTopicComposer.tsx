import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { View, Text, TextInput, Pressable, Modal, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { submitOnEnter } from '../../lib/submitOnEnter';
import { getMemberBoardDisplayName, getMemberHdBoardName } from '../../lib/boardWishLinks';
import type { BoardCategory, Profile } from '../../types';

const BOARD_DRAFT_KEY = 'board-topic-draft';
export type BoardTopicAudience = 'community' | 'members';
export type BoardTopicKind = 'discussion' | 'hd_board' | 'helper_log';

export interface BoardTopicMetadata {
  topicKind: BoardTopicKind;
  ownerUserId: string | null;
  goalTitle: string | null;
}

interface BoardTopicComposerProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (
    name: string,
    description: string,
    icon: string,
    audience: BoardTopicAudience,
    taggedMemberIds: string[],
    metadata: BoardTopicMetadata
  ) => Promise<boolean>;
  existingCategory?: BoardCategory | null;
  members?: Pick<Profile, 'id' | 'name' | 'avatar_url'>[];
  managementActions?: ReactNode;
}

// Icon is now stored as the emoji character directly (not a code)
// Old code-based entries are still handled by BoardCategoryList's EMOJI_MAP fallback

const EMOJI_CATEGORIES: { label: string; icon: string; emojis: string[] }[] = [
  {
    label: 'Popular',
    icon: '⭐',
    emojis: ['💬','💡','🎯','📝','🎉','❤️','🌱','🚀','🧠','📅','💪','📚','🎨','🎵','💰','🏠','🤝','❓','📦','📋'],
  },
  {
    label: 'People',
    icon: '😀',
    emojis: ['😀','😂','🥰','😎','🤩','🥳','🤔','😴','🤗','🙌','👏','👋','🫶','💪','🧘','🏃','🚶','👑','🎓','👩‍💻'],
  },
  {
    label: 'Nature',
    icon: '🌿',
    emojis: ['🌱','🌸','🌺','🌻','🌹','🍀','🍁','🌿','🌳','🌲','🌴','🐝','🦋','🐢','🦊','🌙','☀️','🌈','⭐','🔥'],
  },
  {
    label: 'Food',
    icon: '🍕',
    emojis: ['🍕','🍔','🌮','🍜','🍣','🍰','🎂','☕','🍵','🥂','🍷','🥗','🍩','🍦','🍓','🍇','🥑','🌶️','🍋','🫐'],
  },
  {
    label: 'Activities',
    icon: '⚽',
    emojis: ['⚽','🏀','🎾','🏊','🧗','🏋️','🧩','♟️','🎸','🎹','🎭','🎬','📷','✈️','⛵','🏕️','🛹','🎮','🎲','🪄'],
  },
  {
    label: 'Objects',
    icon: '🔧',
    emojis: ['💻','📱','📷','🔑','🔧','⚙️','💎','🏆','🎁','📮','📌','🗂️','📊','💌','🔔','🕯️','🧲','🔭','🪞','🧸'],
  },
  {
    label: 'Symbols',
    icon: '✨',
    emojis: ['✨','💫','⚡','🌊','💥','🎆','🎇','🏳️','🔴','🟠','🟡','🟢','🔵','🟣','⬛','🔶','🔷','♾️','☯️','🌀'],
  },
  {
    label: 'Travel',
    icon: '🗺️',
    emojis: ['🗺️','🏔️','🏖️','🏝️','🌋','🗽','🏰','⛩️','🗼','🎡','🚂','✈️','🚀','⛵','🚗','🏠','🌃','🌆','🌉','🌍'],
  },
];

function getFirstEmoji(icon?: string): string {
  if (!icon) return EMOJI_CATEGORIES[0].emojis[0];
  // If it looks like a Unicode code (old format), convert to emoji
  if (/^[0-9A-F]{4,6}$/i.test(icon)) {
    try { return String.fromCodePoint(parseInt(icon, 16)); } catch { /* fall through */ }
  }
  return getGraphemes(icon)[0] ?? EMOJI_CATEGORIES[0].emojis[0];
}

function getGraphemes(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return [];

  const Segmenter = typeof Intl !== 'undefined' ? (Intl as any).Segmenter : undefined;
  if (Segmenter) {
    return Array.from(
      new Segmenter(undefined, { granularity: 'grapheme' }).segment(trimmed),
      (part: any) => part.segment as string
    );
  }

  return Array.from(trimmed);
}

export function BoardTopicComposer({
  visible,
  onClose,
  onSubmit,
  existingCategory,
  members = [],
  managementActions,
}: BoardTopicComposerProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedEmoji, setSelectedEmoji] = useState(EMOJI_CATEGORIES[0].emojis[0]);
  const [activeCategory, setActiveCategory] = useState(0);
  const [customEmoji, setCustomEmoji] = useState('');
  const [topicKind, setTopicKind] = useState<BoardTopicKind>('discussion');
  const [audience, setAudience] = useState<BoardTopicAudience>('community');
  const [taggedMemberIds, setTaggedMemberIds] = useState<string[]>([]);
  const [ownerUserId, setOwnerUserId] = useState('');
  const [goalTitle, setGoalTitle] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const customInputRef = useRef<TextInput>(null);
  const isEditMode = !!existingCategory;
  const selectedOwner = useMemo(
    () => members.find((member) => member.id === ownerUserId),
    [members, ownerUserId]
  );
  const selectedOwnerName = selectedOwner?.name
    || existingCategory?.member_tags?.find((tag) => tag.tagged_user_id === ownerUserId)?.member?.name;
  const suggestedHdName = topicKind === 'hd_board' && ownerUserId
    ? getMemberHdBoardName(selectedOwnerName)
    : '';

  useEffect(() => {
    if (!visible) return;
    if (existingCategory) {
      setName(existingCategory.name);
      setDescription(existingCategory.description || '');
      setSelectedEmoji(getFirstEmoji(existingCategory.icon));
      setCustomEmoji('');
      setActiveCategory(0);
      setTopicKind(existingCategory.topic_kind === 'hd_board' || existingCategory.topic_kind === 'helper_log'
        ? existingCategory.topic_kind
        : 'discussion');
      setAudience(existingCategory.audience === 'members' ? 'members' : 'community');
      setTaggedMemberIds((existingCategory.member_tags ?? []).map((tag) => tag.tagged_user_id));
      setOwnerUserId(existingCategory.owner_user_id ?? existingCategory.member_tags?.[0]?.tagged_user_id ?? '');
      setGoalTitle(existingCategory.goal_title ?? '');
    } else {
      // Restore draft for new topics
      AsyncStorage.getItem(BOARD_DRAFT_KEY).then(raw => {
        if (raw) {
          try {
            const d = JSON.parse(raw);
            setName(d.name ?? '');
            setDescription(d.description ?? '');
            setSelectedEmoji(d.emoji ?? EMOJI_CATEGORIES[0].emojis[0]);
            setTopicKind(d.topicKind ?? 'discussion');
            setOwnerUserId(d.ownerUserId ?? '');
            setGoalTitle(d.goalTitle ?? '');
          } catch {
            setName(''); setDescription(''); setSelectedEmoji(EMOJI_CATEGORIES[0].emojis[0]);
            setTopicKind('discussion'); setOwnerUserId(''); setGoalTitle('');
          }
        } else {
          setName(''); setDescription(''); setSelectedEmoji(EMOJI_CATEGORIES[0].emojis[0]);
          setTopicKind('discussion'); setOwnerUserId(''); setGoalTitle('');
        }
      });
      setCustomEmoji('');
      setActiveCategory(0);
      setAudience('community');
      setTaggedMemberIds([]);
    }
  }, [visible, existingCategory]);

  // Auto-save draft for new topics (not editing)
  useEffect(() => {
    if (!visible || existingCategory) return;
    if (!name && !description && !goalTitle && !ownerUserId) return;
    AsyncStorage.setItem(BOARD_DRAFT_KEY, JSON.stringify({
      name,
      description,
      emoji: selectedEmoji,
      topicKind,
      ownerUserId,
      goalTitle,
    })).catch(() => {});
  }, [visible, existingCategory, name, description, selectedEmoji, topicKind, ownerUserId, goalTitle]);

  const handleCustomEmojiChange = (text: string) => {
    // Grab only the last grapheme in case they type multiple.
    const chars = getGraphemes(text);
    if (chars.length > 0) {
      const last = chars[chars.length - 1];
      setCustomEmoji(last);
      setSelectedEmoji(last);
    } else {
      setCustomEmoji('');
    }
  };

  const handleSubmit = async () => {
    const finalGoalTitle = topicKind === 'helper_log' ? '15min HIVE Helpers' : null;
    const finalOwnerUserId = topicKind === 'hd_board' ? ownerUserId || null : null;
    const finalName = topicKind === 'helper_log'
      ? '15min HIVE Helpers'
      : topicKind === 'hd_board'
        ? (name.trim() || getMemberHdBoardName(selectedOwnerName))
        : name.trim();
    const finalDescription = topicKind === 'hd_board'
      ? (description.trim() || `${getMemberBoardDisplayName(selectedOwnerName)}'s home base for HD wishes, asks, updates, recommendations, and helper threads.`)
      : topicKind === 'helper_log'
        ? (description.trim() || 'Log quick acts of help so Clive can include them in meeting recaps, slide decks, and newsletters.')
        : description.trim();

    if (!finalName) return;
    if (topicKind === 'hd_board' && !finalOwnerUserId) return;

    setSubmitting(true);
    try {
      const finalTaggedMemberIds = topicKind === 'hd_board' && finalOwnerUserId
        ? [finalOwnerUserId]
        : topicKind === 'helper_log'
          ? []
          : taggedMemberIds;
      const finalAudience = topicKind === 'hd_board'
        ? 'members'
        : topicKind === 'helper_log'
          ? 'community'
          : audience === 'members' && finalTaggedMemberIds.length > 0 ? 'members' : 'community';
      const success = await onSubmit(
        finalName,
        finalDescription,
        topicKind === 'helper_log' ? '🤝' : topicKind === 'hd_board' ? (selectedEmoji || '💎') : selectedEmoji,
        finalAudience,
        finalAudience === 'members' ? finalTaggedMemberIds : [],
        {
          topicKind,
          ownerUserId: finalOwnerUserId,
          goalTitle: finalGoalTitle,
        }
      );
      if (success) {
        if (!existingCategory) AsyncStorage.removeItem(BOARD_DRAFT_KEY).catch(() => {});
        setName('');
        setDescription('');
        setSelectedEmoji(EMOJI_CATEGORIES[0].emojis[0]);
        setCustomEmoji('');
        setTopicKind('discussion');
        setAudience('community');
        setTaggedMemberIds([]);
        setOwnerUserId('');
        setGoalTitle('');
        onClose();
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    // Clear draft on explicit cancel (user chose to abandon)
    if (!existingCategory) AsyncStorage.removeItem(BOARD_DRAFT_KEY).catch(() => {});
    setName('');
    setDescription('');
    setSelectedEmoji(EMOJI_CATEGORIES[0].emojis[0]);
    setCustomEmoji('');
    setTopicKind('discussion');
    setAudience('community');
    setTaggedMemberIds([]);
    setOwnerUserId('');
    setGoalTitle('');
    onClose();
  };

  const isValid = topicKind === 'helper_log'
    || (topicKind === 'hd_board' ? ownerUserId.length > 0 : name.trim().length > 0);
  const toggleMember = (memberId: string) => {
    setAudience('members');
    setTaggedMemberIds((current) => (
      current.includes(memberId)
        ? current.filter((id) => id !== memberId)
        : [...current, memberId]
    ));
  };
  const selectOwner = (memberId: string) => {
    setTopicKind('hd_board');
    setAudience('members');
    setOwnerUserId(memberId);
    setTaggedMemberIds([memberId]);
    if (!selectedEmoji || selectedEmoji === EMOJI_CATEGORIES[0].emojis[0]) setSelectedEmoji('💎');
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
      <SafeAreaView className="flex-1 bg-cream" edges={['top']}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} className="flex-1">

          {/* Header */}
          <View className="flex-row items-center justify-between px-4 py-3 border-b border-cream bg-white">
            <Pressable onPress={handleClose} className="active:opacity-60">
              <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-charcoal">Cancel</Text>
            </Pressable>
            <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-charcoal text-lg">
              {isEditMode ? 'Edit Topic' : 'New Topic'}
            </Text>
            <Pressable
              onPress={handleSubmit}
              disabled={!isValid || submitting}
              className={`px-4 py-2 rounded-lg ${isValid && !submitting ? 'bg-gold' : 'bg-cream'}`}
            >
              <Text style={{ fontFamily: 'Lato_700Bold' }} className={isValid && !submitting ? 'text-white' : 'text-charcoal/30'}>
                {submitting ? (isEditMode ? 'Saving...' : 'Creating...') : (isEditMode ? 'Save' : 'Create')}
              </Text>
            </Pressable>
          </View>

          <ScrollView className="flex-1 p-4" keyboardShouldPersistTaps="handled">
            {/* Preview */}
            <View className="items-center mb-6">
              <View className="flex-row items-center px-4 py-2 bg-gold rounded-full">
                <Text className="mr-1 text-lg">{selectedEmoji}</Text>
                <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-white">
                  {name || 'Topic Name'}
                </Text>
              </View>
              <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-charcoal/50 text-xs mt-2">
                Preview
              </Text>
            </View>

            {isEditMode && managementActions && (
              <View className="flex-row flex-wrap mb-4" style={{ gap: 8 }}>
                {managementActions}
              </View>
            )}

            {/* Board type */}
            <View className="mb-4">
              <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-charcoal mb-2">Board Type</Text>
              <View className="bg-white rounded-xl p-3">
                <View className="flex-row flex-wrap">
                  {[
                    { kind: 'discussion' as const, label: 'Discussion', icon: '💬' },
                    { kind: 'hd_board' as const, label: 'Member HD', icon: '💎' },
                    { kind: 'helper_log' as const, label: '15min Helpers', icon: '🤝' },
                  ].map((option) => {
                    const selected = topicKind === option.kind;
                    return (
                      <Pressable
                        key={option.kind}
                        onPress={() => {
                          setTopicKind(option.kind);
                          if (option.kind === 'helper_log') {
                            setAudience('community');
                            setTaggedMemberIds([]);
                            setOwnerUserId('');
                            setGoalTitle('15min HIVE Helpers');
                            setSelectedEmoji('🤝');
                          }
                          if (option.kind === 'hd_board') {
                            setAudience('members');
                            if (!selectedEmoji || selectedEmoji === '💬') setSelectedEmoji('💎');
                          }
                        }}
                        className={`px-4 py-2.5 rounded-full mr-2 mb-2 border ${
                          selected ? 'bg-gold border-gold' : 'bg-cream border-gold/20'
                        }`}
                      >
                        <Text
                          style={{ fontFamily: 'Lato_700Bold' }}
                          className={selected ? 'text-white' : 'text-charcoal'}
                        >
                          {option.icon} {option.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            </View>

            {topicKind === 'hd_board' && (
              <View className="mb-4">
                <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-charcoal mb-2">Whose HD Board?</Text>
                <View className="bg-white rounded-xl p-3">
                  <View className="flex-row flex-wrap">
                    {members.map((member) => {
                      const selected = ownerUserId === member.id;
                      return (
                        <Pressable
                          key={member.id}
                          onPress={() => selectOwner(member.id)}
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
                  {!!suggestedHdName && (
                    <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-charcoal/50 text-xs mt-2">
                      Will create: {suggestedHdName}
                    </Text>
                  )}
                </View>
              </View>
            )}

            {/* Emoji picker */}
            <View className="mb-4">
              <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-charcoal mb-2">Choose an Icon</Text>
              <View className="bg-white rounded-xl overflow-hidden">

                {/* "Type any emoji" row */}
                <Pressable
                  onPress={() => customInputRef.current?.focus()}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingHorizontal: 14,
                    paddingVertical: 10,
                    borderBottomWidth: 1,
                    borderBottomColor: 'rgba(222,193,129,0.2)',
                    gap: 10,
                  }}
                >
                  <Ionicons name="happy-outline" size={18} color="#bd9348" />
                  <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 13, color: '#8e7a5e', flex: 1 }}>
                    Type or paste any emoji →
                  </Text>
                  <TextInput
                    ref={customInputRef}
                    value={customEmoji}
                    onChangeText={handleCustomEmojiChange}
                    style={{
                      fontSize: 28,
                      width: 44,
                      height: 44,
                      textAlign: 'center',
                      borderWidth: 1,
                      borderColor: customEmoji ? '#bd9348' : 'rgba(222,193,129,0.4)',
                      borderRadius: 10,
                      backgroundColor: customEmoji ? '#fdf3dc' : '#faf8f3',
                    }}
                    maxLength={8}
                    autoCorrect={false}
                    autoCapitalize="none"
                    placeholder="🐝"
                    placeholderTextColor="#d1d5db"
                  />
                </Pressable>

                {/* Category tabs */}
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={{ borderBottomWidth: 1, borderBottomColor: 'rgba(222,193,129,0.2)' }}
                  contentContainerStyle={{ paddingHorizontal: 8, paddingVertical: 6, gap: 4 }}
                >
                  {EMOJI_CATEGORIES.map((cat, i) => (
                    <Pressable
                      key={cat.label}
                      onPress={() => setActiveCategory(i)}
                      style={{
                        paddingHorizontal: 10,
                        paddingVertical: 5,
                        borderRadius: 20,
                        backgroundColor: activeCategory === i ? '#fdf3dc' : 'transparent',
                        borderWidth: 1,
                        borderColor: activeCategory === i ? '#bd9348' : 'transparent',
                      }}
                    >
                      <Text style={{ fontSize: 16 }}>{cat.icon}</Text>
                    </Pressable>
                  ))}
                </ScrollView>

                {/* Emoji grid */}
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', padding: 8 }}>
                  {EMOJI_CATEGORIES[activeCategory].emojis.map((emoji) => (
                    <Pressable
                      key={emoji}
                      onPress={() => { setSelectedEmoji(emoji); setCustomEmoji(''); }}
                      style={{
                        width: 44,
                        height: 44,
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: 10,
                        margin: 3,
                        backgroundColor: selectedEmoji === emoji ? '#fdf3dc' : 'transparent',
                        borderWidth: selectedEmoji === emoji ? 1.5 : 0,
                        borderColor: '#bd9348',
                      }}
                    >
                      <Text style={{ fontSize: 22 }}>{emoji}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            </View>

            {/* Audience picker */}
            {topicKind === 'discussion' && (
            <View className="mb-4">
              <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-charcoal mb-2">Tag</Text>
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
            )}

            {/* Name input */}
            <View className="mb-4">
              <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-charcoal mb-2">
                {topicKind === 'hd_board' ? 'Board Name' : 'Topic Name *'}
              </Text>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder={topicKind === 'hd_board'
                  ? suggestedHdName || "e.g., Brit's HD Board"
                  : topicKind === 'helper_log'
                    ? '15min HIVE Helpers'
                    : 'e.g., Book Club, Recipes, Travel Plans...'}
                placeholderTextColor="#a09274"
                maxLength={90}
                editable={topicKind !== 'helper_log'}
                returnKeyType="send"
                onSubmitEditing={handleSubmit}
                className="bg-white rounded-xl px-4 py-3 text-charcoal"
                style={{ fontFamily: 'Lato_400Regular' }}
              />
              <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-charcoal/40 text-xs mt-1 text-right">
                {name.length}/90
              </Text>
            </View>

            {/* Description input */}
            <View className="mb-4">
              <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-charcoal mb-2">Description</Text>
              <TextInput
                value={description}
                onChangeText={setDescription}
                placeholder="What is this topic about? (optional)"
                placeholderTextColor="#a09274"
                multiline
                blurOnSubmit={Platform.OS === 'web'}
                submitBehavior={Platform.OS === 'web' ? 'submit' : 'newline'}
                returnKeyType="send"
                enterKeyHint="send"
                onSubmitEditing={handleSubmit}
                onKeyPress={submitOnEnter(handleSubmit)}
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
            <View className="bg-gold/10 rounded-xl p-4 mb-4">
              <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-charcoal/70 text-sm">
                Use top-level boards for big containers. Put the specific asks, recommendations, recipes, or project threads inside the board.
              </Text>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}
