import { Alert, Linking, Pressable, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import { ANNUAL_DUES_AMOUNT, QUARTERLY_DUES_AMOUNT } from '../../lib/dues';
import {
  HONEY_POT_CASH_APP_HANDLE,
  HONEY_POT_CASH_APP_URL,
} from '../../lib/honeyPotPayment';

/**
 * The "pay your dues" card on the Honey Pot screen.
 *
 * The numbers and the handle it shows — $25 a quarter, $100 a year, the
 * $HiveLV Cash App — are OG HIVE's own rules (`lib/dues.ts`,
 * `lib/honeyPotPayment.ts`), the one HIVE that runs a pot. Each HIVE sets its
 * own rules around dues and treasurers (Nat, 2026-08-11), so per-HIVE amounts
 * and cashtags are real future scope that starts whenever a second HIVE turns
 * dues on. Until then this card is safe as-is: it only renders behind
 * `honey-pot.tsx`'s `community.honey_pot_enabled` check (migration 140), so a
 * HIVE that never established dues never sees it.
 */
export function HoneyPotPaymentCard() {
  const openCashApp = async () => {
    try {
      await Linking.openURL(HONEY_POT_CASH_APP_URL);
    } catch (error) {
      console.warn('Could not open HIVE Cash App link', error);
      Alert.alert(
        'Could not open Cash App',
        `Use ${HONEY_POT_CASH_APP_HANDLE} in Cash App or visit cash.app/${HONEY_POT_CASH_APP_HANDLE}.`
      );
    }
  };

  const copyHandle = async () => {
    try {
      await Clipboard.setStringAsync(HONEY_POT_CASH_APP_HANDLE);
      Alert.alert('Cash App handle copied', HONEY_POT_CASH_APP_HANDLE);
    } catch (error) {
      console.warn('Could not copy HIVE Cash App handle', error);
      Alert.alert('Could not copy handle', `Use ${HONEY_POT_CASH_APP_HANDLE} in Cash App.`);
    }
  };

  return (
    <View
      style={{
        backgroundColor: '#fdf8ec',
        borderRadius: 16,
        borderWidth: 1,
        borderColor: 'rgba(222,193,129,0.5)',
        padding: 16,
        marginBottom: 14,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
        <View
          style={{
            width: 42,
            height: 42,
            borderRadius: 12,
            backgroundColor: '#00d632',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 24, color: '#052e16' }}>$</Text>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 11, color: '#8e7a5e', letterSpacing: 0.8, textTransform: 'uppercase' }}>
            Pay dues
          </Text>
          <Text style={{ fontFamily: 'LibreBaskerville_700Bold', fontSize: 22, color: '#2d2d2d', marginTop: 3 }}>
            Cash App {HONEY_POT_CASH_APP_HANDLE}
          </Text>
          <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 13, color: '#5c5648', marginTop: 6, lineHeight: 18 }}>
            Quarterly dues are ${QUARTERLY_DUES_AMOUNT}. A full year is ${ANNUAL_DUES_AMOUNT}.
          </Text>
        </View>
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 }}>
        <Pressable
          onPress={openCashApp}
          accessibilityRole="link"
          accessibilityLabel="Open HIVE Cash App payment link"
          style={({ pressed }) => ({
            backgroundColor: pressed ? '#a37f3d' : '#bd9348',
            borderRadius: 999,
            paddingHorizontal: 14,
            paddingVertical: 10,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
          })}
        >
          <Ionicons name="open-outline" size={16} color="#ffffff" />
          <Text style={{ fontFamily: 'Lato_700Bold', color: '#ffffff', fontSize: 13 }}>
            Open Cash App
          </Text>
        </Pressable>
        <Pressable
          onPress={copyHandle}
          accessibilityRole="button"
          accessibilityLabel="Copy HIVE Cash App handle"
          style={({ pressed }) => ({
            backgroundColor: pressed ? '#fbf0d7' : '#fffdf5',
            borderColor: 'rgba(222,193,129,0.55)',
            borderWidth: 1,
            borderRadius: 999,
            paddingHorizontal: 14,
            paddingVertical: 10,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
          })}
        >
          <Ionicons name="copy-outline" size={16} color="#8e6f35" />
          <Text style={{ fontFamily: 'Lato_700Bold', color: '#8e6f35', fontSize: 13 }}>
            Copy handle
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
