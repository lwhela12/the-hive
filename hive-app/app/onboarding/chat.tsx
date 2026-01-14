import { useState, useEffect, useCallback } from 'react';
import { View, Text, Pressable, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ChatInterface } from '../../components/chat/ChatInterface';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/hooks/useAuth';
import type { Conversation } from '../../types';

export default function OnboardingChatScreen() {
  const { session, communityId, refreshProfile } = useAuth();
  const [onboardingComplete, setOnboardingComplete] = useState(false);
  const [isFinishing, setIsFinishing] = useState(false);
  const [onboardingConversation, setOnboardingConversation] = useState<Conversation | null>(null);
  const [isReady, setIsReady] = useState(false);

  // Create a dedicated onboarding conversation
  useEffect(() => {
    const initOnboardingConversation = async () => {
      if (!session?.user?.id || !communityId) return;

      try {
        // Check for existing incomplete onboarding conversation
        const { data: existingConv } = await supabase
          .from('conversations')
          .select('*')
          .eq('user_id', session.user.id)
          .eq('community_id', communityId)
          .eq('mode', 'onboarding')
          .eq('is_active', true)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        if (existingConv) {
          // Resume existing onboarding conversation
          setOnboardingConversation(existingConv);
          setIsReady(true);
          return;
        }

        // Create new onboarding conversation
        const { data: newConv, error } = await supabase
          .from('conversations')
          .insert({
            user_id: session.user.id,
            community_id: communityId,
            mode: 'onboarding',
            title: 'Welcome to HIVE',
            is_active: true,
          })
          .select()
          .single();

        if (error) {
          console.error('Error creating onboarding conversation:', error);
          // Fallback: still show the chat interface
          setIsReady(true);
          return;
        }

        setOnboardingConversation(newConv);
        setIsReady(true);
      } catch (error) {
        console.error('Error initializing onboarding:', error);
        setIsReady(true);
      }
    };

    initOnboardingConversation();
  }, [session?.user?.id, communityId]);

  const handleConversationCreated = useCallback((conversation: Conversation) => {
    setOnboardingConversation(conversation);
  }, []);

  const handleEnterHive = async () => {
    if (!session?.user?.id) return;

    setIsFinishing(true);
    try {
      // Mark the onboarding conversation as complete
      if (onboardingConversation) {
        await supabase
          .from('conversations')
          .update({ is_active: false })
          .eq('id', onboardingConversation.id);
      }

      // Update profile with onboarded_at timestamp
      const { error } = await supabase
        .from('profiles')
        .update({ onboarded_at: new Date().toISOString() })
        .eq('id', session.user.id);

      if (error) throw error;

      await refreshProfile();
      router.replace('/(app)');
    } catch (error) {
      console.error('Error completing onboarding:', error);
      Alert.alert('Error', 'Something went wrong. Please try again.');
      setIsFinishing(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-cream" edges={['top']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1"
      >
        <View className="p-4 border-b border-gold-light bg-cream">
          <Text style={{ fontFamily: 'LibreBaskerville_700Bold' }} className="text-xl text-charcoal">
            Let's get to know you
          </Text>
          <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-charcoal/70 mt-1">
            Chat with me to set up your profile, share your skills, and tell me what you wish for.
          </Text>
        </View>

        <View className="flex-1 bg-white">
          {isReady ? (
            <ChatInterface
              mode="onboarding"
              conversationId={onboardingConversation?.id || null}
              skipLoadHistory={!onboardingConversation}
              onOnboardingComplete={() => setOnboardingComplete(true)}
              onConversationCreated={handleConversationCreated}
            />
          ) : (
            <View className="flex-1 items-center justify-center">
              <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-charcoal/50">
                Preparing your conversation...
              </Text>
            </View>
          )}
        </View>

        {onboardingComplete && (
          <View className="p-4 border-t border-gold-light bg-cream">
            <Pressable
              onPress={handleEnterHive}
              disabled={isFinishing}
              className={`py-4 rounded-xl items-center ${
                isFinishing ? 'bg-gold/50' : 'bg-gold active:opacity-80'
              }`}
            >
              <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-lg text-white">
                {isFinishing ? 'Entering...' : 'Enter HIVE'}
              </Text>
            </Pressable>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
