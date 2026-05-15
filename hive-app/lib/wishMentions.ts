import type { Profile } from '../types';
import { getMentionedMembers } from './mentions';
import { supabase } from './supabase';

type MentionMember = Pick<Profile, 'id' | 'name'>;

interface NotifyWishMentionsOptions {
  wishId: string;
  senderId: string;
  communityId: string;
  content: string;
  members: MentionMember[];
  wishOwnerName?: string;
}

export function notifyWishMentions({
  wishId,
  senderId,
  communityId,
  content,
  members,
  wishOwnerName,
}: NotifyWishMentionsOptions) {
  const mentionedMembers = getMentionedMembers(content, members, senderId);
  const preview = content.trim();
  if (!preview || mentionedMembers.length === 0) return;

  mentionedMembers.forEach((member) => {
    supabase.functions.invoke('notify-wish-mention', {
      body: {
        wish_id: wishId,
        sender_id: senderId,
        recipient_id: member.id,
        message_preview: preview,
        community_id: communityId,
        wish_owner_name: wishOwnerName,
      },
    }).catch((err) => console.log('Wish mention notification error (non-blocking):', err));
  });
}
