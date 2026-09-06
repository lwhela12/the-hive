/** Percentages use people who answered this question, once per current member. */
export function meetingVoteResults(memberIds: string[], answers: Map<string, { answers: Record<string, any> }>, key: string, options: string[]) {
  const counts = new Map(options.map(option => [option, 0]));
  let voted = 0;
  const eligible = [...new Set(memberIds)];
  for (const id of eligible) {
    const raw = answers.get(id)?.answers[key];
    const answer = typeof raw === 'string' ? raw.trim() : '';
    if (!counts.has(answer)) continue;
    counts.set(answer, counts.get(answer)! + 1);
    voted++;
  }
  return { voted, total: eligible.length, rows: [...counts].map(([option, count]) => ({ option, count, percent: voted ? Math.round(count / voted * 100) : 0 })) };
}
