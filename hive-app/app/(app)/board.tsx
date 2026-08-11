import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { View, Text, FlatList, RefreshControl, Pressable, ActivityIndicator, TextInput, Modal, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/hooks/useAuth';
import { useBoardCategoriesQuery, useBoardPostsQuery, useBoardPostCountsQuery, useBoardSearchIndexQuery, type BoardSearchThreadMatch, type BoardReach } from '../../lib/hooks/useBoardQuery';
import { BoardCategoryList, type BoardCategorySearchMatchSummary } from '../../components/board/BoardCategoryList';
import { BoardPostCard } from '../../components/board/BoardPostCard';
import { BoardPostDetail } from '../../components/board/BoardPostDetail';
import { useDeepTrail } from '../../lib/hooks/usePathTrail';
import { BoardComposer } from '../../components/board/BoardComposer';
import { BoardTopicComposer, type BoardTopicAudience, type BoardTopicMetadata } from '../../components/board/BoardTopicComposer';
import { WishDetail } from '../../components/hive/WishDetail';
import { GrantWishModal } from '../../components/hive/GrantWishModal';
import { celebrateWishGranted } from '../../lib/celebration';
import { AddWishModal } from '../../components/wishes/AddWishModal';
import { AppHeader } from '../../components/navigation';
import { SpaceBackdrop } from '../../components/ui/SpaceBackdrop';
import { usePageSkin } from '../../lib/pageSkin';
import { useBoardLinkedWishes, type LinkedWish } from '../../lib/hooks/useBoardLinkedWishes';
import { getMentionedMembers } from '../../lib/mentions';
import { fetchCommunityMentionableMembers } from '../../lib/mentionableMembers';
import { useMentionReach } from '../../lib/hooks/useMentionableMembers';
import { markBoardThreadGranted } from '../../lib/boardThreadCompletion';
import { setBoardThreadArchiveState } from '../../lib/boardThreadArchive';
import { BOARD_HOME_EVENT } from '../../lib/boardNavigation';
// Which board and which thread were open is remembered for this sitting only
// (session-scoped), not forever — the same lifetime `lib/hiveSelection.ts`
// uses for which HIVE you're in, and for the same reason (Nat 2026-08-08).
import { getSessionItem as getStoredItem, removeSessionItem as removeStoredItem, setSessionItem as setStoredItem } from '../../lib/webStorage';
import { linkThreadToCommunityWish, unlinkWishFromBoard } from '../../lib/wishBoardLinking';
import { deleteWishById } from '../../lib/wishMutations';
import { matchesMemberSearchText } from '../../lib/memberAliases';
import { confirmAction, showAlert } from '../../lib/showAlert';
import type { BoardCategory, BoardPost, Attachment, Profile } from '../../types';

import { ThinkingBee } from '../../components/ui/ThinkingBee';
import { SkeletonRows } from '../../components/ui/SkeletonRows';
import { BounceScrollView, useEndBounce } from '../../components/ui/BounceScrollView';
// Archived boards are no longer browsable (Nat 2026-07-24) — the boards-home
// "Archive" pill is gone, so the list always shows active topics. Threads keep
// an archive view only as a landing spot when search finds archived matches.
type BoardThreadListView = 'active' | 'archive';
type BoardCategoryStats = { count: number; latestActivity: string | null };
type GrantThreadContext = {
  post: BoardPost;
  wish: LinkedWish;
  onDone?: () => void;
};

function isArchivedCategory(category: BoardCategory) {
  return category.status === 'archived' || category.status === 'completed';
}

// Every failure on this screen ends up here first, so the member reads one
// sentence about what happened rather than a database error on its own.
function getBoardErrorMessage(error: unknown, fallback = 'Something went wrong.') {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object') {
    const details = error as { message?: unknown; details?: unknown; hint?: unknown; code?: unknown };
    const message = typeof details.message === 'string' ? details.message : fallback;
    const extra = [details.details, details.hint, details.code]
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      .join('\n');
    return extra ? `${message}\n${extra}` : message;
  }
  return fallback;
}

function isCompletableHdAsk(category: BoardCategory) {
  return category.topic_kind === 'hd_board' && !!category.goal_title;
}

// Boards sort A-Z, full stop (Nat 2026-07-25). The old ranking put system
// boards first and everything else by display_order, which meant the grid
// reshuffled as boards were added and nobody could predict where anything was.
// Alphabetical is boring, and boring is findable.
// Punctuation sorts before letters, so "{Potential} HIVE Hang Ideas!" landed
// ahead of Announcements and looked like the sort was broken. Sort on the first
// real letter — the eye reads P, so it files under P (Nat 2026-07-25).
function getBoardSortName(name: string) {
  return name.replace(/^[^\p{L}\p{N}]+/u, '') || name;
}

function sortCategoriesByBoardOrder(a: BoardCategory, b: BoardCategory) {
  return getBoardSortName(a.name).localeCompare(
    getBoardSortName(b.name),
    'en',
    { sensitivity: 'base' }
  );
}

function getCategorySearchText(category: BoardCategory) {
  const taggedNames = (category.member_tags ?? [])
    .map((tag) => tag.member?.name)
    .filter(Boolean)
    .join(' ');
  return [
    category.name,
    category.description,
    category.goal_title,
    category.category_type,
    category.topic_kind,
    category.status,
    taggedNames,
  ].filter(Boolean).join(' ').toLowerCase();
}

function getThreadActivity(thread: BoardSearchThreadMatch) {
  return thread.last_reply_at || thread.created_at;
}

function getThreadSearchValues(thread: BoardSearchThreadMatch) {
  return [
    thread.title,
    thread.content,
    thread.author?.name,
    ...thread.replies.map((reply) => `${reply.content || ''} ${reply.author?.name || ''}`),
  ];
}

function getThreadReplyMatchCount(thread: BoardSearchThreadMatch, query: string) {
  return thread.replies.filter((reply) => (
    matchesMemberSearchText([reply.content, reply.author?.name], query)
  )).length;
}

function getRouteParam(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export default function BoardScreen({ reach = 'hive' }: { reach?: BoardReach } = {}) {
  const {
    profile,
    communityId: myCommunityId,
    communityRole,
    community,
    memberships,
    wholeHive,
    switchCommunity,
  } = useAuth();
  // The list of threads bounces at its ends, so a board with three posts on it
  // reads as "that's all of them" instead of "this is stuck".
  const threadListBounceRef = useEndBounce();
  const router = useRouter();
  const routeParams = useLocalSearchParams<{
    categoryId?: string | string[];
    postId?: string | string[];
    open?: string | string[];
    from?: string | string[];
  }>();
  const { width } = useWindowDimensions();
  const useMobileLayout = width < 768;

  // ── Which HIVE this screen is really talking to ────────────────────────────
  //
  // This same component serves two screens. At /board it shows the boards of
  // the HIVE you are standing in. At /hive-wide-boards it shows the shared ones
  // — and those rows belong to whichever HIVE first created them (OG, as it
  // happens), not to yours. Everything downstream of here (posts, counts,
  // search, composing, moderating) keys off `communityId`, in about seventy
  // places, so the honest fix is to make that one name mean "the HIVE these
  // boards live in" rather than "the HIVE I am in". Your own membership is
  // still available as `myCommunityId` where it is genuinely about you.
  //
  // The wide list has no community to ask for — that is the whole point of it —
  // so it is fetched first and tells us who the owner is (Nat 2026-08-03).
  const isWide = reach === 'all_hives';
  // Cream inside a HIVE, the world in space at HIVE-Wide. Nat asked for this
  // twice, and she was right both times: the shared boards were wearing OG's
  // cream while the rail beside them was black (2026-08-03).
  const skin = usePageSkin();
  // Shades the palette doesn't carry, for the little management pills that sit
  // on a skinned modal card. Same trio BoardPostDetail already uses, so the
  // Edit sheet reads the same whichever door you came in through — the old
  // charcoal-on-assumed-cream pills simply vanished on HIVE-Wide's dark card.
  const chipFill = skin.dark ? 'rgba(255,255,255,0.08)' : '#faf8f3';
  const dangerInk = skin.dark ? '#ff9a9a' : '#ef4444';
  const dangerWash = skin.dark ? 'rgba(255,154,154,0.10)' : '#fef2f2';
  const dangerEdge = skin.dark ? 'rgba(255,154,154,0.28)' : '#fee2e2';
  const goldWash = skin.dark ? 'rgba(224,190,118,0.12)' : 'rgba(189,147,72,0.10)';
  const publicInk = skin.dark ? '#86efac' : '#16a34a';

  const {
    data: categories = [],
    isLoading: categoriesLoading,
    refetch: refetchCategories,
    invalidateCategories,
  } = useBoardCategoriesQuery(isWide ? undefined : (myCommunityId ?? undefined), reach);
  const communityId = isWide ? (categories[0]?.community_id ?? null) : myCommunityId;

  const routeCategoryId = getRouteParam(routeParams.categoryId);
  const routePostId = getRouteParam(routeParams.postId);
  const routeOpenKey = getRouteParam(routeParams.open);
  const routeOrigin = getRouteParam(routeParams.from);
  const hasRouteTarget = !!routeCategoryId || !!routePostId;
  const shouldReturnHomeFromRoute = routeOrigin === 'home' && hasRouteTarget;

  // ── Opening a link to one thread ───────────────────────────────────────────
  //
  // A link carries a post id and nothing else, so this screen used to draw that
  // thread inside whichever HIVE you happened to be standing in. Nat walked it
  // on 2026-08-06: a link opened from HIVE-Wide put an OG HIVE thread on screen
  // wearing HIVE-Wide's black-and-globe, the trail along the bottom named a
  // board the thread has never been on, and pressing back left her inside that
  // board — one she had never opened, in a HIVE the page said she was above.
  //
  // Opening a link to a thing puts you where that thing lives. So the row is
  // read first — it names its own HIVE and its own board — and the screen is
  // drawn from those two facts: step down into that HIVE, open that board's
  // thread. A thread this person cannot read gets a sentence saying so instead
  // of somebody else's board.
  type RoutePostLanding =
    | { postId: string; state: 'looking' }
    | { postId: string; state: 'found'; communityId: string; categoryId: string | null }
    | { postId: string; state: 'unreachable' };
  const [landing, setLanding] = useState<RoutePostLanding | null>(null);
  // /hive-wide-boards shows boards that belong to no one HIVE, so "step into the
  // HIVE this post lives in" is not a thing it can do. Only /board resolves.
  const resolvesRoutePost = !!routePostId && !isWide;
  const landedHere = landing && landing.postId === routePostId ? landing : null;
  const routePostReady = landedHere?.state === 'found';

  const [refreshing, setRefreshing] = useState(false);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
  const [showComposer, setShowComposer] = useState(false);
  const [editingPost, setEditingPost] = useState<BoardPost | null>(null);
  const [showTopicComposer, setShowTopicComposer] = useState(false);
  const [editingTopic, setEditingTopic] = useState<BoardCategory | null>(null);
  const [threadListView, setThreadListView] = useState<BoardThreadListView>('active');
  const [boardSearch, setBoardSearch] = useState('');
  const [threadSearch, setThreadSearch] = useState('');
  const [showAddLinkedWishModal, setShowAddLinkedWishModal] = useState(false);
  const [selectedLinkedWish, setSelectedLinkedWish] = useState<LinkedWish | null>(null);
  const [managingLinkedWish, setManagingLinkedWish] = useState<LinkedWish | null>(null);
  const [editingLinkedWish, setEditingLinkedWish] = useState<LinkedWish | null>(null);
  const [linkedWishToGrant, setLinkedWishToGrant] = useState<LinkedWish | null>(null);
  const [grantThreadContext, setGrantThreadContext] = useState<GrantThreadContext | null>(null);
  const [topicMembers, setTopicMembers] = useState<Pick<Profile, 'id' | 'name' | 'avatar_url'>[]>([]);
  // HIVE-Wide is a mode, not a community — the shared boards carry the id of
  // the HIVE that first made them (OG), so keying these on `communityId` alone
  // made /board and /hive-wide-boards read and write the SAME remembered board
  // and thread. That is how a board Nat was reading in OG HIVE followed her up
  // to HIVE-Wide (2026-08-11). The wide screen remembers under its own name.
  // A bonus: the wide keys exist before the first query answers, instead of
  // waiting on `categories[0]` to say whose boards these are.
  const storageScope = isWide ? 'hive-wide' : communityId;
  const boardCategoryStorageKey = storageScope ? `the-hive:last-board-category:${storageScope}` : null;
  const boardComposerStorageKey = storageScope ? `the-hive:board-composer-open:${storageScope}` : null;
  const boardPostStorageKey = storageScope ? `the-hive:last-board-post:${storageScope}` : null;
  const boardDirectOpenStorageKey = storageScope ? `the-hive:board-direct-open:${storageScope}` : null;
  const boardDraftStorageKey = selectedCategoryId ? `the-hive:board-draft:${selectedCategoryId}` : null;

  const isAdmin = communityRole === 'admin' || profile?.role === 'admin';
  const canCreateCategories = !!profile && !!communityId;
  const canManageCategory = useCallback((category: BoardCategory | null) => {
    if (!category || category.is_system) return false;
    return isAdmin || category.created_by === profile?.id;
  }, [isAdmin, profile?.id]);
  const canArchiveCategory = useCallback((category: BoardCategory | null) => {
    if (!category) return false;
    return isAdmin || (!category.is_system && category.created_by === profile?.id);
  }, [isAdmin, profile?.id]);
  const selectedCategory = selectedCategoryId
    ? categories.find((c) => c.id === selectedCategoryId) || null
    : null;

  // A newsletter board is deliberately left out of `categories` (Nat,
  // 2026-08-03: "it just stops being a board you browse. The Buzz has its
  // own door... and that is the only one") — but a direct link (the new
  // "newsletter released" Recent Activity entry, or an old share) still
  // opens the thread itself via `BoardPostDetail`, which fetches its own
  // post and category independently. Only the trail below was left blank
  // for that one case, since it reads `selectedCategory.name` and this is
  // the one kind of thread that will never be in the filtered list. This
  // fetches just the name, for display — it deliberately does not feed
  // `selectedCategory` itself, so nothing that gates on category ownership
  // or `reach` (archiving, mention scope, etc.) treats a newsletter thread
  // as a manageable board by accident.
  const [deepLinkCategoryName, setDeepLinkCategoryName] = useState<string | null>(null);
  useEffect(() => {
    if (!selectedCategoryId || selectedCategory || categoriesLoading) {
      setDeepLinkCategoryName(null);
      return;
    }
    let cancelled = false;
    supabase
      .from('board_categories')
      .select('name')
      .eq('id', selectedCategoryId)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setDeepLinkCategoryName((data as { name?: string } | null)?.name ?? null);
      });
    return () => { cancelled = true; };
  }, [selectedCategoryId, selectedCategory, categoriesLoading]);

  // How far a new thread on this board travels, which is how far an "@everyone"
  // written on it travels. The composer offers from this and the notifications
  // below are read from it, so nobody is told about a thread they cannot open.
  const mentionReach = useMentionReach({ reach: selectedCategory?.reach });

  /**
   * How deep inside Boards you are, handed to the strip along the bottom.
   *
   * Nat, 2026-08-05: "I understand how the boards work, but not every one does
   * ... some sort of: OG HIVE > Boards > HIVE approved > Favo healthcare".
   *
   * The HIVE and the word "Boards" are the footer's own business — it reads
   * them off the route. Only this screen knows which board you opened and which
   * thread you are reading, so that is all it says. The thread's own name is
   * added by `BoardPostDetail`, which is where the title actually arrives.
   *
   * A board is named here only once it is genuinely the one you are inside. A
   * link that is still being placed says nothing about a board, because the
   * board sitting in state at that moment is the last one you had open — which
   * is exactly how "Favorite Books!" got into the trail of a thread that has
   * never been on it (Nat 2026-08-06).
   */
  const placingRoutePost = resolvesRoutePost && !routePostReady;
  const trailCategoryName = selectedCategory?.name ?? deepLinkCategoryName;
  useDeepTrail(
    trailCategoryName && !placingRoutePost
      ? [{
          label: trailCategoryName,
          // A newsletter board has no browsable "back to this board" screen
          // (deliberately — see `deepLinkCategoryName` above), so its trail
          // segment names the thread's home without pretending there's
          // somewhere to step back to.
          onPress: selectedCategory && selectedPostId
            ? () => setSelectedPostId(null)
            : undefined,
        }]
      : [],
    // Nat's own example, 2026-08-06: "if i was all the way inside that thread &
    // i wanted to go back to boards, that woudl be cool." The board and the
    // thread are this screen's state while the route stays `/board`, so the
    // page crumb had nowhere to navigate to and did nothing. It sheds both now.
    selectedCategory
      ? () => {
          setSelectedPostId(null);
          setSelectedCategoryId(null);
        }
      : undefined,
  );

  const canManageThread = useCallback((post: Pick<BoardPost, 'author_id'>) => {
    if (!profile || !selectedCategory) return false;
    if (isAdmin || post.author_id === profile.id) return true;
    return selectedCategory.owner_user_id === profile.id;
  }, [isAdmin, profile, selectedCategory]);
  const canCompleteThread = useCallback((post: Pick<BoardPost, 'author_id' | 'status' | 'archived_at'>) => {
    if (!profile || !selectedCategory || post.status === 'completed' || post.archived_at || isArchivedCategory(selectedCategory)) {
      return false;
    }

    if (selectedCategory.owner_user_id) {
      return isAdmin || selectedCategory.owner_user_id === profile.id;
    }

    return isAdmin || post.author_id === profile.id;
  }, [isAdmin, profile, selectedCategory]);

  const { data: postCounts, refetch: refetchPostCounts } = useBoardPostCountsQuery(communityId ?? undefined);
  const { data: boardSearchIndex = {}, refetch: refetchBoardSearchIndex } = useBoardSearchIndexQuery(communityId ?? undefined);
  const activeCategories = categories
    .filter((category) => !isArchivedCategory(category))
    .sort(sortCategoriesByBoardOrder);
  const boardSearchQuery = boardSearch.trim().toLowerCase();
  const boardSearchMatchesByCategory = useMemo(() => {
    if (!boardSearchQuery) return {};

    return Object.entries(boardSearchIndex).reduce<Record<string, BoardCategorySearchMatchSummary>>((matches, [categoryId, threads]) => {
      const matchingThreads = threads
        .filter((thread) => matchesMemberSearchText(getThreadSearchValues(thread), boardSearchQuery))
        .sort((a, b) => getThreadActivity(b).localeCompare(getThreadActivity(a)));

      if (matchingThreads.length === 0) return matches;

      matches[categoryId] = {
        threadTitles: matchingThreads.map((thread) => thread.title),
        replyMatchCount: matchingThreads.reduce((total, thread) => total + getThreadReplyMatchCount(thread, boardSearchQuery), 0),
        archivedOnly: matchingThreads.every((thread) => !!thread.archived_at),
      };
      return matches;
    }, {});
  }, [boardSearchIndex, boardSearchQuery]);
  // The newsletter board is not a board you browse.
  //
  // It holds every issue of The Buzz plus the thread that collects shout-outs,
  // and The Buzz is its only door. The query already excludes it; this is the
  // second lock, because Nat saw it in the grid anyway and a stale cache is
  // enough to put it back. She was clear: "i'm feeling very confident right now
  // that we dont want a newsletter board."
  const listSourceCategories = activeCategories.filter(
    (category) => (category as { topic_kind?: string | null }).topic_kind !== 'newsletter',
  );
  const visibleCategories = boardSearchQuery
    ? listSourceCategories
        .filter((category) => (
          matchesMemberSearchText([getCategorySearchText(category)], boardSearchQuery)
          || !!boardSearchMatchesByCategory[category.id]
        ))
        .sort(sortCategoriesByBoardOrder)
    : listSourceCategories;

  const {
    posts,
    loading: postsLoading,
    refetch: refetchPosts,
    updatePostInCache,
    invalidatePosts,
  } = useBoardPostsQuery(communityId ?? undefined, selectedCategory?.id);
  const activePosts = posts.filter((post) => !post.archived_at);
  const archivedPosts = posts.filter((post) => !!post.archived_at);
  const listSourcePosts = threadListView === 'archive' ? archivedPosts : activePosts;
  const threadSearchQuery = threadSearch.trim();
  const selectedCategorySearchPostIds = useMemo(() => {
    if (!selectedCategory?.id || !threadSearchQuery) return new Set<string>();

    const matchingThreads = (boardSearchIndex[selectedCategory.id] || [])
      .filter((thread) => matchesMemberSearchText(getThreadSearchValues(thread), threadSearchQuery))
      .map((thread) => thread.id);

    return new Set(matchingThreads);
  }, [boardSearchIndex, selectedCategory?.id, threadSearchQuery]);
  const visiblePosts = threadSearchQuery
    ? listSourcePosts.filter((post) =>
        matchesMemberSearchText([post.title, post.content, post.author?.name], threadSearch)
        || selectedCategorySearchPostIds.has(post.id)
      )
    : listSourcePosts;
  const {
    wishes: linkedWishes,
    refetch: refetchLinkedWishes,
    invalidateLinkedWishes,
  } = useBoardLinkedWishes(communityId ?? undefined, selectedCategory?.id);
  const boardOwner = selectedCategory?.owner_user_id
    ? topicMembers.find((member) => member.id === selectedCategory.owner_user_id) || null
    : null;
  const linkedWishOwnerUserId =
    selectedCategory?.owner_user_id && (selectedCategory.owner_user_id === profile?.id || isAdmin)
      ? selectedCategory.owner_user_id
      : profile?.id;
  const linkedWishOwnerName =
    linkedWishOwnerUserId === selectedCategory?.owner_user_id
      ? boardOwner?.name
      : profile?.name;

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([
      refetchCategories(),
      refetchPostCounts(),
      refetchBoardSearchIndex(),
      ...(selectedCategory ? [refetchPosts()] : []),
      ...(selectedCategory ? [refetchLinkedWishes()] : []),
    ]);
    setRefreshing(false);
  };

  const resetBoardToList = useCallback(() => {
    setSelectedCategoryId(null);
    setSelectedPostId(null);
    setShowComposer(false);
    setEditingPost(null);
    setShowTopicComposer(false);
    setEditingTopic(null);
    setShowAddLinkedWishModal(false);
    setSelectedLinkedWish(null);
    setManagingLinkedWish(null);
    setEditingLinkedWish(null);
    setLinkedWishToGrant(null);
    setGrantThreadContext(null);
    setThreadSearch('');
    if (boardCategoryStorageKey) removeStoredItem(boardCategoryStorageKey);
    if (boardPostStorageKey) removeStoredItem(boardPostStorageKey);
    if (boardComposerStorageKey) removeStoredItem(boardComposerStorageKey);
    if (boardDirectOpenStorageKey) removeStoredItem(boardDirectOpenStorageKey);
  }, [boardCategoryStorageKey, boardComposerStorageKey, boardDirectOpenStorageKey, boardPostStorageKey]);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;

    const handleBoardsHome = () => {
      setBoardSearch('');
      setThreadSearch('');
      setThreadListView('active');
      resetBoardToList();
    };

    window.addEventListener(BOARD_HOME_EVENT, handleBoardsHome);
    return () => window.removeEventListener(BOARD_HOME_EVENT, handleBoardsHome);
  }, [resetBoardToList]);

  // Crossing between a HIVE and HIVE-Wide starts Boards over, in both
  // directions.
  //
  // Stepping into HIVE-Wide does not change `communityId` — `wholeHive` is its
  // own switch and the HIVE selection underneath stays put — so every reset
  // this screen keys on the community changing sleeps straight through the
  // toggle. `switchCommunity` has the same blind spot: it only clears board
  // state when the community id actually changes, and OG → HIVE-Wide → OG
  // never changes it. Nat watched an OG board ride up to HIVE-Wide with her
  // on 2026-08-11 ("that also happened when i was looking at the board").
  // Both doors to Boards stay mounted once opened, so each instance hears the
  // flip and puts itself back at the grid.
  //
  // A link that is mid-arrival names its own board and thread, so it is left
  // alone — the route-target effect below owns that landing.
  const prevWholeHiveRef = useRef(wholeHive);
  useEffect(() => {
    if (prevWholeHiveRef.current === wholeHive) return;
    prevWholeHiveRef.current = wholeHive;
    if (hasRouteTarget) return;

    setBoardSearch('');
    setThreadListView('active');
    resetBoardToList();
  }, [hasRouteTarget, resetBoardToList, wholeHive]);

  useFocusEffect(
    useCallback(() => {
      if (hasRouteTarget) return;

      const isDirectOpen = boardDirectOpenStorageKey
        ? getStoredItem(boardDirectOpenStorageKey) === 'true'
        : false;
      if (isDirectOpen) {
        removeStoredItem(boardDirectOpenStorageKey!);
        const savedCategoryId = boardCategoryStorageKey ? getStoredItem(boardCategoryStorageKey) : null;
        const savedPostId = boardPostStorageKey ? getStoredItem(boardPostStorageKey) : null;
        if (savedCategoryId) setSelectedCategoryId(savedCategoryId);
        if (savedPostId) setSelectedPostId(savedPostId);
        return;
      }

      const savedCategoryId = boardCategoryStorageKey ? getStoredItem(boardCategoryStorageKey) : null;
      const savedPostId = boardPostStorageKey ? getStoredItem(boardPostStorageKey) : null;
      if (savedCategoryId) setSelectedCategoryId(savedCategoryId);
      if (savedPostId) setSelectedPostId(savedPostId);

      const isComposing = boardComposerStorageKey
        ? getStoredItem(boardComposerStorageKey) === 'true'
        : false;
      if (isComposing) setShowComposer(true);
    }, [boardCategoryStorageKey, boardComposerStorageKey, boardDirectOpenStorageKey, boardPostStorageKey, hasRouteTarget, resetBoardToList])
  );

  /**
   * /board is one HIVE's boards, so it has nothing to say while you are
   * standing above them all.
   *
   * `atWholeHive: 'hidden'` in lib/navigation.ts already says this, and the
   * rail obeys it — which is why nobody noticed that the SCREEN did not.
   * `wholeHive` lasts as long as the browser tab, so a link, a reload or a back
   * press could put you here with the app still up at HIVE-Wide: Nat pressed
   * back out of a thread on 2026-08-06 and landed on OG HIVE's "Favorite
   * Books!" wearing HIVE-Wide's black-and-globe, with the trail underneath
   * calling it a shared board. It was never shared; the page was the wrong page
   * to be on. `lib/hooks/useHiveOnlyScreen.ts` was written for this exact job
   * and never wired up anywhere — deleted 2026-08-09 rather than left as a
   * shelf nobody reaches for. The effect below is the actual fix.
   *
   * A link still on its way down into a HIVE is left alone — it is about to
   * bring you into one, and bouncing it would beat it to the punch.
   */
  useEffect(() => {
    if (isWide || !wholeHive || resolvesRoutePost) return;
    router.replace('/hive-wide' as never);
  }, [isWide, resolvesRoutePost, router, wholeHive]);

  // Which post id we've already asked the database about (or are mid-asking).
  //
  // This used to be read off `landing.postId` (state), and that state was
  // also in this very effect's own dependency list. The moment the effect
  // called `setLanding({ state: 'looking' })`, that dependency changed —
  // `landing.postId` went from unset to the post id — so React reran the
  // effect immediately: cleanup fired first (cancelling the fetch that had
  // just started), and the rerun's "already answered?" guard read the
  // 'looking' state it had just set and quietly skipped starting a
  // replacement. Nothing was left to ever resolve it. The thread link would
  // sit on the loading bee forever — Nat's "blank Boards page with a small
  // floating bee" report, 2026-08-11, reproduced on every single link because
  // it needed no race with anything else: the effect was cancelling itself.
  // A ref sidesteps this — updating it doesn't schedule a rerender, so
  // setting it can't retrigger the effect that reads it.
  const askedAboutPostIdRef = useRef<string | null>(null);

  // Where does this thread actually live? Ask the row, then go there.
  useEffect(() => {
    if (!resolvesRoutePost || !routePostId) {
      setLanding(null);
      askedAboutPostIdRef.current = null;
      return;
    }
    // Already answered for this link, or already asking. Without this the
    // effect would re-ask on every unrelated rerender.
    if (askedAboutPostIdRef.current === routePostId) return;
    // Which HIVEs this person belongs to lands a moment after the screen does,
    // and it is the fact that decides whether we can step into one. Deciding
    // without it would answer "no" to everybody who arrived by link, which is
    // the bug this whole effect exists to end.
    if (memberships.length === 0) return;

    askedAboutPostIdRef.current = routePostId;
    let cancelled = false;
    setLanding({ postId: routePostId, state: 'looking' });

    (async () => {
      // Row-level security is the referee: a thread this person may not read
      // comes back empty, and that is the answer, not an error to explain away.
      const { data, error } = await supabase
        .from('board_posts')
        .select('id, community_id, category_id')
        .eq('id', routePostId)
        .maybeSingle();

      if (cancelled) return;

      const row = data as { id: string; community_id: string; category_id: string | null } | null;
      if (error || !row) {
        setLanding({ postId: routePostId, state: 'unreachable' });
        return;
      }

      setLanding({
        postId: row.id,
        state: 'found',
        communityId: row.community_id,
        categoryId: row.category_id,
      });
    })();

    return () => { cancelled = true; };
  }, [memberships.length, resolvesRoutePost, routePostId]);

  // Which landed thread we've already stepped into a HIVE for — a ref for the
  // same reason as above: this effect's own job (moving into a HIVE) must
  // never be what causes it to be cancelled and skipped.
  const switchedForPostIdRef = useRef<string | null>(null);

  // Standing above the HIVEs, or standing in a different one: come down into
  // the one that owns this thread so the page, the header, the trail and the
  // way back all agree about where you are. Somebody who can read the thread
  // without belonging to its HIVE — a board shared HIVE-Wide — stays exactly
  // where they are, because there is nowhere to step into.
  //
  // Split out from the lookup effect above on purpose: `switchCommunity`'s
  // identity moves whenever `memberships`, `communityId` or the profile id
  // change, and having that effect also depend on it meant any of those
  // shifting mid-fetch could cancel the database lookup itself. Moving the
  // HIVE-switch is safe to redo; the lookup is not.
  useEffect(() => {
    if (!landedHere || landedHere.state !== 'found') return;
    if (switchedForPostIdRef.current === landedHere.postId) return;

    const belongsHere = memberships.some((m) => m.community_id === landedHere.communityId);
    if (belongsHere && (wholeHive || landedHere.communityId !== myCommunityId)) {
      switchedForPostIdRef.current = landedHere.postId;
      switchCommunity(landedHere.communityId);
    }
  }, [landedHere, memberships, myCommunityId, switchCommunity, wholeHive]);

  useEffect(() => {
    if (!communityId || !hasRouteTarget) return;

    const shouldPersistRouteTarget = routeOrigin !== 'home';

    setBoardSearch('');
    setThreadSearch('');
    setThreadListView('active');
    setShowComposer(false);
    setEditingPost(null);
    setShowTopicComposer(false);
    setEditingTopic(null);
    setShowAddLinkedWishModal(false);
    setSelectedLinkedWish(null);
    setManagingLinkedWish(null);
    setEditingLinkedWish(null);
    setLinkedWishToGrant(null);
    setGrantThreadContext(null);

    if (!shouldPersistRouteTarget) {
      if (boardCategoryStorageKey) removeStoredItem(boardCategoryStorageKey);
      if (boardPostStorageKey) removeStoredItem(boardPostStorageKey);
    }

    if (routeCategoryId) {
      setSelectedCategoryId(routeCategoryId);
      if (boardCategoryStorageKey && shouldPersistRouteTarget) {
        setStoredItem(boardCategoryStorageKey, routeCategoryId);
      }
    } else if (routePostId) {
      // The board a thread belongs to is the one named on its own row.
      //
      // This branch used to leave whatever was already selected alone, so a
      // link to a thread inherited the last board you had open: Nat's trail
      // read "HIVE-Wide › Boards › Favorite Books! › July Newsletter 📰" for a
      // thread that has never been on Favorite Books!, and pressing back put
      // her inside that board (2026-08-06). Nothing else knows the answer, so
      // nothing else may fill it in — it stays empty until the row says.
      const ownBoardId = routePostReady ? landedHere.categoryId : null;
      setSelectedCategoryId(ownBoardId);
      if (boardCategoryStorageKey) {
        if (ownBoardId && shouldPersistRouteTarget) setStoredItem(boardCategoryStorageKey, ownBoardId);
        else removeStoredItem(boardCategoryStorageKey);
      }
    } else if (!shouldPersistRouteTarget) {
      setSelectedCategoryId(null);
    }

    // A thread opens once we know where it lives, and not a moment before.
    if (routePostId && (routePostReady || !resolvesRoutePost)) {
      setSelectedPostId(routePostId);
      if (boardPostStorageKey && shouldPersistRouteTarget) {
        setStoredItem(boardPostStorageKey, routePostId);
      }
    } else {
      setSelectedPostId(null);
      if (boardPostStorageKey) removeStoredItem(boardPostStorageKey);
    }

    if (boardComposerStorageKey) removeStoredItem(boardComposerStorageKey);
    if (boardDirectOpenStorageKey) removeStoredItem(boardDirectOpenStorageKey);
  }, [
    boardCategoryStorageKey,
    boardComposerStorageKey,
    boardDirectOpenStorageKey,
    boardPostStorageKey,
    communityId,
    hasRouteTarget,
    landedHere,
    resolvesRoutePost,
    routeCategoryId,
    routeOpenKey,
    routeOrigin,
    routePostId,
    routePostReady,
  ]);

  // The two effects below put you back where you were last time. A link names
  // where it wants you, so they keep their hands off it — otherwise the board
  // you had open last week quietly reappears around somebody else's thread.
  useEffect(() => {
    if (hasRouteTarget) return;
    if (!boardCategoryStorageKey || selectedCategoryId || categories.length === 0) return;

    const savedCategoryId = getStoredItem(boardCategoryStorageKey);
    if (savedCategoryId && categories.some((category) => category.id === savedCategoryId)) {
      setSelectedCategoryId(savedCategoryId);
    }
  }, [boardCategoryStorageKey, categories, hasRouteTarget, selectedCategoryId]);

  useEffect(() => {
    if (!boardComposerStorageKey || !selectedCategoryId) return;

    setShowComposer(getStoredItem(boardComposerStorageKey) === 'true');
  }, [boardComposerStorageKey, selectedCategoryId]);

  useEffect(() => {
    if (hasRouteTarget) return;
    if (!boardPostStorageKey || selectedPostId) return;

    const savedPostId = getStoredItem(boardPostStorageKey);
    if (savedPostId) {
      setSelectedPostId(savedPostId);
    }
  }, [boardPostStorageKey, hasRouteTarget, selectedPostId]);

  useEffect(() => {
    if (!communityId) return;

    let cancelled = false;
    const loadTopicMembers = async () => {
      const { data: memberships, error: membershipError } = await supabase
        .from('community_memberships')
        .select('user_id')
        .eq('community_id', communityId);

      if (membershipError) {
        console.warn('[Board] topic memberships load failed', membershipError);
        return;
      }

      const userIds = (memberships ?? []).map((row: any) => row.user_id).filter(Boolean);
      if (userIds.length === 0) {
        if (!cancelled) setTopicMembers([]);
        return;
      }

      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('id, name, avatar_url')
        .in('id', userIds);

      if (profilesError) {
        console.warn('[Board] topic member profiles load failed', profilesError);
        return;
      }

      const members = (profilesData ?? [])
        .sort((a: Pick<Profile, 'name'>, b: Pick<Profile, 'name'>) => a.name.localeCompare(b.name));

      if (!cancelled) setTopicMembers(members);
    };

    loadTopicMembers();
    return () => {
      cancelled = true;
    };
  }, [communityId]);

  const handleCategorySelect = useCallback((category: BoardCategory) => {
    setSelectedCategoryId(category.id);
    const searchMatch = boardSearchQuery ? boardSearchMatchesByCategory[category.id] : null;
    setThreadListView(searchMatch?.archivedOnly ? 'archive' : 'active');
    setThreadSearch(searchMatch ? boardSearch.trim() : '');
    if (boardCategoryStorageKey) {
      setStoredItem(boardCategoryStorageKey, category.id);
    }
  }, [boardCategoryStorageKey, boardSearch, boardSearchMatchesByCategory, boardSearchQuery]);

  const returnHomeFromRouteTarget = useCallback(() => {
    resetBoardToList();
    router.replace('/hive');
  }, [resetBoardToList, router]);

  const handleBack = useCallback(() => {
    if (shouldReturnHomeFromRoute) {
      returnHomeFromRouteTarget();
      return;
    }

    resetBoardToList();
  }, [resetBoardToList, returnHomeFromRouteTarget, shouldReturnHomeFromRoute]);

  const handleOpenComposer = useCallback(() => {
    setEditingPost(null);
    setShowComposer(true);
    if (boardComposerStorageKey) {
      setStoredItem(boardComposerStorageKey, 'true');
    }
  }, [boardComposerStorageKey]);

  const handleCloseComposer = useCallback(() => {
    setShowComposer(false);
    setEditingPost(null);
    if (boardComposerStorageKey) {
      removeStoredItem(boardComposerStorageKey);
    }
  }, [boardComposerStorageKey]);

  const handlePostSelect = useCallback((postId: string) => {
    setSelectedPostId(postId);
    if (boardPostStorageKey) {
      setStoredItem(boardPostStorageKey, postId);
    }
  }, [boardPostStorageKey]);

  const handlePostBack = useCallback(() => {
    if (shouldReturnHomeFromRoute) {
      returnHomeFromRouteTarget();
      return;
    }

    setSelectedPostId(null);
    invalidatePosts();
    refetchPostCounts();
    if (boardPostStorageKey) {
      removeStoredItem(boardPostStorageKey);
    }
  }, [boardPostStorageKey, invalidatePosts, refetchPostCounts, returnHomeFromRouteTarget, shouldReturnHomeFromRoute]);

  const handleCreatePost = async (title: string, content: string, attachments?: Attachment[]) => {
    if (!profile || !communityId || !selectedCategory) {
      showAlert('Give it a second', 'Your profile is still loading. What you wrote is still here — try posting again in a moment.');
      return false;
    }

    try {
      const { data, error } = await (supabase as any).from('board_posts').insert({
        community_id: communityId,
        category_id: selectedCategory.id,
        author_id: profile.id,
        title,
        content,
        attachments: attachments && attachments.length > 0 ? attachments : null,
      }).select().single();

      if (error) {
        showAlert('That post did not save', `${error.message}\n\nWhat you wrote is still here — try posting again.`);
        return false;
      }

      if (!data) {
        showAlert(
          'That post did not save',
          'It looks like you cannot post on this board. Ask an admin to open it up, and copy your words somewhere safe first.'
        );
        return false;
      }

      invalidatePosts();
      await Promise.all([refetchPosts(), refetchPostCounts()]);
      const mentionableMembers = topicMembers.length > 0
        ? topicMembers
        : await fetchCommunityMentionableMembers(communityId);
      const mentionedMembers = getMentionedMembers(
        `${title} ${content}`,
        mentionableMembers,
        profile.id,
        mentionReach
      );
      mentionedMembers.forEach((member) => {
        supabase.functions.invoke('notify-board-mention', {
          body: {
            post_id: data.id,
            sender_id: profile.id,
            recipient_id: member.id,
            message_preview: content,
            community_id: communityId,
            board_name: selectedCategory.name,
          },
        }).catch((err) => console.log('Board mention notification error (non-blocking):', err));
      });
      return true;
    } catch (error: unknown) {
      showAlert('That post did not save', `${getBoardErrorMessage(error)}\n\nWhat you wrote is still here — try posting again.`);
      return false;
    }
  };

  const handleUpdatePost = async (title: string, content: string, attachments?: Attachment[]) => {
    if (!profile || !communityId || !editingPost || !canManageThread(editingPost)) {
      showAlert('This thread cannot be edited right now', 'Either it is still loading or it is not yours to change. Close this and open it again.');
      return false;
    }

    try {
      const { error } = await (supabase as any)
        .from('board_posts')
        .update({
          title,
          content,
          edited_at: new Date().toISOString(),
          ...(attachments && attachments.length > 0 ? { attachments } : {}),
        })
        .eq('id', editingPost.id)
        .eq('community_id', communityId);

      if (error) {
        showAlert('Your edit did not save', `${error.message}\n\nYour changes are still here — try saving again.`);
        return false;
      }

      setEditingPost(null);
      invalidatePosts();
      await Promise.all([refetchPosts(), refetchPostCounts()]);
      return true;
    } catch (error: unknown) {
      showAlert('Your edit did not save', `${getBoardErrorMessage(error)}\n\nYour changes are still here — try saving again.`);
      return false;
    }
  };

  const canPost = () => {
    if (!selectedCategory || !profile || !communityId) return false;
    if (selectedCategory.requires_admin && !isAdmin) return false;
    return true;
  };
  const canAddLinkedWish = !!selectedCategory && !isArchivedCategory(selectedCategory) && canPost();
  const canManageLinkedWish = useCallback((wish: LinkedWish | null) => {
    if (!wish || !profile || !selectedCategory) return false;
    return isAdmin
      || wish.user_id === profile.id
      || selectedCategory.owner_user_id === profile.id
      || selectedCategory.created_by === profile.id;
  }, [isAdmin, profile, selectedCategory]);
  const canEditLinkedWish = useCallback((wish: LinkedWish | null) => (
    !!wish && !!profile && wish.user_id === profile.id
  ), [profile]);
  const canModerateLinkedWish = useCallback((wish: LinkedWish | null) => (
    !!wish && !!profile && wish.user_id === profile.id
  ), [isAdmin, profile]);

  const getLinkedWishForPost = useCallback((post: Pick<BoardPost, 'id' | 'granted_wish_id'>) => (
    linkedWishes.find((wish) => (
      wish.source_board_post_id === post.id || (!!post.granted_wish_id && wish.id === post.granted_wish_id)
    )) || null
  ), [linkedWishes]);

  const fetchLinkedWishById = useCallback(async (wishId: string): Promise<LinkedWish | null> => {
    if (!communityId) return null;

    const { data, error } = await (supabase as any)
      .from('wishes')
      // Same narrowing as lib/hooks/useBoardLinkedWishes.ts's linkedWishSelect
      // — this feeds the same WishDetail view, which only ever reads id/name/
      // avatar_url off `user` and `granters[].granter`.
      .select('*, user:profiles!user_id(id, name, avatar_url), granters:wish_granters(*, granter:profiles!granter_id(id, name, avatar_url))')
      .eq('id', wishId)
      .eq('community_id', communityId)
      .in('status', ['public', 'fulfilled'])
      .maybeSingle();

    if (error) throw error;
    return (data as LinkedWish | null) ?? null;
  }, [communityId]);
  const editingPostLinkedWish = editingPost ? getLinkedWishForPost(editingPost) : null;

  const saveTopicMemberTags = async (categoryId: string, audience: BoardTopicAudience, taggedMemberIds: string[]) => {
    if (!profile || !communityId) return true;

    const { error: deleteError } = await (supabase as any)
      .from('board_category_member_tags')
      .delete()
      .eq('category_id', categoryId)
      .eq('community_id', communityId);

    if (deleteError) {
      showAlert(
        'Could not update who is tagged',
        `${deleteError.message}\n\nEverything else about the board is saved. Open Edit board to try the tags again.`
      );
      return false;
    }

    if (audience !== 'members' || taggedMemberIds.length === 0) return true;

    const uniqueMemberIds = Array.from(new Set(taggedMemberIds));
    const rows = uniqueMemberIds.map((memberId) => ({
      community_id: communityId,
      category_id: categoryId,
      tagged_user_id: memberId,
      tagged_by: profile.id,
    }));

    const { error: insertError } = await (supabase as any)
      .from('board_category_member_tags')
      .insert(rows);

    if (insertError) {
      showAlert(
        'Could not save who is tagged',
        `${insertError.message}\n\nEverything else about the board is saved. Open Edit board to try the tags again.`
      );
      return false;
    }

    return true;
  };

  const handleCreateTopic = async (
    name: string,
    description: string,
    icon: string,
    audience: BoardTopicAudience,
    taggedMemberIds: string[],
    metadata: BoardTopicMetadata
  ) => {
    if (!profile || !communityId) {
      showAlert('Give it a second', 'Your profile is still loading. What you typed is still here — try again in a moment.');
      return false;
    }

    try {
      const maxOrder = categories.length > 0
        ? Math.max(...categories.map(c => c.display_order))
        : 0;

      const { data, error } = await (supabase as any).from('board_categories').insert({
        community_id: communityId,
        name,
        description: description || null,
        category_type: 'custom',
        icon,
        audience,
        // A board made from the HIVE-Wide screen is a shared board. Made from
        // your own HIVE's screen, it belongs to that HIVE. You should not have
        // to think about it — where you made it is the answer (2026-08-03).
        reach: isWide ? 'all_hives' : 'hive',
        display_order: maxOrder + 1,
        is_system: false,
        requires_admin: false,
        requires_approval: false,
        created_by: profile.id,
        topic_kind: metadata.topicKind,
        owner_user_id: metadata.ownerUserId,
        goal_title: metadata.goalTitle,
      }).select().single();

      if (error) {
        showAlert('That board was not created', `${error.message}\n\nWhat you typed is still here — try again.`);
        return false;
      }

      if (!data) {
        showAlert('That board was not created', 'It looks like you cannot make a board here. An admin can make one for you.');
        return false;
      }

      const tagsSaved = await saveTopicMemberTags(data.id, audience, taggedMemberIds);
      if (!tagsSaved) return false;

      invalidateCategories();
      setSelectedCategoryId(data.id);
      return true;
    } catch (error: unknown) {
      showAlert('That board was not created', `${getBoardErrorMessage(error)}\n\nWhat you typed is still here — try again.`);
      return false;
    }
  };

  const handleUpdateTopic = async (
    name: string,
    description: string,
    icon: string,
    audience: BoardTopicAudience,
    taggedMemberIds: string[],
    metadata: BoardTopicMetadata
  ) => {
    if (!editingTopic || !profile || !communityId || !canManageCategory(editingTopic)) {
      showAlert('This board cannot be edited right now', 'Either it is still loading or it is not yours to change. Close this and open it again.');
      return false;
    }

    if (editingTopic.is_system) {
      showAlert('This one is built in', 'Every HIVE gets these boards, so they cannot be edited here.');
      return false;
    }

    try {
      const { error } = await (supabase as any)
        .from('board_categories')
        .update({
          name,
          description: description || null,
          icon,
          audience,
          // The Edit HIVE Board modal's "This HIVE only / HIVE-Wide" toggle
          // (BoardTopicComposer) writes here now too — this used to only ever
          // set `reach` when a board was first created, so flipping the
          // toggle on an existing board silently did nothing.
          reach: metadata.reach,
          topic_kind: metadata.topicKind,
          owner_user_id: metadata.ownerUserId,
          goal_title: metadata.goalTitle,
        })
        .eq('id', editingTopic.id)
        .eq('community_id', communityId);

      if (error) {
        showAlert('Your changes did not save', `${error.message}\n\nWhat you typed is still here — try saving again.`);
        return false;
      }

      const tagsSaved = await saveTopicMemberTags(editingTopic.id, audience, taggedMemberIds);
      if (!tagsSaved) return false;

      invalidateCategories();
      setEditingTopic(null);
      return true;
    } catch (error: unknown) {
      showAlert('Your changes did not save', `${getBoardErrorMessage(error)}\n\nWhat you typed is still here — try saving again.`);
      return false;
    }
  };

  const openEditTopic = useCallback((category: BoardCategory) => {
    if (!canManageCategory(category) && !canArchiveCategory(category)) return;
    setEditingTopic(category);
    setShowTopicComposer(true);
  }, [canArchiveCategory, canManageCategory]);

  const closeTopicComposer = useCallback(() => {
    setShowTopicComposer(false);
    setEditingTopic(null);
  }, []);

  const handleDeleteTopic = useCallback((category: BoardCategory, onDone?: () => void) => {
    if (!canManageCategory(category)) return;

    const count = postCounts?.[category.id]?.count ?? 0;
    const message = count > 0
      ? `"${category.name}" and its ${count} ${count === 1 ? 'post' : 'posts'} go with it. This cannot be undone.`
      : `"${category.name}" goes for good. This cannot be undone.`;

    const deleteCategory = async () => {
      try {
        const { error } = await supabase
          .from('board_categories')
          .delete()
          .eq('id', category.id)
          .eq('community_id', category.community_id)
          .eq('is_system', false);

        if (error) {
          showAlert('That board was not deleted', `${error.message}\n\nIt is still on the list — nothing was lost.`);
          return;
        }

        if (selectedCategoryId === category.id) {
          setSelectedCategoryId(null);
        }
        if (boardCategoryStorageKey) {
          removeStoredItem(boardCategoryStorageKey);
        }
        if (boardComposerStorageKey) {
          removeStoredItem(boardComposerStorageKey);
        }
        if (boardPostStorageKey) {
          removeStoredItem(boardPostStorageKey);
        }
        invalidateCategories();
        onDone?.();
      } catch (error: unknown) {
        showAlert('That board was not deleted', `${getBoardErrorMessage(error)}\n\nIt is still on the list — nothing was lost.`);
      }
    };

    confirmAction({
      title: 'Delete this board?',
      message,
      confirmLabel: 'Delete',
      destructive: true,
      onConfirm: deleteCategory,
    });
  }, [
    boardCategoryStorageKey,
    boardComposerStorageKey,
    boardPostStorageKey,
    canManageCategory,
    invalidateCategories,
    postCounts,
    selectedCategoryId,
  ]);

  const handleArchiveTopic = useCallback((category: BoardCategory, onDone?: () => void) => {
    if (!canArchiveCategory(category)) return;

    const restore = isArchivedCategory(category);
    const nextStatus = restore ? 'active' : 'archived';
    const message = restore
      ? `"${category.name}" goes back on the active board list.`
      : `"${category.name}" disappears from the board list for everyone, and it can't be reopened from the app.`;

    const updateStatus = async () => {
      try {
        const { error } = await (supabase as any)
          .from('board_categories')
          .update({
            status: nextStatus,
            completed_at: restore ? null : category.completed_at ?? null,
            completed_by: restore ? null : category.completed_by ?? null,
            completion_note: restore ? null : category.completion_note ?? null,
          })
          .eq('id', category.id)
          .eq('community_id', category.community_id);

        if (error) {
          showAlert(
            restore ? 'That board was not restored' : 'That board was not archived',
            `${error.message}\n\nNothing changed — try again in a moment.`
          );
          return;
        }

        if (!restore) {
          setSelectedCategoryId(null);
          if (boardCategoryStorageKey) {
            removeStoredItem(boardCategoryStorageKey);
          }
        }
        invalidateCategories();
        onDone?.();
      } catch (error: unknown) {
        showAlert(
          restore ? 'That board was not restored' : 'That board was not archived',
          `${getBoardErrorMessage(error)}\n\nNothing changed — try again in a moment.`
        );
      }
    };

    confirmAction({
      title: restore ? 'Restore this board?' : 'Archive this board?',
      message,
      confirmLabel: restore ? 'Restore' : 'Archive',
      onConfirm: updateStatus,
    });
  }, [boardCategoryStorageKey, canArchiveCategory, invalidateCategories]);

  const handleCompleteTopic = useCallback((category: BoardCategory, onDone?: () => void) => {
    if (!profile || !communityId || !canArchiveCategory(category) || !isCompletableHdAsk(category)) return;

    const message = category.source_wish_id
      ? `"${category.name}" moves into Archive and its source wish moves to Granted.`
      : `"${category.name}" moves into Archive. Any linked wishes stay open until each one is granted.`;

    const completeTopic = async () => {
      const completedAt = new Date().toISOString();
      try {
        const { error } = await (supabase as any)
          .from('board_categories')
          .update({
            status: 'completed',
            completed_at: completedAt,
            completed_by: profile.id,
            completion_note: 'Completed from the HD board.',
          })
          .eq('id', category.id)
          .eq('community_id', communityId);

        if (error) {
          showAlert('Could not mark that complete', `${error.message}\n\nThe board is unchanged — try again in a moment.`);
          return;
        }

        if (category.source_wish_id) {
          const { error: wishError } = await (supabase as any)
            .from('wishes')
            .update({
              status: 'fulfilled',
              is_active: false,
              fulfilled_at: completedAt,
              fulfilled_by: profile.id,
              thank_you_message: 'Completed through the linked HD board.',
            })
            .eq('id', category.source_wish_id)
            .eq('community_id', communityId);

          if (wishError) {
            console.log('Source wish completion skipped (non-blocking):', wishError);
          }
        }

        setSelectedCategoryId(null);
        if (boardCategoryStorageKey) {
          removeStoredItem(boardCategoryStorageKey);
        }
        invalidateCategories();
        invalidateLinkedWishes();
        onDone?.();
      } catch (error: unknown) {
        showAlert('Could not mark that complete', `${getBoardErrorMessage(error)}\n\nThe board is unchanged — try again in a moment.`);
      }
    };

    confirmAction({
      title: 'Mark this board complete?',
      message,
      confirmLabel: 'Complete',
      onConfirm: completeTopic,
    });
  }, [boardCategoryStorageKey, canArchiveCategory, communityId, invalidateCategories, invalidateLinkedWishes, profile]);

  const handleGrantLinkedWish = async (data: {
    wishId: string;
    granterIds: string[];
    thankYouMessage?: string;
  }) => {
    if (!profile || !communityId) {
      return { error: new Error('Not authenticated') };
    }

    const fulfilledAt = new Date().toISOString();
    const { data: wishLink } = await (supabase as any)
      .from('wishes')
      .select('source_board_post_id')
      .eq('id', data.wishId)
      .eq('community_id', communityId)
      .maybeSingle();

    const { error: wishError } = await (supabase as any)
      .from('wishes')
      .update({
        status: 'fulfilled',
        is_active: false,
        fulfilled_at: fulfilledAt,
        fulfilled_by: profile.id,
        thank_you_message: data.thankYouMessage || null,
      })
      .eq('id', data.wishId)
      .eq('community_id', communityId);

    if (wishError) return { error: wishError };

    if (data.granterIds.length > 0) {
      const granterRows = data.granterIds.map((granterId) => ({
        wish_id: data.wishId,
        granter_id: granterId,
        community_id: communityId,
      }));
      const { error: granterError } = await (supabase as any)
        .from('wish_granters')
        .upsert(granterRows, { onConflict: 'wish_id,granter_id' });

      if (granterError) return { error: granterError };
    }

    const { error: boardError } = await (supabase as any)
      .from('board_categories')
      .update({
        status: 'completed',
        completed_at: fulfilledAt,
        completed_by: profile.id,
        completion_note: data.thankYouMessage || 'Completed from linked wish.',
      })
      .eq('source_wish_id', data.wishId)
      .eq('community_id', communityId);

    if (boardError) {
      console.log('Linked board completion skipped (non-blocking):', boardError);
    }

    if (wishLink?.source_board_post_id) {
      const { error: postError } = await (supabase as any)
        .from('board_posts')
        .update({
          status: 'completed',
          completed_at: fulfilledAt,
          completed_by: profile.id,
          completion_note: data.thankYouMessage || 'Completed from linked wish.',
          granted_wish_id: data.wishId,
        })
        .eq('id', wishLink.source_board_post_id)
        .eq('community_id', communityId);

      if (postError) {
        console.log('Linked thread completion skipped (non-blocking):', postError);
      }
    }

    invalidatePosts();
    invalidateLinkedWishes();
    invalidateCategories();
    celebrateWishGranted();
    return { error: null };
  };

  const handleLinkThreadWish = useCallback(async (post: BoardPost, onDone?: () => void) => {
    if (!profile || !communityId || !selectedCategory || !canManageThread(post)) return;

    try {
      await linkThreadToCommunityWish({
        post,
        category: selectedCategory,
        communityId,
        actorId: profile.id,
      });

      invalidatePosts();
      invalidateLinkedWishes();
      await Promise.all([refetchPosts(), refetchLinkedWishes()]);
      onDone?.();
    } catch (error: unknown) {
      showAlert('Could not turn this into a wish', `${getBoardErrorMessage(error)}\n\nThe thread itself is untouched — try again in a moment.`);
    }
  }, [
    canManageThread,
    communityId,
    invalidateLinkedWishes,
    invalidatePosts,
    profile,
    refetchLinkedWishes,
    refetchPosts,
    selectedCategory,
  ]);

  const handleUnlinkLinkedWish = useCallback((wish: LinkedWish, onDone?: () => void) => {
    if (!communityId || !canManageLinkedWish(wish)) return;

    const unlink = async () => {
      try {
        await unlinkWishFromBoard({ wishId: wish.id, communityId });
        invalidateLinkedWishes();
        invalidatePosts();
        await Promise.all([refetchLinkedWishes(), refetchPosts()]);
        setManagingLinkedWish(null);
        if (selectedLinkedWish?.id === wish.id) {
          setSelectedLinkedWish(null);
        }
        onDone?.();
      } catch (error: unknown) {
        showAlert('That wish is still linked', `${getBoardErrorMessage(error)}\n\nNothing changed — try again in a moment.`);
      }
    };

    confirmAction({
      title: 'Unlink this wish?',
      message: `It stays a wish — it just stops showing on this board.\n\n"${wish.description}"`,
      confirmLabel: 'Unlink',
      onConfirm: unlink,
    });
  }, [
    canManageLinkedWish,
    communityId,
    invalidateLinkedWishes,
    invalidatePosts,
    refetchLinkedWishes,
    refetchPosts,
    selectedLinkedWish?.id,
  ]);

  const handleArchiveLinkedWish = useCallback((wish: LinkedWish) => {
    if (!communityId || !canModerateLinkedWish(wish)) return;

    const archive = async () => {
      try {
        const { error } = await (supabase as any)
          .from('wishes')
          .update({ status: 'replaced', is_active: false, replaced_at: new Date().toISOString() })
          .eq('id', wish.id)
          .eq('community_id', communityId);

        if (error) throw error;

        invalidateLinkedWishes();
        await refetchLinkedWishes();
        setManagingLinkedWish(null);
        setSelectedLinkedWish(null);
      } catch (error: unknown) {
        showAlert('That wish was not archived', `${getBoardErrorMessage(error)}\n\nIt is still on the board — try again in a moment.`);
      }
    };

    confirmAction({
      title: 'Archive this wish?',
      message: `It comes off HD Wishes for everyone.\n\n"${wish.description}"`,
      confirmLabel: 'Archive',
      onConfirm: archive,
    });
  }, [canModerateLinkedWish, communityId, invalidateLinkedWishes, refetchLinkedWishes]);

  const handleDeleteLinkedWish = useCallback((wish: LinkedWish) => {
    if (!communityId || !canModerateLinkedWish(wish)) return;

    const deleteWish = async () => {
      try {
        const { error } = await deleteWishById({
          wishId: wish.id,
          communityId,
        });

        if (error) throw error;

        invalidateLinkedWishes();
        await refetchLinkedWishes();
        setManagingLinkedWish(null);
        setSelectedLinkedWish(null);
      } catch (error: unknown) {
        showAlert('That wish was not deleted', `${getBoardErrorMessage(error)}\n\nIt is still here — try again in a moment.`);
      }
    };

    confirmAction({
      title: 'Delete this wish?',
      message: `This cannot be undone.\n\n"${wish.description}"`,
      confirmLabel: 'Delete',
      destructive: true,
      onConfirm: deleteWish,
    });
  }, [canModerateLinkedWish, communityId, invalidateLinkedWishes, refetchLinkedWishes]);

  const handleUnlinkThreadWish = useCallback((post: BoardPost, onDone?: () => void) => {
    const linkedWish = getLinkedWishForPost(post);
    if (!linkedWish) return;
    handleUnlinkLinkedWish(linkedWish, onDone);
  }, [getLinkedWishForPost, handleUnlinkLinkedWish]);

  const handlePrepareGrantThread = useCallback(async (post: BoardPost, onDone?: () => void) => {
    if (!profile || !communityId || !selectedCategory || !canCompleteThread(post)) return;

    try {
      const linkedWish = getLinkedWishForPost(post);
      const wishId = linkedWish?.id ?? await linkThreadToCommunityWish({
        post,
        category: selectedCategory,
        communityId,
        actorId: profile.id,
      });
      const wish = linkedWish ?? await fetchLinkedWishById(wishId);

      if (!wish) {
        showAlert(
          'Almost — the wish would not open',
          'The wish behind this thread was made, but it did not come back to us. Pull down to refresh and press Granted again.'
        );
        return;
      }

      setGrantThreadContext({ post, wish, onDone });
    } catch (error: unknown) {
      showAlert('Could not set up the granting', `${getBoardErrorMessage(error)}\n\nThe thread is unchanged — try again in a moment.`);
    }
  }, [
    canCompleteThread,
    communityId,
    fetchLinkedWishById,
    getLinkedWishForPost,
    profile,
    selectedCategory,
  ]);

  const handleGrantThreadWish = async (data: {
    wishId: string;
    granterIds: string[];
    thankYouMessage?: string;
  }) => {
    if (!profile || !communityId || !selectedCategory || !grantThreadContext) {
      return { error: new Error('Not ready') };
    }

    try {
      await markBoardThreadGranted({
        post: grantThreadContext.post,
        category: selectedCategory,
        communityId,
        completedBy: profile.id,
        completionNote: data.thankYouMessage || `Granted from ${selectedCategory.name}.`,
        wishId: data.wishId,
        granterIds: data.granterIds,
      });

      invalidatePosts();
      invalidateLinkedWishes();
      await Promise.all([refetchPosts(), refetchLinkedWishes()]);
      grantThreadContext.onDone?.();
      setGrantThreadContext(null);
      celebrateWishGranted();
      return { error: null };
    } catch (error) {
      return { error: error instanceof Error ? error : new Error('Failed to mark thread granted') };
    }
  };

  const handleEditThread = useCallback((post: BoardPost) => {
    if (!canManageThread(post)) return;
    setEditingPost(post);
    setShowComposer(true);
  }, [canManageThread]);

  const handleArchiveThread = useCallback((post: BoardPost, onDone?: () => void) => {
    if (!profile || !communityId || !canManageThread(post)) return;

    const restore = !!post.archived_at;
    const message = restore
      ? `"${post.title}" goes back on this board.`
      : `"${post.title}" moves out of the thread list. Search still finds it if you want it back.`;

    const updateArchiveState = async () => {
      try {
        const updatedThread = await setBoardThreadArchiveState({
          post,
          communityId,
          restore,
        });

        updatePostInCache(post.id, {
          archived_at: updatedThread.archived_at,
          archived_by: updatedThread.archived_by,
        });
        setEditingPost((current) => (
          current?.id === post.id
            ? { ...current, archived_at: updatedThread.archived_at, archived_by: updatedThread.archived_by }
            : current
        ));

        invalidatePosts();
        await refetchPosts();
        onDone?.();
      } catch (error: unknown) {
        showAlert(
          restore ? 'That thread was not restored' : 'That thread was not archived',
          `${getBoardErrorMessage(error)}\n\nNothing changed — try again in a moment.`
        );
      }
    };

    confirmAction({
      title: restore ? 'Restore this thread?' : 'Archive this thread?',
      message,
      confirmLabel: restore ? 'Restore' : 'Archive',
      onConfirm: updateArchiveState,
    });
  }, [canManageThread, communityId, invalidatePosts, profile, refetchPosts, updatePostInCache]);

  /**
   * Put the month's HIVE Help focus on the public site, or take it back off.
   *
   * Only the focus post travels — replies stay inside the HIVE, because those
   * are members logging their own acts of kindness. The newest public focus is
   * the one the site shows, so marking September's replaces August's by itself.
   */
  const handleToggleHelpFocusPublic = useCallback((post: BoardPost, onDone?: () => void) => {
    if (!profile || !communityId || !canManageThread(post)) return;

    const goingPublic = post.visibility !== 'public';
    const message = goingPublic
      ? `Anyone visiting the-hive.app will see "${post.title}" and what you wrote here. Replies stay inside the HIVE.`
      : `"${post.title}" comes off the public site. It stays here for members either way.`;

    const applyVisibility = async () => {
      try {
        const { error } = await (supabase as any)
          .from('board_posts')
          .update({ visibility: goingPublic ? 'public' : 'members' })
          .eq('id', post.id)
          .eq('community_id', communityId);

        if (error) {
          showAlert(
            goingPublic ? 'It did not go public' : 'It is still on the public site',
            `${error.message}\n\nNothing changed — try again in a moment.`
          );
          return;
        }

        const next: 'members' | 'public' = goingPublic ? 'public' : 'members';
        updatePostInCache(post.id, { visibility: next });
        setEditingPost((current) => (current?.id === post.id ? { ...current, visibility: next } : current));

        invalidatePosts();
        await refetchPosts();
        onDone?.();
      } catch (error: unknown) {
        showAlert(
          goingPublic ? 'It did not go public' : 'It is still on the public site',
          `${getBoardErrorMessage(error)}\n\nNothing changed — try again in a moment.`
        );
      }
    };

    confirmAction({
      title: goingPublic ? 'Show this on the public site?' : 'Keep this inside the HIVE?',
      message,
      confirmLabel: goingPublic ? 'Show it' : 'Take it off',
      onConfirm: applyVisibility,
    });
  }, [canManageThread, communityId, invalidatePosts, profile, refetchPosts, updatePostInCache]);

  const handleDeleteThread = useCallback((post: BoardPost, onDone?: () => void) => {
    if (!communityId || !canManageThread(post)) return;

    const message = `"${post.title}" and every reply on it go too. This cannot be undone.`;

    const deleteThread = async () => {
      try {
        const { data, error } = await (supabase as any)
          .from('board_posts')
          .delete()
          .eq('id', post.id)
          .eq('community_id', communityId)
          .select('id');

        if (error) {
          showAlert('That thread was not deleted', `${error.message}\n\nIt is still on the board — try again in a moment.`);
          return;
        }

        if (!data || data.length === 0) {
          showAlert(
            'That thread was not deleted',
            'It looks like it is not yours to delete. Whoever started it, or an admin, can take it down.'
          );
          return;
        }

        invalidatePosts();
        await refetchPosts();
        onDone?.();
      } catch (error: unknown) {
        showAlert('That thread was not deleted', `${getBoardErrorMessage(error)}\n\nIt is still on the board — try again in a moment.`);
      }
    };

    confirmAction({
      title: 'Delete this thread?',
      message,
      confirmLabel: 'Delete',
      destructive: true,
      onConfirm: deleteThread,
    });
  }, [canManageThread, communityId, invalidatePosts, refetchPosts]);

  const topicManagementActions = editingTopic ? (
    <>
      {isCompletableHdAsk(editingTopic) && editingTopic.status === 'active' && canArchiveCategory(editingTopic) && (
        <Pressable
          onPress={() => handleCompleteTopic(editingTopic, closeTopicComposer)}
          className="flex-row items-center border rounded-full px-3 py-2 active:opacity-75"
          style={{ backgroundColor: goldWash, borderColor: skin.borderStrong }}
        >
          <Ionicons name="checkmark-circle-outline" size={16} color={skin.gold} />
          <Text style={{ fontFamily: 'Lato_700Bold', color: skin.gold }} className="text-xs ml-1">
            Granted
          </Text>
        </Pressable>
      )}
      {canArchiveCategory(editingTopic) && (
        <Pressable
          onPress={() => handleArchiveTopic(editingTopic, closeTopicComposer)}
          className="flex-row items-center border rounded-full px-3 py-2 active:opacity-75"
          style={{ backgroundColor: chipFill, borderColor: skin.border }}
        >
          <Ionicons
            name={isArchivedCategory(editingTopic) ? 'arrow-undo-outline' : 'archive-outline'}
            size={16}
            color={skin.inkSoft}
          />
          <Text style={{ fontFamily: 'Lato_700Bold', color: skin.inkSoft }} className="text-xs ml-1">
            {isArchivedCategory(editingTopic) ? 'Restore' : 'Archive'}
          </Text>
        </Pressable>
      )}
      {canManageCategory(editingTopic) && (
        <Pressable
          onPress={() => handleDeleteTopic(editingTopic, closeTopicComposer)}
          className="flex-row items-center border rounded-full px-3 py-2 active:opacity-75"
          style={{ backgroundColor: dangerWash, borderColor: dangerEdge }}
        >
          <Ionicons name="trash-outline" size={16} color={dangerInk} />
          <Text style={{ fontFamily: 'Lato_700Bold', color: dangerInk }} className="text-xs ml-1">
            Delete
          </Text>
        </Pressable>
      )}
    </>
  ) : null;

  const linkedWishManageModal = (
    <Modal visible={!!managingLinkedWish} animationType="fade" transparent onRequestClose={() => setManagingLinkedWish(null)}>
      <Pressable
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.38)', justifyContent: 'flex-end' }}
        onPress={() => setManagingLinkedWish(null)}
      >
        <Pressable
          onPress={(event) => event.stopPropagation()}
          style={{
            backgroundColor: skin.card,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            borderTopWidth: 1,
            borderColor: 'rgba(222,193,129,0.5)',
            maxHeight: '88%',
            overflow: 'hidden',
          }}
        >
          {/* Somebody who can moderate sees five action rows under a two-line
              wish description, and Delete is the last of them. A ceiling and a
              scroll, like every other bottom sheet in the app. */}
          <BounceScrollView contentContainerStyle={{ padding: 22, paddingBottom: 34 }}>
          <View style={{ width: 36, height: 4, backgroundColor: 'rgba(189,147,72,0.28)', borderRadius: 2, alignSelf: 'center', marginBottom: 18 }} />
          {/* Same reason as the pills below: this sheet is a dark card on
              HIVE-Wide, and fixed charcoal words disappeared into it. */}
          <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 18, color: skin.ink }}>
            Manage Wish
          </Text>
          {managingLinkedWish ? (
            <Text
              numberOfLines={2}
              style={{ fontFamily: 'Lato_400Regular', fontSize: 13, lineHeight: 18, color: skin.inkSoft, marginTop: 4, marginBottom: 10 }}
            >
              {managingLinkedWish.description}
            </Text>
          ) : null}

          {managingLinkedWish && managingLinkedWish.status === 'public' && canManageLinkedWish(managingLinkedWish) ? (
            <Pressable
              onPress={() => {
                const wish = managingLinkedWish;
                setManagingLinkedWish(null);
                setLinkedWishToGrant(wish);
              }}
              className="flex-row items-center justify-between rounded-xl px-4 py-3 mt-2 active:opacity-75"
              style={{ backgroundColor: goldWash, borderWidth: 1, borderColor: skin.borderStrong }}
            >
              <View className="flex-row items-center">
                <Ionicons name="checkmark-circle-outline" size={18} color={skin.gold} />
                <Text style={{ fontFamily: 'Lato_700Bold', color: skin.gold }} className="text-sm ml-2">
                  Granted
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={skin.inkFaint} />
            </Pressable>
          ) : null}

          {managingLinkedWish && canEditLinkedWish(managingLinkedWish) ? (
            <Pressable
              onPress={() => {
                const wish = managingLinkedWish;
                setManagingLinkedWish(null);
                setSelectedLinkedWish(null);
                setEditingLinkedWish(wish);
              }}
              className="flex-row items-center justify-between rounded-xl px-4 py-3 mt-2 active:opacity-75"
              // Asked the skin instead of hard-coding a white pill. On HIVE-Wide
              // this sheet is a dark card, and three white bars sat on it.
              style={{ backgroundColor: skin.card, borderWidth: 1, borderColor: skin.border }}
            >
              <View className="flex-row items-center">
                <Ionicons name="pencil-outline" size={18} color={skin.inkBody} />
                <Text style={{ fontFamily: 'Lato_700Bold', color: skin.inkBody }} className="text-sm ml-2">
                  Edit
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={skin.inkFaint} />
            </Pressable>
          ) : null}

          {managingLinkedWish && canManageLinkedWish(managingLinkedWish) ? (
            <Pressable
              onPress={() => {
                const wish = managingLinkedWish;
                setManagingLinkedWish(null);
                handleUnlinkLinkedWish(wish);
              }}
              className="flex-row items-center justify-between rounded-xl px-4 py-3 mt-2 active:opacity-75"
              // Asked the skin instead of hard-coding a white pill. On HIVE-Wide
              // this sheet is a dark card, and three white bars sat on it.
              style={{ backgroundColor: skin.card, borderWidth: 1, borderColor: skin.border }}
            >
              <View className="flex-row items-center">
                <Ionicons name="unlink-outline" size={18} color={skin.inkBody} />
                <Text style={{ fontFamily: 'Lato_700Bold', color: skin.inkBody }} className="text-sm ml-2">
                  Unlink from board
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={skin.inkFaint} />
            </Pressable>
          ) : null}

          {managingLinkedWish && canModerateLinkedWish(managingLinkedWish) && managingLinkedWish.status === 'public' ? (
            <Pressable
              onPress={() => {
                const wish = managingLinkedWish;
                setManagingLinkedWish(null);
                handleArchiveLinkedWish(wish);
              }}
              className="flex-row items-center justify-between rounded-xl px-4 py-3 mt-2 active:opacity-75"
              // Asked the skin instead of hard-coding a white pill. On HIVE-Wide
              // this sheet is a dark card, and three white bars sat on it.
              style={{ backgroundColor: skin.card, borderWidth: 1, borderColor: skin.border }}
            >
              <View className="flex-row items-center">
                <Ionicons name="archive-outline" size={18} color={skin.inkBody} />
                <Text style={{ fontFamily: 'Lato_700Bold', color: skin.inkBody }} className="text-sm ml-2">
                  Archive
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={skin.inkFaint} />
            </Pressable>
          ) : null}

          {managingLinkedWish && canModerateLinkedWish(managingLinkedWish) ? (
            <Pressable
              onPress={() => {
                const wish = managingLinkedWish;
                setManagingLinkedWish(null);
                handleDeleteLinkedWish(wish);
              }}
              className="flex-row items-center justify-between rounded-xl px-4 py-3 mt-2 active:opacity-75"
              style={{ backgroundColor: dangerWash, borderWidth: 1, borderColor: dangerEdge }}
            >
              <View className="flex-row items-center">
                <Ionicons name="trash-outline" size={18} color={dangerInk} />
                <Text style={{ fontFamily: 'Lato_700Bold', color: dangerInk }} className="text-sm ml-2">
                  Delete
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={dangerInk} />
            </Pressable>
          ) : null}
          </BounceScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );

  // A link to one thread, before the thread is on screen.
  //
  // This gets a screen of its own rather than letting the boards list draw
  // underneath while we work it out. The list under a half-arrived link is how
  // somebody ends up looking at a board they never opened.
  if (resolvesRoutePost && !routePostReady) {
    return (
      <SafeAreaView className="flex-1" style={{ backgroundColor: skin.page }} edges={['top']}>
        <SpaceBackdrop />
        {/* A link opened from HIVE-Wide is still at HIVE-Wide until it has
            found its HIVE, so the header says so rather than putting one
            HIVE's gold over a page that has not chosen one yet. */}
        <AppHeader title="Boards" tone={isWide || wholeHive ? 'wide' : 'hive'} />
        {landedHere?.state !== 'unreachable' ? (
          <View style={{ flex: 1, justifyContent: 'center' }}>
            <ThinkingBee />
          </View>
        ) : (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 10 }}>
            <Text style={{ fontSize: 32 }}>🔒</Text>
            <Text
              style={{ fontFamily: 'LibreBaskerville_700Bold', fontSize: 17, color: skin.ink, textAlign: 'center' }}
            >
              That thread lives somewhere else
            </Text>
            <Text
              style={{
                fontFamily: 'Lato_400Regular', fontSize: 14, lineHeight: 21,
                color: skin.inkSoft, textAlign: 'center', maxWidth: 340,
              }}
            >
              It belongs to a HIVE you are not in, or it has been taken down since
              the link was made.
            </Text>
            {/* The way out goes to wherever this person is standing: back up
                to HIVE-Wide if they came from there, into their own boards if
                they were already inside a HIVE. */}
            <Pressable
              onPress={() => {
                setLanding(null);
                router.replace((wholeHive ? '/hive-wide' : '/board') as never);
              }}
              accessibilityRole="button"
              style={({ pressed }) => ({
                marginTop: 6,
                paddingHorizontal: 18,
                paddingVertical: 11,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: skin.border,
                backgroundColor: pressed ? skin.cardPressed : skin.card,
              })}
            >
              <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 13.5, color: skin.ink }}>
                {wholeHive ? 'Back to HIVE-Wide' : 'Your boards'}
              </Text>
            </Pressable>
          </View>
        )}
      </SafeAreaView>
    );
  }

  // Post detail view
  if (selectedLinkedWish) {
    return (
      <>
        <WishDetail
          wish={selectedLinkedWish}
          onClose={() => {
            setSelectedLinkedWish(null);
            invalidateLinkedWishes();
          }}
          onGrant={handleGrantLinkedWish}
          canManage={canManageLinkedWish(selectedLinkedWish) || canEditLinkedWish(selectedLinkedWish)}
          onManage={() => setManagingLinkedWish(selectedLinkedWish)}
        />
        {linkedWishManageModal}
        {linkedWishToGrant && (
          <GrantWishModal
            visible={!!linkedWishToGrant}
            onClose={() => setLinkedWishToGrant(null)}
            wish={linkedWishToGrant}
            communityId={communityId}
            onGrant={async (data) => {
              const result = await handleGrantLinkedWish(data);
              if (!result.error) {
                setLinkedWishToGrant(null);
                setSelectedLinkedWish(null);
              }
              return result;
            }}
          />
        )}
      </>
    );
  }

  if (selectedPostId) {
    return (
      <BoardPostDetail
        postId={selectedPostId}
        onBack={handlePostBack}
      />
    );
  }

  // Category list view
  if (!selectedCategory) {
    const addTopicButton = canCreateCategories ? (
      <Pressable
        onPress={() => setShowTopicComposer(true)}
        className="min-w-10 h-10 px-2 items-center justify-center rounded-full active:opacity-70"
        hitSlop={8}
      >
        <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-white text-sm">+ Board</Text>
      </Pressable>
    ) : undefined;
    const boardListToolbar = (
      <View style={{ backgroundColor: skin.card, borderBottomWidth: 1, borderBottomColor: skin.border }}>
        <View className="flex-row items-center px-4 py-3">
          <View className="flex-1 flex-row items-center rounded-full px-3 py-2" style={{ backgroundColor: skin.field, borderWidth: 1, borderColor: skin.border }}>
            <Ionicons name="search" size={17} color={skin.inkFaint} />
            <TextInput
              value={boardSearch}
              onChangeText={setBoardSearch}
              placeholder="Search boards or threads"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
              className="flex-1 ml-2"
              placeholderTextColor={skin.inkFaint}
              style={{ fontFamily: 'Lato_400Regular', fontSize: 14, color: skin.ink, outlineStyle: 'none' } as any}
            />
            {boardSearch.length > 0 && (
              <Pressable onPress={() => setBoardSearch('')} hitSlop={8}>
                <Ionicons name="close-circle" size={17} color={skin.inkFaint} />
              </Pressable>
            )}
          </View>
        </View>
        <View className="flex-row items-center justify-between px-4 pb-2">
          <Text style={{ fontFamily: 'Lato_700Bold', color: skin.inkSoft }} className="text-xs uppercase tracking-wide">
            {boardSearchQuery ? `Results (${visibleCategories.length})` : 'Boards'}
          </Text>
        </View>
      </View>
    );

    return (
      <SafeAreaView className="flex-1" style={{ backgroundColor: skin.page }} edges={['top']}>
        {/* One sky, not two. This was written twice on adjacent lines, so the
            slowest HIVE-Wide screen painted the whole scene a second time on top
            of itself for nothing. */}
        <SpaceBackdrop />
        {/* One header treatment on every width, so Boards wears its HIVE's
            colour and name like every other page (Nat 2026-07-31). */}
        <AppHeader
          title="Boards"
          // Green and nameless on HIVE-Wide. Wearing OG's gold there would say
          // you are in OG, which is the opposite of what this screen is.
          tone={isWide ? 'wide' : 'hive'}
          rightElement={
            useMobileLayout ? addTopicButton
              : canCreateCategories ? (
                <Pressable onPress={() => setShowTopicComposer(true)} className="w-10 h-10 items-center justify-center active:opacity-70">
                  <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-white text-sm">+ Board</Text>
                </Pressable>
              ) : undefined
          }
        />

        {boardListToolbar}

        {categoriesLoading && categories.length === 0 ? (
          // The other half of the white flash on HIVE-Wide Boards, and this one
          // was ours: five hard `bg-white` rows drawn over a near-black page for
          // the whole of the first query. See components/ui/SkeletonRows.
          <SkeletonRows />
        ) : (
          <View className="flex-1">
            <BoardCategoryList
              categories={visibleCategories}
              onSelect={handleCategorySelect}
              onSelectThread={(category, postId) => {
                handleCategorySelect(category);
                handlePostSelect(postId);
              }}
              postCounts={postCounts}
              searchMatches={boardSearchQuery ? boardSearchMatchesByCategory : undefined}
              emptyLabel={boardSearchQuery
                ? `No boards or threads found for "${boardSearch.trim()}".`
                : isWide
                  ? 'Nothing is shared HIVE-Wide yet. Every board still belongs to the HIVE that made it — worth deciding together which ones we all want.'
                  : 'No boards here yet.'}
            />
          </View>
        )}

        <BoardTopicComposer
          visible={showTopicComposer}
          onClose={closeTopicComposer}
          onSubmit={editingTopic ? handleUpdateTopic : handleCreateTopic}
          existingCategory={editingTopic}
          members={topicMembers}
          managementActions={topicManagementActions}
        />
      </SafeAreaView>
    );
  }

  // Posts view
  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: skin.page }} edges={['top']}>
      {/* The same sky the boards grid stands under. Stepping into a board used
          to drop it — this view never mounted the backdrop, so HIVE-Wide went
          from starfield to flat black at the first tap (Nat 2026-08-11:
          missing "inside boards"). Inside a HIVE it renders nothing. */}
      <SpaceBackdrop />
      {/* Posts view header with back button */}
      <AppHeader
        title={selectedCategory.name}
        onBackPress={handleBack}
        tone={isWide ? 'wide' : 'hive'}
        rightElement={
          (canManageCategory(selectedCategory) || canArchiveCategory(selectedCategory)) ? (
          <Pressable
            onPress={() => openEditTopic(selectedCategory)}
            className="w-9 h-9 items-center justify-center rounded-full active:opacity-70 ml-2"
            accessibilityRole="button"
            accessibilityLabel="Edit board"
            hitSlop={8}
          >
            <Ionicons name="pencil-outline" size={20} color="rgba(255,255,255,0.86)" />
          </Pressable>
          ) : undefined
        }
      />

      <FlatList
        ref={threadListBounceRef}
        data={visiblePosts}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => {
          const linkedWish = getLinkedWishForPost(item);
          return (
            <BoardPostCard
              post={item}
              onPress={() => handlePostSelect(item.id)}
              canEdit={canManageThread(item)}
              onEdit={handleEditThread}
              compactImages={!useMobileLayout}
              linkedWishLabel={linkedWish ? 'Community Wish' : undefined}
              onLinkedWishPress={linkedWish ? () => setSelectedLinkedWish(linkedWish) : undefined}
              currentUserId={profile?.id}
            />
          );
        }}
        contentContainerStyle={{ padding: 16 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={skin.gold} />
        }
        initialNumToRender={5}
        maxToRenderPerBatch={5}
        windowSize={5}
        ListHeaderComponent={
          <View>
            {selectedCategory.description ? (
              // Fixed charcoal-at-60% used to sit under this header regardless
              // of the page it was drawn on — near-invisible on HIVE-Wide's
              // night sky (Nat, 2026-08-08: "the font there is too hard to
              // read"). `skin.inkSoft` is the same quiet ink the rest of this
              // screen already uses, so it reads on both.
              <View className="mb-4">
                <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 14, color: skin.inkSoft }}>
                  {selectedCategory.description}
                </Text>
              </View>
            ) : null}
            {/* The two search boxes on this screen — boards above, threads
                here — had drifted into different corners, different fills and
                different placeholder ink. Same job, same look (2026-08-05). */}
            {(listSourcePosts.length > 0 || threadSearch.trim().length > 0) && (
              <View
                className="flex-row items-center rounded-full px-3 py-2 mb-3"
                style={{ backgroundColor: skin.field, borderWidth: 1, borderColor: skin.border }}
              >
                <Ionicons name="search" size={17} color={skin.inkFaint} />
                <TextInput
                  value={threadSearch}
                  onChangeText={setThreadSearch}
                  placeholder="Search threads"
                  placeholderTextColor={skin.inkFaint}
                  className="flex-1 ml-2"
                  style={{ fontFamily: 'Lato_400Regular', fontSize: 14, color: skin.ink, outlineStyle: 'none' } as any}
                  returnKeyType="search"
                />
                {threadSearch.length > 0 && (
                  <Pressable onPress={() => setThreadSearch('')} hitSlop={8}>
                    <Ionicons name="close-circle" size={17} color={skin.inkFaint} />
                  </Pressable>
                )}
              </View>
            )}
            <View className="flex-row items-center justify-between mb-3">
              <Text style={{ fontFamily: 'Lato_700Bold', color: skin.inkSoft }} className="text-xs uppercase tracking-wide">
                {threadListView === 'archive'
                  ? `Archived Threads (${threadSearch.trim() ? `${visiblePosts.length}/` : ''}${archivedPosts.length})`
                  : `Threads (${threadSearch.trim() ? `${visiblePosts.length}/` : ''}${activePosts.length})`}
              </Text>
              {/* Board<->wish linking retired (Lucas 2026-07-23): boards and
                  wishes live separate lives now. */}
              {/* No archive toggle — this view is only reachable when a search
                  lands on archived threads, so it just needs a way back out. */}
              <View className="flex-row items-center" style={{ gap: 8 }}>
                {threadListView === 'archive' && (
                  <Pressable
                    onPress={() => setThreadListView('active')}
                    className="flex-row items-center rounded-full px-3 py-1.5 active:opacity-70"
                    hitSlop={8}
                  >
                    <Ionicons
                      name="arrow-back-outline"
                      size={15}
                      // Charcoal-on-assumed-cream, invisible on the night sky —
                      // and search CAN land you on this archive view HIVE-Wide.
                      color={skin.inkSoft}
                      style={{ marginRight: 4 }}
                    />
                    <Text style={{ fontFamily: 'Lato_700Bold', color: skin.inkSoft }} className="text-xs">
                      Threads
                    </Text>
                  </Pressable>
                )}
              </View>
            </View>
          </View>
        }
        ListEmptyComponent={
          postsLoading ? (
            <View className="items-center py-16">
              <ThinkingBee />
            </View>
          ) : (
            // Wearing the reader's skin. A white card here was the same bug as
            // the loading rows above, one moment later: a bright panel over
            // HIVE-Wide's near-black whenever a board is empty.
            <View
              className="rounded-xl p-8 shadow-sm items-center"
              style={{ backgroundColor: skin.card, borderWidth: 1, borderColor: skin.border }}
            >
              <Text className="text-4xl mb-4">📝</Text>
              <Text style={{ fontFamily: 'Lato_400Regular', color: skin.inkSoft }} className="text-center">
                {threadSearch.trim()
                  ? `No threads found for "${threadSearch.trim()}".`
                  : 'No threads in this board yet.'}
                {!threadSearch.trim() && threadListView === 'archive'
                  ? '\nArchived threads will appear here.'
                  : !threadSearch.trim() && canPost() && '\nStart the first one!'}
              </Text>
            </View>
          )
        }
        removeClippedSubviews
      />

      {canPost() && (
        <Pressable
          onPress={handleOpenComposer}
          className="absolute bottom-6 right-6 bg-gold rounded-full px-4 h-12 flex-row items-center justify-center shadow-lg active:opacity-80"
        >
          <Ionicons name="create-outline" size={18} color="white" />
          <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-white text-sm ml-2">
            New thread
          </Text>
        </Pressable>
      )}

      <BoardComposer
        visible={showComposer}
        category={selectedCategory}
        userId={profile?.id || ''}
        onClose={handleCloseComposer}
        onSubmit={editingPost ? handleUpdatePost : handleCreatePost}
        existingPost={editingPost}
        draftStorageKey={editingPost ? null : boardDraftStorageKey}
        mentionableMembers={topicMembers}
        managementActions={editingPost ? (
          <>
            {selectedCategory?.topic_kind === 'helper_log' && canManageThread(editingPost) && (
              <Pressable
                onPress={() => handleToggleHelpFocusPublic(editingPost, handleCloseComposer)}
                className="flex-row items-center rounded-full px-3 py-2 border active:opacity-75"
                style={editingPost.visibility === 'public'
                  ? {
                      backgroundColor: skin.dark ? 'rgba(134,239,172,0.12)' : '#f0fdf4',
                      borderColor: skin.dark ? 'rgba(134,239,172,0.30)' : '#bbf7d0',
                    }
                  : { backgroundColor: chipFill, borderColor: skin.border }}
              >
                <Ionicons
                  name={editingPost.visibility === 'public' ? 'megaphone-outline' : 'lock-closed-outline'}
                  size={16}
                  color={editingPost.visibility === 'public' ? publicInk : skin.inkSoft}
                />
                <Text
                  style={{
                    fontFamily: 'Lato_700Bold',
                    color: editingPost.visibility === 'public' ? publicInk : skin.inkSoft,
                  }}
                  className="text-xs ml-1"
                >
                  {editingPost.visibility === 'public' ? 'On the public site' : 'HIVErs only'}
                </Text>
              </Pressable>
            )}
            {canCompleteThread(editingPost) && (
              <Pressable
                onPress={() => handlePrepareGrantThread(editingPost, handleCloseComposer)}
                className="flex-row items-center border rounded-full px-3 py-2 active:opacity-75"
                style={{ backgroundColor: goldWash, borderColor: skin.borderStrong }}
              >
                <Ionicons name="checkmark-circle-outline" size={16} color={skin.gold} />
                <Text style={{ fontFamily: 'Lato_700Bold', color: skin.gold }} className="text-xs ml-1">
                  Granted
                </Text>
              </Pressable>
            )}
            {canManageThread(editingPost) && (
              <Pressable
                onPress={() => handleArchiveThread(editingPost, handleCloseComposer)}
                className="flex-row items-center border rounded-full px-3 py-2 active:opacity-75"
                style={{ backgroundColor: chipFill, borderColor: skin.border }}
              >
                <Ionicons
                  name={editingPost.archived_at ? 'arrow-undo-outline' : 'archive-outline'}
                  size={16}
                  color={skin.inkSoft}
                />
                <Text style={{ fontFamily: 'Lato_700Bold', color: skin.inkSoft }} className="text-xs ml-1">
                  {editingPost.archived_at ? 'Restore' : 'Archive'}
                </Text>
              </Pressable>
            )}
            {canManageThread(editingPost) && (
              <Pressable
                onPress={() => handleDeleteThread(editingPost, handleCloseComposer)}
                className="flex-row items-center border rounded-full px-3 py-2 active:opacity-75"
                style={{ backgroundColor: dangerWash, borderColor: dangerEdge }}
              >
                <Ionicons name="trash-outline" size={16} color={dangerInk} />
                <Text style={{ fontFamily: 'Lato_700Bold', color: dangerInk }} className="text-xs ml-1">
                  Delete
                </Text>
              </Pressable>
            )}
          </>
        ) : null}
      />

      {grantThreadContext && (
        <GrantWishModal
          visible={!!grantThreadContext}
          onClose={() => setGrantThreadContext(null)}
          wish={grantThreadContext.wish}
          communityId={communityId}
          onGrant={handleGrantThreadWish}
        />
      )}

      <AddWishModal
        visible={showAddLinkedWishModal}
        onClose={() => setShowAddLinkedWishModal(false)}
        communityId={communityId}
        userId={profile?.id}
        wishOwnerUserId={linkedWishOwnerUserId}
        wishOwnerName={linkedWishOwnerName}
        linkedBoardCategory={selectedCategory}
        onSave={async () => {
          setShowAddLinkedWishModal(false);
          await refetchLinkedWishes();
          invalidateLinkedWishes();
        }}
      />

      <AddWishModal
        visible={!!editingLinkedWish}
        onClose={() => setEditingLinkedWish(null)}
        communityId={communityId}
        userId={profile?.id}
        existingWish={editingLinkedWish}
        onSave={async () => {
          setEditingLinkedWish(null);
          await refetchLinkedWishes();
          invalidateLinkedWishes();
        }}
      />

      <BoardTopicComposer
        visible={showTopicComposer}
        onClose={closeTopicComposer}
        onSubmit={editingTopic ? handleUpdateTopic : handleCreateTopic}
        existingCategory={editingTopic}
        members={topicMembers}
        managementActions={topicManagementActions}
      />
    </SafeAreaView>
  );
}
