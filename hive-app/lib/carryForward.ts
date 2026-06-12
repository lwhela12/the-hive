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
