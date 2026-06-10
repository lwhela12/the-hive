import { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, Modal } from 'react-native';
import { Image } from 'expo-image';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';

const cliveIcon = require('../../assets/Clive_logo.png');
import type { Survey, SurveyQuestion } from '../../lib/hooks/useSurveys';

interface SurveyModalProps {
  survey: Survey;
  onSubmit: (answers: Record<string, string | string[] | number>) => Promise<{ error: any }>;
  onClose: () => void;
}

function ScaleInput({ value, onChange }: { value: number | null; onChange: (v: number) => void }) {
  return (
    <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => (
        <Pressable
          key={n}
          onPress={() => onChange(n)}
          style={{
            width: 42, height: 42, borderRadius: 21,
            backgroundColor: value === n ? '#bd9348' : '#faf8f3',
            borderWidth: 1,
            borderColor: value === n ? '#bd9348' : 'rgba(222,193,129,0.4)',
            alignItems: 'center', justifyContent: 'center',
          }}
        >
          <Text style={{ fontFamily: value === n ? 'Lato_700Bold' : 'Lato_400Regular', fontSize: 15, color: value === n ? 'white' : '#6b7280' }}>{n}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function ChoiceInput({ options, value, onChange, multi }: { options: string[]; value: string | string[]; onChange: (v: string | string[]) => void; multi?: boolean }) {
  const selected = multi ? (value as string[]) : [value as string];
  const toggle = (opt: string) => {
    if (multi) {
      const arr = selected.includes(opt) ? selected.filter(s => s !== opt) : [...selected, opt];
      onChange(arr);
    } else {
      onChange(opt);
    }
  };
  return (
    <View style={{ gap: 8, marginTop: 8 }}>
      {options.map(opt => {
        const active = selected.includes(opt);
        return (
          <Pressable
            key={opt}
            onPress={() => toggle(opt)}
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 12,
              backgroundColor: active ? '#fdf3dc' : '#faf8f3',
              borderWidth: 1, borderColor: active ? 'rgba(222,193,129,0.6)' : 'rgba(222,193,129,0.2)',
              borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
            }}
          >
            <View style={{
              width: 18, height: 18,
              borderRadius: multi ? 4 : 9,
              borderWidth: 2, borderColor: active ? '#bd9348' : '#d1d5db',
              backgroundColor: active ? '#bd9348' : 'transparent',
              alignItems: 'center', justifyContent: 'center',
            }}>
              {active && <Text style={{ color: 'white', fontSize: 11 }}>{multi ? '✓' : '●'}</Text>}
            </View>
            <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 14, color: '#2d2d2d', flex: 1 }}>{opt}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const DRAFT_KEY = (surveyId: string) => `survey-draft:${surveyId}`;

function formatSurveyDueDate(dueDate: string) {
  const parsed = new Date(dueDate);
  if (Number.isNaN(parsed.getTime())) return dueDate;

  return parsed.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function SurveyModal({ survey, onSubmit, onClose }: SurveyModalProps) {
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draftLoaded, setDraftLoaded] = useState(false);

  // Restore saved draft on open
  useEffect(() => {
    AsyncStorage.getItem(DRAFT_KEY(survey.id)).then(raw => {
      if (raw) {
        try { setAnswers(JSON.parse(raw)); } catch {}
      }
      setDraftLoaded(true);
    });
  }, [survey.id]);

  const setAnswer = useCallback((questionId: string, value: any) => {
    setAnswers(prev => {
      const next = { ...prev, [questionId]: value };
      AsyncStorage.setItem(DRAFT_KEY(survey.id), JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, [survey.id]);

  const handleSubmit = async () => {
    const missing = survey.questions.filter(q => q.required && !answers[q.id] && answers[q.id] !== 0);
    if (missing.length > 0) {
      setError(`Please answer: ${missing.map(q => `"${q.text.slice(0, 30)}..."`).join(', ')}`);
      return;
    }
    setSubmitting(true);
    setError(null);
    const { error: submitError } = await onSubmit(answers);
    setSubmitting(false);
    if (submitError) {
      setError('Could not save your responses. Please try again.');
    } else {
      AsyncStorage.removeItem(DRAFT_KEY(survey.id)).catch(() => {});
      setSubmitted(true);
    }
  };

  const answeredCount = survey.questions.filter(q => answers[q.id] !== undefined && answers[q.id] !== '').length;
  const hasDraft = answeredCount > 0;

  const renderQuestion = (q: SurveyQuestion, index: number) => {
    const val = answers[q.id];
    return (
      <View key={q.id} style={{ marginBottom: 24 }}>
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 4 }}>
          <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: '#fdf3dc', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
            <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 11, color: '#bd9348' }}>{index + 1}</Text>
          </View>
          <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 15, color: '#2d2d2d', flex: 1, lineHeight: 22 }}>
            {q.text}
            {q.required && <Text style={{ color: '#bd9348' }}> *</Text>}
          </Text>
        </View>

        {(q.type === 'short') && (
          <TextInput
            value={val ?? ''}
            onChangeText={text => setAnswer(q.id, text)}
            placeholder="Your answer..."
            placeholderTextColor="#b5ad9f"
            style={{ backgroundColor: 'white', borderWidth: 1, borderColor: 'rgba(222,193,129,0.4)', borderRadius: 12, fontFamily: 'Lato_400Regular', fontSize: 14, color: '#2d2d2d', paddingHorizontal: 14, paddingVertical: 10, marginTop: 8 }}
          />
        )}
        {(q.type === 'long') && (
          <TextInput
            value={val ?? ''}
            onChangeText={text => setAnswer(q.id, text)}
            placeholder="Your answer..."
            placeholderTextColor="#b5ad9f"
            multiline
            style={{ backgroundColor: 'white', borderWidth: 1, borderColor: 'rgba(222,193,129,0.4)', borderRadius: 12, fontFamily: 'Lato_400Regular', fontSize: 14, color: '#2d2d2d', paddingHorizontal: 14, paddingVertical: 10, minHeight: 100, textAlignVertical: 'top', marginTop: 8 }}
          />
        )}
        {q.type === 'scale' && (
          <ScaleInput value={val ?? null} onChange={v => setAnswer(q.id, v)} />
        )}
        {q.type === 'choice' && q.options && (
          <ChoiceInput options={q.options} value={val ?? ''} onChange={v => setAnswer(q.id, v)} />
        )}
      </View>
    );
  };

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}
      >
        <Pressable
          onPress={(event) => event.stopPropagation()}
          style={{ backgroundColor: '#faf8f3', borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: '94%' }}
        >
          {/* Handle + close button */}
          <View style={{ alignItems: 'center', paddingTop: 12, paddingBottom: 4 }}>
            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: '#e5e7eb' }} />
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 8 }}>
            {hasDraft ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Ionicons name="cloud-done-outline" size={13} color="#bd9348" />
                <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 12, color: '#bd9348' }}>Progress saved</Text>
              </View>
            ) : <View style={{ width: 80 }} />}
            <Pressable
              onPress={onClose}
              hitSlop={12}
              style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1, padding: 4 })}
            >
              <Ionicons name="close" size={22} color="#9a8060" />
            </Pressable>
          </View>

          {submitted ? (
            <View style={{ alignItems: 'center', padding: 48 }}>
              <Image source={cliveIcon} style={{ width: 72, height: 72, borderRadius: 36, marginBottom: 16 }} contentFit="cover" cachePolicy="memory-disk" />
              <Text style={{ fontFamily: 'LibreBaskerville_700Bold', fontSize: 22, color: '#2d2d2d', textAlign: 'center', marginBottom: 10 }}>All done!</Text>
              <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 15, color: '#6b7280', textAlign: 'center', lineHeight: 22, marginBottom: 32 }}>
                Your answers are saved. Clive and HIVE will be better prepared for the meeting.
              </Text>
              <Pressable onPress={onClose} style={{ backgroundColor: '#bd9348', borderRadius: 14, paddingHorizontal: 32, paddingVertical: 14 }}>
                <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 15, color: 'white' }}>Back to HIVE</Text>
              </Pressable>
            </View>
          ) : (
            <ScrollView showsVerticalScrollIndicator={true} contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 48 }}>
              {/* Header */}
              <View style={{ marginBottom: 28 }}>
                <Text style={{ fontFamily: 'LibreBaskerville_700Bold', fontSize: 22, color: '#2d2d2d', marginBottom: 8 }}>{survey.title}</Text>
                {survey.description && (
                  <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 14, color: '#6b7280', lineHeight: 21 }}>{survey.description}</Text>
                )}
                {survey.due_date && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10, backgroundColor: '#fdf3dc', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6, alignSelf: 'flex-start' }}>
                    <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 12, color: '#bd9348' }}>
                      📅 Due {formatSurveyDueDate(survey.due_date)}
                    </Text>
                  </View>
                )}
                <View style={{ height: 1, backgroundColor: 'rgba(222,193,129,0.3)', marginTop: 20 }} />
              </View>

              {draftLoaded && survey.questions.map((q, i) => renderQuestion(q, i))}

              {error && (
                <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 13, color: '#ef4444', marginBottom: 14 }}>{error}</Text>
              )}

              <Pressable
                onPress={handleSubmit}
                disabled={submitting}
                style={{ backgroundColor: '#bd9348', borderRadius: 16, paddingVertical: 16, alignItems: 'center', opacity: submitting ? 0.7 : 1 }}
              >
                <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 16, color: 'white' }}>
                  {submitting ? 'Saving...' : 'Submit answers'}
                </Text>
              </Pressable>
            </ScrollView>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
