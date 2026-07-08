import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabase';

export interface ActivityItem {
  id: string;
  type: 'wish_posted' | 'wish_granted' | 'event_added' | 'board_post' | 'board_reply' | 'chat_message' | 'member_joined' | 'app_update' | 'mention';
  emoji: string;
  text: string;
  timestamp: string; // ISO string
  sourceId: string;  // the DB record ID (post id, event id, wish id, user id)
  categoryId?: string; // board activity only — to deep-link into the right topic
  navigatesTo?: 'board' | 'event' | 'members' | 'wish' | 'messages'; // screens that can be navigated to
  involvesUserIds?: string[]; // member ids involved in this item — used by the "Mentions me" filter
}

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
      'id, post_id, parent_reply_id, content, created_at, author_id, author:profiles!board_replies_author_id_fkey(name), post:board_posts!board_replies_post_id_fkey(id, title, category_id, category:board_categories!board_posts_category_id_fkey(name))'
    )
    .eq('community_id', communityId)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(30);

  if (error) {
    console.warn('Activity board replies error:', error);
    return [];
  }

  return data ?? [];
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

async function fetchActivityItems(communityId: string, userId?: string): Promise<ActivityItem[]> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [wishesRes, grantedRes, eventsRes, postsRes, boardReplies, generalMessages, membersRes, mentionNotifications] = await Promise.all([
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
      .select('id, title, event_date, event_time, created_at, created_by')
      .eq('community_id', communityId)
      .gte('created_at', thirtyDaysAgo)
      .order('created_at', { ascending: false })
      .limit(15),

    // Board posts — include category_id for deep-link navigation
    supabase
      .from('board_posts')
      .select(
        'id, title, category_id, created_at, author_id, author:profiles!author_id(name), category:board_categories!category_id(name)'
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
  ]);

  const items: ActivityItem[] = [];

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
    const timeStr = e.event_time ? ` at ${formatTime(e.event_time)}` : '';
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

  // Board posts
  for (const p of postsRes.data ?? []) {
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

export function useActivityFeed(communityId?: string, userId?: string) {
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!communityId) return;
    setLoading(true);
    try {
      const data = await fetchActivityItems(communityId, userId);
      setItems(data);
      return data;
    } catch (e) {
      console.error('Activity feed error:', e);
      return [];
    } finally {
      setLoading(false);
    }
  }, [communityId, userId]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { items, loading, refetch: fetch };
}
