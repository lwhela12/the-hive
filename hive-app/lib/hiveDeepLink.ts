export type HiveDeepLinkAction = 'ignore' | 'consume' | 'switch';

/**
 * A HIVE named by a URL decides where a page opens, once.
 *
 * Returning `consume` when the reader already stands in the requested HIVE is
 * the important case. If a caller simply returns there without recording that
 * the link was handled, the link stays armed and undoes the next sidebar HIVE
 * choice by switching straight back.
 */
export function hiveDeepLinkAction({
  requestedHiveId,
  handledHiveId,
  currentCommunityId,
  wholeHive,
}: {
  requestedHiveId: string | null | undefined;
  handledHiveId: string | null | undefined;
  currentCommunityId: string | null | undefined;
  wholeHive: boolean;
}): HiveDeepLinkAction {
  if (!requestedHiveId || handledHiveId === requestedHiveId) return 'ignore';
  if (!wholeHive && currentCommunityId === requestedHiveId) return 'consume';
  return 'switch';
}
