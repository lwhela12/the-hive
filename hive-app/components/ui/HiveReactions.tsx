import { ReactNode } from 'react';
import { View, Text, Pressable, Modal, ScrollView, TextInput } from 'react-native';
import { Avatar } from './Avatar';
import { MemberProfileLink } from './MemberProfileLink';
import type { ReactionUserProfile } from '../../types';

export interface ReactionLike {
  emoji: string;
  user_id?: string | null;
  user?: ReactionUserProfile | null;
}

export interface ReactionGroup {
  emoji: string;
  count: number;
  hasReacted: boolean;
  reactors: ReactionUserProfile[];
}

export const HIVE_QUICK_REACTIONS = ['👍', '❤️', '😂', '🐝', '🎉', '👀'];
export const HIVE_MORE_REACTIONS = [
  '😍', '😊', '🥰', '👏', '🙌', '🔥',
  '😢', '😭', '😮', '😱', '🤔', '🙏',
  '💛', '💚', '💙', '💜', '🧡', '🩷',
  '✨', '🌟', '💯', '🐶', '🐾', '🍯',
];

export function getReactionGroups(
  reactions: ReactionLike[] = [],
  currentUserId?: string
): ReactionGroup[] {
  const groups = new Map<string, { count: number; hasReacted: boolean; reactors: ReactionUserProfile[] }>();

  reactions.forEach((reaction) => {
    const existing = groups.get(reaction.emoji);
    const reactor = reaction.user?.id && reaction.user?.name ? reaction.user : null;

    if (existing) {
      existing.count += 1;
      if (reaction.user_id === currentUserId) existing.hasReacted = true;
      if (reactor && !existing.reactors.some((user) => user.id === reactor.id)) {
        existing.reactors.push(reactor);
      }
    } else {
      groups.set(reaction.emoji, {
        count: 1,
        hasReacted: reaction.user_id === currentUserId,
        reactors: reactor ? [reactor] : [],
      });
    }
  });

  return Array.from(groups.entries()).map(([emoji, value]) => ({ emoji, ...value }));
}

interface ReactionPillsProps {
  groups: ReactionGroup[];
  onReactionPress?: (emoji: string, hasReacted: boolean) => void;
  accentColor?: string;
  compact?: boolean;
}

export function HiveReactionPills({
  groups,
  onReactionPress,
  accentColor = '#bd9348',
  compact = false,
}: ReactionPillsProps) {
  if (groups.length === 0) return null;

  return (
    <View className="flex-row flex-wrap" style={{ gap: compact ? 4 : 6 }}>
      {groups.map(({ emoji, count, hasReacted, reactors }) => {
        const visibleReactors = reactors.slice(0, 3);
        const avatarSize = compact ? 14 : 18;
        const pillStyle = {
          paddingHorizontal: compact ? 7 : 8,
          paddingVertical: compact ? 3 : 4,
          backgroundColor: hasReacted ? '#fff8ed' : '#FFFFFF',
          borderWidth: 1,
          borderColor: hasReacted ? accentColor : '#f0e2c8',
        };
        const content = (
          <>
            <Text style={{ fontSize: compact ? 12 : 14, lineHeight: compact ? 16 : 18 }}>{emoji}</Text>
            {visibleReactors.length > 0 && (
              <View className="flex-row items-center ml-1">
                {visibleReactors.map((reactor, index) => (
                  <MemberProfileLink
                    key={reactor.id}
                    memberId={reactor.id}
                    memberName={reactor.name}
                    stopPropagation
                    hitSlop={4}
                    style={{
                      marginLeft: index === 0 ? 0 : -5,
                      borderRadius: avatarSize / 2,
                      borderWidth: 1,
                      borderColor: '#FFFFFF',
                      overflow: 'hidden',
                      zIndex: visibleReactors.length - index,
                    }}
                  >
                    <Avatar name={reactor.name} url={reactor.avatar_url} size={avatarSize} />
                  </MemberProfileLink>
                ))}
              </View>
            )}
            <Text
              className="ml-1"
              style={{
                fontFamily: 'Lato_700Bold',
                fontSize: compact ? 11 : 12,
                color: hasReacted ? accentColor : '#313130',
              }}
            >
              {count}
            </Text>
          </>
        );

        if (!onReactionPress) {
          return (
            <View
              key={emoji}
              className="flex-row items-center rounded-full shadow-sm"
              style={pillStyle}
              accessibilityLabel={`${count} ${emoji} reaction${count === 1 ? '' : 's'}`}
            >
              {content}
            </View>
          );
        }

        return (
          <Pressable
            key={emoji}
            onPress={() => onReactionPress(emoji, hasReacted)}
            className="flex-row items-center rounded-full shadow-sm"
            style={pillStyle}
            accessibilityRole="button"
            accessibilityLabel={`${count} ${emoji} reaction${count === 1 ? '' : 's'}`}
          >
            {content}
          </Pressable>
        );
      })}
    </View>
  );
}

interface ReactionTriggerProps {
  onPress: () => void;
  accentColor?: string;
  compact?: boolean;
  label?: string;
}

export function HiveReactionTrigger({
  onPress,
  accentColor = '#bd9348',
  compact = false,
  label = 'Add emoji reaction',
}: ReactionTriggerProps) {
  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center rounded-full"
      style={{
        paddingHorizontal: compact ? 8 : 10,
        paddingVertical: compact ? 4 : 6,
        backgroundColor: '#FFFFFF',
        borderWidth: 1,
        borderColor: `${accentColor}55`,
      }}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={10}
    >
      <Text style={{ fontSize: 14, lineHeight: 18, color: accentColor, fontFamily: 'Lato_700Bold', marginRight: 2 }}>+</Text>
      <Text style={{ fontSize: compact ? 16 : 18, lineHeight: compact ? 20 : 22 }}>😊</Text>
    </Pressable>
  );
}

interface ReactionPickerModalProps {
  visible: boolean;
  onClose: () => void;
  onAddReaction: (emoji: string) => void;
  customEmoji: string;
  onCustomEmojiChange: (emoji: string) => void;
  accentColor?: string;
  showHint?: boolean;
  actions?: ReactNode;
}

export function HiveReactionPickerModal({
  visible,
  onClose,
  onAddReaction,
  customEmoji,
  onCustomEmojiChange,
  accentColor = '#bd9348',
  showHint = true,
  actions,
}: ReactionPickerModalProps) {
  const addReaction = (emoji: string) => {
    const trimmed = emoji.trim();
    if (!trimmed) return;
    onAddReaction(trimmed);
  };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <Pressable onPress={onClose} className="flex-1 justify-center items-center bg-black/50">
        <Pressable
          onPress={(event) => event.stopPropagation()}
          className="bg-white rounded-2xl p-4 shadow-lg mx-8 w-80 max-h-[82%]"
        >
          <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-charcoal text-base mb-1 text-center">
            Add a reaction
          </Text>
          {showHint && (
            <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-charcoal/50 text-xs mb-3 text-center">
              Double tap to send ❤️, or long press/open this menu for more.
            </Text>
          )}

          <View className="flex-row justify-around mb-3 pb-3 border-b border-cream">
            {HIVE_QUICK_REACTIONS.map((emoji) => (
              <Pressable
                key={emoji}
                onPress={() => addReaction(emoji)}
                className="w-10 h-10 rounded-full items-center justify-center"
                style={{ backgroundColor: '#f8f1e3' }}
                accessibilityRole="button"
                accessibilityLabel={`React with ${emoji}`}
              >
                <Text className="text-2xl">{emoji}</Text>
              </Pressable>
            ))}
          </View>

          <ScrollView style={{ maxHeight: 190 }} showsVerticalScrollIndicator={false}>
            <View className="flex-row flex-wrap justify-center mb-3">
              {HIVE_MORE_REACTIONS.map((emoji) => (
                <Pressable
                  key={emoji}
                  onPress={() => addReaction(emoji)}
                  className="w-10 h-10 rounded-full items-center justify-center m-1"
                  style={{ backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#f0e2c8' }}
                  accessibilityRole="button"
                  accessibilityLabel={`React with ${emoji}`}
                >
                  <Text className="text-2xl">{emoji}</Text>
                </Pressable>
              ))}
            </View>

            <View className="mb-3 p-3 rounded-2xl" style={{ backgroundColor: '#fff8ed' }}>
              <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-charcoal text-xs mb-2">
                Want another emoji?
              </Text>
              <View className="flex-row items-center">
                <TextInput
                  value={customEmoji}
                  onChangeText={onCustomEmojiChange}
                  placeholder="Paste/type any emoji"
                  placeholderTextColor="#a09274"
                  className="flex-1 bg-white rounded-xl px-3 py-2 text-base"
                  autoCapitalize="none"
                  autoCorrect={false}
                  maxLength={8}
                  returnKeyType="done"
                  onSubmitEditing={() => addReaction(customEmoji)}
                  style={{ fontFamily: 'Lato_400Regular' }}
                />
                <Pressable
                  onPress={() => addReaction(customEmoji)}
                  className="ml-2 px-3 py-2 rounded-xl"
                  style={{ backgroundColor: customEmoji.trim() ? accentColor : '#e5e7eb' }}
                  disabled={!customEmoji.trim()}
                  accessibilityRole="button"
                  accessibilityLabel="Use custom emoji reaction"
                >
                  <Text style={{ fontFamily: 'Lato_700Bold', color: '#FFFFFF' }}>Add</Text>
                </Pressable>
              </View>
            </View>
          </ScrollView>

          {actions}

          <Pressable onPress={onClose} className="py-3">
            <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-charcoal/50 text-center">
              Cancel
            </Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
