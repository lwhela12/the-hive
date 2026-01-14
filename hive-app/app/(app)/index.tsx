import { useState, useEffect, useCallback } from 'react';
import { View, Pressable, Text, Platform, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChatInterface } from '../../components/chat/ChatInterface';
import { ConversationSidebar } from '../../components/chat/ConversationSidebar';
import { useConversations } from '../../lib/hooks/useConversations';
import type { Conversation } from '../../types';

export default function ChatScreen() {
  const {
    conversations,
    currentConversation,
    loadConversations,
    createConversation,
    selectConversation,
    deleteConversation,
    setCurrentConversation,
  } = useConversations();

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Load conversations on mount
  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  const handleNewConversation = useCallback(async () => {
    const newConv = await createConversation('default');
    if (newConv) {
      setSidebarOpen(false);
    }
  }, [createConversation]);

  const handleSelectConversation = useCallback(async (id: string) => {
    await selectConversation(id);
    setSidebarOpen(false);
  }, [selectConversation]);

  const handleConversationCreated = useCallback((conversation: Conversation) => {
    setCurrentConversation(conversation);
  }, [setCurrentConversation]);

  const handleDeleteConversation = useCallback(async (id: string) => {
    await deleteConversation(id);
  }, [deleteConversation]);

  const { width } = useWindowDimensions();
  // Use mobile layout for narrow screens (< 768px) regardless of platform
  const useMobileLayout = width < 768;

  return (
    <SafeAreaView className="flex-1 bg-white" edges={['top']}>
      <View className="flex-1 flex-row">
        {/* Sidebar - always visible on wide screens (collapsible), drawer on narrow screens */}
        {!useMobileLayout && (
          <ConversationSidebar
            conversations={conversations}
            currentConversationId={currentConversation?.id || null}
            onSelectConversation={handleSelectConversation}
            onNewConversation={handleNewConversation}
            onDelete={handleDeleteConversation}
            isOpen={true}
            isCollapsed={sidebarCollapsed}
            onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
          />
        )}

        {/* Mobile/narrow screen sidebar (animated drawer) */}
        {useMobileLayout && (
          <ConversationSidebar
            conversations={conversations}
            currentConversationId={currentConversation?.id || null}
            onSelectConversation={handleSelectConversation}
            onNewConversation={handleNewConversation}
            onDelete={handleDeleteConversation}
            isOpen={sidebarOpen}
            onClose={() => setSidebarOpen(false)}
          />
        )}

        {/* Main chat area */}
        <View className="flex-1">
          {/* Mobile header - Claude.ai style */}
          {useMobileLayout && (
            <View className="flex-row items-center justify-between px-4 py-3">
              <Pressable
                onPress={() => setSidebarOpen(true)}
                className="p-2 -ml-2"
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                {/* Hamburger icon - three lines */}
                <View className="w-6 h-5 justify-between">
                  <View className="h-0.5 w-6 bg-charcoal rounded-full" />
                  <View className="h-0.5 w-5 bg-charcoal rounded-full" />
                  <View className="h-0.5 w-6 bg-charcoal rounded-full" />
                </View>
              </Pressable>
              <View className="flex-row items-center">
                <Text
                  style={{ fontFamily: 'LibreBaskerville_700Bold' }}
                  className="text-base text-charcoal"
                >
                  HIVE
                </Text>
              </View>
              <Pressable
                onPress={handleNewConversation}
                className="p-2 -mr-2"
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                {/* New chat icon - square with plus */}
                <View className="w-6 h-6 border-2 border-charcoal rounded-md items-center justify-center">
                  <Text className="text-charcoal text-sm font-bold">+</Text>
                </View>
              </Pressable>
            </View>
          )}

          <ChatInterface
            conversationId={currentConversation?.id || null}
            onConversationCreated={handleConversationCreated}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}
