import { memo, useEffect, useRef } from 'react';
import { View, Text, Pressable, StyleSheet, useWindowDimensions } from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  cancelAnimation,
  Easing,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../lib/hooks/useAuth';

interface NavigationDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  children?: React.ReactNode;
  mode?: 'conversations' | 'navigation';
  unreadDMCount?: number;
}

const DRAWER_WIDTH_PERCENT = 0.85;

export const NavigationDrawer = memo(function NavigationDrawer({
  isOpen,
  onClose,
  children,
  mode = 'navigation',
  unreadDMCount,
}: NavigationDrawerProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { profile, communityRole } = useAuth();

  // Navigation items for the app
  const isAdmin = communityRole === 'admin' || communityRole === 'treasurer' || profile?.role === 'admin' || profile?.role === 'treasurer';
  const navItems = [
    { icon: null, customIcon: 'clive', label: 'Clive', route: '/' },
    { icon: null, customIcon: 'home', label: 'Home', route: '/hive' },
    { icon: null, customIcon: 'boards', label: 'Boards', route: '/board' },
    { icon: null, customIcon: 'messages', label: 'Messages', route: '/messages', badge: unreadDMCount },
    { icon: null, customIcon: 'meetings', label: 'Meetings', route: '/meetings' },
    { icon: null, customIcon: 'profile', label: 'Profile', route: '/profile' },
    ...(isAdmin ? [{ icon: null, customIcon: 'admin', label: 'Admin', route: '/admin' }] : []),
  ];
  const { width: screenWidth } = useWindowDimensions();
  const drawerWidth = screenWidth * DRAWER_WIDTH_PERCENT;

  // Keep a ref for drawerWidth so the close animation uses the latest value
  // without restarting the effect when dimensions settle on PWA cold start
  const drawerWidthRef = useRef(drawerWidth);
  drawerWidthRef.current = drawerWidth;

  // Animation values — drawer starts off-screen, always mounted so opening is instant
  const translateX = useSharedValue(-drawerWidth);
  const backdropOpacity = useSharedValue(0);

  // Update animation when isOpen changes — only depends on isOpen
  useEffect(() => {
    cancelAnimation(translateX);
    cancelAnimation(backdropOpacity);
    if (isOpen) {
      translateX.value = withTiming(0, { duration: 280, easing: Easing.out(Easing.cubic) });
      backdropOpacity.value = withTiming(1, { duration: 200 });
    } else {
      translateX.value = withTiming(-drawerWidthRef.current, { duration: 220, easing: Easing.in(Easing.cubic) });
      backdropOpacity.value = withTiming(0, { duration: 200 });
    }
  }, [isOpen]);

  // Animated styles
  const drawerAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const backdropAnimatedStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));

  const handleNavigation = (route: string) => {
    onClose();
    router.push(route as any);
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
          const badge = item.badge ?? 0;

          return (
            <Pressable
              key={item.route}
              onPress={() => handleNavigation(item.route)}
              className={`flex-row items-center px-5 py-4 mx-3 mb-1 rounded-xl ${
                isActive ? 'bg-gold/10' : 'active:bg-gray-50'
              }`}
            >
              <View className="w-10 items-center justify-center">
                {item.customIcon === 'clive' ? (
                  <Ionicons name="sparkles-outline" size={24} color={isActive ? '#bd9348' : '#313130'} />
                ) : item.customIcon === 'home' ? (
                  <Ionicons name="home-outline" size={24} color={isActive ? '#bd9348' : '#313130'} />
                ) : item.customIcon === 'boards' ? (
                  <Ionicons name="grid-outline" size={24} color={isActive ? '#bd9348' : '#313130'} />
                ) : item.customIcon === 'messages' ? (
                  <Ionicons name="chatbubble-ellipses-outline" size={24} color={isActive ? '#bd9348' : '#313130'} />
                ) : item.customIcon === 'meetings' ? (
                  <Ionicons name="calendar-outline" size={24} color={isActive ? '#bd9348' : '#313130'} />
                ) : item.customIcon === 'admin' ? (
                  <Ionicons name="settings-outline" size={24} color={isActive ? '#bd9348' : '#313130'} />
                ) : item.customIcon === 'profile' ? (
                  <Ionicons name="person-circle-outline" size={24} color={isActive ? '#bd9348' : '#313130'} />
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
              {badge > 0 ? (
                <View className="ml-auto bg-gold rounded-full min-w-[20px] h-5 px-1.5 items-center justify-center">
                  <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-white text-xs">
                    {badge > 99 ? '99+' : badge}
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

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={isOpen ? 'auto' : 'none'} className="z-50">
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
