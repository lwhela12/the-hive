/** Meeting-scoped, optional ranked choices. Old single-choice answers remain readable. */
export function ideaRanking(value: unknown, legacy?: unknown): string[] {
  const source = Array.isArray(value) ? value : typeof legacy === 'string' ? [legacy] : [];
  const seen = new Set<string>();
  return source.filter((item): item is string => typeof item === 'string')
    .map(item => item.trim())
    .filter(item => {
      const key = item.toLocaleLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 3);
}

export function toggleIdeaRank(ranking: string[], idea: string): string[] {
  const current = ideaRanking(ranking);
  const index = current.findIndex(item => item.toLocaleLowerCase() === idea.toLocaleLowerCase());
  return index >= 0 ? current.filter((_, at) => at !== index)
    : current.length < 3 ? [...current, idea] : current;
}

export function tallyIdeaRankings(answers: Array<Record<string, unknown>>, kind: 'help' | 'hang') {
  const prefix = `q_${kind}_idea_`;
  const totals = new Map<string, { title: string; points: number; first: number; voters: number }>();
  for (const answer of answers) {
    const ranking = ideaRanking(answer[`${prefix}ranking`], answer[`${prefix}choice`]);
    ranking.forEach((title, index) => {
      const key = title.toLocaleLowerCase();
      const row = totals.get(key) ?? { title, points: 0, first: 0, voters: 0 };
      row.points += 3 - index;
      row.first += index === 0 ? 1 : 0;
      row.voters += 1;
      totals.set(key, row);
    });
  }
  return [...totals.values()].sort((a, b) => b.points - a.points || b.first - a.first || a.title.localeCompare(b.title));
}
