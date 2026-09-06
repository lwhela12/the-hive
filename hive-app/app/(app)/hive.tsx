import { TimeInput } from '../../components/ui/TimeInput';
import { parseTimeInput } from '../../lib/timeInput';
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { View, Text, ScrollView, RefreshControl, Image, useWindowDimensions, Pressable, Linking, Modal, TextInput, ActivityIndicator, Animated, Platform } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Polygon } from 'react-native-svg';
import { SafeAreaView } from '../../components/ui/SafeArea';
import { supabase } from '../../lib/supabase';
// Home used to tell people things with `Alert.alert`, which does nothing at all
// in a browser — and nearly everybody is in a browser. Eleven explanations were
// being thrown away here, several of them beside an optimistic undo, so a tick
// un-ticked itself and a task came back with no word about why. `showAlert` and
// `confirmAction` say it on both platforms (see `lib/showAlert.ts`).
import { showAlert, confirmAction } from '../../lib/showAlert';
import { getHalfwayDoneKey } from '../../lib/meetingCycle';
import {
  SEASON_CHECK_IN_EMOJI,
  getHalfwayShape,
  getSeasonCheckInKind,
  isEndOfMonthCheckInSurvey,
  isPreMeetingCheckInSurvey,
  isInHalfwayWindow,
  isSurveyOnHomeToday,
  checkInDisplayName,
} from '../../lib/checkIns';
import { pacificToday } from '../../lib/checkInPresentation';
import { useAuth } from '../../lib/hooks/useAuth';
import { useHiveDataQuery } from '../../lib/hooks/useHiveDataQuery';
import { useWishes } from '../../lib/hooks/useWishes';
import { invalidateWishQueries } from '../../lib/queryClient';
import { deleteWishById, restoreWishById } from '../../lib/wishMutations';
import { UndoBar, useUndoOffer } from '../../components/ui/UndoBar';
import {
  hasMeaningfulActionItemText,
  parseActionItemDescription,
} from '../../lib/actionItemDisplay';
import { HiveMark } from '../../components/ui/HiveMark';
import { isInvitedToEvent, getEventEmoji, getEventHiveIcon } from '../../lib/eventDisplay';
import { HiveIcon, type HiveIconName } from '../../components/ui/HiveIcon';
import { ModalBackdrop } from '../../components/ui/ModalBackdrop';
import { BounceScrollView } from '../../components/ui/BounceScrollView';
import { CloseButton } from '../../components/ui/CloseButton';
import { EditButton } from '../../components/ui/EditButton';
import { useActivityFeed, type ActivityItem } from '../../lib/hooks/useActivityFeed';
import { getSurveyResponsePeriod, isMonthlyCheckInSurvey, useSurveys, type Survey, type SurveyAnswers } from '../../lib/hooks/useSurveys';
import { useCarryForwardContext } from '../../lib/hooks/useCarryForwardContext';
import { useAppUpdate, checkForUpdateNow } from '../../lib/hooks/useAppUpdate';
import { useInstallPrompt } from '../../lib/hooks/useInstallPrompt';
import { useWebAppDisplayMode } from '../../lib/hooks/useWebAppDisplayMode';
import { SurveyModal } from '../../components/surveys/SurveyModal';
import { WishCard } from '../../components/hive/WishCard';
import { WishDetail } from '../../components/hive/WishDetail';
import { GrantWishModal } from '../../components/hive/GrantWishModal';
import { HeaderTabs, HeaderActionPill } from '../../components/ui/HeaderTabs';
import { AddWishModal } from '../../components/wishes/AddWishModal';
import { WishManageModal } from '../../components/wishes/WishManageModal';
import {
  EventsListSkeleton,
  WishSectionSkeleton,
} from '../../components/hive/skeletons';
import { AppHeader } from '../../components/navigation';
import { userFacingError } from '../../lib/userFacingError';
import { hiveAccent } from '../../lib/hiveBrand';
import { useAddToCalendar } from '../../components/ui/AddToCalendarDialog';
import { ScopeBadge } from '../../components/ui/ScopeBadge';
import { EventScopeFields, saveBirthdayScope, type EventAudience } from '../../components/events/EventAudienceToggle';
import { SignedAvatarImage } from '../../components/ui/Avatar';
import { DAILY_QUESTIONS, deckForCommunity, getQuestionForDate, getTodayQuestion } from '../../lib/dailyQuestions';
import type { DailyQuestion } from '../../lib/dailyQuestions';
import { EventDatePicker } from '../../components/ui/DatePicker';
import { formatDateRangeShort, formatDateShort, formatTime, parseAmericanDate, formatTimeRange } from '../../lib/dateUtils';
import { ConfettiBurst } from '../../components/ui/ConfettiBurst';
import { getStoredItem, getStoredItemAsync, removeStoredItem, setStoredItem, setStoredItemAsync } from '../../lib/webStorage';
import { getAppNewsSeenKey, getNewestAppNews, getUnseenAppNews, type AppNewsEntry } from '../../lib/appNews';
import { useAppNews } from '../../lib/hooks/useAppNews';
import { createCalendarEvent } from '../../lib/eventMutations';
import { loadActivityRead, persistActivityRead, loadAppNewsSeen, persistAppNewsSeen } from '../../lib/readState';
import { clearBoardNavigationState } from '../../lib/boardNavigation';
import { addHomeResetListener } from '../../lib/homeNavigation';
import { useOpenFeedback } from '../../lib/openFeedback';
import { getHdWishTabLabel, type HdWishTabKey } from '../../lib/wishDisplay';
import {
  QUARTERLY_DUES_AMOUNT,
  type DuesPeriod,
  duesTransactionsCoverMember,
  getCurrentDuesPeriod,
  getDuesPeriodEndDate,
  isQuarterlyDuesReminderEvent,
} from '../../lib/dues';
import { HONEY_POT_CASH_APP_HANDLE } from '../../lib/honeyPotPayment';
import type { Profile, Wish, WishGranter, Event, ActionItem } from '../../types';

import { ComposerBar } from '../../components/ui/ComposerBar';
import { FIELD_LOOK } from '../../components/ui/Input';
import { LocationSearchInput } from '../../components/ui/LocationSearchInput';
import { ThinkingBee } from '../../components/ui/ThinkingBee';
type WishWithGranters = Wish & {
  user?: Profile | null;
  granters?: (WishGranter & { granter?: Profile })[];
};

type WishStatusTabKey = HdWishTabKey;
type TodoStatusTabKey = 'open' | 'done';

type HomeTodo = {
  id: string;
  emoji: string;
  /** Ionicons name — the check-in's one true mark (gold outline) beats emoji. */
  iconName?: string;
  title: string;
  detail?: string;
  cta?: string;
  ctaOnPress?: () => void;
  isDone?: boolean;
  completedAt?: string | null;
  onPress?: () => void;
  onToggle?: () => void;
  onLongPress?: () => void;
  onArchive?: () => void;
};

const CATCH_UP_BATCH_SIZE = 7;
const CATCH_UP_MAX_DAYS = DAILY_QUESTIONS.length;
// Screens that deep-link into Catch up (/hive?catchup=1&from=X) and where
// closing it should put you back. Add a line here when a new door opens.
// Retrace your steps: anything that deep-links into Home says where it came
// from, and closing the sheet puts you back there instead of stranding you on
// the HIVE tab.
const CATCH_UP_RETURN_PATHS: Record<string, { pathname: string; params?: Record<string, string> }> = {
  swarm: { pathname: '/members', params: { view: 'swarm' } },
  profile: { pathname: '/profile' },
};

const getRecentDailyQuestions = (deck: DailyQuestion[], days = CATCH_UP_BATCH_SIZE) => {
  const dayCount = Math.min(Math.max(days, 1), Math.min(CATCH_UP_MAX_DAYS, deck.length));
  return Array.from({ length: dayCount }, (_, offset) => {
    const date = new Date();
    date.setDate(date.getDate() - offset);
    return getQuestionForDate(date, deck);
  });
};

const formatSurveyDueDate = (dueDate: string) => {
  const parsed = new Date(dueDate);
  if (Number.isNaN(parsed.getTime())) return dueDate;

  return parsed.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
};

const normalizeEventTimeInput = (value: string) => {
  const raw = value.trim();
  if (!raw) return { time: null, note: '' };
  if (/^[\d:\s]+(?:am|pm)?$/i.test(raw)) return { time: parseTimeInput(raw), note: '' };

  // Postgres hands a `time` column back as "17:30:00", and the edit form used
  // to put that straight into this box — where the old exact-match pattern
  // rejected it (it ends in an extra ":00"), fell through to the loose match,
  // and returned the WHOLE string as a "note". That note then got written into
  // the description as "Time note: 17:30:00", and because editing re-ran all of
  // this every save, a second identical line appeared each time. That is the
  // doubled "Time note: 17:30:00" with no description Nat photographed
  // (2026-08-04): both lines were generated, and they had pushed her actual
  // description out of view.
  const secondsMatch = raw.match(/^(\d{1,2}):(\d{2}):(\d{2})$/);
  if (secondsMatch) {
    const h = Number(secondsMatch[1]);
    const m = Number(secondsMatch[2]);
    if (h <= 23 && m <= 59) {
      return { time: `${String(h).padStart(2, '0')}:${secondsMatch[2]}`, note: '' };
    }
  }

  const exactMatch = raw.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
  const looseMatches = [...raw.matchAll(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/gi)];
  const looseMatch = looseMatches[0];
  const match = exactMatch || looseMatch;
  if (!match) return { time: null, note: raw };

  let hour = Number(match[1]);
  const minute = match[2] ?? '00';
  const laterMeridiem = looseMatches.find((timeMatch) => timeMatch[3])?.[3]?.toLowerCase();
  const meridiem = match[3]?.toLowerCase() ?? laterMeridiem;

  if (hour < 1 || hour > 23 || Number(minute) > 59) {
    return { time: null, note: raw };
  }

  if (meridiem === 'pm' && hour < 12) hour += 12;
  if (meridiem === 'am' && hour === 12) hour = 0;

  return {
    time: `${String(hour).padStart(2, '0')}:${minute}`,
    note: exactMatch ? '' : raw,
  };
};

/** "17:30:00" -> "5:30 PM", for putting a saved time back in the box. */
const timeForEditing = (value?: string | null) => {
  if (!value) return '';
  const m = value.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return value;
  const h24 = Number(m[1]);
  const meridiem = h24 >= 12 ? 'PM' : 'AM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${m[2]} ${meridiem}`;
};

/**
 * Strip the generated "Time note: …" lines back off a description.
 *
 * Without this, editing an event prepends a fresh one on top of the one already
 * there, every single time. Three edits, three lines.
 */
const withoutTimeNotes = (description?: string | null) =>
  (description ?? '')
    .split(/\n{2,}/)
    .filter((block) => !/^Time note:/i.test(block.trim()))
    .join('\n\n')
    .trim();

const formatDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getQuarterlyDuesActionTitle = (period: DuesPeriod) =>
  `Quarterly dues for Q${period.quarter} ${period.year}`;

const getDuesPeriodKey = (period: DuesPeriod) =>
  `${period.year}-q${period.quarter}`;

const isQuarterlyDuesActionItem = (
  item: ActionItem,
  period: DuesPeriod,
  dueDateKey: string
) => {
  const description = item.description.trim().toLowerCase();
  if (!description.startsWith('quarterly dues')) return false;

  const itemDueDate = typeof item.due_date === 'string' ? item.due_date.slice(0, 10) : null;
  if (itemDueDate === dueDateKey) return true;

  return description.includes(`q${period.quarter}`) && description.includes(String(period.year));
};

function EventsList({ events, onEditEvent }: { events: Event[]; onEditEvent: (event: Event) => void }) {
  // Half the members keep Apple Calendar and half keep Google, so the button
  // asks rather than guessing (Nat, 2026-09-03).
  const addToCalendar = useAddToCalendar();
  // Who you are, so an event you can only SEE does not hand you the address and
  // the joining link (migration 148).
  const { memberships, profile, refreshProfile } = useAuth();
  const myCommunityIds = memberships.map((m) => m.community_id);

  // The birthday whose "who sees this" editor is open, plus its draft values.
  // Only tapping your OWN birthday's card ever opens this (`isOwnBirthday`,
  // checked in the card's onPress below), so there is never more than one
  // person's edit in flight against this shared bit of state.
  const [editingBirthdayId, setEditingBirthdayId] = useState<string | null>(null);
  const [draftBirthdaySeen, setDraftBirthdaySeen] = useState<EventAudience>('members');
  const [draftBirthdayInvited, setDraftBirthdayInvited] = useState<EventAudience>('members');
  const [savingBirthdayScope, setSavingBirthdayScope] = useState(false);

  const startEditingBirthday = (event: Event) => {
    setEditingBirthdayId(event.id);
    setDraftBirthdaySeen((((event as any).visibility as EventAudience) ?? 'members'));
    setDraftBirthdayInvited((((event as any).invited_scope as EventAudience) ?? 'members'));
  };

  const saveBirthdayEdit = async (event: Event) => {
    if (!event.related_user_id) return;
    setSavingBirthdayScope(true);
    const { error } = await saveBirthdayScope({
      profileId: event.related_user_id,
      visibility: draftBirthdaySeen,
      invitedScope: draftBirthdayInvited,
      communityId: event.community_id,
    });
    setSavingBirthdayScope(false);
    if (error) {
      showAlert('Could not save', 'Your birthday visibility did not save. Please try again.');
      return;
    }
    setEditingBirthdayId(null);
    // Editing here only ever happens on your own birthday (isOwnBirthday gate
    // below), so this is always you — refresh the profile context too, or
    // `profile.tsx` would keep showing what you had before until its own
    // fetch happened to run again.
    await refreshProfile();
  };

  return (
    <View className="bg-white rounded-xl shadow-sm overflow-hidden">
      {events.map((event, index) => {
        // Who can see it, and who's invited. Birthdays carry these too:
        // `getNextBirthdayEvent` in `useHiveDataQuery` copies
        // `profiles.birthday_visibility` / `birthday_invited_scope`
        // (migration 164) onto the synthetic event as `visibility` /
        // `invited_scope` — the exact fields a real event uses — so this one
        // check reads both without needing to know which kind of event it is.
        const seenScope = (event as any).visibility ?? 'members';
        const invitedScope = (event as any).invited_scope ?? seenScope;
        const isOwnBirthday = event.event_type === 'birthday' && !!profile?.id && event.related_user_id === profile.id;
        const isEditingThisBirthday = editingBirthdayId === event.id;
        return (
        <Pressable
          key={event.id}
          onPress={() => {
            // One rule for every editable card: tap anywhere on it to edit it
            // (Nat, 2026-08-11, comparing cards: "we want the way you edit an
            // event to always be the same, not sometimes click wherever in it
            // & sometimes here"). A regular event opens the event editor; your
            // own birthday opens its "who sees this" editor inline — the same
            // one an "Edit who sees this" pill used to open, which is gone
            // now. Someone else's birthday has nothing you can edit, so it
            // stays inert. While the birthday editor is open, taps on the card
            // do nothing, so a stray tap around the toggles never resets an
            // in-progress draft.
            if (event.event_type === 'birthday') {
              if (isOwnBirthday && !isEditingThisBirthday) startEditingBirthday(event);
              return;
            }
            onEditEvent(event);
          }}
          className={`p-4 active:bg-gray-50 ${index < events.length - 1 ? 'border-b border-cream' : ''}`}
        >
          <View className="flex-row items-start">
            {/* Plain emoji everywhere now (Nat 2026-08-04). The drawn icon
                branch that used to sit here was shadowing an emoji that was
                already chosen and already correct. */}
            {/* A HIVE's own meeting wears that HIVE's comb, in its colour.
                Nat, 2026-08-05: "I think our OG HIVE meeting should have this
                icon, instead of generic bee emoji." Every HIVE's meeting was
                drawing the same bee, so on a calendar carrying three HIVEs the
                one glyph that should have told you whose it was told you
                nothing. Everything else keeps its emoji. */}
            <View className="mr-3" style={{ width: 26, alignItems: 'center' }}>
              {event.event_type === 'meeting' ? (
                <HiveMark
                  size={22}
                  colour={hiveAccent(
                    memberships.find((m) => m.community_id === (event as any).community_id)?.community,
                  )}
                />
              ) : (
                <Text className="text-2xl">{getEventEmoji(event)}</Text>
              )}
            </View>
            <View className="flex-1">
              <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-charcoal">{event.title}</Text>
              <View className="flex-row flex-wrap items-center mt-1">
                <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-sm text-charcoal/60">
                  {formatDateRangeShort(event.event_date, event.end_date)}
                </Text>
                {event.event_time && (
                  <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-sm text-charcoal/60">
                    {' '}at {formatTimeRange(event.event_time, event.end_time)}
                  </Text>
                )}
                {!event.event_time && !!event.end_date && (
                  <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-sm text-charcoal/60">
                    {' '}· all day
                  </Text>
                )}
              </View>
              {event.location && isInvitedToEvent(event as never, myCommunityIds) && (
                <Pressable
                  onPress={(e) => {
                    e.stopPropagation();
                    Linking.openURL(`https://maps.google.com/?q=${encodeURIComponent(event.location!)}`);
                  }}
                  className="flex-row items-center mt-1 active:opacity-60"
                >
                  <Text className="text-xs mr-1">📍</Text>
                  <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-sm text-gold underline">
                    {event.location}
                  </Text>
                </Pressable>
              )}
            </View>
          </View>
          {/* Three separate rows instead of one wrapping one (Nat, 2026-08-11:
              she wanted seen-by, invited and the buttons each on their own
              line rather than wrapping together). Row 1 is who can see it,
              row 2 is who's invited, row 3 is the actions — always all three,
              on every card, whatever kind of event it is. This used to
              collapse rows 1 and 2 into one bare, unlabelled badge whenever
              they matched (the common case), which read fine right up until
              a card's two answers actually differed and a lone black
              "Public" pill showed up with no word saying which question it
              answered. Nat, 2026-08-05, on exactly that: "when i see these, i
              think 'oh no, i invited the whole public' and thats not what i
              did, i just toggled the visibility settings." Nat, 2026-08-11,
              after a fresh walkthrough of the collapsed version on a
              different card: "Every single one needs to have the same info:
              Seen by ... Invited ... We need to make sure that they all
              function the same way." Two cards behaving differently was the
              actual bug — a viewer can't learn "no label means they match"
              from one card and then trust it on the next, so the label and
              the row are never conditional now.

              Birthdays carry their own visibility (migration 164), computed
              above as seenScope/invitedScope, same as a real event. */}
          <View className="flex-row flex-wrap gap-2 mt-3">
            {/* Whose it is and how far it goes, right on the row. You can't
                respect a boundary you can't see — and "everyone's invited" is
                the one that gets named in a public newsletter, so it has to be
                obvious at a glance (Nat 2026-07-25). The hexagon is the HIVE's
                own colour, so on a calendar carrying three HIVEs' meetings you
                can tell whose August meeting this is without reading the title
                (Nat 2026-08-05). */}
            <ScopeBadge
              scope={seenScope}
              communityId={(event as any).community_id}
              caption="Seen by"
            />
          </View>
          <View className="flex-row flex-wrap gap-2 mt-2">
            <ScopeBadge
              scope={invitedScope}
              communityId={(event as any).community_id}
              caption="Invited"
            />
          </View>
          {isEditingThisBirthday ? (
            // Third edit surface for a birthday's own visibility (Nat,
            // 2026-08-11: "that should be toggle-able ... on the 'upcoming
            // events' page & where you change one, it also changes in the
            // other"). `saveBirthdayScope` is the same write `profile.tsx`
            // and `members.tsx` make, so there is one save behind all three
            // screens rather than three that could drift.
            <View style={{ marginTop: 10, gap: 12 }}>
              <EventScopeFields
                visibility={draftBirthdaySeen}
                onVisibilityChange={setDraftBirthdaySeen}
                invited={draftBirthdayInvited}
                onInvitedChange={setDraftBirthdayInvited}
              />
              <View className="flex-row gap-2">
                <Pressable
                  onPress={(e) => {
                    e.stopPropagation();
                    setEditingBirthdayId(null);
                  }}
                  className="bg-gray-200 py-1.5 px-3 rounded-full active:opacity-70"
                >
                  <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-charcoal text-xs">
                    Cancel
                  </Text>
                </Pressable>
                <Pressable
                  onPress={(e) => {
                    e.stopPropagation();
                    void saveBirthdayEdit(event);
                  }}
                  disabled={savingBirthdayScope}
                  className={`bg-gold py-1.5 px-3 rounded-full ${savingBirthdayScope ? 'opacity-50' : 'active:bg-gold/80'}`}
                >
                  <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-white text-xs">
                    {savingBirthdayScope ? 'Saving…' : 'Save'}
                  </Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <View className="flex-row flex-wrap gap-2 mt-2">
              {/* The joining details belong to the people who were invited. An
                  event can be visible to every HIVE while its link stays with the
                  HIVE whose meeting it is (Nat 2026-08-05). */}
              {event.meet_link && isInvitedToEvent(event as never, myCommunityIds) && (
                <Pressable
                  onPress={(e) => {
                    e.stopPropagation();
                    Linking.openURL(event.meet_link!);
                  }}
                  className="bg-cream border border-gold/20 py-1.5 px-3 rounded-full flex-row items-center active:bg-gold/10"
                >
                  <Text className="text-xs mr-1.5">📹</Text>
                  <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-gold text-xs">
                    Join Google Meet
                  </Text>
                </Pressable>
              )}
              <Pressable
                onPress={(e) => {
                  e.stopPropagation();
                  addToCalendar.open(event);
                }}
                className="bg-cream border border-gold/20 py-1.5 px-3 rounded-full flex-row items-center active:bg-gold/10"
              >
                <Text className="text-xs mr-1.5">📅</Text>
                <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-gold text-xs">
                  Add to Calendar
                </Text>
              </Pressable>
              {/* Your own birthday used to carry an "Edit who sees this" pill
                  here — the one card whose editor opened from a button instead
                  of the card itself. Tapping the card opens that editor now
                  (see the card's onPress), so the pill is gone and every card
                  edits the same way. */}
            </View>
          )}
        </Pressable>
        );
      })}
      {addToCalendar.dialog}
    </View>
  );
}

function getRelativeTime(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
}

function HexShortcut({ emoji, icon, label, sublabel, onPress }: {
  emoji: string;
  icon?: HiveIconName;
  label: string;
  sublabel?: string;
  onPress: () => void;
}) {
  // Flat-top honeycomb hexagon: flat edges on top & bottom, points on left & right
  return (
    <Pressable onPress={onPress} style={{ alignItems: 'center', flex: 1 }} className="active:opacity-70">
      <View style={{ width: 80, height: 70, alignItems: 'center', justifyContent: 'center' }}>
        <Svg width={80} height={70} viewBox="0 0 80 70" style={{ position: 'absolute' }}>
          <Polygon
            points="20,1 60,1 79,35 60,69 20,69 1,35"
            fill="#fdf3dc"
            stroke="rgba(196,154,60,0.55)"
            strokeWidth={1.5}
          />
        </Svg>
        <Text style={{ fontSize: 28, lineHeight: 32 }}>{emoji}</Text>
      </View>
      <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 12, color: '#2d2d2d', marginTop: 4, textAlign: 'center' }}>{label}</Text>
      {sublabel ? (
        <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 11, color: '#bd9348', marginTop: 2, textAlign: 'center' }}>{sublabel}</Text>
      ) : null}
    </Pressable>
  );
}

// Reorderable home screen sections (persisted per member in profiles.home_section_order).
// 'panel' sections sit side by side in a row on wide screens; 'full' sections span the width.
// Activity-type chrome icons map onto the HIVE icon family.
const ACTIVITY_HIVE_ICON: Record<string, HiveIconName> = {
  '💬': 'reply',
  '📅': 'calendar',
  '📝': 'note',
  '✨': 'sparkle',
  '🌟': 'star',
  '✅': 'checkin',
  '📋': 'board',
};

type HomeSectionKey = 'activity' | 'todos' | 'events' | 'shortcuts' | 'wishes';

const DEFAULT_HOME_SECTION_ORDER: HomeSectionKey[] = ['shortcuts', 'activity', 'todos', 'events', 'wishes'];

const HOME_SECTION_META: Record<HomeSectionKey, { title: string; emoji: string; layout: 'panel' | 'full' }> = {
  activity: { title: 'Recent Activity', emoji: '🐝', layout: 'panel' },
  todos: { title: 'My To Do List', emoji: '📝', layout: 'panel' },
  events: { title: 'Upcoming Events', emoji: '📅', layout: 'panel' },
  shortcuts: { title: 'Shortcuts', emoji: '🍯', layout: 'full' },
  wishes: { title: 'Wishes', emoji: '⭐', layout: 'panel' },
};

// Resolve a saved order against the current section set: unknown saved keys are
// dropped, and any new/missing sections slot back in at their default position,
// so adding sections later never breaks a member's saved layout.
const resolveHomeSectionOrder = (saved?: readonly string[] | null): HomeSectionKey[] => {
  const isKnownSection = (key: string): key is HomeSectionKey => key in HOME_SECTION_META;
  const order = [...new Set((saved ?? []).filter(isKnownSection))];
  if (order.length === 0) return [...DEFAULT_HOME_SECTION_ORDER];

  DEFAULT_HOME_SECTION_ORDER.forEach((key, defaultIndex) => {
    if (!order.includes(key)) order.splice(Math.min(defaultIndex, order.length), 0, key);
  });
  return order;
};

// Customizable home shortcut hexes (persisted per member in profiles.home_shortcuts).
type HomeShortcutKey = 'honey_pot' | 'boards' | 'messages' | 'members' | 'meetings' | 'profile' | 'clive' | 'feedback' | 'swap_hives' | 'admin';

// The three hexes earn their place by being the things with no other way in:
// Boards, Messages and the rest all sit in the tab bar already, while the Honey
// Pot, swapping HIVEs and reporting a bug have no home of their own. A bug
// report you can't find never gets made (Nat 2026-07-25 and 2026-07-31).
// Home's three combs are gone (Nat 2026-08-03) — Honey Pot, Swap HIVEs and App
// Feedback are all in the rail now, permanently, which is better than a shortcut
// row that only existed because there was nowhere else to put them. Anyone with
// a saved arrangement keeps it; this is only what a new member starts with.
const DEFAULT_HOME_SHORTCUTS: HomeShortcutKey[] = [];

// Swapping is meaningless to anyone who belongs to one HIVE, so for them the
// slot falls back to Boards rather than showing a button that goes nowhere.
const SINGLE_HIVE_FALLBACK: HomeShortcutKey = 'boards';

const HOME_SHORTCUT_META: Record<HomeShortcutKey, { label: string; emoji: string; icon: HiveIconName; adminOnly?: boolean; multiHiveOnly?: boolean }> = {
  honey_pot: { label: 'Honey Pot', emoji: '🍯', icon: 'honeypot' },
  boards: { label: 'Boards', emoji: '📋', icon: 'board' },
  messages: { label: 'Messages', emoji: '💬', icon: 'message' },
  members: { label: 'Members', emoji: '🐝', icon: 'bee' },
  meetings: { label: 'Meetings', emoji: '📅', icon: 'calendar' },
  profile: { label: 'My Profile', emoji: '👤', icon: 'person' },
  clive: { label: 'Clive', emoji: '✨', icon: 'sparkle' },
  // Reporting a bug shouldn't require remembering it's buried in Profile — the
  // people most likely to hit one are the least likely to go hunting for where
  // to say so (Nat 2026-07-25).
  feedback: { label: 'App Feedback', emoji: '💬', icon: 'question' },
  swap_hives: { label: 'Swap HIVE', emoji: '🔀', icon: 'swap', multiHiveOnly: true },
  admin: { label: 'Admin', emoji: '⚙️', icon: 'gear', adminOnly: true },
};

// Resolve saved shortcuts against the catalog: unknown keys and duplicates are
// dropped, admin-only shortcuts are dropped for members who can't use them, and
// any remaining empty slots fall back to the defaults — always exactly 3 slots.
const resolveHomeShortcuts = (
  saved: readonly string[] | null | undefined,
  allowAdmin: boolean,
  allowSwap: boolean
): HomeShortcutKey[] => {
  const isKnownShortcut = (key: string): key is HomeShortcutKey => key in HOME_SHORTCUT_META;
  const isAllowed = (key: HomeShortcutKey) =>
    (allowAdmin || !HOME_SHORTCUT_META[key].adminOnly) &&
    (allowSwap || !HOME_SHORTCUT_META[key].multiHiveOnly);

  // Three slots is the row's historical size. It must NOT be
  // DEFAULT_HOME_SHORTCUTS.length: the default went to zero when the combs
  // moved to the rail (2026-08-03), and slicing saved arrangements to the
  // DEFAULT's length silently threw every one of them away — the exact
  // opposite of the "anyone with a saved arrangement keeps it" promise above
  // (found by the 2026-08-19 standardization pass; zero members had saved one,
  // so nothing was lost).
  const HOME_SHORTCUT_SLOTS = 3;
  const wanted = [...new Set((saved ?? []).filter(isKnownShortcut))];
  const picked = wanted.filter(isAllowed).slice(0, HOME_SHORTCUT_SLOTS);
  // Fallbacks only stand in for saved slots that were dropped as unknown or
  // not allowed — a member who saved nothing gets the default, which is an
  // empty row that Home simply does not draw.
  const target = Math.min(wanted.length, HOME_SHORTCUT_SLOTS);
  const fallbacks = [...DEFAULT_HOME_SHORTCUTS.filter(isAllowed), SINGLE_HIVE_FALLBACK];
  for (const fallback of fallbacks) {
    if (picked.length >= target) break;
    if (!picked.includes(fallback)) picked.push(fallback);
  }
  return picked;
};

function SectionMoveButton({ direction, disabled, onPress }: {
  direction: 'up' | 'down';
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={direction === 'up' ? 'Move section up' : 'Move section down'}
      hitSlop={6}
      style={({ pressed }) => ({
        width: 34,
        height: 34,
        borderRadius: 17,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: disabled ? 'rgba(222,193,129,0.35)' : 'rgba(189,147,72,0.5)',
        backgroundColor: disabled ? 'transparent' : pressed ? '#fbf0d7' : '#fff8e8',
        opacity: disabled ? 0.35 : 1,
      })}
    >
      <Ionicons name={direction === 'up' ? 'chevron-up' : 'chevron-down'} size={18} color="#8e6f35" />
    </Pressable>
  );
}

export default function HiveScreen() {
  const { profile, communityId, communityRole, session, refreshProfile, community, memberships, openHivePicker, wholeHive, switchCommunity } = useAuth();
  const { appNews } = useAppNews();
  const router = useRouter();
  const openFeedback = useOpenFeedback();

  const { openWishId, openSurveyId, hive: linkedHiveId, catchup, from } = useLocalSearchParams<{
    openWishId?: string;
    /** A check-in to open on arrival — the check-in email's button (2026-08-15). */
    openSurveyId?: string;
    /** Which HIVE that check-in belongs to, so the link works from anywhere. */
    hive?: string;
    catchup?: string;
    from?: string;
  }>();

  // A HIVE's home cannot be drawn while the app thinks you are standing above
  // the HIVEs — and now it cannot be asked to.
  //
  // Nat, 2026-08-04, signing in on a brand-new account: "oh no, we broke it,
  // this is all sorts of messed up." The header read "HIVE-WIDE / Tech HIVE",
  // the page was cream, and every panel tab was invisible. `AppHeader`,
  // `HeaderTabs` and `pageSkin` each read `wholeHive` and dressed for space;
  // this screen referenced it nowhere and painted a HIVE. Both were doing as
  // told, and nobody was refereeing.
  //
  // The referee is the route. `/hive` is Home's one-HIVE half — its HIVE-Wide
  // twin is `/hive-wide` — so `placeForRoute` answers 'hive' and the context
  // hands every one of those components `wholeHive: false` while this screen is
  // open. The redirect that used to sit here (bounce to `/hive-wide` whenever
  // the app remembered HIVE-Wide) is gone with it, along with the two
  // exceptions it grew: a check-in link (Nat, 2026-08-15: *"both times I
  // clicked on the check-in button, they just brought me to HIVE-Wide instead
  // of bringing me into the survey"*) and any other `?hive=` link (2026-09-01).
  // Both were the redirect fighting a link that named a HIVE; there is nothing
  // left for either of them to hold back. See `lib/navigation.ts`.

  const { width } = useWindowDimensions();
  const useMobileLayout = width < 768;
  const homeScrollRef = useRef<ScrollView>(null);
  const currentUserId = session?.user?.id ?? profile?.id ?? null;
  const isAdmin = communityRole === 'admin' || profile?.role === 'admin';
  const canManageDues = isAdmin || communityRole === 'treasurer' || profile?.role === 'treasurer';
  // Dues exist only where the HIVE chose to run a Honey Pot (migration 140:
  // `communities.honey_pot_enabled`, false by default, true for OG only). Nat,
  // 2026-08-11, seeing OG's dues reminder on Tech HIVE's Home: "Tech HIVE
  // doesnt have dues established yet... Each HIVE will have its own rules
  // around dues and treasurers, so it shouldnt just roll over." Everything
  // dues-shaped on this screen — the auto to-do, the status fetch behind it,
  // the Honey Pot balance sublabel — checks this flag first. The specifics the
  // reminder quotes ($25/quarter, the $HiveLV cashtag in `lib/dues.ts` /
  // `lib/honeyPotPayment.ts`) are OG HIVE's own rules; per-HIVE dues config is
  // real future scope that starts whenever a second HIVE turns its pot on.
  const duesEnabled = community?.honey_pot_enabled === true;
  const canSwapHives = memberships.length > 1;
  const activeSurveyStorageKey = profile?.id && communityId
    ? `the-hive:home-active-survey:${communityId}:${profile.id}`
    : null;
  const activeWishStorageKey = profile?.id && communityId
    ? `the-hive:home-active-wish:${communityId}:${profile.id}`
    : null;
  const restoredSurveyStorageKeyRef = useRef<string | null>(null);
  const restoredWishStorageKeyRef = useRef<string | null>(null);

  // Per-member home section order — read from the already-fetched profile row,
  // reordered locally in customize mode, persisted to profiles.home_section_order.
  const savedHomeSectionOrderKey = (profile?.home_section_order ?? []).join('|');
  const savedHomeShortcutsKey = (profile?.home_shortcuts ?? []).join('|');
  const [customizeMode, setCustomizeMode] = useState(false);
  const customizeModeRef = useRef(false);
  customizeModeRef.current = customizeMode;
  const [savingSectionOrder, setSavingSectionOrder] = useState(false);
  const [sectionOrder, setSectionOrder] = useState<HomeSectionKey[]>(
    () => resolveHomeSectionOrder(profile?.home_section_order)
  );
  const [homeShortcuts, setHomeShortcuts] = useState<HomeShortcutKey[]>(
    () => resolveHomeShortcuts(profile?.home_shortcuts, canManageDues, canSwapHives)
  );
  // Which of the 3 shortcut slots is showing its picker in customize mode.
  const [editingShortcutSlot, setEditingShortcutSlot] = useState<number | null>(null);

  // Keep the local order in sync with the profile (e.g. changed on another device),
  // but never clobber an in-progress customize session.
  useEffect(() => {
    if (customizeModeRef.current) return;
    setSectionOrder(resolveHomeSectionOrder(savedHomeSectionOrderKey ? savedHomeSectionOrderKey.split('|') : null));
  }, [savedHomeSectionOrderKey]);

  useEffect(() => {
    if (customizeModeRef.current) return;
    setHomeShortcuts(resolveHomeShortcuts(savedHomeShortcutsKey ? savedHomeShortcutsKey.split('|') : null, canManageDues, canSwapHives));
  }, [savedHomeShortcutsKey, canManageDues]);

  const moveHomeSection = useCallback((key: HomeSectionKey, direction: -1 | 1) => {
    setSectionOrder(prev => {
      const index = prev.indexOf(key);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }, []);

  const persistHomeLayout = useCallback(async (
    order: HomeSectionKey[] | null,
    shortcuts: HomeShortcutKey[] | null,
  ) => {
    setCustomizeMode(false);
    customizeModeRef.current = false;
    setEditingShortcutSlot(null);
    const nextOrder = resolveHomeSectionOrder(order);
    const nextShortcuts = resolveHomeShortcuts(shortcuts, canManageDues, canSwapHives);
    setSectionOrder(nextOrder);
    setHomeShortcuts(nextShortcuts);
    if (!profile?.id) return;

    const isDefault = !order || nextOrder.join('|') === DEFAULT_HOME_SECTION_ORDER.join('|');
    const shortcutsAreDefault = !shortcuts || nextShortcuts.join('|') === DEFAULT_HOME_SHORTCUTS.join('|');
    setSavingSectionOrder(true);
    const { error } = await supabase
      .from('profiles')
      .update({
        home_section_order: isDefault ? null : nextOrder,
        home_shortcuts: shortcutsAreDefault ? null : nextShortcuts,
      } as any)
      .eq('id', profile.id);

    if (error) {
      console.warn('Could not save home section order', error);
      showAlert(
        'That layout did not save',
        'Your new order is showing here for now. Check your connection and press Done again to keep it.',
      );
    } else {
      // Refresh the cached auth profile so the saved order follows the member everywhere.
      await refreshProfile();
    }
    setSavingSectionOrder(false);
  }, [profile?.id, refreshProfile, canManageDues]);

  const [refreshing, setRefreshing] = useState(false);
  const [showAnswerModal, setShowAnswerModal] = useState(false);
  const [showCatchUpModal, setShowCatchUpModal] = useState(false);
  // Where to go when the daily-question sheets close. Screens that deep-link
  // into Catch up (?catchup=1&from=...) land you on the HIVE tab, so without
  // this you'd get dumped here instead of back where you tapped. Survives the
  // Catch up -> Answer hop; cleared by the Home reset.
  const catchUpReturnRef = useRef<(typeof CATCH_UP_RETURN_PATHS)[string] | null>(null);
  const [catchUpDayCount, setCatchUpDayCount] = useState(CATCH_UP_BATCH_SIZE);
  const [showAddHomeGuide, setShowAddHomeGuide] = useState(false);
  const [myAnswer, setMyAnswer] = useState('');
  const [mySubmittedAnswer, setMySubmittedAnswer] = useState('');
  const [answerError, setAnswerError] = useState<string | null>(null);
  const [expandedAnswerId, setExpandedAnswerId] = useState<string | null>(null);
  // Map of user_id → ISO timestamp for sorting by recency
  const [answerTimestamps, setAnswerTimestamps] = useState<Map<string, string>>(new Map());
  const [isSubmittingAnswer, setIsSubmittingAnswer] = useState(false);
  const answerSubmitInFlight = useRef(false);
  // The answer box used to glow and pulse a "Listening…" dot of its own while
  // the mic was open — one screen's private idea of what dictation looks like.
  // The answer box is the shared box now, and the mic button already says it is
  // listening (gold ring, red dot) the same way in every box in the app.
  const [activeAnswerPrompt, setActiveAnswerPrompt] = useState<ReturnType<typeof getTodayQuestion> | null>(null);
  // Map of user_id → answer text for today's question
  const [memberAnswers, setMemberAnswers] = useState<Map<string, string>>(new Map());
  const [recentAnswerMaps, setRecentAnswerMaps] = useState<Map<string, Map<string, string>>>(new Map());

  const questionDeck = deckForCommunity(community?.slug);
  const { question: todayQuestion, index: todayIndex, dateKey: todayDateKey } = getTodayQuestion(questionDeck);
  const currentAnswerPrompt = activeAnswerPrompt ?? { question: todayQuestion, index: todayIndex, dateKey: todayDateKey };
  const recentDailyQuestions = getRecentDailyQuestions(questionDeck, catchUpDayCount);
  const canShowMoreDailyQuestions = catchUpDayCount < CATCH_UP_MAX_DAYS;
  const nextCatchUpBatchSize = Math.min(CATCH_UP_BATCH_SIZE, CATCH_UP_MAX_DAYS - catchUpDayCount);

  const fetchTodayAnswers = useCallback(async () => {
    if (!communityId) return;
    const { data, error } = await supabase
      .from('daily_question_answers')
      .select('user_id, answer, created_at, updated_at')
      .eq('community_id', communityId)
      .eq('question_date', todayDateKey);
    if (error) {
      console.warn('Could not load daily question answers', error);
      return;
    }
    if (data) {
      const map = new Map<string, string>();
      const timestamps = new Map<string, string>();
      data.forEach((row: any) => {
        map.set(row.user_id, row.answer);
        const answeredAt = row.updated_at ?? row.created_at;
        if (answeredAt) timestamps.set(row.user_id, answeredAt);
      });
      setMemberAnswers(map);
      setAnswerTimestamps(timestamps);
      if (profile?.id && map.has(profile.id)) {
        setMySubmittedAnswer(map.get(profile.id)!);
        setMyAnswer(map.get(profile.id)!);
      } else if (profile?.id) {
        setMySubmittedAnswer('');
      }
    }
  }, [communityId, todayDateKey, profile?.id]);

  const fetchRecentAnswers = useCallback(async () => {
    if (!communityId) return;
    const dates = getRecentDailyQuestions(questionDeck, catchUpDayCount).map(item => item.dateKey);
    const { data, error } = await supabase
      .from('daily_question_answers')
      .select('user_id, answer, question_date')
      .eq('community_id', communityId)
      .in('question_date', dates);
    if (error) {
      console.warn('Could not load recent daily question answers', error);
      return;
    }

    const next = new Map<string, Map<string, string>>();
    dates.forEach(date => next.set(date, new Map()));
    (data ?? []).forEach((row: any) => {
      const date = row.question_date as string;
      const answersForDate = next.get(date) ?? new Map<string, string>();
      answersForDate.set(row.user_id, row.answer);
      next.set(date, answersForDate);
    });
    setRecentAnswerMaps(next);
  }, [communityId, catchUpDayCount, questionDeck]);

  useEffect(() => { fetchTodayAnswers(); }, [fetchTodayAnswers]);
  useEffect(() => { fetchRecentAnswers(); }, [fetchRecentAnswers]);

  const openAnswerModal = (prompt: ReturnType<typeof getTodayQuestion>, existingAnswer = '') => {
    setActiveAnswerPrompt(prompt);
    setMyAnswer(existingAnswer);
    setAnswerError(null);
    setShowAnswerModal(true);
  };

  // Retrace to whoever sent us into the daily questions, once.
  const retraceFromDailyQuestions = useCallback(() => {
    const target = catchUpReturnRef.current;
    if (!target) return;
    catchUpReturnRef.current = null;
    // `open` is a nonce: the destination tab may never have unmounted, so its
    // param effect needs something new to react to.
    router.replace({
      pathname: target.pathname,
      params: { ...(target.params ?? {}), open: String(Date.now()) },
    } as any);
  }, [router]);

  const closeCatchUpModal = useCallback(() => {
    setShowCatchUpModal(false);
    retraceFromDailyQuestions();
  }, [retraceFromDailyQuestions]);

  const closeAnswerModal = useCallback(() => {
    setShowAnswerModal(false);
    retraceFromDailyQuestions();
  }, [retraceFromDailyQuestions]);

  const getMyAnswerForPrompt = (prompt: ReturnType<typeof getTodayQuestion>) => {
    if (!profile?.id) return '';
    if (prompt.dateKey === todayDateKey) return mySubmittedAnswer;
    return recentAnswerMaps.get(prompt.dateKey)?.get(profile.id) ?? '';
  };

  const handleSubmitAnswer = async () => {
    const text = myAnswer.trim();
    if (!text || !profile?.id || !communityId || answerSubmitInFlight.current) return;
    answerSubmitInFlight.current = true;
    setAnswerError(null);
    setIsSubmittingAnswer(true);
    // One answer per person per HIVE per day (migration 173) — each HIVE
    // asks its own question now, so the day alone stopped being the key.
    const { error } = await supabase.from('daily_question_answers').upsert({
      user_id: profile.id,
      community_id: communityId,
      question_index: currentAnswerPrompt.index,
      question_date: currentAnswerPrompt.dateKey,
      answer: text,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,community_id,question_date' });
    answerSubmitInFlight.current = false;
    setIsSubmittingAnswer(false);

    if (error) {
      console.warn('Could not save daily question answer', error);
      setAnswerError('Could not save your answer. Please try again.');
      return;
    }

    if (currentAnswerPrompt.dateKey === todayDateKey) {
      setMySubmittedAnswer(text);
    }
    const submittedAt = new Date().toISOString();
    setMemberAnswers(prev => {
      const next = new Map(prev);
      if (currentAnswerPrompt.dateKey === todayDateKey) {
        next.set(profile.id, text);
      }
      return next;
    });
    setAnswerTimestamps(prev => {
      const next = new Map(prev);
      if (currentAnswerPrompt.dateKey === todayDateKey) {
        next.set(profile.id, submittedAt);
      }
      return next;
    });
    setRecentAnswerMaps(prev => {
      const next = new Map(prev);
      const answersForDate = new Map(next.get(currentAnswerPrompt.dateKey) ?? new Map());
      answersForDate.set(profile.id, text);
      next.set(currentAnswerPrompt.dateKey, answersForDate);
      return next;
    });
    closeAnswerModal();
    fetchTodayAnswers();
    fetchRecentAnswers();
  };
  const [selectedWish, setSelectedWish] = useState<WishWithGranters | null>(null);
  const [editingWish, setEditingWish] = useState<Wish | null>(null);
  const [managingWish, setManagingWish] = useState<WishWithGranters | null>(null);
  const [wishToGrant, setWishToGrant] = useState<WishWithGranters | null>(null);
  const [showAddWishModal, setShowAddWishModal] = useState(false);

  const clearSelectedWishResume = useCallback(() => {
    if (activeWishStorageKey) removeStoredItem(activeWishStorageKey);
  }, [activeWishStorageKey]);

  const openWishDetail = useCallback((wish: WishWithGranters) => {
    setSelectedWish(wish);
    if (activeWishStorageKey) {
      setStoredItem(activeWishStorageKey, wish.id);
    }
  }, [activeWishStorageKey]);

  // Where to put you back when a deep-linked wish sheet closes. Without it,
  // Profile → App Feedback stranded you on the HIVE tab — the same "where did I
  // go?" the Swarm pills had (Nat 2026-07-25).
  const wishReturnRef = useRef<{ pathname: string; params?: Record<string, string> } | null>(null);

  const closeWishDetail = useCallback(() => {
    setSelectedWish(null);
    clearSelectedWishResume();
    const back = wishReturnRef.current;
    if (back) {
      wishReturnRef.current = null;
      router.replace(back as any);
    }
  }, [clearSelectedWishResume, router]);

  // Event modal state
  const [showEventModal, setShowEventModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState<Event | null>(null);
  // The quarter-end reminder begins as a generated calendar card. Opening it
  // still uses the normal event editor. Its first save creates the real event
  // row that can hold Nat's visibility choice; the generated copy then drops
  // out through the existing same-day dues-event de-duplication.
  const [eventDraftSource, setEventDraftSource] = useState<'dues-reminder' | null>(null);
  const [eventTitle, setEventTitle] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [eventEndDate, setEventEndDate] = useState('');
  const [eventAllDay, setEventAllDay] = useState(false);
  const [eventTime, setEventTime] = useState('');
  const [eventEndTime, setEventEndTime] = useState('');
  const [eventDescription, setEventDescription] = useState('');
  const [eventLocation, setEventLocation] = useState('');
  // Who's it for? Defaults to HIVErs Only — an event goes public because
  // someone said so, never because nobody said otherwise.
  const [eventAudience, setEventAudience] = useState<EventAudience>('members');
  // Who can SEE it, separately from who is invited (migration 148). Nat:
  // "we want everyone to be able to see when our meetings are... but i dont
  // want everyone to be able to join the meet."
  const [eventVisibility, setEventVisibility] = useState<EventAudience>('members');
  const [savingEvent, setSavingEvent] = useState(false);
  const [eventError, setEventError] = useState<string | null>(null);
  const [homeActionItems, setHomeActionItems] = useState<ActionItem[]>([]);
  const [homeActionLoading, setHomeActionLoading] = useState(false);
  const [duesCoveredThisQuarter, setDuesCoveredThisQuarter] = useState(false);
  const [duesStatusLoading, setDuesStatusLoading] = useState(false);
  const [duesStatusChecked, setDuesStatusChecked] = useState(false);
  const [dismissedDuesPeriodKeys, setDismissedDuesPeriodKeys] = useState<Set<string>>(() => new Set());

  const formatDateForInput = useCallback((isoDate: string) => {
    const [year, month, day] = isoDate.split('-');
    return `${month}-${day}-${year}`;
  }, []);

  const openEditEvent = useCallback((event: Event) => {
    const isGeneratedDuesReminder = isQuarterlyDuesReminderEvent(event);
    setEditingEvent(isGeneratedDuesReminder ? null : event);
    setEventDraftSource(isGeneratedDuesReminder ? 'dues-reminder' : null);
    setEventTitle(event.title);
    setEventDate(formatDateForInput(event.event_date));
    setEventEndDate(event.end_date ? formatDateForInput(event.end_date) : '');
    setEventAllDay(!event.event_time);
    setEventTime(timeForEditing(event.event_time));
    setEventEndTime(timeForEditing(event.end_time));
    // Without the strip, the box you edit opens already containing the line
    // the app generated last time — which is how it came to hold two of them
    // and none of Nat's own words.
    setEventDescription(withoutTimeNotes(event.description));
    setEventLocation(event.location || '');
    // Pass the saved rungs straight through — collapsing either to two would
    // quietly demote a HIVE-Wide event the moment somebody opened it to edit.
    const rung = (value: unknown): EventAudience =>
      value === 'public' || value === 'all_hives' ? value : 'members';
    const savedVisibility = rung((event as any).visibility);
    setEventVisibility(savedVisibility);
    // Events written before migration 148 have no invite rung of their own, and
    // for those the visibility WAS the invitation — one column did both jobs.
    setEventAudience(
      (event as any).invited_scope ? rung((event as any).invited_scope) : savedVisibility,
    );
    setShowEventModal(true);
  }, [formatDateForInput]);

  // Hide-birthdays preference for Upcoming Events (persisted per member/device)
  const eventsHideBirthdaysKey = communityId && currentUserId ? `the-hive:events-hide-birthdays:${communityId}:${currentUserId}` : null;
  const [hideBirthdayEvents, setHideBirthdayEvents] = useState<boolean>(() => (
    eventsHideBirthdaysKey ? getStoredItem(eventsHideBirthdaysKey) === 'true' : false
  ));

  useEffect(() => {
    setHideBirthdayEvents(eventsHideBirthdaysKey ? getStoredItem(eventsHideBirthdaysKey) === 'true' : false);
  }, [eventsHideBirthdaysKey]);

  const toggleHideBirthdayEvents = useCallback(() => {
    setHideBirthdayEvents(prev => {
      const next = !prev;
      if (eventsHideBirthdaysKey) setStoredItem(eventsHideBirthdaysKey, next ? 'true' : 'false');
      return next;
    });
  }, [eventsHideBirthdaysKey]);

  // Past events browser — paginated, newest-first
  const [pastEvents, setPastEvents] = useState<Event[]>([]);
  const [pastMonthsShown, setPastMonthsShown] = useState(0);
  const [pastEventsLoading, setPastEventsLoading] = useState(false);

  // Inline timeline: each tap pulls one more calendar month of history into the
  // Upcoming Events panel (scroll up = past, scroll down = future).
  const showMorePastEvents = useCallback(async () => {
    if (!communityId || pastEventsLoading) return;
    const nextMonths = pastMonthsShown + 1;
    setPastEventsLoading(true);
    try {
      const now = new Date();
      const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const windowStart = new Date(now.getFullYear(), now.getMonth() - (nextMonths - 1), 1);
      const startIso = `${windowStart.getFullYear()}-${String(windowStart.getMonth() + 1).padStart(2, '0')}-01`;
      const { data, error } = await supabase
        .from('events')
        .select('*')
        .eq('community_id', communityId)
        .gte('event_date', startIso)
        .lt('event_date', today)
        .order('event_date', { ascending: true })
        .order('event_time', { ascending: true });

      if (error) throw error;
      setPastEvents((data as Event[]) ?? []);
      setPastMonthsShown(nextMonths);
    } catch (error) {
      console.warn('Could not load past events', error);
    } finally {
      setPastEventsLoading(false);
    }
  }, [communityId, pastEventsLoading, pastMonthsShown]);

  const collapsePastEvents = useCallback(() => {
    setPastEvents([]);
    setPastMonthsShown(0);
  }, []);

  const fetchMyActionItems = useCallback(async () => {
    if (!profile?.id || !communityId) return;
    setHomeActionLoading(true);
    let { data, error } = await supabase
      .from('action_items')
      .select('*, about:profiles!related_user_id(name)')
      .eq('assigned_to', profile.id)
      .eq('community_id', communityId)
      .order('due_date', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: false });

    if (error && String(error.message ?? '').includes('archived_at')) {
      const fallback = await supabase
        .from('action_items')
        .select('*, about:profiles!related_user_id(name)')
        .eq('assigned_to', profile.id)
        .eq('community_id', communityId)
        .order('due_date', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: false });
      data = fallback.data;
      error = fallback.error;
    }

    if (error) {
      console.warn('Could not load action items', error);
      setHomeActionItems([]);
      setDismissedDuesPeriodKeys(new Set());
    } else {
      const items = (data ?? []) as ActionItem[];
      setHomeActionItems(items.filter((item) => !item.archived_at));

      const currentPeriod = getCurrentDuesPeriod();
      const currentDueDateKey = formatDateKey(getDuesPeriodEndDate(currentPeriod));
      setDismissedDuesPeriodKeys(new Set(
        items
          .filter((item) => (
            isQuarterlyDuesActionItem(item, currentPeriod, currentDueDateKey)
            && (item.completed || !!item.archived_at)
          ))
          .map(() => getDuesPeriodKey(currentPeriod))
      ));
    }
    setHomeActionLoading(false);
  }, [profile?.id, communityId]);

  useEffect(() => { fetchMyActionItems(); }, [fetchMyActionItems]);

  const fetchMyDuesStatus = useCallback(async () => {
    // A HIVE with no Honey Pot has no dues to check — skip the transactions
    // query entirely rather than reading an empty ledger to learn nothing.
    // `duesStatusChecked` stays false, which also keeps the dues to-do away.
    if (!profile?.id || !communityId || !duesEnabled) {
      setDuesStatusLoading(false);
      setDuesStatusChecked(false);
      return;
    }
    const { year, quarter } = getCurrentDuesPeriod();
    setDuesStatusLoading(true);
    setDuesStatusChecked(false);

    const runDuesQuery = (columns: string) => (supabase as any)
      .from('honey_pot_transactions')
      .select(columns)
      .eq('community_id', communityId)
      .eq('transaction_type', 'deposit')
      .order('created_at', { ascending: false })
      .limit(300);

    let { data, error } = await runDuesQuery(
      'related_user_id, dues_year, dues_quarter, dues_covered_quarters, transaction_type, amount, note, external_counterparty_name, created_at'
    );

    if (error && String(error.message ?? '').includes('external_counterparty_name')) {
      const fallback = await runDuesQuery(
        'related_user_id, dues_year, dues_quarter, dues_covered_quarters, transaction_type, amount, note, created_at'
      );
      data = fallback.data;
      error = fallback.error;
    }

    if (error) {
      console.warn('Could not load dues status', error);
      setDuesCoveredThisQuarter(false);
    } else {
      setDuesCoveredThisQuarter(duesTransactionsCoverMember(data ?? [], profile, { year, quarter }));
    }
    setDuesStatusChecked(true);
    setDuesStatusLoading(false);
  }, [profile, communityId, duesEnabled]);

  useEffect(() => { fetchMyDuesStatus(); }, [fetchMyDuesStatus]);

  const [showConfetti, setShowConfetti] = useState(false);
  const [showAddTaskModal, setShowAddTaskModal] = useState(false);
  const [selectedActionItemId, setSelectedActionItemId] = useState<string | null>(null);

  // Nat, 2026-08-24, on the meeting-summary screen not resetting when she
  // switched HIVEs directly: "i shouldnt be able to have a crossover
  // screen, right?" Same shape here — a wish or to-do detail stayed open
  // showing content from the HIVE she just left. `resetHomeToRoot` exists
  // for this but only fires on an explicit Home tap, not a direct
  // HIVE-to-HIVE switch from the sidebar.
  useEffect(() => {
    setSelectedWish((current) => (current && current.community_id !== communityId ? null : current));
    setEditingWish((current) => (current && current.community_id !== communityId ? null : current));
    setManagingWish((current) => (current && current.community_id !== communityId ? null : current));
    setWishToGrant((current) => (current && current.community_id !== communityId ? null : current));
    setSelectedActionItemId((current) => (current ? null : current));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [communityId]);

  const [newTaskText, setNewTaskText] = useState('');
  const [savingTask, setSavingTask] = useState(false);
  const taskSaveInFlight = useRef(false);
  const [taskError, setTaskError] = useState<string | null>(null);
  const [editingActionItemId, setEditingActionItemId] = useState<string | null>(null);
  const [taskEditText, setTaskEditText] = useState('');
  const [savingTaskEdit, setSavingTaskEdit] = useState(false);
  const taskEditSaveInFlight = useRef(false);
  const [taskEditError, setTaskEditError] = useState<string | null>(null);

  const triggerCompletion = useCallback(() => {
    setShowConfetti(true);
  }, []);

  const getCurrentDuesReminderPeriodKey = useCallback((item: ActionItem) => {
    const currentPeriod = getCurrentDuesPeriod();
    const currentDueDateKey = formatDateKey(getDuesPeriodEndDate(currentPeriod));
    return isQuarterlyDuesActionItem(item, currentPeriod, currentDueDateKey)
      ? getDuesPeriodKey(currentPeriod)
      : null;
  }, []);

  const rememberDismissedDuesReminder = useCallback((items: ActionItem[]) => {
    const dismissedKeys = items
      .map(getCurrentDuesReminderPeriodKey)
      .filter(Boolean) as string[];
    if (dismissedKeys.length === 0) return;

    setDismissedDuesPeriodKeys((current) => {
      const next = new Set(current);
      dismissedKeys.forEach((key) => next.add(key));
      return next;
    });
  }, [getCurrentDuesReminderPeriodKey]);

  const forgetDismissedDuesReminder = useCallback((items: ActionItem[]) => {
    const dismissedKeys = items
      .map(getCurrentDuesReminderPeriodKey)
      .filter(Boolean) as string[];
    if (dismissedKeys.length === 0) return;

    setDismissedDuesPeriodKeys((current) => {
      const next = new Set(current);
      dismissedKeys.forEach((key) => next.delete(key));
      return next;
    });
  }, [getCurrentDuesReminderPeriodKey]);

  const toggleActionItem = useCallback(async (item: ActionItem) => {
    const completed = !item.completed;
    const completedAt = completed ? new Date().toISOString() : null;
    setHomeActionItems(prev => prev.map(action => (
      action.id === item.id
        ? { ...action, completed, completed_at: completedAt }
        : action
    )));
    if (completed) triggerCompletion();

    const { error } = await supabase
      .from('action_items')
      .update({ completed, completed_at: completedAt } as any)
      .eq('id', item.id);

    if (error) {
      console.warn('Could not update action item', error);
      setHomeActionItems(prev => prev.map(action => (
        action.id === item.id ? item : action
      )));
      // The line above puts the tick back the way it was, so the person has to
      // be told why it moved on its own.
      showAlert(
        'That tick did not save',
        'Your task is back the way it was. Check your connection and tap it again.',
      );
    }
  }, [triggerCompletion]);

  const archiveActionItem = useCallback((item: ActionItem) => {
    const archive = async () => {
      setHomeActionItems(prev => prev.filter(action => action.id !== item.id));
      rememberDismissedDuesReminder([item]);
      const { error } = await supabase
        .from('action_items')
        .update({
          archived_at: new Date().toISOString(),
          archived_by: profile?.id ?? null,
          archive_reason: 'member_archived_from_home',
        } as any)
        .eq('id', item.id);

      if (error) {
        console.warn('Could not archive action item', error);
        setHomeActionItems(prev => [item, ...prev]);
        forgetDismissedDuesReminder([item]);
        // The two lines above put the task back on the list, so say why it
        // reappeared and what to do about it.
        showAlert(
          'That task came back',
          'Archiving it did not save, so it is still on your list. Check your connection and try again.',
        );
      }
    };

    confirmAction({
      title: 'Archive Task',
      message: `Archive this task from your list? The record is kept for the meeting history; it is not deleted.\n\n"${item.description}"`,
      confirmLabel: 'Archive',
      destructive: true,
      onConfirm: archive,
    });
  }, [forgetDismissedDuesReminder, profile?.id, rememberDismissedDuesReminder]);

  const archiveCompletedActionItems = useCallback(() => {
    const completedItems = homeActionItems.filter(item => item.completed);
    if (completedItems.length === 0) return;
    const completedIds = completedItems.map(item => item.id);

    const archive = async () => {
      const previousItems = homeActionItems;
      setHomeActionItems(prev => prev.filter(action => !completedIds.includes(action.id)));
      rememberDismissedDuesReminder(completedItems);
      const { error } = await supabase
        .from('action_items')
        .update({
          archived_at: new Date().toISOString(),
          archived_by: profile?.id ?? null,
          archive_reason: 'member_archived_completed_from_home',
        } as any)
        .in('id', completedIds);

      if (error) {
        console.warn('Could not archive completed action items', error);
        setHomeActionItems(previousItems);
        forgetDismissedDuesReminder(completedItems);
        // The whole list has just been put back, so say why it reappeared.
        showAlert(
          completedItems.length === 1 ? 'That task came back' : 'Those tasks came back',
          'Archiving did not save, so they are still on your list. Check your connection and try again.',
        );
      }
    };

    const taskLabel = completedItems.length === 1 ? 'task' : 'tasks';
    confirmAction({
      title: 'Archive Completed Tasks',
      message: `Archive ${completedItems.length} completed ${taskLabel} from your list?`,
      confirmLabel: 'Archive',
      destructive: true,
      onConfirm: archive,
    });
  }, [forgetDismissedDuesReminder, homeActionItems, profile?.id, rememberDismissedDuesReminder]);

  const handleAddTask = async () => {
    const description = newTaskText.trim();
    if (!profile?.id || !communityId || taskSaveInFlight.current) return;
    if (!hasMeaningfulActionItemText(description)) {
      setTaskError('Add a real action, not only punctuation or an @name.');
      return;
    }
    taskSaveInFlight.current = true;
    setSavingTask(true);
    setTaskError(null);
    const { error } = await supabase.from('action_items').insert({
      meeting_id: null,
      description,
      assigned_to: profile.id,
      community_id: communityId,
      completed: false,
    } as any);
    taskSaveInFlight.current = false;
    setSavingTask(false);

    if (error) {
      console.warn('Could not add task', error);
      setTaskError('Could not add that task. Please try again.');
      return;
    }

    setNewTaskText('');
    setShowAddTaskModal(false);
    fetchMyActionItems();
  };

  const startEditingActionItem = useCallback((item: ActionItem) => {
    setEditingActionItemId(item.id);
    setTaskEditText(item.description);
    setTaskEditError(null);
  }, []);

  const cancelEditingActionItem = useCallback(() => {
    setEditingActionItemId(null);
    setTaskEditText('');
    setTaskEditError(null);
  }, []);

  const saveActionItemEdit = useCallback(async (item: ActionItem) => {
    const description = taskEditText.trim();
    if (!profile?.id || !communityId || taskEditSaveInFlight.current) return;
    if (!hasMeaningfulActionItemText(description)) {
      setTaskEditError('Add a real action, not only punctuation or an @name.');
      return;
    }
    if (description === item.description.trim()) {
      cancelEditingActionItem();
      return;
    }

    taskEditSaveInFlight.current = true;
    setSavingTaskEdit(true);
    setTaskEditError(null);
    const editedAt = new Date().toISOString();
    const { error } = await supabase
      .from('action_items')
      .update({
        description,
        original_description: item.original_description ?? item.description,
        edited_at: editedAt,
        edited_by: profile.id,
      } as any)
      .eq('id', item.id)
      .eq('community_id', communityId)
      .eq('assigned_to', profile.id);
    taskEditSaveInFlight.current = false;
    setSavingTaskEdit(false);

    if (error) {
      console.warn('Could not edit action item', error);
      setTaskEditError('That edit did not save. Check your connection and try again.');
      return;
    }

    setHomeActionItems((current) => current.map((action) => (
      action.id === item.id
        ? {
            ...action,
            description,
            original_description: action.original_description ?? item.description,
            edited_at: editedAt,
            edited_by: profile.id,
          }
        : action
    )));
    cancelEditingActionItem();
  }, [cancelEditingActionItem, communityId, profile?.id, taskEditText]);

  const selectedActionItem = selectedActionItemId
    ? homeActionItems.find(item => item.id === selectedActionItemId) ?? null
    : null;

  const resetHomeToRoot = useCallback(() => {
    if (activeSurveyStorageKey) removeStoredItem(activeSurveyStorageKey);
    clearSelectedWishResume();
    setSelectedWish(null);
    setActiveSurvey(null);
    setEditingWish(null);
    setManagingWish(null);
    setWishToGrant(null);
    setShowAddWishModal(false);
    setShowEventModal(false);
    setEditingEvent(null);
    setEventError(null);
    setShowAddTaskModal(false);
    setSelectedActionItemId(null);
    cancelEditingActionItem();
    setTaskError(null);
    // Home means home — drop any pending retrace instead of bouncing away.
    catchUpReturnRef.current = null;
    setShowCatchUpModal(false);
    setShowAnswerModal(false);
    setShowAddHomeGuide(false);
    setActiveAnswerPrompt(null);
    homeScrollRef.current?.scrollTo({ y: 0, animated: true });
  }, [activeSurveyStorageKey, cancelEditingActionItem, clearSelectedWishResume]);

  useEffect(() => addHomeResetListener(resetHomeToRoot), [resetHomeToRoot]);

  const markQuarterlyDuesReminderDone = useCallback(async () => {
    if (!profile?.id || !communityId) return;

    const now = new Date();
    const completedAt = now.toISOString();
    const period = getCurrentDuesPeriod(now);
    const dueDate = getDuesPeriodEndDate(period);
    const dueDateKey = formatDateKey(dueDate);
    const description = getQuarterlyDuesActionTitle(period);
    const existingItem = homeActionItems.find(item => (
      isQuarterlyDuesActionItem(item, period, dueDateKey)
    ));

    if (existingItem?.completed) return;

    triggerCompletion();

    if (existingItem) {
      setHomeActionItems(prev => prev.map(action => (
        action.id === existingItem.id
          ? { ...action, completed: true, completed_at: completedAt }
          : action
      )));

      const { error } = await supabase
        .from('action_items')
        .update({ completed: true, completed_at: completedAt } as any)
        .eq('id', existingItem.id)
        .eq('assigned_to', profile.id)
        .eq('community_id', communityId);

      if (error) {
        console.warn('Could not mark dues reminder done', error);
        setHomeActionItems(prev => prev.map(action => (
          action.id === existingItem.id ? existingItem : action
        )));
        // The dues row has just reverted on screen — say so rather than letting
        // it look like the tick was imagined.
        showAlert(
          'Your dues are not marked paid yet',
          'That tick did not save, so the reminder is back. Check your connection and tick it again.',
        );
      }
      return;
    }

    const optimisticAction: ActionItem = {
      id: `quarterly-dues-${period.year}-q${period.quarter}-${completedAt}`,
      meeting_id: null,
      community_id: communityId,
      description,
      assigned_to: profile.id,
      due_date: dueDateKey,
      completed: true,
      completed_at: completedAt,
      archived_at: null,
      created_at: completedAt,
    };

    setHomeActionItems(prev => [optimisticAction, ...prev]);

    const { data, error } = await supabase
      .from('action_items')
      .insert({
        meeting_id: null,
        description,
        assigned_to: profile.id,
        community_id: communityId,
        due_date: dueDateKey,
        completed: true,
        completed_at: completedAt,
      } as any)
      .select('*')
      .single();

    if (error) {
      console.warn('Could not save dues reminder completion', error);
      setHomeActionItems(prev => prev.filter(action => action.id !== optimisticAction.id));
      // The row that just appeared has been taken away again, so explain it.
      showAlert(
        'Your dues are not marked paid yet',
        'That tick did not save, so the reminder is back. Check your connection and tick it again.',
      );
      return;
    }

    if (data) {
      setHomeActionItems(prev => prev.map(action => (
        action.id === optimisticAction.id ? data as ActionItem : action
      )));
    }
  }, [communityId, homeActionItems, profile?.id, triggerCompletion]);

  // Activity feed
  const { items: activityItems, loading: activityLoading, refetch: refetchActivity } = useActivityFeed(
    communityId ?? undefined,
    currentUserId ?? undefined
  );
  const [currentMembershipStartedAt, setCurrentMembershipStartedAt] = useState<string | null>(null);

  // Read state — timestamp-based (for auto-clear) + per-item set (for tap-to-clear)
  const activityReadKey = communityId && currentUserId ? `the-hive:activity-viewed:${communityId}:${currentUserId}` : null;
  const activityReadIdsKey = communityId && currentUserId ? `the-hive:activity-read-ids:${communityId}:${currentUserId}` : null;
  const activityMentionsOnlyKey = communityId && currentUserId ? `the-hive:activity-mentions-only:${communityId}:${currentUserId}` : null;
  const activityDefaultReadAt = currentMembershipStartedAt ?? (profile?.created_at as string | undefined) ?? new Date(0).toISOString();

  const [sessionReadAt, setSessionReadAt] = useState<string>(() => {
    if (activityReadKey) {
      return getStoredItem(activityReadKey) ?? activityDefaultReadAt;
    }
    return activityDefaultReadAt;
  });

  const [readItemIds, setReadItemIds] = useState<Set<string>>(new Set());
  const [showActivityConfetti, setShowActivityConfetti] = useState(false);
  const [isActivityChecking, setIsActivityChecking] = useState(false);
  const [showActivityPullSpace, setShowActivityPullSpace] = useState(false);
  const activityLastFocusRefreshRef = useRef(0);
  const activityRefreshSpin = useRef(new Animated.Value(0)).current;
  const activityRefreshRotation = activityRefreshSpin.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const triggerActivityConfetti = useCallback(() => {
    setShowActivityConfetti(true);
  }, []);

  // Load member-specific activity read state when the signed-in account changes.
  useEffect(() => {
    if (!activityReadKey || !activityReadIdsKey) {
      setSessionReadAt(activityDefaultReadAt);
      setReadItemIds(new Set());
      return;
    }

    // Read state lives on the profile so it follows you between devices; the
    // old per-browser keys are only a fallback for anyone mid-migration.
    const fromProfile = loadActivityRead(profile, communityId);
    setSessionReadAt(fromProfile.at ?? getStoredItem(activityReadKey) ?? activityDefaultReadAt);
    if (fromProfile.ids.size > 0) {
      setReadItemIds(fromProfile.ids);
    } else {
      try {
        const stored = getStoredItem(activityReadIdsKey);
        setReadItemIds(stored ? new Set(JSON.parse(stored)) : new Set());
      } catch {
        setReadItemIds(new Set());
      }
    }
  }, [activityDefaultReadAt, activityReadIdsKey, activityReadKey, profile?.id, communityId]);

  // "Mentions me" filter — persisted per member/device
  const [activityMentionsOnly, setActivityMentionsOnly] = useState<boolean>(() => (
    activityMentionsOnlyKey ? getStoredItem(activityMentionsOnlyKey) === 'true' : false
  ));

  useEffect(() => {
    setActivityMentionsOnly(activityMentionsOnlyKey ? getStoredItem(activityMentionsOnlyKey) === 'true' : false);
  }, [activityMentionsOnlyKey]);

  const toggleActivityMentionsOnly = useCallback(() => {
    setActivityMentionsOnly(prev => {
      const next = !prev;
      if (activityMentionsOnlyKey) setStoredItem(activityMentionsOnlyKey, next ? 'true' : 'false');
      return next;
    });
  }, [activityMentionsOnlyKey]);

  const currentFirstName = (profile?.name ?? '').trim().split(/\s+/)[0]?.toLowerCase() ?? '';

  const activityInvolvesMe = useCallback((item: ActivityItem) => {
    if (item.type === 'mention') return true;
    if (currentUserId && item.involvesUserIds?.includes(currentUserId)) return true;
    // Fallback for items without ids — the feed embeds member names in text.
    if ((!item.involvesUserIds || item.involvesUserIds.length === 0) && currentFirstName) {
      return item.text.toLowerCase().includes(currentFirstName);
    }
    return false;
  }, [currentFirstName, currentUserId]);

  const visibleActivityItems = activityMentionsOnly ? activityItems.filter(activityInvolvesMe) : activityItems;

  const markItemRead = useCallback((itemId: string) => {
    setReadItemIds(prev => {
      const next = new Set(prev);
      next.add(itemId);
      if (activityReadIdsKey) {
        setStoredItem(activityReadIdsKey, JSON.stringify([...next]));
      }
      void persistActivityRead(profile, communityId, { ids: next });
      return next;
    });
  }, [activityReadIdsKey, profile, communityId]);

  const unreadActivityCount = activityItems.reduce(
    (count, item) => count + (item.timestamp > sessionReadAt && !readItemIds.has(item.id) ? 1 : 0),
    0
  );
  const hasUnreadActivity = unreadActivityCount > 0;

  const markAllActivityRead = useCallback(() => {
    const now = new Date().toISOString();
    setSessionReadAt(now);
    setReadItemIds(new Set());
    if (hasUnreadActivity) {
      triggerActivityConfetti();
    }
    if (activityReadKey) setStoredItem(activityReadKey, now);
    if (activityReadIdsKey) removeStoredItem(activityReadIdsKey);
  }, [activityReadKey, activityReadIdsKey, hasUnreadActivity, triggerActivityConfetti]);

  const getActivityDestination = useCallback((item: ActivityItem): ActivityItem['navigatesTo'] => {
    if (item.navigatesTo) return item.navigatesTo;
    if (item.type === 'wish_posted' || item.type === 'wish_granted') return 'wish';
    return undefined;
  }, []);

  const openWishById = useCallback(async (
    wishId: string,
    options: { alertOnUnavailable?: boolean; clearResumeOnUnavailable?: boolean } = {}
  ) => {
    if (!communityId) return;

    try {
      let { data, error } = await (supabase as any)
        .from('wishes')
        .select('*, user:profiles!user_id(id, name, avatar_url), board_category:board_categories!wishes_board_category_id_fkey(id, name, topic_kind, status), granters:wish_granters(*, granter:profiles!granter_id(id, name, avatar_url))')
        .eq('id', wishId)
        .eq('community_id', communityId)
        .in('status', ['public', 'fulfilled'])
        .single();

      if (
        error &&
        (String(error.message ?? '').includes('wishes_board_category_id_fkey') ||
          String(error.message ?? '').includes('board_category'))
      ) {
        const fallback = await (supabase as any)
          .from('wishes')
          .select('*, user:profiles!user_id(id, name, avatar_url), granters:wish_granters(*, granter:profiles!granter_id(id, name, avatar_url))')
          .eq('id', wishId)
          .eq('community_id', communityId)
          .in('status', ['public', 'fulfilled'])
          .single();
        data = fallback.data;
        error = fallback.error;
      }

      if (error || !data) throw error ?? new Error('Wish not found');
      openWishDetail(data as WishWithGranters);
    } catch (error) {
      console.warn('Could not open wish', error);
      if (options.clearResumeOnUnavailable) {
        clearSelectedWishResume();
      }
      if (options.alertOnUnavailable) {
        showAlert(
          'We could not open that wish',
          'It may have been archived or moved since that link was made. Have a look in Wishes for what is live now.',
        );
      }
    }
  }, [clearSelectedWishResume, communityId, openWishDetail]);

  const openWishFromActivity = useCallback((wishId: string) => {
    void openWishById(wishId, { alertOnUnavailable: true });
  }, [openWishById]);

  // Deep link: /hive?openWishId=... opens that wish's detail sheet (used by the
  // profile App Feedback shortcut; works for any screen that wants to point at a wish).

  // Swarm Report theme pills (and anything else) can deep-link straight into
  // the daily-question Catch-up modal. `from` says where to put you back when
  // the sheet closes — otherwise closing it strands you on the HIVE tab.
  useEffect(() => {
    if (catchup === '1') {
      const origin = Array.isArray(from) ? from[0] : from;
      catchUpReturnRef.current = CATCH_UP_RETURN_PATHS[origin ?? ''] ?? null;
      setShowCatchUpModal(true);
      router.setParams({ catchup: undefined, from: undefined } as any);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catchup, from]);
  const handledOpenWishIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!openWishId || !communityId) return;
    if (handledOpenWishIdRef.current === openWishId) return;
    handledOpenWishIdRef.current = openWishId;
    const origin = Array.isArray(from) ? from[0] : from;
    wishReturnRef.current = CATCH_UP_RETURN_PATHS[origin ?? ''] ?? null;
    void openWishById(openWishId, { alertOnUnavailable: true });
  }, [openWishId, communityId, openWishById, from]);

  // App Feedback used to live here: a search through this HIVE's public wishes
  // for a title containing "bug report", opened as a wish sheet. It is a screen
  // of its own now (`/app-feedback`, migration 138), because a wish needs a HIVE
  // and feedback about the app does not — which is exactly how Nat found it,
  // by pressing App Feedback at HIVE-Wide and arriving in Production HIVE.
  //
  // The ?feedback=1 parameter is gone with it. Nothing points here any more:
  // the rail and the Home honeycomb both go straight to the screen.


  const openEventFromActivity = useCallback(async (eventId: string) => {
    if (!communityId) return;

    try {
      const { data, error } = await supabase
        .from('events')
        .select('*')
        .eq('id', eventId)
        .eq('community_id', communityId)
        .single();

      if (error || !data) throw error ?? new Error('Event not found');
      openEditEvent(data as Event);
    } catch (error) {
      console.warn('Could not open event', error);
      showAlert(
        'We could not open that event',
        'It may have been deleted or moved since that link was made. Check the calendar on Home for what is coming up.',
      );
    }
  }, [communityId, openEditEvent]);

  const getActionItemDeepLink = useCallback((item: ActionItem): { label: string; onPress: () => void } | null => {
    if (item.related_wish_id) {
      const wishId = item.related_wish_id;
      return { label: 'Go to wish', onPress: () => openWishFromActivity(wishId) };
    }
    // A thread beats a whole board: if the to-do knows which conversation it
    // belongs to, land on that conversation. Production's jobs arrive this way
    // — the thread holds the phone number and the questions, and it is where
    // whoever took the job writes down what they found out.
    if (item.related_board_post_id) {
      const postId = item.related_board_post_id;
      return {
        label: 'Open the thread',
        onPress: () => router.push({
          pathname: '/board',
          params: { postId, from: 'home', open: String(Date.now()) },
        }),
      };
    }
    if (item.related_board_category_id) {
      const categoryId = item.related_board_category_id;
      return {
        label: 'Go to board',
        onPress: () => router.push({
          pathname: '/board',
          params: { categoryId, from: 'home', open: String(Date.now()) },
        }),
      };
    }
    if (item.related_user_id) {
      const memberId = item.related_user_id;
      return {
        label: 'Go to profile',
        onPress: () => router.push(
          memberId === profile?.id
            ? '/profile'
            : { pathname: '/(app)/members', params: { memberId } }
        ),
      };
    }
    return null;
  }, [openWishFromActivity, profile?.id, router]);

  useEffect(() => {
    if (!activeWishStorageKey) {
      restoredWishStorageKeyRef.current = null;
      return;
    }
    if (selectedWish || restoredWishStorageKeyRef.current === activeWishStorageKey) return;

    const storedWishId = getStoredItem(activeWishStorageKey);
    restoredWishStorageKeyRef.current = activeWishStorageKey;
    if (!storedWishId) return;

    void openWishById(storedWishId, { clearResumeOnUnavailable: true });
  }, [activeWishStorageKey, openWishById, selectedWish]);

  const navigateFromActivityItem = useCallback((item: ActivityItem) => {
    const destination = getActivityDestination(item);

    if (destination === 'board') {
      router.push({
        pathname: '/board',
        params: {
          ...(item.categoryId ? { categoryId: item.categoryId } : {}),
          postId: item.sourceId,
          from: 'home',
          open: String(Date.now()),
        },
      });
    } else if (destination === 'members') {
      router.push('/members');
    } else if (destination === 'wish') {
      openWishFromActivity(item.sourceId);
    } else if (destination === 'event') {
      void openEventFromActivity(item.sourceId);
    } else if (destination === 'messages') {
      if (item.sourceId) {
        router.push({ pathname: '/messages', params: { roomId: item.sourceId } });
      } else {
        router.push('/messages');
      }
    } else if (destination === 'tuneup') {
      router.push({ pathname: '/monthly-tuneup', params: { from: 'hive' } } as any);
    }
  }, [getActivityDestination, openEventFromActivity, openWishFromActivity, router]);

  const handleActivityPress = useCallback((item: ActivityItem) => {
    const wasUnread = item.timestamp > sessionReadAt && !readItemIds.has(item.id);
    const clearsLastUnread = wasUnread && unreadActivityCount === 1;
    const destination = getActivityDestination(item);

    if (wasUnread) {
      markItemRead(item.id);
    }

    if (clearsLastUnread) {
      triggerActivityConfetti();
      if (destination) {
        setTimeout(() => navigateFromActivityItem(item), 700);
        return;
      }
    }

    navigateFromActivityItem(item);
  }, [getActivityDestination, markItemRead, navigateFromActivityItem, readItemIds, sessionReadAt, triggerActivityConfetti, unreadActivityCount]);

  const openBoardsHome = useCallback(() => {
    clearBoardNavigationState(communityId);
    router.push('/board');
  }, [communityId, router]);

  const handleActivityScroll = useCallback((event: any) => {
    const y = event.nativeEvent?.contentOffset?.y ?? 0;
    if (y < -8 && !showActivityPullSpace) {
      setShowActivityPullSpace(true);
    } else if (y >= 0 && showActivityPullSpace && !isActivityChecking) {
      setShowActivityPullSpace(false);
    }
  }, [isActivityChecking, showActivityPullSpace]);

  const handleActivityRefresh = useCallback(async () => {
    const previousTop = activityItems[0];
    const previousIds = new Set(activityItems.map(item => item.id));
    setIsActivityChecking(true);
    setShowActivityPullSpace(true);
    activityRefreshSpin.setValue(0);
    const spin = Animated.loop(
      Animated.timing(activityRefreshSpin, { toValue: 1, duration: 700, useNativeDriver: true })
    );
    spin.start();

    try {
      // `useActivityFeed` moved onto TanStack Query (2026-08-12), so `refetch`
      // hands back a query result rather than the array itself. The freshly
      // fetched items live on `.data`.
      const refreshed = await refetchActivity();
      const nextItems = refreshed.data ?? [];
      const nextTop = nextItems[0];
      const hasNewActivity = !!nextTop && (
        !previousTop ||
        nextTop.timestamp > previousTop.timestamp ||
        (nextTop.timestamp === previousTop.timestamp && !previousIds.has(nextTop.id))
      );
      const hasUnreadAfterRefresh = nextItems.some(
        item => item.timestamp > sessionReadAt && !readItemIds.has(item.id)
      );

      if (!hasNewActivity && !hasUnreadAfterRefresh && (nextItems.length > 0 || activityItems.length > 0)) {
        triggerActivityConfetti();
      }
    } finally {
      spin.stop();
      activityRefreshSpin.stopAnimation();
      setIsActivityChecking(false);
      setTimeout(() => setShowActivityPullSpace(false), 420);
    }
  }, [activityItems, activityRefreshSpin, readItemIds, refetchActivity, sessionReadAt, triggerActivityConfetti]);

  useFocusEffect(
    useCallback(() => {
      const now = Date.now();
      if (now - activityLastFocusRefreshRef.current < 3000) return;

      activityLastFocusRefreshRef.current = now;
      refetchActivity();
    }, [refetchActivity])
  );

  // Member carousel state
  const [carouselMembers, setCarouselMembers] = useState<{ id: string; name: string; avatar_url?: string | null; role: string }[]>([]);

  useEffect(() => {
    if (!communityId) {
      setCarouselMembers([]);
      setCurrentMembershipStartedAt(null);
      return;
    }
    supabase
      .from('community_memberships')
      .select('user_id, role, created_at, profiles(id, name, avatar_url)')
      .eq('community_id', communityId)
      .order('created_at', { ascending: true })
      .then(({ data }) => {
        if (data) {
          const currentMembership = data.find((m: any) => m.user_id === currentUserId);
          setCurrentMembershipStartedAt(currentMembership?.created_at ?? null);
          setCarouselMembers(
            data.map((m: any) => ({
              id: m.profiles?.id ?? m.user_id,
              name: m.profiles?.name ?? '',
              avatar_url: m.profiles?.avatar_url ?? null,
              role: m.role ?? 'member',
            })).filter(m => m.name)
          );
        } else {
          setCurrentMembershipStartedAt(null);
        }
      });
  }, [communityId, currentUserId]);

  // Use the optimized hive data hook (React Query with caching)
  const {
    publicWishes,
    grantedWishes,
    upcomingEvents,
    honeyPotBalance,
    isLoading,
    loading,
    refetch,
  } = useHiveDataQuery(
    communityId ?? undefined,
    profile?.id,
    duesEnabled && community?.slug === 'default',
  );

  /** Places this HIVE has used appear before the remote place lookup catches up. */
  const knownLocations = useMemo(() => {
    const seen = new Map<string, string>();
    [...upcomingEvents, ...pastEvents].forEach((event) => {
      const place = (event.location ?? '').trim();
      if (place && !seen.has(place.toLowerCase())) seen.set(place.toLowerCase(), place);
    });
    return [...seen.values()];
  }, [upcomingEvents, pastEvents]);

  // Surveys
  const {
    availableSurveys,
    pendingSurveys,
    myResponses,
    submitResponse,
    loading: surveysLoading,
  } = useSurveys(communityId ?? undefined, profile?.id);
  const [activeSurvey, setActiveSurvey] = useState<Survey | null>(null);
  const [wishStatusTab, setWishStatusTab] = useState<WishStatusTabKey>('public');
  const [todoStatusTab, setTodoStatusTab] = useState<TodoStatusTabKey>('open');
  const pendingSurveyIds = new Set(pendingSurveys.map((survey) => survey.id));
  const activeSurveyResponse = activeSurvey ? myResponses.get(activeSurvey.id) : undefined;
  const activeSurveyIsEditing = !!activeSurvey && !!activeSurveyResponse && !pendingSurveyIds.has(activeSurvey.id);
  const {
    items: carryForwardItems,
    loading: carryForwardLoading,
    error: carryForwardError,
  } = useCarryForwardContext({
    communityId,
    userId: profile?.id,
    survey: activeSurvey,
  });
  const publicHdWishes = publicWishes.filter((wish) => wish.status === 'public' && wish.is_active !== false);
  const grantedHdWishes = grantedWishes.filter((wish) => wish.status === 'fulfilled');
  const visibleHdWishes = wishStatusTab === 'granted'
    ? grantedHdWishes
    : publicHdWishes;
  const hdWishesEmptyText = wishStatusTab === 'granted'
    ? 'No granted HD wishes yet'
    : 'No public HD wishes yet';

  const openSurvey = useCallback((survey: Survey) => {
    setActiveSurvey(survey);
    if (activeSurveyStorageKey) {
      setStoredItem(activeSurveyStorageKey, survey.id);
    }
  }, [activeSurveyStorageKey]);

  /**
   * The check-in email's button lands ON the check-in.
   *
   * Nat, 2026-08-15: *"when I clicked on the survey button in the mail, it just
   * brought me into HIVE, it didn't bring me directly into the survey, and we
   * always want that. If you leave instructions 'it's in home' and then the
   * link drops them HIVE-Wide and then they have to navigate to the correct
   * spot on the correct page in the correct HIVE? We might lose them."*
   *
   * The link carries both the survey and its HIVE, so it works from wherever
   * the reader happens to be standing — including HIVE-Wide, and including a
   * member of three HIVEs whose last one was a different one. If they are in
   * the wrong HIVE we move them first and this effect runs again on arrival.
   */
  const handledSurveyIdRef = useRef<string | null>(null);
  /**
   * The ASK, remembered — because the URL will not hold still.
   *
   * Opening the check-in takes several steps: come down out of HIVE-Wide,
   * switch to the named HIVE, wait for that HIVE's surveys to load, then open
   * the right one. The address bar changes underneath all of that — switching
   * HIVEs replaces the route, and this effect clears the params itself when it
   * is done — so reading the ask off the URL each time means any one of those
   * steps can drop it, and the member lands on Home, or back at HIVE-Wide,
   * with no idea why the button did nothing.
   *
   * Nat, 2026-09-01, clicking the button in her own preview and arriving at
   * HIVE-Wide: *"cant send it out until its good, mate."* Quite. So the ask is
   * captured the first time it is seen and kept until it is carried out. The
   * URL is where the request arrives; it is not where the request lives.
   */
  const surveyAskRef = useRef<{ surveyId: string; hiveId: string | null } | null>(null);
  const askedSurveyId = Array.isArray(openSurveyId) ? openSurveyId[0] : openSurveyId;
  const askedHiveId = Array.isArray(linkedHiveId) ? linkedHiveId[0] : linkedHiveId;
  if (askedSurveyId && handledSurveyIdRef.current !== askedSurveyId) {
    surveyAskRef.current = { surveyId: askedSurveyId, hiveId: askedHiveId ?? null };
  }

  useEffect(() => {
    const ask = surveyAskRef.current;
    if (!ask || handledSurveyIdRef.current === ask.surveyId) return;
    // Standing above the HIVEs counts as being in the wrong one: picking a HIVE
    // by name is how you come down out of Whole HIVE (see switchCommunity).
    if (ask.hiveId && (ask.hiveId !== communityId || wholeHive)) {
      void switchCommunity(ask.hiveId);
      return;
    }
    if (!communityId || wholeHive) return;
    // Surveys arrive a moment after the screen does; wait for the real row
    // rather than giving up and leaving them on Home wondering.
    const match = availableSurveys.find((s) => s.id === ask.surveyId);
    if (!match) return;
    handledSurveyIdRef.current = ask.surveyId;
    surveyAskRef.current = null;
    openSurvey(match);
    router.setParams({ openSurveyId: undefined, hive: undefined } as any);
  }, [askedSurveyId, askedHiveId, communityId, wholeHive, availableSurveys, openSurvey, switchCommunity, router]);

  const closeSurvey = useCallback(() => {
    setActiveSurvey(null);
    if (activeSurveyStorageKey) {
      removeStoredItem(activeSurveyStorageKey);
    }
  }, [activeSurveyStorageKey]);

  const handleSurveySubmit = useCallback(async (answers: SurveyAnswers) => {
    if (!activeSurvey) return { error: 'No active survey' };

    const result = await submitResponse(activeSurvey.id, answers);
    if (!result.error && activeSurveyStorageKey) {
      removeStoredItem(activeSurveyStorageKey);
    }
    return result;
  }, [activeSurvey, activeSurveyStorageKey, submitResponse]);

  useEffect(() => {
    if (!activeSurveyStorageKey) {
      restoredSurveyStorageKeyRef.current = null;
      return;
    }
    if (surveysLoading || restoredSurveyStorageKeyRef.current === activeSurveyStorageKey) return;

    const storedSurveyId = getStoredItem(activeSurveyStorageKey);
    restoredSurveyStorageKeyRef.current = activeSurveyStorageKey;
    if (!storedSurveyId) return;

    const survey = pendingSurveys.find((item) => item.id === storedSurveyId);
    if (survey) {
      setActiveSurvey(survey);
    } else {
      removeStoredItem(activeSurveyStorageKey);
    }
  }, [activeSurveyStorageKey, pendingSurveys, surveysLoading]);

  useEffect(() => {
    if (!activeSurvey || surveysLoading) return;

    const currentSurvey = pendingSurveys.find((item) => item.id === activeSurvey.id);
    if (currentSurvey && currentSurvey !== activeSurvey) {
      setActiveSurvey(currentSurvey);
    }
  }, [activeSurvey, pendingSurveys, surveysLoading]);

  // For granting wishes
  const { grantWish } = useWishes();

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([refetch(), handleActivityRefresh(), fetchTodayAnswers(), fetchRecentAnswers(), fetchMyActionItems(), fetchMyDuesStatus()]);
    } finally {
      setRefreshing(false);
    }
  };

  // "Fresh honey" update flow + one-tap install (both web only, native no-ops)
  const { updateAvailable, applyUpdate } = useAppUpdate();
  const { canPromptInstall, promptInstall } = useInstallPrompt();
  const { isStandalone: isInstalledWebApp } = useWebAppDisplayMode();
  // Hide "Add to Home" when already running as an installed web app.
  const hideAddToHomePill = Platform.OS === 'web' && isInstalledWebApp;

  const showPhoneInstallHelp = useCallback(() => {
    if (Platform.OS === 'web' && canPromptInstall) {
      // Android Chrome (and other Chromium): trigger the real install prompt.
      // Falls back to the instructions modal if the prompt fails to show.
      void promptInstall().catch(() => setShowAddHomeGuide(true));
      return;
    }
    // iOS Safari / unsupported browsers: manual instructions, unchanged.
    setShowAddHomeGuide(true);
  }, [canPromptInstall, promptInstall]);

  // Refresh pill: data refresh normally; when a new build is live it quietly
  // runs the full app-update flow instead. The banner is the only visual
  // messenger for updates — the pill label never changes (no doubling up).
  //
  // This has to force a fresh check on every tap rather than trust
  // `updateAvailable` (the background poll's last result) — that flag can
  // still be false the moment someone taps, especially right after opening
  // the app, and this pill is the one thing Nat told her least technical
  // members to rely on for staying current (2026-08-25).
  const handleRefreshPill = async () => {
    if (Platform.OS === 'web' && (updateAvailable || (await checkForUpdateNow()))) {
      void applyUpdate();
      return;
    }
    void onRefresh();
  };

  const homeIsUpdating = refreshing || isLoading || activityLoading || homeActionLoading || duesStatusLoading;

  // Open event modal for creating
  const openCreateEvent = () => {
    setEditingEvent(null);
    setEventDraftSource(null);
    setEventTitle('');
    setEventDate('');
    setEventEndDate('');
    setEventAllDay(false);
    setEventTime('');
    setEventEndTime('');
    setEventDescription('');
    setEventLocation('');
    setEventAudience('members');
    setEventVisibility('members');
    setShowEventModal(true);
  };

  // Close event modal and reset state
  const closeEventModal = () => {
    setShowEventModal(false);
    setEditingEvent(null);
    setEventDraftSource(null);
    setEventError(null);
    setEventTitle('');
    setEventDate('');
    setEventEndDate('');
    setEventAllDay(false);
    setEventTime('');
    setEventEndTime('');
    setEventDescription('');
    setEventLocation('');
    setEventAudience('members');
    setEventVisibility('members');
  };

  const saveEvent = async () => {
    setEventError(null);
    if (!eventTitle.trim()) {
      setEventError('Please enter an event title.');
      return;
    }
    if (!eventDate) {
      setEventError('Please select a date.');
      return;
    }
    if (!communityId) {
      setEventError('No community found. Please refresh and try again.');
      return;
    }

    // Convert American date format to ISO for storage
    const eventDateIso = parseAmericanDate(eventDate);
    if (!eventDateIso) {
      setEventError('Invalid date format. Please pick a date using the calendar.');
      return;
    }

    let eventEndDateIso: string | null = null;
    if (eventEndDate.trim()) {
      eventEndDateIso = parseAmericanDate(eventEndDate);
      if (!eventEndDateIso) {
        setEventError('Invalid end date. Please pick it using the calendar.');
        return;
      }
      if (eventEndDateIso < eventDateIso) {
        setEventError('The end date should be after the start date.');
        return;
      }
      if (eventEndDateIso === eventDateIso) eventEndDateIso = null;
    }

    const normalizedTime = eventAllDay ? { time: null, note: '' } : normalizeEventTimeInput(eventTime);
    if (!eventAllDay && eventTime.trim() && !normalizedTime.time) {
      setEventError('For time, use something like 7:30 PM. Put extra details like doors/showtime in the description.');
      return;
    }
    // An end time is optional, and only means anything alongside a start.
    const normalizedEnd = eventAllDay ? { time: null, note: '' } : normalizeEventTimeInput(eventEndTime);
    if (!eventAllDay && eventEndTime.trim() && !normalizedEnd.time) {
      setEventError('For the end time, use something like 7:00 PM.');
      return;
    }
    if (normalizedEnd.time && !normalizedTime.time) {
      setEventError('Add a start time as well, so the two make a window.');
      return;
    }
    if (normalizedEnd.time && normalizedTime.time && normalizedEnd.time <= normalizedTime.time) {
      setEventError('The end time should be after the start time.');
      return;
    }
    const descriptionWithTimeNote = [
      normalizedTime.note ? `Time note: ${normalizedTime.note}` : null,
      // Any note already in there is stripped first — otherwise every save
      // prepends another copy of the same line.
      withoutTimeNotes(eventDescription) || null,
    ].filter(Boolean).join('\n\n');

    setSavingEvent(true);
    try {
      if (editingEvent) {
        // Update existing event
        const { error } = await supabase
          .from('events')
          .update({
            title: eventTitle,
            event_date: eventDateIso,
            end_date: eventEndDateIso,
            event_time: normalizedTime.time,
            end_time: normalizedEnd.time,
            description: descriptionWithTimeNote || null,
            location: eventLocation || null,
            visibility: eventVisibility,
            invited_scope: eventAudience,
          })
          .eq('id', editingEvent.id);

        if (error) throw error;
      } else {
        // Create new event
        const newEvent: Record<string, string | null> = {
          title: eventTitle,
          event_date: eventDateIso,
          community_id: communityId,
        };

        if (descriptionWithTimeNote) newEvent.description = descriptionWithTimeNote;
        if (eventEndDateIso) newEvent.end_date = eventEndDateIso;
        if (normalizedTime.time) newEvent.event_time = normalizedTime.time;
        if (normalizedEnd.time) newEvent.end_time = normalizedEnd.time;
        if (eventLocation.trim()) newEvent.location = eventLocation.trim();
        newEvent.visibility = eventVisibility;
        (newEvent as Record<string, unknown>).invited_scope = eventAudience;

        await createCalendarEvent(newEvent);
      }

      closeEventModal();
      await refetch();
    } catch (error: any) {
      console.error('Error saving event:', error);
      const msg = error?.message || '';
      if (msg.includes('row-level security') || msg.includes('policy') || msg.includes('permission')) {
        setEventError('Permission denied. Ask your admin to apply the latest database update.');
      } else {
        setEventError(userFacingError(error, `The event did not ${editingEvent ? 'update' : 'save'}. Your details are still here — please try again.`));
      }
    } finally {
      setSavingEvent(false);
    }
  };

  const deleteEvent = async () => {
    if (!editingEvent || !communityId) return;

    const doDelete = async () => {
      try {
        const { error } = await supabase
          .from('events')
          .delete()
          .eq('id', editingEvent.id)
          .eq('community_id', communityId);

        if (error) throw error;

        closeEventModal();
        await refetch();
      } catch (error) {
        console.error('Error deleting event:', error);
        showAlert(
          'That event is still on the calendar',
          'Deleting it did not save. Check your connection and try again.',
        );
      }
    };

    confirmAction({
      title: 'Delete Event',
      message: 'Are you sure you want to delete this event?',
      confirmLabel: 'Delete',
      destructive: true,
      onConfirm: doDelete,
    });
  };

  // Handle grant wish
  const handleGrantWish = async (data: {
    wishId: string;
    granterIds: string[];
    thankYouMessage?: string;
  }) => {
    const result = await grantWish(data.wishId, data.granterIds, data.thankYouMessage);
    if (!result.error) {
      await refetch();
    }
    return result;
  };

  const handleEditWishSave = async () => {
    await refetch();
    setEditingWish(null);
    closeWishDetail();
  };

  // Owner-only wish tools (Nat, 2026-07-23): the admin do-it-for-them override
  // retired — check-ins walk everyone through their own wishes now, and one
  // pencil per own-wish reads cleaner.
  const canEditWish = useCallback((wish: Wish) => (
    !!profile && wish.status !== 'fulfilled' && wish.user_id === profile.id
  ), [profile]);
  const canDeleteWish = useCallback((wish: Wish) => !!profile && wish.user_id === profile.id, [profile]);
  const canGrantWish = useCallback((wish: Wish) => (
    !!profile && wish.status === 'public' && wish.user_id === profile.id
  ), [profile]);
  const canArchiveWish = useCallback((wish: Wish) => (
    !!profile
    && wish.status === 'public'
    && wish.is_active !== false
    && wish.user_id === profile.id
  ), [profile]);
  const canRefineWish = useCallback((wish: Wish) => (
    !!profile && wish.status !== 'fulfilled' && wish.user_id === profile.id
  ), [profile]);
  const canOpenWishActions = useCallback((wish: Wish) => (
    canGrantWish(wish) || canEditWish(wish) || canArchiveWish(wish) || canDeleteWish(wish) || canRefineWish(wish)
  ), [canArchiveWish, canDeleteWish, canEditWish, canGrantWish, canRefineWish]);

  const handleArchiveWish = useCallback((wish: Wish) => {
    if (!profile || !communityId || !canArchiveWish(wish)) return;

    const archiveWish = async () => {
      let query = supabase
        .from('wishes')
        .update({ status: 'replaced', is_active: false, replaced_at: new Date().toISOString() } as any)
        .eq('id', wish.id)
        .eq('community_id', communityId);

      if (!isAdmin) {
        query = query.eq('user_id', profile.id);
      }

      const { error } = await query;

      if (error) {
        console.warn('Could not archive wish', error);
        showAlert(
          'That wish is still in Wishes',
          'Archiving it did not save. Check your connection and try again.',
        );
        return;
      }

      await invalidateWishQueries(communityId, wish.user_id);
      await refetch();
      if (selectedWish?.id === wish.id) {
        closeWishDetail();
      }
      if (managingWish?.id === wish.id) {
        setManagingWish(null);
      }
      offerUndo({ id: wish.id, message: 'Wish removed.' });
    };

    confirmAction({
      title: 'Archive Wish',
      message: `Archive this wish from Wishes?\n\n"${wish.description}"`,
      confirmLabel: 'Archive',
      onConfirm: archiveWish,
    });
  }, [canArchiveWish, closeWishDetail, communityId, isAdmin, managingWish?.id, profile, refetch, selectedWish?.id]);


  // Removing a wish is recoverable now (migration 200), so the screen that
  // removed it offers it straight back rather than leaving the safety net
  // somewhere nobody thinks to look.
  const { offer: undoOffer, busy: undoBusy, setBusy: setUndoBusy, offerUndo, dismissUndo } = useUndoOffer();
  const handleUndoWish = useCallback(async (target: { id: string }) => {
    setUndoBusy(true);
    const { error } = await restoreWishById(target.id);
    setUndoBusy(false);
    if (error) {
      showAlert('That wish did not come back', 'It is still safe. Check your connection and try again.');
      return;
    }
    dismissUndo();
    await invalidateWishQueries(communityId ?? '', null);
    await refetch();
  }, [dismissUndo, setUndoBusy]);

  const handleDeleteWish = (wish: Wish) => {
    if (!profile || !communityId) return;
    if (!canDeleteWish(wish)) return;

    const deleteWish = async () => {
      const { error } = await deleteWishById({
        wishId: wish.id,
        communityId,
        ownerId: isAdmin ? null : profile.id,
      });

      if (error) {
        console.warn('Could not delete wish', error);
        showAlert(
          'That wish is still here',
          'Deleting it did not save. Check your connection and try again.',
        );
        return;
      }

      await invalidateWishQueries(communityId, wish.user_id);
      await refetch();
      if (selectedWish?.id === wish.id) {
        closeWishDetail();
      }
      if (managingWish?.id === wish.id) {
        setManagingWish(null);
      }
    };

    confirmAction({
      title: 'Delete Wish',
      message: `Delete this wish?\n\n"${wish.description}"\n\nYou can undo this.`,
      confirmLabel: 'Delete',
      destructive: true,
      onConfirm: deleteWish,
    });
  };

  // Halfway between meetings the newsletter goes out. The nudge used to be a
  // push with nowhere to land in-app, so Home carries the short check-in for a
  // stretch of days — and stops the moment you've done it, because stale
  // to-dos piling up is exactly what we're avoiding (Nat 2026-07-25).
  // What's new in the app. A quiet strip rather than a pop-up: an interstitial
  // on every login becomes the thing everyone learns to dismiss without
  // reading (Nat 2026-07-26 wants to see whether even this is distracting).
  const [unseenNews, setUnseenNews] = useState<AppNewsEntry[]>([]);
  const [newsExpanded, setNewsExpanded] = useState(false);
  useEffect(() => {
    if (!profile) return;
    let cancelled = false;
    // The profile is the truth; the old per-device key is only a fallback for
    // anyone who dismissed this before it moved (Nat 2026-08-02).
    const fromProfile = loadAppNewsSeen(profile);
    // Someone who has never dismissed the strip gets only what shipped after
    // they joined. The whole build log is not news to a new member; it is the
    // app they already walked into (Nat 2026-08-19).
    const joinedAt = (profile.created_at as string | undefined) ?? null;
    if (fromProfile) {
      setUnseenNews(getUnseenAppNews(fromProfile, joinedAt, appNews));
    } else {
      void getStoredItemAsync(getAppNewsSeenKey(profile.id)).then((lastSeenId) => {
        if (!cancelled) setUnseenNews(getUnseenAppNews(lastSeenId, joinedAt, appNews));
      });
    }
    return () => { cancelled = true; };
  }, [appNews, profile?.id]);

  const dismissAppNews = useCallback(() => {
    setUnseenNews([]);
    setNewsExpanded(false);
    if (!profile) return;
    // Caught up means caught up with everything, not just the five on screen.
    const newest = getNewestAppNews(appNews);
    if (newest) {
      void setStoredItemAsync(getAppNewsSeenKey(profile.id), newest.id);
      void persistAppNewsSeen(profile, newest.id);
    }
  }, [appNews, profile]);

  const [halfwayDone, setHalfwayDone] = useState(false);
  useEffect(() => {
    if (!communityId || !profile) return;
    let cancelled = false;
    void getStoredItemAsync(getHalfwayDoneKey(communityId, profile.id)).then((value) => {
      if (!cancelled) setHalfwayDone(value === '1');
    });
    return () => { cancelled = true; };
  }, [communityId, profile?.id]);

  // When to nudge, and what to say, is per-HIVE — see `getHalfwayShape` in
  // lib/checkIns.ts for why OG rides the calendar and Tech rides its meeting.
  // Either way the card drops the moment you finish, because stale to-dos
  // piling up is what we're avoiding. The flow itself is always open from
  // Meetings; this is only the nudge.
  const todayKey = pacificToday();
  const todayDate = new Date(`${todayKey}T12:00:00`);
  const halfwayShape = getHalfwayShape(community);
  const nextMeeting = upcomingEvents.find((event) => event.event_type === 'meeting');
  const nextMeetingDate = nextMeeting?.event_date;
  const tomorrowKey = new Date(Date.parse(`${todayKey}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
  const meetingIsTomorrow = nextMeetingDate === tomorrowKey;
  const [checkInCompletionTimes, setCheckInCompletionTimes] = useState<Map<string, string>>(new Map());
  useFocusEffect(useCallback(() => {
    let active = true;
    if (!profile?.id || !communityId) {
      setCheckInCompletionTimes(new Map());
      return () => { active = false; };
    }
    // Do not let the prior HIVE's shared-survey receipt survive even one render.
    setCheckInCompletionTimes(new Map());
    void supabase.from('check_in_completions')
      .select('survey_id, occurrence, completed_at')
      .eq('user_id', profile.id)
      .eq('community_id', communityId)
      .then(({ data, error }) => {
        if (!active || error) return;
        setCheckInCompletionTimes(new Map((data ?? []).map((row) => [
          `${communityId}:${row.survey_id}:${row.occurrence}`,
          row.completed_at,
        ])));
      });
    return () => { active = false; };
  }, [communityId, profile?.id]));
  // `flow: 'tuneup'` means this card is the door. Every HIVE reads that way as
  // of 2026-08-28 — Production's halfway became a copy of OG's rather than a
  // survey of its own — and the value is kept rather than assumed so a HIVE
  // whose halfway is a bare survey is still one entry, not a rewrite.
  const inHalfwayWindow = !!halfwayShape
    && halfwayShape.flow === 'tuneup'
    && isInHalfwayWindow(halfwayShape, todayDate, nextMeetingDate);
  /**
   * ...and when it IS the door, the survey behind it does not get a second one.
   *
   * Production's halfway row is now the filing cabinet the wizard writes the
   * newsletter answer into, not a screen anybody is meant to open. Left alone,
   * Home would have offered both in the same window — "Halfway check-in · take
   * 2 min" sitting directly above "Halfway check-in", one of them the nudge Nat
   * approved and the other the raw survey behind it. Two cards for one job is
   * the same trap the old `flow: 'survey'` note warned about, arrived at from
   * the opposite direction.
   *
   * It is the SHAPE that decides, not today's window and not whether she has
   * finished. Tied to the window, the raw survey would have reappeared on 1
   * September and sat there for a week; tied to `halfwayDone`, it would have
   * popped up the moment somebody completed the wizard — finish your check-in,
   * and here is your check-in again. If the wizard is this HIVE's door, it is
   * the door on every day of the month.
   */
  const halfwayWizardOwnsTheDoor = halfwayShape?.flow === 'tuneup';

  const homeTodos: HomeTodo[] = [
    ...(inHalfwayWindow && halfwayShape && !halfwayDone
      ? [{
          id: 'halfway-checkin',
          emoji: halfwayShape.emoji,
          title: 'End of the month',
          detail: halfwayShape.detail,
          cta: 'Take 2 min →',
          onPress: () => router.push({
            pathname: '/monthly-tuneup',
            params: { from: 'hive', mode: 'midpoint' },
          } as any),
        } as HomeTodo]
      : []),
    // The forms themselves stay open from Meetings. Home is the nudge: Before
    // we meet appears the day before this HIVE's meeting, and End of the month
    // keeps its own month-end window.
    // Quarterly and end-of-year check-ins keep to their season: the card
    // appears three days before the quarter/year ends and steps back two
    // weeks after (lib/checkIns.ts), however early the survey was launched
    // from Admin. Every other survey shows the moment it exists, unchanged.
    ...availableSurveys
      .filter((s) => isPreMeetingCheckInSurvey(s) && s.community_id == null
        ? meetingIsTomorrow
        : isSurveyOnHomeToday(s, todayDate))
      .filter((s) => !(halfwayWizardOwnsTheDoor && isEndOfMonthCheckInSurvey(s, community)))
      .map(s => {
      const response = myResponses.get(s.id);
      const isBeforeWeMeet = isPreMeetingCheckInSurvey(s) && s.community_id == null;
      const isEndOfMonth = isEndOfMonthCheckInSurvey(s) && s.community_id == null;
      const occurrence = isBeforeWeMeet && nextMeeting?.id
        ? `meeting:${nextMeeting.id}`
        : isEndOfMonth
          ? `month:${todayKey.slice(0, 7)}`
          : null;
      const receiptCompletedAt = occurrence
        ? checkInCompletionTimes.get(`${communityId}:${s.id}:${occurrence}`) ?? null
        : null;
      const submittedAt = occurrence ? receiptCompletedAt : response?.submitted_at ?? null;
      const isDone = occurrence
        ? !!receiptCompletedAt
        : !!submittedAt && !pendingSurveyIds.has(s.id);
      // Monthly check-ins route through the guided Monthly Tune-up (wishes →
      // hang ideas → calendar → helpers → check-in) instead of the bare survey.
      const isMonthlyTuneUp = isMonthlyCheckInSurvey(s);
      // The compass (quarter) and the party popper (year) — the season
      // check-ins wear their own marks so the card says which rhythm it is.
      const seasonKind = getSeasonCheckInKind(s);
      const tuneUpPeriodMatch = isMonthlyTuneUp
        ? getSurveyResponsePeriod(s).match(/^(\d{4})-(\d{2})$/)
        : null;
      const tuneUpMonthName = tuneUpPeriodMatch
        ? new Date(Number(tuneUpPeriodMatch[1]), Number(tuneUpPeriodMatch[2]) - 1, 1)
            .toLocaleString('en-US', { month: 'long' })
        : 'Monthly';

      return {
        id: `survey-${s.id}`,
        // One mark per rhythm: the clipboard for the monthly, the season
        // marks for the quarter and the year.
        emoji: seasonKind ? SEASON_CHECK_IN_EMOJI[seasonKind] : '📋',
        title: isMonthlyTuneUp ? `Before we meet · ${tuneUpMonthName}` : checkInDisplayName(s.title),
        detail: isDone && submittedAt
          ? `Submitted ${formatDateShort(submittedAt)} · Tap to edit`
          : s.due_date
            ? `Due ${formatSurveyDueDate(s.due_date)}`
            : 'Awaiting your response',
        cta: isDone ? undefined : 'Fill out →',
        isDone,
        completedAt: isDone ? submittedAt : null,
        onPress: isBeforeWeMeet
          ? () => router.push({ pathname: '/beforewemeet', params: { from: 'hive', hive: community?.slug ?? '' } } as any)
          : isEndOfMonth
            ? () => router.push({ pathname: '/endofmonth', params: { from: 'hive', hive: community?.slug ?? '' } } as any)
            : isMonthlyTuneUp
              ? () => router.push({ pathname: '/monthly-tuneup', params: { from: 'hive' } } as any)
              : () => openSurvey(s),
      };
    }),
    ...homeActionItems.map(a => {
      const deepLink = getActionItemDeepLink(a);
      const jot = parseActionItemDescription(a.description);
      const statusDetail = a.completed
        ? `Done${a.completed_at ? ` · ${formatDateShort(a.completed_at)}` : ''}`
        : a.due_date ? `Due ${formatDateShort(a.due_date)}` : undefined;
      // One "re:" format everywhere: parsed suffixes normalize to "X's HD",
      // and jots that predate the suffix derive it from related_user_id.
      const aboutName = (a as any).about?.name as string | undefined;
      const reSubject = jot.reLabel
        ? jot.reLabel.replace(/[’']s HummDinger$/i, "'s HD")
        : aboutName && a.related_user_id && a.related_user_id !== profile?.id
          ? `${aboutName.trim().split(/\s+/)[0]}'s HD`
          : null;
      // Uniform shape for every meeting jot: "@who · re: X's HD". Old jots
      // whose text never carried an @token fall back to @you — it's your list.
      const mentionTag = jot.mentionTag ?? (reSubject ? '@you' : null);
      const jotContext = [mentionTag, reSubject ? `re: ${reSubject}` : null, jot.elaboration]
        .filter(Boolean)
        .join(' · ');
      return {
        id: `action-${a.id}`,
        // HIVE Help wears the handshake everywhere, so the mark means the same
        // thing on Home as it does in the tune-up (Nat 2026-07-26). That
        // distinction used to be carried by a drawn icon; it is an emoji now,
        // and it had to move here or it would have been lost with the drawing.
        emoji: /^HIVE Help:/i.test(jot.text) ? '🤝' : '📝',
        title: jot.text,
        detail: [statusDetail, jotContext || null].filter(Boolean).join(' · ') || undefined,
        // Linked to-dos navigate on tap (like Recent Activity rows); the circle
        // still toggles done and long-press still archives. Unlinked to-dos
        // keep opening the detail sheet.
        cta: deepLink && !a.completed ? '›' : undefined,
        isDone: a.completed,
        completedAt: a.completed_at,
        onPress: deepLink && !a.completed ? deepLink.onPress : () => setSelectedActionItemId(a.id),
        onToggle: () => toggleActionItem(a),
        onLongPress: () => archiveActionItem(a),
        onArchive: a.completed ? () => archiveActionItem(a) : undefined,
      };
    }),
    ...(() => {
      // Only a HIVE that runs a Honey Pot has dues at all (migration 140).
      // Without this, OG's reminder — its $25 quarter and its $HiveLV cashtag —
      // rolled over onto every HIVE's Home (Nat caught it on Tech, 2026-08-11).
      if (!duesEnabled) return [];
      const today = new Date();
      const { year, quarter } = getCurrentDuesPeriod(today);
      const period = { year, quarter };
      const dueDate = getDuesPeriodEndDate(period);
      const dueDateKey = formatDateKey(dueDate);
      const duesReminderDismissed = dismissedDuesPeriodKeys.has(getDuesPeriodKey(period));
      const duesReminderAction = homeActionItems.find(item => (
        isQuarterlyDuesActionItem(item, period, dueDateKey)
      ));

      if (!duesStatusChecked || duesCoveredThisQuarter || duesReminderAction || duesReminderDismissed) return [];

      const dueDateLabel = formatDateShort(dueDate);
      const isDueToday = formatDateKey(today) === dueDateKey;
      return [{
        id: `quarterly-dues-${year}-q${quarter}`,
        emoji: '🍯',
        title: isDueToday ? 'Quarterly dues are due today!' : `Q${quarter} dues are due ${dueDateLabel}`,
        detail: duesStatusLoading
          ? 'Checking payment status...'
          : `Due ${dueDateLabel} · $${QUARTERLY_DUES_AMOUNT} for Q${quarter} ${year} · ${HONEY_POT_CASH_APP_HANDLE}`,
        cta: canManageDues ? 'Record →' : 'Pay →',
        ctaOnPress: canManageDues ? () => router.push('/admin') : () => router.push('/honey-pot' as any),
        onPress: canManageDues ? markQuarterlyDuesReminderDone : () => router.push('/honey-pot' as any),
        onToggle: markQuarterlyDuesReminderDone,
      }];
    })(),
  ];
  const openTodos = homeTodos.filter(todo => !todo.isDone);
  const doneTodos = homeTodos
    .filter(todo => todo.isDone)
    .sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''));
  const visibleTodos = todoStatusTab === 'done' ? doneTodos : openTodos;
  const completedActionCount = homeActionItems.filter(action => action.completed).length;
  // Four equal boxes (Nat's 2x2): panels wrap two-up on desktop, stack on
  // phone — same boxes, same order, real continuity between the two.
  const dashboardSectionStyle = useMobileLayout
    ? { width: '100%' as const }
    : { flexBasis: '47%' as const, flexGrow: 1, minWidth: 320 };
  // Desktop trimmed from 316 (Nat, 2026-08-08: laptop Home was just barely
  // too tall for one view — "so close it just feels like an oversight").
  // Every panel already scrolls its own content, so this only changes how
  // much shows before that, not what's reachable.
  const dashboardPanelHeight = useMobileLayout ? 310 : 292;
  const todoPanelMaxHeight = dashboardPanelHeight;
  const wishPanelHeight = dashboardPanelHeight;

  // Group consecutive 'panel' sections so they share a row on wide screens
  // (and stack in order on mobile); 'full' sections always span the width.
  const homeSectionGroups = sectionOrder.reduce<HomeSectionKey[][]>((groups, key) => {
    const lastGroup = groups[groups.length - 1];
    if (HOME_SECTION_META[key].layout === 'panel' && lastGroup && HOME_SECTION_META[lastGroup[0]].layout === 'panel') {
      lastGroup.push(key);
    } else {
      groups.push([key]);
    }
    return groups;
  }, []);

  const visibleUpcomingEvents = hideBirthdayEvents
    ? upcomingEvents.filter(event => event.event_type !== 'birthday')
    : upcomingEvents;

  const visiblePastEvents = hideBirthdayEvents
    ? pastEvents.filter(event => event.event_type !== 'birthday')
    : pastEvents;

  // Group past events under month headers, oldest month first so the panel
  // reads as one timeline: past at the top, today, then upcoming below.
  const pastWindowLabel = pastMonthsShown > 0
    ? new Date(new Date().getFullYear(), new Date().getMonth() - (pastMonthsShown - 1), 1)
        .toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : null;
  const pastEventMonthGroups = visiblePastEvents.reduce<{ key: string; label: string; events: Event[] }[]>((groups, event) => {
    const key = event.event_date.slice(0, 7); // YYYY-MM
    const lastGroup = groups[groups.length - 1];
    if (lastGroup && lastGroup.key === key) {
      lastGroup.events.push(event);
      return groups;
    }
    const [year, month] = key.split('-').map(Number);
    groups.push({
      key,
      label: new Date(year, month - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
      events: [event],
    });
    return groups;
  }, []);

  const renderTodoRow = (todo: HomeTodo, isLast: boolean) => {
    const isDone = !!todo.isDone;
    const circleStyle = (pressed = false) => ({
      width: 24,
      height: 24,
      borderRadius: 12,
      borderWidth: 2,
      borderColor: isDone ? 'rgba(142,122,94,0.36)' : '#bd9348',
      backgroundColor: isDone ? 'rgba(142,122,94,0.12)' : pressed ? '#f7e7bd' : 'rgba(189,147,72,0.16)',
      flexShrink: 0,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
    });

    return (
      <Pressable
        key={todo.id}
        onPress={todo.onPress}
        onLongPress={todo.onLongPress}
        delayLongPress={520}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          padding: 14,
          borderBottomWidth: isLast ? 0 : 1,
          borderBottomColor: 'rgba(222,193,129,0.28)',
          backgroundColor: pressed && todo.onPress
            ? '#fbf4e3'
            : isDone ? '#fffdf5' : '#fff8e8',
          gap: 10,
        })}
      >
        {todo.onToggle ? (
          <Pressable
            onPress={(event) => {
              event.stopPropagation();
              todo.onToggle?.();
            }}
            accessibilityRole="button"
            accessibilityLabel={isDone ? 'Mark task open' : 'Mark task complete'}
            hitSlop={8}
            style={({ pressed }) => circleStyle(pressed)}
          >
            {isDone && <Text style={{ color: '#8e7a5e', fontSize: 12, lineHeight: 14 }}>✓</Text>}
          </Pressable>
        ) : (
          <View style={circleStyle(false)} />
        )}
        <Text style={{ fontSize: 18, flexShrink: 0 }}>{todo.emoji}</Text>
        <View style={{ flex: 1 }}>
          <Text style={{
            fontFamily: isDone ? 'Lato_400Regular' : 'Lato_700Bold',
            fontSize: 13,
            color: isDone ? '#7f715f' : '#2d2d2d',
            lineHeight: 18,
            fontStyle: isDone ? 'italic' : 'normal',
            textDecorationLine: isDone ? 'line-through' : 'none',
          }} numberOfLines={2}>
            {todo.title}
          </Text>
          {todo.detail ? (
            <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 11, color: isDone ? '#8e7a5e' : '#9a8060', marginTop: 2 }}>
              {todo.detail}
            </Text>
          ) : null}
        </View>
        {isDone && todo.onArchive ? (
          <Pressable
            onPress={(event) => {
              event.stopPropagation();
              todo.onArchive?.();
            }}
            accessibilityRole="button"
            accessibilityLabel="Archive completed task"
            hitSlop={8}
            style={({ pressed }) => ({
              backgroundColor: pressed ? '#ead9b8' : '#fff8e8',
              borderColor: 'rgba(189,147,72,0.36)',
              borderWidth: 1,
              borderRadius: 999,
              paddingHorizontal: 10,
              paddingVertical: 5,
              flexShrink: 0,
            })}
          >
            <Ionicons name="archive-outline" size={16} color="#8e6f35" />
          </Pressable>
        ) : !isDone && todo.cta ? (
          todo.ctaOnPress ? (
            <Pressable
              onPress={(event) => {
                event.stopPropagation();
                todo.ctaOnPress?.();
              }}
              accessibilityRole="button"
              accessibilityLabel={todo.cta.replace('→', '').trim()}
              hitSlop={8}
              style={({ pressed }) => ({
                opacity: pressed ? 0.72 : 1,
                flexShrink: 0,
              })}
            >
              <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 12, color: '#bd9348' }}>{todo.cta}</Text>
            </Pressable>
          ) : (
            <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 12, color: '#bd9348', flexShrink: 0 }}>{todo.cta}</Text>
          )
        ) : null}
      </Pressable>
    );
  };

  const renderTodoList = () => (
    <>
      {todoStatusTab === 'done' && completedActionCount > 0 ? (
        <Pressable
          onPress={archiveCompletedActionItems}
          accessibilityRole="button"
          accessibilityLabel="Archive all completed tasks"
          style={({ pressed }) => ({
            alignSelf: 'flex-end',
            flexDirection: 'row',
            alignItems: 'center',
            gap: 5,
            marginTop: 10,
            marginRight: 12,
            marginBottom: 2,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: 'rgba(189,147,72,0.34)',
            backgroundColor: pressed ? '#fbf0d7' : '#fff8e8',
            paddingHorizontal: 10,
            paddingVertical: 6,
          })}
        >
          <Ionicons name="archive-outline" size={14} color="#bd9348" />
          <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 11, color: '#bd9348' }}>Archive all</Text>
        </Pressable>
      ) : null}
      {visibleTodos.map((todo, index) => renderTodoRow(todo, index === visibleTodos.length - 1))}
    </>
  );

  // Show wish detail fullscreen
  if (selectedWish) {
    return (
      <SafeAreaView className="flex-1" style={{ backgroundColor: '#faf8f3' }} edges={['top']}>
        <WishDetail
          wish={selectedWish}
          onClose={closeWishDetail}
          onGrant={handleGrantWish}
          canManage={canOpenWishActions(selectedWish)}
          onManage={() => {
            const wish = selectedWish;
            closeWishDetail();
            setManagingWish(wish);
          }}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: '#faf8f3' }} edges={['top']}>
      <AppHeader title="Home" />

      <BounceScrollView
        ref={homeScrollRef}
        className="flex-1"
        contentContainerClassName="pb-4"
        // 16 on every width now. The 104 was clearance for the bottom tab bar,
        // which left on 2026-08-03 — since then it was just a blank stripe of
        // the root's background pasted under the last card on every phone
        // (Nat, 2026-08-25: "a plain white stripe of wasted space").
        contentContainerStyle={{ paddingBottom: 16 }}
        refreshControl={
          <RefreshControl refreshing={refreshing || isLoading} onRefresh={onRefresh} tintColor="#bd9348" />
        }
      >
        {/* What's new — a strip, not a pop-up. Tapping opens the list; the x
            marks everything read and it doesn't come back until we ship
            something else. */}
        {unseenNews.length > 0 ? (
          <View style={{ backgroundColor: '#fdf3dc', borderBottomWidth: 1, borderBottomColor: 'rgba(222,193,129,0.75)' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Pressable
                onPress={() => setNewsExpanded((open) => !open)}
                accessibilityRole="button"
                accessibilityLabel={`What's new in the HIVE — ${unseenNews.length} update${unseenNews.length === 1 ? '' : 's'}`}
                style={({ pressed }) => ({ flex: 1, paddingVertical: 9, paddingHorizontal: 14, opacity: pressed ? 0.7 : 1 })}
              >
                <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 13, color: '#8e6f35' }}>
                  ✨ {unseenNews.length} new thing{unseenNews.length === 1 ? '' : 's'} in the HIVE
                  <Text style={{ fontFamily: 'Lato_400Regular', color: '#a08a5e' }}>
                    {newsExpanded ? '  — tap to hide' : '  — tap to see'}
                  </Text>
                </Text>
              </Pressable>
              <CloseButton
                onPress={dismissAppNews}
                accessibilityLabel="Mark what's new as read"
                color="#7b6b59"
                size={18}
              />
            </View>
            {newsExpanded ? (
              <View style={{ paddingHorizontal: 16, paddingBottom: 12, gap: 8 }}>
                {unseenNews.map((entry) => {
                  // Reading about a new thing is half of it — the row takes you
                  // to the thing itself (Nat 2026-07-26). Entries with nowhere
                  // sensible to land stay plain text rather than faking a tap.
                  const body = (
                    <>
                      <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 13.5, color: '#2d2d2d' }}>
                        {entry.title}
                      </Text>
                      {entry.detail ? (
                        <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 12.5, lineHeight: 18, color: '#7b6b59' }}>
                          {entry.detail}
                        </Text>
                      ) : null}
                      {entry.href ? (
                        <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 12.5, color: '#bd9348', marginTop: 1 }}>
                          {entry.action ?? 'Take a look'} →
                        </Text>
                      ) : null}
                    </>
                  );

                  if (!entry.href) return <View key={entry.id}>{body}</View>;

                  return (
                    <Pressable
                      key={entry.id}
                      accessibilityRole="link"
                      accessibilityLabel={`${entry.title}. ${entry.action ?? 'Take a look'}`}
                      onPress={() => {
                        dismissAppNews();
                        if (entry.href!.pathname === '/app-feedback') {
                          openFeedback({ pathname: '/hive' });
                        } else {
                          router.push({
                            pathname: entry.href!.pathname as any,
                            params: { from: 'hive', ...(entry.href!.params ?? {}) },
                          });
                        }
                      }}
                      style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
                    >
                      {body}
                    </Pressable>
                  );
                })}
                <Pressable onPress={dismissAppNews} accessibilityRole="button" hitSlop={6} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
                  <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 12.5, color: '#bd9348', marginTop: 2 }}>
                    Got it, thanks →
                  </Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        ) : null}

        {/* Combined Daily Question + Member Answer Bubbles */}
        <View style={{ borderBottomWidth: 1, borderBottomColor: 'rgba(189,147,72,0.45)', backgroundColor: '#fffbf0' }}>
          <View style={{ flexDirection: 'row' }}>

            {/* Left: fixed question panel */}
            <View
              onTouchStart={() => setExpandedAnswerId(null)}
              style={{
                width: useMobileLayout ? 138 : 176,
                padding: 14,
                borderRightWidth: 1,
                borderRightColor: '#c49a3c',
                justifyContent: 'center',
                minHeight: 176,
              }}
            >
              {/* Kicker + serif star. No emoji, no category — the question
                  carries the panel (category stays backend-only). */}
              <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 10, color: '#bd9348', letterSpacing: useMobileLayout ? 0.5 : 0.9, marginBottom: 6 }} numberOfLines={1}>
                DAILY QUESTION
              </Text>
              <Text
                style={{ fontFamily: 'LibreBaskerville_700Bold', fontSize: useMobileLayout ? 13 : 15, color: '#2d2d2d', lineHeight: useMobileLayout ? 19 : 21 }}
                numberOfLines={6}
              >
                {todayQuestion.text}
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignSelf: 'flex-start', marginTop: 10 }}>
                <Pressable
                  onPress={() => setShowCatchUpModal(true)}
                  style={({ pressed }) => [{ backgroundColor: 'white', borderWidth: 1, borderColor: 'rgba(189,147,72,0.35)', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 5 }, pressed && { opacity: 0.7 }]}
                >
                  <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 10, color: '#bd9348' }}>
                    Catch up
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => router.push({ pathname: '/(app)/members', params: { view: 'swarm' } })}
                  style={({ pressed }) => [{ backgroundColor: 'white', borderWidth: 1, borderColor: 'rgba(189,147,72,0.35)', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 5 }, pressed && { opacity: 0.7 }]}
                >
                  <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 10, color: '#bd9348' }}>
                    Report
                  </Text>
                </Pressable>
              </View>
            </View>

            {/* Right: scrolling member answer bubbles */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              onTouchStart={() => setExpandedAnswerId(null)}
              contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 14, gap: 10 }}
            >
              {[...carouselMembers].sort((a, b) => {
                const aIsMe = a.id === profile?.id;
                const bIsMe = b.id === profile?.id;
                const aAnswer = aIsMe ? mySubmittedAnswer : (memberAnswers.get(a.id) ?? '');
                const bAnswer = bIsMe ? mySubmittedAnswer : (memberAnswers.get(b.id) ?? '');
                const aHas = !!aAnswer;
                const bHas = !!bAnswer;
                // Before answering, keep the user's entry point first. After answering,
                // their card joins the normal recency queue with everyone else.
                if (aIsMe && !aHas) return -1;
                if (bIsMe && !bHas) return 1;
                if (aHas && !bHas) return -1;
                if (!aHas && bHas) return 1;
                if (aHas && bHas) {
                  const aTs = answerTimestamps.get(a.id) ?? '';
                  const bTs = answerTimestamps.get(b.id) ?? '';
                  return bTs.localeCompare(aTs); // most recent first
                }
                if (aIsMe) return -1;
                if (bIsMe) return 1;
                return 0;
              }).map((member) => {
                const isMe = member.id === profile?.id;
                const firstName = member.name.split(' ')[0];
                const memberAnswer = isMe ? mySubmittedAnswer : (memberAnswers.get(member.id) ?? '');
                const hasAnswered = !!memberAnswer;
                const isExpanded = expandedAnswerId === member.id;
                const imgOpacity = isMe ? 1 : hasAnswered ? 1 : 0.45;
                return (
                  <View key={member.id} style={{ width: isExpanded ? 180 : 74, alignItems: 'center' }}>
                    {/* Avatar → member profile */}
                    <Pressable
                      onPress={() => {
                        setExpandedAnswerId(null);
                        router.push(isMe ? '/profile' : { pathname: '/(app)/members', params: { memberId: member.id } });
                      }}
                      style={({ pressed }) => [{ alignItems: 'center', width: '100%' }, pressed && { opacity: 0.7 }]}
                    >
                      <View style={{
                        borderRadius: 28,
                        borderWidth: isMe ? 2.5 : 2,
                        borderColor: isMe ? '#bd9348' : hasAnswered ? '#bd9348' : 'rgba(222,193,129,0.4)',
                        padding: 2.5,
                        marginBottom: 5,
                        backgroundColor: 'white',
                        shadowColor: '#000',
                        shadowOpacity: isMe || hasAnswered ? 0.1 : 0.04,
                        shadowRadius: 4,
                        shadowOffset: { width: 0, height: 1 },
                        elevation: isMe || hasAnswered ? 2 : 1,
                      }}>
                        {/* Signed rather than the stored address: this strip and the
                            profile tab icon were the last two places drawing a face
                            straight from `avatar_url`, which is what kept the avatars
                            bucket open. Its own grey silhouette is kept as the
                            stand-in — initials would be a different screen. */}
                        <SignedAvatarImage
                          url={member.avatar_url}
                          style={{ width: 44, height: 44, borderRadius: 22, opacity: imgOpacity }}
                          fallback={
                          <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: '#e8e3da', alignItems: 'center', justifyContent: 'flex-end', overflow: 'hidden', opacity: imgOpacity }}>
                            <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: '#b8b0a4', position: 'absolute', top: 8 }} />
                            <View style={{ width: 32, height: 21, borderTopLeftRadius: 16, borderTopRightRadius: 16, backgroundColor: '#b8b0a4' }} />
                          </View>
                          }
                        />
                      </View>
                    </Pressable>

                    {/* Name / answer affordance */}
                    <Pressable
                      onPress={() => {
                        if (isMe && !hasAnswered) {
                          openAnswerModal({ question: todayQuestion, index: todayIndex, dateKey: todayDateKey }, '');
                          return;
                        }
                        if (isMe) {
                          router.push('/profile');
                        } else {
                          setExpandedAnswerId(null);
                          router.push({ pathname: '/(app)/members', params: { memberId: member.id } });
                        }
                      }}
                      style={({ pressed }) => [{ width: '100%' }, pressed && { opacity: 0.7 }]}
                    >
                      <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 10, color: isMe && !hasAnswered ? '#bd9348' : hasAnswered ? '#2d2d2d' : '#b0a898', textAlign: 'center', marginBottom: 5 }} numberOfLines={1}>
                        {isMe && !hasAnswered ? 'Answer' : firstName}
                      </Text>
                    </Pressable>

                    {/* Answer bubble → expand full answer (or placeholder) */}
                    {hasAnswered ? (
                      <Pressable
                        onPress={(event) => {
                          event.stopPropagation();
                          setExpandedAnswerId(isExpanded ? null : member.id);
                        }}
                        style={({ pressed }) => ({
                          backgroundColor: pressed ? '#fdf3dc' : 'white',
                          borderRadius: 8,
                          borderWidth: 1,
                          borderColor: isExpanded ? '#bd9348' : '#c49a3c',
                          padding: isExpanded ? 9 : 6,
                          width: isExpanded ? 180 : 74,
                          shadowColor: '#bd9348',
                          shadowOpacity: isExpanded ? 0.12 : 0,
                          shadowRadius: 8,
                          shadowOffset: { width: 0, height: 2 },
                          elevation: isExpanded ? 2 : 0,
                        })}
                      >
                        <Text style={{ fontFamily: 'Lato_400Regular', fontSize: isExpanded ? 11 : 9, color: '#5c5648', lineHeight: isExpanded ? 16 : 13 }} numberOfLines={isExpanded ? undefined : 4}>
                          {memberAnswer}
                        </Text>
                      </Pressable>
                    ) : (
                      <Pressable
                        onPress={isMe ? () => openAnswerModal({ question: todayQuestion, index: todayIndex, dateKey: todayDateKey }, '') : undefined}
                        style={({ pressed }) => ({
                          borderRadius: 8,
                          borderWidth: 1,
                          borderColor: isMe ? 'rgba(189,147,72,0.4)' : 'rgba(222,193,129,0.25)',
                          borderStyle: 'dashed',
                          padding: 5,
                          width: 74,
                          alignItems: 'center',
                          backgroundColor: isMe && pressed ? '#fdf3dc' : 'transparent',
                        })}
                      >
                        <Text style={{ fontSize: 13 }}>{isMe ? '✍️' : '💭'}</Text>
                      </Pressable>
                    )}
                  </View>
                );
              })}
            </ScrollView>

          </View>
        </View>

        {/* Main Content */}
        <View className="p-4" onTouchStart={() => setExpandedAnswerId(null)}>

        {homeIsUpdating && (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
              backgroundColor: '#fffdf5',
              borderWidth: 1,
              borderColor: 'rgba(222,193,129,0.7)',
              borderRadius: 18,
              paddingHorizontal: 14,
              paddingVertical: 12,
              marginBottom: useMobileLayout ? 12 : 16,
              shadowColor: '#bd9348',
              shadowOpacity: 0.08,
              shadowRadius: 10,
              shadowOffset: { width: 0, height: 4 },
              elevation: 2,
            }}
          >
            <ThinkingBee />
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 13, color: '#bd9348' }}>
                Clive is gathering the latest HIVE buzz...
              </Text>
              <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 12, color: '#7b6b59', marginTop: 2 }}>
                Pulling activity, events, questions, and your to-dos.
              </Text>
            </View>
          </View>
        )}

        {/* Refresh / Add to Home / Customize — one compact pill row.
            It wraps: on a 375–393 point phone the three pills (four in
            customize mode) want more room than the column has, and each pill
            is flexShrink: 0 with a one-line label — so without the wrap the
            outer pills ran off both edges of the screen. */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          {customizeMode && (
            <Pressable
              onPress={() => { void persistHomeLayout(null, null); }}
              className="active:opacity-60"
              style={{ paddingHorizontal: 4 }}
            >
              <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 13, color: '#bd9348' }}>
                Reset to default
              </Text>
            </Pressable>
          )}
          {useMobileLayout && (
            <HeaderActionPill
              large
              label="↻ Refresh"
              onPress={handleRefreshPill}
              disabled={refreshing || isLoading}
            />
          )}
          {useMobileLayout && !hideAddToHomePill && (
            <HeaderActionPill large label="□↑ Add to Home" onPress={showPhoneInstallHelp} />
          )}
          <HeaderActionPill
            large
            label={customizeMode ? 'Done' : savingSectionOrder ? 'Saving…' : '⇅ Customize'}
            onPress={() => {
              if (savingSectionOrder) return;
              if (customizeMode) {
                void persistHomeLayout(sectionOrder, homeShortcuts);
              } else {
                setEditingShortcutSlot(null);
                setCustomizeMode(true);
              }
            }}
          />
        </View>

        {/* Home sections — order comes from sectionOrder (profiles.home_section_order) */}
        {(() => {
          const renderHomeSection = (key: HomeSectionKey) => {
            switch (key) {
              case 'activity':
                return (
                  <>
                    <HeaderTabs
                      tabs={[{ key: 'activity', label: 'Recent Activity' }]}
                      actions={
                        <>
                          {hasUnreadActivity && (
                            <HeaderActionPill label="✓ All read" onPress={markAllActivityRead} />
                          )}
                          <HeaderActionPill
                            label="@ me"
                            onPress={toggleActivityMentionsOnly}
                            selected={activityMentionsOnly}
                            accessibilityLabel="Only show activity that mentions me"
                          />
                        </>
                      }
                    />
                    <View style={{
                      backgroundColor: '#fffdf5',
                      borderRadius: 20,
                      borderTopLeftRadius: 0,
                      borderWidth: 1,
                      borderColor: 'rgba(222,193,129,0.7)',
                      shadowColor: '#bd9348',
                      shadowOpacity: 0.16,
                      shadowRadius: 18,
                      shadowOffset: { width: 0, height: 5 },
                      elevation: 3,
                      overflow: 'hidden',
                      height: dashboardPanelHeight,
                      position: 'relative',
                    }}>
                      <ConfettiBurst visible={showActivityConfetti} onDone={() => setShowActivityConfetti(false)} />
                      {/* Inner top highlight — liquid glass gloss */}
                      <View style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.75)', marginHorizontal: 10, marginTop: 0 }} />
                      {activityLoading && activityItems.length === 0 ? (
                        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                          <ThinkingBee />
                        </View>
                      ) : visibleActivityItems.length === 0 ? (
                        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20, backgroundColor: '#fdf3dc' }}>
                          <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 13, color: '#9a8060', textAlign: 'center' }}>
                            {activityMentionsOnly
                              ? `Nothing with your name on it yet 🐝${'\n'}Turn off "Mentions me" to see all activity.`
                              : `No recent activity yet.${'\n'}Start by sharing a wish or posting on the board!`}
                          </Text>
                        </View>
                      ) : (
                        // The shared bounce on the panel's own scroller, so the
                        // end of the activity list says so instead of just
                        // refusing to move (Nat's standing rule, 2026-08-06).
                        <BounceScrollView
                          nestedScrollEnabled
                          showsVerticalScrollIndicator={true}
                          onScroll={handleActivityScroll}
                          scrollEventThrottle={16}
                          refreshControl={<RefreshControl refreshing={isActivityChecking} onRefresh={handleActivityRefresh} tintColor="#bd9348" />}
                        >
                          {(isActivityChecking || showActivityPullSpace) && (
                            <View style={{ height: 54, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff8e8', borderBottomWidth: 1, borderBottomColor: 'rgba(222,193,129,0.24)' }}>
                              <Animated.View style={{ transform: [{ rotate: activityRefreshRotation }] }}>
                                <Text style={{ fontSize: 18, color: '#bd9348', lineHeight: 22 }}>◌</Text>
                              </Animated.View>
                              <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 11, color: '#bd9348', marginTop: 2 }}>
                                {isActivityChecking ? 'Checking activity...' : 'Pull to check activity'}
                              </Text>
                            </View>
                          )}
                          {visibleActivityItems.map((item, i) => {
                            const isUnread = item.timestamp > sessionReadAt && !readItemIds.has(item.id);
                            const canNavigate = !!getActivityDestination(item);
                            return (
                              <Pressable
                                key={item.id}
                                onPress={() => handleActivityPress(item)}
                                style={({ pressed }) => ({
                                  flexDirection: 'row',
                                  alignItems: 'center',
                                  padding: 14,
                                  borderBottomWidth: i < visibleActivityItems.length - 1 ? 1 : 0,
                                  borderBottomColor: 'rgba(222,193,129,0.28)',
                                  backgroundColor: isUnread
                                    ? pressed ? '#fbf0d7' : '#fff8e8'
                                    : pressed ? '#fbf4e3' : '#fffdf5',
                                })}
                              >
                                <View style={{
                                  width: 36,
                                  height: 36,
                                  borderRadius: 18,
                                  backgroundColor: isUnread ? 'rgba(222,193,129,0.26)' : 'rgba(222,193,129,0.14)',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  marginRight: 12,
                                  flexShrink: 0,
                                }}>
                                  <Text style={{ fontSize: 16 }}>{item.emoji}</Text>
                                </View>
                                {isUnread && (
                                  <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: '#bd9348', marginRight: 10, shadowColor: '#bd9348', shadowOpacity: 0.18, shadowRadius: 4, shadowOffset: { width: 0, height: 0 } }} />
                                )}
                                <View style={{ flex: 1 }}>
                                  <Text style={{ fontFamily: isUnread ? 'Lato_700Bold' : 'Lato_400Regular', fontSize: 13, color: isUnread ? '#2d2d2d' : '#756b5f', lineHeight: 18 }}>
                                    {item.text}
                                  </Text>
                                  <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 11, color: isUnread ? '#7b653e' : '#9a8d7c', marginTop: 3 }}>
                                    {getRelativeTime(item.timestamp)}
                                  </Text>
                                </View>
                                <View style={{ flexDirection: 'row', alignItems: 'center', marginLeft: 6, flexShrink: 0 }}>
                                  {canNavigate && (
                                    <Text style={{ fontSize: 16, color: isUnread ? 'rgba(143,109,49,0.72)' : 'rgba(189,147,72,0.35)', lineHeight: 20 }}>›</Text>
                                  )}
                                </View>
                              </Pressable>
                            );
                          })}
                        </BounceScrollView>
                      )}
                    </View>
                  </>
                );
              case 'todos':
                return (
                  <>
                    <HeaderTabs
                      activeTab={todoStatusTab}
                      onChange={setTodoStatusTab}
                      actionLabel="+ Task"
                      onAction={() => { setNewTaskText(''); setTaskError(null); setShowAddTaskModal(true); }}
                      compact
                      compactAction={false}
                      stretchTabs={false}
                      tabs={[
                        {
                          key: 'open',
                          label: 'Open To Do',
                          count: openTodos.length,
                        },
                        {
                          key: 'done',
                          label: 'Done',
                          count: doneTodos.length,
                        },
                      ]}
                    />
                    <View style={{
                      backgroundColor: '#fffdf5',
                      borderRadius: 20,
                      borderTopLeftRadius: 0,
                      borderWidth: 1,
                      borderColor: 'rgba(222,193,129,0.7)',
                      shadowColor: '#bd9348',
                      shadowOpacity: 0.16,
                      shadowRadius: 18,
                      shadowOffset: { width: 0, height: 5 },
                      elevation: 3,
                      overflow: 'hidden',
                      height: todoPanelMaxHeight,
                      position: 'relative',
                    }}>
                      <ConfettiBurst visible={showConfetti} onDone={() => setShowConfetti(false)} />
                      <View style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.75)', marginHorizontal: 10 }} />
                      {homeActionLoading ? (
                        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 32 }}>
                          <ThinkingBee />
                        </View>
                      ) : visibleTodos.length === 0 ? (
                        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20, paddingVertical: 28 }}>
                          <Text style={{ fontSize: 32, marginBottom: 8 }}>✅</Text>
                          <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 15, color: '#2d2d2d', marginBottom: 4, textAlign: 'center' }}>All clear!</Text>
                          <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 13, color: '#9a8060', textAlign: 'center', lineHeight: 18 }}>
                            {todoStatusTab === 'done'
                              ? 'No completed to-dos yet.'
                              : 'No pending to-dos.'}{'\n'}Meeting action items and{'\n'}check-ins will show up here.
                          </Text>
                        </View>
                      ) : (
                        <BounceScrollView nestedScrollEnabled showsVerticalScrollIndicator={true} style={{ maxHeight: todoPanelMaxHeight }}>
                          {renderTodoList()}
                        </BounceScrollView>
                      )}
                    </View>
                  </>
                );
              case 'events':
                return (
                  <>
                    <HeaderTabs
                      tabs={[{ key: 'events', label: 'Upcoming Events' }]}
                      actions={
                        <>
                          <HeaderActionPill
                            label={hideBirthdayEvents ? '🎂 Hidden' : '🎂 Hide'}
                            onPress={toggleHideBirthdayEvents}
                            selected={hideBirthdayEvents}
                            accessibilityLabel={hideBirthdayEvents ? 'Show birthday events' : 'Hide birthday events'}
                          />
                          <HeaderActionPill label="+ Event" onPress={openCreateEvent} />
                        </>
                      }
                    />
                    <View style={{
                      backgroundColor: '#fffdf5',
                      borderRadius: 20,
                      borderTopLeftRadius: 0,
                      borderWidth: 1,
                      borderColor: 'rgba(222,193,129,0.7)',
                      shadowColor: '#bd9348',
                      shadowOpacity: 0.12,
                      shadowRadius: 18,
                      shadowOffset: { width: 0, height: 5 },
                      elevation: 3,
                      overflow: 'hidden',
                      height: dashboardPanelHeight,
                    }}>
                      {/* Inner top highlight — liquid glass gloss */}
                      <View style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.95)', marginHorizontal: 10, marginTop: 0 }} />
                      {/* Past events load inline above upcoming — one timeline, one month per tap */}
                      <View style={{ flexDirection: 'row', alignItems: 'stretch', borderBottomWidth: 1, borderBottomColor: 'rgba(222,193,129,0.4)' }}>
                        <Pressable
                          onPress={showMorePastEvents}
                          disabled={pastEventsLoading}
                          accessibilityRole="button"
                          accessibilityLabel="View past events, one month further back per tap"
                          style={({ pressed }) => ({
                            flex: 1,
                            paddingVertical: 10,
                            alignItems: 'center',
                            backgroundColor: pressed ? '#fbf0d7' : 'transparent',
                            opacity: pastEventsLoading ? 0.6 : 1,
                          })}
                        >
                          <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 12, color: '#bd9348' }}>
                            {pastEventsLoading ? 'Loading…' : pastMonthsShown === 0 ? '‹ View past events' : '‹ View earlier events'}
                          </Text>
                        </Pressable>
                        {pastMonthsShown > 0 && (
                          <Pressable
                            onPress={collapsePastEvents}
                            accessibilityRole="button"
                            accessibilityLabel="Collapse past events"
                            style={({ pressed }) => ({
                              paddingVertical: 10,
                              paddingHorizontal: 14,
                              justifyContent: 'center',
                              borderLeftWidth: 1,
                              borderLeftColor: 'rgba(222,193,129,0.4)',
                              backgroundColor: pressed ? '#fbf0d7' : 'transparent',
                            })}
                          >
                            <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 12, color: '#9a8060' }}>Collapse ✕</Text>
                          </Pressable>
                        )}
                      </View>
                      {loading.events ? (
                        <View style={{ padding: 16 }}><EventsListSkeleton /></View>
                      ) : (
                        <BounceScrollView nestedScrollEnabled showsVerticalScrollIndicator={true} style={{ flex: 1 }}>
                          {pastMonthsShown > 0 && (
                            <>
                              <View style={{ opacity: 0.82 }}>
                                <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 11, color: '#9a8060', textAlign: 'center', paddingTop: 8 }}>
                                  Showing events since {pastWindowLabel}
                                </Text>
                                {pastEventMonthGroups.length === 0 ? (
                                  <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 12, color: '#9a8060', textAlign: 'center', paddingVertical: 10 }}>
                                    No events in this stretch — tap again to go back further.
                                  </Text>
                                ) : pastEventMonthGroups.map((group) => (
                                  <View key={group.key} style={{ paddingHorizontal: 14, paddingTop: 8 }}>
                                    <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 12, color: '#bd9348', marginBottom: 4 }}>
                                      {group.label}
                                    </Text>
                                    {group.events.map((event) => (
                                      <View
                                        key={event.id}
                                        style={{ flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: 'rgba(222,193,129,0.22)' }}
                                      >
                                        <Text style={{ fontSize: 15, marginRight: 8 }}>
                                          {getEventEmoji(event)}
                                        </Text>
                                        <View style={{ flex: 1 }}>
                                          <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 13, color: '#5b5b5b' }}>{event.title}</Text>
                                          <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 11, color: '#9a8060', marginTop: 1 }}>
                                            {formatDateRangeShort(event.event_date, event.end_date)}
                                            {event.event_time ? ` at ${formatTime(event.event_time)}` : ''}
                                            {event.location ? ` · ${event.location}` : ''}
                                          </Text>
                                        </View>
                                      </View>
                                    ))}
                                  </View>
                                ))}
                              </View>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 8 }}>
                                <View style={{ flex: 1, height: 1, backgroundColor: 'rgba(189,147,72,0.35)' }} />
                                <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 10, color: '#bd9348', letterSpacing: 1 }}>TODAY</Text>
                                <View style={{ flex: 1, height: 1, backgroundColor: 'rgba(189,147,72,0.35)' }} />
                              </View>
                            </>
                          )}
                          {visibleUpcomingEvents.length > 0 ? (
                            <EventsList events={visibleUpcomingEvents} onEditEvent={openEditEvent} />
                          ) : (
                            <View style={{ padding: 24, alignItems: 'center', justifyContent: 'center' }}>
                              <Text style={{ fontFamily: 'Lato_400Regular', color: '#a09274' }}>
                                {hideBirthdayEvents && upcomingEvents.length > 0 ? 'No upcoming events (birthdays hidden)' : 'No upcoming events'}
                              </Text>
                            </View>
                          )}
                        </BounceScrollView>
                      )}
                    </View>
                  </>
                );
              case 'shortcuts': {
                const shortcutOnPress: Record<HomeShortcutKey, () => void> = {
                  honey_pot: () => router.push('/honey-pot' as any),
                  boards: openBoardsHome,
                  messages: () => router.push('/messages'),
                  members: () => router.push('/members' as any),
                  meetings: () => router.push('/meetings' as any),
                  profile: () => router.push('/profile' as any),
                  clive: () => router.push('/' as any),
                  feedback: () => openFeedback({ pathname: '/hive' }),
                  swap_hives: () => openHivePicker(),
                  admin: () => router.push('/admin' as any),
                };
                // An empty row still spent its margin — a phantom gap at the
                // very top of Home (2026-08-19 standardization pass).
                if (homeShortcuts.length === 0) return null;
                return (
                  <View style={{ flexDirection: 'row', justifyContent: 'space-around', marginBottom: useMobileLayout ? 20 : 24, paddingHorizontal: 8 }}>
                    {homeShortcuts.map((shortcutKey) => (
                      <HexShortcut
                        key={shortcutKey}
                        emoji={HOME_SHORTCUT_META[shortcutKey].emoji}
                        icon={HOME_SHORTCUT_META[shortcutKey].icon}
                        label={HOME_SHORTCUT_META[shortcutKey].label}
                        sublabel={
                          // The dollar figure only exists where the HIVE runs a
                          // pot — a "$0" under the hex in a HIVE that never
                          // chose one reads as an abandoned fund, the exact
                          // look migration 140 exists to prevent. The shortcut
                          // itself stays: /honey-pot explains itself there.
                          shortcutKey === 'honey_pot' && duesEnabled
                            ? (loading.honeyPot ? '...' : `$${honeyPotBalance?.toFixed(0) ?? '0'}`)
                            : undefined
                        }
                        onPress={shortcutOnPress[shortcutKey]}
                      />
                    ))}
                  </View>
                );
              }
              case 'wishes':
                return (
                  <View>
                    <HeaderTabs
                      activeTab={wishStatusTab}
                      onChange={setWishStatusTab}
                      actionLabel="+ Wish"
                      onAction={() => setShowAddWishModal(true)}
                      compact={useMobileLayout}
                      compactAction={false}
                      stretchTabs={false}
                      tabs={[
                        {
                          key: 'public',
                          label: getHdWishTabLabel('public'),
                          count: publicHdWishes.length,
                        },
                        {
                          key: 'granted',
                          label: getHdWishTabLabel('granted'),
                          count: grantedHdWishes.length,
                        },
                      ]}
                    />

                    {loading.publicWishes && loading.grantedWishes ? (
                      <View style={{
                        backgroundColor: '#fffdf5',
                        borderRadius: 20,
                        borderTopLeftRadius: 0,
                        borderWidth: 1,
                        borderColor: 'rgba(222,193,129,0.7)',
                        shadowColor: '#bd9348',
                        shadowOpacity: 0.12,
                        shadowRadius: 18,
                        shadowOffset: { width: 0, height: 5 },
                        elevation: 3,
                        height: wishPanelHeight,
                        overflow: 'hidden',
                        padding: 12,
                      }}>
                        <WishSectionSkeleton />
                      </View>
                    ) : (
                      <View style={{
                        backgroundColor: '#fffdf5',
                        borderRadius: 20,
                        borderTopLeftRadius: 0,
                        borderWidth: 1,
                        borderColor: 'rgba(222,193,129,0.7)',
                        shadowColor: '#bd9348',
                        shadowOpacity: 0.12,
                        shadowRadius: 18,
                        shadowOffset: { width: 0, height: 5 },
                        elevation: 3,
                        height: wishPanelHeight,
                        overflow: 'hidden',
                      }}>
                        <BounceScrollView
                          nestedScrollEnabled
                          showsVerticalScrollIndicator={true}
                          style={{ flex: 1 }}
                          contentContainerStyle={{
                            padding: 12,
                            paddingBottom: 12,
                            flexGrow: visibleHdWishes.length === 0 ? 1 : undefined,
                          }}
                        >
                          {visibleHdWishes.length === 0 ? (
                            <View className="bg-white rounded-xl p-6 shadow-sm items-center">
                              <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-charcoal/50">
                                {hdWishesEmptyText}
                              </Text>
                            </View>
                          ) : (
                            visibleHdWishes.map((wish) => (
                              <WishCard
                                key={wish.id}
                                wish={wish}
                                onPress={() => openWishDetail(wish)}
                                canEdit={canOpenWishActions(wish)}
                                canDelete={canDeleteWish(wish)}
                                onManage={() => setManagingWish(wish)}
                                showBodyPreview={!useMobileLayout}
                              />
                            ))
                          )}
                        </BounceScrollView>
                      </View>
                    )}
                  </View>
                );
              default:
                return null;
            }
          };

          if (customizeMode) {
            return (
              <View style={{ marginBottom: 24 }}>
                <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 12, color: '#9a8060', marginBottom: 10 }}>
                  Use the arrows to reorder your home screen. Tap a shortcut slot to change what it opens. Tap Done to save.
                </Text>
                {sectionOrder.map((key, index) => (
                  <View
                    key={key}
                    style={{
                      backgroundColor: '#fffdf5',
                      borderWidth: 1,
                      borderColor: 'rgba(222,193,129,0.7)',
                      borderRadius: 16,
                      paddingVertical: 10,
                      paddingHorizontal: 14,
                      marginBottom: 10,
                      shadowColor: '#bd9348',
                      shadowOpacity: 0.08,
                      shadowRadius: 8,
                      shadowOffset: { width: 0, height: 3 },
                      elevation: 2,
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <Text style={{ fontSize: 16 }}>{HOME_SECTION_META[key].emoji}</Text>
                      <Text style={{ flex: 1, fontFamily: 'Lato_700Bold', fontSize: 14, color: '#2d2d2d' }} numberOfLines={1}>
                        {HOME_SECTION_META[key].title}
                      </Text>
                      <SectionMoveButton direction="up" disabled={index === 0} onPress={() => moveHomeSection(key, -1)} />
                      <SectionMoveButton direction="down" disabled={index === sectionOrder.length - 1} onPress={() => moveHomeSection(key, 1)} />
                    </View>
                    {key === 'shortcuts' && (
                      <View style={{ marginTop: 10 }}>
                        <View style={{ flexDirection: 'row', gap: 8 }}>
                          {homeShortcuts.map((shortcutKey, slot) => {
                            const isEditing = editingShortcutSlot === slot;
                            return (
                              <Pressable
                                key={slot}
                                onPress={() => setEditingShortcutSlot(prev => (prev === slot ? null : slot))}
                                accessibilityRole="button"
                                accessibilityLabel={`Change shortcut slot ${slot + 1}, currently ${HOME_SHORTCUT_META[shortcutKey].label}`}
                                style={({ pressed }) => ({
                                  flex: 1,
                                  flexDirection: 'row',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  gap: 6,
                                  paddingVertical: 8,
                                  paddingHorizontal: 8,
                                  borderRadius: 12,
                                  borderWidth: 1,
                                  borderColor: isEditing ? '#bd9348' : 'rgba(222,193,129,0.7)',
                                  backgroundColor: isEditing ? '#fbf0d7' : pressed ? '#fdf3dc' : '#fff8e8',
                                })}
                              >
                                <Text style={{ fontSize: 14 }}>{HOME_SHORTCUT_META[shortcutKey].emoji}</Text>
                                <Text
                                  style={{ fontFamily: 'Lato_700Bold', fontSize: 12, color: '#2d2d2d', flexShrink: 1 }}
                                  numberOfLines={1}
                                >
                                  {HOME_SHORTCUT_META[shortcutKey].label}
                                </Text>
                                <Ionicons name={isEditing ? 'chevron-up' : 'chevron-down'} size={12} color="#8e6f35" />
                              </Pressable>
                            );
                          })}
                        </View>
                        {editingShortcutSlot !== null && (
                          <View
                            style={{
                              marginTop: 8,
                              borderWidth: 1,
                              borderColor: 'rgba(222,193,129,0.7)',
                              borderRadius: 12,
                              backgroundColor: '#fff8e8',
                              overflow: 'hidden',
                            }}
                          >
                            {(Object.keys(HOME_SHORTCUT_META) as HomeShortcutKey[])
                              .filter((optionKey) => canManageDues || !HOME_SHORTCUT_META[optionKey].adminOnly)
                              .filter((optionKey) => canSwapHives || !HOME_SHORTCUT_META[optionKey].multiHiveOnly)
                              .map((optionKey, optionIndex) => {
                                const slot = editingShortcutSlot;
                                const isCurrent = homeShortcuts[slot] === optionKey;
                                const usedElsewhere = !isCurrent && homeShortcuts.includes(optionKey);
                                return (
                                  <Pressable
                                    key={optionKey}
                                    disabled={usedElsewhere}
                                    onPress={() => {
                                      setHomeShortcuts(prev => prev.map((k, i) => (i === slot ? optionKey : k)));
                                      setEditingShortcutSlot(null);
                                    }}
                                    accessibilityRole="button"
                                    accessibilityState={{ selected: isCurrent, disabled: usedElsewhere }}
                                    style={({ pressed }) => ({
                                      flexDirection: 'row',
                                      alignItems: 'center',
                                      gap: 10,
                                      paddingVertical: 10,
                                      paddingHorizontal: 12,
                                      borderTopWidth: optionIndex === 0 ? 0 : 1,
                                      borderTopColor: 'rgba(222,193,129,0.45)',
                                      backgroundColor: pressed && !usedElsewhere ? '#fbf0d7' : 'transparent',
                                      opacity: usedElsewhere ? 0.4 : 1,
                                    })}
                                  >
                                    <Text style={{ fontSize: 15 }}>{HOME_SHORTCUT_META[optionKey].emoji}</Text>
                                    <Text style={{ flex: 1, fontFamily: 'Lato_400Regular', fontSize: 13, color: '#2d2d2d' }}>
                                      {HOME_SHORTCUT_META[optionKey].label}
                                      {usedElsewhere ? ' · in another slot' : ''}
                                    </Text>
                                    {isCurrent && <Ionicons name="checkmark" size={16} color="#bd9348" />}
                                  </Pressable>
                                );
                              })}
                          </View>
                        )}
                      </View>
                    )}
                  </View>
                ))}
              </View>
            );
          }

          return homeSectionGroups.map((group) => (
            HOME_SECTION_META[group[0]].layout === 'panel' ? (
              <View
                key={group.join('-')}
                // marginBottom trimmed on desktop (Nat, 2026-08-08 — see the
                // panel-height note above; same fix, same reason).
                style={{ flexDirection: useMobileLayout ? 'column' : 'row', flexWrap: useMobileLayout ? undefined : 'wrap', gap: useMobileLayout ? 20 : 36, marginBottom: useMobileLayout ? 20 : 18, maxWidth: 1380, width: '100%', alignSelf: 'center' }}
              >
                {group.map((sectionKey) => (
                  <View key={sectionKey} style={dashboardSectionStyle}>
                    {renderHomeSection(sectionKey)}
                  </View>
                ))}
              </View>
            ) : (
              <View key={group[0]}>{renderHomeSection(group[0])}</View>
            )
          ));
        })()}

        </View>
      </BounceScrollView>

      {/* Add/Edit/View Event Modal */}
      <Modal visible={showEventModal} animationType="slide" transparent onRequestClose={() => setShowEventModal(false)}>
        <Pressable className="flex-1 bg-black/50 justify-end" onPress={() => setShowEventModal(false)}>
          {/* It scrolls, and it stops short of the top of the window.
              Nat, 2026-08-05: "i'm stuck here for some reason, i cant scroll in
              or out or up or down, i'm trapped." She was: this sheet had no
              ScrollView and no ceiling, so it grew to whatever its contents
              needed and ran straight off the screen — taking Cancel and Save
              with it. Adding the second scope picker this morning is what tipped
              a tall form into an unusable one. A bottom sheet that can grow has
              to be a sheet that can scroll. */}
          <Pressable
            className="bg-white rounded-t-3xl"
            style={{ maxHeight: '88%', width: '100%', maxWidth: 680, alignSelf: 'center' }}
            onPress={(e) => e.stopPropagation()}
          >
            <BounceScrollView
              contentContainerStyle={{ padding: 24 }}
              showsVerticalScrollIndicator
              keyboardShouldPersistTaps="handled"
            >
            {(() => {
              const canEdit = !!profile && !!communityId;
              const isViewOnly = editingEvent && !canEdit;
              const isEditingDraft = !!editingEvent || eventDraftSource === 'dues-reminder';

              return (
                <>
                  <View className="flex-row items-center justify-between mb-4">
                    <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-xl text-charcoal">
                      {isViewOnly ? 'Event Details' : isEditingDraft ? 'Edit Event' : 'Add Event'}
                    </Text>
                    {editingEvent && canEdit && (
                      <Pressable onPress={deleteEvent} className="p-2 active:opacity-70">
                        <Text className="text-red-500 text-sm">Delete</Text>
                      </Pressable>
                    )}
                  </View>

                  {isViewOnly ? (
                    // Read-only view for non-creators
                    <>
                      <View className="mb-4">
                        <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-xs text-charcoal/50 mb-1">Title</Text>
                        <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-base text-charcoal">{eventTitle}</Text>
                      </View>
                      <View className="flex-row mb-4">
                        <View className="flex-1 mr-4">
                          <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-xs text-charcoal/50 mb-1">
                            {eventEndDate ? 'Dates' : 'Date'}
                          </Text>
                          <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-base text-charcoal">
                            {eventEndDate ? `${eventDate} – ${eventEndDate}` : eventDate}
                          </Text>
                        </View>
                        <View>
                          <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-xs text-charcoal/50 mb-1">Time</Text>
                          <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-base text-charcoal">
                            {eventTime || 'All day'}
                          </Text>
                        </View>
                      </View>
                      {eventLocation && (
                        <View className="mb-4">
                          <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-xs text-charcoal/50 mb-1">Location</Text>
                          <Pressable
                            onPress={() => Linking.openURL(`https://maps.google.com/?q=${encodeURIComponent(eventLocation)}`)}
                            className="active:opacity-60"
                          >
                            <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-base text-gold underline">{eventLocation}</Text>
                          </Pressable>
                        </View>
                      )}
                      {eventDescription && (
                        <View className="mb-4">
                          <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-xs text-charcoal/50 mb-1">Description</Text>
                          <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-base text-charcoal">{eventDescription}</Text>
                        </View>
                      )}
                      {editingEvent?.meet_link && (
                        <Pressable
                          onPress={() => Linking.openURL(editingEvent.meet_link!)}
                          className="mb-4 bg-gold/10 py-3 px-4 rounded-lg flex-row items-center justify-center active:bg-gold/20"
                        >
                          <Text className="text-base mr-2">📹</Text>
                          <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-gold">Join Google Meet</Text>
                        </Pressable>
                      )}
                      <Pressable
                        onPress={closeEventModal}
                        className="bg-gray-200 py-3 rounded-lg active:opacity-70"
                      >
                        <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-center text-charcoal">Close</Text>
                      </Pressable>
                    </>
                  ) : (
                    // Editable view for creators
                    <>
                      {/* Every box in this modal is the shared one now, so the
                          event sheet reads like Clive's bar and the boards
                          instead of like a grey web form. */}
                      <ComposerBar
                        variant="form"
                        containerClassName="mb-3"
                        placeholder="Event Title"
                        value={eventTitle}
                        onChangeText={setEventTitle}
                        multiline={false}
                        onSubmit={saveEvent}
                        canSubmit={!savingEvent}
                        submitting={savingEvent}
                      />
                      {/* Keep dates together, then start and end times together. */}
                      <View className="mb-3" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                        <View style={{ flexGrow: 1, flexBasis: 180 }}>
                          <EventDatePicker
                            value={eventDate}
                            onChange={setEventDate}
                          />
                        </View>
                        <View style={{ flexGrow: 1, flexBasis: 180 }}>
                          <EventDatePicker
                            value={eventEndDate}
                            onChange={setEventEndDate}
                            label="End date"
                            placeholder="Same day — or pick one"
                            clearable
                          />
                        </View>
                      </View>
                      {!eventAllDay && (
                        <View className="mb-3" style={{ flexDirection: 'row', gap: 10 }}>
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-xs text-charcoal/50 mb-1">Start time</Text>
                            {/* A clock time, so no microphone — it wears the same
                                fill, hairline and placeholder ink as everything
                                around it. */}
                            <TimeInput
                              accessibilityLabel="Start time (AM or PM)"
                              placeholder="7:30 PM"
                              placeholderTextColor={FIELD_LOOK.placeholder}
                              selectionColor={FIELD_LOOK.ink}
                              value={eventTime}
                              onChangeText={setEventTime}
                              returnKeyType="next"
                              className="rounded-xl px-4 py-3 text-base text-charcoal"
                              style={{
                                width: '100%',
                                fontFamily: FIELD_LOOK.font,
                                backgroundColor: FIELD_LOOK.fill,
                                borderWidth: 1,
                                borderColor: FIELD_LOOK.border,
                              }}
                            />
                          </View>
                          {/* End time stays optional. */}
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-xs text-charcoal/50 mb-1">End time (optional)</Text>
                            <TimeInput
                              accessibilityLabel="End time (optional, AM or PM)"
                              placeholder="9:00 PM"
                              placeholderTextColor={FIELD_LOOK.placeholder}
                              selectionColor={FIELD_LOOK.ink}
                              value={eventEndTime}
                              onChangeText={setEventEndTime}
                              returnKeyType="send"
                              onSubmitEditing={saveEvent}
                              className="rounded-xl px-4 py-3 text-base text-charcoal"
                              style={{
                                width: '100%',
                                fontFamily: FIELD_LOOK.font,
                                backgroundColor: FIELD_LOOK.fill,
                                borderWidth: 1,
                                borderColor: FIELD_LOOK.border,
                              }}
                            />
                          </View>
                        </View>
                      )}
                      <Pressable
                        onPress={() => setEventAllDay((prev) => !prev)}
                        className="flex-row items-center mb-3 active:opacity-70"
                      >
                        <View className={`w-5 h-5 rounded border-2 mr-2 items-center justify-center ${eventAllDay ? 'bg-gold border-gold' : 'border-gray-300 bg-white'}`}>
                          {eventAllDay && <Text className="text-white text-xs">✓</Text>}
                        </View>
                        <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-sm text-charcoal">All day (no set time)</Text>
                      </Pressable>
                      {!eventAllDay && (
                        <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-xs text-charcoal/40 mb-3 -mt-1">
                          Extra details like doors/showtime can go in the time box too. We’ll save the first time and keep your note.
                        </Text>
                      )}
                      <LocationSearchInput
                        containerClassName="mb-3"
                        placeholder="Location (optional)"
                        value={eventLocation}
                        onChangeText={setEventLocation}
                        knownLocations={knownLocations}
                        onSubmit={saveEvent}
                        canSubmit={!savingEvent}
                      />
                      {/* The mic was on a strip under this box. It is inside the
                          border now, on the box's own footer. */}
                      <ComposerBar
                        variant="form"
                        containerClassName="mb-4"
                        placeholder="Description (optional)"
                        value={eventDescription}
                        onChangeText={setEventDescription}
                        minHeight={80}
                        onSubmit={saveEvent}
                        canSubmit={!savingEvent}
                        submitting={savingEvent}
                      />
                      <View className="mb-4">
                        <EventScopeFields
                          visibility={eventVisibility}
                          onVisibilityChange={setEventVisibility}
                          invited={eventAudience}
                          onInvitedChange={setEventAudience}
                        />
                      </View>

                      {eventError && (
                        <View className="bg-red-50 border border-red-200 rounded-lg px-4 py-2 mb-3">
                          <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-red-600 text-sm text-center">
                            {eventError}
                          </Text>
                        </View>
                      )}

                      <View className="flex-row">
                        <Pressable
                          onPress={closeEventModal}
                          className="flex-1 bg-gray-200 py-3 rounded-lg mr-2 active:opacity-70"
                        >
                          <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-center text-charcoal">Cancel</Text>
                        </Pressable>
                        <Pressable
                          onPress={saveEvent}
                          disabled={savingEvent}
                          className={`flex-1 bg-gold py-3 rounded-lg ${savingEvent ? 'opacity-50' : 'active:bg-gold/80'}`}
                        >
                          <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-center text-white">
                            {savingEvent ? 'Saving...' : isEditingDraft ? 'Save' : 'Create'}
                          </Text>
                        </Pressable>
                      </View>
                    </>
                  )}
                </>
              );
            })()}
            </BounceScrollView>
          </Pressable>
        </Pressable>
      </Modal>


      <WishManageModal
        visible={!!managingWish}
        wish={managingWish}
        onClose={() => setManagingWish(null)}
        canGrant={!!managingWish && canGrantWish(managingWish)}
        canEdit={!!managingWish && canEditWish(managingWish)}
        canArchive={!!managingWish && canArchiveWish(managingWish)}
        canDelete={!!managingWish && canDeleteWish(managingWish)}
        canRefine={!!managingWish && canRefineWish(managingWish)}
        onGrant={(wish) => setWishToGrant(wish)}
        onEdit={(wish) => setEditingWish(wish)}
        onArchive={handleArchiveWish}
        onDelete={handleDeleteWish}
        onRefine={(wish) => {
          router.push({ pathname: '/(app)', params: { refineWish: wish.description } });
        }}
      />

      <AddWishModal
        visible={!!editingWish}
        onClose={() => setEditingWish(null)}
        communityId={communityId}
        userId={profile?.id}
        onSave={handleEditWishSave}
        existingWish={editingWish}
        wishOwnerUserId={editingWish?.user_id}
        wishOwnerName={editingWish?.user?.name}
      />

      <AddWishModal
        visible={showAddWishModal}
        onClose={() => setShowAddWishModal(false)}
        communityId={communityId}
        userId={profile?.id}
        onSave={async () => { setShowAddWishModal(false); await refetch(); }}
        onRefineWithClive={(roughWish) => {
          setShowAddWishModal(false);
          router.push({ pathname: '/', params: { prefill: `I want to wish for: ${roughWish}` } });
        }}
      />

      {wishToGrant && (
        <GrantWishModal
          visible={!!wishToGrant}
          onClose={() => setWishToGrant(null)}
          wish={wishToGrant}
          communityId={communityId}
          onGrant={handleGrantWish}
        />
      )}

      {/* Add Task Modal */}
      <Modal visible={showAddTaskModal} animationType="slide" transparent onRequestClose={() => setShowAddTaskModal(false)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.48)', justifyContent: 'flex-end' }} onPress={() => setShowAddTaskModal(false)}>
          {/* A sheet that grows with what you type has to stop somewhere and
              scroll, or the button you are typing towards leaves the screen.
              Nat hit exactly this on 2026-08-05 — the box takes 1,000
              characters and the Add Task button was riding below the bottom
              edge with no way to reach it. The cap lives on the sheet and the
              padding moved inside the ScrollView so the rounded top stays put
              while the words move. */}
          <Pressable onPress={e => e.stopPropagation()} style={{ backgroundColor: '#fffdf5', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '88%', overflow: 'hidden' }}>
            <BounceScrollView contentContainerStyle={{ padding: 24, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
            <View style={{ width: 36, height: 4, backgroundColor: 'rgba(189,147,72,0.3)', borderRadius: 2, alignSelf: 'center', marginBottom: 20 }} />
            <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 18, color: '#2d2d2d', marginBottom: 4 }}>Add a Task</Text>
            <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 13, color: '#9a8060', marginBottom: 16 }}>Add something to your personal to-do list</Text>
            {/* A task is words, so it gets the shared box with the mic on its
                own footer — the mic used to sit on a strip underneath.
                The cap was 300 characters, which runs out inside one honest
                sentence about what you actually have to do; 1,000 now. */}
            <ComposerBar
              variant="form"
              containerClassName="mb-4"
              value={newTaskText}
              onChangeText={(next) => {
                setNewTaskText(next);
                if (taskError) setTaskError(null);
              }}
              placeholder="What do you need to do?"
              minHeight={90}
              maxLength={1000}
              counter="none"
              autoFocus
              onSubmit={handleAddTask}
              submitting={savingTask}
            />
            {taskError ? (
              <View style={{ backgroundColor: '#fef2f2', borderColor: '#fecaca', borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 12 }}>
                <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 13, color: '#dc2626', textAlign: 'center' }}>
                  {taskError}
                </Text>
              </View>
            ) : null}
            <Pressable
              onPress={handleAddTask}
              disabled={savingTask || !newTaskText.trim()}
              style={({ pressed }) => ({
                backgroundColor: newTaskText.trim() ? '#bd9348' : '#e5e7eb',
                borderRadius: 14,
                paddingVertical: 14,
                alignItems: 'center',
                opacity: pressed ? 0.8 : 1,
              })}
            >
              <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 16, color: newTaskText.trim() ? 'white' : '#a09274' }}>
                {savingTask ? 'Saving...' : 'Add Task'}
              </Text>
            </Pressable>
            </BounceScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Task Detail Modal */}
      <Modal
        visible={!!selectedActionItem}
        animationType="slide"
        transparent
        onRequestClose={() => {
          setSelectedActionItemId(null);
          cancelEditingActionItem();
        }}
      >
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.48)', justifyContent: 'flex-end' }}
          onPress={() => {
            setSelectedActionItemId(null);
            cancelEditingActionItem();
          }}
        >
          <Pressable
            onPress={event => event.stopPropagation()}
            style={{
              backgroundColor: '#fffdf5',
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              padding: 24,
              paddingBottom: useMobileLayout ? 40 : 28,
              maxHeight: useMobileLayout ? '78%' : '68%',
            }}
          >
            <View style={{ width: 36, height: 4, backgroundColor: 'rgba(189,147,72,0.3)', borderRadius: 2, alignSelf: 'center', marginBottom: 20 }} />
            {selectedActionItem ? (
              <>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 18, color: '#2d2d2d', marginBottom: 4 }}>Task</Text>
                    <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 13, color: '#9a8060' }}>
                      {selectedActionItem.completed
                        ? `Completed${selectedActionItem.completed_at ? ` · ${formatDateShort(selectedActionItem.completed_at)}` : ''}`
                        : selectedActionItem.due_date ? `Due ${formatDateShort(selectedActionItem.due_date)}` : 'On your personal to-do list'}
                    </Text>
                  </View>
                  <CloseButton
                    onPress={() => {
                      setSelectedActionItemId(null);
                      cancelEditingActionItem();
                    }}
                    accessibilityLabel="Close task details"
                    color="#8e6f35"
                    backgroundColor="#fff8e8"
                    size={18}
                    style={{ borderWidth: 1, borderColor: 'rgba(189,147,72,0.24)' }}
                  />
                </View>

                {editingActionItemId === selectedActionItem.id ? (
                  <View style={{ marginBottom: 18 }}>
                    <ComposerBar
                      variant="form"
                      value={taskEditText}
                      onChangeText={(next) => {
                        setTaskEditText(next);
                        if (taskEditError) setTaskEditError(null);
                      }}
                      placeholder="What needs doing?"
                      minHeight={96}
                      maxLength={1000}
                      counter="none"
                      autoFocus
                      onSubmit={() => saveActionItemEdit(selectedActionItem)}
                      submitting={savingTaskEdit}
                    />
                    {taskEditError ? (
                      <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 13, color: '#dc2626', marginTop: 8 }}>
                        {taskEditError}
                      </Text>
                    ) : null}
                    <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 12, lineHeight: 17, color: '#9a8060', marginTop: 8 }}>
                      The original wording stays in the task history after you save.
                    </Text>
                    <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
                      <Pressable
                        onPress={cancelEditingActionItem}
                        disabled={savingTaskEdit}
                        accessibilityRole="button"
                        accessibilityLabel="Cancel task edit"
                        style={({ pressed }) => ({
                          flex: 1,
                          backgroundColor: pressed ? '#f2e1bd' : '#fff8e8',
                          borderColor: 'rgba(189,147,72,0.36)',
                          borderWidth: 1,
                          borderRadius: 14,
                          paddingVertical: 12,
                          alignItems: 'center',
                        })}
                      >
                        <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 14, color: '#8e6f35' }}>Cancel</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => saveActionItemEdit(selectedActionItem)}
                        disabled={savingTaskEdit || !hasMeaningfulActionItemText(taskEditText)}
                        accessibilityRole="button"
                        accessibilityLabel="Save task edit"
                        style={({ pressed }) => ({
                          flex: 1,
                          backgroundColor: hasMeaningfulActionItemText(taskEditText) ? '#bd9348' : '#e5e7eb',
                          borderRadius: 14,
                          paddingVertical: 12,
                          alignItems: 'center',
                          opacity: pressed ? 0.8 : 1,
                        })}
                      >
                        <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 14, color: hasMeaningfulActionItemText(taskEditText) ? 'white' : '#a09274' }}>
                          {savingTaskEdit ? 'Saving…' : 'Save Changes'}
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                ) : (
                  <BounceScrollView showsVerticalScrollIndicator style={{ maxHeight: useMobileLayout ? 260 : 220, marginBottom: 18 }}>
                    <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 17, color: '#2d2d2d', lineHeight: 24 }}>
                      {selectedActionItem.description}
                    </Text>
                    {selectedActionItem.edited_at ? (
                      <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 12, color: '#9a8060', marginTop: 8 }}>
                        Edited {formatDateShort(selectedActionItem.edited_at)} · original kept in history
                      </Text>
                    ) : null}
                  </BounceScrollView>
                )}

                <View style={{ gap: 10 }}>
                  {editingActionItemId !== selectedActionItem.id ? (
                    <EditButton
                      onPress={() => startEditingActionItem(selectedActionItem)}
                      accessibilityLabel="Edit task"
                      style={{ alignSelf: 'flex-start' }}
                    />
                  ) : null}
                  {(() => {
                    const deepLink = getActionItemDeepLink(selectedActionItem);
                    if (!deepLink) return null;
                    return (
                      <Pressable
                        onPress={() => {
                          setSelectedActionItemId(null);
                          deepLink.onPress();
                        }}
                        accessibilityRole="button"
                        accessibilityLabel={deepLink.label}
                        style={({ pressed }) => ({
                          backgroundColor: pressed ? '#f2e1bd' : '#fff8e8',
                          borderColor: 'rgba(189,147,72,0.36)',
                          borderWidth: 1,
                          borderRadius: 14,
                          paddingVertical: 13,
                          paddingHorizontal: 14,
                          alignItems: 'center',
                          flexDirection: 'row',
                          justifyContent: 'center',
                          gap: 8,
                        })}
                      >
                        <Ionicons name="open-outline" size={16} color="#8e6f35" />
                        <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 15, color: '#8e6f35' }}>{deepLink.label}</Text>
                      </Pressable>
                    );
                  })()}
                  <Pressable
                    onPress={() => toggleActionItem(selectedActionItem)}
                    accessibilityRole="button"
                    accessibilityLabel={selectedActionItem.completed ? 'Mark task open' : 'Mark task complete'}
                    style={({ pressed }) => ({
                      backgroundColor: selectedActionItem.completed ? '#fff8e8' : '#bd9348',
                      borderColor: selectedActionItem.completed ? 'rgba(189,147,72,0.36)' : '#bd9348',
                      borderWidth: 1,
                      borderRadius: 14,
                      paddingVertical: 13,
                      paddingHorizontal: 14,
                      alignItems: 'center',
                      opacity: pressed ? 0.78 : 1,
                    })}
                  >
                    <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 15, color: selectedActionItem.completed ? '#8e6f35' : 'white' }}>
                      {selectedActionItem.completed ? 'Mark Open' : 'Mark Complete'}
                    </Text>
                  </Pressable>

                  <Pressable
                    onPress={() => archiveActionItem(selectedActionItem)}
                    accessibilityRole="button"
                    accessibilityLabel="Archive task"
                    style={({ pressed }) => ({
                      backgroundColor: pressed ? '#fdf2f2' : '#fffdf5',
                      borderColor: 'rgba(239,68,68,0.22)',
                      borderWidth: 1,
                      borderRadius: 14,
                      paddingVertical: 13,
                      paddingHorizontal: 14,
                      alignItems: 'center',
                      flexDirection: 'row',
                      justifyContent: 'center',
                      gap: 8,
                    })}
                  >
                    <Ionicons name="archive-outline" size={16} color="#b91c1c" />
                    <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 15, color: '#b91c1c' }}>Archive</Text>
                  </Pressable>
                </View>
              </>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Phone Home Screen Guide */}
      <Modal visible={showAddHomeGuide} animationType="slide" transparent onRequestClose={() => setShowAddHomeGuide(false)}>
        <Pressable
          onPress={() => setShowAddHomeGuide(false)}
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.48)', justifyContent: 'flex-end' }}
        >
          <Pressable
            onPress={(event) => event.stopPropagation()}
            style={{
              backgroundColor: 'white',
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              maxHeight: '88%',
              overflow: 'hidden',
            }}
          >
            <View style={{ alignItems: 'center', paddingTop: 12, paddingBottom: 4 }}>
              <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: '#e5e7eb' }} />
            </View>
            {/* Four step cards, two paragraphs and a button is a tall sheet, and
                on a short window the Got it button was the part that fell off
                the end — the one control that closes it. */}
            <BounceScrollView contentContainerStyle={{ paddingBottom: useMobileLayout ? 34 : 24 }}>
            <View style={{ paddingHorizontal: 22, paddingTop: 8 }}>
              <Text style={{ fontFamily: 'LibreBaskerville_700Bold', fontSize: 22, color: '#2d2d2d', marginBottom: 8 }}>
                Add HIVE to your Home Screen
              </Text>
              <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 14, color: '#8e7a5e', lineHeight: 20, marginBottom: 16 }}>
                iPhone keeps this inside the browser share menu. HIVE can guide you there, but the final Add to Home Screen button has to come from Safari.
              </Text>

              {[
                'Open app.the-hive.app in Safari.',
                'Tap the share icon, the box with an up arrow.',
                'Scroll down and tap Add to Home Screen.',
                'Tap Add, then HIVE will live like an app on your phone.',
              ].map((step, index) => (
                <View
                  key={step}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'flex-start',
                    gap: 10,
                    backgroundColor: '#fffdf5',
                    borderWidth: 1,
                    borderColor: 'rgba(222,193,129,0.65)',
                    borderRadius: 16,
                    padding: 12,
                    marginBottom: 10,
                  }}
                >
                  <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: '#fdf3dc', alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 12, color: '#bd9348' }}>{index + 1}</Text>
                  </View>
                  <Text style={{ flex: 1, fontFamily: 'Lato_700Bold', fontSize: 14, color: '#3f3a34', lineHeight: 20 }}>
                    {step}
                  </Text>
                </View>
              ))}

              <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 12, color: '#8a8175', lineHeight: 18, marginTop: 2, marginBottom: 14 }}>
                If that option does not appear, open HIVE directly in Safari first. Some in-app browsers and Chrome on iPhone hide it.
              </Text>

              <Pressable
                onPress={() => setShowAddHomeGuide(false)}
                style={({ pressed }) => [{ backgroundColor: '#bd9348', borderRadius: 16, paddingVertical: 14 }, pressed && { opacity: 0.7 }]}
              >
                <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 15, color: 'white', textAlign: 'center' }}>
                  Got it
                </Text>
              </Pressable>
            </View>
            </BounceScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Daily Question Catch-Up Modal */}
      <Modal visible={showCatchUpModal} animationType="slide" transparent onRequestClose={closeCatchUpModal}>
        <Pressable
          onPress={closeCatchUpModal}
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}
        >
          <Pressable
            onPress={(event) => event.stopPropagation()}
            style={{
              backgroundColor: 'white',
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              maxHeight: useMobileLayout ? '72%' : '82%',
            }}
          >
            <View style={{ alignItems: 'center', paddingTop: 12, paddingBottom: 4 }}>
              <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: '#e5e7eb' }} />
            </View>
            <View style={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 24 }}>
              <Text style={{ fontFamily: 'LibreBaskerville_700Bold', fontSize: 22, color: '#2d2d2d', marginBottom: 6 }}>
                Catch up
              </Text>
              <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 14, color: '#8e7a5e', lineHeight: 20, marginBottom: 14 }}>
                Answer the questions you missed, or peek at the days you already joined.
              </Text>
              <BounceScrollView
                nestedScrollEnabled
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={true}
                style={{ maxHeight: useMobileLayout ? 470 : 620 }}
                contentContainerStyle={{ paddingBottom: 2 }}
              >
                {recentDailyQuestions.map((item, index) => {
                  const answersForDate = recentAnswerMaps.get(item.dateKey) ?? new Map<string, string>();
                  const myPastAnswer = profile?.id ? answersForDate.get(profile.id) ?? '' : '';
                  const answerCount = answersForDate.size;
                  const date = new Date(`${item.dateKey}T00:00:00`);
                  const dateLabel = index === 0
                    ? 'Today'
                    : index === 1
                      ? 'Yesterday'
                      : date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

                  return (
                    <Pressable
                      key={item.dateKey}
                      onPress={() => {
                        // Hop to the answer sheet — the pending return travels
                        // with you, so closing that lands you back at the door.
                        setShowCatchUpModal(false);
                        openAnswerModal(item, myPastAnswer);
                      }}
                      style={({ pressed }) => ({
                        backgroundColor: pressed ? '#fce8b0' : '#fffdf5',
                        borderWidth: 1,
                        borderColor: myPastAnswer ? 'rgba(189,147,72,0.55)' : 'rgba(222,193,129,0.55)',
                        borderRadius: 16,
                        padding: useMobileLayout ? 12 : 14,
                        marginBottom: 10,
                      })}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                        <Text style={{ fontSize: useMobileLayout ? 22 : 24, lineHeight: 30 }}>{item.question.emoji}</Text>
                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
                            <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 12, color: '#bd9348', letterSpacing: 0.6 }}>
                              {dateLabel}
                            </Text>
                            <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 12, color: myPastAnswer ? '#739a88' : '#a09274' }}>
                              {myPastAnswer ? 'Answered' : 'Open'}
                            </Text>
                          </View>
                          <Text style={{ fontFamily: 'LibreBaskerville_700Bold', fontSize: useMobileLayout ? 14 : 15, color: '#2d2d2d', lineHeight: useMobileLayout ? 20 : 21 }}>
                            {item.question.text}
                          </Text>
                          {myPastAnswer ? (
                            <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 13, color: '#8e7a5e', lineHeight: 18, marginTop: 8 }} numberOfLines={2}>
                              Your answer: {myPastAnswer}
                            </Text>
                          ) : null}
                          <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 12, color: '#9a8060', marginTop: 8 }}>
                            {answerCount} {answerCount === 1 ? 'answer' : 'answers'} from HIVE
                          </Text>
                        </View>
                      </View>
                    </Pressable>
                  );
                })}
                {canShowMoreDailyQuestions ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Show ${nextCatchUpBatchSize} more daily questions`}
                    onPress={() => setCatchUpDayCount(prev => Math.min(prev + CATCH_UP_BATCH_SIZE, CATCH_UP_MAX_DAYS))}
                    style={({ pressed }) => ({
                      backgroundColor: pressed ? '#fbf0d7' : '#f5f3ee',
                      borderRadius: 14,
                      paddingVertical: 14,
                      marginTop: 2,
                      marginBottom: 10,
                    })}
                  >
                    <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 14, color: '#2d2d2d', textAlign: 'center' }}>
                      Show {nextCatchUpBatchSize} more
                    </Text>
                  </Pressable>
                ) : null}
              </BounceScrollView>
              <Pressable
                onPress={closeCatchUpModal}
                style={({ pressed }) => [{ backgroundColor: '#f5f3ee', borderRadius: 14, paddingVertical: 14, marginTop: 6 }, pressed && { opacity: 0.7 }]}
              >
                <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 15, color: '#2d2d2d', textAlign: 'center' }}>Close</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Daily Question Answer Modal */}
      <Modal visible={showAnswerModal} animationType="slide" transparent onRequestClose={closeAnswerModal}>
        <ModalBackdrop onClose={closeAnswerModal} style={{ justifyContent: 'flex-end' }}>
          {/* The answer box grows as you talk or type, and Cancel/Share sit
              under it — so the sheet needs a ceiling and something to scroll
              inside, the same way the Add a Task sheet does. The grabber stays
              above the scroll so there is always a fixed thing to look at. */}
          <View style={{ backgroundColor: 'white', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '88%', overflow: 'hidden' }}>
            <View style={{ alignItems: 'center', paddingTop: 12, paddingBottom: 4 }}>
              <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: '#e5e7eb' }} />
            </View>
            <BounceScrollView keyboardShouldPersistTaps="handled">
            <View style={{ paddingHorizontal: 24, paddingBottom: 40 }}>
              <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 11, color: '#bd9348', letterSpacing: 0.8, marginTop: 12, marginBottom: 6 }}>
                {currentAnswerPrompt.question.emoji} {currentAnswerPrompt.question.category.toUpperCase()}
              </Text>
              <Text style={{ fontFamily: 'LibreBaskerville_700Bold', fontSize: 15, color: '#2d2d2d', lineHeight: 22, marginBottom: 20 }}>
                {currentAnswerPrompt.question.text}
              </Text>
              {/* Your answer to the day's question — the shared box, mic on its
                  own footer inside the border. Talking here now shows the words
                  arriving as you say them, which the hand-rolled mic never did:
                  it only pasted the finished sentence at the end. */}
              <ComposerBar
                variant="form"
                containerClassName="mb-3.5"
                value={myAnswer}
                onChangeText={setMyAnswer}
                placeholder="Share your answer with HIVE..."
                minHeight={100}
                onSubmit={handleSubmitAnswer}
                canSubmit={!!myAnswer.trim() && !isSubmittingAnswer}
                submitting={isSubmittingAnswer}
              />
              <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 11, color: '#a09274', marginBottom: 14, marginTop: -6 }}>
                Press Enter to send · Shift+Enter for a new line
              </Text>
              {answerError ? (
                <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 13, color: '#ef4444', marginBottom: 14 }}>
                  {answerError}
                </Text>
              ) : null}
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Pressable
                  onPress={() => {
                    setMyAnswer(getMyAnswerForPrompt(currentAnswerPrompt));
                    setAnswerError(null);
                    closeAnswerModal();
                  }}
                  style={({ pressed }) => [{ flex: 1, backgroundColor: '#f5f3ee', borderRadius: 14, paddingVertical: 14 }, pressed && { opacity: 0.7 }]}
                >
                  <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 15, color: '#2d2d2d', textAlign: 'center' }}>Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={handleSubmitAnswer}
                  style={({ pressed }) => [{ flex: 2, backgroundColor: '#bd9348', borderRadius: 14, paddingVertical: 14, opacity: myAnswer.trim() && !isSubmittingAnswer ? 1 : 0.4 }, pressed && { opacity: 0.7 }]}
                  disabled={!myAnswer.trim() || isSubmittingAnswer}
                >
                  <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 15, color: 'white', textAlign: 'center' }}>
                    {isSubmittingAnswer ? 'Saving...' : 'Share with HIVE 🐝'}
                  </Text>
                </Pressable>
              </View>
            </View>
            </BounceScrollView>
          </View>
        </ModalBackdrop>
      </Modal>

      {/* Survey Modal */}
      {activeSurvey && (
        <SurveyModal
          survey={activeSurvey}
          initialAnswers={activeSurveyIsEditing ? activeSurveyResponse?.answers : undefined}
          isEditingResponse={activeSurveyIsEditing}
          carryForwardItems={carryForwardItems}
          carryForwardLoading={carryForwardLoading}
          carryForwardError={carryForwardError}
          hiveAccent={hiveAccent(community)}
          hiveSlug={community?.slug}
          onSubmit={handleSurveySubmit}
          onClose={closeSurvey}
        />
      )}
      <UndoBar
        offer={undoOffer}
        busy={undoBusy}
        onUndo={handleUndoWish}
        onDismiss={dismissUndo}
      />
    </SafeAreaView>
  );
}
