import { View, Text } from 'react-native';
import { Image } from 'expo-image';

interface AvatarProps {
  name: string;
  url?: string | null;
  size?: number;
}

export function Avatar({ name, url, size = 40 }: AvatarProps) {
  const initials = name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  if (url) {
    return (
      <Image
        source={{ uri: url }}
        style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: '#e5e7eb' }}
        contentFit="cover"
        cachePolicy="memory-disk"
      />
    );
  }

  return (
    <View
      style={{ width: size, height: size, borderRadius: size / 2 }}
      className="bg-honey-100 items-center justify-center"
    >
      <Text
        style={{ fontSize: size * 0.4 }}
        className="text-honey-700 font-semibold"
      >
        {initials}
      </Text>
    </View>
  );
}
