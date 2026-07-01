import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Avatar } from '../ui/Avatar';
import { formatDateShort } from '../../lib/dateUtils';
import { getLinkedBoardLabel } from '../../lib/boardWishLinks';
import { getWishBodyPreview, getWishQuickTitle, hasSeparateWishTitle } from '../../lib/wishDisplay';
import type { Wish, Profile, WishGranter } from '../../types';

type WishWithGranters = Wish & {
  user: Profile;
  granters?: (WishGranter & { granter?: Profile })[];
};

interface WishCardProps {
  wish: WishWithGranters;
  onHelp?: () => void;
  onPress?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onManage?: () => void;
  canEdit?: boolean;
  canDelete?: boolean;
}

export function WishCard({ wish, onHelp, onPress, onEdit, onDelete, onManage, canEdit, canDelete }: WishCardProps) {
  const isGranted = wish.status === 'fulfilled';
  const granters = wish.granters || [];
  const displayGranters = granters.filter((g) => g.granter).slice(0, 3);
  const extraGranters = granters.length - 3;
  const linkedBoardLabel = getLinkedBoardLabel(wish.board_category);
  const showManageButton = !!onManage && (canEdit || canDelete);
  const quickTitle = getWishQuickTitle(wish);
  const bodyPreview = getWishBodyPreview(wish);
  const showBodyPreview = hasSeparateWishTitle(wish);

  return (
    <Pressable
      onPress={onPress}
      className="rounded-xl p-4 shadow-sm mb-3 active:opacity-80"
      style={{
        backgroundColor: isGranted ? '#fffdf5' : '#fff8e8',
        borderWidth: 1,
        borderColor: isGranted ? 'rgba(222,193,129,0.28)' : 'rgba(222,193,129,0.5)',
        shadowOpacity: isGranted ? 0.04 : 0.1,
      }}
    >
      <View className="flex-row items-start">
        <Avatar name={wish.user.name} url={wish.user.avatar_url} size={44} />
        <View className="flex-1 ml-3">
          <View className="flex-row items-center">
            <View className="flex-1 flex-row items-center">
              <Text
                style={{
                  fontFamily: isGranted ? 'Lato_400Regular' : 'Lato_700Bold',
                  color: isGranted ? '#7f715f' : '#2d2d2d',
                }}
              >
                {wish.user.name}
              </Text>
            </View>
            {showManageButton ? (
              <Pressable
                onPress={(event) => {
                  event.stopPropagation();
                  onManage?.();
                }}
                className="w-8 h-8 rounded-full items-center justify-center active:bg-cream ml-2"
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Manage wish"
              >
                <Ionicons name="pencil-outline" size={17} color="#4A4A4A" />
              </Pressable>
            ) : ((!isGranted && canEdit) || canDelete) && (
              <View className="flex-row items-center ml-2">
                {canEdit && onEdit && (
                  <Pressable
                    onPress={(event) => {
                      event.stopPropagation();
                      onEdit();
                    }}
                    className="w-8 h-8 rounded-full items-center justify-center active:bg-cream"
                    hitSlop={8}
                  >
                    <Ionicons name="pencil-outline" size={17} color="#4A4A4A" />
                  </Pressable>
                )}
                {canDelete && onDelete && (
                  <Pressable
                    onPress={(event) => {
                      event.stopPropagation();
                      onDelete();
                    }}
                    className="w-8 h-8 rounded-full items-center justify-center active:bg-red-50"
                    hitSlop={8}
                  >
                    <Ionicons name="trash-outline" size={17} color="#ef4444" />
                  </Pressable>
                )}
              </View>
            )}
          </View>
          <Text
            style={{
              fontFamily: isGranted ? 'Lato_400Regular' : 'Lato_700Bold',
              color: isGranted ? '#7f715f' : '#2d2d2d',
              fontStyle: isGranted ? 'italic' : 'normal',
              textDecorationLine: isGranted ? 'line-through' : 'none',
              fontSize: 15,
              lineHeight: 21,
            }}
            className="mt-1"
            numberOfLines={2}
          >
            {quickTitle}
          </Text>
          {showBodyPreview && (
            <Text
              style={{
                fontFamily: 'Lato_400Regular',
                color: isGranted ? '#8d7d68' : 'rgba(45,45,45,0.68)',
                fontStyle: isGranted ? 'italic' : 'normal',
                textDecorationLine: isGranted ? 'line-through' : 'none',
                fontSize: 14,
                lineHeight: 20,
                marginTop: 4,
              }}
              numberOfLines={3}
            >
              {bodyPreview}
            </Text>
          )}
          {linkedBoardLabel && (
            <View
              className="self-start flex-row items-center rounded-full px-2 py-1 mt-2"
              style={{
                backgroundColor: isGranted ? 'rgba(245,234,209,0.34)' : 'rgba(255,255,255,0.72)',
                borderWidth: 1,
                borderColor: isGranted ? 'rgba(189,147,72,0.16)' : 'rgba(189,147,72,0.2)',
              }}
            >
              <Ionicons name="link-outline" size={12} color={isGranted ? '#9a8060' : '#bd9348'} />
              <Text
                style={{
                  fontFamily: 'Lato_700Bold',
                  color: isGranted ? '#9a8060' : '#bd9348',
                  fontSize: 12,
                  marginLeft: 4,
                }}
              >
                {linkedBoardLabel}
              </Text>
            </View>
          )}

          <View className="flex-row items-center mt-3">
            <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-xs text-charcoal/40">
              {isGranted && wish.fulfilled_at
                ? `Granted · ${formatDateShort(wish.fulfilled_at)}`
                : formatDateShort(wish.created_at)}
            </Text>

            {/* Granter avatars for granted wishes */}
            {isGranted && granters.length > 0 && (
              <View className="flex-row items-center ml-auto">
                <Text
                  style={{ fontFamily: 'Lato_400Regular' }}
                  className="text-xs text-charcoal/50 mr-2"
                >
                  by
                </Text>
                <View className="flex-row">
                  {displayGranters.map((g, index) => (
                    <View
                      key={g.id}
                      style={{ marginLeft: index > 0 ? -8 : 0, zIndex: 10 - index }}
                    >
                      <Avatar
                        name={g.granter?.name || 'Unknown'}
                        url={g.granter?.avatar_url}
                        size={24}
                      />
                    </View>
                  ))}
                  {extraGranters > 0 && (
                    <View
                      className="bg-charcoal/20 rounded-full items-center justify-center"
                      style={{ width: 24, height: 24, marginLeft: -8 }}
                    >
                      <Text
                        style={{ fontFamily: 'Lato_700Bold' }}
                        className="text-charcoal text-xs"
                      >
                        +{extraGranters}
                      </Text>
                    </View>
                  )}
                </View>
              </View>
            )}

            {/* I can help button for open wishes */}
            {!isGranted && onHelp && (
              <Pressable
                onPress={onHelp}
                className="ml-auto bg-cream px-3 py-1 rounded-full active:bg-gold-light"
              >
                <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-gold text-sm">
                  I can help
                </Text>
              </Pressable>
            )}
          </View>
        </View>
      </View>
    </Pressable>
  );
}
