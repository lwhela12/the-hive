import { useEffect, useRef } from 'react';
import { Animated, Easing, Text, View, type StyleProp, type ViewStyle } from 'react-native';

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
