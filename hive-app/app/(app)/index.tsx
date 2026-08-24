import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { View, Platform, Pressable, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { ChatInterface } from '../../components/chat/ChatInterface';
import { ConversationSidebar } from '../../components/chat/ConversationSidebar';
import { AppHeader } from '../../components/navigation';
import { useAuth } from '../../lib/hooks/useAuth';
import { useConversations } from '../../lib/hooks/useConversations';
import { ThinkingBee } from '../../components/ui/ThinkingBee';
import type { Conversation } from '../../types';

/**
 * The conversation you were last reading, remembered for this visit and no
 * longer — a plain module variable, so it lives as long as the browser tab or
 * the open app does. Same idea as `lib/hiveSelection.ts` keeping which HIVE you
 * are standing in for the tab's lifetime.
 *
 * It used to be written to storage, which meant OPENING Clive dropped you into
 * an old thread. Nat, 2026-08-06: "i saw the Clive landing page for 1/2 a
 * second, but then it brought me here, which was my last convo with Clive, but
 * i coudlnt figure out how to get back to the main Clive screen."
 *
 * So: arriving at Clive starts at his front page, which is a place you can
 * choose from. Stepping over to Members and back keeps your place, because that
 * is the same visit and losing the thread you are mid-way through would be its
 * own kind of broken.
 *
 * Keyed per HIVE and per person, because Clive is always speaking inside
 * exactly one HIVE and two people share a screen here often.
 */
const conversationThisVisit = new Map<string, string>();

export default function ChatScreen() {
  const { refineWish, prefill, hive: linkedHiveId } = useLocalSearchParams<{
    refineWish?: string;
    prefill?: string;
    /** Which HIVE this conversation is about (2026-08-17). */
    hive?: string;
  }>();
  const { profile, communityId, memberships, switchCommunity, wholeHive } = useAuth();

  /**
   * Clive is always speaking inside exactly one HIVE, and a link that arrives
   * with something to post has to land him in the right one.
   *
   * Without this, "you said something good in Tech HIVE — refine it with Clive"
   * opens whichever HIVE the reader happened to be standing in, and then his
   * post_to_board tool can only see that HIVE's boards. The idea would go to
   * the wrong place, or nowhere.
   *
   * Same shape as the check-in link's fix earlier today: arrive where the link
   * said, hold the screen until you are there.
   */
  const requestedHiveId = Array.isArray(linkedHiveId) ? linkedHiveId[0] : linkedHiveId;
  const isMemberOfRequested = !!requestedHiveId
    && memberships.some((m) => m.community_id === requestedHiveId);
  const switchPending = isMemberOfRequested && (wholeHive || communityId !== requestedHiveId);
  const switchedForLinkRef = useRef<string | null>(null);
  useEffect(() => {
    if (!requestedHiveId || !isMemberOfRequested) return;
    if (switchedForLinkRef.current === requestedHiveId) return;
    if (!wholeHive && communityId === requestedHiveId) return;
    switchedForLinkRef.current = requestedHiveId;
    void switchCommunity(requestedHiveId);
  }, [requestedHiveId, isMemberOfRequested, wholeHive, communityId, switchCommunity]);

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
  const hasCheckedThisVisitRef = useRef<string | null>(null);
  const shouldStartFreshFromRoute = !!refineWish || !!prefill;
  const visitKey = useMemo(() => {
    if (!communityId || !profile?.id) return null;
    return `${communityId}:${profile.id}`;
  }, [communityId, profile?.id]);

  // Load conversations on mount
  useEffect(() => {
    loadConversations();
    loadProjects();
  }, [loadConversations, loadProjects]);

  // Remember where you are while this visit lasts.
  useEffect(() => {
    if (!visitKey || !currentConversation?.id) return;
    if (currentConversation.mode !== 'default' || currentConversation.is_active === false) return;
    conversationThisVisit.set(visitKey, currentConversation.id);
  }, [
    currentConversation?.id,
    currentConversation?.is_active,
    currentConversation?.mode,
    visitKey,
  ]);

  // Come back to Clive later in the same visit and you land back in the thread
  // you were reading. Arrive at Clive fresh and you get his front page.
  //
  // This runs once per person-in-a-HIVE, deliberately: after it has had its go,
  // pressing the front-page button stays pressed instead of being overruled by
  // the next refresh of the conversation list.
  useEffect(() => {
    if (!visitKey || shouldStartFreshFromRoute) return;
    if (hasCheckedThisVisitRef.current === visitKey) return;
    if (currentConversation || conversations.length === 0) return;

    hasCheckedThisVisitRef.current = visitKey;

    const rememberedId = conversationThisVisit.get(visitKey);
    if (!rememberedId) return;

    // Only a real, current thread of Clive's ordinary chat. A remembered
    // conversation that has since been deleted takes you nowhere at all rather
    // than to somebody else's idea of a good place to land.
    const remembered = conversations.find(
      (conversation) => conversation.id === rememberedId && conversation.mode === 'default'
    );
    if (remembered) setCurrentConversation(remembered);
    else conversationThisVisit.delete(visitKey);
  }, [
    conversations,
    currentConversation,
    visitKey,
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
    if (visitKey && conversationThisVisit.get(visitKey) === id) {
      conversationThisVisit.delete(visitKey);
    }
    await deleteConversation(id);
  }, [deleteConversation, visitKey]);

  /**
   * Back to Clive's starting screen — the "Hello Nat, how can I help?" page
   * with the suggestions on it.
   *
   * Nat, 2026-08-06: "i coudlnt figure out how to get back to the main Clive
   * screen." There was no way back: once a conversation was open, every door in
   * Clive's header led further in.
   *
   * It closes the thread on screen rather than starting a new one in the
   * database. The conversation you were reading is safe in the list, and Clive
   * writes a new one the moment you actually say something — so tapping this
   * five times leaves five empty rows nowhere.
   */
  const handleShowClivesFrontPage = useCallback(() => {
    if (visitKey) conversationThisVisit.delete(visitKey);
    setCurrentConversation(null);
    setDrawerOpen(false);
  }, [setCurrentConversation, visitKey]);

  const { width } = useWindowDimensions();
  // Use mobile layout for narrow screens (< 768px) regardless of platform
  const useMobileLayout = width < 768;

  // Arriving in the HIVE the link named. Holding here keeps Clive from opening
  // a conversation in the wrong one and then having it change underneath him.
  if (switchPending) {
    return (
      <SafeAreaView className="flex-1 bg-white" edges={['top']}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
          <ThinkingBee label="Getting Clive…" />
        </View>
      </SafeAreaView>
    );
  }

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
          {/* No logos in the gold bars — all seven pages identical. Clive's
              portrait greets you at full size on his front page instead, and as
              of 2026-08-06 it stays there: it was spilling out of the top of a
              page that could not scroll and drawing over the word "Clive" in
              this bar. The fix is in `ChatInterface`'s WelcomeState, not here. */}
          {/* The ☰ opens the APP menu here, the same as on every other screen.
              It used to open Clive's conversation list instead, because this
              screen passed its own handler — and since Home is where you land,
              the app menu was unreachable from the one place everybody starts.
              That is why Nat could never find Admin (2026-08-03): it was in a
              menu whose only button, on her screen, opened something else. */}
          <View>
            <AppHeader
              title="Clive"
              /* Back to the front page. It shows once you are inside a
                 conversation, which is the only time it has anywhere to take
                 you — a button that is there and does nothing is the thing Nat
                 keeps reading as broken. */
              rightElement={currentConversation ? (
                <Pressable
                  onPress={handleShowClivesFrontPage}
                  accessibilityRole="button"
                  accessibilityLabel="Clive's starting screen"
                  className="w-10 h-10 items-center justify-center rounded-full active:opacity-70"
                  hitSlop={8}
                  {...(Platform.OS === 'web' ? ({ title: "Clive's starting screen" } as any) : {})}
                >
                  <Ionicons name="sparkles-outline" size={22} color="white" />
                </Pressable>
              ) : undefined}
            />

            {/* Clive's conversation list opens from the LEFT, because that is
                the side it slides in from. Nat, 2026-08-06: "since the menu
                lives on the left, i think the icon that opens that should also
                be on the left." It sat on the right, so the drawer appeared to
                come from the wrong place.

                It is laid over the header's empty left slot rather than passed
                into it: `AppHeader` offers a back arrow there and nothing else,
                and giving the shared header a left slot of its own is a change
                to a file the whole app uses, not to this one screen. The box
                below is exactly the slot's size and position — 16px of header
                padding, then a 40px square — so it reads as if it were in it. */}
            {useMobileLayout ? (
              <View
                pointerEvents="box-none"
                style={{ position: 'absolute', left: 16, top: 0, bottom: 0, justifyContent: 'center' }}
              >
                <Pressable
                  onPress={() => setDrawerOpen(true)}
                  accessibilityRole="button"
                  accessibilityLabel="Your conversations with Clive"
                  className="w-10 h-10 items-center justify-center rounded-full active:opacity-70"
                  hitSlop={8}
                >
                  <Ionicons name="chatbubbles-outline" size={23} color="white" />
                </Pressable>
              </View>
            ) : null}
          </View>

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
