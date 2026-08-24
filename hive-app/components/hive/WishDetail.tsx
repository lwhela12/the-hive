import { useState, useEffect, useMemo } from 'react';
import { usePageSkin } from '../../lib/pageSkin';
import { SpaceBackdrop } from '../ui/SpaceBackdrop';
import { BounceScrollView } from '../ui/BounceScrollView';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { EditButton } from '../ui/EditButton';
import { BackButton } from '../ui/BackButton';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/hooks/useAuth';
import { Avatar } from '../ui/Avatar';
import { MemberProfileLink } from '../ui/MemberProfileLink';
import { formatDateShort } from '../../lib/dateUtils';
import { GrantWishModal } from './GrantWishModal';
import { getWishDetailText, getWishQuickTitle, shouldShowWishDescription } from '../../lib/wishDisplay';
import { useMentionableMembers, useMentionReach } from '../../lib/hooks/useMentionableMembers';
import { notifyWishMentions } from '../../lib/wishMentions';
import { confirmAction, showAlert } from '../../lib/showAlert';
import { LinkifiedText } from '../ui/LinkifiedText';
import { AttachmentGallery } from '../ui/AttachmentGallery';
import { ReachPill } from '../ui/ReachPill';
import { WishCommentItem, type WishCommentNode } from './WishCommentItem';
import { getFirstName } from '../../lib/hooks/useArrivalBoard';
import type { Attachment, Wish, Profile, WishComment, WishGranter } from '../../types';

import { ComposerBar } from '../ui/ComposerBar';
import { uploadAttachments } from '../../lib/attachmentUpload';
import type { SelectedImage } from '../../lib/imagePicker';
import type { SelectedFile } from '../../lib/filePicker';
import { ThinkingBee } from '../ui/ThinkingBee';
type WishWithGranters = Wish & {
  user?: Profile | null;
  granters?: (WishGranter & { granter?: Profile })[];
};

type WishCommentWithUser = WishComment & { user?: Profile | null };

interface WishDetailProps {
  wish: WishWithGranters;
  onClose: () => void;
  onGrant?: (data: {
    wishId: string;
    granterIds: string[];
    thankYouMessage?: string;
  }) => Promise<{ error: Error | null }>;
  canManage?: boolean;
  onManage?: () => void;
  onBeforeProfileNavigate?: () => void;
}

export function WishDetail({
  wish,
  onClose,
  onGrant,
  canManage = false,
  onManage,
  onBeforeProfileNavigate,
}: WishDetailProps) {
  const { profile, communityId } = useAuth();
  const skin = usePageSkin();
  const [comments, setComments] = useState<WishCommentWithUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [newComment, setNewComment] = useState('');
  const [commentImages, setCommentImages] = useState<SelectedImage[]>([]);
  const [commentFiles, setCommentFiles] = useState<SelectedFile[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [showGrantModal, setShowGrantModal] = useState(false);
  const [replyingTo, setReplyingTo] = useState<{ id: string; authorName: string } | null>(null);
  const { members: mentionableMembers, loading: mentionMembersLoading } = useMentionableMembers(communityId);
  // A comment reaches the people who can read the wish, so the wish's own share
  // scope is what "everyone" means in the comment box.
  const mentionReach = useMentionReach({ reach: wish.share_scope });

  // Check if this is the user's own wish and can be granted
  const isOwnWish = profile?.id === wish.user_id;
  const canGrant = isOwnWish && wish.status === 'public' && onGrant;
  const isGranted = wish.status === 'fulfilled';
  const wishTitle = getWishQuickTitle(wish, 90);
  const wishDetailText = getWishDetailText(wish);
  const showDescription = shouldShowWishDescription(wish);
  const wishOwnerId = wish.user?.id ?? wish.user_id;
  const wishOwnerName = wish.user?.name?.trim() || 'HIVE member';
  const wishOwnerAvatarUrl = wish.user?.avatar_url;
  const handleBeforeProfileNavigate = onBeforeProfileNavigate ?? onClose;

  useEffect(() => {
    fetchComments();
  }, [wish.id]);

  const fetchComments = async () => {
    try {
      const { data, error } = await (supabase as any)
        .from('wish_comments')
        // Comment author only ever renders as an avatar + name here and in
        // WishCommentItem (id/name/avatar_url) — narrowed 2026-08-11, same
        // fix as the reaction author join right beside it, which already had
        // this shape.
        .select('*, user:profiles!user_id(id, name, avatar_url), reactions:wish_comment_reactions(*, user:profiles!user_id(id, name, avatar_url))')
        .eq('wish_id', wish.id)
        .is('archived_at', null)
        .order('created_at', { ascending: true });

      if (error) throw error;
      setComments((data as WishCommentWithUser[]) || []);
    } catch (error) {
      console.error('Error fetching comments:', error);
    } finally {
      setLoading(false);
    }
  };

  // Flat rows -> parent/child tree, same shape BoardPostDetail builds.
  const commentTree = useMemo(() => {
    const nodeMap = new Map<string, WishCommentNode>();
    comments.forEach((comment) => {
      nodeMap.set(comment.id, { ...comment, nested_replies: [] });
    });

    const roots: WishCommentNode[] = [];
    nodeMap.forEach((node) => {
      const parent = node.parent_comment_id ? nodeMap.get(node.parent_comment_id) : null;
      if (parent) {
        parent.nested_replies!.push(node);
      } else {
        roots.push(node);
      }
    });
    return roots;
  }, [comments]);

  const handleSubmitComment = async () => {
    if (!newComment.trim() || !profile || !communityId) return;

    setSubmitting(true);
    try {
      // The paperclip has been on this bar since it was rebuilt, and what it
      // picked never went anywhere — the insert below simply did not carry the
      // photos, so they vanished on send. Uploaded the same way board posts do.
      let attachments: Attachment[] | undefined;
      if (commentImages.length > 0 || commentFiles.length > 0) {
        const outcome = await uploadAttachments({
          userId: profile.id,
          images: commentImages,
          files: commentFiles,
        });

        // Every attachment failed. `uploadAttachments` has already said so, and
        // stopping here keeps the comment and its pictures in the box to retry.
        if (!outcome.readyToSend) return;
        attachments = outcome.attachments;
      }

      const { data, error } = await supabase
        .from('wish_comments')
        .insert({
          wish_id: wish.id,
          user_id: profile.id,
          community_id: communityId,
          content: newComment.trim(),
          parent_comment_id: replyingTo?.id ?? null,
          attachments: attachments ?? null,
        })
        // Same narrowing as the fetch above — this comment's own author only
        // ever renders as an avatar + name.
        .select('*, user:profiles!user_id(id, name, avatar_url)')
        .single();

      if (error) throw error;

      setComments((prev) => [...prev, { ...(data as WishCommentWithUser), reactions: [] }]);
      notifyWishMentions({
        wishId: wish.id,
        senderId: profile.id,
        communityId,
        content: newComment.trim(),
        members: mentionableMembers,
        reach: mentionReach,
        wishOwnerName,
      });
      setNewComment('');
      setCommentImages([]);
      setCommentFiles([]);
      setReplyingTo(null);
    } catch (error) {
      console.error('Error submitting comment:', error);
      // The comment box emptied itself and the comment was nowhere, with the
      // reason sitting in a console nobody has open.
      showAlert('Comment not posted', 'That comment did not go through. Try again in a moment.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReplyTo = (commentId: string, authorName: string) => {
    setReplyingTo({ id: commentId, authorName });
    // Prefill the @mention so the reply notifies its target through the
    // normal mention pipeline (skip if they're already typing something).
    if (!newComment.trim()) {
      setNewComment(`@${getFirstName(authorName)} `);
    }
  };

  const handleEditComment = async (commentId: string, content: string) => {
    const editedAt = new Date().toISOString();
    const { error } = await supabase
      .from('wish_comments')
      .update({ content, edited_at: editedAt })
      .eq('id', commentId);
    if (error) {
      console.error('Error editing comment:', error);
      return;
    }
    setComments((prev) =>
      prev.map((comment) =>
        comment.id === commentId ? { ...comment, content, edited_at: editedAt } : comment
      )
    );
  };

  const handleDeleteComment = (comment: WishCommentNode) => {
    const hasReplies = (comment.nested_replies?.length ?? 0) > 0;
    const message = hasReplies
      ? 'This will also remove its replies. This cannot be undone.'
      : 'This cannot be undone.';

    const performDelete = async () => {
      const { error } = await supabase.from('wish_comments').delete().eq('id', comment.id);
      if (error) {
        console.error('Error deleting comment:', error);
        return;
      }
      // Mirror the DB cascade locally: drop the comment and every descendant.
      setComments((prev) => {
        const removed = new Set([comment.id]);
        let grew = true;
        while (grew) {
          grew = false;
          prev.forEach((row) => {
            if (row.parent_comment_id && removed.has(row.parent_comment_id) && !removed.has(row.id)) {
              removed.add(row.id);
              grew = true;
            }
          });
        }
        return prev.filter((row) => !removed.has(row.id));
      });
      setReplyingTo((current) => (current?.id === comment.id ? null : current));
    };

    confirmAction({
      title: 'Delete this comment?',
      message,
      confirmLabel: 'Delete',
      destructive: true,
      onConfirm: performDelete,
    });
  };

  const handleReact = async (commentId: string, emoji: string) => {
    if (!profile || !communityId) return;
    const { data, error } = await supabase
      .from('wish_comment_reactions')
      .insert({
        community_id: communityId,
        comment_id: commentId,
        user_id: profile.id,
        emoji,
      })
      .select('*')
      .single();
    if (error) {
      // Unique violation = already reacted with this emoji; nothing to do.
      if (error.code !== '23505') console.error('Error adding reaction:', error);
      return;
    }
    const reaction = {
      ...data,
      user: { id: profile.id, name: profile.name, avatar_url: profile.avatar_url },
    };
    setComments((prev) =>
      prev.map((comment) =>
        comment.id === commentId
          ? { ...comment, reactions: [...(comment.reactions ?? []), reaction] }
          : comment
      )
    );
  };

  const handleRemoveReaction = async (commentId: string, emoji: string) => {
    if (!profile) return;
    const { error } = await supabase
      .from('wish_comment_reactions')
      .delete()
      .eq('comment_id', commentId)
      .eq('user_id', profile.id)
      .eq('emoji', emoji);
    if (error) {
      console.error('Error removing reaction:', error);
      return;
    }
    setComments((prev) =>
      prev.map((comment) =>
        comment.id === commentId
          ? {
              ...comment,
              reactions: (comment.reactions ?? []).filter(
                (reaction) => !(reaction.user_id === profile.id && reaction.emoji === emoji)
              ),
            }
          : comment
      )
    );
  };

  return (
    <KeyboardAvoidingView
      // `bg-white` until 2026-08-11 — this is a full-page view (it replaces
      // the whole board screen, not a floating sheet), so at HIVE-Wide it was
      // an unbroken white page in the middle of the space theme. The page now
      // wears the skin and the sky; the wish's own cards below deliberately
      // stay light — readable panels floating on space, same as the wide
      // layout's cards — rather than getting the full dark re-skin Nat has
      // explicitly parked as an open decision for the fixed-light modals.
      className="flex-1"
      style={{ backgroundColor: skin.page }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <SpaceBackdrop />
      {/* Header */}
      <View
        className="flex-row items-center justify-between px-4 py-3 border-b"
        style={{ borderBottomColor: 'rgba(222,193,129,0.5)' }}
      >
        <BackButton onPress={onClose} color={skin.ink} style={{ marginLeft: -8 }} />
        <Text style={{ fontFamily: 'Lato_700Bold', color: skin.ink }} className="text-lg">
          Wish Details
        </Text>
        {canManage && onManage ? (
          <EditButton onPress={onManage} accessibilityLabel="Manage wish" size={34} />
        ) : (
          <View className="w-10" />
        )}
      </View>

      {/* Reading-width frame — without it the wish sprawls edge-to-edge on
          wide screens and the whole page feels unmoored. */}
      <BounceScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 16, maxWidth: 840, width: '100%', alignSelf: 'center' }}
      >
        {/* Wish Card.
            The whole card opens the editor, not just the pencil up in the
            corner (Nat 2026-08-04: "i'd like to be able to click the wish to
            edit it, not just have to click the pencil"). The pencil stays —
            it is what tells you the card is editable at all — but reaching for
            a 34px target in the far corner to change your own words was the
            long way round. Only for people who can actually manage it; for
            everybody else this is still just text. */}
        <Pressable
          disabled={!canManage || !onManage}
          onPress={() => onManage?.()}
          accessibilityRole={canManage && onManage ? 'button' : undefined}
          accessibilityLabel={canManage && onManage ? 'Edit this wish' : undefined}
          className={`rounded-2xl p-4 mb-6 border ${
            isGranted ? 'bg-gold/10 border-gold/25' : 'bg-[#fdf8ec] border-gold/20'
          }`}
          style={({ pressed }) => ({ opacity: pressed && canManage ? 0.86 : 1 })}
        >
          <View className="flex-row items-start">
            <MemberProfileLink
              memberId={wishOwnerId}
              memberName={wishOwnerName}
              onBeforeNavigate={handleBeforeProfileNavigate}
              hitSlop={8}
              className="active:opacity-70"
            >
              <Avatar name={wishOwnerName} url={wishOwnerAvatarUrl} size={48} />
            </MemberProfileLink>
            <View className="flex-1 ml-3">
              <View className="flex-row items-center">
                <MemberProfileLink
                  memberId={wishOwnerId}
                  memberName={wishOwnerName}
                  onBeforeNavigate={handleBeforeProfileNavigate}
                  hitSlop={8}
                  className="active:opacity-70"
                >
                  <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-charcoal text-base">
                    {wishOwnerName}
                  </Text>
                </MemberProfileLink>
                {isGranted && (
                  <View className="ml-2 bg-gold px-2 py-0.5 rounded-full flex-row items-center">
                    <Ionicons name="checkmark-circle" size={12} color="#fff" />
                    <Text
                      style={{ fontFamily: 'Lato_700Bold' }}
                      className="text-white text-xs ml-1"
                    >
                      Granted
                    </Text>
                  </View>
                )}
              </View>
              <Text
                style={{ fontFamily: 'Lato_700Bold', color: '#2d2d2d', marginTop: 8, fontSize: 20, lineHeight: 26 }}
              >
                {wishTitle}
              </Text>
              {showDescription && (
                <LinkifiedText
                  style={{ fontFamily: 'Lato_400Regular', color: 'rgba(49,49,48,0.8)', marginTop: 8, fontSize: 16, lineHeight: 23 }}
                  mentionStyle={{ color: '#1d4ed8', backgroundColor: 'rgba(37,99,235,0.1)' }}
                >
                  {wishDetailText}
                </LinkifiedText>
              )}
              {/* The picture that came with the ask.
                  Nat asked for a paperclip on the wish composer; migration 149
                  gave the wish somewhere to keep what it picks up. It sits with
                  the ask rather than under it, which is the whole difference
                  between showing the broken fence and replying to yourself with
                  a photo of it. Renders through AttachmentGallery, so it goes
                  via SignedImage — the bucket is private. */}
              {Array.isArray((wish as { attachments?: Attachment[] }).attachments)
                && ((wish as { attachments?: Attachment[] }).attachments?.length ?? 0) > 0 ? (
                <View style={{ marginTop: 10 }}>
                  <AttachmentGallery
                    attachments={(wish as { attachments?: Attachment[] }).attachments ?? []}
                  />
                </View>
              ) : null}
              {/* How far this wish travels, said where the eye already is.
                  Until now this page showed the wish, its comments and a grant
                  button and nothing at all about who can read it — so a wish
                  every HIVE can see looked exactly like one that stays home
                  (Nat 2026-08-05: "this page should make it obvious what the
                  visibility of the wish is"). It rides with the date rather
                  than sitting at the bottom, because that line is already
                  where you look for "when, and whose".

                  The hexagon carries the wish's OWN HIVE colour — `community_id`,
                  not whichever HIVE you happen to be standing in — so opening a
                  wish from HIVE-Wide tells you which HIVE it came from. The
                  caption names the question the chip answers. */}
              <View className="flex-row items-center flex-wrap mt-2" style={{ gap: 8 }}>
                <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-xs text-charcoal/40">
                  {formatDateShort(wish.created_at)}
                  {isGranted && wish.fulfilled_at && (
                    <Text> · Granted {formatDateShort(wish.fulfilled_at)}</Text>
                  )}
                </Text>
                <ReachPill
                  reach={wish.share_scope === 'all_hives' ? 'all_hives' : 'hive'}
                  communityId={wish.community_id}
                  size="sm"
                />
              </View>
            </View>
          </View>
        </Pressable>

        {/* Granted Info Section */}
        {isGranted && (
          <View className="mb-6">
            {/* Granters */}
            {wish.granters && wish.granters.length > 0 && (
              <View className="bg-white rounded-xl p-4 mb-4 border border-gold/20">
                <Text
                  style={{ fontFamily: 'Lato_700Bold' }}
                  className="text-charcoal text-sm mb-3"
                >
                  Granted by
                </Text>
                <View className="flex-row flex-wrap gap-2">
                  {wish.granters.filter((g) => g.granter).map((g) => (
                    <MemberProfileLink
                      key={g.id}
                      memberId={g.granter?.id ?? g.granter_id}
                      memberName={g.granter?.name}
                      onBeforeNavigate={handleBeforeProfileNavigate}
                      hitSlop={4}
                      className="flex-row items-center bg-cream px-3 py-2 rounded-full"
                    >
                      <Avatar
                        name={g.granter?.name || 'Unknown'}
                        url={g.granter?.avatar_url}
                        size={24}
                      />
                      <Text
                        style={{ fontFamily: 'Lato_700Bold' }}
                        className="text-charcoal text-sm ml-2"
                      >
                        {g.granter?.name || 'Unknown'}
                      </Text>
                    </MemberProfileLink>
                  ))}
                </View>
              </View>
            )}

            {/* Thank You Message */}
            {wish.thank_you_message && (
              <View className="bg-gold/10 rounded-xl p-4 border border-gold/20">
                <View className="flex-row items-center mb-2">
                  <Ionicons name="heart" size={16} color="#bd9348" />
                  <Text
                    style={{ fontFamily: 'Lato_700Bold' }}
                    className="text-gold text-sm ml-2"
                  >
                    Thank you from {wishOwnerName}
                  </Text>
                </View>
                <Text
                  style={{ fontFamily: 'Lato_400Regular', color: 'rgba(49,49,48,0.8)', marginTop: 4 }}
                  className="text-charcoal/80 text-base italic"
                >
                  "{wish.thank_you_message}"
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Comments Section */}
        <Text
          style={{ fontFamily: 'Lato_700Bold', letterSpacing: 0.8 }}
          className="text-xs uppercase text-[#8e7a5e] mb-2"
        >
          Comments ({comments.length})
        </Text>

        {loading ? (
          <ThinkingBee />
        ) : commentTree.length === 0 ? (
          <View className="py-8 items-center">
            <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-charcoal/50">
              No comments yet. Be the first to reply!
            </Text>
          </View>
        ) : (
          commentTree.map((comment) => (
            <WishCommentItem
              key={comment.id}
              comment={comment}
              currentUserId={profile?.id}
              onReact={handleReact}
              onRemoveReaction={handleRemoveReaction}
              onReply={handleReplyTo}
              onEdit={handleEditComment}
              onDelete={handleDeleteComment}
              onBeforeProfileNavigate={handleBeforeProfileNavigate}
            />
          ))
        )}
      </BounceScrollView>

      {/* Mark as HD Granted Button (for own public wishes) */}
      {canGrant && (
        <View className="border-t border-gray-100 px-4 py-3">
          <Pressable
            onPress={() => setShowGrantModal(true)}
            className="bg-gold py-3 rounded-xl flex-row items-center justify-center active:bg-gold/80"
            style={{ maxWidth: 840, width: '100%', alignSelf: 'center' }}
          >
            <Ionicons name="checkmark-circle" size={20} color="#fff" />
            <Text
              style={{ fontFamily: 'Lato_700Bold' }}
              className="text-white text-base ml-2"
            >
              Mark as HD Granted
            </Text>
          </Pressable>
        </View>
      )}

      {/* Comment Input */}
      <View className="border-t px-4 py-3" style={{ borderTopColor: 'rgba(222,193,129,0.5)' }}>
        <View style={{ maxWidth: 840, width: '100%', alignSelf: 'center' }}>
        {/* The gold standard bar itself, not a copy of it (Nat 2026-08-05:
            "we want to make sure it looks like that everywhere all the time").
            This used to be a hand-built pill that had drifted three ways at
            once. Everything it did — the paperclip, @ tagging, dictation, Enter
            to send — is what the shared bar does, so it is the shared bar now.
            The "Replying to Nat" chip rides above it as the bar's header. */}
        <ComposerBar
          variant="chat"
          tone="light"
          containerClassName="mb-3"
          value={newComment}
          onChangeText={setNewComment}
          placeholder={replyingTo ? 'Write your reply...' : 'Write a comment...'}
          onSubmit={handleSubmitComment}
          submitting={submitting}
          attachments="compact"
          selectedImages={commentImages}
          onImagesChange={setCommentImages}
          selectedFiles={commentFiles}
          onFilesChange={setCommentFiles}
          mentionMembers={mentionableMembers}
          mentionsLoading={mentionMembersLoading}
          mentionReach={mentionReach}
          currentUserId={profile?.id}
          header={replyingTo ? (
            <View className="flex-row items-center mb-2 bg-gold/10 border border-gold/25 rounded-full px-3 py-1.5 self-start">
              <Ionicons name="return-down-forward-outline" size={14} color="#bd9348" />
              <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-[#8e6f35] text-xs ml-1.5">
                Replying to {getFirstName(replyingTo.authorName)}
              </Text>
              <Pressable
                onPress={() => setReplyingTo(null)}
                hitSlop={8}
                className="ml-2"
                accessibilityLabel="Cancel reply"
              >
                <Ionicons name="close" size={14} color="#8e7a5e" />
              </Pressable>
            </View>
          ) : null}
        />
        </View>
      </View>

      {/* Grant Wish Modal */}
      {onGrant && (
        <GrantWishModal
          visible={showGrantModal}
          onClose={() => setShowGrantModal(false)}
          wish={wish}
          communityId={communityId}
          onGrant={async (data) => {
            const result = await onGrant(data);
            if (!result.error) {
              onClose(); // Close detail view after granting
            }
            return result;
          }}
        />
      )}
    </KeyboardAvoidingView>
  );
}
