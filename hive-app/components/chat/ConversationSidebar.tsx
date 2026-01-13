import { useMemo, memo } from 'react';
import { View, Text, Pressable, ScrollView, Platform } from 'react-native';
import { ConversationItem } from './ConversationItem';
import type { Conversation } from '../../types';

interface ConversationSidebarProps {
  conversations: Conversation[];
  currentConversationId: string | null;
  onSelectConversation: (id: string) => void;
  onNewConversation: () => void;
  onDelete?: (id: string) => void;
  isOpen?: boolean;
  onClose?: () => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

// Group conversations by date
function groupByDate(conversations: Conversation[]) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const lastWeek = new Date(today);
  lastWeek.setDate(lastWeek.getDate() - 7);

  const groups: { [key: string]: Conversation[] } = {
    Today: [],
    Yesterday: [],
    'This Week': [],
    Earlier: [],
  };

  conversations.forEach((conv) => {
    const convDate = new Date(conv.updated_at);
    convDate.setHours(0, 0, 0, 0);

    if (convDate.getTime() === today.getTime()) {
      groups['Today'].push(conv);
    } else if (convDate.getTime() === yesterday.getTime()) {
      groups['Yesterday'].push(conv);
    } else if (convDate > lastWeek) {
      groups['This Week'].push(conv);
    } else {
      groups['Earlier'].push(conv);
    }
  });

  // Remove empty groups
  return Object.entries(groups).filter(([, convs]) => convs.length > 0);
}

export const ConversationSidebar = memo(function ConversationSidebar({
  conversations,
  currentConversationId,
  onSelectConversation,
  onNewConversation,
  onDelete,
  isOpen = true,
  onClose,
  isCollapsed = false,
  onToggleCollapse,
}: ConversationSidebarProps) {
  const groupedConversations = useMemo(
    () => groupByDate(conversations),
    [conversations]
  );

  // On mobile, render as overlay when open
  const isMobile = Platform.OS !== 'web';

  if (!isOpen && isMobile) return null;

  const sidebarContent = (
    <View className="flex-1 bg-white">
      {/* Header */}
      <View className="flex-row items-center justify-between px-4 py-3 border-b border-gray-100">
        <Text
          style={{ fontFamily: 'LibreBaskerville_700Bold' }}
          className="text-lg text-charcoal"
        >
          Conversations
        </Text>
        <View className="flex-row items-center">
          {!isMobile && onToggleCollapse && (
            <Pressable onPress={onToggleCollapse} className="p-2">
              <Text className="text-xl text-gray-400">«</Text>
            </Pressable>
          )}
          {isMobile && onClose && (
            <Pressable onPress={onClose} className="p-2">
              <Text className="text-2xl text-gray-400">×</Text>
            </Pressable>
          )}
        </View>
      </View>

      {/* New Chat Button */}
      <Pressable
        onPress={onNewConversation}
        className="mx-4 mt-4 mb-2 bg-gold py-3 px-4 rounded-xl flex-row items-center justify-center active:opacity-80"
      >
        <Text className="text-white text-lg mr-2">+</Text>
        <Text
          style={{ fontFamily: 'Lato_700Bold' }}
          className="text-white text-base"
        >
          New Chat
        </Text>
      </Pressable>

      {/* Conversations List */}
      <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
        {groupedConversations.length === 0 ? (
          <View className="px-4 py-8">
            <Text
              style={{ fontFamily: 'Lato_400Regular' }}
              className="text-gray-400 text-center"
            >
              No conversations yet
            </Text>
          </View>
        ) : (
          groupedConversations.map(([group, convs]) => (
            <View key={group}>
              <Text
                style={{ fontFamily: 'Lato_700Bold' }}
                className="px-4 py-2 text-xs text-gray-400 uppercase tracking-wide bg-gray-50"
              >
                {group}
              </Text>
              {convs.map((conversation) => (
                <ConversationItem
                  key={conversation.id}
                  conversation={conversation}
                  isActive={conversation.id === currentConversationId}
                  onSelect={(id) => {
                    onSelectConversation(id);
                    if (isMobile && onClose) onClose();
                  }}
                  onDelete={onDelete}
                />
              ))}
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );

  // On mobile, render as overlay
  if (isMobile) {
    return (
      <View className="absolute inset-0 z-50 flex-row">
        {/* Backdrop */}
        <Pressable
          onPress={onClose}
          className="absolute inset-0 bg-black/30"
        />
        {/* Sidebar */}
        <View className="w-72 bg-white h-full shadow-lg">
          {sidebarContent}
        </View>
      </View>
    );
  }

  // On web, render as fixed sidebar (collapsible)
  if (isCollapsed) {
    return (
      <View className="w-12 border-r border-gray-200 h-full bg-white items-center pt-3">
        <Pressable
          onPress={onToggleCollapse}
          className="p-2 rounded hover:bg-gray-100"
        >
          <Text className="text-xl text-gray-400">»</Text>
        </Pressable>
        <Pressable
          onPress={onNewConversation}
          className="mt-2 p-2 bg-gold rounded-lg"
        >
          <Text className="text-white text-lg">+</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View className="w-72 border-r border-gray-200 h-full">
      {sidebarContent}
    </View>
  );
});
