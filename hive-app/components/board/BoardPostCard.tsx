import { View, Text, Pressable } from 'react-native';
import { formatDateShort } from '../../lib/dateUtils';
import type { BoardPost, Profile } from '../../types';

interface BoardPostCardProps {
  post: BoardPost & { author?: Profile };
  onPress: () => void;
}

export function BoardPostCard({ post, onPress }: BoardPostCardProps) {
  const timeAgo = getTimeAgo(new Date(post.created_at));

  return (
    <Pressable
      onPress={onPress}
      className="bg-white rounded-xl p-4 mb-3 shadow-sm active:opacity-80"
    >
      <View className="flex-row items-start justify-between">
        <View className="flex-1 mr-3">
          {post.is_pinned && (
            <View className="flex-row items-center mb-1">
              <Text className="text-xs text-gold">📌 Pinned</Text>
            </View>
          )}
          <Text
            style={{ fontFamily: 'Lato_700Bold' }}
            className="text-charcoal text-base mb-1"
            numberOfLines={2}
          >
            {post.title}
          </Text>
          <Text
            style={{ fontFamily: 'Lato_400Regular' }}
            className="text-charcoal/70 text-sm mb-2"
            numberOfLines={2}
          >
            {post.content}
          </Text>
          <View className="flex-row items-center">
            <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-charcoal/50 text-xs">
              {post.author?.name || 'Unknown'} · {timeAgo}
            </Text>
          </View>
        </View>
        <View className="items-end">
          <View className="flex-row items-center bg-cream px-2 py-1 rounded-full">
            <Text className="text-xs mr-1">💬</Text>
            <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-charcoal text-xs">
              {post.reply_count}
            </Text>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

function getTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return formatDateShort(date);
}
