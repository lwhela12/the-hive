import { useState, useEffect, useRef, useCallback, memo } from 'react';
import {
  View,
  FlatList,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/hooks/useAuth';
import { MessageBubble } from './MessageBubble';
import { TypingIndicator } from './TypingIndicator';
import { ChatInput } from './ChatInput';
import { SelectedImage } from '../../lib/imagePicker';
import { uploadMultipleImages } from '../../lib/attachmentUpload';
import type { ChatMessage, Conversation, ConversationMode, Attachment } from '../../types';

interface ChatInterfaceProps {
  mode?: ConversationMode;
  context?: 'skills' | 'wishes';
  conversationId?: string | null;
  onSkillsCaptured?: () => void;
  onOnboardingComplete?: () => void;
  onConversationCreated?: (conversation: Conversation) => void;
  skipLoadHistory?: boolean;
}

const SUPABASE_FUNCTIONS_URL = process.env.EXPO_PUBLIC_SUPABASE_URL?.replace('.supabase.co', '.functions.supabase.co');
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

// Check if streaming is supported on this platform
const supportsStreaming = (): boolean => {
  // Only web reliably supports ReadableStream for fetch response bodies
  // React Native's fetch doesn't support response.body.getReader() properly
  return Platform.OS === 'web';
};

// Memoized footer component that handles both loading and streaming states
const ListFooter = memo(function ListFooter({
  isLoading,
  streamingContent,
}: {
  isLoading: boolean;
  streamingContent: string | null;
}) {
  // Show streaming message bubble if we have streaming content
  if (streamingContent !== null) {
    return (
      <MessageBubble
        message={{
          id: 'streaming',
          user_id: '',
          community_id: '',
          role: 'assistant',
          content: streamingContent,
          created_at: new Date().toISOString(),
        }}
        isStreaming={true}
      />
    );
  }
  // Show typing indicator while loading
  if (isLoading) return <TypingIndicator />;
  return null;
});

export function ChatInterface({
  mode = 'default',
  context,
  conversationId,
  onSkillsCaptured,
  onOnboardingComplete,
  onConversationCreated,
  skipLoadHistory = false,
}: ChatInterfaceProps) {
  const { session, profile, communityId } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [skillsCount, setSkillsCount] = useState(0);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(conversationId || null);
  const [streamingContent, setStreamingContent] = useState<string | null>(null);
  const flatListRef = useRef<FlatList>(null);
  const messageCountRef = useRef(0);
  const isInitialLoadRef = useRef(true);
  const previousMessageCountRef = useRef(0);
  const isLoadingMessagesRef = useRef(false);
  const hasLoadedForConversationRef = useRef<string | null>(null);

  // Update activeConversationId when prop changes
  useEffect(() => {
    if (conversationId !== undefined) {
      // Reset tracking when conversation changes from parent
      if (conversationId !== activeConversationId) {
        hasLoadedForConversationRef.current = null;
        messageCountRef.current = 0;
      }
      setActiveConversationId(conversationId);
      // Mark as initial load when conversation changes
      isInitialLoadRef.current = true;
    }
  }, [conversationId]);

  // Load messages when conversation changes
  useEffect(() => {
    loadMessages();
  }, [activeConversationId, communityId]);

  // Check skills count for onboarding
  useEffect(() => {
    if (mode === 'onboarding' && context === 'skills' && skillsCount >= 2) {
      onSkillsCaptured?.();
    }
  }, [skillsCount, mode, context, onSkillsCaptured]);

  const createConversation = async (): Promise<string | null> => {
    if (!session?.user?.id || !communityId) return null;

    const { data, error } = await supabase
      .from('conversations')
      .insert({
        user_id: session.user.id,
        community_id: communityId,
        mode,
        is_active: true,
      })
      .select()
      .single();

    if (error) {
      console.error('Failed to create conversation:', error);
      return null;
    }

    if (data) {
      setActiveConversationId(data.id);
      messageCountRef.current = 0; // Reset for new conversation
      hasLoadedForConversationRef.current = null;
      onConversationCreated?.(data);
      return data.id;
    }

    return null;
  };

  const loadMessages = async () => {
    if (!session?.user?.id || !communityId) return;

    // Prevent concurrent loads
    if (isLoadingMessagesRef.current) return;

    // Skip loading history for fresh onboarding - show greeting immediately
    if (skipLoadHistory) {
      // Only show greeting once
      if (hasLoadedForConversationRef.current === 'skipLoadHistory') return;

      isLoadingMessagesRef.current = true;
      try {
        setMessages([]);
        const greeting = getGreeting();
        await addMessage('assistant', greeting);
        hasLoadedForConversationRef.current = 'skipLoadHistory';
      } finally {
        isLoadingMessagesRef.current = false;
      }
      return;
    }

    // If no conversation selected, show empty state
    if (!activeConversationId) {
      setMessages([]);
      return;
    }

    // Skip if we've already loaded this conversation
    if (hasLoadedForConversationRef.current === activeConversationId) return;

    isLoadingMessagesRef.current = true;
    try {
      const { data } = await supabase
        .from('chat_messages')
        .select('*')
        .eq('conversation_id', activeConversationId)
        .eq('community_id', communityId)
        .order('created_at', { ascending: true })
        .limit(100);

      if (data) {
        setMessages(data);
        messageCountRef.current = data.length;

        // Add initial greeting if no messages in this conversation
        if (data.length === 0) {
          const greeting = getGreeting();
          await addMessage('assistant', greeting);
        }

        hasLoadedForConversationRef.current = activeConversationId;
      }
    } finally {
      isLoadingMessagesRef.current = false;
    }
  };

  const getGreeting = () => {
    if (mode === 'onboarding' && context === 'skills') {
      return `Hey ${profile?.name || 'there'}! I'm excited to get to know you better.

What are some things you feel you're particularly good at? It could be professional skills, hobbies, or just things you enjoy doing. No pressure to be modest - I want to learn what makes you unique!`;
    }

    if (mode === 'onboarding' && context === 'wishes') {
      return `Now let's talk about what you might need help with.

What are you working on these days? Is there anything you've been meaning to do but haven't had the time or know-how? Remember, these stay private unless you choose to share them with the HIVE.`;
    }

    // Unified onboarding (no context specified)
    if (mode === 'onboarding' && !context) {
      return `Hey ${profile?.name || 'there'}! Welcome to the HIVE! I'm so excited to get to know you.

Before we dive in, when's your birthday? We love celebrating our members!`;
    }

    // Default greeting for new conversations
    return `Hey ${profile?.name || 'there'}! How can I help you today?`;
  };

  const generateTitleIfNeeded = async (convId: string) => {
    // Generate title after 3 messages (greeting + user message + assistant response)
    if (messageCountRef.current === 3) {
      try {
        const accessToken = await getAccessToken();
        if (!accessToken) return;

        // Call edge function to generate title with Claude Haiku
        await fetch(`${SUPABASE_FUNCTIONS_URL}/generate-title`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
            ...(SUPABASE_ANON_KEY ? { apikey: SUPABASE_ANON_KEY } : {}),
          },
          body: JSON.stringify({ conversation_id: convId }),
        });
      } catch (error) {
        console.error('Failed to generate title:', error);
      }
    }
  };

  const addMessage = async (
    role: 'user' | 'assistant',
    content: string,
    attachments?: Attachment[],
    explicitConversationId?: string | null
  ) => {
    if (!session?.user?.id || !communityId) return;

    // Use explicit ID if provided, otherwise fall back to state or create new
    let convId = explicitConversationId ?? activeConversationId;

    // Create conversation if none exists
    if (!convId) {
      convId = await createConversation();
      if (!convId) return;
    }

    const { data, error } = await supabase
      .from('chat_messages')
      .insert({
        user_id: session.user.id,
        community_id: communityId,
        conversation_id: convId,
        role,
        content,
        attachments: attachments && attachments.length > 0 ? attachments : null,
      })
      .select()
      .single();

    if (!error && data) {
      setMessages((prev) => [...prev, data]);
      messageCountRef.current += 1;

      // Generate title after a few messages
      generateTitleIfNeeded(convId);
    }

    return data;
  };

  // Get a fresh access token
  const getAccessToken = useCallback(async (): Promise<string | undefined> => {
    let accessToken = session?.access_token;
    if (!accessToken) {
      const { data } = await supabase.auth.getSession();
      accessToken = data.session?.access_token ?? undefined;
    }
    if (!accessToken) {
      const { data } = await supabase.auth.refreshSession();
      accessToken = data.session?.access_token ?? undefined;
    }
    return accessToken;
  }, [session?.access_token]);

  // Handle metadata from response (both streaming and non-streaming)
  const handleResponseMetadata = useCallback((metadata: {
    skillsAdded?: number;
    onboardingComplete?: boolean;
  }) => {
    if (mode === 'onboarding' && context === 'skills' && metadata.skillsAdded) {
      setSkillsCount((prev) => prev + metadata.skillsAdded!);
    }
    if (mode === 'onboarding' && metadata.onboardingComplete) {
      onOnboardingComplete?.();
    }
  }, [mode, context, onOnboardingComplete]);

  // Streaming message handler
  const handleSendMessageStreaming = useCallback(async (
    userMessage: string,
    attachments: Attachment[] | undefined,
    conversationIdToUse: string | null
  ) => {
    const accessToken = await getAccessToken();
    if (!accessToken) {
      throw new Error('Missing access token for chat request');
    }

    const response = await fetch(`${SUPABASE_FUNCTIONS_URL}/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
        ...(SUPABASE_ANON_KEY ? { apikey: SUPABASE_ANON_KEY } : {}),
      },
      body: JSON.stringify({
        message: userMessage,
        mode,
        context,
        conversation_id: conversationIdToUse,
        attachments: attachments,
        stream: true,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.details || `Chat request failed: ${response.status}`);
    }

    // Handle SSE stream
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body');
    }

    const decoder = new TextDecoder();
    let buffer = '';
    let fullContent = '';
    let currentEventType = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Parse SSE events from buffer
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEventType = line.slice(7).trim();
          } else if (line.startsWith('data: ')) {
            const data = line.slice(6);

            switch (currentEventType) {
              case 'content_start':
                setStreamingContent('');
                break;
              case 'content_delta':
                try {
                  // Data is JSON-encoded to handle special characters
                  const parsed = JSON.parse(data);
                  if (parsed.text) {
                    fullContent += parsed.text;
                    setStreamingContent(fullContent);
                  }
                } catch {
                  // Fallback: use raw data if not JSON
                  fullContent += data;
                  setStreamingContent(fullContent);
                }
                break;
              case 'content_done':
                // Content is complete, fullContent already has the full text
                break;
              case 'metadata':
                try {
                  const metadata = JSON.parse(data);
                  handleResponseMetadata(metadata);
                } catch {
                  // Ignore parse errors for metadata
                }
                break;
              case 'error':
                console.error('Stream error:', data);
                break;
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    return fullContent;
  }, [getAccessToken, mode, context, handleResponseMetadata]);

  // Non-streaming message handler (fallback)
  const handleSendMessageNonStreaming = useCallback(async (
    userMessage: string,
    attachments: Attachment[] | undefined,
    conversationIdToUse: string | null
  ) => {
    const accessToken = await getAccessToken();
    if (!accessToken) {
      throw new Error('Missing access token for chat request');
    }

    const response = await fetch(`${SUPABASE_FUNCTIONS_URL}/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
        ...(SUPABASE_ANON_KEY ? { apikey: SUPABASE_ANON_KEY } : {}),
      },
      body: JSON.stringify({
        message: userMessage,
        mode,
        context,
        conversation_id: conversationIdToUse,
        attachments: attachments,
        stream: false,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.details || `Chat request failed: ${response.status}`);
    }

    const data = await response.json();
    handleResponseMetadata(data);
    return data.response as string;
  }, [getAccessToken, mode, context, handleResponseMetadata]);

  // Main send message handler
  const handleSendMessage = useCallback(async (userMessage: string, images?: SelectedImage[]) => {
    if (!SUPABASE_FUNCTIONS_URL) {
      console.error('Missing Supabase functions URL');
      return;
    }

    if (!session?.user?.id) {
      console.error('No user session');
      return;
    }

    setIsLoading(true);
    setStreamingContent(null);

    // Upload images if any
    let attachments: Attachment[] | undefined;
    if (images && images.length > 0) {
      const result = await uploadMultipleImages(session.user.id, images);
      if (result.attachments.length > 0) {
        attachments = result.attachments;
      }
    }

    // Add user message to chat (with attachments if any)
    const userMsg = await addMessage('user', userMessage, attachments);
    const conversationIdToUse = userMsg?.conversation_id || activeConversationId;

    try {
      let responseText: string;

      // Choose streaming or non-streaming based on platform support
      if (supportsStreaming()) {
        responseText = await handleSendMessageStreaming(
          userMessage,
          attachments,
          conversationIdToUse
        );
      } else {
        responseText = await handleSendMessageNonStreaming(
          userMessage,
          attachments,
          conversationIdToUse
        );
      }

      // Clear streaming state and save the final message
      setStreamingContent(null);
      await addMessage('assistant', responseText, undefined, conversationIdToUse);

    } catch (error) {
      console.error('Error sending message:', error);
      setStreamingContent(null);
      await addMessage(
        'assistant',
        "I'm having trouble connecting right now. Let me try again in a moment.",
        undefined,
        conversationIdToUse
      );
    } finally {
      setIsLoading(false);
      setStreamingContent(null);
    }
  }, [
    session?.user?.id,
    activeConversationId,
    handleSendMessageStreaming,
    handleSendMessageNonStreaming,
  ]);

  const scrollToBottom = useCallback((animated = true) => {
    if (flatListRef.current && messages.length > 0) {
      flatListRef.current.scrollToEnd({ animated });
    }
  }, [messages.length]);

  // Handle scrolling when messages change
  useEffect(() => {
    const currentCount = messages.length;
    const previousCount = previousMessageCountRef.current;

    // Only scroll if messages were added (not on initial empty state)
    if (currentCount > 0) {
      if (isInitialLoadRef.current) {
        // Initial load: scroll immediately without animation
        // Use requestAnimationFrame to ensure layout is complete
        requestAnimationFrame(() => {
          flatListRef.current?.scrollToEnd({ animated: false });
        });
        isInitialLoadRef.current = false;
      } else if (currentCount > previousCount) {
        // New message added: animate scroll
        const timer = setTimeout(() => scrollToBottom(true), 100);
        return () => clearTimeout(timer);
      }
    }

    previousMessageCountRef.current = currentCount;
  }, [messages.length, scrollToBottom]);

  // Scroll when typing indicator appears or streaming content updates
  useEffect(() => {
    if ((isLoading || streamingContent !== null) && !isInitialLoadRef.current) {
      const timer = setTimeout(() => scrollToBottom(true), 100);
      return () => clearTimeout(timer);
    }
  }, [isLoading, streamingContent, scrollToBottom]);

  // Memoized render function
  const renderMessage = useCallback(
    ({ item }: { item: ChatMessage }) => <MessageBubble message={item} />,
    []
  );

  // Memoized key extractor
  const keyExtractor = useCallback((item: ChatMessage) => item.id, []);

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      className="flex-1"
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <FlatList
        ref={flatListRef}
        data={messages}
        extraData={[isLoading, streamingContent]}
        keyExtractor={keyExtractor}
        renderItem={renderMessage}
        contentContainerClassName="p-4 pb-2"
        ListFooterComponent={
          <ListFooter isLoading={isLoading} streamingContent={streamingContent} />
        }
        // Performance optimizations
        removeClippedSubviews={Platform.OS !== 'web'}
        maxToRenderPerBatch={10}
        windowSize={10}
        initialNumToRender={20}
        maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
      />

      <ChatInput onSend={handleSendMessage} isLoading={isLoading} />
    </KeyboardAvoidingView>
  );
}
