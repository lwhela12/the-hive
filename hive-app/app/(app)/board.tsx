import { useState, useCallback, useEffect } from 'react';
import { View, Text, FlatList, RefreshControl, Pressable, Alert, ActivityIndicator, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/hooks/useAuth';
import { useBoardCategoriesQuery, useBoardPostsQuery, useBoardPostCountsQuery } from '../../lib/hooks/useBoardQuery';
import { BoardCategoryList } from '../../components/board/BoardCategoryList';
import { BoardPostCard } from '../../components/board/BoardPostCard';
import { BoardPostDetail } from '../../components/board/BoardPostDetail';
import { BoardComposer } from '../../components/board/BoardComposer';
import { BoardTopicComposer } from '../../components/board/BoardTopicComposer';
import { NavigationDrawer, AppHeader } from '../../components/navigation';
import { useTotalUnreadDMs } from '../../lib/hooks/useTotalUnreadDMs';
import type { BoardCategory, Attachment } from '../../types';

export default function BoardScreen() {
  const { profile, communityId, communityRole } = useAuth();
  const { totalUnread: unreadDMCount } = useTotalUnreadDMs(communityId ?? undefined, profile?.id);
  const { width } = useWindowDimensions();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const useMobileLayout = width < 768;
  const [refreshing, setRefreshing] = useState(false);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
  const [showComposer, setShowComposer] = useState(false);
  const [showTopicComposer, setShowTopicComposer] = useState(false);
  const [editingTopic, setEditingTopic] = useState<BoardCategory | null>(null);
  const boardCategoryStorageKey = communityId ? `the-hive:last-board-category:${communityId}` : null;
  const boardComposerStorageKey = communityId ? `the-hive:board-composer-open:${communityId}` : null;
  const boardPostStorageKey = communityId ? `the-hive:last-board-post:${communityId}` : null;
  const boardDraftStorageKey = selectedCategoryId ? `the-hive:board-draft:${selectedCategoryId}` : null;

  const isAdmin = communityRole === 'admin';
  const canManageCategories = isAdmin;

  const {
    data: categories = [],
    isLoading: categoriesLoading,
    refetch: refetchCategories,
    invalidateCategories,
  } = useBoardCategoriesQuery(communityId);

  const selectedCategory = selectedCategoryId
    ? categories.find((c) => c.id === selectedCategoryId) || null
    : null;

  const { data: postCounts } = useBoardPostCountsQuery(communityId);

  const {
    posts,
    loading: postsLoading,
    refetch: refetchPosts,
    invalidatePosts,
  } = useBoardPostsQuery(communityId, selectedCategory?.id);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([
      refetchCategories(),
      ...(selectedCategory ? [refetchPosts()] : []),
    ]);
    setRefreshing(false);
  };

  useEffect(() => {
    if (!boardCategoryStorageKey || selectedCategoryId || categories.length === 0) return;
    if (typeof window === 'undefined') return;

    const savedCategoryId = window.localStorage.getItem(boardCategoryStorageKey);
    if (savedCategoryId && categories.some((category) => category.id === savedCategoryId)) {
      setSelectedCategoryId(savedCategoryId);
    }
  }, [boardCategoryStorageKey, categories, selectedCategoryId]);

  useEffect(() => {
    if (!boardComposerStorageKey || !selectedCategoryId) return;
    if (typeof window === 'undefined') return;

    setShowComposer(window.localStorage.getItem(boardComposerStorageKey) === 'true');
  }, [boardComposerStorageKey, selectedCategoryId]);

  useEffect(() => {
    if (!boardPostStorageKey || selectedPostId) return;
    if (typeof window === 'undefined') return;

    const savedPostId = window.localStorage.getItem(boardPostStorageKey);
    if (savedPostId) {
      setSelectedPostId(savedPostId);
    }
  }, [boardPostStorageKey, selectedPostId]);

  const handleCategorySelect = useCallback((category: BoardCategory) => {
    setSelectedCategoryId(category.id);
    if (boardCategoryStorageKey && typeof window !== 'undefined') {
      window.localStorage.setItem(boardCategoryStorageKey, category.id);
    }
  }, [boardCategoryStorageKey]);

  const handleBack = useCallback(() => {
    setSelectedCategoryId(null);
    if (boardCategoryStorageKey && typeof window !== 'undefined') {
      window.localStorage.removeItem(boardCategoryStorageKey);
    }
    if (boardComposerStorageKey && typeof window !== 'undefined') {
      window.localStorage.removeItem(boardComposerStorageKey);
    }
    if (boardPostStorageKey && typeof window !== 'undefined') {
      window.localStorage.removeItem(boardPostStorageKey);
    }
    setShowComposer(false);
    setSelectedPostId(null);
  }, [boardCategoryStorageKey, boardComposerStorageKey, boardPostStorageKey]);

  const handleOpenComposer = useCallback(() => {
    setShowComposer(true);
    if (boardComposerStorageKey && typeof window !== 'undefined') {
      window.localStorage.setItem(boardComposerStorageKey, 'true');
    }
  }, [boardComposerStorageKey]);

  const handleCloseComposer = useCallback(() => {
    setShowComposer(false);
    if (boardComposerStorageKey && typeof window !== 'undefined') {
      window.localStorage.removeItem(boardComposerStorageKey);
    }
  }, [boardComposerStorageKey]);

  const handlePostSelect = useCallback((postId: string) => {
    setSelectedPostId(postId);
    if (boardPostStorageKey && typeof window !== 'undefined') {
      window.localStorage.setItem(boardPostStorageKey, postId);
    }
  }, [boardPostStorageKey]);

  const handlePostBack = useCallback(() => {
    setSelectedPostId(null);
    invalidatePosts();
    if (boardPostStorageKey && typeof window !== 'undefined') {
      window.localStorage.removeItem(boardPostStorageKey);
    }
  }, [boardPostStorageKey, invalidatePosts]);

  const handleDrawerClose = useCallback(() => setDrawerOpen(false), []);

  const handleCreatePost = async (title: string, content: string, attachments?: Attachment[]) => {
    if (!profile || !communityId || !selectedCategory) {
      Alert.alert('Not ready', 'Your profile is still loading. Please try again in a moment.');
      return false;
    }

    try {
      const { data, error } = await supabase.from('board_posts').insert({
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
      return true;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      Alert.alert('Error', `Failed to create post: ${message}`);
      return false;
    }
  };

  const canPost = () => {
    if (!selectedCategory || !profile || !communityId) return false;
    if (selectedCategory.requires_admin && !isAdmin) return false;
    return true;
  };

  const handleCreateTopic = async (name: string, description: string, icon: string) => {
    if (!profile || !communityId) {
      Alert.alert('Not ready', 'Your profile is still loading. Please try again in a moment.');
      return false;
    }

    try {
      const maxOrder = categories.length > 0
        ? Math.max(...categories.map(c => c.display_order))
        : 0;

      const { data, error } = await supabase.from('board_categories').insert({
        community_id: communityId,
        name,
        description: description || null,
        category_type: 'custom',
        icon,
        display_order: maxOrder + 1,
        is_system: false,
        requires_admin: false,
        requires_approval: false,
        created_by: profile.id,
      }).select().single();

      if (error) {
        Alert.alert('Error', `Failed to create topic: ${error.message}`);
        return false;
      }

      if (!data) {
        Alert.alert('Error', 'Topic was not created. Please try again.');
        return false;
      }

      invalidateCategories();
      setSelectedCategoryId(data.id);
      return true;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      Alert.alert('Error', `Failed to create topic: ${message}`);
      return false;
    }
  };

  const handleUpdateTopic = async (name: string, description: string, icon: string) => {
    if (!editingTopic || !profile || !communityId || !canManageCategories) {
      Alert.alert('Not ready', 'Your profile is still loading. Please try again in a moment.');
      return false;
    }

    if (editingTopic.is_system) {
      Alert.alert('Protected topic', 'Default board topics cannot be edited here.');
      return false;
    }

    try {
      const { error } = await supabase
        .from('board_categories')
        .update({
          name,
          description: description || null,
          icon,
        })
        .eq('id', editingTopic.id)
        .eq('community_id', communityId);

      if (error) {
        Alert.alert('Error', `Failed to update topic: ${error.message}`);
        return false;
      }

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
    if (!canManageCategories || category.is_system) return;
    setEditingTopic(category);
    setShowTopicComposer(true);
  }, [canManageCategories]);

  const closeTopicComposer = useCallback(() => {
    setShowTopicComposer(false);
    setEditingTopic(null);
  }, []);

  const handleDeleteTopic = useCallback((category: BoardCategory) => {
    if (!canManageCategories || category.is_system) return;

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
        if (boardCategoryStorageKey && typeof window !== 'undefined') {
          window.localStorage.removeItem(boardCategoryStorageKey);
        }
        if (boardComposerStorageKey && typeof window !== 'undefined') {
          window.localStorage.removeItem(boardComposerStorageKey);
        }
        if (boardPostStorageKey && typeof window !== 'undefined') {
          window.localStorage.removeItem(boardPostStorageKey);
        }
        invalidateCategories();
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
    canManageCategories,
    invalidateCategories,
    postCounts,
    selectedCategoryId,
  ]);

  // Post detail view
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
    const addTopicButton = isAdmin ? (
      <Pressable onPress={() => setShowTopicComposer(true)} className="px-1 active:opacity-70">
        <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-gold text-sm">+ Topic</Text>
      </Pressable>
    ) : undefined;

    return (
      <SafeAreaView className="flex-1 bg-cream" edges={['top']}>
        {useMobileLayout ? (
          <AppHeader
            title="Message Board"
            onMenuPress={() => setDrawerOpen(true)}
            rightElement={addTopicButton}
          />
        ) : (
          <View className="bg-gold px-4 py-3 flex-row items-center justify-between">
            <Text style={{ fontFamily: 'LibreBaskerville_700Bold' }} className="text-xl text-white">
              Message Board
            </Text>
            {isAdmin && (
              <Pressable onPress={() => setShowTopicComposer(true)} className="active:opacity-70">
                <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-gold text-sm">+ Topic</Text>
              </Pressable>
            )}
          </View>
        )}

        {useMobileLayout && (
          <NavigationDrawer
            isOpen={drawerOpen}
            onClose={handleDrawerClose}
            mode="navigation"
            unreadDMCount={unreadDMCount}
          />
        )}

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
          <BoardCategoryList
            categories={postCounts
              ? [...categories].sort((a, b) => {
                  const aActivity = postCounts[a.id]?.latestActivity || '';
                  const bActivity = postCounts[b.id]?.latestActivity || '';
                  if (bActivity !== aActivity) return bActivity.localeCompare(aActivity);
                  return a.display_order - b.display_order;
                })
              : categories
            }
            onSelect={handleCategorySelect}
            postCounts={postCounts}
          />
        )}

        <BoardTopicComposer
          visible={showTopicComposer}
          onClose={closeTopicComposer}
          onSubmit={editingTopic ? handleUpdateTopic : handleCreateTopic}
          existingCategory={editingTopic}
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
          <Text className="text-gold text-2xl leading-none">‹</Text>
        </Pressable>
        <Text
          style={{ fontFamily: 'LibreBaskerville_700Bold' }}
          className="text-base text-white flex-1"
          numberOfLines={1}
        >
          {selectedCategory.name}
        </Text>
        {canManageCategories && !selectedCategory.is_system && (
          <View className="flex-row items-center ml-2">
            <Pressable
              onPress={() => openEditTopic(selectedCategory)}
              className="w-9 h-9 items-center justify-center rounded-full active:opacity-70"
              hitSlop={8}
            >
              <Ionicons name="pencil-outline" size={20} color="rgba(255,255,255,0.8)" />
            </Pressable>
            <Pressable
              onPress={() => handleDeleteTopic(selectedCategory)}
              className="w-9 h-9 items-center justify-center rounded-full active:opacity-70"
              hitSlop={8}
            >
              <Ionicons name="trash-outline" size={20} color="#f87171" />
            </Pressable>
          </View>
        )}
      </View>

      {useMobileLayout && (
        <NavigationDrawer
          isOpen={drawerOpen}
          onClose={handleDrawerClose}
          mode="navigation"
        />
      )}

      <FlatList
        data={posts}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <BoardPostCard
            post={item}
            onPress={() => handlePostSelect(item.id)}
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
          selectedCategory.description ? (
            <View className="mb-4">
              <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-charcoal/60 text-sm">
                {selectedCategory.description}
              </Text>
            </View>
          ) : null
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
                No posts in this category yet.
                {canPost() && '\nBe the first to start a discussion!'}
              </Text>
            </View>
          )
        }
        removeClippedSubviews
      />

      {canPost() && (
        <Pressable
          onPress={handleOpenComposer}
          className="absolute bottom-6 right-6 w-14 h-14 bg-gold rounded-full items-center justify-center shadow-lg active:opacity-80"
        >
          <Text className="text-white text-3xl">+</Text>
        </Pressable>
      )}

      <BoardComposer
        visible={showComposer}
        category={selectedCategory}
        userId={profile?.id || ''}
        onClose={handleCloseComposer}
        onSubmit={handleCreatePost}
        draftStorageKey={boardDraftStorageKey}
      />

      <BoardTopicComposer
        visible={showTopicComposer}
        onClose={closeTopicComposer}
        onSubmit={editingTopic ? handleUpdateTopic : handleCreateTopic}
        existingCategory={editingTopic}
      />
    </SafeAreaView>
  );
}
