import { Pressable, StyleProp, ViewStyle, GestureResponderEvent } from 'react-native';
import Svg, { Path, Circle } from 'react-native-svg';

// The one Edit affordance for the whole app: HIVE's own pencil — drawn in the
// footer icons' outline language (rounded caps, chunky stroke) with a honey
// drop at the tip. No circle chrome; the color adapts to its surface
// (default dark honey for warm/light backgrounds, pass cream/white on gold).
export function EditButton({
  onPress,
  size = 32,
  color = '#8e6f35',
  accessibilityLabel = 'Edit',
  style,
}: {
  onPress: (event: GestureResponderEvent) => void;
  /** Touch-target size; the icon draws at ~2/3 of it. */
  size?: number;
  color?: string;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const icon = Math.round(size * 0.68);
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [
        {
          width: size,
          height: size,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: pressed ? 0.5 : 1,
        },
        style,
      ]}
    >
      <Svg width={icon} height={icon} viewBox="0 0 24 24" fill="none">
        {/* Pencil body */}
        <Path
          d="M6.1 15.3 L15.6 5.8 C16.5 4.9 18 4.9 18.9 5.8 C19.8 6.7 19.8 8.2 18.9 9.1 L9.4 18.6 L4.9 19.8 L6.1 15.3 Z"
          stroke={color}
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {/* Ferrule line between body and eraser */}
        <Path d="M13.9 7.5 L17.2 10.8" stroke={color} strokeWidth={2} strokeLinecap="round" />
        {/* The honey drop at the tip — the HIVE pencil writes in honey */}
        <Circle cx="4.6" cy="20.1" r="1.5" fill={color} />
      </Svg>
    </Pressable>
  );
}
