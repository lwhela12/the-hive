import { Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  getBroadcastMentionSuggestion,
  getMentionTargetHandle,
  type MentionTarget,
} from '../../lib/mentions';

interface MentionSuggestionsProps {
  suggestions: MentionTarget[];
  onSelect: (member: MentionTarget) => void;
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
  const broadcastFallback = active && suggestions.length === 0
    ? getBroadcastMentionSuggestion(query)
    : null;
  const visibleSuggestions = broadcastFallback ? [broadcastFallback] : suggestions;

  if (!active && visibleSuggestions.length === 0) return null;

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
      // A ten-person HIVE makes a long list; cap it and let it scroll rather
      // than push the composer off whatever screen it's on (Nat 2026-07-25).
      style={{ zIndex: 100, elevation: 20, maxHeight: 240 }}
    >
      {visibleSuggestions.length === 0 ? (
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
              Tag someone or everyone
            </Text>
          </View>
          <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled">
          {visibleSuggestions.map((member, index) => {
            const handle = getMentionTargetHandle(member);
            return (
              <Pressable
                key={member.id}
                onPress={() => onSelect(member)}
                className={`flex-row items-center px-3 py-2 active:bg-cream ${
                  index < visibleSuggestions.length - 1 ? 'border-b border-cream' : ''
                }`}
              >
                <View className="w-7 h-7 rounded-full bg-gold/15 items-center justify-center mr-2">
                  {member.isBroadcast ? (
                    <Ionicons name="people-outline" size={16} color="#bd9348" />
                  ) : (
                    <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-gold text-xs">
                      {member.name.charAt(0)}
                    </Text>
                  )}
                </View>
                <View className="flex-1">
                  <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-charcoal text-sm">
                    {member.name}
                  </Text>
                  {member.description && (
                    <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-charcoal/50 text-xs">
                      {member.description}
                    </Text>
                  )}
                </View>
                <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-gold text-sm ml-2">
                  @{handle}
                </Text>
              </Pressable>
            );
          })}
          </ScrollView>
        </>
      )}
    </View>
  );
}
