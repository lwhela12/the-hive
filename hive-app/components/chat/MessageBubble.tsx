import { memo, useState, useCallback } from 'react';
import { View, Text, Pressable, useWindowDimensions } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import { AttachmentGallery } from '../ui/AttachmentGallery';
import { MarkdownContent } from './MarkdownContent';
import { LinkifiedText } from '../ui/LinkifiedText';
import type { ChatMessage } from '../../types';

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
  const [copied, setCopied] = useState(false);
  const { width } = useWindowDimensions();
  const maxImageWidth = Math.min(250, width * 0.6);

  const handleCopy = useCallback(async () => {
    if (!message.content) return;
    await Clipboard.setStringAsync(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }, [message.content]);

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
            <LinkifiedText
              style={{ fontFamily: 'Lato_400Regular', fontSize: 16, lineHeight: 24, color: '#FFFFFF' }}
              linkStyle={{ color: '#f6f4e5' }}
            >
              {message.content}
            </LinkifiedText>
          ) : (
            <View className="flex-shrink">
              <MarkdownContent content={message.content} isUser={false} />
              {isStreaming && (
                <Text className="text-gold text-lg">|</Text>
              )}
            </View>
          )}
        </View>
      )}

      {/* Attachments */}
      {hasAttachments && (
        <View className={hasContent ? 'mt-2' : ''}>
          <AttachmentGallery
            attachments={message.attachments!}
            maxWidth={maxImageWidth}
          />
        </View>
      )}

      {/* Timestamp + copy button row */}
      {!isStreaming && (
        <View
          style={{
            flexDirection: isUser ? 'row-reverse' : 'row',
            alignItems: 'center',
            gap: 6,
            marginTop: 4,
          }}
        >
          <Text
            style={{ fontFamily: 'Lato_400Regular' }}
            className={`text-xs text-charcoal/40 ${isUser ? 'text-right' : 'text-left'}`}
          >
            {new Date(message.created_at).toLocaleTimeString('en-US', {
              hour: 'numeric',
              minute: '2-digit',
            })}
          </Text>

          {hasContent && (
            <Pressable
              onPress={handleCopy}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={copied ? 'Message copied' : 'Copy full message'}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 3,
                minHeight: 24,
                paddingHorizontal: 4,
                opacity: copied ? 1 : 0.58,
              }}
            >
              <Ionicons
                name={copied ? 'checkmark' : 'copy-outline'}
                size={14}
                color={copied ? '#bd9348' : '#2d2d2d'}
              />
              <Text
                style={{ fontFamily: 'Lato_700Bold', fontSize: 11, color: copied ? '#bd9348' : '#2d2d2d' }}
              >
                {copied ? 'Copied' : 'Copy'}
              </Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
});
