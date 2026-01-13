import { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, RefreshControl, Pressable, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/hooks/useAuth';
import { BoardCategoryTabs } from '../../components/board/BoardCategoryTabs';
import { BoardPostCard } from '../../components/board/BoardPostCard';
import { BoardPostDetail } from '../../components/board/BoardPostDetail';
import { BoardComposer } from '../../components/board/BoardComposer';
import type { BoardCategory, BoardPost, Profile } from '../../types';

type PostWithAuthor = BoardPost & { author?: Profile };

export default function BoardScreen() {
  const { profile, communityId, communityRole } = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  const [categories, setCategories] = useState<BoardCategory[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<BoardCategory | null>(null);
  const [posts, setPosts] = useState<PostWithAuthor[]>([]);
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
  const [showComposer, setShowComposer] = useState(false);

  const isAdmin = communityRole === 'admin';

  const fetchCategories = useCallback(async () => {
    if (!communityId) return;

    const { data, error } = await supabase
      .from('board_categories')
      .select('*')
      .eq('community_id', communityId)
      .or('requires_approval.eq.false,approved_at.not.is.null')
      .order('display_order', { ascending: true });

    if (!error && data) {
      setCategories(data);
      if (!selectedCategory && data.length > 0) {
        setSelectedCategory(data[0]);
      }
    }
  }, [communityId, selectedCategory]);

  const fetchPosts = useCallback(async () => {
    if (!communityId || !selectedCategory) return;

    let query = supabase
      .from('board_posts')
      .select('*, author:profiles(*)')
      .eq('community_id', communityId)
      .eq('category_id', selectedCategory.id)
      .order('is_pinned', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(50);

    const { data, error } = await query;

    if (!error && data) {
      setPosts(data as PostWithAuthor[]);
    }
  }, [communityId, selectedCategory]);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  useEffect(() => {
    if (selectedCategory) {
      fetchPosts();
    }
  }, [selectedCategory, fetchPosts]);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchCategories(), fetchPosts()]);
    setRefreshing(false);
  };

  const handleCategorySelect = (category: BoardCategory) => {
    setSelectedCategory(category);
  };

  const handleCreatePost = async (title: string, content: string) => {
    if (!profile || !communityId || !selectedCategory) {
      Alert.alert('Not ready', 'Your profile is still loading. Please try again in a moment.');
      return false;
    }

    try {
      const { error } = await supabase.from('board_posts').insert({
        community_id: communityId,
        category_id: selectedCategory.id,
        author_id: profile.id,
        title,
        content,
      });

      if (error) throw error;

      await fetchPosts();
      return true;
    } catch (error) {
      console.error('Error creating post:', error);
      Alert.alert('Error', 'Failed to create post.');
      return false;
    }
  };

  const canPost = () => {
    if (!selectedCategory || !profile || !communityId) return false;
    if (selectedCategory.requires_admin && !isAdmin) return false;
    return true;
  };

  // Show post detail view
  if (selectedPostId) {
    return (
      <BoardPostDetail
        postId={selectedPostId}
        onBack={() => setSelectedPostId(null)}
      />
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-cream" edges={['top']}>
      {/* Header */}
      <View className="bg-white px-4 py-3 border-b border-cream">
        <Text style={{ fontFamily: 'LibreBaskerville_700Bold' }} className="text-2xl text-charcoal">
          Message Board
        </Text>
      </View>

      {/* Category tabs */}
      <BoardCategoryTabs
        categories={categories}
        selectedId={selectedCategory?.id || null}
        onSelect={handleCategorySelect}
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
        onClose={() => setShowComposer(false)}
        onSubmit={handleCreatePost}
      />
    </SafeAreaView>
  );
}
