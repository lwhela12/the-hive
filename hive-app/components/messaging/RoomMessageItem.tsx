import { useState, memo } from 'react';
import { View, Text, Pressable, Modal, Dimensions, Image } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import { Avatar } from '../ui/Avatar';
import { LinkifiedText } from '../ui/LinkifiedText';
import type { RoomMessage, Profile, MessageReaction, Attachment } from '../../types';

const SCREEN_WIDTH = Dimensions.get('window').width;
const SCREEN_HEIGHT = Dimensions.get('window').height;
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
  const [fullscreenImageIndex, setFullscreenImageIndex] = useState<number | null>(null);

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

  // Render attachment - tap for fullscreen, long-press for actions
  const renderAttachment = (attachment: Attachment, index: number, width: number, height: number) => {
    return (
      <Pressable
        key={attachment.id}
        onPress={() => setFullscreenImageIndex(index)}
        onLongPress={handleLongPress}
        delayLongPress={300}
        style={{ width, height }}
        className="overflow-hidden rounded-lg bg-gray-200"
      >
        <Image
          source={{ uri: attachment.url }}
          style={{ width, height }}
          className="rounded-lg"
          resizeMode="cover"
        />
      </Pressable>
    );
  };

  // Render attachment grid
  const renderAttachments = () => {
    if (!hasAttachments || !message.attachments) return null;

    const attachments = message.attachments;
    const count = attachments.length;
    const gap = 4;
    const maxWidth = MAX_IMAGE_WIDTH;

    if (count === 1) {
      const itemWidth = maxWidth;
      const itemHeight = maxWidth * 0.75;
      return renderAttachment(attachments[0], 0, itemWidth, itemHeight);
    }

    if (count === 2) {
      const itemWidth = (maxWidth - gap) / 2;
      const itemHeight = itemWidth;
      return (
        <View style={{ width: maxWidth, flexDirection: 'row', gap }}>
          {renderAttachment(attachments[0], 0, itemWidth, itemHeight)}
          {renderAttachment(attachments[1], 1, itemWidth, itemHeight)}
        </View>
      );
    }

    if (count === 3) {
      const itemWidth = (maxWidth - gap) / 2;
      const itemHeight = itemWidth;
      return (
        <View style={{ width: maxWidth, gap }}>
          {renderAttachment(attachments[0], 0, maxWidth, maxWidth * 0.5)}
          <View style={{ flexDirection: 'row', gap }}>
            {renderAttachment(attachments[1], 1, itemWidth, itemHeight)}
            {renderAttachment(attachments[2], 2, itemWidth, itemHeight)}
          </View>
        </View>
      );
    }

    if (count === 4) {
      const itemWidth = (maxWidth - gap) / 2;
      const itemHeight = itemWidth;
      return (
        <View style={{ width: maxWidth, flexDirection: 'row', flexWrap: 'wrap', gap }}>
          {attachments.map((attachment, index) =>
            renderAttachment(attachment, index, itemWidth, itemHeight)
          )}
        </View>
      );
    }

    // 5 images
    const topWidth = (maxWidth - gap) / 2;
    const bottomWidth = (maxWidth - gap * 2) / 3;
    return (
      <View style={{ width: maxWidth, gap }}>
        <View style={{ flexDirection: 'row', gap }}>
          {renderAttachment(attachments[0], 0, topWidth, topWidth * 0.75)}
          {renderAttachment(attachments[1], 1, topWidth, topWidth * 0.75)}
        </View>
        <View style={{ flexDirection: 'row', gap }}>
          {renderAttachment(attachments[2], 2, bottomWidth, bottomWidth)}
          {renderAttachment(attachments[3], 3, bottomWidth, bottomWidth)}
          {renderAttachment(attachments[4], 4, bottomWidth, bottomWidth)}
        </View>
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
              className={`px-4 py-3 rounded-2xl ${
                isOwnMessage
                  ? 'bg-gold rounded-br-md'
                  : 'bg-white rounded-bl-md'
              }`}
            >
              {/* Message content */}
              {(!isDeleted && hasContent) && (
                <LinkifiedText
                  style={{
                    fontFamily: 'Lato_400Regular',
                    fontSize: 16,
                    lineHeight: 24,
                    color: isOwnMessage ? '#FFFFFF' : '#313130',
                  }}
                  linkStyle={{ color: isOwnMessage ? '#f6f4e5' : '#bd9348' }}
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
        <View className={(hasContent || isDeleted) ? 'mt-2' : ''}>
          {renderAttachments()}
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

      {/* Fullscreen image modal */}
      {hasAttachments && message.attachments && (
        <Modal
          visible={fullscreenImageIndex !== null}
          transparent
          animationType="fade"
          onRequestClose={() => setFullscreenImageIndex(null)}
        >
          <View className="flex-1 bg-black">
            {/* Close button */}
            <Pressable
              onPress={() => setFullscreenImageIndex(null)}
              className="absolute top-12 right-4 z-10 p-2 bg-black/50 rounded-full"
            >
              <Ionicons name="close" size={28} color="white" />
            </Pressable>

            {/* Image */}
            {fullscreenImageIndex !== null && (
              <View className="flex-1 items-center justify-center">
                <Image
                  source={{ uri: message.attachments[fullscreenImageIndex].url }}
                  style={{
                    width: SCREEN_WIDTH,
                    height: SCREEN_HEIGHT * 0.8,
                  }}
                  resizeMode="contain"
                />
              </View>
            )}

            {/* Navigation dots */}
            {message.attachments.length > 1 && (
              <View className="absolute bottom-12 left-0 right-0 flex-row justify-center gap-2">
                {message.attachments.map((_, index) => (
                  <Pressable
                    key={index}
                    onPress={() => setFullscreenImageIndex(index)}
                    className={`w-2 h-2 rounded-full ${
                      index === fullscreenImageIndex ? 'bg-white' : 'bg-white/50'
                    }`}
                  />
                ))}
              </View>
            )}
          </View>
        </Modal>
      )}
    </View>
  );
});
