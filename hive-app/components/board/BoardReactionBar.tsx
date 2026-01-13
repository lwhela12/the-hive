import { useState } from 'react';
import { View, Text, Pressable, Modal } from 'react-native';
import type { BoardReaction, Profile } from '../../types';

interface ReactionCount {
  emoji: string;
  count: number;
  hasReacted: boolean;
}

interface BoardReactionBarProps {
  reactions: BoardReaction[];
  currentUserId?: string;
  onReact: (emoji: string) => void;
  onRemoveReaction: (emoji: string) => void;
}

const AVAILABLE_REACTIONS = ['👍', '❤️', '🐝', '🎉', '🤔', '👀'];

export function BoardReactionBar({
  reactions,
  currentUserId,
  onReact,
  onRemoveReaction,
}: BoardReactionBarProps) {
  const [showPicker, setShowPicker] = useState(false);

  // Group reactions by emoji
  const reactionCounts: ReactionCount[] = [];
  const emojiMap = new Map<string, { count: number; hasReacted: boolean }>();

  reactions.forEach((r) => {
    const existing = emojiMap.get(r.emoji);
    if (existing) {
      existing.count++;
      if (r.user_id === currentUserId) existing.hasReacted = true;
    } else {
      emojiMap.set(r.emoji, {
        count: 1,
        hasReacted: r.user_id === currentUserId,
      });
    }
  });

  emojiMap.forEach((value, emoji) => {
    reactionCounts.push({ emoji, ...value });
  });

  const handleReactionPress = (emoji: string, hasReacted: boolean) => {
    if (hasReacted) {
      onRemoveReaction(emoji);
    } else {
      onReact(emoji);
    }
  };

  return (
    <View className="flex-row items-center flex-wrap gap-2">
      {reactionCounts.map(({ emoji, count, hasReacted }) => (
        <Pressable
          key={emoji}
          onPress={() => handleReactionPress(emoji, hasReacted)}
          className={`flex-row items-center px-2 py-1 rounded-full ${
            hasReacted ? 'bg-gold/20 border border-gold' : 'bg-cream'
          }`}
        >
          <Text className="text-sm">{emoji}</Text>
          <Text
            style={{ fontFamily: 'Lato_700Bold' }}
            className={`text-xs ml-1 ${hasReacted ? 'text-gold' : 'text-charcoal'}`}
          >
            {count}
          </Text>
        </Pressable>
      ))}

      <Pressable
        onPress={() => setShowPicker(true)}
        className="px-2 py-1 rounded-full bg-cream"
      >
        <Text className="text-sm">+</Text>
      </Pressable>

      <Modal visible={showPicker} transparent animationType="fade">
        <Pressable
          onPress={() => setShowPicker(false)}
          className="flex-1 justify-center items-center bg-black/50"
        >
          <View className="bg-white rounded-2xl p-4 shadow-lg">
            <View className="flex-row flex-wrap gap-3">
              {AVAILABLE_REACTIONS.map((emoji) => (
                <Pressable
                  key={emoji}
                  onPress={() => {
                    onReact(emoji);
                    setShowPicker(false);
                  }}
                  className="p-2 active:bg-cream rounded-lg"
                >
                  <Text className="text-2xl">{emoji}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}
