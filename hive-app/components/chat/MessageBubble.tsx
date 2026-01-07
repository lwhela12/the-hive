import { View, Text } from 'react-native';
import type { ChatMessage } from '../../types';

interface MessageBubbleProps {
  message: ChatMessage;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === 'user';

  return (
    <View
      className={`max-w-[85%] mb-3 ${
        isUser ? 'self-end' : 'self-start'
      }`}
    >
      <View
        className={`px-4 py-3 rounded-2xl ${
          isUser
            ? 'bg-gold rounded-br-md'
            : 'bg-cream rounded-bl-md'
        }`}
      >
        <Text
          style={{ fontFamily: 'Lato_400Regular' }}
          className={`text-base leading-6 ${
            isUser ? 'text-white' : 'text-charcoal'
          }`}
        >
          {message.content}
        </Text>
      </View>
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
    </View>
  );
}
