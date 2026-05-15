import { useState, useCallback, useEffect } from 'react';
import { View, Text, FlatList, RefreshControl, Pressable, Alert, ActivityIndicator, TextInput, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/hooks/useAuth';
import { useBoardCategoriesQuery, useBoardPostsQuery, useBoardPostCountsQuery } from '../../lib/hooks/useBoardQuery';
import { BoardCategoryList } from '../../components/board/BoardCategoryList';
import { BoardPostCard } from '../../components/board/BoardPostCard';
import { BoardPostDetail } from '../../components/board/BoardPostDetail';
import { BoardComposer } from '../../components/board/BoardComposer';
import { BoardTopicComposer, type BoardTopicAudience, type BoardTopicMetadata } from '../../components/board/BoardTopicComposer';
import { BoardLinkedWishes } from '../../components/board/BoardLinkedWishes';
import { WishDetail } from '../../components/hive/WishDetail';
import { AddWishModal } from '../../components/wishes/AddWishModal';
import { AppHeader } from '../../components/navigation';
import { useBoardLinkedWishes, type LinkedWish } from '../../lib/hooks/useBoardLinkedWishes';
import { getMentionedMembers } from '../../lib/mentions';
import { fetchCommunityMentionableMembers } from '../../lib/mentionableMembers';
import { markBoardThreadGranted } from '../../lib/boardThreadCompletion';
import { BOARD_HOME_EVENT } from '../../lib/boardNavigation';
import { getStoredItem, removeStoredItem, setStoredItem } from '../../lib/webStorage';
import type { BoardCategory, BoardPost, Attachment, Profile } from '../../types';

type BoardListView = 'active' | 'archive';
type BoardThreadListView = 'active' | 'archive';
type BoardCategoryStats = { count: number; latestActivity: string | null };

function isArchivedCategory(category: BoardCategory) {
  return category.status === 'archived' || category.status === 'completed';
}

function isCompletableHdAsk(category: BoardCategory) {
  return category.topic_kind === 'hd_board' && !!category.goal_title;
}

function getCategorySortRank(category: BoardCategory) {
  if (category.topic_kind === 'hd_board') return 0;
  if (category.topic_kind === 'helper_log') return 1;
  if (category.category_type === 'announcements') return 2;
  if (category.category_type === 'general') return 3;
  if (category.category_type === 'resources' || category.name.toLowerCase() === 'hive approved') return 4;
  return 5;
}

function sortCategoriesByBoardOrder(a: BoardCategory, b: BoardCategory) {
  const rankDelta = getCategorySortRank(a) - getCategorySortRank(b);
  if (rankDelta !== 0) return rankDelta;
  return a.display_order - b.display_order || a.name.localeCompare(b.name);
}

function sortCategoriesForBoard(
  a: BoardCategory,
  b: BoardCategory,
  postCounts?: Record<string, BoardCategoryStats>
) {
  const aActivity = postCounts?.[a.id]?.latestActivity ?? null;
  const bActivity = postCounts?.[b.id]?.latestActivity ?? null;

  if (aActivity && bActivity && aActivity !== bActivity) {
    return bActivity.localeCompare(aActivity);
  }
  if (aActivity && !bActivity) return -1;
  if (!aActivity && bActivity) return 1;

  return sortCategoriesByBoardOrder(a, b);
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

export default function BoardScreen() {
  const { profile, communityId, communityRole } = useAuth();
  const { width } = useWindowDimensions();
  const useMobileLayout = width < 768;
  const [refreshing, setRefreshing] = useState(false);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
  const [showComposer, setShowComposer] = useState(false);
  const [editingPost, setEditingPost] = useState<BoardPost | null>(null);
  const [showTopicComposer, setShowTopicComposer] = useState(false);
  const [editingTopic, setEditingTopic] = useState<BoardCategory | null>(null);
  const [boardListView, setBoardListView] = useState<BoardListView>('active');
  const [threadListView, setThreadListView] = useState<BoardThreadListView>('active');
  const [boardSearch, setBoardSearch] = useState('');
  const [showAddLinkedWishModal, setShowAddLinkedWishModal] = useState(false);
  const [selectedLinkedWish, setSelectedLinkedWish] = useState<LinkedWish | null>(null);
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
  const {
    data: categories = [],
    isLoading: categoriesLoading,
    refetch: refetchCategories,
    invalidateCategories,
  } = useBoardCategoriesQuery(communityId ?? undefined);

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
  const activeCategories = categories
    .filter((category) => !isArchivedCategory(category))
    .sort((a, b) => sortCategoriesForBoard(a, b, postCounts));
  const archivedCategories = categories
    .filter(isArchivedCategory)
    .sort((a, b) => sortCategoriesForBoard(a, b, postCounts));
  const boardSearchQuery = boardSearch.trim().toLowerCase();
  const listSourceCategories = boardListView === 'archive' ? archivedCategories : activeCategories;
  const visibleCategories = boardSearchQuery
    ? listSourceCategories
        .filter((category) => getCategorySearchText(category).includes(boardSearchQuery))
        .sort((a, b) => sortCategoriesForBoard(a, b, postCounts))
    : listSourceCategories;

  const {
    posts,
    loading: postsLoading,
    refetch: refetchPosts,
    invalidatePosts,
  } = useBoardPostsQuery(communityId ?? undefined, selectedCategory?.id);
  const activePosts = posts.filter((post) => !post.archived_at);
  const archivedPosts = posts.filter((post) => !!post.archived_at);
  const visiblePosts = threadListView === 'archive' ? archivedPosts : activePosts;
  const {
    wishes: linkedWishes,
    loading: linkedWishesLoading,
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
    if (boardCategoryStorageKey) removeStoredItem(boardCategoryStorageKey);
    if (boardPostStorageKey) removeStoredItem(boardPostStorageKey);
    if (boardComposerStorageKey) removeStoredItem(boardComposerStorageKey);
    if (boardDirectOpenStorageKey) removeStoredItem(boardDirectOpenStorageKey);
  }, [boardCategoryStorageKey, boardComposerStorageKey, boardDirectOpenStorageKey, boardPostStorageKey]);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;

    const handleBoardsHome = () => {
      setBoardSearch('');
      setBoardListView('active');
      setThreadListView('active');
      resetBoardToList();
    };

    window.addEventListener(BOARD_HOME_EVENT, handleBoardsHome);
    return () => window.removeEventListener(BOARD_HOME_EVENT, handleBoardsHome);
  }, [resetBoardToList]);

  useFocusEffect(
    useCallback(() => {
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

      const isComposing = boardComposerStorageKey
        ? getStoredItem(boardComposerStorageKey) === 'true'
        : false;
      if (!isComposing) {
        resetBoardToList();
      }
    }, [boardCategoryStorageKey, boardComposerStorageKey, boardDirectOpenStorageKey, boardPostStorageKey, resetBoardToList])
  );

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
    setThreadListView('active');
    if (boardCategoryStorageKey) {
      setStoredItem(boardCategoryStorageKey, category.id);
    }
  }, [boardCategoryStorageKey]);

  const handleBack = useCallback(() => {
    resetBoardToList();
  }, [resetBoardToList]);

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
    setSelectedPostId(null);
    invalidatePosts();
    refetchPostCounts();
    if (boardPostStorageKey) {
      removeStoredItem(boardPostStorageKey);
    }
  }, [boardPostStorageKey, invalidatePosts, refetchPostCounts]);

  const handleCreatePost = async (title: string, content: string, attachments?: Attachment[]) => {
    if (!profile || !communityId || !selectedCategory) {
      Alert.alert('Not ready', 'Your profile is still loading. Please try again in a moment.');
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
        Alert.alert('Error', `Failed to create post: ${error.message}`);
        return false;
      }

      if (!data) {
        Alert.alert('Error', 'Post was not created. You may not have permission to post in this category.');
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
      const message = error instanceof Error ? error.message : 'Unknown error';
      Alert.alert('Error', `Failed to create post: ${message}`);
      return false;
    }
  };

  const handleUpdatePost = async (title: string, content: string, attachments?: Attachment[]) => {
    if (!profile || !communityId || !editingPost || !canManageThread(editingPost)) {
      Alert.alert('Not ready', 'This thread could not be edited. Please try again in a moment.');
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
        Alert.alert('Error', `Failed to edit thread: ${error.message}`);
        return false;
      }

      setEditingPost(null);
      invalidatePosts();
      await Promise.all([refetchPosts(), refetchPostCounts()]);
      return true;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      Alert.alert('Error', `Failed to edit thread: ${message}`);
      return false;
    }
  };

  const canPost = () => {
    if (!selectedCategory || !profile || !communityId) return false;
    if (selectedCategory.requires_admin && !isAdmin) return false;
    return true;
  };
  const canAddLinkedWish = !!selectedCategory && !isArchivedCategory(selectedCategory) && canPost();

  const saveTopicMemberTags = async (categoryId: string, audience: BoardTopicAudience, taggedMemberIds: string[]) => {
    if (!profile || !communityId) return true;

    const { error: deleteError } = await (supabase as any)
      .from('board_category_member_tags')
      .delete()
      .eq('category_id', categoryId)
      .eq('community_id', communityId);

    if (deleteError) {
      Alert.alert('Error', `Failed to update topic tags: ${deleteError.message}`);
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
      Alert.alert('Error', `Failed to save topic tags: ${insertError.message}`);
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
      Alert.alert('Not ready', 'Your profile is still loading. Please try again in a moment.');
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
        Alert.alert('Error', `Failed to create topic: ${error.message}`);
        return false;
      }

      if (!data) {
        Alert.alert('Error', 'Topic was not created. Please try again.');
        return false;
      }

      const tagsSaved = await saveTopicMemberTags(data.id, audience, taggedMemberIds);
      if (!tagsSaved) return false;

      invalidateCategories();
      setSelectedCategoryId(data.id);
      return true;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      Alert.alert('Error', `Failed to create topic: ${message}`);
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
      Alert.alert('Not ready', 'Your profile is still loading. Please try again in a moment.');
      return false;
    }

    if (editingTopic.is_system) {
      Alert.alert('Protected topic', 'Default board topics cannot be edited here.');
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
        Alert.alert('Error', `Failed to update topic: ${error.message}`);
        return false;
      }

      const tagsSaved = await saveTopicMemberTags(editingTopic.id, audience, taggedMemberIds);
      if (!tagsSaved) return false;

      invalidateCategories();
      setEditingTopic(null);
      return true;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      Alert.alert('Error', `Failed to update topic: ${message}`);
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
      ? `Delete "${category.name}" and its ${count} ${count === 1 ? 'post' : 'posts'}? This cannot be undone.`
      : `Delete "${category.name}"? This cannot be undone.`;

    const deleteCategory = async () => {
      try {
        const { error } = await supabase
          .from('board_categories')
          .delete()
          .eq('id', category.id)
          .eq('community_id', category.community_id)
          .eq('is_system', false);

        if (error) {
          Alert.alert('Error', `Failed to delete topic: ${error.message}`);
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
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        Alert.alert('Error', `Failed to delete topic: ${errorMessage}`);
      }
    };

    if (typeof window !== 'undefined' && window.confirm) {
      if (window.confirm(message)) {
        deleteCategory();
      }
      return;
    }

    Alert.alert('Delete Topic', message, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: deleteCategory },
    ]);
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
      ? `Restore "${category.name}" to the active board list?`
      : `Archive "${category.name}"? It will move out of the main board list, but posts will stay available in Archive.`;

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
          Alert.alert('Error', `Failed to ${restore ? 'restore' : 'archive'} topic: ${error.message}`);
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
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        Alert.alert('Error', `Failed to ${restore ? 'restore' : 'archive'} topic: ${errorMessage}`);
      }
    };

    if (typeof window !== 'undefined' && window.confirm) {
      if (window.confirm(message)) updateStatus();
      return;
    }

    Alert.alert(restore ? 'Restore Topic' : 'Archive Topic', message, [
      { text: 'Cancel', style: 'cancel' },
      { text: restore ? 'Restore' : 'Archive', onPress: updateStatus },
    ]);
  }, [boardCategoryStorageKey, canArchiveCategory, invalidateCategories]);

  const handleCompleteTopic = useCallback((category: BoardCategory, onDone?: () => void) => {
    if (!profile || !communityId || !canArchiveCategory(category) || !isCompletableHdAsk(category)) return;

    const message = category.source_wish_id
      ? `Mark "${category.name}" complete? Its source wish will move to Granted, and the board will move into Archive.`
      : `Mark "${category.name}" complete? The board will move into Archive, but linked open wishes will stay open until each one is granted.`;

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
          Alert.alert('Error', `Failed to complete board: ${error.message}`);
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
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        Alert.alert('Error', `Failed to complete board: ${errorMessage}`);
      }
    };

    if (typeof window !== 'undefined' && window.confirm) {
      if (window.confirm(message)) completeTopic();
      return;
    }

    Alert.alert('Complete HD Board', message, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Complete', onPress: completeTopic },
    ]);
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

    invalidateLinkedWishes();
    invalidateCategories();
    return { error: null };
  };

  const handleCompleteThread = useCallback((post: BoardPost, onDone?: () => void) => {
    if (!profile || !communityId || !selectedCategory || !canCompleteThread(post)) return;

    const message = `Mark "${post.title}" as granted? It will show as Granted here and be added to Completed Community Wishes.`;

    const completeThread = async () => {
      try {
        await markBoardThreadGranted({
          post,
          category: selectedCategory,
          communityId,
          completedBy: profile.id,
          completionNote: `Granted from ${selectedCategory.name}.`,
        });

        invalidatePosts();
        invalidateLinkedWishes();
        await Promise.all([refetchPosts(), refetchLinkedWishes()]);
        onDone?.();
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        Alert.alert('Error', `Failed to mark thread granted: ${errorMessage}`);
      }
    };

    if (typeof window !== 'undefined' && window.confirm) {
      if (window.confirm(message)) completeThread();
      return;
    }

    Alert.alert('Wish Granted', message, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Mark Granted', onPress: completeThread },
    ]);
  }, [
    canCompleteThread,
    communityId,
    invalidateLinkedWishes,
    invalidatePosts,
    profile,
    refetchLinkedWishes,
    refetchPosts,
    selectedCategory,
  ]);

  const handleEditThread = useCallback((post: BoardPost) => {
    if (!canManageThread(post)) return;
    setEditingPost(post);
    setShowComposer(true);
  }, [canManageThread]);

  const handleArchiveThread = useCallback((post: BoardPost, onDone?: () => void) => {
    if (!profile || !communityId || !canManageThread(post)) return;

    const restore = !!post.archived_at;
    const message = restore
      ? `Restore "${post.title}" to this board?`
      : `Archive "${post.title}"? It will move out of the active thread list, but you can restore it from Archived.`;

    const updateArchiveState = async () => {
      try {
        if (!Object.prototype.hasOwnProperty.call(post, 'archived_at')) {
          Alert.alert('Archive unavailable', 'Board thread archiving needs the latest Supabase migration before it can work here.');
          return;
        }

        const nextArchivedAt = restore ? null : new Date().toISOString();
        const archiveUpdate: Record<string, string | null> = {
          archived_at: nextArchivedAt,
        };

        if (Object.prototype.hasOwnProperty.call(post, 'archived_by')) {
          archiveUpdate.archived_by = restore ? null : profile.id;
        }

        const { data, error } = await (supabase as any)
          .from('board_posts')
          .update(archiveUpdate)
          .eq('id', post.id)
          .eq('community_id', communityId)
          .select('id, archived_at')
          .maybeSingle();

        if (error) {
          Alert.alert('Error', `Failed to ${restore ? 'restore' : 'archive'} thread: ${error.message}`);
          return;
        }

        if (!data) {
          Alert.alert('Not archived', 'This thread was not archived. You may not have permission to manage it.');
          return;
        }

        if (!restore && threadListView === 'active') {
          setThreadListView('active');
        }
        invalidatePosts();
        await refetchPosts();
        onDone?.();
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        Alert.alert('Error', `Failed to ${restore ? 'restore' : 'archive'} thread: ${errorMessage}`);
      }
    };

    if (typeof window !== 'undefined' && window.confirm) {
      if (window.confirm(message)) updateArchiveState();
      return;
    }

    Alert.alert(restore ? 'Restore Thread' : 'Archive Thread', message, [
      { text: 'Cancel', style: 'cancel' },
      { text: restore ? 'Restore' : 'Archive', onPress: updateArchiveState },
    ]);
  }, [canManageThread, communityId, invalidatePosts, profile, refetchPosts, threadListView]);

  const handleDeleteThread = useCallback((post: BoardPost, onDone?: () => void) => {
    if (!communityId || !canManageThread(post)) return;

    const message = `Delete "${post.title}"? This will also delete all replies.`;

    const deleteThread = async () => {
      try {
        const { data, error } = await (supabase as any)
          .from('board_posts')
          .delete()
          .eq('id', post.id)
          .eq('community_id', communityId)
          .select('id');

        if (error) {
          Alert.alert('Error', `Failed to delete thread: ${error.message}`);
          return;
        }

        if (!data || data.length === 0) {
          Alert.alert('Not deleted', 'This thread was not deleted. You may not have permission to delete it.');
          return;
        }

        invalidatePosts();
        await refetchPosts();
        onDone?.();
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        Alert.alert('Error', `Failed to delete thread: ${errorMessage}`);
      }
    };

    if (typeof window !== 'undefined' && window.confirm) {
      if (window.confirm(message)) deleteThread();
      return;
    }

    Alert.alert('Delete Thread', message, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: deleteThread },
    ]);
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

  // Post detail view
  if (selectedLinkedWish) {
    return (
      <WishDetail
        wish={selectedLinkedWish}
        onClose={() => {
          setSelectedLinkedWish(null);
          invalidateLinkedWishes();
        }}
        onGrant={handleGrantLinkedWish}
      />
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
        <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-white text-sm">+ Topic</Text>
      </Pressable>
    ) : undefined;
    const boardListToolbar = (
      <View className="bg-white border-b border-cream">
        <View className="flex-row items-center px-4 py-3">
          <View className="flex-1 flex-row items-center bg-cream rounded-full px-3 py-2 border border-gold/20">
            <Ionicons name="search" size={17} color="rgba(49,49,48,0.38)" />
            <TextInput
              value={boardSearch}
              onChangeText={setBoardSearch}
              placeholder="Search boards"
              placeholderTextColor="rgba(49,49,48,0.38)"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
              className="flex-1 ml-2 text-charcoal"
              style={{ fontFamily: 'Lato_400Regular', fontSize: 14, outlineStyle: 'none' } as any}
            />
            {boardSearch.length > 0 && (
              <Pressable onPress={() => setBoardSearch('')} hitSlop={8}>
                <Ionicons name="close-circle" size={17} color="rgba(49,49,48,0.34)" />
              </Pressable>
            )}
          </View>
        </View>
        <View className="flex-row items-center justify-between px-4 pb-2">
          <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-charcoal/50 text-xs uppercase tracking-wide">
            {boardSearchQuery
              ? `${boardListView === 'archive' ? 'Archived' : 'Active'} Results (${visibleCategories.length})`
              : boardListView === 'archive' ? 'Archived Boards' : 'Boards'}
          </Text>
          {archivedCategories.length > 0 && (
            <Pressable
              onPress={() => setBoardListView(boardListView === 'archive' ? 'active' : 'archive')}
              className="flex-row items-center rounded-full px-3 py-1.5 active:opacity-70"
              hitSlop={8}
            >
              <Ionicons
                name={boardListView === 'archive' ? 'arrow-back-outline' : 'archive-outline'}
                size={15}
                color="rgba(49,49,48,0.48)"
                style={{ marginRight: 4 }}
              />
              <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-charcoal/50 text-xs">
                {boardListView === 'archive' ? 'Active' : `Archive (${archivedCategories.length})`}
              </Text>
            </Pressable>
          )}
        </View>
      </View>
    );

    return (
      <SafeAreaView className="flex-1 bg-cream" edges={['top']}>
        {useMobileLayout ? (
          <AppHeader
            title="Boards"
            rightElement={addTopicButton}
          />
        ) : (
          <View className="bg-gold px-4 py-3 flex-row items-center justify-between">
            <View className="w-10 h-10" />
            <Text style={{ fontFamily: 'LibreBaskerville_700Bold' }} className="text-base text-white">
              Boards
            </Text>
            {canCreateCategories ? (
              <Pressable onPress={() => setShowTopicComposer(true)} className="w-10 h-10 items-center justify-center active:opacity-70">
                <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-white text-sm">+ Topic</Text>
              </Pressable>
            ) : (
              <View className="w-10 h-10" />
            )}
          </View>
        )}

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
              postCounts={postCounts}
              emptyLabel={boardSearchQuery
                ? `No ${boardListView === 'archive' ? 'archived' : 'active'} boards found for "${boardSearch.trim()}".`
                : boardListView === 'archive'
                  ? 'No archived boards yet.'
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
    <SafeAreaView className="flex-1 bg-cream" edges={['top']}>
      {/* Posts view header with back button */}
      <View className="bg-gold flex-row items-center px-4 py-3">
        <Pressable onPress={handleBack} hitSlop={8} className="mr-3 active:opacity-70">
          <Ionicons name="arrow-back" size={24} color="white" />
        </Pressable>
        <Text
          style={{ fontFamily: 'LibreBaskerville_700Bold' }}
          className="text-base text-white flex-1"
          numberOfLines={1}
        >
          {selectedCategory.name}
        </Text>
        {(canManageCategory(selectedCategory) || canArchiveCategory(selectedCategory)) && (
          <Pressable
            onPress={() => openEditTopic(selectedCategory)}
            className="w-9 h-9 items-center justify-center rounded-full active:opacity-70 ml-2"
            accessibilityRole="button"
            accessibilityLabel="Edit board"
            hitSlop={8}
          >
            <Ionicons name="pencil-outline" size={20} color="rgba(255,255,255,0.86)" />
          </Pressable>
        )}
      </View>

      <FlatList
        data={visiblePosts}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <BoardPostCard
            post={item}
            onPress={() => handlePostSelect(item.id)}
            canEdit={canManageThread(item)}
            onEdit={handleEditThread}
            compactImages={!useMobileLayout}
          />
        )}
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
                <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-charcoal/60 text-sm">
                  {selectedCategory.description}
                </Text>
              </View>
            ) : null}
            {linkedWishes.length > 0 && (
              <BoardLinkedWishes
                wishes={linkedWishes}
                loading={linkedWishesLoading}
                canAdd={canAddLinkedWish}
                onAddWish={() => setShowAddLinkedWishModal(true)}
                onSelectWish={setSelectedLinkedWish}
              />
            )}
            <View className="flex-row items-center justify-between mb-3">
              <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-charcoal/50 text-xs uppercase tracking-wide">
                {threadListView === 'archive'
                  ? `Archived Threads (${archivedPosts.length})`
                  : `Threads (${activePosts.length})`}
              </Text>
              <View className="flex-row items-center" style={{ gap: 8 }}>
                {linkedWishes.length === 0 && canAddLinkedWish && (
                  <Pressable
                    onPress={() => setShowAddLinkedWishModal(true)}
                    className="flex-row items-center rounded-full px-3 py-1.5 bg-white/70 border border-gold/15 active:opacity-70"
                    hitSlop={8}
                  >
                    <Ionicons
                      name="sparkles-outline"
                      size={14}
                      color="#bd9348"
                      style={{ marginRight: 4 }}
                    />
                    <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-gold text-xs">
                      Wish
                    </Text>
                  </Pressable>
                )}
                {archivedPosts.length > 0 && (
                  <Pressable
                    onPress={() => setThreadListView(threadListView === 'archive' ? 'active' : 'archive')}
                    className="flex-row items-center rounded-full px-3 py-1.5 active:opacity-70"
                    hitSlop={8}
                  >
                    <Ionicons
                      name={threadListView === 'archive' ? 'arrow-back-outline' : 'archive-outline'}
                      size={15}
                      color="rgba(49,49,48,0.48)"
                      style={{ marginRight: 4 }}
                    />
                    <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-charcoal/50 text-xs">
                      {threadListView === 'archive' ? 'Active' : `Archive (${archivedPosts.length})`}
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
              <ActivityIndicator size="large" color="#bd9348" />
            </View>
          ) : (
            <View className="bg-white rounded-xl p-8 shadow-sm items-center">
              <Text className="text-4xl mb-4">📝</Text>
              <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-charcoal/50 text-center">
                No threads in this board yet.
                {threadListView === 'archive'
                  ? '\nArchived threads will appear here.'
                  : canPost() && '\nStart the first one!'}
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
            {canCompleteThread(editingPost) && (
              <Pressable
                onPress={() => handleCompleteThread(editingPost, handleCloseComposer)}
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
