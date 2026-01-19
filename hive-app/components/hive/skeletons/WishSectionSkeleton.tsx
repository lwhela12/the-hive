import { View } from 'react-native';
import { Skeleton, SkeletonCircle } from '../../ui/Skeleton';

/**
 * Skeleton for a single wish card
 * Matches the exact layout of WishCard component
 */
function WishCardSkeleton() {
  return (
    <View className="bg-white rounded-xl p-4 shadow-sm mb-3">
      <View className="flex-row items-start">
        {/* Avatar */}
        <SkeletonCircle size={44} />
        <View className="flex-1 ml-3">
          {/* Name */}
          <Skeleton width="40%" height={16} style={{ marginBottom: 8 }} />
          {/* Wish description - 2 lines */}
          <Skeleton width="100%" height={14} style={{ marginBottom: 4 }} />
          <Skeleton width="80%" height={14} style={{ marginBottom: 12 }} />
          {/* Date and action row */}
          <View className="flex-row items-center justify-between">
            <Skeleton width={60} height={10} />
            <Skeleton width={80} height={24} borderRadius={12} />
          </View>
        </View>
      </View>
    </View>
  );
}

/**
 * Skeleton for the Community Wishes section
 * Includes tab bar and wish card placeholders
 */
export function WishSectionSkeleton() {
  return (
    <View>
      {/* Tabs skeleton */}
      <View className="flex-row mb-3 bg-cream/50 rounded-lg p-1">
        <View className="flex-1 py-2 rounded-md bg-white shadow-sm">
          <Skeleton width="50%" height={14} style={{ alignSelf: 'center' }} />
        </View>
        <View className="flex-1 py-2 rounded-md">
          <Skeleton width="50%" height={14} style={{ alignSelf: 'center' }} />
        </View>
      </View>

      {/* Wish cards */}
      <WishCardSkeleton />
      <WishCardSkeleton />
    </View>
  );
}
