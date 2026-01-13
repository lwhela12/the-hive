import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabase';
import type { RoomMessage, Profile, MessageReaction } from '../../types';

export type MessageWithData = RoomMessage & {
  sender?: Profile;
  reactions?: MessageReaction[];
};

export function useRoomMessages(roomId: string) {
  const [messages, setMessages] = useState<MessageWithData[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchMessages = useCallback(async () => {
    const { data, error } = await supabase
      .from('room_messages')
      .select('*, sender:profiles(*)')
      .eq('room_id', roomId)
      .order('created_at', { ascending: true })
      .limit(100);

    if (!error && data) {
      // Fetch reactions for all messages
      const messageIds = data.map((m) => m.id);
      const { data: reactions } = await supabase
        .from('message_reactions')
        .select('*')
        .in('message_id', messageIds);

      const messagesWithReactions = data.map((msg) => ({
        ...msg,
        reactions: reactions?.filter((r) => r.message_id === msg.id) || [],
      }));

      setMessages(messagesWithReactions as MessageWithData[]);
    }
    setLoading(false);
  }, [roomId]);

  useEffect(() => {
    fetchMessages();

    // Subscribe to changes
    const channel = supabase
      .channel(`room-messages:${roomId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'room_messages',
          filter: `room_id=eq.${roomId}`,
        },
        () => {
          fetchMessages();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'message_reactions',
        },
        () => {
          fetchMessages();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [roomId, fetchMessages]);

  return { messages, loading, refetch: fetchMessages };
}
