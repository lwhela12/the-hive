import { ADMIN_DESTINATION, NAV_DESTINATIONS } from './navigation';

const DEEP_ORIGINS: ReadonlyArray<readonly [prefix: string, label: string]> = [
  ['/hive-wide-boards', 'Boards'],
  ['/meeting-helper', 'Meeting Helper'],
  ['/monthly-tuneup', 'Monthly Tune-up'],
  ['/arrival-board', 'Arrival Board'],
  ['/newsletter', 'The Buzz'],
  ['/checkin', 'Monthly Check-in'],
  ['/join', 'Joining a HIVE'],
  ['/login', 'Signing in'],
  ['/board', 'Boards'],
  ['/messages', 'Messages'],
  ['/meetings', 'Meetings'],
  ['/members', 'Members'],
  ['/admin', 'Admin'],
];

const routeLabels = new Map<string, string>();
for (const destination of [...NAV_DESTINATIONS, ADMIN_DESTINATION]) {
  if (destination.route !== '/app-feedback') routeLabels.set(destination.route, destination.label);
  if (destination.wideRoute) routeLabels.set(destination.wideRoute, destination.label);
}
routeLabels.set('/hive-wide', 'HIVE-Wide');
routeLabels.set('/hive', 'Home');

/** A friendly, allow-listed label. Unknown/deep-link origins stay editable and blank. */
export function feedbackLabelForPath(pathname: string | null | undefined): string | null {
  const path = (pathname ?? '').split('?')[0].replace(/\/+$/, '') || '/';
  if (path === '/app-feedback') return null;
  const exact = routeLabels.get(path);
  if (exact) return exact;
  const deep = DEEP_ORIGINS.find(([prefix]) => path === prefix || path.startsWith(`${prefix}/`));
  return deep?.[1] ?? null;
}

export function validFeedbackOriginLabel(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const clean = value.trim().slice(0, 80);
  if (!clean) return null;
  const allowed = new Set([
    ...routeLabels.values(),
    ...DEEP_ORIGINS.map(([, label]) => label),
  ]);
  return allowed.has(clean) ? clean : null;
}

export const FEEDBACK_WHERE_OPTIONS = Array.from(new Set([
  ...NAV_DESTINATIONS.filter((item) => item.route !== '/app-feedback').map((item) => item.label),
  ...DEEP_ORIGINS.map(([, label]) => label),
  'HIVE-Wide',
  'The whole app',
  'Somewhere else',
]));
