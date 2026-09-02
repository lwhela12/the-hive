import { useEffect } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '../../../lib/hooks/useAuth';
import { usePageSkin } from '../../../lib/pageSkin';
import { shortLinkSlug } from '../../../lib/hiveShortLink';

/**
 * The short way into the HALFWAY check-in: app.the-hive.app/halfway/og
 *
 * Nat, 2026-09-02, writing three group texts by hand: *"one for OG 1/2 way
 * check in/newsletter, one for pro 1/2 way check in/newsletter."* The only
 * short link that existed was `/checkin/og`, and that one lands on the
 * BEFORE-A-MEETING tune-up — a different flow, at a moment three weeks from
 * OG's meeting, and for Production a flow that is deliberately shut and would
 * have answered "coming soon" to five people she had just texted.
 *
 * The real address is `/monthly-tuneup?mode=midpoint&hive=<uuid>`, which is
 * eighty characters of nothing a person can read. So the halfway check-in gets
 * the name Nat says out loud, the same way `/checkin/og` did: URL, screen and
 * her words all match, because she clicks links rather than pasting them.
 *
 * This only translates. Membership, whether the halfway flow is open for this
 * HIVE, and which HIVE you land in are all still decided by the tune-up
 * itself — `hasHalfwayTuneup` gates it there, and fails closed. Signed out,
 * `authReturnTo` carries `/halfway/og` through login, query string included.
 */
export default function HalfwayShortLinkScreen() {
  const router = useRouter();
  const { hive } = useLocalSearchParams<{ hive?: string | string[] }>();
  const { memberships, loading } = useAuth();
  const skin = usePageSkin();

  const { asked, slug: wantedSlug } = shortLinkSlug(hive);

  useEffect(() => {
    if (loading) return;
    // An id in the address still works — the tune-up has always taken ids.
    const byId = memberships.find((m) => m.community_id === asked);
    const bySlug = memberships.find((m) => m.community.slug === wantedSlug);
    const match = byId ?? bySlug;
    router.replace(
      match
        ? ({
            pathname: '/monthly-tuneup',
            params: { hive: match.community_id, mode: 'midpoint' },
          } as never)
        // Not a HIVE this person is in — the tune-up answers that honestly for
        // whichever HIVE they ARE in, which beats a dead end that says nothing.
        : ({ pathname: '/monthly-tuneup', params: { mode: 'midpoint' } } as never)
    );
  }, [loading, memberships, asked, wantedSlug, router]);

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: skin.page }}>
      <ActivityIndicator color={skin.gold} />
      <Text style={{ fontFamily: 'Lato_400Regular', color: skin.inkSoft, fontSize: 14, marginTop: 12 }}>
        Opening your halfway check-in…
      </Text>
    </View>
  );
}
