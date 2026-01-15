import '../global.css';
import { useEffect, useState, useCallback } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View, ActivityIndicator } from 'react-native';
import { Session } from '@supabase/supabase-js';
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

  useEffect(() => {
    // Get initial session (Supabase handles OAuth callback automatically with detectSessionInUrl: true)
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session?.user) {
        fetchProfile(session.user.id);
      } else {
        setLoading(false);
      }
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      if (session?.user) {
        fetchProfile(session.user.id);
      } else {
        setProfile(null);
        setCommunity(null);
        setCommunityId(null);
        setCommunityRole(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchCommunityContext = useCallback(async (userId: string, activeCommunityId?: string | null) => {
    let resolvedCommunityId = activeCommunityId;

    if (!resolvedCommunityId) {
      const { data: membership } = await supabase
        .from('community_memberships')
        .select('community_id, role')
        .eq('user_id', userId)
        .order('created_at', { ascending: true })
        .limit(1)
        .single();

      if (membership?.community_id) {
        resolvedCommunityId = membership.community_id;
        await supabase
          .from('profiles')
          .update({ current_community_id: resolvedCommunityId })
          .eq('id', userId);
      }
    }

    if (!resolvedCommunityId) {
      setCommunity(null);
      setCommunityId(null);
      setCommunityRole(null);
      return;
    }

    setCommunityId(resolvedCommunityId);

    const { data: membership } = await supabase
      .from('community_memberships')
      .select('role')
      .eq('community_id', resolvedCommunityId)
      .eq('user_id', userId)
      .single();
    setCommunityRole(membership?.role ?? null);

    const { data: communityData } = await supabase
      .from('communities')
      .select('*')
      .eq('id', resolvedCommunityId)
      .single();
    setCommunity(communityData ?? null);
  }, []);

  const fetchProfile = async (userId: string) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (error && error.code === 'PGRST116') {
      // Profile doesn't exist - create one from Google OAuth data
      const currentSession = await supabase.auth.getSession();
      const user = currentSession.data.session?.user;

      if (user) {
        const { data: newProfile, error: createError } = await supabase
          .from('profiles')
          .insert({
            id: userId,
            name: user.user_metadata?.full_name || 'New Member',
            email: user.email || '',
            avatar_url: user.user_metadata?.avatar_url || null,
            role: 'member',
          })
          .select()
          .single();

        if (!createError && newProfile) {
          setProfile(newProfile);
          await fetchCommunityContext(userId, newProfile.current_community_id);
        }
      }
    } else if (!error && data) {
      setProfile(data);
      await fetchCommunityContext(userId, data.current_community_id);
    }
    setLoading(false);
  };

  const refreshProfile = async () => {
    if (session?.user) {
      await fetchProfile(session.user.id);
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
