import { useState } from 'react';
import { View, Text, Pressable, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/hooks/useAuth';
import { ChatInterface } from '../../components/chat/ChatInterface';

export default function WishesScreen() {
  const { refreshProfile } = useAuth();
  const [loading, setLoading] = useState(false);

  const handleComplete = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('No user');

      // Update profile with onboarded_at
      const { error } = await supabase
        .from('profiles')
        .update({ onboarded_at: new Date().toISOString() })
        .eq('id', user.id);

      if (error) throw error;

      await refreshProfile();
      router.replace('/(app)');
    } catch (error) {
      console.error('Error completing onboarding:', error);
      Alert.alert('Error', 'Failed to complete onboarding. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-white" edges={['top']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1"
      >
        <View className="p-4 border-b border-gray-200">
          <Text className="text-xl font-bold text-hive-dark">
            What do you need?
          </Text>
          <Text className="text-gray-600 mt-1">
            Share what you're working on or what help you'd like. These stay
            private unless you choose to share.
          </Text>
        </View>

        <ChatInterface mode="onboarding" context="wishes" />

        <View className="p-4 border-t border-gray-200">
          <Pressable
            onPress={handleComplete}
            disabled={loading}
            className={`bg-honey-500 py-4 rounded-xl items-center ${
              loading ? 'opacity-50' : 'active:bg-honey-600'
            }`}
          >
            <Text className="text-white text-lg font-semibold">
              {loading ? 'Finishing...' : 'Enter The Hive'}
            </Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
