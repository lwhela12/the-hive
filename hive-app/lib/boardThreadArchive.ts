import { supabase } from './supabase';
import type { BoardPost } from '../types';

type ArchiveablePost = Pick<BoardPost, 'id' | 'archived_at' | 'archived_by'>;

interface SetBoardThreadArchiveStateInput {
  post?: ArchiveablePost | null;
  postId?: string;
  communityId: string;
  restore: boolean;
}

interface ArchiveRow {
  id?: string;
  post_id?: string;
  archived_at?: string | null;
  archived_by?: string | null;
}

export interface ArchivedBoardThread {
  id: string;
  archived_at: string | null;
  archived_by: string | null;
}

const ARCHIVE_MIGRATION_MESSAGE =
  'Board thread archiving needs the latest Supabase migration before it can work here.';

function getErrorText(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object') {
    const details = error as { message?: unknown; details?: unknown; hint?: unknown; code?: unknown };
    return [details.message, details.details, details.hint, details.code]
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      .join('\n');
  }
  return '';
}

function isMissingArchiveRpcError(error: unknown) {
  const text = getErrorText(error).toLowerCase();
  return (
    text.includes('pgrst202') ||
    (text.includes('set_board_post_archived_state') && (
      text.includes('could not find the function') ||
      text.includes('schema cache') ||
      text.includes('does not exist')
    ))
  );
}

function isMissingArchiveColumnError(error: unknown) {
  const text = getErrorText(error).toLowerCase();
  return text.includes('archived_at') && (
    text.includes('could not find') ||
    text.includes('schema cache') ||
    text.includes('column')
  );
}

function normalizeArchiveRow(row: ArchiveRow | null | undefined): ArchivedBoardThread | null {
  const id = row?.id ?? row?.post_id;
  if (!id) return null;

  return {
    id,
    archived_at: row?.archived_at ?? null,
    archived_by: row?.archived_by ?? null,
  };
}

async function setBoardThreadArchiveStateDirectly({
  post,
  postId,
  communityId,
  restore,
}: SetBoardThreadArchiveStateInput): Promise<ArchivedBoardThread> {
  const targetPostId = postId ?? post?.id;
  if (!targetPostId) {
    throw new Error('Board thread is missing an id.');
  }

  if (post && !Object.prototype.hasOwnProperty.call(post, 'archived_at')) {
    throw new Error(ARCHIVE_MIGRATION_MESSAGE);
  }

  const { data, error } = await (supabase as any)
    .from('board_posts')
    .update({ archived_at: restore ? null : new Date().toISOString() })
    .eq('id', targetPostId)
    .eq('community_id', communityId)
    .select('id, archived_at')
    .maybeSingle();

  if (error) {
    if (isMissingArchiveColumnError(error)) {
      throw new Error(ARCHIVE_MIGRATION_MESSAGE);
    }
    throw error;
  }

  const updatedThread = normalizeArchiveRow(data);
  if (!updatedThread) {
    throw new Error('Thread was not archived. You may not have permission to manage this thread.');
  }

  return updatedThread;
}

export async function setBoardThreadArchiveState(
  input: SetBoardThreadArchiveStateInput
): Promise<ArchivedBoardThread> {
  const targetPostId = input.postId ?? input.post?.id;
  if (!targetPostId) {
    throw new Error('Board thread is missing an id.');
  }

  const { data, error } = await (supabase as any).rpc('set_board_post_archived_state', {
    p_post_id: targetPostId,
    p_community_id: input.communityId,
    p_restore: input.restore,
  });

  if (!error) {
    const row = Array.isArray(data) ? data[0] : data;
    const updatedThread = normalizeArchiveRow(row);
    if (!updatedThread) {
      throw new Error('Thread was not archived. You may not have permission to manage this thread.');
    }
    return updatedThread;
  }

  if (!isMissingArchiveRpcError(error)) {
    throw error;
  }

  return setBoardThreadArchiveStateDirectly(input);
}
