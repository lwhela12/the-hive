import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { pacificDay } from '../../supabase/functions/_shared/upcomingEvents';
import { currentMonthlyHelpPost, monthlyHelpFocusCopy, monthlyHelpWindow, quarterHelpContext } from '../../lib/monthlyHiveHelp';

/** The owner-maintained board focus, read fresh each month. */
export function HiveHelpPreview({ onOpenBoard, disabled = false }: { onOpenBoard: (categoryId: string) => void; disabled?: boolean }) {
  // The September review opened on October 1 shows October's active focus.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);
  const month = pacificDay(now).slice(0, 7);
  const query = useQuery({
    queryKey: ['monthlyHiveHelpFocus', month], staleTime: 60_000,
    queryFn: async () => {
      const board = await supabase.from('board_categories')
        .select('id,created_by,community:communities!inner(slug)')
        .eq('name', 'HIVE Help').eq('topic_kind', 'helper_log')
        .eq('reach', 'all_hives').eq('status', 'active')
        .eq('community.slug', 'default').order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (board.error) throw board.error;
      if (!board.data?.created_by) return null;
      const { earliest, label } = monthlyHelpWindow(month);
      const focus = await supabase.from('board_posts')
        .select('title,content,category_id,created_at').eq('category_id', board.data.id)
        .eq('author_id', board.data.created_by).gte('created_at', `${earliest}T00:00:00Z`)
        .ilike('title', `${label} HIVE Help%`).eq('status', 'active').is('archived_at', null)
        .order('created_at', { ascending: false }).limit(24);
      if (focus.error) throw focus.error;
      const quarter = await supabase.from('board_posts')
        .select('content').eq('category_id', board.data.id)
        .eq('author_id', board.data.created_by).eq('title', 'HIVE Help — Meals for our neighbors')
        .in('visibility', ['all_hives', 'public']).eq('status', 'active').is('archived_at', null)
        .order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (quarter.error) throw quarter.error;
      const current = currentMonthlyHelpPost(focus.data ?? [], month);
      return { title: current?.title ?? null, content: current?.content ?? null,
        quarterContext: quarterHelpContext(quarter.data?.content ?? null), category_id: board.data.id };
    },
  });
  const focus = query.data?.title ? query.data : null;
  const boardId = query.data?.category_id;
  const focusCopy = focus?.title ? monthlyHelpFocusCopy(focus.title, focus.content, focus.quarterContext) : null;
  return <View style={{ backgroundColor: '#fffdf5', borderRadius: 16, padding: 16, gap: 8, borderWidth: 1, borderColor: '#bd9348' }}>
    <Text accessibilityRole="header" style={{ fontFamily: 'Lato_700Bold', fontSize: 16, color: '#313130' }}>This month’s HIVE Help</Text>
    {!!(focusCopy?.introduction || query.data?.quarterContext) && <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 14, lineHeight: 21, color: '#4b4740' }}>
      {focusCopy?.introduction || query.data?.quarterContext}
    </Text>}
    {focus ? <>
      <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 15, lineHeight: 22, color: '#313130' }}>{focusCopy?.heading}</Text>
      {!!focusCopy?.details && <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 14, lineHeight: 21, color: '#4b4740' }}>{focusCopy.details}</Text>}
    </> : <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 14, lineHeight: 21, color: '#4b4740' }}>
      {query.isLoading ? 'Loading the current focus…' : query.isError ? 'The current focus could not load.' : 'The next focus is being planned.'}
    </Text>}
    {boardId && <Pressable accessibilityRole="link" accessibilityLabel="Open the HIVE Help board to share a win"
      disabled={disabled} onPress={() => onOpenBoard(boardId)} style={{ alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center', paddingHorizontal: 14,
        borderRadius: 999, borderWidth: 1, borderColor: '#8a652f', backgroundColor: '#f5eddc' }}>
      <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 14, color: '#313130' }}>Share a win on HIVE Help</Text>
    </Pressable>}
  </View>;
}
