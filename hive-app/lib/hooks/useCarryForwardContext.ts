import { useCallback, useEffect, useState } from 'react';
import { CARRY_FORWARD_ANSWER_KEY, type CarryForwardItem } from '../carryForward';
import { supabase } from '../supabase';
import { getSurveyResponsePeriod, isMonthlyCheckInSurvey, type Survey } from './useSurveys';

type CarryForwardHookArgs = {
  communityId?: string | null;
  userId?: string | null;
  survey?: Survey | null;
};

type ActionItemRow = {
  id: string;
  description: string;
  due_date?: string | null;
  created_at?: string | null;
};

type WishRow = {
  id: string;
  description: string;
  created_at?: string | null;
};

type BoardCategoryRow = {
  id: string;
  name: string;
  goal_title?: string | null;
  description?: string | null;
  created_at?: string | null;
};

type BoardPostRow = {
  id: string;
  category_id: string;
  title: string;
  content?: string | null;
  created_at?: string | null;
  last_reply_at?: string | null;
};

type SurveyResponseRow = {
  id: string;
  answers?: Record<string, unknown> | null;
  submitted_at?: string | null;
};

function truncate(value?: string | null, max = 120) {
  const clean = value?.replace(/\s+/g, ' ').trim() ?? '';
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1).trim()}...`;
}

function asText(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function buildPreviousPopDetail(answers?: Record<string, unknown> | null) {
  if (!answers) return '';

  const lines = [
    ['Progress', asText(answers.q_pop_progress)],
    ['Obstacles', asText(answers.q_pop_obstacles)],
    ['Priorities', asText(answers.q_pop_priorities)],
    ['Carry-forward', asText(answers.q_carry_forward)],
  ]
    .filter(([, value]) => value)
    .map(([label, value]) => `${label}: ${truncate(value, 90)}`);

  const carryForwardItems = Array.isArray(answers[CARRY_FORWARD_ANSWER_KEY])
    ? `${(answers[CARRY_FORWARD_ANSWER_KEY] as unknown[]).length} roster item update${(answers[CARRY_FORWARD_ANSWER_KEY] as unknown[]).length === 1 ? '' : 's'}`
    : '';

  if (carryForwardItems) lines.push(`Roster: ${carryForwardItems}`);
  return lines.join('\n');
}

function mergeItems(items: CarryForwardItem[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.type}:${item.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function useCarryForwardContext({
  communityId,
  userId,
  survey,
}: CarryForwardHookArgs) {
  const [items, setItems] = useState<CarryForwardItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!communityId || !userId || !survey || !isMonthlyCheckInSurvey(survey)) {
      setItems([]);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const actionItemsPromise = (supabase as any)
        .from('action_items')
        .select('id, description, due_date, created_at')
        .eq('community_id', communityId)
        .eq('assigned_to', userId)
        .eq('completed', false)
        .is('archived_at', null)
        .order('created_at', { ascending: false })
        .limit(8);

      const wishesPromise = supabase
        .from('wishes')
        .select('id, description, created_at')
        .eq('community_id', communityId)
        .eq('user_id', userId)
        .eq('status', 'public')
        .or('is_active.is.true,is_active.is.null')
        .order('created_at', { ascending: false })
        .limit(8);

      const hdBoardsQuery = (supabase as any)
        .from('board_categories')
        .select('id, name, goal_title, description, created_at')
        .eq('community_id', communityId)
        .eq('topic_kind', 'hd_board')
        .eq('owner_user_id', userId)
        .eq('status', 'active')
        .order('display_order', { ascending: true })
        .limit(8);

      const responsePeriod = getSurveyResponsePeriod(survey);
      const previousPopPromise = (supabase as any)
        .from('survey_responses')
        .select('id, answers, submitted_at')
        .eq('community_id', communityId)
        .eq('user_id', userId)
        .eq('survey_id', survey.id)
        .neq('response_period', responsePeriod)
        .order('submitted_at', { ascending: false })
        .limit(1);

      const [actionItemsRes, wishesRes, hdBoardsRes, previousPopRes] = await Promise.all([
        actionItemsPromise,
        wishesPromise,
        hdBoardsQuery,
        previousPopPromise,
      ]);

      let hdBoardsData = hdBoardsRes.data as BoardCategoryRow[] | null;
      if (hdBoardsRes.error && String(hdBoardsRes.error.message ?? '').includes('status')) {
        const fallback = await (supabase as any)
          .from('board_categories')
          .select('id, name, goal_title, description, created_at')
          .eq('community_id', communityId)
          .eq('topic_kind', 'hd_board')
          .eq('owner_user_id', userId)
          .order('display_order', { ascending: true })
          .limit(8);
        hdBoardsData = fallback.data as BoardCategoryRow[] | null;
      }

      const hdBoardById = new Map((hdBoardsData ?? []).map(board => [board.id, board]));
      const hdBoardIds = Array.from(hdBoardById.keys());
      let boardPostsData: BoardPostRow[] = [];

      if (hdBoardIds.length > 0) {
        let boardPostsRes = await (supabase as any)
          .from('board_posts')
          .select('id, category_id, title, content, created_at, last_reply_at')
          .eq('community_id', communityId)
          .in('category_id', hdBoardIds)
          .eq('status', 'active')
          .is('archived_at', null)
          .order('last_reply_at', { ascending: false, nullsFirst: false })
          .order('created_at', { ascending: false })
          .limit(12);

        if (boardPostsRes.error && String(boardPostsRes.error.message ?? '').match(/status|archived_at/i)) {
          boardPostsRes = await (supabase as any)
            .from('board_posts')
            .select('id, category_id, title, content, created_at, last_reply_at')
            .eq('community_id', communityId)
            .in('category_id', hdBoardIds)
            .order('created_at', { ascending: false })
            .limit(12);
        }

        boardPostsData = (boardPostsRes.data ?? []) as BoardPostRow[];
      }

      if (actionItemsRes.error) console.warn('Could not load carry-forward tasks', actionItemsRes.error);
      if (wishesRes.error) console.warn('Could not load carry-forward wishes', wishesRes.error);
      if (hdBoardsRes.error && !hdBoardsData) console.warn('Could not load carry-forward HD boards', hdBoardsRes.error);
      if (previousPopRes.error) console.warn('Could not load previous POP response', previousPopRes.error);

      const nextItems: CarryForwardItem[] = [];

      ((actionItemsRes.data ?? []) as ActionItemRow[]).forEach((item) => {
        nextItems.push({
          id: item.id,
          type: 'action_item',
          label: item.description,
          detail: item.due_date ? `Due ${item.due_date}` : null,
          sourceLabel: 'To-do',
          createdAt: item.created_at ?? null,
        });
      });

      ((wishesRes.data ?? []) as WishRow[]).forEach((wish) => {
        nextItems.push({
          id: wish.id,
          type: 'wish',
          label: truncate(wish.description, 100),
          detail: wish.description,
          sourceLabel: 'Wish',
          createdAt: wish.created_at ?? null,
        });
      });

      (hdBoardsData ?? []).forEach((board) => {
        nextItems.push({
          id: board.id,
          type: 'hd_board',
          label: board.goal_title?.trim() || board.name,
          detail: board.description,
          sourceLabel: 'HD board',
          createdAt: board.created_at ?? null,
        });
      });

      boardPostsData.forEach((post) => {
        const board = hdBoardById.get(post.category_id);
        nextItems.push({
          id: post.id,
          type: 'board_post',
          label: post.title,
          detail: truncate(post.content, 140),
          sourceLabel: board?.goal_title || board?.name || 'HD thread',
          createdAt: post.last_reply_at || post.created_at || null,
        });
      });

      const previousPop = ((previousPopRes.data ?? []) as SurveyResponseRow[])[0];
      const previousPopDetail = buildPreviousPopDetail(previousPop?.answers);
      if (previousPop && previousPopDetail) {
        nextItems.push({
          id: previousPop.id,
          type: 'previous_pop',
          label: 'Last POP check-in',
          detail: previousPopDetail,
          sourceLabel: 'Previous notes',
          createdAt: previousPop.submitted_at ?? null,
        });
      }

      setItems(mergeItems(nextItems));
    } catch (loadError) {
      console.warn('Could not load carry-forward context', loadError);
      setItems([]);
      setError('Could not load your carry-forward roster.');
    } finally {
      setLoading(false);
    }
  }, [communityId, survey, userId]);

  useEffect(() => {
    void load();
  }, [load]);

  return { items, loading, error, refetch: load };
}
