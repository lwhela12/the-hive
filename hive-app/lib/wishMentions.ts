import type { Profile } from '../types';
import { getMentionedMembers, type MentionReach } from './mentions';
import { supabase } from './supabase';

type MentionMember = Pick<Profile, 'id' | 'name'>;

interface NotifyWishMentionsOptions {
  wishId: string;
  senderId: string;
  communityId: string;
  content: string;
  members: MentionMember[];
  wishOwnerName?: string;
  /**
   * How far the wish itself travels — `wishes.share_scope`, wrapped by
   * `useMentionReach()`. It is what an everyone word on the wish is read
   * against, so the people told about a wish are people who can open it.
   * Left out, it settles on the group that travels least.
   */
  reach?: MentionReach | null;
}

export function notifyWishMentions({
  wishId,
  senderId,
  communityId,
  content,
  members,
  wishOwnerName,
  reach = null,
}: NotifyWishMentionsOptions) {
  const mentionedMembers = getMentionedMembers(content, members, senderId, reach);
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
