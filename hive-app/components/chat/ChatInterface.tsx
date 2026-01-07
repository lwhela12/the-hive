import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  TextInput,
  FlatList,
  Pressable,
  Text,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/hooks/useAuth';
import { MessageBubble } from './MessageBubble';
import { TypingIndicator } from './TypingIndicator';
import type { ChatMessage } from '../../types';

interface ChatInterfaceProps {
  mode?: 'default' | 'onboarding';
  context?: 'skills' | 'wishes';
  onSkillsCaptured?: () => void;
}

const SUPABASE_FUNCTIONS_URL = process.env.EXPO_PUBLIC_SUPABASE_URL?.replace('.supabase.co', '.functions.supabase.co');

export function ChatInterface({
  mode = 'default',
  context,
  onSkillsCaptured,
}: ChatInterfaceProps) {
  const { session, profile } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [skillsCount, setSkillsCount] = useState(0);
  const flatListRef = useRef<FlatList>(null);

  // Load initial messages
  useEffect(() => {
    loadMessages();
  }, []);

  // Check skills count for onboarding
  useEffect(() => {
    if (mode === 'onboarding' && context === 'skills' && skillsCount >= 2) {
      onSkillsCaptured?.();
    }
  }, [skillsCount, mode, context, onSkillsCaptured]);

  const loadMessages = async () => {
    if (!session?.user?.id) return;

    const { data } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: true })
      .limit(50);

    if (data) {
      setMessages(data);

      // Add initial greeting if no messages
      if (data.length === 0) {
        const greeting = getGreeting();
        await addMessage('assistant', greeting);
      }
    }
  };

  const getGreeting = () => {
    if (mode === 'onboarding' && context === 'skills') {
      return `Hey ${profile?.name || 'there'}! I'm excited to get to know you better.

What are some things you feel you're particularly good at? It could be professional skills, hobbies, or just things you enjoy doing. No pressure to be modest - I want to learn what makes you unique!`;
    }

    if (mode === 'onboarding' && context === 'wishes') {
      return `Now let's talk about what you might need help with.

What are you working on these days? Is there anything you've been meaning to do but haven't had the time or know-how? Remember, these stay private unless you choose to share them with the Hive.`;
    }

    return `Hey ${profile?.name || 'there'}! How can I help you today?`;
  };

  const addMessage = async (role: 'user' | 'assistant', content: string) => {
    if (!session?.user?.id) return;

    const { data, error } = await supabase
      .from('chat_messages')
      .insert({
        user_id: session.user.id,
        role,
        content,
      })
      .select()
      .single();

    if (!error && data) {
      setMessages((prev) => [...prev, data]);
    }

    return data;
  };

  const sendMessage = async () => {
    if (!inputText.trim() || isLoading || !session?.access_token) return;

    const userMessage = inputText.trim();
    setInputText('');
    setIsLoading(true);

    // Add user message to chat
    await addMessage('user', userMessage);

    try {
      // Call Supabase Edge Function for chat
      const response = await fetch(`${SUPABASE_FUNCTIONS_URL}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          message: userMessage,
          mode,
          context,
        }),
      });

      if (!response.ok) {
        throw new Error('Chat request failed');
      }

      const data = await response.json();

      // Add assistant response
      await addMessage('assistant', data.response);

      // Update skills count if we're in skills context
      if (mode === 'onboarding' && context === 'skills' && data.skillsAdded) {
        setSkillsCount((prev) => prev + data.skillsAdded);
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
  };

  const scrollToBottom = useCallback(() => {
    if (flatListRef.current && messages.length > 0) {
      flatListRef.current.scrollToEnd({ animated: true });
    }
  }, [messages.length]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading, scrollToBottom]);

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      className="flex-1"
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <MessageBubble message={item} />}
        contentContainerClassName="p-4 pb-2"
        onContentSizeChange={scrollToBottom}
        ListFooterComponent={isLoading ? <TypingIndicator /> : null}
      />

      <View className="flex-row items-end p-4 border-t border-gold-light bg-white">
        <TextInput
          value={inputText}
          onChangeText={setInputText}
          placeholder="Type a message..."
          placeholderTextColor="#9CA3AF"
          multiline
          maxLength={2000}
          className="flex-1 bg-cream rounded-2xl px-4 py-3 mr-2 max-h-32 text-base text-charcoal"
          style={{ fontFamily: 'Lato_400Regular' }}
          editable={!isLoading}
        />
        <Pressable
          onPress={sendMessage}
          disabled={!inputText.trim() || isLoading}
          className={`w-10 h-10 rounded-full items-center justify-center ${
            inputText.trim() && !isLoading
              ? 'bg-gold active:opacity-80'
              : 'bg-gray-200'
          }`}
        >
          <Text className="text-lg text-white">↑</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}
