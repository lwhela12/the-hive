import { useState, useCallback } from 'react';
import { supabase } from '../supabase';
import { useAuth } from './useAuth';
import type { Conversation, ConversationMode } from '../../types';

export function useConversations() {
  const { session } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversation, setCurrentConversation] = useState<Conversation | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadConversations = useCallback(async () => {
    if (!session?.user?.id) return;

    setLoading(true);
    const { data, error } = await supabase
      .from('conversations')
      .select('*')
      .eq('user_id', session.user.id)
      .eq('is_active', true)
      .order('updated_at', { ascending: false });

    if (!error && data) {
      setConversations(data);
    } else if (error) {
      setError('Failed to load conversations');
    }
    setLoading(false);
  }, [session?.user?.id]);

  const createConversation = useCallback(async (
    mode: ConversationMode = 'default',
    title?: string
  ): Promise<Conversation | null> => {
    if (!session?.user?.id) {
      setError('Not authenticated');
      return null;
    }

    const { data, error } = await supabase
      .from('conversations')
      .insert({
        user_id: session.user.id,
        mode,
        title: title || null,
        is_active: true,
      })
      .select()
      .single();

    if (error) {
      console.error('Failed to create conversation:', error);
      setError('Failed to create conversation');
      return null;
    }

    if (data) {
      setConversations((prev) => [data, ...prev]);
      setCurrentConversation(data);
    }

    return data;
  }, [session?.user?.id]);

  const getOrCreateConversation = useCallback(async (
    mode: ConversationMode = 'default'
  ): Promise<Conversation | null> => {
    if (!session?.user?.id) return null;

    // Check if there's a recent active conversation (within last 30 minutes)
    const { data: existing } = await supabase
      .from('conversations')
      .select('*')
      .eq('user_id', session.user.id)
      .eq('mode', mode)
      .eq('is_active', true)
      .order('updated_at', { ascending: false })
      .limit(1)
      .single();

    if (existing) {
      const lastUpdate = new Date(existing.updated_at);
      const now = new Date();
      const diffMinutes = (now.getTime() - lastUpdate.getTime()) / (1000 * 60);

      // If last activity was within 30 minutes, reuse conversation
      if (diffMinutes < 30) {
        setCurrentConversation(existing);
        return existing;
      }
    }

    // Create new conversation
    return createConversation(mode);
  }, [session?.user?.id, createConversation]);

  const selectConversation = useCallback(async (conversationId: string) => {
    const { data, error } = await supabase
      .from('conversations')
      .select('*')
      .eq('id', conversationId)
      .single();

    if (!error && data) {
      setCurrentConversation(data);
    }
    return data;
  }, []);

  const updateConversationTitle = useCallback(async (
    conversationId: string,
    title: string
  ) => {
    const { error } = await supabase
      .from('conversations')
      .update({ title })
      .eq('id', conversationId);

    if (!error) {
      setConversations((prev) =>
        prev.map((c) => (c.id === conversationId ? { ...c, title } : c))
      );
      if (currentConversation?.id === conversationId) {
        setCurrentConversation((prev) => prev ? { ...prev, title } : null);
      }
    }
  }, [currentConversation?.id]);

  const archiveConversation = useCallback(async (conversationId: string) => {
    const { error } = await supabase
      .from('conversations')
      .update({ is_active: false })
      .eq('id', conversationId);

    if (!error) {
      setConversations((prev) => prev.filter((c) => c.id !== conversationId));
      if (currentConversation?.id === conversationId) {
        setCurrentConversation(null);
      }
    }
  }, [currentConversation?.id]);

  const deleteConversation = useCallback(async (conversationId: string) => {
    const { error } = await supabase
      .from('conversations')
      .delete()
      .eq('id', conversationId);

    if (!error) {
      setConversations((prev) => prev.filter((c) => c.id !== conversationId));
      if (currentConversation?.id === conversationId) {
        setCurrentConversation(null);
      }
    }
    return !error;
  }, [currentConversation?.id]);

  const generateTitle = useCallback(async (conversationId: string) => {
    // Get first 3 messages from this conversation
    const { data: messages } = await supabase
      .from('chat_messages')
      .select('content, role')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
      .limit(3);

    if (!messages || messages.length === 0) return;

    // Generate a simple title from the first user message
    const firstUserMessage = messages.find((m) => m.role === 'user');
    if (firstUserMessage) {
      // Take first 50 chars of the first user message as title
      const title = firstUserMessage.content.slice(0, 50).trim();
      const finalTitle = title.length === 50 ? `${title}...` : title;
      await updateConversationTitle(conversationId, finalTitle);
    }
  }, [updateConversationTitle]);

  return {
    conversations,
    currentConversation,
    loading,
    error,
    loadConversations,
    createConversation,
    getOrCreateConversation,
    selectConversation,
    updateConversationTitle,
    archiveConversation,
    deleteConversation,
    generateTitle,
    setCurrentConversation,
  };
}
