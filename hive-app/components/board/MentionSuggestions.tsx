import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Profile } from '../../types';

interface MentionSuggestionsProps {
  suggestions: Pick<Profile, 'id' | 'name'>[];
  onSelect: (member: Pick<Profile, 'id' | 'name'>) => void;
  placement?: 'above' | 'below';
  active?: boolean;
  query?: string | null;
  loading?: boolean;
}

export function MentionSuggestions({
  suggestions,
  onSelect,
  placement = 'below',
  active = suggestions.length > 0,
  query = null,
  loading = false,
}: MentionSuggestionsProps) {
  if (!active && suggestions.length === 0) return null;

  const emptyLabel = loading
    ? 'Loading people...'
    : query
      ? `No match for @${query}`
      : 'Type a name after @ to tag someone';

  return (
    <View
      className={`bg-white border border-gold/30 rounded-xl overflow-hidden shadow-sm ${
        placement === 'above' ? 'mb-2' : 'mt-2'
      }`}
      style={{ zIndex: 100, elevation: 20 }}
    >
      {suggestions.length === 0 ? (
        <View className="flex-row items-center px-3 py-2">
          <Ionicons
            name={loading ? 'hourglass-outline' : 'person-add-outline'}
            size={17}
            color="#bd9348"
          />
          <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-charcoal/70 text-sm ml-2">
            {emptyLabel}
          </Text>
        </View>
      ) : (
        <>
          <View className="px-3 py-1.5 bg-gold/10">
            <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-gold text-xs uppercase">
              Tag someone
            </Text>
          </View>
          {suggestions.map((member, index) => (
            <Pressable
              key={member.id}
              onPress={() => onSelect(member)}
              className={`flex-row items-center px-3 py-2 active:bg-cream ${
                index < suggestions.length - 1 ? 'border-b border-cream' : ''
              }`}
            >
              <View className="w-7 h-7 rounded-full bg-gold/15 items-center justify-center mr-2">
                <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-gold text-xs">
                  {member.name.charAt(0)}
                </Text>
              </View>
              <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-charcoal text-sm">
                {member.name}
              </Text>
              <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-gold text-sm ml-auto">
                @{member.name.split(/\s+/)[0]}
              </Text>
            </Pressable>
          ))}
        </>
      )}
    </View>
  );
}
