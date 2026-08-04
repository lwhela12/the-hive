import { memo } from 'react';
import { Pressable, View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../lib/hooks/useAuth';
import { hiveAccent, hiveDisplayName } from '../../lib/hiveBrand';

interface AppHeaderProps {
  title: string;
  /** Back arrow in the left slot (for pushed pages like Honey Pot). */
  onBackPress?: () => void;
  /** Small mark rendered just before the title (e.g. Clive's crest). */
  titleIcon?: React.ReactNode;
  /** Muted one-liner under the title (e.g. Members' count + search hint). */
  subtitle?: string;
  rightElement?: React.ReactNode;
  /**
   * Which world this page belongs to.
   *
   * 'hive'  the HIVE you're in — its colour, its name above the title.
   * 'wide'  HIVE-Wide — space black, and NO HIVE name, because the page isn't
   *         in a HIVE. The first pass said "OG HIVE / HIVE-Wide" stacked, which
   *         is two contradictory answers to "where am I" (Nat 2026-08-03).
   * 'god'   Admin. Not OG HIVE's admin — the whole operation's, so it wears
   *         neither a HIVE's colour nor a HIVE's name.
   *
   * You rarely need to pass this. A page left on the default follows wherever
   * the reader is standing, which is the behaviour you almost always want —
   * see the note on the tone resolution below.
   */
  tone?: 'hive' | 'wide' | 'god';
}

/**
 * HIVE-Wide's black, and the god view's slate. Neither belongs to a HIVE.
 *
 * Wide was green for about a day. It is the black the globe hangs in now, so
 * that the header, the rail and the page are all obviously the same place —
 * "we'd have the black space header, not green" (Nat 2026-08-03).
 */
const TONE_COLOURS = { wide: '#0B0B12', god: '#40403C' } as const;

// The one page-title treatment for the whole app: gold bar, spaced serif.
// Every tab screen should use this instead of hand-rolling a gold header.
//
// The bar takes its colour from the HIVE you're in, and its name rides above
// every page title so you always know where you are. Home is the exception: it
// puts the name in the title itself, big — so the name is said once there
// rather than twice in two sizes.
export const AppHeader = memo(function AppHeader({
  title,
  onBackPress,
  titleIcon,
  subtitle,
  rightElement,
  tone = 'hive',
}: AppHeaderProps) {
  const { community, wholeHive } = useAuth();

  // The header follows the reader, rather than each page having to remember to
  // say where it is.
  //
  // Nat found this the hard way (2026-08-03): she went to Profile from
  // HIVE-Wide, looked at a few HIVEs, came back, "and the colors didn't stay
  // with me." They hadn't, because tone was opt-in per screen — so the three
  // pages that had been taught about HIVE-Wide went black and every other one
  // kept wearing OG's gold over a black rail. Opt-in was the bug. A page that
  // says nothing now inherits the truth instead of a default.
  //
  // 'god' and an explicit 'wide' still win: Admin is above all of this, and a
  // screen that is ALWAYS wide (the shared boards) should not depend on how the
  // reader happened to arrive.
  const resolvedTone = tone === 'hive' && wholeHive ? 'wide' : tone;
  const accent = resolvedTone === 'hive' ? hiveAccent(community) : TONE_COLOURS[resolvedTone];
  const hiveName = hiveDisplayName(community?.name);
  // Any page whose title is already the HIVE's name says it big and skips the
  // small line — that's Home, and anywhere else that chooses to do the same.
  // Only a page that lives INSIDE a HIVE says which one. HIVE-Wide and Admin sit
  // above the HIVEs, so naming one there answers "where am I" twice, differently.
  const showHiveName =
    resolvedTone === 'hive' && title.trim().toUpperCase() !== hiveName.toUpperCase();

  return (
    <View
      className="flex-row items-center justify-between px-4 py-3"
      style={{ backgroundColor: accent }}
    >
      {/* The hamburger is gone (2026-08-03). Navigation lives in the rail down
          the left, always visible, so a button that opened a second copy of the
          same list was one more thing to keep in step and one more thing to find.
          A screen that pushed on top of another still gets its back arrow; the
          left slot is otherwise an empty spacer, so the title stays centred. */}
      {onBackPress ? (
        <Pressable
          onPress={onBackPress}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          className="w-10 h-10 items-center justify-center rounded-full active:opacity-70"
          hitSlop={8}
        >
          <Ionicons name="chevron-back" size={24} color="white" />
        </Pressable>
      ) : (
        <View className="w-10 h-10" />
      )}

      {/* Title */}
      <View className="items-center">
        {showHiveName ? (
          <Text
            style={{
              fontFamily: 'Lato_700Bold',
              fontSize: 9,
              letterSpacing: 1.8,
              color: 'rgba(255,255,255,0.72)',
              marginBottom: 1,
            }}
          >
            {hiveName.toUpperCase()}
          </Text>
        ) : null}
        <View className="flex-row items-center">
          {titleIcon}
          <Text
            style={{ fontFamily: 'LibreBaskerville_700Bold', fontSize: 19, letterSpacing: 1.2 }}
            className="text-white"
          >
            {title}
          </Text>
        </View>
        {subtitle ? (
          <Text
            style={{ fontFamily: 'Lato_400Regular', fontSize: 12, color: 'rgba(255,255,255,0.78)', marginTop: 2 }}
          >
            {subtitle}
          </Text>
        ) : null}
      </View>

      {/* Right Element (or placeholder for alignment) */}
      {rightElement ? (
        rightElement
      ) : (
        <View className="w-10 h-10" />
      )}
    </View>
  );
});
