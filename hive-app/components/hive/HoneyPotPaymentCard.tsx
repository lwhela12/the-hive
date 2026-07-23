import { Alert, Linking, Pressable, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import { ANNUAL_DUES_AMOUNT, QUARTERLY_DUES_AMOUNT } from '../../lib/dues';
import {
  HONEY_POT_CASH_APP_HANDLE,
  HONEY_POT_CASH_APP_URL,
} from '../../lib/honeyPotPayment';

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
        backgroundColor: '#f0fff4',
        borderRadius: 16,
        borderWidth: 1,
        borderColor: 'rgba(34,197,94,0.24)',
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
          <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 12, color: '#167c3b', textTransform: 'uppercase' }}>
            Pay dues
          </Text>
          <Text style={{ fontFamily: 'LibreBaskerville_700Bold', fontSize: 22, color: '#1f2937', marginTop: 3 }}>
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
            backgroundColor: pressed ? '#16a34a' : '#22c55e',
            borderRadius: 999,
            paddingHorizontal: 14,
            paddingVertical: 10,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
          })}
        >
          <Ionicons name="open-outline" size={16} color="#052e16" />
          <Text style={{ fontFamily: 'Lato_700Bold', color: '#052e16', fontSize: 13 }}>
            Open Cash App
          </Text>
        </Pressable>
        <Pressable
          onPress={copyHandle}
          accessibilityRole="button"
          accessibilityLabel="Copy HIVE Cash App handle"
          style={({ pressed }) => ({
            backgroundColor: pressed ? '#dcfce7' : '#ffffff',
            borderColor: 'rgba(34,197,94,0.32)',
            borderWidth: 1,
            borderRadius: 999,
            paddingHorizontal: 14,
            paddingVertical: 10,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
          })}
        >
          <Ionicons name="copy-outline" size={16} color="#167c3b" />
          <Text style={{ fontFamily: 'Lato_700Bold', color: '#167c3b', fontSize: 13 }}>
            Copy handle
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
