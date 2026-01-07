import { useState, useCallback } from 'react';
import { supabase } from '../supabase';
import { useAuth } from './useAuth';
import type { ChatMessage } from '../../types';

const SUPABASE_FUNCTIONS_URL = process.env.EXPO_PUBLIC_SUPABASE_URL?.replace('.supabase.co', '.functions.supabase.co');

export function useChat() {
  const { session } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadMessages = useCallback(async () => {
    if (!session?.user?.id) return;

    const { data, error } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: true })
      .limit(50);

    if (!error && data) {
      setMessages(data);
    }
  }, [session?.user?.id]);

  const sendMessage = useCallback(async (
    content: string,
    mode: 'default' | 'onboarding' = 'default',
    context?: 'skills' | 'wishes'
  ) => {
    if (!session?.access_token || !session?.user?.id) {
      setError('Not authenticated');
      return null;
    }

    setLoading(true);
    setError(null);

    try {
      // Add user message to local state
      const userMessage: ChatMessage = {
        id: `temp-${Date.now()}`,
        user_id: session.user.id,
        role: 'user',
        content,
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, userMessage]);

      // Save user message to database
      const { data: savedUserMessage } = await supabase
        .from('chat_messages')
        .insert({
          user_id: session.user.id,
          role: 'user',
          content,
        })
        .select()
        .single();

      if (savedUserMessage) {
        setMessages((prev) =>
          prev.map((m) => (m.id === userMessage.id ? savedUserMessage : m))
        );
      }

      // Call chat function
      const response = await fetch(`${SUPABASE_FUNCTIONS_URL}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ message: content, mode, context }),
      });

      if (!response.ok) {
        throw new Error('Chat request failed');
      }

      const data = await response.json();

      // Save assistant message
      const { data: savedAssistantMessage } = await supabase
        .from('chat_messages')
        .insert({
          user_id: session.user.id,
          role: 'assistant',
          content: data.response,
        })
        .select()
        .single();

      if (savedAssistantMessage) {
        setMessages((prev) => [...prev, savedAssistantMessage]);
      }

      return data;
    } catch (err) {
      console.error('Chat error:', err);
      setError('Failed to send message');
      return null;
    } finally {
      setLoading(false);
    }
  }, [session?.access_token, session?.user?.id]);

  const clearMessages = useCallback(async () => {
    if (!session?.user?.id) return;

    // Note: This only clears local state, not the database
    // If you want to clear database messages, add that logic here
    setMessages([]);
  }, [session?.user?.id]);

  return {
    messages,
    loading,
    error,
    loadMessages,
    sendMessage,
    clearMessages,
  };
}
