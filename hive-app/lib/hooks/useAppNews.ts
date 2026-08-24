import { useQuery } from '@tanstack/react-query';
import { mergeAppNews } from '../appNews';
import { queryKeys } from '../queryClient';
import { supabase } from '../supabase';
import type { AppNews } from '../../types';

const legacyAppNews = mergeAppNews([]);

/** One merged news source for every signed-in surface. */
export function useAppNews() {
  const query = useQuery({
    queryKey: queryKeys.appNews,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('app_news')
        .select('id, occurred_on, title, detail, created_at')
        .order('occurred_on', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) throw error;
      return mergeAppNews((data ?? []) as AppNews[]);
    },
  });

  return {
    // Keep the fallback referentially stable: Home keys an effect on this list,
    // and a fresh array every render would retrigger it forever while offline.
    appNews: query.data ?? legacyAppNews,
    ...query,
  };
}