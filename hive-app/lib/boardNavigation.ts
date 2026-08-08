import { removeSessionItem } from './webStorage';

export const BOARD_HOME_EVENT = 'the-hive:boards-home';

export function clearBoardNavigationState(communityId?: string | null) {
  if (typeof window === 'undefined') return;

  if (communityId) {
    [
      `the-hive:last-board-category:${communityId}`,
      `the-hive:last-board-post:${communityId}`,
      `the-hive:board-composer-open:${communityId}`,
      `the-hive:board-direct-open:${communityId}`,
    ].forEach(removeSessionItem);
  }

  if (typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(new Event(BOARD_HOME_EVENT));
  }
}
