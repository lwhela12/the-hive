import { memo } from 'react';
import { Pressable, View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface AppHeaderProps {
  title: string;
  /** Small mark rendered just before the title (e.g. Clive's crest). */
  titleIcon?: React.ReactNode;
  /** Muted one-liner under the title (e.g. Members' count + search hint). */
  subtitle?: string;
  onMenuPress?: () => void;
  rightElement?: React.ReactNode;
}

// The one page-title treatment for the whole app: gold bar, spaced serif.
// Every tab screen should use this instead of hand-rolling a gold header.
export const AppHeader = memo(function AppHeader({
  title,
  titleIcon,
  subtitle,
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
      <View className="items-center">
        <View className="flex-row items-center">
          {titleIcon}
          <Text
            style={{ fontFamily: 'LibreBaskerville_700Bold', fontSize: 19, letterSpacing: 1.2 }}
            className="text-white"
          >
            {title}
          </Text>
        </View>
        {subtitle ? (
          <Text
            style={{ fontFamily: 'Lato_400Regular', fontSize: 12, color: 'rgba(255,255,255,0.78)', marginTop: 2 }}
          >
            {subtitle}
          </Text>
        ) : null}
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
