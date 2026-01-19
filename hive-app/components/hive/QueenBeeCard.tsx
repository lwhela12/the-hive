import { View, Text, Pressable } from 'react-native';
import { useState } from 'react';
import { Avatar } from '../ui/Avatar';
import type { QueenBee, Profile, MonthlyHighlight } from '../../types';

interface QueenBeeCardProps {
  queenBee: QueenBee & { user: Profile; highlights?: MonthlyHighlight[] };
  onAddUpdate?: () => void;
}

export function QueenBeeCard({ queenBee, onAddUpdate }: QueenBeeCardProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Pressable
      onPress={() => setExpanded(!expanded)}
      className="bg-white rounded-xl p-4 shadow-sm border-2 border-gold-light"
    >
      <View className="flex-row items-center">
        <View className="relative">
          <Avatar name={queenBee.user.name} url={queenBee.user.avatar_url} size={56} />
          <Text className="absolute -top-1 -right-1 text-lg">👑</Text>
        </View>
        <View className="flex-1 ml-4">
          <Text style={{ fontFamily: 'LibreBaskerville_700Bold' }} className="text-lg text-charcoal">
            {queenBee.user.name}
          </Text>
          <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-gold">
            {queenBee.project_title}
          </Text>
        </View>
        <Text className="text-2xl text-gold">{expanded ? '▲' : '▼'}</Text>
      </View>

      {expanded && (
        <View className="mt-4 pt-4 border-t border-cream">
          {queenBee.project_description && (
            <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-charcoal mb-4">
              {queenBee.project_description}
            </Text>
          )}

          {/* Notes/Highlights */}
          {queenBee.highlights && queenBee.highlights.length > 0 && (
            <View className="mb-4">
              <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-charcoal/70 text-sm mb-2">
                Notes
              </Text>
              {queenBee.highlights.map((highlight) => (
                <View key={highlight.id} className="flex-row items-start mb-2">
                  <Text className="text-gold mr-2">•</Text>
                  <View className="flex-1">
                    <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-charcoal">
                      {highlight.highlight}
                    </Text>
                    {highlight.creator && (
                      <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-charcoal/50 text-xs mt-0.5">
                        — {highlight.creator.name}
                      </Text>
                    )}
                  </View>
                </View>
              ))}
            </View>
          )}

          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center">
              <View
                className={`px-2 py-1 rounded-full ${
                  queenBee.status === 'active'
                    ? 'bg-green-100'
                    : queenBee.status === 'upcoming'
                    ? 'bg-cream'
                    : 'bg-gray-100'
                }`}
              >
                <Text
                  style={{ fontFamily: 'Lato_700Bold' }}
                  className={`text-xs capitalize ${
                    queenBee.status === 'active'
                      ? 'text-green-700'
                      : queenBee.status === 'upcoming'
                      ? 'text-gold'
                      : 'text-charcoal/60'
                  }`}
                >
                  {queenBee.status}
                </Text>
              </View>
            </View>

            {onAddUpdate && (
              <Pressable
                onPress={onAddUpdate}
                className="bg-cream px-3 py-1 rounded-lg active:bg-gold-light"
              >
                <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-gold text-sm">
                  Add Update
                </Text>
              </Pressable>
            )}
          </View>
        </View>
      )}
    </Pressable>
  );
}
