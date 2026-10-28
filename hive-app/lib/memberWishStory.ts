import { pickSpotlightWish } from './wishDisplay';

export type StoryWish = {
  id: string; user_id: string; description: string; title?: string | null;
  status: string; is_active: boolean | null; is_spotlight?: boolean;
  created_at: string; fulfilled_at?: string | null;
  owner?: { name: string } | null;
  granters?: { granter_id: string; granter?: { name: string } | null }[];
};
export type StoryTask = {
  id: string; description: string; assigned_to: string | null; related_user_id: string | null;
  completed: boolean; completed_at: string | null; related_wish_id: string | null;
  assignee?: { name: string } | null; recipient?: { name: string } | null;
};

export function memberWishStory(memberId: string, wishes: StoryWish[], tasks: StoryTask[], since: string) {
  const mine = wishes.filter(w => w.user_id === memberId).sort((a,b) => b.created_at.localeCompare(a.created_at));
  const current = mine.filter(w => w.status === 'public' && w.is_active !== false);
  const done = tasks.filter(t => t.completed && !!t.completed_at && t.completed_at >= since);
  const received = done.filter(t => t.related_user_id === memberId && t.assigned_to !== memberId && !!t.assigned_to);
  const given = done.filter(t => t.assigned_to === memberId && !!t.related_user_id && t.related_user_id !== memberId);
  return {
    current, spotlight: pickSpotlightWish(current),
    history: mine.filter(w => !current.some(c => c.id === w.id)),
    ownDone: done.filter(t => t.assigned_to === memberId && (!t.related_user_id || t.related_user_id === memberId)),
    received, given,
    granted: wishes.filter(w => w.status === 'fulfilled' && !!w.fulfilled_at && w.fulfilled_at >= since
      && (w.user_id === memberId || w.granters?.some(g => g.granter_id === memberId))),
    next: tasks.filter(t => !t.completed && (t.assigned_to === memberId || t.related_user_id === memberId)),
  };
}
