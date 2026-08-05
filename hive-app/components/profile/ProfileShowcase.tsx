import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View, type StyleProp, type ViewStyle } from 'react-native';
import { ProfileHoneycombCluster, type HoneycombItem } from './ProfileHoneycombCluster';

type ProfileMiqAnswers = {
  experiences?: string | null;
  growth?: string | null;
  contribution?: string | null;
};

type ProfileMiqItem = {
  label: string;
  value: string | null;
  placeholder: string;
};

type ProfileShowcaseProps = {
  honeycombItems: HoneycombItem[];
  knownFor?: string | null;
  bio?: string | null;
  miq?: ProfileMiqAnswers;
  knownForPlaceholder?: string;
  bioPlaceholder?: string;
  miqPlaceholder?: string;
  miqActionLabel?: string;
  onMiqAction?: () => void;
  showMiqWhenEmpty?: boolean;
  showEmptyCells?: boolean;
  style?: StyleProp<ViewStyle>;
};

const DESKTOP_BREAKPOINT = 1240;
const BIO_PREVIEW_LINES = {
  desktop: 11,
  mobile: 4,
} as const;
const MIQ_PREVIEW_LINES = {
  desktop: 3,
  mobile: 2,
} as const;
const BIO_EXPAND_THRESHOLD = {
  desktop: 520,
  mobile: 220,
} as const;
const MIQ_EXPAND_THRESHOLD = {
  desktopTotal: 520,
  desktopItem: 155,
  mobileTotal: 190,
  mobileItem: 95,
} as const;

// Ceilings, not floors (Nat, 2026-08-05). These two side panels used to be
// pinned at minHeight 560 and stretched to whatever the honeycomb needed, so
// somebody with one line of bio got their one line and then several hundred
// pixels of nothing — which reads as a page that broke, not as a short answer.
// Now each panel is exactly as tall as what's in it and scrolls inside itself
// once it passes these numbers.
//
// The numbers come from what a FULL panel needs, not from a guess:
//   story — a complete bio preview (11 lines at 22px) plus all three 3MIQ
//   answers at three lines each, with both cards' padding, labels and "Read
//   more" buttons, lands near 730. 780 means a fully-filled profile never
//   scrolls; the scroll is there for when somebody presses "Read more".
//   ask — the quote runs at 28px a line, so 340 holds about nine lines of it,
//   far more than anyone has written in "HIVErs should ask me about".
const DESKTOP_PANEL_MAX_HEIGHT = {
  ask: 340,
  story: 780,
} as const;

function clean(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
}

function cleanKnownFor(value?: string | null) {
  const text = clean(value);
  if (!text) return null;

  const stripped = text
    .replace(/^["']?\s*(?:hivers|people)\s+should\s+ask\s+me\s+about[\s:,.!-]*/i, '')
    .replace(/["']$/, '')
    .trim();

  return stripped.length > 0 ? stripped : text;
}

function StoryCard({
  label,
  children,
  canExpand,
  expanded,
  onToggle,
  actionLabel,
  onAction,
}: {
  label: string;
  children: ReactNode;
  canExpand?: boolean;
  expanded?: boolean;
  onToggle?: () => void;
  actionLabel?: string;
  onAction?: () => void;
}) {
  // No height styling passed in on purpose: a story card is as tall as its
  // words. The stack around it is what has a ceiling.
  return (
    <View style={styles.storyCard}>
      <View style={styles.storyHeader}>
        <Text style={[styles.sectionLabel, styles.storyLabel]}>
          {label}
        </Text>
        {onAction ? (
          <Pressable
            onPress={onAction}
            accessibilityRole="button"
            style={styles.storyAction}
          >
            <Text style={styles.storyActionText}>
              {actionLabel || 'Open'}
            </Text>
          </Pressable>
        ) : null}
      </View>

      {children}

      {canExpand && onToggle ? (
        <Pressable
          onPress={onToggle}
          accessibilityRole="button"
          hitSlop={8}
          style={styles.expandButton}
        >
          <Text style={styles.expandButtonText}>
            {expanded ? 'Read less' : 'Read more'}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function ProfileShowcase({
  honeycombItems,
  knownFor,
  bio,
  miq,
  knownForPlaceholder = 'Not shared yet.',
  bioPlaceholder = 'No bio shared yet.',
  miqPlaceholder = '3MIQ answers are not shared yet.',
  miqActionLabel,
  onMiqAction,
  showMiqWhenEmpty = false,
  showEmptyCells = true,
  style,
}: ProfileShowcaseProps) {
  const { width } = useWindowDimensions();
  const isDesktop = width >= DESKTOP_BREAKPOINT;
  const isPhone = width < 640;
  const [bioExpanded, setBioExpanded] = useState(false);
  const [miqExpanded, setMiqExpanded] = useState(false);
  const knownForText = cleanKnownFor(knownFor);
  const bioText = clean(bio);
  const allMiqItems: ProfileMiqItem[] = [
    { label: 'Experiences', value: clean(miq?.experiences), placeholder: 'Not shared yet' },
    { label: 'Growth', value: clean(miq?.growth), placeholder: 'Not shared yet' },
    { label: 'Contribution', value: clean(miq?.contribution), placeholder: 'Not shared yet' },
  ];
  const miqItems = showMiqWhenEmpty
    ? allMiqItems
    : allMiqItems.filter(item => item.value);
  const hasMiq = allMiqItems.some(item => item.value);
  const showMiqCard = hasMiq || showMiqWhenEmpty || !!onMiqAction;
  const bioPreviewLines = isDesktop ? BIO_PREVIEW_LINES.desktop : BIO_PREVIEW_LINES.mobile;
  const miqPreviewLines = isDesktop ? MIQ_PREVIEW_LINES.desktop : MIQ_PREVIEW_LINES.mobile;
  const bioCanExpand = !!bioText && bioText.length > (
    isDesktop ? BIO_EXPAND_THRESHOLD.desktop : BIO_EXPAND_THRESHOLD.mobile
  );
  const miqCanExpand = hasMiq && (
    miqItems.reduce((total, item) => total + (item.value?.length ?? 0), 0) > (
      isDesktop ? MIQ_EXPAND_THRESHOLD.desktopTotal : MIQ_EXPAND_THRESHOLD.mobileTotal
    )
    || miqItems.some(item => (item.value?.length ?? 0) > (
      isDesktop ? MIQ_EXPAND_THRESHOLD.desktopItem : MIQ_EXPAND_THRESHOLD.mobileItem
    ))
  );
  const bioTextClampProps = bioExpanded
    ? {}
    : { numberOfLines: bioPreviewLines, ellipsizeMode: 'tail' as const };
  const miqTextClampProps = miqExpanded
    ? {}
    : { numberOfLines: miqPreviewLines, ellipsizeMode: 'tail' as const };
  const bioCard = (
    <StoryCard
      label="Bio"
      canExpand={bioCanExpand}
      expanded={bioExpanded}
      onToggle={() => setBioExpanded(value => !value)}
    >
      <Text
        key={bioExpanded ? 'bio-expanded' : 'bio-collapsed'}
        {...bioTextClampProps}
        style={[
          styles.storyText,
          isPhone && styles.mobileStoryText,
          !bioText && styles.placeholderText,
        ]}
      >
        {bioText || bioPlaceholder}
      </Text>
    </StoryCard>
  );
  const miqCard = showMiqCard ? (
    <StoryCard
      label="3MIQ"
      actionLabel={miqActionLabel}
      onAction={onMiqAction}
      canExpand={miqCanExpand}
      expanded={miqExpanded}
      onToggle={() => setMiqExpanded(value => !value)}
    >
      {miqItems.length > 0 ? (
        <View style={styles.miqList}>
          {miqItems.map(item => (
            <View key={item.label} style={styles.miqItem}>
              <Text style={styles.miqLabel}>
                {item.label}
              </Text>
              <Text
                key={`${item.label}-${miqExpanded ? 'expanded' : 'collapsed'}`}
                {...miqTextClampProps}
                style={[
                  styles.storyText,
                  isPhone && styles.mobileStoryText,
                  !item.value && styles.placeholderText,
                ]}
              >
                {item.value || item.placeholder}
              </Text>
            </View>
          ))}
        </View>
      ) : (
        <Text style={[styles.storyText, isPhone && styles.mobileStoryText, styles.placeholderText]}>
          {miqPlaceholder}
        </Text>
      )}
    </StoryCard>
  ) : null;

  if (isDesktop) {
    return (
      <View style={[styles.desktopRow, style]}>
        <View style={[styles.desktopSideCard, styles.askCard]}>
          <ScrollView nestedScrollEnabled>
            <Text style={[styles.sectionLabel, styles.askLabel]}>
              HIVErs should ask me about
            </Text>
            <Text style={[styles.askText, !knownForText && styles.placeholderText]}>
              {knownForText ? `"${knownForText}"` : knownForPlaceholder}
            </Text>
          </ScrollView>
        </View>

        <View style={styles.desktopHoneycomb}>
          <ProfileHoneycombCluster
            size="roomy"
            preferredColumns={3}
            showEmptyCells={showEmptyCells}
            items={honeycombItems}
          />
        </View>

        <View style={styles.desktopStoryStack}>
          <ScrollView contentContainerStyle={styles.desktopStoryStackContent} nestedScrollEnabled>
            {bioCard}
            {miqCard}
          </ScrollView>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.mobileStack, style]}>
      <View style={styles.mobileAskSection}>
        <Text style={[styles.sectionLabel, styles.askLabel]}>
          HIVErs should ask me about
        </Text>
        <Text
          style={[
            styles.mobileAskText,
            isPhone && styles.mobileAskTextPhone,
            !knownForText && styles.placeholderText,
          ]}
        >
          {knownForText ? `"${knownForText}"` : knownForPlaceholder}
        </Text>
      </View>

      <ProfileHoneycombCluster
        size="compact"
        preferredColumns={isPhone ? 3 : undefined}
        showEmptyCells={showEmptyCells}
        items={honeycombItems}
      />

      <View style={styles.mobileStoryStack}>
        {bioCard}
        {miqCard}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  desktopRow: {
    flexDirection: 'row',
    // Each column stands at its own height. Stretching them meant the two
    // side panels were always as tall as the honeycomb — around 700px —
    // however little was written in them.
    alignItems: 'flex-start',
    justifyContent: 'center',
    gap: 18,
    marginTop: 4,
  },
  desktopSideCard: {
    maxHeight: DESKTOP_PANEL_MAX_HEIGHT.ask,
    borderWidth: 1,
    paddingHorizontal: 24,
    paddingVertical: 28,
  },
  askCard: {
    width: 290,
    borderRadius: 34,
    backgroundColor: '#fffdf5',
    borderColor: 'rgba(222,193,129,0.35)',
  },
  desktopStoryStack: {
    width: 330,
    maxHeight: DESKTOP_PANEL_MAX_HEIGHT.story,
    alignItems: 'stretch',
  },
  desktopStoryStackContent: {
    gap: 14,
    // The cards carry a soft drop shadow below them; a scrolling box clips at
    // its own edge, so leave the shadow somewhere to land.
    paddingBottom: 6,
  },
  desktopHoneycomb: {
    width: 540,
    alignSelf: 'center',
  },
  sectionLabel: {
    fontFamily: 'Lato_700Bold',
    fontSize: 11,
    letterSpacing: 0,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  askLabel: {
    color: '#bd9348',
  },
  storyLabel: {
    color: '#a09274',
    marginBottom: 0,
  },
  askText: {
    fontFamily: 'LibreBaskerville_400Regular',
    fontSize: 18,
    lineHeight: 28,
    color: '#2d2d2d',
    fontStyle: 'italic',
  },
  mobileStack: {
    gap: 16,
  },
  mobileAskSection: {
    paddingVertical: 2,
  },
  mobileAskText: {
    fontFamily: 'LibreBaskerville_400Regular',
    fontSize: 20,
    lineHeight: 30,
    color: '#2d2d2d',
    fontStyle: 'italic',
  },
  mobileAskTextPhone: {
    fontSize: 19,
    lineHeight: 28,
  },
  mobileStoryStack: {
    gap: 12,
  },
  storyCard: {
    alignSelf: 'stretch',
    borderRadius: 24,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: 'rgba(45,45,45,0.08)',
    paddingHorizontal: 20,
    paddingVertical: 18,
    shadowColor: '#2d2d2d',
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
  },
  storyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 10,
  },
  storyAction: {
    backgroundColor: '#fffaf0',
    borderWidth: 1,
    borderColor: 'rgba(222,193,129,0.55)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  storyActionText: {
    fontFamily: 'Lato_700Bold',
    fontSize: 11,
    color: '#bd9348',
  },
  storyText: {
    fontFamily: 'Lato_400Regular',
    fontSize: 14,
    lineHeight: 22,
    color: '#2d2d2d',
  },
  mobileStoryText: {
    fontSize: 14.5,
    lineHeight: 23,
  },
  miqList: {
    gap: 10,
  },
  miqItem: {
    gap: 3,
  },
  miqLabel: {
    fontFamily: 'Lato_700Bold',
    fontSize: 11,
    color: '#bd9348',
    textTransform: 'uppercase',
  },
  expandButton: {
    alignSelf: 'flex-start',
    marginTop: 12,
    borderRadius: 999,
    paddingVertical: 5,
    paddingRight: 10,
  },
  expandButtonText: {
    fontFamily: 'Lato_700Bold',
    fontSize: 12,
    color: '#bd9348',
  },
  placeholderText: {
    opacity: 0.52,
  },
});
