import { useState, useEffect, useCallback } from 'react';
import { View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { ChatInterface } from '../../components/chat/ChatInterface';
import { ConversationSidebar } from '../../components/chat/ConversationSidebar';
import { AppHeader } from '../../components/navigation';
import { useConversations } from '../../lib/hooks/useConversations';
import type { Conversation } from '../../types';

export default function ChatScreen() {
  const { refineWish, prefill } = useLocalSearchParams<{ refineWish?: string; prefill?: string }>();

  const {
    conversations,
    projects,
    currentConversation,
    loadConversations,
    loadProjects,
    createConversation,
    createProject,
    selectConversation,
    moveConversationToProject,
    deleteConversation,
    setCurrentConversation,
  } = useConversations();

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Load conversations on mount
  useEffect(() => {
    loadConversations();
    loadProjects();
  }, [loadConversations, loadProjects]);

  const handleNewConversation = useCallback(async () => {
    await createConversation('default');
  }, [createConversation]);

  const handleNewConversationInProject = useCallback(async (projectId: string) => {
    await createConversation('default', undefined, projectId);
  }, [createConversation]);

  const handleSelectConversation = useCallback(async (id: string) => {
    await selectConversation(id);
  }, [selectConversation]);

  const handleConversationCreated = useCallback((conversation: Conversation) => {
    setCurrentConversation(conversation);
    // Refresh the conversation list to include the new conversation
    loadConversations();
  }, [setCurrentConversation, loadConversations]);

  const handleTitleGenerated = useCallback((conversationId: string, title: string) => {
    // Update the conversation title in the hook's state
    // This avoids needing a full refresh
    if (currentConversation?.id === conversationId) {
      setCurrentConversation({ ...currentConversation, title });
    }
    // Refresh to update sidebar - could optimize later with direct state update
    loadConversations();
  }, [currentConversation, setCurrentConversation, loadConversations]);

  const handleDeleteConversation = useCallback(async (id: string) => {
    await deleteConversation(id);
  }, [deleteConversation]);

  const { width } = useWindowDimensions();
  // Use mobile layout for narrow screens (< 768px) regardless of platform
  const useMobileLayout = width < 768;

  return (
    <SafeAreaView className="flex-1 bg-white" edges={['top', 'bottom']}>
      <View className="flex-1 flex-row">
        {/* Sidebar - always visible on wide screens (collapsible), drawer on narrow screens */}
        {!useMobileLayout && (
          <ConversationSidebar
            conversations={conversations}
            projects={projects}
            currentConversationId={currentConversation?.id || null}
            onSelectConversation={handleSelectConversation}
            onNewConversation={handleNewConversation}
            onNewConversationInProject={handleNewConversationInProject}
            onCreateProject={createProject}
            onMoveConversation={moveConversationToProject}
            onDelete={handleDeleteConversation}
            isOpen={true}
            isCollapsed={sidebarCollapsed}
            onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
          />
        )}

        {/* Main chat area */}
        <View className="flex-1">
          <AppHeader
            title="Clive"
            onMenuPress={useMobileLayout ? () => setDrawerOpen(true) : undefined}
          />

          {useMobileLayout && (
            <ConversationSidebar
              conversations={conversations}
              projects={projects}
              currentConversationId={currentConversation?.id || null}
              onSelectConversation={handleSelectConversation}
              onNewConversation={handleNewConversation}
              onNewConversationInProject={handleNewConversationInProject}
              onCreateProject={createProject}
              onMoveConversation={moveConversationToProject}
              onDelete={handleDeleteConversation}
              isOpen={drawerOpen}
              onClose={() => setDrawerOpen(false)}
            />
          )}

          <ChatInterface
            conversationId={currentConversation?.id || null}
            onConversationCreated={handleConversationCreated}
            onTitleGenerated={handleTitleGenerated}
            refineWishContext={refineWish}
            initialPrompt={prefill}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}
