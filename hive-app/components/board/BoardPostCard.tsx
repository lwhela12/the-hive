import { View, Text, Pressable } from 'react-native';
import { Image } from 'expo-image';
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

function createContentPreview(content: string, maxLength = 120): string {
  const plainText = content
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^>\s?/gm, '')
    .replace(/^[-*_]{3,}\s*$/gm, ' ')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(\*|_)(.*?)\1/g, '$2')
    .replace(/~~(.*?)~~/g, '$1')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n+/g, ' ')
    .trim();

  if (plainText.length <= maxLength) return plainText;
  return `${plainText.slice(0, maxLength).trim()}...`;
}

export function BoardPostCard({ post, onPress }: BoardPostCardProps) {
  const timeAgo = getTimeAgo(new Date(post.created_at));
  const hasAttachments = post.attachments && post.attachments.length > 0;
  const firstAttachment = hasAttachments ? post.attachments![0] : null;
  const extraCount = hasAttachments && post.attachments!.length > 1 ? post.attachments!.length - 1 : 0;
  const reactionCounts = getReactionCounts(post.reactions || []);
  const contentPreview = createContentPreview(post.content);

  return (
    <Pressable
      onPress={onPress}
      className="bg-white rounded-xl mb-3 shadow-sm active:opacity-80 overflow-hidden"
    >
      {/* Hero image — full width, tall, cover crop */}
      {firstAttachment && (
        <View style={{ position: 'relative' }}>
          <Image
            source={{ uri: firstAttachment.url }}
            style={{ width: '100%', height: 210 }}
            contentFit="cover"
            cachePolicy="memory-disk"
          />
          {extraCount > 0 && (
            <View
              style={{
                position: 'absolute',
                bottom: 8,
                right: 8,
                backgroundColor: 'rgba(0,0,0,0.55)',
                borderRadius: 12,
                paddingHorizontal: 8,
                paddingVertical: 3,
                flexDirection: 'row',
                alignItems: 'center',
              }}
            >
              <Ionicons name="images-outline" size={12} color="white" />
              <Text style={{ fontFamily: 'Lato_700Bold', color: 'white', fontSize: 12, marginLeft: 4 }}>
                +{extraCount}
              </Text>
            </View>
          )}
        </View>
      )}

      <View className="p-4">
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
          {contentPreview}
        </LinkifiedText>
        <View className="flex-row items-center justify-between">
          <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-charcoal/50 text-xs">
            {post.author?.name || 'Unknown'} · {timeAgo}
          </Text>
          <View className="flex-row items-center gap-1">
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
