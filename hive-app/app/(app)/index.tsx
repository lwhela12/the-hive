import { useState, useEffect, useCallback } from 'react';
import { View, Pressable, Text, Platform } from 'react-native';
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

  const isWeb = Platform.OS === 'web';

  return (
    <SafeAreaView className="flex-1 bg-white" edges={['top']}>
      <View className="flex-1 flex-row">
        {/* Sidebar - always visible on web (collapsible), drawer on mobile */}
        {isWeb && (
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

        {/* Mobile sidebar (drawer) */}
        {!isWeb && sidebarOpen && (
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
          {/* Mobile header with menu button */}
          {!isWeb && (
            <View className="flex-row items-center justify-between px-4 py-3 border-b border-gray-100">
              <Pressable
                onPress={() => setSidebarOpen(true)}
                className="p-2 -ml-2"
              >
                <Text className="text-2xl text-charcoal">☰</Text>
              </Pressable>
              <Text
                style={{ fontFamily: 'LibreBaskerville_700Bold' }}
                className="text-lg text-charcoal"
                numberOfLines={1}
              >
                {currentConversation?.title || 'New Chat'}
              </Text>
              <Pressable
                onPress={handleNewConversation}
                className="p-2 -mr-2"
              >
                <Text className="text-2xl text-gold">+</Text>
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
