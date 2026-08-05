import { useEffect, useRef } from 'react';
import { Animated, Pressable, Text, View, type ViewStyle } from 'react-native';

/**
 * On or off, drawn one way, everywhere.
 *
 * Settings was asking four preference questions and answering them with four
 * different controls: two stacked radio cards for "How far you travel", the
 * same two cards again for "Your default sharing", a sliding pill for "Who can
 * see you", and a gold **On** button for each email. Four looks, four
 * alignments, one job. Nat, 2026-08-05: *"we have 3 questions asking you about
 * your preferences & they are saved 3 different ways. We need one style & one
 * alignment throughout."*
 *
 * The sliding pill is the one she likes — *"I prefer toggles like this"* — so
 * that is the one that survived, lifted out of `settings.tsx` and put here so
 * the next screen that needs a yes/no can't invent a fifth.
 *
 * ## The shape
 *
 * Track on the left, then the label, then its one line of explanation beneath.
 * The whole row is the target, because a 44-pixel pill is a small thing to ask
 * a thumb to find and the words next to it are already what people aim at.
 *
 * ## Two named things can still be a switch
 *
 * Some of these are a choice between two named rungs rather than an on/off —
 * "stay in my HIVE" against "come with me". They still fit, as long as the
 * label says what ON means and the explanation carries the consequence. Anything
 * with three or more real options is not a switch; that is
 * `components/ui/ScopePicker.tsx`.
 *
 * ## `trailing`
 *
 * A slot beside the label for something that changes as you flip it. "Your
 * default sharing" puts a live `ScopeBadge` there, so flipping the switch shows
 * you the badge your next wish will actually wear. Nat: *"that just shows what
 * things look like if they are shared, so you're toggling on and off your
 * choice & on and off what it looks like."* The setting shows you its own result.
 */

const GOLD = '#bd9348';
const TRACK_OFF = 'rgba(49,49,48,0.18)';
const KNOB = '#fffdf5';
const INK = '#313130';
const INK_QUIET = 'rgba(49,49,48,0.62)';

/**
 * The one switch row, in numbers.
 *
 * This is the ONE place they are written down. A row that cannot go through
 * `Switch` — a permission prompt that ends in a button rather than a pill — can
 * still read `SWITCH_GUTTER` and start its words at the same x, which is the
 * whole point of the exercise.
 */
export const SWITCH_LOOK = {
  trackWidth: 44,
  trackHeight: 26,
  knob: 20,
  /** The gap between the knob and the inside of the track. */
  inset: 3,
  /** Track to words. */
  gap: 12,
  labelSize: 14.5,
  hintSize: 13,
  hintLineHeight: 19,
  rowPaddingVertical: 12,
  ink: INK,
  inkQuiet: INK_QUIET,
  labelFont: 'Lato_700Bold',
  hintFont: 'Lato_400Regular',
} as const;

/** How far from the left edge of a row every label in the app starts. */
export const SWITCH_GUTTER = SWITCH_LOOK.trackWidth + SWITCH_LOOK.gap;

/** How far the knob slides. */
const TRAVEL = SWITCH_LOOK.trackWidth - SWITCH_LOOK.inset * 2 - SWITCH_LOOK.knob;

export function Switch({
  on,
  onToggle,
  label,
  hint,
  trailing,
  busy,
  disabled,
  style,
}: {
  on: boolean;
  /** Handed the value the switch is moving TO, so a caller never re-derives it. */
  onToggle: (next: boolean) => void;
  label: string;
  /** One line saying what being in this position means for you. */
  hint?: string;
  /** Something beside the label that changes with the switch — a live badge. */
  trailing?: React.ReactNode;
  /** Mid-save. The row still reads, it just won't take another tap. */
  busy?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
}) {
  const inert = !!busy || !!disabled;

  // The slide is what makes it read as a switch rather than a lamp. It is
  // driven by the value rather than by the tap, so a save that fails and puts
  // the value back slides back too, with no extra wiring at the call site.
  const slide = useRef(new Animated.Value(on ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(slide, {
      toValue: on ? 1 : 0,
      duration: 160,
      // Colour cannot be animated on the native thread, and the two halves of
      // the movement have to arrive together or the knob outruns the gold.
      useNativeDriver: false,
    }).start();
  }, [on, slide]);

  return (
    <Pressable
      onPress={() => {
        if (inert) return;
        onToggle(!on);
      }}
      disabled={inert}
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ checked: on, disabled: inert }}
      style={[
        {
          flexDirection: 'row',
          alignItems: 'flex-start',
          gap: SWITCH_LOOK.gap,
          paddingVertical: SWITCH_LOOK.rowPaddingVertical,
          opacity: inert ? 0.55 : 1,
        },
        style,
      ]}
    >
      <Animated.View
        style={{
          width: SWITCH_LOOK.trackWidth,
          height: SWITCH_LOOK.trackHeight,
          borderRadius: SWITCH_LOOK.trackHeight / 2,
          padding: SWITCH_LOOK.inset,
          justifyContent: 'center',
          // Nudged down so the pill sits on the label's line rather than above it.
          marginTop: 1,
          backgroundColor: slide.interpolate({
            inputRange: [0, 1],
            outputRange: [TRACK_OFF, GOLD],
          }),
        }}
      >
        <Animated.View
          style={{
            width: SWITCH_LOOK.knob,
            height: SWITCH_LOOK.knob,
            borderRadius: SWITCH_LOOK.knob / 2,
            backgroundColor: KNOB,
            shadowColor: '#000',
            shadowOpacity: 0.16,
            shadowRadius: 2,
            shadowOffset: { width: 0, height: 1 },
            transform: [
              { translateX: slide.interpolate({ inputRange: [0, 1], outputRange: [0, TRAVEL] }) },
            ],
          }}
        />
      </Animated.View>

      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <Text
            style={{
              fontFamily: SWITCH_LOOK.labelFont,
              fontSize: SWITCH_LOOK.labelSize,
              color: INK,
            }}
          >
            {label}
          </Text>
          {trailing}
        </View>
        {hint ? (
          <Text
            style={{
              fontFamily: SWITCH_LOOK.hintFont,
              fontSize: SWITCH_LOOK.hintSize,
              lineHeight: SWITCH_LOOK.hintLineHeight,
              color: INK_QUIET,
              marginTop: 2,
            }}
          >
            {hint}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}
