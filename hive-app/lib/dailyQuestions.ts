import type { QuestionTheme } from './questionThemes';
import { TECH_DAILY_QUESTIONS } from './techQuestions';
import { PRODUCTION_DAILY_QUESTIONS } from './productionQuestions';

// Each HIVE's year of questions lives in its own file; this one keeps OG's
// deck (the original), the shared shape, and the picking logic. Re-exported so
// a screen can keep importing every deck from here.
export { TECH_DAILY_QUESTIONS } from './techQuestions';
export { PRODUCTION_DAILY_QUESTIONS } from './productionQuestions';

/**
 * `category` is the label — one per question, useful for showing what was
 * asked. `themes` is what the question is reaching for underneath, drawn from
 * the short shared list in `questionThemes.ts`, so a question in one HIVE's
 * deck and a different question in another can still be found to have been
 * asking the same thing. Both stay: the label and the thing under it.
 */
export interface DailyQuestion {
  text: string;
  category: string;
  emoji: string;
  /** One to three, from `QUESTION_THEMES`. Never empty. */
  themes: QuestionTheme[];
}

// Append prompts instead of reordering existing entries. Saved answers store
// question_index, so moving older prompts would make member histories confusing.
export const DAILY_QUESTIONS: DailyQuestion[] = [
  { text: "You're on a desert island and get one book forever. What is it?", category: 'desert island', emoji: '🏝️', themes: ['comfort', 'identity'] },
  { text: 'Would you rather always know the perfect next step, or always know who to ask for help?', category: 'instincts', emoji: '🧭', themes: ['connection', 'learning'] },
  { text: 'If your week had a theme song, what would be playing?', category: 'current mood', emoji: '🎧', themes: ['identity', 'play'] },
  { text: 'Would you rather host the dinner party or design the playlist?', category: 'social style', emoji: '🍽️', themes: ['community', 'play'] },
  { text: 'What tiny luxury makes you feel instantly richer?', category: 'daily joy', emoji: '✨', themes: ['comfort', 'play'] },
  { text: 'If your personality were a room, what would be in it?', category: 'aesthetic', emoji: '🛋️', themes: ['identity', 'home'] },
  { text: 'Would you rather have a secret garden or a secret library?', category: 'inner world', emoji: '🔮', themes: ['rest', 'learning'] },
  { text: 'What is your most specific comfort movie or comfort show?', category: 'comfort', emoji: '📺', themes: ['comfort', 'rest'] },
  { text: 'If you had to teach a weirdly specific class, what would it be?', category: 'hidden genius', emoji: '🎓', themes: ['learning', 'generosity'] },
  { text: 'Would you rather be famous for your taste, your courage, or your kindness?', category: 'values', emoji: '💫', themes: ['values', 'identity'] },
  { text: 'What is a hill you will lovingly die on?', category: 'strong opinions', emoji: '⛰️', themes: ['values', 'conflict', 'humour'] },
  { text: 'If you could instantly become a beginner again at one thing, what would you choose?', category: 'curiosity', emoji: '🌱', themes: ['learning', 'growth'] },
  { text: 'What snack says the most about who you are?', category: 'snack astrology', emoji: '🍿', themes: ['food', 'identity'] },
  { text: 'Would you rather have one perfect outfit or one perfect workspace?', category: 'priorities', emoji: '🪞', themes: ['identity', 'work'] },
  { text: 'What fictional place do you secretly belong in?', category: 'imagination', emoji: '🗺️', themes: ['identity', 'play'] },
  { text: 'If someone gave you a free Saturday with no guilt, what would you do first?', category: 'rest style', emoji: '🌞', themes: ['rest', 'play'] },
  { text: 'What compliment do you secretly love receiving?', category: 'love language', emoji: '💛', themes: ['connection', 'identity'] },
  { text: 'Would you rather be known as the calm one, the bold one, or the brilliant one?', category: 'identity', emoji: '🌟', themes: ['identity', 'values'] },
  { text: 'What object in your home has the best story?', category: 'home story', emoji: '🏠', themes: ['home', 'memory'] },
  { text: 'What is a small thing that can instantly ruin your vibe?', category: 'boundaries', emoji: '🚦', themes: ['boundaries', 'identity'] },
  { text: 'What is a small thing that can instantly save your vibe?', category: 'reset button', emoji: '🪄', themes: ['comfort', 'rest'] },
  { text: 'Would you rather travel with a detailed itinerary or follow signs and feelings?', category: 'travel style', emoji: '✈️', themes: ['place', 'identity'] },
  { text: 'What is your personal version of a victory lap?', category: 'celebration', emoji: '🏆', themes: ['ritual', 'play'] },
  { text: 'If your phone lock screen could talk, what would it reveal about you?', category: 'personal clues', emoji: '📱', themes: ['identity', 'connection'] },
  { text: 'What is a talent you have that deserves more applause?', category: 'hidden talent', emoji: '👏', themes: ['identity', 'craft'] },
  { text: 'Would you rather be underestimated or overbooked?', category: 'ambition', emoji: '🚀', themes: ['ambition', 'identity'] },
  { text: 'What color feels like your current chapter?', category: 'season of life', emoji: '🎨', themes: ['identity', 'growth'] },
  { text: 'What is something you loved before it was cool?', category: 'taste', emoji: '🕶️', themes: ['identity', 'memory'] },
  { text: 'If your dream project had a launch party, what would be on the invitation?', category: 'vision', emoji: '💌', themes: ['ambition', 'creativity'] },
  { text: 'What is your favorite way to be useful to people?', category: 'community role', emoji: '🤝', themes: ['generosity', 'community'] },
  { text: 'Would you rather solve the puzzle, tell the story, or make the room beautiful?', category: 'creative type', emoji: '🧩', themes: ['creativity', 'craft'] },
  { text: 'What is a rule you follow that most people probably do not notice?', category: 'personal code', emoji: '📜', themes: ['values', 'ritual'] },
  { text: 'What is a book, song, or place that feels like a portal?', category: 'meaning', emoji: '🚪', themes: ['creativity', 'memory'] },
  { text: 'Would you rather have a perfect memory or perfect intuition?', category: 'superpower', emoji: '🧠', themes: ['identity', 'learning'] },
  { text: 'What is something you can talk about for ten minutes with no prep?', category: 'spark', emoji: '🔥', themes: ['learning', 'play'] },
  { text: 'What is your signature move when someone you love needs support?', category: 'care style', emoji: '🫶', themes: ['generosity', 'connection'] },
  { text: 'Would you rather start the thing, finish the thing, or make the thing better?', category: 'work style', emoji: '🛠️', themes: ['work', 'craft'] },
  { text: 'What is the most you thing you have done this month?', category: 'self-portrait', emoji: '🖼️', themes: ['identity', 'play'] },
  { text: 'If your future self left you a sticky note, what would it say?', category: 'future self', emoji: '📝', themes: ['growth', 'identity'] },
  { text: 'What is an oddly specific dream you hope comes true?', category: 'wishcraft', emoji: '🌙', themes: ['ambition', 'play'] },
  { text: 'Would you rather have a magical closet, kitchen, calendar, or bank account?', category: 'desire map', emoji: '🪄', themes: ['ambition', 'home'] },
  { text: 'What is your favorite kind of weather for becoming yourself again?', category: 'atmosphere', emoji: '🌦️', themes: ['rest', 'identity'] },
  { text: 'What is a phrase your friends would use to describe you?', category: 'reflection', emoji: '🪞', themes: ['identity', 'connection'] },
  { text: 'Would you rather be the muse, the maker, the manager, or the magician?', category: 'archetype', emoji: '🎭', themes: ['identity', 'creativity'] },
  { text: 'What is one thing you would put in a tiny museum of your life?', category: 'life museum', emoji: '🏛️', themes: ['memory', 'identity'] },
  { text: 'What is your favorite way to make a regular day feel ceremonial?', category: 'ritual', emoji: '🕯️', themes: ['ritual', 'comfort'] },
  { text: 'Would you rather receive a perfect plan, a perfect pep talk, or a perfect shortcut?', category: 'support style', emoji: '🗝️', themes: ['connection', 'growth'] },
  { text: 'What is something you are quietly becoming?', category: 'becoming', emoji: '🌅', themes: ['growth', 'identity'] },
  { text: 'What is a smell that instantly takes you somewhere specific?', category: 'memory lane', emoji: '🌿', themes: ['memory', 'place'] },
  { text: 'What is a tradition you would revive, remix, or invent?', category: 'traditions', emoji: '🧺', themes: ['ritual', 'community'] },
  { text: 'Would you rather be invited into a mystery, a mission, or a makeover?', category: 'adventure style', emoji: '🕵️', themes: ['play', 'courage'] },
  { text: 'What is one thing you wish people asked you about more often?', category: 'ask me about', emoji: '💬', themes: ['identity', 'connection'] },
  { text: 'What is a tiny skill you learned the hard way?', category: 'earned wisdom', emoji: '🧵', themes: ['learning', 'growth'] },
  { text: 'If your energy had weather today, what is the forecast?', category: 'energy report', emoji: '☀️', themes: ['rest', 'identity'] },
  { text: 'What is a song lyric that feels weirdly personal?', category: 'soundtrack', emoji: '🎼', themes: ['identity', 'memory'] },
  { text: 'Would you rather get a hand-written letter, a perfectly timed meme, or a voice note?', category: 'connection style', emoji: '✉️', themes: ['connection', 'humour'] },
  { text: 'What was your favorite hiding place as a kid?', category: 'kid self', emoji: '🧸', themes: ['memory', 'home'] },
  { text: 'What is a decision you are proud you made slowly?', category: 'patience', emoji: '⏳', themes: ['growth', 'values'] },
  { text: 'Which kitchen job secretly suits your personality?', category: 'kitchen role', emoji: '🥄', themes: ['food', 'identity'] },
  { text: 'What is something small you are trying to protect right now?', category: 'tending', emoji: '🪴', themes: ['boundaries', 'values'] },
  { text: 'If you could borrow anyone’s confidence for a day, whose would it be?', category: 'borrowed courage', emoji: '🦁', themes: ['courage', 'identity'] },
  { text: 'What is a place in town that feels like yours?', category: 'local map', emoji: '📍', themes: ['place', 'home'] },
  { text: 'Would you rather be surprised by a plan, a gift, or a compliment?', category: 'delight', emoji: '🎁', themes: ['connection', 'play'] },
  { text: 'What is your favorite proof that you have changed?', category: 'growth receipts', emoji: '📎', themes: ['growth', 'memory'] },
  { text: 'What is something you can make better in twenty minutes?', category: 'quick magic', emoji: '⏱️', themes: ['craft', 'home'] },
  { text: 'If your closet had a spokesperson, what would they say?', category: 'style clues', emoji: '👗', themes: ['identity', 'humour'] },
  { text: 'What is a boundary that has made your life kinder?', category: 'kind boundaries', emoji: '🛡️', themes: ['boundaries', 'values'] },
  { text: 'Would you rather be great at remembering names, birthdays, or tiny details?', category: 'attention', emoji: '🔎', themes: ['connection', 'generosity'] },
  { text: 'What is your most reliable bad-day meal?', category: 'comfort food', emoji: '🍲', themes: ['comfort', 'food'] },
  { text: 'What do you collect, intentionally or accidentally?', category: 'collections', emoji: '🪷', themes: ['identity', 'home'] },
  { text: 'What is a problem you secretly love solving?', category: 'problem solving', emoji: '🧠', themes: ['craft', 'play'] },
  { text: 'Would you rather have a standing weekly walk, dinner, or co-working date?', category: 'togetherness', emoji: '👯', themes: ['connection', 'ritual'] },
  { text: 'What is a room, shelf, or corner that tells the truth about you?', category: 'home clues', emoji: '🪟', themes: ['home', 'identity'] },
  { text: 'What is something you hope never becomes too efficient?', category: 'slow things', emoji: '🐌', themes: ['values', 'rest'] },
  { text: 'If your inner critic had to take a day off, what would you do?', category: 'permission', emoji: '🪽', themes: ['play', 'rest'] },
  { text: 'What is your favorite kind of nonsense?', category: 'play', emoji: '🎈', themes: ['play', 'humour'] },
  { text: 'Would you rather be the person with snacks, tools, directions, or stories?', category: 'group role', emoji: '🧰', themes: ['community', 'generosity'] },
  { text: 'What is one thing you understand better than you used to?', category: 'hard-won clarity', emoji: '💡', themes: ['learning', 'growth'] },
  { text: 'What makes you feel immediately at home with someone?', category: 'belonging', emoji: '🏡', themes: ['connection', 'comfort'] },
  { text: 'What is a tiny ceremony you could add to endings?', category: 'closure ritual', emoji: '🕯️', themes: ['ritual', 'growth'] },
  { text: 'Would you rather have a year of brave yeses or brave nos?', category: 'bravery', emoji: '⚡', themes: ['courage', 'boundaries'] },
  { text: 'What is a compliment you have been meaning to give someone?', category: 'appreciation', emoji: '🌻', themes: ['generosity', 'connection'] },
  { text: 'What is a thing you are picky about in a way that brings you joy?', category: 'joyfully picky', emoji: '🍒', themes: ['identity', 'play'] },
  { text: 'If your calendar had a warning label, what would it say?', category: 'calendar truth', emoji: '📆', themes: ['work', 'humour'] },
  { text: 'What is a story from your life that always gets a reaction?', category: 'story bank', emoji: '📚', themes: ['memory', 'humour'] },
  { text: 'Would you rather receive help before you ask, exactly when you ask, or after you try alone?', category: 'help style', emoji: '🤲', themes: ['connection', 'generosity'] },
  { text: 'What is a window you love looking out of?', category: 'view', emoji: '🪟', themes: ['place', 'rest'] },
  { text: 'What is an ordinary object you would miss if it vanished?', category: 'ordinary love', emoji: '🔑', themes: ['home', 'comfort'] },
  { text: 'What is the first sign that you are getting your spark back?', category: 'spark return', emoji: '🔥', themes: ['rest', 'growth'] },
  { text: 'Would you rather plan the celebration, document it, host it, or clean up after?', category: 'party role', emoji: '🎉', themes: ['community', 'play'] },
  { text: 'What is something about you that is softer than people expect?', category: 'soft truth', emoji: '🪽', themes: ['identity', 'connection'] },
  { text: 'What is something about you that is tougher than people expect?', category: 'quiet toughness', emoji: '🪨', themes: ['identity', 'courage'] },
  { text: 'What is a question you love being asked?', category: 'favorite questions', emoji: '❓', themes: ['connection', 'identity'] },
  { text: 'If HIVE had a tiny field trip, where should we go?', category: 'field trip', emoji: '🚌', themes: ['community', 'place'] },
  { text: 'What is a little win from this week that deserves applause?', category: 'weekly win', emoji: '🏅', themes: ['growth', 'work'] },
  { text: 'What is something you are surprisingly good at noticing?', category: 'noticing', emoji: '👀', themes: ['identity', 'craft'] },
  { text: 'Would you rather learn by watching, reading, trying, or being coached?', category: 'learning style', emoji: '📖', themes: ['learning', 'growth'] },
  { text: 'What is one thing you would put on a personal menu?', category: 'personal menu', emoji: '🍽️', themes: ['food', 'identity'] },
  { text: 'What is a family phrase, saying, or joke that lives in your head?', category: 'family lore', emoji: '🗣️', themes: ['family', 'humour'] },
  { text: 'What is something you do that future you always appreciates?', category: 'future favor', emoji: '🎀', themes: ['ritual', 'growth'] },
  { text: 'Would you rather be excellent at first impressions or lasting impressions?', category: 'presence', emoji: '🌟', themes: ['connection', 'identity'] },
  { text: 'What is a project that would be more fun with a tiny team?', category: 'tiny team', emoji: '🤝', themes: ['community', 'work'] },
  { text: 'What is your favorite way to make an entrance?', category: 'entrance', emoji: '🚪', themes: ['identity', 'play'] },
  { text: 'What is your favorite way to disappear for a while?', category: 'retreat', emoji: '🌙', themes: ['rest', 'boundaries'] },
  { text: 'What is a texture, fabric, or material you love touching?', category: 'sensory joy', emoji: '🧶', themes: ['comfort', 'craft'] },
  { text: 'Would you rather have a magic pause button, rewind button, or spotlight button?', category: 'time magic', emoji: '⏯️', themes: ['play', 'rest'] },
  { text: 'What is a small promise you are keeping to yourself?', category: 'self-trust', emoji: '🤍', themes: ['values', 'growth'] },
  { text: 'What is a way someone can tell you are really listening?', category: 'listening', emoji: '👂', themes: ['connection', 'generosity'] },
  { text: 'What is a way someone can tell you feel safe?', category: 'felt safety', emoji: '🫶', themes: ['connection', 'comfort'] },
  { text: 'What is a generous assumption you wish people made about you?', category: 'being understood', emoji: '🪞', themes: ['identity', 'connection'] },
  { text: 'Would you rather have a mystery box of ingredients, art supplies, or vintage clothes?', category: 'creative fuel', emoji: '📦', themes: ['creativity', 'play'] },
  { text: 'What is a thing you like doing the old-fashioned way?', category: 'old fashioned', emoji: '🖋️', themes: ['ritual', 'craft'] },
  { text: 'What is something you are willing to be a beginner at this year?', category: 'beginner energy', emoji: '🌱', themes: ['learning', 'courage'] },
  { text: 'What is a tiny public service announcement you stand by?', category: 'psa', emoji: '📣', themes: ['values', 'humour'] },
  { text: 'Would you rather have more spacious mornings, brighter afternoons, or softer evenings?', category: 'day rhythm', emoji: '🌇', themes: ['rest', 'ritual'] },
  { text: 'What is one thing you hope HIVE helps you remember about yourself?', category: 'hive mirror', emoji: '🍯', themes: ['identity', 'community'] },
  { text: 'What is a dream that gets easier when other people know about it?', category: 'shared dreams', emoji: '🌌', themes: ['ambition', 'community'] },
  { text: 'What is one connection you would love to make inside HIVE?', category: 'connection wish', emoji: '🔗', themes: ['connection', 'community'] },
  { text: 'What should we celebrate more often as a community?', category: 'community rhythm', emoji: '🥂', themes: ['community', 'ritual'] },
  { text: 'What is a tiny dare you would accept this month?', category: 'tiny dare', emoji: '🎯', themes: ['courage', 'play'] },
  { text: 'If a photo from this month became a postcard, what would be on it?', category: 'postcard moment', emoji: '🖼️', themes: ['memory', 'play'] },
  { text: 'What is a tiny ordinary moment you wish you could replay?', category: 'ordinary magic', emoji: '🔁', themes: ['memory', 'comfort'] },
  { text: 'What is the most beautiful thing you saw by accident?', category: 'accidental beauty', emoji: '👀', themes: ['memory', 'place'] },
  { text: 'What is a place that made you feel bigger than your problems?', category: 'perspective', emoji: '🌄', themes: ['place', 'rest'] },
  { text: 'What is a place that made you feel gently held?', category: 'held places', emoji: '🏡', themes: ['place', 'comfort'] },
  { text: 'What is a sound you would bottle if you could?', category: 'sound memory', emoji: '🎙️', themes: ['memory', 'comfort'] },
  { text: 'What is a meal that tastes like a chapter of your life?', category: 'food memory', emoji: '🍛', themes: ['food', 'memory'] },
  { text: 'What is a book title that could describe your current era?', category: 'chapter title', emoji: '📘', themes: ['identity', 'growth'] },
  { text: 'What is a tiny object you would rescue first in a move?', category: 'keepsakes', emoji: '📦', themes: ['home', 'memory'] },
  { text: 'Would you rather inherit a recipe, a map, or a stack of letters?', category: 'inheritance', emoji: '🗺️', themes: ['family', 'memory'] },
  { text: 'What is a habit you picked up from someone you love?', category: 'borrowed habits', emoji: '🤍', themes: ['family', 'ritual'] },
  { text: 'What is a scent that belongs to a person in your life?', category: 'scent memory', emoji: '🌸', themes: ['memory', 'connection'] },
  { text: 'What is a family tradition you secretly want to upgrade?', category: 'family remix', emoji: '🧺', themes: ['family', 'ritual'] },
  { text: 'What is the first room you remember loving?', category: 'first rooms', emoji: '🚪', themes: ['home', 'memory'] },
  { text: 'What is a piece of advice that landed years later?', category: 'late wisdom', emoji: '🕰️', themes: ['learning', 'memory'] },
  { text: 'What is something you learned from a difficult season?', category: 'season lessons', emoji: '🌧️', themes: ['growth', 'learning'] },
  { text: 'What is a toy, game, or activity you miss more than expected?', category: 'play memory', emoji: '🧩', themes: ['play', 'memory'] },
  { text: 'What is a trip you still think about in small flashes?', category: 'travel memory', emoji: '🧳', themes: ['place', 'memory'] },
  { text: 'What is a local place that deserves more love?', category: 'local love', emoji: '📍', themes: ['place', 'community'] },
  { text: 'If your life had a recurring location, where would it be?', category: 'recurring place', emoji: '📌', themes: ['place', 'ritual'] },
  { text: 'What is a time of day that brings out your best self?', category: 'best hour', emoji: '⏰', themes: ['ritual', 'rest'] },
  { text: 'What is something you would put in a time capsule from this week?', category: 'time capsule', emoji: '🗃️', themes: ['memory', 'ritual'] },
  { text: 'What is a snack from childhood that still has power over you?', category: 'childhood snack', emoji: '🍪', themes: ['food', 'memory'] },
  { text: 'What is a smell that means a holiday to you?', category: 'holiday memory', emoji: '🎄', themes: ['memory', 'family'] },
  { text: 'What is a tiny purchase that improved your life?', category: 'small upgrade', emoji: '🛍️', themes: ['comfort', 'home'] },
  { text: 'Would you rather have your childhood bedroom, first apartment, or dream kitchen recreated for one day?', category: 'rooms of you', emoji: '🛏️', themes: ['home', 'memory'] },
  { text: 'What is something you would show a visitor first?', category: 'tour guide', emoji: '🧭', themes: ['place', 'home'] },
  { text: 'What is a place where you think unusually clearly?', category: 'clear thinking', emoji: '💭', themes: ['place', 'rest'] },
  { text: 'What is a song that turns the room into a memory?', category: 'music memory', emoji: '🎵', themes: ['memory', 'comfort'] },
  { text: 'What is a moment you felt quietly proud and told almost no one?', category: 'quiet pride', emoji: '🏅', themes: ['growth', 'memory'] },
  { text: 'What is a tiny detail you remember from an important day?', category: 'detail memory', emoji: '🔎', themes: ['memory', 'ritual'] },
  { text: 'What is a piece of clothing with a story?', category: 'wardrobe story', emoji: '👚', themes: ['memory', 'identity'] },
  { text: 'What is a weather pattern that changes your personality?', category: 'weather self', emoji: '🌦️', themes: ['identity', 'rest'] },
  { text: 'What is an object you associate with comfort?', category: 'comfort object', emoji: '🧣', themes: ['comfort', 'home'] },
  { text: 'What is a photograph you wish existed?', category: 'missing photo', emoji: '📷', themes: ['memory', 'family'] },
  { text: 'What is a conversation you replay for good reasons?', category: 'good replay', emoji: '💬', themes: ['connection', 'memory'] },
  { text: 'What is an errand you secretly enjoy?', category: 'errand joy', emoji: '🧾', themes: ['ritual', 'play'] },
  { text: 'What is a holiday you would design from scratch?', category: 'made-up holiday', emoji: '🎊', themes: ['ritual', 'play'] },
  { text: 'What is a way your home announces who you are?', category: 'home tells', emoji: '🏠', themes: ['home', 'identity'] },
  { text: 'Would you rather revisit a perfect day or redo a hard one with what you know now?', category: 'time choice', emoji: '⏳', themes: ['memory', 'growth'] },
  { text: 'What is an old favorite you are ready to return to?', category: 'old favorites', emoji: '💿', themes: ['comfort', 'memory'] },
  { text: 'What is a new favorite that surprised you?', category: 'new favorites', emoji: '✨', themes: ['play', 'learning'] },
  { text: 'What is a sound you associate with safety?', category: 'safe sounds', emoji: '🔔', themes: ['comfort', 'memory'] },
  { text: 'What is a view you can see in your mind right now?', category: 'mind view', emoji: '🪟', themes: ['place', 'memory'] },
  { text: 'What is a tiny landmark in your personal map?', category: 'personal landmark', emoji: '🗺️', themes: ['place', 'memory'] },
  { text: 'What is a family story you want preserved?', category: 'family archive', emoji: '📚', themes: ['family', 'memory'] },
  { text: 'What is something you hope people remember about this era of you?', category: 'remember me', emoji: '📝', themes: ['identity', 'growth'] },
  { text: 'What is one detail from today worth keeping?', category: 'today detail', emoji: '📎', themes: ['memory', 'ritual'] },
  { text: 'What is a place that feels like an exhale?', category: 'exhale places', emoji: '🌬️', themes: ['place', 'rest'] },
  { text: 'What is a small gesture that makes you feel included?', category: 'inclusion', emoji: '🤝', themes: ['community', 'connection'] },
  { text: 'What is your favorite way to welcome someone new?', category: 'welcome style', emoji: '👋', themes: ['community', 'generosity'] },
  { text: 'What is a question that opens people up without cornering them?', category: 'good questions', emoji: '❔', themes: ['connection', 'craft'] },
  { text: 'Would you rather deepen one friendship or reconnect with three people?', category: 'friendship focus', emoji: '🫶', themes: ['connection', 'community'] },
  { text: 'What is something a friend once noticed that made you feel seen?', category: 'seen by friends', emoji: '👁️', themes: ['connection', 'identity'] },
  { text: 'What kind of invitation is easiest for you to say yes to?', category: 'easy yes', emoji: '💌', themes: ['connection', 'community'] },
  { text: 'What kind of invitation do you wish you received more often?', category: 'wish invites', emoji: '📨', themes: ['community', 'connection'] },
  { text: 'What is a group activity that never feels forced to you?', category: 'easy together', emoji: '🎲', themes: ['community', 'play'] },
  { text: 'What is a small tradition HIVE could try once?', category: 'hive tradition', emoji: '🍯', themes: ['community', 'ritual'] },
  { text: 'What is something you would happily teach the group?', category: 'teach us', emoji: '🎓', themes: ['generosity', 'learning'] },
  { text: 'What is something you would love someone in HIVE to teach you?', category: 'learn together', emoji: '📖', themes: ['learning', 'community'] },
  { text: 'What is a conversation topic you never get tired of?', category: 'conversation fuel', emoji: '🔥', themes: ['connection', 'learning'] },
  { text: 'What is your favorite way to celebrate someone else?', category: 'celebrating others', emoji: '🥳', themes: ['generosity', 'play'] },
  { text: 'What is one way people can make plans easier for you?', category: 'planning support', emoji: '📅', themes: ['boundaries', 'community'] },
  { text: 'What is a signal that someone really gets your humor?', category: 'humor match', emoji: '😄', themes: ['humour', 'connection'] },
  { text: 'What is a kind of help you are learning to accept?', category: 'receiving help', emoji: '🤲', themes: ['connection', 'growth'] },
  { text: 'What is a kind of help you are great at giving?', category: 'giving help', emoji: '🧰', themes: ['generosity', 'craft'] },
  { text: 'What makes a gathering feel alive to you?', category: 'alive gatherings', emoji: '✨', themes: ['community', 'play'] },
  { text: 'What makes a gathering feel restful to you?', category: 'restful gatherings', emoji: '🕯️', themes: ['community', 'rest'] },
  { text: 'What is a role you naturally play in a group?', category: 'natural role', emoji: '🧭', themes: ['community', 'identity'] },
  { text: 'What is a role you would like to practice more?', category: 'growth role', emoji: '🌱', themes: ['community', 'growth'] },
  { text: 'Would you rather have a buddy for errands, goals, creativity, or rest?', category: 'buddy system', emoji: '👯', themes: ['connection', 'community'] },
  { text: 'What is a tiny accountability structure that would actually help you?', category: 'accountability', emoji: '✅', themes: ['growth', 'community'] },
  { text: 'What is something you want more people to know how to ask you for?', category: 'ask me for', emoji: '🙋', themes: ['generosity', 'connection'] },
  { text: 'What is something you want to know about the person next to you at dinner?', category: 'dinner questions', emoji: '🍽️', themes: ['connection', 'community'] },
  { text: 'What is a good reason to make a spontaneous group chat?', category: 'group chat', emoji: '💬', themes: ['community', 'play'] },
  { text: 'What is your favorite low-pressure way to spend time with people?', category: 'low pressure', emoji: '🌿', themes: ['connection', 'rest'] },
  { text: 'What is a high-pressure social thing you have outgrown?', category: 'outgrown pressure', emoji: '🎈', themes: ['boundaries', 'growth'] },
  { text: 'What is a compliment that feels more meaningful than impressive?', category: 'meaningful praise', emoji: '🌟', themes: ['connection', 'values'] },
  { text: 'What is a friendship green flag you trust?', category: 'green flags', emoji: '💚', themes: ['connection', 'values'] },
  { text: 'What is one way you show loyalty quietly?', category: 'quiet loyalty', emoji: '🧡', themes: ['connection', 'values'] },
  { text: 'What is a way someone can repair a missed connection with you?', category: 'repair', emoji: '🪡', themes: ['conflict', 'connection'] },
  { text: 'What is a tiny community ritual that would make HIVE feel warmer?', category: 'warm rituals', emoji: '🔥', themes: ['community', 'ritual'] },
  { text: 'What is something that makes introductions less awkward?', category: 'introductions', emoji: '🤗', themes: ['community', 'connection'] },
  { text: 'What is your favorite way to be checked on?', category: 'check-ins', emoji: '📬', themes: ['connection', 'comfort'] },
  { text: 'What is a topic you wish came up more in real life?', category: 'real talk', emoji: '🗣️', themes: ['connection', 'values'] },
  { text: 'What is a social rule you think should be retired?', category: 'retire the rule', emoji: '🗑️', themes: ['values', 'boundaries'] },
  { text: 'What is a social rule you think is secretly beautiful?', category: 'beautiful rules', emoji: '🌷', themes: ['values', 'ritual'] },
  { text: 'What is a shared project that could bring people together?', category: 'shared project', emoji: '🛠️', themes: ['community', 'work'] },
  { text: 'What is a tiny act of hospitality you admire?', category: 'hospitality', emoji: '☕', themes: ['generosity', 'home'] },
  { text: 'What is a sign that a group has room for everyone?', category: 'room for everyone', emoji: '🪑', themes: ['community', 'values'] },
  { text: 'Would you rather start a dinner club, walking club, book club, or craft night?', category: 'club ideas', emoji: '📚', themes: ['community', 'play'] },
  { text: 'What is something you would like HIVE to normalize?', category: 'normalize this', emoji: '📣', themes: ['community', 'values'] },
  { text: 'What is a connection you want to make before the end of the season?', category: 'season connection', emoji: '🔗', themes: ['connection', 'community'] },
  { text: 'What is a way someone helped you feel brave?', category: 'borrowed bravery', emoji: '⚡', themes: ['courage', 'connection'] },
  { text: 'What is a story you would tell at a campfire?', category: 'story night', emoji: '🔥', themes: ['memory', 'community'] },
  { text: 'What is a group tradition from another season of life you miss?', category: 'missed tradition', emoji: '🧡', themes: ['community', 'memory'] },
  { text: 'What is one thing you can offer without overextending?', category: 'sustainable offer', emoji: '🤍', themes: ['generosity', 'boundaries'] },
  { text: 'What is one thing you would love to receive without earning it?', category: 'easy receiving', emoji: '🎁', themes: ['generosity', 'comfort'] },
  { text: 'What is a project that wants a name before it wants a plan?', category: 'name the project', emoji: '🏷️', themes: ['creativity', 'work'] },
  { text: 'What is a dream you keep making smaller for practicality?', category: 'big dream', emoji: '🌌', themes: ['ambition', 'courage'] },
  { text: 'What is a practical step that would make a dream less theoretical?', category: 'next step', emoji: '👟', themes: ['ambition', 'work'] },
  { text: 'What is an unfinished idea that still has a pulse?', category: 'unfinished idea', emoji: '💓', themes: ['creativity', 'ambition'] },
  { text: 'What is a wish that belongs to your creative self?', category: 'creative wish', emoji: '🎨', themes: ['creativity', 'ambition'] },
  { text: 'What is a wish that belongs to your tired self?', category: 'tired wish', emoji: '🛌', themes: ['rest', 'comfort'] },
  { text: 'What is a wish that belongs to your future self?', category: 'future wish', emoji: '🔮', themes: ['ambition', 'growth'] },
  { text: 'What is a tiny experiment you could run this week?', category: 'tiny experiment', emoji: '🧪', themes: ['learning', 'work'] },
  { text: 'Would you rather receive a collaborator, a deadline, or a bigger room?', category: 'project support', emoji: '🤝', themes: ['work', 'community'] },
  { text: 'What is a goal you would pursue if it could be playful?', category: 'playful goals', emoji: '🎈', themes: ['play', 'ambition'] },
  { text: 'What is something you want to become known for making?', category: 'maker identity', emoji: '🛠️', themes: ['craft', 'identity'] },
  { text: 'What is something you want to become known for caring about?', category: 'care identity', emoji: '💛', themes: ['values', 'identity'] },
  { text: 'What is a fear that shrinks when you say it plainly?', category: 'named fears', emoji: '🗣️', themes: ['courage', 'growth'] },
  { text: 'What is a resource you need more than advice right now?', category: 'real resources', emoji: '🧰', themes: ['work', 'community'] },
  { text: 'What is one thing standing between you and momentum?', category: 'momentum', emoji: '🚲', themes: ['work', 'growth'] },
  { text: 'What is a brave ask you are almost ready to make?', category: 'brave ask', emoji: '🙋', themes: ['courage', 'ambition'] },
  { text: 'What is a no that would make room for a better yes?', category: 'better yes', emoji: '🚦', themes: ['boundaries', 'growth'] },
  { text: 'What is a yes that would stretch you in a good way?', category: 'good stretch', emoji: '🌱', themes: ['courage', 'growth'] },
  { text: 'What is a tiny proof that your plan is working?', category: 'proof of life', emoji: '📈', themes: ['work', 'growth'] },
  { text: 'What is a dream that needs a witness?', category: 'witnessed dreams', emoji: '👀', themes: ['ambition', 'connection'] },
  { text: 'What is a system that would make your life feel lighter?', category: 'lighter systems', emoji: '🗂️', themes: ['work', 'rest'] },
  { text: 'What is a recurring task you wish felt more ceremonial?', category: 'task ritual', emoji: '🕯️', themes: ['ritual', 'work'] },
  { text: 'What is a responsibility you want to redesign?', category: 'redesign life', emoji: '📐', themes: ['work', 'boundaries'] },
  { text: 'What is a piece of your work that deserves a better stage?', category: 'better stage', emoji: '🎤', themes: ['craft', 'ambition'] },
  { text: 'What is a possibility you are letting yourself consider?', category: 'possibility', emoji: '🌠', themes: ['ambition', 'growth'] },
  { text: 'What is something you want to finish before you perfect it?', category: 'finish first', emoji: '🏁', themes: ['craft', 'courage'] },
  { text: 'What is something you want to practice in public?', category: 'public practice', emoji: '🎭', themes: ['courage', 'learning'] },
  { text: 'What is a secret ambition you could make one percent less secret?', category: 'secret ambition', emoji: '🤫', themes: ['ambition', 'courage'] },
  { text: 'What is a question your future project keeps asking you?', category: 'project questions', emoji: '❓', themes: ['creativity', 'work'] },
  { text: 'Would you rather have a grant, a mentor, a studio, or a sabbatical?', category: 'dream support', emoji: '🗝️', themes: ['ambition', 'work'] },
  { text: 'What is a tiny business idea that makes you smile?', category: 'tiny business', emoji: '💡', themes: ['ambition', 'play'] },
  { text: 'What is a thing you would build if the first version could be messy?', category: 'messy first', emoji: '🧱', themes: ['creativity', 'courage'] },
  { text: 'What is a project that would benefit from HIVE energy?', category: 'hive fuel', emoji: '🍯', themes: ['community', 'work'] },
  { text: 'What is a decision you are ready to stop postponing?', category: 'decision time', emoji: '⏰', themes: ['courage', 'growth'] },
  { text: 'What is a personal milestone worth naming?', category: 'milestones', emoji: '🏆', themes: ['growth', 'ritual'] },
  { text: 'What is a habit that would support the person you are becoming?', category: 'support habit', emoji: '🌿', themes: ['growth', 'ritual'] },
  { text: 'What is a dream you trust more now than you used to?', category: 'trusted dream', emoji: '🌙', themes: ['ambition', 'growth'] },
  { text: 'What is an area where you want more ease, not more discipline?', category: 'ease over force', emoji: '🫧', themes: ['rest', 'growth'] },
  { text: 'What is a goal that needs joy added back in?', category: 'joyful goals', emoji: '🎉', themes: ['play', 'ambition'] },
  { text: 'What is something you can delegate, trade, or ask for help with?', category: 'share the load', emoji: '⚖️', themes: ['work', 'community'] },
  { text: 'What is a lesson you want to stop relearning?', category: 'lesson learned', emoji: '📌', themes: ['learning', 'growth'] },
  { text: 'What is a title you would love to grow into?', category: 'future title', emoji: '👑', themes: ['ambition', 'identity'] },
  { text: 'What is a tiny promise you can keep by Friday?', category: 'friday promise', emoji: '📝', themes: ['work', 'growth'] },
  { text: 'What is a meaningful thing you could do badly at first?', category: 'begin badly', emoji: '🌱', themes: ['courage', 'learning'] },
  { text: 'What is a version of success that feels like relief?', category: 'relief success', emoji: '😮‍💨', themes: ['rest', 'ambition'] },
  { text: 'What is a version of success that feels like aliveness?', category: 'alive success', emoji: '⚡', themes: ['ambition', 'identity'] },
  { text: 'What is something you are ready to make official?', category: 'make it official', emoji: '📣', themes: ['courage', 'ambition'] },
  { text: 'What is a wish you want HIVE to remember with you?', category: 'remembered wish', emoji: '🍯', themes: ['community', 'ambition'] },
  { text: 'What is a stretch goal that would still be worth attempting?', category: 'stretch goal', emoji: '🎯', themes: ['ambition', 'courage'] },
  { text: 'What is a value you learned by watching someone else live it?', category: 'learned values', emoji: '👁️', themes: ['values', 'learning'] },
  { text: 'What is a value you protect even when it is inconvenient?', category: 'protected values', emoji: '🛡️', themes: ['values', 'boundaries'] },
  { text: 'What is a part of your personality that has aged well?', category: 'aged well', emoji: '🍷', themes: ['identity', 'growth'] },
  { text: 'What is a part of yourself you are learning to stop apologizing for?', category: 'no apologies', emoji: '🌟', themes: ['identity', 'courage'] },
  { text: 'What is a contradiction in you that actually makes sense?', category: 'true contradictions', emoji: '🌓', themes: ['identity', 'values'] },
  { text: 'What is a label you have outgrown?', category: 'outgrown labels', emoji: '🏷️', themes: ['identity', 'growth'] },
  { text: 'What is a label you are trying on?', category: 'trying on', emoji: '🧥', themes: ['identity', 'learning'] },
  { text: 'What is something people misunderstand about your quiet side?', category: 'quiet side', emoji: '🤫', themes: ['identity', 'rest'] },
  { text: 'What is something people misunderstand about your loud side?', category: 'loud side', emoji: '📣', themes: ['identity', 'connection'] },
  { text: 'What is a personal rule that keeps you sane?', category: 'sanity rules', emoji: '📜', themes: ['boundaries', 'ritual'] },
  { text: 'What is a personal rule you are ready to soften?', category: 'soften the rule', emoji: '🫧', themes: ['boundaries', 'growth'] },
  { text: 'What is a strength you used to dismiss as normal?', category: 'hidden strength', emoji: '💪', themes: ['identity', 'craft'] },
  { text: 'What is a weakness that has taught you compassion?', category: 'compassion lesson', emoji: '💛', themes: ['growth', 'values'] },
  { text: 'What is a standard you are proud to have?', category: 'good standards', emoji: '📏', themes: ['craft', 'values'] },
  { text: 'What is a standard you are ready to release?', category: 'released standards', emoji: '🕊️', themes: ['craft', 'growth'] },
  { text: 'What is a truth you wish came with less explanation?', category: 'plain truth', emoji: '💬', themes: ['identity', 'values'] },
  { text: 'What is a part of you that feels especially alive lately?', category: 'alive lately', emoji: '🔥', themes: ['identity', 'growth'] },
  { text: 'What is a part of you that needs more attention?', category: 'needs attention', emoji: '🔦', themes: ['identity', 'rest'] },
  { text: 'What makes you feel like yourself again after drifting?', category: 'back to self', emoji: '🧭', themes: ['identity', 'comfort'] },
  { text: 'What is something you are no longer available for?', category: 'no longer', emoji: '🚫', themes: ['boundaries', 'growth'] },
  { text: 'What is something you are newly available for?', category: 'newly yes', emoji: '✅', themes: ['growth', 'courage'] },
  { text: 'What is a promise your younger self would be relieved to see you keeping?', category: 'younger self', emoji: '🧒', themes: ['growth', 'memory'] },
  { text: 'What is a promise your older self would ask you to make?', category: 'older self', emoji: '📝', themes: ['growth', 'values'] },
  { text: 'Would you rather be understood for your taste, your heart, your discipline, or your imagination?', category: 'understood for', emoji: '🪞', themes: ['identity', 'values'] },
  { text: 'What is a trait you admire because you had to earn it?', category: 'earned traits', emoji: '🏅', themes: ['growth', 'identity'] },
  { text: 'What is a trait you admire because it still challenges you?', category: 'admired traits', emoji: '⛰️', themes: ['growth', 'values'] },
  { text: 'What is a belief you inherited and chose to keep?', category: 'kept beliefs', emoji: '🧬', themes: ['family', 'values'] },
  { text: 'What is a belief you inherited and chose to edit?', category: 'edited beliefs', emoji: '✏️', themes: ['family', 'values', 'growth'] },
  { text: 'What is a tiny rebellion that improved your life?', category: 'tiny rebellion', emoji: '⚡', themes: ['boundaries', 'courage'] },
  { text: 'What is a boring choice that protects your peace?', category: 'peace choice', emoji: '🧘', themes: ['boundaries', 'rest'] },
  { text: 'What is something you want to be gentler about?', category: 'more gentle', emoji: '🌸', themes: ['growth', 'comfort'] },
  { text: 'What is something you want to be bolder about?', category: 'more bold', emoji: '🚀', themes: ['courage', 'growth'] },
  { text: 'What is a part of your story that deserves more tenderness?', category: 'tender story', emoji: '🤍', themes: ['memory', 'comfort'] },
  { text: 'What is a chapter title for the last few months?', category: 'past chapter', emoji: '📖', themes: ['memory', 'growth'] },
  { text: 'What is a chapter title for the next few months?', category: 'next chapter', emoji: '📘', themes: ['ambition', 'growth'] },
  { text: 'What is a word you want more of in your life?', category: 'more of', emoji: '➕', themes: ['values', 'growth'] },
  { text: 'What is a word you want less of in your life?', category: 'less of', emoji: '➖', themes: ['boundaries', 'values'] },
  { text: 'What is something you do differently when you feel respected?', category: 'respect response', emoji: '🤝', themes: ['connection', 'identity'] },
  { text: 'What is something you do differently when you feel underestimated?', category: 'underestimated', emoji: '🔥', themes: ['identity', 'courage'] },
  { text: 'What kind of challenge brings out your best self?', category: 'best challenge', emoji: '🏔️', themes: ['growth', 'courage'] },
  { text: 'What kind of challenge shuts you down faster than expected?', category: 'hard challenge', emoji: '🛑', themes: ['boundaries', 'identity'] },
  { text: 'What is a compliment your past self would not have believed?', category: 'past self praise', emoji: '🌟', themes: ['growth', 'memory'] },
  { text: 'What is a decision that taught you who you are?', category: 'identity decision', emoji: '🧭', themes: ['identity', 'growth'] },
  { text: 'What is a tension you are learning to live with gracefully?', category: 'graceful tension', emoji: '⚖️', themes: ['conflict', 'identity'] },
  { text: 'What is a boundary that protects your joy?', category: 'joy boundary', emoji: '🛡️', themes: ['boundaries', 'play'] },
  { text: 'What is a softness you are proud to keep?', category: 'proud softness', emoji: '🪽', themes: ['identity', 'values'] },
  { text: 'What is a sharpness you are learning to use wisely?', category: 'wise edge', emoji: '✂️', themes: ['identity', 'conflict'] },
  { text: 'What is something you want to be known for in a room?', category: 'room presence', emoji: '🚪', themes: ['identity', 'connection'] },
  { text: 'What is something you want to be known for over time?', category: 'lasting presence', emoji: '⏳', themes: ['identity', 'values'] },
  { text: 'If your life needed a mascot object, what would it be?', category: 'mascot object', emoji: '🎒', themes: ['identity', 'play'] },
  { text: 'What would your personal weather app notify people about?', category: 'personal forecast', emoji: '🌤️', themes: ['identity', 'humour'] },
  { text: 'What is your most unnecessarily strong preference?', category: 'strong preference', emoji: '📌', themes: ['identity', 'humour'] },
  { text: 'What is a fictional job you would absolutely crush?', category: 'fictional job', emoji: '💼', themes: ['play', 'craft'] },
  { text: 'What is a fictional job you would be hilariously bad at?', category: 'comic mismatch', emoji: '🎭', themes: ['play', 'humour'] },
  { text: 'Would you rather have a tiny robot, a talking mirror, or a loyal umbrella?', category: 'magic objects', emoji: '🪞', themes: ['play', 'humour'] },
  { text: 'What is a ridiculous trophy you deserve?', category: 'ridiculous trophy', emoji: '🏆', themes: ['humour', 'play'] },
  { text: 'What is a theme party you would actually attend?', category: 'theme party', emoji: '🎉', themes: ['play', 'community'] },
  { text: 'What is a theme party you would secretly dominate?', category: 'party niche', emoji: '🪩', themes: ['play', 'identity'] },
  { text: 'If your inbox had a mood, what would it be?', category: 'inbox mood', emoji: '📥', themes: ['work', 'humour'] },
  { text: 'What is a household chore with unexpected personality?', category: 'chore energy', emoji: '🧽', themes: ['home', 'humour'] },
  { text: 'What is a luxury you would add to waiting rooms?', category: 'waiting room upgrade', emoji: '🛋️', themes: ['comfort', 'play'] },
  { text: 'What would your signature sandwich be called?', category: 'signature sandwich', emoji: '🥪', themes: ['food', 'humour'] },
  { text: 'What is a movie genre your week accidentally became?', category: 'week genre', emoji: '🎬', themes: ['humour', 'identity'] },
  { text: 'What is an app that should exist only for you?', category: 'personal app', emoji: '📱', themes: ['play', 'creativity'] },
  { text: 'What is a color name you would invent for your current mood?', category: 'mood color', emoji: '🎨', themes: ['creativity', 'identity'] },
  { text: 'What is a museum exhibit you could curate from your camera roll?', category: 'camera roll', emoji: '🖼️', themes: ['memory', 'creativity'] },
  { text: 'Would you rather be able to redecorate any room instantly or soundtrack any moment perfectly?', category: 'instant magic', emoji: '🪄', themes: ['home', 'creativity'] },
  { text: 'What is a tiny inconvenience you would outlaw?', category: 'outlaw this', emoji: '🚫', themes: ['humour', 'boundaries'] },
  { text: 'What is a tiny inconvenience you weirdly tolerate?', category: 'tolerated nuisance', emoji: '🤷', themes: ['humour', 'identity'] },
  { text: 'What is your favorite harmless conspiracy about yourself?', category: 'personal lore', emoji: '🕵️', themes: ['humour', 'identity'] },
  { text: 'What is a phrase that would look good on your personal banner?', category: 'personal banner', emoji: '🏳️', themes: ['values', 'identity'] },
  { text: 'What is a prop that belongs in the movie version of your life?', category: 'life prop', emoji: '🎥', themes: ['play', 'identity'] },
  { text: 'What is a fake award you would give your friends?', category: 'friend awards', emoji: '🏅', themes: ['humour', 'connection'] },
  { text: 'What is a fake award your friends would give you?', category: 'your award', emoji: '🎖️', themes: ['humour', 'identity'] },
  { text: 'What would your emergency comfort kit include?', category: 'comfort kit', emoji: '🧰', themes: ['comfort', 'ritual'] },
  { text: 'What is a menu item you would name after yourself?', category: 'named dish', emoji: '🍽️', themes: ['food', 'humour'] },
  { text: 'What is a holiday decoration you would leave up all year?', category: 'all-year decor', emoji: '🎀', themes: ['home', 'play'] },
  { text: 'What is a sound effect your life needs more often?', category: 'more sound effects', emoji: '🔊', themes: ['play', 'humour'] },
  { text: 'What is a sound effect your life could use less often?', category: 'less sound effects', emoji: '🔇', themes: ['humour', 'boundaries'] },
  { text: 'If your Monday had a costume, what would it wear?', category: 'monday costume', emoji: '👒', themes: ['humour', 'work'] },
  { text: 'If your weekend had a slogan, what would it be?', category: 'weekend slogan', emoji: '🪧', themes: ['rest', 'humour'] },
  { text: 'What is a dramatic entrance song for your most ordinary errand?', category: 'errand anthem', emoji: '🎺', themes: ['humour', 'play'] },
  { text: 'What is a weirdly specific contest you could judge?', category: 'specific contest', emoji: '🥇', themes: ['humour', 'craft'] },
  { text: 'Would you rather have magic pockets, magic shelves, or magic labels?', category: 'magic storage', emoji: '🗄️', themes: ['home', 'play'] },
  { text: 'What is a thing you would make miniature if you could?', category: 'miniature', emoji: '🔍', themes: ['play', 'creativity'] },
  { text: 'What is a thing you would make grander if you could?', category: 'grander', emoji: '🏛️', themes: ['play', 'ambition'] },
  { text: 'What is a room in your imaginary headquarters?', category: 'headquarters', emoji: '🏢', themes: ['creativity', 'play'] },
  { text: 'What is a badge you would award yourself this month?', category: 'self badge', emoji: '🎖️', themes: ['growth', 'humour'] },
  { text: 'What is an oddly specific vibe you are chasing?', category: 'specific vibe', emoji: '✨', themes: ['identity', 'play'] },
  { text: 'What is something that deserves a parade in your life?', category: 'deserves parade', emoji: '🥁', themes: ['play', 'growth'] },
  { text: 'What is a tiny daily nuisance that needs a ceremonial goodbye?', category: 'goodbye nuisance', emoji: '👋', themes: ['ritual', 'humour'] },
  { text: 'What is a personal theme song for getting unstuck?', category: 'unstuck song', emoji: '🎧', themes: ['comfort', 'growth'] },
  { text: 'What is a fictional place you would visit for one afternoon?', category: 'fictional visit', emoji: '🗺️', themes: ['play', 'creativity'] },
  { text: 'What is a fictional place you would avoid no matter how pretty?', category: 'fictional nope', emoji: '🚪', themes: ['play', 'humour'] },
  { text: 'What is a snack pairing that reveals your genius?', category: 'snack genius', emoji: '🍿', themes: ['food', 'humour'] },
  { text: 'What is a small object that deserves a name?', category: 'name the object', emoji: '🏷️', themes: ['play', 'home'] },
  { text: 'If your week were a board game, what would the goal be?', category: 'week game', emoji: '🎲', themes: ['play', 'work'] },
  { text: 'What is a secret menu item for your personality?', category: 'secret menu', emoji: '📋', themes: ['identity', 'humour'] },
];


/**
 * Which deck a HIVE draws from. Keyed by slug so a new HIVE picks one
 * deliberately — an unknown slug falls back to OG's deck rather than guessing.
 * Production HIVE keeps the database slug `show` (see checkIns.ts, which
 * learned this the same way).
 */
export function deckForCommunity(slug?: string | null): DailyQuestion[] {
  if (slug === 'tech') return TECH_DAILY_QUESTIONS;
  if (slug === 'show') return PRODUCTION_DAILY_QUESTIONS;
  return DAILY_QUESTIONS;
}

const LEGACY_DAILY_QUESTION_COUNT = 48;
const DAILY_QUESTION_EXPANSION_START = new Date(2026, 6, 2); // July 2, 2026

export function getQuestionDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Tech HIVE asked its original 32 questions from its first day; the deck grew
// to 365 on August 13, 2026. Same move OG made on July 2: dates before the
// growth keep the exact walk members actually answered (their saved
// question_index rows point at it), dates from the growth onward pick up at
// the first new question and walk the whole year.
const TECH_EPOCH = new Date(2026, 6, 31); // Tech HIVE's first day
const TECH_LEGACY_COUNT = 32;
const TECH_EXPANSION_START = new Date(2026, 7, 13); // August 13, 2026

// Production HIVE has no question history and no meeting rhythm yet, so its
// deck simply starts the day it shipped: question 0 on August 13, 2026, then
// one a day. Chosen 2026-08-12; if Production wants its year to start on a
// meaningful day instead, this is the only line to move.
const PRODUCTION_EPOCH = new Date(2026, 7, 13);

// Production's deck grew by 56 on 2026-08-15 — a whole block about RUNNING a
// company rather than performing in one. Nat, having read the original 365:
// *"those are good questions about being a performer ... but I'm thinking more
// about how to run the cast and crew, to help inform Charlee."*
//
// The new block sits at the end of the file (saved answers store
// question_index, so nothing is ever reordered) and is reached FIRST from
// 16 August, the same move OG made on 2 July and Tech on 13 August. Waiting a
// year for them would be absurd: Production is designing the company this
// month, and these are the questions that design it.
const PRODUCTION_LEGACY_COUNT = 365;
const PRODUCTION_EXPANSION_START = new Date(2026, 7, 16); // August 16, 2026

/** Days-since-epoch walk around a deck, safe on dates before the epoch. */
function walkFromEpoch(questionDate: Date, epoch: Date, length: number) {
  const days = Math.floor((questionDate.getTime() - epoch.getTime()) / 86_400_000);
  return ((days % length) + length) % length;
}

function getQuestionIndexForDate(questionDate: Date, deck: DailyQuestion[] = DAILY_QUESTIONS) {
  if (deck === TECH_DAILY_QUESTIONS) {
    const expansionStart = new Date(TECH_EXPANSION_START);
    expansionStart.setHours(0, 0, 0, 0);
    if (questionDate >= expansionStart) {
      const daysSinceExpansion = Math.floor((questionDate.getTime() - expansionStart.getTime()) / 86_400_000);
      return (TECH_LEGACY_COUNT + daysSinceExpansion) % deck.length;
    }
    return walkFromEpoch(questionDate, TECH_EPOCH, TECH_LEGACY_COUNT);
  }

  if (deck === PRODUCTION_DAILY_QUESTIONS) {
    const expansionStart = new Date(PRODUCTION_EXPANSION_START);
    expansionStart.setHours(0, 0, 0, 0);
    if (questionDate >= expansionStart) {
      const daysSinceExpansion = Math.floor((questionDate.getTime() - expansionStart.getTime()) / 86_400_000);
      return (PRODUCTION_LEGACY_COUNT + daysSinceExpansion) % deck.length;
    }
    // The three days Production actually walked (13–15 August) keep the exact
    // questions its members were asked.
    return walkFromEpoch(questionDate, PRODUCTION_EPOCH, PRODUCTION_LEGACY_COUNT);
  }

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

export function getQuestionForDate(
  date: Date,
  deck: DailyQuestion[] = DAILY_QUESTIONS
): { question: DailyQuestion; index: number; dateKey: string } {
  const questionDate = new Date(date);
  questionDate.setHours(0, 0, 0, 0);
  const index = getQuestionIndexForDate(questionDate, deck);
  return { question: deck[index], index, dateKey: getQuestionDateKey(questionDate) };
}

/** Returns the same question for everyone in a HIVE on a given calendar day. */
export function getTodayQuestion(
  deck: DailyQuestion[] = DAILY_QUESTIONS
): { question: DailyQuestion; index: number; dateKey: string } {
  return getQuestionForDate(new Date(), deck);
}
