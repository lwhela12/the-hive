import { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { formatDateShort } from '../../lib/dateUtils';
import type { Profile, WishComment } from '../../types';
import { BoardReactionBar } from '../board/BoardReactionBar';
import { AttachmentGallery } from '../ui/AttachmentGallery';
import { LinkifiedText } from '../ui/LinkifiedText';
import { Avatar } from '../ui/Avatar';
import { MemberProfileLink } from '../ui/MemberProfileLink';
import { ComposerBar } from '../ui/ComposerBar';

export type WishCommentNode = WishComment & {
  user?: Profile | null;
  nested_replies?: WishCommentNode[];
};

interface WishCommentItemProps {
  comment: WishCommentNode;
  currentUserId?: string;
  isNested?: boolean;
  onReact: (commentId: string, emoji: string) => void;
  onRemoveReaction: (commentId: string, emoji: string) => void;
  onReply: (commentId: string, authorName: string) => void;
  onEdit: (commentId: string, content: string) => void;
  onDelete: (comment: WishCommentNode) => void;
  onBeforeProfileNavigate?: () => void;
}

// Same thread grammar as BoardReplyItem — reactions, Reply, Edit/Delete,
// one indented rail per reply level — so boards and wishes feel like one app.
export function WishCommentItem({
  comment,
  currentUserId,
  isNested = false,
  onReact,
  onRemoveReaction,
  onReply,
  onEdit,
  onDelete,
  onBeforeProfileNavigate,
}: WishCommentItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(comment.content);

  const isAuthor = currentUserId === comment.user_id;
  const timeAgo = getTimeAgo(new Date(comment.created_at));
  const authorId = comment.user?.id ?? comment.user_id;
  const authorName = comment.user?.name?.trim() || 'HIVE member';
  const attachments = Array.isArray(comment.attachments) ? comment.attachments : [];

  const handleSaveEdit = () => {
    if (editContent.trim()) {
      onEdit(comment.id, editContent.trim());
      setIsEditing(false);
    }
  };

  return (
    <View className={`${isNested ? 'ml-5 border-l-2 border-gold/20 pl-3' : ''} py-2.5`}>
      <View className="flex-row items-start">
        <MemberProfileLink
          memberId={authorId}
          memberName={authorName}
          onBeforeNavigate={onBeforeProfileNavigate}
          hitSlop={8}
          className="mr-3 active:opacity-70"
        >
          <Avatar name={authorName} url={comment.user?.avatar_url} size={isNested ? 28 : 34} />
        </MemberProfileLink>
        <View className="flex-1">
          <View className="flex-row items-center mb-1">
            <MemberProfileLink
              memberId={authorId}
              memberName={authorName}
              onBeforeNavigate={onBeforeProfileNavigate}
              hitSlop={8}
              className="active:opacity-70"
            >
              <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-charcoal text-sm">
                {authorName}
              </Text>
            </MemberProfileLink>
            <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-charcoal/50 text-xs ml-2">
              {timeAgo}
            </Text>
            {comment.edited_at && (
              <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-charcoal/40 text-xs ml-1">
                (edited)
              </Text>
            )}
          </View>

          {isEditing ? (
            /* Changing your own words in place — the shared box wearing its
               edit clothes. The mic, the Save and the Cancel all sit on one
               strip inside the box's own border, so an edit looks like every
               other place in the app you write something. */
            <ComposerBar
              variant="inlineEdit"
              tone="light"
              containerClassName="mb-2"
              value={editContent}
              onChangeText={setEditContent}
              placeholder="Edit your comment..."
              minHeight={64}
              autoFocus
              onSubmit={handleSaveEdit}
              onCancel={() => {
                setIsEditing(false);
                setEditContent(comment.content);
              }}
              submitLabel="Save"
            />
          ) : (
            <LinkifiedText
              style={{ fontFamily: 'Lato_400Regular', fontSize: 16, color: '#313130', marginBottom: 8 }}
              linkStyle={{ color: '#bd9348' }}
              mentionStyle={{ color: '#1d4ed8', backgroundColor: 'rgba(37,99,235,0.1)' }}
            >
              {comment.content}
            </LinkifiedText>
          )}

          {attachments.length > 0 && (
            <View className="mb-2">
              <AttachmentGallery attachments={attachments} maxWidth={250} />
            </View>
          )}

          <View className="flex-row items-center gap-4 mb-1">
            <BoardReactionBar
              reactions={comment.reactions || []}
              currentUserId={currentUserId}
              onReact={(emoji) => onReact(comment.id, emoji)}
              onRemoveReaction={(emoji) => onRemoveReaction(comment.id, emoji)}
              compact
            />
          </View>

          <View className="flex-row items-center gap-4">
            <Pressable onPress={() => onReply(comment.id, authorName)}>
              <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-gold text-sm">
                Reply
              </Text>
            </Pressable>
            {isAuthor && !isEditing && (
              <>
                <Pressable onPress={() => setIsEditing(true)}>
                  <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-charcoal/50 text-sm">
                    Edit
                  </Text>
                </Pressable>
                <Pressable onPress={() => onDelete(comment)}>
                  <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-red-500 text-sm">
                    Delete
                  </Text>
                </Pressable>
              </>
            )}
          </View>

          {comment.nested_replies?.map((nested) => (
            <WishCommentItem
              key={nested.id}
              comment={nested}
              currentUserId={currentUserId}
              isNested
              onReact={onReact}
              onRemoveReaction={onRemoveReaction}
              onReply={onReply}
              onEdit={onEdit}
              onDelete={onDelete}
              onBeforeProfileNavigate={onBeforeProfileNavigate}
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
