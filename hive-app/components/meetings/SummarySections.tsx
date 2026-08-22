import { useState, type ReactNode } from 'react';
import { Image, Pressable, View, Text, useWindowDimensions } from 'react-native';
import { headerForSection } from '../../lib/newsletterHeaders';

export interface SummarySection {
  title: string;
  lines?: string[];
  intro?: string;
  groups?: SummaryGroup[];
  tone?: 'default' | 'warm' | 'warning';
  /** Stored audit provenance, shown quietly at the foot of each working section. */
  source_label?: string;
}

export interface MeetingConflictReview {
  kind: 'action_item_owner' | 'record_correction';
  conflict_id: string;
  action_item_id?: string;
  task_description?: string;
  current_owner_id?: string;
  current_owner_name?: string;
  /** Exact generated duty line, used to update only that line after review. */
  summary_line?: string;
}

export interface SummaryGroup {
  title: string;
  lines: string[];
  meta?: string;
  review?: MeetingConflictReview;
}

const MEETING_SECTION_ICONS: Record<string, string> = {
  'Roll Call': '🐝',
  'How We Arrived': '⚡',
  'News from Nat': '📣',
  Treasurer: '🍯',
  'Plan the Meet Ups': '🗓️',
  'HummDinger Sesh': '💛',
  'Wrap-Up': '✨',
  'Needs Review': '⚠️',
};

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
  renderReview,
}: {
  sections: SummarySection[];
  /** Use the drawn headers. Newsletter yes, meeting summary no. */
  art?: boolean;
  /** Meeting summaries may resolve a source conflict inside its own card. */
  renderReview?: (review: MeetingConflictReview, group: SummaryGroup) => ReactNode;
}) {
  const { width } = useWindowDimensions();
  const [expandedMeetingSections, setExpandedMeetingSections] = useState<Set<string>>(() => new Set());
  if (!sections || sections.length === 0) return null;

  // The summary follows the Meeting Helper instead of turning every source into
  // one undifferentiated bullet stream. Slides become warm working cards;
  // people and decisions retain a second level of hierarchy inside each card.
  if (!art) {
    return (
      <View style={{ gap: 16 }}>
        {sections.map((section) => {
          const canCollapse = section.title === 'How We Arrived';
          const expanded = !canCollapse || expandedMeetingSections.has(section.title);
          const warning = section.tone === 'warning';
          return (
            <View
              key={section.title}
              style={{
                borderRadius: 18,
                borderWidth: 1,
                borderColor: warning ? '#efc7a7' : '#eadfcf',
                backgroundColor: warning ? '#fff8f1' : section.tone === 'warm' ? '#fffaf0' : '#fffdf9',
                overflow: 'hidden',
              }}
            >
              <View style={{ paddingHorizontal: 18, paddingTop: 17, paddingBottom: expanded ? 12 : 17 }}>
                {canCollapse ? (
                  <Pressable
                    onPress={() => setExpandedMeetingSections((current) => {
                      const next = new Set(current);
                      if (next.has(section.title)) next.delete(section.title);
                      else next.add(section.title);
                      return next;
                    })}
                    accessibilityRole="button"
                    accessibilityState={{ expanded }}
                    accessibilityLabel={`${expanded ? 'Hide' : 'Read'} ${section.title}`}
                    className="flex-row items-center"
                  >
                    <Text style={{ fontSize: 22, marginRight: 10 }}>{MEETING_SECTION_ICONS[section.title] ?? '✦'}</Text>
                    <Text style={{ fontFamily: 'LibreBaskerville_700Bold', fontSize: 19, lineHeight: 26, color: '#2d2d2d', flex: 1 }}>
                      {section.title}
                    </Text>
                    <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 13, color: '#8a6a2f' }}>
                      {expanded ? 'Hide' : 'Read'}
                    </Text>
                  </Pressable>
                ) : (
                  <View className="flex-row items-center">
                    <Text style={{ fontSize: 22, marginRight: 10 }}>{MEETING_SECTION_ICONS[section.title] ?? '✦'}</Text>
                    <Text style={{ fontFamily: 'LibreBaskerville_700Bold', fontSize: 19, lineHeight: 26, color: warning ? '#8b4b24' : '#2d2d2d', flex: 1 }}>
                      {section.title}
                    </Text>
                  </View>
                )}
                {expanded && section.intro ? (
                  <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 14.5, lineHeight: 21, color: '#6f6559', marginTop: 8 }}>
                    {section.intro}
                  </Text>
                ) : null}
              </View>

              {expanded ? (
                <View style={{ paddingHorizontal: 18, paddingBottom: 16, gap: 10 }}>
                  {(section.groups ?? []).map((group, groupIndex) => (
                    <View
                      key={`${section.title}-${group.title}-${groupIndex}`}
                      style={{
                        borderRadius: 13,
                        backgroundColor: warning ? '#fffdf9' : '#ffffff',
                        borderWidth: 1,
                        borderColor: warning ? '#f0d7c1' : '#eee6da',
                        padding: 13,
                      }}
                    >
                      <View className="flex-row items-start">
                        <View className="flex-1">
                          <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 15, lineHeight: 21, color: warning ? '#8b4b24' : '#3b342b' }}>
                            {group.title}
                          </Text>
                          {group.meta ? (
                            <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 12, lineHeight: 17, color: '#9a8060', marginTop: 2 }}>
                              {group.meta}
                            </Text>
                          ) : null}
                        </View>
                      </View>
                      <View style={{ marginTop: 7, gap: 6 }}>
                        {group.lines.map((line, lineIndex) => {
                          const duty = line.startsWith('Confirmed duty:');
                          const clean = duty ? line.replace(/^Confirmed duty:\s*/, '') : line;
                          return (
                            <View key={lineIndex} className="flex-row items-start">
                              <Text style={{ color: duty ? '#bd9348' : '#c7a76b', fontSize: 13, lineHeight: 21, marginRight: 8 }}>
                                {duty ? '✓' : '•'}
                              </Text>
                              <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 14.5, lineHeight: 21, color: '#453f37', flex: 1 }}>
                                {duty ? <Text style={{ fontFamily: 'Lato_700Bold', color: '#6d5427' }}>Confirmed duty: </Text> : null}
                                {clean}
                              </Text>
                            </View>
                          );
                        })}
                      </View>
                      {group.review && renderReview ? renderReview(group.review, group) : null}
                    </View>
                  ))}

                  {(section.lines ?? []).map((line, index) => {
                    const indented = line.startsWith('    ');
                    const text = line.trim();
                    return (
                      <View key={index} className="flex-row" style={{ paddingLeft: indented ? 18 : 0 }}>
                        {!indented ? <Text style={{ color: '#b58a39', fontSize: 14, lineHeight: 22, marginRight: 9 }}>•</Text> : null}
                        <Text style={{ fontFamily: 'Lato_400Regular', fontSize: indented ? 14 : 15, lineHeight: 22, color: '#3f3a33', flex: 1 }}>
                          {text}
                        </Text>
                      </View>
                    );
                  })}

                  {section.source_label ? (
                    <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 11.5, lineHeight: 17, color: '#9a8060', marginTop: 2 }}>
                      Source: {section.source_label}
                    </Text>
                  ) : null}
                </View>
              ) : null}
            </View>
          );
        })}
      </View>
    );
  }

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
          {(section.lines ?? []).map((line, index) => {
            const indented = line.startsWith('    ');
            const text = line.trim();
            // A person's name opens their block — give it air above.
            const startsBlock = !indented
              && index > 0
              && (section.lines ?? [])[index - 1]?.startsWith('    ');
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
