import { useEffect, useRef, useMemo } from 'react';
import { Animated, View } from 'react-native';

const COLORS = ['#bd9348', '#f0c060', '#e8a030', '#5a9ae0', '#e05a7a', '#7ac95a', '#e07a5a', '#a05ae0'];

interface Particle {
  id: number;
  angle: number;
  distance: number;
  color: string;
  delay: number;
  size: number;
}

interface ConfettiBurstProps {
  visible: boolean;
  onDone: () => void;
}

export function ConfettiBurst({ visible, onDone }: ConfettiBurstProps) {
  const particles = useMemo<Particle[]>(() =>
    Array.from({ length: 16 }, (_, i) => ({
      id: i,
      angle: (i / 16) * 2 * Math.PI + (Math.random() - 0.5) * 0.8,
      distance: 50 + Math.random() * 70,
      color: COLORS[i % COLORS.length],
      delay: Math.random() * 80,
      size: 6 + Math.random() * 7,
    })),
  []);

  const positions = useRef(particles.map(() => new Animated.ValueXY({ x: 0, y: 0 }))).current;
  const opacities = useRef(particles.map(() => new Animated.Value(0))).current;
  const scales = useRef(particles.map(() => new Animated.Value(0))).current;

  useEffect(() => {
    if (!visible) return;

    const anims = particles.map((p, i) => {
      const dx = Math.cos(p.angle) * p.distance;
      const dy = Math.sin(p.angle) * p.distance - 30;

      positions[i].setValue({ x: 0, y: 0 });
      opacities[i].setValue(0);
      scales[i].setValue(0);

      return Animated.sequence([
        Animated.delay(p.delay),
        Animated.parallel([
          Animated.timing(positions[i], {
            toValue: { x: dx, y: dy },
            duration: 650,
            useNativeDriver: true,
          }),
          Animated.sequence([
            Animated.timing(scales[i], { toValue: 1, duration: 120, useNativeDriver: true }),
            Animated.timing(scales[i], { toValue: 0.6, duration: 530, useNativeDriver: true }),
          ]),
          Animated.sequence([
            Animated.timing(opacities[i], { toValue: 1, duration: 80, useNativeDriver: true }),
            Animated.delay(300),
            Animated.timing(opacities[i], { toValue: 0, duration: 270, useNativeDriver: true }),
          ]),
        ]),
      ]);
    });

    Animated.parallel(anims).start(() => onDone());
  }, [visible]);

  if (!visible) return null;

  return (
    <View
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 999,
        pointerEvents: 'none',
      }}
      pointerEvents="none"
    >
      {particles.map((p, i) => (
        <Animated.View
          key={p.id}
          style={{
            position: 'absolute',
            width: p.size,
            height: p.size,
            borderRadius: p.id % 3 === 0 ? p.size / 2 : 2,
            backgroundColor: p.color,
            opacity: opacities[i],
            transform: [
              ...positions[i].getTranslateTransform(),
              { scale: scales[i] },
            ],
          }}
        />
      ))}
    </View>
  );
}
