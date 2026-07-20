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

  // Try American format (MM-DD-YYYY or MM/DD/YYYY)
  const americanMatch = dateStr.trim().match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
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

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

interface CalendarDatePickerProps {
  value?: string; // MM-DD-YYYY or YYYY-MM-DD
  onChange: (value: string) => void; // Returns MM-DD-YYYY
  label?: string;
  placeholder?: string;
  /** Show a ✕ to clear the selection (for optional dates like an end date) */
  clearable?: boolean;
}

// Visual calendar grid date picker for events
export function EventDatePicker({
  value,
  onChange,
  label = 'Date',
  placeholder = 'Select a date',
  clearable = false,
}: CalendarDatePickerProps) {
  const today = new Date();
  const parsed = parseDate(value);

  const [viewYear, setViewYear] = useState(parsed.year ?? today.getFullYear());
  const [viewMonth, setViewMonth] = useState(parsed.month ?? today.getMonth() + 1); // 1-12
  const [open, setOpen] = useState(false);
  const [showYearPicker, setShowYearPicker] = useState(false);

  const selectedYear = parsed.year;
  const selectedMonth = parsed.month;
  const selectedDay = parsed.day;

  // Sync view when value changes externally
  useEffect(() => {
    const p = parseDate(value);
    if (p.year && p.month) {
      setViewYear(p.year);
      setViewMonth(p.month);
    }
  }, [value]);

  const prevMonth = () => {
    if (viewMonth === 1) { setViewMonth(12); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  };

  const nextMonth = () => {
    if (viewMonth === 12) { setViewMonth(1); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  };

  const selectDay = (day: number) => {
    const formatted = `${String(viewMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}-${viewYear}`;
    onChange(formatted);
    setOpen(false);
  };

  // Build calendar grid
  const firstDayOfMonth = new Date(viewYear, viewMonth - 1, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(viewYear, viewMonth, 0).getDate();
  const daysInPrev = new Date(viewYear, viewMonth - 1, 0).getDate();

  // Cells: leading gray + current month + trailing gray to fill 6 rows (42 cells)
  const cells: { day: number; type: 'prev' | 'current' | 'next' }[] = [];
  for (let i = firstDayOfMonth - 1; i >= 0; i--) {
    cells.push({ day: daysInPrev - i, type: 'prev' });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ day: d, type: 'current' });
  }
  while (cells.length < 42) {
    cells.push({ day: cells.length - daysInMonth - firstDayOfMonth + 1, type: 'next' });
  }

  const monthName = MONTHS.find(m => m.value === viewMonth)?.label ?? '';
  const currentYear = today.getFullYear();
  const yearOptions = Array.from({ length: 7 }, (_, i) => currentYear - 1 + i);

  const displayValue = selectedYear && selectedMonth && selectedDay
    ? `${MONTHS.find(m => m.value === selectedMonth)?.label} ${selectedDay}, ${selectedYear}`
    : '';

  return (
    <View>
      <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-xs text-charcoal/50 mb-1">{label}</Text>
      <Pressable
        onPress={() => setOpen(true)}
        className="flex-row items-center justify-between bg-cream border border-gray-200 rounded-lg px-4 py-3 active:opacity-80"
      >
        <Text
          style={{ fontFamily: 'Lato_400Regular' }}
          className={displayValue ? 'text-charcoal' : 'text-charcoal/40'}
        >
          {displayValue || placeholder}
        </Text>
        <View className="flex-row items-center gap-2">
          {clearable && !!displayValue && (
            <Pressable
              onPress={(e) => {
                e.stopPropagation();
                onChange('');
              }}
              hitSlop={8}
              className="active:opacity-50"
            >
              <Ionicons name="close-circle" size={18} color="#9a8060" />
            </Pressable>
          )}
          <Ionicons name="calendar-outline" size={18} color="#b5860d" />
        </View>
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable className="flex-1 bg-black/50 justify-center items-center px-4" onPress={() => setOpen(false)}>
          <Pressable
            className="bg-white rounded-2xl w-full max-w-sm overflow-hidden"
            onPress={e => e.stopPropagation()}
          >
            {/* Header: prev / month+year / next */}
            <View className="flex-row items-center justify-between px-4 pt-4 pb-2">
              <Pressable onPress={prevMonth} className="p-2 active:opacity-50">
                <Ionicons name="chevron-back" size={20} color="#b5860d" />
              </Pressable>

              <Pressable onPress={() => setShowYearPicker(v => !v)} className="flex-row items-center gap-1 active:opacity-70">
                <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-charcoal text-base">
                  {monthName} {viewYear}
                </Text>
                <Ionicons name={showYearPicker ? 'chevron-up' : 'chevron-down'} size={14} color="#b5860d" />
              </Pressable>

              <Pressable onPress={nextMonth} className="p-2 active:opacity-50">
                <Ionicons name="chevron-forward" size={20} color="#b5860d" />
              </Pressable>
            </View>

            {/* Year picker dropdown */}
            {showYearPicker && (
              <View className="mx-4 mb-2 bg-cream rounded-xl overflow-hidden border border-gold/20">
                <ScrollView horizontal showsHorizontalScrollIndicator={false} className="px-2 py-2">
                  {yearOptions.map(yr => (
                    <Pressable
                      key={yr}
                      onPress={() => { setViewYear(yr); setShowYearPicker(false); }}
                      className={`px-4 py-2 rounded-lg mr-1 ${yr === viewYear ? 'bg-gold' : 'bg-white active:bg-gold/10'}`}
                    >
                      <Text style={{ fontFamily: yr === viewYear ? 'Lato_700Bold' : 'Lato_400Regular' }}
                        className={yr === viewYear ? 'text-white' : 'text-charcoal'}>
                        {yr}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            )}

            {/* Day-of-week headers */}
            <View className="flex-row px-3 pb-1">
              {DAY_LABELS.map(d => (
                <View key={d} className="flex-1 items-center">
                  <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-xs text-charcoal/40">{d}</Text>
                </View>
              ))}
            </View>

            {/* Calendar grid */}
            <View className="px-3 pb-4">
              {Array.from({ length: 6 }, (_, row) => (
                <View key={row} className="flex-row">
                  {cells.slice(row * 7, row * 7 + 7).map((cell, col) => {
                    const isToday = cell.type === 'current'
                      && cell.day === today.getDate()
                      && viewMonth === today.getMonth() + 1
                      && viewYear === today.getFullYear();
                    const isSelected = cell.type === 'current'
                      && cell.day === selectedDay
                      && viewMonth === selectedMonth
                      && viewYear === selectedYear;

                    return (
                      <Pressable
                        key={col}
                        onPress={() => cell.type === 'current' && selectDay(cell.day)}
                        className={`flex-1 items-center justify-center py-1.5 m-0.5 rounded-full
                          ${isSelected ? 'bg-gold' : isToday ? 'bg-gold/15' : 'active:bg-cream'}
                        `}
                      >
                        <Text
                          style={{ fontFamily: isSelected || isToday ? 'Lato_700Bold' : 'Lato_400Regular' }}
                          className={`text-sm
                            ${isSelected ? 'text-white' : isToday ? 'text-gold' : cell.type !== 'current' ? 'text-charcoal/25' : 'text-charcoal'}
                          `}
                        >
                          {cell.day}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              ))}
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
