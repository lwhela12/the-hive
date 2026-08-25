import { View, Text, Image, Platform } from 'react-native';
import { SafeAreaView } from './SafeArea';

/**
 * "We'll BEE right back."
 *
 * Up deliberately on the night of 2026-08-02: a lot changed today — a Newsletter
 * tab, a new menu, renamed meetings — and Nat would rather members met it all at
 * once tomorrow than wandered through it mid-change.
 *
 * TO TAKE IT DOWN: set MAINTENANCE to false in app/_layout.tsx and push. That's
 * the whole thing.
 *
 * Nat can still get in: app.the-hive.app/?bee=1 — it sticks for the tab.
 */
export function MaintenanceScreen() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f6f4e5' }}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28 }}>
        <View style={{ maxWidth: 360, alignItems: 'center' }}>
          <Image
            source={require('../../assets/HIVE Logo Transparent  BG.png')}
            style={{ width: 132, height: 132, marginBottom: 26 }}
            resizeMode="contain"
          />

          <Text
            style={{
              fontFamily: 'LibreBaskerville_700Bold', fontSize: 27,
              color: '#313130', textAlign: 'center', lineHeight: 36,
            }}
          >
            We&rsquo;ll <Text style={{ color: '#bd9348' }}>BEE</Text> right back
          </Text>

          <Text
            style={{
              fontFamily: 'Lato_400Regular', fontSize: 15, lineHeight: 24,
              color: 'rgba(49,49,48,0.62)', textAlign: 'center', marginTop: 14,
            }}
          >
            HIVE is having a big tidy-up tonight — some lovely new things are
            going in. It&rsquo;ll be open again tomorrow.
          </Text>

          <Text
            style={{
              fontFamily: 'Lato_400Regular', fontSize: 14, lineHeight: 22,
              color: 'rgba(49,49,48,0.45)', textAlign: 'center', marginTop: 18,
            }}
          >
            Sorry for the inconvenience. Thanks for your patience 🍯
          </Text>

          {Platform.OS === 'web' ? (
            <Text
              style={{
                fontFamily: 'Lato_400Regular', fontSize: 13,
                color: 'rgba(49,49,48,0.4)', textAlign: 'center', marginTop: 30,
              }}
              onPress={() => { window.location.href = 'https://the-hive.app'; }}
            >
              the-hive.app &rarr;
            </Text>
          ) : null}
        </View>
      </View>
    </SafeAreaView>
  );
}
