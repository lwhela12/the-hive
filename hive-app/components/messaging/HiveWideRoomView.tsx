import { View, Text, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { HIVE_WIDE_GREEN } from '../ui/HiveWideWelcome';
import { SpaceGlobe } from '../ui/SpaceGlobe';
import {
  HIVE_WIDE_EDGE,
  HIVE_WIDE_ROOM_NAME,
  HIVE_WIDE_ROOM_SUBTITLE,
  HIVE_WIDE_SOFT,
  getHiveWideEmptyCopy,
} from './hiveWideRoom';

/**
 * HIVE-Wide, opened.
 *
 * There is no cross-HIVE chat room in the database — every chat_rooms row
 * belongs to exactly one HIVE — so this room is real on screen and empty in
 * fact, and it says which (Nat 2026-08-03). Writing a composer that couldn't
 * deliver anywhere, or seeding a message nobody sent, would both be worse than
 * a quiet room that tells the truth.
 *
 * It wears the turning globe, same as the HIVE-Wide page, so standing above the
 * HIVEs feels the same wherever you do it.
 */
export function HiveWideRoomView({
  hiveName,
  onBack,
  hideBackButton = false,
}: {
  hiveName: string;
  onBack: () => void;
  /** Desktop keeps the room list beside this pane, so there's nothing to go back to. */
  hideBackButton?: boolean;
}) {
  const copy = getHiveWideEmptyCopy(hiveName);

  return (
    <SafeAreaView className="flex-1" edges={['top']} style={{ backgroundColor: '#fffdf6' }}>
      <View
        className="flex-row items-center px-4 py-3 border-b"
        style={{ backgroundColor: '#fffdf6', borderBottomColor: HIVE_WIDE_EDGE }}
      >
        {!hideBackButton && (
          <Pressable
            onPress={onBack}
            className="mr-3 w-9 h-9 rounded-full items-center justify-center"
            accessibilityLabel="Back to your messages"
          >
            <Ionicons name="chevron-back" size={28} color="#313130" />
          </Pressable>
        )}
        <View
          className="mr-3 items-center justify-center"
          style={{
            width: 42,
            height: 42,
            borderRadius: 21,
            backgroundColor: HIVE_WIDE_SOFT,
            borderWidth: 1,
            borderColor: HIVE_WIDE_EDGE,
          }}
        >
          <Ionicons name="globe-outline" size={23} color={HIVE_WIDE_GREEN} />
        </View>
        <View className="flex-1">
          <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-charcoal text-lg" numberOfLines={1}>
            {HIVE_WIDE_ROOM_NAME}
          </Text>
          <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-charcoal/50 text-sm">
            {HIVE_WIDE_ROOM_SUBTITLE}
          </Text>
        </View>
      </View>

      <View className="flex-1">
        <SpaceGlobe />
        <View className="flex-1 items-center justify-center px-8">
          <Text
            style={{
              fontFamily: 'LibreBaskerville_700Bold',
              fontSize: 19,
              lineHeight: 28,
              color: '#313130',
              textAlign: 'center',
            }}
          >
            {copy.heading}
          </Text>
          <Text
            style={{
              fontFamily: 'Lato_400Regular',
              fontSize: 15,
              lineHeight: 23,
              color: 'rgba(49,49,48,0.72)',
              textAlign: 'center',
              marginTop: 12,
              maxWidth: 420,
            }}
          >
            {copy.body}
          </Text>
          <Text
            style={{
              fontFamily: 'Lato_400Regular',
              fontSize: 13.5,
              lineHeight: 20,
              color: 'rgba(49,49,48,0.6)',
              textAlign: 'center',
              marginTop: 18,
              paddingTop: 14,
              borderTopWidth: 1,
              borderTopColor: 'rgba(63,125,92,0.22)',
              maxWidth: 420,
            }}
          >
            {copy.footer}
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}
