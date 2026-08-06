import { useState, type ReactNode } from 'react';
import {
  View,
  Text,
  Pressable,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { usePageSkin } from '../../lib/pageSkin';

/**
 * A panel that opens and shuts.
 *
 * Nat, from her phone on 2026-08-06, about the HIVE-Wide explainer: *"i think
 * all of those, 'what is hive wide', 'select your hive' whatever, all of those
 * should be collapsible or expandable, thats a really nice feature, i like!"*
 *
 * The behaviour already existed in three places — the HIVE-Wide welcome, the
 * newsletter cards in The Buzz, and nowhere else — written out longhand each
 * time. It lives here now so a panel anywhere in the app opens the same way,
 * with the same chevron on the same side, and a screen that wants the pattern
 * later asks for it instead of copying it.
 *
 * Two ways to use it:
 *
 *   uncontrolled  pass `defaultOpen` and let the panel remember its own state
 *   controlled    pass `open` and `onToggle` — this is what a one-at-a-time
 *                 list needs, where opening a letter shuts the last one
 *
 * The body is taken off the screen entirely while the panel is shut rather than
 * hidden with a style. The Buzz holds forty newsletters of about two thousand
 * words each, so "hidden" would still be two thousand words of laid-out text per
 * card sitting in the page.
 */

export type CollapsiblePanelColours = {
  /** The title. */
  ink?: string;
  /** The subtitle and anything quiet in the header. */
  inkSoft?: string;
  /** Behind the panel. */
  fill?: string;
  /** The panel's edge, and the rule under the header. */
  border?: string;
  /** The chevron and the eyebrow line. */
  accent?: string;
  /** The panel while the header is being pressed. */
  pressed?: string;
};

export interface CollapsiblePanelProps {
  /** What the header says. */
  title: string;
  /**
   * What the header says while it is shut, when the shut panel is a different
   * offer from the open one. The HIVE-Wide welcome asks "What is HIVE-Wide?"
   * when it is away and is titled "Welcome to HIVE-Wide" once it is open.
   */
  collapsedTitle?: string;
  /** A small uppercase line above the title. Shown open or shut. */
  eyebrow?: string;
  /** A quiet line under the title — a date, a count. Shown open or shut. */
  subtitle?: ReactNode;
  /** An icon to the left of the title. */
  icon?: keyof typeof Ionicons.glyphMap;
  /** A band of colour across the very top, for whose thing this is. */
  topAccent?: string;
  /** Where it starts, when the panel holds its own state. */
  defaultOpen?: boolean;
  /** Pass with `onToggle` to hold the state yourself. */
  open?: boolean;
  onToggle?: (next: boolean) => void;
  colours?: CollapsiblePanelColours;
  /** A dashed edge — something still being written rather than finished. */
  dashed?: boolean;
  /** The outer box: sizing, a coloured left edge, margins. */
  style?: StyleProp<ViewStyle>;
  titleStyle?: StyleProp<TextStyle>;
  /** The inside of the panel. Defaults to 16 all round, minus the header's own. */
  bodyStyle?: StyleProp<ViewStyle>;
  children: ReactNode;
}

export function CollapsiblePanel({
  title,
  collapsedTitle,
  eyebrow,
  subtitle,
  icon,
  topAccent,
  defaultOpen = true,
  open: openProp,
  onToggle,
  colours,
  dashed = false,
  style,
  titleStyle,
  bodyStyle,
  children,
}: CollapsiblePanelProps) {
  // The page decides the colours unless the caller knows better — HIVE-Wide and
  // The Buzz both hang in space and carry their own slightly warmer tokens.
  const skin = usePageSkin();
  const ink = colours?.ink ?? skin.ink;
  const inkSoft = colours?.inkSoft ?? skin.inkSoft;
  const fill = colours?.fill ?? skin.card;
  const border = colours?.border ?? skin.border;
  const accent = colours?.accent ?? skin.gold;
  const pressedFill = colours?.pressed ?? skin.cardPressed;

  const [openState, setOpenState] = useState(defaultOpen);
  const controlled = openProp !== undefined;
  const open = controlled ? openProp : openState;

  const toggle = () => {
    const next = !open;
    if (!controlled) setOpenState(next);
    onToggle?.(next);
  };

  const headerText = open ? title : (collapsedTitle ?? title);

  return (
    <View
      style={[
        {
          borderRadius: 16,
          borderWidth: 1,
          borderStyle: dashed ? 'dashed' : 'solid',
          borderColor: border,
          backgroundColor: fill,
          // So a top accent band takes the panel's rounded corners with it.
          overflow: 'hidden',
        },
        style,
      ]}
    >
      {topAccent ? <View style={{ height: 4, backgroundColor: topAccent }} /> : null}

      <Pressable
        onPress={toggle}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={open ? `${headerText}, open` : `${headerText}, shut`}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'flex-start',
          gap: 10,
          padding: 16,
          backgroundColor: pressed ? pressedFill : 'transparent',
        })}
      >
        {icon ? (
          <View style={{ paddingTop: 1 }}>
            <Ionicons name={icon} size={18} color={accent} />
          </View>
        ) : null}

        <View style={{ flex: 1 }}>
          {eyebrow ? (
            <Text
              style={{
                fontFamily: 'Lato_700Bold',
                fontSize: 10.5,
                letterSpacing: 1.1,
                textTransform: 'uppercase',
                color: accent,
                marginBottom: 3,
              }}
            >
              {eyebrow}
            </Text>
          ) : null}
          <Text
            style={[
              {
                fontFamily: 'LibreBaskerville_700Bold',
                fontSize: 17,
                letterSpacing: 0.4,
                color: ink,
              },
              titleStyle,
            ]}
          >
            {headerText}
          </Text>
          {typeof subtitle === 'string' ? (
            <Text
              style={{
                fontFamily: 'Lato_400Regular',
                fontSize: 12,
                color: inkSoft,
                marginTop: 3,
              }}
            >
              {subtitle}
            </Text>
          ) : (
            subtitle ?? null
          )}
        </View>

        <Ionicons
          name={open ? 'chevron-up' : 'chevron-down'}
          size={19}
          color={accent}
          style={{ marginTop: 1 }}
        />
      </Pressable>

      {open ? (
        <View style={[{ paddingHorizontal: 16, paddingBottom: 16 }, bodyStyle]}>{children}</View>
      ) : null}
    </View>
  );
}
