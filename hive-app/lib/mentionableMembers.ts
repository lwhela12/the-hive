import type { Profile } from '../types';
import { supabase } from './supabase';

export type MentionableMember = Pick<Profile, 'id' | 'name'> & { avatar_url?: string | null };

export async function fetchCommunityMentionableMembers(communityId: string): Promise<MentionableMember[]> {
  const { data: memberships, error: membershipError } = await supabase
    .from('community_memberships')
    .select('user_id')
    .eq('community_id', communityId);

  if (membershipError) {
    console.warn('[Mentions] community memberships load failed', membershipError);
    return [];
  }

  const userIds = (memberships ?? []).map((row: any) => row.user_id).filter(Boolean);
  if (userIds.length === 0) return [];

  const { data: profilesData, error: profilesError } = await supabase
    .from('profiles')
    .select('id, name, avatar_url')
    .in('id', userIds);

  if (profilesError) {
    console.warn('[Mentions] member profiles load failed', profilesError);
    return [];
  }

  return (profilesData ?? [])
    .filter((user: any): user is MentionableMember => !!user?.id && !!user?.name)
    .sort((a, b) => a.name.localeCompare(b.name));
}
