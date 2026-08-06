import { useState, type ReactNode } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { usePageSkin } from '../../lib/pageSkin';

/**
 * A panel that opens and shuts.
 *
 * Nat, from her phone on 2026-08-06, about the HIVE-Wide explainer: *"i think
 * all of those, 'what is hive wide', 'select your hive' whatever, all of those
 * should be collapsible or expandable, thats a really nice feature, i like!"*
 *
 * The behaviour already existed in three places — the HIVE-Wide welcome, the
 * newsletter cards in The Buzz, and nowhere else — written out longhand each
 * time. It lives here now so a panel anywhere in the app opens the same way,
 * with the same chevron on the same side, and a screen that wants the pattern
 * later asks for it instead of copying it.
 *
 * Two ways to use it:
 *
 *   uncontrolled  pass `defaultOpen` and let the panel remember its own state
 *   controlled    pass `open` and `onToggle` — this is what a one-at-a-time
 *                 list needs, where opening a letter shuts the last one
 *
 * The body is taken off the screen entirely while the panel is shut rather than
 * hidden with a style. The Buzz holds forty newsletters of about two thousand
 * words each, so "hidden" would still be two thousand words of laid-out text per
 * card sitting in the page.
 *
 * Two things the panel does for itself, both switched on by the page that needs
 * them and both added on 2026-08-06 after Nat walked HIVE-Wide on her phone:
 *
 *   fitTitle        the header title holds one line, shrinking until it does
 *   colours.scrim   the panel darkens whatever picture it is floating over, so
 *                   pale ink stays readable wherever the panel lands
 */

export type CollapsiblePanelColours = {
  /** The title. */
  ink?: string;
  /** The subtitle and anything quiet in the header. */
  inkSoft?: string;
  /** Behind the panel. */
  fill?: string;
  /** The panel's edge, and the rule under the header. */
  border?: string;
  /** The chevron and the eyebrow line. */
  accent?: string;
  /** The panel while the header is being pressed. */
  pressed?: string;
  /**
   * A dark layer laid under `fill`, so the panel dims whatever it is floating
   * over before its own colour goes on top.
   *
   * HIVE-Wide hangs over a photograph of the Earth at night, and the picture is
   * fixed while the page scrolls, so any panel can end up sitting on the bright
   * limb of the planet. It did: Nat, on her phone 2026-08-06, could not read
   * "What We've Been Building" because cream ink was landing on the sunrise.
   * A see-through card over a bright thing is a bright thing with a tint on it.
   *
   * The panel keeps its see-through look over black space — near-black over
   * near-black changes nothing — and earns its own darkness exactly where the
   * picture gets bright. That is what makes a header readable wherever it lands
   * rather than wherever it is lucky.
   */
  scrim?: string;
};

export interface CollapsiblePanelProps {
  /** What the header says. */
  title: string;
  /**
   * What the header says while it is shut, when the shut panel is a different
   * offer from the open one. The HIVE-Wide welcome asks "What is HIVE-Wide?"
   * when it is away and is titled "Welcome to HIVE-Wide" once it is open.
   */
  collapsedTitle?: string;
  /** A small uppercase line above the title. Shown open or shut. */
  eyebrow?: string;
  /** A quiet line under the title — a date, a count. Shown open or shut. */
  subtitle?: ReactNode;
  /**
   * An icon to the left of the title.
   *
   * **Nothing in the app passes this today, and HIVE-Wide passes it on purpose
   * never again.** The welcome panel wore a question-mark badge until Nat looked
   * at the finished page on 2026-08-06: *"'what is HIVE wide' has a question mark
   * icon at the beginning & none of the others have that, so get rid of it."*
   * One panel in a stack of five carrying a badge is the badge saying "this one
   * is different", which is the opposite of what a stack of five is for.
   *
   * A page whose panels are genuinely different things may still want it. A page
   * that is one shape repeated should leave it alone.
   */
  icon?: keyof typeof Ionicons.glyphMap;
  /** A band of colour across the very top, for whose thing this is. */
  topAccent?: string;
  /** Where it starts, when the panel holds its own state. */
  defaultOpen?: boolean;
  /** Pass with `onToggle` to hold the state yourself. */
  open?: boolean;
  onToggle?: (next: boolean) => void;
  colours?: CollapsiblePanelColours;
  /**
   * Hold the header title to one line, shrinking the type until it fits.
   *
   * Nat, on her phone 2026-08-06: *"'What is HIVE-Wide?' … needs to fit on one
   * line."* A title that breaks mid-phrase reads as two half-thoughts, and on a
   * contents page — which is what a stack of shut panels is — every extra line
   * pushes the next panel further down the screen.
   *
   * Opt-in, because a page of long prose titles is better served by wrapping.
   * The Buzz names newsletters in full sentences and leaves this off.
   *
   * A title that still wraps with this on is a title set too big for the column
   * it is in, and the answer is a smaller `titleStyle` — Nat, 2026-08-06: *"if
   * it doesnt [fit], the font is too big, make it smaller."*
   */
  fitTitle?: boolean;
  /** A dashed edge — something still being written rather than finished. */
  dashed?: boolean;
  /** The outer box: sizing, a coloured left edge, margins. */
  style?: StyleProp<ViewStyle>;
  titleStyle?: StyleProp<TextStyle>;
  /** The inside of the panel. Defaults to 16 all round, minus the header's own. */
  bodyStyle?: StyleProp<ViewStyle>;
  children: ReactNode;
}

/**
 * How small a fitted title may go.
 *
 * Nat, 2026-08-06, on "What is HIVE-Wide?" breaking across two lines: *"That
 * should fit all in one line, if it doesnt, the font is too big, make it
 * smaller."* That is the trade, in her words, so the floor sits low enough that
 * nothing on a real phone reaches it — two thirds of a 17pt heading is 11.5pt,
 * which is small, and small on one line is what she asked for.
 *
 * It was 0.74 and that was too high: "Welcome to HIVE-Wide" at 19pt in the
 * HIVE-Wide welcome's column needed 0.73 and stopped one hundredth short, so the
 * panel shrank the type AND wrapped it, which is the worst of both.
 */
const SMALLEST_FITTED_TITLE = 0.66;

/**
 * Whole pixels held back from the title's column before the shrink is worked out.
 *
 * Both numbers this maths runs on are whole pixels. On the web `onLayout`
 * reports `offsetWidth`, which the browser rounds to the nearest integer
 * (react-native-web's `UIManager.measure`), so a column really 187.6 points wide
 * is reported as 188 and a title really 214.8 wide is reported as 215. Fitting
 * the title to exactly the reported room therefore aims it at a line that is up
 * to a point narrower than the number says — and a title one hundredth of a
 * point too wide wraps just as hard as one that is ten points too wide.
 *
 * Two points covers both roundings and the sub-pixel drift of shaping the same
 * words at a different size. It costs about one percent of the type.
 */
const FITTED_TITLE_SLACK = 2;

export function CollapsiblePanel({
  title,
  collapsedTitle,
  eyebrow,
  subtitle,
  icon,
  topAccent,
  defaultOpen = true,
  open: openProp,
  onToggle,
  colours,
  fitTitle = false,
  dashed = false,
  style,
  titleStyle,
  bodyStyle,
  children,
}: CollapsiblePanelProps) {
  // The page decides the colours unless the caller knows better — HIVE-Wide and
  // The Buzz both hang in space and carry their own slightly warmer tokens.
  const skin = usePageSkin();
  const ink = colours?.ink ?? skin.ink;
  const inkSoft = colours?.inkSoft ?? skin.inkSoft;
  const fill = colours?.fill ?? skin.card;
  const border = colours?.border ?? skin.border;
  const accent = colours?.accent ?? skin.gold;
  const pressedFill = colours?.pressed ?? skin.cardPressed;
  const scrim = colours?.scrim;

  const [openState, setOpenState] = useState(defaultOpen);
  const controlled = openProp !== undefined;
  const open = controlled ? openProp : openState;

  const toggle = () => {
    const next = !open;
    if (!controlled) setOpenState(next);
    onToggle?.(next);
  };

  const headerText = open ? title : (collapsedTitle ?? title);

  /**
   * Fitting the title, measured rather than guessed.
   *
   * `titleRoom` is how wide the title's column actually is; `titleWants` is how
   * wide this title would be if nothing stopped it. The ratio is the shrink.
   *
   * Both numbers come from the layout instead of from a table of letter widths,
   * because the fonts arrive after the first paint — a table would be right
   * about Libre Baskerville and wrong about the serif standing in for it, and
   * wrong again the day somebody changes the typeface.
   *
   * There is no loop between the two: the column is `flex: 1`, so its width is
   * the row minus the icon and the chevron whatever the title does, and the
   * measuring copy is always set at the title's full size.
   *
   * The column is narrower than the panel by more than it looks: 16 points of
   * padding each side, the chevron and its gap, and — where a panel has one —
   * the icon and its gap. On a 375-point phone that is 61 points gone before the
   * title gets a word in, and 89 on a panel carrying an icon. HIVE-Wide's
   * welcome carried one until 2026-08-06 and now none of them do, which handed
   * its title 28 points back.
   *
   * Both numbers arrive as whole pixels, which is why the shrink holds
   * `FITTED_TITLE_SLACK` back rather than aiming at the room exactly.
   */
  const [titleRoom, setTitleRoom] = useState(0);
  const [titleWants, setTitleWants] = useState(0);

  const baseTitle = StyleSheet.flatten([
    {
      fontFamily: 'LibreBaskerville_700Bold',
      fontSize: 17,
      letterSpacing: 0.4,
      color: ink,
    } as TextStyle,
    titleStyle,
  ]) as TextStyle;
  const baseTitleSize = typeof baseTitle.fontSize === 'number' ? baseTitle.fontSize : 17;
  const baseTitleSpacing =
    typeof baseTitle.letterSpacing === 'number' ? baseTitle.letterSpacing : 0;

  const titleLine = Math.max(0, titleRoom - FITTED_TITLE_SLACK);
  const titleFit =
    fitTitle && titleRoom > 0 && titleWants > titleLine
      ? Math.max(SMALLEST_FITTED_TITLE, titleLine / titleWants)
      : 1;

  return (
    <View
      style={[
        {
          borderRadius: 16,
          borderWidth: 1,
          borderStyle: dashed ? 'dashed' : 'solid',
          borderColor: border,
          // With a scrim the panel is two layers: the dark one here, the
          // panel's own colour laid over it below.
          backgroundColor: scrim ?? fill,
          // So a top accent band takes the panel's rounded corners with it —
          // and so the off-screen ruler used to measure the title stays put.
          overflow: 'hidden',
        },
        style,
      ]}
    >
      {scrim ? (
        <View
          pointerEvents="none"
          style={[StyleSheet.absoluteFillObject, { backgroundColor: fill }]}
        />
      ) : null}

      {topAccent ? <View style={{ height: 4, backgroundColor: topAccent }} /> : null}

      <Pressable
        onPress={toggle}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={open ? `${headerText}, open` : `${headerText}, shut`}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'flex-start',
          gap: 10,
          padding: 16,
          backgroundColor: pressed ? pressedFill : 'transparent',
        })}
      >
        {icon ? (
          <View style={{ paddingTop: 1 }}>
            <Ionicons name={icon} size={18} color={accent} />
          </View>
        ) : null}

        <View
          style={{ flex: 1 }}
          onLayout={
            fitTitle
              ? (event) => {
                  const room = event.nativeEvent.layout.width;
                  setTitleRoom((was) => (Math.abs(was - room) > 0.5 ? room : was));
                }
              : undefined
          }
        >
          {/* The ruler. A copy of the title at full size, kept out of the way in
              a box far wider than any screen so nothing squeezes it, and read
              for one number: how wide this title wants to be. It is invisible,
              untouchable, and skipped by screen readers — the real title is
              right underneath saying the same words. */}
          {fitTitle ? (
            <View
              pointerEvents="none"
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                width: 4000,
                opacity: 0,
                alignItems: 'flex-start',
              }}
            >
              <Text
                style={baseTitle}
                numberOfLines={1}
                onLayout={(event) => {
                  const wants = event.nativeEvent.layout.width;
                  setTitleWants((was) => (Math.abs(was - wants) > 0.5 ? wants : was));
                }}
              >
                {headerText}
              </Text>
            </View>
          ) : null}

          {eyebrow ? (
            <Text
              style={{
                fontFamily: 'Lato_700Bold',
                fontSize: 10.5,
                letterSpacing: 1.1,
                textTransform: 'uppercase',
                color: accent,
                marginBottom: 3,
              }}
            >
              {eyebrow}
            </Text>
          ) : null}
          <Text
            // A panel asked to hold its title to one line holds it to one line.
            // The shrink above is measured and now carries slack, so this is the
            // backstop: on a screen narrow enough to reach the floor the title
            // trails off rather than breaking a phrase in half.
            numberOfLines={fitTitle ? 1 : undefined}
            style={[
              baseTitle,
              titleFit < 1
                ? {
                    fontSize: baseTitleSize * titleFit,
                    // The spacing between the letters shrinks with them, so a
                    // fitted title keeps the same colour and rhythm as a title
                    // that fitted on its own.
                    letterSpacing: baseTitleSpacing * titleFit,
                  }
                : null,
            ]}
          >
            {headerText}
          </Text>
          {typeof subtitle === 'string' ? (
            <Text
              style={{
                fontFamily: 'Lato_400Regular',
                fontSize: 12,
                color: inkSoft,
                marginTop: 3,
              }}
            >
              {subtitle}
            </Text>
          ) : (
            subtitle ?? null
          )}
        </View>

        <Ionicons
          name={open ? 'chevron-up' : 'chevron-down'}
          size={19}
          color={accent}
          style={{ marginTop: 1 }}
        />
      </Pressable>

      {open ? (
        <View style={[{ paddingHorizontal: 16, paddingBottom: 16 }, bodyStyle]}>{children}</View>
      ) : null}
    </View>
  );
}
