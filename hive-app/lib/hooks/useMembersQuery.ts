/**
 * Who is here — fetched in two goes, so the faces arrive first.
 *
 * The Members screen used to load in three waves, one after the other, and drew
 * nothing at all until the last one landed:
 *
 *   1. `community_memberships` — who is in these HIVEs
 *   2. `profiles` — waits for (1), because it filters on those ids
 *   3. skills + wishes + intro posts + daily answers — waits for (2)
 *
 * Three trips to the database stacked end to end, and a bee flying over an empty
 * page for all of them. Nat, on her phone, 2026-08-06: *"I wish the load times
 * were way faster, so we didn't have so many bees. There's a long load time in
 * HIVE-Wide members screen."*
 *
 * Two changes, and they are separate ideas:
 *
 * **The roster is now one trip, not two.** A membership row and the profile it
 * points at come back together — `community_memberships` has a foreign key to
 * `profiles`, so the database can join them itself. That is a name, a face and a
 * role: everything the honeycomb draws on a phone.
 *
 * **Everything else is a second, later trip.** Skills, wishes, intro posts and
 * daily answers fill in the match badge, the wish count and the member card.
 * They are worth having and they are not worth staring at a bee for, so the comb
 * paints from the roster and these land underneath it.
 *
 * Both are TanStack Query, so walking away from Members and coming back paints
 * from cache instantly instead of running the whole thing again.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../supabase';
import type { UserRole } from '../../types';

/**
 * The profile columns the directory and the member card actually read.
 *
 * This was `select('*')`, which handed every member's row to every other member
 * — and a profile row carries `google_refresh_token`, `push_token`, `email` and
 * `phone`. Row-level security decides which ROWS you may read; it has no opinion
 * about columns, so "everything" meant everything. Naming the columns is both a
 * smaller download and a smaller thing to leak.
 */
const MEMBER_PROFILE_COLUMNS = [
  'id',
  'name',
  'avatar_url',
  'role',
  'birthday',
  'occupation',
  'profile_title',
  'bio',
  'current_project',
  'currently_reading',
  'hometown',
  'favorite_book',
  'favorite_food',
  'favorite_hobby',
  'known_for',
  'miq_experiences',
  'miq_growth',
  'miq_contribution',
  'fun_facts',
].join(', ');

export type MemberProfileRow = {
  id: string;
  name: string | null;
  avatar_url?: string | null;
  role?: UserRole | null;
  birthday?: string | null;
  occupation?: string | null;
  profile_title?: string | null;
  bio?: string | null;
  current_project?: string | null;
  currently_reading?: string | null;
  hometown?: string | null;
  favorite_book?: string | null;
  favorite_food?: string | null;
  favorite_hobby?: string | null;
  known_for?: string | null;
  miq_experiences?: string | null;
  miq_growth?: string | null;
  miq_contribution?: string | null;
  fun_facts?: string[] | null;
};

export type MemberRosterEntry = {
  userId: string;
  /** The highest role this person holds in any of the HIVEs being looked at. */
  role: UserRole;
  profile: MemberProfileRow;
};

export type MemberDetailRows = {
  skills: any[];
  wishes: any[];
  intros: any[];
  answers: any[];
};

/** Highest role anybody holds anywhere wins, so nobody is listed twice. */
const ROLE_RANK: Record<string, number> = { member: 0, treasurer: 1, admin: 2 };

function scopeKey(scopeIds: string[]) {
  return [...scopeIds].sort().join(',');
}

/**
 * The faces. One round trip.
 *
 * `profiles!inner(...)` asks the database to hand back each membership row with
 * its person attached. `!inner` means a membership with no readable profile is
 * dropped rather than drawn as "Unknown member" — which is what the screen did
 * by hand afterwards, and the honest answer either way: a row you cannot read is
 * somebody who has not agreed to be seen by you.
 *
 * **The HIVE-Wide filter is unchanged and it is load-bearing.** At HIVE-Wide
 * only `profile_scope = 'all_hives'` is listed. Row-level security lets you read
 * the profile of anybody who shares a HIVE with you (migration 135), so at
 * HIVE-Wide — where the scope is *your* HIVEs — this filter, not the database
 * policy, is what keeps somebody who kept to their own HIVE out of the list.
 * It now runs inside the query, so those rows never leave the database at all.
 */
export function useMemberRosterQuery({
  scopeIds,
  wholeHive,
  enabled = true,
}: {
  scopeIds: string[];
  wholeHive: boolean;
  enabled?: boolean;
}) {
  const key = scopeKey(scopeIds);

  return useQuery<MemberRosterEntry[]>({
    queryKey: ['membersRoster', key, wholeHive],
    enabled: enabled && scopeIds.length > 0,
    queryFn: async () => {
      const run = async (columns: string) => {
        let query = supabase
          .from('community_memberships')
          .select(`user_id, role, profiles!inner(${columns})`)
          .in('community_id', scopeIds);
        if (wholeHive) query = query.eq('profiles.profile_scope', 'all_hives');
        return query;
      };

      let { data, error } = await run(MEMBER_PROFILE_COLUMNS);

      // A column named here that the database has not got would 400 the whole
      // directory and leave the page empty. Falling back to every column is
      // slower and wider, and it is a list of people rather than a blank screen.
      if (error) {
        console.warn('[Members] roster load failed, retrying wide', error);
        ({ data, error } = await run('*'));
      }

      if (error || !data) throw error ?? new Error('Could not load members.');

      // Somebody in two of your HIVEs is still one person (Nat 2026-08-03).
      const byUser = new Map<string, MemberRosterEntry>();
      for (const row of data as any[]) {
        const userId = row?.user_id;
        const memberProfile = row?.profiles;
        if (!userId || !memberProfile) continue;
        const role = (row.role ?? memberProfile.role ?? 'member') as UserRole;
        const existing = byUser.get(userId);
        if (existing && (ROLE_RANK[role] ?? 0) <= (ROLE_RANK[existing.role] ?? 0)) continue;
        byUser.set(userId, { userId, role, profile: memberProfile as MemberProfileRow });
      }

      return Array.from(byUser.values());
    },
  });
}

/**
 * Everything the faces do not need to appear.
 *
 * Four queries, all sent together, all after the comb is already on screen.
 * There is no fan-out here — each one asks for every member at once with `in`,
 * so a HIVE of forty costs the same four trips as a HIVE of four.
 */
export function useMemberDetailsQuery({
  communityId,
  scopeIds,
  userIds,
  enabled = true,
}: {
  communityId?: string | null;
  scopeIds: string[];
  userIds: string[];
  enabled?: boolean;
}) {
  const ids = [...userIds].sort();

  return useQuery<MemberDetailRows>({
    queryKey: ['membersDetails', communityId ?? '', scopeKey(scopeIds), ids.join(',')],
    enabled: enabled && !!communityId && ids.length > 0,
    queryFn: async () => {
      const [skillsRes, wishesRes, introRes, answersRes] = await Promise.all([
        supabase
          .from('skills')
          .select('user_id, id, description, enthusiasm_level, display_x, display_y')
          .eq('community_id', communityId!)
          .in('user_id', ids),
        supabase
          .from('wishes')
          // `share_scope` and `community_id` are named here — and in every other
          // wish query on this screen — because these rows feed the wish EDITOR.
          // Without the scope the form read "I don't know" as "This HIVE only"
          // and saved that back, so opening a HIVE-Wide wish from a member card
          // to fix a typo quietly demoted it. Half of why Nat's HIVE-Wide picks
          // never stuck (2026-08-05); the other half was the picker itself.
          //
          // The granter's profile used to come back as `(*)`. Three components
          // draw a granter — WishCombCard, WishCard, WishDetail — and all three
          // read exactly a name and a face. The rest was a full profile row per
          // granter per wish, downloaded to be thrown away.
          .select('user_id, id, community_id, share_scope, title, description, status, is_active, is_spotlight, created_at, fulfilled_at, thank_you_message, granters:wish_granters(*, granter:profiles!granter_id(id, name, avatar_url))')
          .eq('community_id', communityId!)
          .in('user_id', ids)
          .in('status', ['public', 'fulfilled'])
          .order('created_at', { ascending: false }),
        supabase
          .from('board_posts')
          .select('author_id, title, content, board_categories!inner(category_type)')
          .eq('community_id', communityId!)
          .eq('board_categories.category_type', 'introductions')
          .in('author_id', ids),
        supabase
          .from('daily_question_answers')
          // Every HIVE you are in, not just the one you are standing in.
          //
          // This was pinned to a single community while the member list beside
          // it already spanned all of them, so at HIVE-Wide somebody from Tech
          // appeared with no match data at all and nothing saying why. Widening
          // it is only safe now that pairs are made by QUESTION rather than by
          // date — see lib/swarmMatch.ts for what would have happened otherwise.
          //
          // `community_id` comes back because it says which DECK an answer
          // belongs to, and `gist` because it is what makes the match about
          // meaning instead of shared words.
          .select('user_id, community_id, question_index, question_date, answer, created_at, gist')
          .in('community_id', scopeIds)
          .in('user_id', ids),
      ]);

      let wishesData = (wishesRes.data ?? null) as any[] | null;
      let wishesError = wishesRes.error;

      const wishFallback = async (columns: string, blankTitle: boolean) => {
        const fallback = await supabase
          .from('wishes')
          .select(columns)
          .eq('community_id', communityId!)
          .in('user_id', ids)
          .in('status', ['public', 'fulfilled'])
          .order('created_at', { ascending: false });
        wishesData = blankTitle
          ? (fallback.data ?? []).map((wish: any) => ({ ...wish, title: null }))
          : ((fallback.data ?? []) as any[]);
        wishesError = fallback.error;
      };

      const withGranters = 'user_id, id, community_id, share_scope, description, status, is_active, is_spotlight, created_at, fulfilled_at, thank_you_message, granters:wish_granters(*, granter:profiles!granter_id(id, name, avatar_url))';
      const withTitle = 'user_id, id, community_id, share_scope, title, description, status, is_active, is_spotlight, created_at, fulfilled_at, thank_you_message';
      const bare = 'user_id, id, community_id, share_scope, description, status, is_active, is_spotlight, created_at, fulfilled_at, thank_you_message';

      if (wishesError && String(wishesError.message ?? '').includes('title')) {
        await wishFallback(withGranters, true);
      }
      if (
        wishesError &&
        (String(wishesError.message ?? '').includes('wish_granters') ||
          String(wishesError.message ?? '').includes('granter') ||
          String(wishesError.message ?? '').includes('relationship') ||
          String(wishesError.message ?? '').includes('schema cache'))
      ) {
        await wishFallback(withTitle, false);
      }
      if (wishesError && String(wishesError.message ?? '').includes('title')) {
        await wishFallback(bare, true);
      }

      // One of these failing is a thinner member card, never a blank directory —
      // the comb is already drawn by the time any of this arrives.
      if (skillsRes.error) console.warn('[Members] skills load failed', skillsRes.error);
      if (wishesError) console.warn('[Members] wishes load failed', wishesError);
      if (introRes.error) console.warn('[Members] intro posts load failed', introRes.error);
      if (answersRes.error) console.warn('[Members] daily answers load failed', answersRes.error);

      return {
        skills: (skillsRes.data ?? []) as any[],
        wishes: wishesData ?? [],
        intros: (introRes.data ?? []) as any[],
        answers: (answersRes.data ?? []) as any[],
      };
    },
  });
}
