import { Image, View, Text, useWindowDimensions } from 'react-native';
import { headerForSection } from '../../lib/newsletterHeaders';

export interface SummarySection {
  title: string;
  lines: string[];
  /** Where these lines came from. Meeting summaries set it; newsletters omit it. */
  source_label?: string;
}

/**
 * The house style for "here's what you missed" — used by the meeting summary
 * and the newsletter draft, which are the same artifact pointed at different
 * dates. Each section is a paper card: a small letterspaced serif heading over
 * a gold hairline, then quiet body text where only the thing that NAMES the
 * line carries weight, so the eye lands on names instead of fighting a wall of
 * bold (Nat 2026-07-25).
 *
 * A line indented with four spaces hangs under the line above it — that's how
 * POP labels and hang dates stay attached to the person or heading they belong
 * to without needing a nested data shape.
 *
 * `art` turns on Nat's hand-made section headers (lib/newsletterHeaders.ts).
 * It is off by default because this component also draws the meeting summary,
 * which is a working document — "Community Wins" in gold over a set of action
 * items would be dressing up a to-do list. The newsletter passes it.
 */
export function SummarySections({
  sections,
  art = false,
}: {
  sections: SummarySection[];
  /** Use the drawn headers. Newsletter yes, meeting summary no. */
  art?: boolean;
}) {
  const { width } = useWindowDimensions();
  if (!sections || sections.length === 0) return null;

  // The art is a wide band; it has to know how much room it actually has or it
  // either overflows the card or floats in a box three times its height.
  const artWidth = Math.min(width - 72, 560);

  return (
    <View>
      {sections.map((section) => {
        const header = art ? headerForSection(section.title) : null;
        return (
        <View
          key={section.title}
          className="mb-4 bg-paper rounded-2xl border border-gold/20 px-5 pt-4 pb-3"
        >
          {header ? (
            <View style={{ alignItems: 'center', marginTop: 2, marginBottom: 10 }}>
              <Image
                source={header.source}
                accessibilityLabel={header.alt}
                style={{ width: artWidth, height: artWidth / header.ratio }}
                resizeMode="contain"
              />
            </View>
          ) : (
            <>
              {/* No art for this one — draw a heading out of the same parts the
                  art is made of (gold serif, a sparkle, a hairline) so a new
                  section reads as part of the same publication rather than as
                  the one that didn't get a picture. */}
              <View style={{ alignItems: 'center', marginTop: 4 }}>
                <Text style={{ fontSize: 13, color: '#dcbf7e', marginBottom: 2 }}>✦</Text>
                <Text
                  style={{
                    fontFamily: 'LibreBaskerville_400Regular',
                    fontSize: 17,
                    lineHeight: 25,
                    color: '#c2952f',
                    textAlign: 'center',
                  }}
                >
                  {section.title}
                </Text>
                {section.source_label ? (
                  <Text
                    style={{
                      fontFamily: 'Lato_400Regular',
                      fontSize: 11,
                      lineHeight: 16,
                      color: '#9a8060',
                      textAlign: 'center',
                      marginTop: 4,
                    }}
                  >
                    {section.source_label}
                  </Text>
                ) : null}
              </View>
            </>
          )}
          <View
            style={{
              height: 1,
              backgroundColor: '#bd934826',
              marginTop: header ? 0 : 8,
              marginBottom: 12,
            }}
          />
          {section.lines.map((line, index) => {
            const indented = line.startsWith('    ');
            const text = line.trim();
            // A person's name opens their block — give it air above.
            const startsBlock = !indented
              && index > 0
              && section.lines[index - 1].startsWith('    ');
            if (indented) {
              const [label, ...rest] = text.split(': ');
              const body = rest.join(': ');
              return (
                <View key={index} style={{ paddingLeft: 20, marginBottom: 5 }}>
                  <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 14, lineHeight: 21, color: '#6f6559' }}>
                    {body ? (
                      <>
                        <Text style={{ fontFamily: 'Lato_700Bold', color: '#a08347' }}>{label}: </Text>
                        {body}
                      </>
                    ) : text}
                  </Text>
                </View>
              );
            }
            // "Sara: Europe is happening" — the name leads, the rest reads.
            const lead = text.match(/^([^:]{1,32}):\s+(.+)$/);
            return (
              <View
                key={index}
                className="flex-row"
                style={{ marginBottom: 9, marginTop: startsBlock ? 14 : 0 }}
              >
                <Text style={{ color: '#c9a76a', fontSize: 13, lineHeight: 22, marginRight: 10 }}>◆</Text>
                <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 14.5, lineHeight: 22, color: '#3f3a33', flex: 1 }}>
                  {lead ? (
                    <>
                      <Text style={{ fontFamily: 'Lato_700Bold', color: '#2d2d2d' }}>{lead[1]}: </Text>
                      {lead[2]}
                    </>
                  ) : text}
                </Text>
              </View>
            );
          })}
        </View>
        );
      })}
    </View>
  );
}
