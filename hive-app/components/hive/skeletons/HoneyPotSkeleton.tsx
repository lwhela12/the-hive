import { View } from 'react-native';
import { Skeleton } from '../../ui/Skeleton';

/**
 * Skeleton for the Honey Pot display
 * Matches the exact layout of HoneyPotDisplay component
 */
export function HoneyPotSkeleton() {
  return (
    <View className="bg-gray-100 rounded-xl p-4 flex-row items-center">
      {/* Honey pot emoji placeholder */}
      <Skeleton width={40} height={40} borderRadius={8} style={{ marginRight: 16 }} />
      <View>
        {/* "Honey Pot" label */}
        <Skeleton width={70} height={12} style={{ marginBottom: 6 }} />
        {/* Balance amount */}
        <Skeleton width={100} height={24} />
      </View>
    </View>
  );
}
