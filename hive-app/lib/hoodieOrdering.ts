/** The one member-facing destination for choosing HIVE clothing. */
export const HIVE_CLOTHING_ORDER_URL = 'https://app.the-hive.app/hoodie-studio/';

/** Carry the caller's exact room and query into the standalone studio. */
export function hiveClothingOrderUrl(returnTo: string | null): string {
  if (!returnTo || !returnTo.startsWith('/') || returnTo.startsWith('//') || /[\\\u0000-\u0020]/.test(returnTo)) return HIVE_CLOTHING_ORDER_URL;
  const url = new URL(HIVE_CLOTHING_ORDER_URL);
  url.searchParams.set('returnTo', returnTo);
  return url.toString();
}
