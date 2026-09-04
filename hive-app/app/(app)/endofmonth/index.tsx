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
  /**
   * `useSurveys` NEEDS its arguments, and the failure without them is silent.
   *
   * This called `useSurveys()` bare for its first hour. The query is
   * `enabled: !!communityId`, so with no arguments it never fired — no request,
   * no console error — and `submitResponse` returned "Not authenticated"
   * before touching the database. Every member who filled this in would have
   * been told "Could not save your responses. Please try again", and trying
   * again would never have worked. Caught by an audit before anybody saw it.
   *
   * `communityId` is only for the CACHE KEY and for a HIVE's own check-ins;
   * this survey belongs to no HIVE and `submitResponse` now files it as such
   * whatever HIVE the reader happens to be standing in.
   */
  const { loading: authLoading, profile, communityId } = useAuth();
  const skin = usePageSkin();
  const { myResponses, submitResponse } = useSurveys(communityId ?? undefined, profile?.id);

  const [survey, setSurvey] = useState<Survey | null>(null);
  const [state, setState] = useState<'looking' | 'ready' | 'none' | 'broken'>('looking');

  useEffect(() => {
    if (authLoading || !profile) return;
    let cancelled = false;

    void (async () => {
      // The open HIVE-Wide check-in. Looked UP rather than carried in the
      // address, so next month's row answers the link she has already texted
      // people — an id in a URL is a link that expires quietly.
      /**
       * There is more than one HIVE-Wide check-in now.
       *
       * This used to take the soonest active row with no HIVE, which was safe
       * while End of the month was the only one. The merged "Before we meet"
       * (2026-09-04) also belongs to no HIVE, so the bare query would hand
       * whichever happened to be due first — and this screen would quietly
       * open the wrong check-in. It asks for the one it is named after.
       */
      const { data, error } = await supabase
        .from('surveys')
        .select('*')
        .is('community_id', null)
        .eq('is_active', true)
        .ilike('title', '%end of the month%')
        .order('due_date', { ascending: true })
        .limit(1);

      if (cancelled) return;
      // Not-loaded, empty and failed are three different states, and only one
      // of them gets the reassuring copy. Dropping `error` collapsed a network
      // failure into "nothing has gone wrong", which is the worst of the three
      // things this screen could say.
      if (error) { setState('broken'); return; }
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
    const result = await submitResponse(survey.id, answers);
    if (result.error) return result;

    /**
     * The email-or-text answer has a real destination, and it is not this
     * survey's answer blob.
     *
     * `profiles.contact_pref` (migration 223) is what Admin reads to tell Nat
     * who wants a text. Left in `answers.q_contact` it would be a display
     * string nobody reads — the "question with nowhere to go" this project
     * keeps having to delete. So the answer is copied to the column it belongs
     * in, and a failure there does not fail the check-in: the rest of what
     * they wrote matters more than this one field.
     */
    const said = answers.q_contact;
    const pref = typeof said === 'string'
      ? ({ Email: 'email', Text: 'text', 'Either is fine': 'either' } as Record<string, string>)[said]
      : undefined;
    if (pref && profile?.id) {
      await (supabase as any)
        .from('profiles')
        .update({ contact_pref: pref })
        .eq('id', profile.id);
    }
    return result;
  }, [survey, submitResponse, profile?.id]);

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
      {state === 'broken' ? (
        <Text
          style={{ fontFamily: 'Lato_700Bold', fontSize: 14, lineHeight: 21, color: '#c0392b', textAlign: 'center' }}
        >
          This did not load, so it is not telling you there is nothing here. Have another go in a
          minute.
        </Text>
      ) : state === 'none' ? (
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
