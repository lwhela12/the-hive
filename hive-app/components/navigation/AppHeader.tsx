import { memo } from 'react';
import { View, Text } from 'react-native';

interface AppHeaderProps {
  title: string;
  onMenuPress?: () => void;
  rightElement?: React.ReactNode;
}

export const AppHeader = memo(function AppHeader({
  title,
  rightElement,
}: AppHeaderProps) {
  return (
    <View className="flex-row items-center justify-between px-4 py-3 bg-charcoal">
      <View className="w-10 h-10" />

      {/* Title */}
      <Text
        style={{ fontFamily: 'LibreBaskerville_700Bold' }}
        className="text-base text-white"
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
