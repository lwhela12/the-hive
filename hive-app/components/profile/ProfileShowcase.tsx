import { StyleSheet, Text, useWindowDimensions, View, type StyleProp, type ViewStyle } from 'react-native';
import { ProfileHoneycombCluster, type HoneycombItem } from './ProfileHoneycombCluster';

type ProfileShowcaseProps = {
  honeycombItems: HoneycombItem[];
  knownFor?: string | null;
  bio?: string | null;
  knownForPlaceholder?: string;
  bioPlaceholder?: string;
  showEmptyCells?: boolean;
  style?: StyleProp<ViewStyle>;
};

const DESKTOP_BREAKPOINT = 1240;

function clean(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
}

export function ProfileShowcase({
  honeycombItems,
  knownFor,
  bio,
  knownForPlaceholder = 'Not shared yet.',
  bioPlaceholder = 'No bio shared yet.',
  showEmptyCells = true,
  style,
}: ProfileShowcaseProps) {
  const { width } = useWindowDimensions();
  const isDesktop = width >= DESKTOP_BREAKPOINT;
  const isPhone = width < 640;
  const knownForText = clean(knownFor);
  const bioText = clean(bio);

  if (isDesktop) {
    return (
      <View style={[styles.desktopRow, style]}>
        <View style={[styles.desktopSideCard, styles.askCard]}>
          <Text style={[styles.sectionLabel, styles.askLabel]}>
            People should ask me about
          </Text>
          <Text style={[styles.askText, !knownForText && styles.placeholderText]}>
            {knownForText ? `"${knownForText}"` : knownForPlaceholder}
          </Text>
        </View>

        <View style={styles.desktopHoneycomb}>
          <ProfileHoneycombCluster
            size="roomy"
            preferredColumns={3}
            showEmptyCells={showEmptyCells}
            items={honeycombItems}
          />
        </View>

        <View style={[styles.desktopSideCard, styles.bioCard]}>
          <Text style={[styles.sectionLabel, styles.bioLabel]}>
            Bio
          </Text>
          <Text style={[styles.bioText, !bioText && styles.placeholderText]}>
            {bioText || bioPlaceholder}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.mobileStack, style]}>
      <View style={styles.mobileAskSection}>
        <Text style={[styles.sectionLabel, styles.askLabel]}>
          People should ask me about
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

      <View style={styles.mobileBioCard}>
        <Text style={[styles.sectionLabel, styles.bioLabel]}>
          Bio
        </Text>
        <Text style={[styles.mobileBioText, !bioText && styles.placeholderText]}>
          {bioText || bioPlaceholder}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  desktopRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    justifyContent: 'center',
    gap: 18,
    marginTop: 4,
  },
  desktopSideCard: {
    minHeight: 560,
    borderWidth: 1,
    paddingHorizontal: 24,
    paddingVertical: 28,
    justifyContent: 'center',
  },
  askCard: {
    width: 290,
    borderRadius: 34,
    backgroundColor: '#fffdf5',
    borderColor: 'rgba(222,193,129,0.35)',
  },
  bioCard: {
    width: 330,
    borderRadius: 34,
    backgroundColor: '#fff',
    borderColor: 'rgba(45,45,45,0.08)',
    shadowColor: '#2d2d2d',
    shadowOpacity: 0.06,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
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
  bioLabel: {
    color: '#9ca3af',
  },
  askText: {
    fontFamily: 'LibreBaskerville_400Regular',
    fontSize: 18,
    lineHeight: 28,
    color: '#2d2d2d',
    fontStyle: 'italic',
  },
  bioText: {
    fontFamily: 'Lato_400Regular',
    fontSize: 15,
    lineHeight: 24,
    color: '#2d2d2d',
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
  mobileBioCard: {
    borderRadius: 28,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: 'rgba(45,45,45,0.08)',
    padding: 18,
    shadowColor: '#2d2d2d',
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
  },
  mobileBioText: {
    fontFamily: 'Lato_400Regular',
    fontSize: 14.5,
    lineHeight: 23,
    color: '#2d2d2d',
  },
  placeholderText: {
    opacity: 0.52,
  },
});
