import { useState, useEffect, useCallback, useRef } from 'react';
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/hooks/useAuth';
import { RoomMessageItem } from './RoomMessageItem';
import { RoomTypingIndicator } from './RoomTypingIndicator';
import { SelectedImage, pickMultipleImages } from '../../lib/imagePicker';
import { uploadMultipleImages } from '../../lib/attachmentUpload';
import type { ChatRoom, RoomMessage, Profile, MessageReaction, TypingIndicator, Attachment } from '../../types';

interface RoomChatViewProps {
  room: ChatRoom & { members?: Array<{ user?: Profile }> };
  onBack: () => void;
}

type MessageWithData = RoomMessage & { sender?: Profile; reactions?: MessageReaction[] };

export function RoomChatView({ room, onBack }: RoomChatViewProps) {
  const { profile, communityId } = useAuth();
  const [messages, setMessages] = useState<MessageWithData[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [typingUsers, setTypingUsers] = useState<Array<TypingIndicator & { user?: Profile }>>([]);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [selectedImages, setSelectedImages] = useState<SelectedImage[]>([]);
  const [uploading, setUploading] = useState(false);

  const flatListRef = useRef<FlatList>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isInitialLoadRef = useRef(true);
  const previousMessageCountRef = useRef(0);

  // Get room display name
  const getRoomName = () => {
    if (room.room_type === 'community') {
      return room.name || 'General';
    }
    const otherMember = room.members?.find((m) => m.user?.id !== profile?.id);
    return otherMember?.user?.name || 'Direct Message';
  };

  const fetchMessages = useCallback(async () => {
    const { data, error } = await supabase
      .from('room_messages')
      .select('*, sender:profiles(*)')
      .eq('room_id', room.id)
      .order('created_at', { ascending: true })
      .limit(100);

    if (!error && data) {
      // Fetch reactions for all messages
      const messageIds = data.map((m) => m.id);
      const { data: reactions } = await supabase
        .from('message_reactions')
        .select('*')
        .in('message_id', messageIds);

      const messagesWithReactions = data.map((msg) => ({
        ...msg,
        reactions: reactions?.filter((r) => r.message_id === msg.id) || [],
      }));

      setMessages(messagesWithReactions as MessageWithData[]);
    }
  }, [room.id]);

  // Subscribe to new messages
  useEffect(() => {
    fetchMessages();

    const channel = supabase
      .channel(`room:${room.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'room_messages',
          filter: `room_id=eq.${room.id}`,
        },
        () => {
          fetchMessages();
        }
      )
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
  }, [room.id, profile, fetchMessages]);

  // Scroll to bottom when messages change
  useEffect(() => {
    const currentCount = messages.length;
    const previousCount = previousMessageCountRef.current;

    if (currentCount > 0) {
      if (isInitialLoadRef.current) {
        // Initial load: scroll immediately without animation
        requestAnimationFrame(() => {
          flatListRef.current?.scrollToEnd({ animated: false });
        });
        isInitialLoadRef.current = false;
      } else if (currentCount > previousCount) {
        // New message added: animate scroll
        setTimeout(() => {
          flatListRef.current?.scrollToEnd({ animated: true });
        }, 100);
      }
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

  const handlePickImages = async () => {
    const remainingSlots = 5 - selectedImages.length;
    if (remainingSlots <= 0) return;

    const images = await pickMultipleImages({ maxImages: remainingSlots });
    if (images.length > 0) {
      setSelectedImages((prev) => [...prev, ...images]);
    }
  };

  const handleRemoveImage = (index: number) => {
    setSelectedImages((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSend = async () => {
    if ((!newMessage.trim() && selectedImages.length === 0) || !profile || !communityId) return;

    setSending(true);
    try {
      clearTypingIndicator();

      // Upload images if any
      let attachments: Attachment[] | undefined;
      if (selectedImages.length > 0) {
        setUploading(true);
        const result = await uploadMultipleImages(profile.id, selectedImages);
        if (result.attachments.length > 0) {
          attachments = result.attachments;
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

      // Send push notification for DM messages
      if (room.room_type === 'dm') {
        const otherMember = room.members?.find((m) => m.user?.id !== profile.id);
        if (otherMember?.user?.id) {
          // Fire and forget - don't block on notification
          supabase.functions.invoke('notify-dm', {
            body: {
              room_id: room.id,
              sender_id: profile.id,
              recipient_id: otherMember.user.id,
              message_preview: messageContent || (attachments ? 'Sent an image' : ''),
              community_id: communityId,
            },
          }).catch((err) => console.log('Notification error (non-blocking):', err));
        }
      }

      setNewMessage('');
      setSelectedImages([]);
    } catch (error) {
      console.error('Error sending message:', error);
      Alert.alert('Error', 'Failed to send message.');
    } finally {
      setSending(false);
      setUploading(false);
    }
  };

  const handleReact = async (messageId: string, emoji: string) => {
    if (!profile) return;

    try {
      await supabase.from('message_reactions').insert({
        message_id: messageId,
        user_id: profile.id,
        emoji,
      });
      await fetchMessages();
    } catch (error) {
      console.error('Error adding reaction:', error);
    }
  };

  const handleRemoveReaction = async (messageId: string, emoji: string) => {
    if (!profile) return;

    try {
      await supabase
        .from('message_reactions')
        .delete()
        .eq('message_id', messageId)
        .eq('user_id', profile.id)
        .eq('emoji', emoji);
      await fetchMessages();
    } catch (error) {
      console.error('Error removing reaction:', error);
    }
  };

  const handleEdit = (messageId: string) => {
    const message = messages.find((m) => m.id === messageId);
    if (message) {
      setEditingMessageId(messageId);
      setEditContent(message.content);
    }
  };

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
      await fetchMessages();
    } catch (error) {
      console.error('Error editing message:', error);
      Alert.alert('Error', 'Failed to edit message.');
    }
  };

  const handleDelete = async (messageId: string) => {
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
            await fetchMessages();
          } catch (error) {
            console.error('Error deleting message:', error);
            Alert.alert('Error', 'Failed to delete message.');
          }
        },
      },
    ]);
  };

  return (
    <SafeAreaView className="flex-1 bg-cream" edges={['top']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1"
      >
        {/* Header */}
        <View className="flex-row items-center px-4 py-3 bg-white border-b border-cream">
          <Pressable onPress={onBack} className="mr-4">
            <Text className="text-2xl">←</Text>
          </Pressable>
          <View className="flex-1">
            <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-charcoal text-lg">
              {getRoomName()}
            </Text>
            {room.room_type === 'community' && (
              <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-charcoal/50 text-sm">
                Community chat
              </Text>
            )}
          </View>
        </View>

        {/* Messages */}
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <RoomMessageItem
              message={item}
              currentUserId={profile?.id}
              onReact={(emoji) => handleReact(item.id, emoji)}
              onRemoveReaction={(emoji) => handleRemoveReaction(item.id, emoji)}
              onEdit={() => handleEdit(item.id)}
              onDelete={() => handleDelete(item.id)}
            />
          )}
          contentContainerClassName="p-4 pb-2"
          ListEmptyComponent={
            <View className="items-center py-8">
              <Text className="text-4xl mb-2">💬</Text>
              <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-charcoal/50">
                No messages yet. Start the conversation!
              </Text>
            </View>
          }
          removeClippedSubviews={Platform.OS !== 'web'}
          maxToRenderPerBatch={10}
          windowSize={10}
          initialNumToRender={20}
          maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
        />

        {/* Typing indicator */}
        <RoomTypingIndicator typingUsers={typingUsers} currentUserId={profile?.id} />

        {/* Edit mode input */}
        {editingMessageId ? (
          <View className="px-4 py-3 bg-white">
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
            <View className="flex-row items-end bg-cream rounded-2xl px-3 py-2">
              <TextInput
                value={editContent}
                onChangeText={setEditContent}
                multiline
                className="flex-1 max-h-32 text-base text-charcoal py-1 px-1"
                style={{ fontFamily: 'Lato_400Regular', outlineStyle: 'none' } as any}
              />
              <Pressable
                onPress={handleSaveEdit}
                disabled={!editContent.trim()}
                className={`w-7 h-7 rounded-full items-center justify-center ml-2 ${
                  editContent.trim() ? 'bg-gold active:opacity-80' : 'bg-gray-300'
                }`}
              >
                <Ionicons name="checkmark" size={16} color="white" />
              </Pressable>
            </View>
          </View>
        ) : (
          /* Message input - matching ChatInput styling */
          <View className="px-4 py-3 bg-white">
            {/* Image previews */}
            {selectedImages.length > 0 && (
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
              </ScrollView>
            )}

            <View className="flex-row items-end bg-cream rounded-2xl px-3 py-2">
              {/* Photo button */}
              <Pressable
                onPress={handlePickImages}
                disabled={selectedImages.length >= 5 || sending}
                className="p-1 mr-1"
              >
                <Ionicons
                  name="image-outline"
                  size={22}
                  color={selectedImages.length >= 5 || sending ? '#ccc' : '#666'}
                />
                {selectedImages.length > 0 && (
                  <View className="absolute -top-1 -right-1 bg-gold rounded-full w-4 h-4 items-center justify-center">
                    <Text className="text-white text-xs font-bold">{selectedImages.length}</Text>
                  </View>
                )}
              </Pressable>

              <TextInput
                value={newMessage}
                onChangeText={handleTextChange}
                placeholder="Message..."
                placeholderTextColor="#9CA3AF"
                selectionColor="#313130"
                multiline
                maxLength={2000}
                className="flex-1 max-h-32 text-base text-charcoal py-1 px-1"
                style={{ fontFamily: 'Lato_400Regular', outlineStyle: 'none', caretColor: '#313130' } as any}
                editable={!sending}
              />
              <Pressable
                onPress={handleSend}
                disabled={(!newMessage.trim() && selectedImages.length === 0) || sending || uploading}
                className={`w-7 h-7 rounded-full items-center justify-center ml-2 ${
                  (newMessage.trim() || selectedImages.length > 0) && !sending && !uploading
                    ? 'bg-gold active:opacity-80'
                    : 'bg-gray-300'
                }`}
              >
                <Text className="text-sm text-white" style={{ marginTop: -1 }}>↑</Text>
              </Pressable>
            </View>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
