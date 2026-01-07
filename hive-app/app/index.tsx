import { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { Redirect } from 'expo-router';
import { useAuth } from '../lib/hooks/useAuth';

export default function Index() {
  const { session, profile, loading } = useAuth();

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-honey-50">
        <ActivityIndicator size="large" color="#F59E0B" />
      </View>
    );
  }

  // Not logged in -> go to login
  if (!session) {
    return <Redirect href="/(auth)/login" />;
  }

  // Logged in but not onboarded -> go to onboarding
  if (!profile?.onboarded_at) {
    return <Redirect href="/onboarding/welcome" />;
  }

  // Logged in and onboarded -> go to main app
  return <Redirect href="/(app)" />;
}
