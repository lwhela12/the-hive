import { useEffect } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '../../../lib/hooks/useAuth';
import { usePageSkin } from '../../../lib/pageSkin';
import { shortLinkSlug } from '../../../lib/hiveShortLink';

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
        Opening End of the month…
      </Text>
    </View>
  );
}
