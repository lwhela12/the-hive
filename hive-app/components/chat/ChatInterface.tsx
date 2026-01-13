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
import type { ChatMessage, Conversation, ConversationMode } from '../../types';

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

// Memoized footer component
const ListFooter = memo(function ListFooter({ isLoading }: { isLoading: boolean }) {
  if (!isLoading) return null;
  return <TypingIndicator />;
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
  const { session, profile, communityId, refreshProfile } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [skillsCount, setSkillsCount] = useState(0);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(conversationId || null);
  const flatListRef = useRef<FlatList>(null);
  const messageCountRef = useRef(0);
  const isInitialLoadRef = useRef(true);
  const previousMessageCountRef = useRef(0);

  // Update activeConversationId when prop changes
  useEffect(() => {
    if (conversationId !== undefined) {
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
    if (!session?.user?.id) return null;

    const { data, error } = await supabase
      .from('conversations')
      .insert({
        user_id: session.user.id,
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
      onConversationCreated?.(data);
      return data.id;
    }

    return null;
  };

  const loadMessages = async () => {
    if (!session?.user?.id || !communityId) return;

    // Check if this is a first-time user (for welcome message tracking)
    const isFirstTimeUser = !profile?.onboarded_at && mode === 'default';

    // Skip loading history for fresh onboarding
    if (skipLoadHistory) {
      setMessages([]);
      const greeting = getGreeting();
      await addMessage('assistant', greeting);
      return;
    }

    // If no conversation selected, show empty state
    if (!activeConversationId) {
      setMessages([]);
      return;
    }

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

        // Set onboarded_at for first-time users after showing welcome message
        if (isFirstTimeUser) {
          await supabase
            .from('profiles')
            .update({ onboarded_at: new Date().toISOString() })
            .eq('id', session.user.id);
          await refreshProfile();
        }
      }
    }
  };

  const getGreeting = () => {
    // First-time user welcome message (only shown once)
    if (!profile?.onboarded_at && mode === 'default') {
      return `Welcome to The Hive! Feel free to look around! You can see what's going on with the group on the Hive page, add topics for discussion on the Board, chat with other members in the messages, or fill out your profile. When you're ready I'd love to chat with you about your goals and the skills you bring to the group!`;
    }

    if (mode === 'onboarding' && context === 'skills') {
      return `Hey ${profile?.name || 'there'}! I'm excited to get to know you better.

What are some things you feel you're particularly good at? It could be professional skills, hobbies, or just things you enjoy doing. No pressure to be modest - I want to learn what makes you unique!`;
    }

    if (mode === 'onboarding' && context === 'wishes') {
      return `Now let's talk about what you might need help with.

What are you working on these days? Is there anything you've been meaning to do but haven't had the time or know-how? Remember, these stay private unless you choose to share them with the Hive.`;
    }

    // Unified onboarding (no context specified)
    if (mode === 'onboarding' && !context) {
      return `Hey ${profile?.name || 'there'}! Welcome to The Hive! I'm so excited to get to know you.

Before we dive in, when's your birthday? We love celebrating our members!`;
    }

    return `Hey ${profile?.name || 'there'}! How can I help you today?`;
  };

  const generateTitleIfNeeded = async (convId: string) => {
    // Generate title after 3 messages
    if (messageCountRef.current === 3) {
      const { data: firstMessage } = await supabase
        .from('chat_messages')
        .select('content')
        .eq('conversation_id', convId)
        .eq('role', 'user')
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (firstMessage) {
        const title = firstMessage.content.slice(0, 50).trim();
        const finalTitle = title.length === 50 ? `${title}...` : title;

        await supabase
          .from('conversations')
          .update({ title: finalTitle })
          .eq('id', convId);
      }
    }
  };

  const addMessage = async (role: 'user' | 'assistant', content: string) => {
    if (!session?.user?.id || !communityId) return;

    let convId = activeConversationId;

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

  const handleSendMessage = useCallback(async (userMessage: string) => {
    if (!SUPABASE_FUNCTIONS_URL) {
      console.error('Missing Supabase functions URL');
      return;
    }

    setIsLoading(true);

    // Add user message to chat
    await addMessage('user', userMessage);

    try {
      let accessToken = session?.access_token;
      if (!accessToken) {
        const { data } = await supabase.auth.getSession();
        accessToken = data.session?.access_token ?? undefined;
      }

      if (!accessToken) {
        const { data } = await supabase.auth.refreshSession();
        accessToken = data.session?.access_token ?? undefined;
      }

      if (!accessToken) {
        throw new Error('Missing access token for chat request');
      }

      // Call Supabase Edge Function for chat
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
          conversation_id: activeConversationId,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('Chat API error:', response.status, errorData);
        throw new Error(errorData.details || `Chat request failed: ${response.status}`);
      }

      const data = await response.json();

      // Add assistant response
      await addMessage('assistant', data.response);

      // Update skills count if we're in skills context
      if (mode === 'onboarding' && context === 'skills' && data.skillsAdded) {
        setSkillsCount((prev) => prev + data.skillsAdded);
      }

      // Check if onboarding is complete (unified onboarding flow)
      if (mode === 'onboarding' && data.onboardingComplete) {
        onOnboardingComplete?.();
      }
    } catch (error) {
      console.error('Error sending message:', error);
      await addMessage(
        'assistant',
        "I'm having trouble connecting right now. Let me try again in a moment."
      );
    } finally {
      setIsLoading(false);
    }
  }, [session?.access_token, mode, context, activeConversationId, onOnboardingComplete]);

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

  // Scroll when typing indicator appears
  useEffect(() => {
    if (isLoading && !isInitialLoadRef.current) {
      const timer = setTimeout(() => scrollToBottom(true), 100);
      return () => clearTimeout(timer);
    }
  }, [isLoading, scrollToBottom]);

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
        extraData={isLoading}
        keyExtractor={keyExtractor}
        renderItem={renderMessage}
        contentContainerClassName="p-4 pb-2"
        ListFooterComponent={<ListFooter isLoading={isLoading} />}
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
