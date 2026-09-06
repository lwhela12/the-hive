import { humanTimeInput, parseTimeInput } from './timeInput';

export function personalHardOut(value: unknown) {
  const raw = typeof value === 'string' ? value.trim() : '';
  const no = /^(no|nope|none|n\/a|not today|no hard out)[.!]?$/i.test(raw);
  const time = parseTimeInput(raw);
  const partial = raw.match(/^(\d{0,2}):(\d{0,2}) (AM|PM)$/i);
  const human = time ? humanTimeInput(time).match(/^(\d+):(\d+) (AM|PM)$/)! : null;
  return {
    choice: no ? 'no' : raw ? 'yes' : null,
    hour: human?.[1] ?? partial?.[1] ?? '',
    minute: human?.[2] ?? partial?.[2] ?? '00',
    period: (human?.[3] ?? partial?.[3]?.toUpperCase() ?? 'PM') as 'AM' | 'PM',
    label: no || !raw ? null : time ? humanTimeInput(time) : raw,
    legacy: raw && !no && !time && !partial && !/^yes$/i.test(raw) ? raw : null,
  };
}

export function personalHardOutError(value: unknown): string | null {
  const state = personalHardOut(value);
  return state.choice === 'yes' && !parseTimeInput(typeof value === 'string' ? value : '')
    ? 'Choose the hour and minute you need to leave, or select No.' : null;
}
