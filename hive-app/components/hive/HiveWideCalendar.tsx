import { useMemo, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { HiveMark } from '../ui/HiveMark';
import {
  accentOnDark,
  hiveAccent,
  hiveDisplayName,
  normalizeHiveBrandText,
} from '../../lib/hiveBrand';
import { formatDateShort, formatTime } from '../../lib/dateUtils';
import { getLocalIsoDate } from '../../lib/hooks/useArrivalBoard';
import { useHiveWideMeetings, type HiveWideMeetingDay } from '../../lib/hooks/useHiveWideMeetings';
import type { Community } from '../../types';

/**
 * The HIVE-Wide calendar — the whole month of HIVE life at a glance.
 *
 * Nat's parked idea, her words (2026-08-12): "A genuinely HIVE-Wide calendar,
 * with a coloured bee per HIVE's meeting day." The "Your Meetings" box next
 * door lists the meetings YOU are expected at; this is the other half of the
 * view from up here — every HIVE's meeting days, each wearing its own HIVE's
 * colour, including the HIVEs you are not in.
 *
 * The marker is a bee sitting on a honeycomb cell filled in that HIVE's accent
 * — the same cell the rail, the wishes and the meetings box already use, so a
 * gold cell means OG wherever you see one. Two HIVEs meeting the same day is
 * two bees side by side. The accents go through `accentOnDark` because this
 * lives on HIVE-Wide's night sky, where Tech's blue is otherwise unreadable.
 *
 * Tapping a marked day names what's there under the grid. A meeting of a HIVE
 * you belong to is a door — it steps you into that HIVE's Meetings page, same
 * as the meetings box. A HIVE you are not in is a fact, so it gets no arrow
 * and no press: the day and time travel up here (migration 176), the Meet
 * link, notes and recordings never do.
 *
 * The grid itself never scrolls — a calendar is a fixed shape, and a scroll
 * inside it would be a scroll inside a scroll. Walking months is the arrows.
 */

type CalendarColours = {
  ink: string;
  inkSoft: string;
  fill: string;
  border: string;
  accent: string;
  pressed: string;
};

/** Sunday-first, the way the paper calendars everyone here grew up on run. */
const WEEKDAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

const pad = (n: number) => String(n).padStart(2, '0');
const isoOf = (year: number, month: number, day: number) =>
  `${year}-${pad(month + 1)}-${pad(day)}`;

/**
 * One bee on its HIVE's cell. The hexagon carries the colour and the bee sits
 * on it — a bare 🐝 at this size is a brown smudge that says nothing about
 * WHOSE meeting it is, and a bare hexagon already means "a HIVE" elsewhere on
 * the page without saying "meeting". Together they read as both, even small.
 */
function BeeOnCell({ colour, size }: { colour: string; size: number }) {
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ position: 'absolute' }}>
        <HiveMark size={size} colour={colour} />
      </View>
      {/* The bee only rides along when the cell is big enough to carry it —
          below ~14 points the emoji rasterises into noise, and a crowded day
          shrinks its marks (see the slice in the day cell). */}
      {size >= 14 ? (
        <Text style={{ fontSize: size * 0.55, lineHeight: size }}>🐝</Text>
      ) : null}
    </View>
  );
}

export function HiveWideCalendar({
  hives,
  myHiveIds,
  colours,
  onOpenMeetings,
}: {
  /** Every HIVE, for names and accents — hive-wide.tsx already fetched them. */
  hives: Community[];
  /** The HIVEs this person belongs to — their meetings become doors. */
  myHiveIds: string[];
  /** The page's one palette (PANEL_COLOURS), so this box cannot drift. */
  colours: CalendarColours;
  /** Step into a HIVE and open its Meetings page. */
  onOpenMeetings: (communityId: string) => void;
}) {
  // The month on show, held as its first day. Today's month to start.
  const [monthStart, setMonthStart] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  // The day whose meetings are spelled out under the grid, as YYYY-MM-DD.
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const year = monthStart.getFullYear();
  const month = monthStart.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const fromIso = isoOf(year, month, 1);
  const toIso = isoOf(year, month, daysInMonth);
  const todayIso = getLocalIsoDate(new Date());

  const { meetings } = useHiveWideMeetings(fromIso, toIso);

  const meetingsByDay = useMemo(() => {
    const byDay = new Map<string, HiveWideMeetingDay[]>();
    meetings.forEach((meeting) => {
      const list = byDay.get(meeting.event_date);
      if (list) list.push(meeting);
      else byDay.set(meeting.event_date, [meeting]);
    });
    return byDay;
  }, [meetings]);

  const walkMonth = (step: number) => {
    setMonthStart((was) => new Date(was.getFullYear(), was.getMonth() + step, 1));
    // The old selection belongs to the old month; carrying it over would leave
    // the summary describing a day the grid no longer shows.
    setSelectedDay(null);
  };

  const monthName = monthStart.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const selectedMeetings = selectedDay ? meetingsByDay.get(selectedDay) ?? [] : [];

  // Faint ink for the weekday letters and the empty-day numbers, made from the
  // page's soft ink rather than invented here, so the box drifts with its page.
  const inkFaint = colours.inkSoft;

  return (
    <View style={{ gap: 10 }}>
      {/* The month and the arrows that walk it. */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Pressable
          onPress={() => walkMonth(-1)}
          accessibilityRole="button"
          accessibilityLabel="Previous month"
          hitSlop={10}
          style={({ pressed }) => ({
            padding: 4, borderRadius: 999,
            backgroundColor: pressed ? colours.pressed : 'transparent',
          })}
        >
          <Ionicons name="chevron-back" size={17} color={colours.accent} />
        </Pressable>
        <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 14.5, letterSpacing: 0.4, color: colours.ink }}>
          {monthName}
        </Text>
        <Pressable
          onPress={() => walkMonth(1)}
          accessibilityRole="button"
          accessibilityLabel="Next month"
          hitSlop={10}
          style={({ pressed }) => ({
            padding: 4, borderRadius: 999,
            backgroundColor: pressed ? colours.pressed : 'transparent',
          })}
        >
          <Ionicons name="chevron-forward" size={17} color={colours.accent} />
        </Pressable>
      </View>

      {/* Weekday letters, then the days, all in one wrapping row of sevenths —
          percentage widths so the grid fits whatever column it is given, which
          is a phone's full width or half a desktop's 1240. */}
      <View style={{ flexDirection: 'row' }}>
        {WEEKDAY_LETTERS.map((letter, i) => (
          <Text
            key={i}
            style={{
              width: `${100 / 7}%`, textAlign: 'center',
              fontFamily: 'Lato_700Bold', fontSize: 10, letterSpacing: 0.8,
              color: inkFaint,
            }}
          >
            {letter}
          </Text>
        ))}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {/* Blank cells walk the 1st to its weekday column. */}
        {Array.from({ length: monthStart.getDay() }, (_, i) => (
          <View key={`blank-${i}`} style={{ width: `${100 / 7}%`, height: 46 }} />
        ))}
        {Array.from({ length: daysInMonth }, (_, i) => {
          const day = i + 1;
          const dayIso = isoOf(year, month, day);
          const dayMeetings = meetingsByDay.get(dayIso) ?? [];
          // One bee per HIVE, not per meeting — the marker answers "who is
          // meeting today", and the lines under the grid list the meetings.
          const hivesToday = Array.from(new Set(dayMeetings.map((m) => m.community_id)));
          // A day three or more HIVEs share drops to bare cells so they still
          // sit side by side inside the seventh — see BeeOnCell.
          const markSize = hivesToday.length >= 3 ? 11 : 16;
          const isToday = dayIso === todayIso;
          const isSelected = dayIso === selectedDay;

          return (
            <Pressable
              key={dayIso}
              // A day with nothing on it has nothing to reveal, so it is not a
              // button — a screen reader walking the grid should only stop on
              // days that answer back.
              disabled={dayMeetings.length === 0}
              onPress={() => setSelectedDay((was) => (was === dayIso ? null : dayIso))}
              accessibilityRole="button"
              accessibilityLabel={
                `${monthName.split(' ')[0]} ${day}, ` +
                (dayMeetings.length === 0
                  ? 'no meetings'
                  : `${dayMeetings.length === 1 ? '1 meeting' : `${dayMeetings.length} meetings`}`)
              }
              style={{
                width: `${100 / 7}%`, height: 46,
                alignItems: 'center', paddingTop: 3,
                borderRadius: 10,
                backgroundColor: isSelected ? colours.pressed : 'transparent',
              }}
            >
              {/* Today wears a quiet ring; every other day wears an invisible
                  one, so the numbers all sit at the same height. */}
              <View
                style={{
                  width: 22, height: 22, borderRadius: 11,
                  borderWidth: 1,
                  borderColor: isToday ? colours.accent : 'transparent',
                  alignItems: 'center', justifyContent: 'center',
                }}
              >
                <Text
                  style={{
                    fontFamily: isToday ? 'Lato_700Bold' : 'Lato_400Regular',
                    fontSize: 12,
                    color: dayMeetings.length > 0 || isToday ? colours.ink : inkFaint,
                  }}
                >
                  {day}
                </Text>
              </View>
              {hivesToday.length > 0 ? (
                <View style={{ flexDirection: 'row', gap: 1, marginTop: 1 }}>
                  {hivesToday.map((hiveId) => (
                    <BeeOnCell
                      key={hiveId}
                      colour={accentOnDark(hiveAccent(hives.find((h) => h.id === hiveId)))}
                      size={markSize}
                    />
                  ))}
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </View>

      {/* Under the grid: what the tapped day holds, or a word of guidance, or
          the honest truth about an empty month. */}
      {selectedDay && selectedMeetings.length > 0 ? (
        <View style={{ gap: 7 }}>
          {selectedMeetings.map((meeting) => {
            const hive = hives.find((h) => h.id === meeting.community_id);
            const name = hiveDisplayName(hive?.name);
            const colour = accentOnDark(hiveAccent(hive));
            const when = [
              formatDateShort(meeting.event_date),
              meeting.event_time ? formatTime(meeting.event_time) : null,
            ].filter(Boolean).join(', ');
            const mine = myHiveIds.includes(meeting.community_id);

            const line = (
              <>
                <View style={{ paddingTop: 2 }}>
                  <HiveMark size={12} colour={colour} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 13.5, color: colours.ink, lineHeight: 18 }}>
                    {name}
                    <Text style={{ fontFamily: 'Lato_400Regular', color: colours.inkSoft }}>
                      {'  —  '}{when}
                    </Text>
                  </Text>
                  {/* A HIVE that keeps things at home sends its title back as
                      null (migration 176); the bee and the when are the whole
                      story then, so no second line. */}
                  {meeting.title ? (
                    <Text
                      style={{ fontFamily: 'Lato_400Regular', fontSize: 12, color: colours.inkSoft, marginTop: 1 }}
                      numberOfLines={2}
                    >
                      {normalizeHiveBrandText(meeting.title)}
                    </Text>
                  ) : null}
                </View>
                {mine ? <Ionicons name="arrow-forward" size={14} color={colour} /> : null}
              </>
            );

            const rowStyle = {
              flexDirection: 'row' as const, alignItems: 'flex-start' as const, gap: 8,
              paddingVertical: 8, paddingHorizontal: 10,
              borderRadius: 10, borderWidth: 1,
              borderColor: colours.border, backgroundColor: colours.fill,
            };

            // Your own HIVE's meeting is a door into its Meetings page, where
            // the deck, the notes and the link live. Somebody else's HIVE's
            // meeting is a fact, not a door — no press, no arrow.
            return mine ? (
              <Pressable
                key={meeting.id}
                onPress={() => onOpenMeetings(meeting.community_id)}
                accessibilityRole="button"
                accessibilityLabel={`Open ${name} meetings`}
                style={rowStyle}
              >
                {line}
              </Pressable>
            ) : (
              <View key={meeting.id} style={rowStyle}>
                {line}
              </View>
            );
          })}
        </View>
      ) : meetings.length > 0 ? (
        <Text
          style={{
            fontFamily: 'Lato_400Regular', fontStyle: 'italic', fontSize: 12.5,
            lineHeight: 18, color: colours.inkSoft, textAlign: 'center',
          }}
        >
          Tap a bee&rsquo;s day to see whose meeting it is.
        </Text>
      ) : (
        <Text
          style={{
            fontFamily: 'Lato_400Regular', fontStyle: 'italic', fontSize: 12.5,
            lineHeight: 18, color: colours.inkSoft, textAlign: 'center',
          }}
        >
          No meetings on this month&rsquo;s books.
        </Text>
      )}
    </View>
  );
}
