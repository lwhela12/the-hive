import { Ionicons } from '@expo/vector-icons';
import { GestureResponderEvent, Pressable, StyleProp, ViewStyle } from 'react-native';

interface CloseButtonProps {
  onPress: (event: GestureResponderEvent) => void;
  accessibilityLabel?: string;
  color?: string;
  backgroundColor?: string;
  disabled?: boolean;
  size?: number;
  style?: StyleProp<ViewStyle>;
}

/** The one icon control for dismissing a view. Clear/remove/delete/undo stay distinct. */
export function CloseButton({
  onPress,
  accessibilityLabel = 'Close',
  color = '#8e7a5e',
  backgroundColor = 'transparent',
  disabled = false,
  size = 24,
  style,
}: CloseButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      hitSlop={8}
      style={({ pressed }) => [
        {
          width: 44,
          height: 44,
          borderRadius: 22,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor,
          opacity: disabled ? 0.45 : pressed ? 0.6 : 1,
        },
        style,
      ]}
    >
      <Ionicons name="close" size={size} color={color} />
    </Pressable>
  );
}
