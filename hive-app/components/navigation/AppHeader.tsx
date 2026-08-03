import { memo } from 'react';
import { Pressable, View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../lib/hooks/useAuth';
import { useAppDrawer } from '../../lib/hooks/useAppDrawer';
import { hiveAccent, hiveDisplayName } from '../../lib/hiveBrand';

interface AppHeaderProps {
  title: string;
  /** Back arrow in the left slot (for pushed pages like Honey Pot). */
  onBackPress?: () => void;
  /** Small mark rendered just before the title (e.g. Clive's crest). */
  titleIcon?: React.ReactNode;
  /** Muted one-liner under the title (e.g. Members' count + search hint). */
  subtitle?: string;
  onMenuPress?: () => void;
  rightElement?: React.ReactNode;
}

// The one page-title treatment for the whole app: gold bar, spaced serif.
// Every tab screen should use this instead of hand-rolling a gold header.
//
// The bar takes its colour from the HIVE you're in, and its name rides above
// every page title so you always know where you are. Home is the exception: it
// puts the name in the title itself, big — so the name is said once there
// rather than twice in two sizes.
export const AppHeader = memo(function AppHeader({
  title,
  onBackPress,
  titleIcon,
  subtitle,
  onMenuPress,
  rightElement,
}: AppHeaderProps) {
  const { community } = useAuth();
  const drawer = useAppDrawer();
  const accent = hiveAccent(community);
  // Back arrow wins, then a screen's own menu handler (Clive's conversations
  // drawer), then the app menu — so every screen has a way into it.
  const menuPress = onMenuPress ?? drawer.open;
  const hiveName = hiveDisplayName(community?.name);
  // Any page whose title is already the HIVE's name says it big and skips the
  // small line — that's Home, and anywhere else that chooses to do the same.
  const showHiveName = title.trim().toUpperCase() !== hiveName.toUpperCase();

  return (
    <View
      className="flex-row items-center justify-between px-4 py-3"
      style={{ backgroundColor: accent }}
    >
      {onBackPress ? (
        <Pressable
          onPress={onBackPress}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          className="w-10 h-10 items-center justify-center rounded-full active:opacity-70"
          hitSlop={8}
        >
          <Ionicons name="chevron-back" size={24} color="white" />
        </Pressable>
      ) : (
        <Pressable
          onPress={menuPress}
          className="w-10 h-10 items-center justify-center rounded-full active:opacity-70"
          hitSlop={8}
        >
          <Ionicons name="menu" size={26} color="white" />
        </Pressable>
      )}

      {/* Title */}
      <View className="items-center">
        {showHiveName ? (
          <Text
            style={{
              fontFamily: 'Lato_700Bold',
              fontSize: 9,
              letterSpacing: 1.8,
              color: 'rgba(255,255,255,0.72)',
              marginBottom: 1,
            }}
          >
            {hiveName.toUpperCase()}
          </Text>
        ) : null}
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
