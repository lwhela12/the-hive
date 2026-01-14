import { View, ActivityIndicator } from 'react-native';
import { Redirect } from 'expo-router';
import { useAuth } from '../lib/hooks/useAuth';

export default function Index() {
  const { session, communityId, loading } = useAuth();

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-cream">
        <ActivityIndicator size="large" color="#bd9348" />
      </View>
    );
  }

  // Not logged in -> go to login
  if (!session) {
    return <Redirect href="/(auth)/login" />;
  }

  // Logged in but no community -> go to join screen
  if (!communityId) {
    return <Redirect href="/join" />;
  }

  // Has community -> go to main app (chat handles welcome/onboarding)
  return <Redirect href="/(app)" />;
}
