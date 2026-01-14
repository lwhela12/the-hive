import { useState, memo } from 'react';
import { View, Text, Pressable, Modal, Dimensions } from 'react-native';
import { Avatar } from '../ui/Avatar';
import { AttachmentGallery } from '../ui/AttachmentGallery';
import type { RoomMessage, Profile, MessageReaction } from '../../types';

const SCREEN_WIDTH = Dimensions.get('window').width;
// Constrain image width for chat - max 250px or 60% of screen, whichever is smaller
const MAX_IMAGE_WIDTH = Math.min(250, SCREEN_WIDTH * 0.6);

interface RoomMessageItemProps {
  message: RoomMessage & { sender?: Profile; reactions?: MessageReaction[] };
  currentUserId?: string;
  onReact: (emoji: string) => void;
  onRemoveReaction: (emoji: string) => void;
  onEdit?: () => void;
  onDelete?: () => void;
}

const REACTIONS = ['👍', '❤️', '😂', '🐝', '🎉', '👀'];

export const RoomMessageItem = memo(function RoomMessageItem({
  message,
  currentUserId,
  onReact,
  onRemoveReaction,
  onEdit,
  onDelete,
}: RoomMessageItemProps) {
  const [showActions, setShowActions] = useState(false);

  const isOwnMessage = message.sender_id === currentUserId;
  const isDeleted = !!message.deleted_at;
  const hasContent = message.content && message.content.trim().length > 0;
  const hasAttachments = !isDeleted && message.attachments && message.attachments.length > 0;

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
    <View className={`max-w-[85%] mb-3 ${isOwnMessage ? 'self-end items-end' : 'self-start items-start'}`}>
      <View className={`flex-row items-end ${isOwnMessage ? 'flex-row-reverse' : ''}`}>
        {/* Avatar */}
        {message.sender && (
          <View className={isOwnMessage ? 'ml-2' : 'mr-2'}>
            <Avatar
              name={message.sender.name}
              url={message.sender.avatar_url}
              size={28}
            />
          </View>
        )}

        <Pressable onLongPress={handleLongPress} delayLongPress={300} className="flex-shrink">
          {/* Text bubble - only show if there's content or deleted */}
          {(hasContent || isDeleted) && (
            <View
              className={`px-4 py-3 rounded-2xl ${
                isOwnMessage
                  ? 'bg-gold rounded-br-md'
                  : 'bg-white rounded-bl-md'
              }`}
            >
              {/* Message content */}
              {(!isDeleted && hasContent) && (
                <Text
                  style={{ fontFamily: 'Lato_400Regular' }}
                  className={`text-base leading-6 ${isOwnMessage ? 'text-white' : 'text-charcoal'}`}
                >
                  {message.content}
                </Text>
              )}
              {isDeleted && (
                <Text
                  style={{ fontFamily: 'Lato_400Regular' }}
                  className={`text-base leading-6 italic ${isOwnMessage ? 'text-white/70' : 'text-charcoal/70'}`}
                >
                  This message was deleted
                </Text>
              )}
            </View>
          )}
        </Pressable>
      </View>

      {/* Attachments - floating outside bubble */}
      {hasAttachments && (
        <View className={(hasContent || isDeleted) ? 'mt-2' : ''}>
          <AttachmentGallery
            attachments={message.attachments!}
            maxWidth={MAX_IMAGE_WIDTH}
          />
        </View>
      )}

      {/* Time and edited indicator - outside bubble */}
      <Text
        style={{ fontFamily: 'Lato_400Regular' }}
        className={`text-xs text-charcoal/40 mt-1 ${isOwnMessage ? 'text-right' : 'text-left'}`}
      >
        {message.edited_at && !isDeleted && 'edited · '}
        {new Date(message.created_at).toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
        })}
      </Text>

      {/* Reactions display */}
      {reactionGroups.size > 0 && (
        <View className={`flex-row flex-wrap gap-1 mt-1 ${isOwnMessage ? 'justify-end' : 'justify-start'}`}>
          {Array.from(reactionGroups.entries()).map(([emoji, { count, hasReacted }]) => (
            <Pressable
              key={emoji}
              onPress={() => handleReactionPress(emoji, hasReacted)}
              className={`flex-row items-center px-2 py-0.5 rounded-full ${
                hasReacted ? 'bg-gold/20' : 'bg-white'
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
});
