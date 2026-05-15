import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  Alert,
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
import { RoomMessageItem } from './RoomMessageItem';
import { RoomTypingIndicator } from './RoomTypingIndicator';
import { SelectedImage, pickSingleImage } from '../../lib/imagePicker';
import { SelectedFile } from '../../lib/filePicker';
import { uploadMultipleFiles, uploadMultipleImages, uploadSingleImage } from '../../lib/attachmentUpload';
import { submitOnEnter } from '../../lib/submitOnEnter';
import { AttachmentPicker } from '../ui/AttachmentPicker';
import { VoiceMicButton } from '../ui/VoiceMicButton';
import {
  CHAT_ROOM_THEMES,
  ChatRoomThemeKey,
  getChatRoomTheme,
  getOtherRoomMembers,
  getRoomCustomization,
  getRoomDefaultName,
  getRoomDisplayName,
  getRoomSubtitle,
  normalizeChatRoomTheme,
} from '../../lib/chatRoomDisplay';
import type { ChatRoom, ChatRoomMember, Profile, TypingIndicator, Attachment } from '../../types';

interface RoomChatViewProps {
  room: ChatRoom & { members?: Array<ChatRoomMember & { user?: Profile }> };
  onBack: () => void;
  startCustomizing?: boolean;
}

const BROADCAST_MENTION_HANDLES = new Set(['everyone', 'all', 'group']);
const CHAT_EMOJI_OPTIONS = ['💬', '✨', '🎯', '🍯', '📌', '💡', '🎉', '🧭', '🫶', '📅', '🏠', '📝'];
const THEME_OPTIONS = Object.values(CHAT_ROOM_THEMES);

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

function normalizeMentionHandle(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function getMentionedMembers(
  content: string,
  members: Profile[],
  currentUserId?: string
): Profile[] {
  const mentionHandles = new Set(
    Array.from(content.matchAll(/@([a-z0-9._-]+)/gi))
      .map((match) => normalizeMentionHandle(match[1]))
      .filter(Boolean)
  );

  if (mentionHandles.size === 0) return [];

  if (Array.from(mentionHandles).some((handle) => BROADCAST_MENTION_HANDLES.has(handle))) {
    return members.filter((member) => member.id && member.id !== currentUserId);
  }

  const mentioned = new Map<string, Profile>();

  members.forEach((member) => {
    if (!member.id || member.id === currentUserId || !member.name) return;

    const nameParts = member.name.split(/\s+/).filter(Boolean);
    const firstName = normalizeMentionHandle(nameParts[0] || '');
    const fullName = normalizeMentionHandle(member.name);

    if (mentionHandles.has(firstName) || mentionHandles.has(fullName)) {
      mentioned.set(member.id, member);
    }
  });

  return Array.from(mentioned.values());
}

export function RoomChatView({ room, onBack, startCustomizing = false }: RoomChatViewProps) {
  const { profile, communityId } = useAuth();
  const queryClient = useQueryClient();
  const {
    messages,
    loading: messagesLoading,
    loadingOlder,
    hasOlderMessages,
    loadOlderMessages,
    refetch: refetchMessages,
  } = useRoomMessagesQuery(room.id);

  const [newMessage, setNewMessage] = useState('');
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
  const [uploadingCustomizationImage, setUploadingCustomizationImage] = useState(false);

  const flatListRef = useRef<FlatList>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isInitialLoadRef = useRef(true);
  const previousMessageCountRef = useRef(0);
  const isLoadingOlderRef = useRef(false);
  const didOpenInitialCustomizeRef = useRef(false);
  const voiceBaseTextRef = useRef<string | null>(null);

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
    () => getRoomDisplayName(roomWithCustomization, profile?.id),
    [profile?.id, roomWithCustomization]
  );
  const roomSubtitle = useMemo(
    () => getRoomSubtitle(roomWithCustomization, profile?.id),
    [profile?.id, roomWithCustomization]
  );

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
        Alert.alert('Error', 'Failed to upload image.');
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
      Alert.alert('Error', 'Failed to save chat style.');
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
        <Image
          source={{ uri: currentCustomImageUrl }}
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
        <Ionicons
          name={room.room_type === 'community' ? 'people-outline' : room.room_type === 'group_dm' ? 'chatbubbles-outline' : 'person-outline'}
          size={size * 0.5}
          color={roomTheme.accent}
        />
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

  const handleTextChange = (text: string) => {
    setNewMessage(text);

    // Send typing indicator
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

  const mergeTranscript = (baseText: string, transcript: string) => {
    const cleanBase = baseText.trimEnd();
    const cleanTranscript = transcript.trim();
    if (!cleanTranscript) return cleanBase;
    return cleanBase ? `${cleanBase} ${cleanTranscript}` : cleanTranscript;
  };

  const handleRemoveImage = (index: number) => {
    setSelectedImages((prev) => prev.filter((_, i) => i !== index));
  };

  const handleRemoveFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const hasMessageContent = newMessage.trim().length > 0 || selectedImages.length > 0 || selectedFiles.length > 0;

  const handleSend = async () => {
    if (!hasMessageContent || !profile || !communityId) return;

    setSending(true);
    try {
      clearTypingIndicator();

      let attachments: Attachment[] | undefined;
      if (selectedImages.length > 0) {
        setUploading(true);
        const result = await uploadMultipleImages(profile.id, selectedImages);
        if (result.attachments.length > 0) {
          attachments = result.attachments;
        }
        setUploading(false);
      }
      if (selectedFiles.length > 0) {
        setUploading(true);
        const result = await uploadMultipleFiles(profile.id, selectedFiles);
        if (result.attachments.length > 0) {
          attachments = [...(attachments ?? []), ...result.attachments];
        }
        setUploading(false);
      }

      const messageContent = newMessage.trim() || (attachments ? '' : '');
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
        let mentionableMembers = (room.members || [])
          .map((m) => m.user)
          .filter((u): u is Profile => !!u);

        if (mentionableMembers.length === 0) {
          const { data: memberRows } = await supabase
            .from('community_memberships')
            .select('user:profiles(*)')
            .eq('community_id', communityId);

          mentionableMembers = (memberRows || [])
            .map((m) => (m as any).user)
            .filter((u): u is Profile => !!u);
        }

        const mentionedMembers = getMentionedMembers(
          messageContent,
          mentionableMembers,
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
              room_name: getRoomDefaultName(roomWithCustomization, profile.id),
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

      setNewMessage('');
      setSelectedImages([]);
      setSelectedFiles([]);
      voiceBaseTextRef.current = null;
    } catch (error) {
      console.error('Error sending message:', error);
      Alert.alert('Error', 'Failed to send message.');
    } finally {
      setSending(false);
      setUploading(false);
    }
  };

  const handleReact = useCallback(async (messageId: string, emoji: string) => {
    if (!profile) return;

    try {
      await supabase.from('message_reactions').insert({
        message_id: messageId,
        user_id: profile.id,
        emoji,
      });
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
      Alert.alert('Error', 'Failed to edit message.');
    }
  };

  const editEnterToSubmitCaptureProps = Platform.OS === 'web'
    ? ({ onKeyDownCapture: submitOnEnter(handleSaveEdit) } as any)
    : {};
  const messageEnterToSubmitCaptureProps = Platform.OS === 'web'
    ? ({ onKeyDownCapture: submitOnEnter(handleSend) } as any)
    : {};

  const handleDelete = useCallback(async (messageId: string) => {
    Alert.alert('Delete Message', 'Are you sure you want to delete this message?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await supabase
              .from('room_messages')
              .update({ deleted_at: new Date().toISOString() })
              .eq('id', messageId);
            await refetchMessages();
          } catch (error) {
            console.error('Error deleting message:', error);
            Alert.alert('Error', 'Failed to delete message.');
          }
        },
      },
    ]);
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
    />
  ), [profile?.id, handleReact, handleRemoveReaction, handleEdit, handleDelete, roomTheme]);

  const draftTheme = CHAT_ROOM_THEMES[draftThemeKey];

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
          <Pressable onPress={onBack} className="mr-3 w-9 h-9 rounded-full items-center justify-center">
            <Ionicons name="chevron-back" size={28} color="#313130" />
          </Pressable>
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
                    <Image source={{ uri: draftImageUrl }} style={{ width: 56, height: 56 }} resizeMode="cover" />
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

              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 16 }}>
                <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-charcoal mb-2">
                  Title
                </Text>
                <TextInput
                  value={draftTitle}
                  onChangeText={setDraftTitle}
                  placeholder={roomTitle}
                  placeholderTextColor="#9ca3af"
                  className="rounded-2xl px-4 py-3 mb-5 text-charcoal"
                  style={{
                    fontFamily: 'Lato_400Regular',
                    backgroundColor: '#ffffff',
                    borderWidth: 1,
                    borderColor: draftTheme.border,
                    outlineStyle: 'none',
                  } as any}
                  maxLength={60}
                />

                <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-charcoal mb-2">
                  Icon
                </Text>
                <View className="flex-row items-center mb-3">
                  <TextInput
                    value={draftEmoji}
                    onChangeText={(value) => {
                      setDraftEmoji(getFirstGrapheme(value));
                      if (value.trim()) setDraftImageUrl('');
                    }}
                    placeholder="💬"
                    placeholderTextColor="#9ca3af"
                    className="w-16 h-12 rounded-2xl text-center text-xl mr-2"
                    style={{
                      fontFamily: 'Lato_400Regular',
                      backgroundColor: '#ffffff',
                      borderWidth: 1,
                      borderColor: draftTheme.border,
                      outlineStyle: 'none',
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
                      <ActivityIndicator size="small" color={draftTheme.accent} />
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
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-white">
                      Save
                    </Text>
                  )}
                </Pressable>
              </View>
            </Pressable>
          </Pressable>
        </Modal>

        {/* Messages */}
        <View className="flex-1" style={{ backgroundColor: roomTheme.messageBackground }}>
          {currentBackgroundImageUrl ? (
            <Image
              source={{ uri: currentBackgroundImageUrl }}
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
                  <ActivityIndicator size="small" color={roomTheme.accent} />
                  <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-charcoal/50 text-xs mt-1">
                    Loading older messages...
                  </Text>
                </View>
              ) : null
            }
            ListEmptyComponent={
              messagesLoading ? (
                <View className="items-center py-8">
                  <ActivityIndicator size="large" color={roomTheme.accent} />
                </View>
              ) : (
                <View className="items-center py-8">
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

        {/* Edit mode input */}
        {editingMessageId ? (
          <View className="px-4 py-3" style={{ backgroundColor: roomTheme.header }}>
            <View className="flex-row items-center mb-2">
              <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-charcoal/50 text-sm flex-1">
                Editing message
              </Text>
              <Pressable onPress={() => setEditingMessageId(null)}>
                <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-red-500 text-sm">
                  Cancel
                </Text>
              </Pressable>
            </View>
            <View
              className="flex-row items-end rounded-2xl px-3 py-2"
              style={{ backgroundColor: roomTheme.input }}
              {...editEnterToSubmitCaptureProps}
            >
              <TextInput
                value={editContent}
                onChangeText={setEditContent}
                multiline
                blurOnSubmit={Platform.OS === 'web'}
                submitBehavior={Platform.OS === 'web' ? 'submit' : 'newline'}
                returnKeyType="send"
                enterKeyHint="send"
                onKeyPress={submitOnEnter(handleSaveEdit)}
                className="flex-1 max-h-32 text-base text-charcoal py-1 px-1"
                style={{ fontFamily: 'Lato_400Regular', outlineStyle: 'none' } as any}
              />
              <Pressable
                onPress={handleSaveEdit}
                disabled={!editContent.trim()}
                className="w-7 h-7 rounded-full items-center justify-center ml-2 active:opacity-80"
                style={{ backgroundColor: editContent.trim() ? roomTheme.accent : '#d1d5db' }}
              >
                <Ionicons name="checkmark" size={16} color="white" />
              </Pressable>
            </View>
          </View>
        ) : (
          /* Message input - matching ChatInput styling */
          <View className="px-4 py-3" style={{ backgroundColor: roomTheme.header }}>
            {/* Attachment previews */}
            {(selectedImages.length > 0 || selectedFiles.length > 0) && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                className="mb-2"
                contentContainerStyle={{ gap: 8 }}
              >
                {selectedImages.map((image, index) => (
                  <View key={image.uri} className="relative">
                    <Image
                      source={{ uri: image.uri }}
                      className="w-14 h-14 rounded-lg bg-gray-100"
                      resizeMode="cover"
                    />
                    <Pressable
                      onPress={() => handleRemoveImage(index)}
                      className="absolute -top-1 -right-1 bg-charcoal rounded-full w-5 h-5 items-center justify-center"
                    >
                      <Ionicons name="close" size={12} color="white" />
                    </Pressable>
                  </View>
                ))}
                {selectedFiles.map((file, index) => (
                  <View key={`${file.uri}-${index}`} className="relative bg-cream border border-gold/20 rounded-lg px-3 py-2 w-48">
                    <View className="flex-row items-center">
                      <Ionicons name="document-attach-outline" size={20} color="#bd9348" />
                      <View className="ml-2 flex-1">
                        <Text
                          className="text-charcoal text-xs"
                          style={{ fontFamily: 'Lato_700Bold' }}
                          numberOfLines={1}
                        >
                          {file.name}
                        </Text>
                        <Text
                          className="text-charcoal/45 text-[10px]"
                          style={{ fontFamily: 'Lato_400Regular' }}
                          numberOfLines={1}
                        >
                          {file.mimeType || 'File'}
                        </Text>
                      </View>
                    </View>
                    <Pressable
                      onPress={() => handleRemoveFile(index)}
                      className="absolute -top-1 -right-1 bg-charcoal rounded-full w-5 h-5 items-center justify-center"
                    >
                      <Ionicons name="close" size={12} color="white" />
                    </Pressable>
                  </View>
                ))}
              </ScrollView>
            )}

            <View
              className="flex-row items-end rounded-2xl px-3 py-2"
              style={{ backgroundColor: roomTheme.input }}
              {...messageEnterToSubmitCaptureProps}
            >
              <AttachmentPicker
                compact
                selectedImages={selectedImages}
                onImagesChange={setSelectedImages}
                selectedFiles={selectedFiles}
                onFilesChange={setSelectedFiles}
                disabled={sending || uploading}
              />

              <TextInput
                value={newMessage}
                onChangeText={handleTextChange}
                placeholder="Message..."
                placeholderTextColor="#9CA3AF"
                selectionColor="#313130"
                multiline
                blurOnSubmit={Platform.OS === 'web'}
                submitBehavior={Platform.OS === 'web' ? 'submit' : 'newline'}
                returnKeyType="send"
                enterKeyHint="send"
                onKeyPress={submitOnEnter(handleSend)}
                maxLength={2000}
                className="flex-1 max-h-32 text-base text-charcoal py-1 px-1"
                style={{ fontFamily: 'Lato_400Regular', outlineStyle: 'none', caretColor: '#313130' } as any}
                editable={!sending && !uploading}
              />
              <Pressable
                onPress={handleSend}
                disabled={!hasMessageContent || sending || uploading}
                className="w-7 h-7 rounded-full items-center justify-center ml-2 active:opacity-80"
                style={{
                  backgroundColor:
                    hasMessageContent && !sending && !uploading
                      ? roomTheme.accent
                      : '#d1d5db',
                }}
              >
                <Text className="text-sm text-white" style={{ marginTop: -1 }}>↑</Text>
              </Pressable>
              <VoiceMicButton
                size={20}
                style={{ marginLeft: 6 }}
                onTranscript={(text) => {
                  const merged = mergeTranscript(voiceBaseTextRef.current ?? newMessage, text);
                  handleTextChange(merged);
                  voiceBaseTextRef.current = null;
                }}
                onInterimTranscript={(text) => {
                  if (!text) {
                    voiceBaseTextRef.current = null;
                    return;
                  }
                  if (voiceBaseTextRef.current === null) voiceBaseTextRef.current = newMessage;
                  handleTextChange(mergeTranscript(voiceBaseTextRef.current, text));
                }}
              />
            </View>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
