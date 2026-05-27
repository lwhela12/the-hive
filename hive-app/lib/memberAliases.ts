export const MEMBER_NAME_ALIASES: Record<string, string> = {
  brit: 'brittany',
  ollie: 'oliver',
  izzy: 'isabelle',
  fin: 'infiniti',
  infinite: 'infiniti',
  ems: 'emmeline',
};

const STOP_WORDS = new Set(['a', 'an', 'and', 'for', 'in', 'of', 'on', 's', 'the', 'to']);

export function normalizeMemberSearchText(value?: string | null): string {
  return (value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function normalizeMemberHandle(value?: string | null): string {
  return normalizeMemberSearchText(value).replace(/\s+/g, '');
}

export function expandMemberAliasTerms(value?: string | null): string[] {
  const normalized = normalizeMemberSearchText(value);
  const compact = normalizeMemberHandle(value);
  if (!normalized && !compact) return [];

  const terms = new Set<string>();
  if (normalized) terms.add(normalized);
  if (compact && compact !== normalized) terms.add(compact);

  const directTarget = MEMBER_NAME_ALIASES[normalized] || MEMBER_NAME_ALIASES[compact];
  if (directTarget) terms.add(directTarget);

  Object.entries(MEMBER_NAME_ALIASES).forEach(([alias, target]) => {
    if (target === normalized || target === compact || normalized.includes(target) || compact.includes(target)) {
      terms.add(alias);
    }
  });

  return Array.from(terms).filter(Boolean);
}

export function getMemberAliasesForName(name?: string | null): string[] {
  const normalized = normalizeMemberSearchText(name);
  const compact = normalizeMemberHandle(name);
  const first = normalized.split(/\s+/)[0] || '';

  return Object.entries(MEMBER_NAME_ALIASES)
    .filter(([, target]) => target === first || target === compact || normalized.includes(target))
    .map(([alias]) => alias);
}

export function matchesMemberSearchText(values: Array<string | null | undefined>, query: string): boolean {
  const normalizedQuery = normalizeMemberSearchText(query);
  if (!normalizedQuery) return true;

  const haystack = normalizeMemberSearchText(values.filter(Boolean).join(' '));
  const compactHaystack = normalizeMemberHandle(values.filter(Boolean).join(' '));
  const tokenGroups = normalizedQuery
    .split(/\s+/)
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token))
    .map(expandMemberAliasTerms);

  const groups = tokenGroups.length > 0 ? tokenGroups : [expandMemberAliasTerms(normalizedQuery)];
  return groups.every((terms) =>
    terms.some((term) => haystack.includes(term) || compactHaystack.includes(term.replace(/\s+/g, '')))
  );
}
