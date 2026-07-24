import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { View, Text, TextInput, Pressable, Modal, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { submitOnEnter } from '../../lib/submitOnEnter';
import { getMemberBoardDisplayName, getMemberHdBoardName } from '../../lib/boardWishLinks';
import { HiveIcon, type HiveIconName } from '../ui/HiveIcon';
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

// Board icons are stored as "hive:<name>" and drawn from the HIVE family.
// Older boards hold a raw emoji (or, older still, a unicode code point) —
// BoardCategoryList still renders those, so nothing breaks until someone
// edits the board and picks a family mark.

export const HIVE_ICON_PREFIX = 'hive:';
const DEFAULT_BOARD_ICON = `${HIVE_ICON_PREFIX}message`;

// The board icon set. Ordered so the marks a board actually reaches for come
// first, then the general-purpose ones.
const BOARD_ICON_CHOICES: HiveIconName[] = [
  'message', 'trophy', 'book', 'handshake', 'palette', 'megaphone', 'sprout', 'fork',
  'star', 'heart', 'calendar', 'honeypot', 'bee', 'crown', 'home', 'gift',
  'target', 'question', 'note', 'chart', 'person', 'sparkle', 'pin', 'suitcase',
  'cake', 'tv', 'board', 'checkin',
];

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
  // A family mark passes through whole — it isn't a grapheme.
  if (icon?.startsWith(HIVE_ICON_PREFIX)) return icon;
  if (!icon) return DEFAULT_BOARD_ICON;
  // If it looks like a Unicode code (old format), convert to emoji
  if (/^[0-9A-F]{4,6}$/i.test(icon)) {
    try { return String.fromCodePoint(parseInt(icon, 16)); } catch { /* fall through */ }
  }
  return getGraphemes(icon)[0] ?? DEFAULT_BOARD_ICON;
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
  const [selectedEmoji, setSelectedEmoji] = useState(DEFAULT_BOARD_ICON);
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
            setSelectedEmoji(d.emoji ?? DEFAULT_BOARD_ICON);
            setTopicKind(d.topicKind ?? 'discussion');
            setOwnerUserId(d.ownerUserId ?? '');
            setGoalTitle(d.goalTitle ?? '');
          } catch {
            setName(''); setDescription(''); setSelectedEmoji(DEFAULT_BOARD_ICON);
            setTopicKind('discussion'); setOwnerUserId(''); setGoalTitle('');
          }
        } else {
          setName(''); setDescription(''); setSelectedEmoji(DEFAULT_BOARD_ICON);
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
    const finalGoalTitle = topicKind === 'helper_log' ? 'HIVE Helpers' : null;
    const finalOwnerUserId = topicKind === 'hd_board' ? ownerUserId || null : null;
    const finalName = topicKind === 'helper_log'
      ? 'HIVE Helpers'
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
        topicKind === 'helper_log' ? `${HIVE_ICON_PREFIX}handshake` : selectedEmoji,
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
        setSelectedEmoji(DEFAULT_BOARD_ICON);
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
    setSelectedEmoji(DEFAULT_BOARD_ICON);
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
    if (!selectedEmoji || selectedEmoji === DEFAULT_BOARD_ICON) setSelectedEmoji('💎');
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
              {isEditMode ? 'Edit Board' : 'New Board'}
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
              <View className="flex-row items-center px-4 py-2 bg-gold rounded-full" style={{ gap: 6 }}>
                {selectedEmoji.startsWith(HIVE_ICON_PREFIX) ? (
                  <HiveIcon name={selectedEmoji.slice(HIVE_ICON_PREFIX.length) as HiveIconName} size={18} color="#ffffff" />
                ) : (
                  <Text className="text-lg">{selectedEmoji}</Text>
                )}
                <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-white">
                  {name || 'Board Name'}
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

            {/* Board Type picker retired (Nat 2026-07-24): the Member HD
                boards are all gone and there's only ever one helper board, so
                every board made here is a plain discussion board. Existing
                helper/HD boards keep their kind — this only stops new ones. */}

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

            {/* Icon picker — the HIVE family only. Stock emoji were the one
                thing on this screen that didn't look like us (Nat 2026-07-24:
                "always default to our original icons... very upscale and
                sleek"). Boards created before this keep whatever emoji they
                have until someone edits them. */}
            <View className="mb-4">
              <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-charcoal mb-2">Choose an Icon</Text>
              <View className="bg-white rounded-xl p-2">
                <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                  {BOARD_ICON_CHOICES.map((iconName) => {
                    const value = `${HIVE_ICON_PREFIX}${iconName}`;
                    const selected = selectedEmoji === value;
                    return (
                      <Pressable
                        key={iconName}
                        onPress={() => setSelectedEmoji(value)}
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                        accessibilityLabel={`${iconName} icon`}
                        style={{
                          width: 48,
                          height: 48,
                          alignItems: 'center',
                          justifyContent: 'center',
                          borderRadius: 12,
                          margin: 3,
                          backgroundColor: selected ? '#fdf3dc' : 'transparent',
                          borderWidth: selected ? 1.5 : 1,
                          borderColor: selected ? '#bd9348' : 'rgba(222,193,129,0.28)',
                        }}
                      >
                        <HiveIcon name={iconName} size={26} color={selected ? '#8e6f35' : '#bd9348'} />
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            </View>

            {/* Member tagging retired (Nat 2026-07-24): boards belong to the
                whole HIVE now — the parent/child board-thread-comment web was
                confusing enough without per-member ownership on top. */}

            {/* Name input */}
            <View className="mb-4">
              <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-charcoal mb-2">
                {topicKind === 'hd_board' ? 'Board Name' : 'Board Name *'}
              </Text>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder={topicKind === 'hd_board'
                  ? suggestedHdName || "e.g., Brit's HD Board"
                  : topicKind === 'helper_log'
                    ? 'HIVE Helpers'
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
