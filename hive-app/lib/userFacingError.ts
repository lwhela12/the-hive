/**
 * Keeps provider and database failures behind a member-safe copy boundary.
 *
 * Error objects remain available to callers for logging and compatibility
 * checks. Their text is untrusted: providers may include table names, policies,
 * SQLSTATE codes, schema details, or implementation hints at any time.
 */
export function userFacingError(error: unknown, fallback: string): string {
  console.error('[userFacingError] member-safe fallback used', error);
  return fallback;
}
