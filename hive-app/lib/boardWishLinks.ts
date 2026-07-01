import type { BoardCategory, Wish } from '../types';

export function getWishGoalTitle(description: string, maxLength = 48) {
  const cleaned = description.replace(/\s+/g, ' ').trim();
  if (cleaned.length <= maxLength) return cleaned;
  return `${cleaned.slice(0, maxLength - 1).trim()}…`;
}

export function getMemberBoardDisplayName(name?: string | null) {
  const firstName = name?.trim().split(/\s+/)[0] || 'My';
  const aliases: Record<string, string> = {
    brittany: 'Brit',
    isabelle: 'Izzy',
    infiniti: 'Fin',
    natalie: 'Nat',
    nathan: 'Nat',
    nicole: 'Nic',
    nicholas: 'Nic',
  };

  return aliases[firstName.toLowerCase()] || firstName;
}

export function getMemberHdBoardName(name?: string | null) {
  return `${getMemberBoardDisplayName(name)}'s HD Board`;
}

export function getBoardNameForWish(wish: Pick<Wish, 'description' | 'user'>) {
  return getMemberHdBoardName(wish.user?.name);
}

export function getLinkedBoardLabel(board?: Pick<BoardCategory, 'name' | 'topic_kind'> | null) {
  if (!board) return null;
  return board.topic_kind === 'hd_board' ? 'Wish conversation' : `Board: ${board.name}`;
}
