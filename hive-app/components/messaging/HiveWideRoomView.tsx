import { View, Text } from 'react-native';
import { SafeAreaView } from '../ui/SafeArea';

import { SpaceGlobe } from '../ui/SpaceGlobe';
import { SPACE_SKIN } from '../../lib/pageSkin';
import { WorldMark } from '../ui/WorldMark';
import { BackButton } from '../ui/BackButton';
import {
  HIVE_WIDE_ROOM_NAME,
  HIVE_WIDE_ROOM_SUBTITLE,
  getHiveWideEmptyCopy,
} from './hiveWideRoom';

/**
 * HIVE-Wide, opened.
 *
 * THE FALLBACK, not the room. The room is real now — one row with
 * `reach = 'all_hives'` (migration 139), rendered by RoomChatView like any
 * other. This panel only appears if that row cannot be found, which would mean
 * something is broken rather than unbuilt, and it still says so plainly.
 *
 * Every colour here is SPACE_SKIN. It used to be a cream header and charcoal
 * copy laid over SpaceGlobe's black — so the heading, the body and the footer
 * were charcoal on a starfield, i.e. invisible, under a cream bar that made the
 * panel look like two half-pages stitched together. That frame, wrapped in
 * Production HIVE's purple chrome, is the one Nat photographed on 2026-08-03.
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
    <SafeAreaView className="flex-1" edges={['top']} style={{ backgroundColor: SPACE_SKIN.page }}>
      <View
        className="flex-row items-center px-4 py-3 border-b"
        style={{ backgroundColor: SPACE_SKIN.page, borderBottomColor: SPACE_SKIN.border }}
      >
        {!hideBackButton && (
          <BackButton
            onPress={onBack}
            accessibilityLabel="Back to your messages"
            color={SPACE_SKIN.ink}
            style={{ marginRight: 8 }}
          />
        )}
        <View
          className="mr-3 items-center justify-center"
          style={{
            width: 42,
            height: 42,
            borderRadius: 21,
            backgroundColor: SPACE_SKIN.card,
            borderWidth: 1,
            borderColor: SPACE_SKIN.border,
          }}
        >
          <WorldMark size={39} />
        </View>
        <View className="flex-1">
          <Text
            style={{ fontFamily: 'Lato_700Bold', color: SPACE_SKIN.ink }}
            className="text-lg"
            numberOfLines={1}
          >
            {HIVE_WIDE_ROOM_NAME}
          </Text>
          <Text style={{ fontFamily: 'Lato_400Regular', color: SPACE_SKIN.inkSoft }} className="text-sm">
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
              color: SPACE_SKIN.ink,
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
              color: SPACE_SKIN.inkBody,
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
              color: SPACE_SKIN.inkSoft,
              textAlign: 'center',
              marginTop: 18,
              paddingTop: 14,
              borderTopWidth: 1,
              borderTopColor: SPACE_SKIN.border,
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
