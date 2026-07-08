import { memo } from 'react';
import { View, Text, Pressable, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Avatar } from '../ui/Avatar';
import { MemberProfileLink } from '../ui/MemberProfileLink';
import { formatDateShort } from '../../lib/dateUtils';
import {
  getChatRoomTheme,
  getOtherRoomMembers,
  getRoomCustomization,
  getRoomDisplayName,
} from '../../lib/chatRoomDisplay';

const hiveLogo = require('../../assets/HIVE Logo Transparent  BG.png');
import type { ChatRoom, Profile, RoomMessage } from '../../types';

interface ChatRoomItemProps {
  room: ChatRoom & {
    members?: Array<{ user?: Profile }>;
    last_message?: RoomMessage & { sender?: Profile };
  };
  currentUserId?: string;
  onPress: () => void;
  onCustomize?: () => void;
}

export const ChatRoomItem = memo(function ChatRoomItem({
  room,
  currentUserId,
  onPress,
  onCustomize,
}: ChatRoomItemProps) {
  const otherMembers = getOtherRoomMembers(room, currentUserId);
  const otherMember = otherMembers[0];
  const customization = getRoomCustomization(room, currentUserId);
  const theme = getChatRoomTheme(room, currentUserId);
  const roomName = getRoomDisplayName(room, currentUserId);

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

  // Render avatar based on room type
  const renderAvatar = () => {
    if (customization.imageUrl) {
      return (
        <View
          className="w-12 h-12 rounded-full mr-3 overflow-hidden"
          style={{ backgroundColor: theme.surface }}
        >
          <Image source={{ uri: customization.imageUrl }} style={{ width: 48, height: 48 }} resizeMode="cover" />
        </View>
      );
    }

    if (customization.emoji) {
      return (
        <View
          className="w-12 h-12 rounded-full mr-3 items-center justify-center"
          style={{ backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border }}
        >
          <Text style={{ fontSize: 24, lineHeight: 30 }}>{customization.emoji}</Text>
        </View>
      );
    }

    if (room.room_type === 'community') {
      return (
        <View className="w-12 h-12 rounded-full mr-3 overflow-hidden">
          <Image source={hiveLogo} style={{ width: 48, height: 48 }} resizeMode="cover" />
        </View>
      );
    }

    if (room.room_type === 'group_dm') {
      // Stacked avatars for group DMs (show up to 2 overlapping)
      const displayMembers = otherMembers.slice(0, 2);
      return (
        <View className="w-12 h-12 mr-3 relative">
          {displayMembers.length >= 2 && (
            <MemberProfileLink
              memberId={displayMembers[1].id}
              memberName={displayMembers[1].name}
              stopPropagation
              className="absolute top-0 right-0 active:opacity-70"
            >
              <Avatar
                name={displayMembers[1].name}
                url={displayMembers[1].avatar_url}
                size={32}
              />
            </MemberProfileLink>
          )}
          {displayMembers.length >= 1 && (
            <MemberProfileLink
              memberId={displayMembers[0].id}
              memberName={displayMembers[0].name}
              stopPropagation
              className={displayMembers.length >= 2 ? 'absolute bottom-0 left-0 active:opacity-70' : 'active:opacity-70'}
            >
              <Avatar
                name={displayMembers[0].name}
                url={displayMembers[0].avatar_url}
                size={displayMembers.length >= 2 ? 32 : 48}
              />
            </MemberProfileLink>
          )}
          {displayMembers.length === 0 && (
            <View className="w-12 h-12 rounded-full bg-gold/20 items-center justify-center">
              <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-gold text-lg">
                G
              </Text>
            </View>
          )}
          {/* Badge showing total count if more than 2 */}
          {otherMembers.length > 2 && (
            <View className="absolute -bottom-1 -right-1 bg-charcoal rounded-full w-5 h-5 items-center justify-center">
              <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-white text-xs">
                +{otherMembers.length - 2}
              </Text>
            </View>
          )}
        </View>
      );
    }

    // Regular DM
    return (
      <MemberProfileLink
        memberId={otherMember?.id}
        memberName={otherMember?.name}
        stopPropagation
        className="mr-3 active:opacity-70"
      >
        <Avatar
          name={otherMember?.name || 'DM'}
          url={otherMember?.avatar_url}
          size={48}
        />
      </MemberProfileLink>
    );
  };

  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center px-4 py-3 active:opacity-80"
      style={{
        marginHorizontal: 12,
        marginVertical: 6,
        minHeight: 76,
        borderRadius: 20,
        borderWidth: hasUnread ? 1.5 : 1,
        borderColor: hasUnread ? theme.accent : theme.border,
        backgroundColor: hasUnread ? theme.unreadBackground : theme.listBackground,
        shadowColor: theme.accent,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: hasUnread ? 0.16 : 0.09,
        shadowRadius: 18,
        elevation: hasUnread ? 4 : 2,
      }}
    >
      <View
        className="absolute left-0 top-4 bottom-4 rounded-r-full"
        style={{ width: 3, backgroundColor: theme.accent, opacity: customization.themeKey === 'honey' ? 0.28 : 0.7 }}
      />

      {/* Avatar */}
      {renderAvatar()}

      {/* Content */}
      <View className="flex-1">
        <View className="flex-row items-center justify-between mb-1">
          <Text
            style={{ fontFamily: hasUnread ? 'Lato_700Bold' : 'Lato_400Regular' }}
            className="text-charcoal flex-1 mr-2"
            numberOfLines={1}
          >
            {roomName}
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
        <View className="rounded-full px-2 py-1 ml-2" style={{ backgroundColor: theme.accent }}>
          <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-white text-xs">
            {room.unread_count}
          </Text>
        </View>
      )}

      {onCustomize ? (
        <Pressable
          onPress={(event) => {
            event.stopPropagation();
            onCustomize();
          }}
          className="ml-2 w-9 h-9 rounded-full items-center justify-center active:opacity-70"
          style={{ backgroundColor: theme.accentSoft }}
          hitSlop={8}
        >
          <Ionicons name="color-palette-outline" size={17} color={theme.accent} />
        </Pressable>
      ) : null}
    </Pressable>
  );
});
