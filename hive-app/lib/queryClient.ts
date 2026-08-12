import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Cache data for 5 minutes before marking stale
      staleTime: 5 * 60 * 1000,
      // Keep unused data in cache for 30 minutes
      gcTime: 30 * 60 * 1000,
      // Retry failed queries 2 times
      retry: 2,
      // Don't refetch on window focus for mobile (can cause excessive requests)
      refetchOnWindowFocus: false,
    },
  },
});

// Query key factories for consistent cache management
export const queryKeys = {
  // Chat rooms
  chatRooms: (communityId: string) => ['chatRooms', communityId] as const,
  chatRoom: (roomId: string) => ['chatRoom', roomId] as const,
  roomMessages: (roomId: string) => ['roomMessages', roomId] as const,

  // HIVE data
  publicWishes: (communityId: string) => ['publicWishes', communityId] as const,
  grantedWishes: (communityId: string) => ['grantedWishes', communityId] as const,
  userWishes: (communityId: string, userId: string) =>
    ['userWishes', communityId, userId] as const,
  userSkills: (communityId: string, userId: string) =>
    ['userSkills', communityId, userId] as const,
  events: (communityId: string) => ['events', communityId] as const,
  honeyPot: (communityId: string) => ['honeyPot', communityId] as const,
  honeyPotLedger: (communityId: string) => ['honeyPotLedger', communityId] as const,
  meetings: (communityId: string) => ['meetings', communityId] as const,
  fallbackAdmin: (communityId: string) => ['fallbackAdmin', communityId] as const,

  // Who the "@" picker can offer, per HIVE. One list, shared by every composer
  // in the app — a member card, a board reply, a chat box, a wish, the monthly
  // check-in — so opening any of them a second time costs nothing.
  mentionableMembers: (communityId: string) => ['mentionableMembers', communityId] as const,

  // Conversations
  conversations: (communityId: string, userId: string) =>
    ['conversations', communityId, userId] as const,

  // Board
  boardCategories: (communityId: string) => ['boardCategories', communityId] as const,
  boardPosts: (communityId: string, categoryId: string) =>
    ['boardPosts', communityId, categoryId] as const,
  boardPostCounts: (communityId: string) => ['boardPostCounts', communityId] as const,
  boardSearchIndex: (communityId: string) => ['boardSearchIndex', communityId] as const,
  boardLinkedWishes: (communityId: string, categoryId: string) =>
    ['boardLinkedWishes', communityId, categoryId] as const,
};

export async function invalidateWishQueries(
  communityId?: string | null,
  userId?: string | null
) {
  if (!communityId) return;

  const invalidations = [
    queryClient.invalidateQueries({ queryKey: queryKeys.publicWishes(communityId) }),
    queryClient.invalidateQueries({ queryKey: queryKeys.grantedWishes(communityId) }),
    queryClient.invalidateQueries({ queryKey: ['boardLinkedWishes', communityId] }),
    // Posting or granting a wish is one of the things Recent Activity reports,
    // and that feed started caching on 2026-08-12. Without this, a member
    // could grant a wish and go back to Home to find their own good deed
    // missing for a couple of minutes.
    queryClient.invalidateQueries({ queryKey: ['activityFeed', communityId] }),
  ];

  if (userId) {
    invalidations.push(
      queryClient.invalidateQueries({ queryKey: queryKeys.userWishes(communityId, userId) })
    );
  }

  await Promise.all(invalidations);
}
