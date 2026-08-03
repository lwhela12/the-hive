import { useEffect, useState } from 'react';
import { View, AccessibilityInfo, StyleSheet } from 'react-native';
import Svg, { Circle, Ellipse, G, Polygon, Defs, ClipPath, RadialGradient, Stop } from 'react-native-svg';
import Animated, {
  type SharedValue,
  useSharedValue,
  useAnimatedProps,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';

/**
 * A slowly turning globe, with flurries.
 *
 * Nat's, 2026-08-03, and the point of it is legibility rather than decoration:
 * HIVE-Wide and Admin are the two places you stand ABOVE the HIVEs, and they
 * should feel different the instant they load, before you've read a word.
 *
 * It's a honeycomb globe rather than a wireframe one — HIVE's own shape, turned
 * into a planet. The meridians really do rotate: each one's width follows
 * cos(angle), which is what the eye reads as a sphere turning rather than a set
 * of ellipses pulsing.
 *
 * Deliberately very quiet. It sits behind everything at low opacity, takes 28
 * seconds for a full turn, and stops dead for anyone who has asked their device
 * for less motion.
 */

const AnimatedEllipse = Animated.createAnimatedComponent(Ellipse);

const MERIDIANS = [0, 1, 2, 3, 4];
const FLURRIES = [
  { x: 0.12, size: 3.5, delay: 0, drift: 16, dur: 9000 },
  { x: 0.26, size: 2.5, delay: 1400, drift: -12, dur: 11000 },
  { x: 0.41, size: 4, delay: 700, drift: 10, dur: 8200 },
  { x: 0.55, size: 2.5, delay: 2600, drift: -18, dur: 12500 },
  { x: 0.68, size: 3.5, delay: 400, drift: 14, dur: 9800 },
  { x: 0.79, size: 2, delay: 3200, drift: -9, dur: 10600 },
  { x: 0.9, size: 3, delay: 1900, drift: 12, dur: 11800 },
];

function Flurry({
  spec,
  colour,
  height,
  still,
}: {
  spec: (typeof FLURRIES)[number];
  colour: string;
  height: number;
  still: boolean;
}) {
  const t = useSharedValue(0);

  useEffect(() => {
    if (still) return;
    t.value = 0;
    const start = setTimeout(() => {
      t.value = withRepeat(
        withTiming(1, { duration: spec.dur, easing: Easing.linear }),
        -1,
        false
      );
    }, spec.delay);
    return () => clearTimeout(start);
  }, [still, spec.dur, spec.delay]);

  const style = useAnimatedStyle(() => {
    // Rises from below the fold to above it, drifting sideways and fading at
    // both ends so nothing ever pops in or out.
    const y = height - t.value * (height + 60);
    const fade = Math.sin(Math.PI * t.value);
    return {
      transform: [
        { translateY: still ? height * 0.5 : y },
        { translateX: still ? 0 : Math.sin(t.value * Math.PI * 2) * spec.drift },
      ],
      opacity: still ? 0.25 : fade * 0.5,
    };
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          left: `${spec.x * 100}%`,
          top: 0,
          width: spec.size,
          height: spec.size,
          borderRadius: spec.size / 2,
          backgroundColor: colour,
        },
        style,
      ]}
    />
  );
}

/**
 * One meridian. It's its own component so the animation hook is called once per
 * line rather than in a loop — same reason any hook lives at the top of a
 * component, and a rule that bites silently if the count ever changes.
 */
function Meridian({
  index,
  total,
  spin,
  still,
  cx,
  cy,
  r,
  colour,
}: {
  index: number;
  total: number;
  spin: SharedValue<number>;
  still: boolean;
  cx: number;
  cy: number;
  r: number;
  colour: string;
}) {
  const animatedProps = useAnimatedProps(() => {
    const phase = (index / total) * Math.PI;
    const angle = still ? phase : spin.value * Math.PI * 2 + phase;
    // Width follows |cos|, so each line flattens to nothing as it turns
    // edge-on. That is the whole illusion.
    return { rx: Math.max(0.6, Math.abs(Math.cos(angle)) * r * 0.94) };
  });

  return (
    <AnimatedEllipse
      cx={cx}
      cy={cy}
      ry={r * 0.94}
      fill="none"
      stroke={colour}
      strokeWidth={0.9}
      opacity={0.6}
      animatedProps={animatedProps}
    />
  );
}

/** A honeycomb, clipped to the globe, so the planet is made of HIVE. */
function HexField({ size, colour }: { size: number; colour: string }) {
  const r = size / 13;
  const w = r * Math.sqrt(3);
  const h = r * 1.5;
  const cells: { cx: number; cy: number }[] = [];
  for (let row = -1; row < 14; row++) {
    for (let col = -1; col < 14; col++) {
      cells.push({ cx: col * w + (row % 2 ? w / 2 : 0), cy: row * h });
    }
  }
  const points = (cx: number, cy: number) =>
    Array.from({ length: 6 }, (_, i) => {
      const a = (Math.PI / 3) * i - Math.PI / 2;
      return `${cx + r * 0.92 * Math.cos(a)},${cy + r * 0.92 * Math.sin(a)}`;
    }).join(' ');

  return (
    <G clipPath="url(#globeClip)" opacity={0.5}>
      {cells.map((c, i) => (
        <Polygon key={i} points={points(c.cx, c.cy)} fill="none" stroke={colour} strokeWidth={0.6} />
      ))}
    </G>
  );
}

export function SpinningGlobe({
  colour = '#3F7D5C',
  size = 320,
}: {
  /** The world this page belongs to — HIVE-Wide green, or Admin's slate. */
  colour?: string;
  size?: number;
}) {
  const [still, setStill] = useState(false);
  const spin = useSharedValue(0);

  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((reduce) => { if (alive) setStill(!!reduce); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (still) return;
    spin.value = withRepeat(
      withTiming(1, { duration: 28000, easing: Easing.linear }),
      -1,
      false
    );
  }, [still]);

  const R = size / 2;
  const C = size / 2;

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFillObject, { overflow: 'hidden' }]}>
      <View style={{ position: 'absolute', top: '12%', alignSelf: 'center', opacity: 0.16 }}>
        <Svg width={size} height={size}>
          <Defs>
            <ClipPath id="globeClip">
              <Circle cx={C} cy={C} r={R * 0.96} />
            </ClipPath>
            <RadialGradient id="globeBody" cx="38%" cy="32%" r="72%">
              <Stop offset="0%" stopColor={colour} stopOpacity={0.5} />
              <Stop offset="100%" stopColor={colour} stopOpacity={0.06} />
            </RadialGradient>
          </Defs>

          <Circle cx={C} cy={C} r={R * 0.96} fill="url(#globeBody)" />
          <HexField size={size} colour={colour} />

          {/* Latitudes hold still; only the meridians turn. */}
          {[0.34, 0.62, 0.84].map((k, i) => (
            <Ellipse
              key={i}
              cx={C}
              cy={C}
              rx={R * 0.94}
              ry={R * 0.94 * k}
              fill="none"
              stroke={colour}
              strokeWidth={0.9}
              opacity={0.55}
            />
          ))}

          {MERIDIANS.map((i) => (
            <Meridian
              key={i}
              index={i}
              total={MERIDIANS.length}
              spin={spin}
              still={still}
              cx={C}
              cy={C}
              r={R}
              colour={colour}
            />
          ))}

          <Circle cx={C} cy={C} r={R * 0.96} fill="none" stroke={colour} strokeWidth={1.4} opacity={0.7} />
        </Svg>
      </View>

      {FLURRIES.map((spec, i) => (
        <Flurry key={i} spec={spec} colour={colour} height={620} still={still} />
      ))}
    </View>
  );
}
