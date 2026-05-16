import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  LayoutChangeEvent,
  PanResponder,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import Svg, { Circle, Ellipse, G, Line, Path, Rect, Text as SvgText, TSpan } from 'react-native-svg';
import type { Skill } from '../../types';

type GardenSkill = Pick<Skill, 'id' | 'description'> & Partial<Skill>;
type WildflowerSpecies = 'poppy' | 'daisy' | 'lavender' | 'sunflower';
type PlantSkillOptions = { enthusiasmLevel?: number };
type PlantSkillsOptions = { mode?: 'fill' | 'replace' };
type PlantSkillSelection = { description: string; enthusiasmLevel?: number };

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
const GARDEN_CAPACITY = 8;
const SEED_TRAY_SIZE = GARDEN_CAPACITY;
const VISIBLE_BLOOM_LIMIT = GARDEN_CAPACITY;

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
    prompt: 'A future-you badge would say...',
    choices: [
      { icon: '🏡', label: 'Builder of cozy worlds', detail: 'Homes, rituals, care systems', seeds: ['Cooking', 'Home Repairs', 'Furniture Building', 'Plant Parenting', 'Party Planning'] },
      { icon: '🚀', label: 'Architect of wild plans', detail: 'Bold ideas with an engine', seeds: ['Starship Navigation', 'App Building', 'Salary Negotiation', 'Coding', 'Budget Magic'] },
      { icon: '🎐', label: 'Keeper of subtle signals', detail: 'Pattern, mood, intuition', seeds: ['Dream Interpretation', 'Astrology', 'Tarot Reading', 'Sound Healing', 'Meditation'] },
      { icon: '🌻', label: 'Friend of becoming', detail: 'Growth, practice, encouragement', seeds: ['Yoga', 'Breathwork', 'Language Teaching', 'Interview Prep', 'Pep Talks'] },
    ],
  },
];

const STAGES: StageDef[] = [
  { label: 'Seed', height: 24, canvasWidth: 72, labelWidth: 100 },
  { label: 'Tiny bloom', height: 62, canvasWidth: 88, labelWidth: 108 },
  { label: 'Small bloom', height: 82, canvasWidth: 104, labelWidth: 120 },
  { label: 'Bloom', height: 104, canvasWidth: 122, labelWidth: 132 },
  { label: 'Big bloom', height: 124, canvasWidth: 142, labelWidth: 146 },
  { label: 'Full bloom', height: 146, canvasWidth: 162, labelWidth: 158 },
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
  bottomRatio: 0.22 + (((index * 4.17) % 100) / 100) * 0.18,
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

function isBloomingSkill(skill: Partial<Skill>) {
  return getLevel(skill) > 0;
}

function getStage(level: number) {
  return STAGES[clamp(level, 0, STAGES.length - 1)];
}

function getEmbeddedLabelLines(label: string) {
  const words = label.trim().split(/\s+/).filter(Boolean);
  if (words.length <= 1) return [label.trim().slice(0, 14)];

  const lines: string[] = [];
  let current = '';
  words.forEach(word => {
    const next = current ? `${current} ${word}` : word;
    if (next.length <= 12 || lines.length === 0 && words.length === 2) {
      current = next;
      return;
    }
    lines.push(current);
    current = word;
  });
  if (current) lines.push(current);

  return lines.slice(0, 2).map(line => line.length > 14 ? `${line.slice(0, 12)}…` : line);
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

function getMeadowHeight(skillCount: number, width: number) {
  const base = skillCount === 0 ? (width < 420 ? 310 : 350) : (width < 420 ? 430 : 480);
  const extra = Math.max(0, skillCount - (width < 420 ? 10 : 18)) * (width < 420 ? 8 : 5);
  return clamp(base + extra, base, width < 420 ? 660 : 720);
}

function normalizeSkillName(skill: string) {
  return skill.trim().toLowerCase();
}

function getSeedTray(seedSkills: string[], plantedNames: Set<string>, shakeIndex: number, limit = SEED_TRAY_SIZE) {
  const readySeeds = seedSkills
    .filter(skill => !plantedNames.has(normalizeSkillName(skill)))
    .filter((skill, index, all) => all.findIndex(item => normalizeSkillName(item) === normalizeSkillName(skill)) === index);

  return readySeeds
    .map(skill => ({
      skill,
      score: hashString(`${skill}:${shakeIndex}:skill-seeds`),
    }))
    .sort((a, b) => a.score - b.score)
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
      .skill-seed-row-shake {
        animation-name: skillSeedShake;
        animation-duration: 420ms;
        animation-timing-function: ease-in-out;
        transform-origin: 50% 100%;
        will-change: transform;
      }
    `;
    document.head.appendChild(style);
  }, []);
}

function MeadowAtmosphere({ width, height }: { width: number; height: number }) {
  const hillHeight = Math.max(260, height - GROUND_HEIGHT + 28);

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
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: Math.max(16, width * 0.06),
          top: Math.max(18, height * 0.06),
          width: Math.min(190, width * 0.28),
          height: Math.min(190, width * 0.28),
          borderRadius: 999,
          backgroundColor: 'rgba(255,229,110,0.38)',
          shadowColor: '#f2c85a',
          shadowOpacity: 0.36,
          shadowRadius: 52,
          shadowOffset: { width: 0, height: 0 },
        }}
      />
      {width > 0 && DISTANT_BLOOMS.map((bloom, index) => (
        <View
          pointerEvents="none"
          key={`distant-bloom-${index}`}
          style={{
            position: 'absolute',
            left: width * bloom.leftRatio,
            bottom: GROUND_HEIGHT + height * bloom.bottomRatio,
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

function renderDaisy(cx: number, cy: number, radius: number, full: boolean, category: SkillCategoryDef) {
  const petalCount = full ? 14 : 10;
  return (
    <G>
      {Array.from({ length: petalCount }, (_, petal) => {
        const angle = petal * (360 / petalCount);
        return (
          <G key={petal} transform={`rotate(${angle} ${cx} ${cy})`}>
            <Ellipse
              cx={cx}
              cy={cy - radius * 0.72}
              rx={radius * (full ? 0.21 : 0.19)}
              ry={radius * (full ? 0.48 : 0.42)}
              fill={full ? '#fffdf7' : category.pale}
              stroke={category.edge}
              strokeWidth={1}
            />
          </G>
        );
      })}
      <Circle cx={cx} cy={cy} r={radius * (full ? 0.34 : 0.3)} fill="#d8aa37" stroke="#a37b25" strokeWidth={1.2} />
      <Circle cx={cx - radius * 0.1} cy={cy - radius * 0.08} r={radius * 0.06} fill="#fff5c8" opacity={0.76} />
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

function renderBloom(species: WildflowerSpecies, cx: number, cy: number, radius: number, full: boolean, category: SkillCategoryDef) {
  return renderDaisy(cx, cy, radius, full, category);
}

function renderEmbeddedSkillLabel({
  label,
  species,
  cx,
  cy,
  radius,
  category,
}: {
  label?: string;
  species: WildflowerSpecies;
  cx: number;
  cy: number;
  radius: number;
  category: SkillCategoryDef;
}) {
  if (!label) return null;

  const lines = getEmbeddedLabelLines(label);
  const fontSize = clamp(radius * 0.32 - Math.max(0, label.length - 12) * 0.08, 5.8, 8.2);
  const badgeWidth = clamp(radius * (species === 'lavender' ? 1.72 : 2.12), 38, 62);
  const badgeHeight = lines.length > 1 ? fontSize * 2.45 : fontSize * 1.72;
  const badgeY = species === 'lavender' ? cy - radius * 0.06 : cy - badgeHeight / 2;

  return (
    <G>
      <Rect
        x={cx - badgeWidth / 2}
        y={badgeY}
        width={badgeWidth}
        height={badgeHeight}
        rx={badgeHeight / 2}
        fill="rgba(255,253,247,0.86)"
        stroke={category.edge}
        strokeOpacity={0.2}
        strokeWidth={0.8}
      />
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
            y={badgeY + fontSize * (lines.length > 1 ? 0.88 + index * 1.04 : 1.1)}
          >
            {line}
          </TSpan>
        ))}
      </SvgText>
    </G>
  );
}

function WildflowerSvg({
  level,
  species,
  category,
  label,
}: {
  level: number;
  species: WildflowerSpecies;
  category: SkillCategoryDef;
  label?: string;
}) {
  const stage = getStage(level);
  const canvasWidth = stage.canvasWidth;
  const canvasHeight = stage.height + 12;
  const cx = canvasWidth / 2;
  const baseY = canvasHeight - 4;
  const leaf = category.leaf;

  if (level === 0) {
    return (
      <Svg width={canvasWidth} height={canvasHeight} viewBox={`0 0 ${canvasWidth} ${canvasHeight}`}>
        <Ellipse cx={cx} cy={baseY - 2} rx={5.2} ry={3.6} fill="#5b3a22" stroke="#2d1c12" strokeWidth={1} />
        <Ellipse cx={cx - 1.4} cy={baseY - 3.4} rx={1.4} ry={0.9} fill="#b98f5e" opacity={0.7} />
      </Svg>
    );
  }

  const full = level >= 4;
  const bloomRadius = [0, 10, 14, 18, 21, 25][level] ?? 18;
  const topY = baseY - (34 + level * 9);
  const flowerX = cx + (species === 'poppy' ? -3 : species === 'lavender' ? 2 : 0);
  const flowerY = topY;

  return (
    <Svg width={canvasWidth} height={canvasHeight} viewBox={`0 0 ${canvasWidth} ${canvasHeight}`}>
      {renderStem({ cx, baseY, topY: flowerY + bloomRadius * 0.25, leafColor: leaf, strokeWidth: 2 + level * 0.18, lean: flowerX - cx })}
      {renderBloom(species, flowerX, flowerY, bloomRadius, full, category)}
      {renderEmbeddedSkillLabel({
        label,
        species,
        cx: flowerX,
        cy: flowerY,
        radius: bloomRadius,
        category,
      })}
    </Svg>
  );
}

function WildflowerSprite({
  level,
  category,
  swaySalt,
  label,
}: {
  level: number;
  category: SkillCategoryDef;
  swaySalt: string;
  label?: string;
}) {
  const stage = getStage(level);
  const species: WildflowerSpecies = 'daisy';
  const spriteScale = level >= 4 ? 1.18 : level >= 2 ? 1.1 : 1;
  const shouldSway = Platform.OS === 'web' && level >= 4;
  const swayDelay = -Math.round(ratioFromHash(swaySalt, 4) * 2600);
  const swayDuration = 3300 + Math.round(ratioFromHash(swaySalt, 5) * 1200);

  return (
    <View
      pointerEvents="none"
      style={{
        width: stage.canvasWidth,
        height: stage.height + 18,
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
          width: stage.canvasWidth,
          height: stage.height + 18,
          alignItems: 'center',
          justifyContent: 'flex-end',
          transform: [{ scale: spriteScale }],
        }}
      >
        <WildflowerSvg
          level={level}
          species={species}
          category={category}
          label={level >= 4 ? label : undefined}
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
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Ellipse
        cx="12"
        cy="13"
        rx="6.5"
        ry="4.4"
        fill={muted ? '#d7d0bf' : '#5b3a22'}
        stroke={muted ? '#b9ad96' : category.edge}
        strokeWidth="1.3"
        transform="rotate(-13 12 13)"
      />
      <Ellipse cx="9.5" cy="11.5" rx="1.7" ry="1" fill="#d9be8b" opacity={muted ? 0.38 : 0.72} />
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
      {[0, 72, 144, 216, 288].map(angle => (
        <G key={angle} transform={`rotate(${angle} 12 12)`}>
          <Ellipse cx="12" cy="6.7" rx="3" ry="5" fill={color} stroke={edge} strokeWidth="1" />
        </G>
      ))}
      <Circle cx="12" cy="12" r="3.3" fill={center} stroke={edge} strokeWidth="1" />
    </Svg>
  );
}

function GroundStrip({ width }: { width: number }) {
  return (
    <View
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        height: GROUND_HEIGHT,
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
}: SkillBubbleGardenProps & {
  skill: GardenSkill;
  index: number;
  count: number;
  width: number;
  height: number;
  selected: boolean;
  featured: boolean;
  onSelect: (skillId: string) => void;
}) {
  const level = getLevel(skill);
  const stage = getStage(level);
  const category = getCategoryForSkill(skill.description);
  const fallback = getDefaultPosition(skill, index, count);
  const storedX = typeof skill.display_x === 'number' ? skill.display_x : fallback.x;
  const storedY = typeof skill.display_y === 'number' ? skill.display_y : fallback.y;
  const x = clamp(storedX, 0.06, 0.94);
  const y = clamp(storedY, 0.54, 0.96);
  const plantWidth = stage.labelWidth;
  const plantHeight = stage.height + LABEL_HEIGHT + 14;
  const anchorY = clamp(y * height, stage.height + LABEL_HEIGHT + 10, height - 9);
  const left = clamp(x * width - plantWidth / 2, FIELD_SIDE_PADDING, Math.max(FIELD_SIDE_PADDING, width - plantWidth - FIELD_SIDE_PADDING));
  const top = clamp(anchorY - plantHeight, 6, Math.max(6, height - plantHeight - 4));
  const labelFont = clamp(12 - Math.max(0, skill.description.length - 22) * 0.08, 9.4, 12);
  const pan = useRef(new Animated.ValueXY()).current;
  const grow = useRef(new Animated.Value(0)).current;
  const dragStart = useRef({ left, top });
  const didDrag = useRef(false);
  const canDrag = !!editable;
  const bloomHasEmbeddedLabel = level >= 4;
  const showLabel = !bloomHasEmbeddedLabel && (selected || count <= 10 || featured);

  useEffect(() => {
    grow.setValue(0);
    Animated.spring(grow, {
      toValue: 1,
      useNativeDriver: true,
      tension: 58,
      friction: 9,
    }).start();
  }, [grow, skill.id, level]);

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

  const cycleLevel = () => {
    onSelect(skill.id);
    if (!editable || !onUpdateSkill) return;
    if (didDrag.current) {
      didDrag.current = false;
      return;
    }

    onUpdateSkill(skill, {
      enthusiasm_level: level >= 5 ? 5 : clamp(level + 1, 1, 5),
    });
  };

  const updateLevel = (nextLevel: number) => {
    if (!editable || !onUpdateSkill) return;
    onSelect(skill.id);
    onUpdateSkill(skill, {
      enthusiasm_level: clamp(nextLevel, 0, 5),
    });
  };

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
    <Animated.View
      {...responder.panHandlers}
      style={{
        position: 'absolute',
        left,
        top,
        zIndex: Math.round(y * 1000),
        transform: [
          { translateX: pan.x },
          { translateY: Animated.add(pan.y, grow.interpolate({ inputRange: [0, 1], outputRange: [18, 0] })) },
          { scale: grow.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }) },
        ],
        opacity: grow.interpolate({ inputRange: [0, 1], outputRange: [0.2, 1] }),
        ...(Platform.OS === 'web'
          ? ({
              cursor: editable ? 'pointer' : 'default',
              userSelect: 'none',
              WebkitUserSelect: 'none',
              touchAction: 'none',
              filter: selected ? 'drop-shadow(0 10px 16px rgba(77, 58, 34, 0.18))' : undefined,
            } as any)
          : {}),
      }}
    >
      <Pressable
        onPress={cycleLevel}
        disabled={!editable}
        accessibilityRole={editable ? 'button' : undefined}
        accessibilityLabel={`${skill.description}, ${stage.label}`}
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
                touchAction: 'none',
              } as any)
            : {}),
        }}
      >
        <View style={{ width: plantWidth, height: stage.height + 18, alignItems: 'center', justifyContent: 'flex-end' }}>
          <WildflowerSprite
            level={level}
            category={category}
            swaySalt={`${skill.id}:${skill.description}`}
            label={skill.description}
          />
        </View>

        {label}
        {selected && editable && (
          <View
            style={{
              position: 'absolute',
              left: plantWidth / 2 - 52,
              top: 0,
              minWidth: 104,
              minHeight: 28,
              borderRadius: 999,
              backgroundColor: 'rgba(255,253,247,0.95)',
              borderWidth: 1,
              borderColor: 'rgba(122,89,42,0.16)',
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
              paddingHorizontal: 4,
              shadowColor: '#5b3a22',
              shadowOpacity: 0.12,
              shadowRadius: 10,
              shadowOffset: { width: 0, height: 3 },
              zIndex: 6,
              ...(Platform.OS === 'web'
                ? ({
                    cursor: 'default',
                    userSelect: 'none',
                    WebkitUserSelect: 'none',
                    touchAction: 'manipulation',
                  } as any)
                : {}),
            }}
          >
            {[
              { label: '-', action: () => updateLevel(level - 1), disabled: level <= 1, accessibilityLabel: `Shrink ${skill.description}` },
              { label: '+', action: () => updateLevel(level + 1), disabled: level >= 5, accessibilityLabel: `Grow ${skill.description}` },
              { label: 'Seed', action: () => updateLevel(0), disabled: false, accessibilityLabel: `Return ${skill.description} to seeds` },
            ].map(action => (
              <Pressable
                key={action.label}
                disabled={action.disabled}
                accessibilityRole="button"
                accessibilityLabel={action.accessibilityLabel}
                hitSlop={6}
                onPress={(event) => {
                  event.stopPropagation?.();
                  action.action();
                }}
                style={{
                  minWidth: action.label === 'Seed' ? 44 : 24,
                  height: 22,
                  borderRadius: 999,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: action.label === 'Seed' ? 'rgba(248,238,226,0.82)' : category.pale,
                  opacity: action.disabled ? 0.38 : 1,
                  ...(Platform.OS === 'web'
                    ? ({
                        cursor: action.disabled ? 'default' : 'pointer',
                      } as any)
                    : {}),
                }}
              >
                <Text
                  selectable={false}
                  numberOfLines={1}
                  style={{
                    fontFamily: 'Lato_700Bold',
                    color: action.label === 'Seed' ? '#7a5a36' : category.text,
                    fontSize: action.label === 'Seed' ? 10 : 14,
                    lineHeight: action.label === 'Seed' ? 12 : 16,
                  }}
                >
                  {action.label}
                </Text>
              </Pressable>
            ))}
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
}

function SeedButton({
  skill,
  onPlantSkill,
  planted = false,
}: {
  skill: string;
  index: number;
  onPlantSkill?: (skillDescription: string, options?: PlantSkillOptions) => void;
  planted?: boolean;
}) {
  const category = getCategoryForSkill(skill);

  return (
    <Pressable
      onPress={() => {
        if (!planted) onPlantSkill?.(skill, { enthusiasmLevel: 1 });
      }}
      disabled={!onPlantSkill || planted}
      accessibilityRole="button"
      accessibilityLabel={planted ? `${skill} already planted` : `Plant ${skill}`}
      accessibilityState={{ disabled: !onPlantSkill || planted }}
      style={{
        minHeight: 42,
        minWidth: 104,
        flexBasis: 112,
        flexGrow: 1,
        maxWidth: 156,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: planted ? 'rgba(217,190,139,0.16)' : 'rgba(255,253,247,0.28)',
        backgroundColor: planted ? 'rgba(83,55,34,0.38)' : 'rgba(255,250,236,0.92)',
        paddingHorizontal: 9,
        paddingVertical: 7,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 7,
        opacity: planted ? 0.58 : 1,
        shadowColor: '#160c08',
        shadowOpacity: planted ? 0.02 : 0.16,
        shadowRadius: 7,
        shadowOffset: { width: 0, height: 2 },
        ...(Platform.OS === 'web'
          ? ({
              cursor: onPlantSkill && !planted ? 'pointer' : 'default',
              userSelect: 'none',
              WebkitUserSelect: 'none',
              touchAction: 'manipulation',
            } as any)
          : {}),
      }}
    >
      <View
        style={{
          width: 28,
          height: 28,
          borderRadius: 14,
          backgroundColor: planted ? 'rgba(255,253,247,0.16)' : 'rgba(255,253,247,0.82)',
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: 1,
          borderColor: planted ? 'rgba(255,253,247,0.18)' : 'rgba(255,253,247,0.72)',
        }}
      >
        <SeedMark category={category} size={17} muted={planted} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          selectable={false}
          numberOfLines={2}
          style={{
            fontFamily: 'Lato_700Bold',
            color: planted ? '#8f8a7f' : category.text,
            fontSize: 11.5,
            lineHeight: 13,
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

function CustomSeedButton({
  onPlantSkill,
  onPress,
}: {
  onPlantSkill?: (skillDescription: string, options?: PlantSkillOptions) => void;
  onPress?: () => void;
}) {
  const [isAdding, setIsAdding] = useState(false);
  const [draft, setDraft] = useState('');

  const plantCustomSeed = () => {
    const skill = draft.trim();
    if (!skill) return;

    if (onPlantSkill) {
      onPlantSkill(skill, { enthusiasmLevel: 1 });
      setDraft('');
      setIsAdding(false);
      return;
    }

    onPress?.();
  };

  if (isAdding && onPlantSkill) {
    return (
      <View
        style={{
          minHeight: 42,
          minWidth: 186,
          flexBasis: 220,
          flexGrow: 1,
          maxWidth: 280,
          borderRadius: 22,
          borderWidth: 1,
          borderColor: 'rgba(255,253,247,0.32)',
          backgroundColor: 'rgba(255,250,236,0.95)',
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          paddingHorizontal: 8,
          paddingVertical: 6,
        }}
      >
        <TextInput
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={plantCustomSeed}
          autoFocus
          returnKeyType="done"
          placeholder="New skill"
          placeholderTextColor="rgba(105,67,33,0.48)"
          style={{
            flex: 1,
            minWidth: 0,
            fontFamily: 'Lato_700Bold',
            color: '#4a2b19',
            fontSize: 12,
            paddingVertical: 6,
            paddingHorizontal: 4,
            ...(Platform.OS === 'web'
              ? ({
                  outlineStyle: 'none',
                } as any)
              : {}),
          }}
        />
        <Pressable
          onPress={plantCustomSeed}
          accessibilityRole="button"
          accessibilityLabel="Plant custom skill"
          style={{
            minWidth: 42,
            minHeight: 28,
            borderRadius: 999,
            backgroundColor: '#315d4e',
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: 8,
            ...(Platform.OS === 'web'
              ? ({
                  cursor: 'pointer',
                } as any)
              : {}),
          }}
        >
          <Text selectable={false} style={{ fontFamily: 'Lato_700Bold', color: '#fffdf7', fontSize: 11 }}>
            Plant
          </Text>
        </Pressable>
        <Pressable
          onPress={() => {
            setDraft('');
            setIsAdding(false);
          }}
          accessibilityRole="button"
          accessibilityLabel="Cancel custom skill"
          style={{
            width: 26,
            height: 26,
            borderRadius: 13,
            alignItems: 'center',
            justifyContent: 'center',
            ...(Platform.OS === 'web'
              ? ({
                  cursor: 'pointer',
                } as any)
              : {}),
          }}
        >
          <Text selectable={false} style={{ fontFamily: 'Lato_700Bold', color: '#7d6843', fontSize: 14 }}>
            x
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    <Pressable
      onPress={() => {
        if (onPlantSkill) {
          setIsAdding(true);
          return;
        }
        onPress?.();
      }}
      disabled={!onPress && !onPlantSkill}
      accessibilityRole="button"
      accessibilityLabel="Plant your own skill"
      accessibilityState={{ disabled: !onPress && !onPlantSkill }}
      style={{
        minHeight: 42,
        minWidth: 124,
        flexBasis: 136,
        flexGrow: 1,
        maxWidth: 178,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: 'rgba(255,253,247,0.38)',
        backgroundColor: 'rgba(255,253,247,0.95)',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'flex-start',
        gap: 7,
        paddingHorizontal: 9,
        paddingVertical: 7,
        shadowColor: '#160c08',
        shadowOpacity: 0.13,
        shadowRadius: 7,
        shadowOffset: { width: 0, height: 2 },
        ...(Platform.OS === 'web'
          ? ({
              cursor: onPress || onPlantSkill ? 'pointer' : 'default',
              userSelect: 'none',
              WebkitUserSelect: 'none',
              touchAction: 'manipulation',
            } as any)
          : {}),
      }}
    >
      <View
        style={{
          width: 28,
          height: 28,
          borderRadius: 14,
          backgroundColor: 'rgba(238,246,240,0.78)',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <BloomMark category={FALLBACK_CATEGORY} size={18} />
      </View>
      <Text
        selectable={false}
        numberOfLines={2}
        style={{
          fontFamily: 'Lato_700Bold',
          color: '#315d4e',
          fontSize: 11.5,
          lineHeight: 13,
          flex: 1,
        }}
      >
        Plant your own
      </Text>
    </Pressable>
  );
}

function getSurveySuggestions(answers: number[], plantedNames: Set<string>, limit = GARDEN_CAPACITY) {
  const scores = new Map<string, number>();

  answers.forEach((choiceIndex, questionIndex) => {
    const choice = SEED_SURVEY[questionIndex]?.choices[choiceIndex];
    if (!choice) return;

    choice.seeds.forEach((seed, seedIndex) => {
      const normalized = normalizeSkillName(seed);
      if (plantedNames.has(normalized)) return;
      scores.set(seed, (scores.get(seed) ?? 0) + 12 - seedIndex);
    });
  });

  const ranked = [...scores.entries()]
    .map(([description, score]) => ({
      description,
      score: score * 100000 + hashString(description),
    }))
    .sort((left, right) => right.score - left.score)
    .slice(0, limit)
    .map((item, index) => ({
      description: item.description,
      enthusiasmLevel: index < 3 ? 5 : index < 6 ? 4 : 3,
    }));

  return ranked;
}

function SeedSurvey({
  plantedNames,
  hasSkills,
  openSlots,
  onPlantSkill,
  onPlantSkills,
}: {
  plantedNames: Set<string>;
  hasSkills: boolean;
  openSlots: number;
  onPlantSkill?: (skillDescription: string, options?: PlantSkillOptions) => void;
  onPlantSkills?: (skills: PlantSkillSelection[], options?: PlantSkillsOptions) => void;
}) {
  const [active, setActive] = useState(false);
  const [answers, setAnswers] = useState<number[]>([]);
  const [suggestions, setSuggestions] = useState<PlantSkillSelection[]>([]);
  const question = SEED_SURVEY[answers.length];
  const complete = answers.length >= SEED_SURVEY.length;

  const resetSurvey = () => {
    setAnswers([]);
    setSuggestions([]);
  };

  const plantSuggestions = (mode: PlantSkillsOptions['mode']) => {
    if (suggestions.length === 0) {
      resetSurvey();
      return;
    }

    const chosenSuggestions = mode === 'fill'
      ? suggestions.slice(0, Math.max(0, openSlots))
      : suggestions.slice(0, GARDEN_CAPACITY);

    if (onPlantSkills) {
      onPlantSkills(chosenSuggestions, { mode });
    } else {
      chosenSuggestions.forEach(seed => onPlantSkill?.(seed.description, { enthusiasmLevel: seed.enthusiasmLevel }));
    }

    setActive(false);
    resetSurvey();
  };

  if (!active) {
    return (
      <Pressable
        onPress={() => setActive(true)}
        accessibilityRole="button"
        accessibilityLabel="Seed your garden"
        style={{
          minHeight: hasSkills ? 72 : 178,
          borderRadius: hasSkills ? 22 : 24,
          borderWidth: 1,
          borderColor: hasSkills ? 'rgba(255,253,247,0.68)' : 'rgba(255,253,247,0.62)',
          backgroundColor: hasSkills ? 'rgba(255,253,247,0.92)' : 'rgba(255,253,247,0.9)',
          paddingHorizontal: hasSkills ? 13 : 18,
          paddingVertical: hasSkills ? 12 : 18,
          marginBottom: hasSkills ? 0 : 0,
          alignItems: hasSkills ? 'stretch' : 'center',
          justifyContent: 'center',
          gap: hasSkills ? 12 : 14,
          shadowColor: '#315d4e',
          shadowOpacity: hasSkills ? 0.14 : 0.16,
          shadowRadius: hasSkills ? 18 : 28,
          shadowOffset: { width: 0, height: hasSkills ? 8 : 12 },
          elevation: hasSkills ? 3 : 0,
          ...(Platform.OS === 'web'
            ? ({
                cursor: 'pointer',
                userSelect: 'none',
                WebkitUserSelect: 'none',
              } as any)
            : {}),
        }}
      >
        {hasSkills ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View
              style={{
                width: 34,
                height: 34,
                borderRadius: 17,
                backgroundColor: '#eef8e8',
                borderWidth: 1,
                borderColor: 'rgba(92,157,91,0.2)',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <BloomMark category={FALLBACK_CATEGORY} size={22} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text selectable={false} numberOfLines={1} style={{ fontFamily: 'Lato_700Bold', color: '#2f7147', fontSize: 13 }}>
                Skills Garden
              </Text>
              <Text selectable={false} numberOfLines={2} style={{ fontFamily: 'Lato_400Regular', color: '#5d8b67', fontSize: 11, lineHeight: 14, marginTop: 2 }}>
                Need help? Take the quiz to populate your garden.
              </Text>
            </View>
            <View
              style={{
                minHeight: 30,
                borderRadius: 999,
                backgroundColor: '#315d4e',
                paddingHorizontal: 11,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text selectable={false} style={{ fontFamily: 'Lato_700Bold', color: '#fffdf7', fontSize: 11 }}>
                Begin
              </Text>
            </View>
          </View>
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
      style={{
        borderRadius: 18,
        borderWidth: 1,
        borderColor: hasSkills ? 'rgba(92,157,91,0.24)' : 'rgba(255,253,247,0.62)',
        backgroundColor: hasSkills ? '#eef8e8' : 'rgba(255,253,247,0.92)',
        padding: hasSkills ? 12 : 14,
        marginBottom: hasSkills ? 12 : 0,
        shadowColor: hasSkills ? '#5b3a22' : '#315d4e',
        shadowOpacity: hasSkills ? 0.04 : 0.12,
        shadowRadius: hasSkills ? 8 : 24,
        shadowOffset: { width: 0, height: hasSkills ? 2 : 10 },
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
        <View style={{ flex: 1 }}>
          <Text selectable={false} style={{ fontFamily: 'Lato_700Bold', color: '#2f7147', fontSize: 13 }}>
            Skills Garden
          </Text>
          <Text selectable={false} style={{ fontFamily: 'Lato_400Regular', color: '#5d8b67', fontSize: 11, marginTop: 1 }}>
            {complete ? 'Your garden pattern is ready' : `${answers.length + 1}/${SEED_SURVEY.length}`}
          </Text>
        </View>
        <Pressable
          onPress={() => {
            setActive(false);
            resetSurvey();
          }}
          accessibilityRole="button"
          accessibilityLabel="Close garden survey"
          style={{
            minWidth: 54,
            minHeight: 30,
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
          <Text selectable={false} style={{ fontFamily: 'Lato_700Bold', color: '#5d8b67', fontSize: 11 }}>
            Later
          </Text>
        </Pressable>
      </View>

      {!complete && question ? (
        <>
          <View style={{ flexDirection: 'row', gap: 4, marginBottom: 10 }}>
            {SEED_SURVEY.map((_, index) => (
              <View
                key={index}
                style={{
                  flex: 1,
                  height: 4,
                  borderRadius: 99,
                  backgroundColor: index <= answers.length ? '#3f9958' : 'rgba(63,153,88,0.18)',
                }}
              />
            ))}
          </View>
          <Text selectable={false} style={{ fontFamily: 'LibreBaskerville_700Bold', color: '#315d4e', fontSize: 16, lineHeight: 21, marginBottom: 10 }}>
            {question.prompt}
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {question.choices.map((choice, index) => (
              <Pressable
                key={choice.label}
                onPress={() => {
                  const nextAnswers = [...answers, index];
                  if (nextAnswers.length >= SEED_SURVEY.length) {
                    setSuggestions(getSurveySuggestions(nextAnswers, plantedNames, GARDEN_CAPACITY));
                  }
                  setAnswers(nextAnswers);
                }}
                accessibilityRole="button"
                accessibilityLabel={choice.label}
                style={{
                  minHeight: 86,
                  minWidth: 150,
                  flexGrow: 1,
                  flexBasis: 160,
                  borderRadius: 18,
                  borderWidth: 1,
                  borderColor: 'rgba(92,157,91,0.22)',
                  backgroundColor: '#fffdf7',
                  paddingHorizontal: 11,
                  paddingVertical: 9,
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
                <Text selectable={false} style={{ fontSize: 22, lineHeight: 26, marginBottom: 5 }}>
                  {choice.icon}
                </Text>
                <Text selectable={false} style={{ fontFamily: 'Lato_700Bold', color: '#315d4e', fontSize: 12.5, lineHeight: 15 }}>
                  {choice.label}
                </Text>
                <Text selectable={false} numberOfLines={2} style={{ fontFamily: 'Lato_400Regular', color: '#5d8b67', fontSize: 10.5, lineHeight: 13, marginTop: 3 }}>
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
                accessibilityLabel="Plant a fresh garden"
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
                <Text selectable={false} style={{ fontFamily: 'Lato_700Bold', color: '#fffdf7', fontSize: 13 }}>
                  Plant Fresh Garden
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
              onPress={() => resetSurvey()}
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
}: SkillBubbleGardenProps) {
  useWildflowerStyles();

  const [width, setWidth] = useState(0);
  const [seedShake, setSeedShake] = useState(0);
  const [selectedSkillId, setSelectedSkillId] = useState<string | null>(null);
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
    () => [...dormantSeedNames, ...seedSkills],
    [dormantSeedNames, seedSkills]
  );
  const openSlots = Math.max(0, GARDEN_CAPACITY - visibleSkills.length);
  const seedTray = useMemo(
    () => editable && openSlots > 0 ? getSeedTray(seedSourceSkills, plantedNames, seedShake, openSlots) : [],
    [editable, openSlots, plantedNames, seedShake, seedSourceSkills]
  );
  const availableSeedCount = useMemo(
    () => seedSourceSkills
      .filter((skill) => !plantedNames.has(normalizeSkillName(skill)))
      .filter((skill, index, all) => all.findIndex(item => normalizeSkillName(item) === normalizeSkillName(skill)) === index)
      .length,
    [plantedNames, seedSourceSkills]
  );
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
  const meadowHeight = getMeadowHeight(visibleSkills.length, width || 680);

  const handleLayout = (event: LayoutChangeEvent) => {
    setWidth(event.nativeEvent.layout.width);
  };

  return (
    <View
      onLayout={handleLayout}
      style={{
        borderRadius: 18,
        backgroundColor: '#fffdf7',
        borderWidth: 1,
        borderColor: 'rgba(222,193,129,0.42)',
        overflow: 'hidden',
      }}
    >
      <View
        style={{
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
        <MeadowAtmosphere width={width} height={meadowHeight} />
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

        <GroundStrip width={width} />

        {editable && displaySkills.length === 0 && (
          <View
            style={{
              position: 'absolute',
              left: 14,
              right: 14,
              top: 18,
              zIndex: 30,
            }}
          >
            <SeedSurvey
              plantedNames={plantedNames}
              hasSkills={false}
              openSlots={openSlots}
              onPlantSkill={onPlantSkill}
              onPlantSkills={onPlantSkills}
            />
          </View>
        )}

        {editable && displaySkills.length > 0 && (
          <View
            style={{
              position: 'absolute',
              left: 14,
              right: width > 620 ? undefined : 14,
              top: 14,
              width: width > 620 ? Math.min(380, Math.max(0, width - 28)) : undefined,
              zIndex: 35,
            }}
          >
            <SeedSurvey
              plantedNames={plantedNames}
              hasSkills
              openSlots={openSlots}
              onPlantSkill={onPlantSkill}
              onPlantSkills={onPlantSkills}
            />
          </View>
        )}

        {width > 0 && visibleSkills.map((skill, index) => (
          <SkillPlant
            key={skill.id}
            skill={skill}
            index={index}
            count={visibleSkills.length}
            width={width}
            height={meadowHeight}
            editable={editable}
            onUpdateSkill={onUpdateSkill}
            onDeleteSkill={onDeleteSkill}
            selected={selectedSkillId === skill.id}
            featured={featuredSkillIds.has(skill.id)}
            onSelect={setSelectedSkillId}
            skills={skills}
          />
        ))}

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

      {editable && openSlots > 0 && (seedTray.length > 0 || onPlantSkill || onAddCustomSkill) && (
        <View
          style={{
            borderTopWidth: 1,
            borderTopColor: 'rgba(78,124,63,0.34)',
            backgroundColor: '#3b2418',
            paddingHorizontal: 12,
            paddingTop: 7,
            paddingBottom: 8,
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
              marginBottom: 5,
            }}
          >
            <View>
              <Text
                style={{
                  fontFamily: 'Lato_700Bold',
                  color: '#f8eee2',
                  fontSize: 11,
                  letterSpacing: 0,
                }}
              >
                Skill Seeds
              </Text>
              <Text
                style={{
                  fontFamily: 'Lato_400Regular',
                  color: 'rgba(248,238,226,0.64)',
                  fontSize: 9.5,
                  marginTop: 1,
                }}
              >
                {`${visibleSkills.length}/${GARDEN_CAPACITY} blooming`}
              </Text>
            </View>
          </View>

          <View
            key={`skill-seed-row-${seedShake}`}
            className={Platform.OS === 'web' && seedShake > 0 ? 'skill-seed-row-shake' : undefined}
            style={{
              flexDirection: 'row',
              flexWrap: 'wrap',
              gap: 7,
              alignItems: 'center',
            }}
          >
            {seedTray.map((skill, index) => (
              <SeedButton
                key={`${skill}-${seedShake}`}
                skill={skill}
                index={index}
                onPlantSkill={onPlantSkill}
                planted={plantedNames.has(normalizeSkillName(skill))}
              />
            ))}
            {onPlantSkill || onAddCustomSkill ? (
              <CustomSeedButton onPlantSkill={onPlantSkill} onPress={onAddCustomSkill} />
            ) : null}
            {availableSeedCount > openSlots && (
              <Pressable
                onPress={() => setSeedShake(current => current + 1)}
                accessibilityRole="button"
                accessibilityLabel="Shake seeds"
                style={{
                  minHeight: 42,
                  minWidth: 118,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: 'rgba(255,253,247,0.34)',
                  backgroundColor: '#fffdf7',
                  paddingHorizontal: 12,
                  paddingVertical: 7,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 7,
                  shadowColor: '#160c08',
                  shadowOpacity: 0.16,
                  shadowRadius: 7,
                  shadowOffset: { width: 0, height: 2 },
                  ...(Platform.OS === 'web'
                    ? ({
                        cursor: 'pointer',
                        userSelect: 'none',
                        WebkitUserSelect: 'none',
                        touchAction: 'manipulation',
                      } as any)
                    : {}),
                }}
              >
                <SeedMark category={FALLBACK_CATEGORY} size={17} />
                <Text
                  selectable={false}
                  style={{
                    fontFamily: 'Lato_700Bold',
                    color: '#694321',
                    fontSize: 12,
                    lineHeight: 14,
                  }}
                >
                  Seed Shaker
                </Text>
              </Pressable>
            )}
          </View>
        </View>
      )}
    </View>
  );
}
