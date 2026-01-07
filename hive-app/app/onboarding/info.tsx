import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/hooks/useAuth';

export default function InfoScreen() {
  const { session, refreshProfile } = useAuth();
  const [name, setName] = useState(session?.user?.user_metadata?.full_name || '');
  const [phone, setPhone] = useState('');
  const [birthday, setBirthday] = useState('');
  const [preferredContact, setPreferredContact] = useState<'email' | 'phone'>('email');
  const [loading, setLoading] = useState(false);

  const handleContinue = async () => {
    if (!name.trim()) {
      Alert.alert('Error', 'Please enter your name');
      return;
    }

    setLoading(true);
    try {
      // Create or update profile
      const { error } = await supabase.from('profiles').upsert({
        id: session?.user.id,
        name: name.trim(),
        email: session?.user.email || '',
        phone: phone.trim() || null,
        birthday: birthday || null,
        preferred_contact: preferredContact,
        avatar_url: session?.user?.user_metadata?.avatar_url,
        role: 'member',
      });

      if (error) throw error;

      await refreshProfile();
      router.push('/onboarding/skills');
    } catch (error) {
      console.error('Error saving profile:', error);
      Alert.alert('Error', 'Failed to save your information. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-cream">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1"
      >
        <ScrollView
          className="flex-1"
          contentContainerClassName="p-6"
          keyboardShouldPersistTaps="handled"
        >
          <View className="mb-8">
            <Text style={{ fontFamily: 'LibreBaskerville_700Bold' }} className="text-2xl text-charcoal">
              Tell us about yourself
            </Text>
            <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-charcoal/70 mt-2">
              This helps the community connect with you.
            </Text>
          </View>

          <View className="mb-5">
            <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-charcoal mb-2">Name *</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Your name"
              className="bg-white border border-gold-light rounded-xl p-4 text-base text-charcoal"
              style={{ fontFamily: 'Lato_400Regular' }}
              autoCapitalize="words"
            />
          </View>

          <View className="mb-5">
            <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-charcoal mb-2">Phone</Text>
            <TextInput
              value={phone}
              onChangeText={setPhone}
              placeholder="(555) 123-4567"
              className="bg-white border border-gold-light rounded-xl p-4 text-base text-charcoal"
              style={{ fontFamily: 'Lato_400Regular' }}
              keyboardType="phone-pad"
            />
          </View>

          <View className="mb-5">
            <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-charcoal mb-2">Birthday</Text>
            <TextInput
              value={birthday}
              onChangeText={setBirthday}
              placeholder="YYYY-MM-DD"
              className="bg-white border border-gold-light rounded-xl p-4 text-base text-charcoal"
              style={{ fontFamily: 'Lato_400Regular' }}
            />
            <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-charcoal/50 text-sm mt-1">
              We'll make sure the Hive celebrates with you!
            </Text>
          </View>

          <View className="mb-8">
            <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-charcoal mb-2">
              Preferred Contact Method
            </Text>
            <View className="flex-row">
              <Pressable
                onPress={() => setPreferredContact('email')}
                className={`flex-1 py-3 rounded-xl mr-2 ${
                  preferredContact === 'email'
                    ? 'bg-gold'
                    : 'bg-white border border-gold-light'
                }`}
              >
                <Text
                  style={{ fontFamily: 'Lato_700Bold' }}
                  className={`text-center ${
                    preferredContact === 'email' ? 'text-white' : 'text-charcoal'
                  }`}
                >
                  Email
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setPreferredContact('phone')}
                className={`flex-1 py-3 rounded-xl ml-2 ${
                  preferredContact === 'phone'
                    ? 'bg-gold'
                    : 'bg-white border border-gold-light'
                }`}
              >
                <Text
                  style={{ fontFamily: 'Lato_700Bold' }}
                  className={`text-center ${
                    preferredContact === 'phone' ? 'text-white' : 'text-charcoal'
                  }`}
                >
                  Phone
                </Text>
              </Pressable>
            </View>
          </View>

          <Pressable
            onPress={handleContinue}
            disabled={loading}
            className={`bg-gold py-4 rounded-xl items-center ${
              loading ? 'opacity-50' : 'active:opacity-80'
            }`}
          >
            <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-white text-lg">
              {loading ? 'Saving...' : 'Continue'}
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
