export interface DailyQuestion {
  text: string;
  category: string;
  emoji: string;
}

// Append prompts instead of reordering existing entries. Saved answers store
// question_index, so moving older prompts would make member histories confusing.
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
  { text: 'What is a smell that instantly takes you somewhere specific?', category: 'memory lane', emoji: '🌿' },
  { text: 'What is a tradition you would revive, remix, or invent?', category: 'traditions', emoji: '🧺' },
  { text: 'Would you rather be invited into a mystery, a mission, or a makeover?', category: 'adventure style', emoji: '🕵️' },
  { text: 'What is one thing you wish people asked you about more often?', category: 'ask me about', emoji: '💬' },
  { text: 'What is a tiny skill you learned the hard way?', category: 'earned wisdom', emoji: '🧵' },
  { text: 'If your energy had weather today, what is the forecast?', category: 'energy report', emoji: '☀️' },
  { text: 'What is a song lyric that feels weirdly personal?', category: 'soundtrack', emoji: '🎼' },
  { text: 'Would you rather get a hand-written letter, a perfectly timed meme, or a voice note?', category: 'connection style', emoji: '✉️' },
  { text: 'What was your favorite hiding place as a kid?', category: 'kid self', emoji: '🧸' },
  { text: 'What is a decision you are proud you made slowly?', category: 'patience', emoji: '⏳' },
  { text: 'Which kitchen job secretly suits your personality?', category: 'kitchen role', emoji: '🥄' },
  { text: 'What is something small you are trying to protect right now?', category: 'tending', emoji: '🪴' },
  { text: 'If you could borrow anyone’s confidence for a day, whose would it be?', category: 'borrowed courage', emoji: '🦁' },
  { text: 'What is a place in town that feels like yours?', category: 'local map', emoji: '📍' },
  { text: 'Would you rather be surprised by a plan, a gift, or a compliment?', category: 'delight', emoji: '🎁' },
  { text: 'What is your favorite proof that you have changed?', category: 'growth receipts', emoji: '📎' },
  { text: 'What is something you can make better in twenty minutes?', category: 'quick magic', emoji: '⏱️' },
  { text: 'If your closet had a spokesperson, what would they say?', category: 'style clues', emoji: '👗' },
  { text: 'What is a boundary that has made your life kinder?', category: 'kind boundaries', emoji: '🛡️' },
  { text: 'Would you rather be great at remembering names, birthdays, or tiny details?', category: 'attention', emoji: '🔎' },
  { text: 'What is your most reliable bad-day meal?', category: 'comfort food', emoji: '🍲' },
  { text: 'What do you collect, intentionally or accidentally?', category: 'collections', emoji: '🪷' },
  { text: 'What is a problem you secretly love solving?', category: 'problem solving', emoji: '🧠' },
  { text: 'Would you rather have a standing weekly walk, dinner, or co-working date?', category: 'togetherness', emoji: '👯' },
  { text: 'What is a room, shelf, or corner that tells the truth about you?', category: 'home clues', emoji: '🪟' },
  { text: 'What is something you hope never becomes too efficient?', category: 'slow things', emoji: '🐌' },
  { text: 'If your inner critic had to take a day off, what would you do?', category: 'permission', emoji: '🪽' },
  { text: 'What is your favorite kind of nonsense?', category: 'play', emoji: '🎈' },
  { text: 'Would you rather be the person with snacks, tools, directions, or stories?', category: 'group role', emoji: '🧰' },
  { text: 'What is one thing you understand better than you used to?', category: 'hard-won clarity', emoji: '💡' },
  { text: 'What makes you feel immediately at home with someone?', category: 'belonging', emoji: '🏡' },
  { text: 'What is a tiny ceremony you could add to endings?', category: 'closure ritual', emoji: '🕯️' },
  { text: 'Would you rather have a year of brave yeses or brave nos?', category: 'bravery', emoji: '⚡' },
  { text: 'What is a compliment you have been meaning to give someone?', category: 'appreciation', emoji: '🌻' },
  { text: 'What is a thing you are picky about in a way that brings you joy?', category: 'joyfully picky', emoji: '🍒' },
  { text: 'If your calendar had a warning label, what would it say?', category: 'calendar truth', emoji: '📆' },
  { text: 'What is a story from your life that always gets a reaction?', category: 'story bank', emoji: '📚' },
  { text: 'Would you rather receive help before you ask, exactly when you ask, or after you try alone?', category: 'help style', emoji: '🤲' },
  { text: 'What is a window you love looking out of?', category: 'view', emoji: '🪟' },
  { text: 'What is an ordinary object you would miss if it vanished?', category: 'ordinary love', emoji: '🔑' },
  { text: 'What is the first sign that you are getting your spark back?', category: 'spark return', emoji: '🔥' },
  { text: 'Would you rather plan the celebration, document it, host it, or clean up after?', category: 'party role', emoji: '🎉' },
  { text: 'What is something about you that is softer than people expect?', category: 'soft truth', emoji: '🪽' },
  { text: 'What is something about you that is tougher than people expect?', category: 'quiet toughness', emoji: '🪨' },
  { text: 'What is a question you love being asked?', category: 'favorite questions', emoji: '❓' },
  { text: 'If HIVE had a tiny field trip, where should we go?', category: 'field trip', emoji: '🚌' },
  { text: 'What is a little win from this week that deserves applause?', category: 'weekly win', emoji: '🏅' },
  { text: 'What is something you are surprisingly good at noticing?', category: 'noticing', emoji: '👀' },
  { text: 'Would you rather learn by watching, reading, trying, or being coached?', category: 'learning style', emoji: '📖' },
  { text: 'What is one thing you would put on a personal menu?', category: 'personal menu', emoji: '🍽️' },
  { text: 'What is a family phrase, saying, or joke that lives in your head?', category: 'family lore', emoji: '🗣️' },
  { text: 'What is something you do that future you always appreciates?', category: 'future favor', emoji: '🎀' },
  { text: 'Would you rather be excellent at first impressions or lasting impressions?', category: 'presence', emoji: '🌟' },
  { text: 'What is a project that would be more fun with a tiny team?', category: 'tiny team', emoji: '🤝' },
  { text: 'What is your favorite way to make an entrance?', category: 'entrance', emoji: '🚪' },
  { text: 'What is your favorite way to disappear for a while?', category: 'retreat', emoji: '🌙' },
  { text: 'What is a texture, fabric, or material you love touching?', category: 'sensory joy', emoji: '🧶' },
  { text: 'Would you rather have a magic pause button, rewind button, or spotlight button?', category: 'time magic', emoji: '⏯️' },
  { text: 'What is a small promise you are keeping to yourself?', category: 'self-trust', emoji: '🤍' },
  { text: 'What is a way someone can tell you are really listening?', category: 'listening', emoji: '👂' },
  { text: 'What is a way someone can tell you feel safe?', category: 'felt safety', emoji: '🫶' },
  { text: 'What is a generous assumption you wish people made about you?', category: 'being understood', emoji: '🪞' },
  { text: 'Would you rather have a mystery box of ingredients, art supplies, or vintage clothes?', category: 'creative fuel', emoji: '📦' },
  { text: 'What is a thing you like doing the old-fashioned way?', category: 'old fashioned', emoji: '🖋️' },
  { text: 'What is something you are willing to be a beginner at this year?', category: 'beginner energy', emoji: '🌱' },
  { text: 'What is a tiny public service announcement you stand by?', category: 'psa', emoji: '📣' },
  { text: 'Would you rather have more spacious mornings, brighter afternoons, or softer evenings?', category: 'day rhythm', emoji: '🌇' },
  { text: 'What is one thing you hope HIVE helps you remember about yourself?', category: 'hive mirror', emoji: '🍯' },
  { text: 'What is a dream that gets easier when other people know about it?', category: 'shared dreams', emoji: '🌌' },
  { text: 'What is one connection you would love to make inside HIVE?', category: 'connection wish', emoji: '🔗' },
  { text: 'What should we celebrate more often as a community?', category: 'community rhythm', emoji: '🥂' },
  { text: 'What is a tiny dare you would accept this month?', category: 'tiny dare', emoji: '🎯' },
];

const LEGACY_DAILY_QUESTION_COUNT = 48;
const DAILY_QUESTION_EXPANSION_START = new Date(2026, 6, 2); // July 2, 2026

export function getQuestionDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getQuestionIndexForDate(questionDate: Date) {
  const expansionStart = new Date(DAILY_QUESTION_EXPANSION_START);
  expansionStart.setHours(0, 0, 0, 0);

  if (questionDate >= expansionStart) {
    const daysSinceExpansion = Math.floor((questionDate.getTime() - expansionStart.getTime()) / 86_400_000);
    return (LEGACY_DAILY_QUESTION_COUNT + daysSinceExpansion) % DAILY_QUESTIONS.length;
  }

  const epoch = new Date(2025, 0, 1); // Jan 1, 2025
  const daysSince = Math.floor((questionDate.getTime() - epoch.getTime()) / 86_400_000);
  return ((daysSince % LEGACY_DAILY_QUESTION_COUNT) + LEGACY_DAILY_QUESTION_COUNT) % LEGACY_DAILY_QUESTION_COUNT;
}

export function getQuestionForDate(date: Date): { question: DailyQuestion; index: number; dateKey: string } {
  const questionDate = new Date(date);
  questionDate.setHours(0, 0, 0, 0);
  const index = getQuestionIndexForDate(questionDate);
  return { question: DAILY_QUESTIONS[index], index, dateKey: getQuestionDateKey(questionDate) };
}

/** Returns the same question for everyone on a given calendar day. */
export function getTodayQuestion(): { question: DailyQuestion; index: number; dateKey: string } {
  return getQuestionForDate(new Date());
}
