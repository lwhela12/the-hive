import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  LayoutChangeEvent,
  PanResponder,
  Platform,
  Pressable,
  Text,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import Svg, { Circle, Ellipse, G, Line, Path } from 'react-native-svg';
import type { Skill } from '../../types';

type GardenSkill = Pick<Skill, 'id' | 'description'> & Partial<Skill>;
type WildflowerSpecies = 'poppy' | 'daisy' | 'lavender' | 'sunflower';

type SkillBubbleGardenProps = {
  skills: GardenSkill[];
  editable?: boolean;
  onUpdateSkill?: (
    skill: GardenSkill,
    updates: Pick<Skill, 'enthusiasm_level' | 'display_x' | 'display_y'>
  ) => void;
  onDeleteSkill?: (skill: GardenSkill) => void;
  seedSkills?: string[];
  onPlantSkill?: (skillDescription: string) => void;
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
    color: '#c9b7f2',
    pale: '#f3f0fb',
    edge: '#9b84cf',
    text: '#4b3a68',
    leaf: '#778f7a',
    center: '#dfc76d',
    skills: ['Ocean Boiling', 'Starship Navigation', 'Time Travel Planning', 'Dragon Taming', 'Professional Napping', 'Cloud Watching', 'Parallel Universe Hopping', 'Tarot Reading', 'Astrology', 'Dream Interpretation', 'Crystal Collecting'],
  },
  {
    label: 'Movement',
    species: 'movement',
    color: '#d9be68',
    pale: '#fff8e6',
    edge: '#c6953f',
    text: '#5f4b22',
    leaf: '#789883',
    center: '#d4a447',
    skills: ['Aerial Acrobatics', 'Pole Dancing', 'Contortion', 'Trapeze', 'Aerial Silks', 'Handstands', 'Rock Climbing', 'Surfing', 'Skateboarding', 'Camping', 'Trail Finding', 'Yoga', 'Meditation', 'Breathwork'],
  },
  {
    label: 'Creative',
    species: 'creative',
    color: '#d99a9d',
    pale: '#fff0f0',
    edge: '#ca8f8f',
    text: '#713f3f',
    leaf: '#78977d',
    center: '#cf9a61',
    skills: ['Crocheting', 'Knitting', 'Embroidery', 'Macramé', 'Sewing', 'Photography', 'Video Editing', 'Graphic Design', 'Writing', 'Storytelling', 'Poetry', 'Painting', 'Pottery', 'DJing', 'Guitar Playing', 'Singing', 'Voice Acting', 'Stand-up Comedy', 'Karaoke Domination', 'Dance Floor Presence'],
  },
  {
    label: 'Care',
    species: 'care',
    color: '#f0bfd0',
    pale: '#fff2f6',
    edge: '#cf8fa7',
    text: '#70445a',
    leaf: '#78977d',
    center: '#d2a35a',
    skills: ['Sex Therapy', 'Couples Counseling', 'Intimacy Coaching', 'Massage', 'Reiki', 'Sound Healing', 'Hype Person', 'Deep Listening', 'Tough Love Delivery', 'Pep Talks', 'Wingman Services'],
  },
  {
    label: 'Home & Life',
    species: 'practical',
    color: '#b98f5e',
    pale: '#f8eee2',
    edge: '#bd8f5d',
    text: '#694321',
    leaf: '#80936f',
    center: '#c99a55',
    skills: ['Cooking', 'Meal Prep', 'Baking', 'Fermentation', 'Cocktail Crafting', 'Coffee Snobbery', 'Tea Ceremony', 'Gardening', 'Composting', 'Beekeeping', 'Plant Parenting', 'Foraging', 'Home Repairs', 'Furniture Building', 'Painting Walls', 'Moving Heavy Things', 'Assembling IKEA', 'Parallel Parking', 'Gift Wrapping', 'Party Planning', 'Surprise Orchestration', 'Dog Whispering', 'Cat Herding', 'Pet Photography', 'Animal Training'],
  },
  {
    label: 'Tech & Work',
    species: 'tech',
    color: '#9dbdb0',
    pale: '#eef6f0',
    edge: '#6f9584',
    text: '#315d4e',
    leaf: '#6f9584',
    center: '#c8a24f',
    skills: ['Coding', 'Web Design', 'App Building', 'Tax Wizardry', 'Spreadsheet Sorcery', 'Budget Magic', 'Resume Polishing', 'Interview Prep', 'Salary Negotiation', 'Language Teaching', 'Accent Coaching', 'Proofreading'],
  },
];

const MEADOW_BACKGROUND = require('../../assets/generated/skill-meadow-bg.png');
const FLOWER_ASSETS: Record<SkillCategoryDef['species'], Record<number, any>> = {
  wonder: {
    1: require('../../assets/generated/skill-wonder-1.png'),
    2: require('../../assets/generated/skill-wonder-2.png'),
    3: require('../../assets/generated/skill-wonder-3.png'),
    4: require('../../assets/generated/skill-wonder-4.png'),
    5: require('../../assets/generated/skill-wonder-5.png'),
  },
  movement: {
    1: require('../../assets/generated/skill-movement-1.png'),
    2: require('../../assets/generated/skill-movement-2.png'),
    3: require('../../assets/generated/skill-movement-3.png'),
    4: require('../../assets/generated/skill-movement-4.png'),
    5: require('../../assets/generated/skill-movement-5.png'),
  },
  creative: {
    1: require('../../assets/generated/skill-creative-1.png'),
    2: require('../../assets/generated/skill-creative-2.png'),
    3: require('../../assets/generated/skill-creative-3.png'),
    4: require('../../assets/generated/skill-creative-4.png'),
    5: require('../../assets/generated/skill-creative-5.png'),
  },
  care: {
    1: require('../../assets/generated/skill-care-1.png'),
    2: require('../../assets/generated/skill-care-2.png'),
    3: require('../../assets/generated/skill-care-3.png'),
    4: require('../../assets/generated/skill-care-4.png'),
    5: require('../../assets/generated/skill-care-5.png'),
  },
  practical: {
    1: require('../../assets/generated/skill-practical-1.png'),
    2: require('../../assets/generated/skill-practical-2.png'),
    3: require('../../assets/generated/skill-practical-3.png'),
    4: require('../../assets/generated/skill-practical-4.png'),
    5: require('../../assets/generated/skill-practical-5.png'),
  },
  tech: {
    1: require('../../assets/generated/skill-tech-1.png'),
    2: require('../../assets/generated/skill-tech-2.png'),
    3: require('../../assets/generated/skill-tech-3.png'),
    4: require('../../assets/generated/skill-tech-4.png'),
    5: require('../../assets/generated/skill-tech-5.png'),
  },
};

const FALLBACK_CATEGORY = CATEGORY_DEFS[CATEGORY_DEFS.length - 1];
const GROUND_HEIGHT = 88;
const LABEL_HEIGHT = 30;
const FIELD_SIDE_PADDING = 10;

const STAGES: StageDef[] = [
  { label: 'Seed', height: 24, canvasWidth: 72, labelWidth: 100 },
  { label: 'Sprout', height: 42, canvasWidth: 84, labelWidth: 108 },
  { label: 'Stem', height: 68, canvasWidth: 104, labelWidth: 124 },
  { label: 'Bud', height: 92, canvasWidth: 126, labelWidth: 136 },
  { label: 'Bloom', height: 116, canvasWidth: 146, labelWidth: 148 },
  { label: 'Full bloom', height: 138, canvasWidth: 166, labelWidth: 158 },
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

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
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
  const level = Number(skill.enthusiasm_level ?? 5);
  return clamp(Number.isFinite(level) ? level : 0, 0, 5);
}

function getStage(level: number) {
  return STAGES[clamp(level, 0, STAGES.length - 1)];
}

function getWildflowerSpecies(skill: GardenSkill, index: number, category: SkillCategoryDef) {
  const options = SPECIES_BY_CATEGORY[category.species];
  return options[(hashString(`${skill.id}:${skill.description}:${index}`) % options.length)];
}

function getDefaultPosition(skill: GardenSkill, index: number, count: number) {
  const baseSlot = (index + 0.5) / Math.max(1, count);
  const maxJitter = clamp(0.22 / Math.max(1, count), 0.018, 0.085);
  const jitter = (ratioFromHash(skill.id || skill.description, 1) - 0.5) * maxJitter * 2;
  const freeScatter = ratioFromHash(skill.description || skill.id, 3);
  const mixedX = count <= 3
    ? 0.1 + freeScatter * 0.8
    : baseSlot * 0.72 + freeScatter * 0.28;

  return {
    x: clamp(mixedX + jitter, 0.08, 0.92),
    y: clamp(0.8 + ratioFromHash(skill.description || skill.id, 2) * 0.14, 0.78, 0.95),
  };
}

function getMeadowHeight(skillCount: number, width: number) {
  const base = skillCount === 0 ? (width < 420 ? 230 : 255) : (width < 420 ? 340 : 390);
  const extra = Math.max(0, skillCount - (width < 420 ? 5 : 8)) * (width < 420 ? 18 : 12);
  return clamp(base + extra, base, width < 420 ? 520 : 560);
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
    `;
    document.head.appendChild(style);
  }, []);
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

function renderSunflower(cx: number, cy: number, radius: number, full: boolean, category: SkillCategoryDef) {
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
  if (species === 'sunflower') return renderSunflower(cx, cy, radius, full, category);
  if (species === 'poppy') return renderPoppy(cx, cy, radius, full, category);
  if (species === 'lavender') return renderLavender(cx, cy, radius, full, category);
  return renderDaisy(cx, cy, radius, full, category);
}

function WildflowerSvg({
  level,
  species,
  category,
}: {
  level: number;
  species: WildflowerSpecies;
  category: SkillCategoryDef;
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

  if (level === 1) {
    const topY = baseY - 18;
    return (
      <Svg width={canvasWidth} height={canvasHeight} viewBox={`0 0 ${canvasWidth} ${canvasHeight}`}>
        <Line x1={cx} y1={baseY} x2={cx} y2={topY + 4} stroke={leaf} strokeWidth={1.9} strokeLinecap="round" />
        <G transform={`rotate(-32 ${cx - 5} ${topY + 6})`}>
          <Ellipse cx={cx - 6} cy={topY + 6} rx={8} ry={3.5} fill={leaf} opacity={0.82} />
        </G>
        <G transform={`rotate(30 ${cx + 5} ${topY + 6})`}>
          <Ellipse cx={cx + 6} cy={topY + 6} rx={8} ry={3.5} fill={leaf} opacity={0.78} />
        </G>
      </Svg>
    );
  }

  if (level === 2) {
    const topY = baseY - 39;
    return (
      <Svg width={canvasWidth} height={canvasHeight} viewBox={`0 0 ${canvasWidth} ${canvasHeight}`}>
        {renderStem({ cx, baseY, topY, leafColor: leaf, strokeWidth: 2.2, lean: species === 'poppy' ? -2 : 1 })}
        <Circle cx={cx + (species === 'poppy' ? -2 : 1)} cy={topY} r={2.4} fill={leaf} opacity={0.8} />
      </Svg>
    );
  }

  if (level === 3) {
    const topY = baseY - 55;
    const budX = cx + (species === 'poppy' ? -3 : species === 'lavender' ? 2 : 0);
    return (
      <Svg width={canvasWidth} height={canvasHeight} viewBox={`0 0 ${canvasWidth} ${canvasHeight}`}>
        {renderStem({ cx, baseY, topY: topY + 10, leafColor: leaf, strokeWidth: 2.4, lean: budX - cx })}
        <Ellipse
          cx={budX}
          cy={topY}
          rx={species === 'lavender' ? 6 : 7.5}
          ry={species === 'lavender' ? 12 : 10.5}
          fill={species === 'sunflower' ? '#e5b645' : category.pale}
          stroke={category.edge}
          strokeWidth={1.3}
        />
        <Path
          d={`M ${budX - 9} ${topY + 10} C ${budX - 5} ${topY + 5}, ${budX - 2} ${topY + 5}, ${budX} ${topY + 13}
            C ${budX + 2} ${topY + 5}, ${budX + 5} ${topY + 5}, ${budX + 9} ${topY + 10}`}
          fill="none"
          stroke={leaf}
          strokeWidth={1.5}
          strokeLinecap="round"
        />
        <Ellipse cx={budX - 2.5} cy={topY - 3} rx={1.6} ry={4.4} fill="#fffdf7" opacity={0.56} />
      </Svg>
    );
  }

  const full = level === 5;
  const bloomRadius = full ? 24 : 19;
  const topY = full ? baseY - 72 : baseY - 58;
  const flowerX = cx + (species === 'poppy' ? -3 : species === 'lavender' ? 2 : 0);
  const flowerY = topY;

  return (
    <Svg width={canvasWidth} height={canvasHeight} viewBox={`0 0 ${canvasWidth} ${canvasHeight}`}>
      {renderStem({ cx, baseY, topY: flowerY + bloomRadius * 0.25, leafColor: leaf, strokeWidth: full ? 2.8 : 2.4, lean: flowerX - cx })}
      {renderBloom(species, flowerX, flowerY, bloomRadius, full, category)}
    </Svg>
  );
}

function WildflowerSprite({
  level,
  category,
  swaySalt,
}: {
  level: number;
  category: SkillCategoryDef;
  swaySalt: string;
}) {
  const stage = getStage(level);
  const imageLevel = clamp(level, 1, 5);
  const source = FLOWER_ASSETS[category.species][imageLevel];
  const imageSize = Math.round(stage.canvasWidth * (level >= 4 ? 1.12 : 1.04));
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
        // @ts-ignore - className applies the web-only CSS keyframe.
        className={shouldSway ? 'wildflower-sway' : undefined}
        style={{
          ...(shouldSway
            ? ({
                animationDelay: `${swayDelay}ms`,
                animationDuration: `${swayDuration}ms`,
                transformOrigin: '50% 100%',
              } as any)
            : {}),
          width: imageSize,
          height: imageSize,
          alignItems: 'center',
          justifyContent: 'flex-end',
        }}
      >
        <Image
          source={source}
          contentFit="contain"
          style={{
            width: imageSize,
            height: imageSize,
            opacity: level === 0 ? 0.72 : 1,
          }}
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
        borderTopColor: 'rgba(63,91,59,0.28)',
        backgroundColor: '#4f3421',
        overflow: 'hidden',
        ...(Platform.OS === 'web'
          ? ({
              backgroundImage: [
                'linear-gradient(180deg, rgba(128,147,92,0.92) 0px, rgba(92,124,74,0.96) 16px, rgba(83,64,39,0.98) 17px, rgba(77,49,29,0.98) 48px, rgba(42,27,18,1) 100%)',
                'radial-gradient(circle at 12% 62%, rgba(218,184,118,0.22) 0 2px, transparent 3px)',
                'radial-gradient(circle at 76% 72%, rgba(30,20,14,0.28) 0 2px, transparent 3px)',
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
          height: 18,
          backgroundColor: 'rgba(112,138,83,0.78)',
          ...(Platform.OS === 'web'
            ? ({
                backgroundImage: 'linear-gradient(180deg, rgba(152,168,99,0.92), rgba(78,112,69,0.9))',
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
            backgroundColor: index % 3 === 0 ? '#d2a35a' : '#251810',
            opacity: speck.opacity,
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
            width: 1.2,
            height: blade.height,
            borderRadius: 1,
            backgroundColor: index % 4 === 0 ? '#a5a762' : '#6d8d5f',
            opacity: blade.opacity,
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
}: SkillBubbleGardenProps & {
  skill: GardenSkill;
  index: number;
  count: number;
  width: number;
  height: number;
}) {
  const level = getLevel(skill);
  const stage = getStage(level);
  const category = getCategoryForSkill(skill.description);
  const fallback = getDefaultPosition(skill, index, count);
  const storedX = typeof skill.display_x === 'number' ? skill.display_x : fallback.x;
  const storedY = typeof skill.display_y === 'number' ? skill.display_y : fallback.y;
  const x = clamp(storedX, 0.06, 0.94);
  const y = clamp(storedY, 0.76, 0.96);
  const plantWidth = stage.labelWidth;
  const plantHeight = stage.height + LABEL_HEIGHT + 14;
  const anchorY = clamp(y * height, stage.height + LABEL_HEIGHT + 10, height - 9);
  const left = clamp(x * width - plantWidth / 2, FIELD_SIDE_PADDING, Math.max(FIELD_SIDE_PADDING, width - plantWidth - FIELD_SIDE_PADDING));
  const top = clamp(anchorY - plantHeight, 6, Math.max(6, height - plantHeight - 4));
  const labelFont = clamp(12 - Math.max(0, skill.description.length - 22) * 0.08, 9.8, 12);
  const pan = useRef(new Animated.ValueXY()).current;
  const grow = useRef(new Animated.Value(0)).current;
  const dragStart = useRef({ left, top });
  const didDrag = useRef(false);
  const canDrag = !!editable;

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
    if (!editable || !onUpdateSkill) return;
    if (didDrag.current) {
      didDrag.current = false;
      return;
    }

    onUpdateSkill(skill, {
      enthusiasm_level: level === 5 ? 0 : level + 1,
    });
  };

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
        {editable && onDeleteSkill && (
          <Pressable
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={`Remove ${skill.description}`}
            onPress={(event) => {
              event.stopPropagation?.();
              onDeleteSkill(skill);
            }}
            style={{
              position: 'absolute',
              right: 4,
              top: 0,
              width: 22,
              height: 22,
              borderRadius: 11,
              backgroundColor: 'rgba(255,253,247,0.94)',
              borderWidth: 1,
              borderColor: 'rgba(111,91,64,0.28)',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 4,
            }}
          >
            <Text style={{ fontFamily: 'Lato_700Bold', color: '#7a5a36', fontSize: 13, lineHeight: 16 }}>
              x
            </Text>
          </Pressable>
        )}

        <WildflowerSprite
          level={level}
          category={category}
          swaySalt={`${skill.id}:${skill.description}`}
        />

        <View
          style={{
            minHeight: 22,
            maxWidth: plantWidth - 10,
            paddingHorizontal: 7,
            paddingVertical: 3,
            borderRadius: 10,
            backgroundColor: level === 0 ? 'rgba(75,49,29,0.68)' : 'rgba(255,253,247,0.78)',
            borderWidth: 1,
            borderColor: level === 0 ? 'rgba(217,190,139,0.24)' : 'rgba(154,129,81,0.18)',
            alignItems: 'center',
            justifyContent: 'center',
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
              opacity: 0.9,
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
  onPlantSkill?: (skillDescription: string) => void;
  planted?: boolean;
}) {
  const category = getCategoryForSkill(skill);

  return (
    <Pressable
      onPress={() => {
        if (!planted) onPlantSkill?.(skill);
      }}
      disabled={!onPlantSkill || planted}
      style={{
        minHeight: 34,
        maxWidth: 208,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: planted ? 'rgba(115,154,136,0.22)' : `${category.edge}66`,
        backgroundColor: planted ? 'rgba(238,246,240,0.46)' : 'rgba(255,253,247,0.9)',
        paddingHorizontal: 11,
        paddingVertical: 6,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        opacity: planted ? 0.58 : 1,
        shadowColor: planted ? '#739a88' : category.edge,
        shadowOpacity: planted ? 0.02 : 0.1,
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
      <SeedMark category={category} size={18} muted={planted} />
      <Text
        selectable={false}
        numberOfLines={1}
        style={{
          fontFamily: 'Lato_700Bold',
          color: planted ? '#8f8a7f' : category.text,
          fontSize: 12,
          lineHeight: 15,
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
    </Pressable>
  );
}

function CustomSeedButton({ onPress }: { onPress?: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={{
        width: 38,
        height: 38,
        borderRadius: 19,
        borderWidth: 1,
        borderColor: 'rgba(189,147,72,0.42)',
        backgroundColor: '#fffdf7',
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#bd9348',
        shadowOpacity: 0.1,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 2 },
        ...(Platform.OS === 'web'
          ? ({
              cursor: onPress ? 'pointer' : 'default',
              userSelect: 'none',
              WebkitUserSelect: 'none',
              touchAction: 'manipulation',
            } as any)
          : {}),
      }}
    >
      <BloomMark category={FALLBACK_CATEGORY} size={20} />
      <Text
        selectable={false}
        style={{
          position: 'absolute',
          fontFamily: 'Lato_700Bold',
          color: '#315d4e',
          fontSize: 14,
          lineHeight: 16,
        }}
      >
        +
      </Text>
    </Pressable>
  );
}

export function SkillBubbleGarden({
  skills,
  editable = false,
  onUpdateSkill,
  onDeleteSkill,
  seedSkills = [],
  onPlantSkill,
  onAddCustomSkill,
}: SkillBubbleGardenProps) {
  useWildflowerStyles();

  const [width, setWidth] = useState(0);
  const [openSeedGroups, setOpenSeedGroups] = useState<Record<string, boolean>>({});
  const displaySkills = useMemo(() => [...skills], [skills]);
  const plantedNames = useMemo(
    () => new Set(displaySkills.map((skill) => skill.description.trim().toLowerCase())),
    [displaySkills]
  );
  const seedGroups = useMemo(
    () => {
      if (!editable) return [];
      const seedSet = new Set(seedSkills.map(skill => skill.trim()));
      const grouped = CATEGORY_DEFS
        .map(group => ({
          label: group.label,
          skills: group.skills.filter(skill => seedSet.has(skill)),
        }))
        .filter(group => group.skills.length > 0);
      const groupedSkills = new Set(grouped.flatMap(group => group.skills));
      const uncategorized = seedSkills.filter(skill => !groupedSkills.has(skill));
      if (uncategorized.length > 0) {
        grouped.push({ label: 'More Seeds', skills: uncategorized });
      }
      return grouped;
    },
    [editable, seedSkills]
  );
  const availableSeedCount = useMemo(
    () => seedSkills.filter((skill) => !plantedNames.has(skill.trim().toLowerCase())).length,
    [plantedNames, seedSkills]
  );
  const meadowHeight = getMeadowHeight(displaySkills.length, width || 680);
  const isCompactSeedBank = width > 0 && width < 620;

  const handleLayout = (event: LayoutChangeEvent) => {
    setWidth(event.nativeEvent.layout.width);
  };

  const isSeedGroupOpen = (label: string, index: number) =>
    openSeedGroups[label] ?? (!isCompactSeedBank || index === 0);

  const toggleSeedGroup = (label: string, index: number) => {
    const current = isSeedGroupOpen(label, index);
    setOpenSeedGroups(prev => ({ ...prev, [label]: !current }));
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
          backgroundColor: '#fbf7ee',
          ...(Platform.OS === 'web'
            ? ({
                backgroundImage: 'linear-gradient(180deg, #fffaf0 0%, #eef6e8 58%, #d9c08a 100%)',
              } as any)
            : {}),
        }}
      >
        <Image
          source={MEADOW_BACKGROUND}
          contentFit="fill"
          style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, width: '100%', height: '100%' }}
        />
        <View
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: 0,
            height: Math.min(110, meadowHeight * 0.36),
            backgroundColor: 'rgba(255,255,255,0.28)',
          }}
        />

        <GroundStrip width={width} />

        {width > 0 && displaySkills.map((skill, index) => (
          <SkillPlant
            key={skill.id}
            skill={skill}
            index={index}
            count={displaySkills.length}
            width={width}
            height={meadowHeight}
            editable={editable}
            onUpdateSkill={onUpdateSkill}
            onDeleteSkill={onDeleteSkill}
            skills={skills}
          />
        ))}

        {displaySkills.length === 0 && (
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
              Your field is waiting.
            </Text>
          </View>
        )}
      </View>

      {(seedGroups.length > 0 || (editable && onAddCustomSkill)) && (
        <View
          style={{
            borderTopWidth: 1,
            borderTopColor: 'rgba(222,193,129,0.28)',
            backgroundColor: '#f8f1e4',
            paddingHorizontal: 14,
            paddingTop: 12,
            paddingBottom: 14,
          }}
        >
          <Text
            style={{
              fontFamily: 'Lato_700Bold',
              color: '#8f7b55',
              fontSize: 12,
              marginBottom: 8,
              letterSpacing: 0,
            }}
          >
            Seed Bank{availableSeedCount !== seedSkills.length ? ` · ${availableSeedCount} ready` : ''}
          </Text>
          {seedGroups.map((group, groupIndex) => {
            const open = isSeedGroupOpen(group.label, groupIndex);
            const readyCount = group.skills.filter(skill => !plantedNames.has(skill.trim().toLowerCase())).length;
            const category = getCategoryForSkill(group.skills[0] ?? group.label);
            return (
              <View key={group.label} style={{ marginBottom: 8 }}>
                <Pressable
                  onPress={() => toggleSeedGroup(group.label, groupIndex)}
                  style={{
                    minHeight: 34,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: open ? `${category.edge}66` : 'rgba(222,193,129,0.3)',
                    backgroundColor: open ? category.pale : 'rgba(255,250,240,0.62)',
                    paddingHorizontal: 10,
                    paddingVertical: 7,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 10,
                    ...(Platform.OS === 'web'
                      ? ({
                          cursor: 'pointer',
                          userSelect: 'none',
                          WebkitUserSelect: 'none',
                        } as any)
                      : {}),
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <SeedMark category={category} size={16} />
                    <Text selectable={false} style={{ fontFamily: 'Lato_700Bold', color: category.text, fontSize: 12 }}>
                      {group.label}
                    </Text>
                  </View>
                  <Text selectable={false} style={{ fontFamily: 'Lato_700Bold', color: '#bd9348', fontSize: 11 }}>
                    {readyCount}/{group.skills.length} {open ? '-' : '+'}
                  </Text>
                </Pressable>
                {open && (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center', paddingTop: 8 }}>
                    {group.skills.map((skill, index) => (
                      <SeedButton
                        key={skill}
                        skill={skill}
                        index={index + groupIndex * 11}
                        onPlantSkill={onPlantSkill}
                        planted={plantedNames.has(skill.trim().toLowerCase())}
                      />
                    ))}
                    {groupIndex === seedGroups.length - 1 && editable && onAddCustomSkill ? (
                      <CustomSeedButton onPress={onAddCustomSkill} />
                    ) : null}
                  </View>
                )}
              </View>
            );
          })}
          {seedGroups.length === 0 && editable && onAddCustomSkill ? (
            <CustomSeedButton onPress={onAddCustomSkill} />
          ) : null}
        </View>
      )}
    </View>
  );
}
