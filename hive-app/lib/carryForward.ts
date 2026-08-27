export const CARRY_FORWARD_ANSWER_KEY = 'q_carry_forward_items';

export type CarryForwardItemType =
  | 'action_item'
  | 'wish'
  | 'hd_board'
  | 'board_post'
  | 'previous_pop';

export type CarryForwardStatus =
  | 'keep_active'
  | 'needs_attention'
  | 'done'
  | 'archive';

export interface CarryForwardItem {
  id: string;
  type: CarryForwardItemType;
  label: string;
  detail?: string | null;
  sourceLabel: string;
  createdAt?: string | null;
}

export interface CarryForwardResponseItem extends CarryForwardItem {
  status: CarryForwardStatus;
  note?: string | null;
}

export const CARRY_FORWARD_STATUS_OPTIONS: {
  value: CarryForwardStatus;
  label: string;
}[] = [
  { value: 'keep_active', label: 'Keep active' },
  { value: 'needs_attention', label: 'Needs attention' },
  { value: 'done', label: 'Done' },
  { value: 'archive', label: 'Archive' },
];

export const CARRY_FORWARD_STATUS_LABELS: Record<CarryForwardStatus, string> = {
  keep_active: 'Keep active',
  needs_attention: 'Needs attention',
  done: 'Done',
  archive: 'Archive',
};

export function isCarryForwardStatus(value: unknown): value is CarryForwardStatus {
  return CARRY_FORWARD_STATUS_OPTIONS.some(option => option.value === value);
}

export function getCarryForwardStatusLabel(value: unknown) {
  return isCarryForwardStatus(value) ? CARRY_FORWARD_STATUS_LABELS[value] : 'Needs review';
}

export function normalizeCarryForwardResponse(value: unknown): CarryForwardResponseItem[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const record = item as Record<string, unknown>;
      const id = typeof record.id === 'string' ? record.id : '';
      const type = typeof record.type === 'string' ? record.type as CarryForwardItemType : null;
      const label = typeof record.label === 'string' ? record.label : '';
      const status = isCarryForwardStatus(record.status) ? record.status : null;
      if (!id || !type || !label || !status) return null;

      return {
        id,
        type,
        label,
        status,
        sourceLabel: typeof record.sourceLabel === 'string' ? record.sourceLabel : 'Carry-forward',
        detail: typeof record.detail === 'string' ? record.detail : null,
        createdAt: typeof record.createdAt === 'string' ? record.createdAt : null,
        note: typeof record.note === 'string' ? record.note : null,
      };
    })
    .filter(Boolean) as CarryForwardResponseItem[];
}

/**
 * A status picked in the check-in has to reach the to-do it was picked on.
 *
 * The roster asks four things of every open task — Keep active, Needs
 * attention, Done, Archive — and until 2026-08-27 all four did the same thing:
 * they were written into the answers blob and nothing ever read them back out.
 * A member on 13 July marked "Do one 15-minute HIVE helper…" as **Archive**;
 * six weeks later `archived_at` on that row was still null and the task was
 * still being offered back to them. That is the whole of Nat's rule the same
 * morning — *"If you're going to make someone answer a question, you better
 * damn well know what you're going to do with the answer"* — failing on the
 * one question the check-in asks most often.
 *
 * So: Done completes the task, Archive retires it, and the two soft answers
 * (Keep active, Needs attention) deliberately change nothing — they are the
 * member saying "leave it where it is".
 *
 * Only `action_item` rows are touched. A wish is retired through its own
 * flow with its own confirmation, and an HD board or a thread is not a task.
 * Row-level security already lets exactly the assignee write these; a row this
 * person may not update simply does not change, and the check-in still saves.
 */
export async function applyCarryForwardStatuses(
  client: {
    from: (table: string) => any;
  },
  userId: string,
  items: CarryForwardResponseItem[],
): Promise<void> {
  const now = new Date().toISOString();

  const done = items.filter((item) => item.type === 'action_item' && item.status === 'done');
  const archived = items.filter((item) => item.type === 'action_item' && item.status === 'archive');

  const writes: Promise<unknown>[] = [];

  if (done.length > 0) {
    writes.push(
      client
        .from('action_items')
        .update({ completed: true, completed_at: now })
        .in('id', done.map((item) => item.id))
        .eq('assigned_to', userId)
        .or('completed.is.null,completed.is.false')
    );
  }

  if (archived.length > 0) {
    writes.push(
      client
        .from('action_items')
        .update({
          archived_at: now,
          archived_by: userId,
          archive_reason: 'member_archived_from_check_in',
        })
        .in('id', archived.map((item) => item.id))
        .eq('assigned_to', userId)
        .is('archived_at', null)
    );
  }

  if (writes.length === 0) return;

  const results = await Promise.all(writes);
  results.forEach((result) => {
    const error = (result as { error?: unknown } | null)?.error;
    // Never blocks the check-in: the answers are saved either way, and a
    // to-do that refused to move is worth knowing about without losing them.
    if (error) console.warn('Could not apply a carry-forward status', error);
  });
}
