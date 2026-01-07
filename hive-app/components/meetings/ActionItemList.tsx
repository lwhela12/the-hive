import { View, Text, Pressable } from 'react-native';
import type { ActionItem, Profile } from '../../types';

interface ActionItemListProps {
  items: (ActionItem & { assigned_user?: Profile })[];
  onToggle?: (item: ActionItem) => void;
}

export function ActionItemList({ items, onToggle }: ActionItemListProps) {
  if (items.length === 0) {
    return (
      <View className="bg-white rounded-xl p-6 items-center">
        <Text className="text-gray-500">No action items</Text>
      </View>
    );
  }

  return (
    <View className="bg-white rounded-xl shadow-sm overflow-hidden">
      {items.map((item) => (
        <Pressable
          key={item.id}
          onPress={() => onToggle?.(item)}
          className={`flex-row items-center p-4 border-b border-gray-100 last:border-b-0 ${
            item.completed ? 'opacity-60' : ''
          }`}
        >
          <View
            className={`w-6 h-6 rounded-full border-2 mr-3 items-center justify-center ${
              item.completed
                ? 'bg-honey-500 border-honey-500'
                : 'border-gray-400'
            }`}
          >
            {item.completed && <Text className="text-white text-xs">✓</Text>}
          </View>
          <View className="flex-1">
            <Text
              className={`text-gray-800 ${
                item.completed ? 'line-through' : ''
              }`}
            >
              {item.description}
            </Text>
            <View className="flex-row items-center mt-1">
              {item.assigned_user && (
                <Text className="text-sm text-gray-500 mr-3">
                  {item.assigned_user.name}
                </Text>
              )}
              {item.due_date && (
                <Text className="text-sm text-gray-400">
                  Due {new Date(item.due_date).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                  })}
                </Text>
              )}
            </View>
          </View>
        </Pressable>
      ))}
    </View>
  );
}
