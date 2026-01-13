import { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/hooks/useAuth';
import { RoomMessageItem } from './RoomMessageItem';
import { RoomTypingIndicator } from './RoomTypingIndicator';
import type { ChatRoom, RoomMessage, Profile, MessageReaction, TypingIndicator } from '../../types';

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

  const scrollViewRef = useRef<ScrollView>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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
    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 100);
  }, [messages.length]);

  const sendTypingIndicator = async () => {
    if (!profile) return;

    try {
      await supabase.from('typing_indicators').upsert({
        room_id: room.id,
        user_id: profile.id,
        updated_at: new Date().toISOString(),
      });
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

  const handleSend = async () => {
    if (!newMessage.trim() || !profile || !communityId) return;

    setSending(true);
    try {
      clearTypingIndicator();

      const { error } = await supabase.from('room_messages').insert({
        community_id: communityId,
        room_id: room.id,
        sender_id: profile.id,
        content: newMessage.trim(),
      });

      if (error) throw error;

      setNewMessage('');
    } catch (error) {
      console.error('Error sending message:', error);
      Alert.alert('Error', 'Failed to send message.');
    } finally {
      setSending(false);
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
        <ScrollView
          ref={scrollViewRef}
          className="flex-1"
          contentContainerClassName="py-4"
        >
          {messages.length === 0 ? (
            <View className="items-center py-8">
              <Text className="text-4xl mb-2">💬</Text>
              <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-charcoal/50">
                No messages yet. Start the conversation!
              </Text>
            </View>
          ) : (
            messages.map((message) => (
              <RoomMessageItem
                key={message.id}
                message={message}
                currentUserId={profile?.id}
                onReact={(emoji) => handleReact(message.id, emoji)}
                onRemoveReaction={(emoji) => handleRemoveReaction(message.id, emoji)}
                onEdit={() => handleEdit(message.id)}
                onDelete={() => handleDelete(message.id)}
              />
            ))
          )}
        </ScrollView>

        {/* Typing indicator */}
        <RoomTypingIndicator typingUsers={typingUsers} currentUserId={profile?.id} />

        {/* Edit mode input */}
        {editingMessageId ? (
          <View className="bg-white border-t border-cream p-4">
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
            <View className="flex-row items-center">
              <TextInput
                value={editContent}
                onChangeText={setEditContent}
                className="flex-1 bg-cream rounded-xl px-4 py-3 mr-2"
                style={{ fontFamily: 'Lato_400Regular' }}
              />
              <Pressable
                onPress={handleSaveEdit}
                disabled={!editContent.trim()}
                className={`px-4 py-3 rounded-xl ${
                  editContent.trim() ? 'bg-gold' : 'bg-cream'
                }`}
              >
                <Text
                  style={{ fontFamily: 'Lato_700Bold' }}
                  className={editContent.trim() ? 'text-white' : 'text-charcoal/30'}
                >
                  Save
                </Text>
              </Pressable>
            </View>
          </View>
        ) : (
          /* Message input */
          <View className="bg-white border-t border-cream p-4">
            <View className="flex-row items-center">
              <TextInput
                value={newMessage}
                onChangeText={handleTextChange}
                placeholder="Type a message..."
                placeholderTextColor="#9ca3af"
                multiline
                className="flex-1 bg-cream rounded-xl px-4 py-3 mr-2 max-h-24"
                style={{ fontFamily: 'Lato_400Regular' }}
              />
              <Pressable
                onPress={handleSend}
                disabled={!newMessage.trim() || sending}
                className={`px-4 py-3 rounded-xl ${
                  newMessage.trim() && !sending ? 'bg-gold' : 'bg-cream'
                }`}
              >
                <Text
                  style={{ fontFamily: 'Lato_700Bold' }}
                  className={newMessage.trim() && !sending ? 'text-white' : 'text-charcoal/30'}
                >
                  Send
                </Text>
              </Pressable>
            </View>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
