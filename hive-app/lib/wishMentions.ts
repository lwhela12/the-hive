import type { Profile } from '../types';
import { sendMentionNotifications } from './mentionableMembers';
import type { MentionReach } from './mentions';

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
  // Delegates to the one delivery path (2026-08-12): people named by hand
  // get a call each, a tagged whole HIVE or everyone HIVE-Wide goes to the
  // server as one group call, resolved where the member list is readable.
  sendMentionNotifications({
    target: { kind: 'wish', wishId, wishOwnerName },
    senderId,
    communityId,
    content,
    members,
    reach,
  });
}
