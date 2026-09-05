import { TimeInput } from '../ui/TimeInput';
import { parseTimeInput, timeWindowError } from '../../lib/timeInput';
import { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  Platform,
  KeyboardAvoidingView,
  ScrollView,
} from 'react-native';
import { ComposerBar } from '../ui/ComposerBar';
import { Button } from '../ui/Button';
import { supabase } from '../../lib/supabase';
import { userFacingError } from '../../lib/userFacingError';
import type { Profile } from '../../types';
import { useAuth } from '../../lib/hooks/useAuth';
import { hiveDisplayName, normalizeHiveBrandText } from '../../lib/hiveBrand';

// Was 150 (2.5 hours) — Nat's standard meeting is 2 hours (5-7 PM), and the
// 2.5-hour default meant every new meeting needed a manual duration change or
// it went out wrong (2026-08-25).
const DEFAULT_MEETING_DURATION_MINUTES = '120';

// Only import DateTimePicker on native platforms
let DateTimePicker: typeof import('@react-native-community/datetimepicker').default | null = null;
if (Platform.OS !== 'web') {
  DateTimePicker = require('@react-native-community/datetimepicker').default;
}

interface ScheduleMeetingModalProps {
  visible: boolean;
  onClose: () => void;
  communityId: string | null;
  // Seed the date picker (YYYY-MM-DD) — used when a calendar day is tapped
  // in the Meeting Helper deck.
  initialDate?: string | null;
  onSchedule: (data: {
    title: string;
    description: string;
    date: string;
    time: string;
    // Optional — a meeting scheduled with no end reads exactly as it always
    // did (Nat, 2026-08-21: "i couldnt add window, like 5-7, i could only put
    // in 5pm," migration 202).
    endTime?: string;
    duration: number;
    attendeeIds: string[];
    timezone: string;
    location?: string;
  }) => Promise<void>;
}

// "OG HIVE — Aug" rather than "Aug OG HIVE Meeting". Whose it is comes first,
// then when. Nat, 2026-08-12, looking at a list of them: *"I think reverse the
// way the titles are? Start with what, then when."*
//
// It reads better in a list, which is where these actually get seen — every
// line starting with a different month sorted the eye by the wrong thing,
// while a column of "OG HIVE —" / "OG HIVE —" / "Tech HIVE —" groups itself.
// The word "Meeting" went with the reversal: in a box headed "Your Meetings",
// on a page of meetings, it was the least useful word in the line.
//
// With three HIVEs a meeting has to say whose it is (Nat 2026-08-02), and a
// HIVE that meets weekly gets the date rather than the month, because four
// "Tech HIVE — Aug"s in a row tell you nothing about which one you are looking
// at. Still editable; this is only what the field starts as.
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const defaultMeetingTitle = (
  hiveName: string,
  when: Date = new Date(),
  cadence: 'monthly' | 'weekly' = 'monthly'
) => cadence === 'weekly'
  ? `${hiveName} — ${MONTH_SHORT[when.getMonth()]} ${when.getDate()}`
  : `${hiveName} — ${MONTH_SHORT[when.getMonth()]}`;

export function ScheduleMeetingModal({
  visible,
  onClose,
  communityId,
  initialDate,
  onSchedule,
}: ScheduleMeetingModalProps) {
  const { community } = useAuth();
  const hiveName = hiveDisplayName(community?.name);
  const cadence = (community?.meeting_cadence as 'monthly' | 'weekly' | undefined) ?? 'monthly';
  const [title, setTitle] = useState(() => defaultMeetingTitle(hiveName, new Date(), cadence));
  // Whether Nat has written her own title. Until she does, the title follows
  // the day she picks — see the effect below.
  const titleIsHers = useRef(false);
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [date, setDate] = useState(new Date());
  const [startText, setStartText] = useState<string | null>(null);
  const [endText, setEndText] = useState('');
  const [duration, setDuration] = useState(DEFAULT_MEETING_DURATION_MINUTES);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Member selection
  const [members, setMembers] = useState<Profile[]>([]);
  const [selectedMembers, setSelectedMembers] = useState<Set<string>>(new Set());
  const [loadingMembers, setLoadingMembers] = useState(false);

  // For iOS date/time pickers
  const [showDatePicker, setShowDatePicker] = useState(false);

  // Fetch community members when modal opens
  useEffect(() => {
    if (visible && communityId) {
      fetchMembers();
    }
  }, [visible, communityId]);

  // Seed the picker with the tapped calendar day (5:30pm, the usual start).
  useEffect(() => {
    if (!visible || !initialDate) return;
    const seeded = new Date(`${initialDate}T17:30:00`);
    if (!Number.isNaN(seeded.getTime())) setDate(seeded);
  }, [visible, initialDate]);

  // The title names the month the meeting is IN, not the month you happen to
  // be sitting in when you book it. Nat, 2026-08-12, booking September's Tech
  // meeting on August 12th: *"woah, these titles are off"* — it came out
  // "Aug Tech HIVE Meeting". The title was seeded once from `new Date()` in a
  // `useState` initialiser, so it was stamped with today and then never looked
  // at the day being picked again. It follows the date now, right up until she
  // writes her own, and then it leaves her alone.
  useEffect(() => {
    if (titleIsHers.current) return;
    setTitle(defaultMeetingTitle(hiveName, date, cadence));
  }, [date, hiveName, cadence]);

  // A fresh open is a fresh title.
  useEffect(() => {
    if (!visible) titleIsHers.current = false;
  }, [visible]);

  const fetchMembers = async () => {
    if (!communityId) return;

    setLoadingMembers(true);
    try {
      const { data, error } = await supabase
        .from('community_memberships')
        .select('user_id, profiles:user_id(*)')
        .eq('community_id', communityId);

      if (!error && data) {
        const profiles = data
          .map((m) => m.profiles as unknown as Profile)
          .filter((p) => p !== null);
        setMembers(profiles);
        // Select all members by default
        setSelectedMembers(new Set(profiles.map((p) => p.id)));
      }
    } catch (err) {
      console.error('Failed to fetch members:', err);
    } finally {
      setLoadingMembers(false);
    }
  };

  const toggleMember = (memberId: string) => {
    setSelectedMembers((prev) => {
      const next = new Set(prev);
      if (next.has(memberId)) {
        next.delete(memberId);
      } else {
        next.add(memberId);
      }
      return next;
    });
  };

  const selectAll = () => {
    setSelectedMembers(new Set(members.map((m) => m.id)));
  };

  const selectNone = () => {
    setSelectedMembers(new Set());
  };

  const handleSchedule = async () => {
    if (!title.trim()) {
      setError('Please enter a meeting title');
      return;
    }

    const timeError = timeWindowError(startText ?? getTimeInputValue(), endText, true);
    if (timeError) { setError(timeError); return; }
    setLoading(true);
    setError('');

    try {
      // Use local date components to avoid timezone conversion issues
      const year = date.getFullYear();
      const month = (date.getMonth() + 1).toString().padStart(2, '0');
      const day = date.getDate().toString().padStart(2, '0');
      const dateStr = `${year}-${month}-${day}`; // YYYY-MM-DD in local time

      const hours = date.getHours().toString().padStart(2, '0');
      const minutes = date.getMinutes().toString().padStart(2, '0');
      const timeStr = `${hours}:${minutes}`; // HH:MM

      // Get the user's timezone
      const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

      await onSchedule({
        title: normalizeHiveBrandText(title).trim(),
        description: description.trim(),
        date: dateStr,
        time: parseTimeInput(startText ?? timeStr)!,
        endTime: parseTimeInput(endText) ?? undefined,
        duration: parseInt(duration) || Number(DEFAULT_MEETING_DURATION_MINUTES),
        attendeeIds: Array.from(selectedMembers),
        timezone: userTimezone,
        location: location.trim() || undefined,
      });

      // Reset form. Handing the title back to the date means the next open
      // starts from the day rather than from whatever was last typed.
      titleIsHers.current = false;
      setTitle(defaultMeetingTitle(hiveName, date, cadence));
      setDescription('');
      setLocation('');
      setDate(new Date());
      setStartText(null);
      setEndText('');
      setDuration(DEFAULT_MEETING_DURATION_MINUTES);
      setSelectedMembers(new Set());
      onClose();
    } catch (err) {
      setError(userFacingError(err, 'The meeting did not schedule. Your details are still here — try again.'));
    } finally {
      setLoading(false);
    }
  };

  const onDateChange = (_event: unknown, selectedDate?: Date) => {
    setShowDatePicker(false);
    if (selectedDate) {
      // Preserve the time from current date
      const newDate = new Date(selectedDate);
      newDate.setHours(date.getHours(), date.getMinutes());
      setDate(newDate);
    }
  };

  // Web-specific handlers
  const handleWebDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newDateStr = e.target.value;
    if (newDateStr) {
      const [year, month, day] = newDateStr.split('-').map(Number);
      const newDate = new Date(date);
      newDate.setFullYear(year, month - 1, day);
      setDate(newDate);
    }
  };

  const formatDate = (d: Date) => {
    return d.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  // Format for HTML input values
  const getDateInputValue = () => {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const getTimeInputValue = () => {
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1"
      >
        <ScrollView className="flex-1 bg-white">
          <View className="p-6" style={{ width: '100%', maxWidth: 680, alignSelf: 'center' }}>
            {/* Header */}
            <View className="flex-row justify-between items-center mb-6">
              <Text className="text-2xl font-bold text-gray-800">
                Schedule Meeting
              </Text>
              <Pressable onPress={onClose} className="p-2">
                <Text className="text-label text-lg">Cancel</Text>
              </Pressable>
            </View>

            {/* Form.
                A meeting's name, what it's about and where it is are all words a
                member writes, so all three are the shared composer with the mic
                on the text's own line — the same box the event forms in
                monthly-tuneup, hive.tsx and the Meeting Helper already use. The
                date, time and length below are structured, so they keep their
                pickers and no microphone. */}
            <ComposerBar
              variant="form"
              tone="light"
              containerClassName="mb-4"
              label="Meeting Title"
              value={title}
              // Every meeting title goes through the brand normaliser ("Hive" →
              // "HIVE"), including one arriving from dictation, which is why the
              // updater form is resolved here rather than at the composer.
              onChangeText={(next) => {
                titleIsHers.current = true;
                setTitle((previous) =>
                  normalizeHiveBrandText(typeof next === 'function' ? next(previous) : next)
                );
              }}
              placeholder="e.g., Weekly Check-in"
              multiline={false}
              onSubmit={handleSchedule}
              canSubmit={!loading}
            />

            <ComposerBar
              variant="form"
              tone="light"
              containerClassName="mb-4"
              label="Description (optional)"
              value={description}
              onChangeText={setDescription}
              placeholder="What's this meeting about?"
              minHeight={92}
              onSubmit={handleSchedule}
              canSubmit={!loading}
            />

            <ComposerBar
              variant="form"
              tone="light"
              containerClassName="mb-4"
              label="Location (optional)"
              value={location}
              onChangeText={setLocation}
              placeholder="Physical address for in-person meetings"
              multiline={false}
              onSubmit={handleSchedule}
              canSubmit={!loading}
            />

            {/* Date Picker */}
            <View className="mb-4">
              <Text className="text-gray-700 font-medium mb-2">Date</Text>
              {Platform.OS === 'web' ? (
                <input
                  type="date"
                  value={getDateInputValue()}
                  onChange={handleWebDateChange}
                  min={new Date().toISOString().split('T')[0]}
                  style={{
                    width: '100%', maxWidth: 320, boxSizing: 'border-box',
                    padding: 16,
                    fontSize: 16,
                    borderRadius: 12,
                    border: '1px solid #d1d5db',
                    backgroundColor: 'white',
                  }}
                />
              ) : (
                <Pressable
                  style={{ maxWidth: 320, minHeight: 44 }}
                  onPress={() => setShowDatePicker(true)}
                  className="bg-white border border-gray-300 rounded-xl p-4"
                >
                  <Text className="text-base text-gray-800">{formatDate(date)}</Text>
                </Pressable>
              )}
            </View>

            <View className="mb-4" style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text className="text-gray-700 font-medium mb-2">Start time</Text>
                <TimeInput accessibilityLabel="Start time (AM or PM)" value={startText ?? getTimeInputValue()} onChangeText={setStartText} style={{ width: '100%' }} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text className="text-gray-700 font-medium mb-2">End time (optional)</Text>
                <TimeInput accessibilityLabel="End time (optional, AM or PM)" value={endText} onChangeText={setEndText} style={{ width: '100%' }} />
                {!!endText && (
                  <Pressable onPress={() => setEndText('')} className="mt-2 self-start" accessibilityLabel="Clear end time">
                    <Text className="text-blue-500 text-sm">Clear</Text>
                  </Pressable>
                )}
              </View>
            </View>

            {/* Duration */}
            <View className="mb-4">
              <Text className="text-gray-700 font-medium mb-2">Duration</Text>
              <View className="flex-row flex-wrap gap-2">
                {[
                  { value: '60', label: '1 hour' },
                  { value: '120', label: '2 hours' },
                  { value: '150', label: '2.5 hours' },
                ].map((option) => (
                  <Pressable
                    key={option.value}
                    onPress={() => setDuration(option.value)}
                    className={`px-4 py-3 rounded-xl border ${
                      duration === option.value
                        ? 'bg-honey-500 border-honey-500'
                        : 'bg-white border-gray-300'
                    }`}
                  >
                    <Text
                      className={`text-center font-medium ${
                        duration === option.value ? 'text-white' : 'text-gray-700'
                      }`}
                    >
                      {option.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <Text className="text-label text-xs mt-2">
                HIVE meetings default to 30 minutes of arrival time plus a 2 hour meeting.
              </Text>
            </View>

            {/* Member Selection */}
            <View className="mb-4">
              <View className="flex-row justify-between items-center mb-2">
                <Text className="text-gray-700 font-medium">
                  Invite Members ({selectedMembers.size}/{members.length})
                </Text>
                <View className="flex-row flex-wrap gap-2">
                  <Pressable onPress={selectAll}>
                    <Text className="text-blue-500 text-sm">All</Text>
                  </Pressable>
                  <Text className="text-gray-300">|</Text>
                  <Pressable onPress={selectNone}>
                    <Text className="text-blue-500 text-sm">None</Text>
                  </Pressable>
                </View>
              </View>

              {loadingMembers ? (
                <View className="bg-gray-50 rounded-xl p-4">
                  <Text className="text-label text-center">Loading members...</Text>
                </View>
              ) : (
                <View className="bg-gray-50 rounded-xl p-3">
                  <View className="flex-row flex-wrap gap-2">
                    {members.map((member) => (
                      <Pressable
                        key={member.id}
                        onPress={() => toggleMember(member.id)}
                        className={`px-3 py-2 rounded-lg border ${
                          selectedMembers.has(member.id)
                            ? 'bg-blue-500 border-blue-500'
                            : 'bg-white border-gray-300'
                        }`}
                      >
                        <Text
                          className={`text-sm font-medium ${
                            selectedMembers.has(member.id) ? 'text-white' : 'text-gray-700'
                          }`}
                        >
                          {member.name || member.email?.split('@')[0] || 'Member'}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              )}
            </View>

            {/* Meeting Info */}
            <View className="bg-blue-50 rounded-xl p-4 mb-6">
              <Text className="text-blue-800 font-medium mb-1">
                Calendar Invites
              </Text>
              <Text className="text-blue-600 text-sm">
                Selected members will receive a calendar invite with a Google Meet link. Add a location for in-person meetings or leave blank for remote-only.
              </Text>
            </View>

            {/* Error */}
            {error ? (
              <View className="bg-red-50 rounded-xl p-4 mb-4">
                <Text className="text-red-600">{error}</Text>
              </View>
            ) : null}

            {/* Submit Button */}
            <View style={{ alignSelf: 'flex-start', maxWidth: '100%' }}>
            <Button
              title={loading ? 'Scheduling...' : 'Schedule Meeting'}
              onPress={handleSchedule}
              loading={loading}
              disabled={loading}
            />
            </View>
          </View>
        </ScrollView>

        {/* Native Date/Time Pickers (iOS/Android only) */}
        {Platform.OS !== 'web' && showDatePicker && DateTimePicker && (
          <DateTimePicker
            value={date}
            mode="date"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onChange={onDateChange}
            minimumDate={new Date()}
          />
        )}

      </KeyboardAvoidingView>
    </Modal>
  );
}
