import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  Image,
  ScrollView,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/hooks/useAuth';
import { useRoomMessagesQuery } from '../../lib/hooks/useRoomMessagesQuery';
import { queryKeys } from '../../lib/queryClient';

const hiveLogo = require('../../assets/HIVE Logo Transparent  BG.png');
import { RoomMessageItem } from './RoomMessageItem';
import { RoomTypingIndicator } from './RoomTypingIndicator';
import { SelectedImage, pickSingleImage } from '../../lib/imagePicker';
import { SelectedFile } from '../../lib/filePicker';
import { uploadAttachments, uploadSingleImage } from '../../lib/attachmentUpload';
import { getMentionedMembers } from '../../lib/mentions';
import { hiveDisplayName } from '../../lib/hiveBrand';
import { getMessagesRoomLabel, getMessagesRoomSubtitle } from './hiveWideRoom';
import { useMentionableMembers } from '../../lib/hooks/useMentionableMembers';
import { usePersistentTextDraft } from '../../lib/hooks/usePersistentTextDraft';
import { Avatar } from '../ui/Avatar';
import { ComposerBar } from '../ui/ComposerBar';
import { FIELD_LOOK } from '../ui/Input';
import { MemberProfileLink } from '../ui/MemberProfileLink';
import {
  CHAT_ROOM_THEMES,
  ChatRoomThemeKey,
  getChatRoomTheme,
  getOtherRoomMembers,
  getRoomCustomization,
  normalizeChatRoomTheme,
} from '../../lib/chatRoomDisplay';
import type { ChatRoom, ChatRoomMember, Profile, TypingIndicator, Attachment } from '../../types';

import { confirmAction, showAlert } from '../../lib/showAlert';
import { SignedImage } from '../ui/SignedImage';
import { ThinkingBee } from '../ui/ThinkingBee';
interface RoomChatViewProps {
  room: ChatRoom & { members?: Array<ChatRoomMember & { user?: Profile }> };
  onBack: () => void;
  startCustomizing?: boolean;
  /** Desktop split view embeds the chat beside the room list — no back arrow. */
  hideBackButton?: boolean;
}

const CHAT_EMOJI_OPTIONS = ['💬', '✨', '🎯', '🍯', '📌', '💡', '🎉', '🧭', '🫶', '📅', '🏠', '📝'];
// Midnight is HIVE-Wide's, not a taste — it belongs to the one room that
// reaches every HIVE and is never offered as a colour somebody can pick.
// Midnight is choosable again. It was hidden because the HIVE-Wide room was
// forced into it and picking it by hand would have been picking the one theme
// that meant something; nothing is forced into it now, so it is just a dark
// room for anybody who wants one.
const THEME_OPTIONS = Object.values(CHAT_ROOM_THEMES);

/**
 * How long a message may be.
 *
 * Was 2000 here and 12000 in Clive's bar, for no reason anybody could name —
 * so the same sentence was allowed in one box and cut off in the other. They
 * match now. Nat has already complained once about a cap being too tight.
 */
const MESSAGE_MAX_LENGTH = 12000;

/**
 * How long your own name for a chat may be. Was 60, which is shorter than a
 * board name (90) for no reason; both are somebody naming a thing.
 */
const ROOM_TITLE_MAX_LENGTH = 90;

function getFirstGrapheme(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';

  try {
    const Segmenter = (Intl as any).Segmenter;
    if (Segmenter) {
      const segmenter = new Segmenter(undefined, { granularity: 'grapheme' });
      const first = segmenter.segment(trimmed)[Symbol.iterator]().next().value;
      return first?.segment ?? '';
    }
  } catch {
    // Fall through to Array.from for environments without Intl.Segmenter.
  }

  return Array.from(trimmed)[0] ?? '';
}

export function RoomChatView({ room, onBack, startCustomizing = false, hideBackButton = false }: RoomChatViewProps) {
  const { profile, communityId, community } = useAuth();
  // The HIVE you are signed into, by name. It titles the room everyone shares
  // and it names who @all is about to reach (Nat 2026-08-03).
  const hiveName = hiveDisplayName(community?.name);
  const queryClient = useQueryClient();
  const {
    messages,
    loading: messagesLoading,
    loadingOlder,
    hasOlderMessages,
    loadOlderMessages,
    refetch: refetchMessages,
  } = useRoomMessagesQuery(room.id);

  const messageDraftKey = profile?.id
    ? `the-hive:room-message-draft:${profile.id}:${room.id}`
    : null;
  const [newMessage, setNewMessage, clearNewMessageDraft] = usePersistentTextDraft(messageDraftKey);
  const [sending, setSending] = useState(false);
  const [typingUsers, setTypingUsers] = useState<Array<TypingIndicator & { user?: Profile }>>([]);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [selectedImages, setSelectedImages] = useState<SelectedImage[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<SelectedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const initialCustomization = getRoomCustomization(room, profile?.id);
  const [showCustomizeModal, setShowCustomizeModal] = useState(false);
  const [currentCustomTitle, setCurrentCustomTitle] = useState(initialCustomization.title || '');
  const [currentCustomEmoji, setCurrentCustomEmoji] = useState(initialCustomization.emoji || '');
  const [currentCustomImageUrl, setCurrentCustomImageUrl] = useState(initialCustomization.imageUrl || '');
  const [currentThemeKey, setCurrentThemeKey] = useState<ChatRoomThemeKey>(initialCustomization.themeKey);
  const [currentBackgroundImageUrl, setCurrentBackgroundImageUrl] = useState(
    initialCustomization.backgroundImageUrl || ''
  );
  const [draftTitle, setDraftTitle] = useState(currentCustomTitle);
  const [draftEmoji, setDraftEmoji] = useState(currentCustomEmoji);
  const [draftImageUrl, setDraftImageUrl] = useState(currentCustomImageUrl);
  const [draftThemeKey, setDraftThemeKey] = useState<ChatRoomThemeKey>(currentThemeKey);
  const [savingCustomization, setSavingCustomization] = useState(false);
  const [deletingRoom, setDeletingRoom] = useState(false);
  const [uploadingCustomizationImage, setUploadingCustomizationImage] = useState(false);

  const flatListRef = useRef<FlatList>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isInitialLoadRef = useRef(true);
  const previousMessageCountRef = useRef(0);
  const isLoadingOlderRef = useRef(false);
  const didOpenInitialCustomizeRef = useRef(false);

  const roomWithCustomization = useMemo(
    () => ({
      ...room,
      custom_title: currentCustomTitle || null,
      custom_emoji: currentCustomEmoji || null,
      custom_image_url: currentCustomImageUrl || null,
      custom_background: currentThemeKey,
      custom_background_image_url: currentBackgroundImageUrl || null,
    }),
    [currentBackgroundImageUrl, currentCustomEmoji, currentCustomImageUrl, currentCustomTitle, currentThemeKey, room]
  );

  const otherMembers = useMemo(
    () => getOtherRoomMembers(roomWithCustomization, profile?.id),
    [profile?.id, roomWithCustomization]
  );
  const roomTheme = useMemo(
    () => getChatRoomTheme(roomWithCustomization, profile?.id),
    [profile?.id, roomWithCustomization]
  );
  const roomTitle = useMemo(
    () => getMessagesRoomLabel(roomWithCustomization, profile?.id, hiveName),
    [hiveName, profile?.id, roomWithCustomization]
  );
  const roomSubtitle = useMemo(
    () => getMessagesRoomSubtitle(roomWithCustomization, profile?.id, hiveName),
    [hiveName, profile?.id, roomWithCustomization]
  );
  const roomMentionableMembers = useMemo(
    () => (room.members || [])
      .map((member) => member.user)
      .filter((user): user is Profile => !!user?.id && !!user?.name)
      .map((user) => ({ id: user.id, name: user.name })),
    [room.members]
  );
  const { members: activeMentionableMembers, loading: mentionMembersLoading } = useMentionableMembers(
    room.room_type === 'community' ? communityId : null,
    roomMentionableMembers
  );

  // "Everyone" means something different in each room: in the HIVE's own room
  // it is the whole HIVE, and in a group chat it is the handful of people in
  // it. This screen used to rewrite the "@all" suggestion to say which — and it
  // cannot any more, because the suggestion list is drawn inside ComposerBar
  // and the broadcast wording is a fixed constant in lib/mentions.ts. So the
  // picker says "Everyone in HIVE" in a two-person chat again, which is the
  // thing Nat spotted on 2026-08-03. Giving ComposerBar a way to name the
  // broadcast for the room it is sitting in would put it back.

  useEffect(() => {
    const customization = getRoomCustomization(room, profile?.id);
    setCurrentCustomTitle(customization.title || '');
    setCurrentCustomEmoji(customization.emoji || '');
    setCurrentCustomImageUrl(customization.imageUrl || '');
    setCurrentThemeKey(customization.themeKey);
    setCurrentBackgroundImageUrl(customization.backgroundImageUrl || '');
  }, [profile?.id, room]);

  const openCustomizeModal = () => {
    setDraftTitle(currentCustomTitle);
    setDraftEmoji(currentCustomEmoji);
    setDraftImageUrl(currentCustomImageUrl);
    setDraftThemeKey(currentThemeKey);
    setShowCustomizeModal(true);
  };

  useEffect(() => {
    if (!startCustomizing || didOpenInitialCustomizeRef.current) return;
    didOpenInitialCustomizeRef.current = true;
    openCustomizeModal();
  }, [startCustomizing]);

  const handlePickChatImage = async () => {
    if (!profile) return;

    const image = await pickSingleImage({ quality: 0.8, allowsEditing: true });
    if (!image) return;

    setUploadingCustomizationImage(true);
    try {
      const attachment = await uploadSingleImage(profile.id, image);
      if (!attachment) {
        showAlert('Photo not added', 'That image did not upload. Try again in a moment.');
        return;
      }
      setDraftImageUrl(attachment.url);
    } finally {
      setUploadingCustomizationImage(false);
    }
  };

  const handleSaveCustomization = async () => {
    if (!profile) return;

    const title = draftTitle.trim();
    const emoji = getFirstGrapheme(draftEmoji);
    const payload = {
      custom_title: title || null,
      custom_emoji: emoji || null,
      custom_image_url: draftImageUrl || null,
      custom_background: draftThemeKey,
      custom_background_image_url: currentBackgroundImageUrl || null,
    };

    setSavingCustomization(true);
    try {
      const { data: updatedMembership, error } = await supabase
        .from('chat_room_members')
        .update(payload)
        .eq('room_id', room.id)
        .eq('user_id', profile.id)
        .select('id')
        .maybeSingle();

      if (error) throw error;

      if (!updatedMembership) {
        const { error: insertError } = await supabase
          .from('chat_room_members')
          .insert({
            room_id: room.id,
            user_id: profile.id,
            ...payload,
          } as any);

        if (insertError) throw insertError;
      }

      setCurrentCustomTitle(title);
      setCurrentCustomEmoji(emoji);
      setCurrentCustomImageUrl(draftImageUrl);
      setCurrentThemeKey(normalizeChatRoomTheme(draftThemeKey));
      setCurrentBackgroundImageUrl(currentBackgroundImageUrl);
      setShowCustomizeModal(false);

      if (communityId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.chatRooms(communityId) });
      }
    } catch (error) {
      console.error('Error saving chat customization:', error);
      showAlert('Not saved', 'That chat style did not save. Try again in a moment.');
    } finally {
      setSavingCustomization(false);
    }
  };

  const handleResetCustomization = () => {
    setDraftTitle('');
    setDraftEmoji('');
    setDraftImageUrl('');
    setDraftThemeKey('honey');
  };

  const renderRoomIcon = (size = 40) => {
    if (currentCustomImageUrl) {
      return (
        <SignedImage
          uri={currentCustomImageUrl}
          style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: roomTheme.surface }}
          resizeMode="cover"
        />
      );
    }

    if (currentCustomEmoji) {
      return (
        <View
          style={{
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: roomTheme.surface,
            borderWidth: 1,
            borderColor: roomTheme.border,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ fontSize: size * 0.5, lineHeight: size * 0.62 }}>{currentCustomEmoji}</Text>
        </View>
      );
    }

    if (room.room_type === 'dm' && otherMembers.length === 1) {
      const otherMember = otherMembers[0];
      return (
        <MemberProfileLink
          memberId={otherMember.id}
          memberName={otherMember.name}
          stopPropagation
          hitSlop={8}
          style={{
            width: size,
            height: size,
            borderRadius: size / 2,
            borderWidth: 1,
            borderColor: roomTheme.border,
            overflow: 'hidden',
          }}
        >
          <Avatar name={otherMember.name} url={otherMember.avatar_url} size={size} />
        </MemberProfileLink>
      );
    }

    // General wears the HIVE logo here exactly as it does in the room rail —
    // the two sit side by side, so a generic people glyph in one and the crest
    // in the other read as two different rooms (Nat 2026-07-24).
    if (room.room_type === 'community') {
      return (
        <Image
          source={hiveLogo}
          style={{ width: size, height: size, borderRadius: size / 2 }}
          resizeMode="cover"
        />
      );
    }

    return (
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: roomTheme.surface,
          borderWidth: 1,
          borderColor: roomTheme.border,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={{ fontSize: size * 0.5 }}>{room.room_type === 'group_dm' ? '👥' : '👤'}</Text>
      </View>
    );
  };

  // Subscribe to typing indicators, new messages, and update last_read_at
  useEffect(() => {
    // Guard against undefined room.id to prevent subscription errors
    if (!room.id) return;

    const channel = supabase
      .channel(`room-realtime:${room.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'typing_indicators',
          filter: `room_id=eq.${room.id}`,
        },
        async () => {
          // Fetch current typing users
          const { data } = await supabase
            .from('typing_indicators')
            .select('*, user:profiles(*)')
            .eq('room_id', room.id)
            .gt('updated_at', new Date(Date.now() - 5000).toISOString());
          setTypingUsers((data || []) as Array<TypingIndicator & { user?: Profile }>);
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'room_messages',
          filter: `room_id=eq.${room.id}`,
        },
        async () => {
          // Refetch messages when any change happens
          await refetchMessages();
        }
      )
      .subscribe();

    // Update last_read_at
    if (profile) {
      supabase
        .from('chat_room_members')
        .update({ last_read_at: new Date().toISOString() })
        .eq('room_id', room.id)
        .eq('user_id', profile.id)
        .then();
    }

    return () => {
      supabase.removeChannel(channel);
    };
  }, [room.id, profile]);

  // Reverse messages for inverted FlatList (newest first)
  const invertedMessages = useMemo(() => [...messages].reverse(), [messages]);

  // Load older messages when user scrolls to the end of inverted list (visual top)
  const handleEndReached = useCallback(() => {
    if (hasOlderMessages && !loadingOlder && !isLoadingOlderRef.current) {
      isLoadingOlderRef.current = true;
      loadOlderMessages();
      setTimeout(() => {
        isLoadingOlderRef.current = false;
      }, 1000);
    }
  }, [hasOlderMessages, loadingOlder, loadOlderMessages]);

  // Scroll to bottom (offset 0 in inverted list) when new messages arrive
  useEffect(() => {
    const currentCount = messages.length;
    const previousCount = previousMessageCountRef.current;

    if (currentCount > 0 && currentCount > previousCount && !isInitialLoadRef.current) {
      setTimeout(() => {
        flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
      }, 100);
    }

    if (isInitialLoadRef.current && currentCount > 0) {
      isInitialLoadRef.current = false;
    }

    previousMessageCountRef.current = currentCount;
  }, [messages.length]);

  const sendTypingIndicator = async () => {
    if (!profile) return;

    try {
      await supabase.from('typing_indicators').upsert(
        {
          room_id: room.id,
          user_id: profile.id,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'room_id,user_id' }
      );
    } catch (error) {
      // Ignore errors
    }
  };

  const clearTypingIndicator = async () => {
    if (!profile) return;

    try {
      await supabase
        .from('typing_indicators')
        .delete()
        .eq('room_id', room.id)
        .eq('user_id', profile.id);
    } catch (error) {
      // Ignore errors
    }
  };

  /**
   * Every keystroke in the message bar, and the "somebody is typing" dot.
   *
   * ComposerBar hands back either the new text or an updater — the updater is
   * how dictation appends to what you have already written. The draft store
   * wants the updater as-is so it never saves a stale copy; the typing
   * indicator only needs to know whether the box is empty, so it resolves
   * against the text this render is showing.
   */
  const handleComposerChange = (next: string | ((previous: string) => string)) => {
    setNewMessage(next);

    const text = typeof next === 'function' ? next(newMessage) : next;
    if (text.length > 0) {
      sendTypingIndicator();

      // Clear typing indicator after 3 seconds of no typing
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      typingTimeoutRef.current = setTimeout(() => {
        clearTypingIndicator();
      }, 3000);
    } else {
      clearTypingIndicator();
    }
  };

  const hasMessageContent = newMessage.trim().length > 0 || selectedImages.length > 0 || selectedFiles.length > 0;

  const handleSend = async () => {
    if (!hasMessageContent || !profile || !communityId) return;

    setSending(true);
    try {
      clearTypingIndicator();

      let attachments: Attachment[] | undefined;
      if (selectedImages.length > 0 || selectedFiles.length > 0) {
        setUploading(true);
        const outcome = await uploadAttachments({
          userId: profile.id,
          images: selectedImages,
          files: selectedFiles,
        });
        setUploading(false);

        // Every photo failed. This used to carry on and insert a message with
        // empty text and no attachments — a blank bubble in the room, with no
        // word to the sender. `uploadAttachments` has already said what
        // happened; stopping here leaves the photos in the composer to retry.
        if (!outcome.readyToSend) return;
        attachments = outcome.attachments;
      }

      const messageContent = newMessage.trim();

      // A message with no words and nothing attached has nothing to say.
      if (!messageContent && (attachments?.length ?? 0) === 0) return;

      const { error } = await supabase.from('room_messages').insert({
        community_id: communityId,
        room_id: room.id,
        sender_id: profile.id,
        content: messageContent,
        attachments: attachments && attachments.length > 0 ? attachments : null,
      });

      if (error) throw error;

      // Refetch messages to show the new one
      await refetchMessages();

      // In community rooms, @mentions notify only the people named.
      if (room.room_type === 'community' && messageContent) {
        const mentionedMembers = getMentionedMembers(
          messageContent,
          activeMentionableMembers,
          profile.id
        );
        const messagePreview = messageContent || (attachments ? 'Sent an attachment' : '');

        mentionedMembers.forEach((member) => {
          supabase.functions.invoke('notify-chat-mention', {
            body: {
              room_id: room.id,
              sender_id: profile.id,
              recipient_id: member.id,
              message_preview: messagePreview,
              community_id: communityId,
              // The email and the push say where you were tagged, so they say
              // the HIVE's name too — "General" would name a room nobody sees
              // called that any more (Nat 2026-08-03). No user id, because the
              // sender's private nickname for the room is theirs alone and has
              // no business in somebody else's inbox.
              room_name: getMessagesRoomLabel(roomWithCustomization, undefined, hiveName),
            },
          }).catch((err) => console.log('Mention notification error (non-blocking):', err));
        });
      }

      // Send push notification for DM and group DM messages
      if (room.room_type === 'dm' || room.room_type === 'group_dm') {
        const recipientIds = otherMembers.map((m) => m.id).filter((id) => id !== profile.id);
        const messagePreview = messageContent || (attachments ? 'Sent an attachment' : '');

        // Fire and forget - don't block on notifications
        recipientIds.forEach((recipientId) => {
          supabase.functions.invoke('notify-dm', {
            body: {
              room_id: room.id,
              sender_id: profile.id,
              recipient_id: recipientId,
              message_preview: messagePreview,
              community_id: communityId,
            },
          }).catch((err) => console.log('Notification error (non-blocking):', err));
        });
      }

      clearNewMessageDraft();
      setSelectedImages([]);
      setSelectedFiles([]);
    } catch (error) {
      console.error('Error sending message:', error);
      showAlert('Not sent', 'That message did not go through. Try again in a moment.');
    } finally {
      setSending(false);
      setUploading(false);
    }
  };

  const handleReact = useCallback(async (messageId: string, emoji: string) => {
    if (!profile) return;

    try {
      await supabase
        .from('message_reactions')
        .upsert({
          message_id: messageId,
          user_id: profile.id,
          emoji,
        }, { onConflict: 'message_id,user_id,emoji', ignoreDuplicates: true });
      await refetchMessages();
    } catch (error) {
      console.error('Error adding reaction:', error);
    }
  }, [profile, refetchMessages]);

  const handleRemoveReaction = useCallback(async (messageId: string, emoji: string) => {
    if (!profile) return;

    try {
      await supabase
        .from('message_reactions')
        .delete()
        .eq('message_id', messageId)
        .eq('user_id', profile.id)
        .eq('emoji', emoji);
      await refetchMessages();
    } catch (error) {
      console.error('Error removing reaction:', error);
    }
  }, [profile, refetchMessages]);

  const handleEdit = useCallback((messageId: string) => {
    const message = messages.find((m) => m.id === messageId);
    if (message) {
      setEditingMessageId(messageId);
      setEditContent(message.content);
    }
  }, [messages]);

  const handleSaveEdit = async () => {
    if (!editingMessageId || !editContent.trim()) return;

    try {
      await supabase
        .from('room_messages')
        .update({
          content: editContent.trim(),
          edited_at: new Date().toISOString(),
        })
        .eq('id', editingMessageId);

      setEditingMessageId(null);
      setEditContent('');
      await refetchMessages();
    } catch (error) {
      console.error('Error editing message:', error);
      showAlert('Not saved', 'That edit did not save. Try again in a moment.');
    }
  };

  const handleDelete = useCallback(async (messageId: string) => {
    // Was Alert.alert-only, which is a no-op on web — so Delete Message did
    // nothing at all in a browser. Delete chat, 50 lines below, always had the
    // web branch.
    confirmAction({
      title: 'Delete message',
      message: 'Are you sure you want to delete this message?',
      confirmLabel: 'Delete',
      destructive: true,
      onConfirm: async () => {
          try {
            await supabase
              .from('room_messages')
              .update({ deleted_at: new Date().toISOString() })
              .eq('id', messageId);
            await refetchMessages();
          } catch (error) {
            console.error('Error deleting message:', error);
            showAlert('Not deleted', 'That message could not be deleted. Try again in a moment.');
          }
        },
    });
  }, [refetchMessages]);

  const renderMessageItem = useCallback(({ item }: { item: any }) => (
    <RoomMessageItem
      message={item}
      currentUserId={profile?.id}
      onReact={(emoji) => handleReact(item.id, emoji)}
      onRemoveReaction={(emoji) => handleRemoveReaction(item.id, emoji)}
      onEdit={() => handleEdit(item.id)}
      onDelete={() => handleDelete(item.id)}
      ownBubbleColor={roomTheme.ownBubble}
      ownBubbleTextColor={roomTheme.ownBubbleText}
      reactionAccentColor={roomTheme.accent}
      otherBubbleColor={roomTheme.otherBubble}
      otherBubbleTextColor={roomTheme.otherBubbleText}
      metaTextColor={roomTheme.metaText}
    />
  ), [profile?.id, handleReact, handleRemoveReaction, handleEdit, handleDelete, roomTheme]);

  const draftTheme = CHAT_ROOM_THEMES[draftThemeKey];

  // The General room belongs to the community, not to whoever opened it.
  const isGeneralRoom = !!room.is_community_room || /^general$/i.test(room.name ?? '');

  const handleDeleteRoom = () => {
    if (deletingRoom || isGeneralRoom) return;
    const label = roomTitle || 'this chat';

    // Was a hand-rolled window.confirm with an Alert.alert fallback. Same
    // question, through the one helper that works in a browser and on a phone.
    confirmAction({
      title: `Delete ${label}?`,
      message: "Every message in it goes too, for everyone. This can't be undone.",
      confirmLabel: 'Delete',
      destructive: true,
      onConfirm: async () => {
        setDeletingRoom(true);
        try {
          // Messages and membership first — a room row left without them is
          // worse than one left whole.
          await supabase.from('room_messages').delete().eq('room_id', room.id);
          await supabase.from('chat_room_members').delete().eq('room_id', room.id);
          const { error } = await supabase.from('chat_rooms').delete().eq('id', room.id);
          if (error) throw error;

          setShowCustomizeModal(false);
          onBack();
        } catch (error) {
          console.warn('Could not delete the room', error);
          showAlert('Could not delete', 'That chat could not be deleted. Please try again.');
        } finally {
          setDeletingRoom(false);
        }
      },
    });
  };

  return (
    <SafeAreaView className="flex-1" edges={['top']} style={{ backgroundColor: roomTheme.header }}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1"
      >
        {/* Header */}
        <View
          className="flex-row items-center px-4 py-3 border-b"
          style={{ backgroundColor: roomTheme.header, borderBottomColor: roomTheme.border }}
        >
          {!hideBackButton && (
            <Pressable onPress={onBack} className="mr-3 w-9 h-9 rounded-full items-center justify-center">
              <Ionicons name="chevron-back" size={28} color="#313130" />
            </Pressable>
          )}
          <View className="mr-3">{renderRoomIcon(42)}</View>
          <Pressable
            onPress={openCustomizeModal}
            className="flex-1"
          >
            <View className="flex-row items-center">
              <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-charcoal text-lg flex-1" numberOfLines={1}>
                {roomTitle}
              </Text>
            </View>
            {roomSubtitle && (
              <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-charcoal/50 text-sm">
                {roomSubtitle}
              </Text>
            )}
          </Pressable>
          <Pressable
            onPress={openCustomizeModal}
            className="ml-3 w-9 h-9 rounded-full items-center justify-center active:opacity-70"
            style={{ backgroundColor: roomTheme.accentSoft }}
          >
            <Ionicons name="color-palette-outline" size={18} color={roomTheme.accent} />
          </Pressable>
        </View>

        {/* Chat customization */}
        <Modal visible={showCustomizeModal} transparent animationType="slide">
          <Pressable
            onPress={() => setShowCustomizeModal(false)}
            className="flex-1 justify-end bg-black/40"
          >
            <Pressable
              className="px-5 pt-3 pb-8"
              style={{
                backgroundColor: '#fffdf5',
                borderTopLeftRadius: 28,
                borderTopRightRadius: 28,
                maxHeight: '92%',
              }}
            >
              <View className="w-10 h-1 rounded-full self-center mb-5" style={{ backgroundColor: roomTheme.border }} />

              <View className="flex-row items-center mb-5">
                <View
                  className="w-14 h-14 rounded-full items-center justify-center mr-3 overflow-hidden"
                  style={{ backgroundColor: draftTheme.surface, borderWidth: 1, borderColor: draftTheme.border }}
                >
                  {draftImageUrl ? (
                    <SignedImage uri={draftImageUrl} style={{ width: 56, height: 56 }} resizeMode="cover" />
                  ) : (
                    <Text style={{ fontSize: 28, lineHeight: 34 }}>{draftEmoji || '💬'}</Text>
                  )}
                </View>
                <View className="flex-1">
                  <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-charcoal text-xl" numberOfLines={1}>
                    Change Name and Photo
                  </Text>
                  <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-charcoal/50 text-sm" numberOfLines={1}>
                    {roomTitle}
                  </Text>
                </View>
                <Pressable
                  onPress={() => setShowCustomizeModal(false)}
                  className="w-9 h-9 rounded-full items-center justify-center"
                  style={{ backgroundColor: '#f0ede6' }}
                >
                  <Ionicons name="close" size={20} color="#313130" />
                </Pressable>
              </View>

              <ScrollView showsVerticalScrollIndicator={true} contentContainerStyle={{ paddingBottom: 16 }}>
                {/* Naming a chat is naming a thing, so it is words and gets
                    the mic — same box you write a message into. */}
                <ComposerBar
                  variant="form"
                  containerClassName="mb-5"
                  label="Title"
                  value={draftTitle}
                  onChangeText={setDraftTitle}
                  placeholder={roomTitle}
                  multiline={false}
                  maxLength={ROOM_TITLE_MAX_LENGTH}
                  onSubmit={handleSaveCustomization}
                  canSubmit={!savingCustomization && !uploadingCustomizationImage}
                  submitting={savingCustomization}
                />

                <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-charcoal mb-2">
                  Icon
                </Text>
                <View className="flex-row items-center mb-3">
                  {/* An emoji is not words — no mic. It wears the shared field
                      look so it still belongs to the same set of controls. */}
                  <TextInput
                    value={draftEmoji}
                    onChangeText={(value) => {
                      setDraftEmoji(getFirstGrapheme(value));
                      if (value.trim()) setDraftImageUrl('');
                    }}
                    placeholder="💬"
                    placeholderTextColor={FIELD_LOOK.placeholder}
                    selectionColor={FIELD_LOOK.ink}
                    className="w-16 h-12 text-center text-xl mr-2"
                    style={{
                      fontFamily: FIELD_LOOK.font,
                      backgroundColor: FIELD_LOOK.fill,
                      borderWidth: 1,
                      borderColor: FIELD_LOOK.border,
                      borderRadius: FIELD_LOOK.radius,
                      color: FIELD_LOOK.ink,
                      outlineStyle: 'none',
                      caretColor: FIELD_LOOK.ink,
                    } as any}
                    maxLength={8}
                  />
                  <Pressable
                    onPress={handlePickChatImage}
                    disabled={uploadingCustomizationImage}
                    className="h-12 px-4 rounded-2xl flex-row items-center justify-center mr-2 active:opacity-80"
                    style={{ backgroundColor: draftTheme.accentSoft }}
                  >
                    {uploadingCustomizationImage ? (
                      <ActivityIndicator size="small" color="#fffdf5" />
                    ) : (
                      <Ionicons name="image-outline" size={19} color={draftTheme.accent} />
                    )}
                    <Text style={{ fontFamily: 'Lato_700Bold', color: draftTheme.accent }} className="ml-2">
                      Photo
                    </Text>
                  </Pressable>
                  {draftImageUrl ? (
                    <Pressable
                      onPress={() => setDraftImageUrl('')}
                      className="w-12 h-12 rounded-2xl items-center justify-center"
                      style={{ backgroundColor: '#f0ede6' }}
                    >
                      <Ionicons name="trash-outline" size={18} color="#b45353" />
                    </Pressable>
                  ) : null}
                </View>

                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ gap: 8, paddingBottom: 18 }}
                >
                  {CHAT_EMOJI_OPTIONS.map((emoji) => {
                    const active = draftEmoji === emoji && !draftImageUrl;
                    return (
                      <Pressable
                        key={emoji}
                        onPress={() => {
                          setDraftEmoji(emoji);
                          setDraftImageUrl('');
                        }}
                        className="w-11 h-11 rounded-full items-center justify-center"
                        style={{
                          backgroundColor: active ? draftTheme.surface : '#ffffff',
                          borderWidth: active ? 1.5 : 1,
                          borderColor: active ? draftTheme.accent : draftTheme.border,
                        }}
                      >
                        <Text style={{ fontSize: 21 }}>{emoji}</Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>

                <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-charcoal mb-3">
                  Background
                </Text>
                <View className="flex-row flex-wrap gap-3 mb-2">
                  {THEME_OPTIONS.map((theme) => {
                    const active = draftThemeKey === theme.key;
                    return (
                      <Pressable
                        key={theme.key}
                        onPress={() => setDraftThemeKey(theme.key)}
                        className="items-center"
                        style={{ width: 64 }}
                      >
                        <View
                          className="w-12 h-12 rounded-full items-center justify-center"
                          style={{
                            backgroundColor: theme.surface,
                            borderWidth: active ? 2 : 1,
                            borderColor: active ? theme.accent : theme.border,
                          }}
                        >
                          <View
                            className="w-7 h-7 rounded-full"
                            style={{ backgroundColor: theme.accent }}
                          />
                        </View>
                        <Text
                          style={{
                            fontFamily: active ? 'Lato_700Bold' : 'Lato_400Regular',
                            color: active ? theme.accent : '#7a746b',
                          }}
                          className="text-xs mt-1 text-center"
                          numberOfLines={1}
                        >
                          {theme.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </ScrollView>

              <View className="flex-row gap-3 pt-2">
                <Pressable
                  onPress={handleResetCustomization}
                  className="w-12 h-12 rounded-2xl items-center justify-center"
                  style={{ backgroundColor: '#f0ede6' }}
                >
                  <Ionicons name="refresh" size={18} color="#6f6a62" />
                </Pressable>
                <Pressable
                  onPress={() => setShowCustomizeModal(false)}
                  className="flex-1 h-12 rounded-2xl items-center justify-center"
                  style={{ backgroundColor: '#f0ede6' }}
                >
                  <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-charcoal">
                    Cancel
                  </Text>
                </Pressable>
                <Pressable
                  onPress={handleSaveCustomization}
                  disabled={savingCustomization || uploadingCustomizationImage}
                  className="flex-1 h-12 rounded-2xl items-center justify-center"
                  style={{
                    backgroundColor: draftTheme.accent,
                    opacity: savingCustomization || uploadingCustomizationImage ? 0.58 : 1,
                  }}
                >
                  {savingCustomization ? (
                    <ThinkingBee />
                  ) : (
                    <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-white">
                      Save
                    </Text>
                  )}
                </Pressable>
              </View>

              {/* Delete the chat. Lives at the bottom of the settings sheet,
                  behind a confirm — leaving stale rooms lying around meant
                  asking someone with database access to clear them, which is
                  not a feature (Nat 2026-07-25). General is the community's
                  room and isn't deletable. */}
              {!isGeneralRoom && (
                <Pressable
                  onPress={handleDeleteRoom}
                  disabled={deletingRoom}
                  className="h-12 rounded-2xl items-center justify-center mt-3"
                  style={{ opacity: deletingRoom ? 0.6 : 1 }}
                >
                  <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-red-600">
                    {deletingRoom ? 'Deleting…' : 'Delete this chat'}
                  </Text>
                </Pressable>
              )}
            </Pressable>
          </Pressable>
        </Modal>

        {/* Messages */}
        <View className="flex-1" style={{ backgroundColor: roomTheme.messageBackground }}>
          {currentBackgroundImageUrl ? (
            <SignedImage
              uri={currentBackgroundImageUrl}
              style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, opacity: 0.14 }}
              resizeMode="cover"
            />
          ) : null}
          <FlatList
            ref={flatListRef}
            data={invertedMessages}
            inverted
            keyExtractor={(item) => item.id}
            renderItem={renderMessageItem}
            onEndReached={handleEndReached}
            onEndReachedThreshold={0.3}
            contentContainerStyle={{ padding: 16, paddingBottom: 8 }}
            ListFooterComponent={
              loadingOlder ? (
                <View className="items-center py-3">
                  <ThinkingBee />
                  <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-charcoal/50 text-xs mt-1">
                    Loading older messages...
                  </Text>
                </View>
              ) : null
            }
            ListEmptyComponent={
              messagesLoading ? (
                <View className="items-center py-8">
                  <ThinkingBee />
                </View>
              ) : (
                <View className="items-center py-8">
                  {/* A room's own emoji is member-chosen and always wins; when
                      nobody has picked one, a speech bubble stands in. */}
                  <Text className="text-4xl mb-2">{currentCustomEmoji || '💬'}</Text>
                  <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-charcoal/50">
                    No messages yet. Start the conversation!
                  </Text>
                </View>
              )
            }
            removeClippedSubviews={Platform.OS !== 'web'}
            maxToRenderPerBatch={10}
            windowSize={10}
            initialNumToRender={20}
          />
        </View>

        {/* Typing indicator */}
        <RoomTypingIndicator typingUsers={typingUsers} currentUserId={profile?.id} />

        {/* Editing a message you already sent. ComposerBar's inlineEdit
            variant is exactly this shape: the box, the mic inside its own
            border, and Cancel and Save on the footer strip. */}
        {editingMessageId ? (
          <View className="px-4 py-3" style={{ backgroundColor: roomTheme.header }}>
            <ComposerBar
              variant="inlineEdit"
              value={editContent}
              onChangeText={setEditContent}
              placeholder="Edit your message..."
              minHeight={72}
              maxHeight={128}
              maxLength={MESSAGE_MAX_LENGTH}
              onSubmit={handleSaveEdit}
              submitLabel="Save"
              onCancel={() => {
                setEditingMessageId(null);
                setEditContent('');
              }}
              mentionMembers={activeMentionableMembers}
              mentionsLoading={mentionMembersLoading}
              currentUserId={profile?.id}
              header={
                <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-charcoal/50 text-sm mb-2">
                  Editing message
                </Text>
              }
            />
          </View>
        ) : (
          /* The message bar. This IS Clive's bar now — same component, same
             cream pill, clip and text and send and mic all on one line — which
             is what Nat asked for: "this is the gold standard for any and all
             text input places... we want to make sure it looks like that
             everywhere all the time" (2026-08-05).

             The room's own colour no longer tints the pill or the send button.
             That was the trade: one bar everybody recognises, drawn the same
             way in Clive, in Boards and in here, beats a bar that changes
             colour with the wallpaper. The wallpaper, the bubbles and the
             header still wear the room's theme. */
          <View className="px-4 py-3" style={{ backgroundColor: roomTheme.header }}>
            <ComposerBar
              variant="chat"
              value={newMessage}
              onChangeText={handleComposerChange}
              placeholder="Message..."
              maxLength={MESSAGE_MAX_LENGTH}
              onSubmit={handleSend}
              canSubmit={hasMessageContent && !sending && !uploading}
              submitting={sending || uploading}
              attachments="compact"
              selectedImages={selectedImages}
              onImagesChange={setSelectedImages}
              selectedFiles={selectedFiles}
              onFilesChange={setSelectedFiles}
              captureDocumentDrops
              mentionMembers={activeMentionableMembers}
              mentionsLoading={mentionMembersLoading}
              currentUserId={profile?.id}
            />
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
