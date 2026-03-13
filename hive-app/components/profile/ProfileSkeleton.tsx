import { View } from 'react-native';
import { Skeleton, SkeletonCircle } from '../ui/Skeleton';

/**
 * Skeleton for the profile header (avatar + name + email)
 */
export function ProfileHeaderSkeleton() {
  return (
    <View className="items-center mb-6">
      <SkeletonCircle size={80} />
      <Skeleton width={100} height={12} style={{ marginTop: 8 }} />
      <Skeleton width={160} height={22} borderRadius={4} style={{ marginTop: 8 }} />
      <Skeleton width={180} height={14} style={{ marginTop: 6 }} />
    </View>
  );
}

/**
 * Skeleton for the profile information card
 */
export function ProfileInfoSkeleton() {
  return (
    <View className="mb-6">
      <Skeleton width={160} height={18} style={{ marginBottom: 8 }} />
      <View className="bg-white rounded-xl shadow-sm overflow-hidden">
        {[0, 1, 2, 3, 4].map((i) => (
          <View key={i} className="p-4 border-b border-cream">
            <Skeleton width={60} height={10} style={{ marginBottom: 8 }} />
            <Skeleton width={i === 4 ? '30%' : '50%'} height={14} />
          </View>
        ))}
      </View>
    </View>
  );
}

/**
 * Skeleton for skills/wishes list sections
 */
export function ListSectionSkeleton({ count = 3 }: { count?: number }) {
  return (
    <View className="mb-6">
      <View className="flex-row items-center justify-between mb-2">
        <Skeleton width={120} height={18} />
        <Skeleton width={32} height={32} borderRadius={16} />
      </View>
      <View className="bg-white rounded-xl shadow-sm overflow-hidden">
        {Array.from({ length: count }).map((_, i) => (
          <View key={i} className="p-4 border-b border-cream">
            <Skeleton width={`${70 - i * 10}%`} height={14} />
          </View>
        ))}
      </View>
    </View>
  );
}
