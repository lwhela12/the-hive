import { Pressable, Text, TextInput, View } from 'react-native';
import { accentPalette, HIVE_GOLD } from '../../lib/hiveBrand';
import { personalHardOut } from '../../lib/personalHardOut';

// Structured availability needs a clock, without a composer, mic or tags.
export function HardOutInput({ value, onChange, accent = HIVE_GOLD }: {
  value: unknown; onChange: (value: string) => void; accent?: string;
}) {
  const tint = accentPalette(accent);
  const state = personalHardOut(value);
  const change = (hour = state.hour, minute = state.minute, period = state.period) => onChange(`${hour}:${minute} ${period}`);
  const box = { width: 64, minHeight: 44, borderWidth: 1, borderColor: tint.line(0.45), borderRadius: 10, backgroundColor: '#fffdf5', color: tint.ink, padding: 10, fontSize: 18, textAlign: 'center' as const };
  return <View style={{ gap: 12 }}>
    <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', gap: 10 }}>
      {(['no', 'yes'] as const).map(choice => <Pressable key={choice} accessibilityRole="radio" accessibilityState={{ checked: state.choice === choice }}
        accessibilityLabel={choice === 'no' ? 'No hard out' : 'Yes, I have a hard out'}
        onPress={() => onChange(choice === 'no' ? 'No' : state.choice === 'yes' ? String(value) : ':00 PM')}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, minWidth: 100, borderRadius: 12, borderWidth: 1, borderColor: tint.line(0.45), backgroundColor: state.choice === choice ? tint.wash : '#fffdf5' }}>
        <Text style={{ color: tint.ink }}>{state.choice === choice ? '●' : '○'}</Text>
        <Text style={{ color: tint.ink, fontFamily: 'Lato_700Bold' }}>{choice === 'no' ? 'No' : 'Yes'}</Text>
      </Pressable>)}
    </View>
    {state.choice === 'yes' && <View style={{ gap: 7 }}>
      <Text style={{ color: '#5c5648', fontFamily: 'Lato_700Bold' }}>Leave by (Pacific time)</Text>
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <Text style={{ fontSize: 20 }}>◷</Text>
        <TextInput accessibilityLabel="Departure hour" keyboardType="number-pad" maxLength={2} placeholder="HH" value={state.hour}
          onChangeText={hour => change(hour.replace(/\D/g, ''))} style={box} />
        <Text style={{ color: tint.ink }}>:</Text>
        <TextInput accessibilityLabel="Departure minute" keyboardType="number-pad" maxLength={2} placeholder="MM" value={state.minute}
          onChangeText={minute => change(state.hour, minute.replace(/\D/g, ''))} onBlur={() => change(state.hour, state.minute.padStart(2, '0'))} style={box} />
        {(['AM', 'PM'] as const).map(period => <Pressable key={period} accessibilityRole="radio" accessibilityLabel={`Departure ${period}`} accessibilityState={{ checked: state.period === period }}
          onPress={() => change(state.hour, state.minute, period)} style={{ ...box, backgroundColor: state.period === period ? tint.wash : '#fffdf5' }}>
          <Text style={{ color: tint.ink }}>{period}</Text>
        </Pressable>)}
      </View>
      {state.legacy && <Text style={{ color: '#5c5648' }}>Previous answer: {state.legacy}</Text>}
    </View>}
  </View>;
}
