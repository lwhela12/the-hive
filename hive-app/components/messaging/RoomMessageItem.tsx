import { useRef, useState, memo } from 'react';
import { View, Text, Pressable, useWindowDimensions } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Avatar } from '../ui/Avatar';
import { AttachmentGallery } from '../ui/AttachmentGallery';
import { MemberProfileLink } from '../ui/MemberProfileLink';
import { LinkifiedText } from '../ui/LinkifiedText';
import {
  getReactionGroups,
  HiveReactionPickerModal,
  HiveReactionPills,
  HiveReactionTrigger,
} from '../ui/HiveReactions';
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

  const reactionGroups = getReactionGroups(message.reactions || [], currentUserId);

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
    if (now - lastTapRef.current < 500) {
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
    <View
      className={`max-w-[85%] mb-4 ${isOwnMessage ? 'self-end items-end' : 'self-start items-start'}`}
      style={{ position: 'relative', paddingTop: reactionGroups.length > 0 ? 10 : 0 }}
    >
      <View className={`flex-row items-end ${isOwnMessage ? 'flex-row-reverse' : ''}`}>
        {/* Avatar */}
        {message.sender && (
          <MemberProfileLink
            memberId={message.sender.id}
            memberName={message.sender.name}
            hitSlop={8}
            className={`active:opacity-70 ${isOwnMessage ? 'ml-2' : 'mr-2'}`}
          >
            <Avatar
              name={message.sender.name}
              url={message.sender.avatar_url}
              size={28}
            />
          </MemberProfileLink>
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
          <View className="ml-2">
            <HiveReactionTrigger
              onPress={() => setShowActions(true)}
              accentColor={reactionAccentColor}
            />
          </View>
        )}
      </View>

      {/* Reactions display - iMessage-style overlay on the upper-right corner */}
      {reactionGroups.length > 0 && (
        <View
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            zIndex: 5,
            maxWidth: maxImageWidth,
          }}
        >
          <HiveReactionPills
            groups={reactionGroups}
            onReactionPress={handleReactionPress}
            accentColor={reactionAccentColor}
          />
        </View>
      )}

      {/* Actions modal (iMessage style) */}
      <HiveReactionPickerModal
        visible={showActions}
        onClose={() => setShowActions(false)}
        onAddReaction={addReaction}
        customEmoji={customEmoji}
        onCustomEmojiChange={setCustomEmoji}
        accentColor={reactionAccentColor}
        actions={(
          <>
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
          </>
        )}
      />
    </View>
  );
});
