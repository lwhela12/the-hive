import { useState } from 'react';

import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useWhatsNext } from '../../lib/hooks/useWhatsNext';
import { WhatsNextList } from '../hive/WhatsNextList';
import { useAuth } from '../../lib/hooks/useAuth';
import { hiveDisplayName } from '../../lib/hiveBrand';
import { useHiveGrid, type GridHive } from '../../lib/hooks/useHiveGrid';
import { HIVE_RULES } from '../../lib/hiveRules';
import { humanTimeInput } from '../../lib/timeInput';

/**
 * What's next — every HIVE, in date order, at the top of HIVE-Wide Admin.
 *
 * Nat, 2026-09-02: *"this is what I've been missing... what's next is exactly
 * what I was talking about needing. Can we just fold that into the HIVE app,
 * somewhere in HIVE-Wide admin?"*
 *
 * It replaces two things that died of the same disease. Her Google Tasks got
 * messy; the HIVE Task Tracker sheet has not moved since 15 August. Both had to
 * be fed. **Nothing here is fed** — every line is worked out from the meeting
 * rows and current check-in windows each time the panel opens.
 *
 * And nothing falls off it. Her calendar loses a job the day after it was due:
 * *"if it's in my calendar that I need to send something out on the first and
 * then I don't get to it on the first, then on the second I don't see it any
 * more."* Here, a row past its date turns red and climbs.
 */

const LATE = '#c0392b';

export function WhatsNextPanel({
  cellStyle,
  panelStyle,
  bodyStyle,
  scrollStyle,
  Panel,
  order,
}: {
  cellStyle: any;
  panelStyle: any;
  bodyStyle: any;
  scrollStyle: any;
  Panel: React.ComponentType<any>;
  order?: number;
}) {
  const { memberships } = useAuth();
  const { items, state, today } = useWhatsNext();
  const grid = useHiveGrid();
  // The title is the first tab, the way every other folder in Admin works.
  const [tab, setTab] = useState('next');


  return (
    /**
     * The CELL, then the panel.
     *
     * Admin's dashboard is a wrapping row of half-width cells, and every panel
     * carries its own — `cellStyle` is what makes it half a column with gutters
     * and a bottom margin. This one was handed `panelStyle` and `bodyStyle` and
     * nothing else, so it laid itself out beside the grid rather than inside
     * it, and sat on top of OG HIVE's members. Nat, 2026-09-02: *"it looks like
     * this, which violates our Build doc that says nothing ever overlaps."*
     *
     * `order` puts it first; the fixed `panelStyle` height is why the body has
     * to be a scroller rather than growing.
     */
    <View style={[cellStyle, { order } as any]}>
      <Panel
        title="What's next"
        titleTabKey="next"
        tabs={[
          { key: 'grid', label: 'The grid' },
          { key: 'rules', label: 'The rules' },
        ]}
        activeTab={tab}
        onTabChange={setTab}
        style={panelStyle}
        bodyStyle={bodyStyle}
      >
        <ScrollView style={scrollStyle} contentContainerStyle={{ paddingBottom: 4 }}>
        {tab === 'rules' ? (
          <RulesTab />
        ) : tab === 'grid' ? (
          <GridTab grid={grid} />
        ) : (
          <WhatsNextList />
        )}
        </ScrollView>
      </Panel>
    </View>
  );
}

/* ------------------------------------------------------------------ the grid */

/**
 * Every HIVE side by side. Scrolls sideways in half a column rather than
 * squeezing four columns into it — a table that wraps is a table nobody reads.
 */
function GridTab({ grid }: { grid: ReturnType<typeof useHiveGrid> }) {
  if (grid.state === 'loading') {
    return (
      <View style={{ padding: 20, alignItems: 'center' }}>
        <ActivityIndicator size="small" color="#fffdf5" />
      </View>
    );
  }
  if (grid.state === 'error') {
    return (
      <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 13, color: '#ffb4a8', padding: 14, lineHeight: 19 }}>
        This did not load, so none of it is being shown as true. Pull down to try again.
      </Text>
    );
  }

  const rows: { label: string; hint?: string; cell: (hive: GridHive) => React.ReactNode }[] = [
    { label: 'Members', cell: (h) => <Plain>{String(h.members)}</Plain> },
    {
      label: 'Next meeting',
      cell: (h) => h.nextMeeting
        ? (
          <>
            <Plain bold>{pretty(h.nextMeeting.date)}</Plain>
            <Quiet>
              {[humanTimeInput(h.nextMeeting.time), h.nextMeeting.location].filter(Boolean).join(' · ')}
              {h.nextMeeting.onMeet ? ' + Meet' : ''}
            </Quiet>
          </>
        )
        : <Quiet>nothing booked</Quiet>,
    },
    {
      label: 'Before we meet',
      hint: 'who has answered',
      cell: (h) => h.beforeWeMeet
        ? (
          <>
            <Plain bold>{h.beforeWeMeet.answered} of {h.beforeWeMeet.of}</Plain>
            <Quiet>due {pretty(h.beforeWeMeet.due)}</Quiet>
          </>
        )
        : <Quiet>none open</Quiet>,
    },
    {
      label: 'End of the month',
      hint: 'who has answered',
      // It said "not counted — ticked off in their own browser" on all three
      // rows, which stopped being true the day the check-in became one
      // HIVE-Wide row: nothing was ticking anything in a browser, the grid
      // simply could not see a survey belonging to no HIVE. (Audit, 2 Sept.)
      cell: (h) => h.endOfMonth
        ? (
          <>
            <Plain bold>{h.endOfMonth.answered} of {h.endOfMonth.of}</Plain>
            <Quiet>
              {h.endOfMonth.wide ? 'one ask, everybody · ' : ''}due {pretty(h.endOfMonth.due)}
            </Quiet>
          </>
        )
        : !h.endOfMonthCounted
          // Never a zero here. Nothing counted it, which is a different and
          // much kinder claim than "nobody did it".
          ? <Quiet>not counted</Quiet>
          : <Quiet>none open</Quiet>,
    },
    {
      label: 'A member can share',
      // The HIVE's CEILING is not the member's offer. `public` on OG and Tech
      // governs the newsletter and the invitation, both of which Nat writes —
      // no member can publish anything, in any HIVE, so printing "public" here
      // described a door that does not exist. (Audit, 2 Sept.)
      cell: (h) => h.ceiling === 'hive'
        ? (
          <>
            <Plain bold>this HIVE only</Plain>
            <Quiet>nothing leaves it</Quiet>
          </>
        )
        : (
          <>
            <Plain>this HIVE · HIVE-Wide</Plain>
            <Quiet>public is yours to write, never theirs</Quiet>
          </>
        ),
    },
    { label: 'Honey Pot', cell: (h) => h.honeyPot ? <Plain>yes · $25 a quarter</Plain> : <Quiet>no</Quiet> },
  ];

  return (
    <View>
      <View style={{ paddingHorizontal: 14, paddingTop: 10, paddingBottom: 4 }}>
        <Quiet>
          {grid.peopleAcrossAllHives} people across every HIVE — several are in more than one, so
          the columns add up to more than that.
        </Quiet>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={{ paddingHorizontal: 14, paddingBottom: 8 }}>
          <View style={{ flexDirection: 'row', paddingVertical: 8, gap: 12 }}>
            <View style={{ width: 118 }} />
            {grid.hives.map((hive) => (
              <View key={hive.communityId} style={{ width: 150 }}>
                <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 12.5, color: '#F6F4E5' }}>
                  {hiveDisplayName(hive.name)}
                </Text>
              </View>
            ))}
          </View>
          {rows.map((row) => (
            <View
              key={row.label}
              style={{
                flexDirection: 'row', gap: 12, paddingVertical: 9,
                borderTopWidth: 1, borderTopColor: 'rgba(246,244,229,0.12)',
              }}
            >
              <View style={{ width: 118 }}>
                <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 11.5, color: 'rgba(246,244,229,0.6)' }}>
                  {row.label}
                </Text>
                {row.hint ? <Quiet>{row.hint}</Quiet> : null}
              </View>
              {grid.hives.map((hive) => (
                <View key={hive.communityId} style={{ width: 150 }}>{row.cell(hive)}</View>
              ))}
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

/* ----------------------------------------------------------------- the rules */

function RulesTab() {
  return (
    <View style={{ paddingBottom: 6 }}>
      {HIVE_RULES.map((group) => (
        <View key={group.heading}>
          <Text
            style={{
              fontFamily: 'Lato_700Bold', fontSize: 10.5, letterSpacing: 1,
              textTransform: 'uppercase', color: '#e8c583',
              paddingHorizontal: 14, paddingTop: 14, paddingBottom: 2,
            }}
          >
            {group.heading}
          </Text>
          {group.rules.map((rule) => (
            <View
              key={rule.text}
              style={{
                paddingHorizontal: 14, paddingVertical: 9,
                borderTopWidth: 1, borderTopColor: 'rgba(246,244,229,0.12)',
              }}
            >
              <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 13, lineHeight: 19, color: '#F6F4E5' }}>
                {rule.text}
              </Text>
              {/* Named so a rule that changes in code and not here is findable,
                  rather than quietly becoming a lie on a page Nat trusts. */}
              <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 10.5, color: 'rgba(246,244,229,0.45)', marginTop: 3 }}>
                {rule.source}
              </Text>
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

function Plain({ children, bold }: { children: React.ReactNode; bold?: boolean }) {
  return (
    <Text style={{ fontFamily: bold ? 'Lato_700Bold' : 'Lato_400Regular', fontSize: 12.5, color: '#F6F4E5' }}>
      {children}
    </Text>
  );
}

function Quiet({ children }: { children: React.ReactNode }) {
  return (
    <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 11, lineHeight: 15, color: 'rgba(246,244,229,0.55)', marginTop: 2 }}>
      {children}
    </Text>
  );
}

const M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function pretty(dateOnly: string): string {
  const [, m, d] = dateOnly.split('-').map(Number);
  return `${M[m - 1]} ${d}`;
}
