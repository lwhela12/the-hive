import { memo } from 'react';
import { View, Text, Pressable } from 'react-native';

interface AppHeaderProps {
  title: string;
  onMenuPress: () => void;
  rightElement?: React.ReactNode;
}

export const AppHeader = memo(function AppHeader({
  title,
  onMenuPress,
  rightElement,
}: AppHeaderProps) {
  return (
    <View className="flex-row items-center justify-between px-4 py-3 bg-white">
      {/* Hamburger Menu Button */}
      <Pressable
        onPress={onMenuPress}
        className="p-2 -ml-2 rounded-lg active:bg-gray-100"
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <View className="w-6 h-5 justify-between">
          <View className="h-0.5 w-6 bg-charcoal rounded-full" />
          <View className="h-0.5 w-5 bg-charcoal rounded-full" />
          <View className="h-0.5 w-6 bg-charcoal rounded-full" />
        </View>
      </Pressable>

      {/* Title */}
      <Text
        style={{ fontFamily: 'LibreBaskerville_700Bold' }}
        className="text-base text-charcoal"
      >
        {title}
      </Text>

      {/* Right Element (or placeholder for alignment) */}
      {rightElement ? (
        rightElement
      ) : (
        <View className="w-10 h-10" />
      )}
    </View>
  );
});
