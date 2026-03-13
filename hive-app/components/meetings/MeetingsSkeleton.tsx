import { View } from 'react-native';
import { Skeleton } from '../ui/Skeleton';

/**
 * Skeleton for the upcoming meetings section
 */
export function UpcomingMeetingsSkeleton() {
  return (
    <View className="mb-6">
      <Skeleton width="55%" height={18} style={{ marginBottom: 12 }} />
      {[0, 1].map((i) => (
        <View key={i} className="bg-white rounded-xl p-4 mb-3 shadow-sm">
          <View className="flex-row items-start justify-between">
            <View className="flex-1">
              <Skeleton width="60%" height={16} style={{ marginBottom: 8 }} />
              <Skeleton width="40%" height={12} style={{ marginBottom: 4 }} />
            </View>
            <Skeleton width={60} height={32} borderRadius={8} />
          </View>
        </View>
      ))}
    </View>
  );
}

/**
 * Skeleton for the past recordings section
 */
export function PastRecordingsSkeleton() {
  return (
    <View>
      {[0, 1, 2].map((i) => (
        <View key={i} className="bg-white rounded-xl p-4 mb-3 shadow-sm">
          <View className="flex-row items-center justify-between">
            <View className="flex-1">
              <Skeleton width="65%" height={16} style={{ marginBottom: 8 }} />
              <Skeleton width="30%" height={12} />
            </View>
            <Skeleton width={28} height={28} borderRadius={14} />
          </View>
        </View>
      ))}
    </View>
  );
}
