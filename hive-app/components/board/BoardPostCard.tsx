import { View, Text, Pressable } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { EditButton } from '../ui/EditButton';
import { formatDateShort } from '../../lib/dateUtils';
import { isVideoAttachment } from '../../lib/mediaAttachments';
import { LinkifiedText } from '../ui/LinkifiedText';
import { getReactionGroups, HiveReactionPills } from '../ui/HiveReactions';
import { Avatar } from '../ui/Avatar';
import { MemberProfileLink } from '../ui/MemberProfileLink';
import type { BoardPost, BoardReaction, Profile } from '../../types';

import { SignedImage } from '../ui/SignedImage';
interface BoardPostCardProps {
  post: BoardPost & { author?: Profile; reactions?: BoardReaction[] };
  onPress: () => void;
  canEdit?: boolean;
  onEdit?: (post: BoardPost & { author?: Profile; reactions?: BoardReaction[] }) => void;
  compactImages?: boolean;
  linkedWishLabel?: string;
  onLinkedWishPress?: () => void;
  currentUserId?: string;
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
  compactImages = false,
  linkedWishLabel,
  onLinkedWishPress,
  currentUserId,
}: BoardPostCardProps) {
  const timeAgo = getTimeAgo(new Date(post.created_at));
  const isCompleted = post.status === 'completed';
  const isArchived = !!post.archived_at;
  const hasAttachments = post.attachments && post.attachments.length > 0;
  const previewAttachments = hasAttachments
    ? post.attachments!.filter((attachment) => attachment.mime_type?.startsWith('image/') || isVideoAttachment(attachment))
    : [];
  const firstAttachment = previewAttachments[0] || null;
  const isVideoPreview = firstAttachment ? isVideoAttachment(firstAttachment) : false;
  const extraCount = hasAttachments ? post.attachments!.length - 1 : 0;
  const reactionGroups = getReactionGroups(post.reactions || [], currentUserId);
  const contentPreview = createContentPreview(post.content);
  const useCompactImage = compactImages && !!firstAttachment;
  const imageStyle = useCompactImage
    ? { width: 176, height: 132 }
    : { width: '100%' as const, height: 210 };
  const authorId = post.author?.id ?? post.author_id;
  const authorName = post.author?.name || 'Unknown';

  return (
    <View className={`relative rounded-xl mb-3 shadow-sm overflow-hidden border ${
      isArchived
        ? 'bg-charcoal/5 border-charcoal/10'
        : isCompleted ? 'bg-gold/5 border-gold/30' : 'bg-white border-white'
    }`}>
      <Pressable onPress={onPress} className="active:opacity-80">
        <View style={useCompactImage ? { flexDirection: 'row', alignItems: 'stretch' } : undefined}>
          {firstAttachment && (
            <View style={{ position: 'relative', flexShrink: 0 }}>
              {isVideoPreview ? (
                <View
                  style={[imageStyle, { backgroundColor: '#313130', alignItems: 'center', justifyContent: 'center' }]}
                >
                  <Ionicons name="play-circle" size={42} color="#f6f4e5" />
                  <Text style={{ fontFamily: 'Lato_700Bold', color: '#f6f4e5', fontSize: 12, marginTop: 4 }}>
                    Video clip
                  </Text>
                </View>
              ) : (
                <SignedImage
                  uri={firstAttachment.url}
                  style={imageStyle}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                />
              )}
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
                  <Ionicons name={isVideoPreview ? 'film-outline' : 'images-outline'} size={12} color="white" />
                  <Text style={{ fontFamily: 'Lato_700Bold', color: 'white', fontSize: 12, marginLeft: 4 }}>
                    +{extraCount}
                  </Text>
                </View>
              )}
            </View>
          )}

          <View
            className={`p-4 ${canEdit && onEdit ? 'pr-14' : ''}`}
            style={useCompactImage ? { flex: 1, minHeight: 132 } : undefined}
          >
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
              style={{
                fontFamily: 'Lato_400Regular',
                fontSize: 14,
                color: 'rgba(49, 49, 48, 0.7)',
                marginBottom: linkedWishLabel ? 6 : 8,
              }}
              linkStyle={{ color: '#bd9348' }}
            >
              {contentPreview}
            </LinkifiedText>
            {linkedWishLabel && (
              <Pressable
                onPress={(event) => {
                  event.stopPropagation();
                  onLinkedWishPress?.();
                }}
                disabled={!onLinkedWishPress}
                className="self-start flex-row items-center bg-cream/75 border border-gold/20 rounded-full px-2 py-1 mb-2 active:opacity-70"
                accessibilityRole={onLinkedWishPress ? 'button' : undefined}
                accessibilityLabel={linkedWishLabel}
              >
                <Ionicons name="link-outline" size={12} color="#bd9348" />
                <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-gold text-xs ml-1">
                  {linkedWishLabel}
                </Text>
              </Pressable>
            )}
            <View className="flex-row items-center justify-between">
              <View className="flex-row items-center flex-1 mr-2">
                <MemberProfileLink
                  memberId={authorId}
                  memberName={authorName}
                  stopPropagation
                  hitSlop={8}
                  className="active:opacity-70 mr-2"
                >
                  <Avatar name={authorName} url={post.author?.avatar_url} size={24} />
                </MemberProfileLink>
                <Text
                  style={{ fontFamily: 'Lato_400Regular' }}
                  className="text-charcoal/50 text-xs flex-1"
                  numberOfLines={1}
                >
                  {authorName} · {timeAgo}
                </Text>
              </View>
              <View className="flex-row items-center gap-1">
                {hasAttachments && !firstAttachment && (
                  <View className="flex-row items-center bg-cream px-2 py-1 rounded-full">
                    <Ionicons name="attach-outline" size={12} color="#bd9348" />
                    <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-charcoal text-xs ml-1">
                      {post.attachments!.length}
                    </Text>
                  </View>
                )}

                <View className="flex-row items-center bg-cream px-2 py-1 rounded-full">
                  <Text className="text-xs mr-1">💬</Text>
                  <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-charcoal text-xs">
                    {post.reply_count}
                  </Text>
                </View>
              </View>
            </View>
          </View>
        </View>
      </Pressable>
      {reactionGroups.length > 0 && (
        <View
          style={{
            position: 'absolute',
            top: 8,
            right: canEdit && onEdit ? 52 : 12,
            zIndex: 3,
            maxWidth: '72%',
          }}
          pointerEvents="box-none"
        >
          <HiveReactionPills groups={reactionGroups} compact />
        </View>
      )}
      {canEdit && onEdit && (
        <EditButton
          onPress={() => onEdit(post)}
          accessibilityLabel="Edit thread"
          style={{ position: 'absolute', top: 12, right: 12, zIndex: 2 }}
        />
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
