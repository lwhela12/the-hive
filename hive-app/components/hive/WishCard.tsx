import { View, Text, Pressable } from 'react-native';
import { Avatar } from '../ui/Avatar';
import type { Wish, Profile } from '../../types';

interface WishCardProps {
  wish: Wish & { user: Profile };
  onHelp?: () => void;
}

export function WishCard({ wish, onHelp }: WishCardProps) {
  return (
    <View className="bg-white rounded-xl p-4 shadow-sm mb-3">
      <View className="flex-row items-start">
        <Avatar name={wish.user.name} url={wish.user.avatar_url} size={44} />
        <View className="flex-1 ml-3">
          <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-charcoal">{wish.user.name}</Text>
          <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-charcoal/80 mt-1">{wish.description}</Text>

          <View className="flex-row items-center mt-3">
            <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-xs text-charcoal/40">
              {new Date(wish.created_at).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
              })}
            </Text>

            {onHelp && (
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
    </View>
  );
}
