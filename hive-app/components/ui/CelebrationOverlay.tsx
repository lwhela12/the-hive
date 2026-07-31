import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Text, View, useWindowDimensions } from 'react-native';
import { onCelebrate, type Celebration } from '../../lib/celebration';

const COLORS = ['#bd9348', '#f0c060', '#e8a030', '#5a9ae0', '#e05a7a', '#7ac95a', '#e07a5a', '#a05ae0'];

const PARTICLE_COUNT = 70;
const FLIGHT_MS = 1700;
const HOLD_MS = 1500;

interface Particle {
  id: number;
  /** Sideways travel, in pixels, over the whole flight. */
  driftX: number;
  /** How high it shoots before gravity wins. */
  lift: number;
  /** How far below the start it ends up. */
  fall: number;
  color: string;
  size: number;
  ratio: number;
  spins: number;
  round: boolean;
  delay: number;
}

/** Sample a lob — up fast, then accelerating down — as interpolation keyframes. */
function arcKeyframes(lift: number, fall: number) {
  const steps = 10;
  const input: number[] = [];
  const output: number[] = [];
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    // An upward lob that gravity beats about halfway through: the first term
    // arcs up and back, the accelerating second term carries it off the bottom.
    const y = -lift * 4 * t * (1 - t) + fall * t * t;
    input.push(t);
    output.push(y);
  }
  return { input, output };
}

function makeParticles(width: number, height: number): Particle[] {
  const spread = Math.max(width, 320);
  return Array.from({ length: PARTICLE_COUNT }, (_, i) => ({
    id: i,
    driftX: (Math.random() - 0.5) * spread * 1.1,
    lift: height * (0.14 + Math.random() * 0.3),
    fall: height * (0.55 + Math.random() * 0.55),
    color: COLORS[i % COLORS.length],
    size: 8 + Math.random() * 10,
    ratio: 0.4 + Math.random() * 0.7,
    spins: (Math.random() < 0.5 ? -1 : 1) * (1 + Math.random() * 3),
    round: i % 4 === 0,
    delay: Math.random() * 260,
  }));
}

/**
 * Mounted once, at the tab layout. Listens for celebrate() and throws a
 * screen-wide burst of confetti with a short banner over the top of whatever
 * the member is looking at. Never blocks taps.
 */
export function CelebrationOverlay() {
  const { width, height } = useWindowDimensions();
  const [celebration, setCelebration] = useState<Celebration | null>(null);
  const [particles, setParticles] = useState<Particle[]>([]);

  // One driver for every particle: 0 → 1 across the flight.
  const flight = useRef(new Animated.Value(0)).current;
  const bannerScale = useRef(new Animated.Value(0.6)).current;
  const bannerOpacity = useRef(new Animated.Value(0)).current;

  const sizeRef = useRef({ width, height });
  sizeRef.current = { width, height };

  const start = useCallback((next: Celebration) => {
    const { width: w, height: h } = sizeRef.current;
    setParticles(makeParticles(w, h));
    setCelebration(next);

    flight.setValue(0);
    bannerScale.setValue(0.6);
    bannerOpacity.setValue(0);

    Animated.parallel([
      Animated.timing(flight, {
        toValue: 1,
        duration: FLIGHT_MS,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
      Animated.sequence([
        Animated.parallel([
          Animated.spring(bannerScale, {
            toValue: 1,
            friction: 5,
            tension: 120,
            useNativeDriver: true,
          }),
          Animated.timing(bannerOpacity, {
            toValue: 1,
            duration: 180,
            useNativeDriver: true,
          }),
        ]),
        Animated.delay(HOLD_MS),
        Animated.timing(bannerOpacity, {
          toValue: 0,
          duration: 380,
          useNativeDriver: true,
        }),
      ]),
    ]).start(({ finished }) => {
      if (finished) setCelebration(null);
    });
  }, [bannerOpacity, bannerScale, flight]);

  useEffect(() => onCelebrate(start), [start]);

  if (!celebration) return null;

  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        pointerEvents: 'none',
      }}
    >
      {particles.map((p) => {
        // Each particle only moves during its own slice of the flight, so the
        // burst staggers instead of firing as one flat sheet.
        // Floored so the interpolation input range is always strictly rising.
        const startAt = Math.max(0.02, p.delay / (FLIGHT_MS + 260));
        const range = [0, startAt, 1];
        const arc = arcKeyframes(p.lift, p.fall);

        return (
          <Animated.View
            key={p.id}
            style={{
              position: 'absolute',
              width: p.size,
              height: p.size * p.ratio,
              borderRadius: p.round ? p.size / 2 : 2,
              backgroundColor: p.color,
              opacity: flight.interpolate({
                inputRange: [0, startAt, startAt + 0.05, 0.75, 1],
                outputRange: [0, 0, 1, 1, 0],
              }),
              transform: [
                {
                  translateX: flight.interpolate({
                    inputRange: range,
                    outputRange: [0, 0, p.driftX],
                  }),
                },
                {
                  translateY: flight.interpolate({
                    // Pinned at 0 from the very start, otherwise Animated
                    // extrapolates backwards and the particle begins off-centre.
                    inputRange: [0, ...arc.input.map((t) => startAt + t * (1 - startAt))],
                    outputRange: [0, ...arc.output],
                  }),
                },
                {
                  rotate: flight.interpolate({
                    inputRange: range,
                    outputRange: ['0deg', '0deg', `${p.spins * 360}deg`],
                  }),
                },
              ],
            }}
          />
        );
      })}

      <Animated.View
        style={{
          opacity: bannerOpacity,
          transform: [{ scale: bannerScale }],
          backgroundColor: '#fffdf7',
          borderRadius: 24,
          borderWidth: 2,
          borderColor: '#dec181',
          paddingVertical: 22,
          paddingHorizontal: 30,
          maxWidth: Math.min(width - 48, 420),
          alignItems: 'center',
          shadowColor: '#2d2d2d',
          shadowOpacity: 0.18,
          shadowRadius: 24,
          shadowOffset: { width: 0, height: 8 },
          elevation: 8,
        }}
      >
        <Text style={{ fontSize: 40, marginBottom: 6 }}>🎉</Text>
        <Text
          style={{ fontFamily: 'LibreBaskerville_700Bold', fontSize: 22, color: '#bd9348', textAlign: 'center' }}
        >
          {celebration.title}
        </Text>
        {celebration.subtitle ? (
          <Text
            style={{
              fontFamily: 'Lato_400Regular',
              fontSize: 14,
              color: '#2d2d2db3',
              textAlign: 'center',
              marginTop: 8,
            }}
          >
            {celebration.subtitle}
          </Text>
        ) : null}
      </Animated.View>
    </View>
  );
}
