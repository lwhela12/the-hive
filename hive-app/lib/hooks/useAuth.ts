import { createContext, useContext } from 'react';
import type { Session } from '@supabase/supabase-js';
import type { Profile, Community, UserRole } from '../../types';

/** One hive this person belongs to, with the role they hold in it. */
export type HiveMembership = {
  community_id: string;
  role: UserRole;
  community: Community;
};

interface AuthContextType {
  session: Session | null;
  profile: Profile | null;
  community: Community | null;
  communityId: string | null;
  communityRole: UserRole | null;
  /** Every hive this person belongs to. One entry for almost everyone. */
  memberships: HiveMembership[];
  /** True while the "which hive?" screen should be covering the app. */
  hivePickerOpen: boolean;
  /** Ask for the picker — the drawer's "Switch hive" uses this. */
  openHivePicker: () => void;
  /** Move into another hive. Ignores any hive this person isn't a member of. */
  switchCommunity: (communityId: string) => Promise<void>;
  loading: boolean;
  refreshProfile: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType>({
  session: null,
  profile: null,
  community: null,
  communityId: null,
  communityRole: null,
  memberships: [],
  hivePickerOpen: false,
  openHivePicker: () => {},
  switchCommunity: async () => {},
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
