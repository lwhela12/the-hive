import { useState } from 'react';
import { View, Text, Pressable, TextInput, Platform } from 'react-native';
import { formatDateShort } from '../../lib/dateUtils';
import type { BoardReply, Profile } from '../../types';
import { BoardReactionBar } from './BoardReactionBar';
import { AttachmentGallery } from '../ui/AttachmentGallery';
import { LinkifiedText } from '../ui/LinkifiedText';
import { Avatar } from '../ui/Avatar';
import { MemberProfileLink } from '../ui/MemberProfileLink';
import { submitOnEnter } from '../../lib/submitOnEnter';
import { usePageSkin } from '../../lib/pageSkin';

import { DictationRow } from '../ui/DictationRow';
interface BoardReplyItemProps {
  reply: BoardReply & { author?: Profile };
  currentUserId?: string;
  isNested?: boolean;
  onReact: (replyId: string, emoji: string) => void;
  onRemoveReaction: (replyId: string, emoji: string) => void;
  onReply?: (replyId: string, authorName: string) => void;
  onEdit?: (replyId: string, content: string) => void;
  onDelete?: (replyId: string) => void;
  canModerate?: boolean;
}

export function BoardReplyItem({
  reply,
  currentUserId,
  isNested = false,
  onReact,
  onRemoveReaction,
  onReply,
  onEdit,
  onDelete,
  canModerate = false,
}: BoardReplyItemProps) {
  const skin = usePageSkin();
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(reply.content);

  // Tailwind's red-500 is a hole in the black page. Same warning, lifted so it
  // reads there — pageSkin has no danger colour and it isn't mine to add.
  const dangerInk = skin.dark ? '#ff9a9a' : '#ef4444';

  const isAuthor = currentUserId === reply.author_id;
  const canManage = isAuthor || canModerate;
  const timeAgo = getTimeAgo(new Date(reply.created_at));
  const authorId = reply.author?.id ?? reply.author_id;
  const authorName = reply.author?.name || 'Unknown';

  const handleSaveEdit = () => {
    if (editContent.trim() && onEdit) {
      onEdit(reply.id, editContent.trim());
      setIsEditing(false);
    }
  };

  return (
    <View
      className={`${isNested ? 'ml-6 border-l-2 pl-4' : ''} py-3`}
      style={isNested ? { borderLeftColor: skin.border } : undefined}
    >
      <View className="flex-row items-start">
        <MemberProfileLink
          memberId={authorId}
          memberName={authorName}
          hitSlop={8}
          className="mr-3 active:opacity-70"
        >
          <Avatar name={authorName} url={reply.author?.avatar_url} size={32} />
        </MemberProfileLink>
        <View className="flex-1">
          <View className="flex-row items-center mb-1">
            <Text style={{ fontFamily: 'Lato_700Bold', color: skin.ink }} className="text-sm">
              {authorName}
            </Text>
            <Text style={{ fontFamily: 'Lato_400Regular', color: skin.inkSoft }} className="text-xs ml-2">
              {timeAgo}
            </Text>
            {reply.edited_at && (
              <Text style={{ fontFamily: 'Lato_400Regular', color: skin.inkFaint }} className="text-xs ml-1">
                (edited)
              </Text>
            )}
          </View>

          {isEditing ? (
            <View className="mb-2">
              <TextInput
                value={editContent}
                onChangeText={setEditContent}
                placeholder="Edit your reply..."
                placeholderTextColor={skin.inkFaint}
                multiline
                blurOnSubmit={Platform.OS === 'web'}
                submitBehavior={Platform.OS === 'web' ? 'submit' : 'newline'}
                returnKeyType="send"
                enterKeyHint="send"
                onSubmitEditing={handleSaveEdit}
                onKeyPress={submitOnEnter(handleSaveEdit)}
                className="rounded-lg p-3 mb-2"
                style={{
                  fontFamily: 'Lato_400Regular',
                  backgroundColor: skin.field,
                  borderWidth: 1,
                  borderColor: skin.border,
                  color: skin.ink,
                }}
              />
              <DictationRow setValue={setEditContent} />
              <View className="flex-row gap-2">
                <Pressable
                  onPress={handleSaveEdit}
                  className="px-3 py-1 rounded-lg"
                  style={{ backgroundColor: skin.gold }}
                >
                  {/* The space gold is a light gold, so white on it is a smudge.
                      The label takes the page's own colour instead. */}
                  <Text
                    style={{ fontFamily: 'Lato_700Bold', color: skin.dark ? skin.page : '#ffffff' }}
                    className="text-sm"
                  >
                    Save
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    setIsEditing(false);
                    setEditContent(reply.content);
                  }}
                  className="px-3 py-1"
                >
                  <Text style={{ fontFamily: 'Lato_400Regular', color: skin.inkSoft }} className="text-sm">
                    Cancel
                  </Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <LinkifiedText
              style={{ fontFamily: 'Lato_400Regular', fontSize: 16, color: skin.ink, marginBottom: 8 }}
              linkStyle={{ color: skin.gold }}
            >
              {reply.content}
            </LinkifiedText>
          )}

          {reply.attachments && reply.attachments.length > 0 && (
            <View className="mb-2">
              <AttachmentGallery attachments={reply.attachments} maxWidth={250} />
            </View>
          )}

          <View className="flex-row items-center gap-4 mb-2">
            <BoardReactionBar
              reactions={reply.reactions || []}
              currentUserId={currentUserId}
              onReact={(emoji) => onReact(reply.id, emoji)}
              onRemoveReaction={(emoji) => onRemoveReaction(reply.id, emoji)}
            />
          </View>

          <View className="flex-row items-center gap-4">
            {onReply && (
              <Pressable onPress={() => onReply(reply.id, reply.author?.name || 'Unknown')}>
                <Text style={{ fontFamily: 'Lato_400Regular', color: skin.gold }} className="text-sm">
                  Reply
                </Text>
              </Pressable>
            )}
            {canManage && (
              <>
                <Pressable onPress={() => setIsEditing(true)}>
                  <Text style={{ fontFamily: 'Lato_400Regular', color: skin.inkSoft }} className="text-sm">
                    Edit
                  </Text>
                </Pressable>
                <Pressable onPress={() => onDelete?.(reply.id)}>
                  <Text style={{ fontFamily: 'Lato_400Regular', color: dangerInk }} className="text-sm">
                    Delete
                  </Text>
                </Pressable>
              </>
            )}
          </View>

          {/* Nested replies */}
          {reply.nested_replies?.map((nestedReply) => (
            <BoardReplyItem
              key={nestedReply.id}
              reply={nestedReply}
              currentUserId={currentUserId}
              isNested
              onReact={onReact}
              onRemoveReaction={onRemoveReaction}
              onReply={onReply}
              onEdit={onEdit}
              onDelete={onDelete}
              canModerate={canModerate}
            />
          ))}
        </View>
      </View>
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
  if (diffMins < 60) return `${diffMins}m`;
  if (diffHours < 24) return `${diffHours}h`;
  if (diffDays < 7) return `${diffDays}d`;
  return formatDateShort(date);
}
