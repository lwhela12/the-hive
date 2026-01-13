import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabase';
import { useAuth } from './useAuth';
import type { QueenBee, QueenBeeUpdate, Profile } from '../../types';

export function useQueenBee() {
  const { communityId } = useAuth();
  const [currentQueenBee, setCurrentQueenBee] = useState<(QueenBee & { user: Profile }) | null>(null);
  const [updates, setUpdates] = useState<(QueenBeeUpdate & { user: Profile })[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchQueenBee = useCallback(async () => {
    if (!communityId) {
      setLoading(false);
      return;
    }
    setLoading(true);

    const currentMonth = new Date().toISOString().slice(0, 7);

    // Fetch current Queen Bee
    const { data: qb } = await supabase
      .from('queen_bees')
      .select('*, user:profiles(*)')
      .eq('month', currentMonth)
      .eq('community_id', communityId)
      .single();

    if (qb) {
      setCurrentQueenBee(qb as QueenBee & { user: Profile });

      // Fetch updates
      const { data: qbUpdates } = await supabase
        .from('queen_bee_updates')
        .select('*, user:profiles(*)')
        .eq('queen_bee_id', qb.id)
        .eq('community_id', communityId)
        .order('created_at', { ascending: false });

      if (qbUpdates) setUpdates(qbUpdates as (QueenBeeUpdate & { user: Profile })[]);
    } else {
      setCurrentQueenBee(null);
      setUpdates([]);
    }

    setLoading(false);
  }, [communityId]);

  useEffect(() => {
    fetchQueenBee();
  }, [fetchQueenBee]);

  const addUpdate = async (content: string, userId: string) => {
    if (!currentQueenBee || !communityId) return { error: new Error('No active Queen Bee') };

    const { data, error } = await supabase
      .from('queen_bee_updates')
      .insert({
        queen_bee_id: currentQueenBee.id,
        user_id: userId,
        community_id: communityId,
        content,
      })
      .select('*, user:profiles(*)')
      .single();

    if (!error && data) {
      setUpdates((prev) => [data as QueenBeeUpdate & { user: Profile }, ...prev]);
    }

    return { error };
  };

  return {
    currentQueenBee,
    updates,
    loading,
    refresh: fetchQueenBee,
    addUpdate,
  };
}
