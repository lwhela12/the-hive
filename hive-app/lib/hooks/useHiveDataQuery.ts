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

function getMonthStrings() {
  const now = new Date();
  const current = now.toISOString().slice(0, 7);
  const lastDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const nextDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return {
    last: lastDate.toISOString().slice(0, 7),
    current,
    next: nextDate.toISOString().slice(0, 7),
  };
}

// Fetch queen bees with highlights using optimized RPC or fallback
async function fetchQueenBeesWithHighlights(
  communityId: string
): Promise<{
  lastMonth: QueenBeeWithHighlights | null;
  currentMonth: QueenBeeWithHighlights | null;
  nextMonth: (QueenBee & { user: Profile }) | null;
}> {
  const { last, current, next } = getMonthStrings();

  // Try optimized RPC first
  const { data: rpcData, error: rpcError } = await supabase.rpc(
    'get_queen_bees_with_highlights',
    {
      p_community_id: communityId,
      p_months: [last, current, next],
    }
  );

  if (!rpcError && rpcData) {
    const rows = rpcData as RpcQueenBeeRow[];
    const findByMonth = (month: string) =>
      rows.find((r) => r.queen_bee.month === month);

    const lastMonthData = findByMonth(last);
    const currentMonthData = findByMonth(current);
    const nextMonthData = findByMonth(next);

    return {
      lastMonth: lastMonthData
        ? { ...lastMonthData.queen_bee, highlights: lastMonthData.highlights }
        : null,
      currentMonth: currentMonthData
        ? {
            ...currentMonthData.queen_bee,
            highlights: currentMonthData.highlights,
          }
        : null,
      nextMonth: nextMonthData?.queen_bee || null,
    };
  }

  // Fallback to manual queries if RPC doesn't exist
  console.warn(
    'get_queen_bees_with_highlights RPC not found, using fallback queries'
  );

  const { data: qbData } = (await supabase
    .from('queen_bees')
    .select('*, user:profiles(*)')
    .eq('community_id', communityId)
    .in('month', [last, current, next])) as {
    data: (QueenBee & { user: Profile })[] | null;
  };

  const lastMonthQB = qbData?.find((qb) => qb.month === last) || null;
  const currentMonthQB = qbData?.find((qb) => qb.month === current) || null;
  const nextMonthQB = qbData?.find((qb) => qb.month === next) || null;

  // Fetch highlights separately
  const qbIdsForHighlights = [lastMonthQB?.id, currentMonthQB?.id].filter(
    Boolean
  ) as string[];
  let highlightsMap: Record<string, MonthlyHighlight[]> = {};

  if (qbIdsForHighlights.length > 0) {
    const { data: highlights } = (await supabase
      .from('monthly_highlights')
      .select('*')
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
    lastMonth: lastMonthQB
      ? { ...lastMonthQB, highlights: highlightsMap[lastMonthQB.id] || [] }
      : null,
    currentMonth: currentMonthQB
      ? {
          ...currentMonthQB,
          highlights: highlightsMap[currentMonthQB.id] || [],
        }
      : null,
    nextMonth: nextMonthQB || null,
  };
}

export function useHiveDataQuery(communityId?: string, userId?: string) {
  const today = new Date().toISOString().split('T')[0];

  // Use useQueries for parallel fetching
  const results = useQueries({
    queries: [
      // Queen bees with highlights (single optimized query)
      {
        queryKey: queryKeys.queenBees(communityId || ''),
        queryFn: () => fetchQueenBeesWithHighlights(communityId!),
        enabled: !!communityId,
        staleTime: 5 * 60 * 1000,
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
            .neq('user_id', userId!)
            .order('created_at', { ascending: false });
          if (error) {
            console.error('Error fetching public wishes:', error);
          }
          return (data as (Wish & { user: Profile })[]) || [];
        },
        enabled: !!communityId && !!userId,
        staleTime: 5 * 60 * 1000,
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
      },
      // Upcoming events (limit 5 for the hook, UI can further limit)
      {
        queryKey: queryKeys.events(communityId || ''),
        queryFn: async () => {
          const { data } = await supabase
            .from('events')
            .select('*')
            .gte('event_date', today)
            .eq('community_id', communityId!)
            .order('event_date', { ascending: true })
            .limit(5);
          return (data as Event[]) || [];
        },
        enabled: !!communityId,
        staleTime: 10 * 60 * 1000, // Events change less frequently
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
      {
        queryKey: ['nextMeeting', communityId],
        queryFn: async () => {
          const { data } = (await supabase
            .from('events')
            .select('event_date, event_time, title')
            .gte('event_date', today)
            .eq('community_id', communityId!)
            .eq('event_type', 'meeting')
            .order('event_date', { ascending: true })
            .limit(1)) as { data: { event_date: string; event_time: string | null; title: string }[] | null };
          return data?.[0] || null;
        },
        enabled: !!communityId,
        staleTime: 10 * 60 * 1000,
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
    refetch: () => Promise.all(results.map((r) => r.refetch())),
  };
}
