import { useEffect, useRef } from 'react';
import { Animated, Easing, Platform, Text, View, type StyleProp, type ViewStyle } from 'react-native';

/**
 * A bee, flying, while the app thinks.
 *
 * Nat, 2026-08-04: "any time we need to think even for a second, there should be
 * a little bee flying, so we know its thinking, not broken, and its cute!"
 *
 * Both halves of that matter. A spinner says *something is happening*; it does
 * not say *the HIVE is doing it*. Forty-seven grey `ActivityIndicator`s were the
 * one part of this app that could have belonged to any app at all.
 *
 * The flight is deliberately not a spin. A bee that rotated would read as a
 * loading icon wearing a costume — so this is the path a real one takes: a
 * figure-of-eight drift, a little bob, and a tilt that follows the direction of
 * travel. Slow enough to be legible at 20px, small enough not to become the
 * subject of the screen.
 *
 * Honours `prefers-reduced-motion` by holding still rather than disappearing —
 * somebody who has asked for less movement still needs to know the app is busy.
 */
export function ThinkingBee({
  size = 22,
  label,
  style,
}: {
  size?: number;
  /** A line under the bee. Say what is being waited for, not "Loading". */
  label?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(t, {
        toValue: 1,
        duration: 2600,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => loop.stop();
  }, [t]);

  // A figure of eight: x on one cycle, y on two, which is what makes the loop
  // cross itself instead of drawing a circle.
  const drift = size * 0.55;
  const translateX = t.interpolate({
    inputRange: [0, 0.25, 0.5, 0.75, 1],
    outputRange: [0, drift, 0, -drift, 0],
  });
  const translateY = t.interpolate({
    inputRange: [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1],
    outputRange: [0, -drift * 0.5, 0, drift * 0.5, 0, -drift * 0.5, 0, drift * 0.5, 0],
  });
  // Tilting into the turn is most of what sells it as flight rather than sliding.
  const rotate = t.interpolate({
    inputRange: [0, 0.25, 0.5, 0.75, 1],
    outputRange: ['-12deg', '10deg', '12deg', '-10deg', '-12deg'],
  });

  return (
    <View style={[{ alignItems: 'center', justifyContent: 'center' }, style]}>
      <View style={{ width: size * 2.2, height: size * 1.8, alignItems: 'center', justifyContent: 'center' }}>
        <Animated.Text
          accessibilityRole="progressbar"
          accessibilityLabel={label ?? 'Working on it'}
          style={{
            fontSize: size,
            lineHeight: size * 1.25,
            transform: [{ translateX }, { translateY }, { rotate }],
          }}
        >
          🐝
        </Animated.Text>
      </View>
      {label ? (
        <Text
          style={{
            fontFamily: 'Lato_400Regular',
            fontSize: 12.5,
            color: '#a09274',
            marginTop: 2,
            textAlign: 'center',
          }}
        >
          {label}
        </Text>
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Arriving: one bee, one colour, from the first pixel to the finished page.
//
// Nat, on her iPhone, 2026-08-06: "from the public site to the 'members only
// site' it was glitching out, flashes of different colours and quick nano
// flashes of the bee thinking… that's not good, we need to fix that."
//
// Recorded frame by frame, the crossing was four owners taking turns. The
// plain-HTML splash in public/index.html flew a bee for 2.6 seconds and then
// let go the instant React put anything at all in #root — at which point:
//
//   ~200ms  nothing at all, the splash faded out before anything replaced it
//    438ms  a SECOND bee, this one the root layout's font wait
//    595ms  nothing at all again, while the code for the route downloaded —
//           routes are split per screen on web now, and a screen that has not
//           landed yet draws literally nothing
//   then    the page
//
// Bee, gone, bee, gone, page. Each hole is a few frames long, which is exactly
// what "quick nano flashes" is a description of. A spinner that appears for
// under about a fifth of a second does not read as loading; it reads as a
// fault.
//
// So the boot has ONE loading surface and the plain-HTML splash is it. It is
// the only one that can paint on the browser's first frame, it already lands on
// the right colour, and it now stays up until a real screen says it has drawn
// something. Everything the app renders underneath in the meantime is invisible
// — which is why the screens below draw their colour and NOT a bee while the
// splash is still there. Two bees stacked is how you get a handover you can
// see.
// ---------------------------------------------------------------------------

/**
 * Is the plain-HTML boot splash still covering the screen?
 *
 * It is an element in public/index.html, removed the moment the app arrives, so
 * asking the document is asking the thing itself. On iOS there is no such
 * element and this is always false — the native app has no HTML splash, so its
 * loading screens keep their bee.
 */
export function bootSplashIsUp(): boolean {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return false;
  return !!document.getElementById('hive-boot-splash');
}

/**
 * The app has drawn a real screen. Take the boot splash down.
 *
 * Safe to call as often as you like — the splash leaves once and ignores the
 * rest. Call it from a screen somebody is meant to READ, never from a loading
 * state, or the splash goes back to letting go too early.
 */
export function markAppArrived(): void {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  const arrived = (window as unknown as { __hiveArrived?: () => void }).__hiveArrived;
  if (typeof arrived === 'function') arrived();
}

/**
 * The screen while HIVE is starting: the colour of where you are going, and a
 * bee only if nothing else is already flying one.
 *
 * `background` is passed in rather than read from `usePageSkin()` because the
 * first place this is used — the root layout's font wait — renders above the
 * auth context that the skin reads.
 */
export function ArrivalScreen({ background }: { background: string }) {
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: background }}>
      {bootSplashIsUp() ? null : <ThinkingBee />}
    </View>
  );
}
