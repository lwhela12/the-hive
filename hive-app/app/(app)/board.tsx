import { useState, useCallback, useEffect, useMemo } from 'react';
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
import { Breadcrumbs, type Crumb } from '../../components/ui/Breadcrumbs';
import { HiveMark } from '../../components/ui/HiveMark';
import { WorldMark } from '../../components/ui/WorldMark';
import { hiveAccent, hiveDisplayName } from '../../lib/hiveBrand';
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
import { markBoardThreadGranted } from '../../lib/boardThreadCompletion';
import { setBoardThreadArchiveState } from '../../lib/boardThreadArchive';
import { BOARD_HOME_EVENT } from '../../lib/boardNavigation';
import { getStoredItem, removeStoredItem, setStoredItem } from '../../lib/webStorage';
import { linkThreadToCommunityWish, unlinkWishFromBoard } from '../../lib/wishBoardLinking';
import { deleteWishById } from '../../lib/wishMutations';
import { matchesMemberSearchText } from '../../lib/memberAliases';
import { confirmAction, showAlert } from '../../lib/showAlert';
import type { BoardCategory, BoardPost, Attachment, Profile } from '../../types';

import { ThinkingBee } from '../../components/ui/ThinkingBee';
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
  const { profile, communityId: myCommunityId, communityRole, community } = useAuth();
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

  /**
   * Where you are, from the top.
   *
   * Nat, 2026-08-05: "I understand how the boards work, but not every one does
   * ... some sort of: OG HIVE > Boards > HIVE approved > Favo healthcare".
   *
   * The boards are four levels deep and the deepest screen's header said the
   * word "Thread", which names the KIND of thing you are looking at and not
   * where it sits. The first step carries its HIVE's own mark — the hexagon in
   * its colour, or the Earth at HIVE-Wide — so the trail and the badges are
   * telling you the same thing in the same language.
   */
  const boardTrail = (deeper: Crumb[] = []): Crumb[] => [
    isWide
      ? { label: 'HIVE-Wide', mark: <WorldMark size={12} /> }
      : {
          label: hiveDisplayName(community?.name),
          mark: <HiveMark size={11} colour={hiveAccent(community)} />,
        },
    { label: 'Boards', onPress: () => { setSelectedPostId(null); setSelectedCategoryId(null); } },
    ...deeper,
  ];
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
  const boardCategoryStorageKey = communityId ? `the-hive:last-board-category:${communityId}` : null;
  const boardComposerStorageKey = communityId ? `the-hive:board-composer-open:${communityId}` : null;
  const boardPostStorageKey = communityId ? `the-hive:last-board-post:${communityId}` : null;
  const boardDirectOpenStorageKey = communityId ? `the-hive:board-direct-open:${communityId}` : null;
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
  const listSourceCategories = activeCategories;
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
    } else if (!shouldPersistRouteTarget) {
      setSelectedCategoryId(null);
    }

    if (routePostId) {
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
    routeCategoryId,
    routeOpenKey,
    routeOrigin,
    routePostId,
  ]);

  useEffect(() => {
    if (!boardCategoryStorageKey || selectedCategoryId || categories.length === 0) return;

    const savedCategoryId = getStoredItem(boardCategoryStorageKey);
    if (savedCategoryId && categories.some((category) => category.id === savedCategoryId)) {
      setSelectedCategoryId(savedCategoryId);
    }
  }, [boardCategoryStorageKey, categories, selectedCategoryId]);

  useEffect(() => {
    if (!boardComposerStorageKey || !selectedCategoryId) return;

    setShowComposer(getStoredItem(boardComposerStorageKey) === 'true');
  }, [boardComposerStorageKey, selectedCategoryId]);

  useEffect(() => {
    if (!boardPostStorageKey || selectedPostId) return;

    const savedPostId = getStoredItem(boardPostStorageKey);
    if (savedPostId) {
      setSelectedPostId(savedPostId);
    }
  }, [boardPostStorageKey, selectedPostId]);

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
      const mentionedMembers = getMentionedMembers(`${title} ${content}`, mentionableMembers, profile.id);
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
      .select('*, user:profiles!user_id(*), granters:wish_granters(*, granter:profiles!granter_id(*))')
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
          className="flex-row items-center bg-gold/10 border border-gold/20 rounded-full px-3 py-2 active:opacity-75"
        >
          <Ionicons name="checkmark-circle-outline" size={16} color="#bd9348" />
          <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-gold text-xs ml-1">
            Granted
          </Text>
        </Pressable>
      )}
      {canArchiveCategory(editingTopic) && (
        <Pressable
          onPress={() => handleArchiveTopic(editingTopic, closeTopicComposer)}
          className="flex-row items-center bg-charcoal/5 border border-charcoal/10 rounded-full px-3 py-2 active:opacity-75"
        >
          <Ionicons
            name={isArchivedCategory(editingTopic) ? 'arrow-undo-outline' : 'archive-outline'}
            size={16}
            color="rgba(49,49,48,0.62)"
          />
          <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-charcoal/60 text-xs ml-1">
            {isArchivedCategory(editingTopic) ? 'Restore' : 'Archive'}
          </Text>
        </Pressable>
      )}
      {canManageCategory(editingTopic) && (
        <Pressable
          onPress={() => handleDeleteTopic(editingTopic, closeTopicComposer)}
          className="flex-row items-center bg-red-50 border border-red-100 rounded-full px-3 py-2 active:opacity-75"
        >
          <Ionicons name="trash-outline" size={16} color="#ef4444" />
          <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-red-500 text-xs ml-1">
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
            padding: 22,
            paddingBottom: 34,
            borderTopWidth: 1,
            borderColor: 'rgba(222,193,129,0.5)',
          }}
        >
          <View style={{ width: 36, height: 4, backgroundColor: 'rgba(189,147,72,0.28)', borderRadius: 2, alignSelf: 'center', marginBottom: 18 }} />
          <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 18, color: '#2d2d2d' }}>
            Manage Wish
          </Text>
          {managingLinkedWish ? (
            <Text
              numberOfLines={2}
              style={{ fontFamily: 'Lato_400Regular', fontSize: 13, lineHeight: 18, color: '#8a7760', marginTop: 4, marginBottom: 10 }}
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
              className="flex-row items-center justify-between rounded-xl px-4 py-3 mt-2 border border-gold/25 bg-gold/10 active:opacity-75"
            >
              <View className="flex-row items-center">
                <Ionicons name="checkmark-circle-outline" size={18} color="#bd9348" />
                <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-gold text-sm ml-2">
                  Granted
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color="rgba(189,147,72,0.55)" />
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
              className="flex-row items-center justify-between rounded-xl px-4 py-3 mt-2 border border-charcoal/10 bg-white active:opacity-75"
            >
              <View className="flex-row items-center">
                <Ionicons name="pencil-outline" size={18} color="rgba(49,49,48,0.66)" />
                <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-charcoal/70 text-sm ml-2">
                  Edit
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color="rgba(49,49,48,0.32)" />
            </Pressable>
          ) : null}

          {managingLinkedWish && canManageLinkedWish(managingLinkedWish) ? (
            <Pressable
              onPress={() => {
                const wish = managingLinkedWish;
                setManagingLinkedWish(null);
                handleUnlinkLinkedWish(wish);
              }}
              className="flex-row items-center justify-between rounded-xl px-4 py-3 mt-2 border border-charcoal/10 bg-white active:opacity-75"
            >
              <View className="flex-row items-center">
                <Ionicons name="unlink-outline" size={18} color="rgba(49,49,48,0.66)" />
                <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-charcoal/70 text-sm ml-2">
                  Unlink from board
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color="rgba(49,49,48,0.32)" />
            </Pressable>
          ) : null}

          {managingLinkedWish && canModerateLinkedWish(managingLinkedWish) && managingLinkedWish.status === 'public' ? (
            <Pressable
              onPress={() => {
                const wish = managingLinkedWish;
                setManagingLinkedWish(null);
                handleArchiveLinkedWish(wish);
              }}
              className="flex-row items-center justify-between rounded-xl px-4 py-3 mt-2 border border-charcoal/10 bg-white active:opacity-75"
            >
              <View className="flex-row items-center">
                <Ionicons name="archive-outline" size={18} color="rgba(49,49,48,0.66)" />
                <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-charcoal/70 text-sm ml-2">
                  Archive
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color="rgba(49,49,48,0.32)" />
            </Pressable>
          ) : null}

          {managingLinkedWish && canModerateLinkedWish(managingLinkedWish) ? (
            <Pressable
              onPress={() => {
                const wish = managingLinkedWish;
                setManagingLinkedWish(null);
                handleDeleteLinkedWish(wish);
              }}
              className="flex-row items-center justify-between rounded-xl px-4 py-3 mt-2 border border-red-100 bg-red-50 active:opacity-75"
            >
              <View className="flex-row items-center">
                <Ionicons name="trash-outline" size={18} color="#ef4444" />
                <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-red-500 text-sm ml-2">
                  Delete
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color="rgba(239,68,68,0.45)" />
            </Pressable>
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  );

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
        // Everything above the thread. The detail screen appends the thread's
        // own title once it has loaded it, so the trail is right even when this
        // screen's post list has not caught up.
        trail={
          selectedCategory
            ? boardTrail([{ label: selectedCategory.name, onPress: handlePostBack }])
            : boardTrail()
        }
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
      <SpaceBackdrop />
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

        <Breadcrumbs items={boardTrail()} tone={skin.dark ? 'dark' : 'light'} />

        {boardListToolbar}

        {categoriesLoading && categories.length === 0 ? (
          <View className="mt-2">
            {[...Array(5)].map((_, i) => (
              <View key={i} className="flex-row items-center px-4 py-4 bg-white border-b border-cream">
                <View className="w-10 h-10 rounded-lg bg-gray-200 mr-4" />
                <View className="flex-1">
                  <View className="h-4 bg-gray-200 rounded w-2/5 mb-2" />
                  <View className="h-3 bg-gray-100 rounded w-3/5" />
                </View>
                <View className="w-4 h-4 bg-gray-100 rounded ml-2" />
              </View>
            ))}
          </View>
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

      <Breadcrumbs
        items={boardTrail([{ label: selectedCategory.name }])}
        tone={skin.dark ? 'dark' : 'light'}
      />

      <FlatList
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
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#bd9348" />
        }
        initialNumToRender={5}
        maxToRenderPerBatch={5}
        windowSize={5}
        ListHeaderComponent={
          <View>
            {selectedCategory.description ? (
              <View className="mb-4">
                <Text style={{ fontFamily: 'Lato_400Regular', fontStyle: 'italic' }} className="text-charcoal/60 text-sm">
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
                      color="rgba(49,49,48,0.48)"
                      style={{ marginRight: 4 }}
                    />
                    <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-charcoal/50 text-xs">
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
            <View className="bg-white rounded-xl p-8 shadow-sm items-center">
              <Text className="text-4xl mb-4">📝</Text>
              <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-charcoal/50 text-center">
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
                className={`flex-row items-center rounded-full px-3 py-2 border active:opacity-75 ${
                  editingPost.visibility === 'public'
                    ? 'bg-green-50 border-green-200'
                    : 'bg-charcoal/5 border-charcoal/10'
                }`}
              >
                <Ionicons
                  name={editingPost.visibility === 'public' ? 'megaphone-outline' : 'lock-closed-outline'}
                  size={16}
                  color={editingPost.visibility === 'public' ? '#16a34a' : 'rgba(49,49,48,0.62)'}
                />
                <Text
                  style={{ fontFamily: 'Lato_700Bold' }}
                  className={`text-xs ml-1 ${editingPost.visibility === 'public' ? 'text-green-700' : 'text-charcoal/60'}`}
                >
                  {editingPost.visibility === 'public' ? 'On the public site' : 'HIVErs only'}
                </Text>
              </Pressable>
            )}
            {canCompleteThread(editingPost) && (
              <Pressable
                onPress={() => handlePrepareGrantThread(editingPost, handleCloseComposer)}
                className="flex-row items-center bg-gold/10 border border-gold/20 rounded-full px-3 py-2 active:opacity-75"
              >
                <Ionicons name="checkmark-circle-outline" size={16} color="#bd9348" />
                <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-gold text-xs ml-1">
                  Granted
                </Text>
              </Pressable>
            )}
            {canManageThread(editingPost) && (
              <Pressable
                onPress={() => handleArchiveThread(editingPost, handleCloseComposer)}
                className="flex-row items-center bg-charcoal/5 border border-charcoal/10 rounded-full px-3 py-2 active:opacity-75"
              >
                <Ionicons
                  name={editingPost.archived_at ? 'arrow-undo-outline' : 'archive-outline'}
                  size={16}
                  color="rgba(49,49,48,0.62)"
                />
                <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-charcoal/60 text-xs ml-1">
                  {editingPost.archived_at ? 'Restore' : 'Archive'}
                </Text>
              </Pressable>
            )}
            {canManageThread(editingPost) && (
              <Pressable
                onPress={() => handleDeleteThread(editingPost, handleCloseComposer)}
                className="flex-row items-center bg-red-50 border border-red-100 rounded-full px-3 py-2 active:opacity-75"
              >
                <Ionicons name="trash-outline" size={16} color="#ef4444" />
                <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-red-500 text-xs ml-1">
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
