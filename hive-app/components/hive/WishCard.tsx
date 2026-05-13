import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Avatar } from '../ui/Avatar';
import { formatDateShort } from '../../lib/dateUtils';
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
  canEdit?: boolean;
  canDelete?: boolean;
}

export function WishCard({ wish, onHelp, onPress, onEdit, onDelete, canEdit, canDelete }: WishCardProps) {
  const isGranted = wish.status === 'fulfilled';
  const granters = wish.granters || [];
  const displayGranters = granters.filter((g) => g.granter).slice(0, 3);
  const extraGranters = granters.length - 3;

  return (
    <Pressable
      onPress={onPress}
      className="rounded-xl p-4 shadow-sm mb-3 active:opacity-80"
      style={{
        backgroundColor: isGranted ? '#f6e8c4' : '#fff8e8',
        borderWidth: 1,
        borderColor: isGranted ? 'rgba(189,147,72,0.28)' : 'rgba(222,193,129,0.45)',
      }}
    >
      <View className="flex-row items-start">
        <Avatar name={wish.user.name} url={wish.user.avatar_url} size={44} />
        <View className="flex-1 ml-3">
          <View className="flex-row items-center">
            <View className="flex-1 flex-row items-center">
              <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-charcoal">
                {wish.user.name}
              </Text>
              {isGranted && (
                <View className="ml-2 bg-gold px-2 py-0.5 rounded-full flex-row items-center">
                  <Ionicons name="checkmark-circle" size={10} color="#fff" />
                  <Text
                    style={{ fontFamily: 'Lato_700Bold' }}
                    className="text-white text-xs ml-1"
                  >
                    Granted
                  </Text>
                </View>
              )}
            </View>
            {((!isGranted && canEdit) || canDelete) && (
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
          <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-charcoal/80 mt-1">
            {wish.description}
          </Text>

          <View className="flex-row items-center mt-3">
            <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-xs text-charcoal/40">
              {isGranted && wish.fulfilled_at
                ? `Granted ${formatDateShort(wish.fulfilled_at)}`
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
