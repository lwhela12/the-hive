import { memo } from 'react';
import { View, Text } from 'react-native';
import { useAuth } from '../../lib/hooks/useAuth';
import { hiveAccent, hiveDisplayName } from '../../lib/hiveBrand';
import { BackButton } from '../ui/BackButton';

interface AppHeaderProps {
  title: string;
  /** Back arrow in the left slot (for pushed pages like Honey Pot). */
  onBackPress?: () => void;
  /** Small mark rendered just before the title (e.g. Clive's crest). */
  titleIcon?: React.ReactNode;
  rightElement?: React.ReactNode;
  /**
   * Which world this page belongs to.
   *
   * 'hive'  the HIVE you're in — its colour, its name above the title.
   * 'wide'  HIVE-Wide — space black, with HIVE-WIDE as the location line.
   *
   * A page left on the default follows wherever the reader is standing. Pass
   * `wide` only for a page, such as Admin, that always belongs to HIVE-Wide.
   * There is deliberately no one-off Admin tone: one place gets one header.
   */
  tone?: 'hive' | 'wide';
}

/**
 * HIVE-Wide's black. It is the black the globe hangs in, so the header, rail,
 * and page are visibly one place — "we'd have the black space header, not
 * green" (Nat 2026-08-03). Admin uses this same treatment because it says its
 * location is HIVE-Wide; a different colour would contradict its own WHERE.
 */
const WIDE_HEADER = '#0B0B12';

// The one page-title treatment for the whole app: WHERE above WHAT, and stop.
//
// Nat's HIVE-wide decree, 2026-08-24: page headers keep the place (HIVE-Wide,
// OG HIVE, Tech HIVE, Production HIVE) and the destination (Members, Boards,
// Clive, etc.), with no explanatory sentence underneath. Functional guidance
// belongs beside the control or content it explains, never in this masthead.
// Keeping the prop out of this interface makes the rule compile-time enforced.
// Every tab screen should use this instead of hand-rolling a header.
//
// The bar takes its colour from where you are. The tiny line is WHERE. The
// large line is WHAT, matching the selected side-rail destination. No exceptions.
export const AppHeader = memo(function AppHeader({
  title,
  onBackPress,
  titleIcon,
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
  // An explicit 'wide' wins for a screen such as Admin that always belongs to
  // HIVE-Wide. There is no visual sub-world above HIVE-Wide: if the WHERE says
  // HIVE-Wide, it wears HIVE-Wide's one header.
  const resolvedTone = tone === 'hive' && wholeHive ? 'wide' : tone;
  const accent = resolvedTone === 'hive' ? hiveAccent(community) : WIDE_HEADER;
  const hiveName = hiveDisplayName(community?.name);
  // The line above the title says WHERE. It never disappears: Home is still a
  // page inside OG HIVE / Tech HIVE / Production HIVE, and Admin is a page at
  // HIVE-Wide. The large title says WHAT and matches the side rail.
  //
  // HIVE-Wide used to say nothing here, on the reasoning that it sits above the
  // HIVEs and so has no HIVE to name. That was wrong in practice: it left the
  // most easily-confused place as the only one that never said its own name.
  // Nat 2026-08-03: "when you're in HIVE-Wide it needs to say that on all the
  // headers... we want to make sure you know which one you're in."
  const eyebrow = resolvedTone === 'hive' ? hiveName : 'HIVE-WIDE';
  const showHiveName = !!eyebrow;

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
        <BackButton onPress={onBackPress} color="white" />
      ) : (
        <View className="w-11 h-11" />
      )}

      {/* Title */}
      <View className="items-center" style={{ flex: 1, minWidth: 0, paddingHorizontal: 6 }}>
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
            {eyebrow!.toUpperCase()}
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
      </View>

      {/* Right Element (or placeholder for alignment) */}
      {rightElement ? (
        rightElement
      ) : (
        <View className="w-11 h-11" />
      )}
    </View>
  );
});
