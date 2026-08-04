import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  HIVE_WIDE_EDGE,
  HIVE_WIDE_MARK,
  HIVE_WIDE_ROOM_NAME,
  HIVE_WIDE_ROOM_SUBTITLE,
  HIVE_WIDE_SOFT,
} from './hiveWideRoom';
import { usePageSkin } from '../../lib/pageSkin';

/**
 * HIVE-Wide in the message list, and again in the desktop rail.
 *
 * Nat, 2026-08-03: your own HIVE and HIVE-Wide should both be sitting there
 * when you open Messages. It is built to ChatRoomItem's exact shape so the two
 * read as one list, and marked with a globe in HIVE-Wide's black so the reach is
 * legible before you read the name. It was green until 2026-08-03; the rail and
 * header had already moved to space-black and this was the last green left.
 *
 * It takes its surface from the page skin, so standing at HIVE-Wide the card is
 * dark like the page under it instead of a cream tile on a starfield.
 */

export function HiveWideRoomCard({
  isActive,
  onPress,
}: {
  isActive: boolean;
  onPress: () => void;
}) {
  const skin = usePageSkin();
  // On a dark page the mark has to be the light thing, not the black thing.
  const mark = skin.dark ? skin.gold : HIVE_WIDE_MARK;
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
        borderColor: isActive ? mark : skin.dark ? skin.border : HIVE_WIDE_EDGE,
        backgroundColor: isActive ? (skin.dark ? skin.cardPressed : HIVE_WIDE_SOFT) : skin.dark ? skin.card : 'rgba(255,255,255,0.82)',
        shadowColor: HIVE_WIDE_MARK,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: isActive ? 0.16 : 0.09,
        shadowRadius: 18,
        elevation: isActive ? 4 : 2,
      }}
    >
      <View
        className="absolute left-0 top-4 bottom-4 rounded-r-full"
        style={{ width: 3, backgroundColor: mark, opacity: 0.7 }}
      />

      <View
        className="w-12 h-12 rounded-full mr-3 items-center justify-center"
        style={{
          backgroundColor: skin.dark ? skin.cardPressed : HIVE_WIDE_SOFT,
          borderWidth: 1,
          borderColor: skin.dark ? skin.border : HIVE_WIDE_EDGE,
        }}
      >
        <Ionicons name="globe-outline" size={26} color={mark} />
      </View>

      <View className="flex-1">
        <Text
          style={{ fontFamily: 'Lato_700Bold', color: skin.ink }}
          className="mb-1"
          numberOfLines={1}
        >
          {HIVE_WIDE_ROOM_NAME}
        </Text>
        <Text
          style={{ fontFamily: 'Lato_400Regular', color: skin.inkSoft }}
          className="text-sm"
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
  const skin = usePageSkin();
  const mark = skin.dark ? skin.gold : HIVE_WIDE_MARK;
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
          borderColor: isActive ? mark : 'transparent',
        }}
      >
        <View
          style={{
            width: 54,
            height: 54,
            borderRadius: 27,
            backgroundColor: skin.dark ? skin.cardPressed : HIVE_WIDE_SOFT,
            borderWidth: 1,
            borderColor: skin.dark ? skin.border : HIVE_WIDE_EDGE,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name="globe-outline" size={28} color={mark} />
        </View>
      </View>
      <Text
        style={{
          fontFamily: isActive ? 'Lato_700Bold' : 'Lato_400Regular',
          fontSize: 11,
          marginTop: 3,
          color: isActive ? mark : skin.inkBody,
        }}
        numberOfLines={1}
      >
        {HIVE_WIDE_ROOM_NAME}
      </Text>
    </Pressable>
  );
}
