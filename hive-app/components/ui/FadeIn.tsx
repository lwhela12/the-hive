import { View, ViewStyle, type LayoutChangeEvent } from 'react-native';

interface FadeInProps {
  children: React.ReactNode;
  duration?: number;
  delay?: number;
  style?: ViewStyle;
  /**
   * Forwarded to the wrapper View. Measuring a child instead reports a
   * position relative to THIS wrapper — usually 0 — which is a silent way to
   * get a scroll-to-section that always jumps to the top.
   */
  onLayout?: (event: LayoutChangeEvent) => void;
}

/**
 * Historically wrapped children in a fade-in-on-mount animation.
 * House rule (Nat, 2026-07-25): no soft arrivals anywhere — content that
 * starts invisible reads as "something didn't load." Renders instantly now;
 * the wrapper and its props stay so call sites don't churn.
 */
export function FadeIn({ children, style, onLayout }: FadeInProps) {
  return <View style={style} onLayout={onLayout}>{children}</View>;
}
