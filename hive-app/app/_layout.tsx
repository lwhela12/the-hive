import '../global.css';
import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { Stack, usePathname, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View, Text, Pressable, Platform } from 'react-native';
import { Session, User } from '@supabase/supabase-js';
import { QueryClientProvider } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { queryClient } from '../lib/queryClient';
import { AuthContext } from '../lib/hooks/useAuth';
import { usePrefetchAppData } from '../lib/hooks/usePrefetchAppData';
import { clearLastAppPath } from '../lib/navigationState';
import {
  clearHiveConfirmation,
  hasConfirmedHive,
  markHiveConfirmed,
  isWholeHiveSelected,
  setWholeHiveSelected,
} from '../lib/hiveSelection';
import { clearBoardNavigationState } from '../lib/boardNavigation';
import { HIVE_WIDE_ROUTE } from '../lib/navigation';
import { resetHomeNavigationState } from '../lib/homeNavigation';
import type { Profile, Community, UserRole } from '../types';
import { MaintenanceScreen } from '../components/ui/MaintenanceScreen';
import { ErrorBoundary } from '../components/ui/ErrorBoundary';
import { routeAfterHiveSwitch } from '../lib/hiveSwitchRoute';
import { HIVE_CLOSED, isHiveKeeper, hasBypassTicket } from '../lib/maintenance';
import { HIVE_GOLD } from '../lib/hiveBrand';
import { HIVE_SKIN } from '../lib/pageSkin';

// ---------------------------------------------------------------------------
// The door now lives in lib/maintenance.ts, so it reads the same as Jammin'
// Sprouts' and so the list of who still has a key sits next to the switch.
// ---------------------------------------------------------------------------
import { useFonts } from 'expo-font';
import { ThinkingBee } from '../components/ui/ThinkingBee';
import {
  LibreBaskerville_400Regular,
  LibreBaskerville_700Bold,
} from '@expo-google-fonts/libre-baskerville';
import {
  Lato_400Regular,
  Lato_700Bold,
} from '@expo-google-fonts/lato';

// ---------------------------------------------------------------------------
// The splash screen always ends.
//
// Two jobs run before the app can draw anything: reading the saved sign-in and
// downloading the fonts. Both can stall on a phone that shows full signal and
// has no working connection, and a stalled promise never fails — it simply
// never answers. A `.catch()` alone still leaves the gold bee flying forever
// with nothing to press, which is exactly what members were seeing.
//
// So each wait gets a deadline as well as a catch. Whichever arrives first, the
// splash screen comes down and the member gets words.
// ---------------------------------------------------------------------------
const SESSION_DEADLINE_MS = 12000;
const FONT_DEADLINE_MS = 8000;

/** The same work, with a promise that fails if the answer never comes. */
function withDeadline<T>(work: PromiseLike<T>, ms: number, what: string): Promise<T> {
  let answered = false;
  const deadline = new Promise<never>((_, reject) => {
    setTimeout(() => {
      if (!answered) reject(new Error(`${what} took too long`));
    }, ms);
  });
  const watched = Promise.resolve(work).then((value) => {
    answered = true;
    return value;
  });
  return Promise.race([watched, deadline]);
}

// ---------------------------------------------------------------------------
// Where you land: your own HIVE the first time, HIVE-Wide every time after.
//
// Nat's rule, 2026-08-06, after opening an invite on her phone: "the email
// invites bring people directly to their hive, and then any time you come in
// from the public facing website after that (any time you use the member log
// in) then it starts you out in HIVE-Wide." Somebody arriving for the very
// first time has never seen any of this, and a black photo of Earth is not
// their HIVE. Everybody after that keeps landing above the HIVEs, for the
// reason Nat gave for putting it there: "otherwise you might never go there."
//
// The signal is "this person accepted an invite a moment ago" — deliberately
// NOT "this person is in exactly one HIVE". Nearly every member is in exactly
// one, so counting memberships would keep almost everybody out of HIVE-Wide for
// good, which is the opposite of what it is for. A long-standing member of a
// single HIVE signing in normally has no fresh join to report, so they land
// above the HIVEs like everyone else.
//
// So the join screen says it out loud: it hands over the id of the HIVE it has
// just put somebody into, and the next load of their data honours it once and
// forgets it. A plain variable in this module is the right lifetime — the join
// screen sets it and calls refreshProfile() in the same breath, with no reload
// in between — and reading it clears it, so a fresh join can never colour a
// sign-in later on.
// ---------------------------------------------------------------------------
let justJoinedCommunityId: string | null = null;

/** Called by app/join.tsx the moment somebody becomes a member of a HIVE. */
export function markJustJoinedHive(communityId: string): void {
  justJoinedCommunityId = communityId;
}

/** The fresh join, if there is one — and only ever once. */
function takeJustJoinedHive(): string | null {
  const id = justJoinedCommunityId;
  justJoinedCommunityId = null;
  return id;
}

// Inner component to handle prefetching (must be inside QueryClientProvider)
function AppPrefetcher({
  communityId,
  userId,
  isAuthenticated,
}: {
  communityId: string | null;
  userId: string | null;
  isAuthenticated: boolean;
}) {
  usePrefetchAppData(communityId, userId, isAuthenticated);
  return null;
}

// Type for membership with joined community data
type MembershipWithCommunity = {
  community_id: string;
  role: UserRole;
  community: Community;
};

const isLocalWeb =
  Platform.OS === 'web' &&
  typeof window !== 'undefined' &&
  ['localhost', '127.0.0.1'].includes(window.location.hostname);

// Register service worker for PWA home screen caching (web only).
// Local development should always use fresh bundles, so clear any old dev worker.
if (Platform.OS === 'web' && typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    if (isLocalWeb) {
      navigator.serviceWorker.getRegistrations()
        .then((registrations) => registrations.forEach((registration) => registration.unregister()))
        .catch((err) => console.warn('Service worker cleanup failed:', err));

      if ('caches' in window) {
        caches.keys()
          .then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
          .catch((err) => console.warn('Cache cleanup failed:', err));
      }
      return;
    }

    navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' })
      .then((registration) => {
        let reloadingForWorker = false;
        const refreshForNewWorker = () => {
          if (reloadingForWorker) return;
          reloadingForWorker = true;
          window.location.reload();
        };

        navigator.serviceWorker.addEventListener('controllerchange', refreshForNewWorker, { once: true });

        registration.waiting?.postMessage({ type: 'SKIP_WAITING' });
        registration.addEventListener('updatefound', () => {
          const installingWorker = registration.installing;
          installingWorker?.addEventListener('statechange', () => {
            if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
              installingWorker.postMessage({ type: 'SKIP_WAITING' });
            }
          });
        });

        return registration.update();
      })
      .catch((err) => console.warn('Service worker registration failed:', err));
  });
}

function RootLayoutInner() {
  const pathname = usePathname();
  // switchCommunity and enterWholeHive are memoised without `pathname` in their
  // deps on purpose — rebuilding them on every navigation would churn the whole
  // auth context. A ref gives them today's path without that cost.
  const pathnameRef = useRef(pathname);
  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [community, setCommunity] = useState<Community | null>(null);
  const [communityId, setCommunityId] = useState<string | null>(null);
  // Whole HIVE is a place you can stand, not a HIVE you belong to — see the
  // note on `wholeHive` in lib/hooks/useAuth.ts for why it is not an id.
  // Seeded from the tab's own memory so a reload doesn't quietly move you.
  const [wholeHive, setWholeHiveState] = useState<boolean>(() => isWholeHiveSelected());
  const setWholeHive = useCallback((next: boolean) => {
    setWholeHiveSelected(next);
    setWholeHiveState(next);
  }, []);
  const [communityRole, setCommunityRole] = useState<UserRole | null>(null);
  const [memberships, setMemberships] = useState<MembershipWithCommunity[]>([]);
  const [hivePickerOpen, setHivePickerOpen] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  // True once the first read of the saved sign-in gave up. It puts a screen
  // with a Try again button in front of the member instead of a spinning bee.
  const [startupFailed, setStartupFailed] = useState<boolean>(false);

  const [fontsLoaded, fontError] = useFonts({
    LibreBaskerville_400Regular,
    LibreBaskerville_700Bold,
    Lato_400Regular,
    Lato_700Bold,
  });

  // A typeface that will not download holds nobody hostage.
  //
  // This used to read `const [fontsLoaded] = useFonts(...)`, throwing the error
  // away — so a font that failed to fetch left `fontsLoaded` false forever and
  // the app never got past the splash screen. The words matter more than the
  // lettering, so a font failure draws HIVE in the system font and says so in
  // the console. The deadline covers the other half: a download that hangs
  // without ever failing.
  const [fontWaitOver, setFontWaitOver] = useState<boolean>(false);
  useEffect(() => {
    if (fontsLoaded || fontError) return;
    const timer = setTimeout(() => setFontWaitOver(true), FONT_DEADLINE_MS);
    return () => clearTimeout(timer);
  }, [fontsLoaded, fontError]);
  useEffect(() => {
    if (fontError) {
      console.warn('[Fonts] HIVE fonts did not load, drawing in the system font:', fontError.message);
    }
  }, [fontError]);
  const fontsSettled = fontsLoaded || !!fontError || fontWaitOver;

  // Guard same-user duplicate loads while still allowing account switches to win.
  const initializingRef = useRef(false);
  const initializingUserIdRef = useRef<string | null>(null);

  // Which user's data is currently loaded — lets the auth listener tell a
  // routine token refresh apart from a real sign-in (see onAuthStateChange).
  const loadedUserIdRef = useRef<string | null>(null);
  useEffect(() => {
    loadedUserIdRef.current = profile?.id ?? null;
  }, [profile?.id]);

  // Optimized: Fetch profile and memberships in parallel to reduce startup latency
  const initializeUserData = useCallback(async (userId: string, authUser: User) => {
    if (initializingRef.current && initializingUserIdRef.current === userId) return;
    initializingRef.current = true;
    initializingUserIdRef.current = userId;
    // A fresh attempt takes the "could not reach the hive" screen back down —
    // signing in again counts as a retry, not only the button.
    setStartupFailed(false);
    const isCurrentLoad = () => initializingUserIdRef.current === userId;
    try {
    // Fetch profile AND all memberships (with community data) in parallel
    // This reduces 4-5 sequential calls to just 1 parallel batch.
    //
    // With a deadline on it, because this is the other way the splash screen
    // used to last forever: a request that stalls rather than failing keeps
    // `loading` true and never reaches the catch below.
    const [profileResult, membershipsResult] = await withDeadline(Promise.all([
      supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single(),
      supabase
        .from('community_memberships')
        .select('community_id, role, community:communities(*)')
        .eq('user_id', userId)
        .order('created_at', { ascending: true }),
    ]), SESSION_DEADLINE_MS, 'Loading your HIVE');

    // Handle profile
    let profileData = profileResult.data as Profile | null;

    if (profileResult.error && profileResult.error.code === 'PGRST116') {
      // Profile doesn't exist - create one from OAuth data
      const { data: newProfile } = await supabase
        .from('profiles')
        .insert({
          id: userId,
          name: authUser.user_metadata?.full_name || 'New Member',
          email: authUser.email || '',
          avatar_url: authUser.user_metadata?.avatar_url || null,
          role: 'member',
        })
        .select()
        .single();

      profileData = newProfile as Profile | null;
    } else if (profileResult.error) {
      console.error('[Auth] Profile fetch error:', profileResult.error.message);
    }

    if (!isCurrentLoad()) return;
    setProfile(profileData);

    // Handle community context
    if (membershipsResult.error) {
      console.error('[Auth] Memberships fetch error:', membershipsResult.error.message);
    }
    let memberships = (membershipsResult.data || []) as unknown as MembershipWithCommunity[];

    // If the JOIN query failed (e.g., communities RLS issue), retry without the join
    if (memberships.length === 0 && membershipsResult.error) {
      const { data: plainMemberships, error: retryError } = await supabase
        .from('community_memberships')
        .select('community_id, role')
        .eq('user_id', userId)
        .order('created_at', { ascending: true });

      if (retryError) {
        console.error('[Auth] Memberships retry error:', retryError.message);
      } else if (plainMemberships && plainMemberships.length > 0) {
        // Fetch the community separately
        const { data: communityData } = await supabase
          .from('communities')
          .select('*')
          .eq('id', plainMemberships[0].community_id)
          .single();
        memberships = plainMemberships.map(m => ({
          ...m,
          community: communityData as Community,
        })) as MembershipWithCommunity[];
      }
    }

    if (memberships.length === 0) {
      if (!isCurrentLoad()) return;
      setMemberships([]);
      setCommunity(null);
      setCommunityId(null);
      setCommunityRole(null);
      setHivePickerOpen(false);
      setLoading(false);
      return;
    }

    // A HIVE joined seconds ago wins over the remembered one — it is the whole
    // reason this person is standing here. Read after the empty-memberships
    // return above on purpose: if the new membership row has not caught up yet
    // the fresh join stays on the books for the next load rather than being
    // spent on a list that does not contain it yet.
    const justJoinedId = takeJustJoinedHive();
    const justJoinedMembership = justJoinedId
      ? memberships.find(m => m.community_id === justJoinedId)
      : undefined;

    // Find the active membership: use profile's current_community_id or fall back to first
    const currentCommunityId = profileData?.current_community_id;
    let activeMembership = justJoinedMembership ?? (currentCommunityId
      ? memberships.find(m => m.community_id === currentCommunityId)
      : memberships[0]);

    // If profile had a community_id but we don't have membership there, use first
    if (!activeMembership) {
      activeMembership = memberships[0];
    }

    // If using first membership and profile didn't have community set, update it (fire and forget)
    if (!currentCommunityId && activeMembership) {
      supabase
        .from('profiles')
        .update({ current_community_id: activeMembership.community_id })
        .eq('id', userId)
        .then();
    }

    if (!isCurrentLoad()) return;
    // Set all community context at once
    setMemberships(memberships);
    setCommunityId(activeMembership.community_id);
    setCommunityRole(activeMembership.role);
    setCommunity(activeMembership.community);

    // Nobody is asked "which HIVE today?" any more (Nat 2026-08-03).
    //
    // It was a reasonable question when landing you in one HIVE by default was
    // a coin flip. It stopped being one the moment HIVE-Wide moved under My
    // HIVEs: everybody is now in at least two places — HIVE-Wide and their own
    // HIVE — so arriving above all of them, and stepping down into one when you
    // want to, answers the question without asking it.
    //
    // A fresh arrival starts at HIVE-Wide. A reload inside the same tab keeps
    // wherever you already were, because being bounced out of what you were
    // reading is the thing the "fresh honey" bar already got wrong once.
    //
    // Somebody who has this second accepted an invite is the exception, and
    // lands inside the HIVE they joined (Nat 2026-08-06 — see the note on
    // markJustJoinedHive at the top of this file). It counts as answering the
    // "which HIVE?" question, so the rest of this tab's life leaves them where
    // they are, and their next sign-in starts above the HIVEs like anyone
    // else's.
    if (justJoinedId) {
      markHiveConfirmed();
      setWholeHive(false);
    } else if (!hasConfirmedHive()) {
      markHiveConfirmed();
      setWholeHive(true);
    }
    setLoading(false);
    } catch (err) {
      // Clearing loading on its own would drop somebody into an app that
      // believes they belong to no HIVE — which reads as "you have been thrown
      // out" rather than "the connection dropped". Say the true thing and
      // offer the Try again button instead.
      console.error('[Auth] initializeUserData failed:', err);
      if (isCurrentLoad()) {
        setStartupFailed(true);
        setLoading(false);
      }
    } finally {
      if (isCurrentLoad()) {
        initializingRef.current = false;
        initializingUserIdRef.current = null;
      }
    }
  }, []);

  // Read the saved sign-in. Separated out from the effect below so the Try
  // again button can run it again without tearing down the auth listener.
  const loadInitialSession = useCallback(() => {
    setStartupFailed(false);
    setLoading(true);

    withDeadline(supabase.auth.getSession(), SESSION_DEADLINE_MS, 'Reading your sign-in')
      .then(({ data: { session } }) => {
        setStartupFailed(false);
        setSession(session);
        if (session?.user) {
          setProfile(prev => prev?.id === session.user.id ? prev : null);
          setCommunity(null);
          setCommunityId(null);
          setCommunityRole(null);
          initializeUserData(session.user.id, session.user);
        } else {
          setLoading(false);
        }
      })
      .catch((err) => {
        // Usually a phone that has drifted off its connection. Say so and give
        // the member a button, rather than leaving the bee flying forever.
        console.error('[Auth] Could not read the saved sign-in:', err);
        setStartupFailed(true);
        setLoading(false);
      });
  }, [initializeUserData]);

  useEffect(() => {
    loadInitialSession();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      if (session?.user) {
        // Token refreshes fire every time the app regains focus. If this same
        // user's data is already loaded, keep the app mounted and move on —
        // tearing down to a loading screen here is what made in-progress
        // surveys/wizards "disappear" when people switched tabs and came back.
        const alreadyLoaded = loadedUserIdRef.current === session.user.id;
        if (alreadyLoaded && event !== 'USER_UPDATED') {
          return;
        }
        if (alreadyLoaded && event === 'USER_UPDATED') {
          // e.g. a newly linked login — refresh data quietly, no unmount.
          initializingRef.current = false;
          initializingUserIdRef.current = null;
          initializeUserData(session.user.id, session.user);
          return;
        }
        setLoading(true); // Re-enter loading state while we fetch user data
        setProfile(prev => prev?.id === session.user.id ? prev : null);
        setCommunity(null);
        setCommunityId(null);
        setCommunityRole(null);
        initializeUserData(session.user.id, session.user);
      } else {
        initializingUserIdRef.current = null;
        initializingRef.current = false;
        if (event === 'SIGNED_OUT') {
          clearLastAppPath();
          // Next person in gets asked which hive, even on a shared machine.
          clearHiveConfirmation();
          // A join that never finished being read belongs to the person who
          // just left, so it never follows the next account into a HIVE.
          justJoinedCommunityId = null;
        }
        setProfile(null);
        setCommunity(null);
        setCommunityId(null);
        setCommunityRole(null);
        setMemberships([]);
        setHivePickerOpen(false);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, [initializeUserData, loadInitialSession]);

  const refreshProfile = useCallback(async () => {
    if (session?.user) {
      // Reset guard so refresh can proceed
      initializingRef.current = false;
      initializingUserIdRef.current = null;
      await initializeUserData(session.user.id, session.user);
    }
  }, [session, initializeUserData]);

  const openHivePicker = useCallback(() => setHivePickerOpen(true), []);

  // Standing above the HIVEs rather than in one. Your real HIVE stays selected
  // underneath, so coming back down lands you where you were rather than at
  // whichever HIVE happens to be first in the list.
  const enterWholeHive = useCallback(() => {
    markHiveConfirmed();
    setHivePickerOpen(false);
    setWholeHive(true);
    // Stay on the page you're reading if it has an all-HIVEs version; only go
    // to the HIVE-Wide landing when it doesn't (Nat 2026-08-03). See
    // lib/hiveSwitchRoute.ts for why that is the rule.
    const next = routeAfterHiveSwitch(pathnameRef.current, 'wide');
    if (next) router.replace(next as never);
  }, []);

  // Move into another hive. Everything the app reads is keyed by community id,
  // so setting it here is the whole switch — the React Query keys change with
  // it and each screen refetches on its own.
  const switchCommunity = useCallback(async (nextCommunityId: string) => {
    const target = memberships.find(m => m.community_id === nextCommunityId);
    // Not a member? Then there is nothing to switch to. The picker only ever
    // lists real memberships, so this is a guard against a stale tap.
    if (!target) return;

    markHiveConfirmed();
    setHivePickerOpen(false);
    // Picking a HIVE by name is how you come down out of Whole HIVE.
    setWholeHive(false);

    if (target.community_id !== communityId) {
      // Where you were in the old hive means nothing in the new one.
      clearBoardNavigationState(communityId);
      resetHomeNavigationState();

      setCommunityId(target.community_id);
      setCommunityRole(target.role);
      setCommunity(target.community);
      setProfile(prev => (prev ? { ...prev, current_community_id: target.community_id } : prev));

      if (profile?.id) {
        const { error } = await supabase
          .from('profiles')
          .update({ current_community_id: target.community_id })
          .eq('id', profile.id);
        // A failed write only costs us the memory of this choice next time.
        if (error) console.error('[Auth] Could not remember hive choice:', error.message);
      }
    }

    // Changing HIVEs is not navigation — it is changing which HIVE the page you
    // already have open is ABOUT. So stay put wherever the page means something
    // here, and only fall back to home when it doesn't.
    const next = routeAfterHiveSwitch(pathnameRef.current, 'hive');
    if (next) router.replace(next as never);
  }, [memberships, communityId, profile?.id]);

  const authContextValue = useMemo(() => ({
    session,
    profile,
    community,
    communityId,
    communityRole,
    memberships,
    hivePickerOpen,
    openHivePicker,
    switchCommunity,
    wholeHive,
    enterWholeHive,
    loading,
    refreshProfile,
  }), [
    session, profile, community, communityId, communityRole, memberships,
    hivePickerOpen, openHivePicker, switchCommunity, wholeHive, enterWholeHive,
    loading, refreshProfile,
  ]);
  const isJoinRoute = pathname === '/join' || pathname?.startsWith('/join/');

  // The door, before anything else renders.
  //
  // Nat and Lucas walk through it on their own accounts now, so we can work on
  // a closed app without hunting for the ?bee=1 link every time (JJS has had
  // this for a while; HIVE was still on the query string alone).
  //
  // Note the order: while auth is still settling we show the gold splash rather
  // than the closed sign. Showing "we'll BEE right back" to Nat for a second and
  // then swapping it for the app looks like the app is broken — and worse, the
  // opposite order would flash the app at a member before shutting it.
  if (HIVE_CLOSED && !hasBypassTicket()) {
    const keeperIsHere = isHiveKeeper(session?.user?.email);
    if (!keeperIsHere) {
      if (loading) {
        return (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: HIVE_GOLD }}>
            <ThinkingBee />
          </View>
        );
      }
      if (fontsSettled) return <MaintenanceScreen />;
    }
  }

  // Show loading screen while fonts load
  if (!fontsSettled) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: HIVE_GOLD }}>
        <ThinkingBee />
      </View>
    );
  }

  // The connection gave out before HIVE could read who is signed in. This is
  // the same gold splash the member was already looking at, now with words on
  // it and a button — the state it used to sit in silently, forever.
  if (startupFailed) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 28, backgroundColor: HIVE_GOLD }}>
        <View style={{ maxWidth: 340, alignItems: 'center' }}>
          <Text style={{ fontSize: 44, marginBottom: 18 }}>🐝</Text>
          <Text
            style={{
              fontFamily: 'LibreBaskerville_700Bold', fontSize: 21, lineHeight: 30,
              color: HIVE_SKIN.card, textAlign: 'center',
            }}
          >
            HIVE could not reach the hive
          </Text>
          <Text
            style={{
              fontFamily: 'Lato_400Regular', fontSize: 15, lineHeight: 24,
              color: HIVE_SKIN.card, opacity: 0.85, textAlign: 'center', marginTop: 12,
            }}
          >
            Your connection dropped while HIVE was checking you in. Have a look
            at your signal, then give it another go.
          </Text>
          <Pressable
            onPress={loadInitialSession}
            style={({ pressed }) => ({
              marginTop: 24, paddingVertical: 14, paddingHorizontal: 34,
              borderRadius: 14, backgroundColor: HIVE_SKIN.card,
              opacity: pressed ? 0.8 : 1,
            })}
          >
            <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 16, color: HIVE_GOLD }}>
              Try again
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <AppPrefetcher
        communityId={communityId}
        userId={profile?.id ?? null}
        isAuthenticated={!!session && !loading && !isJoinRoute}
      />
      <AuthContext.Provider value={authContextValue}>
        <StatusBar style="dark" />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(app)" />
          {/* app/onboarding/ was removed on 2026-08-06 — it was a reachable URL
              still selling a 12-person community and Queen Bee Month, both
              retired, and nothing linked to it. A Stack.Screen naming a route
              that has no folder throws at runtime, so the line goes with it. */}
          <Stack.Screen name="join" />
        </Stack>
      </AuthContext.Provider>
    </QueryClientProvider>
  );
}

/**
 * The root of the app, with the net underneath it.
 *
 * The boundary sits outside everything — the maintenance door, the fonts, the
 * auth context, every screen — because a render error anywhere below it used to
 * take the whole tree down to a blank white page with no scroll and no way
 * back. Now it catches, and the member gets a sentence and a button.
 */
export default function RootLayout() {
  return (
    <ErrorBoundary>
      <RootLayoutInner />
    </ErrorBoundary>
  );
}
