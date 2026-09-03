import { useEffect, useRef } from 'react';
import { Tabs, usePathname, useRouter } from 'expo-router';
import { Text, View, ImageSourcePropType, Platform, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../lib/hooks/useAuth';
import { useNotifications } from '../../lib/hooks/useNotifications';
import { useTotalUnreadDMs } from '../../lib/hooks/useTotalUnreadDMs';
import { useWebAppDisplayMode } from '../../lib/hooks/useWebAppDisplayMode';
import { AppUpdateBanner } from '../../components/ui/AppUpdateBanner';
import { PathFooter } from '../../components/navigation/PathFooter';
import { PathTrailProvider } from '../../lib/hooks/usePathTrail';
import { CelebrationOverlay } from '../../components/ui/CelebrationOverlay';
import { HivePicker } from '../../components/hive/HivePicker';
import { SideRail } from '../../components/navigation';
import { getLastAppPathAsync, getLastAppTabName, saveLastAppPath } from '../../lib/navigationState';
import { routeDemandsWholeHive, routeLivesAtWholeHive } from '../../lib/navigation';
import { currentReturnTo } from '../../lib/authReturnTo';
import { clearBoardNavigationState } from '../../lib/boardNavigation';
import { resetHomeNavigationState } from '../../lib/homeNavigation';
import { registerFeedbackCaptureTarget } from '../../lib/feedbackCapture';

import { ArrivalScreen, markAppArrived } from '../../components/ui/ThinkingBee';
import { HiveTourBar } from '../../components/onboarding/HiveTourBar';
import { useSignedAvatar } from '../../components/ui/Avatar';
import { usePageSkin } from '../../lib/pageSkin';
function TabIcon({
  icon,
  imageSource,
  customIcon,
  label,
  focused,
  isCircular,
  badge = 0,
  compact,
}: {
  icon?: string;
  imageSource?: ImageSourcePropType;
  customIcon?: React.ReactNode;
  label: string;
  focused: boolean;
  isCircular?: boolean;
  badge?: number;
  compact?: boolean;
}) {
  const displayLabel = label;
  const iconSize = compact ? 22 : 28;
  const iconRadius = isCircular ? iconSize / 2 : 6;
  const tooltipProps = Platform.OS === 'web'
    ? ({ title: label } as any)
    : {};

  return (
    <View
      {...tooltipProps}
      accessibilityLabel={label}
      className={`items-center justify-center ${compact ? 'pt-1' : 'pt-2'}`}
    >
      <View>
        {customIcon ? (
          customIcon
        ) : imageSource ? (
          <Image
            source={imageSource}
            style={{ width: iconSize, height: iconSize, borderRadius: iconRadius }}
            contentFit="cover"
            cachePolicy="memory-disk"
          />
        ) : (
          <Text className={compact ? 'text-xl' : 'text-2xl'}>{icon}</Text>
        )}
        {badge > 0 ? (
          <View
            className="absolute -top-1 -right-2 bg-gold rounded-full min-w-[16px] h-4 px-1 items-center justify-center"
          >
            <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-white text-[10px]">
              {badge > 99 ? '99+' : badge}
            </Text>
          </View>
        ) : null}
      </View>
      <Text
        numberOfLines={2}
        style={{
          fontFamily: focused ? 'Lato_700Bold' : 'Lato_400Regular',
          fontSize: compact ? 9 : 12,
          lineHeight: compact ? 10 : 14,
          textAlign: 'center',
        }}
        className={`${compact ? 'mt-0.5' : 'mt-1'} ${
          focused ? 'text-gold' : 'text-charcoal/50'
        }`}
      >
        {displayLabel}
      </Text>
    </View>
  );
}

export default function AppLayout() {
  const { session, communityId, communityRole, profile, loading, hivePickerOpen, wholeHive, switchCommunity, openHivePicker, enterWholeHive } = useAuth();
  // The colour of wherever this reader is standing. The layout needs it as much
  // as the pages do — see the note on `sceneStyle` further down.
  const skin = usePageSkin();
  // Signed here in the body rather than inside `tabBarIcon`, which is a plain
  // render callback and not a component — a hook cannot live in one. This and
  // Home's daily-question strip were the last two faces drawn from the stored
  // address, and closing them is what lets the avatars bucket be private.
  const signedOwnAvatar = useSignedAvatar(profile?.avatar_url);
  const router = useRouter();
  const pathname = usePathname();
  /**
   * You cannot be at HIVE-Wide and inside one HIVE's meeting at the same time.
   *
   * Nat, 2026-08-21, having opened a link: *"it look slike i'm in HIVE wide &
   * in a meeting, thats not good"* — and then the same again one screen
   * deeper, an OG meeting summary with HIVE-Wide written across the top of it
   * and in the breadcrumb underneath.
   *
   * `atWholeHive: 'hidden'` was only ever read by the rail, when choosing
   * which rows to draw. Hiding a row is not closing a door: a link, a
   * bookmark, the back button and this exact deep link with a `?code=` on it
   * all arrive without passing a menu. Every HIVE-only page had the hole, not
   * just this one.
   *
   * Standing DOWN is the right answer rather than bouncing her out. The page
   * was already showing the right HIVE's data — `communityId` never stopped
   * pointing at OG — so the only thing that was wrong was the frame around it.
   * Stepping into that HIVE keeps her where she meant to be and makes the
   * heading tell the truth. With no HIVE underneath, the picker asks.
   */
  useEffect(() => {
    if (loading || !session) return;
    if (!wholeHive) return;
    if (routeLivesAtWholeHive(pathname)) return;

    if (communityId) {
      void switchCommunity(communityId);
    } else {
      openHivePicker();
    }
  }, [loading, session, wholeHive, pathname, communityId, switchCommunity, openHivePicker]);

  /**
   * And the same rescue standing UP.
   *
   * The guard above only ever handled one direction. Admin lives above the
   * HIVEs — its header says HIVE-Wide and it manages all of them — but arriving
   * from inside Tech HIVE left `wholeHive` false, so the rail highlighted Tech
   * and the footer read "Tech HIVE › Admin" beneath a page titled HIVE-Wide.
   * Nat, 2026-09-02: *"I should be in HIVE-Wide admin and it still looks like
   * I'm in Tech HIVE on the left."*
   *
   * The rail had always stepped up before opening Admin. A link, a bookmark,
   * the back button and `router.push` do not pass the rail — exactly the hole
   * the guard above was written to close, in the other direction.
   */
  useEffect(() => {
    if (loading || !session) return;
    if (wholeHive) return;
    if (!routeDemandsWholeHive(pathname)) return;
    enterWholeHive();
  }, [loading, session, wholeHive, pathname, enterWholeHive]);

  const isAdmin = communityRole === 'admin' || profile?.role === 'admin';
  const { width, height } = useWindowDimensions();
  // Use mobile layout for narrow screens (< 768px) regardless of platform
  const useMobileLayout = width < 768;
  const useImmersiveProfileGarden = pathname === '/profile' && width > height && height < 540;
  const { isBrowserMode } = useWebAppDisplayMode();
  // The bottom bar is gone (2026-08-03) — the rail carries navigation now. The
  // per-screen tabBarIcon definitions below are left in place deliberately:
  // Tabs still owns routing, and they cost nothing while the bar is hidden.
  // Ripping them out is a separate tidy, not part of changing the furniture.
  const useBrowserCompactTabs = Platform.OS === 'web' && useMobileLayout && isBrowserMode;
  const tabIconSize = useMobileLayout ? (useBrowserCompactTabs ? 20 : 22) : 26;
  const { totalUnread: totalUnreadDMs } = useTotalUnreadDMs(communityId ?? undefined, profile?.id);
  const restoredNativePathRef = useRef(false);
  const feedbackCaptureTargetRef = useRef<View>(null);

  useEffect(() => {
    registerFeedbackCaptureTarget(feedbackCaptureTargetRef);
    return () => registerFeedbackCaptureTarget(null);
  }, []);

  // Where the rail STARTS on a device that has never picked a size.
  //
  // The rail has three sizes as of 2026-08-06 — big, medium, small — and it owns
  // and remembers which one a person picked (`components/navigation/SideRail`).
  // This boolean is the opening offer and nothing more: true starts at big, the
  // full sidebar, and false starts at medium, the narrow rail with a small name
  // under every picture. Once somebody has chosen a size, their choice wins.
  //
  // A wide screen starts big, because icons alone are a quiz and the whole point
  // of the rail is seeing where everything is without hunting (Nat 2026-08-03).
  // A phone starts medium, because there the big rail covers the page rather
  // than sitting beside it, and opening onto a menu instead of the app would be
  // a worse first second. Nobody is ever STARTED at small.
  //
  // It reads the same `useMobileLayout` every other piece of furniture here
  // reads. It used to ask `window.innerWidth` on its own, which said the same
  // thing in a browser and said "phone" to every iPad in the native app.
  //
  // The rail no longer reports back. It used to flip a state variable here every
  // time the phone drawer opened or shut, so the whole shell — Tabs and all —
  // re-rendered to keep a boolean truthful that only the rail ever read. The one
  // thing the shell needed it for was dimming the page behind an open drawer,
  // and the rail draws that itself now.
  const railStartsBig = !useMobileLayout;

  // Initialize push notification listeners and state (no permission prompt on load)
  useNotifications({ autoRequestPermission: false });

  // -------------------------------------------------------------------------
  // "The app is here" — the moment the boot splash has been waiting for.
  //
  // This layout is the shell: the rail, the footer, the page's own floor. When
  // it draws, there is something to look at, which is the whole test the splash
  // in public/index.html applies. Everything before this — the typefaces, the
  // saved sign-in, the download of this screen's own code — happens underneath a
  // bee that never stops flying.
  //
  // One animation frame later, so the shell is genuinely painted rather than
  // merely rendered. See markAppArrived() in components/ui/ThinkingBee.tsx.
  // -------------------------------------------------------------------------
  const shellIsUp = !loading && !!session && !!communityId;
  useEffect(() => {
    if (!shellIsUp) return;
    const frame = requestAnimationFrame(markAppArrived);
    return () => cancelAnimationFrame(frame);
  }, [shellIsUp]);

  useEffect(() => {
    if (Platform.OS !== 'web' && !restoredNativePathRef.current) return;

    if (!loading && session && communityId) {
      saveLastAppPath(pathname);
    }
  }, [loading, session, communityId, pathname]);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    if (restoredNativePathRef.current || loading || !session || !communityId) return;
    restoredNativePathRef.current = true;

    let cancelled = false;
    getLastAppPathAsync().then((lastPath) => {
      if (cancelled || pathname !== '/hive' || lastPath === pathname) return;

      // lastPath is validated against the APP_PATHS whitelist in
      // navigationState.ts, so any non-home value can be restored directly —
      // including meeting tools like /monthly-tuneup (a half-finished
      // check-in must survive an app resume).
      if (lastPath === '/index') {
        router.replace('/');
      } else if (lastPath !== '/hive') {
        router.replace(lastPath as never);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [communityId, loading, pathname, router, session]);

  // Guard: redirect to login/join if auth resolves without a valid session.
  // This runs for any deep link that bypasses the index.tsx routing logic
  // (e.g., opening /board directly from a home screen bookmark).
  useEffect(() => {
    if (loading) return;
    if (!session) {
      // Carry the destination through login. A texted link lands here signed
      // out just as often as signed in, and dropping it sent people to Home.
      const returnTo = currentReturnTo(pathname);
      router.replace(
        returnTo
          ? ({ pathname: '/(auth)/login', params: { returnTo } } as never)
          : '/(auth)/login'
      );
    } else if (!communityId) {
      router.replace('/join');
    }
  }, [loading, session, communityId, pathname]);

  // Show a spinner while auth is resolving rather than flashing empty tabs.
  //
  // Wearing the reader's own skin rather than cream: this used to be a hard
  // `#faf8f3`, which is the HIVE page colour, so somebody standing at HIVE-Wide
  // got a pale card thrown over a near-black app for as long as auth took.
  //
  // On the way in it draws no bee, because the boot splash is still on top with
  // one. Later — switching HIVE, signing out — the splash is long gone and
  // ArrivalScreen draws the bee itself.
  if (!shellIsUp) return <ArrivalScreen background={skin.page} />;

  // "Which hive?" stands in front of the whole app rather than living at its own
  // address, because the tabs underneath belong to whichever hive you pick — and
  // because the drawer's Clive link already owns the "/" route.
  if (hivePickerOpen) {
    return <HivePicker />;
  }

  return (
    <PathTrailProvider>
    <View style={{ flex: 1 }}>
      {/* "Fresh honey" bar — web only, shows on every tab when a new build ships */}
      <AppUpdateBanner />
      {/* The rail and the pages, side by side. The tab bar is hidden rather than
          removed: Tabs still owns the routing and the per-screen state, and
          fighting that would mean rebuilding navigation instead of re-dressing
          it (Nat 2026-08-03). */}
      <View style={{ flex: 1, flexDirection: 'row' }}>
      {!useImmersiveProfileGarden ? (
        <SideRail
          startBig={railStartsBig}
          unreadDMCount={totalUnreadDMs}
        />
      ) : null}
      <View style={{ flex: 1 }}>
      {/* The welcome tour for a just-joined member, worn as a HEADER — Nat
          tried it as a bottom bar on her laptop first and asked for it up
          top (2026-08-11). Mounted once in the shell, above the tabs, so it
          survives the navigation its own Next button does. For everybody who
          is not mid-tour (almost everybody, almost always) it renders
          nothing. See lib/hooks/useTourMarks.ts for when it starts. */}
      <HiveTourBar />
      {/* Only routed page content is capturable. The rail, update banner, tour,
          footer, permission UI, and overlays stay outside this explicit ref. */}
      <View ref={feedbackCaptureTargetRef} collapsable={false} style={{ flex: 1 }}>
      <Tabs
        initialRouteName={getLastAppTabName()}
        // No tab bar AT ALL — not a hidden one. `tabBarStyle: display 'none'`
        // (below, kept for belt-and-braces) does not remove the bar in this
        // navigator: it repositions it as an absolute layer and slides it
        // off-screen, and the slide's math includes the phone's home-indicator
        // inset — which left a 34pt sliver of blank bar lying OVER the bottom
        // of every page on a phone. That sliver was the "plain white stripe
        // pasted over the to do list" Nat chased across four builds on
        // 2026-08-25, and why Home's scroll carried 104pt of mystery bottom
        // padding (someone had already met this bar without recognising it).
        // The rail is this app's navigation; nothing here has ever needed the
        // bar to exist.
        tabBar={() => null}
        screenOptions={{
          headerShown: false,
          // ------------------------------------------------------------------
          // The floor under every page, in the colour of the place you are in.
          //
          // This is what caused the white flash on a first visit to Boards
          // (Nat 2026-08-06: "the first time you're in HIVE wide & click boards
          // you get a flash of a white screen"). React Navigation gives every
          // screen a container painted with the navigation theme's background,
          // and nobody had ever set that theme — so it was the stock
          // `rgb(242,242,242)`, a near-white grey, sitting directly behind a
          // near-black HIVE-Wide page.
          //
          // It only ever showed on the FIRST visit because tabs are lazy: a tab
          // you have never opened is not in the tree at all, so pressing it
          // creates that container, and the grey is what fills it for the frames
          // it takes the screen to mount, lay out its list and start its globe.
          // Come back later and the screen is already mounted, so there is
          // nothing to fill.
          //
          // Naming the colour here fixes it at the source rather than covering
          // it: the container is the page's own colour from its very first
          // frame, so there is no wrong colour to see. It also gives the right
          // floor to any screen that is still arriving. (When routes were
          // split per screen — asyncRoutes, on briefly around 2026-08-06 —
          // this floor is what made the wait invisible. The split was turned
          // off 2026-08-07 because each deploy renamed the pieces and stranded
          // returning phones; scripts/verify-web-export.mjs now enforces the
          // single bundle. The floor still matters for lazy tabs.)
          //
          // AND IT STILL FLASHED — the other half, found 2026-08-06.
          //
          // This line was right and the colour going into it was wrong. `skin`
          // is `usePageSkin()`, which asks `wholeHive`, and on a fresh tab
          // `wholeHive` was false until the profile came back from Supabase. So
          // for the whole of that wait this floor was `#faf8f3` — cream, which
          // reads as white — and then the answer landed and the app went
          // near-black. `wholeHive` is seeded from where the person is about to
          // land now; see headingTo() at the top of app/_layout.tsx.
          //
          // Ruled out along the way, so nobody hunts them again: the lazy tab
          // container (`MaybeScreenContainer`, flex only, no colour), the screen
          // wrapper (`MaybeScreen`, absoluteFill only), `SafeAreaProviderCompat`
          // (flex only), and the suspense fallback for a code-split route, which
          // is `null` in a production build — expo-router's
          // build/views/SuspenseFallback.js only draws its "Bundling…" toast in
          // development. Every one of those is transparent, so this scene style
          // and the stack's `contentStyle` really are the only two surfaces.
          // ------------------------------------------------------------------
          sceneStyle: { backgroundColor: skin.page },
          // Seven tabs at about 55px each had run out of room, and every new
          // feature made it worse. The rail scrolls, so it never does.
          tabBarStyle: { display: 'none' },
          tabBarItemStyle: useMobileLayout
            ? { minWidth: 0, paddingHorizontal: 0, paddingVertical: 0 }
            : undefined,
          tabBarShowLabel: false,
          tabBarHideOnKeyboard: true,
        }}
      >
        <Tabs.Screen
          name="hive"
          listeners={{
            tabPress: () => {
              resetHomeNavigationState();
            },
          }}
          options={{
            title: 'Home',
            tabBarAccessibilityLabel: 'Home',
            tabBarIcon: ({ focused }) => (
              <TabIcon
                customIcon={
                  <Ionicons
                    name="home-outline"
                    size={tabIconSize}
                    color={focused ? '#bd9348' : '#2d2d2d80'}
                  />
                }
                label="Home"
                focused={focused}
                compact={useMobileLayout}
              />
            ),
          }}
        />
        {/* Clive chat */}
        <Tabs.Screen
          name="index"
          options={{
            title: 'Clive',
            tabBarAccessibilityLabel: 'Clive',
            tabBarIcon: ({ focused }) => (
              <TabIcon
                customIcon={
                  <Ionicons
                    name="sparkles-outline"
                    size={tabIconSize}
                    color={focused ? '#bd9348' : '#2d2d2d80'}
                  />
                }
                label="Clive"
                focused={focused}
                compact={useMobileLayout}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="members"
          options={{
            title: 'Members',
            tabBarAccessibilityLabel: 'Members',
            tabBarIcon: ({ focused }) => (
              <TabIcon
                customIcon={
                  <Ionicons
                    name="people-outline"
                    size={tabIconSize}
                    color={focused ? '#bd9348' : '#2d2d2d80'}
                  />
                }
                label="Members"
                focused={focused}
                compact={useMobileLayout}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="board"
          listeners={{
            tabPress: () => {
              clearBoardNavigationState(communityId);
            },
          }}
          options={{
            title: 'Boards',
            tabBarAccessibilityLabel: 'Boards',
            tabBarIcon: ({ focused }) => (
              <TabIcon
                customIcon={
                  <Ionicons
                    name="grid-outline"
                    size={tabIconSize}
                    color={focused ? '#bd9348' : '#2d2d2d80'}
                  />
                }
                label="Boards"
                focused={focused}
                compact={useMobileLayout}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="messages"
          options={{
            title: 'Messages',
            tabBarAccessibilityLabel: 'Messages',
            tabBarIcon: ({ focused }) => (
              <TabIcon
                customIcon={
                  <Ionicons
                    name="chatbubble-ellipses-outline"
                    size={tabIconSize}
                    color={focused ? '#bd9348' : '#2d2d2d80'}
                  />
                }
                label="Messages"
                focused={focused}
                badge={totalUnreadDMs}
                compact={useMobileLayout}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="meetings"
          options={{
            title: 'Meetings',
            tabBarAccessibilityLabel: 'Meetings',
            tabBarIcon: ({ focused }) => (
              <TabIcon
                customIcon={
                  <Ionicons
                    name="calendar-outline"
                    size={tabIconSize}
                    color={focused ? '#bd9348' : '#2d2d2d80'}
                  />
                }
                label="Meetings"
                focused={focused}
                compact={useMobileLayout}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: 'Profile',
            href: null,
            tabBarAccessibilityLabel: 'Profile',
            tabBarIcon: ({ focused }) => (
              <TabIcon
                icon="👤"
                imageSource={signedOwnAvatar ? { uri: signedOwnAvatar } : undefined}
                label="Profile"
                focused={focused}
                isCircular
                compact={useMobileLayout}
              />
            ),
          }}
        />
        <Tabs.Screen name="settings" options={{ title: 'Settings', href: null }} />
        <Tabs.Screen
          name="honey-pot"
          options={{
            title: 'Honey Pot',
            href: null,
          }}
        />
        <Tabs.Screen
          name="hive-wide"
          options={{
            title: 'HIVE-Wide',
            href: null,
          }}
        />
        {/* The shared boards. Reached from the rail under HIVE-Wide, not from
            the tab bar — there is already a Boards tab and it means yours. */}
        <Tabs.Screen
          name="hive-wide-boards"
          options={{
            title: 'HIVE-Wide Boards',
            href: null,
          }}
        />
        <Tabs.Screen
          name="arrival-board"
          options={{
            title: 'Arrival Board',
            href: null,
          }}
        />
        {/* The short way in — /checkin/og. It only translates a HIVE's name
            into its id and hands over to the tune-up, so it is never a tab. */}
        <Tabs.Screen
          name="checkin/[hive]"
          options={{
            title: 'Check in',
            href: null,
          }}
        />
        {/* The same door for the HALFWAY check-in — /halfway/og. A separate
            name because it is a separate flow, and because the name in the
            address has to be the one Nat says out loud. */}
        <Tabs.Screen
          name="halfway/[hive]"
          options={{
            title: 'End of the month',
            href: null,
          }}
        />
        {/* Where a check-in preview gets its go-ahead. Reached from the link
            in Nat's preview email — the link only opens this page; the send
            lives behind her login and behind a confirm. Never a tab. */}
        <Tabs.Screen
          name="approve/[hold]"
          options={{
            title: 'Send this check-in?',
            href: null,
          }}
        />
        <Tabs.Screen
          name="monthly-tuneup"
          options={{
            title: 'Before we meet',
            href: null,
          }}
        />
        <Tabs.Screen
          name="meeting-helper"
          options={{
            title: 'Meeting Helper',
            href: null,
          }}
        />
        <Tabs.Screen
          name="newsletter"
          options={{
            title: 'Newsletter Draft',
            href: null,
          }}
        />
        {/* The Buzz takes the slot Admin was using. Admin is two people and it
            lives one tap away in the menu; the newsletter is everybody, every
            month, and had no door at all (Nat 2026-08-01). */}
        <Tabs.Screen
          name="buzz"
          options={{
            title: 'Newsletter',
            tabBarAccessibilityLabel: 'Newsletter',
            tabBarIcon: ({ focused }) => (
              <TabIcon
                customIcon={
                  <Ionicons
                    name="newspaper-outline"
                    size={tabIconSize}
                    color={focused ? '#bd9348' : '#2d2d2d80'}
                  />
                }
                label="Newsletter"
                focused={focused}
                compact={useMobileLayout}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="admin"
          options={{
            title: 'Admin',
            href: null,
          }}
        />
      </Tabs>
      </View>
      {/* Finder's status bar, for the app. It belongs to the shell rather than
          to any page, so it is the same height everywhere, appears on screens
          nobody thought to add it to, and gives the composer at the bottom of
          a thread a floor to sit on instead of the window's edge (Nat
          2026-08-05). */}
      <PathFooter />

      {/* Confetti for a granted wish, over every tab. Mounted once, and mounted
          INSIDE the content column rather than beside it (Nat 2026-08-04: "he's
          crooked, we should make him more centered").

          He was centred — on the WINDOW. Sitting outside this row, the overlay
          spanned the rail as well as the page, so its middle was half the rail's
          width to the left of the middle of what you are actually reading. The
          particle burst had the same lean, for the same reason. In here it fills
          the page and nothing else, so it centres on the page. */}
      <CelebrationOverlay />
      </View>
      </View>

      {/* The sliding menu is gone (2026-08-03). It held the same list the rail
          holds, so keeping it meant two ways to the same eleven places and two
          lists to keep in step — which is exactly how Admin went missing from
          one of them last week. The rail is always there; nothing needs opening. */}
    </View>
    </PathTrailProvider>
  );
}
