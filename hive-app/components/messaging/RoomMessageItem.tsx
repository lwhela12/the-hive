import { useRef, useState, memo } from 'react';
import { View, Text, Pressable, Modal, useWindowDimensions, ScrollView, TextInput } from 'react-native';
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

const QUICK_REACTIONS = ['👍', '❤️', '😂', '🐝', '🎉', '👀'];
const MORE_REACTIONS = [
  '😍', '😊', '🥰', '👏', '🙌', '🔥',
  '😢', '😭', '😮', '😱', '🤔', '🙏',
  '💛', '💚', '💙', '💜', '🧡', '🩷',
  '✨', '🌟', '💯', '🐶', '🐾', '🍯',
];

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
  const [customEmoji, setCustomEmoji] = useState('');
  const lastTapRef = useRef(0);
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

  const addReaction = (emoji: string) => {
    const trimmed = emoji.trim();
    if (!trimmed) return;
    onReact(trimmed);
    setCustomEmoji('');
    setShowActions(false);
  };

  const handleMessagePress = () => {
    if (isDeleted) return;

    const now = Date.now();
    if (now - lastTapRef.current < 280) {
      onReact('❤️');
      lastTapRef.current = 0;
      return;
    }
    lastTapRef.current = now;
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

        <Pressable
          onLongPress={handleLongPress}
          onPress={handleMessagePress}
          delayLongPress={300}
          className="flex-shrink"
          accessibilityRole="button"
          accessibilityLabel="Message. Double tap to love, long press for reactions and actions"
        >
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
          onPress={handleMessagePress}
          delayLongPress={300}
          className={(hasContent || isDeleted) ? 'mt-2' : ''}
          accessibilityRole="button"
          accessibilityLabel="Attachment. Double tap to love, long press for reactions and actions"
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
            className="ml-2 flex-row items-center rounded-full px-2.5 py-1.5"
            style={{ backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: `${reactionAccentColor}55` }}
            accessibilityRole="button"
            accessibilityLabel="Add emoji reaction"
            hitSlop={10}
          >
            <Text style={{ fontSize: 14, lineHeight: 18, color: reactionAccentColor, fontFamily: 'Lato_700Bold', marginRight: 2 }}>+</Text>
            <Text style={{ fontSize: 18, lineHeight: 22 }}>😊</Text>
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
          <Pressable
            onPress={(event) => event.stopPropagation()}
            className="bg-white rounded-2xl p-4 shadow-lg mx-8 w-80 max-h-[82%]"
          >
            <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-charcoal text-base mb-1 text-center">
              Add a reaction
            </Text>
            <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-charcoal/50 text-xs mb-3 text-center">
              Double tap a message to send ❤️, or long press for this menu.
            </Text>

            {/* Quick reactions */}
            <View className="flex-row justify-around mb-3 pb-3 border-b border-cream">
              {QUICK_REACTIONS.map((emoji) => (
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
                {MORE_REACTIONS.map((emoji) => (
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
                    onChangeText={setCustomEmoji}
                    placeholder="Paste/type any emoji"
                    placeholderTextColor="#9ca3af"
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
                    style={{ backgroundColor: customEmoji.trim() ? reactionAccentColor : '#e5e7eb' }}
                    disabled={!customEmoji.trim()}
                    accessibilityRole="button"
                    accessibilityLabel="Use custom emoji reaction"
                  >
                    <Text style={{ fontFamily: 'Lato_700Bold', color: '#FFFFFF' }}>Add</Text>
                  </Pressable>
                </View>
              </View>
            </ScrollView>

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
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
});
