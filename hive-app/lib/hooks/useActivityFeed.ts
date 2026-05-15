import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabase';

export interface ActivityItem {
  id: string;
  type: 'wish_posted' | 'wish_granted' | 'event_added' | 'board_post' | 'member_joined' | 'app_update';
  emoji: string;
  text: string;
  timestamp: string; // ISO string
  sourceId: string;  // the DB record ID (post id, event id, wish id, user id)
  categoryId?: string; // board_post only — to deep-link into the right topic
  navigatesTo?: 'board' | 'members'; // screens that can be navigated to
}

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) + '…' : text;
}

async function fetchActivityItems(communityId: string): Promise<ActivityItem[]> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [wishesRes, grantedRes, eventsRes, postsRes, membersRes] = await Promise.all([
    // New public wishes
    supabase
      .from('wishes')
      .select('id, description, created_at, user:profiles!user_id(name)')
      .eq('community_id', communityId)
      .eq('status', 'public')
      .gte('created_at', thirtyDaysAgo)
      .order('created_at', { ascending: false })
      .limit(20),

    // Granted wishes
    supabase
      .from('wishes')
      .select(
        'id, description, fulfilled_at, user:profiles!user_id(name), granters:wish_granters(granter:profiles!granter_id(name))'
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
      .select('id, title, event_date, event_time, created_at')
      .eq('community_id', communityId)
      .gte('created_at', thirtyDaysAgo)
      .order('created_at', { ascending: false })
      .limit(15),

    // Board posts — include category_id for deep-link navigation
    supabase
      .from('board_posts')
      .select(
        'id, title, category_id, created_at, author:profiles!author_id(name), category:board_categories!category_id(name)'
      )
      .eq('community_id', communityId)
      .gte('created_at', thirtyDaysAgo)
      .order('created_at', { ascending: false })
      .limit(20),

    // Recent member joins
    supabase
      .from('community_memberships')
      .select('user_id, created_at, profiles(name)')
      .eq('community_id', communityId)
      .gte('created_at', thirtyDaysAgo)
      .order('created_at', { ascending: false })
      .limit(10),
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
    });
  }

  // Granted wishes
  for (const w of grantedRes.data ?? []) {
    const wisherName: string = (w as any).user?.name ?? 'Someone';
    const granters: { granter: { name: string } }[] = (w as any).granters ?? [];
    const granterNames = granters.map((g) => g.granter?.name).filter(Boolean);
    const grantedBy =
      granterNames.length > 0 ? ` — granted by ${granterNames.join(' & ')}` : '';
    items.push({
      id: `granted_${w.id}`,
      type: 'wish_granted',
      emoji: '✅',
      text: `${wisherName}'s wish "${truncate(w.description, 40)}" was granted${grantedBy}`,
      timestamp: (w as any).fulfilled_at,
      sourceId: w.id,
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
    });
  }

  // Recent member joins
  for (const m of membersRes.data ?? []) {
    const name: string = (m as any).profiles?.name ?? 'Someone';
    items.push({
      id: `join_${m.user_id}`,
      type: 'member_joined',
      emoji: '🐝',
      text: `${name} joined the HIVE`,
      timestamp: m.created_at,
      sourceId: m.user_id,
      navigatesTo: 'members',
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

export function useActivityFeed(communityId?: string) {
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!communityId) return;
    setLoading(true);
    try {
      const data = await fetchActivityItems(communityId);
      setItems(data);
      return data;
    } catch (e) {
      console.error('Activity feed error:', e);
      return [];
    } finally {
      setLoading(false);
    }
  }, [communityId]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { items, loading, refetch: fetch };
}
