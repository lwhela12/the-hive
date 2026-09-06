import { useQueries } from '@tanstack/react-query';
import { supabase } from '../supabase';
import { queryKeys } from '../queryClient';
import { fetchHoneyPotBalance } from '../honeyPot';
import { getQuarterlyDuesReminderEvent } from '../dues';
import type {
  Wish,
  WishGranter,
  Event,
  Profile,
} from '../../types';

// `Profile` carries a string index signature (it `extends Record<string,
// unknown>`), so `Pick<Profile, ...>` can only reach fields the interface
// actually declares — and `birthday_visibility`/`birthday_invited_scope`
// (migration 164) aren't declared there yet. Intersecting instead of picking
// sidesteps that without having to touch a file this session doesn't own.
type BirthdayMember = Pick<Profile, 'id' | 'name' | 'birthday'> & {
  birthday_visibility?: string | null;
  birthday_invited_scope?: string | null;
};

/**
 * Everything Home needs, fetched in parallel.
 *
 * Four unread queries were still here as of 2026-08-11:
 * `fallbackAdmin`, `meetings`, `nextMeeting` and `userSkills` were all fetched
 * on every Home load and none of the four was ever read — `hive.tsx`'s one
 * call site destructures only `publicWishes`, `grantedWishes`, `upcomingEvents`,
 * `honeyPotBalance`, `isLoading`, `loading` and `refetch`. Worse than idle: the
 * blanket `isLoading` this hook returns (which gates Home's spinner and pull-
 * to-refresh) waited on all nine queries finishing, so a slow, useless fetch
 * could keep the real data hidden behind a spinner. Removed rather than left
 * wired up "for later". An unread query is never actually free.
 */
export function useHiveDataQuery(
  communityId?: string,
  userId?: string,
  includeOgDuesReminder = false,
) {
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
      // Carried straight onto the synthetic event as the same field names a
      // real event uses (migration 148's `events.visibility`/`invited_scope`),
      // so every place that already reads those two fields off an `Event` —
      // `ScopeBadge`, `isInvitedToEvent`, the event card in `hive.tsx` — works
      // on a birthday without knowing it's synthetic. Nat, 2026-08-11: "I
      // friggin love my bday" — she wants hers to travel further than her own
      // HIVE, which migration 164's `profiles.birthday_visibility` /
      // `birthday_invited_scope` now make possible, per-member, defaulting to
      // `members` so nobody's birthday travels without them choosing it.
      visibility: member.birthday_visibility ?? 'members',
      invited_scope: member.birthday_invited_scope ?? member.birthday_visibility ?? 'members',
    };
  };

  // Use useQueries for parallel fetching
  const results = useQueries({
    queries: [
      // Public wishes (open)
      {
        queryKey: queryKeys.publicWishes(communityId || ''),
        queryFn: async () => {
          // `user:profiles!user_id(*)` used to hand back every column on the
          // author's profile — bio, hometown, all three 3MIQ answers, fun
          // facts — for a card that only ever draws a name and an avatar
          // (`WishCard`/`WishDetail`, checked 2026-08-11). Narrowed to the
          // three fields actually read; same fix below for granters.
          let { data, error } = await (supabase as any)
            .from('wishes')
            .select('*, user:profiles!user_id(id, name, avatar_url), board_category:board_categories!wishes_board_category_id_fkey(id, name, topic_kind, status)')
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
              .select('*, user:profiles!user_id(id, name, avatar_url)')
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
              '*, user:profiles!user_id(id, name, avatar_url), board_category:board_categories!wishes_board_category_id_fkey(id, name, topic_kind, status), granters:wish_granters(*, granter:profiles!granter_id(id, name, avatar_url))'
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
                '*, user:profiles!user_id(id, name, avatar_url), granters:wish_granters(*, granter:profiles!granter_id(id, name, avatar_url))'
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
            .select('profiles!user_id(id, name, birthday, birthday_visibility, birthday_invited_scope)')
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
    ],
  });

  const [
    wishesResult,
    grantedWishesResult,
    eventsResult,
    birthdayEventsResult,
    honeyPotResult,
  ] = results;

  const isLoading = results.some((r) => r.isLoading);
  const isRefetching = results.some((r) => r.isRefetching);

  const upcomingEvents = [
    ...((eventsResult.data || []) as Event[]),
    ...((birthdayEventsResult.data || []) as Event[]),
  ];

  if (communityId && includeOgDuesReminder) {
    const duesReminder = getQuarterlyDuesReminderEvent(communityId, now);
    const alreadyOnCalendar = upcomingEvents.some((event) => (
      event.event_date === duesReminder.event_date && /\bdues?\b/i.test(event.title)
    ));
    if (!alreadyOnCalendar) upcomingEvents.push(duesReminder as unknown as Event);
  }

  return {
    publicWishes: wishesResult.data || [],
    grantedWishes: grantedWishesResult.data || [],
    upcomingEvents: upcomingEvents.sort((a, b) => {
      const dateCompare = a.event_date.localeCompare(b.event_date);
      if (dateCompare !== 0) return dateCompare;
      return (a.event_time || '').localeCompare(b.event_time || '');
    }),
    honeyPotBalance: honeyPotResult.data || 0,
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
