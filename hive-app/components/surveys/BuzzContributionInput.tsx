import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../lib/hooks/useAuth';
import { fetchMentionableMembersForHives, taggableHivesFromMemberships } from '../../lib/mentionableMembers';
import { ComposerBar } from '../ui/ComposerBar';
import { Pressable, Text, View } from 'react-native';

export function BuzzContributionInput({ value, onChangeText, placeholder, disabled }: {
  value: string; onChangeText: (text: string) => void; placeholder: string; disabled: boolean;
}) {
  const { profile, memberships } = useAuth();
  const ids = memberships.map(membership => membership.community_id).sort();
  const { data: members = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['buzzMentionMembers', profile?.id, ids], enabled: !!profile && ids.length > 0,
    staleTime: 10 * 60 * 1000, queryFn: () => fetchMentionableMembersForHives(ids, { throwOnError: true }),
  });
  return <View><ComposerBar tone="light" variant="form" containerClassName="mt-2" multiline minHeight={100}
    value={value} onChangeText={next => onChangeText(typeof next === 'function' ? next(value) : next)}
    placeholder={placeholder} editable={!disabled} mentionMembers={members} mentionsLoading={ids.length > 0 && isLoading}
    mentionPicker="bubbles" mentionReach={{ reach: 'all_hives', otherHives: taggableHivesFromMemberships(memberships), offerOtherHives: true }} />
    {isError && <Pressable accessibilityRole="button" onPress={() => refetch()} style={{ minHeight: 44, justifyContent: 'center' }}>
      <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 12, color: '#815e25' }}>Couldn’t load people. Try again</Text>
    </Pressable>}</View>;
}
