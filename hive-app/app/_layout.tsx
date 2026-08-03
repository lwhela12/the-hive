import '../global.css';
import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { Stack, usePathname, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View, ActivityIndicator, Platform } from 'react-native';
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
} from '../lib/hiveSelection';
import { clearBoardNavigationState } from '../lib/boardNavigation';
import { resetHomeNavigationState } from '../lib/homeNavigation';
import type { Profile, Community, UserRole } from '../types';
import { MaintenanceScreen } from '../components/ui/MaintenanceScreen';

// ---------------------------------------------------------------------------
// The door. Flip to true and push to close the app to members; the screen and
// the ?bee=1 bypass are already wired, so that is the whole switch.
// Closed overnight 2026-08-02; reopened the morning of 2026-08-03; closed again
// an hour later, when an audit found eighteen ways data could cross a boundary
// it shouldn't. Nat's call and the right one — it stays shut until we know what
// is what, not until the list is merely shorter.
// ---------------------------------------------------------------------------
const MAINTENANCE = true;

const MAINTENANCE_BYPASS_KEY = 'hive:bee';

function maintenanceHoldsUs(): boolean {
  if (!MAINTENANCE) return false;
  if (Platform.OS !== 'web' || typeof window === 'undefined') return MAINTENANCE;
  try {
    if (new URLSearchParams(window.location.search).get('bee') === '1') {
      window.sessionStorage.setItem(MAINTENANCE_BYPASS_KEY, '1');
      return false;
    }
    return window.sessionStorage.getItem(MAINTENANCE_BYPASS_KEY) !== '1';
  } catch {
    return true;
  }
}
import { useFonts } from 'expo-font';
import {
  LibreBaskerville_400Regular,
  LibreBaskerville_700Bold,
} from '@expo-google-fonts/libre-baskerville';
import {
  Lato_400Regular,
  Lato_700Bold,
} from '@expo-google-fonts/lato';

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

export default function RootLayout() {
  const pathname = usePathname();
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [community, setCommunity] = useState<Community | null>(null);
  const [communityId, setCommunityId] = useState<string | null>(null);
  const [communityRole, setCommunityRole] = useState<UserRole | null>(null);
  const [memberships, setMemberships] = useState<MembershipWithCommunity[]>([]);
  const [hivePickerOpen, setHivePickerOpen] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);

  const [fontsLoaded] = useFonts({
    LibreBaskerville_400Regular,
    LibreBaskerville_700Bold,
    Lato_400Regular,
    Lato_700Bold,
  });

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
    const isCurrentLoad = () => initializingUserIdRef.current === userId;
    try {
    // Fetch profile AND all memberships (with community data) in parallel
    // This reduces 4-5 sequential calls to just 1 parallel batch
    const [profileResult, membershipsResult] = await Promise.all([
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
    ]);

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

    // Find the active membership: use profile's current_community_id or fall back to first
    const currentCommunityId = profileData?.current_community_id;
    let activeMembership = currentCommunityId
      ? memberships.find(m => m.community_id === currentCommunityId)
      : memberships[0];

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

    // One hive means there is nothing to ask. More than one and this person
    // gets the picker on arrival — landing them somewhere by default is a coin
    // flip, and the wrong hive is a confusing place to wake up.
    if (memberships.length > 1 && !hasConfirmedHive()) {
      setHivePickerOpen(true);
    } else {
      markHiveConfirmed();
    }
    setLoading(false);
    } catch (err) {
      console.error('[Auth] initializeUserData failed:', err);
      if (isCurrentLoad()) {
        setLoading(false);
      }
    } finally {
      if (isCurrentLoad()) {
        initializingRef.current = false;
        initializingUserIdRef.current = null;
      }
    }
  }, []);

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
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
    });

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
  }, [initializeUserData]);

  const refreshProfile = useCallback(async () => {
    if (session?.user) {
      // Reset guard so refresh can proceed
      initializingRef.current = false;
      initializingUserIdRef.current = null;
      await initializeUserData(session.user.id, session.user);
    }
  }, [session, initializeUserData]);

  const openHivePicker = useCallback(() => setHivePickerOpen(true), []);

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

    router.replace('/hive');
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
    loading,
    refreshProfile,
  }), [
    session, profile, community, communityId, communityRole, memberships,
    hivePickerOpen, openHivePicker, switchCommunity, loading, refreshProfile,
  ]);
  const isJoinRoute = pathname === '/join' || pathname?.startsWith('/join/');

  // Closed for the night, before anything else renders.
  if (maintenanceHoldsUs() && fontsLoaded) {
    return <MaintenanceScreen />;
  }

  // Show loading screen while fonts load
  if (!fontsLoaded) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#bd9348' }}>
        <ActivityIndicator size="large" color="#FFFFFF" />
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
          <Stack.Screen name="onboarding" />
          <Stack.Screen name="join" />
        </Stack>
      </AuthContext.Provider>
    </QueryClientProvider>
  );
}
