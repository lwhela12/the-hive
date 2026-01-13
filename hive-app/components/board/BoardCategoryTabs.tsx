import { ScrollView, Pressable, Text, View } from 'react-native';
import type { BoardCategory } from '../../types';

interface BoardCategoryTabsProps {
  categories: BoardCategory[];
  selectedId: string | null;
  onSelect: (category: BoardCategory) => void;
}

const EMOJI_MAP: Record<string, string> = {
  '1F4E2': '📢',
  '1F4AC': '💬',
  '1F451': '👑',
  '1F4DA': '📚',
  '1F44B': '👋',
};

export function BoardCategoryTabs({ categories, selectedId, onSelect }: BoardCategoryTabsProps) {
  return (
    <View className="bg-white border-b border-cream">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerClassName="px-4 py-3"
      >
        {categories.map((category) => {
          const isSelected = selectedId === category.id;
          const emoji = category.icon ? EMOJI_MAP[category.icon] || category.icon : '📁';

          return (
            <Pressable
              key={category.id}
              onPress={() => onSelect(category)}
              className={`flex-row items-center px-4 py-2 mr-2 rounded-full ${
                isSelected ? 'bg-gold' : 'bg-cream'
              }`}
            >
              <Text className="mr-1">{emoji}</Text>
              <Text
                style={{ fontFamily: isSelected ? 'Lato_700Bold' : 'Lato_400Regular' }}
                className={isSelected ? 'text-white' : 'text-charcoal'}
              >
                {category.name}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}
