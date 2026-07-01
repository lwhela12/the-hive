import { useState, useEffect, useRef, useCallback, useMemo, memo } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Pressable,
  Text,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { Image } from 'expo-image';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/hooks/useAuth';
import { MessageBubble } from './MessageBubble';
import { TypingIndicator } from './TypingIndicator';
import { ChatInput, type ChatInputAttachments } from './ChatInput';
import { SelectedImage } from '../../lib/imagePicker';
import { uploadMultipleFiles, uploadMultipleImages } from '../../lib/attachmentUpload';
import type { ChatMessage, Conversation, ConversationMode, Attachment } from '../../types';

const cliveIcon = require('../../assets/Clive_logo.png');

// Retry helper with exponential backoff
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelayMs: number = 500
): Promise<T> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      if (attempt < maxRetries - 1) {
        const delay = baseDelayMs * Math.pow(2, attempt);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  throw lastError;
}

interface ChatInterfaceProps {
  mode?: ConversationMode;
  context?: 'skills' | 'wishes';
  conversationId?: string | null;
  onSkillsCaptured?: () => void;
  onOnboardingComplete?: () => void;
  onConversationCreated?: (conversation: Conversation) => void;
  onTitleGenerated?: (conversationId: string, title: string) => void;
  skipLoadHistory?: boolean;
  refineWishContext?: string; // Rough wish to refine with Clive
  initialPrompt?: string;
}

const SUPABASE_FUNCTIONS_URL = process.env.EXPO_PUBLIC_SUPABASE_URL?.replace('.supabase.co', '.functions.supabase.co');
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const STICKY_BOTTOM_SCROLL_THRESHOLD = 80;

// Check if streaming is supported on this platform
const supportsStreaming = (): boolean => {
  // Only web reliably supports ReadableStream for fetch response bodies
  // React Native's fetch doesn't support response.body.getReader() properly
  return Platform.OS === 'web';
};

const createFallbackTitle = (text: string): string => {
  const cleaned = text
    .replace(/\s+/g, ' ')
    .replace(/^(hey|hi|hello|yo)[,!\s]+clive[,!\s]*/i, '')
    .replace(/^clive[,!\s]*/i, '')
    .replace(/^[#>*\-\s]+/, '')
    .trim();

  if (!cleaned) return 'New conversation';

  const words = cleaned.split(' ').slice(0, 7);
  const title = words.join(' ').replace(/[.,!?;:]+$/, '');
  return title.length > 52 ? `${title.slice(0, 49).trim()}...` : title;
};

const STARTER_PROMPTS = [
  { label: 'Help me write a community post', message: 'Help me write a community post' },
  { label: 'Turn this idea into a wish', message: 'Turn this idea into a wish' },
  {
    label: 'Refine my 3MIQ',
    message:
      'Help me refine my 3 Most Important Questions: one for experiences I want to have, one for ways I want to grow, and one for how I want to contribute. After we shape them, help me add them to my profile.',
  },
  { label: 'Summarize my notes', message: 'Summarize my notes' },
  { label: 'Plan a HIVE meetup', message: 'Plan a HIVE meetup' },
  { label: 'Tell me a joke', message: 'Tell me a joke' },
  { label: 'Give me a riddle', message: 'Give me a riddle' },
  { label: 'Surprise me', message: 'Surprise me' },
];

const getFirstName = (name?: string | null) => {
  const firstName = name?.trim().split(/\s+/)[0];
  return firstName || 'there';
};

const normalizeChatAttachments = (attachments?: ChatInputAttachments | SelectedImage[]) => {
  if (Array.isArray(attachments)) {
    return { images: attachments, files: [] };
  }

  return {
    images: attachments?.images ?? [],
    files: attachments?.files ?? [],
  };
};

const WelcomeState = memo(function WelcomeState({
  name,
  isLoading,
  onSelectPrompt,
}: {
  name?: string | null;
  isLoading: boolean;
  onSelectPrompt: (prompt: string) => void;
}) {
  const { width } = useWindowDimensions();
  const isNarrow = width < 768;

  return (
    <View className="flex-1 items-center justify-center px-5">
      <View className="w-full max-w-3xl items-center">
        <Image
          source={cliveIcon}
          style={{
            width: isNarrow ? 78 : 88,
            height: isNarrow ? 78 : 88,
            borderRadius: isNarrow ? 22 : 24,
            marginBottom: 20,
          }}
          contentFit="cover"
          cachePolicy="memory-disk"
        />
        <Text
          style={{ fontFamily: 'LibreBaskerville_700Bold' }}
          className={`${isNarrow ? 'text-3xl' : 'text-4xl'} text-charcoal text-center mb-4`}
        >
          Hello {getFirstName(name)}, how can I help?
        </Text>
        <Text
          style={{ fontFamily: 'Lato_400Regular' }}
          className="text-base text-gray-500 text-center mb-7"
        >
          Ask Clive for help thinking, writing, organizing, or turning a loose idea into a HIVE action.
        </Text>
        <View className="flex-row flex-wrap justify-center gap-3">
          {STARTER_PROMPTS.map((prompt) => (
            <Pressable
              key={prompt.label}
              onPress={() => onSelectPrompt(prompt.message)}
              disabled={isLoading}
              className="bg-cream border border-gold/20 rounded-full px-4 py-3 active:opacity-80"
            >
              <Text
                style={{ fontFamily: 'Lato_700Bold' }}
                className="text-charcoal text-sm"
              >
                {prompt.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
    </View>
  );
});

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
  onTitleGenerated,
  skipLoadHistory = false,
  refineWishContext,
  initialPrompt,
}: ChatInterfaceProps) {
  const { session, profile, communityId } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [skillsCount, setSkillsCount] = useState(0);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(conversationId || null);
  const [streamingContent, setStreamingContent] = useState<string | null>(null);
  const activeConversationIdRef = useRef<string | null>(conversationId || null);
  const flatListRef = useRef<FlatList>(null);
  const shouldStickToBottomRef = useRef(true);
  const messageCountRef = useRef(0);
  const isInitialLoadRef = useRef(true);
  const previousMessageCountRef = useRef(0);
  const isLoadingMessagesRef = useRef(false);
  const hasLoadedForConversationRef = useRef<string | null>(null);
  const hasGeneratedTitleRef = useRef<Set<string>>(new Set());
  const hasInitiatedRefineRef = useRef(false);
  const hasInitiatedInitialPromptRef = useRef(false);
  const chatDraftKey = useMemo(() => {
    const modeKey = context ? `${mode}:${context}` : mode;
    const conversationKey = activeConversationId ?? 'new';
    return [
      'clive-message',
      session?.user?.id ?? 'anonymous',
      communityId ?? 'no-community',
      modeKey,
      conversationKey,
    ].join(':');
  }, [activeConversationId, communityId, context, mode, session?.user?.id]);

  // Update activeConversationId when prop changes
  useEffect(() => {
    if (conversationId !== undefined) {
      const nextConversationId = conversationId || null;
      // Reset tracking when conversation changes from parent
      if (nextConversationId !== activeConversationIdRef.current) {
        hasLoadedForConversationRef.current = null;
        messageCountRef.current = 0;
      }
      activeConversationIdRef.current = nextConversationId;
      setActiveConversationId(nextConversationId);
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
      activeConversationIdRef.current = data.id;
      setActiveConversationId(data.id);
      messageCountRef.current = 0; // Reset for new conversation
      // Mark as already loaded to prevent loadMessages from overwriting optimistic updates
      hasLoadedForConversationRef.current = data.id;
      setMessages([]); // Start fresh for new conversation
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
        if (greeting) {
          await addMessage('assistant', greeting);
        }
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

        // Add initial greeting if no messages in this conversation (only for onboarding)
        if (data.length === 0) {
          const greeting = getGreeting();
          if (greeting) {
            await addMessage('assistant', greeting);
          }
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

What are you working on these days? Is there anything you've been meaning to do but haven't had the time or know-how? We'll shape anything you save as an HD Wish other members can see and help with.`;
    }

    // Unified onboarding (no context specified)
    if (mode === 'onboarding' && !context) {
      return `Hey ${profile?.name || 'there'}! Welcome to HIVE! I'm so excited to get to know you.

Before we dive in, when's your birthday? We love celebrating our members!`;
    }

    // No greeting for default chat mode
    return null;
  };

  const generateTitleIfNeeded = async (
    convId: string,
    currentMessageCount: number,
    fallbackSeed?: string
  ) => {
    // Generate title after the first real exchange (user message + assistant response).
    // Use passed count to avoid stale ref issues.
    // Skip if we've already generated/attempted title for this conversation
    if (currentMessageCount < 2 || hasGeneratedTitleRef.current.has(convId)) {
      return;
    }

    // Mark as attempted before the async call to prevent duplicate attempts
    hasGeneratedTitleRef.current.add(convId);

    try {
      const accessToken = await getAccessToken();
      if (!accessToken) return;

      // Call edge function to generate title with Claude Haiku
      const response = await fetch(`${SUPABASE_FUNCTIONS_URL}/generate-title`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
          ...(SUPABASE_ANON_KEY ? { apikey: SUPABASE_ANON_KEY } : {}),
        },
        body: JSON.stringify({ conversation_id: convId }),
      });

      if (!response.ok) {
        throw new Error(`Title request failed: ${response.status}`);
      }

      const { title } = await response.json();
      if (title && onTitleGenerated) {
        onTitleGenerated(convId, title);
      }
    } catch (error) {
      console.error('Failed to generate title:', error);

      // If the AI title function is unavailable, still make the sidebar useful.
      if (fallbackSeed) {
        const fallbackTitle = createFallbackTitle(fallbackSeed);
        const { error: updateError } = await (supabase as any)
          .from('conversations')
          .update({ title: fallbackTitle })
          .eq('id', convId);

        if (!updateError) {
          onTitleGenerated?.(convId, fallbackTitle);
          return;
        }
      }

      // On error, remove from set so it can be retried
      hasGeneratedTitleRef.current.delete(convId);
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
    let convId = explicitConversationId ?? activeConversationIdRef.current;

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

      // Generate title after a few messages (pass current count)
      generateTitleIfNeeded(convId, messageCountRef.current);
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
    conversationIdToUse: string | null,
    refineWish?: string // The rough wish being refined (if applicable)
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
        ...(refineWish ? { refine_wish: refineWish } : {}),
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
    conversationIdToUse: string | null,
    refineWish?: string // The rough wish being refined (if applicable)
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
        ...(refineWish ? { refine_wish: refineWish } : {}),
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
  const handleSendMessage = useCallback(async (
    userMessage: string,
    selectedAttachments?: ChatInputAttachments | SelectedImage[],
    refineWish?: string // The rough wish being refined (triggers REFINE_WISH flow)
  ) => {
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

    const { images, files } = normalizeChatAttachments(selectedAttachments);

    // Upload attachments if any
    let attachments: Attachment[] | undefined;
    if (images && images.length > 0) {
      const result = await uploadMultipleImages(session.user.id, images);
      if (result.attachments.length > 0) {
        attachments = result.attachments;
      }
    }
    if (files && files.length > 0) {
      const result = await uploadMultipleFiles(session.user.id, files);
      if (result.attachments.length > 0) {
        attachments = [...(attachments ?? []), ...result.attachments];
      }
    }

    // Ensure we have a conversation before adding messages
    let conversationIdToUse = activeConversationIdRef.current;
    if (!conversationIdToUse) {
      conversationIdToUse = await createConversation();
      if (!conversationIdToUse) {
        setIsLoading(false);
        return;
      }
    }

    // Optimistic update: show user message immediately
    const optimisticUserMessage: ChatMessage = {
      id: `user-pending-${Date.now()}`,
      user_id: session.user.id,
      community_id: communityId || '',
      conversation_id: conversationIdToUse,
      role: 'user',
      content: userMessage,
      created_at: new Date().toISOString(),
      attachments: attachments || null,
    };
    setMessages(prev => [...prev, optimisticUserMessage]);

    // Save user message to DB in background with retry
    const saveUserMessage = async () => {
      const { error } = await supabase
        .from('chat_messages')
        .insert({
          user_id: session.user.id,
          community_id: communityId,
          conversation_id: conversationIdToUse,
          role: 'user',
          content: userMessage,
          attachments: attachments && attachments.length > 0 ? attachments : null,
        });
      if (error) throw error;
      messageCountRef.current += 1;
    };

    const saveUserMessagePromise = retryWithBackoff(saveUserMessage);
    saveUserMessagePromise.catch((error) => {
      console.error('Failed to save user message after retries:', error);
      Alert.alert(
        'Message not saved',
        'Your message was sent but could not be saved. Please check your connection.',
        [{ text: 'OK' }]
      );
    });

    try {
      let responseText: string;

      // Choose streaming or non-streaming based on platform support
      if (supportsStreaming()) {
        responseText = await handleSendMessageStreaming(
          userMessage,
          attachments,
          conversationIdToUse,
          refineWish
        );
      } else {
        responseText = await handleSendMessageNonStreaming(
          userMessage,
          attachments,
          conversationIdToUse,
          refineWish
        );
      }

      // Optimistic update: add to local state immediately to avoid flicker
      // Both state updates happen synchronously, so React batches them
      const optimisticMessage: ChatMessage = {
        id: `pending-${Date.now()}`,
        user_id: session?.user?.id || '',
        community_id: communityId || '',
        conversation_id: conversationIdToUse || '',
        role: 'assistant',
        content: responseText,
        created_at: new Date().toISOString(),
        attachments: null,
      };
      setMessages(prev => [...prev, optimisticMessage]);
      setStreamingContent(null);

      // Persist to DB in background with retry (don't use addMessage to avoid duplicate state update)
      const saveAssistantMessage = async () => {
        const { error } = await supabase
          .from('chat_messages')
          .insert({
            user_id: session?.user?.id,
            community_id: communityId,
            conversation_id: conversationIdToUse,
            role: 'assistant',
            content: responseText,
          });
        if (error) throw error;
        messageCountRef.current += 1;
        if (conversationIdToUse) {
          await saveUserMessagePromise.catch(() => null);
          generateTitleIfNeeded(
            conversationIdToUse,
            Math.max(messageCountRef.current, 2),
            userMessage
          );
        }
      };

      retryWithBackoff(saveAssistantMessage).catch((error) => {
        console.error('Failed to save assistant message after retries:', error);
        // Don't alert for assistant messages - less critical since user can see the response
      });

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
    communityId,
    createConversation,
    handleSendMessageStreaming,
    handleSendMessageNonStreaming,
  ]);

  // Handle refine wish context - initiate a refinement conversation
  useEffect(() => {
    const initiateRefineWish = async () => {
      if (!refineWishContext || hasInitiatedRefineRef.current) return;
      if (!session?.user?.id || !communityId) return;

      hasInitiatedRefineRef.current = true;

      // Send the wish as the user message, with refineWish flag to trigger the REFINE_WISH flow.
      setTimeout(() => {
        handleSendMessage(refineWishContext, undefined, refineWishContext);
      }, 100);
    };

    void initiateRefineWish();
  }, [refineWishContext, session?.user?.id, communityId, handleSendMessage]);

  // Handle deep links that should open Clive already doing the work.
  useEffect(() => {
    const initiatePrompt = async () => {
      if (!initialPrompt || hasInitiatedInitialPromptRef.current || refineWishContext) return;
      if (!session?.user?.id || !communityId) return;

      hasInitiatedInitialPromptRef.current = true;
      setTimeout(() => {
        handleSendMessage(initialPrompt);
      }, 100);
    };

    void initiatePrompt();
  }, [initialPrompt, refineWishContext, session?.user?.id, communityId, handleSendMessage]);

  // Reverse messages for inverted FlatList (newest first)
  const invertedMessages = useMemo(() => [...messages].reverse(), [messages]);

  const scrollToBottom = useCallback((animated = true, force = false) => {
    if (flatListRef.current && messages.length > 0 && (force || shouldStickToBottomRef.current)) {
      flatListRef.current.scrollToOffset({ offset: 0, animated });
    }
  }, [messages.length]);

  const handleMessageListScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const yOffset = event.nativeEvent.contentOffset?.y ?? 0;
    shouldStickToBottomRef.current = yOffset <= STICKY_BOTTOM_SCROLL_THRESHOLD;
  }, []);

  // Scroll to bottom when new messages are added (inverted: offset 0 = bottom)
  useEffect(() => {
    const currentCount = messages.length;
    const previousCount = previousMessageCountRef.current;

    if (currentCount > 0 && currentCount > previousCount && !isInitialLoadRef.current) {
      previousMessageCountRef.current = currentCount;
      const latestMessage = messages[currentCount - 1];
      const timer = setTimeout(() => scrollToBottom(true, latestMessage?.role === 'user'), 100);
      return () => clearTimeout(timer);
    }

    if (isInitialLoadRef.current && currentCount > 0) {
      isInitialLoadRef.current = false;
    }

    previousMessageCountRef.current = currentCount;
  }, [messages, scrollToBottom]);

  // Scroll when typing indicator appears or streaming content updates
  useEffect(() => {
    if ((isLoading || streamingContent !== null) && !isInitialLoadRef.current && shouldStickToBottomRef.current) {
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
  const showWelcomeState =
    mode === 'default' &&
    messages.length === 0 &&
    !streamingContent &&
    !refineWishContext &&
    !initialPrompt;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      className="flex-1"
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      {showWelcomeState ? (
        <WelcomeState
          name={profile?.name}
          isLoading={isLoading}
          onSelectPrompt={handleSendMessage}
        />
      ) : (
        <FlatList
          ref={flatListRef}
          data={invertedMessages}
          inverted
          extraData={[isLoading, streamingContent, messages.length]}
          keyExtractor={keyExtractor}
          renderItem={renderMessage}
          contentContainerClassName="p-4 pb-2"
          onScroll={handleMessageListScroll}
          scrollEventThrottle={16}
          ListHeaderComponent={
            <ListFooter isLoading={isLoading} streamingContent={streamingContent} />
          }
          // Performance optimizations
          removeClippedSubviews={Platform.OS !== 'web'}
          maxToRenderPerBatch={10}
          windowSize={10}
          initialNumToRender={20}
        />
      )}

      <ChatInput
        onSend={handleSendMessage}
        isLoading={isLoading}
        draftKey={chatDraftKey}
        placeholder="Message Clive..."
        communityId={communityId}
        currentUserId={session?.user?.id}
      />
    </KeyboardAvoidingView>
  );
}
