import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { View, Image, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { ChatInterface } from '../../components/chat/ChatInterface';
import { ConversationSidebar } from '../../components/chat/ConversationSidebar';
import { AppHeader } from '../../components/navigation';
import { useAuth } from '../../lib/hooks/useAuth';
import { useConversations } from '../../lib/hooks/useConversations';
import { getStoredItemAsync, removeStoredItemAsync, setStoredItemAsync } from '../../lib/webStorage';
import type { Conversation } from '../../types';

const cliveIcon = require('../../assets/Clive_logo.png');

export default function ChatScreen() {
  const { refineWish, prefill } = useLocalSearchParams<{ refineWish?: string; prefill?: string }>();
  const { profile, communityId } = useAuth();

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
  const restoredConversationKeyRef = useRef<string | null>(null);
  const shouldStartFreshFromRoute = !!refineWish || !!prefill;
  const selectedConversationStorageKey = useMemo(() => {
    if (!communityId || !profile?.id) return null;
    return `the-hive:last-clive-conversation:${communityId}:${profile.id}`;
  }, [communityId, profile?.id]);

  // Load conversations on mount
  useEffect(() => {
    loadConversations();
    loadProjects();
  }, [loadConversations, loadProjects]);

  useEffect(() => {
    if (!selectedConversationStorageKey || !currentConversation?.id) return;
    if (currentConversation.mode !== 'default' || currentConversation.is_active === false) return;
    void setStoredItemAsync(selectedConversationStorageKey, currentConversation.id);
  }, [
    currentConversation?.id,
    currentConversation?.is_active,
    currentConversation?.mode,
    selectedConversationStorageKey,
  ]);

  useEffect(() => {
    if (!selectedConversationStorageKey || shouldStartFreshFromRoute) return;
    if (currentConversation || conversations.length === 0) return;
    if (restoredConversationKeyRef.current === selectedConversationStorageKey) return;

    restoredConversationKeyRef.current = selectedConversationStorageKey;
    let cancelled = false;
    getStoredItemAsync(selectedConversationStorageKey).then((savedConversationId) => {
      if (cancelled) return;

      const savedConversation = savedConversationId
        ? conversations.find((conversation) => conversation.id === savedConversationId && conversation.mode === 'default')
        : null;
      const fallbackConversation = conversations.find((conversation) => conversation.mode === 'default') ?? null;
      const conversationToRestore = savedConversation ?? fallbackConversation;

      if (conversationToRestore) {
        setCurrentConversation(conversationToRestore);
      } else if (savedConversationId) {
        void removeStoredItemAsync(selectedConversationStorageKey);
      }
    });

    return () => {
      cancelled = true;
      if (restoredConversationKeyRef.current === selectedConversationStorageKey) {
        restoredConversationKeyRef.current = null;
      }
    };
  }, [
    conversations,
    currentConversation,
    selectedConversationStorageKey,
    setCurrentConversation,
    shouldStartFreshFromRoute,
  ]);

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
    if (selectedConversationStorageKey) {
      const savedConversationId = await getStoredItemAsync(selectedConversationStorageKey);
      if (savedConversationId === id) {
        await removeStoredItemAsync(selectedConversationStorageKey);
      }
    }
    await deleteConversation(id);
  }, [deleteConversation, selectedConversationStorageKey]);

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
            titleIcon={
              <Image
                source={cliveIcon}
                style={{ width: 24, height: 24, borderRadius: 12, marginRight: 7 }}
              />
            }
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
