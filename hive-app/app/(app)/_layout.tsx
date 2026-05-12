import { useEffect, useState } from 'react';
import { Tabs, usePathname, useRouter } from 'expo-router';
import { Text, View, ImageSourcePropType, Platform, useWindowDimensions, ActivityIndicator, Pressable, TextInput } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
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
    ? label.replace('HIVE Home', 'HIVE\nHome').replace('Message Board', 'Message\nBoard')
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
  const isAdmin = communityRole === 'admin';
  const showAdminTab = communityRole === 'admin' || communityRole === 'treasurer';
  const { width } = useWindowDimensions();
  const { totalUnread: totalUnreadDMs } = useTotalUnreadDMs(communityId ?? undefined, profile?.id);
  const [cliveDraft, setCliveDraft] = useState('');
  const [bubbleImages, setBubbleImages] = useState<SelectedImage[]>([]);
  const [cliveExpanded, setCliveExpanded] = useState(true);

  // Use mobile layout for narrow screens (< 768px) regardless of platform
  const useMobileLayout = width < 768;

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

  const tabBarHeight = useMobileLayout
    ? Platform.OS === 'ios' ? 92 : 86
    : 70;

  // Hide floating Clive bar when already on the Clive chat page
  const onClivePage = pathname === '/' || pathname === '/index';

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
            title: 'Meetings',
            tabBarAccessibilityLabel: 'Meetings',
            tabBarIcon: ({ focused }) => (
              <TabIcon customIcon={<HexagonIcon size={useMobileLayout ? 22 : 26} />} label="Meetings" focused={focused} compact={useMobileLayout} />
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

      {/* Floating Clive bar — collapses to icon bubble, expands to full pill */}
      {!onClivePage && (
        <View
          style={{
            position: 'absolute',
            bottom: tabBarHeight + 10,
            right: 12,
            shadowColor: '#bd9348',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.25,
            shadowRadius: 12,
            elevation: 8,
          }}
        >
          {cliveExpanded ? (
            /* Expanded: full pill bar */
            <View
              style={{ borderRadius: 32, overflow: 'hidden', width: Math.min(width - 24, 330) }}
              className="flex-row items-center bg-white border border-gold/30 px-2 py-1.5"
            >
              {/* Clive avatar — tap to collapse */}
              <Pressable onPress={() => setCliveExpanded(false)} className="mr-2 active:opacity-70">
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

              {/* Text area — tap navigates to Clive's main page */}
              <Pressable onPress={() => router.push('/')} style={{ flex: 1, minWidth: 0 }}>
                <Text style={{
                  fontFamily: 'Lato_400Regular',
                  fontSize: 15,
                  color: '#b5860d80',
                  paddingVertical: 6,
                }}>
                  {cliveDraft.trim() || 'Ask Clive...'}
                </Text>
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
            </View>
          ) : (
            /* Collapsed: just the icon bubble */
            <Pressable
              onPress={() => setCliveExpanded(true)}
              style={{
                width: 48,
                height: 48,
                borderRadius: 24,
                overflow: 'hidden',
                borderWidth: 1.5,
                borderColor: 'rgba(189,147,72,0.4)',
                backgroundColor: 'white',
              }}
            >
              <Image
                source={cliveIcon}
                style={{ width: 48, height: 48 }}
                contentFit="cover"
                cachePolicy="memory-disk"
              />
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}
