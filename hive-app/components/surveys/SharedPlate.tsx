import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SurveyQuestionField } from './SurveyQuestionField';
import { PLATE_QUESTION } from '../../lib/checkInPresentation';
export function SharedPlate({ scope, onChange }: { scope: string; onChange: (value: string | undefined) => void }) {
  const [value, setValue] = useState<string | undefined>();
  const [ready, setReady] = useState(false);
  useEffect(() => { let active = true; setReady(false); AsyncStorage.getItem(scope).then(raw => {
    if (!active) return; const next = raw == null ? undefined : raw; setValue(next); onChange(next); setReady(true);
  }).catch(() => { if (active) setReady(true); }); return () => { active = false; }; }, [scope, onChange]);
  return <View style={{ padding: 16, borderRadius: 14, backgroundColor: '#fffdf5' }}>
    {ready && <SurveyQuestionField question={PLATE_QUESTION} index={0} value={value} onChange={next => {
      setValue(next); onChange(next); void AsyncStorage.setItem(scope, next).catch(() => {});
    }} />}
    <Text style={{ color: '#5c5648' }}>Your choice saves with this check-in.</Text>
  </View>;
}
