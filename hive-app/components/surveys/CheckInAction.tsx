import { Pressable, Text } from 'react-native';
import { usePageSkin } from '../../lib/pageSkin';

/** Compact actions shared by the two check-in overview screens. */
export function CheckInAction({ title, onPress, variant = 'primary', disabled = false, role = 'button' }: {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
  role?: 'button' | 'link';
}) {
  const skin = usePageSkin();
  const primary = variant === 'primary';
  return (
    <Pressable accessibilityRole={role} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
      style={({ pressed }) => ({
        alignSelf: 'flex-start', maxWidth: '100%', minHeight: 44,
        paddingHorizontal: 22, paddingVertical: 12, borderRadius: 999,
        borderWidth: 1, borderColor: primary && !disabled ? skin.gold : skin.borderStrong,
        backgroundColor: disabled ? skin.card : primary ? skin.gold : pressed ? skin.cardPressed : skin.card,
        justifyContent: 'center', alignItems: 'center', opacity: pressed ? 0.8 : 1,
      })}>
      <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 14, lineHeight: 20, textAlign: 'center',
        color: disabled ? skin.inkSoft : primary ? '#313130' : skin.ink }}>
        {title}
      </Text>
    </Pressable>
  );
}
