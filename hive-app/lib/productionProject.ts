import { parseActionItemDescription } from './actionItemDisplay';
import { fetchCheckInActionItems } from './checkInActionItems';
import { supabase } from './supabase';

export type ProductionProjectAssignment = {
  id: string;
  description: string;
  assignedTo: string | null;
  assigneeName: string;
  completed: boolean;
  completedAt: string | null;
  relatedBoardPostId: string;
  findingCount: number;
  fileCount: number;
  latestFinding: string | null;
  latestFindingAt: string | null;
};

type AssignmentRow = {
  id: string;
  description: string;
  assigned_to: string | null;
  completed: boolean | null;
  completed_at: string | null;
  created_at: string | null;
  related_board_post_id: string | null;
  assignee?: { name?: string | null } | null;
};

type FindingRow = {
  post_id: string;
  content: string | null;
  attachments: unknown;
  created_at: string;
};

function attachmentCount(value: unknown) {
  return Array.isArray(value) ? value.length : 0;
}

function cleanFinding(value: string | null) {
  const clean = value?.replace(/\s+/g, ' ').trim() ?? '';
  if (!clean) return null;
  return clean.length > 150 ? `${clean.slice(0, 147).trim()}…` : clean;
}

/** Join each Production assignment to the board thread holding its findings. */
export async function fetchProductionProjectStatus(
  communityId: string,
): Promise<{ assignments: ProductionProjectAssignment[]; error: string | null }> {
  const result = await fetchCheckInActionItems<AssignmentRow>(() => (supabase as any)
    .from('action_items')
    .select('id, description, assigned_to, completed, completed_at, created_at, related_board_post_id, assignee:profiles!assigned_to(name)')
    .eq('community_id', communityId)
    .not('related_board_post_id', 'is', null)
    .is('archived_at', null)
    .order('created_at', { ascending: false })
    .order('id'));

  if (result.error) return { assignments: [], error: 'Production status could not load.' };

  // One early live assignment session produced duplicate rows when two people
  // pressed Assign together. One person plus one thread is one job here.
  const byPersonAndThread = new Map<string, AssignmentRow>();
  for (const row of result.data) {
    if (!row.related_board_post_id) continue;
    const key = `${row.assigned_to ?? 'unassigned'}:${row.related_board_post_id}`;
    const current = byPersonAndThread.get(key);
    if (!current || (!current.completed && !!row.completed)) byPersonAndThread.set(key, row);
  }

  const postIds = [...new Set(Array.from(byPersonAndThread.values(), row => row.related_board_post_id!))];
  let findings: FindingRow[] = [];
  if (postIds.length > 0) {
    const { data, error } = await (supabase as any)
      .from('board_replies')
      .select('post_id, content, attachments, created_at')
      .in('post_id', postIds)
      .order('created_at', { ascending: false });
    if (error) console.warn('Could not load Production findings:', error);
    else findings = (data ?? []) as FindingRow[];
  }

  const findingsByPost = new Map<string, FindingRow[]>();
  for (const finding of findings) {
    const list = findingsByPost.get(finding.post_id) ?? [];
    list.push(finding);
    findingsByPost.set(finding.post_id, list);
  }

  const assignments = Array.from(byPersonAndThread.values()).map((row) => {
    const threadFindings = findingsByPost.get(row.related_board_post_id!) ?? [];
    const latestWithText = threadFindings.find(finding => cleanFinding(finding.content));
    return {
      id: row.id,
      description: parseActionItemDescription(row.description).text,
      assignedTo: row.assigned_to,
      assigneeName: row.assignee?.name?.trim() || 'Unassigned',
      completed: !!row.completed,
      completedAt: row.completed_at,
      relatedBoardPostId: row.related_board_post_id!,
      findingCount: threadFindings.length,
      fileCount: threadFindings.reduce((total, finding) => total + attachmentCount(finding.attachments), 0),
      latestFinding: cleanFinding(latestWithText?.content ?? null),
      latestFindingAt: threadFindings[0]?.created_at ?? null,
    } satisfies ProductionProjectAssignment;
  });

  assignments.sort((a, b) => {
    if (a.completed !== b.completed) return a.completed ? 1 : -1;
    return a.assigneeName.localeCompare(b.assigneeName) || a.description.localeCompare(b.description);
  });
  return { assignments, error: null };
}
