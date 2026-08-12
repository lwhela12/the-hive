import { useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../supabase';
import { useAuth } from './useAuth';
import type { SkillFlower } from '../../types';

/**
 * Garden visits (Nat's idea, built 2026-08-12): the sunflowers visitors left
 * on a garden's blooms, plus the toggle for leaving/taking back your own.
 *
 * One query per garden view, keyed by the skill ids on show. There is no
 * realtime channel and no notification on purpose — finding sunflowers when
 * you next look at your garden IS the feature.
 */

/** What one bloom wears: how many sunflowers, whether one is yours, who left them. */
export type SkillFlowerSummary = {
  count: number;
  mine: boolean;
  giverNames: string[];
};

type FlowerRow = Pick<SkillFlower, 'id' | 'skill_id' | 'giver_id'> & {
  giver?: { id: string; name?: string | null } | null;
};

/** "Izzy", "Izzy and Ollie", "Izzy, Ollie and Ada". */
export function joinGiverNames(names: string[]) {
  if (names.length === 0) return '';
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

async function fetchSkillFlowers(skillIds: string[]): Promise<FlowerRow[]> {
  const { data, error } = await supabase
    .from('skill_flowers')
    .select('id, skill_id, giver_id, giver:profiles(id, name)')
    .in('skill_id', skillIds);

  if (error) {
    console.warn('[useSkillFlowers] fetch failed', error);
    throw error;
  }

  return (data as unknown as FlowerRow[]) ?? [];
}

export function useSkillFlowers(skillIds: string[]) {
  const { profile, session } = useAuth();
  const viewerId = session?.user?.id ?? profile?.id ?? null;
  const queryClient = useQueryClient();

  // Members being saved right now carry placeholder ids ("draft-skill-0")
  // until the insert lands; a flower can only sit on a real row.
  const realIds = useMemo(
    () => skillIds.filter((id) => id && !id.startsWith('draft-')).sort(),
    [skillIds]
  );
  const queryKey = useMemo(() => ['skill-flowers', realIds.join('|')] as const, [realIds]);

  const query = useQuery({
    queryKey,
    queryFn: () => fetchSkillFlowers(realIds),
    enabled: realIds.length > 0,
    staleTime: 60 * 1000,
  });

  const flowersBySkill = useMemo(() => {
    const summaries: Record<string, SkillFlowerSummary> = {};
    (query.data ?? []).forEach((flower) => {
      const summary = summaries[flower.skill_id]
        ?? (summaries[flower.skill_id] = { count: 0, mine: false, giverNames: [] });
      summary.count += 1;
      if (viewerId && flower.giver_id === viewerId) summary.mine = true;
      const name = flower.giver?.name?.trim();
      if (name) summary.giverNames.push(name);
    });
    return summaries;
  }, [query.data, viewerId]);

  /**
   * Leave a 🌻 (leaveIt = true) or take yours back (false). Optimistic — the
   * badge changes the moment you tap, and rolls back by refetch if the write
   * fails (RLS refuses your own blooms and gardens you cannot see).
   */
  const toggleFlower = useCallback(async (skillId: string, leaveIt: boolean) => {
    if (!viewerId || !skillId || skillId.startsWith('draft-')) return;

    queryClient.setQueryData<FlowerRow[]>(queryKey, (current) => {
      const rows = current ?? [];
      const withoutMine = rows.filter(
        (row) => !(row.skill_id === skillId && row.giver_id === viewerId)
      );
      if (!leaveIt) return withoutMine;
      return [
        ...withoutMine,
        {
          id: `optimistic-${skillId}`,
          skill_id: skillId,
          giver_id: viewerId,
          giver: { id: viewerId, name: profile?.name ?? 'you' },
        },
      ];
    });

    const { error } = leaveIt
      ? await supabase
          .from('skill_flowers')
          .insert({ skill_id: skillId, giver_id: viewerId })
      : await supabase
          .from('skill_flowers')
          .delete()
          .eq('skill_id', skillId)
          .eq('giver_id', viewerId);

    if (error) {
      console.warn('[useSkillFlowers] toggle failed', error);
    }
    // Success or failure, the truth comes back from the database — success
    // swaps the optimistic row for the real one, failure rolls it back.
    queryClient.invalidateQueries({ queryKey });
  }, [profile?.name, queryClient, queryKey, viewerId]);

  return {
    flowersBySkill,
    toggleFlower,
    loading: query.isLoading,
  };
}
