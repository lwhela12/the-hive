import { Pressable, StyleProp, ViewStyle, GestureResponderEvent } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

// The one Edit affordance for the whole app (Lucas's rule: same look and
// feel on every screen): a quiet round pencil — paper circle, hairline gold
// ring, dark pencil. Size scales for deck/projected surfaces.
export function EditButton({
  onPress,
  size = 32,
  accessibilityLabel = 'Edit',
  style,
}: {
  onPress: (event: GestureResponderEvent) => void;
  size?: number;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}) {
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
          borderRadius: size / 2,
          borderWidth: 1,
          borderColor: 'rgba(222,193,129,0.45)',
          backgroundColor: pressed ? '#f6f4e5' : '#fffdf5',
          alignItems: 'center',
          justifyContent: 'center',
        },
        style,
      ]}
    >
      <Ionicons name="pencil-outline" size={Math.round(size * 0.5)} color="#4A4A4A" />
    </Pressable>
  );
}
