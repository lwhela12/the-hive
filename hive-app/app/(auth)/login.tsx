import { useEffect, useState } from 'react';
import { View, Text, Pressable, Image, ActivityIndicator, Platform, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser';
import { StatusBar } from 'expo-status-bar';
import * as Linking from 'expo-linking';
import { router, useLocalSearchParams } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { sanitizeReturnTo } from '../../lib/authReturnTo';
import { showAlert } from '../../lib/showAlert';
import {
  getStoredItemAsync,
  setStoredItemAsync,
  removeStoredItemAsync,
} from '../../lib/webStorage';

WebBrowser.maybeCompleteAuthSession();

/* ---------------------------------------------------------------------------
   Naming the account you are about to sign in with — and then actually
   continuing as them.

   Nat, 2026-08-06, on her phone: "This has the option to sign in with a
   different account, but it doesn't show which account you're about to log in
   with, so how do you know if you want to log in with a different account?"
   She is right — "different" only means something next to a "current". So the
   screen remembers who signed in on THIS DEVICE last time and says it on the
   button, falling back to plain "Continue with Google" for a device that has
   never seen anybody.

   Later the same day, with that shipped: "This doubled up, because first it
   pre-filled me with which email I'm logging in with, but then the very next
   screen was like 'here, choose which one you want to sign in with'." The
   button promised to continue as one person and then handed her a list of
   eight accounts. A promise followed by a question is worse than either alone.

   The fix is Google's `login_hint`. Hand Google an address and it signs that
   person straight in with no chooser, so "Continue as X" continues as X.
   Supabase passes it through `signInWithOAuth`'s `options.queryParams`.
   --------------------------------------------------------------------------- */

/**
 * Where the address lives. Same device, same storage the session already uses.
 *
 * This holds the WHOLE address, because a mask cannot be a `login_hint` —
 * Google needs the real one or the chooser comes back. The privacy reason for
 * the mask is untouched by that: it was always about what a stranger can READ
 * off a borrowed phone, and the screen still renders two letters and the
 * provider (see `maskEmailForHint`). Nothing on the device shows the address.
 *
 * What this genuinely adds is a plaintext address in local storage. Weighed
 * honestly: while somebody is signed in, their address is already sitting in
 * the session token in the same storage, so the only new window is a device
 * whose session lapsed without an explicit log out — and reading it takes
 * developer tools, not a glance. The address also rides in the Google URL
 * during the redirect, which is inherent to the mechanism and lands only at
 * Google, who issued the address in the first place.
 */
const LAST_SIGN_IN_EMAIL_KEY = 'hive.last-sign-in-email';

/**
 * The key this screen used for the few hours it stored a mask instead. It is
 * cleared wherever the real one is, so no device keeps a value under a name
 * nothing reads any more. Reading a mask as if it were an address would send
 * "na•••@gmail.com" to Google as a login_hint and get a chooser back — the
 * exact bug this replaced.
 */
const LEGACY_MASKED_KEY = 'hive.last-sign-in';

/**
 * Turn nat@gmail.com into na•••@gmail.com, for the screen only.
 *
 * The privacy call, made deliberately: a HIVE is invitation only, so a full
 * address on the sign-in screen tells a borrowed or shared phone both who owns
 * it and that they are a member. Two letters and the provider are enough to
 * recognise your own address — which is the entire job — and are no use to a
 * stranger reading over a shoulder. The domain stays whole because the real
 * case for "which account" is somebody with a personal Google and a work one.
 *
 * The mask is a fixed three dots so it does not leak how long the address is.
 * It runs at render time now rather than before storage, so the button says
 * two letters while Google gets the address it needs.
 *
 * Returning null is also the validity check: an address that will not mask is
 * not one worth remembering, so nothing is stored and the button goes back to
 * "Continue with Google".
 */
function maskEmailForHint(email: string): string | null {
  const trimmed = email.trim().toLowerCase();
  const at = trimmed.lastIndexOf('@');
  if (at < 1 || at === trimmed.length - 1) return null;

  const name = trimmed.slice(0, at);
  const domain = trimmed.slice(at + 1);
  const shown = name.length >= 3 ? name.slice(0, 2) : name.slice(0, 1);
  return `${shown}•••@${domain}`;
}

/** Normalised as Google will see it, or null if it is not an address. */
function usableEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const trimmed = email.trim().toLowerCase();
  return maskEmailForHint(trimmed) ? trimmed : null;
}

async function rememberSignIn(email: string | null | undefined) {
  const address = usableEmail(email);
  if (address) await setStoredItemAsync(LAST_SIGN_IN_EMAIL_KEY, address);
}

async function forgetSignIn() {
  await removeStoredItemAsync(LAST_SIGN_IN_EMAIL_KEY);
  await removeStoredItemAsync(LEGACY_MASKED_KEY);
}

/*
   This listener sits outside the component on purpose.

   Expo Router builds its route tree by importing every file under `app/`, so
   this runs once when the app boots and keeps listening whichever screen is on
   screen. That is what makes it work in a browser, where nearly everybody is:
   the Google redirect lands back on "/" and this login screen is never
   rendered, so a listener living inside the component would never witness the
   sign-in it is trying to remember.

   Sign-out is caught here too, which means the address is cleared without
   reaching into the three screens that offer a Log out button.

   Subscribing also fires INITIAL_SESSION with whatever session already exists,
   so anybody signed in when this ships has their address recorded on their
   next load — the button keeps its name across the change to storing the whole
   address rather than the mask.

   If a future router version starts loading routes lazily, this simply stops
   recording and the button goes back to saying "Continue with Google". The
   screen keeps working either way.
*/
if (Platform.OS !== 'web' || typeof window !== 'undefined') {
  supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT') {
      void forgetSignIn();
      return;
    }
    void rememberSignIn(session?.user?.email);
  });
}

export default function LoginScreen() {
  const [loading, setLoading] = useState(false);
  // The whole address, held only long enough to hand to Google. The screen
  // never shows it — `accountHint` below is what the button reads.
  const [rememberedEmail, setRememberedEmail] = useState<string | null>(null);
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();
  const safeReturnTo = sanitizeReturnTo(returnTo);

  const accountHint = rememberedEmail ? maskEmailForHint(rememberedEmail) : null;

  useEffect(() => {
    let stillHere = true;
    void getStoredItemAsync(LAST_SIGN_IN_EMAIL_KEY).then((stored) => {
      if (stillHere) setRememberedEmail(usableEmail(stored));
    });
    // Sweep the old masked value off devices that still carry one. Nothing
    // reads it any more, and a leftover under a live-looking name is how a
    // later session talks itself into trusting it.
    void removeStoredItemAsync(LEGACY_MASKED_KEY);
    return () => {
      stillHere = false;
    };
  }, []);

  /**
   * What Google is asked, and why it is one of exactly two things.
   *
   * With a remembered address: `login_hint`, which signs that person in with
   * no chooser. That is the whole fix — the button says "Continue as X" and
   * Google continues as X instead of asking again.
   *
   * On "Use a different account": `prompt=select_account`, which forces the
   * full chooser open even when Google would happily have picked for you.
   * Never both — a hint plus a forced chooser is the doubling all over again.
   *
   * Neither is a lock. If that account is not signed in on this device Google
   * asks anyway, with the address already filled in, which is one step further
   * along than the chooser this used to open on.
   */
  const googleQueryParams = (
    forceAccountPicker: boolean
  ): Record<string, string> | undefined => {
    if (forceAccountPicker) return { prompt: 'select_account' };
    return rememberedEmail ? { login_hint: rememberedEmail } : undefined;
  };

  const handleGoogleSignIn = async (forceAccountPicker = false) => {
    try {
      setLoading(true);
      const queryParams = googleQueryParams(forceAccountPicker);

      if (Platform.OS === 'web') {
        // For web, use simple redirect
        // Include returnTo in the redirect URL so we can handle it after OAuth
        const redirectUrl = safeReturnTo
          ? `${window.location.origin}${safeReturnTo}`
          : window.location.origin;

        const { error } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: {
            redirectTo: redirectUrl,
            queryParams,
          },
        });
        if (error) throw error;
        // The page will redirect to Google, then back
      } else {
        // For native, use expo-linking to generate the correct URL
        const redirectTo = Linking.createURL('auth/callback');

        const { data, error } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: {
            redirectTo,
            skipBrowserRedirect: true,
            queryParams,
          },
        });

        if (error) throw error;

        if (data.url) {
          const result = await WebBrowser.openAuthSessionAsync(
            data.url,
            redirectTo
          );

          if (result.type === 'success') {
            const url = result.url;

            // PKCE flow: extract code from query params
            const parsedUrl = Linking.parse(url);
            const code = parsedUrl.queryParams?.code as string | undefined;

            if (code) {
              const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
              if (exchangeError) throw exchangeError;
            } else {
              // Fall back to implicit token flow (#access_token)
              const hashPart = url.split('#')[1];
              if (hashPart) {
                const hashParams = new URLSearchParams(hashPart);
                const accessToken = hashParams.get('access_token');
                const refreshToken = hashParams.get('refresh_token');

                if (accessToken && refreshToken) {
                  await supabase.auth.setSession({
                    access_token: accessToken,
                    refresh_token: refreshToken,
                  });
                } else {
                  throw new Error('No authentication tokens received from Google');
                }
              } else {
                throw new Error('No authentication tokens received from Google');
              }
            }

            router.replace((safeReturnTo ?? '/') as never);
          }
        }
      }
    } catch (error) {
      // Was `Alert.alert`, which does nothing at all in a browser — so a failed
      // sign-in looked like a button that did nothing (2026-08-06).
      showAlert('Sign-in failed', 'We could not sign you in with Google. Please try again.');
      console.error('Sign in error:', error);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Somebody else's turn. Forget the address first, so a person who taps this
   * and then walks away has not left the last person's name on the screen for
   * whoever picks the phone up next. Signing in again writes a fresh one.
   *
   * Forgetting first is also what makes the chooser honest: with the address
   * gone there is no `login_hint` left to send, so `prompt=select_account` is
   * the only thing Google is told and the full list opens.
   */
  const handleDifferentAccount = async () => {
    setRememberedEmail(null);
    await forgetSignIn();
    await handleGoogleSignIn(true);
  };

  return (
    // Behind the door it's dark. The public site is cream and says what HIVE is;
    // this page is the other side of the invitation and shouldn't read as more
    // of the same marketing (Nat 2026-08-02). Same seal, opposite world.
    <SafeAreaView style={{ flex: 1, backgroundColor: '#33271a' }}>
      <StatusBar style="light" />
      {/* The page grew a divider and more breathing room around the join line,
          and a 375 x 667 phone has barely enough height for all of it. A plain
          centred View would silently crop the bottom off; this keeps the
          content centred when it fits and lets it scroll when it doesn't. */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 40 }}
      >
        <View className="w-full max-w-md mx-auto items-center">
          <Image
            source={require('../../assets/HIVE Logo Transparent  BG.png')}
            style={{ width: 128, height: 128, marginBottom: 22 }}
            resizeMode="contain"
          />

          <Text
            style={{
              fontFamily: 'Lato_700Bold', fontSize: 11, letterSpacing: 3,
              color: '#dec181', marginBottom: 10,
            }}
          >
            MEMBERS ONLY
          </Text>

          <Text
            style={{ fontFamily: 'LibreBaskerville_700Bold', fontSize: 30, color: '#f6f4e5' }}
          >
            Welcome back
          </Text>

          <Text
            style={{
              fontFamily: 'Lato_400Regular', fontSize: 14, lineHeight: 21,
              color: 'rgba(246,244,229,0.62)', textAlign: 'center',
              marginTop: 10, marginBottom: 28, maxWidth: 300,
            }}
          >
            {/* Two sentences, two lines. The first says what this place is; the
                second tells you what to do. Run together they read as one long
                apology (Nat 2026-08-03). */}
            HIVE is invitation only.{'\n'}
            Sign in with the email address that received your invite.
          </Text>

          {/* The button is sized to its own words. At full width it was a white
              slab with about seventy points of empty either side of the
              wordmark, which made it the loudest thing on a quiet dark page
              (Nat 2026-08-06, testing on her phone). minWidth holds the shape
              while the spinner is in there, so it doesn't collapse to a dot
              mid sign-in and snap back; maxWidth keeps it inside the column on
              a narrow phone. Vertical padding is unchanged, so it still stands
              about 52 points tall — comfortably over the 44 a thumb needs.

              With an address on it the label is longer, so it shrinks and
              ellipsises from the middle — the provider at the end is the half
              you recognise yourself by, so that is the half that survives. */}
          <Pressable
            onPress={() => handleGoogleSignIn()}
            disabled={loading}
            accessibilityRole="button"
            accessibilityLabel={
              accountHint
                ? `Continue as ${accountHint}, the account that signed in on this device last`
                : 'Continue with Google'
            }
            style={{ minWidth: 236, maxWidth: '100%', opacity: loading ? 0.5 : 1 }}
            className="flex-row items-center justify-center bg-white rounded-xl py-4 px-5 active:opacity-80"
          >
            {loading ? (
              // Charcoal, because the spinner sits on the white button. It was
              // cream on cream, so signing in looked like nothing happening.
              <ActivityIndicator size="small" color="#313130" />
            ) : (
              <>
                <Image
                  source={{ uri: 'https://www.google.com/favicon.ico' }}
                  style={{ width: 20, height: 20, marginRight: 12 }}
                />
                <Text
                  numberOfLines={1}
                  ellipsizeMode="middle"
                  // minWidth 0 is what lets a long address actually shrink in a
                  // browser; without it the flex row refuses to go under the
                  // text's own width and the button pushes past the column.
                  style={{ fontFamily: 'Lato_700Bold', flexShrink: 1, minWidth: 0 }}
                  className="text-base text-charcoal"
                >
                  {accountHint ? `Continue as ${accountHint}` : 'Continue with Google'}
                </Text>
              </>
            )}
          </Pressable>

          {/* Without a remembered address there is no "current" account, so
              "different" would be measuring against nothing. The wording
              changes rather than the button disappearing — a browser can be
              quietly signed into a Google account nobody on this screen has
              named, and this is still the way past it.

              It matters more now that the button above skips the chooser: this
              line is the only remaining door to the full list, and the only
              thing that clears a remembered address that has gone stale. It
              stays on screen in every state. Do not hide it when a name is
              showing — that is precisely when somebody needs it. */}
          <Pressable
            onPress={() => void handleDifferentAccount()}
            disabled={loading}
            accessibilityRole="button"
            style={{ marginTop: 18, paddingVertical: 12, paddingHorizontal: 8 }}
            className="active:opacity-60"
          >
            <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 13, color: 'rgba(246,244,229,0.5)' }}>
              {accountHint ? 'Use a different account' : 'Choose a Google account'} &rarr;
            </Text>
          </Pressable>

          {/* Nat, 2026-08-06: "this is still too squishy, there needs to be a
              space here." The join line used to be the same tappable box as
              the rule above it, hanging off the hairline with 24 points of
              padding and nothing below it at all. The rule is its own thing
              now, with real air on both sides, and the link is its own tap
              target with room underneath. */}
          <View
            style={{
              width: '100%', height: 1, marginTop: 26,
              backgroundColor: 'rgba(222,193,129,0.22)',
            }}
          />

          <Pressable
            onPress={() => Linking.openURL('https://the-hive.app')}
            accessibilityRole="link"
            style={{ marginTop: 26, paddingVertical: 12, paddingHorizontal: 8 }}
            className="active:opacity-70"
          >
            <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 13, color: 'rgba(246,244,229,0.55)', textAlign: 'center' }}>
              {/* The explicit space matters: JSX eats the trailing one before a
                  line break, which is why this read "yet?Come find us". */}
              {/* Named to match where it lands. The public site's section was
                  called "Come find us" and is now "Get involved" (Nat,
                  2026-08-06) — a link and its destination calling themselves
                  different things is how somebody decides they clicked wrong. */}
              Not a member yet?{' '}
              <Text style={{ fontFamily: 'Lato_700Bold', color: '#dec181' }}>Get involved &rarr;</Text>
            </Text>
          </Pressable>
        </View>

        <View style={{ marginTop: 32, paddingHorizontal: 8 }}>
          <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 11, lineHeight: 18, color: 'rgba(246,244,229,0.34)', textAlign: 'center' }}>
            Created by{' '}
            <Text
              style={{ fontFamily: 'Lato_700Bold', color: 'rgba(246,244,229,0.55)' }}
              onPress={() => Linking.openURL('https://savedyouaseatstudios.com')}
            >
              Saved You a Seat Studios
            </Text>
            {' '}&middot; &copy; 2026. All rights reserved.
          </Text>
          <Text
            style={{ fontFamily: 'Lato_400Regular', fontSize: 11, lineHeight: 18, color: 'rgba(246,244,229,0.34)', textAlign: 'center', marginTop: 3 }}
            onPress={() => Linking.openURL('https://savedyouaseatstudios.com/#contact')}
          >
            Like what you see? Let&rsquo;s build your custom website or software.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
