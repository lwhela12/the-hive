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
  /**
   * Are you standing at Whole HIVE rather than inside one of them?
   *
   * Nat's simplification, 2026-08-03: HIVE-Wide used to be its own section of
   * the rail with its own children, which meant two shapes to learn and two
   * places to add anything new. It is now the first entry under My HIVEs,
   * alongside OG, Tech and Production — so it is not a different KIND of thing,
   * it is one more thing of the same kind, and the page list underneath serves
   * whichever one you picked.
   *
   * It is deliberately NOT a community id. There is no row for it and there
   * should not be: it is the view from above all of them, and inventing a
   * pretend HIVE would have every query in the app asking a real database for
   * an imaginary place.
   */
  wholeHive: boolean;
  /**
   * What this person last PICKED, as opposed to where the route says they are.
   *
   * Only the shell needs it, and only to keep the two in step — see the note
   * on `wholeHiveChoice` in `app/_layout.tsx`. Everything that draws something
   * wants `wholeHive`, which is the derived truth.
   */
  wholeHiveChoice: boolean;
  /** Stand at Whole HIVE. Leaves your actual HIVE selection untouched underneath. */
  enterWholeHive: () => void;
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
  wholeHive: false,
  wholeHiveChoice: false,
  enterWholeHive: () => {},
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
