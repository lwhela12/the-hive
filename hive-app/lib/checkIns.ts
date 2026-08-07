import type { Community } from '../types';

/**
 * OG HIVE's tune-ups were designed around OG's monthly rhythm. Other HIVEs get
 * their own check-ins only after their cadence, questions, newsletter use, and
 * privacy boundaries are deliberately chosen.
 */
export const CHECK_INS_COMING_SOON_MESSAGE =
  "Coming soon — check-ins will be designed around this HIVE’s own rhythm.";

/** OG HIVE keeps the original database slug from before multi-HIVE existed. */
export function hasTailoredCheckIns(
  community: Pick<Community, 'slug'> | null | undefined,
): boolean {
  return community?.slug === 'default';
}
