import { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../lib/hooks/useAuth';
import { usePageSkin } from '../../../lib/pageSkin';

/**
 * The short way into End of the month: app.the-hive.app/endofmonth
 *
 * One link, everybody, whichever HIVEs you are in. Nat, 2026-09-02, writing the
 * text she is about to send: *"we need one singular End of the month check-in
 * survey. We need to make that, cos that's what I'll send out to everyone."*
 *
 * It looks the survey UP rather than carrying its id, so next month's row is
 * reached by the same link she has already texted people. A link with an id in
 * it is a link that expires quietly.
 *
 * Signed out, `authReturnTo` carries `/endofmonth` through login and lands back
 * here — the link goes to twenty-odd people and some of them will not be signed
 * in on the phone they read it on.
 */
export default function EndOfMonthShortLink() {
  const router = useRouter();
  const { loading, communityId } = useAuth();
  const skin = usePageSkin();
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (loading) return;
    let cancelled = false;

    void (async () => {
      // The open HIVE-Wide check-in — `community_id is null` is what makes it
      // everybody's (migration 225). Soonest due date wins, so a stale row left
      // active cannot shadow this month's.
      const { data, error } = await supabase
        .from('surveys')
        .select('id')
        .is('community_id', null)
        .eq('is_active', true)
        .order('due_date', { ascending: true })
        .limit(1);

      if (cancelled) return;
      const survey = (data ?? [])[0] as { id: string } | undefined;
      if (error || !survey) {
        // Says so rather than dumping somebody on Home wondering what the link
        // was for.
        setMissing(true);
        return;
      }
      router.replace({
        pathname: '/hive',
        params: { openSurveyId: survey.id, ...(communityId ? { hive: communityId } : {}) },
      } as never);
    })();

    return () => { cancelled = true; };
  }, [loading, communityId, router]);

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: skin.page, padding: 24 }}>
      {missing ? (
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
