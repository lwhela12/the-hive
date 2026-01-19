import { View } from 'react-native';
import { Skeleton } from '../../ui/Skeleton';

/**
 * Skeleton for the upcoming events list
 * Shows 3 event item placeholders matching the real event cards
 */
export function EventsListSkeleton() {
  const renderEventSkeleton = (isLast: boolean) => (
    <View className={`p-4 ${!isLast ? 'border-b border-cream' : ''}`}>
      <View className="flex-row items-start">
        {/* Emoji placeholder */}
        <Skeleton width={28} height={28} borderRadius={4} style={{ marginRight: 12 }} />
        <View className="flex-1">
          {/* Event title */}
          <Skeleton width="70%" height={16} style={{ marginBottom: 6 }} />
          {/* Date/time */}
          <Skeleton width="40%" height={12} />
        </View>
      </View>
    </View>
  );

  return (
    <View className="bg-white rounded-xl shadow-sm overflow-hidden">
      {renderEventSkeleton(false)}
      {renderEventSkeleton(false)}
      {renderEventSkeleton(true)}
    </View>
  );
}
