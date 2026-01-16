import { useState } from 'react';
import { View, Text, ScrollView, RefreshControl, Pressable, Alert, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/hooks/useAuth';
import { useBoardCategoriesQuery, useBoardPostsQuery, type PostWithAuthor } from '../../lib/hooks/useBoardQuery';
import { BoardCategoryTabs } from '../../components/board/BoardCategoryTabs';
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

  // Fetch categories with React Query (cached)
  const {
    data: categories = [],
    refetch: refetchCategories,
    invalidateCategories,
  } = useBoardCategoriesQuery(communityId);

  // Auto-select first category when categories load
  const selectedCategory = selectedCategoryId
    ? categories.find((c) => c.id === selectedCategoryId) || null
    : categories[0] || null;

  // Fetch posts for selected category with React Query (cached per category)
  const {
    posts,
    refetch: refetchPosts,
    invalidatePosts,
  } = useBoardPostsQuery(communityId, selectedCategory?.id);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([refetchCategories(), refetchPosts()]);
    setRefreshing(false);
  };

  const handleCategorySelect = (category: BoardCategory) => {
    setSelectedCategoryId(category.id);
  };

  const handleCreatePost = async (title: string, content: string, attachments?: Attachment[]) => {
    if (!profile || !communityId || !selectedCategory) {
      Alert.alert('Not ready', 'Your profile is still loading. Please try again in a moment.');
      return false;
    }

    console.log('Creating post:', { communityId, categoryId: selectedCategory.id, authorId: profile.id, title });

    try {
      const { data, error } = await supabase.from('board_posts').insert({
        community_id: communityId,
        category_id: selectedCategory.id,
        author_id: profile.id,
        title,
        content,
        attachments: attachments && attachments.length > 0 ? attachments : null,
      }).select().single();

      console.log('Insert result:', { data, error });

      if (error) {
        console.error('Insert error:', error);
        Alert.alert('Error', `Failed to create post: ${error.message}`);
        return false;
      }

      if (!data) {
        Alert.alert('Error', 'Post was not created. You may not have permission to post in this category.');
        return false;
      }

      console.log('Post created successfully:', data.id);
      invalidatePosts();
      return true;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('Error creating post:', error);
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
      // Get the highest display_order to put new topic at the end
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
        requires_approval: false, // Immediately available (no approval needed)
        created_by: profile.id,
      }).select().single();

      if (error) {
        console.error('Error creating topic:', error);
        Alert.alert('Error', `Failed to create topic: ${error.message}`);
        return false;
      }

      if (!data) {
        Alert.alert('Error', 'Topic was not created. Please try again.');
        return false;
      }

      // Refresh categories and select the new one
      invalidateCategories();
      setSelectedCategoryId(data.id);
      return true;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('Error creating topic:', error);
      Alert.alert('Error', `Failed to create topic: ${message}`);
      return false;
    }
  };

  // Show post detail view
  if (selectedPostId) {
    return (
      <BoardPostDetail
        postId={selectedPostId}
        onBack={() => {
          setSelectedPostId(null);
          invalidatePosts(); // Refresh to get updated reply counts
        }}
      />
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-cream" edges={['top']}>
      {/* Mobile Header */}
      {useMobileLayout ? (
        <AppHeader
          title="Message Board"
          onMenuPress={() => setDrawerOpen(true)}
        />
      ) : (
        <View className="bg-white px-4 py-3 border-b border-cream">
          <Text style={{ fontFamily: 'LibreBaskerville_700Bold' }} className="text-2xl text-charcoal">
            Message Board
          </Text>
        </View>
      )}

      {/* Navigation Drawer */}
      {useMobileLayout && (
        <NavigationDrawer
          isOpen={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          mode="navigation"
        />
      )}

      {/* Category tabs */}
      <BoardCategoryTabs
        categories={categories}
        selectedId={selectedCategory?.id || null}
        onSelect={handleCategorySelect}
        onAddTopic={() => setShowTopicComposer(true)}
      />

      {/* Posts list */}
      <ScrollView
        className="flex-1"
        contentContainerClassName="p-4"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#bd9348" />
        }
      >
        {selectedCategory && (
          <View className="mb-4">
            <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-charcoal/60 text-sm">
              {selectedCategory.description}
            </Text>
          </View>
        )}

        {posts.length === 0 ? (
          <View className="bg-white rounded-xl p-8 shadow-sm items-center">
            <Text className="text-4xl mb-4">📝</Text>
            <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-charcoal/50 text-center">
              No posts in this category yet.
              {canPost() && '\nBe the first to start a discussion!'}
            </Text>
          </View>
        ) : (
          posts.map((post) => (
            <BoardPostCard
              key={post.id}
              post={post}
              onPress={() => setSelectedPostId(post.id)}
            />
          ))
        )}
      </ScrollView>

      {/* FAB for new post */}
      {canPost() && (
        <Pressable
          onPress={() => setShowComposer(true)}
          className="absolute bottom-6 right-6 w-14 h-14 bg-gold rounded-full items-center justify-center shadow-lg active:opacity-80"
        >
          <Text className="text-white text-3xl">+</Text>
        </Pressable>
      )}

      {/* Post composer modal */}
      <BoardComposer
        visible={showComposer}
        category={selectedCategory}
        userId={profile?.id || ''}
        onClose={() => setShowComposer(false)}
        onSubmit={handleCreatePost}
      />

      {/* Topic composer modal */}
      <BoardTopicComposer
        visible={showTopicComposer}
        onClose={() => setShowTopicComposer(false)}
        onSubmit={handleCreateTopic}
      />
    </SafeAreaView>
  );
}
