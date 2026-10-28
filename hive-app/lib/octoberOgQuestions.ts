import type { SurveyQuestion } from '../types';
import { CLOTHING_INTEREST_KEY, CLOTHING_INTEREST_OPTIONS } from './clothingInterest';

export const TOMORROW_CHECK_IN_TITLE = 'Before we meet — October draft';

export const TOMORROW_CHECK_IN_QUESTIONS: SurveyQuestion[] = [
  {
    id: 'ball_context',
    type: 'note',
    text: 'A possible Bumblebee Ball',
    body: [
      'We’re considering a catered gathering at Passion Vine House during the first two weeks of January 2027. Nothing is booked or final.',
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
    type: 'long',
    text: 'Who do you think should be invited? HIVE members and their plus-ones is one idea.',
    required: false,
    show_if: { question_id: 'ball_choice', equals: 'I’d like to give input.' },
  },
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
  {
    id: 'clothing_interest',
    type: 'note',
    text: 'HIVE clothing interest',
    body: [
      'Explore hoodie choices in the clothing form, and share your interest in more HIVE clothing below.',
      'This is an interest/selection form, not a confirmed order or fulfillment promise.',
    ],
    link_label: 'Open the clothing form',
    link_url: 'https://app.the-hive.app/hoodie-studio/',
    required: false,
  },
  {
    id: CLOTHING_INTEREST_KEY,
    type: 'choice',
    text: 'Which HIVE clothing would you like to explore? Select any that interest you.',
    options: [...CLOTHING_INTEREST_OPTIONS],
    required: false,
  },
];

/** October's optional prompts belong only to the scheduled OG meeting. */
export function withOctoberMeetingQuestions(questions: SurveyQuestion[], slug: string | null | undefined, meetingId: string | null | undefined): SurveyQuestion[] {
  if (slug !== 'default' || meetingId !== '131d6001-43e4-4426-b07c-9cb7f51e1ab7') return questions;
  const ids = new Set(questions.map(question => question.id));
  return [...questions, ...TOMORROW_CHECK_IN_QUESTIONS.filter(question => !ids.has(question.id))];
}
