import '../global.css';
import { useEffect, useState, useCallback } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View, ActivityIndicator } from 'react-native';
import { Session, User } from '@supabase/supabase-js';
import { QueryClientProvider } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { queryClient } from '../lib/queryClient';
import { AuthContext } from '../lib/hooks/useAuth';
import { usePrefetchAppData } from '../lib/hooks/usePrefetchAppData';
import type { Profile, Community, UserRole } from '../types';
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

export default function RootLayout() {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [community, setCommunity] = useState<Community | null>(null);
  const [communityId, setCommunityId] = useState<string | null>(null);
  const [communityRole, setCommunityRole] = useState<UserRole | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const [fontsLoaded] = useFonts({
    LibreBaskerville_400Regular,
    LibreBaskerville_700Bold,
    Lato_400Regular,
    Lato_700Bold,
  });

  // Optimized: Fetch profile and memberships in parallel to reduce startup latency
  const initializeUserData = useCallback(async (userId: string, authUser: User) => {
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
    }

    if (profileData) {
      setProfile(profileData);
    }

    // Handle community context
    const memberships = (membershipsResult.data || []) as MembershipWithCommunity[];

    if (memberships.length === 0) {
      setCommunity(null);
      setCommunityId(null);
      setCommunityRole(null);
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

    // Set all community context at once
    setCommunityId(activeMembership.community_id);
    setCommunityRole(activeMembership.role);
    setCommunity(activeMembership.community);
    setLoading(false);
  }, []);

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session?.user) {
        initializeUserData(session.user.id, session.user);
      } else {
        setLoading(false);
      }
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      if (session?.user) {
        initializeUserData(session.user.id, session.user);
      } else {
        setProfile(null);
        setCommunity(null);
        setCommunityId(null);
        setCommunityRole(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, [initializeUserData]);

  const refreshProfile = async () => {
    if (session?.user) {
      await initializeUserData(session.user.id, session.user);
    }
  };

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
        isAuthenticated={!!session && !loading}
      />
      <AuthContext.Provider value={{
        session,
        profile,
        community,
        communityId,
        communityRole,
        loading,
        refreshProfile,
      }}>
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
