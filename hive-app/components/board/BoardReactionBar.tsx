import { useState } from 'react';
import { View } from 'react-native';
import type { BoardReaction } from '../../types';
import { usePageSkin } from '../../lib/pageSkin';
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
  accentColor,
  compact = false,
}: BoardReactionBarProps) {
  // The gold goes muddy on the black page, so the accent comes from the skin
  // rather than a constant. A caller can still name its own.
  const skin = usePageSkin();
  const accent = accentColor ?? skin.gold;
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
        accentColor={accent}
        compact={compact}
      />
      <HiveReactionTrigger
        onPress={() => setShowPicker(true)}
        accentColor={accent}
        compact={compact}
      />
      <HiveReactionPickerModal
        visible={showPicker}
        onClose={() => setShowPicker(false)}
        onAddReaction={addReaction}
        customEmoji={customEmoji}
        onCustomEmojiChange={setCustomEmoji}
        accentColor={accent}
        showHint={false}
      />
    </View>
  );
}
