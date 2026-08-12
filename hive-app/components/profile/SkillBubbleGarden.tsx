import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Easing,
  LayoutChangeEvent,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import Svg, { Circle, Ellipse, G, Line, Path, Text as SvgText, TSpan } from 'react-native-svg';
import { ComposerBar } from '../ui/ComposerBar';
import { getStoredItem, removeStoredItem, setStoredItem } from '../../lib/webStorage';
import type { MatchedWish, SkillWishMatch } from '../../lib/skillWishMatching';
import { joinGiverNames, type SkillFlowerSummary } from '../../lib/hooks/useSkillFlowers';
import type { Skill } from '../../types';

type GardenSkill = Pick<Skill, 'id' | 'description'> & Partial<Skill>;
type WildflowerSpecies = 'poppy' | 'daisy' | 'lavender' | 'sunflower';
type PlantSkillOptions = { enthusiasmLevel?: number; originSlot?: number };
type PlantSkillsOptions = { mode?: 'fill' | 'replace' };
type PlantSkillSelection = { description: string; enthusiasmLevel?: number; slotIndex?: number };

type SkillBubbleGardenProps = {
  skills: GardenSkill[];
  editable?: boolean;
  onUpdateSkill?: (
    skill: GardenSkill,
    updates: Pick<Skill, 'enthusiasm_level' | 'display_x' | 'display_y'>
  ) => void;
  onDeleteSkill?: (skill: GardenSkill) => void;
  seedSkills?: string[];
  onPlantSkill?: (skillDescription: string, options?: PlantSkillOptions) => void;
  onPlantSkills?: (skills: PlantSkillSelection[], options?: PlantSkillsOptions) => void;
  onAddCustomSkill?: () => void;
  draftKey?: string | null;
  wishMatches?: SkillWishMatch[];
  onOpenWish?: (wishId: string) => void;
  /**
   * Garden visits (2026-08-12): the sunflowers visitors left, keyed by skill
   * id. Purely additive — a garden given neither flower prop draws exactly
   * as it always did.
   */
  skillFlowers?: Record<string, SkillFlowerSummary>;
  /**
   * Present ONLY when the viewer is standing in someone ELSE's garden — it is
   * what puts the "Leave a 🌻" offer on a bloom. Leave it out for the owner's
   * own garden, where blooms keep their tending taps and the 🌻 badge shows
   * who visited instead.
   */
  onToggleSkillFlower?: (skillId: string, leaveIt: boolean) => void;
};

type SkillCategoryDef = {
  label: string;
  species: 'wonder' | 'movement' | 'creative' | 'care' | 'practical' | 'tech';
  color: string;
  pale: string;
  edge: string;
  text: string;
  leaf: string;
  center: string;
  skills: string[];
};

type StageDef = {
  label: string;
  height: number;
  canvasWidth: number;
  labelWidth: number;
};

const CATEGORY_DEFS: SkillCategoryDef[] = [
  {
    label: 'Wonder',
    species: 'wonder',
    color: '#b789f6',
    pale: '#f0e8ff',
    edge: '#7252be',
    text: '#4b3178',
    leaf: '#45875e',
    center: '#ffd85a',
    skills: ['Ocean Boiling', 'Starship Navigation', 'Time Travel Planning', 'Dragon Taming', 'Professional Napping', 'Cloud Watching', 'Parallel Universe Hopping', 'Tarot Reading', 'Astrology', 'Dream Interpretation', 'Crystal Collecting'],
  },
  {
    label: 'Movement',
    species: 'movement',
    color: '#f4c247',
    pale: '#fff5ce',
    edge: '#c9871f',
    text: '#604217',
    leaf: '#3f8f61',
    center: '#f0a43c',
    skills: ['Aerial Acrobatics', 'Pole Dancing', 'Contortion', 'Trapeze', 'Aerial Silks', 'Handstands', 'Rock Climbing', 'Surfing', 'Skateboarding', 'Camping', 'Trail Finding', 'Yoga', 'Meditation', 'Breathwork'],
  },
  {
    label: 'Creative',
    species: 'creative',
    color: '#f37a8c',
    pale: '#ffe8ec',
    edge: '#c74d64',
    text: '#713344',
    leaf: '#3f8f61',
    center: '#ffbf52',
    skills: ['Crocheting', 'Knitting', 'Embroidery', 'Macramé', 'Sewing', 'Photography', 'Video Editing', 'Graphic Design', 'Writing', 'Storytelling', 'Poetry', 'Painting', 'Pottery', 'DJing', 'Guitar Playing', 'Singing', 'Voice Acting', 'Stand-up Comedy', 'Karaoke Domination', 'Dance Floor Presence'],
  },
  {
    label: 'Care',
    species: 'care',
    color: '#f5a5cc',
    pale: '#fff0f6',
    edge: '#ca6794',
    text: '#6f3550',
    leaf: '#438c5e',
    center: '#ffd86b',
    skills: ['Sex Therapy', 'Couples Counseling', 'Intimacy Coaching', 'Massage', 'Reiki', 'Sound Healing', 'Hype Person', 'Deep Listening', 'Tough Love Delivery', 'Pep Talks', 'Wingman Services'],
  },
  {
    label: 'Home & Life',
    species: 'practical',
    color: '#f29b4a',
    pale: '#fff0dd',
    edge: '#bd7440',
    text: '#694321',
    leaf: '#4a8f59',
    center: '#ffc45c',
    skills: ['Cooking', 'Meal Prep', 'Baking', 'Fermentation', 'Cocktail Crafting', 'Coffee Snobbery', 'Tea Ceremony', 'Gardening', 'Composting', 'Beekeeping', 'Plant Parenting', 'Foraging', 'Home Repairs', 'Furniture Building', 'Painting Walls', 'Moving Heavy Things', 'Assembling IKEA', 'Parallel Parking', 'Gift Wrapping', 'Party Planning', 'Surprise Orchestration', 'Dog Whispering', 'Cat Herding', 'Pet Photography', 'Animal Training'],
  },
  {
    label: 'Tech & Work',
    species: 'tech',
    color: '#72c7bb',
    pale: '#e9f8f3',
    edge: '#4d9588',
    text: '#275c52',
    leaf: '#458e65',
    center: '#ffd15b',
    skills: ['Coding', 'Web Design', 'App Building', 'Tax Wizardry', 'Spreadsheet Sorcery', 'Budget Magic', 'Resume Polishing', 'Interview Prep', 'Salary Negotiation', 'Language Teaching', 'Accent Coaching', 'Proofreading'],
  },
];

const FALLBACK_CATEGORY = CATEGORY_DEFS[CATEGORY_DEFS.length - 1];
const GROUND_HEIGHT = 108;
const LABEL_HEIGHT = 30;
const FIELD_SIDE_PADDING = 10;
const GARDEN_CAPACITY = 10;
const SEED_TRAY_SIZE = GARDEN_CAPACITY;
const SEED_STRIP_LIMIT = GARDEN_CAPACITY * 3;
const VISIBLE_BLOOM_LIMIT = GARDEN_CAPACITY;
const BLOOM_CANVAS_EXTRA = 38;
const PHONE_LANDSCAPE_SCALE = 0.64;
const MAX_GARDEN_BEES = 6;

type SurveyChoice = {
  icon: string;
  label: string;
  detail: string;
  seeds: string[];
};

type SurveyQuestion = {
  prompt: string;
  choices: SurveyChoice[];
};

type SeedSurveyDraft = {
  active: boolean;
  surveySeed: number;
  answers: number[];
  updatedAt: number;
};

type SeedSlot = string | undefined;
type FlowerSlot = {
  skill: GardenSkill;
  slotIndex: number;
};

const SEED_SURVEY: SurveyQuestion[] = [
  {
    prompt: 'Which sounds most fulfilling?',
    choices: [
      { icon: '🌸', label: 'Teaching something life-changing', detail: 'Passing on what only you know', seeds: ['Language Teaching', 'Accent Coaching', 'Deep Listening', 'Writing', 'Storytelling'] },
      { icon: '🔥', label: 'Building something ambitious', detail: 'Turning raw chaos into momentum', seeds: ['App Building', 'Coding', 'Budget Magic', 'Furniture Building', 'Web Design'] },
      { icon: '🌙', label: 'Deep talks at 2am', detail: 'Finding the real thing under the thing', seeds: ['Deep Listening', 'Tarot Reading', 'Dream Interpretation', 'Couples Counseling', 'Pep Talks'] },
      { icon: '🪴', label: 'Quietly mastering a craft', detail: 'Patient hands, beautiful repetition', seeds: ['Knitting', 'Embroidery', 'Pottery', 'Tea Ceremony', 'Plant Parenting'] },
    ],
  },
  {
    prompt: 'Pick a Saturday.',
    choices: [
      { icon: '🎨', label: 'Making something messy', detail: 'Paint, sound, edits, scraps everywhere', seeds: ['Painting', 'Graphic Design', 'Video Editing', 'Crocheting', 'Photography'] },
      { icon: '⛰️', label: 'Climbing toward air', detail: 'Movement, effort, a little altitude', seeds: ['Rock Climbing', 'Trail Finding', 'Aerial Silks', 'Handstands', 'Camping'] },
      { icon: '📚', label: 'A research rabbit hole', detail: 'Tabs open, notes everywhere', seeds: ['Proofreading', 'Spreadsheet Sorcery', 'Tax Wizardry', 'Astrology', 'Time Travel Planning'] },
      { icon: '🍷', label: 'Dinner party orbit', detail: 'Food, people, warmth, timing', seeds: ['Cooking', 'Cocktail Crafting', 'Party Planning', 'Meal Prep', 'Gift Wrapping'] },
    ],
  },
  {
    prompt: 'Your friends come to you for...',
    choices: [
      { icon: '🫶', label: 'Comfort', detail: 'Soft landing, steady presence', seeds: ['Massage', 'Reiki', 'Sound Healing', 'Deep Listening', 'Breathwork'] },
      { icon: '⚡', label: 'Momentum', detail: 'A plan, a push, a clean next step', seeds: ['Resume Polishing', 'Interview Prep', 'Salary Negotiation', 'Hype Person', 'Tough Love Delivery'] },
      { icon: '🧠', label: 'Perspective', detail: 'Reframing what felt impossible', seeds: ['Budget Magic', 'Spreadsheet Sorcery', 'Language Teaching', 'Proofreading', 'Tax Wizardry'] },
      { icon: '🎭', label: 'Creativity', detail: 'A weird, brilliant angle', seeds: ['Voice Acting', 'Stand-up Comedy', 'Singing', 'Storytelling', 'Poetry'] },
    ],
  },
  {
    prompt: 'Choose a tiny joy.',
    choices: [
      { icon: '🍄', label: 'Mossy forests', detail: 'Soft ground, secret worlds', seeds: ['Foraging', 'Gardening', 'Composting', 'Plant Parenting', 'Cloud Watching'] },
      { icon: '📼', label: 'Niche documentaries', detail: 'Specific stories, stranger than fiction', seeds: ['Video Editing', 'Writing', 'Photography', 'Storytelling', 'Proofreading'] },
      { icon: '🧶', label: 'Soft yarn', detail: 'Texture, patience, a quiet spell', seeds: ['Knitting', 'Crocheting', 'Macramé', 'Sewing', 'Embroidery'] },
      { icon: '🌧️', label: 'Thunderstorms', detail: 'Drama outside, cozy inside', seeds: ['Professional Napping', 'Dream Interpretation', 'Tea Ceremony', 'Sound Healing', 'Poetry'] },
    ],
  },
  {
    prompt: 'What kind of projects energize you?',
    choices: [
      { icon: '🧭', label: 'Untangling a system', detail: 'Making the hidden structure visible', seeds: ['Coding', 'Web Design', 'Spreadsheet Sorcery', 'Budget Magic', 'Home Repairs'] },
      { icon: '🌺', label: 'Making beauty useful', detail: 'Aesthetic with a job to do', seeds: ['Graphic Design', 'Photography', 'Pottery', 'Painting Walls', 'Gift Wrapping'] },
      { icon: '🛠️', label: 'Hands-on rescue missions', detail: 'Fixing the thing everyone avoided', seeds: ['Furniture Building', 'Assembling IKEA', 'Moving Heavy Things', 'Parallel Parking', 'Home Repairs'] },
      { icon: '🎤', label: 'Creating a moment', detail: 'Room energy, surprise, performance', seeds: ['DJing', 'Karaoke Domination', 'Dance Floor Presence', 'Surprise Orchestration', 'Party Planning'] },
    ],
  },
  {
    prompt: 'Which environment feels most like home?',
    choices: [
      { icon: '🕯️', label: 'A calm little room', detail: 'Low light, deep care, no rush', seeds: ['Meditation', 'Reiki', 'Massage', 'Tea Ceremony', 'Couples Counseling'] },
      { icon: '🌊', label: 'A big open edge', detail: 'Wind, water, horizon', seeds: ['Surfing', 'Camping', 'Trail Finding', 'Cloud Watching', 'Ocean Boiling'] },
      { icon: '🎪', label: 'A place with spectacle', detail: 'Color, risk, rhythm', seeds: ['Aerial Acrobatics', 'Trapeze', 'Pole Dancing', 'Contortion', 'Dance Floor Presence'] },
      { icon: '🧪', label: 'A workshop of experiments', detail: 'Try it, break it, make it better', seeds: ['Fermentation', 'Baking', 'Coffee Snobbery', 'App Building', 'Web Design'] },
    ],
  },
  {
    prompt: 'When the group needs magic, you bring...',
    choices: [
      { icon: '✨', label: 'Wonder', detail: 'Myth, symbolism, delightful weirdness', seeds: ['Astrology', 'Tarot Reading', 'Crystal Collecting', 'Dragon Taming', 'Parallel Universe Hopping'] },
      { icon: '🌿', label: 'Grounding', detail: 'The practical thing that lets everyone breathe', seeds: ['Meal Prep', 'Composting', 'Gardening', 'Animal Training', 'Pet Photography'] },
      { icon: '🧲', label: 'Belonging', detail: 'Making the room feel held', seeds: ['Wingman Services', 'Pep Talks', 'Hype Person', 'Deep Listening', 'Intimacy Coaching'] },
      { icon: '🪩', label: 'Spark', detail: 'The lift, the joke, the brave first move', seeds: ['Stand-up Comedy', 'Guitar Playing', 'Singing', 'Voice Acting', 'Karaoke Domination'] },
    ],
  },
  {
    prompt: 'What feels most satisfying to finish?',
    choices: [
      { icon: '🧺', label: 'A beautifully reset home', detail: 'Everything lands where it belongs', seeds: ['Home Repairs', 'Painting Walls', 'Furniture Building', 'Assembling IKEA', 'Moving Heavy Things'] },
      { icon: '📋', label: 'A plan that actually works', detail: 'Steps, timing, people, done', seeds: ['Meal Prep', 'Party Planning', 'Surprise Orchestration', 'Budget Magic', 'Spreadsheet Sorcery'] },
      { icon: '🎬', label: 'A polished little artifact', detail: 'The final edit sings', seeds: ['Video Editing', 'Photography', 'Graphic Design', 'Writing', 'Proofreading'] },
      { icon: '🌱', label: 'Something living and tended', detail: 'Slow care that shows', seeds: ['Gardening', 'Plant Parenting', 'Composting', 'Foraging', 'Beekeeping'] },
    ],
  },
  {
    prompt: 'Choose your favorite kind of brave.',
    choices: [
      { icon: '🎤', label: 'Being seen', detail: 'Voice out, heart open', seeds: ['Singing', 'Voice Acting', 'Stand-up Comedy', 'Storytelling', 'Karaoke Domination'] },
      { icon: '🧗', label: 'Trying the hard move', detail: 'Body first, doubt second', seeds: ['Rock Climbing', 'Pole Dancing', 'Trapeze', 'Aerial Acrobatics', 'Handstands'] },
      { icon: '💌', label: 'Saying the true thing', detail: 'Tender honesty, clean signal', seeds: ['Deep Listening', 'Couples Counseling', 'Intimacy Coaching', 'Pep Talks', 'Tough Love Delivery'] },
      { icon: '🛸', label: 'Following the weird idea', detail: 'A little impossible, a little perfect', seeds: ['Ocean Boiling', 'Starship Navigation', 'Time Travel Planning', 'Parallel Universe Hopping', 'Dream Interpretation'] },
    ],
  },
  {
    prompt: 'A future-you badge would say...',
    choices: [
      { icon: '🏡', label: 'Builder of cozy worlds', detail: 'Homes, rituals, care systems', seeds: ['Cooking', 'Home Repairs', 'Furniture Building', 'Plant Parenting', 'Party Planning'] },
      { icon: '🚀', label: 'Architect of wild plans', detail: 'Bold ideas with an engine', seeds: ['Starship Navigation', 'App Building', 'Salary Negotiation', 'Coding', 'Budget Magic'] },
      { icon: '🎐', label: 'Keeper of subtle signals', detail: 'Pattern, mood, intuition', seeds: ['Dream Interpretation', 'Astrology', 'Tarot Reading', 'Sound Healing', 'Meditation'] },
      { icon: '🌻', label: 'Friend of becoming', detail: 'Growth, practice, encouragement', seeds: ['Yoga', 'Breathwork', 'Language Teaching', 'Interview Prep', 'Pep Talks'] },
    ],
  },
];

// Sized for legibility (Nat, 2026-07-23): smalls were unreadable, so the
// lower tiers grew the most — every bloom's center disc now fits a real label.
// Growth you can actually see. Small → large used to be only 1.36x, so
// watering a flower barely changed it; it's 1.55x now, and the top end is
// bigger outright (Nat 2026-07-26: "they can start bigger & grow even bigger").
const STAGES: StageDef[] = [
  { label: 'Seed', height: 24, canvasWidth: 72, labelWidth: 100 },
  { label: 'Small bloom', height: 176, canvasWidth: 212, labelWidth: 218 },
  { label: 'Medium bloom', height: 210, canvasWidth: 254, labelWidth: 260 },
  { label: 'Large bloom', height: 272, canvasWidth: 318, labelWidth: 324 },
];

const SPECIES_BY_CATEGORY: Record<SkillCategoryDef['species'], WildflowerSpecies[]> = {
  wonder: ['lavender', 'daisy', 'poppy'],
  movement: ['sunflower', 'poppy', 'daisy'],
  creative: ['poppy', 'daisy', 'lavender'],
  care: ['daisy', 'lavender', 'poppy'],
  practical: ['sunflower', 'daisy', 'poppy'],
  tech: ['lavender', 'daisy', 'sunflower'],
};

const GRASS_BLADES = Array.from({ length: 86 }, (_, index) => ({
  leftRatio: ((index * 1.37) % 100) / 100,
  height: 8 + ((index * 7) % 18),
  bottom: 54 + (index % 9),
  opacity: 0.28 + ((index * 11) % 22) / 100,
  rotate: `${-14 + ((index * 13) % 29)}deg`,
}));

const SOIL_SPECKS = Array.from({ length: 38 }, (_, index) => ({
  leftRatio: ((index * 2.71) % 100) / 100,
  bottom: 9 + ((index * 17) % 38),
  size: 1.4 + (index % 4) * 0.7,
  opacity: 0.14 + ((index * 5) % 18) / 100,
}));

const DISTANT_BLOOMS = Array.from({ length: 34 }, (_, index) => ({
  leftRatio: ((index * 2.91) % 100) / 100,
  bottomRatio: 0.12 + (((index * 4.17) % 100) / 100) * 0.10,
  height: 7 + (index % 5) * 2,
  color: ['#f2c85a', '#dd7e6b', '#c7aadf', '#f4b8cc', '#fff2ba'][index % 5],
  opacity: 0.32 + ((index * 11) % 24) / 100,
}));

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function greatestCommonDivisor(left: number, right: number): number {
  let a = Math.abs(left);
  let b = Math.abs(right);
  while (b > 0) {
    const next = a % b;
    a = b;
    b = next;
  }
  return a || 1;
}

function hashString(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return Math.abs(hash >>> 0);
}

function ratioFromHash(value: string, salt = 0) {
  return ((hashString(`${value}:${salt}`) % 10000) / 10000);
}

function shuffleBySeed<T>(items: T[], seed: number, keyForItem: (item: T) => string) {
  return [...items]
    .map(item => ({
      item,
      score: hashString(`${keyForItem(item)}:${seed}`),
    }))
    .sort((left, right) => left.score - right.score)
    .map(({ item }) => item);
}

function getCategoryForSkill(description: string) {
  const normalized = description.trim().toLowerCase();
  return CATEGORY_DEFS.find(category =>
    category.skills.some(skill => skill.trim().toLowerCase() === normalized)
  ) ?? FALLBACK_CATEGORY;
}

function getLevel(skill: Partial<Skill>) {
  const level = Number(skill.enthusiasm_level ?? 0);
  return clamp(Number.isFinite(level) ? level : 0, 0, 5);
}

function getBloomStep(level: number) {
  if (level <= 0) return 0;
  if (level < 3) return 1;
  if (level < 5) return 2;
  return 3;
}

function getNextBloomLevel(level: number) {
  const step = getBloomStep(level);
  if (step === 0) return 2;
  if (step === 1) return 4;
  if (step === 2) return 5;
  return 2;
}

function isBloomingSkill(skill: Partial<Skill>) {
  return getLevel(skill) > 0;
}

function getStage(level: number) {
  return STAGES[clamp(getBloomStep(level), 0, STAGES.length - 1)];
}

function getStageCanvasHeight(stage: StageDef) {
  return stage.height + BLOOM_CANVAS_EXTRA;
}

function getEmbeddedLabelLines(label: string) {
  const words = label.trim().split(/\s+/).filter(Boolean);
  const truncate = (line: string, max = 15) => line.length > max ? `${line.slice(0, max - 1)}…` : line;
  if (words.length <= 1) return [truncate(label.trim())];

  const lines: string[] = [];
  let current = '';
  words.forEach(word => {
    const next = current ? `${current} ${word}` : word;
    if (next.length <= 11) {
      current = next;
      return;
    }
    if (current) lines.push(current);
    current = word;
  });
  if (current) lines.push(current);

  return lines.slice(0, 3).map(line => truncate(line));
}

function getDefaultPosition(skill: GardenSkill, index: number, count: number) {
  if (count > 18) {
    const columns = Math.ceil(Math.sqrt(count * 1.35));
    const rows = Math.ceil(count / columns);
    const stride = [7, 11, 13, 17].find(candidate => greatestCommonDivisor(candidate, count) === 1) ?? 1;
    const layoutIndex = (index * stride) % count;
    const row = Math.floor(layoutIndex / columns);
    const column = layoutIndex % columns;
    const rowOffset = row % 2 === 0 ? 0 : 0.5 / columns;
    const xJitter = (ratioFromHash(skill.id || skill.description, 1) - 0.5) * (0.54 / columns);
    const yJitter = (ratioFromHash(skill.description || skill.id, 2) - 0.5) * (0.16 / Math.max(1, rows));

    return {
      x: clamp((column + 0.5) / columns + rowOffset + xJitter, 0.06, 0.94),
      y: clamp(0.48 + (row / Math.max(1, rows - 1)) * 0.39 + yJitter, 0.46, 0.9),
    };
  }

  const columns = Math.min(count, Math.max(count <= 5 ? count : 3, Math.ceil(Math.sqrt(count * 1.45))));
  const rows = Math.ceil(count / columns);
  const row = Math.floor(index / columns);
  const column = index % columns;
  const rowOffset = rows > 1 && row % 2 === 1 ? 0.32 / columns : 0;
  const xJitter = (ratioFromHash(skill.id || skill.description, 1) - 0.5) * (0.2 / columns);
  const yJitter = (ratioFromHash(skill.description || skill.id, 2) - 0.5) * 0.045;

  return {
    x: clamp((column + 0.5) / columns + rowOffset + xJitter, 0.08, 0.92),
    y: clamp(0.55 + (row / Math.max(1, rows - 1)) * 0.3 + yJitter, 0.52, 0.9),
  };
}

// ── Depth ───────────────────────────────────────────────────────────────────
// Wide gardens used to stagger on `index % 2` — two heights, alternating, every
// flower the same size. That's a picket fence, not a meadow, and it left the
// top of a 560px canvas empty (Nat 2026-07-26). Four bands instead, and a band
// decides three things at once so they can't disagree: how far back the flower
// sits, how big it draws, and how much it hazes out.
//
// Phones keep their own ten-value pattern below — it was already doing this.
const DEPTH_BANDS = [0, 2, 1, 3, 0, 3, 1, 2, 0, 2];
const MAX_DEPTH_BAND = 3;

function getDepthBand(index: number) {
  return DEPTH_BANDS[index % DEPTH_BANDS.length];
}

/**
 * The tallest a bloom can draw at the front of a given garden. Several things
 * are derived from this, so it lives in one place.
 */
function getTallestPlantHeight(width: number, compactLandscape = false) {
  return getStageCanvasHeight(STAGES[STAGES.length - 1]) * getFrontRowScale(width, compactLandscape)
    + LABEL_HEIGHT;
}

const GARDEN_SIDE_PADDING = (width: number) => clamp(width * 0.045, width < 520 ? 18 : 30, width > 1280 ? 96 : 58);
const GARDEN_BOTTOM_INSET = 48;
const GARDEN_SKY_ROOM = 44;

/**
 * How big each flower draws, given how many are sharing the meadow.
 *
 * The garden is a fixed pane now, so the flowers divide it between them: four
 * skills bloom huge, twenty bloom small, and adding one makes everyone else a
 * little smaller (Nat 2026-07-26, and it's the fix for a garden that used to
 * overflow the screen). Area-based rather than width-based, because the blooms
 * spread over four depth bands rather than standing in a line.
 */
function getPackedScale(width: number, height: number, count: number, compactLandscape = false) {
  if (compactLandscape || width < 520) return getFrontRowScale(width, compactLandscape);

  const usableWidth = Math.max(1, width - GARDEN_SIDE_PADDING(width) * 2);
  const usableHeight = Math.max(1, height - GARDEN_BOTTOM_INSET - GARDEN_SKY_ROOM);
  const bloom = STAGES[STAGES.length - 1];
  const unitArea = bloom.labelWidth * (getStageCanvasHeight(bloom) + LABEL_HEIGHT);
  // Above 1 because blooms are allowed to overlap — petals tucking behind each
  // other is the look, so each needs less room than its own bounding box.
  const OVERLAP_ALLOWANCE = 1.35;
  const areaPerFlower = (usableWidth * usableHeight * OVERLAP_ALLOWANCE) / Math.max(1, count);
  // A lone skill would otherwise take the whole area budget and grow taller
  // than the pane it's standing in, so cap by what actually fits.
  const tallestThatFits = usableHeight / (getStageCanvasHeight(bloom) + LABEL_HEIGHT);

  return clamp(Math.sqrt(areaPerFlower / unitArea), 0.5, Math.min(2.4, tallestThatFits));
}

/**
 * Whatever vertical room the blooms didn't take, the stagger spreads into — so
 * the depth bands always use the full pane rather than a fixed offset that
 * either wasted space or overflowed it.
 */
function getDepthLiftRange(height: number, plantScale: number) {
  const usableHeight = Math.max(1, height - GARDEN_BOTTOM_INSET - GARDEN_SKY_ROOM);
  const tallestPlant = (getStageCanvasHeight(STAGES[STAGES.length - 1]) + LABEL_HEIGHT) * plantScale;

  return Math.max(40, usableHeight - tallestPlant);
}

/**
 * Things further away are a little smaller — but only a little. The depth here
 * comes from how far apart the bands sit, not from shrinking flowers down;
 * everything is meant to stay big.
 */
function getDepthScaleFactor(band: number) {
  return 1 - band * 0.03;
}

/** ...and slightly hazier, which does the rest of the work. */
function getDepthOpacity(band: number) {
  return 1 - band * 0.045;
}

/**
 * How deep the grass is. Wide gardens plant across four depth bands, and every
 * root has to land IN the meadow — at the old 108 the back band would have
 * hovered above the grass line like cut flowers. Deeper grass also eats into
 * the empty sky that made the canvas feel half-used.
 */
function getGroundHeight(width: number, compactLandscape: boolean) {
  if (compactLandscape) return GROUND_HEIGHT * 0.75;
  if (width < 520) return GROUND_HEIGHT;
  return GROUND_HEIGHT * 1.6;
}

/** The deepest band actually occupied by this many flowers. */
function getMaxUsedDepthBand(skillCount: number) {
  let maxBand = 0;
  for (let index = 0; index < Math.min(skillCount, DEPTH_BANDS.length); index += 1) {
    maxBand = Math.max(maxBand, getDepthBand(index));
  }
  return maxBand;
}

function getFrontRowScale(width: number, compactLandscape = false) {
  const effectiveWidth = Math.max(width || 0, 360);
  const fullBloomWidth = STAGES[STAGES.length - 1].labelWidth;
  const sidePadding = clamp(effectiveWidth * 0.045, effectiveWidth < 520 ? 18 : 30, effectiveWidth > 1280 ? 96 : 58);
  const compactScale = compactLandscape ? PHONE_LANDSCAPE_SCALE : 1;
  // Wide gardens size a bloom against its BAND-MATES, not against all ten
  // slots. Depth splits the row into four bands, so a flower's real neighbours
  // are roughly four slots away — dividing by ten sized every flower for a
  // crowd that isn't standing next to it and kept the whole meadow small.
  if (!compactLandscape && effectiveWidth >= 520) {
    const usableWidth = effectiveWidth - sidePadding * 2;
    const bandMateGap = (usableWidth * 4) / Math.max(1, GARDEN_CAPACITY - 1);
    return clamp((bandMateGap * 0.95) / fullBloomWidth, 0.95, 1.5);
  }

  const idealScale = ((effectiveWidth - sidePadding * 2) / (GARDEN_CAPACITY * fullBloomWidth)) * (compactLandscape ? 1.88 : 1.78) * compactScale;
  const minScale = (compactLandscape ? 0.56 : 0.54) * compactScale;
  const maxScale = (compactLandscape ? 0.88 : 1.12) * compactScale;

  return clamp(idealScale, minScale, maxScale);
}

/**
 * The scale a plant actually draws at, once depth is taken into account. Pass
 * the slot index; omit it for callers that just want the front-row size.
 * Only wide gardens use depth — phones and compact landscape have their own
 * hand-tuned stagger and stay flat.
 */
function getPlantScale(width: number, compactLandscape = false, index?: number) {
  const baseScale = getFrontRowScale(width, compactLandscape);
  if (index === undefined || compactLandscape || width < 520) return baseScale;

  return baseScale * getDepthScaleFactor(getDepthBand(index));
}

function getFrontRowCenterX(index: number, count: number, width: number) {
  if (count <= 1) return width / 2;

  const sidePadding = clamp(width * 0.045, width < 520 ? 18 : 30, width > 1280 ? 96 : 58);
  const usableWidth = Math.max(1, width - sidePadding * 2);
  const slotIndex = (GARDEN_CAPACITY - 1) * (index / Math.max(1, count - 1));

  return sidePadding + (usableWidth * slotIndex) / (GARDEN_CAPACITY - 1);
}

function getSeedSlotIndexForCenterX(centerX: number, width: number) {
  if (width <= 0) return 0;

  const sidePadding = clamp(width * 0.045, width < 520 ? 18 : 30, width > 1280 ? 96 : 58);
  const usableWidth = Math.max(1, width - sidePadding * 2);
  const slotRatio = clamp((centerX - sidePadding) / usableWidth, 0, 1);

  return clamp(Math.round(slotRatio * (GARDEN_CAPACITY - 1)), 0, GARDEN_CAPACITY - 1);
}

function getPersistedSlotIndex(skill: GardenSkill) {
  const displayX = Number(skill.display_x);
  if (!Number.isFinite(displayX)) return undefined;

  return clamp(Math.round(clamp(displayX, 0, 1) * (GARDEN_CAPACITY - 1)), 0, GARDEN_CAPACITY - 1);
}

function buildSeedSlots(seedTray: string[], pinnedSlots: Record<string, number>) {
  const slots: SeedSlot[] = Array.from({ length: SEED_TRAY_SIZE });
  const usedSeeds = new Set<string>();

  Object.entries(pinnedSlots)
    .sort((left, right) => left[1] - right[1])
    .forEach(([normalizedSeed, slotIndex]) => {
      const seed = seedTray.find(item => normalizeSkillName(item) === normalizedSeed);
      if (!seed) return;

      const targetSlot = clamp(slotIndex, 0, SEED_TRAY_SIZE - 1);
      const availableSlot = Array.from({ length: SEED_TRAY_SIZE }, (_, index) => index)
        .sort((left, right) => Math.abs(left - targetSlot) - Math.abs(right - targetSlot))
        .find(index => slots[index] === undefined);

      if (availableSlot === undefined) return;
      slots[availableSlot] = seed;
      usedSeeds.add(normalizedSeed);
    });

  const remainingSeeds = seedTray.filter(seed => !usedSeeds.has(normalizeSkillName(seed)));
  let remainingIndex = 0;

  return slots.map(seed => {
    if (seed) return seed;
    const nextSeed = remainingSeeds[remainingIndex];
    remainingIndex += 1;
    return nextSeed;
  });
}

function buildFlowerSlots(skills: GardenSkill[], pinnedSlots: Record<string, number>) {
  const slots: Array<FlowerSlot | undefined> = Array.from({ length: GARDEN_CAPACITY });
  const usedSkills = new Set<string>();
  const orderBySkill = new Map(
    skills.map((skill, index) => [normalizeSkillName(skill.description), index] as const)
  );
  const findNearestOpenSlot = (targetSlot: number) =>
    Array.from({ length: GARDEN_CAPACITY }, (_, index) => index)
      .sort((left, right) => Math.abs(left - targetSlot) - Math.abs(right - targetSlot))
      .find(index => slots[index] === undefined);

  Object.entries(pinnedSlots)
    .sort((left, right) => left[1] - right[1])
    .forEach(([normalizedSkill, slotIndex]) => {
      const skill = skills.find(item => normalizeSkillName(item.description) === normalizedSkill);
      if (!skill) return;

      const targetSlot = clamp(slotIndex, 0, GARDEN_CAPACITY - 1);
      const availableSlot = findNearestOpenSlot(targetSlot);

      if (availableSlot === undefined) return;
      slots[availableSlot] = { skill, slotIndex: availableSlot };
      usedSkills.add(normalizedSkill);
    });

  const remainingSkills = skills.filter(skill => !usedSkills.has(normalizeSkillName(skill.description)));
  remainingSkills.forEach((skill) => {
    const orderIndex = orderBySkill.get(normalizeSkillName(skill.description)) ?? 0;
    const persistedSlot = getPersistedSlotIndex(skill);
    const targetSlot = persistedSlot ?? (skills.length <= 1
      ? Math.round((GARDEN_CAPACITY - 1) / 2)
      : Math.round(((GARDEN_CAPACITY - 1) * orderIndex) / Math.max(1, skills.length - 1)));
    const availableSlot = findNearestOpenSlot(clamp(targetSlot, 0, GARDEN_CAPACITY - 1));

    if (availableSlot === undefined) return;
    slots[availableSlot] = { skill, slotIndex: availableSlot };
  });

  return slots
    .filter((slot): slot is FlowerSlot => Boolean(slot));
}

function getFrontRowAnchorY(height: number, width: number, index: number, compactLandscape = false, groundHeight = GROUND_HEIGHT, depthLiftRange?: number) {
  const baseAnchor = height - clamp(width < 520 ? 34 : 48, 32, 58);
  if (compactLandscape) {
    const foregroundTop = height - groundHeight;
    const plantedBaseAnchor = foregroundTop + groundHeight * 0.86;
    const highestRoot = Math.max(18, foregroundTop + groundHeight * 0.25);
    const maxLift = Math.max(22, plantedBaseAnchor - highestRoot);
    const staggerPattern = [0, 4, 12, 44, 18, 38, 10, 48, 24, 42];
    const lift = clamp(staggerPattern[index % staggerPattern.length], 0, maxLift);
    return plantedBaseAnchor - lift;
  }
  if (width < 520) {
    const foregroundTop = height - groundHeight;
    const plantedBaseAnchor = Math.min(height - 16, foregroundTop + groundHeight * 0.78);
    const highestRoot = Math.max(42, foregroundTop - 12);
    const maxLift = Math.max(28, plantedBaseAnchor - highestRoot);
    const staggerPattern = [4, 76, 22, 96, 42, 68, 12, 88, 32, 104];
    const lift = clamp(staggerPattern[index % staggerPattern.length], 0, maxLift);
    return plantedBaseAnchor - lift;
  }
  // Bands spread across whatever vertical room the blooms left over, so the
  // pane is always fully used whether it holds four flowers or twenty.
  return baseAnchor - (getDepthBand(index) / MAX_DEPTH_BAND) * (depthLiftRange ?? 0);
}

function getMeadowHeight(
  skillCount: number,
  width: number,
  compactLandscape = false,
  viewportHeight = 0
) {
  if (compactLandscape) {
    const base = (skillCount === 0 ? 285 : 350) * PHONE_LANDSCAPE_SCALE;
    const extra = Math.max(0, skillCount - GARDEN_CAPACITY) * 3 * PHONE_LANDSCAPE_SCALE;
    return clamp(base + extra, base, 390 * PHONE_LANDSCAPE_SCALE);
  }

  if (skillCount === 0) return width < 420 ? 330 : 370;

  if (width < 520) {
    const base = width < 420 ? 500 : 560;
    const extra = Math.max(0, skillCount - (width < 420 ? 10 : 18)) * (width < 420 ? 8 : 5);
    return clamp(base + extra, base, width < 420 ? 720 : 780);
  }

  // A pane that fits the screen, not a canvas that grows with the garden. It
  // used to size itself to the tallest bloom plus the stagger, which overflowed
  // a laptop once the flowers got big (Nat 2026-07-26). Now the pane is fixed
  // and the FLOWERS divide it between them — see getPackedScale.
  const chromeAllowance = 300; // page header, garden heading, seed tray, tab bar
  const fromViewport = viewportHeight > 0 ? viewportHeight - chromeAllowance : 560;

  return clamp(fromViewport, 420, 760);
}

type BouquetPlantLayout = { centerX: number; anchorY: number; scale: number };

// Read-only "bouquet" layout for narrow/portrait canvases: stored display_x
// positions were tuned for wide meadows and pile up when compressed, so we
// arrange blooms on a tidy staggered grid over the ground instead. Editable
// gardens keep their hand-placed layout everywhere.
function buildBouquetLayout(skills: GardenSkill[], width: number) {
  const ordered = [...skills].sort(
    (left, right) =>
      getLevel(right) - getLevel(left) ||
      left.description.localeCompare(right.description)
  );
  const sidePadding = 16;
  const columns = width < 380 ? 2 : 3;
  const usableWidth = Math.max(1, width - sidePadding * 2);
  const cellWidth = usableWidth / columns;
  const fullBloom = STAGES[STAGES.length - 1];
  const scale = clamp((cellWidth * 0.92) / fullBloom.labelWidth, 0.38, 0.72);

  // Brick-style stagger: full rows alternate with rows one bloom short,
  // each row centered, so offset rows sit in the gaps like a bouquet.
  const rowSizes: number[] = [];
  let remaining = ordered.length;
  while (remaining > 0) {
    const capacity = rowSizes.length % 2 === 0 ? columns : Math.max(1, columns - 1);
    const take = Math.min(capacity, remaining);
    rowSizes.push(take);
    remaining -= take;
  }

  // Space each row by the tallest bloom actually IN it — sizing every row for
  // a hypothetical full bloom left huge sky-gaps between small flowers and
  // ballooned the canvas to fill a whole phone screen.
  const rowGap = 12;
  let skillCursor = 0;
  const rowHeights = rowSizes.map((take) => {
    const rowSkills = ordered.slice(skillCursor, skillCursor + take);
    skillCursor += take;
    return Math.max(
      ...rowSkills.map((skill) => getStageCanvasHeight(getStage(getLevel(skill))) * scale * 1.04 + 8)
    );
  });

  const bottomInset = 26;
  const skyRoom = 64;
  const minHeight = width < 420 ? 300 : 340;
  const stackedHeight = rowHeights.reduce((sum, rowHeight) => sum + rowHeight, 0)
    + Math.max(0, rowHeights.length - 1) * rowGap;
  const meadowHeight = Math.max(minHeight, bottomInset + stackedHeight + skyRoom);

  const positions = new Map<string, BouquetPlantLayout>();
  let skillIndex = 0;
  let rowOffset = 0;
  rowSizes.forEach((take, rowIndex) => {
    // Row 0 (highest enthusiasm) sits in front at the bottom; later rows step up
    // by the height of the rows beneath them.
    const anchorY = meadowHeight - bottomInset - rowOffset;
    rowOffset += rowHeights[rowIndex] + rowGap;
    for (let column = 0; column < take; column += 1) {
      positions.set(ordered[skillIndex].id, {
        centerX: width / 2 + (column - (take - 1) / 2) * cellWidth,
        anchorY,
        scale,
      });
      skillIndex += 1;
    }
  });

  return { positions, meadowHeight };
}

function normalizeSkillName(skill: string) {
  return skill.trim().toLowerCase();
}

function getSeedTray(
  seedSkills: string[],
  plantedNames: Set<string>,
  shakeIndex: number,
  limit = SEED_TRAY_SIZE,
  prioritySeeds: string[] = []
) {
  const priorityOrder = new Map(
    prioritySeeds
      .map((skill, index) => [normalizeSkillName(skill), index] as const)
  );
  const readySeeds = seedSkills
    .filter(skill => !plantedNames.has(normalizeSkillName(skill)))
    .filter((skill, index, all) => all.findIndex(item => normalizeSkillName(item) === normalizeSkillName(skill)) === index);

  return readySeeds
    .map(skill => ({
      skill,
      priority: priorityOrder.get(normalizeSkillName(skill)),
      score: hashString(`${skill}:${shakeIndex}:skill-seeds`),
    }))
    .sort((a, b) => {
      if (a.priority !== undefined && b.priority !== undefined) return a.priority - b.priority;
      if (a.priority !== undefined) return -1;
      if (b.priority !== undefined) return 1;
      return a.score - b.score;
    })
    .slice(0, Math.max(0, limit))
    .map(item => item.skill);
}

function useWildflowerStyles() {
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;

    const styleId = 'wildflower-field-styles';
    if (document.getElementById(styleId)) return;

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      @keyframes wildflowerSway {
        0%, 100% { transform: rotate(-1.6deg); }
        50% { transform: rotate(1.8deg); }
      }
      .wildflower-sway {
        animation-name: wildflowerSway;
        animation-duration: 3.8s;
        animation-timing-function: ease-in-out;
        animation-iteration-count: infinite;
        transform-origin: 50% 100%;
        will-change: transform;
      }
      @keyframes skillSeedShake {
        0%, 100% { transform: translate3d(0, 0, 0) rotate(0deg); }
        18% { transform: translate3d(-4px, 0, 0) rotate(-1.4deg); }
        36% { transform: translate3d(4px, 0, 0) rotate(1.2deg); }
        54% { transform: translate3d(-3px, 0, 0) rotate(-0.9deg); }
        72% { transform: translate3d(2px, 0, 0) rotate(0.6deg); }
      }
      @keyframes skillSeedPopcorn {
        0%, 100% { transform: translate3d(0, 0, 0) rotate(0deg) scale(1); }
        16% { transform: translate3d(0, -7px, 0) rotate(-3deg) scale(1.035); }
        34% { transform: translate3d(4px, 2px, 0) rotate(2.5deg) scale(0.99); }
        52% { transform: translate3d(-3px, -4px, 0) rotate(-1.8deg) scale(1.02); }
        72% { transform: translate3d(2px, 1px, 0) rotate(1.1deg) scale(1); }
      }
      .skill-seed-popcorn {
        animation-name: skillSeedPopcorn;
        animation-duration: 860ms;
        animation-timing-function: cubic-bezier(0.2, 0.9, 0.18, 1);
        transform-origin: 50% 80%;
        will-change: transform;
      }
      @keyframes skillSeedBubbleIn {
        0% {
          opacity: 0;
          transform: translate3d(0, -4px, 0) scaleX(0.08) scaleY(0.06);
          filter: blur(1.4px);
        }
        34% {
          opacity: 0.9;
          transform: translate3d(0, -2px, 0) scaleX(0.28) scaleY(1.42);
          filter: blur(0.4px);
        }
        62% {
          opacity: 1;
          transform: translate3d(0, 1px, 0) scaleX(1.18) scaleY(0.72);
          filter: blur(0);
        }
        82% {
          transform: translate3d(0, -1px, 0) scaleX(0.94) scaleY(1.08);
        }
        100% {
          opacity: 1;
          transform: translate3d(0, 0, 0) scaleX(1) scaleY(1);
          filter: blur(0);
        }
      }
      .skill-seed-bubble-in {
        animation-name: skillSeedBubbleIn;
        animation-duration: 1180ms;
        animation-timing-function: cubic-bezier(0.18, 0.9, 0.12, 1);
        transform-origin: 50% 50%;
        will-change: transform, opacity;
      }
      .skill-seed-row-shake {
        animation-name: skillSeedShake;
        animation-duration: 760ms;
        animation-timing-function: ease-in-out;
        transform-origin: 50% 100%;
        will-change: transform;
      }
      @keyframes skillGardenSoftOpen {
        0% {
          opacity: 0;
          transform: translate3d(0, 30px, 0) scaleX(0.86) scaleY(0.62);
          filter: blur(2px);
        }
        46% {
          opacity: 0.96;
          transform: translate3d(0, 6px, 0) scaleX(0.72) scaleY(1.18);
          filter: blur(0.4px);
        }
        72% {
          opacity: 1;
          transform: translate3d(0, -4px, 0) scaleX(1.035) scaleY(1.05);
          filter: blur(0);
        }
        100% {
          opacity: 1;
          transform: translate3d(0, 0, 0) scaleX(1) scaleY(1);
          filter: blur(0);
        }
      }
      .skill-garden-soft-open {
        animation-name: skillGardenSoftOpen;
        animation-duration: 1180ms;
        animation-timing-function: cubic-bezier(0.18, 0.9, 0.16, 1);
        transform-origin: 50% 100%;
        will-change: transform, opacity;
      }
    `;
    document.head.appendChild(style);
  }, []);
}

function MeadowAtmosphere({
  width,
  height,
  showSun = true,
  groundHeight = GROUND_HEIGHT,
  compactLandscape = false,
}: {
  width: number;
  height: number;
  showSun?: boolean;
  groundHeight?: number;
  compactLandscape?: boolean;
}) {
  const hillHeight = Math.max(260, height - groundHeight + 28);

  return (
    <>
      <Svg
        pointerEvents="none"
        width="100%"
        height={hillHeight}
        viewBox="0 0 1000 520"
        preserveAspectRatio="none"
        style={{ position: 'absolute', left: 0, right: 0, top: 0 }}
      >
        <Path d="M0 0 H1000 V520 H0 Z" fill="#32b8dd" opacity="0.92" />
        <Path d="M0 0 H1000 V520 H0 Z" fill="#ffffff" opacity="0.18" />
        <G opacity="0.82" fill="#fffdf7">
          <Ellipse cx="118" cy="86" rx="58" ry="26" />
          <Ellipse cx="165" cy="77" rx="42" ry="28" />
          <Ellipse cx="210" cy="90" rx="56" ry="22" />
          <Ellipse cx="610" cy="86" rx="64" ry="24" />
          <Ellipse cx="670" cy="75" rx="46" ry="31" />
          <Ellipse cx="724" cy="91" rx="58" ry="22" />
          <Ellipse cx="385" cy="142" rx="54" ry="21" />
          <Ellipse cx="430" cy="132" rx="38" ry="26" />
          <Ellipse cx="475" cy="145" rx="50" ry="19" />
        </G>
        <Path
          d="M0 310 C120 238 250 248 370 296 C515 354 650 228 790 268 C900 300 962 250 1000 236 L1000 520 L0 520 Z"
          fill="#c7edb3"
          opacity="0.96"
        />
        <Path
          d="M0 366 C118 292 248 304 378 352 C510 402 644 304 792 326 C902 344 958 318 1000 296 L1000 520 L0 520 Z"
          fill="#8fce7d"
          opacity="0.93"
        />
        <Path
          d="M0 430 C170 372 295 404 430 426 C584 452 720 374 864 394 C936 404 980 380 1000 364 L1000 520 L0 520 Z"
          fill="#63ad5d"
          opacity="0.82"
        />
        <Path
          d="M0 476 C155 426 284 448 404 472 C548 504 710 426 862 446 C934 456 980 428 1000 410 L1000 520 L0 520 Z"
          fill="#3e8d4e"
          opacity="0.78"
        />
      </Svg>
      {showSun && (
        // A real sun, not a haze — the read-only garden deserves the same
        // bright morning as the tend view.
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: Math.max(20, width * 0.06),
            top: Math.max(22, height * 0.07),
            width: Math.min(150, width * 0.2),
            height: Math.min(150, width * 0.2),
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <View
            style={{
              position: 'absolute',
              width: '100%',
              height: '100%',
              borderRadius: 999,
              backgroundColor: 'rgba(255,229,110,0.35)',
              transform: [{ scale: 1.45 }],
            }}
          />
          <View
            style={{
              width: '78%',
              height: '78%',
              borderRadius: 999,
              backgroundColor: '#ffd95e',
              borderWidth: 3,
              borderColor: 'rgba(242,200,90,0.9)',
              shadowColor: '#f2c85a',
              shadowOpacity: 0.5,
              shadowRadius: 30,
              shadowOffset: { width: 0, height: 0 },
            }}
          />
        </View>
      )}
      {width > 0 && DISTANT_BLOOMS.map((bloom, index) => (
        <View
          pointerEvents="none"
          key={`distant-bloom-${index}`}
          style={{
            position: 'absolute',
            left: width * bloom.leftRatio,
            bottom: groundHeight + height * (compactLandscape
              ? 0.012 + bloom.bottomRatio * 0.22
              : bloom.bottomRatio),
            width: 2,
            height: bloom.height,
            borderRadius: 2,
            backgroundColor: 'rgba(94,126,82,0.46)',
            opacity: bloom.opacity,
          }}
        >
          <View
            style={{
              position: 'absolute',
              left: -3,
              top: -5,
              width: 8,
              height: 8,
              borderRadius: 999,
              backgroundColor: bloom.color,
              borderWidth: 1,
              borderColor: 'rgba(255,253,247,0.42)',
            }}
          />
        </View>
      ))}
    </>
  );
}

function renderStem({
  cx,
  baseY,
  topY,
  leafColor,
  strokeWidth,
  lean = 0,
}: {
  cx: number;
  baseY: number;
  topY: number;
  leafColor: string;
  strokeWidth: number;
  lean?: number;
}) {
  const midY = topY + (baseY - topY) * 0.52;
  const stemTopX = cx + lean;
  return (
    <>
      <Line
        x1={cx}
        y1={baseY}
        x2={stemTopX}
        y2={topY}
        stroke={leafColor}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
      <G transform={`rotate(-31 ${cx - 1} ${midY})`}>
        <Ellipse
          cx={cx - 7}
          cy={midY}
          rx={8.5}
          ry={3.8}
          fill={leafColor}
          opacity={0.78}
        />
      </G>
      <G transform={`rotate(29 ${cx + 2} ${midY + 9})`}>
        <Ellipse
          cx={cx + 8}
          cy={midY + 9}
          rx={7.5}
          ry={3.4}
          fill={leafColor}
          opacity={0.66}
        />
      </G>
    </>
  );
}

function renderFlowerCenterLabel({
  label,
  cx,
  cy,
  radius,
  category,
}: {
  label?: string;
  cx: number;
  cy: number;
  radius: number;
  category: SkillCategoryDef;
}) {
  if (!label) return null;

  const lines = getEmbeddedLabelLines(label);
  const longestLine = lines.reduce((longest, line) => Math.max(longest, line.length), 0);
  const fontSize = clamp(radius * (lines.length > 2 ? 0.23 : 0.27) - Math.max(0, longestLine - 9) * 0.12, 9, 14.5);
  const lineGap = fontSize * 1.02;
  const firstLineY = cy - ((lines.length - 1) * lineGap) / 2 + fontSize * 0.34;

  return (
    <SvgText
      fill={category.text}
      fontSize={fontSize}
      fontWeight="700"
      textAnchor="middle"
    >
      {lines.map((line, index) => (
        <TSpan
          key={`${line}-${index}`}
          x={cx}
          y={firstLineY + index * lineGap}
        >
          {line}
        </TSpan>
      ))}
    </SvgText>
  );
}

function renderDaisy(cx: number, cy: number, radius: number, full: boolean, category: SkillCategoryDef, label?: string) {
  const petalCount = 8;
  const petalFill = full ? category.color : category.pale;
  const alternateFill = full ? `${category.color}dd` : '#fffdf7';
  const centerRadius = clamp(radius * (full ? 0.68 : 0.62), 10, 46);
  return (
    <G>
      {Array.from({ length: petalCount }, (_, petal) => {
        const angle = petal * (360 / petalCount);
        return (
          <G key={petal} transform={`rotate(${angle} ${cx} ${cy})`}>
            <Ellipse
              cx={cx}
              cy={cy - radius * 0.72}
              rx={radius * 0.34}
              ry={radius * 0.58}
              fill={petal % 2 === 0 ? petalFill : alternateFill}
              stroke={category.edge}
              strokeWidth={1.1}
            />
          </G>
        );
      })}
      <Circle cx={cx} cy={cy} r={centerRadius} fill="#fffdf7" stroke={category.edge} strokeOpacity={0.42} strokeWidth={1.2} />
      <Circle cx={cx - centerRadius * 0.28} cy={cy - centerRadius * 0.32} r={centerRadius * 0.16} fill="#fff7c8" opacity={0.78} />
      {renderFlowerCenterLabel({ label, cx, cy, radius: centerRadius, category })}
    </G>
  );
}

function renderSunflower(cx: number, cy: number, radius: number, full: boolean) {
  const petalCount = full ? 18 : 12;
  return (
    <G>
      {Array.from({ length: petalCount }, (_, petal) => {
        const angle = petal * (360 / petalCount);
        const fill = petal % 2 === 0 ? '#f3c64f' : '#e6aa38';
        return (
          <G key={petal} transform={`rotate(${angle} ${cx} ${cy})`}>
            <Path
              d={`M ${cx} ${cy - radius * 0.18}
                C ${cx - radius * 0.18} ${cy - radius * 0.45}, ${cx - radius * 0.18} ${cy - radius * 0.95}, ${cx} ${cy - radius * 1.15}
                C ${cx + radius * 0.2} ${cy - radius * 0.94}, ${cx + radius * 0.19} ${cy - radius * 0.45}, ${cx} ${cy - radius * 0.18} Z`}
              fill={fill}
              stroke="#b8842d"
              strokeWidth={0.9}
            />
          </G>
        );
      })}
      <Circle cx={cx} cy={cy} r={radius * (full ? 0.43 : 0.36)} fill="#6a4423" stroke="#3d2717" strokeWidth={1.2} />
      {full && [0, 1, 2, 3, 4, 5].map(dot => (
        <Circle
          key={dot}
          cx={cx + Math.cos(dot * 1.2) * radius * 0.18}
          cy={cy + Math.sin(dot * 1.2) * radius * 0.18}
          r={radius * 0.035}
          fill="#d5a648"
          opacity={0.8}
        />
      ))}
    </G>
  );
}

function renderPoppy(cx: number, cy: number, radius: number, full: boolean, category: SkillCategoryDef) {
  const petalCount = full ? 5 : 4;
  const petalColor = full ? '#df6f5c' : '#e79582';
  return (
    <G>
      {Array.from({ length: petalCount }, (_, petal) => {
        const angle = petal * (360 / petalCount) + (full ? 8 : 0);
        return (
          <G key={petal} transform={`rotate(${angle} ${cx} ${cy})`}>
            <Path
              d={`M ${cx} ${cy + radius * 0.06}
                C ${cx - radius * 0.58} ${cy - radius * 0.2}, ${cx - radius * 0.52} ${cy - radius * 0.98}, ${cx - radius * 0.04} ${cy - radius * 1.04}
                C ${cx + radius * 0.48} ${cy - radius * 1.08}, ${cx + radius * 0.62} ${cy - radius * 0.24}, ${cx} ${cy + radius * 0.06} Z`}
              fill={petalColor}
              stroke={category.edge}
              strokeWidth={1}
            />
          </G>
        );
      })}
      <Circle cx={cx} cy={cy} r={radius * 0.28} fill="#493126" stroke="#2c1e18" strokeWidth={1.1} />
      <Circle cx={cx - radius * 0.06} cy={cy - radius * 0.05} r={radius * 0.06} fill="#f2d474" opacity={0.74} />
    </G>
  );
}

function renderLavender(cx: number, cy: number, radius: number, full: boolean, category: SkillCategoryDef) {
  const floretCount = full ? 9 : 6;
  const spikeHeight = radius * (full ? 1.85 : 1.45);
  const startY = cy + radius * 0.58;
  return (
    <G>
      <Line
        x1={cx}
        y1={startY + radius * 0.18}
        x2={cx}
        y2={startY - spikeHeight}
        stroke={category.leaf}
        strokeWidth={1.6}
        strokeLinecap="round"
      />
      {Array.from({ length: floretCount }, (_, floret) => {
        const y = startY - floret * (spikeHeight / floretCount);
        const side = floret % 2 === 0 ? -1 : 1;
        const scale = 1 - floret * 0.035;
        return (
          <G key={floret} transform={`rotate(${side * 18} ${cx} ${y})`}>
            <Ellipse
              cx={cx + side * radius * 0.22}
              cy={y}
              rx={radius * 0.16 * scale}
              ry={radius * 0.28 * scale}
              fill={floret % 3 === 0 ? '#bda6eb' : category.color}
              stroke={category.edge}
              strokeWidth={0.8}
            />
            {full && (
              <Ellipse
                cx={cx - side * radius * 0.1}
                cy={y + radius * 0.08}
                rx={radius * 0.12 * scale}
                ry={radius * 0.22 * scale}
                fill={category.pale}
                stroke={category.edge}
                strokeWidth={0.7}
              />
            )}
          </G>
        );
      })}
    </G>
  );
}

function renderBloom(species: WildflowerSpecies, cx: number, cy: number, radius: number, full: boolean, category: SkillCategoryDef, label?: string) {
  return renderDaisy(cx, cy, radius, full, category, label);
}

function WildflowerSvg({
  level,
  species,
  category,
  label,
  sizeScale = 1,
}: {
  level: number;
  species: WildflowerSpecies;
  category: SkillCategoryDef;
  label?: string;
  sizeScale?: number;
}) {
  const stage = getStage(level);
  const bloomStep = getBloomStep(level);
  const canvasWidth = stage.canvasWidth;
  const canvasHeight = getStageCanvasHeight(stage);
  const cx = canvasWidth / 2;
  const baseY = canvasHeight - 4;
  const leaf = category.leaf;

  if (bloomStep === 0) {
    return (
      <Svg width={canvasWidth * sizeScale} height={canvasHeight * sizeScale} viewBox={`0 0 ${canvasWidth} ${canvasHeight}`}>
        <Ellipse cx={cx} cy={baseY - 2} rx={5.2} ry={3.6} fill="#5b3a22" stroke="#2d1c12" strokeWidth={1} />
        <Ellipse cx={cx - 1.4} cy={baseY - 3.4} rx={1.4} ry={0.9} fill="#b98f5e" opacity={0.7} />
      </Svg>
    );
  }

  const full = bloomStep >= 3;
  const bloomRadius = [0, 34, 58, 84][bloomStep] ?? 58;
  const stemLift = [0, 72, 108, 132][bloomStep] ?? 108;
  const topY = baseY - stemLift;
  const flowerX = cx + (species === 'poppy' ? -3 : species === 'lavender' ? 2 : 0);
  const flowerY = topY;

  return (
    <Svg width={canvasWidth * sizeScale} height={canvasHeight * sizeScale} viewBox={`0 0 ${canvasWidth} ${canvasHeight}`}>
      {renderStem({ cx, baseY, topY: flowerY + bloomRadius * 0.25, leafColor: leaf, strokeWidth: 2 + bloomStep * 0.22, lean: flowerX - cx })}
      {renderBloom(species, flowerX, flowerY, bloomRadius, full, category, label)}
    </Svg>
  );
}

function WildflowerSprite({
  level,
  category,
  swaySalt,
  label,
  sizeScale = 1,
}: {
  level: number;
  category: SkillCategoryDef;
  swaySalt: string;
  label?: string;
  sizeScale?: number;
}) {
  const stage = getStage(level);
  const bloomStep = getBloomStep(level);
  const species: WildflowerSpecies = 'daisy';
  const spriteScale = bloomStep >= 3 ? 1.04 : 1;
  const renderedScale = sizeScale * spriteScale;
  const canvasHeight = getStageCanvasHeight(stage);
  const shouldSway = Platform.OS === 'web' && bloomStep >= 3;
  const swayDelay = -Math.round(ratioFromHash(swaySalt, 4) * 2600);
  const swayDuration = 3300 + Math.round(ratioFromHash(swaySalt, 5) * 1200);

  return (
    <View
      pointerEvents="none"
      style={{
        width: stage.canvasWidth * renderedScale,
        height: canvasHeight * renderedScale,
        alignItems: 'center',
        justifyContent: 'flex-end',
        overflow: 'visible',
      }}
    >
      <View
        className={shouldSway ? 'wildflower-sway' : undefined}
        style={{
          ...(shouldSway
            ? ({
                animationDelay: `${swayDelay}ms`,
                animationDuration: `${swayDuration}ms`,
                transformOrigin: '50% 100%',
              } as any)
            : {}),
          width: stage.canvasWidth * renderedScale,
          height: canvasHeight * renderedScale,
          alignItems: 'center',
          justifyContent: 'flex-end',
        }}
      >
        <WildflowerSvg
          level={level}
          species={species}
          category={category}
          label={bloomStep >= 1 ? label : undefined}
          sizeScale={renderedScale}
        />
      </View>
    </View>
  );
}

function SeedMark({
  category,
  size = 18,
  muted = false,
}: {
  category: SkillCategoryDef;
  size?: number;
  muted?: boolean;
}) {
  const fill = muted ? '#8f7f70' : '#8f4f2e';
  const stroke = muted ? '#7c6c5d' : category.edge;
  const highlight = muted ? 'rgba(228,205,182,0.36)' : 'rgba(198,119,74,0.72)';

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <G transform="rotate(-18 12 12)">
        <Path
          d="M4.4 14.9 C5.9 8.2 13.4 3.5 20.1 5.3 C20.5 11.9 14.4 19.5 7 18.5 C5.1 18.2 4 16.8 4.4 14.9 Z"
          fill={fill}
          stroke={stroke}
          strokeWidth={1.2}
        />
        <Path
          d="M8.2 14.5 C10.8 10.9 14.4 8.7 17.8 8.2"
          stroke={highlight}
          strokeWidth={1.4}
          strokeLinecap="round"
          fill="none"
          opacity={0.86}
        />
      </G>
    </Svg>
  );
}

function BloomMark({
  category,
  size = 18,
  muted = false,
}: {
  category: SkillCategoryDef;
  size?: number;
  muted?: boolean;
}) {
  const color = muted ? '#eef6f0' : category.pale;
  const edge = muted ? 'rgba(115,154,136,0.28)' : category.edge;
  const center = muted ? '#d5dfd8' : category.center;

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {[0, 45, 90, 135, 180, 225, 270, 315].map(angle => (
        <G key={angle} transform={`rotate(${angle} 12 12)`}>
          <Ellipse cx="12" cy="6" rx="3.4" ry="5.6" fill={color} stroke={edge} strokeWidth="1" />
        </G>
      ))}
      <Circle cx="12" cy="12" r="4.2" fill={center} stroke={edge} strokeWidth="1" />
    </Svg>
  );
}

function SunRayBackground({ size = 250 }: { size?: number }) {
  const center = size / 2;
  const rayAngles = Array.from({ length: 14 }, (_, index) => index * (360 / 14));
  const coreRadius = size * 0.368;
  const glowRadius = size * 0.168;

  return (
    <Svg
      pointerEvents="none"
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
      }}
    >
      {rayAngles.map((angle, index) => (
        <G key={angle} transform={`rotate(${angle} ${center} ${center})`}>
          <Ellipse
            cx={center}
            cy={size * 0.08}
            rx={index % 2 === 0 ? size * 0.032 : size * 0.02}
            ry={index % 2 === 0 ? size * 0.088 : size * 0.056}
            fill={index % 2 === 0 ? '#ffe86b' : '#ffd45a'}
            opacity={0.7}
          />
        </G>
      ))}
      <Circle cx={center} cy={center} r={coreRadius} fill="#ffe36d" opacity={0.86} />
      <Circle cx={center - size * 0.088} cy={center - size * 0.104} r={glowRadius} fill="#fff6a8" opacity={0.28} />
    </Svg>
  );
}

function GroundStrip({ width, height = GROUND_HEIGHT }: { width: number; height?: number }) {
  return (
    <View
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        height,
        borderTopWidth: 1,
        borderTopColor: 'rgba(255,253,247,0.18)',
        backgroundColor: '#2f7d4d',
        overflow: 'hidden',
        ...(Platform.OS === 'web'
          ? ({
            backgroundImage: [
                'linear-gradient(180deg, rgba(91,171,78,0.96) 0px, rgba(61,143,75,0.98) 42px, rgba(34,103,63,1) 100%)',
                'radial-gradient(circle at 12% 48%, rgba(255,228,104,0.38) 0 2px, transparent 3px)',
                'radial-gradient(circle at 76% 54%, rgba(245,160,204,0.28) 0 2px, transparent 3px)',
              ].join(', '),
              backgroundSize: 'auto, 44px 34px, 52px 40px',
            } as any)
          : {}),
      }}
    >
      <View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: 0,
          height: 28,
          backgroundColor: 'rgba(128,204,84,0.78)',
          ...(Platform.OS === 'web'
            ? ({
                backgroundImage: 'linear-gradient(180deg, rgba(143,214,95,0.96), rgba(72,157,78,0.9))',
              } as any)
            : {}),
        }}
      />
      {SOIL_SPECKS.map((speck, index) => (
        <View
          key={index}
          style={{
            position: 'absolute',
            left: width * speck.leftRatio,
            bottom: speck.bottom,
            width: speck.size,
            height: speck.size,
            borderRadius: speck.size,
            backgroundColor: index % 3 === 0 ? '#ffe06d' : index % 3 === 1 ? '#f5a5cc' : '#c7edb3',
            opacity: speck.opacity * 1.2,
          }}
        />
      ))}
      {GRASS_BLADES.map((blade, index) => (
        <View
          key={index}
          style={{
            position: 'absolute',
            left: width * blade.leftRatio,
            bottom: blade.bottom,
            width: 1.5,
            height: blade.height + 18,
            borderRadius: 1,
            backgroundColor: index % 4 === 0 ? '#b6e26f' : '#245e3c',
            opacity: blade.opacity + 0.18,
            transform: [{ rotate: blade.rotate }],
          }}
        />
      ))}
    </View>
  );
}

function GardenBee({
  matchCount,
  skillDescription,
  onPress,
  compact = false,
}: {
  matchCount: number;
  skillDescription: string;
  onPress: () => void;
  compact?: boolean;
}) {
  const hover = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(hover, {
          toValue: 1,
          duration: 1350 + (hashString(skillDescription) % 500),
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(hover, {
          toValue: 0,
          duration: 1350 + (hashString(skillDescription) % 500),
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [hover, skillDescription]);

  const translateY = hover.interpolate({ inputRange: [0, 1], outputRange: [0, -5] });

  return (
    <Animated.View style={{ transform: [{ translateY }] }}>
      <Pressable
        onPress={onPress}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={`${skillDescription} matches ${matchCount} community ${matchCount === 1 ? 'wish' : 'wishes'}`}
        style={{
          alignItems: 'center',
          justifyContent: 'center',
          ...(Platform.OS === 'web'
            ? ({
                cursor: 'pointer',
                userSelect: 'none',
                WebkitUserSelect: 'none',
                outlineStyle: 'none',
              } as any)
            : {}),
        }}
      >
        <Text selectable={false} style={{ fontSize: compact ? 13 : 17, lineHeight: compact ? 15 : 20 }}>
          🐝
        </Text>
      </Pressable>
    </Animated.View>
  );
}

function SkillPlant({
  skill,
  index,
  count,
  width,
  height,
  editable,
  onUpdateSkill,
  onDeleteSkill,
  selected,
  featured,
  onSelect,
  onReturnToSeed,
  justPlanted,
  entryOriginX,
  onEntryComplete,
  compactLandscape,
  groundHeight,
  plantScale,
  depthLiftRange,
  layoutOverride,
  beeWishes,
  onBeePress,
  flowerSummary,
  onFlowerPress,
  visitorCanFlower,
}: SkillBubbleGardenProps & {
  skill: GardenSkill;
  index: number;
  count: number;
  width: number;
  height: number;
  selected: boolean;
  featured: boolean;
  onSelect: (skillId: string) => void;
  onReturnToSeed: (skill: GardenSkill, slotIndex: number) => void;
  justPlanted: boolean;
  entryOriginX?: number;
  onEntryComplete: (skill: GardenSkill) => void;
  compactLandscape: boolean;
  groundHeight: number;
  /** Base scale for every bloom, divided out by how many share the pane. */
  plantScale?: number;
  /** Vertical room the depth bands spread across. */
  depthLiftRange?: number;
  layoutOverride?: BouquetPlantLayout;
  beeWishes?: MatchedWish[];
  onBeePress?: (skill: GardenSkill, slotIndex: number) => void;
  /** Sunflowers this bloom is wearing, if any (garden visits, 2026-08-12). */
  flowerSummary?: SkillFlowerSummary;
  /** Opens the sunflower popover for this bloom. */
  onFlowerPress?: (skill: GardenSkill, slotIndex: number) => void;
  /** True when the viewer may leave a 🌻 here — i.e. this is somebody else's garden. */
  visitorCanFlower?: boolean;
}) {
  const level = getLevel(skill);
  const bloomStep = getBloomStep(level);
  const stage = getStage(level);
  const category = getCategoryForSkill(skill.description);
  const depthBandForScale = layoutOverride || compactLandscape || width < 520 ? 0 : getDepthBand(index);
  const rowScale = layoutOverride?.scale
    ?? (plantScale !== undefined
      ? plantScale * getDepthScaleFactor(depthBandForScale)
      : getPlantScale(width, compactLandscape, index));
  // Which depth band this plant sits in, so size, haze and draw order all
  // agree. Overridden layouts (the read-only bouquet) are flat by design.
  const depthBand = layoutOverride || compactLandscape || width < 520 ? 0 : getDepthBand(index);
  const bloomHasEmbeddedLabel = bloomStep > 0;
  const showLabel = !bloomHasEmbeddedLabel && (selected || count <= 10 || featured);
  const plantWidth = stage.labelWidth * rowScale;
  const spriteHeight = getStageCanvasHeight(stage) * rowScale * (bloomStep >= 3 ? 1.04 : 1);
  const plantHeight = spriteHeight + (showLabel ? LABEL_HEIGHT : 8);
  const centerX = layoutOverride?.centerX ?? getFrontRowCenterX(index, count, width);
  const anchorY = layoutOverride?.anchorY
    ?? getFrontRowAnchorY(height, width, index, compactLandscape, groundHeight, depthLiftRange);
  const left = clamp(centerX - plantWidth / 2, -plantWidth * 0.28, Math.max(-plantWidth * 0.28, width - plantWidth * 0.72));
  const top = clamp(anchorY - plantHeight, 6, Math.max(6, height - plantHeight - 4));
  const labelFont = clamp(12 * rowScale - Math.max(0, skill.description.length - 22) * 0.06, 8.4, 12);
  const pan = useRef(new Animated.ValueXY()).current;
  const grow = useRef(new Animated.Value(0)).current;
  const depart = useRef(new Animated.Value(0)).current;
  const dragStart = useRef({ left, top });
  const didDrag = useRef(false);
  const [isReseeding, setIsReseeding] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const hoverOutTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const canDrag = false;
  const waterSplash = useRef(new Animated.Value(0)).current;
  const capWiggle = useRef(new Animated.Value(0)).current;
  const toastAnim = useRef(new Animated.Value(0)).current;
  const [isSplashing, setIsSplashing] = useState(false);
  const [showBloomToast, setShowBloomToast] = useState(false);

  useEffect(() => {
    grow.stopAnimation();
    depart.setValue(0);
    grow.setValue(justPlanted ? 0 : 0.34);
    // Genie-out on plant (seed → flower), and the same growth spring replays
    // whenever the enthusiasm level changes (e.g. watering).
    Animated.timing(grow, {
      toValue: 1,
      useNativeDriver: true,
      duration: justPlanted ? 660 : 520,
      easing: justPlanted ? Easing.bezier(0.18, 0.84, 0.08, 1) : Easing.out(Easing.cubic),
    }).start(({ finished }) => {
      if (finished && justPlanted) {
        onEntryComplete(skill);
      }
    });
  }, [depart, grow, justPlanted, level, onEntryComplete, skill.id, skill.description]);

  useEffect(() => () => {
    if (hoverOutTimer.current) {
      clearTimeout(hoverOutTimer.current);
    }
  }, []);

  const showHoverControls = () => {
    if (hoverOutTimer.current) {
      clearTimeout(hoverOutTimer.current);
      hoverOutTimer.current = null;
    }
    setIsHovered(true);
  };

  const hideHoverControls = () => {
    if (hoverOutTimer.current) {
      clearTimeout(hoverOutTimer.current);
    }
    hoverOutTimer.current = setTimeout(() => {
      setIsHovered(false);
      hoverOutTimer.current = null;
    }, 220);
  };

  const responder = useMemo(
    () => PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) =>
        canDrag && Math.abs(gesture.dx) + Math.abs(gesture.dy) > 4,
      onMoveShouldSetPanResponderCapture: (_, gesture) =>
        canDrag && Math.abs(gesture.dx) + Math.abs(gesture.dy) > 4,
      onPanResponderGrant: () => {
        didDrag.current = false;
        dragStart.current = { left, top };
      },
      onPanResponderMove: (_, gesture) => {
        if (Math.abs(gesture.dx) + Math.abs(gesture.dy) > 4) {
          didDrag.current = true;
        }
        pan.setValue({ x: gesture.dx, y: gesture.dy });
      },
      onPanResponderRelease: (_, gesture) => {
        if (!canDrag || !onUpdateSkill) return;
        const nextLeft = clamp(dragStart.current.left + gesture.dx, FIELD_SIDE_PADDING, Math.max(FIELD_SIDE_PADDING, width - plantWidth - FIELD_SIDE_PADDING));
        const nextTop = clamp(dragStart.current.top + gesture.dy, 2, Math.max(2, height - plantHeight - 2));
        pan.setValue({ x: 0, y: 0 });
        onUpdateSkill(skill, {
          display_x: Number(((nextLeft + plantWidth / 2) / width).toFixed(4)),
          display_y: Number(((nextTop + plantHeight) / height).toFixed(4)),
        });
        setTimeout(() => {
          didDrag.current = false;
        }, 0);
      },
      onPanResponderTerminate: () => {
        pan.setValue({ x: 0, y: 0 });
        didDrag.current = false;
      },
      onPanResponderTerminationRequest: () => false,
    }),
    [canDrag, height, left, onUpdateSkill, pan, plantHeight, plantWidth, skill, top, width]
  );

  const beginReseed = () => {
    if (!editable || !onUpdateSkill || isReseeding) return;

    const returnSlotIndex = getSeedSlotIndexForCenterX(centerX, width);
    setIsReseeding(true);
    setIsHovered(false);
    onSelect(skill.id);
    depart.setValue(0);
    // Genie-in (flower → seed): petals fold, the plant streams down toward
    // the seed slot it returns to, and lands with a tiny puff.
    Animated.timing(depart, {
      toValue: 1,
      useNativeDriver: true,
      // 700ms was a long time to watch for something you do repeatedly. The
      // curve holds through the neck, then accelerates down the stem.
      duration: 520,
      easing: Easing.bezier(0.6, 0, 0.2, 1),
    }).start(({ finished }) => {
      if (finished) {
        onReturnToSeed(skill, returnSlotIndex);
        onUpdateSkill(skill, {
          enthusiasm_level: 0,
        });
      }
      setIsReseeding(false);
    });
  };

  const cycleLevel = () => {
    onSelect(skill.id);
    // Visiting someone else's garden: a tap on a bloom used to do nothing at
    // all (the Pressable was disabled), so the sunflower offer steals nothing —
    // it gives the tap its first meaning (garden visits, 2026-08-12).
    if (!editable && visitorCanFlower && onFlowerPress) {
      onFlowerPress(skill, index);
      return;
    }
    if (!editable || !onUpdateSkill) return;
    if (didDrag.current) {
      didDrag.current = false;
      return;
    }

    const nextLevel = getNextBloomLevel(level);
    if (isReseeding) {
      return;
    }

    onUpdateSkill(skill, {
      enthusiasm_level: nextLevel,
    });
  };

  const playWaterSplash = () => {
    setIsSplashing(true);
    waterSplash.setValue(0);
    Animated.timing(waterSplash, {
      toValue: 1,
      useNativeDriver: true,
      duration: 620,
      easing: Easing.out(Easing.quad),
    }).start(() => setIsSplashing(false));
  };

  const waterPlant = () => {
    if (!editable || !onUpdateSkill || isReseeding) return;
    onSelect(skill.id);

    if (level >= 5) {
      // Already fully bloomed: a gentle happy wiggle + micro-toast, no growth.
      capWiggle.setValue(0);
      Animated.timing(capWiggle, {
        toValue: 1,
        useNativeDriver: true,
        duration: 480,
        easing: Easing.inOut(Easing.quad),
      }).start();
      setShowBloomToast(true);
      toastAnim.setValue(0);
      Animated.sequence([
        Animated.timing(toastAnim, { toValue: 1, duration: 200, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.delay(1150),
        Animated.timing(toastAnim, { toValue: 0, duration: 240, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
      ]).start(() => setShowBloomToast(false));
      return;
    }

    playWaterSplash();
    // Optimistic: the parent updates local state immediately, which bumps
    // `level` and replays the growth spring in the entry effect above.
    onUpdateSkill(skill, {
      enthusiasm_level: clamp(level + 1, 1, 5),
    });
  };

  const showReseedButton = editable && !isReseeding && (isHovered || selected);
  const showWaterButton = editable && Boolean(onUpdateSkill) && bloomStep > 0 && !isReseeding;
  const entryLift = justPlanted ? Math.max(compactLandscape ? 124 : 230, groundHeight * 2.28) : 32;
  const soilDrop = Math.max(compactLandscape ? 108 : 168, height - top - groundHeight * 0.02 - plantHeight * 0.44);
  const entryOriginOffset = justPlanted && entryOriginX !== undefined
    ? entryOriginX * width - centerX
    : 0;
  const entryTranslateX = grow.interpolate({ inputRange: [0, 1], outputRange: [entryOriginOffset, 0] });
  const entryTranslateY = justPlanted
    ? grow.interpolate({
        inputRange: [0, 0.18, 0.42, 0.68, 0.86, 1],
        outputRange: [entryLift, entryLift * 0.74, entryLift * 0.26, -8, 3, 0],
      })
    : grow.interpolate({ inputRange: [0, 1], outputRange: [entryLift, 0] });
  // Planting is the exit run backwards: the seed lands, a stem rises out of it,
  // then the head opens. The old curve stretched to 1.9x tall while 8% wide —
  // a thin spike that sprang, which read as a boing rather than a growing
  // thing (Nat 2026-07-26). Width now trails height, the way a plant actually
  // does it, and the overshoot is a settle rather than a bounce.
  const entryScaleX = justPlanted
    ? grow.interpolate({
        inputRange: [0, 0.18, 0.42, 0.68, 0.86, 1],
        outputRange: [0.22, 0.28, 0.4, 0.82, 1.06, 1],
      })
    : grow.interpolate({ inputRange: [0, 0.42, 0.74, 1], outputRange: [0.78, 0.62, 1.06, 1] });
  const entryScaleY = justPlanted
    ? grow.interpolate({
        inputRange: [0, 0.18, 0.42, 0.68, 0.86, 1],
        outputRange: [0.12, 0.34, 0.78, 1.04, 1.02, 1],
      })
    : grow.interpolate({ inputRange: [0, 0.42, 0.74, 1], outputRange: [0.76, 1.12, 0.98, 1] });
  const entryOpacity = justPlanted
    ? grow.interpolate({ inputRange: [0, 0.04, 0.18, 1], outputRange: [0.38, 0.68, 1, 1] })
    : grow.interpolate({ inputRange: [0, 0.16, 0.52, 1], outputRange: [0.72, 0.86, 1, 1] });
  // Two beats, not one slide. Beat one (to 0.3): the flower NECKS — narrows
  // while keeping its height, the way a genie starts entering the lamp. Beat
  // two: it's drawn down the stem toward its seed slot, base first.
  //
  // It used to shrink and slide at the same time, collapsing to a 2.5% sliver
  // that stayed fully opaque until the very end — so you watched it become a
  // squashed streak and then blink out. It now arrives at a quarter size,
  // still recognisably a flower, and the puff hides the last of it.
  const departTranslateY = depart.interpolate({
    inputRange: [0, 0.3, 0.55, 0.78, 1],
    outputRange: [0, soilDrop * 0.04, soilDrop * 0.34, soilDrop * 0.74, soilDrop],
  });
  const departScaleX = depart.interpolate({
    inputRange: [0, 0.3, 0.55, 0.78, 1],
    outputRange: [1, 0.46, 0.36, 0.3, 0.24],
  });
  const departScaleY = depart.interpolate({
    inputRange: [0, 0.3, 0.55, 0.78, 1],
    outputRange: [1, 0.94, 0.68, 0.42, 0.24],
  });
  // Holds its colour almost the whole way, then goes as the puff lands.
  const departOpacity = depart.interpolate({ inputRange: [0, 0.72, 0.92, 1], outputRange: [1, 1, 0.5, 0] });
  // Drift horizontally toward the seed slot this flower returns to, so the
  // eye can follow it from bloom back into the tray.
  const returnSlotDriftX = width > 0
    ? getFrontRowCenterX(getSeedSlotIndexForCenterX(centerX, width), GARDEN_CAPACITY, width) - centerX
    : 0;
  const departTranslateX = depart.interpolate({
    inputRange: [0, 0.35, 1],
    outputRange: [0, returnSlotDriftX * 0.22, returnSlotDriftX],
  });
  // The puff punctuates the ARRIVAL. It used to fire at 76-100%, by which
  // point the flower had already gone, so the landing had no full stop.
  const puffOpacity = depart.interpolate({ inputRange: [0, 0.62, 0.8, 1], outputRange: [0, 0, 0.95, 0] });
  const puffScale = depart.interpolate({ inputRange: [0, 0.62, 1], outputRange: [0.25, 0.45, 1.6] });
  const wiggleRotate = capWiggle.interpolate({
    inputRange: [0, 0.2, 0.45, 0.7, 1],
    outputRange: ['0deg', '-3deg', '2.4deg', '-1.4deg', '0deg'],
  });
  const dropletTranslateY = waterSplash.interpolate({ inputRange: [0, 0.55, 1], outputRange: [-16, 4, 0] });
  const dropletOpacity = waterSplash.interpolate({ inputRange: [0, 0.08, 0.42, 0.58, 1], outputRange: [0, 1, 1, 0, 0] });
  const sparkleOpacity = waterSplash.interpolate({ inputRange: [0, 0.5, 0.68, 0.86, 1], outputRange: [0, 0, 1, 0.9, 0] });
  const sparkleScale = waterSplash.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.4, 0.5, 1.35] });
  const toastOpacity = toastAnim;
  const toastTranslateY = toastAnim.interpolate({ inputRange: [0, 1], outputRange: [6, -4] });

  const label = showLabel ? (
    <View
      style={{
        minHeight: 22,
        maxWidth: plantWidth - 10,
        paddingHorizontal: 7,
        paddingVertical: 3,
        borderRadius: 10,
        backgroundColor: level === 0
          ? 'rgba(75,49,29,0.68)'
          : 'rgba(255,253,247,0.78)',
        borderWidth: 1,
        borderColor: level === 0
          ? 'rgba(217,190,139,0.24)'
          : 'rgba(154,129,81,0.18)',
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: category.edge,
        shadowOpacity: 0.02,
        shadowRadius: 2,
        shadowOffset: { width: 0, height: 2 },
      }}
    >
      <Text
        selectable={false}
        numberOfLines={2}
        style={{
          fontFamily: 'Lato_700Bold',
          color: level === 0 ? '#f8eee2' : category.text,
          fontSize: labelFont,
          lineHeight: labelFont * 1.12,
          textAlign: 'center',
          opacity: 0.94,
          ...(Platform.OS === 'web'
            ? ({
                userSelect: 'none',
                WebkitUserSelect: 'none',
              } as any)
            : {}),
        }}
      >
        {skill.description}
      </Text>
    </View>
  ) : null;

  return (
    <>
    <Animated.View
      {...responder.panHandlers}
      style={{
        position: 'absolute',
        left,
        top,
        // Draw order follows depth, not insertion order. It used to be
        // `20 + index`, which let a flower standing further back paint on top
        // of one in front of it.
        zIndex: selected ? 90 : 20 + (MAX_DEPTH_BAND - depthBand) * 12 + (index % 12),
        transform: [
          { translateX: Animated.add(Animated.add(pan.x, entryTranslateX), departTranslateX) },
          { translateY: Animated.add(Animated.add(pan.y, entryTranslateY), departTranslateY) },
          { scaleX: entryScaleX },
          { scaleY: entryScaleY },
          { scaleX: departScaleX },
          { scaleY: departScaleY },
        ],
        // Haze with distance — the quiet half of the depth illusion.
        opacity: Animated.multiply(
          Animated.multiply(entryOpacity, departOpacity),
          getDepthOpacity(depthBand)
        ),
        // Scale from the ROOT, not the middle. This lived in the web-only
        // block, so the browser folded a flower into its base while the iOS
        // app squashed it about its centre — same code, two animations
        // (Nat 2026-07-26). React Native supports transformOrigin natively.
        transformOrigin: '50% 100%',
        ...(Platform.OS === 'web'
          ? ({
              cursor: editable || (visitorCanFlower && onFlowerPress) ? 'pointer' : 'default',
              userSelect: 'none',
              WebkitUserSelect: 'none',
              touchAction: 'manipulation',
              filter: selected ? 'drop-shadow(0 10px 16px rgba(77, 58, 34, 0.18))' : undefined,
              transitionProperty: 'left, top',
              transitionDuration: compactLandscape ? '420ms' : '920ms',
              transitionTimingFunction: 'cubic-bezier(0.18, 0.9, 0.16, 1)',
            } as any)
          : {}),
      }}
    >
      <Pressable
        onPress={cycleLevel}
        onLongPress={beginReseed}
        delayLongPress={620}
        onHoverIn={showHoverControls}
        onHoverOut={hideHoverControls}
        disabled={(!editable && !(visitorCanFlower && onFlowerPress)) || isReseeding}
        accessibilityRole={editable || (visitorCanFlower && onFlowerPress) ? 'button' : undefined}
        accessibilityLabel={
          !editable && visitorCanFlower && onFlowerPress
            ? `${skill.description}, ${stage.label}. Leave a sunflower`
            : `${skill.description}, ${stage.label}`
        }
        style={{
          width: plantWidth,
          height: plantHeight,
          alignItems: 'center',
          justifyContent: 'flex-end',
          paddingHorizontal: 4,
          ...(Platform.OS === 'web'
            ? ({
                userSelect: 'none',
                WebkitUserSelect: 'none',
                touchAction: 'manipulation',
                transitionProperty: 'width, height',
                transitionDuration: compactLandscape ? '420ms' : '920ms',
                transitionTimingFunction: 'cubic-bezier(0.18, 0.9, 0.16, 1)',
              } as any)
            : {}),
        }}
      >
        <Animated.View
          style={{
            width: plantWidth,
            height: spriteHeight,
            alignItems: 'center',
            justifyContent: 'flex-end',
            transform: [{ rotate: wiggleRotate }],
          }}
        >
          <WildflowerSprite
            level={level}
            category={category}
            swaySalt={`${skill.id}:${skill.description}`}
            label={skill.description}
            sizeScale={rowScale}
          />
        </Animated.View>

        {label}
      </Pressable>
      {isSplashing && (
        <Animated.View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: plantWidth / 2 - 9,
            top: Math.max(0, plantHeight * 0.16),
            zIndex: 40,
            transform: [{ translateY: dropletTranslateY }],
          }}
        >
          <Animated.Text selectable={false} style={{ fontSize: 16, lineHeight: 19, opacity: dropletOpacity }}>
            💧
          </Animated.Text>
          <Animated.Text
            selectable={false}
            style={{
              position: 'absolute',
              fontSize: 16,
              lineHeight: 19,
              opacity: sparkleOpacity,
              transform: [{ scale: sparkleScale }],
            }}
          >
            ✨
          </Animated.Text>
        </Animated.View>
      )}
      {showBloomToast && (
        <Animated.View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: 0,
            alignItems: 'center',
            zIndex: 50,
            opacity: toastOpacity,
            transform: [{ translateY: toastTranslateY }],
          }}
        >
          <View
            style={{
              borderRadius: 999,
              backgroundColor: 'rgba(255,253,247,0.94)',
              borderWidth: 1,
              borderColor: 'rgba(154,129,81,0.24)',
              paddingHorizontal: 9,
              paddingVertical: 4,
              shadowColor: '#4d3a22',
              shadowOpacity: 0.14,
              shadowRadius: 6,
              shadowOffset: { width: 0, height: 2 },
            }}
          >
            <Text
              selectable={false}
              style={{ fontFamily: 'Lato_700Bold', color: category.text, fontSize: 10.5, lineHeight: 13 }}
            >
              Fully bloomed! 🌸
            </Text>
          </View>
        </Animated.View>
      )}
      {beeWishes && beeWishes.length > 0 && bloomStep > 0 && !isReseeding && onBeePress && (
        <View
          style={{
            position: 'absolute',
            left: Math.max(2, plantWidth * 0.1),
            top: Math.max(0, plantHeight * 0.03),
          }}
        >
          <GardenBee
            matchCount={beeWishes.length}
            skillDescription={skill.description}
            compact={compactLandscape}
            onPress={() => onBeePress(skill, index)}
          />
        </View>
      )}
      {/* Sunflowers visitors left (garden visits, 2026-08-12). Tucked on the
          lower-left edge: the bee owns the top-left, and the reseed and water
          buttons own the right side of an editable garden, so this corner is
          free in every mode and the bubble layout stays untouched. */}
      {flowerSummary && flowerSummary.count > 0 && !isReseeding && (
        <Pressable
          onPress={(event) => {
            event.stopPropagation?.();
            onFlowerPress?.(skill, index);
          }}
          disabled={!onFlowerPress}
          hitSlop={6}
          accessibilityRole={onFlowerPress ? 'button' : undefined}
          accessibilityLabel={`${skill.description} has ${flowerSummary.count} ${flowerSummary.count === 1 ? 'sunflower' : 'sunflowers'} from garden visitors`}
          style={{
            position: 'absolute',
            left: Math.max(4, plantWidth * 0.12),
            bottom: showLabel ? LABEL_HEIGHT + 4 : 8,
            minWidth: 26,
            height: 26,
            borderRadius: 999,
            backgroundColor: 'rgba(255,253,247,0.92)',
            borderWidth: 1,
            borderColor: 'rgba(201,135,31,0.32)',
            paddingHorizontal: 5,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 2,
            shadowColor: '#4d3a22',
            shadowOpacity: 0.14,
            shadowRadius: 6,
            shadowOffset: { width: 0, height: 2 },
            ...(Platform.OS === 'web'
              ? ({
                  cursor: onFlowerPress ? 'pointer' : 'default',
                  userSelect: 'none',
                  WebkitUserSelect: 'none',
                  outlineStyle: 'none',
                } as any)
              : {}),
          }}
        >
          <Text selectable={false} style={{ fontSize: 12, lineHeight: 15 }}>
            🌻
          </Text>
          {flowerSummary.count > 1 && (
            <Text
              selectable={false}
              style={{ fontFamily: 'Lato_700Bold', color: '#8a5a16', fontSize: 10.5, lineHeight: 13 }}
            >
              {flowerSummary.count}
            </Text>
          )}
        </Pressable>
      )}
      {showReseedButton && (
        <Pressable
          onPress={(event) => {
            event.stopPropagation?.();
            beginReseed();
          }}
          onHoverIn={showHoverControls}
          onHoverOut={hideHoverControls}
          accessibilityRole="button"
          accessibilityLabel={`Reseed ${skill.description}`}
          style={{
            position: 'absolute',
            right: Math.max(8, plantWidth * 0.14),
            top: Math.max(4, plantHeight * 0.06),
            width: 28,
            height: 28,
            borderRadius: 999,
            backgroundColor: 'rgba(255,253,247,0.92)',
            borderWidth: 1,
            borderColor: 'rgba(105,67,33,0.18)',
            alignItems: 'center',
            justifyContent: 'center',
            shadowColor: '#4d3a22',
            shadowOpacity: 0.16,
            shadowRadius: 7,
            shadowOffset: { width: 0, height: 3 },
            ...(Platform.OS === 'web'
              ? ({
                  cursor: 'pointer',
                  userSelect: 'none',
                  WebkitUserSelect: 'none',
                  outlineStyle: 'none',
                  transition: 'opacity 180ms ease, transform 180ms ease',
                } as any)
              : {}),
          }}
        >
          <Text
            selectable={false}
            style={{
              fontFamily: 'Lato_700Bold',
              color: category.text,
              fontSize: 14,
              lineHeight: 16,
            }}
          >
            x
          </Text>
        </Pressable>
      )}
      {showWaterButton && (
        <Pressable
          onPress={(event) => {
            event.stopPropagation?.();
            waterPlant();
          }}
          onHoverIn={showHoverControls}
          onHoverOut={hideHoverControls}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel={level >= 5 ? `${skill.description} is fully bloomed` : `Water ${skill.description}`}
          style={{
            position: 'absolute',
            right: Math.max(6, plantWidth * 0.16),
            bottom: showLabel ? LABEL_HEIGHT + 4 : 8,
            width: 28,
            height: 28,
            borderRadius: 999,
            backgroundColor: 'rgba(255,253,247,0.92)',
            borderWidth: 1,
            borderColor: 'rgba(74,143,160,0.26)',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: isHovered || selected ? 1 : 0.82,
            shadowColor: '#2f5d6b',
            shadowOpacity: 0.16,
            shadowRadius: 7,
            shadowOffset: { width: 0, height: 3 },
            ...(Platform.OS === 'web'
              ? ({
                  cursor: 'pointer',
                  userSelect: 'none',
                  WebkitUserSelect: 'none',
                  outlineStyle: 'none',
                  transition: 'opacity 180ms ease, transform 180ms ease',
                } as any)
              : {}),
          }}
        >
          <Text selectable={false} style={{ fontSize: 13, lineHeight: 16 }}>
            💧
          </Text>
        </Pressable>
      )}
    </Animated.View>
    {isReseeding && (
      <Animated.View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: centerX + returnSlotDriftX - 12,
          top: Math.max(0, height - groundHeight * 0.42 - 12),
          zIndex: 95,
          opacity: puffOpacity,
          transform: [{ scale: puffScale }],
        }}
      >
        <Text selectable={false} style={{ fontSize: 18, lineHeight: 22 }}>
          ✨
        </Text>
      </Animated.View>
    )}
    </>
  );
}

function SeedButton({
  skill,
  index,
  shakeIndex = 0,
  bubbleIn = false,
  slotMode = false,
  compact = false,
  onPlantSkill,
  onPressSeed,
  planted = false,
  disabled = false,
}: {
  skill: string;
  index: number;
  shakeIndex?: number;
  bubbleIn?: boolean;
  slotMode?: boolean;
  compact?: boolean;
  onPlantSkill?: (skillDescription: string, options?: PlantSkillOptions) => void;
  onPressSeed?: (skillDescription: string, index: number) => void;
  planted?: boolean;
  disabled?: boolean;
}) {
  const category = getCategoryForSkill(skill);
  const isDisabled = (!onPlantSkill && !onPressSeed) || planted || disabled;
  const seedAnimationClass = Platform.OS === 'web'
    ? shakeIndex > 0 ? 'skill-seed-popcorn' : bubbleIn ? 'skill-seed-bubble-in' : undefined
    : undefined;

  return (
    <Pressable
      className={seedAnimationClass}
      onPress={() => {
        if (isDisabled) return;
        if (onPressSeed) {
          onPressSeed(skill, index);
          return;
        }
        onPlantSkill?.(skill, { enthusiasmLevel: 1 });
      }}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={planted ? `${skill} already planted` : disabled ? `${skill} available when a garden spot opens` : `Plant ${skill}`}
      accessibilityState={{ disabled: isDisabled }}
      style={{
        minHeight: compact ? 28 : 42,
        minWidth: slotMode ? 0 : 104,
        flexBasis: slotMode ? 0 : 112,
        flexGrow: 1,
        flexShrink: 1,
        maxWidth: slotMode ? undefined : 156,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: isDisabled ? 'rgba(217,190,139,0.16)' : 'rgba(255,253,247,0.28)',
        backgroundColor: isDisabled ? 'rgba(255,250,236,0.62)' : 'rgba(255,250,236,0.92)',
        paddingHorizontal: compact ? 6 : 9,
        paddingVertical: compact ? 4 : 7,
        flexDirection: 'row',
        alignItems: 'center',
        gap: compact ? 5 : 7,
        opacity: isDisabled ? 0.72 : 1,
        shadowColor: '#160c08',
        shadowOpacity: isDisabled ? 0.02 : 0.16,
        shadowRadius: 7,
        shadowOffset: { width: 0, height: 2 },
        ...(Platform.OS === 'web'
          ? ({
              cursor: !isDisabled ? 'pointer' : 'default',
              userSelect: 'none',
              WebkitUserSelect: 'none',
              touchAction: 'manipulation',
              outlineStyle: 'none',
              animationDelay: `${(index % 9) * 58}ms`,
              transitionProperty: 'transform, opacity, background-color',
              transitionDuration: '340ms',
              transitionTimingFunction: 'cubic-bezier(0.18, 0.9, 0.16, 1)',
            } as any)
          : {}),
      }}
    >
      <View
        style={{
          width: compact ? 18 : 28,
          height: compact ? 18 : 28,
          borderRadius: compact ? 9 : 14,
          backgroundColor: isDisabled ? 'rgba(255,253,247,0.34)' : 'rgba(255,253,247,0.82)',
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: 1,
          borderColor: isDisabled ? 'rgba(255,253,247,0.28)' : 'rgba(255,253,247,0.72)',
        }}
      >
        <SeedMark category={category} size={compact ? 11 : 17} muted={isDisabled} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          selectable={false}
          numberOfLines={2}
          style={{
            fontFamily: 'Lato_700Bold',
            color: isDisabled ? '#8f8a7f' : category.text,
            fontSize: compact ? 8.2 : 11.5,
            lineHeight: compact ? 9.5 : 13,
            flexShrink: 1,
            ...(Platform.OS === 'web'
              ? ({
                  userSelect: 'none',
                  WebkitUserSelect: 'none',
                } as any)
              : {}),
          }}
        >
          {skill}
        </Text>
      </View>
    </Pressable>
  );
}

function EmptySeedSlot({ index, shakeIndex = 0, compact = false }: { index: number; shakeIndex?: number; compact?: boolean }) {
  return (
    <View
      className={Platform.OS === 'web' && shakeIndex > 0 ? 'skill-seed-popcorn' : undefined}
      style={{
        minHeight: compact ? 28 : 42,
        minWidth: 0,
        flexBasis: 0,
        flexGrow: 1,
        flexShrink: 1,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: 'rgba(255,253,247,0.16)',
        backgroundColor: 'rgba(255,250,236,0.2)',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: 0.62,
        ...(Platform.OS === 'web'
          ? ({
              animationDelay: `${(index % 9) * 58}ms`,
            } as any)
          : {}),
      }}
    >
      <View
        style={{
          width: 9,
          height: 9,
          borderRadius: 999,
          backgroundColor: 'rgba(248,238,226,0.42)',
        }}
      />
    </View>
  );
}

function CustomSeedButton({
  onPlantSkill,
  onPress,
  suggestedSkills = [],
  disabled = false,
  compact = false,
  draftKey,
}: {
  onPlantSkill?: (skillDescription: string, options?: PlantSkillOptions) => void;
  onPress?: () => void;
  suggestedSkills?: string[];
  disabled?: boolean;
  compact?: boolean;
  draftKey?: string | null;
}) {
  const [isAdding, setIsAdding] = useState(false);
  const [draft, setDraft] = useState('');

  useEffect(() => {
    if (!draftKey) return;

    const rawDraft = getStoredItem(draftKey);
    if (!rawDraft) return;

    try {
      const savedDraft = JSON.parse(rawDraft) as { isAdding?: boolean; draft?: string; updatedAt?: number };
      if (Date.now() - Number(savedDraft.updatedAt ?? 0) > 7 * 24 * 60 * 60 * 1000) {
        removeStoredItem(draftKey);
        return;
      }
      setDraft(savedDraft.draft ?? '');
      setIsAdding(!!savedDraft.isAdding || !!savedDraft.draft);
    } catch {
      removeStoredItem(draftKey);
    }
  }, [draftKey]);

  useEffect(() => {
    if (!draftKey) return;

    if (!isAdding && !draft.trim()) {
      removeStoredItem(draftKey);
      return;
    }

    setStoredItem(draftKey, JSON.stringify({
      isAdding,
      draft,
      updatedAt: Date.now(),
    }));
  }, [draft, draftKey, isAdding]);

  const autocompleteSeeds = useMemo(() => {
    const query = normalizeSkillName(draft);
    if (!query) return [];

    return suggestedSkills
      .filter((skill, index, all) => all.findIndex(item => normalizeSkillName(item) === normalizeSkillName(skill)) === index)
      .filter(skill => normalizeSkillName(skill).startsWith(query))
      .slice(0, 5);
  }, [draft, suggestedSkills]);

  const plantSeed = (skill: string) => {
    const trimmedSkill = skill.trim();
    if (!trimmedSkill) return;

    if (onPlantSkill) {
      onPlantSkill(trimmedSkill, { enthusiasmLevel: 1 });
      setDraft('');
      setIsAdding(false);
      if (draftKey) removeStoredItem(draftKey);
      return;
    }

    onPress?.();
  };

  const plantCustomSeed = () => {
    const skill = draft.trim();
    if (!skill) return;

    plantSeed(skill);
  };

  if (isAdding && onPlantSkill) {
    return (
      <View
        style={{
          minWidth: 250,
          flexBasis: 290,
          flexGrow: 1,
          maxWidth: 380,
          gap: 6,
        }}
      >
        {/* Naming a skill is writing words about yourself, so this is the one
            shared box — the mic sits inside its own border with Cancel and
            Plant, instead of a bare field with two buttons beside it. The chip
            got wider to make room for that footer. */}
        <ComposerBar
          variant="inlineEdit"
          tone="light"
          value={draft}
          onChangeText={setDraft}
          placeholder="New skill"
          multiline={false}
          autoFocus
          onSubmit={plantCustomSeed}
          submitLabel="Plant"
          onCancel={() => {
            setDraft('');
            setIsAdding(false);
            if (draftKey) removeStoredItem(draftKey);
          }}
        />
        {autocompleteSeeds.length > 0 && (
          <View
            style={{
              flexDirection: 'row',
              flexWrap: 'wrap',
              gap: 5,
              paddingBottom: 1,
            }}
          >
            {autocompleteSeeds.map(skill => {
              const category = getCategoryForSkill(skill);
              return (
                <Pressable
                  key={skill}
                  onPress={() => plantSeed(skill)}
                  accessibilityRole="button"
                  accessibilityLabel={`Plant ${skill}`}
                  style={{
                    borderRadius: 999,
                    backgroundColor: category.pale,
                    borderWidth: 1,
                    borderColor: `${category.edge}33`,
                    paddingHorizontal: 8,
                    paddingVertical: 4,
                    ...(Platform.OS === 'web'
                      ? ({
                          cursor: 'pointer',
                          outlineStyle: 'none',
                        } as any)
                      : {}),
                  }}
                >
                  <Text
                    selectable={false}
                    numberOfLines={1}
                    style={{
                      fontFamily: 'Lato_700Bold',
                      color: category.text,
                      fontSize: 10.5,
                      lineHeight: 12,
                    }}
                  >
                    {skill}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}
      </View>
    );
  }

  return (
    <Pressable
      onPress={() => {
        if (disabled) return;
        if (onPlantSkill) {
          setIsAdding(true);
          return;
        }
        onPress?.();
      }}
      disabled={disabled || (!onPress && !onPlantSkill)}
      accessibilityRole="button"
      accessibilityLabel={disabled ? 'Plant your own skill when a garden spot opens' : 'Plant your own skill'}
      accessibilityState={{ disabled: disabled || (!onPress && !onPlantSkill) }}
      style={{
        minHeight: compact ? 28 : 42,
        minWidth: compact ? 92 : 124,
        flexBasis: compact ? 102 : 136,
        flexGrow: 1,
        maxWidth: compact ? 130 : 178,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: 'rgba(255,253,247,0.38)',
        backgroundColor: 'rgba(255,253,247,0.95)',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'flex-start',
        gap: compact ? 5 : 7,
        paddingHorizontal: compact ? 6 : 9,
        paddingVertical: compact ? 4 : 7,
        shadowColor: '#160c08',
        shadowOpacity: disabled ? 0.04 : 0.13,
        shadowRadius: 7,
        shadowOffset: { width: 0, height: 2 },
        ...(Platform.OS === 'web'
          ? ({
              cursor: !disabled && (onPress || onPlantSkill) ? 'pointer' : 'default',
              userSelect: 'none',
              WebkitUserSelect: 'none',
              touchAction: 'manipulation',
              outlineStyle: 'none',
            } as any)
          : {}),
      }}
    >
      <View
        style={{
          width: compact ? 18 : 28,
          height: compact ? 18 : 28,
          borderRadius: compact ? 9 : 14,
          backgroundColor: 'rgba(238,246,240,0.78)',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <BloomMark category={FALLBACK_CATEGORY} size={compact ? 11 : 18} muted={disabled} />
      </View>
      <Text
        selectable={false}
        numberOfLines={2}
        style={{
          fontFamily: 'Lato_700Bold',
          color: disabled ? '#8f8a7f' : '#315d4e',
          fontSize: compact ? 8.2 : 11.5,
          lineHeight: compact ? 9.5 : 13,
          flex: 1,
        }}
      >
        Plant your own
      </Text>
    </Pressable>
  );
}

function getSurveySuggestions(
  answers: number[],
  plantedNames: Set<string>,
  limit = GARDEN_CAPACITY,
  questions: SurveyQuestion[] = SEED_SURVEY
) {
  const scores = new Map<string, number>();
  const registerSeed = (seed: string, score: number) => {
    const normalized = normalizeSkillName(seed);
    if (!normalized || plantedNames.has(normalized)) return;
    scores.set(seed, (scores.get(seed) ?? 0) + score);
  };

  answers.forEach((choiceIndex, questionIndex) => {
    const choice = questions[questionIndex]?.choices[choiceIndex];
    if (!choice) return;

    choice.seeds.forEach((seed, seedIndex) => {
      registerSeed(seed, 12 - seedIndex);
    });
  });

  const surveyBackfillSeeds = questions.flatMap(question =>
    question.choices.flatMap(choice => choice.seeds)
  );
  const categoryBackfillSeeds = CATEGORY_DEFS.flatMap(category => category.skills);
  [...surveyBackfillSeeds, ...categoryBackfillSeeds].forEach((seed, index) => {
    registerSeed(seed, -1000 - index);
  });

  return [...scores.entries()]
    .map(([description, score]) => ({
      description,
      score: score * 100000 + hashString(description),
    }))
    .sort((left, right) => right.score - left.score)
    .slice(0, limit)
    .map((item, index) => ({
      description: item.description,
      enthusiasmLevel: index < 3 ? 5 : index < 6 ? 3 : 1,
    }));
}

function SeedSurvey({
  plantedNames,
  hasSkills,
  openSlots,
  onPlantSkill,
  onPlantSkills,
  compact = false,
  narrow = false,
  draftKey,
}: {
  plantedNames: Set<string>;
  hasSkills: boolean;
  openSlots: number;
  onPlantSkill?: (skillDescription: string, options?: PlantSkillOptions) => void;
  onPlantSkills?: (skills: PlantSkillSelection[], options?: PlantSkillsOptions) => void;
  compact?: boolean;
  narrow?: boolean;
  draftKey?: string | null;
}) {
  const [active, setActive] = useState(false);
  const [surveySeed, setSurveySeed] = useState(() => Date.now());
  const [answers, setAnswers] = useState<number[]>([]);
  const [suggestions, setSuggestions] = useState<PlantSkillSelection[]>([]);
  const surveyQuestions = useMemo(() => (
    shuffleBySeed(SEED_SURVEY, surveySeed, question => question.prompt)
      .map(question => ({
        ...question,
        choices: shuffleBySeed(question.choices, surveySeed, choice => choice.label),
      }))
  ), [surveySeed]);
  const question = surveyQuestions[answers.length];
  const complete = answers.length >= surveyQuestions.length;

  useEffect(() => {
    if (!draftKey) return;

    const rawDraft = getStoredItem(draftKey);
    if (!rawDraft) return;

    try {
      const draft = JSON.parse(rawDraft) as SeedSurveyDraft;
      if (!Array.isArray(draft.answers) || Date.now() - Number(draft.updatedAt ?? 0) > 7 * 24 * 60 * 60 * 1000) {
        removeStoredItem(draftKey);
        return;
      }

      setSurveySeed(Number.isFinite(draft.surveySeed) ? draft.surveySeed : Date.now());
      setAnswers(draft.answers);
      setActive(!!draft.active);
    } catch {
      removeStoredItem(draftKey);
    }
  }, [draftKey]);

  useEffect(() => {
    if (!draftKey) return;

    if (!active && answers.length === 0) {
      removeStoredItem(draftKey);
      return;
    }

    setStoredItem(draftKey, JSON.stringify({
      active,
      surveySeed,
      answers,
      updatedAt: Date.now(),
    } satisfies SeedSurveyDraft));
  }, [active, answers, draftKey, surveySeed]);

  useEffect(() => {
    if (!complete || suggestions.length > 0) return;
    setSuggestions(getSurveySuggestions(answers, plantedNames, GARDEN_CAPACITY, surveyQuestions));
  }, [answers, complete, plantedNames, suggestions.length, surveyQuestions]);

  const resetSurvey = (refresh = false, clearStored = false) => {
    setAnswers([]);
    setSuggestions([]);
    if (refresh) setSurveySeed(Date.now());
    if (clearStored && draftKey) removeStoredItem(draftKey);
  };

  const plantSuggestions = (mode: PlantSkillsOptions['mode']) => {
    if (suggestions.length === 0) {
      resetSurvey(false, true);
      return;
    }

    const plantSelected = () => {
      const chosenSuggestions = mode === 'fill'
        ? suggestions.slice(0, Math.max(0, openSlots))
        : suggestions.slice(0, GARDEN_CAPACITY);

      if (onPlantSkills) {
        onPlantSkills(chosenSuggestions, { mode });
      } else {
        chosenSuggestions.forEach(seed => onPlantSkill?.(seed.description, { enthusiasmLevel: seed.enthusiasmLevel }));
      }

      setActive(false);
      resetSurvey(false, true);
    };

    // "Plant Fresh Garden" unplants EVERY skill you have and replants
    // suggestions over the top. It read like "add some flowers" and had no
    // confirm, which is very probably why members reported their skills being
    // deleted — the rows survive, but every flower they'd placed vanishes
    // (Nat 2026-07-26). Only ask when there's actually a garden to lose.
    const plantedCount = plantedNames.size;
    if (mode === 'replace' && plantedCount > 0) {
      const message = `Start over? This clears all ${plantedCount} flower${plantedCount === 1 ? '' : 's'} in your garden and plants these suggestions instead.\n\nYour skills are kept — but where you placed them, and how grown they are, will be lost.`;

      if (Platform.OS === 'web' && typeof window !== 'undefined' && window.confirm) {
        if (window.confirm(message)) plantSelected();
        return;
      }

      Alert.alert('Start over?', message, [
        { text: 'Keep my garden', style: 'cancel' },
        { text: 'Start over', style: 'destructive', onPress: plantSelected },
      ]);
      return;
    }

    plantSelected();
  };

  const sunSize = compact ? 78 : narrow ? 132 : 206;
  const sunRaySize = compact ? 108 : narrow ? 166 : 250;
  const sunPadding = compact ? 7 : narrow ? 13 : 20;
  const sunGap = compact ? 3 : narrow ? 6 : 10;
  const sunTitleFontSize = compact ? 7.2 : narrow ? 10.2 : 15;
  const sunTitleLineHeight = compact ? 8.6 : narrow ? 12 : 18;
  const sunBodyFontSize = compact ? 5.8 : narrow ? 7.8 : 11.5;
  const sunBodyLineHeight = compact ? 7.2 : narrow ? 9.8 : 15;
  const sunButtonHeight = compact ? 16 : narrow ? 24 : 34;
  const sunButtonPadding = compact ? 7 : narrow ? 10 : 16;
  const sunButtonFontSize = compact ? 6.5 : narrow ? 9.2 : 12;

  if (!active) {
    return (
      <Pressable
        className={Platform.OS === 'web' ? 'skill-garden-soft-open' : undefined}
        onPress={() => {
          if (answers.length === 0) {
            resetSurvey(true);
          }
          setActive(true);
        }}
        accessibilityRole="button"
        accessibilityLabel="Seed your garden"
        style={{
          width: hasSkills ? sunSize : undefined,
          height: hasSkills ? sunSize : undefined,
          maxWidth: '100%',
          minHeight: hasSkills ? undefined : 190,
          borderRadius: hasSkills ? 999 : 28,
          borderWidth: hasSkills ? 0 : 1,
          borderColor: hasSkills ? 'rgba(255,253,247,0.54)' : 'rgba(255,253,247,0.62)',
          backgroundColor: hasSkills ? 'transparent' : 'rgba(255,244,187,0.92)',
          paddingHorizontal: hasSkills ? 0 : 18,
          paddingVertical: hasSkills ? 0 : 18,
          marginBottom: hasSkills ? 0 : 0,
          alignItems: 'center',
          justifyContent: 'center',
          gap: hasSkills ? 0 : 14,
          shadowColor: hasSkills ? '#f2c85a' : '#315d4e',
          shadowOpacity: hasSkills ? 0.3 : 0.16,
          shadowRadius: hasSkills ? 36 : 28,
          shadowOffset: { width: 0, height: hasSkills ? 10 : 12 },
          elevation: hasSkills ? 3 : 0,
          ...(Platform.OS === 'web'
            ? ({
                cursor: 'pointer',
                userSelect: 'none',
                WebkitUserSelect: 'none',
                overflow: 'visible',
                backgroundImage: hasSkills
                  ? undefined
                  : 'radial-gradient(circle at 48% 34%, rgba(255,253,226,0.98) 0%, rgba(255,237,152,0.92) 100%)',
              } as any)
            : {}),
        }}
      >
        {hasSkills ? (
          <>
            <View
              pointerEvents="none"
              style={{
                position: 'absolute',
                left: (sunSize - sunRaySize) / 2,
                top: (sunSize - sunRaySize) / 2,
                width: sunRaySize,
                height: sunRaySize,
                zIndex: 0,
              }}
            >
              <SunRayBackground size={sunRaySize} />
            </View>
            <View
              style={{
                width: sunSize,
                height: sunSize,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: 'rgba(255,253,247,0.54)',
                backgroundColor: 'rgba(255,224,105,0.82)',
                padding: sunPadding,
                alignItems: 'center',
                justifyContent: 'center',
                gap: sunGap,
                overflow: 'hidden',
                zIndex: 1,
                ...(Platform.OS === 'web'
                  ? ({
                      backgroundImage: 'radial-gradient(circle at 42% 35%, rgba(255,253,210,0.96) 0%, rgba(255,228,111,0.9) 48%, rgba(255,207,81,0.74) 100%)',
                    } as any)
                  : {}),
              }}
            >
              <Text selectable={false} numberOfLines={2} style={{ fontFamily: 'Lato_700Bold', color: '#2f7147', fontSize: sunTitleFontSize, lineHeight: sunTitleLineHeight, textAlign: 'center' }}>
                Skills Garden Quiz
              </Text>
              <Text selectable={false} numberOfLines={3} style={{ fontFamily: 'Lato_400Regular', color: '#52755b', fontSize: sunBodyFontSize, lineHeight: sunBodyLineHeight, textAlign: 'center' }}>
                Need help? Let the sun pick a few blooms.
              </Text>
              <View
                style={{
                  minHeight: sunButtonHeight,
                  borderRadius: 999,
                  backgroundColor: '#315d4e',
                  paddingHorizontal: sunButtonPadding,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text selectable={false} style={{ fontFamily: 'Lato_700Bold', color: '#fffdf7', fontSize: sunButtonFontSize }}>
                  Begin
                </Text>
              </View>
            </View>
          </>
        ) : (
          <>
            <View style={{ flexDirection: 'row', gap: 9 }}>
              {['✦', '•', '✧', '•', '✦'].map((mote, index) => (
                <Text
                  key={`${mote}-${index}`}
                  selectable={false}
                  style={{
                    color: index % 2 === 0 ? '#f2c85a' : '#f5a5cc',
                    fontSize: index % 2 === 0 ? 18 : 13,
                    lineHeight: 20,
                  }}
                >
                  {mote}
                </Text>
              ))}
            </View>
            <Text selectable={false} style={{ fontFamily: 'LibreBaskerville_700Bold', color: '#315d4e', fontSize: 22, lineHeight: 28, textAlign: 'center' }}>
              Let's see what grows in your garden...
            </Text>
            <Text selectable={false} style={{ fontFamily: 'Lato_400Regular', color: '#52755b', fontSize: 12.5, lineHeight: 18, textAlign: 'center', maxWidth: 290 }}>
              Need help? Take the quiz to populate your garden.
            </Text>
            <View
              style={{
                minHeight: 40,
                borderRadius: 999,
                backgroundColor: '#315d4e',
                paddingHorizontal: 18,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text selectable={false} style={{ fontFamily: 'Lato_700Bold', color: '#fffdf7', fontSize: 13 }}>
                Begin
              </Text>
            </View>
          </>
        )}
      </Pressable>
    );
  }

  return (
    <View
      className={Platform.OS === 'web' ? 'skill-garden-soft-open' : undefined}
      style={{
        borderRadius: hasSkills ? 32 : 24,
        borderWidth: 1,
        borderColor: hasSkills ? 'rgba(255,223,118,0.62)' : 'rgba(255,253,247,0.62)',
        backgroundColor: hasSkills ? 'rgba(255,250,215,0.97)' : 'rgba(255,253,247,0.92)',
        padding: compact ? 9 : 14,
        marginBottom: hasSkills ? (compact ? 6 : 12) : 0,
        shadowColor: hasSkills ? '#f2c85a' : '#315d4e',
        shadowOpacity: hasSkills ? 0.18 : 0.12,
        shadowRadius: hasSkills ? 28 : 24,
        shadowOffset: { width: 0, height: hasSkills ? 10 : 10 },
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: compact ? 8 : 12, marginBottom: compact ? 7 : 10 }}>
        <View style={{ flex: 1 }}>
          <Text selectable={false} style={{ fontFamily: 'Lato_700Bold', color: '#2f7147', fontSize: compact ? 11 : 13 }}>
            Skills Garden
          </Text>
          <Text selectable={false} style={{ fontFamily: 'Lato_400Regular', color: '#5d8b67', fontSize: compact ? 9.5 : 11, marginTop: 1 }}>
            {complete ? 'Your garden pattern is ready' : `${answers.length + 1}/${surveyQuestions.length}`}
          </Text>
        </View>
        <Pressable
          onPress={() => {
            setActive(false);
          }}
          accessibilityRole="button"
          accessibilityLabel="Close garden survey"
          style={{
            minWidth: compact ? 46 : 54,
            minHeight: compact ? 26 : 30,
            borderRadius: 999,
            backgroundColor: 'rgba(255,253,247,0.82)',
            alignItems: 'center',
            justifyContent: 'center',
            ...(Platform.OS === 'web'
              ? ({
                  cursor: 'pointer',
                } as any)
              : {}),
          }}
        >
          <Text selectable={false} style={{ fontFamily: 'Lato_700Bold', color: '#5d8b67', fontSize: compact ? 9.5 : 11 }}>
            Later
          </Text>
        </Pressable>
      </View>

      {!complete && question ? (
        <>
          <View style={{ flexDirection: 'row', gap: 4, marginBottom: compact ? 7 : 10 }}>
            {surveyQuestions.map((_, index) => (
              <View
                key={index}
                style={{
                  flex: 1,
                  height: compact ? 3 : 4,
                  borderRadius: 99,
                  backgroundColor: index <= answers.length ? '#3f9958' : 'rgba(63,153,88,0.18)',
                }}
              />
            ))}
          </View>
          <Text selectable={false} style={{ fontFamily: 'LibreBaskerville_700Bold', color: '#315d4e', fontSize: compact ? 13 : 16, lineHeight: compact ? 17 : 21, marginBottom: compact ? 7 : 10 }}>
            {question.prompt}
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: compact ? 6 : 8 }}>
            {question.choices.map((choice, index) => (
              <Pressable
                key={choice.label}
                onPress={() => {
                  const nextAnswers = [...answers, index];
                  if (nextAnswers.length >= surveyQuestions.length) {
                    setSuggestions(getSurveySuggestions(nextAnswers, plantedNames, GARDEN_CAPACITY, surveyQuestions));
                  }
                  setAnswers(nextAnswers);
                }}
                accessibilityRole="button"
                accessibilityLabel={choice.label}
                style={{
                  minHeight: compact ? 64 : 86,
                  minWidth: compact ? 112 : 150,
                  flexGrow: 1,
                  flexBasis: compact ? 122 : 160,
                  borderRadius: compact ? 14 : 18,
                  borderWidth: 1,
                  borderColor: 'rgba(92,157,91,0.22)',
                  backgroundColor: '#fffdf7',
                  paddingHorizontal: compact ? 8 : 11,
                  paddingVertical: compact ? 6 : 9,
                  justifyContent: 'flex-start',
                  shadowColor: '#315d4e',
                  shadowOpacity: 0.06,
                  shadowRadius: 10,
                  shadowOffset: { width: 0, height: 4 },
                  ...(Platform.OS === 'web'
                    ? ({
                        cursor: 'pointer',
                        userSelect: 'none',
                        WebkitUserSelect: 'none',
                      } as any)
                    : {}),
                }}
              >
                <Text selectable={false} style={{ fontSize: compact ? 17 : 22, lineHeight: compact ? 19 : 26, marginBottom: compact ? 3 : 5 }}>
                  {choice.icon}
                </Text>
                <Text selectable={false} style={{ fontFamily: 'Lato_700Bold', color: '#315d4e', fontSize: compact ? 10.2 : 12.5, lineHeight: compact ? 12 : 15 }}>
                  {choice.label}
                </Text>
                <Text selectable={false} numberOfLines={2} style={{ fontFamily: 'Lato_400Regular', color: '#5d8b67', fontSize: compact ? 8.8 : 10.5, lineHeight: compact ? 10.5 : 13, marginTop: compact ? 2 : 3 }}>
                  {choice.detail}
                </Text>
              </Pressable>
            ))}
          </View>
        </>
      ) : (
        <>
          <Text selectable={false} style={{ fontFamily: 'LibreBaskerville_700Bold', color: '#315d4e', fontSize: 17, lineHeight: 23, marginBottom: 6 }}>
            {suggestions.length > 0 ? 'Your garden is ready.' : 'Your garden already knows this path.'}
          </Text>
          <Text selectable={false} style={{ fontFamily: 'Lato_400Regular', color: '#5d8b67', fontSize: 12, lineHeight: 17, marginBottom: 10 }}>
            {suggestions.length > 0
              ? `${Math.min(suggestions.length, GARDEN_CAPACITY)} blooms are ready from what you chose.`
              : 'Try another path, shake the seeds, or add a custom bloom.'}
          </Text>
          {suggestions.length > 0 && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 12 }}>
              {suggestions.map((seed, index) => {
                const category = getCategoryForSkill(seed.description);
                return (
                  <View
                    key={seed.description}
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: 999,
                      backgroundColor: category.pale,
                      borderWidth: 1,
                      borderColor: `${category.edge}44`,
                      alignItems: 'center',
                      justifyContent: 'center',
                      transform: [{ translateY: index % 2 === 0 ? 0 : 4 }],
                    }}
                  >
                    <BloomMark category={category} size={18} />
                  </View>
                );
              })}
            </View>
          )}
          {suggestions.length > 0 ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              <Pressable
                onPress={() => plantSuggestions('replace')}
                accessibilityRole="button"
                accessibilityLabel="Clear this garden and plant these suggestions instead"
                style={{
                  minHeight: 42,
                  borderRadius: 999,
                  backgroundColor: '#3f9958',
                  alignItems: 'center',
                  justifyContent: 'center',
                  paddingHorizontal: 14,
                  flexGrow: 1,
                  ...(Platform.OS === 'web'
                    ? ({
                        cursor: 'pointer',
                        userSelect: 'none',
                        WebkitUserSelect: 'none',
                      } as any)
                    : {}),
                }}
              >
                {/* Says what it does. "Plant Fresh Garden" sounded additive
                    while it was quietly clearing everything. */}
                <Text selectable={false} style={{ fontFamily: 'Lato_700Bold', color: '#fffdf7', fontSize: 13 }}>
                  {hasSkills ? 'Start over with these' : 'Plant Fresh Garden'}
                </Text>
              </Pressable>
              {hasSkills && openSlots > 0 ? (
                <Pressable
                  onPress={() => plantSuggestions('fill')}
                  accessibilityRole="button"
                  accessibilityLabel="Fill empty garden spots"
                  style={{
                    minHeight: 42,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: 'rgba(63,153,88,0.28)',
                    backgroundColor: '#fffdf7',
                    alignItems: 'center',
                    justifyContent: 'center',
                    paddingHorizontal: 14,
                    flexGrow: 1,
                    ...(Platform.OS === 'web'
                      ? ({
                          cursor: 'pointer',
                          userSelect: 'none',
                          WebkitUserSelect: 'none',
                        } as any)
                      : {}),
                  }}
                >
                  <Text selectable={false} style={{ fontFamily: 'Lato_700Bold', color: '#315d4e', fontSize: 13 }}>
                    Fill Empty Spots
                  </Text>
                </Pressable>
              ) : null}
            </View>
          ) : (
            <Pressable
              onPress={() => resetSurvey(true, true)}
              accessibilityRole="button"
              accessibilityLabel="Try another garden path"
              style={{
                minHeight: 42,
                borderRadius: 999,
                backgroundColor: '#3f9958',
                alignItems: 'center',
                justifyContent: 'center',
                paddingHorizontal: 14,
                ...(Platform.OS === 'web'
                  ? ({
                      cursor: 'pointer',
                      userSelect: 'none',
                      WebkitUserSelect: 'none',
                    } as any)
                  : {}),
              }}
            >
              <Text selectable={false} style={{ fontFamily: 'Lato_700Bold', color: '#fffdf7', fontSize: 13 }}>
                Try Another Path
              </Text>
            </Pressable>
          )}
        </>
      )}
    </View>
  );
}

export function SkillBubbleGarden({
  skills,
  editable = false,
  onUpdateSkill,
  onDeleteSkill,
  seedSkills = [],
  onPlantSkill,
  onPlantSkills,
  onAddCustomSkill,
  draftKey,
  wishMatches,
  onOpenWish,
  skillFlowers,
  onToggleSkillFlower,
}: SkillBubbleGardenProps) {
  useWildflowerStyles();

  const viewport = useWindowDimensions();
  const [width, setWidth] = useState(0);
  const [seedShake, setSeedShake] = useState(0);
  const [selectedSkillId, setSelectedSkillId] = useState<string | null>(null);
  const [recentSeedNames, setRecentSeedNames] = useState<string[]>([]);
  const [recentSeedSlots, setRecentSeedSlots] = useState<Record<string, number>>({});
  const [flowerSlotPins, setFlowerSlotPins] = useState<Record<string, number>>({});
  const [returnedSeedNames, setReturnedSeedNames] = useState<string[]>([]);
  const [incomingSeedNames, setIncomingSeedNames] = useState<string[]>([]);
  const [incomingSeedOrigins, setIncomingSeedOrigins] = useState<Record<string, number>>({});
  const displaySkills = useMemo(() => skills.filter(isBloomingSkill), [skills]);
  const visibleSkillLimit = VISIBLE_BLOOM_LIMIT;
  const visibleSkills = useMemo(() => {
    if (displaySkills.length <= visibleSkillLimit) return displaySkills;

    return displaySkills
      .map((skill, index) => ({
        skill,
        score: getLevel(skill) * 1000000 + (displaySkills.length - index) * 100 + hashString(`${skill.id}:${skill.description}`) % 100,
      }))
      .sort((left, right) => right.score - left.score)
      .slice(0, visibleSkillLimit)
      .map(item => item.skill);
  }, [displaySkills, visibleSkillLimit]);
  const flowerSlots = useMemo(
    () => buildFlowerSlots(visibleSkills, flowerSlotPins),
    [flowerSlotPins, visibleSkills]
  );
  const [beePopover, setBeePopover] = useState<{
    skill: GardenSkill;
    slotIndex: number;
    wishes: MatchedWish[];
  } | null>(null);
  // Bees visit blooms whose skill matches another member's public wish.
  // Cap the animated swarm, prioritizing blooms with the most matches.
  const beeWishesBySkillId = useMemo(() => {
    const bees = new Map<string, MatchedWish[]>();
    if (!wishMatches || wishMatches.length === 0) return bees;

    const matchesBySkillId = new Map(wishMatches.map(match => [match.skillId, match.wishes]));
    flowerSlots
      .map(({ skill }) => ({ skillId: skill.id, wishes: matchesBySkillId.get(skill.id) ?? [] }))
      .filter(entry => entry.wishes.length > 0)
      .sort((left, right) => right.wishes.length - left.wishes.length)
      .slice(0, MAX_GARDEN_BEES)
      .forEach(entry => bees.set(entry.skillId, entry.wishes));

    return bees;
  }, [flowerSlots, wishMatches]);
  const handleBeePress = useCallback((skill: GardenSkill, slotIndex: number) => {
    setBeePopover((current) => {
      if (current?.skill.id === skill.id) return null;
      const wishes = beeWishesBySkillId.get(skill.id);
      return wishes && wishes.length > 0 ? { skill, slotIndex, wishes } : null;
    });
  }, [beeWishesBySkillId]);
  // The sunflower popover (garden visits, 2026-08-12) — same open/close shape
  // as the bee popover: tap opens it on that bloom, tap again closes it.
  const [flowerPopover, setFlowerPopover] = useState<{
    skill: GardenSkill;
    slotIndex: number;
  } | null>(null);
  const handleFlowerPress = useCallback((skill: GardenSkill, slotIndex: number) => {
    setFlowerPopover((current) => (
      current?.skill.id === skill.id ? null : { skill, slotIndex }
    ));
  }, []);
  const plantedNames = useMemo(
    () => new Set(displaySkills.map((skill) => normalizeSkillName(skill.description))),
    [displaySkills]
  );
  const dormantSeedNames = useMemo(
    () => skills
      .filter(skill => !isBloomingSkill(skill))
      .map(skill => skill.description),
    [skills]
  );
  const seedSourceSkills = useMemo(
    () => [...recentSeedNames, ...dormantSeedNames, ...seedSkills],
    [dormantSeedNames, recentSeedNames, seedSkills]
  );
  const openSlots = Math.max(0, GARDEN_CAPACITY - visibleSkills.length);
  const seedTray = useMemo(
    () => editable ? getSeedTray(seedSourceSkills, plantedNames, seedShake, SEED_STRIP_LIMIT, recentSeedNames) : [],
    [editable, plantedNames, recentSeedNames, seedShake, seedSourceSkills]
  );
  const seedSlots = useMemo(
    () => buildSeedSlots(seedTray, recentSeedSlots),
    [recentSeedSlots, seedTray]
  );
  const seedPages = useMemo(() => {
    const firstPageSeeds = new Set(
      seedSlots
        .filter((skill): skill is string => Boolean(skill))
        .map(normalizeSkillName)
    );
    const extraSeeds = seedTray.filter((skill) => !firstPageSeeds.has(normalizeSkillName(skill)));
    const pages: SeedSlot[][] = [seedSlots];

    for (let index = 0; index < extraSeeds.length; index += SEED_TRAY_SIZE) {
      const page = Array.from({ length: SEED_TRAY_SIZE }, (_, offset) => extraSeeds[index + offset]);
      if (page.some(Boolean)) pages.push(page);
    }

    return pages;
  }, [seedSlots, seedTray]);
  const availableSeedCount = useMemo(
    () => seedSourceSkills
      .filter((skill) => !plantedNames.has(normalizeSkillName(skill)))
      .filter((skill, index, all) => all.findIndex(item => normalizeSkillName(item) === normalizeSkillName(skill)) === index)
      .length,
    [plantedNames, seedSourceSkills]
  );
  const canPlantSeeds = openSlots > 0;
  const canShakeSeeds = availableSeedCount > 1;
  const incomingSeedSet = useMemo(() => new Set(incomingSeedNames), [incomingSeedNames]);
  const returnedSeedSet = useMemo(() => new Set(returnedSeedNames), [returnedSeedNames]);
  const featuredSkillIds = useMemo(() => {
    if (visibleSkills.length <= 14) {
      return new Set(visibleSkills.map(skill => skill.id));
    }

    const labelLimit = visibleSkills.length <= 32 ? 9 : visibleSkills.length <= 70 ? 11 : 13;
    return new Set(
      visibleSkills
        .filter(skill => getLevel(skill) >= 4)
        .map((skill, index) => ({
          id: skill.id,
          score: getLevel(skill) * 10000000000 + hashString(`${skill.id}:${skill.description}:${index}`),
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, labelLimit)
        .map(item => item.id)
    );
  }, [visibleSkills]);
  const compactLandscape = editable && viewport.width > viewport.height && viewport.height < 540;
  const narrowPortrait = editable && !compactLandscape && width > 0 && width < 560;
  const groundHeight = getGroundHeight(width, compactLandscape);
  // Read-only gardens on narrow (portrait phone) canvases switch to the tidy
  // bouquet grid; editable gardens always keep their hand-placed layout.
  const bouquetLayout = useMemo(
    () => (!editable && width > 0 && width < 500 ? buildBouquetLayout(visibleSkills, width) : null),
    [editable, visibleSkills, width]
  );
  const meadowHeight = bouquetLayout?.meadowHeight
    ?? getMeadowHeight(visibleSkills.length, width || 680, compactLandscape, viewport.height);
  // Worked out once for the whole meadow so every bloom, the stagger and the
  // bee popover are all reading the same numbers.
  const plantScale = getPackedScale(width || 680, meadowHeight, visibleSkills.length, compactLandscape);
  const depthLiftRange = getDepthLiftRange(meadowHeight, plantScale);
  const showLandscapeHint = editable && width > 0 && width < 560;
  const seedLaneWidth = compactLandscape ? 72 : 112;
  const seedGap = compactLandscape ? 4 : 7;
  const seedPageWidth = Math.max(width - 24, SEED_TRAY_SIZE * seedLaneWidth + (SEED_TRAY_SIZE - 1) * seedGap);
  const seedContentWidth = seedPageWidth * Math.max(1, seedPages.length);
  const seedRowScrolls = width > 0 && (seedPages.length > 1 || seedPageWidth > width - 24);
  const surveyPanelWidth = compactLandscape
    ? Math.min(390, Math.max(0, width - 24))
    : width > 760
    ? Math.min(520, Math.max(0, width - 36))
    : Math.max(0, width - 28);

  useEffect(() => {
    setRecentSeedNames((current) =>
      current.filter((skill) => !plantedNames.has(normalizeSkillName(skill)))
    );
    setRecentSeedSlots((current) => Object.fromEntries(
      Object.entries(current).filter(([normalizedSkill]) => !plantedNames.has(normalizedSkill))
    ));
  }, [plantedNames]);

  const handleLayout = (event: LayoutChangeEvent) => {
    setWidth(event.nativeEvent.layout.width);
  };

  const handleReturnToSeed = (skill: GardenSkill, slotIndex: number) => {
    const normalizedSkill = normalizeSkillName(skill.description);
    setSelectedSkillId(null);
    setBeePopover((current) => (current?.skill.id === skill.id ? null : current));
    setFlowerPopover((current) => (current?.skill.id === skill.id ? null : current));
    setFlowerSlotPins((current) => {
      const { [normalizedSkill]: _removed, ...next } = current;
      return next;
    });
    setRecentSeedNames((current) => [
      skill.description,
      ...current.filter((item) => normalizeSkillName(item) !== normalizedSkill),
    ].slice(0, GARDEN_CAPACITY));
    setRecentSeedSlots((current) => ({
      ...current,
      [normalizedSkill]: slotIndex,
    }));
    setReturnedSeedNames([normalizedSkill]);
  };

  const getOriginXForSlot = useCallback((slotIndex: number) => {
    const safeSlot = clamp(slotIndex, 0, GARDEN_CAPACITY - 1);
    return width > 0
      ? clamp(getFrontRowCenterX(safeSlot, GARDEN_CAPACITY, width) / width, 0.04, 0.96)
      : clamp((safeSlot + 0.5) / GARDEN_CAPACITY, 0.04, 0.96);
  }, [width]);

  const rememberIncomingSeeds = useCallback((descriptions: string[], originSlots?: Record<string, number>) => {
    const normalizedSeeds = descriptions
      .map(normalizeSkillName)
      .filter(Boolean);
    if (normalizedSeeds.length === 0) return;

    setIncomingSeedNames((current) => [
      ...normalizedSeeds,
      ...current.filter((name) => !normalizedSeeds.includes(name)),
    ].slice(0, GARDEN_CAPACITY * 2));

    if (originSlots) {
      setIncomingSeedOrigins((current) => ({
        ...current,
        ...Object.fromEntries(
          Object.entries(originSlots).map(([name, slotIndex]) => [name, getOriginXForSlot(slotIndex)])
        ),
      }));
    }
  }, [getOriginXForSlot]);

  const handlePlantSeed = useCallback((skillDescription: string, options?: PlantSkillOptions, originIndex?: number) => {
    const normalizedSkill = normalizeSkillName(skillDescription);
    setReturnedSeedNames((current) => current.filter((name) => name !== normalizedSkill));
    const originSlots = originIndex !== undefined
      ? { [normalizedSkill]: clamp(originIndex, 0, GARDEN_CAPACITY - 1) }
      : undefined;
    if (originSlots) {
      setFlowerSlotPins((current) => ({
        ...current,
        ...originSlots,
      }));
    }
    rememberIncomingSeeds([skillDescription], originSlots);
    onPlantSkill?.(skillDescription, originIndex !== undefined ? { ...options, originSlot: originIndex } : options);
  }, [onPlantSkill, rememberIncomingSeeds]);

  const handlePlantSeedFromSlot = useCallback((skillDescription: string, originIndex: number) => {
    handlePlantSeed(skillDescription, { enthusiasmLevel: 1 }, originIndex);
  }, [handlePlantSeed]);

  const handlePlantSeeds = useCallback((selections: PlantSkillSelection[], options?: PlantSkillsOptions) => {
    const occupiedSlots = new Set(options?.mode === 'replace'
      ? []
      : flowerSlots.map(({ slotIndex }) => slotIndex)
    );
    const openSlotIndexes = Array.from({ length: GARDEN_CAPACITY }, (_, index) => index)
      .filter((slotIndex) => !occupiedSlots.has(slotIndex));
    const slotAssignments = new Map<string, number>();

    selections.forEach((selection) => {
      const normalizedSkill = normalizeSkillName(selection.description);
      if (!normalizedSkill || slotAssignments.has(normalizedSkill)) return;

      const explicitSlot = typeof selection.slotIndex === 'number'
        ? clamp(selection.slotIndex, 0, GARDEN_CAPACITY - 1)
        : undefined;
      const nextSlot = explicitSlot ?? openSlotIndexes[slotAssignments.size] ?? slotAssignments.size;
      slotAssignments.set(normalizedSkill, clamp(nextSlot, 0, GARDEN_CAPACITY - 1));
    });

    const originSlots = Object.fromEntries(slotAssignments);
    if (options?.mode === 'replace') {
      setFlowerSlotPins(originSlots);
      setRecentSeedSlots({});
      setReturnedSeedNames([]);
    } else {
      setFlowerSlotPins((current) => ({
        ...current,
        ...originSlots,
      }));
    }
    rememberIncomingSeeds(selections.map((selection) => selection.description), originSlots);
    const selectionsWithSlots = selections.map((selection) => {
      const assignedSlot = slotAssignments.get(normalizeSkillName(selection.description));
      return assignedSlot === undefined ? selection : { ...selection, slotIndex: assignedSlot };
    });

    if (onPlantSkills) {
      onPlantSkills(selectionsWithSlots, options);
      return;
    }

    selectionsWithSlots.forEach((selection) => {
      onPlantSkill?.(selection.description, { enthusiasmLevel: selection.enthusiasmLevel, originSlot: selection.slotIndex });
    });
  }, [flowerSlots, onPlantSkill, onPlantSkills, rememberIncomingSeeds]);

  const handleEntryComplete = useCallback((skill: GardenSkill) => {
    const normalized = normalizeSkillName(skill.description);
    setIncomingSeedNames((current) => current.filter((name) => name !== normalized));
    setIncomingSeedOrigins((current) => {
      const { [normalized]: _removed, ...next } = current;
      return next;
    });
  }, []);

  return (
    <View
      onLayout={handleLayout}
      style={{
        flex: compactLandscape ? 1 : undefined,
        borderRadius: 18,
        backgroundColor: '#fffdf7',
        borderWidth: 1,
        borderColor: 'rgba(222,193,129,0.42)',
        overflow: 'hidden',
      }}
    >
      {width === 0 ? (
        // First mount hasn't been measured yet — painting now would scatter
        // flowers across a canvas sized for the wrong width (the "flowers in
        // the sky" flash). Hold a quiet sky until onLayout reports in.
        <View style={{ minHeight: meadowHeight, backgroundColor: '#32b8dd' }} />
      ) : (
      <View
        style={{
          flex: compactLandscape ? 1 : undefined,
          minHeight: meadowHeight,
          position: 'relative',
          overflow: 'hidden',
          backgroundColor: '#32b8dd',
          ...(Platform.OS === 'web'
            ? ({
                backgroundImage: 'linear-gradient(180deg, #26b7de 0%, #77d9e8 38%, #bceca6 66%, #4aa25b 100%)',
              } as any)
            : {}),
        }}
      >
        <MeadowAtmosphere
          width={width}
          height={meadowHeight}
          showSun={!editable}
          groundHeight={groundHeight}
          compactLandscape={compactLandscape}
        />
        <View
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: 0,
            height: Math.min(120, meadowHeight * 0.26),
            backgroundColor: 'rgba(255,255,255,0.08)',
          }}
        />

        <GroundStrip width={width} height={groundHeight} />

        {editable && (
          <View
            style={{
              position: 'absolute',
              left: compactLandscape ? 8 : width > 620 ? 8 : 10,
              top: compactLandscape ? 6 : width > 620 ? 8 : 10,
              width: surveyPanelWidth,
              zIndex: 500,
            }}
          >
            <SeedSurvey
              plantedNames={plantedNames}
              hasSkills={displaySkills.length > 0}
              openSlots={openSlots}
              compact={compactLandscape}
              narrow={narrowPortrait}
              draftKey={draftKey ? `${draftKey}:seed-survey` : null}
              onPlantSkill={onPlantSkill ? handlePlantSeed : undefined}
              onPlantSkills={onPlantSkills || onPlantSkill ? handlePlantSeeds : undefined}
            />
          </View>
        )}

        {width > 0 && flowerSlots.map(({ skill, slotIndex }) => (
          <SkillPlant
            key={skill.id}
            skill={skill}
            index={slotIndex}
            count={GARDEN_CAPACITY}
            width={width}
            height={meadowHeight}
            editable={editable}
            onUpdateSkill={onUpdateSkill}
            onDeleteSkill={onDeleteSkill}
            selected={selectedSkillId === skill.id}
            featured={featuredSkillIds.has(skill.id)}
            onSelect={setSelectedSkillId}
            onReturnToSeed={handleReturnToSeed}
            justPlanted={incomingSeedSet.has(normalizeSkillName(skill.description))}
            entryOriginX={incomingSeedOrigins[normalizeSkillName(skill.description)]}
            onEntryComplete={handleEntryComplete}
            compactLandscape={compactLandscape}
            groundHeight={groundHeight}
            plantScale={plantScale}
            depthLiftRange={depthLiftRange}
            layoutOverride={bouquetLayout?.positions.get(skill.id)}
            skills={skills}
            beeWishes={beeWishesBySkillId.get(skill.id)}
            onBeePress={onOpenWish ? handleBeePress : undefined}
            flowerSummary={skillFlowers?.[skill.id]}
            onFlowerPress={skillFlowers || onToggleSkillFlower ? handleFlowerPress : undefined}
            visitorCanFlower={Boolean(onToggleSkillFlower)}
          />
        ))}

        {beePopover && width > 0 && (() => {
          const cardWidth = Math.min(272, Math.max(200, width - 24));
          const centerX = getFrontRowCenterX(beePopover.slotIndex, GARDEN_CAPACITY, width);
          const anchorY = getFrontRowAnchorY(meadowHeight, width, beePopover.slotIndex, compactLandscape, groundHeight, depthLiftRange);
          // Reads the meadow's own scale and lift, so the popover keeps sitting
          // on its flower however big the garden decided that flower should be.
          const popoverBand = compactLandscape || width < 520 ? 0 : getDepthBand(beePopover.slotIndex);
          const rowScale = plantScale * getDepthScaleFactor(popoverBand);
          const spriteHeight = getStageCanvasHeight(getStage(getLevel(beePopover.skill))) * rowScale;
          const cardLeft = clamp(centerX - cardWidth / 2, 10, Math.max(10, width - cardWidth - 10));
          const cardBottom = clamp(
            meadowHeight - anchorY + spriteHeight + 6,
            groundHeight * 0.6,
            Math.max(groundHeight * 0.6, meadowHeight - 190)
          );

          return (
            <>
              <Pressable
                onPress={() => setBeePopover(null)}
                accessibilityLabel="Close wish matches"
                style={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  top: 0,
                  bottom: 0,
                  zIndex: 590,
                  ...(Platform.OS === 'web' ? ({ cursor: 'default' } as any) : {}),
                }}
              />
              <View
                style={{
                  position: 'absolute',
                  left: cardLeft,
                  bottom: cardBottom,
                  width: cardWidth,
                  zIndex: 600,
                  borderRadius: 18,
                  borderWidth: 1,
                  borderColor: 'rgba(222,193,129,0.55)',
                  backgroundColor: 'rgba(255,253,247,0.98)',
                  paddingHorizontal: 12,
                  paddingVertical: 11,
                  gap: 7,
                  shadowColor: '#4d3a22',
                  shadowOpacity: 0.22,
                  shadowRadius: 16,
                  shadowOffset: { width: 0, height: 6 },
                  elevation: 6,
                }}
              >
                <Text
                  selectable={false}
                  style={{ fontFamily: 'Lato_700Bold', color: '#2f7147', fontSize: 12.5, lineHeight: 16 }}
                >
                  This skill could grant a wish! 🌟
                </Text>
                <Text
                  selectable={false}
                  numberOfLines={1}
                  style={{ fontFamily: 'Lato_400Regular', color: '#5d8b67', fontSize: 10.5, lineHeight: 13 }}
                >
                  🐝 A bee caught the scent of {beePopover.skill.description}
                </Text>
                {beePopover.wishes.slice(0, 4).map(wish => (
                  <Pressable
                    key={wish.id}
                    onPress={() => {
                      setBeePopover(null);
                      onOpenWish?.(wish.id);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`Open ${wish.ownerName}'s wish: ${wish.title}`}
                    style={{
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: 'rgba(63,153,88,0.18)',
                      backgroundColor: 'rgba(63,153,88,0.08)',
                      paddingHorizontal: 9,
                      paddingVertical: 7,
                      gap: 2,
                      ...(Platform.OS === 'web'
                        ? ({
                            cursor: 'pointer',
                            userSelect: 'none',
                            WebkitUserSelect: 'none',
                          } as any)
                        : {}),
                    }}
                  >
                    <Text
                      selectable={false}
                      numberOfLines={2}
                      style={{ fontFamily: 'Lato_700Bold', color: '#315d4e', fontSize: 11.5, lineHeight: 14 }}
                    >
                      {wish.title}
                    </Text>
                    <Text
                      selectable={false}
                      numberOfLines={1}
                      style={{ fontFamily: 'Lato_400Regular', color: '#5d8b67', fontSize: 10, lineHeight: 12.5 }}
                    >
                      {wish.ownerName}'s wish · tap to visit
                    </Text>
                  </Pressable>
                ))}
              </View>
            </>
          );
        })()}

        {/* The sunflower card (garden visits, 2026-08-12). Anchored with the
            same math as the bee popover above, so it sits on its bloom at
            whatever size the meadow decided that bloom should be. Visiting
            someone else's garden it offers "Leave a 🌻" / "Take your 🌻 back";
            on your own it says who left them. */}
        {flowerPopover && width > 0 && (() => {
          const summary = skillFlowers?.[flowerPopover.skill.id];
          const mine = summary?.mine ?? false;
          const flowerCount = summary?.count ?? 0;
          const giverLine = joinGiverNames(summary?.giverNames ?? []);
          const cardWidth = Math.min(272, Math.max(200, width - 24));
          // Narrow read-only gardens arrange blooms on the bouquet grid, not
          // the front row — so ask the bouquet where this bloom actually is
          // before falling back to the front-row math the bee popover uses.
          const bouquetPosition = bouquetLayout?.positions.get(flowerPopover.skill.id);
          const centerX = bouquetPosition?.centerX
            ?? getFrontRowCenterX(flowerPopover.slotIndex, GARDEN_CAPACITY, width);
          const anchorY = bouquetPosition?.anchorY
            ?? getFrontRowAnchorY(meadowHeight, width, flowerPopover.slotIndex, compactLandscape, groundHeight, depthLiftRange);
          const popoverBand = compactLandscape || width < 520 ? 0 : getDepthBand(flowerPopover.slotIndex);
          const rowScale = bouquetPosition?.scale ?? plantScale * getDepthScaleFactor(popoverBand);
          const spriteHeight = getStageCanvasHeight(getStage(getLevel(flowerPopover.skill))) * rowScale;
          const cardLeft = clamp(centerX - cardWidth / 2, 10, Math.max(10, width - cardWidth - 10));
          const cardBottom = clamp(
            meadowHeight - anchorY + spriteHeight + 6,
            groundHeight * 0.6,
            Math.max(groundHeight * 0.6, meadowHeight - 190)
          );

          return (
            <>
              <Pressable
                onPress={() => setFlowerPopover(null)}
                accessibilityLabel="Close sunflowers"
                style={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  top: 0,
                  bottom: 0,
                  zIndex: 590,
                  ...(Platform.OS === 'web' ? ({ cursor: 'default' } as any) : {}),
                }}
              />
              <View
                style={{
                  position: 'absolute',
                  left: cardLeft,
                  bottom: cardBottom,
                  width: cardWidth,
                  zIndex: 600,
                  borderRadius: 18,
                  borderWidth: 1,
                  borderColor: 'rgba(222,193,129,0.55)',
                  backgroundColor: 'rgba(255,253,247,0.98)',
                  paddingHorizontal: 12,
                  paddingVertical: 11,
                  gap: 7,
                  shadowColor: '#4d3a22',
                  shadowOpacity: 0.22,
                  shadowRadius: 16,
                  shadowOffset: { width: 0, height: 6 },
                  elevation: 6,
                }}
              >
                <Text
                  selectable={false}
                  numberOfLines={2}
                  style={{ fontFamily: 'Lato_700Bold', color: '#8a5a16', fontSize: 12.5, lineHeight: 16 }}
                >
                  🌻 {flowerPopover.skill.description}
                </Text>
                {flowerCount > 0 && giverLine.length > 0 && (
                  <Text
                    selectable={false}
                    style={{ fontFamily: 'Lato_400Regular', color: '#5c5648', fontSize: 11, lineHeight: 15 }}
                  >
                    From {giverLine}
                  </Text>
                )}
                {!onToggleSkillFlower && (
                  <Text
                    selectable={false}
                    style={{ fontFamily: 'Lato_400Regular', color: '#9b8a6b', fontSize: 10, lineHeight: 13 }}
                  >
                    Sunflowers left by garden visitors.
                  </Text>
                )}
                {onToggleSkillFlower && (
                  <Pressable
                    onPress={() => {
                      onToggleSkillFlower(flowerPopover.skill.id, !mine);
                      setFlowerPopover(null);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={mine
                      ? `Take your sunflower back from ${flowerPopover.skill.description}`
                      : `Leave a sunflower on ${flowerPopover.skill.description}`}
                    style={{
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: 'rgba(201,135,31,0.28)',
                      backgroundColor: 'rgba(244,194,71,0.14)',
                      paddingHorizontal: 9,
                      paddingVertical: 8,
                      ...(Platform.OS === 'web'
                        ? ({
                            cursor: 'pointer',
                            userSelect: 'none',
                            WebkitUserSelect: 'none',
                          } as any)
                        : {}),
                    }}
                  >
                    <Text
                      selectable={false}
                      style={{ fontFamily: 'Lato_700Bold', color: '#8a5a16', fontSize: 11.5, lineHeight: 14 }}
                    >
                      {mine ? 'Take your 🌻 back' : 'Leave a 🌻 on this bloom'}
                    </Text>
                  </Pressable>
                )}
              </View>
            </>
          );
        })()}

        {displaySkills.length === 0 && !editable && (
          <View
            style={{
              flex: 1,
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: meadowHeight - GROUND_HEIGHT,
              paddingHorizontal: 24,
              paddingBottom: GROUND_HEIGHT * 0.4,
            }}
          >
            <Text
              style={{
                fontFamily: 'Lato_700Bold',
                color: '#9b8a6b',
                fontSize: 15,
                textAlign: 'center',
              }}
            >
              The field is waiting.
            </Text>
          </View>
        )}
      </View>
      )}

      {editable && (
        <View
          style={{
            borderTopWidth: 1,
            borderTopColor: 'rgba(78,124,63,0.34)',
            backgroundColor: '#3b2418',
            paddingHorizontal: 12,
            paddingTop: compactLandscape ? 3 : 7,
            paddingBottom: compactLandscape ? 3 : 8,
            ...(Platform.OS === 'web'
              ? ({
                  backgroundImage: [
                    'linear-gradient(180deg, #4a2b19 0%, #2f1a10 100%)',
                    'radial-gradient(circle at 10% 40%, rgba(217,190,139,0.22) 0 1px, transparent 2px)',
                    'radial-gradient(circle at 80% 64%, rgba(255,253,247,0.13) 0 1px, transparent 2px)',
                  ].join(', '),
                  backgroundSize: 'auto, 38px 28px, 46px 32px',
                } as any)
              : {}),
          }}
        >
          <View
            style={{
              flexDirection: width > 520 ? 'row' : 'column',
              alignItems: width > 520 ? 'center' : 'stretch',
              justifyContent: 'space-between',
              gap: 4,
              marginBottom: compactLandscape ? 3 : 5,
            }}
          >
            <View>
              <Text
                style={{
                  fontFamily: 'Lato_700Bold',
                  color: '#f8eee2',
                  fontSize: compactLandscape ? 8.2 : 11,
                  letterSpacing: 0,
                }}
              >
                Skill Seeds
              </Text>
              <Text
                style={{
                  fontFamily: 'Lato_400Regular',
                  color: 'rgba(248,238,226,0.64)',
                  fontSize: compactLandscape ? 7.2 : 9.5,
                  marginTop: 1,
                }}
              >
                {`${visibleSkills.length}/${GARDEN_CAPACITY} blooming`}
              </Text>
              {!canPlantSeeds && (
                <Text
                  style={{
                    fontFamily: 'Lato_400Regular',
                    color: 'rgba(248,238,226,0.58)',
                    fontSize: compactLandscape ? 7 : 9,
                    marginTop: 2,
                  }}
                >
                  Reseed a flower to open a spot.
                </Text>
              )}
            </View>
          </View>

          {showLandscapeHint && (
            <View
              style={{
                alignSelf: 'flex-start',
                borderRadius: 999,
                backgroundColor: 'rgba(255,250,236,0.14)',
                borderWidth: 1,
                borderColor: 'rgba(255,253,247,0.18)',
                paddingHorizontal: 10,
                paddingVertical: 5,
                marginBottom: 8,
              }}
            >
              <Text
                selectable={false}
                style={{
                  fontFamily: 'Lato_700Bold',
                  color: 'rgba(248,238,226,0.78)',
                  fontSize: 10,
                }}
              >
                Turn sideways for the full garden view
              </Text>
            </View>
          )}

          <View
            key={`skill-seed-row-${seedShake}`}
            style={{
              gap: compactLandscape ? 5 : 8,
            }}
          >
            <ScrollView
              horizontal
              nestedScrollEnabled
              showsHorizontalScrollIndicator
              scrollEnabled={seedRowScrolls}
              snapToInterval={seedPageWidth}
              decelerationRate="fast"
              style={{
                minWidth: 0,
                maxWidth: '100%',
                ...(Platform.OS === 'web'
                  ? ({
                      overflowX: 'auto',
                      overflowY: 'hidden',
                      WebkitOverflowScrolling: 'touch',
                      overscrollBehaviorX: 'contain',
                      touchAction: 'pan-x',
                    } as any)
                  : {}),
              }}
              contentContainerStyle={{
                width: seedContentWidth,
                alignItems: 'center',
                paddingBottom: 6,
              }}
            >
              {seedPages.map((page, pageIndex) => (
                <View
                  key={`seed-page-${pageIndex}-${seedShake}`}
                  style={{
                    width: seedPageWidth,
                    flexDirection: 'row',
                    gap: seedGap,
                    alignItems: 'center',
                    paddingRight: pageIndex === seedPages.length - 1 ? 2 : 0,
                  }}
                >
                  {page.map((skill, slotIndex) => (
                    skill ? (
                      <SeedButton
                        key={`${skill}-${pageIndex}-${slotIndex}-${seedShake}`}
                        skill={skill}
                        index={slotIndex}
                        shakeIndex={seedShake}
                        slotMode
                        compact={compactLandscape}
                        onPlantSkill={onPlantSkill ? handlePlantSeed : undefined}
                        onPressSeed={onPlantSkill ? (description) => handlePlantSeedFromSlot(description, slotIndex) : undefined}
                        planted={plantedNames.has(normalizeSkillName(skill))}
                        disabled={!canPlantSeeds}
                        bubbleIn={pageIndex === 0 && returnedSeedSet.has(normalizeSkillName(skill))}
                      />
                    ) : (
                      <EmptySeedSlot key={`empty-seed-${pageIndex}-${slotIndex}-${seedShake}`} index={slotIndex} shakeIndex={seedShake} compact={compactLandscape} />
                    )
                  ))}
                </View>
              ))}
            </ScrollView>

            <View
              style={{
                flexDirection: 'row',
                gap: 8,
                alignItems: 'center',
                justifyContent: 'flex-end',
                flexWrap: 'wrap',
                marginTop: compactLandscape ? 0 : 2,
              }}
            >
              {onPlantSkill || onAddCustomSkill ? (
                <CustomSeedButton
                  onPlantSkill={onPlantSkill ? handlePlantSeed : undefined}
                  onPress={onAddCustomSkill}
                  suggestedSkills={seedSourceSkills.filter(skill => !plantedNames.has(normalizeSkillName(skill)))}
                  disabled={!canPlantSeeds}
                  compact={compactLandscape}
                  draftKey={draftKey ? `${draftKey}:custom-seed` : null}
                />
              ) : null}
              <Pressable
                onPress={() => setSeedShake(current => current + 1)}
                disabled={!canShakeSeeds}
                accessibilityRole="button"
                accessibilityLabel="Shake seeds"
                accessibilityState={{ disabled: !canShakeSeeds }}
                style={{
                  minHeight: compactLandscape ? 28 : 42,
                  minWidth: compactLandscape ? 80 : 118,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: 'rgba(255,253,247,0.34)',
                  backgroundColor: '#fffdf7',
                  paddingHorizontal: compactLandscape ? 6 : 12,
                  paddingVertical: compactLandscape ? 4 : 7,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 7,
                  opacity: canShakeSeeds ? 1 : 0.58,
                  shadowColor: '#160c08',
                  shadowOpacity: canShakeSeeds ? 0.16 : 0.04,
                  shadowRadius: 7,
                  shadowOffset: { width: 0, height: 2 },
                  ...(Platform.OS === 'web'
                    ? ({
                        cursor: canShakeSeeds ? 'pointer' : 'default',
                        userSelect: 'none',
                        WebkitUserSelect: 'none',
                        touchAction: 'manipulation',
                        outlineStyle: 'none',
                      } as any)
                    : {}),
                }}
              >
                <SeedMark category={FALLBACK_CATEGORY} size={compactLandscape ? 11 : 17} />
                <Text
                  selectable={false}
                  style={{
                    fontFamily: 'Lato_700Bold',
                    color: '#694321',
                    fontSize: compactLandscape ? 8.4 : 12,
                    lineHeight: compactLandscape ? 9.8 : 14,
                  }}
                >
                  Seed Shaker
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}
