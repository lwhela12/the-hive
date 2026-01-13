import { useState, useCallback } from 'react';
import { supabase } from '../supabase';
import { useAuth } from './useAuth';
import type { ChatMessage } from '../../types';

const SUPABASE_FUNCTIONS_URL = process.env.EXPO_PUBLIC_SUPABASE_URL?.replace('.supabase.co', '.functions.supabase.co');
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export function useChat() {
  const { session, communityId } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadMessages = useCallback(async () => {
    if (!session?.user?.id || !communityId) return;

    const { data, error } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('user_id', session.user.id)
      .eq('community_id', communityId)
      .order('created_at', { ascending: true })
      .limit(50);

    if (!error && data) {
      setMessages(data);
    }
  }, [session?.user?.id, communityId]);

  const sendMessage = useCallback(async (
    content: string,
    mode: 'default' | 'onboarding' = 'default',
    context?: 'skills' | 'wishes'
  ) => {
    if (!session?.user?.id || !communityId) {
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
        community_id: communityId,
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
          community_id: communityId,
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

      if (!SUPABASE_FUNCTIONS_URL) {
        throw new Error('Missing Supabase functions URL');
      }

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

      // Call chat function
      const response = await fetch(`${SUPABASE_FUNCTIONS_URL}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
          ...(SUPABASE_ANON_KEY ? { apikey: SUPABASE_ANON_KEY } : {}),
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
          community_id: communityId,
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
  }, [session?.access_token, session?.user?.id, communityId]);

  const clearMessages = useCallback(async () => {
    if (!session?.user?.id || !communityId) return;

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
