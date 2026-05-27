import { useState, memo } from 'react';
import { View, Text, Pressable, Modal, useWindowDimensions } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import { Avatar } from '../ui/Avatar';
import { AttachmentGallery } from '../ui/AttachmentGallery';
import { LinkifiedText } from '../ui/LinkifiedText';
import type { RoomMessage, Profile, MessageReaction } from '../../types';

interface RoomMessageItemProps {
  message: RoomMessage & { sender?: Profile; reactions?: MessageReaction[] };
  currentUserId?: string;
  onReact: (emoji: string) => void;
  onRemoveReaction: (emoji: string) => void;
  onEdit?: () => void;
  onDelete?: () => void;
  ownBubbleColor?: string;
  ownBubbleTextColor?: string;
  reactionAccentColor?: string;
}

const REACTIONS = ['👍', '❤️', '😂', '🐝', '🎉', '👀'];

export const RoomMessageItem = memo(function RoomMessageItem({
  message,
  currentUserId,
  onReact,
  onRemoveReaction,
  onEdit,
  onDelete,
  ownBubbleColor = '#bd9348',
  ownBubbleTextColor = '#FFFFFF',
  reactionAccentColor = '#bd9348',
}: RoomMessageItemProps) {
  const [showActions, setShowActions] = useState(false);
  const { width: screenWidth } = useWindowDimensions();
  // Constrain image width for chat - max 250px or 60% of screen, whichever is smaller
  const maxImageWidth = Math.min(250, screenWidth * 0.6);

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

  const handleCopy = async () => {
    if (message.content) {
      await Clipboard.setStringAsync(message.content);
    }
    setShowActions(false);
  };

  const renderAttachments = () => {
    if (!hasAttachments || !message.attachments) return null;

    return (
      <View>
        <AttachmentGallery attachments={message.attachments} maxWidth={maxImageWidth} />
      </View>
    );
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
              className={`px-4 py-3 rounded-2xl ${isOwnMessage ? 'rounded-br-md' : 'rounded-bl-md'}`}
              style={{ backgroundColor: isOwnMessage ? ownBubbleColor : '#FFFFFF' }}
            >
              {/* Message content */}
              {(!isDeleted && hasContent) && (
                <LinkifiedText
                  style={{
                    fontFamily: 'Lato_400Regular',
                    fontSize: 16,
                    lineHeight: 24,
                    color: isOwnMessage ? ownBubbleTextColor : '#313130',
                  }}
                  linkStyle={{ color: isOwnMessage ? 'rgba(255,255,255,0.86)' : reactionAccentColor }}
                >
                  {message.content}
                </LinkifiedText>
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
        <Pressable
          onLongPress={handleLongPress}
          delayLongPress={300}
          className={(hasContent || isDeleted) ? 'mt-2' : ''}
          accessibilityRole="button"
          accessibilityLabel="Open message actions"
        >
          {renderAttachments()}
        </Pressable>
      )}

      {/* Time, edited indicator, and quick reaction affordance - outside bubble */}
      <View className={`flex-row items-center mt-1 ${isOwnMessage ? 'justify-end' : 'justify-start'}`}>
        <Text
          style={{ fontFamily: 'Lato_400Regular' }}
          className={`text-xs text-charcoal/40 ${isOwnMessage ? 'text-right' : 'text-left'}`}
        >
          {message.edited_at && !isDeleted && 'edited · '}
          {new Date(message.created_at).toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
          })}
        </Text>
        {!isDeleted && (
          <Pressable
            onPress={() => setShowActions(true)}
            className="ml-2 px-2 py-0.5 rounded-full"
            style={{ backgroundColor: '#FFFFFF' }}
            accessibilityRole="button"
            accessibilityLabel="React to message"
          >
            <Text style={{ fontSize: 12, color: reactionAccentColor }}>☺︎</Text>
          </Pressable>
        )}
      </View>

      {/* Reactions display */}
      {reactionGroups.size > 0 && (
        <View className={`flex-row flex-wrap gap-1 mt-1 ${isOwnMessage ? 'justify-end' : 'justify-start'}`}>
          {Array.from(reactionGroups.entries()).map(([emoji, { count, hasReacted }]) => (
            <Pressable
              key={emoji}
              onPress={() => handleReactionPress(emoji, hasReacted)}
              className="flex-row items-center px-2 py-0.5 rounded-full"
              style={{ backgroundColor: hasReacted ? `${reactionAccentColor}22` : '#FFFFFF' }}
            >
              <Text className="text-xs">{emoji}</Text>
              <Text
                className="text-xs ml-1"
                style={{ fontFamily: 'Lato_700Bold', color: hasReacted ? reactionAccentColor : '#313130' }}
              >
                {count}
              </Text>
            </Pressable>
          ))}
        </View>
      )}

      {/* Actions modal (iMessage style) */}
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
            {hasContent && !isDeleted && (
              <Pressable onPress={handleCopy} className="py-3">
                <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-charcoal">
                  Copy
                </Text>
              </Pressable>
            )}

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
                    Edit
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
                    Delete
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
