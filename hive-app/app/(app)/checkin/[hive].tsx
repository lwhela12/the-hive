import { useEffect } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '../../../lib/hooks/useAuth';
import { usePageSkin } from '../../../lib/pageSkin';
import { shortLinkSlug } from '../../../lib/hiveShortLink';

/**
 * The short way in: app.the-hive.app/checkin/og
 *
 * Nat, 2026-08-20, writing the text message that goes out alongside the
 * meeting-night email: *"if there's a shorter hyperlink that I can put in
 * there, that would — I think I would rather have that."* The real one is
 * `/monthly-tuneup?hive=e38d99a8-3aa8-4ace-8381-e56bb9991cf9`, which is
 * seventy-odd characters of nothing a person can read, and in a text message
 * it wraps into three lines of noise that looks like a scam.
 *
 * So the HIVE gets a name in the address instead of an id. The name is the one
 * she says out loud — `og`, `tech`, `show`, `pro` (`lib/hiveShortLink.ts`,
 * shared with `/halfway/<hive>`) — because a link she has to look up
 * is a link she will not use (the same reason the URL, the screen and the words
 * for a thing all have to match).
 *
 * This only translates. Everything that decides anything — is this person a
 * member, is the check-in open, which HIVE do they land in — still happens on
 * the tune-up itself, which this hands the real id to. Signed out, the layout
 * above carries `/checkin/og` through login and lands here afterward.
 */

export default function CheckInShortLinkScreen() {
  const router = useRouter();
  const { hive } = useLocalSearchParams<{ hive?: string | string[] }>();
  const { memberships, loading } = useAuth();
  const skin = usePageSkin();

  const { asked, slug: wantedSlug } = shortLinkSlug(hive);

  useEffect(() => {
    if (loading) return;
    // An id in the address still works — old links carry one, and the tune-up
    // has always taken ids. Only a name needs translating.
    const byId = memberships.find((m) => m.community_id === asked);
    const bySlug = memberships.find((m) => m.community.slug === wantedSlug);
    const match = byId ?? bySlug;
    router.replace(
      match
        ? ({ pathname: '/monthly-tuneup', params: { hive: match.community_id } } as never)
        // Not a HIVE this person is in — the tune-up answers that honestly for
        // whichever HIVE they ARE in, which beats a dead end that says nothing.
        : ('/monthly-tuneup' as never)
    );
  }, [loading, memberships, asked, wantedSlug, router]);

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: skin.page }}>
      <ActivityIndicator color={skin.gold} />
      <Text style={{ fontFamily: 'Lato_400Regular', color: skin.inkSoft, fontSize: 14, marginTop: 12 }}>
        Opening your check-in…
      </Text>
    </View>
  );
}
