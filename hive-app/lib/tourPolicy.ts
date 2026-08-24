/**
 * A completed tour only belongs to the membership cycle it happened during.
 * An older mark from a removed membership must not suppress a fresh invite.
 */
export function membershipStillNeedsTour(
  membershipCreatedAt: string,
  markCompletedAt?: string | null,
): boolean {
  if (!markCompletedAt) return true;
  return new Date(markCompletedAt).getTime() < new Date(membershipCreatedAt).getTime();
}
