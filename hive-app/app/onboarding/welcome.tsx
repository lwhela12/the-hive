import { View, Text, Pressable, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useAuth } from '../../lib/hooks/useAuth';

export default function WelcomeScreen() {
  const { session } = useAuth();

  return (
    <SafeAreaView className="flex-1 bg-cream">
      <View className="flex-1 justify-center px-8">
        <View className="items-center mb-12">
          <Image
            source={require('../../assets/Bee ( Hive) .png')}
            style={{ width: 120, height: 120, marginBottom: 24 }}
            resizeMode="contain"
          />
          <Text style={{ fontFamily: 'LibreBaskerville_700Bold' }} className="text-3xl text-charcoal text-center">
            Welcome to The Hive!
          </Text>
          <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-lg text-charcoal mt-4 text-center leading-7">
            We're excited to have you join our community of 12 people
            practicing high-definition wishing.
          </Text>
        </View>

        <View className="bg-white rounded-2xl p-6 shadow-sm mb-8">
          <Text style={{ fontFamily: 'LibreBaskerville_700Bold' }} className="text-lg text-charcoal mb-4">
            What is High-Definition Wishing?
          </Text>
          <View className="mb-3">
            <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-charcoal">
              ✨ Turning vague desires into specific, actionable wishes
            </Text>
          </View>
          <View className="mb-3">
            <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-charcoal">
              🤝 Matching your wishes to community members who can help
            </Text>
          </View>
          <View>
            <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-charcoal">
              👑 Supporting each month's "Queen Bee" and their project
            </Text>
          </View>
        </View>

        <Pressable
          onPress={() => router.push('/onboarding/info')}
          className="bg-gold py-4 rounded-xl items-center active:opacity-80"
        >
          <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-white text-lg">Get Started</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
