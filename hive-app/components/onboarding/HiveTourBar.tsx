import { useEffect, useState } from 'react';
import { Pressable, Text, View, useWindowDimensions } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { useAuth } from '../../lib/hooks/useAuth';
import { useTourMarks } from '../../lib/hooks/useTourMarks';
import { accentOnDark, accentWash, hiveAccent, hiveDisplayName } from '../../lib/hiveBrand';
import { usePageSkin } from '../../lib/pageSkin';

/**
 * The welcome tour — a bar that walks a brand-new member around the real app.
 *
 * Nat, 2026-08-11: "lets make an onboarding wizard for each HIVE... it's
 * skippable & never comes back." And earlier: "an 'onboarding wizard' kinda
 * thing... that clicks you around everywhere?"
 *
 * "Clicks you around everywhere" is the design. This is not a slideshow about
 * the app — each Next actually navigates to the next real screen, so by the
 * end the member has stood in all five places, with the live page above the
 * bar the whole time. Five stops: Home, Profile, Members, Boards, Clive.
 *
 * What it deliberately is NOT:
 * - Not modal. No overlay, no spotlight, no dimming. The bar sits above the
 *   breadcrumb strip and the member can tap anything themselves at any time.
 *   Wandering off mid-tour is fine — the bar just holds its step, and the
 *   next Next continues from there.
 * - Not per-HIVE in content. The steps and sentences are the same everywhere;
 *   the HIVE's own name and accent colour are the personalisation. No
 *   OG-specific rituals — a Tech HIVE member gets exactly the same walk.
 *
 * When it appears and disappears is `useTourMarks`'s business: it starts only
 * from a fresh invite-accept, and finishing or skipping writes a database row
 * that keeps it away forever, on every device.
 */

type TourStep = {
  route: string;
  title: string;
  /** One short warm sentence. The HIVE's display name is the only variable. */
  line: (hiveName: string) => string;
};

// The five stops, in walking order. Routes are the same ones the rail and the
// breadcrumb strip use (lib/navigation.ts) — Clive's is '/', the app's index.
const TOUR_STEPS: TourStep[] = [
  {
    route: '/hive',
    title: 'Home',
    line: (name) => `This is ${name}'s Home — the daily question lives up top.`,
  },
  {
    route: '/profile',
    title: 'Profile',
    line: () => "Put a face on — your profile tracks what's still blank for you.",
  },
  {
    route: '/members',
    title: 'Members',
    line: () => "The people you've joined — have a read.",
  },
  {
    route: '/board',
    title: 'Boards',
    line: () => 'Where the conversations live.',
  },
  {
    route: '/',
    title: 'Clive',
    line: () => "Stuck? Ask Clive anything — he's behind the sparkles.",
  },
];

export function HiveTourBar() {
  const { tourCommunityId, finishTour, skipTour } = useTourMarks();
  const { memberships, community } = useAuth();
  const skin = usePageSkin();
  const router = useRouter();
  const pathname = usePathname();
  const { width } = useWindowDimensions();
  const [stepIndex, setStepIndex] = useState(0);
  // The words do not advance until the requested page is genuinely on screen.
  // Nat found Step 2 / Profile talking over Home because the old handler moved
  // this number before Expo Router had actually moved the page.
  const [requestedStepIndex, setRequestedStepIndex] = useState<number | null>(null);

  // A new tour starts on the real Home page. The bar lives outside Tabs, so it
  // can survive the route change, but its sentence must always describe the
  // page underneath it.
  useEffect(() => {
    if (!tourCommunityId) return;
    setStepIndex(0);
    setRequestedStepIndex(null);
    if (pathname !== TOUR_STEPS[0].route) router.replace(TOUR_STEPS[0].route as never);
  }, [tourCommunityId]);

  // Navigation is the proof that a step happened. Only after the URL matches
  // the requested stop do the number and sentence move forward. A route that
  // stalls therefore leaves the current, truthful step in place instead of
  // describing Profile over Home (or any later mismatch).
  useEffect(() => {
    if (requestedStepIndex === null) return;
    if (pathname !== TOUR_STEPS[requestedStepIndex].route) return;
    setStepIndex(requestedStepIndex);
    setRequestedStepIndex(null);
  }, [pathname, requestedStepIndex]);

  if (!tourCommunityId) return null;

  // The tour belongs to the HIVE that was just joined, so its name and colour
  // come from that membership — not from wherever the member happens to be
  // standing right now. If they wander up to HIVE-Wide mid-tour the bar keeps
  // wearing its own HIVE's accent, which is what tells them whose tour it is.
  const tourCommunity =
    memberships.find((m) => m.community_id === tourCommunityId)?.community ??
    (community?.id === tourCommunityId ? community : null);
  const hiveName = hiveDisplayName(tourCommunity?.name);
  const accent = hiveAccent(tourCommunity);
  // The accent as ink: lifted on the night sky, as-is on cream. Same treatment
  // every other accent-coloured word in the app gets (lib/hiveBrand.ts).
  const accentInk = skin.dark ? accentOnDark(accent) : accent;

  const step = TOUR_STEPS[stepIndex];
  const isLastStep = stepIndex === TOUR_STEPS.length - 1;
  // Room for the sentence AND the buttons side by side, or not. A phone gets
  // the words on their own line with the controls beneath.
  const narrow = width < 560;

  const handleNext = () => {
    if (isLastStep) {
      // "You're all set 🐝" — the walk is done, and the mark keeps it done.
      finishTour();
      return;
    }
    const next = stepIndex + 1;
    setRequestedStepIndex(next);
    // Replace rather than stack the five tour stops behind the Back button.
    // The effect above advances the words only after this route is visible.
    router.replace(TOUR_STEPS[next].route as never);
  };

  return (
    <View
      // Floating, in the furniture sense: a rounded card sitting just above
      // the breadcrumb strip, on the page, never over a member's content as an
      // overlay would be. All react-native primitives, so web and iOS draw the
      // same bar.
      style={{
        marginHorizontal: 10,
        marginBottom: 8,
        borderRadius: 14,
        borderWidth: 1.5,
        borderColor: accentInk,
        backgroundColor: skin.dark ? '#0B0B12' : skin.card,
        paddingVertical: 10,
        paddingHorizontal: 14,
        gap: narrow ? 8 : 0,
        flexDirection: narrow ? 'column' : 'row',
        alignItems: narrow ? 'stretch' : 'center',
      }}
    >
      <View style={{ flex: narrow ? undefined : 1, gap: 2 }}>
        <Text
          style={{
            fontFamily: 'Lato_700Bold',
            fontSize: 11,
            letterSpacing: 1.2,
            textTransform: 'uppercase',
            color: accentInk,
          }}
        >
          {`Step ${stepIndex + 1} of ${TOUR_STEPS.length} · ${step.title}`}
        </Text>
        <Text
          style={{
            fontFamily: 'Lato_400Regular',
            fontSize: 13.5,
            lineHeight: 19,
            color: skin.ink,
          }}
        >
          {step.line(hiveName)}
        </Text>
      </View>

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: narrow ? 'space-between' : 'flex-end',
          gap: 14,
          marginLeft: narrow ? 0 : 14,
        }}
      >
        {/* Skipping counts as done — it writes the same row finishing does,
            so the tour keeps its "never comes back" promise either way. */}
        <Pressable
          onPress={skipTour}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Skip the tour"
        >
          <Text
            style={{
              fontFamily: 'Lato_400Regular',
              fontSize: 13,
              color: skin.inkSoft,
              textDecorationLine: 'underline',
            }}
          >
            Skip the tour
          </Text>
        </Pressable>

        {/* The HIVE's own colour, not the shared gold Button — this bar is the
            one piece of chrome that belongs to a particular HIVE, and its
            accent is what says so. White lettering sits on every accent the
            same way it does on the invitation card's accept button. */}
        <Pressable
          onPress={handleNext}
          accessibilityRole="button"
          accessibilityLabel={
            isLastStep
              ? 'Finish the tour'
              : requestedStepIndex !== null
                ? `Opening ${TOUR_STEPS[requestedStepIndex].title}`
                : `Next: ${TOUR_STEPS[stepIndex + 1].title}`
          }
          style={({ pressed }) => ({
            paddingVertical: 9,
            paddingHorizontal: 18,
            borderRadius: 999,
            backgroundColor: pressed ? accentWash(accent, 0.75) : accent,
          })}
        >
          <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 14, color: '#ffffff' }}>
            {isLastStep
              ? "You're all set 🐝"
              : requestedStepIndex !== null
                ? `Opening ${TOUR_STEPS[requestedStepIndex].title}…`
                : 'Next'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
