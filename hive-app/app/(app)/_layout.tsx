import { useEffect, useMemo, useRef, useState } from 'react';
import { Tabs, usePathname, useRouter } from 'expo-router';
import { Text, View, ImageSourcePropType, Platform, useWindowDimensions, ActivityIndicator, Pressable, TextInput, Animated, Easing, PanResponder } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../../lib/hooks/useAuth';
import { useNotifications } from '../../lib/hooks/useNotifications';
import { useTotalUnreadDMs } from '../../lib/hooks/useTotalUnreadDMs';
import { HexagonIcon } from '../../components/ui/HexagonIcon';
import { getLastAppTabName, saveLastAppPath } from '../../lib/navigationState';
import { VoiceMicButton } from '../../components/ui/VoiceMicButton';
import { pickMultipleImages, SelectedImage } from '../../lib/imagePicker';
import { setPendingAttachments } from '../../lib/pendingAttachments';

const beeIcon = require('../../assets/bee-gold-bg.png');
const cliveIcon = require('../../assets/Clive_logo.png');
const CLIVE_BUBBLE_POSITION_KEY = 'clive-floating-bubble-position-v2';


function TabIcon({
  icon,
  imageSource,
  customIcon,
  label,
  focused,
  isCircular,
  badge = 0,
  compact,
}: {
  icon?: string;
  imageSource?: ImageSourcePropType;
  customIcon?: React.ReactNode;
  label: string;
  focused: boolean;
  isCircular?: boolean;
  badge?: number;
  compact?: boolean;
}) {
  const displayLabel = compact
    ? label.replace('HIVE Home', 'HIVE\nHome').replace('Message Board', 'Message\nBoard').replace('Meeting Hub', 'Meeting\nHub')
    : label;
  const iconSize = compact ? 22 : 28;
  const iconRadius = isCircular ? iconSize / 2 : 6;
  const tooltipProps = Platform.OS === 'web'
    ? ({ title: label } as any)
    : {};

  return (
    <View
      {...tooltipProps}
      accessibilityLabel={label}
      className={`items-center justify-center ${compact ? 'pt-1' : 'pt-2'}`}
    >
      <View>
        {customIcon ? (
          customIcon
        ) : imageSource ? (
          <Image
            source={imageSource}
            style={{ width: iconSize, height: iconSize, borderRadius: iconRadius }}
            contentFit="cover"
            cachePolicy="memory-disk"
          />
        ) : (
          <Text className={compact ? 'text-xl' : 'text-2xl'}>{icon}</Text>
        )}
        {badge > 0 ? (
          <View
            className="absolute -top-1 -right-2 bg-gold rounded-full min-w-[16px] h-4 px-1 items-center justify-center"
          >
            <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-white text-[10px]">
              {badge > 99 ? '99+' : badge}
            </Text>
          </View>
        ) : null}
      </View>
      <Text
        numberOfLines={2}
        style={{
          fontFamily: focused ? 'Lato_700Bold' : 'Lato_400Regular',
          fontSize: compact ? 9 : 12,
          lineHeight: compact ? 10 : 14,
          textAlign: 'center',
        }}
        className={`${compact ? 'mt-0.5' : 'mt-1'} ${
          focused ? 'text-gold' : 'text-charcoal/50'
        }`}
      >
        {displayLabel}
      </Text>
    </View>
  );
}

export default function AppLayout() {
  const { session, communityId, communityRole, profile, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const isAdmin = communityRole === 'admin' || profile?.role === 'admin';
  const showAdminTab = isAdmin || communityRole === 'treasurer' || profile?.role === 'treasurer';
  const { width, height } = useWindowDimensions();
  // Use mobile layout for narrow screens (< 768px) regardless of platform
  const useMobileLayout = width < 768;
  const tabBarHeight = useMobileLayout
    ? Platform.OS === 'ios' ? 92 : 86
    : 70;
  const { totalUnread: totalUnreadDMs } = useTotalUnreadDMs(communityId ?? undefined, profile?.id);
  const [cliveDraft, setCliveDraft] = useState('');
  const [bubbleImages, setBubbleImages] = useState<SelectedImage[]>([]);
  const [cliveExpanded, setCliveExpanded] = useState(true);
  const fullBubbleWidth = Math.max(48, Math.min(width - 24, 330));
  const bubbleWidth = cliveExpanded ? fullBubbleWidth : 48;
  const bubbleHeight = cliveExpanded ? 50 : 48;
  const defaultBubblePosition = {
    left: useMobileLayout ? 12 : 20,
    bottom: tabBarHeight + 14,
  };
  const [bubblePosition, setBubblePosition] = useState(defaultBubblePosition);
  const bubblePositionRef = useRef(bubblePosition);

  // Floating bar entrance/exit animation
  const barAnim = useRef(new Animated.Value(0)).current;
  const expandAnim = useRef(new Animated.Value(1)).current;
  const dragAnim = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const [barMounted, setBarMounted] = useState(false);
  // Hide the floating Clive bar on chat surfaces where another composer owns the footer.
  const hideFloatingCliveBar = pathname === '/' || pathname === '/index' || pathname === '/messages';
  const expandedContentOpacity = expandAnim.interpolate({
    inputRange: [0, 0.38, 1],
    outputRange: [0, 0, 1],
  });
  const animatedBubbleWidth = expandAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [48, fullBubbleWidth],
  });
  const animatedBubbleHeight = expandAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [48, 50],
  });

  const clampBubblePosition = (
    position: { left: number; bottom: number },
    nextWidth = bubbleWidth,
    nextHeight = bubbleHeight
  ) => {
    const gutter = 8;
    const minLeft = gutter;
    const maxLeft = Math.max(gutter, width - nextWidth - gutter);
    const minBottom = tabBarHeight + 10;
    const maxBottom = Math.max(minBottom, height - nextHeight - gutter);

    return {
      left: Math.min(Math.max(position.left, minLeft), maxLeft),
      bottom: Math.min(Math.max(position.bottom, minBottom), maxBottom),
    };
  };

  useEffect(() => {
    setBubblePosition((currentPosition) => {
      const nextPosition = clampBubblePosition(currentPosition);
      bubblePositionRef.current = nextPosition;
      return nextPosition;
    });
  }, [width, height, tabBarHeight, bubbleWidth, bubbleHeight]);

  useEffect(() => {
    let cancelled = false;

    AsyncStorage.getItem(CLIVE_BUBBLE_POSITION_KEY)
      .then((storedPosition) => {
        if (!storedPosition || cancelled) return;
        const parsedPosition = JSON.parse(storedPosition) as Partial<{ left: number; bottom: number }>;
        if (typeof parsedPosition.left !== 'number' || typeof parsedPosition.bottom !== 'number') return;

        const nextPosition = clampBubblePosition({
          left: parsedPosition.left,
          bottom: parsedPosition.bottom,
        });
        bubblePositionRef.current = nextPosition;
        setBubblePosition(nextPosition);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, []);

  const panResponder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, gestureState) =>
      Math.abs(gestureState.dx) > 5 || Math.abs(gestureState.dy) > 5,
    onMoveShouldSetPanResponderCapture: (_, gestureState) =>
      Math.abs(gestureState.dx) > 5 || Math.abs(gestureState.dy) > 5,
    onPanResponderGrant: () => {
      dragAnim.stopAnimation();
      dragAnim.setValue({ x: 0, y: 0 });
    },
    onPanResponderMove: (_, gestureState) => {
      dragAnim.setValue({ x: gestureState.dx, y: gestureState.dy });
    },
    onPanResponderRelease: (_, gestureState) => {
      const nextPosition = clampBubblePosition({
        left: bubblePositionRef.current.left + gestureState.dx,
        bottom: bubblePositionRef.current.bottom - gestureState.dy,
      });
      bubblePositionRef.current = nextPosition;
      dragAnim.setValue({ x: 0, y: 0 });
      setBubblePosition(nextPosition);
      AsyncStorage.setItem(CLIVE_BUBBLE_POSITION_KEY, JSON.stringify(nextPosition)).catch(() => {});
    },
    onPanResponderTerminate: () => {
      Animated.spring(dragAnim, {
        toValue: { x: 0, y: 0 },
        damping: 20,
        stiffness: 180,
        useNativeDriver: true,
      }).start();
    },
  }), [bubbleWidth, bubbleHeight, dragAnim, height, tabBarHeight, width]);

  useEffect(() => {
    if (!hideFloatingCliveBar) {
      setBarMounted(true);
      Animated.sequence([
        Animated.delay(120),
        Animated.spring(barAnim, {
          toValue: 1,
          damping: 22,
          stiffness: 72,
          mass: 0.9,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.timing(barAnim, {
        toValue: 0,
        duration: 360,
        useNativeDriver: true,
      }).start(() => setBarMounted(false));
    }
  }, [hideFloatingCliveBar]);

  const handleExpand = () => {
    const nextPosition = clampBubblePosition(bubblePositionRef.current, fullBubbleWidth, 50);
    bubblePositionRef.current = nextPosition;
    setBubblePosition(nextPosition);
    setCliveExpanded(true);
    Animated.spring(expandAnim, {
      toValue: 1,
      damping: 19,
      stiffness: 92,
      mass: 0.9,
      useNativeDriver: false,
    }).start();
  };

  const handleCollapse = () => {
    Animated.timing(expandAnim, {
      toValue: 0,
      duration: 460,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start(() => {
      setCliveExpanded(false);
    });
  };

  // Initialize push notification listeners and state (no permission prompt on load)
  useNotifications({ autoRequestPermission: false });

  useEffect(() => {
    if (!loading && session && communityId) {
      saveLastAppPath(pathname);
    }
  }, [loading, session, communityId, pathname]);

  // Guard: redirect to login/join if auth resolves without a valid session.
  // This runs for any deep link that bypasses the index.tsx routing logic
  // (e.g., opening /board directly from a home screen bookmark).
  useEffect(() => {
    if (loading) return;
    if (!session) {
      router.replace('/(auth)/login');
    } else if (!communityId) {
      router.replace('/join');
    }
  }, [loading, session, communityId]);

  // Show a spinner while auth is resolving rather than flashing empty tabs
  if (loading || !session || !communityId) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#faf8f3' }}>
        <ActivityIndicator size="large" color="#bd9348" />
      </View>
    );
  }

  const handleBubbleAttach = async () => {
    const remaining = 5 - bubbleImages.length;
    if (remaining <= 0) return;
    const images = await pickMultipleImages({ maxImages: remaining });
    if (images.length > 0) {
      setBubbleImages((prev) => [...prev, ...images]);
    }
  };

  const submitToClive = () => {
    const text = cliveDraft.trim();
    setCliveDraft('');
    if (bubbleImages.length > 0) {
      setPendingAttachments(bubbleImages);
      setBubbleImages([]);
    }
    if (text) {
      router.push({ pathname: '/', params: { message: text } });
    } else {
      router.push('/');
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <Tabs
        initialRouteName={getLastAppTabName()}
        screenOptions={{
          headerShown: false,
          tabBarStyle: useMobileLayout
            ? {
                height: 78,
                paddingTop: 4,
                paddingBottom: Platform.OS === 'ios' ? 14 : 8,
                backgroundColor: '#fff',
                borderTopColor: '#dec181',
              }
            : {
                height: 70,
                paddingBottom: 8,
                backgroundColor: '#fff',
                borderTopColor: '#dec181',
              },
          tabBarItemStyle: useMobileLayout
            ? { minWidth: 0, paddingHorizontal: 0 }
            : undefined,
          tabBarShowLabel: false,
        }}
      >
        <Tabs.Screen
          name="hive"
          options={{
            title: 'HIVE Home',
            tabBarAccessibilityLabel: 'HIVE Home',
            tabBarIcon: ({ focused }) => (
              <TabIcon imageSource={beeIcon} label="HIVE Home" focused={focused} compact={useMobileLayout} />
            ),
          }}
        />
        {/* Clive chat — accessible via tab bar and floating pill bar */}
        <Tabs.Screen
          name="index"
          options={{
            title: 'Clive',
            tabBarAccessibilityLabel: 'Clive',
            tabBarIcon: ({ focused }) => (
              <TabIcon
                imageSource={cliveIcon}
                label="Clive"
                focused={focused}
                isCircular
                compact={useMobileLayout}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="members"
          options={{
            title: 'Members',
            tabBarAccessibilityLabel: 'Members',
            tabBarIcon: ({ focused }) => (
              <TabIcon
                customIcon={
                  <Ionicons
                    name="people-outline"
                    size={useMobileLayout ? 22 : 26}
                    color={focused ? '#bd9348' : '#2d2d2d80'}
                  />
                }
                label="Members"
                focused={focused}
                compact={useMobileLayout}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="board"
          options={{
            title: 'Message Board',
            tabBarAccessibilityLabel: 'Message Board',
            tabBarIcon: ({ focused }) => (
              <TabIcon icon="📋" label="Message Board" focused={focused} compact={useMobileLayout} />
            ),
          }}
        />
        <Tabs.Screen
          name="messages"
          options={{
            title: 'Chat',
            tabBarAccessibilityLabel: 'Chat',
            tabBarIcon: ({ focused }) => (
              <TabIcon icon="💬" label="Chat" focused={focused} badge={totalUnreadDMs} compact={useMobileLayout} />
            ),
          }}
        />
        <Tabs.Screen
          name="meetings"
          options={{
            title: 'Meeting Hub',
            tabBarAccessibilityLabel: 'Meeting Hub',
            tabBarIcon: ({ focused }) => (
              <TabIcon customIcon={<HexagonIcon size={useMobileLayout ? 22 : 26} />} label="Meeting Hub" focused={focused} compact={useMobileLayout} />
            ),
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: 'Profile',
            href: null,
            tabBarAccessibilityLabel: 'Profile',
            tabBarIcon: ({ focused }) => (
              <TabIcon
                icon="👤"
                imageSource={profile?.avatar_url ? { uri: profile.avatar_url } : undefined}
                label="Profile"
                focused={focused}
                isCircular
                compact={useMobileLayout}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="admin"
          options={{
            title: 'Admin',
            href: showAdminTab ? '/admin' : undefined,
            tabBarAccessibilityLabel: 'Admin',
            tabBarIcon: ({ focused }) => (
              <TabIcon icon="⚙️" label="Admin" focused={focused} compact={useMobileLayout} />
            ),
          }}
        />
      </Tabs>

      {/* Floating Clive bar — soft entrance/exit, collapses to icon bubble, expands to full pill */}
      {barMounted && (
        <Animated.View
          style={{
            position: 'absolute',
            bottom: bubblePosition.bottom,
            left: bubblePosition.left,
            borderRadius: 32,
            shadowColor: '#bd9348',
            shadowOffset: { width: 0, height: 6 },
            shadowOpacity: Animated.multiply(barAnim, 0.18) as any,
            shadowRadius: 16,
            elevation: 8,
            opacity: barAnim,
            transform: [
              { translateX: dragAnim.x },
              { translateY: Animated.add(barAnim.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }), dragAnim.y) },
              { scale: barAnim.interpolate({ inputRange: [0, 1], outputRange: [0.88, 1] }) },
            ],
            ...(Platform.OS === 'web' && !cliveExpanded ? {
              cursor: 'grab',
              touchAction: 'none',
              userSelect: 'none',
            } as any : {}),
          }}
          {...(!cliveExpanded ? panResponder.panHandlers : {})}
        >
          <Animated.View
            style={{
              borderRadius: 32,
              overflow: 'hidden',
              width: animatedBubbleWidth,
              height: animatedBubbleHeight,
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: 'rgba(255,255,255,0.86)',
              borderWidth: 1,
              borderColor: 'rgba(189,147,72,0.22)',
              // Liquid-glass: subtle inner highlight + backdrop blur on web
              ...(Platform.OS === 'web' ? {
                backdropFilter: 'blur(16px) saturate(180%)',
                WebkitBackdropFilter: 'blur(16px) saturate(180%)',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.9), inset 0 -1px 0 rgba(189,147,72,0.08)',
              } as any : {}),
            }}
          >
            {/* Clive avatar — tap to collapse/expand, drag the bubble to move it */}
            <Pressable
              onPress={cliveExpanded ? () => router.push('/') : handleExpand}
              className="active:opacity-70"
              style={{
                width: 48,
                height: 48,
                alignItems: 'center',
                justifyContent: 'center',
              }}
              accessibilityLabel={cliveExpanded ? 'Open Clive chat page' : 'Expand Clive chat bubble'}
            >
              <View style={{ width: 36, height: 36, borderRadius: 18, overflow: 'hidden' }}
                className="border border-gold/40">
                <Image
                  source={cliveIcon}
                  style={{ width: 36, height: 36 }}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                />
              </View>
            </Pressable>

            <Animated.View
              pointerEvents={cliveExpanded ? 'auto' : 'none'}
              style={{
                flex: 1,
                minWidth: 0,
                flexDirection: 'row',
                alignItems: 'center',
                opacity: expandedContentOpacity,
                paddingRight: 8,
              }}
            >
              {/* Move handle — drag Clive away from buttons/forms */}
              <Pressable
                {...panResponder.panHandlers}
                className="p-1 mr-0.5 active:opacity-60"
                accessibilityLabel="Move Clive chat bubble"
                {...(Platform.OS === 'web' ? { title: 'Move Clive' } as any : {})}
                style={{
                  ...(Platform.OS === 'web' ? {
                    cursor: 'grab',
                    touchAction: 'none',
                    userSelect: 'none',
                  } as any : {}),
                }}
              >
                <Ionicons name="move-outline" size={18} color="#bd9348" />
              </Pressable>

              {/* Text input */}
              <TextInput
                value={cliveDraft}
                onChangeText={setCliveDraft}
                placeholder="Ask Clive..."
                placeholderTextColor="#b5860d80"
                returnKeyType="send"
                onSubmitEditing={submitToClive}
                style={{
                  flex: 1,
                  minWidth: 0,
                  fontFamily: 'Lato_400Regular',
                  fontSize: 15,
                  color: '#2d2d2d',
                  paddingVertical: 6,
                }}
              />

              {/* Send arrow — only shows when there's text */}
              {cliveDraft.trim().length > 0 && (
                <Pressable
                  onPress={submitToClive}
                  className="ml-1 p-1 active:opacity-60"
                  accessibilityLabel="Send message to Clive"
                  {...(Platform.OS === 'web' ? { title: 'Send' } as any : {})}
                >
                  <Ionicons name="arrow-up-circle" size={24} color="#bd9348" />
                </Pressable>
              )}

              {/* Collapse — float closed to Clive's icon */}
              <Pressable
                onPress={handleCollapse}
                className="p-1 ml-0.5 active:opacity-60"
                accessibilityLabel="Minimize Clive chat bubble"
                {...(Platform.OS === 'web' ? { title: 'Minimize Clive' } as any : {})}
              >
                <Ionicons name="chevron-down-circle-outline" size={20} color="#bd9348" />
              </Pressable>

              {/* Paperclip — pick images before sending to Clive */}
              <Pressable
                onPress={handleBubbleAttach}
                disabled={bubbleImages.length >= 5}
                className="p-1 ml-1 active:opacity-60"
                style={{ position: 'relative' }}
                accessibilityLabel="Attach image"
              >
                <Ionicons
                  name="attach-outline"
                  size={20}
                  color={bubbleImages.length >= 5 ? '#ccc' : '#bd9348'}
                />
                {bubbleImages.length > 0 && (
                  <View
                    style={{
                      position: 'absolute',
                      top: -2,
                      right: -4,
                      backgroundColor: '#bd9348',
                      borderRadius: 8,
                      minWidth: 14,
                      height: 14,
                      paddingHorizontal: 2,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Text style={{ fontFamily: 'Lato_700Bold', color: 'white', fontSize: 9 }}>
                      {bubbleImages.length}
                    </Text>
                  </View>
                )}
              </Pressable>

              {/* Mic — voice-to-text, then navigate to Clive with the message */}
              <VoiceMicButton
                size={20}
                style={{ marginLeft: 4 }}
                onTranscript={(text) => {
                  if (text.trim()) {
                    if (bubbleImages.length > 0) {
                      setPendingAttachments(bubbleImages);
                      setBubbleImages([]);
                    }
                    router.push({ pathname: '/', params: { message: text } });
                  }
                }}
                onInterimTranscript={(text) => {
                  setCliveDraft(text);
                }}
              />
            </Animated.View>
          </Animated.View>
        </Animated.View>
      )}
    </View>
  );
}
