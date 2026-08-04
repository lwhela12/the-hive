import { View, ActivityIndicator } from 'react-native';
import { Redirect } from 'expo-router';
import { useAuth } from '../lib/hooks/useAuth';

import { ThinkingBee } from '../components/ui/ThinkingBee';
export default function Index() {
  const { session, communityId, loading } = useAuth();

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-cream">
        <ThinkingBee />
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

  // Fresh app entry starts above the HIVEs rather than inside one — the same
  // call that retired the "Which HIVE today?" question (Nat 2026-08-03). From
  // up there every HIVE is one tap away in the rail, and nobody has to answer
  // anything to get through the door.
  // In-session navigation is still preserved by the app tabs while the user switches apps.
  return <Redirect href={'/hive-wide' as never} />;
}
