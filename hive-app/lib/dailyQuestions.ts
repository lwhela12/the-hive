export interface DailyQuestion {
  text: string;
  category: string;
  emoji: string;
}

export const DAILY_QUESTIONS: DailyQuestion[] = [
  { text: "You're on a desert island and get one book forever. What is it?", category: 'desert island', emoji: '🏝️' },
  { text: 'Would you rather always know the perfect next step, or always know who to ask for help?', category: 'instincts', emoji: '🧭' },
  { text: 'If your week had a theme song, what would be playing?', category: 'current mood', emoji: '🎧' },
  { text: 'Would you rather host the dinner party or design the playlist?', category: 'social style', emoji: '🍽️' },
  { text: 'What tiny luxury makes you feel instantly richer?', category: 'daily joy', emoji: '✨' },
  { text: 'If your personality were a room, what would be in it?', category: 'aesthetic', emoji: '🛋️' },
  { text: 'Would you rather have a secret garden or a secret library?', category: 'inner world', emoji: '🔮' },
  { text: 'What is your most specific comfort movie or comfort show?', category: 'comfort', emoji: '📺' },
  { text: 'If you had to teach a weirdly specific class, what would it be?', category: 'hidden genius', emoji: '🎓' },
  { text: 'Would you rather be famous for your taste, your courage, or your kindness?', category: 'values', emoji: '💫' },
  { text: 'What is a hill you will lovingly die on?', category: 'strong opinions', emoji: '⛰️' },
  { text: 'If you could instantly become a beginner again at one thing, what would you choose?', category: 'curiosity', emoji: '🌱' },
  { text: 'What snack says the most about who you are?', category: 'snack astrology', emoji: '🍿' },
  { text: 'Would you rather have one perfect outfit or one perfect workspace?', category: 'priorities', emoji: '🪞' },
  { text: 'What fictional place do you secretly belong in?', category: 'imagination', emoji: '🗺️' },
  { text: 'If someone gave you a free Saturday with no guilt, what would you do first?', category: 'rest style', emoji: '🌞' },
  { text: 'What compliment do you secretly love receiving?', category: 'love language', emoji: '💛' },
  { text: 'Would you rather be known as the calm one, the bold one, or the brilliant one?', category: 'identity', emoji: '🌟' },
  { text: 'What object in your home has the best story?', category: 'home story', emoji: '🏠' },
  { text: 'What is a small thing that can instantly ruin your vibe?', category: 'boundaries', emoji: '🚦' },
  { text: 'What is a small thing that can instantly save your vibe?', category: 'reset button', emoji: '🪄' },
  { text: 'Would you rather travel with a detailed itinerary or follow signs and feelings?', category: 'travel style', emoji: '✈️' },
  { text: 'What is your personal version of a victory lap?', category: 'celebration', emoji: '🏆' },
  { text: 'If your phone lock screen could talk, what would it reveal about you?', category: 'personal clues', emoji: '📱' },
  { text: 'What is a talent you have that deserves more applause?', category: 'hidden talent', emoji: '👏' },
  { text: 'Would you rather be underestimated or overbooked?', category: 'ambition', emoji: '🚀' },
  { text: 'What color feels like your current chapter?', category: 'season of life', emoji: '🎨' },
  { text: 'What is something you loved before it was cool?', category: 'taste', emoji: '🕶️' },
  { text: 'If your dream project had a launch party, what would be on the invitation?', category: 'vision', emoji: '💌' },
  { text: 'What is your favorite way to be useful to people?', category: 'community role', emoji: '🤝' },
  { text: 'Would you rather solve the puzzle, tell the story, or make the room beautiful?', category: 'creative type', emoji: '🧩' },
  { text: 'What is a rule you follow that most people probably do not notice?', category: 'personal code', emoji: '📜' },
  { text: 'What is a book, song, or place that feels like a portal?', category: 'meaning', emoji: '🚪' },
  { text: 'Would you rather have a perfect memory or perfect intuition?', category: 'superpower', emoji: '🧠' },
  { text: 'What is something you can talk about for ten minutes with no prep?', category: 'spark', emoji: '🔥' },
  { text: 'What is your signature move when someone you love needs support?', category: 'care style', emoji: '🫶' },
  { text: 'Would you rather start the thing, finish the thing, or make the thing better?', category: 'work style', emoji: '🛠️' },
  { text: 'What is the most you thing you have done this month?', category: 'self-portrait', emoji: '🖼️' },
  { text: 'If your future self left you a sticky note, what would it say?', category: 'future self', emoji: '📝' },
  { text: 'What is an oddly specific dream you hope comes true?', category: 'wishcraft', emoji: '🌙' },
  { text: 'Would you rather have a magical closet, kitchen, calendar, or bank account?', category: 'desire map', emoji: '🪄' },
  { text: 'What is your favorite kind of weather for becoming yourself again?', category: 'atmosphere', emoji: '🌦️' },
  { text: 'What is a phrase your friends would use to describe you?', category: 'reflection', emoji: '🪞' },
  { text: 'Would you rather be the muse, the maker, the manager, or the magician?', category: 'archetype', emoji: '🎭' },
  { text: 'What is one thing you would put in a tiny museum of your life?', category: 'life museum', emoji: '🏛️' },
  { text: 'What is your favorite way to make a regular day feel ceremonial?', category: 'ritual', emoji: '🕯️' },
  { text: 'Would you rather receive a perfect plan, a perfect pep talk, or a perfect shortcut?', category: 'support style', emoji: '🗝️' },
  { text: 'What is something you are quietly becoming?', category: 'becoming', emoji: '🌅' },
];

export function getQuestionDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getQuestionForDate(date: Date): { question: DailyQuestion; index: number; dateKey: string } {
  const epoch = new Date(2025, 0, 1); // Jan 1 2025
  const questionDate = new Date(date);
  questionDate.setHours(0, 0, 0, 0);
  const daysSince = Math.floor((questionDate.getTime() - epoch.getTime()) / 86_400_000);
  const index = ((daysSince % DAILY_QUESTIONS.length) + DAILY_QUESTIONS.length) % DAILY_QUESTIONS.length;
  return { question: DAILY_QUESTIONS[index], index, dateKey: getQuestionDateKey(questionDate) };
}

/** Returns the same question for everyone on a given calendar day. */
export function getTodayQuestion(): { question: DailyQuestion; index: number; dateKey: string } {
  return getQuestionForDate(new Date());
}
