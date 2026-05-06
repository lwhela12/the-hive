import { useState, useCallback } from 'react';
import { supabase } from '../supabase';
import { useAuth } from './useAuth';
import type { Conversation, ConversationMode, ConversationProject } from '../../types';

const SUPABASE_FUNCTIONS_URL = process.env.EXPO_PUBLIC_SUPABASE_URL?.replace('.supabase.co', '.functions.supabase.co');
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

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

const isLowSignalTitle = (title?: string | null): boolean => {
  if (!title) return true;
  const normalized = title.toLowerCase().replace(/^[#>*\-\s]+/, '').trim();
  return (
    normalized === 'new conversation' ||
    normalized.startsWith('clive') ||
    normalized.startsWith('hey clive') ||
    normalized.startsWith('hi clive') ||
    normalized.startsWith('hello clive') ||
    normalized.startsWith('yo clive')
  );
};

export function useConversations() {
  const { session, communityId } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [projects, setProjects] = useState<ConversationProject[]>([]);
  const [currentConversation, setCurrentConversation] = useState<Conversation | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadConversations = useCallback(async () => {
    if (!session?.user?.id || !communityId) return;

    setLoading(true);
    const { data, error } = await supabase
      .from('conversations')
      .select('*')
      .eq('user_id', session.user.id)
      .eq('community_id', communityId)
      .eq('is_active', true)
      .order('updated_at', { ascending: false });

    if (!error && data) {
      const loadedConversations = data as Conversation[];
      setConversations(loadedConversations);
      const untitledConversations = loadedConversations
        .filter((conversation) => isLowSignalTitle(conversation.title))
        .slice(0, 12);

      untitledConversations.forEach(async (conversation) => {
        const { data: messages } = await supabase
          .from('chat_messages')
          .select('content, role')
          .eq('conversation_id', conversation.id)
          .eq('role', 'user')
          .order('created_at', { ascending: true })
          .limit(1);

        const firstUserMessage = (messages as { content: string }[] | null)?.[0];
        if (!firstUserMessage?.content) return;

        let title = createFallbackTitle(firstUserMessage.content);

        const accessToken = session?.access_token;
        if (SUPABASE_FUNCTIONS_URL && accessToken) {
          try {
            if (conversation.title) {
              await (supabase as any)
                .from('conversations')
                .update({ title: null })
                .eq('id', conversation.id);
            }

            const response = await fetch(`${SUPABASE_FUNCTIONS_URL}/generate-title`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${accessToken}`,
                ...(SUPABASE_ANON_KEY ? { apikey: SUPABASE_ANON_KEY } : {}),
              },
              body: JSON.stringify({ conversation_id: conversation.id }),
            });

            if (response.ok) {
              const generated = await response.json();
              if (generated?.title && !isLowSignalTitle(generated.title)) {
                title = generated.title;
              }
            }
          } catch (error) {
            console.error('Failed to generate conversation title:', error);
          }
        }

        const { error: updateError } = await (supabase as any)
          .from('conversations')
          .update({ title })
          .eq('id', conversation.id);

        if (!updateError) {
          setConversations((prev) =>
            prev.map((item) =>
              item.id === conversation.id ? { ...item, title } : item
            )
          );
        }
      });
    } else if (error) {
      setError('Failed to load conversations');
    }
    setLoading(false);
  }, [session?.user?.id, communityId]);

  const loadProjects = useCallback(async () => {
    if (!session?.user?.id || !communityId) return;

    const { data, error } = await supabase
      .from('conversation_projects' as any)
      .select('*')
      .eq('user_id', session.user.id)
      .eq('community_id', communityId)
      .order('display_order', { ascending: true })
      .order('created_at', { ascending: true });

    if (!error && data) {
      setProjects(data as unknown as ConversationProject[]);
    } else if (error) {
      console.warn('Conversation projects unavailable:', error.message);
      setProjects([]);
    }
  }, [session?.user?.id, communityId]);

  const createProject = useCallback(async (name: string): Promise<ConversationProject | null> => {
    if (!session?.user?.id || !communityId) {
      setError('Not authenticated');
      return null;
    }

    const trimmedName = name.trim();
    if (!trimmedName) return null;

    const { data, error } = await (supabase as any)
      .from('conversation_projects')
      .insert({
        user_id: session.user.id,
        community_id: communityId,
        name: trimmedName,
        display_order: projects.length,
      })
      .select()
      .single();

    if (error) {
      console.error('Failed to create project:', error);
      setError('Failed to create project');
      return null;
    }

    const project = data as ConversationProject;
    setProjects((prev) => [...prev, project]);
    return project;
  }, [session?.user?.id, communityId, projects.length]);

  const moveConversationToProject = useCallback(async (
    conversationId: string,
    projectId: string | null
  ) => {
    const { error } = await (supabase as any)
      .from('conversations')
      .update({ project_id: projectId })
      .eq('id', conversationId);

    if (!error) {
      setConversations((prev) =>
        prev.map((conversation) =>
          conversation.id === conversationId
            ? { ...conversation, project_id: projectId }
            : conversation
        )
      );
      if (currentConversation?.id === conversationId) {
        setCurrentConversation((prev) => prev ? { ...prev, project_id: projectId } : null);
      }
    } else {
      console.error('Failed to move conversation:', error);
      setError('Failed to move conversation');
    }

    return !error;
  }, [currentConversation?.id]);

  const createConversation = useCallback(async (
    mode: ConversationMode = 'default',
    title?: string
  ): Promise<Conversation | null> => {
    if (!session?.user?.id || !communityId) {
      setError('Not authenticated');
      return null;
    }

    const { data, error } = await supabase
      .from('conversations')
      .insert({
        user_id: session.user.id,
        community_id: communityId,
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
  }, [session?.user?.id, communityId]);

  const getOrCreateConversation = useCallback(async (
    mode: ConversationMode = 'default'
  ): Promise<Conversation | null> => {
    if (!session?.user?.id || !communityId) return null;

    // Check if there's a recent active conversation (within last 30 minutes)
    const { data: existing } = await supabase
      .from('conversations')
      .select('*')
      .eq('user_id', session.user.id)
      .eq('community_id', communityId)
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
  }, [session?.user?.id, communityId, createConversation]);

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
    projects,
    currentConversation,
    loading,
    error,
    loadConversations,
    loadProjects,
    createConversation,
    createProject,
    getOrCreateConversation,
    selectConversation,
    moveConversationToProject,
    updateConversationTitle,
    archiveConversation,
    deleteConversation,
    generateTitle,
    setCurrentConversation,
  };
}
