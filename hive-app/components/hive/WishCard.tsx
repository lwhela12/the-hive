import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { EditButton } from '../ui/EditButton';
import { Avatar } from '../ui/Avatar';
import { MemberProfileLink } from '../ui/MemberProfileLink';
import { ScopeBadge } from '../ui/ScopeBadge';
import { ReachPill } from '../ui/ReachPill';
import { formatDateShort } from '../../lib/dateUtils';
import { getWishBodyPreview, getWishQuickTitle, hasSeparateWishTitle } from '../../lib/wishDisplay';
import type { Wish, Profile, WishGranter } from '../../types';

type WishWithGranters = Wish & {
  user?: Profile | null;
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
  showBodyPreview?: boolean;
}

export function WishCard({
  wish,
  onHelp,
  onPress,
  onEdit,
  onDelete,
  onManage,
  canEdit,
  canDelete,
  showBodyPreview: shouldShowBodyPreview = true,
}: WishCardProps) {
  const isGranted = wish.status === 'fulfilled';
  const granters = wish.granters || [];
  const validGranters = granters.filter((g) => g.granter);
  const displayGranters = validGranters.slice(0, 3);
  const extraGranters = Math.max(validGranters.length - displayGranters.length, 0);
  const showManageButton = !!onManage && (canEdit || canDelete);
  const quickTitle = getWishQuickTitle(wish);
  const bodyPreview = getWishBodyPreview(wish);
  const showBodyPreview = shouldShowBodyPreview && hasSeparateWishTitle(wish);
  const ownerName = wish.user?.name?.trim() || 'HIVE member';
  const ownerAvatarUrl = wish.user?.avatar_url;
  const ownerId = wish.user?.id ?? wish.user_id;

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
        <MemberProfileLink
          memberId={ownerId}
          memberName={ownerName}
          stopPropagation
          hitSlop={8}
          className="active:opacity-70"
        >
          <Avatar name={ownerName} url={ownerAvatarUrl} size={44} />
        </MemberProfileLink>
        <View className="flex-1 ml-3">
          <View className="flex-row items-center">
            <View className="flex-1 flex-row items-center">
              <MemberProfileLink
                memberId={ownerId}
                memberName={ownerName}
                stopPropagation
                hitSlop={8}
                className="active:opacity-70"
              >
                <Text
                  style={{
                    fontFamily: isGranted ? 'Lato_400Regular' : 'Lato_700Bold',
                    color: isGranted ? '#7f715f' : '#2d2d2d',
                  }}
                >
                  {ownerName}
                </Text>
              </MemberProfileLink>
            </View>
            {showManageButton ? (
              <EditButton
                onPress={(event) => {
                  event.stopPropagation();
                  onManage?.();
                }}
                accessibilityLabel="Manage wish"
                style={{ marginLeft: 8 }}
              />
            ) : ((!isGranted && canEdit) || canDelete) && (
              <View className="flex-row items-center ml-2">
                {canEdit && onEdit && (
                  <EditButton
                    onPress={(event) => {
                      event.stopPropagation();
                      onEdit();
                    }}
                    accessibilityLabel="Edit wish"
                    style={{ marginRight: 4 }}
                  />
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
          <View className="flex-row items-center mt-3">
            <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-xs text-charcoal/40">
              {isGranted && wish.fulfilled_at
                ? `Granted · ${formatDateShort(wish.fulfilled_at)}`
                : formatDateShort(wish.created_at)}
            </Text>

            {/* Whose wish it is, and how far it travels — the one pill (Nat
                2026-08-19: "one toggle, one pill, one shape everywhere"). The
                shell keeps the HIVE's own colour so the HIVE-Wide wishes box
                still reads as three HIVEs rather than one long list. Public
                keeps the teal chip; the pill has no third state. */}
            <View className="ml-2">
              {((wish.share_scope as string) ?? 'hive') === 'public' ? (
                <ScopeBadge scope="public" communityId={wish.community_id} compact />
              ) : (
                <ReachPill
                  reach={(wish.share_scope as string) === 'all_hives' ? 'all_hives' : 'hive'}
                  communityId={wish.community_id}
                  size="sm"
                />
              )}
            </View>

            {/* Granter avatars for granted wishes */}
            {isGranted && displayGranters.length > 0 && (
              <View className="flex-row items-center ml-auto">
                <Text
                  style={{ fontFamily: 'Lato_400Regular' }}
                  className="text-xs text-charcoal/50 mr-2"
                >
                  by
                </Text>
                <View className="flex-row">
                  {displayGranters.map((g, index) => (
                    <MemberProfileLink
                      key={g.id}
                      memberId={g.granter?.id ?? g.granter_id}
                      memberName={g.granter?.name}
                      stopPropagation
                      hitSlop={6}
                      style={{ marginLeft: index > 0 ? -8 : 0, zIndex: 10 - index }}
                    >
                      <Avatar
                        name={g.granter?.name || 'Unknown'}
                        url={g.granter?.avatar_url}
                        size={24}
                      />
                    </MemberProfileLink>
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
