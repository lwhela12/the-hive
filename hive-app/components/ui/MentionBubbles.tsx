import { Pressable, ScrollView, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Avatar } from './Avatar';
import { hiveSeal } from '../../lib/hiveBrand';
import { type MentionTarget } from '../../lib/mentions';
import type { MentionableMember } from '../../lib/mentionableMembers';

/** The same choices work by tapping a face or typing an @ query. */
export function MentionBubbles({ suggestions, members, query, loading, disabled, selectedIds, onSelect }: {
  suggestions: MentionTarget[]; members: MentionableMember[]; query: string | null;
  loading: boolean; disabled: boolean; selectedIds: string[]; onSelect: (target: MentionTarget) => void;
}) {
  return <View style={{ marginTop: 8, gap: 6 }}>
    <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 12, color: '#706553' }}>
      {loading ? 'Loading people…' : query !== null ? `Matching @${query}` : 'Tap a person or HIVE, or type @'}
    </Text>
    <ScrollView horizontal keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 8, paddingBottom: 4 }}>
      {suggestions.map(target => {
        const selected = selectedIds.includes(target.id);
        const slug = target.group === 'hive_wide' ? null : target.handle === 'og' ? 'default' : target.handle;
        return <Pressable key={target.id} accessibilityRole="button" accessibilityLabel={`Mention ${target.name}`}
          accessibilityState={{ selected, disabled: disabled || target.disabled }} disabled={disabled || target.disabled}
          onPress={() => onSelect(target)} style={{ alignItems: 'center', width: 78, padding: 5, gap: 4, borderRadius: 12, borderWidth: 1,
            borderColor: selected ? '#bd9348' : 'transparent', backgroundColor: selected ? '#fdf3dc' : 'transparent' }}>
          {target.isBroadcast ? <Image source={hiveSeal(slug)} contentFit="contain" style={{ width: 36, height: 36 }} />
            : <Avatar name={target.name} url={members.find(member => member.id === target.id)?.avatar_url} size={36} />}
          <Text numberOfLines={2} style={{ fontFamily: 'Lato_700Bold', fontSize: 11, textAlign: 'center', color: '#514635' }}>
            {target.name.replace(/^Everyone in /, '').replace(/^Everyone /, '')}
          </Text>
        </Pressable>;
      })}
    </ScrollView>
    {!loading && suggestions.length === 0 && <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 12, color: '#706553' }}>No match for @{query}.</Text>}
  </View>;
}
