import { useQueries } from '@tanstack/react-query';
import { supabase } from '../supabase';
import { queryKeys } from '../queryClient';
import { fetchHoneyPotBalance } from '../honeyPot';
import type {
  Wish,
  WishGranter,
  Event,
  Profile,
  Skill,
  Meeting,
} from '../../types';

type BirthdayMember = Pick<Profile, 'id' | 'name' | 'birthday'>;

/**
 * Everything Home needs, fetched in parallel.
 *
 * A Queen Bee round-trip sat at the top of this list until 2026-08-06 — two
 * queries against `queen_bees` and `monthly_highlights` on every Home load,
 * handed back as `queenBees`, and read by nothing. Queen Bee was dissolved in
 * April 2026 and replaced by the Hummdinger session, so Home was paying for a
 * fetch it threw away.
 */
export function useHiveDataQuery(communityId?: string, userId?: string) {
  // Use local date to avoid timezone issues (toISOString uses UTC which can be wrong date)
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  const getNextBirthdayEvent = (member: BirthdayMember): Event | null => {
    if (!member.birthday) return null;

    const [, month, day] = member.birthday.split('-').map(Number);
    if (!month || !day) return null;

    const todayAtNoon = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
    let birthdayDate = new Date(now.getFullYear(), month - 1, day, 12);
    if (birthdayDate < todayAtNoon) {
      birthdayDate = new Date(now.getFullYear() + 1, month - 1, day, 12);
    }

    const eventDate = `${birthdayDate.getFullYear()}-${String(birthdayDate.getMonth() + 1).padStart(2, '0')}-${String(birthdayDate.getDate()).padStart(2, '0')}`;

    return {
      id: `birthday-${member.id}-${birthdayDate.getFullYear()}`,
      community_id: communityId!,
      title: `${member.name}'s birthday`,
      description: `Celebrate ${member.name}!`,
      event_date: eventDate,
      event_type: 'birthday',
      related_user_id: member.id,
      created_at: member.birthday,
    };
  };

  // Use useQueries for parallel fetching
  const results = useQueries({
    queries: [
      // Public wishes (open)
      {
        queryKey: queryKeys.publicWishes(communityId || ''),
        queryFn: async () => {
          let { data, error } = await (supabase as any)
            .from('wishes')
            .select('*, user:profiles!user_id(*), board_category:board_categories!wishes_board_category_id_fkey(id, name, topic_kind, status)')
            .eq('status', 'public')
            .or('is_active.is.true,is_active.is.null')
            .eq('community_id', communityId!)
            .order('created_at', { ascending: false });
          if (
            error &&
            (String(error.message ?? '').includes('wishes_board_category_id_fkey') ||
              String(error.message ?? '').includes('board_category'))
          ) {
            const fallback = await (supabase as any)
              .from('wishes')
              .select('*, user:profiles!user_id(*)')
              .eq('status', 'public')
              .or('is_active.is.true,is_active.is.null')
              .eq('community_id', communityId!)
              .order('created_at', { ascending: false });
            data = fallback.data;
            error = fallback.error;
          }
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
          let { data, error } = await (supabase as any)
            .from('wishes')
            .select(
              '*, user:profiles!user_id(*), board_category:board_categories!wishes_board_category_id_fkey(id, name, topic_kind, status), granters:wish_granters(*, granter:profiles!granter_id(*))'
            )
            .eq('status', 'fulfilled')
            .eq('community_id', communityId!)
            .order('fulfilled_at', { ascending: false })
            .limit(20);
          if (
            error &&
            (String(error.message ?? '').includes('wishes_board_category_id_fkey') ||
              String(error.message ?? '').includes('board_category'))
          ) {
            const fallback = await (supabase as any)
              .from('wishes')
              .select(
                '*, user:profiles!user_id(*), granters:wish_granters(*, granter:profiles!granter_id(*))'
              )
              .eq('status', 'fulfilled')
              .eq('community_id', communityId!)
              .order('fulfilled_at', { ascending: false })
              .limit(20);
            data = fallback.data;
            error = fallback.error;
          }
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
      // Upcoming events — fetch all so the UI can show 3 initially with "Show all" toggle
      // Excludes completed events
      {
        queryKey: queryKeys.events(communityId || ''),
        queryFn: async () => {
          const { data } = await supabase
            .from('events')
            .select('*')
            // Starts today or later, OR is a multi-day stretch still in progress.
            .or(`event_date.gte.${today},end_date.gte.${today}`)
            .eq('community_id', communityId!)
            .or('status.is.null,status.eq.scheduled')
            .order('event_date', { ascending: true })
            .limit(50);
          return (data as Event[]) || [];
        },
        enabled: !!communityId,
        staleTime: 10 * 60 * 1000, // Events change less frequently
      },
      // Annual birthday reminders generated from member profiles.
      {
        queryKey: ['memberBirthdays', communityId],
        queryFn: async () => {
          const { data, error } = (await supabase
            .from('community_memberships')
            .select('profiles!user_id(id, name, birthday)')
            .eq('community_id', communityId!)) as {
              data: { profiles: BirthdayMember | null }[] | null;
              error: { message?: string } | null;
            };

          if (error) {
            console.error('Error fetching birthdays:', error);
            return [];
          }

          return (data || [])
            .map((row) => row.profiles)
            .filter((member): member is BirthdayMember => !!member?.id && !!member.name && !!member.birthday)
            .map(getNextBirthdayEvent)
            .filter((event): event is Event => !!event)
            .sort((a, b) => a.event_date.localeCompare(b.event_date));
        },
        enabled: !!communityId,
        staleTime: 30 * 60 * 1000,
      },
      // Honey pot
      {
        queryKey: queryKeys.honeyPot(communityId || ''),
        queryFn: () => fetchHoneyPotBalance(communityId!),
        enabled: !!communityId,
        staleTime: 60 * 1000,
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
    wishesResult,
    grantedWishesResult,
    eventsResult,
    birthdayEventsResult,
    honeyPotResult,
    meetingsResult,
    adminResult,
    nextMeetingResult,
    userSkillsResult,
  ] = results;

  const isLoading = results.some((r) => r.isLoading);
  const isRefetching = results.some((r) => r.isRefetching);

  return {
    fallbackAdmin: adminResult.data || null,
    publicWishes: wishesResult.data || [],
    grantedWishes: grantedWishesResult.data || [],
    upcomingEvents: [
      ...((eventsResult.data || []) as Event[]),
      ...((birthdayEventsResult.data || []) as Event[]),
    ].sort((a, b) => {
      const dateCompare = a.event_date.localeCompare(b.event_date);
      if (dateCompare !== 0) return dateCompare;
      return (a.event_time || '').localeCompare(b.event_time || '');
    }),
    honeyPotBalance: honeyPotResult.data || 0,
    meetings: meetingsResult.data || [],
    nextMeeting: nextMeetingResult.data || null,
    userSkills: userSkillsResult.data || [],
    isLoading,
    isRefetching,
    // Per-query loading states for skeleton UI
    loading: {
      publicWishes: wishesResult.isLoading,
      grantedWishes: grantedWishesResult.isLoading,
      events: eventsResult.isLoading || birthdayEventsResult.isLoading,
      honeyPot: honeyPotResult.isLoading,
    },
    refetch: () => Promise.all(results.map((r) => r.refetch())),
  };
}
