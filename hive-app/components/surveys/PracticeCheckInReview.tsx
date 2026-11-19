import { View, Text, Pressable } from 'react-native';
import { ArrivalMemberCard } from '../meetings/ArrivalMemberCard';
import type { ArrivalBoardMember } from '../../lib/hooks/useArrivalBoard';
import type { SurveyAnswers } from '../../lib/hooks/useSurveys';
import { formatDateShort, formatTimeRange } from '../../lib/dateUtils';
import type { SurveyQuestion } from '../../types';
import { MEETING_TIME_ANSWER_KEY, readMeetingTimeAnswer } from '../../lib/techMeetingAvailability';

const arrivalKeys = new Set(['q_attendance', 'q_hard_out', 'q_feeling_today', 'q_feeling_note', 'q_name_today', 'q_plate']);
const techDiscussion = new Set(['q_tech_working_on', 'q_learned', 'q_tech_low', 'q_hd_wish']);

export function PracticeCheckInReview({ member, questions, answers, meetingId, tech, onDone }: {
  member: ArrivalBoardMember;
  questions: SurveyQuestion[];
  answers: SurveyAnswers;
  meetingId?: string;
  tech: boolean;
  onDone: () => void;
}) {
  const ballot = meetingId ? readMeetingTimeAnswer(answers[MEETING_TIME_ANSWER_KEY], meetingId) : null;
  return <View style={{ maxWidth: 640, width: '100%', alignSelf: 'center', padding: 24, gap: 16 }}>
    <Text accessibilityRole="header" style={{ fontSize: 24, fontWeight: '700' }}>Practice check-in complete</Text>
    <Text>Your live attendance and answers are unchanged.</Text>
    <Text accessibilityRole="header" style={{ fontSize: 18, fontWeight: '700' }}>Meeting Helper · Arrivals preview</Text>
    <ArrivalMemberCard googleMeet={tech} member={member} response={{
      id: 'practice', survey_id: 'practice', user_id: member.id, answers, submitted_at: new Date().toISOString(),
    }} isTV={false} compact />
    {questions.flatMap(question => {
      const answer = answers[question.id];
      const value = typeof answer === 'string' || typeof answer === 'number'
        ? String(answer) : Array.isArray(answer) ? answer.filter(item => typeof item === 'string').join(', ') : '';
      if (!value.trim() || question.type === 'note') return [];
      const destination = arrivalKeys.has(question.id) ? 'Arrivals'
        : tech && techDiscussion.has(question.id) ? 'What We’re Trying'
        : tech && question.id === 'q_networking' ? 'Plan' : 'Survey response';
      return [<View key={question.id} style={{ gap: 4 }}>
        <Text style={{ fontWeight: '700' }}>{destination} · {question.text}</Text>
        <Text selectable>{value}</Text>
      </View>];
    })}
    {ballot && <View style={{ gap: 4 }}>
      <Text style={{ fontWeight: '700' }}>Plan · Next meeting availability</Text>
      <Text>Your choices contribute to the totals for each proposed time.</Text>
      {Object.entries(ballot.choices).map(([slot, choice]) => {
        const [date, start] = slot.split('T');
        return <Text key={slot}>{formatDateShort(date)} · {formatTimeRange(start, null)} PT · {choice}{ballot.favorite === slot ? ' · Favorite' : ''}</Text>;
      })}
      {!!ballot.suggestion && <Text selectable>Suggested time: {ballot.suggestion}</Text>}
    </View>}
    <Pressable accessibilityRole="button" onPress={onDone} style={{ paddingVertical: 14 }}>
      <Text style={{ fontWeight: '700' }}>Done for now</Text>
    </Pressable>
  </View>;
}
