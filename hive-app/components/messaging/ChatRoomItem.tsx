import { View, Text, Pressable } from 'react-native';
import { formatDateShort } from '../../lib/dateUtils';
import type { ChatRoom, Profile, RoomMessage } from '../../types';

interface ChatRoomItemProps {
  room: ChatRoom & {
    members?: Array<{ user?: Profile }>;
    last_message?: RoomMessage & { sender?: Profile };
  };
  currentUserId?: string;
  onPress: () => void;
}

export function ChatRoomItem({ room, currentUserId, onPress }: ChatRoomItemProps) {
  // For DMs, show the other person's name
  const getRoomName = () => {
    if (room.room_type === 'community') {
      return room.name || 'General';
    }
    // Find the other member in a DM
    const otherMember = room.members?.find((m) => m.user?.id !== currentUserId);
    return otherMember?.user?.name || 'Direct Message';
  };

  const getInitial = () => {
    const name = getRoomName();
    return name.charAt(0).toUpperCase();
  };

  const getTimeAgo = (date: Date): string => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'now';
    if (diffMins < 60) return `${diffMins}m`;
    if (diffHours < 24) return `${diffHours}h`;
    if (diffDays < 7) return `${diffDays}d`;
    return formatDateShort(date);
  };

  const lastMessage = room.last_message;
  const hasUnread = (room.unread_count ?? 0) > 0;

  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center px-4 py-3 bg-white active:bg-cream"
    >
      {/* Avatar */}
      <View
        className={`w-12 h-12 rounded-full items-center justify-center mr-3 ${
          room.room_type === 'community' ? 'bg-gold' : 'bg-gold/20'
        }`}
      >
        <Text
          style={{ fontFamily: 'Lato_700Bold' }}
          className={`text-lg ${room.room_type === 'community' ? 'text-white' : 'text-gold'}`}
        >
          {room.room_type === 'community' ? '🐝' : getInitial()}
        </Text>
      </View>

      {/* Content */}
      <View className="flex-1">
        <View className="flex-row items-center justify-between mb-1">
          <Text
            style={{ fontFamily: hasUnread ? 'Lato_700Bold' : 'Lato_400Regular' }}
            className="text-charcoal"
          >
            {getRoomName()}
          </Text>
          {lastMessage && (
            <Text
              style={{ fontFamily: 'Lato_400Regular' }}
              className="text-charcoal/50 text-xs"
            >
              {getTimeAgo(new Date(lastMessage.created_at))}
            </Text>
          )}
        </View>
        {lastMessage && (
          <Text
            style={{ fontFamily: hasUnread ? 'Lato_700Bold' : 'Lato_400Regular' }}
            className={`text-sm ${hasUnread ? 'text-charcoal' : 'text-charcoal/60'}`}
            numberOfLines={1}
          >
            {lastMessage.sender?.name ? `${lastMessage.sender.name}: ` : ''}
            {lastMessage.deleted_at ? 'Message deleted' : lastMessage.content}
          </Text>
        )}
      </View>

      {/* Unread badge */}
      {hasUnread && (
        <View className="bg-gold rounded-full px-2 py-1 ml-2">
          <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-white text-xs">
            {room.unread_count}
          </Text>
        </View>
      )}
    </Pressable>
  );
}
