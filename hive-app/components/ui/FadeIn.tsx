import { View, ViewStyle } from 'react-native';

interface FadeInProps {
  children: React.ReactNode;
  duration?: number;
  delay?: number;
  style?: ViewStyle;
}

/**
 * Historically wrapped children in a fade-in-on-mount animation.
 * House rule (Nat, 2026-07-25): no soft arrivals anywhere — content that
 * starts invisible reads as "something didn't load." Renders instantly now;
 * the wrapper and its props stay so call sites don't churn.
 */
export function FadeIn({ children, style }: FadeInProps) {
  return <View style={style}>{children}</View>;
}
