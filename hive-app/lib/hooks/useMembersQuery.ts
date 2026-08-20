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
 * **The roster is now one trip, not two.** A person and the membership that puts
 * them in this list come back together — `community_memberships` has a foreign
 * key to `profiles`, so the database can join them itself. That is a name, a
 * face and a role: everything the honeycomb draws on a phone.
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
import { warmAvatarCache } from '../../components/ui/Avatar';
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
  /** This HIVE's own cards (migration 194) — shown for members whose whole card does not travel. */
  cards: any[];
};

/** Highest role anybody holds anywhere wins. */
const ROLE_RANK: Record<string, number> = { member: 0, treasurer: 1, admin: 2 };

function scopeKey(scopeIds: string[]) {
  return [...scopeIds].sort().join(',');
}

/**
 * The faces. One round trip, one row per person.
 *
 * The question is asked from the person's side: **which people, out of the ones
 * I may read, hold a membership in these HIVEs** — `community_memberships!inner`
 * carries the role along and `!inner` drops anybody with no membership you can
 * see. It was asked from the membership side, which is the same set of people
 * and a different number of rows: somebody in three HIVEs came back three times,
 * carrying a full copy of their profile each time, and the screen threw two of
 * them away. That is nobody's problem at HIVE-Wide today, where the list is one
 * person — and it is the shape that gets worse fastest as people opt in, because
 * it multiplies by the number of HIVEs rather than the number of members.
 * Measured against the live database on 2026-08-06: 8.0 KB down to 2.8 KB at
 * HIVE-Wide, the same 150 ms either way.
 *
 * **150 ms either way is the real finding.** The database is not what anybody is
 * waiting for on this screen — every question in this file comes back in about
 * the time one round trip takes, whichever way it is asked. What costs a phone
 * is how many trips have to happen one after another, so the work here is to
 * keep this at one and to start the faces signing the moment the names land,
 * rather than a render later.
 *
 * **The HIVE-Wide filter is unchanged and it is load-bearing.** At HIVE-Wide
 * only `profile_scope = 'all_hives'` is listed. Row-level security lets you read
 * the profile of anybody who shares a HIVE with you (migration 135), so at
 * HIVE-Wide — where the scope is *your* HIVEs — this filter, not the database
 * policy, is what keeps somebody who kept to their own HIVE out of the list. It
 * sits on `profiles` itself now rather than on an embedded table, which is the
 * plainest place for it to be. Checked against live data from two accounts on
 * 2026-08-06: both shapes return exactly the same people, both return nothing at
 * all for a HIVE you are not a member of, and both list exactly one person at
 * HIVE-Wide.
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
  return useQuery<MemberRosterEntry[]>({
    ...memberRosterQueryOptions(scopeIds, wholeHive),
    enabled: enabled && scopeIds.length > 0,
  });
}

/**
 * The roster's key and its fetch, in one place so it can be WARMED as well as
 * read.
 *
 * `usePrefetchAppData` starts wishes, events, chat rooms, boards and the honey
 * pot the moment somebody signs in, and Members was missing from that list — so
 * the most common path in the app (land at HIVE-Wide, tap Members) always paid a
 * full round trip that could have been spent while she was reading the landing
 * page. A hook cannot be called from a prefetch, so the query moved out here and
 * the hook spreads it.
 */
export function memberRosterQueryOptions(scopeIds: string[], wholeHive: boolean) {
  const key = scopeKey(scopeIds);
  return {
    queryKey: ['membersRoster', key, wholeHive] as const,
    queryFn: async (): Promise<MemberRosterEntry[]> => {
      const run = async (columns: string) => {
        // HIVE-Wide may show a profile only because that person opted their
        // card in. That choice does not publish which HIVE they administer or
        // whether they are a treasurer, so the shared-directory query does not
        // fetch membership roles at all.
        const membershipColumns = wholeHive ? 'community_id' : 'community_id, role';
        let query = supabase
          .from('profiles')
          .select(`${columns}, community_memberships!inner(${membershipColumns})`)
          .in('community_memberships.community_id', scopeIds);
        if (wholeHive) query = query.eq('profile_scope', 'all_hives');
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

      const roster: MemberRosterEntry[] = [];
      for (const row of data as any[]) {
        if (!row?.id) continue;
        const { community_memberships: heldMemberships, ...memberProfile } = row;
        // The highest role anybody holds in any of these HIVEs wins, so somebody
        // who runs one HIVE and sits quietly in another is listed as what they
        // are at their most (Nat 2026-08-03). A role held in a HIVE always beats
        // the one on the profile row; the profile's is what is left when there
        // is no role on the membership at all.
        let role: UserRole | null = wholeHive ? 'member' : null;
        if (!wholeHive) {
          for (const held of (heldMemberships ?? []) as any[]) {
            const heldRole = held?.role as UserRole | undefined;
            if (!heldRole) continue;
            if (!role || (ROLE_RANK[heldRole] ?? 0) > (ROLE_RANK[role] ?? 0)) role = heldRole;
          }
        }
        roster.push({
          userId: row.id,
          role: wholeHive ? 'member' : role ?? ((memberProfile.role ?? 'member') as UserRole),
          profile: memberProfile as MemberProfileRow,
        });
      }

      // Sign every face now, rather than a render later.
      //
      // This ran in an effect on the Members screen, which means it could not
      // start until React had drawn the whole directory — and at HIVE-Wide there
      // is an animated planet drawing behind that. On a phone the names were on
      // screen and the faces were still waiting on a request that had not been
      // sent yet. Nothing waits on this and a face that lands first still signs
      // itself, so it can only ever make the page quicker.
      void warmAvatarCache(roster.map((entry) => entry.profile?.avatar_url));

      return roster;
    },
  };
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
      const [skillsRes, wishesRes, introRes, answersRes, cardsRes] = await Promise.all([
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
        // This HIVE's own cards (migration 194). A member whose switch keeps
        // their card home shows THIS HIVE's card here — honestly blank when
        // they never wrote one — while a travelling card keeps reading from
        // the profile row itself.
        supabase
          .from('hive_cards')
          .select('*')
          .eq('community_id', communityId!)
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
      if (cardsRes.error) console.warn('[Members] hive cards load failed', cardsRes.error);

      return {
        skills: (skillsRes.data ?? []) as any[],
        wishes: wishesData ?? [],
        intros: (introRes.data ?? []) as any[],
        answers: (answersRes.data ?? []) as any[],
        cards: (cardsRes.data ?? []) as any[],
      };
    },
  });
}
