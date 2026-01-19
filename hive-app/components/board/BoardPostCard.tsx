import { View, Text, Pressable, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { formatDateShort } from '../../lib/dateUtils';
import { LinkifiedText } from '../ui/LinkifiedText';
import type { BoardPost, BoardReaction, Profile } from '../../types';

interface BoardPostCardProps {
  post: BoardPost & { author?: Profile; reactions?: BoardReaction[] };
  onPress: () => void;
}

// Group reactions by emoji and count them
function getReactionCounts(reactions: BoardReaction[]): { emoji: string; count: number }[] {
  const counts = new Map<string, number>();
  reactions.forEach((r) => {
    counts.set(r.emoji, (counts.get(r.emoji) || 0) + 1);
  });
  return Array.from(counts.entries()).map(([emoji, count]) => ({ emoji, count }));
}

export function BoardPostCard({ post, onPress }: BoardPostCardProps) {
  const timeAgo = getTimeAgo(new Date(post.created_at));
  const hasAttachments = post.attachments && post.attachments.length > 0;
  const firstAttachment = hasAttachments ? post.attachments![0] : null;
  const reactionCounts = getReactionCounts(post.reactions || []);

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
          <LinkifiedText
            style={{ fontFamily: 'Lato_400Regular', fontSize: 14, color: 'rgba(49, 49, 48, 0.7)', marginBottom: 8 }}
            linkStyle={{ color: '#bd9348' }}
          >
            {post.content.length > 100 ? post.content.slice(0, 100) + '...' : post.content}
          </LinkifiedText>
          <View className="flex-row items-center">
            <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-charcoal/50 text-xs">
              {post.author?.name || 'Unknown'} · {timeAgo}
            </Text>
            {hasAttachments && (
              <View className="flex-row items-center ml-2">
                <Ionicons name="image-outline" size={12} color="#9ca3af" />
                <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-charcoal/50 text-xs ml-1">
                  {post.attachments!.length}
                </Text>
              </View>
            )}
          </View>
        </View>
        <View className="items-end gap-2">
          {firstAttachment && (
            <Image
              source={{ uri: firstAttachment.url }}
              className="w-16 h-16 rounded-lg bg-gray-100"
              resizeMode="cover"
            />
          )}
          <View className="flex-row items-center flex-wrap gap-1 justify-end">
            {reactionCounts.map(({ emoji, count }) => (
              <View key={emoji} className="flex-row items-center bg-cream px-2 py-1 rounded-full">
                <Text className="text-xs">{emoji}</Text>
                <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-charcoal text-xs ml-1">
                  {count}
                </Text>
              </View>
            ))}
            <View className="flex-row items-center bg-cream px-2 py-1 rounded-full">
              <Text className="text-xs mr-1">💬</Text>
              <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-charcoal text-xs">
                {post.reply_count}
              </Text>
            </View>
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
