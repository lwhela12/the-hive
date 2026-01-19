import { useQuery, useQueries } from '@tanstack/react-query';
import { supabase } from '../supabase';
import { queryKeys } from '../queryClient';
import type {
  QueenBee,
  Wish,
  WishGranter,
  Event,
  Profile,
  Skill,
  Meeting,
  MonthlyHighlight,
} from '../../types';

type QueenBeeWithHighlights = QueenBee & {
  user: Profile;
  highlights: MonthlyHighlight[];
};

interface RpcQueenBeeRow {
  queen_bee: QueenBee & { user: Profile };
  highlights: MonthlyHighlight[];
}

// Fetch queen bees by STATUS (order-based model, not calendar-based)
// - lastMonth = most recent 'completed' QB
// - currentMonth = the 'active' QB
// - nextMonth = first 'upcoming' QB (by month order)
async function fetchQueenBeesWithHighlights(
  communityId: string
): Promise<{
  lastMonth: QueenBeeWithHighlights | null;
  currentMonth: QueenBeeWithHighlights | null;
  nextMonth: (QueenBee & { user: Profile }) | null;
}> {
  // Fetch all queen bees for this community
  const { data: allQBs } = (await supabase
    .from('queen_bees')
    .select('*, user:profiles(*)')
    .eq('community_id', communityId)
    .order('month', { ascending: true })) as {
    data: (QueenBee & { user: Profile })[] | null;
  };

  if (!allQBs || allQBs.length === 0) {
    return { lastMonth: null, currentMonth: null, nextMonth: null };
  }

  // Find by status
  const activeQB = allQBs.find((qb) => qb.status === 'active') || null;

  // Most recent completed (highest display_order among completed)
  const completedQBs = allQBs
    .filter((qb) => qb.status === 'completed')
    .sort((a, b) => {
      const orderA = (a as any).display_order ?? 999;
      const orderB = (b as any).display_order ?? 999;
      return orderB - orderA; // Descending - highest order (most recent) first
    });
  const lastCompletedQB = completedQBs[0] || null;

  // First upcoming (lowest display_order among upcoming)
  const upcomingQBs = allQBs
    .filter((qb) => qb.status === 'upcoming')
    .sort((a, b) => {
      const orderA = (a as any).display_order ?? 999;
      const orderB = (b as any).display_order ?? 999;
      return orderA - orderB; // Ascending - lowest order first
    });
  const nextUpcomingQB = upcomingQBs[0] || null;

  // Fetch highlights for completed and active QBs
  const qbIdsForHighlights = [lastCompletedQB?.id, activeQB?.id].filter(
    Boolean
  ) as string[];
  let highlightsMap: Record<string, MonthlyHighlight[]> = {};

  if (qbIdsForHighlights.length > 0) {
    const { data: highlights } = (await supabase
      .from('monthly_highlights')
      .select('*, creator:profiles!created_by(*)')
      .in('queen_bee_id', qbIdsForHighlights)
      .order('display_order', { ascending: true })) as {
      data: MonthlyHighlight[] | null;
    };

    if (highlights) {
      highlightsMap = highlights.reduce(
        (acc, h) => {
          if (!acc[h.queen_bee_id]) acc[h.queen_bee_id] = [];
          acc[h.queen_bee_id].push(h);
          return acc;
        },
        {} as Record<string, MonthlyHighlight[]>
      );
    }
  }

  return {
    lastMonth: lastCompletedQB
      ? { ...lastCompletedQB, highlights: highlightsMap[lastCompletedQB.id] || [] }
      : null,
    currentMonth: activeQB
      ? {
          ...activeQB,
          highlights: highlightsMap[activeQB.id] || [],
        }
      : null,
    nextMonth: nextUpcomingQB || null,
  };
}

export function useHiveDataQuery(communityId?: string, userId?: string) {
  // Use local date to avoid timezone issues (toISOString uses UTC which can be wrong date)
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  // Use useQueries for parallel fetching
  const results = useQueries({
    queries: [
      // Queen bees with highlights (single optimized query)
      {
        queryKey: queryKeys.queenBees(communityId || ''),
        queryFn: () => fetchQueenBeesWithHighlights(communityId!),
        enabled: !!communityId,
        staleTime: 5 * 60 * 1000,
        refetchOnMount: 'always', // Always refetch on mount to handle iOS cache restoration
      },
      // Public wishes (open)
      {
        queryKey: queryKeys.publicWishes(communityId || ''),
        queryFn: async () => {
          const { data, error } = await supabase
            .from('wishes')
            .select('*, user:profiles!user_id(*)')
            .eq('status', 'public')
            .eq('is_active', true)
            .eq('community_id', communityId!)
            .order('created_at', { ascending: false });
          if (error) {
            console.error('Error fetching public wishes:', error);
          }
          return (data as (Wish & { user: Profile })[]) || [];
        },
        enabled: !!communityId && !!userId,
        staleTime: 5 * 60 * 1000,
        refetchOnMount: 'always',
      },
      // Granted wishes (fulfilled)
      {
        queryKey: queryKeys.grantedWishes(communityId || ''),
        queryFn: async () => {
          const { data, error } = await supabase
            .from('wishes')
            .select(
              '*, user:profiles!user_id(*), granters:wish_granters(*, granter:profiles!granter_id(*))'
            )
            .eq('status', 'fulfilled')
            .eq('community_id', communityId!)
            .order('fulfilled_at', { ascending: false })
            .limit(20);
          if (error) {
            console.error('Error fetching granted wishes:', error);
          }
          return (
            (data as (Wish & {
              user: Profile;
              granters: (WishGranter & { granter: Profile })[];
            })[]) || []
          );
        },
        enabled: !!communityId,
        staleTime: 5 * 60 * 1000,
        refetchOnMount: 'always',
      },
      // Upcoming events (limit 5 for the hook, UI can further limit)
      // Excludes completed events
      {
        queryKey: queryKeys.events(communityId || ''),
        queryFn: async () => {
          const { data } = await supabase
            .from('events')
            .select('*')
            .gte('event_date', today)
            .eq('community_id', communityId!)
            .or('status.is.null,status.eq.scheduled')
            .order('event_date', { ascending: true })
            .limit(5);
          return (data as Event[]) || [];
        },
        enabled: !!communityId,
        staleTime: 10 * 60 * 1000, // Events change less frequently
        refetchOnMount: 'always', // Always refetch on mount to handle iOS cache restoration
      },
      // Honey pot
      {
        queryKey: queryKeys.honeyPot(communityId || ''),
        queryFn: async () => {
          const { data } = (await supabase
            .from('honey_pot')
            .select('balance')
            .eq('community_id', communityId!)
            .single()) as { data: { balance: number } | null };
          return data?.balance || 0;
        },
        enabled: !!communityId,
        staleTime: 10 * 60 * 1000,
        refetchOnMount: 'always',
      },
      // Recent meetings
      {
        queryKey: queryKeys.meetings(communityId || ''),
        queryFn: async () => {
          const { data } = (await supabase
            .from('meetings')
            .select('*')
            .eq('community_id', communityId!)
            .order('date', { ascending: false })
            .limit(5)) as { data: Meeting[] | null };
          return data || [];
        },
        enabled: !!communityId,
        staleTime: 5 * 60 * 1000,
      },
      // Fallback admin
      {
        queryKey: queryKeys.fallbackAdmin(communityId || ''),
        queryFn: async () => {
          const { data } = (await supabase
            .from('community_memberships')
            .select('user:profiles(*)')
            .eq('community_id', communityId!)
            .eq('role', 'admin')
            .limit(1)
            .single()) as { data: { user: Profile } | null };
          return data?.user || null;
        },
        enabled: !!communityId,
        staleTime: 30 * 60 * 1000, // Admin changes rarely
      },
      // Next meeting (for "Next Month" section and display)
      // Excludes completed meetings
      {
        queryKey: ['nextMeeting', communityId],
        queryFn: async () => {
          const { data } = (await supabase
            .from('events')
            .select('event_date, event_time, title')
            .gte('event_date', today)
            .eq('community_id', communityId!)
            .eq('event_type', 'meeting')
            .or('status.is.null,status.eq.scheduled')
            .order('event_date', { ascending: true })
            .limit(1)) as { data: { event_date: string; event_time: string | null; title: string }[] | null };
          return data?.[0] || null;
        },
        enabled: !!communityId,
        staleTime: 10 * 60 * 1000,
        refetchOnMount: 'always',
      },
      // User skills (for matching wishes)
      {
        queryKey: queryKeys.userSkills(communityId || '', userId || ''),
        queryFn: async () => {
          const { data } = await supabase
            .from('skills')
            .select('*')
            .eq('user_id', userId!)
            .eq('community_id', communityId!);
          return (data as Skill[]) || [];
        },
        enabled: !!communityId && !!userId,
        staleTime: 10 * 60 * 1000,
      },
    ],
  });

  const [
    queenBeesResult,
    wishesResult,
    grantedWishesResult,
    eventsResult,
    honeyPotResult,
    meetingsResult,
    adminResult,
    nextMeetingResult,
    userSkillsResult,
  ] = results;

  const isLoading = results.some((r) => r.isLoading);
  const isRefetching = results.some((r) => r.isRefetching);

  return {
    queenBees: queenBeesResult.data || {
      lastMonth: null,
      currentMonth: null,
      nextMonth: null,
    },
    fallbackAdmin: adminResult.data || null,
    publicWishes: wishesResult.data || [],
    grantedWishes: grantedWishesResult.data || [],
    upcomingEvents: eventsResult.data || [],
    honeyPotBalance: honeyPotResult.data || 0,
    meetings: meetingsResult.data || [],
    nextMeeting: nextMeetingResult.data || null,
    userSkills: userSkillsResult.data || [],
    isLoading,
    isRefetching,
    // Per-query loading states for skeleton UI
    loading: {
      queenBees: queenBeesResult.isLoading,
      publicWishes: wishesResult.isLoading,
      grantedWishes: grantedWishesResult.isLoading,
      events: eventsResult.isLoading,
      honeyPot: honeyPotResult.isLoading,
    },
    refetch: () => Promise.all(results.map((r) => r.refetch())),
  };
}
