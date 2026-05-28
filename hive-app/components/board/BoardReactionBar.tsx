import { useState } from 'react';
import { View } from 'react-native';
import type { BoardReaction } from '../../types';
import {
  getReactionGroups,
  HiveReactionPickerModal,
  HiveReactionPills,
  HiveReactionTrigger,
} from '../ui/HiveReactions';

interface BoardReactionBarProps {
  reactions: BoardReaction[];
  currentUserId?: string;
  onReact: (emoji: string) => void;
  onRemoveReaction: (emoji: string) => void;
  accentColor?: string;
  compact?: boolean;
}

export function BoardReactionBar({
  reactions,
  currentUserId,
  onReact,
  onRemoveReaction,
  accentColor = '#bd9348',
  compact = false,
}: BoardReactionBarProps) {
  const [showPicker, setShowPicker] = useState(false);
  const [customEmoji, setCustomEmoji] = useState('');
  const reactionGroups = getReactionGroups(reactions || [], currentUserId);

  const handleReactionPress = (emoji: string, hasReacted: boolean) => {
    if (hasReacted) {
      onRemoveReaction(emoji);
    } else {
      onReact(emoji);
    }
  };

  const addReaction = (emoji: string) => {
    const trimmed = emoji.trim();
    if (!trimmed) return;
    onReact(trimmed);
    setCustomEmoji('');
    setShowPicker(false);
  };

  return (
    <View className="flex-row items-center flex-wrap" style={{ gap: compact ? 4 : 6 }}>
      <HiveReactionPills
        groups={reactionGroups}
        onReactionPress={handleReactionPress}
        accentColor={accentColor}
        compact={compact}
      />
      <HiveReactionTrigger
        onPress={() => setShowPicker(true)}
        accentColor={accentColor}
        compact={compact}
      />
      <HiveReactionPickerModal
        visible={showPicker}
        onClose={() => setShowPicker(false)}
        onAddReaction={addReaction}
        customEmoji={customEmoji}
        onCustomEmojiChange={setCustomEmoji}
        accentColor={accentColor}
        showHint={false}
      />
    </View>
  );
}
