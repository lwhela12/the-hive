import { TextInput, type TextInputProps } from 'react-native';
import { humanTimeInput } from '../../lib/timeInput';

// Explicit AM/PM on every device; native HTML time inputs follow OS preferences.
// Keep partial/invalid typing intact so Save can explain it, never save stale time.
export function TimeInput({ value, onChangeText, style, onBlur, ...props }: TextInputProps) {
  const display = /^\d{1,2}:\d{2}(?::\d{2})?$/.test(value ?? '')
    ? humanTimeInput(value) : value;
  return <TextInput
    {...props}
    value={display}
    onChangeText={onChangeText}
    onBlur={(event) => { onChangeText?.(humanTimeInput(value)); onBlur?.(event); }}
    accessibilityLabel={props.accessibilityLabel ?? 'Time (AM or PM)'}
    placeholder={props.placeholder ?? '6:00 PM'}
    autoCapitalize="characters"
    autoCorrect={false}
    style={[{ width: 180, maxWidth: '100%', minHeight: 44, color: '#333333', backgroundColor: 'white', borderWidth: 1, borderColor: '#e9ddc7', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, fontSize: 16 }, style]}
  />;
}
