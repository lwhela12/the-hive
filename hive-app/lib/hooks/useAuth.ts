import { createContext, useContext } from 'react';
import type { Session } from '@supabase/supabase-js';
import type { Profile, Community, UserRole } from '../../types';

interface AuthContextType {
  session: Session | null;
  profile: Profile | null;
  community: Community | null;
  communityId: string | null;
  communityRole: UserRole | null;
  loading: boolean;
  refreshProfile: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType>({
  session: null,
  profile: null,
  community: null,
  communityId: null,
  communityRole: null,
  loading: true,
  refreshProfile: async () => {},
});

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
