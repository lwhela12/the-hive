import { useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  Platform,
  KeyboardAvoidingView,
  ScrollView,
} from 'react-native';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { supabase } from '../../lib/supabase';
import { submitOnEnter } from '../../lib/submitOnEnter';
import type { Profile } from '../../types';
import { useAuth } from '../../lib/hooks/useAuth';
import { hiveDisplayName } from '../../lib/hiveBrand';

const DEFAULT_MEETING_DURATION_MINUTES = '150';
const normalizeHiveBrandText = (text: string) => text.replace(/\bHive\b/g, 'HIVE');

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
    duration: number;
    attendeeIds: string[];
    timezone: string;
    location?: string;
  }) => Promise<void>;
}

// "Aug OG HIVE Meeting" rather than "Aug HIVE Meeting" — with three of them, a
// meeting has to say whose it is (Nat 2026-08-02). Still editable; this is only
// what the field starts as.
//
// A HIVE that meets weekly gets the date instead of the month, because four
// "Aug Tech HIVE Meeting"s in a row tell you nothing about which one you're
// looking at.
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const defaultMeetingTitle = (
  hiveName: string,
  when: Date = new Date(),
  cadence: 'monthly' | 'weekly' = 'monthly'
) => cadence === 'weekly'
  ? `${MONTH_SHORT[when.getMonth()]} ${when.getDate()} ${hiveName} Meeting`
  : `${MONTH_SHORT[when.getMonth()]} ${hiveName} Meeting`;

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
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [date, setDate] = useState(new Date());
  const [duration, setDuration] = useState(DEFAULT_MEETING_DURATION_MINUTES);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Member selection
  const [members, setMembers] = useState<Profile[]>([]);
  const [selectedMembers, setSelectedMembers] = useState<Set<string>>(new Set());
  const [loadingMembers, setLoadingMembers] = useState(false);

  // For iOS date/time pickers
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);

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
        time: timeStr,
        duration: parseInt(duration) || Number(DEFAULT_MEETING_DURATION_MINUTES),
        attendeeIds: Array.from(selectedMembers),
        timezone: userTimezone,
        location: location.trim() || undefined,
      });

      // Reset form
      setTitle(defaultMeetingTitle(hiveName, date, cadence));
      setDescription('');
      setLocation('');
      setDate(new Date());
      setDuration(DEFAULT_MEETING_DURATION_MINUTES);
      setSelectedMembers(new Set());
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to schedule meeting');
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

  const onTimeChange = (_event: unknown, selectedTime?: Date) => {
    setShowTimePicker(false);
    if (selectedTime) {
      // Preserve the date, update the time
      const newDate = new Date(date);
      newDate.setHours(selectedTime.getHours(), selectedTime.getMinutes());
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

  const handleWebTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTimeStr = e.target.value;
    if (newTimeStr) {
      const [hours, minutes] = newTimeStr.split(':').map(Number);
      const newDate = new Date(date);
      newDate.setHours(hours, minutes);
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

  const formatTime = (d: Date) => {
    return d.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
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
          <View className="p-6">
            {/* Header */}
            <View className="flex-row justify-between items-center mb-6">
              <Text className="text-2xl font-bold text-gray-800">
                Schedule Meeting
              </Text>
              <Pressable onPress={onClose} className="p-2">
                <Text className="text-label text-lg">Cancel</Text>
              </Pressable>
            </View>

            {/* Form */}
            <Input
              label="Meeting Title"
              value={title}
              onChangeText={(text) => setTitle(normalizeHiveBrandText(text))}
              placeholder="e.g., Weekly Check-in"
              returnKeyType="send"
              onSubmitEditing={handleSchedule}
            />

            <Input
              label="Description (optional)"
              value={description}
              onChangeText={setDescription}
              placeholder="What's this meeting about?"
              multiline
              blurOnSubmit={false}
              onKeyPress={submitOnEnter(handleSchedule)}
              numberOfLines={3}
            />

            <Input
              label="Location (optional)"
              value={location}
              onChangeText={setLocation}
              placeholder="Physical address for in-person meetings"
              returnKeyType="send"
              onSubmitEditing={handleSchedule}
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
                    width: '100%',
                    padding: 16,
                    fontSize: 16,
                    borderRadius: 12,
                    border: '1px solid #d1d5db',
                    backgroundColor: 'white',
                  }}
                />
              ) : (
                <Pressable
                  onPress={() => setShowDatePicker(true)}
                  className="bg-white border border-gray-300 rounded-xl p-4"
                >
                  <Text className="text-base text-gray-800">{formatDate(date)}</Text>
                </Pressable>
              )}
            </View>

            {/* Time Picker */}
            <View className="mb-4">
              <Text className="text-gray-700 font-medium mb-2">Time</Text>
              {Platform.OS === 'web' ? (
                <input
                  type="time"
                  value={getTimeInputValue()}
                  onChange={handleWebTimeChange}
                  style={{
                    width: '100%',
                    padding: 16,
                    fontSize: 16,
                    borderRadius: 12,
                    border: '1px solid #d1d5db',
                    backgroundColor: 'white',
                  }}
                />
              ) : (
                <Pressable
                  onPress={() => setShowTimePicker(true)}
                  className="bg-white border border-gray-300 rounded-xl p-4"
                >
                  <Text className="text-base text-gray-800">{formatTime(date)}</Text>
                </Pressable>
              )}
            </View>

            {/* Duration */}
            <View className="mb-4">
              <Text className="text-gray-700 font-medium mb-2">Duration</Text>
              <View className="flex-row gap-2">
                {[
                  { value: '60', label: '1 hour' },
                  { value: '120', label: '2 hours' },
                  { value: '150', label: '2.5 hours' },
                ].map((option) => (
                  <Pressable
                    key={option.value}
                    onPress={() => setDuration(option.value)}
                    className={`flex-1 py-3 rounded-xl border ${
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
                <View className="flex-row gap-2">
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
            <Button
              title={loading ? 'Scheduling...' : 'Schedule Meeting'}
              onPress={handleSchedule}
              loading={loading}
              disabled={loading}
            />
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

        {Platform.OS !== 'web' && showTimePicker && DateTimePicker && (
          <DateTimePicker
            value={date}
            mode="time"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onChange={onTimeChange}
            minuteInterval={5}
          />
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
}
