import { useState } from 'react';
import { View, Text, ScrollView, RefreshControl, Image, useWindowDimensions, Pressable } from 'react-native';
import Svg, { Path, Text as SvgText, TextPath, Defs } from 'react-native-svg';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../lib/hooks/useAuth';
import { useHiveDataQuery } from '../../lib/hooks/useHiveDataQuery';
import { useWishes } from '../../lib/hooks/useWishes';
import { QueenBeeCard } from '../../components/hive/QueenBeeCard';
import { WishCard } from '../../components/hive/WishCard';
import { WishDetail } from '../../components/hive/WishDetail';
import { HoneyPotDisplay } from '../../components/hive/HoneyPotDisplay';
import { NavigationDrawer, AppHeader } from '../../components/navigation';
import { Avatar } from '../../components/ui/Avatar';
import { formatDateShort, formatDateLong, formatTime } from '../../lib/dateUtils';
import type { Profile, Wish, WishGranter } from '../../types';

type WishTab = 'open' | 'granted';

type WishWithGranters = Wish & {
  user: Profile;
  granters?: (WishGranter & { granter: Profile })[];
};

export default function HiveScreen() {
  const { profile, communityId } = useAuth();
  const { width } = useWindowDimensions();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const useMobileLayout = width < 768;

  // Responsive seal sizing - smaller on mobile
  const sealSize = width < 500 ? Math.floor((width - 80) / 3) : 160;
  const arcStart = Math.floor(sealSize * 0.19);
  const arcEnd = sealSize - arcStart;
  const arcY = Math.floor(sealSize * 0.5);
  const arcRadius = Math.floor(sealSize * 0.31);
  const fontSize = width < 500 ? 11 : 13;
  const [refreshing, setRefreshing] = useState(false);
  const [selectedWish, setSelectedWish] = useState<WishWithGranters | null>(null);
  const [wishTab, setWishTab] = useState<WishTab>('open');

  // Use the optimized hive data hook (React Query with caching)
  const {
    queenBees,
    fallbackAdmin,
    publicWishes,
    grantedWishes,
    upcomingEvents,
    honeyPotBalance,
    nextMeeting,
    isLoading,
    refetch,
  } = useHiveDataQuery(communityId ?? undefined, profile?.id);

  // For granting wishes
  const { grantWish } = useWishes();

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  // Handle grant wish
  const handleGrantWish = async (data: {
    wishId: string;
    granterIds: string[];
    thankYouMessage?: string;
  }) => {
    const result = await grantWish(data.wishId, data.granterIds, data.thankYouMessage);
    if (!result.error) {
      await refetch();
    }
    return result;
  };

  // Show wish detail fullscreen
  if (selectedWish) {
    return (
      <SafeAreaView className="flex-1 bg-white" edges={['top']}>
        <WishDetail
          wish={selectedWish}
          onClose={() => setSelectedWish(null)}
          onGrant={handleGrantWish}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-white" edges={['top']}>
      {/* Mobile Header */}
      {useMobileLayout && (
        <AppHeader
          title="HIVE"
          onMenuPress={() => setDrawerOpen(true)}
        />
      )}

      {/* Navigation Drawer */}
      {useMobileLayout && (
        <NavigationDrawer
          isOpen={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          mode="navigation"
        />
      )}

      <ScrollView
        className="flex-1"
        contentContainerClassName="pb-4"
        refreshControl={
          <RefreshControl refreshing={refreshing || isLoading} onRefresh={onRefresh} tintColor="#bd9348" />
        }
      >
        {/* Queen Bee Seals with Details */}
        {(() => {
          const avatarSize = Math.floor(sealSize * 0.4);
          const columnWidth = sealSize + 8; // seal width plus small margin

          const renderSealColumn = (
            label: string,
            profile: Profile | null,
            arcId: string,
            details: React.ReactNode
          ) => {
            const displayProfile = profile || fallbackAdmin;
            return (
              <View className="items-center" style={{ width: columnWidth }}>
                {/* Seal */}
                <View style={{ width: sealSize, height: sealSize }}>
                  <Image
                    source={require('../../assets/SIMPLIFIED SEAL 2.png')}
                    style={{ width: sealSize, height: sealSize, position: 'absolute' }}
                    resizeMode="contain"
                  />
                  <View style={{
                    position: 'absolute',
                    top: (sealSize - avatarSize) / 2 - sealSize * 0.015,
                    left: (sealSize - avatarSize) / 2
                  }}>
                    {displayProfile && (
                      <Avatar name={displayProfile.name} url={displayProfile.avatar_url} size={avatarSize} />
                    )}
                  </View>
                  <Svg width={sealSize} height={sealSize} style={{ position: 'absolute' }}>
                    <Defs>
                      <Path
                        id={arcId}
                        d={`M ${arcStart},${arcY} A ${arcRadius},${arcRadius} 0 0,0 ${arcEnd},${arcY}`}
                      />
                    </Defs>
                    <SvgText fill="#333" fontSize={fontSize} fontWeight="bold">
                      <TextPath href={`#${arcId}`} startOffset="50%" textAnchor="middle">
                        {label}
                      </TextPath>
                    </SvgText>
                  </Svg>
                </View>
                {/* Details */}
                <View className="mt-2 items-center" style={{ width: columnWidth }}>
                  {details}
                </View>
              </View>
            );
          };

          return (
            <View className="flex-row justify-evenly py-4 border-b border-gray-100">
              {renderSealColumn(
                'Last Month',
                queenBees.lastMonth?.user || null,
                'lastMonthArc',
                <>
                  <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-xs text-charcoal text-center" numberOfLines={1}>
                    {queenBees.lastMonth?.user?.name || fallbackAdmin?.name || 'TBD'}
                  </Text>
                  {queenBees.lastMonth?.highlights && queenBees.lastMonth.highlights.length > 0 ? (
                    queenBees.lastMonth.highlights.slice(0, 2).map((h) => (
                      <Text key={h.id} style={{ fontFamily: 'Lato_400Regular' }} className="text-xs text-charcoal/60 text-center" numberOfLines={2}>
                        {h.highlight}
                      </Text>
                    ))
                  ) : (
                    <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-xs text-charcoal/40 italic text-center">
                      No highlights
                    </Text>
                  )}
                </>
              )}
              {renderSealColumn(
                'Current',
                queenBees.currentMonth?.user || null,
                'currentArc',
                <>
                  <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-xs text-charcoal text-center" numberOfLines={1}>
                    {queenBees.currentMonth?.user?.name || fallbackAdmin?.name || 'TBD'}
                  </Text>
                  {queenBees.currentMonth?.project_title && (
                    <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-xs text-charcoal/70 text-center" numberOfLines={2}>
                      {queenBees.currentMonth.project_title}
                    </Text>
                  )}
                  {queenBees.currentMonth?.highlights && queenBees.currentMonth.highlights.length > 0 ? (
                    queenBees.currentMonth.highlights.slice(0, 1).map((h) => (
                      <Text key={h.id} style={{ fontFamily: 'Lato_400Regular' }} className="text-xs text-charcoal/60 text-center" numberOfLines={2}>
                        {h.highlight}
                      </Text>
                    ))
                  ) : (
                    <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-xs text-charcoal/40 italic text-center">
                      Updates soon
                    </Text>
                  )}
                </>
              )}
              {renderSealColumn(
                'Next Month',
                queenBees.nextMonth?.user || null,
                'nextMonthArc',
                <>
                  <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-xs text-charcoal text-center" numberOfLines={1}>
                    {queenBees.nextMonth?.user?.name || 'TBD'}
                  </Text>
                  {nextMeeting && (
                    <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-xs text-charcoal/70 text-center">
                      Next: {formatDateShort(nextMeeting.event_date)}
                    </Text>
                  )}
                </>
              )}
            </View>
          );
        })()}

        {/* Main Content */}
        <View className="p-4">

        {/* Queen Bee Section */}
        {queenBees.currentMonth && (
          <View className="mb-6">
            <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-lg text-charcoal mb-2">
              This Month's Queen Bee 👑
            </Text>
            <QueenBeeCard queenBee={queenBees.currentMonth} />
          </View>
        )}

        {/* Upcoming Events */}
        {upcomingEvents.length > 0 && (
          <View className="mb-6">
            <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-lg text-charcoal mb-2">
              Upcoming Events
            </Text>
            <View className="bg-white rounded-xl p-4 shadow-sm">
              {upcomingEvents.map((event) => (
                <View
                  key={event.id}
                  className="flex-row items-center py-2 border-b border-cream last:border-b-0"
                >
                  <Text className="text-2xl mr-3">
                    {event.event_type === 'birthday' ? '🎂' :
                     event.event_type === 'meeting' ? '📅' :
                     event.event_type === 'queen_bee' ? '👑' : '📌'}
                  </Text>
                  <View className="flex-1">
                    <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-charcoal">{event.title}</Text>
                    <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-sm text-charcoal/60">
                      {formatDateShort(event.event_date)}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Honey Pot */}
        <View className="mb-6">
          <HoneyPotDisplay balance={honeyPotBalance} />
        </View>

        {/* Community Wishes */}
        <View className="mb-6">
          <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-lg text-charcoal mb-2">
            Community Wishes
          </Text>

          {/* Tabs */}
          <View className="flex-row mb-3 bg-cream/50 rounded-lg p-1">
            <Pressable
              onPress={() => setWishTab('open')}
              className={`flex-1 py-2 rounded-md ${
                wishTab === 'open' ? 'bg-white shadow-sm' : ''
              }`}
            >
              <Text
                style={{ fontFamily: wishTab === 'open' ? 'Lato_700Bold' : 'Lato_400Regular' }}
                className={`text-center text-sm ${
                  wishTab === 'open' ? 'text-charcoal' : 'text-charcoal/60'
                }`}
              >
                Open ({publicWishes.length})
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setWishTab('granted')}
              className={`flex-1 py-2 rounded-md ${
                wishTab === 'granted' ? 'bg-white shadow-sm' : ''
              }`}
            >
              <Text
                style={{ fontFamily: wishTab === 'granted' ? 'Lato_700Bold' : 'Lato_400Regular' }}
                className={`text-center text-sm ${
                  wishTab === 'granted' ? 'text-charcoal' : 'text-charcoal/60'
                }`}
              >
                Granted ({grantedWishes.length})
              </Text>
            </Pressable>
          </View>

          {/* Open Wishes */}
          {wishTab === 'open' && (
            <>
              {publicWishes.length === 0 ? (
                <View className="bg-white rounded-xl p-6 shadow-sm items-center">
                  <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-charcoal/50">
                    No open wishes yet
                  </Text>
                </View>
              ) : (
                publicWishes.map((wish) => (
                  <WishCard
                    key={wish.id}
                    wish={wish}
                    onPress={() => setSelectedWish(wish)}
                  />
                ))
              )}
            </>
          )}

          {/* Granted Wishes */}
          {wishTab === 'granted' && (
            <>
              {grantedWishes.length === 0 ? (
                <View className="bg-white rounded-xl p-6 shadow-sm items-center">
                  <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-charcoal/50">
                    No granted wishes yet
                  </Text>
                  <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-charcoal/40 text-sm mt-1">
                    Wishes that are fulfilled will appear here
                  </Text>
                </View>
              ) : (
                grantedWishes.map((wish) => (
                  <WishCard
                    key={wish.id}
                    wish={wish}
                    onPress={() => setSelectedWish(wish)}
                  />
                ))
              )}
            </>
          )}
        </View>

        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
