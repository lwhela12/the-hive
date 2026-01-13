import { memo, useState } from 'react';
import { View, Text, Pressable, Alert, Platform } from 'react-native';
import { formatDateShort } from '../../lib/dateUtils';
import type { Conversation } from '../../types';

interface ConversationItemProps {
  conversation: Conversation;
  isActive: boolean;
  onSelect: (id: string) => void;
  onDelete?: (id: string) => void;
}

export const ConversationItem = memo(function ConversationItem({
  conversation,
  isActive,
  onSelect,
  onDelete,
}: ConversationItemProps) {
  const [showDelete, setShowDelete] = useState(false);
  const displayTitle = conversation.title || 'New conversation';
  const date = new Date(conversation.updated_at);
  const now = new Date();

  // Format relative time
  const getRelativeTime = () => {
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;

    return formatDateShort(date);
  };

  const handleDelete = () => {
    if (Platform.OS === 'web') {
      if (window.confirm('Delete this conversation? This cannot be undone.')) {
        onDelete?.(conversation.id);
      }
    } else {
      Alert.alert(
        'Delete Conversation',
        'This cannot be undone.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete', style: 'destructive', onPress: () => onDelete?.(conversation.id) },
        ]
      );
    }
  };

  const isWeb = Platform.OS === 'web';

  return (
    <Pressable
      onPress={() => onSelect(conversation.id)}
      onLongPress={() => setShowDelete(true)}
      onHoverIn={isWeb ? () => setShowDelete(true) : undefined}
      onHoverOut={isWeb ? () => setShowDelete(false) : undefined}
      className={`px-4 py-3 border-b border-gray-100 ${
        isActive ? 'bg-gold/10' : 'bg-white active:bg-gray-50'
      }`}
    >
      <View className="flex-row items-center justify-between">
        <Text
          numberOfLines={1}
          style={{ fontFamily: 'Lato_400Regular' }}
          className={`flex-1 text-base ${
            isActive ? 'text-gold font-semibold' : 'text-charcoal'
          }`}
        >
          {displayTitle}
        </Text>
        {conversation.mode === 'onboarding' && (
          <View className="bg-gold/20 px-2 py-0.5 rounded ml-2">
            <Text
              style={{ fontFamily: 'Lato_400Regular' }}
              className="text-xs text-gold"
            >
              Onboarding
            </Text>
          </View>
        )}
        {showDelete && onDelete && (
          <Pressable
            onPress={(e) => {
              e.stopPropagation?.();
              handleDelete();
            }}
            className="ml-2 p-1 rounded hover:bg-red-50 active:bg-red-100"
          >
            <Text className="text-red-500 text-sm">✕</Text>
          </Pressable>
        )}
      </View>
      <Text
        style={{ fontFamily: 'Lato_400Regular' }}
        className="text-xs text-gray-400 mt-1"
      >
        {getRelativeTime()}
      </Text>
    </Pressable>
  );
});
