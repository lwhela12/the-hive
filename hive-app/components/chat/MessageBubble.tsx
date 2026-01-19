import { memo } from 'react';
import { View, Text, Dimensions } from 'react-native';
import { AttachmentGallery } from '../ui/AttachmentGallery';
import { MarkdownContent } from './MarkdownContent';
import { LinkifiedText } from '../ui/LinkifiedText';
import type { ChatMessage } from '../../types';

const SCREEN_WIDTH = Dimensions.get('window').width;
// Constrain image width for chat - max 250px or 60% of screen, whichever is smaller
const MAX_IMAGE_WIDTH = Math.min(250, SCREEN_WIDTH * 0.6);

interface MessageBubbleProps {
  message: ChatMessage;
  isStreaming?: boolean;
}

export const MessageBubble = memo(function MessageBubble({
  message,
  isStreaming = false,
}: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const hasAttachments = message.attachments && message.attachments.length > 0;
  const hasContent = message.content && message.content.trim().length > 0;

  return (
    <View
      className={`max-w-[85%] mb-3 ${
        isUser ? 'self-end items-end' : 'self-start items-start'
      }`}
    >
      {/* Text bubble - only show if there's content */}
      {hasContent && (
        <View
          className={`px-4 py-3 rounded-2xl ${
            isUser
              ? 'bg-gold rounded-br-md'
              : 'bg-cream rounded-bl-md'
          }`}
        >
          {isUser ? (
            // User messages: plain text with clickable links
            <LinkifiedText
              style={{ fontFamily: 'Lato_400Regular', fontSize: 16, lineHeight: 24, color: '#FFFFFF' }}
              linkStyle={{ color: '#f6f4e5' }}
            >
              {message.content}
            </LinkifiedText>
          ) : (
            // Assistant messages: render with Markdown
            <View className="flex-1 flex-shrink">
              <MarkdownContent content={message.content} isUser={false} />
              {isStreaming && (
                <Text className="text-gold text-lg">|</Text>
              )}
            </View>
          )}
        </View>
      )}

      {/* Attachments - floating outside bubble */}
      {hasAttachments && (
        <View className={hasContent ? 'mt-2' : ''}>
          <AttachmentGallery
            attachments={message.attachments!}
            maxWidth={MAX_IMAGE_WIDTH}
          />
        </View>
      )}

      {/* Timestamp - hide during streaming */}
      {!isStreaming && (
        <Text
          style={{ fontFamily: 'Lato_400Regular' }}
          className={`text-xs text-charcoal/40 mt-1 ${
            isUser ? 'text-right' : 'text-left'
          }`}
        >
          {new Date(message.created_at).toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
          })}
        </Text>
      )}
    </View>
  );
});
