import { useState, useCallback } from 'react';
import { View, Text, FlatList, RefreshControl, Pressable, Alert, ActivityIndicator, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
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

  const isAdmin = communityRole === 'admin';

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

  const handleCategorySelect = useCallback((category: BoardCategory) => {
    setSelectedCategoryId(category.id);
  }, []);

  const handleBack = useCallback(() => {
    setSelectedCategoryId(null);
  }, []);

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

  // Post detail view
  if (selectedPostId) {
    return (
      <BoardPostDetail
        postId={selectedPostId}
        onBack={() => {
          setSelectedPostId(null);
          invalidatePosts();
        }}
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
          <View className="bg-white px-4 py-3 border-b border-cream flex-row items-center justify-between">
            <Text style={{ fontFamily: 'LibreBaskerville_700Bold' }} className="text-2xl text-charcoal">
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
          onClose={() => setShowTopicComposer(false)}
          onSubmit={handleCreateTopic}
        />
      </SafeAreaView>
    );
  }

  // Posts view
  return (
    <SafeAreaView className="flex-1 bg-cream" edges={['top']}>
      {/* Posts view header with back button */}
      <View className="bg-white border-b border-cream flex-row items-center px-4 py-3">
        <Pressable onPress={handleBack} hitSlop={8} className="mr-3 active:opacity-70">
          <Text className="text-gold text-2xl leading-none">‹</Text>
        </Pressable>
        <Text
          style={{ fontFamily: 'LibreBaskerville_700Bold' }}
          className="text-xl text-charcoal flex-1"
          numberOfLines={1}
        >
          {selectedCategory.name}
        </Text>
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
            onPress={() => setSelectedPostId(item.id)}
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
          onPress={() => setShowComposer(true)}
          className="absolute bottom-6 right-6 w-14 h-14 bg-gold rounded-full items-center justify-center shadow-lg active:opacity-80"
        >
          <Text className="text-white text-3xl">+</Text>
        </Pressable>
      )}

      <BoardComposer
        visible={showComposer}
        category={selectedCategory}
        userId={profile?.id || ''}
        onClose={() => setShowComposer(false)}
        onSubmit={handleCreatePost}
      />

      <BoardTopicComposer
        visible={showTopicComposer}
        onClose={() => setShowTopicComposer(false)}
        onSubmit={handleCreateTopic}
      />
    </SafeAreaView>
  );
}
