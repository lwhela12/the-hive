import { memo, useEffect, useState } from 'react';
import { View, Text, Pressable, Image, StyleSheet, useWindowDimensions } from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import { HexagonIcon } from '../ui/HexagonIcon';
import { useAuth } from '../../lib/hooks/useAuth';
import { useTotalUnreadDMs } from '../../lib/hooks/useTotalUnreadDMs';

const beeIcon = require('../../assets/BEE ONLY IN GOLD BG.png');
const cliveIcon = require('../../assets/Clive_logo.png');

interface NavigationDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  children?: React.ReactNode;
  mode?: 'conversations' | 'navigation';
}

const DRAWER_WIDTH_PERCENT = 0.85;
const SPRING_CONFIG = {
  damping: 20,
  stiffness: 200,
  mass: 0.5,
};

export const NavigationDrawer = memo(function NavigationDrawer({
  isOpen,
  onClose,
  children,
  mode = 'navigation',
}: NavigationDrawerProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { profile, communityId, communityRole } = useAuth();
  const { totalUnread: totalUnreadDMs } = useTotalUnreadDMs(communityId ?? undefined, profile?.id);

  // Navigation items for the app
  const isAdmin = communityRole === 'admin' || communityRole === 'treasurer';
  const navItems = [
    { icon: null, imageSource: cliveIcon, label: 'Clive', route: '/' },
    { icon: null, imageSource: beeIcon, label: 'HIVE', route: '/hive' },
    { icon: '📋', label: 'Board', route: '/board' },
    { icon: '💬', label: 'Chat', route: '/messages', badge: totalUnreadDMs },
    { icon: null, customIcon: 'honeycomb', label: 'Meetings', route: '/meetings' },
    { icon: '👤', imageSource: profile?.avatar_url ? { uri: profile.avatar_url } : undefined, label: 'Profile', route: '/profile', isCircular: true },
    ...(isAdmin ? [{ icon: '⚙️', label: 'Admin', route: '/admin' }] : []),
  ];
  const { width: screenWidth } = useWindowDimensions();
  const drawerWidth = screenWidth * DRAWER_WIDTH_PERCENT;

  // Track visibility separately from isOpen to allow close animation
  const [isVisible, setIsVisible] = useState(isOpen);

  // Animation values
  const translateX = useSharedValue(-drawerWidth);
  const backdropOpacity = useSharedValue(0);

  // Update animation when isOpen changes
  useEffect(() => {
    if (isOpen) {
      setIsVisible(true);
      translateX.value = withSpring(0, SPRING_CONFIG);
      backdropOpacity.value = withTiming(1, { duration: 200 });
    } else {
      translateX.value = withSpring(-drawerWidth, SPRING_CONFIG);
      backdropOpacity.value = withTiming(0, { duration: 200 }, () => {
        runOnJS(setIsVisible)(false);
      });
    }
  }, [isOpen, drawerWidth]);

  // Animated styles
  const drawerAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const backdropAnimatedStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
    pointerEvents: backdropOpacity.value > 0 ? 'auto' : 'none',
  }));

  const handleNavigation = (route: string) => {
    onClose();
    setTimeout(() => {
      router.push(route as any);
    }, 250);
  };

  // Navigation menu content
  const navigationContent = (
    <View className="flex-1 bg-white">
      {/* Header */}
      <View className="flex-row items-center justify-between px-5 py-4 border-b border-gray-100">
        <Text
          style={{ fontFamily: 'LibreBaskerville_700Bold' }}
          className="text-xl text-charcoal"
        >
          HIVE
        </Text>
        <Pressable
          onPress={onClose}
          className="w-8 h-8 items-center justify-center rounded-full active:bg-gray-100"
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text className="text-2xl text-charcoal leading-none">×</Text>
        </Pressable>
      </View>

      {/* Navigation Items */}
      <View className="flex-1 pt-4">
        {navItems.map((item) => {
          const isActive = pathname === item.route ||
            (item.route === '/' && pathname === '/index');

          return (
            <Pressable
              key={item.route}
              onPress={() => handleNavigation(item.route)}
              className={`flex-row items-center px-5 py-4 mx-3 mb-1 rounded-xl ${
                isActive ? 'bg-gold/10' : 'active:bg-gray-50'
              }`}
            >
              <View className="w-10 items-center justify-center">
                {item.customIcon === 'honeycomb' ? (
                  <HexagonIcon size={24} />
                ) : item.imageSource ? (
                  <Image
                    source={item.imageSource}
                    style={{ width: 40, height: 40, borderRadius: item.isCircular ? 20 : 8 }}
                  />
                ) : (
                  <Text className="text-2xl">{item.icon}</Text>
                )}
              </View>
              <Text
                style={{ fontFamily: isActive ? 'Lato_700Bold' : 'Lato_400Regular' }}
                className={`ml-4 text-lg ${isActive ? 'text-gold' : 'text-charcoal'}`}
              >
                {item.label}
              </Text>
              {item.badge > 0 ? (
                <View className="ml-auto bg-gold rounded-full min-w-[20px] h-5 px-1.5 items-center justify-center">
                  <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-white text-xs">
                    {item.badge > 99 ? '99+' : item.badge}
                  </Text>
                </View>
              ) : isActive ? (
                <View className="ml-auto w-2 h-2 rounded-full bg-gold" />
              ) : null}
            </Pressable>
          );
        })}
      </View>

      {/* Footer */}
      <View className="px-5 py-4 border-t border-gray-100">
        <Text
          style={{ fontFamily: 'Lato_400Regular' }}
          className="text-sm text-gray-400 text-center"
        >
          HIVE Community
        </Text>
      </View>
    </View>
  );

  if (!isVisible) {
    return null;
  }

  return (
    <View style={StyleSheet.absoluteFill} className="z-50">
      {/* Animated Backdrop */}
      <Animated.View style={[StyleSheet.absoluteFill, backdropAnimatedStyle]}>
        <Pressable
          onPress={onClose}
          style={StyleSheet.absoluteFill}
          className="bg-black/40"
        />
      </Animated.View>

      {/* Drawer */}
      <Animated.View
        style={[
          {
            position: 'absolute',
            top: 0,
            left: 0,
            bottom: 0,
            width: drawerWidth,
            maxWidth: 400,
          },
          drawerAnimatedStyle,
        ]}
        className="bg-white shadow-2xl"
      >
        {mode === 'navigation' ? navigationContent : children}
      </Animated.View>
    </View>
  );
});
