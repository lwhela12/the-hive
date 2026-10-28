import type { SurveyQuestion } from '../types';

export const TOMORROW_CHECK_IN_TITLE = 'Before we meet — October draft';

export const TOMORROW_CHECK_IN_QUESTIONS: SurveyQuestion[] = [
  {
    id: 'ball_context',
    type: 'note',
    text: 'A possible Bumblebee Ball',
    body: [
      'We’re considering a catered gathering at Passion Vine House during the first two weeks of January 2027. Nothing is booked or final. Your Ball answers go to the planning chat with Nat, Nic, Izzy, and Meg.',
    ],
    required: false,
  },
  {
    id: 'ball_choice',
    type: 'choice',
    text: 'For the Bumblebee Ball, which feels right to you?',
    options: [
      'I’m happy for the party-planning committee to choose.',
      'I’d like to give input.',
    ],
    required: false,
  },
  {
    id: 'ball_timing',
    type: 'long',
    text: 'What timing during the first two weeks of January 2027 could work for you?',
    required: false,
    show_if: { question_id: 'ball_choice', equals: 'I’d like to give input.' },
  },
  {
    id: 'ball_audience',
    type: 'choice',
    text: 'Who should be invited to the Bumblebee Ball?',
    options: ['Just OG HIVE', 'HIVE-wide', 'HIVE members and their plus-ones', 'All members, their plus-ones, and HIVE hopefuls'],
    required: false,
    show_if: { question_id: 'ball_choice', equals: 'I’d like to give input.' },
  },
  { id: 'ball_food', type: 'long', text: 'What food would you enjoy at the Bumblebee Ball?', required: false, show_if: { question_id: 'ball_choice', equals: 'I’d like to give input.' } },
  { id: 'ball_awards', type: 'long', text: 'Any ideas for awards or people we should celebrate?', required: false, show_if: { question_id: 'ball_choice', equals: 'I’d like to give input.' } },
  { id: 'ball_dress', type: 'choice', text: 'What should we wear?', options: ['Ballgowns and fancy clothes', 'Onesies', 'Costumes', 'Cozies', 'Dealer’s choice — wear what you like'], required: false, show_if: { question_id: 'ball_choice', equals: 'I’d like to give input.' } },
  { id: 'nat_feedback_context', type: 'note', text: 'Just for Nat', body: ['Your goals, support, HIVE feedback, and plans for next year are private between you and Nat. They will not appear on the meeting screen or in the planning chat.'], required: false },
  {
    id: 'member_goal',
    type: 'long',
    text: 'What goal are you working toward right now?',
    required: false,
  },
  {
    id: 'member_support',
    type: 'long',
    text: 'What support from HIVE would help you make progress?',
    required: false,
  },
  {
    id: 'member_value',
    type: 'long',
    text: 'Are you getting enough value from HIVE? What could make it more useful or better integrated into your life?',
    required: false,
  },
  { id: 'member_next_year', type: 'choice', text: 'Do you intend to stay in HIVE next year?', options: ['Yes', 'Not sure yet — I’d like to talk with Nat', 'No'], required: false },
  {
    id: 'clothing_interest',
    type: 'note',
    text: 'HIVE swag',
    body: [
      'Choose your style, color, size, and HIVE artwork in the interactive form. Save or download each selection to share with Nat.',
    ],
    link_label: 'Customize your HIVE swag',
    link_url: 'https://app.the-hive.app/hoodie-studio/',
    required: false,
  },

];

/** October's optional prompts belong only to the scheduled OG meeting. */
export function withOctoberMeetingQuestions(questions: SurveyQuestion[], slug: string | null | undefined, meetingId: string | null | undefined): SurveyQuestion[] {
  if (slug !== 'default' || meetingId !== '131d6001-43e4-4426-b07c-9cb7f51e1ab7') return questions;
  const ids = new Set(questions.map(question => question.id));
  return [...questions, ...TOMORROW_CHECK_IN_QUESTIONS.filter(question => !ids.has(question.id))];
}
