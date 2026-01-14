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

  // Hive data
  queenBees: (communityId: string) => ['queenBees', communityId] as const,
  publicWishes: (communityId: string) => ['publicWishes', communityId] as const,
  grantedWishes: (communityId: string) => ['grantedWishes', communityId] as const,
  userWishes: (communityId: string, userId: string) =>
    ['userWishes', communityId, userId] as const,
  userSkills: (communityId: string, userId: string) =>
    ['userSkills', communityId, userId] as const,
  events: (communityId: string) => ['events', communityId] as const,
  honeyPot: (communityId: string) => ['honeyPot', communityId] as const,
  meetings: (communityId: string) => ['meetings', communityId] as const,
  fallbackAdmin: (communityId: string) => ['fallbackAdmin', communityId] as const,

  // Conversations
  conversations: (communityId: string, userId: string) =>
    ['conversations', communityId, userId] as const,

  // Board
  boardCategories: (communityId: string) => ['boardCategories', communityId] as const,
  boardPosts: (communityId: string, categoryId: string) =>
    ['boardPosts', communityId, categoryId] as const,
};
