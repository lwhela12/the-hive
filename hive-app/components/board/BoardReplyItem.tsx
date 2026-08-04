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
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(reply.content);

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
    <View className={`${isNested ? 'ml-6 border-l-2 border-cream pl-4' : ''} py-3`}>
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
            <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-charcoal text-sm">
              {authorName}
            </Text>
            <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-charcoal/50 text-xs ml-2">
              {timeAgo}
            </Text>
            {reply.edited_at && (
              <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-charcoal/40 text-xs ml-1">
                (edited)
              </Text>
            )}
          </View>

          {isEditing ? (
            <View className="mb-2">
              <TextInput
                value={editContent}
                onChangeText={setEditContent}
                multiline
                blurOnSubmit={Platform.OS === 'web'}
                submitBehavior={Platform.OS === 'web' ? 'submit' : 'newline'}
                returnKeyType="send"
                enterKeyHint="send"
                onSubmitEditing={handleSaveEdit}
                onKeyPress={submitOnEnter(handleSaveEdit)}
                className="bg-cream rounded-lg p-3 text-charcoal mb-2"
                style={{ fontFamily: 'Lato_400Regular' }}
              />
              <DictationRow setValue={setEditContent} />
              <View className="flex-row gap-2">
                <Pressable
                  onPress={handleSaveEdit}
                  className="bg-gold px-3 py-1 rounded-lg"
                >
                  <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-white text-sm">
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
                  <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-charcoal/50 text-sm">
                    Cancel
                  </Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <LinkifiedText
              style={{ fontFamily: 'Lato_400Regular', fontSize: 16, color: '#313130', marginBottom: 8 }}
              linkStyle={{ color: '#bd9348' }}
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
                <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-gold text-sm">
                  Reply
                </Text>
              </Pressable>
            )}
            {canManage && (
              <>
                <Pressable onPress={() => setIsEditing(true)}>
                  <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-charcoal/50 text-sm">
                    Edit
                  </Text>
                </Pressable>
                <Pressable onPress={() => onDelete?.(reply.id)}>
                  <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-red-500 text-sm">
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
