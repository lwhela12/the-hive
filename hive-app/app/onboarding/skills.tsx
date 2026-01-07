import { useState } from 'react';
import { View, Text, Pressable, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ChatInterface } from '../../components/chat/ChatInterface';

export default function SkillsScreen() {
  const [canContinue, setCanContinue] = useState(false);

  return (
    <SafeAreaView className="flex-1 bg-white" edges={['top']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1"
      >
        <View className="p-4 border-b border-gray-200">
          <Text className="text-xl font-bold text-hive-dark">
            What are you good at?
          </Text>
          <Text className="text-gray-600 mt-1">
            Chat with me about your skills and talents.
          </Text>
        </View>

        <ChatInterface
          mode="onboarding"
          context="skills"
          onSkillsCaptured={() => setCanContinue(true)}
        />

        <View className="p-4 border-t border-gray-200">
          <Pressable
            onPress={() => router.push('/onboarding/wishes')}
            disabled={!canContinue}
            className={`py-4 rounded-xl items-center ${
              canContinue
                ? 'bg-honey-500 active:bg-honey-600'
                : 'bg-gray-200'
            }`}
          >
            <Text
              className={`text-lg font-semibold ${
                canContinue ? 'text-white' : 'text-gray-400'
              }`}
            >
              Continue to Wishes
            </Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
