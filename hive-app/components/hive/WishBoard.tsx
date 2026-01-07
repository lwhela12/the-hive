import { View, Text, ScrollView } from 'react-native';
import { WishCard } from './WishCard';
import type { Wish, Profile } from '../../types';

interface WishBoardProps {
  wishes: (Wish & { user: Profile })[];
  onHelpWish?: (wish: Wish) => void;
  emptyMessage?: string;
}

export function WishBoard({
  wishes,
  onHelpWish,
  emptyMessage = 'No wishes to display',
}: WishBoardProps) {
  if (wishes.length === 0) {
    return (
      <View className="bg-white rounded-xl p-8 items-center">
        <Text className="text-4xl mb-3">✨</Text>
        <Text className="text-gray-500 text-center">{emptyMessage}</Text>
      </View>
    );
  }

  return (
    <View>
      {wishes.map((wish) => (
        <WishCard
          key={wish.id}
          wish={wish}
          onHelp={onHelpWish ? () => onHelpWish(wish) : undefined}
        />
      ))}
    </View>
  );
}
