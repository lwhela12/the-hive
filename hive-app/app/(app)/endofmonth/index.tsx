import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../lib/hooks/useAuth';
import { usePageSkin } from '../../../lib/pageSkin';
import { useSurveys, type SurveyAnswers } from '../../../lib/hooks/useSurveys';
import { SurveyModal } from '../../../components/surveys/SurveyModal';
import type { Survey } from '../../../types';

/**
 * End of the month: app.the-hive.app/endofmonth
 *
 * One link, everybody, whichever HIVEs you are in. Nat, 2026-09-02: *"we need
 * one singular End of the month check-in survey, cos that's what I'll send out
 * to everyone."*
 *
 * **It draws the survey itself rather than sending you to a HIVE's Home.**
 *
 * The first version handed off to `/hive?openSurveyId=…`, the way the check-in
 * emails do, and Nat found it dead within the hour: *"I copy and pasted this
 * link into a new browser a few times, and every time it just keeps bringing me
 * back here."* Home is a HIVE's page. It waits for a HIVE before it opens
 * anything, and a new browser arrives signed out, lands at HIVE-Wide after
 * login, and waits there forever — Home's own guard even bounces you up to
 * `/hive-wide` first.
 *
 * That was the wrong destination on principle as well as in practice: this
 * check-in belongs to no HIVE (`community_id is null`, migration 225), so
 * routing it through one HIVE's Home was asking a question that has no answer.
 * Nothing here needs a HIVE, so nothing here asks for one.
 */
export default function EndOfMonthScreen() {
  const router = useRouter();
  const { loading: authLoading, profile } = useAuth();
  const skin = usePageSkin();
  const { availableSurveys, myResponses, submitResponse, loading: surveysLoading } = useSurveys();

  const [survey, setSurvey] = useState<Survey | null>(null);
  const [state, setState] = useState<'looking' | 'ready' | 'none'>('looking');

  useEffect(() => {
    if (authLoading || !profile) return;
    let cancelled = false;

    void (async () => {
      // The open HIVE-Wide check-in. Looked UP rather than carried in the
      // address, so next month's row answers the link she has already texted
      // people — an id in a URL is a link that expires quietly.
      const { data } = await supabase
        .from('surveys')
        .select('*')
        .is('community_id', null)
        .eq('is_active', true)
        .order('due_date', { ascending: true })
        .limit(1);

      if (cancelled) return;
      const found = (data ?? [])[0] as Survey | undefined;
      if (!found) { setState('none'); return; }
      setSurvey(found);
      setState('ready');
    })();

    return () => { cancelled = true; };
  }, [authLoading, profile]);

  const done = useCallback(() => {
    // Home rather than back: a link out of a text message has nothing behind it.
    router.replace('/hive-wide' as never);
  }, [router]);

  const onSubmit = useCallback(async (answers: SurveyAnswers) => {
    if (!survey) return { error: 'No check-in open' };
    return submitResponse(survey.id, answers);
  }, [survey, submitResponse]);

  if (state === 'ready' && survey) {
    const mine = myResponses.get(survey.id);
    return (
      <SurveyModal
        survey={survey}
        initialAnswers={mine?.answers}
        isEditingResponse={!!mine}
        onSubmit={onSubmit}
        onClose={done}
      />
    );
  }

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: skin.page, padding: 24 }}>
      {state === 'none' ? (
        <Text
          style={{ fontFamily: 'Lato_400Regular', fontSize: 14, lineHeight: 21, color: skin.inkSoft, textAlign: 'center' }}
        >
          There is no End of the month check-in open just now. Nothing has gone wrong — it opens
          three days before the month ends.
        </Text>
      ) : (
        <>
          <ActivityIndicator color={skin.gold} />
          <Text style={{ fontFamily: 'Lato_400Regular', color: skin.inkSoft, fontSize: 14, marginTop: 12 }}>
            Opening End of the month…
          </Text>
        </>
      )}
    </View>
  );
}
