import { useState } from 'react';
import { View, Text, Pressable, Modal } from 'react-native';
import type { RoomMessage, Profile, MessageReaction } from '../../types';

interface RoomMessageItemProps {
  message: RoomMessage & { sender?: Profile; reactions?: MessageReaction[] };
  currentUserId?: string;
  onReact: (emoji: string) => void;
  onRemoveReaction: (emoji: string) => void;
  onEdit?: () => void;
  onDelete?: () => void;
}

const REACTIONS = ['👍', '❤️', '😂', '🐝', '🎉', '👀'];

export function RoomMessageItem({
  message,
  currentUserId,
  onReact,
  onRemoveReaction,
  onEdit,
  onDelete,
}: RoomMessageItemProps) {
  const [showActions, setShowActions] = useState(false);
  const [showReactions, setShowReactions] = useState(false);

  const isOwnMessage = message.sender_id === currentUserId;
  const isDeleted = !!message.deleted_at;

  // Group reactions by emoji
  const reactionGroups = new Map<string, { count: number; hasReacted: boolean }>();
  message.reactions?.forEach((r) => {
    const existing = reactionGroups.get(r.emoji);
    if (existing) {
      existing.count++;
      if (r.user_id === currentUserId) existing.hasReacted = true;
    } else {
      reactionGroups.set(r.emoji, {
        count: 1,
        hasReacted: r.user_id === currentUserId,
      });
    }
  });

  const handleLongPress = () => {
    if (!isDeleted) {
      setShowActions(true);
    }
  };

  const handleReactionPress = (emoji: string, hasReacted: boolean) => {
    if (hasReacted) {
      onRemoveReaction(emoji);
    } else {
      onReact(emoji);
    }
  };

  return (
    <View className={`px-4 py-1 ${isOwnMessage ? 'items-end' : 'items-start'}`}>
      <Pressable onLongPress={handleLongPress} delayLongPress={300}>
        <View
          className={`max-w-[80%] rounded-2xl px-4 py-2 ${
            isOwnMessage
              ? 'bg-gold rounded-br-sm'
              : 'bg-white rounded-bl-sm'
          }`}
        >
          {/* Sender name for non-own messages */}
          {!isOwnMessage && message.sender && (
            <Text
              style={{ fontFamily: 'Lato_700Bold' }}
              className="text-gold text-xs mb-1"
            >
              {message.sender.name}
            </Text>
          )}

          {/* Message content */}
          <Text
            style={{ fontFamily: 'Lato_400Regular' }}
            className={`${isDeleted ? 'italic' : ''} ${
              isOwnMessage ? 'text-white' : 'text-charcoal'
            }`}
          >
            {isDeleted ? 'This message was deleted' : message.content}
          </Text>

          {/* Time and edited indicator */}
          <View className="flex-row items-center justify-end mt-1">
            {message.edited_at && !isDeleted && (
              <Text
                style={{ fontFamily: 'Lato_400Regular' }}
                className={`text-xs mr-1 ${isOwnMessage ? 'text-white/60' : 'text-charcoal/40'}`}
              >
                edited
              </Text>
            )}
            <Text
              style={{ fontFamily: 'Lato_400Regular' }}
              className={`text-xs ${isOwnMessage ? 'text-white/60' : 'text-charcoal/40'}`}
            >
              {new Date(message.created_at).toLocaleTimeString('en-US', {
                hour: 'numeric',
                minute: '2-digit',
              })}
            </Text>
          </View>
        </View>
      </Pressable>

      {/* Reactions display */}
      {reactionGroups.size > 0 && (
        <View className="flex-row flex-wrap gap-1 mt-1">
          {Array.from(reactionGroups.entries()).map(([emoji, { count, hasReacted }]) => (
            <Pressable
              key={emoji}
              onPress={() => handleReactionPress(emoji, hasReacted)}
              className={`flex-row items-center px-2 py-0.5 rounded-full ${
                hasReacted ? 'bg-gold/20' : 'bg-cream'
              }`}
            >
              <Text className="text-xs">{emoji}</Text>
              <Text
                style={{ fontFamily: 'Lato_700Bold' }}
                className={`text-xs ml-1 ${hasReacted ? 'text-gold' : 'text-charcoal'}`}
              >
                {count}
              </Text>
            </Pressable>
          ))}
        </View>
      )}

      {/* Actions modal */}
      <Modal visible={showActions} transparent animationType="fade">
        <Pressable
          onPress={() => setShowActions(false)}
          className="flex-1 justify-center items-center bg-black/50"
        >
          <View className="bg-white rounded-2xl p-4 shadow-lg mx-8 w-64">
            {/* Quick reactions */}
            <View className="flex-row justify-around mb-4 pb-4 border-b border-cream">
              {REACTIONS.slice(0, 6).map((emoji) => (
                <Pressable
                  key={emoji}
                  onPress={() => {
                    onReact(emoji);
                    setShowActions(false);
                  }}
                  className="p-2"
                >
                  <Text className="text-xl">{emoji}</Text>
                </Pressable>
              ))}
            </View>

            {/* Actions */}
            {isOwnMessage && !isDeleted && (
              <>
                <Pressable
                  onPress={() => {
                    setShowActions(false);
                    onEdit?.();
                  }}
                  className="py-3"
                >
                  <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-charcoal">
                    Edit message
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    setShowActions(false);
                    onDelete?.();
                  }}
                  className="py-3"
                >
                  <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-red-500">
                    Delete message
                  </Text>
                </Pressable>
              </>
            )}

            <Pressable
              onPress={() => setShowActions(false)}
              className="py-3"
            >
              <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-charcoal/50 text-center">
                Cancel
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}
