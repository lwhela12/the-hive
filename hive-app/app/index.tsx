import { View, ActivityIndicator } from 'react-native';
import { Redirect } from 'expo-router';
import { useAuth } from '../lib/hooks/useAuth';

export default function Index() {
  const { session, loading } = useAuth();

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

  // All authenticated users go to main app
  // New users get a special welcome message in chat
  return <Redirect href="/(app)" />;
}
