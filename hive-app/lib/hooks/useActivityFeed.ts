import { useQuery } from '@tanstack/react-query';
import { supabase } from '../supabase';
import {
  getSurveyAvailableAt,
  getSurveyResponsePeriod,
  isMonthlyCheckInSurvey,
  type Survey,
} from './useSurveys';

export interface ActivityItem {
  id: string;
  type: 'wish_posted' | 'wish_granted' | 'event_added' | 'board_post' | 'board_reply' | 'chat_message' | 'member_joined' | 'app_update' | 'survey_open' | 'mention' | 'newsletter_released';
  emoji: string;
  text: string;
  timestamp: string; // ISO string
  sourceId: string;  // the DB record ID (post id, event id, wish id, user id)
  categoryId?: string; // board activity only — to deep-link into the right topic
  navigatesTo?: 'board' | 'event' | 'members' | 'wish' | 'messages' | 'tuneup'; // screens that can be navigated to
  involvesUserIds?: string[]; // member ids involved in this item — used by the "Mentions me" filter
}

// One shared empty array rather than a fresh `[]` each render. `hive.tsx`
// lists `activityItems` in effect and memo dependencies, and a new array
// identity every render would re-run all of them while the feed loads.
const EMPTY_ITEMS: ActivityItem[] = [];

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) + '…' : text;
}

async function fetchMentionNotifications(communityId: string, userId: string | undefined, since: string) {
  if (!userId) return [];

  const baseQuery = () => supabase
    .from('notifications')
    .select('id, notification_type, title, content, created_at, related_wish_id, metadata')
    .eq('community_id', communityId)
    .eq('user_id', userId)
    .in('notification_type', ['board_mention', 'wish_mention', 'chat_mention'])
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(20);

  const { data, error } = await baseQuery();
  if (!error) return data ?? [];

  if (String(error.message ?? '').includes('metadata')) {
    const fallback = await supabase
      .from('notifications')
      .select('id, notification_type, title, content, created_at, related_wish_id')
      .eq('community_id', communityId)
      .eq('user_id', userId)
      .in('notification_type', ['board_mention', 'wish_mention', 'chat_mention'])
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(20);
    if (!fallback.error) return fallback.data ?? [];
  }

  console.warn('Activity mention notifications error:', error);
  return [];
}

async function fetchBoardReplyActivity(communityId: string, since: string) {
  const { data, error } = await supabase
    .from('board_replies')
    .select(
      'id, post_id, parent_reply_id, content, created_at, author_id, author:profiles!board_replies_author_id_fkey(name), post:board_posts!board_replies_post_id_fkey(id, title, category_id, category:board_categories!board_posts_category_id_fkey(name, topic_kind))'
    )
    .eq('community_id', communityId)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(30);

  if (error) {
    console.warn('Activity board replies error:', error);
    return [];
  }

  // The HIVE Newsletter board (topic_kind 'newsletter') is where members
  // collaboratively draft each issue — real threads, but drafting noise, not
  // community activity. Nat: "Newsletter was a board at one point, now it's
  // not. Nothing about the newsletter should populate in recent activity
  // except for 'newsletter is released.'" The release itself gets its own
  // item — see fetchNewsletterReleases below.
  return (data ?? []).filter((r: any) => {
    const post = firstRelation(r.post);
    const category = firstRelation((post as any)?.category);
    return (category as any)?.topic_kind !== 'newsletter';
  });
}

async function fetchGeneralDiscussionActivity(communityId: string, since: string) {
  const { data, error } = await supabase
    .from('room_messages')
    .select(
      'id, room_id, content, attachments, created_at, sender_id, sender:profiles!room_messages_sender_id_fkey(name), room:chat_rooms!room_messages_room_id_fkey(id, name, room_type)'
    )
    .eq('community_id', communityId)
    .is('deleted_at', null)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(30);

  if (error) {
    console.warn('Activity general discussion messages error:', error);
    return [];
  }

  return (data ?? []).filter((message: any) => {
    const room = firstRelation(message.room);
    return room?.room_type === 'community' && String(room?.name ?? '').toLowerCase() === 'general discussion';
  });
}

function firstRelation<T = any>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

// A newsletter issue is "released" the moment its board post goes visibility
// 'public' — that is what the public_newsletters view (migration 126) and
// the-hive.app read. There is no dedicated "sent at" column, so this uses
// edited_at when the flip to public bumped it, falling back to created_at
// (which is what every published issue so far has, some backfilled to match
// when it actually went out). Looked up by topic_kind rather than a hardcoded
// board id, same as newsletter.tsx's own board lookup, so this keeps working
// if the board is ever recreated or another HIVE gets its own.
// The board lookup and the post fetch used to be two awaits back to back,
// which made this the only two-deep leg inside the Promise.all below — every
// other branch is one round trip, so the whole feed waited on this one's
// second hop. An `!inner` embed asks Postgres the same question in a single
// trip: give me the public posts whose board is a newsletter board. Still
// looked up by `topic_kind` rather than a hardcoded board id, same as
// newsletter.tsx, so it keeps working if a board is recreated or another
// HIVE gets its own.
async function fetchNewsletterReleases(communityId: string, since: string) {
  const { data, error } = await supabase
    .from('board_posts')
    .select('id, title, category_id, created_at, edited_at, status, category:board_categories!inner(topic_kind)')
    .eq('category.topic_kind', 'newsletter')
    .eq('community_id', communityId)
    .eq('visibility', 'public')
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) {
    console.warn('Activity newsletter releases error:', error);
    return [];
  }

  return (data ?? [])
    .filter((row: any) => row.status !== 'archived')
    .map((row: any) => ({ ...row, releasedAt: row.edited_at ?? row.created_at }))
    .filter((row: any) => row.releasedAt >= since);
}

async function fetchActivityItems(communityId: string, userId?: string): Promise<ActivityItem[]> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [wishesRes, grantedRes, eventsRes, postsRes, boardReplies, generalMessages, membersRes, mentionNotifications, surveysRes, newsletterReleases] = await Promise.all([
    // New public wishes
    supabase
      .from('wishes')
      .select('id, description, created_at, user_id, user:profiles!user_id(name)')
      .eq('community_id', communityId)
      .eq('status', 'public')
      .gte('created_at', thirtyDaysAgo)
      .order('created_at', { ascending: false })
      .limit(20),

    // Granted wishes
    supabase
      .from('wishes')
      .select(
        'id, description, fulfilled_at, user_id, user:profiles!user_id(name), granters:wish_granters(granter_id, granter:profiles!granter_id(name))'
      )
      .eq('community_id', communityId)
      .eq('status', 'fulfilled')
      .not('fulfilled_at', 'is', null)
      .gte('fulfilled_at', thirtyDaysAgo)
      .order('fulfilled_at', { ascending: false })
      .limit(15),

    // New events added recently
    supabase
      .from('events')
      .select('id, title, event_date, event_time, end_time, created_at, created_by')
      .eq('community_id', communityId)
      .gte('created_at', thirtyDaysAgo)
      .order('created_at', { ascending: false })
      .limit(15),

    // Board posts — include category_id for deep-link navigation
    supabase
      .from('board_posts')
      .select(
        'id, title, category_id, created_at, author_id, author:profiles!author_id(name), category:board_categories!category_id(name, topic_kind)'
      )
      .eq('community_id', communityId)
      .gte('created_at', thirtyDaysAgo)
      .order('created_at', { ascending: false })
      .limit(20),

    fetchBoardReplyActivity(communityId, thirtyDaysAgo),

    fetchGeneralDiscussionActivity(communityId, thirtyDaysAgo),

    // Recent member joins
    supabase
      .from('community_memberships')
      .select('user_id, created_at, profiles(name)')
      .eq('community_id', communityId)
      .gte('created_at', thirtyDaysAgo)
      .order('created_at', { ascending: false })
      .limit(10),

    fetchMentionNotifications(communityId, userId, thirtyDaysAgo),

    // Active surveys — used to whisper when the monthly check-in window opens
    supabase
      .from('surveys')
      .select('*')
      .eq('community_id', communityId)
      .eq('is_active', true)
      .order('created_at', { ascending: false }),

    fetchNewsletterReleases(communityId, thirtyDaysAgo),
  ]);

  const items: ActivityItem[] = [];

  // Monthly check-in window: surface a ping while it is open (due_date − 3 days
  // through due_date), timestamped at the moment the window opened.
  const monthlyCheckIn = ((surveysRes.data ?? []) as Survey[])
    .find((survey) => isMonthlyCheckInSurvey(survey) && !!survey.due_date);
  if (monthlyCheckIn) {
    const windowOpensAt = getSurveyAvailableAt(monthlyCheckIn);
    const dueAt = new Date(monthlyCheckIn.due_date!);
    const now = new Date();
    if (windowOpensAt && !Number.isNaN(dueAt.getTime()) && now >= windowOpensAt && now < dueAt) {
      const period = getSurveyResponsePeriod(monthlyCheckIn);
      const periodMatch = period.match(/^(\d{4})-(\d{2})$/);
      const monthName = periodMatch
        ? new Date(Number(periodMatch[1]), Number(periodMatch[2]) - 1, 1).toLocaleString('en-US', { month: 'long' })
        : 'next';
      items.push({
        id: `survey_open_${monthlyCheckIn.id}_${period}`,
        type: 'survey_open',
        emoji: '📝',
        text: `Before we meet is open — answer before the ${monthName} meeting! 🐝`,
        timestamp: windowOpensAt.toISOString(),
        sourceId: monthlyCheckIn.id,
        navigatesTo: 'tuneup',
      });
    }
  }

  items.push({
    id: 'app_update_2026_05_11',
    type: 'app_update',
    emoji: '✨',
    text: 'HIVE update: Big week! Board posts now show full photo previews, the home screen has a To Do list for monthly check-ins and action items, member birthdays auto-appear in Upcoming Events, and the Meetings tab has a hub with a slide deck.',
    timestamp: '2026-05-11T18:00:00.000Z',
    sourceId: 'app_update_2026_05_11',
  });

  items.push({
    id: 'app_update_2026_05_09',
    type: 'app_update',
    emoji: '✨',
    text: 'HIVE update: Clive is easier to start, wishes can be edited, boards are cleaner, events can be added to calendars, and Activity is easier to scan.',
    timestamp: '2026-05-09T18:00:00.000Z',
    sourceId: 'app_update_2026_05_09',
  });

  // New public wishes
  for (const w of wishesRes.data ?? []) {
    const name: string = (w as any).user?.name ?? 'Someone';
    items.push({
      id: `wish_${w.id}`,
      type: 'wish_posted',
      emoji: '🌟',
      text: `${name} posted a new wish: ${truncate(w.description, 55)}`,
      timestamp: w.created_at,
      sourceId: w.id,
      navigatesTo: 'wish',
      involvesUserIds: (w as any).user_id ? [(w as any).user_id] : undefined,
    });
  }

  // Granted wishes
  for (const w of grantedRes.data ?? []) {
    const wisherName: string = (w as any).user?.name ?? 'Someone';
    const granters: { granter_id?: string; granter: { name: string } }[] = (w as any).granters ?? [];
    const granterNames = granters.map((g) => g.granter?.name).filter(Boolean);
    const grantedBy =
      granterNames.length > 0 ? ` — granted by ${granterNames.join(' & ')}` : '';
    const involvedIds = [
      (w as any).user_id,
      ...granters.map((g) => g.granter_id),
    ].filter(Boolean) as string[];
    items.push({
      id: `granted_${w.id}`,
      type: 'wish_granted',
      emoji: '✅',
      text: `${wisherName}'s wish "${truncate(w.description, 40)}" was granted${grantedBy}`,
      timestamp: (w as any).fulfilled_at,
      sourceId: w.id,
      navigatesTo: 'wish',
      involvesUserIds: involvedIds.length > 0 ? involvedIds : undefined,
    });
  }

  // New events
  for (const e of eventsRes.data ?? []) {
    const [, month, day] = e.event_date.split('-');
    const dateStr = `${parseInt(month)}/${parseInt(day)}`;
    const timeStr = e.event_time ? ` at ${formatTimeRange(e.event_time, e.end_time)}` : '';
    items.push({
      id: `event_${e.id}`,
      type: 'event_added',
      emoji: '📅',
      text: `New event: ${e.title} — ${dateStr}${timeStr}`,
      timestamp: e.created_at,
      sourceId: e.id,
      navigatesTo: 'event',
      involvesUserIds: (e as any).created_by ? [(e as any).created_by] : undefined,
    });
  }

  // Board posts. The HIVE Newsletter board is drafting space, not community
  // activity (see the note in fetchBoardReplyActivity) — it gets its own
  // "released" item below instead of showing up as generic posting noise.
  for (const p of postsRes.data ?? []) {
    if ((p as any).category?.topic_kind === 'newsletter') continue;
    const authorName: string = (p as any).author?.name ?? 'Someone';
    const categoryName: string = (p as any).category?.name ?? 'the board';
    const isIntro = categoryName.toLowerCase().includes('intro');
    items.push({
      id: `post_${p.id}`,
      type: 'board_post',
      emoji: isIntro ? '👋' : '📋',
      text: `${authorName} posted in ${categoryName}: ${truncate(p.title, 50)}`,
      timestamp: p.created_at,
      sourceId: p.id,
      categoryId: (p as any).category_id,
      navigatesTo: 'board',
      involvesUserIds: (p as any).author_id ? [(p as any).author_id] : undefined,
    });
  }

  // Newsletter releases. This replaces the drafting noise filtered out of
  // board_post/board_reply above with the one thing Nat actually wants to see:
  // the moment an issue goes out, deep-linking to the published post itself.
  for (const n of newsletterReleases ?? []) {
    items.push({
      id: `newsletter_released_${(n as any).id}`,
      type: 'newsletter_released',
      emoji: '📰',
      text: `${truncate((n as any).title, 55)} was released`,
      timestamp: (n as any).releasedAt,
      sourceId: (n as any).id,
      categoryId: (n as any).category_id,
      navigatesTo: 'board',
    });
  }

  // Board replies/comments. Activity should reflect the work happening inside
  // threads, not only brand-new thread creation.
  for (const r of boardReplies ?? []) {
    const authorName: string = (r as any).author?.name ?? 'Someone';
    const post = firstRelation((r as any).post);
    const category = firstRelation((post as any)?.category);
    const categoryName: string = (category as any)?.name ?? 'the board';
    const postTitle: string = (post as any)?.title ?? 'a board thread';
    const replyPreview = String((r as any).content ?? '').trim();
    const preview = replyPreview ? ` — ${truncate(replyPreview, 58)}` : '';

    items.push({
      id: `reply_${(r as any).id}`,
      type: 'board_reply',
      emoji: '💬',
      text: `${authorName} replied in ${categoryName}: ${truncate(postTitle, 42)}${preview}`,
      timestamp: (r as any).created_at,
      sourceId: (r as any).post_id,
      categoryId: (post as any)?.category_id,
      navigatesTo: 'board',
      involvesUserIds: (r as any).author_id ? [(r as any).author_id] : undefined,
    });
  }

  // General Discussion messages are public community conversation, so they can
  // safely show in Activity. DMs and group DMs stay private and are filtered out.
  for (const message of generalMessages ?? []) {
    const authorName: string = (message as any).sender?.name ?? 'Someone';
    const content = String((message as any).content ?? '').trim();
    const attachments = Array.isArray((message as any).attachments) ? (message as any).attachments : [];
    const preview = content
      ? truncate(content, 72)
      : attachments.length > 0
        ? `shared ${attachments.length === 1 ? 'a photo/file' : `${attachments.length} photos/files`}`
        : 'posted in General Discussion';

    items.push({
      id: `general_message_${(message as any).id}`,
      type: 'chat_message',
      emoji: attachments.length > 0 ? '📸' : '💬',
      text: `${authorName} posted in General Discussion: ${preview}`,
      timestamp: (message as any).created_at,
      sourceId: (message as any).room_id,
      navigatesTo: 'messages',
      involvesUserIds: (message as any).sender_id ? [(message as any).sender_id] : undefined,
    });
  }

  // Recent member joins
  for (const m of membersRes.data ?? []) {
    const name: string = (m as any).profiles?.name ?? 'Someone';
    items.push({
      id: `join_${m.user_id}`,
      type: 'member_joined',
      emoji: '🐝',
      text: `${name} joined HIVE`,
      timestamp: m.created_at,
      sourceId: m.user_id,
      navigatesTo: 'members',
      involvesUserIds: m.user_id ? [m.user_id] : undefined,
    });
  }

  // Personal mentions from boards, wishes, and chat. These are only fetched for
  // the signed-in user, so private mention notifications do not become community activity.
  for (const notification of mentionNotifications ?? []) {
    const metadata = ((notification as any).metadata ?? {}) as Record<string, unknown>;
    const notificationType = String((notification as any).notification_type ?? '');
    const postId = typeof metadata.post_id === 'string' ? metadata.post_id : null;
    const wishId = typeof metadata.wish_id === 'string'
      ? metadata.wish_id
      : ((notification as any).related_wish_id ?? null);
    const roomId = typeof metadata.room_id === 'string' ? metadata.room_id : null;
    const sourceId = postId || wishId || roomId || (notification as any).id;
    const navigatesTo =
      notificationType === 'board_mention' && postId ? 'board'
        : notificationType === 'wish_mention' && wishId ? 'wish'
          : notificationType === 'chat_mention' && roomId ? 'messages'
            : undefined;
    const content = (notification as any).content
      ? `: ${truncate(String((notification as any).content), 64)}`
      : '';

    items.push({
      id: `notification_${(notification as any).id}`,
      type: 'mention',
      emoji: '@',
      text: `${(notification as any).title}${content}`,
      timestamp: (notification as any).created_at,
      sourceId,
      navigatesTo,
      involvesUserIds: userId ? [userId] : undefined,
    });
  }

  items.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  return items.slice(0, 40);
}

function formatTime(timeStr: string): string {
  const [hourStr, minStr] = timeStr.split(':');
  const hour = parseInt(hourStr);
  const min = minStr ?? '00';
  const ampm = hour >= 12 ? 'pm' : 'am';
  const h = hour % 12 || 12;
  return min === '00' ? `${h}${ampm}` : `${h}:${min}${ampm}`;
}

// The feed's own short style — "5-7pm" rather than "5:00 PM – 7:00 PM", which
// is what everything else on this line looks like.
function formatTimeRange(start: string, end?: string | null): string {
  const startText = formatTime(start);
  if (!end) return startText;
  const endText = formatTime(end);
  const startSuffix = startText.slice(-2);
  return startSuffix === endText.slice(-2)
    ? `${startText.slice(0, -2)}-${endText}`
    : `${startText}-${endText}`;
}

/**
 * Recent Activity.
 *
 * This was a hand-rolled `useState` + `useEffect` until 2026-08-12, which
 * meant the ten round trips above ran again, in full, every single time Home
 * mounted — stepping into a HIVE, coming back from Members, switching tabs.
 * Nothing was remembered between visits. It was the heaviest of Home's five
 * data hooks and the only one of the four uncached ones that fetched double
 * figures, so it set the floor on how fast Home could ever feel.
 *
 * On TanStack Query now, like `useHiveDataQuery` beside it. Two minutes of
 * stale time: long enough that walking around the app and coming back is
 * free, short enough that a member who posts something sees it near enough
 * to straight away. `refetch` still forces a fresh read, which is what
 * pull-to-refresh calls.
 */
export function useActivityFeed(communityId?: string, userId?: string) {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['activityFeed', communityId ?? '', userId ?? ''],
    queryFn: () => fetchActivityItems(communityId!, userId),
    enabled: !!communityId,
    staleTime: 2 * 60 * 1000,
  });

  return {
    items: data ?? EMPTY_ITEMS,
    loading: isLoading,
    refetch,
  };
}
