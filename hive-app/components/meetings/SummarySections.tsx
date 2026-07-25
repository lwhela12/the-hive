import { View, Text } from 'react-native';

export interface SummarySection {
  title: string;
  lines: string[];
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
 */
export function SummarySections({ sections }: { sections: SummarySection[] }) {
  if (!sections || sections.length === 0) return null;

  return (
    <View>
      {sections.map((section) => (
        <View
          key={section.title}
          className="mb-4 bg-paper rounded-2xl border border-gold/20 px-5 pt-4 pb-3"
        >
          <Text
            style={{
              fontFamily: 'LibreBaskerville_400Regular',
              fontSize: 12,
              letterSpacing: 1.4,
              color: '#9a7c42',
              textTransform: 'uppercase',
            }}
          >
            {section.title}
          </Text>
          <View style={{ height: 1, backgroundColor: '#bd934826', marginTop: 8, marginBottom: 12 }} />
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
      ))}
    </View>
  );
}
