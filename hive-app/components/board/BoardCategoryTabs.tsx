import { memo } from 'react';
import { ScrollView, Pressable, Text, View } from 'react-native';
import type { BoardCategory } from '../../types';

interface BoardCategoryTabsProps {
  categories: BoardCategory[];
  selectedId: string | null;
  onSelect: (category: BoardCategory) => void;
  onAddTopic?: () => void;
}

const EMOJI_MAP: Record<string, string> = {
  '1F4E2': '📢',
  '1F4AC': '💬',
  '1F451': '👑',
  '1F4DA': '📚',
  '1F44B': '👋',
  // Custom topic emojis
  '1F4A1': '💡',
  '2753': '❓',
  '1F389': '🎉',
  '1F4DD': '📝',
  '1F3AF': '🎯',
  '1F4E6': '📦',
  '1F91D': '🤝',
  '1F4B0': '💰',
  '1F3E0': '🏠',
  '1F3A8': '🎨',
  '1F3B5': '🎵',
  '1F374': '🍴',
  '1F4AA': '💪',
  '2764': '❤️',
  '1F331': '🌱',
  '1F680': '🚀',
  '1F9E0': '🧠',
  '1F4C5': '📅',
};

export const BoardCategoryTabs = memo(function BoardCategoryTabs({ categories, selectedId, onSelect, onAddTopic }: BoardCategoryTabsProps) {
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
        {/* Add new topic button */}
        {onAddTopic && (
          <Pressable
            onPress={onAddTopic}
            className="flex-row items-center px-4 py-2 rounded-full border-2 border-dashed border-charcoal/20"
          >
            <Text className="mr-1 text-charcoal/40">+</Text>
            <Text
              style={{ fontFamily: 'Lato_400Regular' }}
              className="text-charcoal/40"
            >
              Add Topic
            </Text>
          </Pressable>
        )}
      </ScrollView>
    </View>
  );
});
