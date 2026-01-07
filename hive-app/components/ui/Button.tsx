import { Pressable, Text, ActivityIndicator } from 'react-native';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost';
  disabled?: boolean;
  loading?: boolean;
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
}: ButtonProps) {
  const baseClasses = 'py-3 px-6 rounded-xl items-center justify-center flex-row';

  const variantClasses = {
    primary: 'bg-gold active:opacity-80',
    secondary: 'bg-cream active:bg-gold-light/30',
    ghost: 'bg-transparent active:bg-cream',
  };

  const textClasses = {
    primary: 'text-white',
    secondary: 'text-charcoal',
    ghost: 'text-gold',
  };

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      className={`${baseClasses} ${variantClasses[variant]} ${
        disabled || loading ? 'opacity-50' : ''
      }`}
    >
      {loading && <ActivityIndicator size="small" color={variant === 'primary' ? '#fff' : '#bd9348'} className="mr-2" />}
      <Text style={{ fontFamily: 'Lato_700Bold' }} className={textClasses[variant]}>{title}</Text>
    </Pressable>
  );
}
