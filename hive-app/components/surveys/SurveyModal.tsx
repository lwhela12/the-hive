import { useState, useEffect, useCallback, useMemo } from 'react';
import { ActivityIndicator, View, Text, ScrollView, Pressable, TextInput, Modal } from 'react-native';
import { Image } from 'expo-image';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';

const cliveIcon = require('../../assets/Clive_logo.png');
import {
  CARRY_FORWARD_ANSWER_KEY,
  CARRY_FORWARD_STATUS_OPTIONS,
  getCarryForwardStatusLabel,
  normalizeCarryForwardResponse,
  type CarryForwardItem,
  type CarryForwardResponseItem,
  type CarryForwardStatus,
} from '../../lib/carryForward';
import type { Survey, SurveyAnswers, SurveyQuestion } from '../../lib/hooks/useSurveys';

interface SurveyModalProps {
  survey: Survey;
  initialAnswers?: SurveyAnswers;
  isEditingResponse?: boolean;
  carryForwardItems?: CarryForwardItem[];
  carryForwardLoading?: boolean;
  carryForwardError?: string | null;
  onSubmit: (answers: SurveyAnswers) => Promise<{ error: any }>;
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

const carryForwardItemKey = (item: Pick<CarryForwardItem, 'type' | 'id'>) => `${item.type}:${item.id}`;

const CARRY_FORWARD_STATUS_STYLE: Record<CarryForwardStatus, {
  backgroundColor: string;
  borderColor: string;
  color: string;
}> = {
  keep_active: {
    backgroundColor: '#fdf3dc',
    borderColor: '#dec181',
    color: '#8a6b30',
  },
  needs_attention: {
    backgroundColor: '#fef3c7',
    borderColor: '#f59e0b',
    color: '#92400e',
  },
  done: {
    backgroundColor: '#ecfdf3',
    borderColor: '#86efac',
    color: '#166534',
  },
  archive: {
    backgroundColor: '#f3f4f6',
    borderColor: '#d1d5db',
    color: '#4b5563',
  },
};

function buildCarryForwardResponse(
  answers: Record<string, any>,
  items: CarryForwardItem[]
): CarryForwardResponseItem[] {
  const current = normalizeCarryForwardResponse(answers[CARRY_FORWARD_ANSWER_KEY]);
  const currentByKey = new Map(current.map(item => [carryForwardItemKey(item), item]));

  return items.map((item) => {
    const existing = currentByKey.get(carryForwardItemKey(item));
    return {
      ...item,
      status: existing?.status ?? 'keep_active',
      note: existing?.note ?? null,
    };
  });
}

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

export function SurveyModal({
  survey,
  initialAnswers,
  isEditingResponse = false,
  carryForwardItems = [],
  carryForwardLoading = false,
  carryForwardError = null,
  onSubmit,
  onClose,
}: SurveyModalProps) {
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draftLoaded, setDraftLoaded] = useState(false);
  const carryForwardResponses = useMemo(() => (
    normalizeCarryForwardResponse(answers[CARRY_FORWARD_ANSWER_KEY])
  ), [answers]);
  const carryForwardResponsesByKey = useMemo(() => {
    const next = new Map<string, CarryForwardResponseItem>();
    carryForwardResponses.forEach((item) => next.set(carryForwardItemKey(item), item));
    return next;
  }, [carryForwardResponses]);

  // Restore saved draft on open
  useEffect(() => {
    let active = true;
    setAnswers({});
    setSubmitted(false);
    setError(null);
    setDraftLoaded(false);

    AsyncStorage.getItem(DRAFT_KEY(survey.id)).then(raw => {
      if (!active) return;
      if (raw) {
        try { setAnswers(JSON.parse(raw)); } catch {}
      } else {
        setAnswers(initialAnswers ?? {});
      }
      setDraftLoaded(true);
    });

    return () => {
      active = false;
    };
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
    const finalAnswers: SurveyAnswers = carryForwardItems.length > 0
      ? {
          ...answers,
          [CARRY_FORWARD_ANSWER_KEY]: buildCarryForwardResponse(answers, carryForwardItems),
        }
      : answers;
    const { error: submitError } = await onSubmit(finalAnswers);
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

  const updateCarryForwardItem = (
    item: CarryForwardItem,
    patch: Partial<Pick<CarryForwardResponseItem, 'status' | 'note'>>
  ) => {
    const current = normalizeCarryForwardResponse(answers[CARRY_FORWARD_ANSWER_KEY]);
    const targetKey = carryForwardItemKey(item);
    let found = false;
    const next = current.map((entry) => {
      if (carryForwardItemKey(entry) !== targetKey) return entry;
      found = true;
      return {
        ...entry,
        ...patch,
      };
    });

    if (!found) {
      next.push({
        ...item,
        status: patch.status ?? 'keep_active',
        note: patch.note ?? null,
      });
    }

    setAnswer(CARRY_FORWARD_ANSWER_KEY, next);
  };

  const renderCarryForwardContext = () => {
    if (carryForwardLoading) {
      return (
        <View style={{ backgroundColor: '#fffdf5', borderWidth: 1, borderColor: 'rgba(222,193,129,0.45)', borderRadius: 16, padding: 16, marginBottom: 24, alignItems: 'center' }}>
          <ActivityIndicator color="#bd9348" />
          <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 13, color: '#7f715f', marginTop: 8 }}>
            Gathering your open HIVE things...
          </Text>
        </View>
      );
    }

    if (carryForwardError) {
      return (
        <View style={{ backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fecaca', borderRadius: 16, padding: 14, marginBottom: 24 }}>
          <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 13, color: '#991b1b' }}>
            {carryForwardError}
          </Text>
        </View>
      );
    }

    if (carryForwardItems.length === 0) return null;

    return (
      <View style={{ backgroundColor: '#fffdf5', borderWidth: 1, borderColor: 'rgba(222,193,129,0.55)', borderRadius: 18, padding: 16, marginBottom: 24 }}>
        <Text style={{ fontFamily: 'LibreBaskerville_700Bold', fontSize: 17, color: '#2d2d2d', marginBottom: 6 }}>
          Still on your roster
        </Text>
        <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 13, color: '#7f715f', lineHeight: 19, marginBottom: 14 }}>
          HIVE found these open tasks, wishes, HD boards, threads, and recent POP notes. Mark what should happen next.
        </Text>

        <View style={{ gap: 12 }}>
          {carryForwardItems.map((item) => {
            const response = carryForwardResponsesByKey.get(carryForwardItemKey(item));
            const activeStatus = response?.status ?? 'keep_active';

            return (
              <View
                key={carryForwardItemKey(item)}
                style={{
                  backgroundColor: '#faf8f3',
                  borderWidth: 1,
                  borderColor: 'rgba(222,193,129,0.38)',
                  borderRadius: 14,
                  padding: 12,
                }}
              >
                <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start', marginBottom: 8 }}>
                  <View style={{ backgroundColor: '#fdf3dc', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4, flexShrink: 0 }}>
                    <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 11, color: '#8a6b30' }}>
                      {item.sourceLabel}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 14, color: '#2d2d2d', lineHeight: 19 }}>
                      {item.label}
                    </Text>
                    {item.detail ? (
                      <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 12, color: '#6b7280', lineHeight: 17, marginTop: 3 }}>
                        {item.detail}
                      </Text>
                    ) : null}
                  </View>
                </View>

                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 10 }}>
                  {CARRY_FORWARD_STATUS_OPTIONS.map((option) => {
                    const active = option.value === activeStatus;
                    const activeStyle = CARRY_FORWARD_STATUS_STYLE[option.value];
                    return (
                      <Pressable
                        key={option.value}
                        onPress={() => updateCarryForwardItem(item, { status: option.value })}
                        style={({ pressed }) => ({
                          backgroundColor: active ? activeStyle.backgroundColor : pressed ? '#fbf0d7' : '#fffdf5',
                          borderColor: active ? activeStyle.borderColor : 'rgba(222,193,129,0.42)',
                          borderWidth: 1,
                          borderRadius: 999,
                          paddingHorizontal: 10,
                          paddingVertical: 6,
                        })}
                      >
                        <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 12, color: active ? activeStyle.color : '#8a6b30' }}>
                          {option.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                <TextInput
                  value={response?.note ?? ''}
                  onChangeText={(note) => updateCarryForwardItem(item, { note })}
                  placeholder={`Optional note for ${activeStatus ? getCarryForwardStatusLabel(activeStatus).toLowerCase() : 'this item'}...`}
                  placeholderTextColor="#b5ad9f"
                  multiline
                  style={{
                    backgroundColor: 'white',
                    borderWidth: 1,
                    borderColor: 'rgba(222,193,129,0.32)',
                    borderRadius: 10,
                    fontFamily: 'Lato_400Regular',
                    fontSize: 13,
                    color: '#2d2d2d',
                    paddingHorizontal: 12,
                    paddingVertical: 9,
                    minHeight: 42,
                    textAlignVertical: 'top',
                  }}
                />
              </View>
            );
          })}
        </View>
      </View>
    );
  };

  const renderQuestion = (q: SurveyQuestion, index: number) => {
    const val = answers[q.id];
    const textValue = typeof val === 'string' ? val : '';

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
            value={textValue}
            onChangeText={text => setAnswer(q.id, text)}
            placeholder="Your answer..."
            placeholderTextColor="#b5ad9f"
            style={{ backgroundColor: 'white', borderWidth: 1, borderColor: 'rgba(222,193,129,0.4)', borderRadius: 12, fontFamily: 'Lato_400Regular', fontSize: 14, color: '#2d2d2d', paddingHorizontal: 14, paddingVertical: 10, marginTop: 8 }}
          />
        )}
        {(q.type === 'long') && (
          <TextInput
            value={textValue}
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
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
        <Pressable onPress={onClose} style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }} />
        <View style={{ backgroundColor: '#faf8f3', borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: '94%' }}>
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
                {isEditingResponse
                  ? 'Your updated answers are saved. Clive and HIVE will be working from the latest version.'
                  : 'Your answers are saved. Clive and HIVE will be better prepared for the meeting.'}
              </Text>
              <Pressable onPress={onClose} style={{ backgroundColor: '#bd9348', borderRadius: 14, paddingHorizontal: 32, paddingVertical: 14 }}>
                <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 15, color: 'white' }}>Back to HIVE</Text>
              </Pressable>
            </View>
          ) : (
            <ScrollView
              showsVerticalScrollIndicator={true}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="interactive"
              contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 48 }}
            >
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

              {draftLoaded && renderCarryForwardContext()}

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
                  {submitting ? 'Saving...' : isEditingResponse ? 'Update answers' : 'Submit answers'}
                </Text>
              </Pressable>
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}
