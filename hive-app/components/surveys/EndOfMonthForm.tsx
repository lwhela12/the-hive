import { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SurveyCompletion } from './SurveyCompletion';
import { SurveyQuestionField } from './SurveyQuestionField';
import { BuzzContributionInput } from './BuzzContributionInput';
import { BuzzCalendarPreview } from './BuzzCalendarPreview';
import { HiveHelpPreview } from './HiveHelpPreview';
import { hiveAccent, hiveDisplayName, hiveSeal, accentPalette } from '../../lib/hiveBrand';
import { SPACE_SKIN } from '../../lib/pageSkin';
import { CARRY_FORWARD_ANSWER_KEY, getCarryForwardStatusLabel, normalizeCarryForwardResponse, type CarryForwardItem, type CarryForwardStatus } from '../../lib/carryForward';
import { endOfMonthTaskResponses, type EndOfMonthAnswers } from '../../lib/endOfMonth';
import { parseActionItemDescription } from '../../lib/actionItemDisplay';
import type { Community, SurveyQuestion } from '../../types';
import type { SurveyAnswerValue } from '../../lib/hooks/useSurveys';

function savedAnswer(value: SurveyAnswerValue | undefined): string {
  if (value == null || value === '') return 'No answer saved';
  if (Array.isArray(value)) return value.map(String).join(', ') || 'No answer saved';
  return typeof value === 'object' ? 'Saved' : String(value);
}

export function EndOfMonthForm({ sections, initialAnswers, draftKey, legacyDraftKeys, readOnly, completedReview = false, showQuarterAnnouncements = false, showNewsletterDeadline = false, sharedQuarterQuestions = [], finalQuarter = false, onOpen3Miq, onOpenHiveHelp, onSave, onDone, doneLabel, onEmailSettings, onEmailMe, emailingMe = false }: {
  sections: { community: Community; todos: CarryForwardItem[]; questions: SurveyQuestion[] }[];
  initialAnswers: EndOfMonthAnswers;
  draftKey: string;
  legacyDraftKeys: string[];
  readOnly: boolean;
  completedReview?: boolean;
  showQuarterAnnouncements?: boolean;
  showNewsletterDeadline?: boolean;
  sharedQuarterQuestions?: SurveyQuestion[];
  finalQuarter?: boolean;
  onOpen3Miq?: () => void;
  onOpenHiveHelp?: (categoryId: string) => void;
  onSave: (answers: EndOfMonthAnswers) => Promise<{ error: string | null }>;
  onDone: () => void;
  doneLabel: string;
  onEmailSettings: () => void;
  onEmailMe?: () => void;
  emailingMe?: boolean;
}) {
  const [answers, setAnswers] = useState(initialAnswers);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draftState, setDraftState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [showTop, setShowTop] = useState(false);
  const scroll = useRef<ScrollView>(null);
  const draftQueue = useRef<Promise<unknown>>(Promise.resolve());
  const draftWriteFailed = useRef(false);
  const submitting = useRef(false);
  const answerRef = useRef(answers);
  const update = (next: EndOfMonthAnswers) => {
    if (readOnly || submitting.current) return;
    answerRef.current = next;
    setAnswers(next); setSaved(false); setError(null); setDraftState('saving');
    draftQueue.current = draftQueue.current.catch(() => {}).then(() => AsyncStorage.setItem(draftKey, JSON.stringify(next)))
      .then(() => { draftWriteFailed.current = false; setDraftState('saved'); },
        () => { draftWriteFailed.current = true; setDraftState('error'); });
  };
  const leaveWithDraft = async (open: () => void) => {
    await draftQueue.current;
    if (draftWriteFailed.current) {
      setError('Could not keep your draft on this device. Please try again before leaving this check-in.');
      return;
    }
    open();
  };
  const updateHive = (id: string, key: string, value: SurveyAnswerValue) => update({
    ...answerRef.current, hives: { ...answerRef.current.hives, [id]: { ...answerRef.current.hives[id], [key]: value } },
  });
  const save = async () => {
    if (readOnly || submitting.current) return;
    const missing = sections.flatMap(section => section.questions.filter(q => q.type !== 'note' && q.required &&
      !answerRef.current.hives[section.community.id]?.[q.id] && answerRef.current.hives[section.community.id]?.[q.id] !== 0));
    if (missing.length) { setError(`Please answer: ${missing.map(q => q.text).join(', ')}`); return; }
    submitting.current = true; setSaving(true); setError(null);
    try {
      await draftQueue.current;
      const result = await onSave(answerRef.current);
      if (result.error) { setError(result.error); return; }
      await AsyncStorage.multiRemove([draftKey, ...legacyDraftKeys]).catch(() => {});
      setSaved(true); setDraftState('idle');
    } catch {
      setError('Could not finish saving. Your draft is still here; please try again.');
    } finally { submitting.current = false; setSaving(false); }
  };
  const skin = SPACE_SKIN;
  const buttonText = { fontFamily: 'Lato_700Bold', fontSize: 14, lineHeight: 20 } as const;

  if (saved) return <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 48 }}>
    <View style={{ backgroundColor: '#fffdf5', borderRadius: 16, borderWidth: 2, borderColor: skin.gold, width: '100%', maxWidth: 880, alignSelf: 'center' }}>
      <SurveyCompletion message="Your end of the month check-in is saved. Thank you!"
        logo={hiveSeal(null)} accent={hiveAccent(null)} onDone={onDone} closeLabel={doneLabel}
        onReview={() => setSaved(false)} />
    </View>
  </ScrollView>;

  return <View style={{ flex: 1 }}>
    <ScrollView ref={scroll} onScroll={event => setShowTop(event.nativeEvent.contentOffset.y > 300)} scrollEventThrottle={100}
      keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20, paddingBottom: 88 }}>
      <View style={{ width: '100%', maxWidth: 880, alignSelf: 'center', gap: 18 }}>
        {readOnly
          ? <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 14, lineHeight: 21, color: skin.inkBody }}>
              {completedReview ? 'Your saved check-in · read only' : 'Date preview · read only'}
            </Text>
          : <View style={{ gap: 4 }}>
              <Text accessibilityRole="header" style={{ fontFamily: 'Lato_700Bold', fontSize: 18, color: skin.ink }}>Your to-do list</Text>
              <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 14, lineHeight: 21, color: skin.inkBody }}>
                Start with the to-dos already assigned to you in each HIVE. Mark what’s done or archive what you’re leaving behind, then continue to the month’s questions.
              </Text>
            </View>}
        {sections.map(section => {
          const community = section.community;
          const tint = accentPalette(hiveAccent(community));
          const own = answers.hives[community.id] ?? {};
          const tasks = completedReview ? normalizeCarryForwardResponse(own[CARRY_FORWARD_ANSWER_KEY]).filter(item => item.type === 'action_item')
            : endOfMonthTaskResponses(section.todos, own);
          return <View key={community.id} style={{ backgroundColor: '#fffdf5', borderWidth: 2, borderColor: tint.accent, borderRadius: 16, padding: 16, gap: 12 }}>
            <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
              <Image source={hiveSeal(community.slug)} accessibilityLabel={`${hiveDisplayName(community.name)} logo`} contentFit="contain" style={{ width: 48, height: 48 }} />
              <Text accessibilityRole="header" style={{ flex: 1, fontFamily: 'Lato_700Bold', fontSize: 18, color: '#313130' }}>{hiveDisplayName(community.name)}</Text>
            </View>
            {tasks.length === 0 && <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 14, color: '#5c5648' }}>{completedReview ? 'No to-do decisions saved.' : 'No open to-dos.'}</Text>}
            {tasks.map(item => {
              const parsed = parseActionItemDescription(item.label);
              if (completedReview) return <View key={item.id} style={{ borderTopWidth: 1, borderColor: tint.line(0.2), paddingTop: 8, gap: 3 }}>
                <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 14, lineHeight: 19, color: '#313130' }}>{parsed.text}</Text>
                <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 12, color: '#5c5648' }}>{getCarryForwardStatusLabel(item.status)}</Text>
              </View>;
              const done = item.status === 'done';
              const archived = item.status === 'archive';
              const setStatus = (status: CarryForwardStatus) => updateHive(community.id, CARRY_FORWARD_ANSWER_KEY,
                endOfMonthTaskResponses(section.todos, answerRef.current.hives[community.id] ?? {}).map(task => ({ ...task, status: task.id === item.id ? status : task.status })));
              return <View key={item.id} style={{ borderTopWidth: 1, borderColor: tint.line(0.2), paddingTop: 4 }}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 4 }}>
                  <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: done, disabled: readOnly || saving }}
                    accessibilityLabel={`${done ? 'Mark still to do' : 'Mark done'}: ${parsed.text}`}
                    disabled={readOnly || saving} onPress={() => setStatus(done ? 'keep_active' : 'done')}
                    style={({ pressed }) => ({ flex: 1, minWidth: 0, flexDirection: 'row', gap: 8, alignItems: 'flex-start', minHeight: 44, paddingVertical: 8, opacity: pressed ? 0.7 : 1 })}>
                    <Ionicons name={done ? 'checkmark-circle' : 'ellipse-outline'} size={24} color={tint.accent} />
                    <View style={{ flex: 1, gap: 1 }}>
                      <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 14, lineHeight: 19, color: '#313130', textDecorationLine: done || archived ? 'line-through' : 'none' }}>{parsed.text}</Text>
                      {!!(parsed.context || item.detail) && <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 12, lineHeight: 17, color: '#5c5648' }}>
                        {[parsed.context, item.detail].filter(Boolean).join(' · ')}
                      </Text>}
                    </View>
                  </Pressable>
                  <Pressable accessibilityRole="button" accessibilityLabel={`${archived ? 'Undo archive' : 'Archive'}: ${parsed.text}`}
                    disabled={readOnly || saving} onPress={() => setStatus(archived ? 'keep_active' : 'archive')}
                    style={({ pressed }) => ({ minHeight: 44, minWidth: 68, paddingHorizontal: 5, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}>
                    <Text style={{ ...buttonText, fontSize: 12, color: tint.ink }}>{archived ? 'Undo' : 'Archive'}</Text>
                  </Pressable>
                </View>
              </View>;
            })}
            {section.questions.map((question, index) => readOnly
              ? <View key={question.id} style={{ gap: 6 }}><Text style={{ ...buttonText, color: '#313130' }}>{question.text}</Text>
                  <Text style={{ fontFamily: 'Lato_400Regular', color: '#5c5648' }}>{completedReview ? savedAnswer(own[question.id]) : question.options?.join(' · ')}</Text></View>
              : <SurveyQuestionField key={question.id} question={question} index={index} value={own[question.id]}
                  onChange={value => updateHive(community.id, question.id, value)} communityId={community.id}
                  accent={tint.accent} answers={own} onSetAnswer={(id, value) => updateHive(community.id, id, value)} />)}
          </View>;
        })}
        {sharedQuarterQuestions.length > 0 && <View style={{ backgroundColor: '#fffdf5', borderRadius: 16, padding: 16, gap: 12, borderWidth: 2, borderColor: skin.gold }}>
          <Text accessibilityRole="header" style={{ fontFamily: 'Lato_700Bold', fontSize: 18, color: '#313130' }}>HIVE-Wide · looking ahead</Text>
          {finalQuarter && <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 14, lineHeight: 21, color: '#313130' }}>
            We’re moving into the final quarter of the year!
          </Text>}
          {sharedQuarterQuestions.map((question, index) => readOnly
            ? <View key={question.id} style={{ gap: 6 }}><Text style={{ ...buttonText, color: '#313130' }}>{question.text}</Text>
                <Text style={{ fontFamily: 'Lato_400Regular', color: '#5c5648' }}>{completedReview ? savedAnswer(answers.month[question.id]) : question.options?.join(' · ')}</Text></View>
            : <SurveyQuestionField key={question.id} question={question} index={index} value={answers.month[question.id]}
                onChange={value => update({ ...answerRef.current, month: { ...answerRef.current.month, [question.id]: value } })}
                answers={answers.month} />)}
          <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 13, lineHeight: 19, color: '#5c5648' }}>
            Haven’t done your 3MIQ, or want to revisit them? You can find them in your profile later, or open them now.
          </Text>
          {!readOnly && onOpen3Miq && <Pressable accessibilityRole="link" accessibilityLabel="Explore my 3MIQ on my profile"
            disabled={saving} onPress={() => { void leaveWithDraft(onOpen3Miq); }} style={{ minHeight: 44, alignSelf: 'flex-start', justifyContent: 'center', paddingHorizontal: 14,
              borderRadius: 999, borderWidth: 1, borderColor: '#8a652f', backgroundColor: '#f5eddc' }}>
            <Text style={{ ...buttonText, color: '#313130' }}>Explore my 3MIQ</Text>
          </Pressable>}
        </View>}
        {showQuarterAnnouncements && <View style={{ backgroundColor: '#fffdf5', borderRadius: 16, padding: 16, gap: 8, borderWidth: 1, borderColor: skin.borderStrong }}>
          <Text accessibilityRole="header" style={{ fontFamily: 'Lato_700Bold', fontSize: 16, color: '#313130' }}>It’s hoodie season!</Text>
          {sections.some(section => section.community.slug === 'default') &&
            <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 14, lineHeight: 21, color: '#313130' }}>
                OG HIVE members: we’re using part of our Honey Pot dues to cover our hoodies and the rest for the Bumblebee Ball. Please reach out to Nat to schedule a time to design and order your hoodie, virtually or in person.
              </Text>}
          <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 14, lineHeight: 21, color: '#313130' }}>
            Not in OG? You can still get a hoodie at cost from our shop. Reach out to Nat to schedule a time to design and order yours, virtually or in person.
          </Text>
        </View>}
        {!completedReview && <HiveHelpPreview disabled={saving} onOpenBoard={categoryId => {
          if (onOpenHiveHelp) void leaveWithDraft(() => onOpenHiveHelp(categoryId));
        }} />}
        <View style={{ backgroundColor: '#fffdf5', borderRadius: 16, padding: 16, gap: 16, borderWidth: 2, borderColor: skin.gold }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Image source={hiveSeal(null)} accessibilityLabel="HIVE-Wide logo" contentFit="contain" style={{ width: 48, height: 48 }} />
            <Text accessibilityRole="header" style={{ fontFamily: 'Lato_700Bold', fontSize: 18, color: '#313130' }}>For the Buzz</Text>
          </View>
          {showNewsletterDeadline && <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 14, lineHeight: 21, color: '#313130' }}>
            The newsletter goes out tomorrow, October 2! Anything you’d like to mention or add? Please send your shout-outs and event plugs today.
          </Text>}
          {!completedReview && <BuzzCalendarPreview />}
          {([{ id: 'q_shoutout', label: 'A shout-out for someone', placeholder: 'Who deserves a shout-out, and why?' },
            { id: 'q_newsletter', label: 'A plug or an event', placeholder: 'Include names, dates and links.' }] as const).map(field => <View key={field.id}>
              <Text style={{ ...buttonText, color: '#313130' }}>{field.label} <Text style={{ fontFamily: 'Lato_400Regular', color: '#5c5648' }}>(optional)</Text></Text>
              {!readOnly && <BuzzContributionInput disabled={saving} value={String(answers.month[field.id] ?? '')} placeholder={field.placeholder}
                onChangeText={value => update({ ...answerRef.current, month: { ...answerRef.current.month, [field.id]: value } })} />}
              {completedReview && <Text style={{ fontFamily: 'Lato_400Regular', color: '#5c5648' }}>{String(answers.month[field.id] ?? 'No answer saved')}</Text>}
            </View>)}
        </View>
        {error && <Text accessibilityRole="alert" style={{ fontFamily: 'Lato_400Regular', color: '#ffb8b8', lineHeight: 21 }}>{error}</Text>}
        {draftState !== 'idle' && !saved && <Text accessibilityLiveRegion="polite" style={{ fontFamily: 'Lato_400Regular', fontSize: 12, color: skin.inkSoft }}>
          {draftState === 'saving' ? 'Saving on this device…' : draftState === 'saved' ? 'Saved on this device' : 'Could not keep a draft on this device. Keep this page open until you save.'}
        </Text>}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
          {!readOnly && !saved && <Pressable accessibilityRole="button" disabled={saving} onPress={save}
            style={({ pressed }) => ({ flexDirection: 'row', gap: 8, alignItems: 'center', maxWidth: '100%', minHeight: 44, paddingHorizontal: 22, paddingVertical: 12, borderRadius: 999, backgroundColor: skin.gold, opacity: pressed || saving ? 0.7 : 1 })}>
            {saving && <ActivityIndicator color="#313130" size="small" />}
            <Text style={{ ...buttonText, color: '#313130' }}>{saving ? 'Saving…' : 'Save check-in'}</Text>
          </Pressable>}
          <Pressable accessibilityRole="button" disabled={saving} onPress={onDone} style={{ minHeight: 44, paddingHorizontal: 22, paddingVertical: 12, borderRadius: 999, borderWidth: 1, borderColor: skin.borderStrong, backgroundColor: skin.card }}>
            <Text style={{ ...buttonText, color: skin.ink }}>Done for now</Text>
          </Pressable>
          <Pressable accessibilityRole="link" disabled={saving} onPress={onEmailSettings} style={{ minHeight: 44, paddingHorizontal: 16, paddingVertical: 12 }}>
            <Text style={{ ...buttonText, color: skin.ink }}>Email settings</Text>
          </Pressable>
          {!readOnly && onEmailMe && <Pressable accessibilityRole="button" accessibilityLabel="Email me this check-in"
            disabled={saving || emailingMe} onPress={onEmailMe}
            style={({ pressed }) => ({ minHeight: 44, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 999,
              borderWidth: 1, borderColor: skin.borderStrong, backgroundColor: skin.card,
              opacity: pressed || saving || emailingMe ? 0.7 : 1 })}>
            <Text style={{ ...buttonText, color: skin.ink }}>{emailingMe ? 'Checking email…' : 'Email me this check-in'}</Text>
          </Pressable>}
        </View>
      </View>
    </ScrollView>
    {showTop && <Pressable accessibilityRole="button" accessibilityLabel="Back to top" onPress={() => scroll.current?.scrollTo({ y: 0, animated: false })}
      style={{ position: 'absolute', right: 16, bottom: 16, width: 44, height: 44, borderRadius: 22, backgroundColor: skin.gold, alignItems: 'center', justifyContent: 'center' }}>
      <Ionicons name="arrow-up" size={22} color="#313130" />
    </Pressable>}
  </View>;
}
