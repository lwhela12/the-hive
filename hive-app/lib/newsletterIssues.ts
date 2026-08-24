export type NewsletterIssueState = {
  id: string;
  created_at: string;
  visibility: string | null;
  sentAt: string | null;
};

/** The first issue created for HIVE's real in-app send path. */
export const NEWSLETTER_SEND_LAUNCHED_AT = '2026-08-12T18:03:25.000Z';

/**
 * The one issue still being written.
 *
 * Old imported issues have no in-app send rows and often kept members-only
 * visibility, so “not sent + not public” alone falsely made June the current
 * draft forever. A draft must also be newer than the last completed issue (or
 * newer than the send feature itself when nothing has completed yet).
 */
export function currentNewsletterDraft<T extends NewsletterIssueState>(issues: T[]): T | null {
  const completedCreatedAt = issues
    .filter((issue) => !!issue.sentAt || issue.visibility === 'public')
    .map((issue) => issue.created_at)
    .sort((a, b) => b.localeCompare(a))[0] ?? NEWSLETTER_SEND_LAUNCHED_AT;

  return [...issues]
    .filter((issue) => !issue.sentAt && issue.visibility !== 'public')
    .filter((issue) => issue.created_at > completedCreatedAt)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null;
}

/** Everything except the live draft belongs on the past-issues shelf now. */
export function newsletterIssueHistory<T extends NewsletterIssueState>(issues: T[], draft: T | null): T[] {
  return [...issues]
    .filter((issue) => issue.id !== draft?.id)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}
