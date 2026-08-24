import { Ionicons } from '@expo/vector-icons';
import { GestureResponderEvent, Pressable, StyleProp, Text, ViewStyle } from 'react-native';

interface BackButtonProps {
  onPress: (event: GestureResponderEvent) => void;
  accessibilityLabel?: string;
  color?: string;
  backgroundColor?: string;
  disabled?: boolean;
  size?: number;
  label?: string;
  style?: StyleProp<ViewStyle>;
}

/** The one route/detail navigation control. Step, slide, month, and image pagination stay local. */
export function BackButton({
  onPress,
  accessibilityLabel = 'Go back',
  color = '#8a6b30',
  backgroundColor = 'transparent',
  disabled = false,
  size = 24,
  label,
  style,
}: BackButtonProps) {
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
          width: label ? undefined : 44,
          minWidth: 44,
          height: 44,
          borderRadius: 22,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor,
          flexDirection: 'row',
          paddingHorizontal: label ? 10 : 0,
          opacity: disabled ? 0.45 : pressed ? 0.6 : 1,
        },
        style,
      ]}
    >
      <Ionicons name="chevron-back" size={size} color={color} />
      {label ? (
        <Text style={{ marginLeft: 2, fontFamily: 'Lato_700Bold', fontSize: 12, color }}>{label}</Text>
      ) : null}
    </Pressable>
  );
}
