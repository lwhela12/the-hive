import { Component, type ReactNode } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import { HIVE_SKIN } from '../../lib/pageSkin';
import { HIVE_GOLD } from '../../lib/hiveBrand';

/**
 * The net under the whole app.
 *
 * Until this existed, one bad render anywhere took the entire app down to a
 * blank white page. React unmounts the whole tree when a component throws
 * during render, and the app's stylesheet sets `body { overflow: hidden }` —
 * so there was nothing to read, nothing to scroll to, and no button to press.
 * The only way back was knowing to reload the browser, which is a thing
 * developers do and members do not.
 *
 * A class is the only way to catch a render error in React, which is why this
 * one file works differently from everything else in components/ui.
 *
 * It wears the page skin rather than raw colours, and it says what happened in
 * ordinary words, because the person reading it is already having a bad minute.
 */

type Props = {
  children: ReactNode;
};

type State = {
  error: Error | null;
};

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    // The console is the only record we have. Keep the component stack with it:
    // the message alone rarely says which screen went down.
    console.error('[HIVE] A screen stopped drawing:', error, info?.componentStack);
  }

  handleReload = () => {
    // In a browser a fresh page is the honest fix — the tree that threw is
    // gone, and a reload also picks up a newer build if one shipped in the
    // meantime. On a phone there is no page to reload, so clearing the error
    // remounts the app from the top.
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.location.reload();
      return;
    }
    this.setState({ error: null });
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          padding: 28,
          backgroundColor: HIVE_SKIN.page,
        }}
      >
        <View style={{ maxWidth: 380, alignItems: 'center' }}>
          <Text style={{ fontSize: 46, marginBottom: 18 }}>🐝</Text>

          <Text
            style={{
              fontFamily: 'LibreBaskerville_700Bold',
              fontSize: 22,
              lineHeight: 31,
              color: HIVE_SKIN.ink,
              textAlign: 'center',
            }}
          >
            Something tripped up
          </Text>

          <Text
            style={{
              fontFamily: 'Lato_400Regular',
              fontSize: 15,
              lineHeight: 24,
              color: HIVE_SKIN.inkBody,
              textAlign: 'center',
              marginTop: 14,
            }}
          >
            HIVE stopped drawing this page. Loading it fresh usually sorts it
            out.
          </Text>

          <Pressable
            onPress={this.handleReload}
            style={({ pressed }) => ({
              marginTop: 26,
              paddingVertical: 14,
              paddingHorizontal: 34,
              borderRadius: 14,
              backgroundColor: HIVE_GOLD,
              opacity: pressed ? 0.8 : 1,
            })}
          >
            <Text
              style={{
                fontFamily: 'Lato_700Bold',
                fontSize: 16,
                color: HIVE_SKIN.card,
              }}
            >
              {Platform.OS === 'web' ? 'Reload HIVE' : 'Try again'}
            </Text>
          </Pressable>

          <Text
            style={{
              fontFamily: 'Lato_400Regular',
              fontSize: 13,
              lineHeight: 21,
              color: HIVE_SKIN.inkSoft,
              textAlign: 'center',
              marginTop: 24,
            }}
          >
            If it keeps happening, tell Nat or Lucas what you were doing and
            we&rsquo;ll fix it.
          </Text>

          {/* The app's own words, kept quiet. It means nothing to most people,
              and it is the one line that tells us what to fix when somebody
              sends a screenshot. */}
          {error.message ? (
            <Text
              numberOfLines={3}
              style={{
                fontFamily: 'Lato_400Regular',
                fontSize: 12,
                lineHeight: 18,
                color: HIVE_SKIN.inkFaint,
                textAlign: 'center',
                marginTop: 14,
              }}
            >
              {error.message}
            </Text>
          ) : null}
        </View>
      </View>
    );
  }
}
