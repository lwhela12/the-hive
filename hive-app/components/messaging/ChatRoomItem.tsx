import { View, Text, Pressable, Image } from 'react-native';
import { Avatar } from '../ui/Avatar';
import { formatDateShort } from '../../lib/dateUtils';

const hiveLogo = require('../../assets/The Hive Logo_Low Res (1).png');
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
  // For DMs, get the other person's info
  const otherMember = room.members?.find((m) => m.user?.id !== currentUserId)?.user;

  const getRoomName = () => {
    if (room.room_type === 'community') {
      return room.name || 'General';
    }
    return otherMember?.name || 'Direct Message';
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
      {room.room_type === 'community' ? (
        <View className="w-12 h-12 rounded-full mr-3 overflow-hidden">
          <Image source={hiveLogo} style={{ width: 48, height: 48 }} resizeMode="cover" />
        </View>
      ) : (
        <View className="mr-3">
          <Avatar
            name={otherMember?.name || 'DM'}
            url={otherMember?.avatar_url}
            size={48}
          />
        </View>
      )}

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
