/**
 * The names in a short link, and what they mean to the database.
 *
 * Two doors use this — `/checkin/og` (the before-a-meeting tune-up) and
 * `/halfway/og` (the halfway one) — so the list of names lives here rather
 * than in whichever screen was written first.
 *
 * `og` is the odd one: OG HIVE still carries `default` from before there was
 * more than one HIVE, and that slug is load-bearing in `lib/checkIns.ts`, so
 * it is aliased rather than renamed. `pro` is here because Nat says
 * "Pro HIVE" out loud and Production answers to both.
 */
export const SHORT_LINK_ALIASES: Record<string, string> = {
  og: 'default',
  default: 'default',
  tech: 'tech',
  show: 'show',
  pro: 'show',
  production: 'show',
};

/** What the address asked for, lowercased and de-aliased. */
export function shortLinkSlug(asked: string | string[] | undefined): {
  asked: string;
  slug: string;
} {
  const raw = (Array.isArray(asked) ? asked[0] : asked)?.trim().toLowerCase() ?? '';
  return { asked: raw, slug: SHORT_LINK_ALIASES[raw] ?? raw };
}
