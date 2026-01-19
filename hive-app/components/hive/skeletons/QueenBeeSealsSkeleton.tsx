import { View, useWindowDimensions } from 'react-native';
import { Skeleton, SkeletonCircle, SkeletonText } from '../../ui/Skeleton';

/**
 * Skeleton for the three Queen Bee seals (Last Month, Current, Next Month)
 * Matches the exact layout of the real seals section
 */
export function QueenBeeSealsSkeleton() {
  const { width } = useWindowDimensions();
  const sealSize = width < 500 ? Math.floor((width - 80) / 3) : 160;
  const columnWidth = sealSize + 8;
  const avatarSize = Math.floor(sealSize * 0.4);

  const renderSealSkeleton = () => (
    <View className="items-center" style={{ width: columnWidth }}>
      {/* Seal circle placeholder */}
      <View
        style={{ width: sealSize, height: sealSize }}
        className="items-center justify-center"
      >
        <SkeletonCircle size={avatarSize} />
      </View>
      {/* Details below seal */}
      <View className="mt-2 items-center" style={{ width: columnWidth }}>
        <Skeleton width={columnWidth * 0.8} height={12} style={{ marginBottom: 4 }} />
        <Skeleton width={columnWidth * 0.6} height={10} />
      </View>
    </View>
  );

  return (
    <View className="flex-row justify-evenly py-4 border-b border-gray-100">
      {renderSealSkeleton()}
      {renderSealSkeleton()}
      {renderSealSkeleton()}
    </View>
  );
}
