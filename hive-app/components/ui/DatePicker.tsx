import { useState, useEffect } from 'react';
import { View, Text, Pressable, Modal, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const MONTHS = [
  { value: 1, label: 'January' },
  { value: 2, label: 'February' },
  { value: 3, label: 'March' },
  { value: 4, label: 'April' },
  { value: 5, label: 'May' },
  { value: 6, label: 'June' },
  { value: 7, label: 'July' },
  { value: 8, label: 'August' },
  { value: 9, label: 'September' },
  { value: 10, label: 'October' },
  { value: 11, label: 'November' },
  { value: 12, label: 'December' },
];

// Generate days 1-31
const DAYS = Array.from({ length: 31 }, (_, i) => i + 1);

interface DatePickerProps {
  value?: string; // ISO date string (YYYY-MM-DD) or American format (MM-DD-YYYY)
  onChange: (value: string) => void; // Returns American format (MM-DD-YYYY)
  /** Minimum year to show (default: 1920 for birthdays) */
  minYear?: number;
  /** Maximum year to show (default: current year) */
  maxYear?: number;
  /** Whether to show future years (default: false for birthdays, true for events) */
  allowFuture?: boolean;
  /** Number of future years to show when allowFuture is true (default: 5) */
  futureYears?: number;
}

function parseDate(dateStr?: string): { month: number | null; day: number | null; year: number | null } {
  if (!dateStr) return { month: null, day: null, year: null };

  // Try ISO format first (YYYY-MM-DD)
  const isoMatch = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    return {
      year: parseInt(isoMatch[1], 10),
      month: parseInt(isoMatch[2], 10),
      day: parseInt(isoMatch[3], 10),
    };
  }

  // Try American format (MM-DD-YYYY)
  const americanMatch = dateStr.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (americanMatch) {
    return {
      month: parseInt(americanMatch[1], 10),
      day: parseInt(americanMatch[2], 10),
      year: parseInt(americanMatch[3], 10),
    };
  }

  return { month: null, day: null, year: null };
}

function getDaysInMonth(month: number | null, year: number | null): number {
  if (!month) return 31;
  // Use a leap year check if year is provided
  const testYear = year || 2000; // 2000 is a leap year
  return new Date(testYear, month, 0).getDate();
}

interface DropdownProps {
  label: string;
  value: number | null;
  options: { value: number; label: string }[];
  onChange: (value: number) => void;
  placeholder: string;
}

function Dropdown({ label, value, options, onChange, placeholder }: DropdownProps) {
  const [modalVisible, setModalVisible] = useState(false);
  const selectedOption = options.find(opt => opt.value === value);

  return (
    <View className="flex-1">
      <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-xs text-charcoal/50 mb-1">
        {label}
      </Text>
      <Pressable
        onPress={() => setModalVisible(true)}
        className="flex-row items-center justify-between bg-cream rounded-lg px-3 py-2 active:opacity-80"
      >
        <Text
          style={{ fontFamily: 'Lato_400Regular' }}
          className={selectedOption ? 'text-charcoal' : 'text-charcoal/40'}
        >
          {selectedOption?.label || placeholder}
        </Text>
        <Ionicons name="chevron-down" size={16} color="#4b5563" />
      </Pressable>

      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setModalVisible(false)}
      >
        <Pressable
          className="flex-1 bg-black/50 justify-center items-center"
          onPress={() => setModalVisible(false)}
        >
          <Pressable
            className="bg-white rounded-xl w-[280px] max-h-[400px] overflow-hidden"
            onPress={(e) => e.stopPropagation()}
          >
            <View className="p-4 border-b border-cream">
              <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-charcoal text-center">
                Select {label}
              </Text>
            </View>
            <ScrollView className="max-h-[300px]">
              {options.map((option) => (
                <Pressable
                  key={option.value}
                  onPress={() => {
                    onChange(option.value);
                    setModalVisible(false);
                  }}
                  className={`p-4 border-b border-cream active:bg-cream ${
                    option.value === value ? 'bg-gold-light' : ''
                  }`}
                >
                  <Text
                    style={{ fontFamily: option.value === value ? 'Lato_700Bold' : 'Lato_400Regular' }}
                    className={option.value === value ? 'text-gold' : 'text-charcoal'}
                  >
                    {option.label}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

export function DatePicker({
  value,
  onChange,
  minYear = 1920,
  maxYear,
  allowFuture = false,
  futureYears = 5,
}: DatePickerProps) {
  const currentYear = new Date().getFullYear();
  const effectiveMaxYear = maxYear ?? (allowFuture ? currentYear + futureYears : currentYear);

  // Generate years from max to min (newest first for events, oldest last for birthdays)
  const YEARS = allowFuture
    ? Array.from({ length: effectiveMaxYear - minYear + 1 }, (_, i) => effectiveMaxYear - i)
    : Array.from({ length: effectiveMaxYear - minYear + 1 }, (_, i) => effectiveMaxYear - i);

  const parsed = parseDate(value);
  const [month, setMonth] = useState<number | null>(parsed.month);
  const [day, setDay] = useState<number | null>(parsed.day);
  const [year, setYear] = useState<number | null>(parsed.year);

  // Re-parse when value changes externally
  useEffect(() => {
    const newParsed = parseDate(value);
    setMonth(newParsed.month);
    setDay(newParsed.day);
    setYear(newParsed.year);
  }, [value]);

  const updateDate = (newMonth: number | null, newDay: number | null, newYear: number | null) => {
    // Validate day against month/year
    const maxDays = getDaysInMonth(newMonth, newYear);
    const validDay = newDay && newDay > maxDays ? maxDays : newDay;

    if (newMonth && validDay && newYear) {
      // Format as MM-DD-YYYY (American format)
      const formatted = `${String(newMonth).padStart(2, '0')}-${String(validDay).padStart(2, '0')}-${newYear}`;
      onChange(formatted);
    } else if (!newMonth && !validDay && !newYear) {
      onChange('');
    }
  };

  const handleMonthChange = (newMonth: number) => {
    setMonth(newMonth);
    // Adjust day if it exceeds the new month's max days
    const maxDays = getDaysInMonth(newMonth, year);
    const adjustedDay = day && day > maxDays ? maxDays : day;
    if (adjustedDay !== day) setDay(adjustedDay);
    updateDate(newMonth, adjustedDay, year);
  };

  const handleDayChange = (newDay: number) => {
    setDay(newDay);
    updateDate(month, newDay, year);
  };

  const handleYearChange = (newYear: number) => {
    setYear(newYear);
    // Adjust day for leap year changes (Feb 29)
    const maxDays = getDaysInMonth(month, newYear);
    const adjustedDay = day && day > maxDays ? maxDays : day;
    if (adjustedDay !== day) setDay(adjustedDay);
    updateDate(month, adjustedDay, newYear);
  };

  // Generate valid days based on selected month/year
  const maxDays = getDaysInMonth(month, year);
  const dayOptions = DAYS.slice(0, maxDays).map(d => ({ value: d, label: String(d) }));

  return (
    <View className="flex-row gap-2">
      <Dropdown
        label="Month"
        value={month}
        options={MONTHS}
        onChange={handleMonthChange}
        placeholder="Month"
      />
      <Dropdown
        label="Day"
        value={day}
        options={dayOptions}
        onChange={handleDayChange}
        placeholder="Day"
      />
      <Dropdown
        label="Year"
        value={year}
        options={YEARS.map(y => ({ value: y, label: String(y) }))}
        onChange={handleYearChange}
        placeholder="Year"
      />
    </View>
  );
}

// Convenience export for birthday-specific usage
export function BirthdayPicker(props: Omit<DatePickerProps, 'allowFuture' | 'futureYears'>) {
  return <DatePicker {...props} allowFuture={false} minYear={1920} />;
}

// Convenience export for event date usage
export function EventDatePicker(props: Omit<DatePickerProps, 'minYear'>) {
  const currentYear = new Date().getFullYear();
  return <DatePicker {...props} minYear={currentYear - 1} allowFuture={true} futureYears={5} />;
}
