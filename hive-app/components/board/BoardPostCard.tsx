import { View, Text, Pressable } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { formatDateShort } from '../../lib/dateUtils';
import { LinkifiedText } from '../ui/LinkifiedText';
import type { BoardPost, BoardReaction, Profile } from '../../types';

interface BoardPostCardProps {
  post: BoardPost & { author?: Profile; reactions?: BoardReaction[] };
  onPress: () => void;
  canEdit?: boolean;
  onEdit?: (post: BoardPost & { author?: Profile; reactions?: BoardReaction[] }) => void;
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

export function BoardPostCard({
  post,
  onPress,
  canEdit = false,
  onEdit,
}: BoardPostCardProps) {
  const timeAgo = getTimeAgo(new Date(post.created_at));
  const isCompleted = post.status === 'completed';
  const isArchived = !!post.archived_at;
  const hasAttachments = post.attachments && post.attachments.length > 0;
  const imageAttachments = hasAttachments
    ? post.attachments!.filter((attachment) => attachment.mime_type?.startsWith('image/'))
    : [];
  const firstAttachment = imageAttachments[0] || null;
  const extraCount = hasAttachments ? post.attachments!.length - 1 : 0;
  const reactionCounts = getReactionCounts(post.reactions || []);
  const contentPreview = createContentPreview(post.content);

  return (
    <View className={`relative rounded-xl mb-3 shadow-sm overflow-hidden border ${
      isArchived
        ? 'bg-charcoal/5 border-charcoal/10'
        : isCompleted ? 'bg-gold/5 border-gold/30' : 'bg-white border-white'
    }`}>
      <Pressable onPress={onPress} className="active:opacity-80">
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

        <View className={`p-4 ${canEdit && onEdit ? 'pr-14' : ''}`}>
          {(post.is_pinned || isCompleted || isArchived) && (
            <View className="flex-row items-center mb-2" style={{ gap: 6 }}>
              {post.is_pinned && (
                <Text className="text-xs text-gold">📌 Pinned</Text>
              )}
              {isCompleted && (
                <View className="flex-row items-center bg-gold rounded-full px-2 py-0.5">
                  <Ionicons name="checkmark-circle-outline" size={12} color="white" />
                  <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-white text-xs ml-1">
                    Granted
                  </Text>
                </View>
              )}
              {isArchived && (
                <View className="flex-row items-center bg-charcoal/10 rounded-full px-2 py-0.5">
                  <Ionicons name="archive-outline" size={12} color="rgba(49,49,48,0.58)" />
                  <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-charcoal/60 text-xs ml-1">
                    Archived
                  </Text>
                </View>
              )}
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
              {hasAttachments && !firstAttachment && (
                <View className="flex-row items-center bg-cream px-2 py-1 rounded-full">
                  <Ionicons name="attach-outline" size={12} color="#bd9348" />
                  <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-charcoal text-xs ml-1">
                    {post.attachments!.length}
                  </Text>
                </View>
              )}
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
      {canEdit && onEdit && (
        <Pressable
          onPress={() => onEdit(post)}
          accessibilityRole="button"
          accessibilityLabel="Edit thread"
          hitSlop={8}
          className="absolute top-3 right-3 w-8 h-8 rounded-full items-center justify-center bg-white/90 border border-gold/20 active:opacity-70"
          style={{ zIndex: 2 }}
        >
          <Ionicons name="pencil-outline" size={16} color="#4A4A4A" />
        </Pressable>
      )}
    </View>
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
