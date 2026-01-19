import { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet, ViewStyle, DimensionValue } from 'react-native';

interface SkeletonProps {
  width?: DimensionValue;
  height?: number;
  borderRadius?: number;
  style?: ViewStyle;
}

/**
 * Animated skeleton placeholder with pulse animation
 */
export function Skeleton({ width = '100%', height = 16, borderRadius = 4, style }: SkeletonProps) {
  const opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.7,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.3,
          duration: 800,
          useNativeDriver: true,
        }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        styles.skeleton,
        {
          width: width as DimensionValue,
          height,
          borderRadius,
          opacity,
        } as Animated.WithAnimatedObject<ViewStyle>,
        style,
      ]}
    />
  );
}

interface SkeletonCircleProps {
  size?: number;
  style?: ViewStyle;
}

/**
 * Circular skeleton for avatars
 */
export function SkeletonCircle({ size = 44, style }: SkeletonCircleProps) {
  return <Skeleton width={size} height={size} borderRadius={size / 2} style={style} />;
}

interface SkeletonTextProps {
  lines?: number;
  lineHeight?: number;
  spacing?: number;
  lastLineWidth?: DimensionValue;
  style?: ViewStyle;
}

/**
 * Multiple line skeleton for text blocks
 */
export function SkeletonText({
  lines = 1,
  lineHeight = 14,
  spacing = 8,
  lastLineWidth = '60%',
  style,
}: SkeletonTextProps) {
  return (
    <View style={style}>
      {Array.from({ length: lines }).map((_, index) => (
        <Skeleton
          key={index}
          width={index === lines - 1 && lines > 1 ? lastLineWidth : '100%'}
          height={lineHeight}
          style={index < lines - 1 ? { marginBottom: spacing } : undefined}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  skeleton: {
    backgroundColor: '#e5e5e5',
  },
});
