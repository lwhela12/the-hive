import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { HIVE_WIDE_GREEN } from '../ui/HiveWideWelcome';
import {
  HIVE_WIDE_EDGE,
  HIVE_WIDE_ROOM_NAME,
  HIVE_WIDE_ROOM_SUBTITLE,
  HIVE_WIDE_SOFT,
} from './hiveWideRoom';

/**
 * HIVE-Wide in the message list, and again in the desktop rail.
 *
 * Nat, 2026-08-03: your own HIVE and HIVE-Wide should both be sitting there
 * when you open Messages. It is built to ChatRoomItem's exact shape so the two
 * read as one list, and coloured green with a globe because green is HIVE-Wide
 * everywhere else in the app — the reach is legible before you read the name.
 */

export function HiveWideRoomCard({
  isActive,
  onPress,
}: {
  isActive: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center px-4 py-3 active:opacity-80"
      accessibilityLabel="HIVE-Wide"
      style={{
        marginHorizontal: 12,
        marginVertical: 6,
        minHeight: 76,
        borderRadius: 20,
        borderWidth: isActive ? 1.5 : 1,
        borderColor: isActive ? HIVE_WIDE_GREEN : HIVE_WIDE_EDGE,
        backgroundColor: isActive ? HIVE_WIDE_SOFT : 'rgba(255,255,255,0.82)',
        shadowColor: HIVE_WIDE_GREEN,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: isActive ? 0.16 : 0.09,
        shadowRadius: 18,
        elevation: isActive ? 4 : 2,
      }}
    >
      <View
        className="absolute left-0 top-4 bottom-4 rounded-r-full"
        style={{ width: 3, backgroundColor: HIVE_WIDE_GREEN, opacity: 0.7 }}
      />

      <View
        className="w-12 h-12 rounded-full mr-3 items-center justify-center"
        style={{ backgroundColor: HIVE_WIDE_SOFT, borderWidth: 1, borderColor: HIVE_WIDE_EDGE }}
      >
        <Ionicons name="globe-outline" size={26} color={HIVE_WIDE_GREEN} />
      </View>

      <View className="flex-1">
        <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-charcoal mb-1" numberOfLines={1}>
          {HIVE_WIDE_ROOM_NAME}
        </Text>
        <Text
          style={{ fontFamily: 'Lato_400Regular' }}
          className="text-charcoal/60 text-sm"
          numberOfLines={1}
        >
          {HIVE_WIDE_ROOM_SUBTITLE}
        </Text>
      </View>
    </Pressable>
  );
}

/** The same room as a rail bubble, sized to sit beside the member faces. */
export function HiveWideBubble({
  isActive,
  onPress,
}: {
  isActive: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className="items-center active:opacity-75"
      style={{ width: 72 }}
      accessibilityLabel="HIVE-Wide"
    >
      <View
        style={{
          padding: 2,
          borderRadius: 31,
          borderWidth: 2,
          borderColor: isActive ? HIVE_WIDE_GREEN : 'transparent',
        }}
      >
        <View
          style={{
            width: 54,
            height: 54,
            borderRadius: 27,
            backgroundColor: HIVE_WIDE_SOFT,
            borderWidth: 1,
            borderColor: HIVE_WIDE_EDGE,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name="globe-outline" size={28} color={HIVE_WIDE_GREEN} />
        </View>
      </View>
      <Text
        style={{
          fontFamily: isActive ? 'Lato_700Bold' : 'Lato_400Regular',
          fontSize: 11,
          marginTop: 3,
          color: isActive ? HIVE_WIDE_GREEN : 'rgba(49,49,48,0.7)',
        }}
        numberOfLines={1}
      >
        {HIVE_WIDE_ROOM_NAME}
      </Text>
    </Pressable>
  );
}
