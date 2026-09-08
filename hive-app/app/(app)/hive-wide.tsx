import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, Text, useWindowDimensions, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { SafeAreaView } from '../../components/ui/SafeArea';
import { AppHeader } from '../../components/navigation';
import { CloseButton } from '../../components/ui/CloseButton';
import { HeaderTabs } from '../../components/ui/HeaderTabs';
import { BounceScrollView } from '../../components/ui/BounceScrollView';
import { SpaceGlobe, SPACE_BLACK } from '../../components/ui/SpaceGlobe';
import { WhatsNextList } from '../../components/hive/WhatsNextList';
import { Avatar } from '../../components/ui/Avatar';
import { HiveMark } from '../../components/ui/HiveMark';
import { getWishDetailText, getWishQuickTitle, hasSeparateWishTitle } from '../../lib/wishDisplay';
import { hiveDisplayName, hiveTagMark } from '../../lib/hiveBrand';
import { formatDateShort } from '../../lib/dateUtils';
import { getAppNewsSeenKey, getNewestAppNews, getUnseenAppNews, type AppNewsEntry } from '../../lib/appNews';
import { loadAppNewsSeen, persistAppNewsSeen } from '../../lib/readState';
import { getStoredItemAsync, setStoredItemAsync } from '../../lib/webStorage';
import { useOpenFeedback } from '../../lib/openFeedback';
import { useAppNews } from '../../lib/hooks/useAppNews';
import { useAuth } from '../../lib/hooks/useAuth';
import { supabase } from '../../lib/supabase';
import { getHiveWideActivityAuthorName } from '../../lib/hiveWideIdentity';

/**
 * HIVE-Wide is a Home, not a separate orientation product. Its layout is the
 * same Home grammar members already know inside OG, Tech, and Production:
 * updates first, then four live panels. The data boundary is the distinction:
 * every item here has deliberately travelled to HIVE-Wide.
 */

const INK = '#FFF8E9';
const INK_SOFT = 'rgba(255,248,233,0.72)';
const INK_FAINT = 'rgba(255,248,233,0.5)';
const GOLD = '#E8C77E';
const PANEL = 'rgba(5,6,11,0.84)';
const EDGE = 'rgba(255,226,166,0.22)';

type WideWish = {
  id: string;
  title: string | null;
  description: string;
  created_at: string;
  user: { name: string | null; avatar_url: string | null } | null;
  community: { name: string; slug: string | null; accent_color: string | null } | null;
};

type WideActivity = {
  id: string;
  emoji: string;
  text: string;
  timestamp: string;
  destination: '/hive-wide-boards' | '/members';
};

type WideTodo = {
  id: string;
  title: string;
  due_date: string | null;
  done: boolean;
};

function HomePanel({ title, wide, children }: { title: string; wide: boolean; children: React.ReactNode }) {
  return (
    <View style={{ flexBasis: wide ? '48%' : 'auto', flexGrow: 1, minWidth: 0 }}>
      <HeaderTabs tabs={[{ key: title, label: title }]} />
      <View style={{ backgroundColor: PANEL, borderRadius: 20, borderTopLeftRadius: 0, borderWidth: 1, borderColor: EDGE, minHeight: 270, maxHeight: 360, overflow: 'hidden' }}>
        {children}
      </View>
    </View>
  );
}

function EmptyPanel({ children }: { children: React.ReactNode }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 13, lineHeight: 19, color: INK_SOFT, textAlign: 'center' }}>{children}</Text>
    </View>
  );
}

function WideWishCard({ wish, onPress }: { wish: WideWish; onPress: () => void }) {
  const [open, setOpen] = useState(false);
  const title = getWishQuickTitle(wish as never, 56);
  const detail = getWishDetailText(wish as never);
  const expandable = !!detail && hasSeparateWishTitle(wish as never);

  return (
    <View style={{ borderBottomWidth: 1, borderBottomColor: EDGE }}>
      <Pressable
        onPress={() => (expandable ? setOpen((was) => !was) : onPress())}
        accessibilityRole="button"
        accessibilityState={expandable ? { expanded: open } : undefined}
        accessibilityLabel={`${wish.user?.name ?? 'Someone'}: ${title}`}
        style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 13, paddingVertical: 11, backgroundColor: pressed ? 'rgba(255,248,233,0.08)' : 'transparent' })}
      >
        <Avatar name={wish.user?.name ?? ''} url={wish.user?.avatar_url ?? null} size={29} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 11.5, color: INK_FAINT }} numberOfLines={1}>{wish.user?.name?.split(/\s+/)[0] ?? 'Someone'}</Text>
            <HiveMark size={10} colour={hiveTagMark(wish.community)} />
            <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 11, color: INK_FAINT }} numberOfLines={1}>{wish.community?.name ? hiveDisplayName(wish.community.name) : ''}</Text>
          </View>
          <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 13.5, color: INK, lineHeight: 19, marginTop: 1 }} numberOfLines={1}>{title}</Text>
        </View>
        {expandable ? <Text style={{ color: GOLD, fontSize: 16 }}>{open ? '⌃' : '⌄'}</Text> : null}
      </Pressable>
      {expandable && open ? (
        <Pressable onPress={onPress} style={({ pressed }) => ({ paddingHorizontal: 13, paddingBottom: 12, paddingLeft: 51, opacity: pressed ? 0.7 : 1 })}>
          <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 12.5, lineHeight: 19, color: INK_SOFT }}>{detail}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function AppNewsStrip({ entries, onOpen, onDismiss }: { entries: AppNewsEntry[]; onOpen: (entry: AppNewsEntry) => void; onDismiss: () => void }) {
  const [open, setOpen] = useState(false);
  if (entries.length === 0) return null;

  return (
    <View style={{ backgroundColor: 'rgba(5,6,11,0.9)', borderBottomWidth: 1, borderBottomColor: EDGE }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Pressable onPress={() => setOpen((was) => !was)} accessibilityRole="button" accessibilityLabel={`What's new in the HIVE — ${entries.length} update${entries.length === 1 ? '' : 's'}`} style={({ pressed }) => ({ flex: 1, paddingHorizontal: 16, paddingVertical: 10, opacity: pressed ? 0.72 : 1 })}>
          <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 13, color: GOLD }}>
            ✨ {entries.length} new thing{entries.length === 1 ? '' : 's'} in the HIVE
            <Text style={{ fontFamily: 'Lato_400Regular', color: INK_FAINT }}>{open ? '  — tap to hide' : '  — tap to see'}</Text>
          </Text>
        </Pressable>
        <CloseButton onPress={onDismiss} accessibilityLabel="Mark what's new as read" color={INK_SOFT} size={18} />
      </View>
      {open ? (
        <View style={{ gap: 10, paddingHorizontal: 16, paddingBottom: 13 }}>
          {entries.map((entry) => (
            <Pressable key={entry.id} disabled={!entry.href} onPress={() => onOpen(entry)} accessibilityRole={entry.href ? 'link' : undefined} style={({ pressed }) => ({ opacity: pressed && entry.href ? 0.7 : 1 })}>
              <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 13.5, color: INK }}>{entry.title}</Text>
              {entry.detail ? <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 12.5, lineHeight: 18, color: INK_SOFT }}>{entry.detail}</Text> : null}
              {entry.href ? <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 12.5, color: GOLD, marginTop: 1 }}>{entry.action ?? 'Take a look'} →</Text> : null}
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

export default function HiveWideScreen() {
  const router = useRouter();
  const openFeedback = useOpenFeedback();
  const { profile, wholeHive, enterWholeHive, refreshProfile } = useAuth();
  const { appNews } = useAppNews();
  const { width } = useWindowDimensions();
  const wide = width >= 900;
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [wideWishes, setWideWishes] = useState<WideWish[]>([]);
  const [activity, setActivity] = useState<WideActivity[]>([]);
  const [todos, setTodos] = useState<WideTodo[]>([]);
  const [todoTab, setTodoTab] = useState<'open' | 'done'>('open');
  const [unseenNews, setUnseenNews] = useState<AppNewsEntry[]>([]);

  const corrected = useRef(false);
  useEffect(() => {
    if (corrected.current) return;
    corrected.current = true;
    if (!wholeHive) enterWholeHive();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let active = true;
    if (!profile?.id) {
      setUnseenNews([]);
      return () => { active = false; };
    }
    const joinedAt = (profile.created_at as string | undefined) ?? null;
    const seenFromProfile = loadAppNewsSeen(profile);
    if (seenFromProfile) {
      setUnseenNews(getUnseenAppNews(seenFromProfile, joinedAt, appNews));
    } else {
      void getStoredItemAsync(getAppNewsSeenKey(profile.id)).then((seen) => {
        if (active) setUnseenNews(getUnseenAppNews(seen, joinedAt, appNews));
      });
    }
    return () => { active = false; };
  }, [appNews, profile]);

  const load = useCallback(async () => {
    try {
      const [wishResult, postsResult, todoResult] = await Promise.all([
        supabase.from('wishes').select('id, title, description, created_at, user:profiles!user_id(name, avatar_url), community:communities(name, slug, accent_color)').eq('share_scope', 'all_hives').eq('status', 'public').or('is_active.is.true,is_active.is.null').order('created_at', { ascending: false }).limit(12),
        supabase.from('board_posts').select('id, title, created_at, author:profiles!author_id(id, name, profile_scope), category:board_categories!inner(reach)').eq('category.reach', 'all_hives').or('status.is.null,status.neq.archived').order('created_at', { ascending: false }).limit(12),
        supabase.from('surveys').select('id, title, due_date').is('community_id', null).eq('is_active', true).order('due_date', { ascending: true }),
      ]);
      if (wishResult.error) throw wishResult.error;
      if (postsResult.error) throw postsResult.error;
      if (todoResult.error) throw todoResult.error;

      const wishes = (wishResult.data ?? []) as unknown as WideWish[];
      const surveyRows = (todoResult.data ?? []) as Array<{ id: string; title: string; due_date: string | null }>;
      const completedSurveyIds = new Set<string>();
      if (profile?.id && surveyRows.length > 0) {
        const { data: responseRows, error: responseError } = await supabase.from('survey_responses').select('survey_id').eq('user_id', profile.id).in('survey_id', surveyRows.map((survey) => survey.id));
        if (responseError) throw responseError;
        (responseRows ?? []).forEach((row) => completedSurveyIds.add((row as { survey_id: string }).survey_id));
      }

      setWideWishes(wishes);
      setTodos(surveyRows.map((survey) => ({ ...survey, done: completedSurveyIds.has(survey.id) })));
      const wishActivity: WideActivity[] = wishes.map((wish) => ({ id: `wish:${wish.id}`, emoji: '⭐', text: `${wish.user?.name ?? 'Someone'} shared a wish with HIVE-Wide`, timestamp: wish.created_at, destination: '/members' }));
      const postActivity: WideActivity[] = (postsResult.data ?? []).map((post: any) => ({ id: `post:${post.id}`, emoji: '📋', text: `${getHiveWideActivityAuthorName(post.author)} posted: ${post.title}`, timestamp: post.created_at, destination: '/hive-wide-boards' }));
      setActivity([...wishActivity, ...postActivity].sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, 12));
    } catch (error) {
      console.warn('Could not load HIVE-Wide Home', error);
    } finally {
      setLoading(false);
    }
  }, [profile?.id]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));
  const onRefresh = useCallback(async () => { setRefreshing(true); await load(); setRefreshing(false); }, [load]);

  const dismissNews = useCallback(() => {
    setUnseenNews([]);
    if (!profile) return;
    const newest = getNewestAppNews(appNews);
    if (!newest) return;
    void setStoredItemAsync(getAppNewsSeenKey(profile.id), newest.id);
    void persistAppNewsSeen(profile, newest.id).then(() => refreshProfile());
  }, [appNews, profile, refreshProfile]);

  const visibleTodos = useMemo(() => todos.filter((todo) => todoTab === 'done' ? todo.done : !todo.done), [todoTab, todos]);
  const openTodoCount = todos.filter((todo) => !todo.done).length;
  const doneTodoCount = todos.length - openTodoCount;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: SPACE_BLACK }} edges={['top']}>
      <SpaceGlobe />
      <AppHeader title="Home" tone="wide" />
      <BounceScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 28 }} refreshControl={<RefreshControl refreshing={refreshing || loading} onRefresh={onRefresh} tintColor={GOLD} />}>
        <AppNewsStrip entries={unseenNews} onDismiss={dismissNews} onOpen={(entry) => {
          dismissNews();
          if (!entry.href) return;
          if (entry.href.pathname === '/app-feedback') openFeedback({ pathname: '/hive-wide' });
          else router.push(entry.href as never);
        }} />
        <View style={{ padding: 16, width: '100%', maxWidth: 1380, alignSelf: 'center', flexDirection: wide ? 'row' : 'column', flexWrap: wide ? 'wrap' : 'nowrap', alignItems: wide ? 'flex-start' : 'stretch', rowGap: wide ? 18 : 20, columnGap: 36 }}>
          <HomePanel title="Recent Activity" wide={wide}>
            {loading && activity.length === 0 ? <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={GOLD} /></View> : activity.length === 0 ? <EmptyPanel>Nothing has travelled to HIVE-Wide recently.</EmptyPanel> : (
              <BounceScrollView nestedScrollEnabled showsVerticalScrollIndicator style={{ flex: 1 }}>
                {activity.map((item, index) => (
                  <Pressable key={item.id} onPress={() => router.push(item.destination as never)} style={({ pressed }) => ({ flexDirection: 'row', gap: 10, alignItems: 'center', paddingHorizontal: 13, paddingVertical: 12, borderBottomWidth: index === activity.length - 1 ? 0 : 1, borderBottomColor: EDGE, backgroundColor: pressed ? 'rgba(255,248,233,0.08)' : 'transparent' })}>
                    <Text style={{ fontSize: 17 }}>{item.emoji}</Text>
                    <View style={{ flex: 1, minWidth: 0 }}><Text style={{ fontFamily: 'Lato_400Regular', fontSize: 13, lineHeight: 18, color: INK }} numberOfLines={2}>{item.text}</Text><Text style={{ fontFamily: 'Lato_400Regular', fontSize: 11, color: INK_FAINT, marginTop: 2 }}>{formatDateShort(item.timestamp)}</Text></View>
                    <Text style={{ color: INK_FAINT, fontSize: 18 }}>›</Text>
                  </Pressable>
                ))}
              </BounceScrollView>
            )}
          </HomePanel>

          <HomePanel title="My To Do List" wide={wide}>
            <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingTop: 10, borderBottomWidth: 1, borderBottomColor: EDGE }}>
              {(['open', 'done'] as const).map((tab) => <Pressable key={tab} onPress={() => setTodoTab(tab)} accessibilityRole="tab" accessibilityState={{ selected: todoTab === tab }} style={({ pressed }) => ({ paddingHorizontal: 8, paddingBottom: 9, opacity: pressed ? 0.7 : 1, borderBottomWidth: todoTab === tab ? 2 : 0, borderBottomColor: GOLD })}><Text style={{ fontFamily: 'Lato_700Bold', fontSize: 12, color: todoTab === tab ? INK : INK_FAINT }}>{tab === 'open' ? `Open To Do (${openTodoCount})` : `Done (${doneTodoCount})`}</Text></Pressable>)}
            </View>
            {visibleTodos.length === 0 ? <EmptyPanel>{todoTab === 'done' ? 'No completed HIVE-Wide to-dos yet.' : 'All clear! HIVE-Wide check-ins will appear here when they are open.'}</EmptyPanel> : (
              <BounceScrollView nestedScrollEnabled showsVerticalScrollIndicator style={{ flex: 1 }}>
                {visibleTodos.map((todo, index) => <Pressable key={todo.id} onPress={() => router.push('/meetings' as never)} style={({ pressed }) => ({ paddingHorizontal: 13, paddingVertical: 12, borderBottomWidth: index === visibleTodos.length - 1 ? 0 : 1, borderBottomColor: EDGE, backgroundColor: pressed ? 'rgba(255,248,233,0.08)' : 'transparent' })}><Text style={{ fontFamily: 'Lato_700Bold', fontSize: 13.5, color: INK }} numberOfLines={2}>{todo.title}</Text><Text style={{ fontFamily: 'Lato_400Regular', fontSize: 11.5, color: INK_SOFT, marginTop: 2 }}>{todo.due_date ? `Due ${formatDateShort(todo.due_date)}` : 'Open now'}</Text></Pressable>)}
              </BounceScrollView>
            )}
          </HomePanel>

          <HomePanel title="Upcoming Events" wide={wide}><BounceScrollView nestedScrollEnabled showsVerticalScrollIndicator style={{ flex: 1 }}><WhatsNextList view="hiveWideUpcomingEvents" emptyLine="No HIVE-Wide or public events are coming up yet." /></BounceScrollView></HomePanel>
          <HomePanel title="HD Wishes" wide={wide}>
            {loading && wideWishes.length === 0 ? <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={GOLD} /></View> : wideWishes.length === 0 ? <EmptyPanel>Mark a wish HIVE-Wide and it will appear here for every HIVE.</EmptyPanel> : <BounceScrollView nestedScrollEnabled showsVerticalScrollIndicator style={{ flex: 1 }}>{wideWishes.map((wish) => <WideWishCard key={wish.id} wish={wish} onPress={() => router.push('/members' as never)} />)}</BounceScrollView>}
          </HomePanel>
        </View>
      </BounceScrollView>
    </SafeAreaView>
  );
}
