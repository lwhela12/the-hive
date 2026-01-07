import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabase';
import type { QueenBee, QueenBeeUpdate, Profile } from '../../types';

export function useQueenBee() {
  const [currentQueenBee, setCurrentQueenBee] = useState<(QueenBee & { user: Profile }) | null>(null);
  const [updates, setUpdates] = useState<(QueenBeeUpdate & { user: Profile })[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchQueenBee = useCallback(async () => {
    setLoading(true);

    const currentMonth = new Date().toISOString().slice(0, 7);

    // Fetch current Queen Bee
    const { data: qb } = await supabase
      .from('queen_bees')
      .select('*, user:profiles(*)')
      .eq('month', currentMonth)
      .single();

    if (qb) {
      setCurrentQueenBee(qb as QueenBee & { user: Profile });

      // Fetch updates
      const { data: qbUpdates } = await supabase
        .from('queen_bee_updates')
        .select('*, user:profiles(*)')
        .eq('queen_bee_id', qb.id)
        .order('created_at', { ascending: false });

      if (qbUpdates) setUpdates(qbUpdates as (QueenBeeUpdate & { user: Profile })[]);
    } else {
      setCurrentQueenBee(null);
      setUpdates([]);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    fetchQueenBee();
  }, [fetchQueenBee]);

  const addUpdate = async (content: string, userId: string) => {
    if (!currentQueenBee) return { error: new Error('No active Queen Bee') };

    const { data, error } = await supabase
      .from('queen_bee_updates')
      .insert({
        queen_bee_id: currentQueenBee.id,
        user_id: userId,
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
