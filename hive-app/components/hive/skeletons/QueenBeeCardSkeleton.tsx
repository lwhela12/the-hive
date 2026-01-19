import { View } from 'react-native';
import { Skeleton, SkeletonCircle, SkeletonText } from '../../ui/Skeleton';

/**
 * Skeleton for the Queen Bee card (collapsed state)
 * Matches the exact layout of QueenBeeCard component
 */
export function QueenBeeCardSkeleton() {
  return (
    <View className="bg-white rounded-xl p-4 shadow-sm border-2 border-gray-100">
      <View className="flex-row items-center">
        {/* Avatar with crown placeholder */}
        <View className="relative">
          <SkeletonCircle size={56} />
        </View>
        {/* Name and project title */}
        <View className="flex-1 ml-4">
          <Skeleton width="60%" height={18} style={{ marginBottom: 8 }} />
          <Skeleton width="80%" height={14} />
        </View>
        {/* Expand arrow placeholder */}
        <Skeleton width={24} height={24} borderRadius={4} />
      </View>
    </View>
  );
}
