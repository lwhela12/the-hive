import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Avatar } from '../ui/Avatar';
import { formatDateShort } from '../../lib/dateUtils';
import type { LinkedWish } from '../../lib/hooks/useBoardLinkedWishes';

interface BoardLinkedWishesProps {
  wishes: LinkedWish[];
  loading?: boolean;
  canAdd?: boolean;
  onAddWish?: () => void;
  onSelectWish: (wish: LinkedWish) => void;
}

export function BoardLinkedWishes({
  wishes,
  loading = false,
  canAdd = false,
  onAddWish,
  onSelectWish,
}: BoardLinkedWishesProps) {
  const openWishes = wishes.filter((wish) => wish.status !== 'fulfilled');
  const grantedWishes = wishes.filter((wish) => wish.status === 'fulfilled');

  return (
    <View className="bg-white rounded-xl border border-gold/20 p-4 mb-4">
      <View className="flex-row items-center mb-3">
        <View className="w-8 h-8 rounded-full bg-gold/10 items-center justify-center mr-2">
          <Ionicons name="sparkles-outline" size={17} color="#bd9348" />
        </View>
        <View className="flex-1">
          <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-charcoal">
            Linked Wishes
          </Text>
          <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-charcoal/50 text-xs">
            Concrete asks from this board also appear in Community Wishes.
          </Text>
        </View>
        {canAdd && onAddWish && (
          <Pressable
            onPress={onAddWish}
            className="bg-gold/10 border border-gold/20 rounded-full px-3 py-1.5 active:opacity-70"
          >
            <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-gold text-xs">
              + Wish
            </Text>
          </Pressable>
        )}
      </View>

      {loading ? (
        <View className="py-5 items-center">
          <ActivityIndicator color="#bd9348" />
        </View>
      ) : wishes.length === 0 ? (
        <View className="bg-cream/50 rounded-xl px-4 py-3">
          <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-charcoal/55 text-sm">
            No linked wishes yet. Add one when this board has a clear next ask.
          </Text>
        </View>
      ) : (
        <View>
          {[...openWishes, ...grantedWishes].map((wish) => {
            const isGranted = wish.status === 'fulfilled';
            return (
              <Pressable
                key={wish.id}
                onPress={() => onSelectWish(wish)}
                className={`rounded-xl border px-3 py-3 mb-2 active:opacity-75 ${
                  isGranted ? 'bg-gold/10 border-gold/20' : 'bg-cream/40 border-cream'
                }`}
              >
                <View className="flex-row items-start">
                  <Avatar name={wish.user.name} url={wish.user.avatar_url} size={32} />
                  <View className="flex-1 ml-3">
                    <View className="flex-row items-center">
                      <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-charcoal text-sm flex-1">
                        {wish.user.name}
                      </Text>
                      <View className={`rounded-full px-2 py-0.5 ${isGranted ? 'bg-gold' : 'bg-white'}`}>
                        <Text
                          style={{ fontFamily: 'Lato_700Bold' }}
                          className={`text-xs ${isGranted ? 'text-white' : 'text-gold'}`}
                        >
                          {isGranted ? 'Granted' : 'Open'}
                        </Text>
                      </View>
                    </View>
                    <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-charcoal/80 text-sm mt-1">
                      {wish.description}
                    </Text>
                    <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-charcoal/40 text-xs mt-2">
                      {isGranted && wish.fulfilled_at
                        ? `Granted ${formatDateShort(wish.fulfilled_at)}`
                        : `Added ${formatDateShort(wish.created_at)}`}
                    </Text>
                  </View>
                </View>
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}
