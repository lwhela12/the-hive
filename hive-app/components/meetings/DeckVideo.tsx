import { Text, View } from 'react-native';

/**
 * The deck's video panel — native fallback.
 *
 * The real one is `DeckVideo.web.tsx`. Video needs WebRTC, which on iOS and
 * Android means a native module and a fresh build of the app; every HIVE invite
 * points at app.the-hive.app and that is where meetings are run from, so web is
 * where this lives for now.
 *
 * Nat's own model of the room says the same thing (2026-08-15): one computer
 * carries the room, the remote people are on laptops, and the phones in the
 * room are there to follow the deck, not to be on camera — *"we would have one
 * computer on the call. We wouldn't have everyone join the call."*
 *
 * So this says where the video is rather than pretending there is none.
 */
export type DeckVideoProps = {
  communityId: string | null;
  /** This HIVE's accent, so the panel wears the deck it is sitting in. */
  accent: string;
  accentDeep: string;
  cardColor: string;
  softBorder: string;
  /** Scaled type, handed down so the panel matches the slide beside it. */
  fontSize: number;
  /**
   * Told when the call starts and ends, so the deck can give the panel real
   * room while people are on it and take that room back when they are not —
   * an empty video box should not push the slide around all evening.
   */
  onLiveChange?: (live: boolean) => void;
  /**
   * Does this HIVE write its meetings down? Per-HIVE (migration 183), because
   * a transcript is labelled by microphone: everyone on their own device gets
   * their own name on every line, a room sharing one laptop gets one name for
   * the whole table.
   */
  transcriptsOn: boolean;
  /** Admins throw the switch; everyone else can see where it is set. */
  canToggleTranscripts: boolean;
  onToggleTranscripts: (next: boolean) => void;
};

export function DeckVideo({
  accentDeep,
  cardColor,
  softBorder,
  fontSize,
  transcriptsOn,
}: DeckVideoProps) {
  return (
    <View
      style={{
        flex: 1,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: softBorder,
        backgroundColor: cardColor,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 14,
      }}
    >
      <Text
        style={{
          fontFamily: 'Lato_400Regular',
          fontSize,
          lineHeight: fontSize * 1.4,
          color: accentDeep,
          textAlign: 'center',
        }}
      >
        Video runs in the browser.
        {'\n'}
        Open the deck at app.the-hive.app to join the room.
        {transcriptsOn ? '\nThis HIVE writes its meetings down.' : ''}
      </Text>
    </View>
  );
}
