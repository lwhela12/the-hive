import { useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  Platform,
  KeyboardAvoidingView,
  ScrollView,
  TextInput,
} from 'react-native';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { supabase } from '../../lib/supabase';
import type { Profile } from '../../types';

// Only import DateTimePicker on native platforms
let DateTimePicker: typeof import('@react-native-community/datetimepicker').default | null = null;
if (Platform.OS !== 'web') {
  DateTimePicker = require('@react-native-community/datetimepicker').default;
}

interface ScheduleMeetingModalProps {
  visible: boolean;
  onClose: () => void;
  communityId: string | null;
  onSchedule: (data: {
    title: string;
    description: string;
    date: string;
    time: string;
    duration: number;
    attendeeIds: string[];
    timezone: string;
  }) => Promise<void>;
}

export function ScheduleMeetingModal({
  visible,
  onClose,
  communityId,
  onSchedule,
}: ScheduleMeetingModalProps) {
  const [title, setTitle] = useState('Hive Meeting');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(new Date());
  const [duration, setDuration] = useState('60');
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

      // Debug: log what we're sending
      console.log('Scheduling meeting:', { dateStr, timeStr, dateObject: date.toString() });

      // Get the user's timezone
      const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

      await onSchedule({
        title: title.trim(),
        description: description.trim(),
        date: dateStr,
        time: timeStr,
        duration: parseInt(duration) || 60,
        attendeeIds: Array.from(selectedMembers),
        timezone: userTimezone,
      });

      // Reset form
      setTitle('Hive Meeting');
      setDescription('');
      setDate(new Date());
      setDuration('60');
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
                <Text className="text-gray-500 text-lg">Cancel</Text>
              </Pressable>
            </View>

            {/* Form */}
            <Input
              label="Meeting Title"
              value={title}
              onChangeText={setTitle}
              placeholder="e.g., Weekly Check-in"
            />

            <Input
              label="Description (optional)"
              value={description}
              onChangeText={setDescription}
              placeholder="What's this meeting about?"
              multiline
              numberOfLines={3}
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
              <Text className="text-gray-700 font-medium mb-2">Duration (minutes)</Text>
              <View className="flex-row gap-2">
                {['30', '60', '90'].map((mins) => (
                  <Pressable
                    key={mins}
                    onPress={() => setDuration(mins)}
                    className={`flex-1 py-3 rounded-xl border ${
                      duration === mins
                        ? 'bg-honey-500 border-honey-500'
                        : 'bg-white border-gray-300'
                    }`}
                  >
                    <Text
                      className={`text-center font-medium ${
                        duration === mins ? 'text-white' : 'text-gray-700'
                      }`}
                    >
                      {mins} min
                    </Text>
                  </Pressable>
                ))}
              </View>
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
                  <Text className="text-gray-500 text-center">Loading members...</Text>
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

            {/* Meet Link Info */}
            <View className="bg-blue-50 rounded-xl p-4 mb-6">
              <Text className="text-blue-800 font-medium mb-1">
                Calendar Invites
              </Text>
              <Text className="text-blue-600 text-sm">
                Selected members will receive a calendar invite with a Google Meet link in their email.
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
