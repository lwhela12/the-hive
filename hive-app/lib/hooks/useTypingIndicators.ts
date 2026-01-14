import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../supabase';
import type { TypingIndicator, Profile } from '../../types';

export type TypingUserWithProfile = TypingIndicator & { user?: Profile };

export function useTypingIndicators(roomId: string, currentUserId?: string) {
  const [typingUsers, setTypingUsers] = useState<TypingUserWithProfile[]>([]);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const fetchTypingUsers = useCallback(async () => {
    const { data } = await supabase
      .from('typing_indicators')
      .select('*, user:profiles(*)')
      .eq('room_id', roomId)
      .gt('updated_at', new Date(Date.now() - 5000).toISOString());

    setTypingUsers((data || []) as TypingUserWithProfile[]);
  }, [roomId]);

  useEffect(() => {
    fetchTypingUsers();

    const channel = supabase
      .channel(`typing:${roomId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'typing_indicators',
          filter: `room_id=eq.${roomId}`,
        },
        () => {
          fetchTypingUsers();
        }
      )
      .subscribe();

    // Poll every 3 seconds to clear stale typing indicators
    const interval = setInterval(fetchTypingUsers, 3000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, [roomId, fetchTypingUsers]);

  const sendTypingIndicator = useCallback(async () => {
    if (!currentUserId) return;

    try {
      await supabase.from('typing_indicators').upsert(
        {
          room_id: roomId,
          user_id: currentUserId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'room_id,user_id' }
      );
    } catch (error) {
      // Ignore errors
    }
  }, [roomId, currentUserId]);

  const clearTypingIndicator = useCallback(async () => {
    if (!currentUserId) return;

    try {
      await supabase
        .from('typing_indicators')
        .delete()
        .eq('room_id', roomId)
        .eq('user_id', currentUserId);
    } catch (error) {
      // Ignore errors
    }
  }, [roomId, currentUserId]);

  const startTyping = useCallback(() => {
    sendTypingIndicator();

    // Clear typing indicator after 3 seconds of no activity
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    typingTimeoutRef.current = setTimeout(() => {
      clearTypingIndicator();
    }, 3000);
  }, [sendTypingIndicator, clearTypingIndicator]);

  const stopTyping = useCallback(() => {
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    clearTypingIndicator();
  }, [clearTypingIndicator]);

  // Filter out current user from typing users
  const otherTypingUsers = typingUsers.filter((t) => t.user_id !== currentUserId);

  return {
    typingUsers: otherTypingUsers,
    startTyping,
    stopTyping,
  };
}
