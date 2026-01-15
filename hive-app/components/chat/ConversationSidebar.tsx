import { useMemo, memo, useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView, Image, useWindowDimensions, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import { ConversationItem } from './ConversationItem';
import { HexagonIcon } from '../ui/HexagonIcon';
import { useAuth } from '../../lib/hooks/useAuth';
import { useTotalUnreadDMs } from '../../lib/hooks/useTotalUnreadDMs';
import type { Conversation } from '../../types';

const beeIcon = require('../../assets/BEE ONLY IN GOLD BG.png');
const cliveIcon = require('../../assets/Clive_logo.png');

interface ConversationSidebarProps {
  conversations: Conversation[];
  currentConversationId: string | null;
  onSelectConversation: (id: string) => void;
  onNewConversation: () => void;
  onDelete?: (id: string) => void;
  isOpen?: boolean;
  onClose?: () => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

const DRAWER_WIDTH_PERCENT = 0.85;
const SPRING_CONFIG = {
  damping: 20,
  stiffness: 200,
  mass: 0.5,
};

// Group conversations by date
function groupByDate(conversations: Conversation[]) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const lastWeek = new Date(today);
  lastWeek.setDate(lastWeek.getDate() - 7);

  const groups: { [key: string]: Conversation[] } = {
    Today: [],
    Yesterday: [],
    'This Week': [],
    Earlier: [],
  };

  conversations.forEach((conv) => {
    const convDate = new Date(conv.updated_at);
    convDate.setHours(0, 0, 0, 0);

    if (convDate.getTime() === today.getTime()) {
      groups['Today'].push(conv);
    } else if (convDate.getTime() === yesterday.getTime()) {
      groups['Yesterday'].push(conv);
    } else if (convDate > lastWeek) {
      groups['This Week'].push(conv);
    } else {
      groups['Earlier'].push(conv);
    }
  });

  // Remove empty groups
  return Object.entries(groups).filter(([, convs]) => convs.length > 0);
}

export const ConversationSidebar = memo(function ConversationSidebar({
  conversations,
  currentConversationId,
  onSelectConversation,
  onNewConversation,
  onDelete,
  isOpen = true,
  onClose,
  isCollapsed = false,
  onToggleCollapse,
}: ConversationSidebarProps) {
  const router = useRouter();
  const { profile, communityId, communityRole } = useAuth();
  const { totalUnread: totalUnreadDMs } = useTotalUnreadDMs(communityId ?? undefined, profile?.id);
  const { width: screenWidth } = useWindowDimensions();
  const drawerWidth = screenWidth * DRAWER_WIDTH_PERCENT;

  const groupedConversations = useMemo(
    () => groupByDate(conversations),
    [conversations]
  );

  // Use mobile layout for narrow screens (< 768px)
  const isMobile = screenWidth < 768;

  // Track visibility separately from isOpen to allow close animation
  const [isVisible, setIsVisible] = useState(isOpen);

  // Animation values
  const translateX = useSharedValue(-drawerWidth);
  const backdropOpacity = useSharedValue(0);

  // Update animation when isOpen changes
  useEffect(() => {
    if (isMobile) {
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
    }
  }, [isOpen, isMobile, drawerWidth]);

  // Animated styles
  const drawerAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const backdropAnimatedStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));

  // Navigation items for mobile sidebar
  const isAdmin = communityRole === 'admin' || communityRole === 'treasurer';
  const navItems = [
    { icon: null, imageSource: beeIcon, label: 'HIVE', route: '/hive' as const },
    { icon: '📋', label: 'Board', route: '/board' as const },
    { icon: '💬', label: 'Chat', route: '/messages' as const, badge: totalUnreadDMs },
    { icon: null, customIcon: 'honeycomb', label: 'Meetings', route: '/meetings' as const },
    { icon: '👤', imageSource: profile?.avatar_url ? { uri: profile.avatar_url } : undefined, label: 'Profile', route: '/profile' as const, isCircular: true },
    ...(isAdmin ? [{ icon: '⚙️', label: 'Admin', route: '/admin' as const }] : []),
  ];

  // Close with animation, then perform action
  const closeAndNavigate = (route: string) => {
    onClose?.();
    setTimeout(() => {
      router.push(route as any);
    }, 250);
  };

  const closeAndSelectConversation = (id: string) => {
    onClose?.();
    setTimeout(() => {
      onSelectConversation(id);
    }, 250);
  };

  const closeAndNewConversation = () => {
    onClose?.();
    setTimeout(() => {
      onNewConversation();
    }, 250);
  };

  const sidebarContent = (
    <View className="flex-1 bg-white">
      {/* Header */}
      <View className="flex-row items-center justify-between px-5 py-4 border-b border-gray-100">
        <View className="flex-row items-center">
          <Image source={cliveIcon} style={{ width: 28, height: 28, borderRadius: 6, marginRight: 10 }} />
          <Text
            style={{ fontFamily: 'LibreBaskerville_700Bold' }}
            className="text-xl text-charcoal"
          >
            Clive
          </Text>
        </View>
        <View className="flex-row items-center">
          {!isMobile && onToggleCollapse && (
            <Pressable onPress={onToggleCollapse} className="p-2">
              <Text className="text-xl text-gray-400">«</Text>
            </Pressable>
          )}
          {isMobile && onClose && (
            <Pressable
              onPress={onClose}
              className="w-8 h-8 items-center justify-center rounded-full active:bg-gray-100"
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Text className="text-2xl text-charcoal leading-none">×</Text>
            </Pressable>
          )}
        </View>
      </View>

      {/* New Chat Button */}
      <Pressable
        onPress={isMobile ? closeAndNewConversation : onNewConversation}
        className="mx-4 mt-4 mb-2 bg-gold py-3 px-4 rounded-xl flex-row items-center justify-center active:opacity-80"
      >
        <Text className="text-white text-lg mr-2">+</Text>
        <Text
          style={{ fontFamily: 'Lato_700Bold' }}
          className="text-white text-base"
        >
          New Chat
        </Text>
      </Pressable>

      {/* Conversations List */}
      <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
        {groupedConversations.length === 0 ? (
          <View className="px-4 py-8">
            <Text
              style={{ fontFamily: 'Lato_400Regular' }}
              className="text-gray-400 text-center"
            >
              No conversations yet
            </Text>
          </View>
        ) : (
          groupedConversations.map(([group, convs]) => (
            <View key={group}>
              <Text
                style={{ fontFamily: 'Lato_700Bold' }}
                className="px-4 py-2 text-xs text-gray-400 uppercase tracking-wide bg-gray-50"
              >
                {group}
              </Text>
              {convs.map((conversation) => (
                <ConversationItem
                  key={conversation.id}
                  conversation={conversation}
                  isActive={conversation.id === currentConversationId}
                  onSelect={isMobile ? closeAndSelectConversation : onSelectConversation}
                  onDelete={onDelete}
                />
              ))}
            </View>
          ))
        )}
      </ScrollView>

      {/* Mobile Navigation */}
      {isMobile && (
        <View className="border-t border-gray-100 pt-3 pb-4 px-4">
          <Text
            style={{ fontFamily: 'Lato_700Bold' }}
            className="text-xs text-gray-400 uppercase tracking-wide mb-3"
          >
            Navigate
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {navItems.map((item) => (
              <Pressable
                key={item.route}
                onPress={() => closeAndNavigate(item.route)}
                className="flex-row items-center bg-gray-50 px-3 py-2.5 rounded-xl active:bg-gray-100"
              >
                {item.customIcon === 'honeycomb' ? (
                  <View style={{ marginRight: 8 }}>
                    <HexagonIcon size={20} />
                  </View>
                ) : item.imageSource ? (
                  <Image
                    source={item.imageSource}
                    style={{ width: 20, height: 20, borderRadius: item.isCircular ? 10 : 4, marginRight: 8 }}
                  />
                ) : (
                  <Text className="mr-2">{item.icon}</Text>
                )}
                <Text
                  style={{ fontFamily: 'Lato_400Regular' }}
                  className="text-charcoal text-sm"
                >
                  {item.label}
                </Text>
                {item.badge > 0 ? (
                  <View className="ml-1.5 bg-gold rounded-full min-w-[18px] h-[18px] px-1 items-center justify-center">
                    <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-white text-[10px]">
                      {item.badge > 99 ? '99+' : item.badge}
                    </Text>
                  </View>
                ) : null}
              </Pressable>
            ))}
          </View>
        </View>
      )}
    </View>
  );

  // On mobile, render as animated overlay
  if (isMobile) {
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

        {/* Animated Drawer */}
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
          {sidebarContent}
        </Animated.View>
      </View>
    );
  }

  // On web/desktop, render as fixed sidebar (collapsible)
  if (isCollapsed) {
    return (
      <View className="w-12 border-r border-gray-200 h-full bg-white items-center pt-3">
        <Pressable
          onPress={onToggleCollapse}
          className="p-2 rounded hover:bg-gray-100"
        >
          <Text className="text-xl text-gray-400">»</Text>
        </Pressable>
        <Pressable
          onPress={onNewConversation}
          className="mt-2 p-2 bg-gold rounded-lg"
        >
          <Text className="text-white text-lg">+</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View className="w-72 border-r border-gray-200 h-full">
      {sidebarContent}
    </View>
  );
});
