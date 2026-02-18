import { useState, useCallback } from 'react';
import { View, Text, FlatList, RefreshControl, Pressable, Alert, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/hooks/useAuth';
import { useBoardCategoriesQuery, useBoardPostsQuery, type PostWithAuthor } from '../../lib/hooks/useBoardQuery';
import { BoardCategoryList } from '../../components/board/BoardCategoryList';
import { BoardPostCard } from '../../components/board/BoardPostCard';
import { BoardPostDetail } from '../../components/board/BoardPostDetail';
import { BoardComposer } from '../../components/board/BoardComposer';
import { BoardTopicComposer } from '../../components/board/BoardTopicComposer';
import { NavigationDrawer, AppHeader } from '../../components/navigation';
import type { BoardCategory, Attachment } from '../../types';

export default function BoardScreen() {
  const { profile, communityId, communityRole } = useAuth();
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
    refetch: refetchCategories,
    invalidateCategories,
  } = useBoardCategoriesQuery(communityId);

  const selectedCategory = selectedCategoryId
    ? categories.find((c) => c.id === selectedCategoryId) || null
    : null;

  const {
    posts,
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
            onClose={() => setDrawerOpen(false)}
            mode="navigation"
          />
        )}

        <BoardCategoryList
          categories={categories}
          onSelect={handleCategorySelect}
        />

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
          onClose={() => setDrawerOpen(false)}
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
          <View className="bg-white rounded-xl p-8 shadow-sm items-center">
            <Text className="text-4xl mb-4">📝</Text>
            <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-charcoal/50 text-center">
              No posts in this category yet.
              {canPost() && '\nBe the first to start a discussion!'}
            </Text>
          </View>
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
