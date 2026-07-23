import { memo } from 'react';
import { Pressable, View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface AppHeaderProps {
  title: string;
  /** Small mark rendered just before the title (e.g. Clive's crest). */
  titleIcon?: React.ReactNode;
  onMenuPress?: () => void;
  rightElement?: React.ReactNode;
}

export const AppHeader = memo(function AppHeader({
  title,
  titleIcon,
  onMenuPress,
  rightElement,
}: AppHeaderProps) {
  return (
    <View className="flex-row items-center justify-between px-4 py-3 bg-gold">
      {onMenuPress ? (
        <Pressable
          onPress={onMenuPress}
          className="w-10 h-10 items-center justify-center rounded-full active:opacity-70"
          hitSlop={8}
        >
          <Ionicons name="menu" size={26} color="white" />
        </Pressable>
      ) : (
        <View className="w-10 h-10" />
      )}

      {/* Title */}
      <View className="flex-row items-center">
        {titleIcon}
        <Text
          style={{ fontFamily: 'LibreBaskerville_700Bold' }}
          className="text-base text-white"
        >
          {title}
        </Text>
      </View>

      {/* Right Element (or placeholder for alignment) */}
      {rightElement ? (
        rightElement
      ) : (
        <View className="w-10 h-10" />
      )}
    </View>
  );
});
