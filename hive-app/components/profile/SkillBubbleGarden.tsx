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
import type { Skill } from '../../types';

type GardenSkill = Pick<Skill, 'id' | 'description'> & Partial<Skill>;

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

const FALLBACK_CATEGORY = CATEGORY_DEFS[CATEGORY_DEFS.length - 1];

const GRASS_BLADES = Array.from({ length: 68 }, (_, index) => ({
  leftRatio: ((index * 1.47) % 100) / 100,
  height: 8 + ((index * 7) % 16),
  opacity: 0.24 + ((index * 11) % 18) / 100,
  rotate: `${-12 + ((index * 13) % 25)}deg`,
}));

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function getCategoryForSkill(description: string) {
  const normalized = description.trim().toLowerCase();
  return CATEGORY_DEFS.find(category =>
    category.skills.some(skill => skill.trim().toLowerCase() === normalized)
  ) ?? FALLBACK_CATEGORY;
}

function getLevel(skill: Partial<Skill>) {
  const level = Number(skill.enthusiasm_level ?? 1);
  return clamp(Number.isFinite(level) ? level : 1, 1, 5);
}

function getPlantSize(level: number, width: number) {
  const sizes = width < 420
    ? [82, 100, 122, 146, 168]
    : [92, 112, 138, 164, 194];
  return sizes[level - 1];
}

function getPlantMetrics(skill: GardenSkill, width: number) {
  const level = getLevel(skill);
  const size = getPlantSize(level, width);
  const bloomSize = level >= 4 ? size * (level === 5 ? 0.56 : 0.5) : size * 0.36;
  const stemHeight = size * (0.24 + level * 0.055);
  const labelFont = clamp(size / (skill.description.length > 22 ? 12.5 : 10.2), 10, 18);
  const plantHeight = stemHeight + bloomSize + labelFont * 2.8;

  return { level, size, bloomSize, stemHeight, labelFont, plantHeight };
}

function getDefaultPosition(index: number, count: number) {
  const cols = Math.max(2, Math.ceil(Math.sqrt(count * 1.7)));
  const col = index % cols;
  const row = Math.floor(index / cols);
  const jitterX = ((index * 37) % 15 - 7) / 100;
  const rowBand = row % 3;

  return {
    x: clamp((col + 0.5) / cols + jitterX, 0.08, 0.92),
    y: clamp(0.72 + rowBand * 0.07 + ((index * 23) % 7) / 100, 0.64, 0.9),
  };
}

function getAutoPlantFrames(skills: GardenSkill[], width: number, height: number) {
  const frames = new Map<string, { left: number; top: number }>();
  if (width <= 0) return frames;

  const sidePadding = width < 420 ? 8 : 18;
  const gap = width < 420 ? 8 : 18;
  const grassTop = height - 44;
  let row: Array<{ skill: GardenSkill; width: number; height: number }> = [];
  let rowWidth = 0;
  const rows: Array<typeof row> = [];
  const flushRow = () => {
    if (row.length > 0) {
      rows.push(row);
      row = [];
      rowWidth = 0;
    }
  };

  skills.forEach(skill => {
    const metrics = getPlantMetrics(skill, width);
    const itemWidth = Math.min(metrics.size + gap, Math.max(96, width - sidePadding * 2));
    const itemHeight = metrics.plantHeight + 18;
    if (row.length > 0 && rowWidth + itemWidth > width - sidePadding * 2) {
      flushRow();
    }
    row.push({ skill, width: itemWidth, height: itemHeight });
    rowWidth += itemWidth;
  });
  flushRow();

  let rowBottom = grassTop - 6;
  rows.forEach(rowItems => {
    const maxHeight = Math.max(...rowItems.map(item => item.height));
    const totalWidth = rowItems.reduce((sum, item) => sum + item.width, 0);
    let x = Math.max(sidePadding, (width - totalWidth) / 2);
    rowItems.forEach(item => {
      const metrics = getPlantMetrics(item.skill, width);
      frames.set(item.skill.id, {
        left: clamp(x + item.width / 2 - metrics.size / 2, 4, Math.max(4, width - metrics.size - 4)),
        top: clamp(rowBottom - metrics.plantHeight, 10, Math.max(10, height - metrics.plantHeight - 56)),
      });
      x += item.width;
    });
    rowBottom -= maxHeight + 10;
  });

  return frames;
}

function getMeadowHeight(skillCount: number, width: number) {
  const base = skillCount === 0 ? (width < 420 ? 150 : 175) : (width < 420 ? 300 : 330);
  const perRow = width < 420 ? 2 : width < 720 ? 4 : 7;
  const extraRows = Math.max(0, Math.ceil(skillCount / perRow) - 1);
  return clamp(base + extraRows * (width < 420 ? 118 : 96), base, 760);
}

function Petal({
  size,
  color,
  borderColor,
  rotation,
  distance,
}: {
  size: number;
  color: string;
  borderColor: string;
  rotation: number;
  distance: number;
}) {
  return (
    <View
      style={{
        position: 'absolute',
        width: size,
        height: size * 1.12,
        borderRadius: size,
        backgroundColor: color,
        borderWidth: 1.3,
        borderColor,
        transform: [
          { rotate: `${rotation}deg` },
          { translateY: -distance },
        ],
      }}
    />
  );
}

function Leaf({
  size,
  color,
  side,
  bottom,
  rotate,
  opacity = 0.7,
}: {
  size: number;
  color: string;
  side: 'left' | 'right';
  bottom: number;
  rotate: number;
  opacity?: number;
}) {
  return (
    <View
      style={{
        position: 'absolute',
        bottom,
        [side]: size * 0.1,
        width: size,
        height: size * 0.42,
        borderTopLeftRadius: size,
        borderBottomRightRadius: size,
        borderTopRightRadius: size * 0.45,
        borderBottomLeftRadius: size * 0.45,
        backgroundColor: color,
        opacity,
        transform: [{ rotate: `${rotate}deg` }],
      }}
    />
  );
}

function PlantHead({
  level,
  category,
  bloomSize,
  stemHeight,
}: {
  level: number;
  category: SkillCategoryDef;
  bloomSize: number;
  stemHeight: number;
}) {
  const baseBottom = stemHeight - bloomSize * 0.12;

  if (level <= 2) {
    return (
      <View
        style={{
          position: 'absolute',
          bottom: stemHeight - bloomSize * 0.04,
          width: bloomSize * (level === 1 ? 0.38 : 0.48),
          height: bloomSize * (level === 1 ? 0.3 : 0.44),
          borderRadius: bloomSize,
          backgroundColor: category.pale,
          borderWidth: 1.4,
          borderColor: category.edge,
          transform: [{ rotate: level === 1 ? '-7deg' : '5deg' }],
        }}
      />
    );
  }

  if (level === 3) {
    return (
      <View
        style={{
          position: 'absolute',
          bottom: stemHeight - bloomSize * 0.14,
          width: bloomSize * 0.46,
          height: bloomSize * 0.76,
          borderTopLeftRadius: bloomSize * 0.5,
          borderTopRightRadius: bloomSize * 0.5,
          borderBottomLeftRadius: bloomSize * 0.22,
          borderBottomRightRadius: bloomSize * 0.22,
          borderWidth: 1.5,
          borderColor: category.edge,
          backgroundColor: category.pale,
          transform: [{ rotate: '-4deg' }],
        }}
      />
    );
  }

  if (category.species === 'wonder') {
    return (
      <View style={{ position: 'absolute', bottom: baseBottom, alignItems: 'center', width: bloomSize, height: bloomSize }}>
        <View
          style={{
            position: 'absolute',
            bottom: bloomSize * 0.24,
            width: bloomSize * (level === 5 ? 0.9 : 0.76),
            height: bloomSize * (level === 5 ? 0.48 : 0.4),
            borderTopLeftRadius: bloomSize,
            borderTopRightRadius: bloomSize,
            borderBottomLeftRadius: bloomSize * 0.22,
            borderBottomRightRadius: bloomSize * 0.22,
            backgroundColor: category.pale,
            borderWidth: 1.6,
            borderColor: category.edge,
            shadowColor: category.color,
            shadowOpacity: 0.22,
            shadowRadius: level === 5 ? 14 : 9,
            shadowOffset: { width: 0, height: 3 },
          }}
        />
        {[0.28, 0.5, 0.72].map((left, dot) => (
          <View
            key={dot}
            style={{
              position: 'absolute',
              left: bloomSize * left,
              bottom: bloomSize * (dot === 1 ? 0.5 : 0.44),
              width: bloomSize * 0.08,
              height: bloomSize * 0.08,
              borderRadius: bloomSize,
              backgroundColor: '#fffdf7',
              opacity: 0.85,
            }}
          />
        ))}
      </View>
    );
  }

  if (category.species === 'movement') {
    return (
      <View style={{ position: 'absolute', bottom: baseBottom, alignItems: 'center', width: bloomSize, height: bloomSize }}>
        {[0, 1, 2].map(petal => (
          <View
            key={petal}
            style={{
              position: 'absolute',
              bottom: bloomSize * 0.22,
              width: bloomSize * 0.28,
              height: bloomSize * (level === 5 ? 0.78 : 0.66),
              borderTopLeftRadius: bloomSize,
              borderTopRightRadius: bloomSize,
              borderBottomLeftRadius: bloomSize * 0.22,
              borderBottomRightRadius: bloomSize * 0.22,
              backgroundColor: category.pale,
              borderWidth: 1.4,
              borderColor: category.edge,
              transform: [{ rotate: `${(petal - 1) * 18}deg` }, { translateY: petal === 1 ? -bloomSize * 0.05 : 0 }],
            }}
          />
        ))}
      </View>
    );
  }

  if (category.species === 'tech') {
    return (
      <View style={{ position: 'absolute', bottom: baseBottom, width: bloomSize, height: bloomSize, alignItems: 'center', justifyContent: 'center' }}>
        {Array.from({ length: level === 5 ? 6 : 5 }, (_, petal) => (
          <View
            key={petal}
            style={{
              position: 'absolute',
              width: bloomSize * 0.34,
              height: bloomSize * 0.34,
              borderRadius: bloomSize * 0.08,
              backgroundColor: category.pale,
              borderWidth: 1.3,
              borderColor: category.edge,
              transform: [
                { rotate: `${45 + petal * (level === 5 ? 60 : 72)}deg` },
                { translateY: -bloomSize * (level === 5 ? 0.25 : 0.21) },
              ],
            }}
          />
        ))}
        <View style={{ width: bloomSize * 0.28, height: bloomSize * 0.28, borderRadius: bloomSize, backgroundColor: category.center, borderWidth: 1.2, borderColor: category.edge }} />
      </View>
    );
  }

  const petalCount = category.species === 'creative' ? (level === 5 ? 7 : 5) : category.species === 'care' ? 7 : 6;
  return (
    <View style={{ position: 'absolute', bottom: baseBottom, width: bloomSize, height: bloomSize, alignItems: 'center', justifyContent: 'center' }}>
      {Array.from({ length: petalCount }, (_, petal) => {
        const creativeShift = category.species === 'creative' ? (petal % 2) * bloomSize * 0.04 : 0;
        const petalSize = bloomSize * (category.species === 'care' ? 0.34 : 0.38);
        return (
          <Petal
            key={petal}
            size={petalSize}
            color={category.pale}
            borderColor={category.edge}
            rotation={petal * (360 / petalCount) + (category.species === 'creative' ? 9 : 0)}
            distance={bloomSize * (level === 5 ? 0.24 : 0.2) + creativeShift}
          />
        );
      })}
      <View
        style={{
          width: bloomSize * (level === 5 ? 0.4 : 0.34),
          height: bloomSize * (level === 5 ? 0.4 : 0.34),
          borderRadius: bloomSize,
          backgroundColor: category.center,
          borderWidth: 1.3,
          borderColor: category.edge,
        }}
      />
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
  autoFrame,
}: SkillBubbleGardenProps & {
  skill: GardenSkill;
  index: number;
  count: number;
  width: number;
  height: number;
  autoFrame?: { left: number; top: number };
}) {
  const { level, size, bloomSize, stemHeight, labelFont, plantHeight } = getPlantMetrics(skill, width);
  const category = getCategoryForSkill(skill.description);
  const fallback = getDefaultPosition(index, count);
  const storedX = typeof skill.display_x === 'number' ? skill.display_x : fallback.x;
  const storedY = typeof skill.display_y === 'number' ? skill.display_y : fallback.y;
  const x = clamp(storedX, 0.08, 0.92);
  const y = clamp(storedY < 0.5 ? fallback.y : storedY, 0.58, 0.91);
  const left = autoFrame?.left ?? clamp(x * width - size / 2, 0, Math.max(0, width - size));
  const top = autoFrame?.top ?? clamp(y * height - plantHeight, 12, Math.max(12, height - plantHeight - 20));
  const pan = useRef(new Animated.ValueXY()).current;
  const grow = useRef(new Animated.Value(0)).current;
  const dragStart = useRef({ left, top });
  const didDrag = useRef(false);
  const canDrag = editable && !autoFrame;

  useEffect(() => {
    grow.setValue(0);
    Animated.spring(grow, {
      toValue: 1,
      useNativeDriver: true,
      tension: 58,
      friction: 9,
    }).start();
  }, [grow, skill.id]);

  const responder = useMemo(
    () => PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) =>
        !!canDrag && Math.abs(gesture.dx) + Math.abs(gesture.dy) > 3,
      onMoveShouldSetPanResponderCapture: (_, gesture) =>
        !!canDrag && Math.abs(gesture.dx) + Math.abs(gesture.dy) > 3,
      onPanResponderGrant: () => {
        didDrag.current = false;
        dragStart.current = { left, top };
      },
      onPanResponderMove: (_, gesture) => {
        if (Math.abs(gesture.dx) + Math.abs(gesture.dy) > 3) {
          didDrag.current = true;
        }
        pan.setValue({ x: gesture.dx, y: gesture.dy });
      },
      onPanResponderRelease: (_, gesture) => {
        if (!canDrag || !onUpdateSkill) return;
        const nextLeft = clamp(dragStart.current.left + gesture.dx, 0, Math.max(0, width - size));
        const nextTop = clamp(dragStart.current.top + gesture.dy, 0, Math.max(0, height - plantHeight - 20));
        pan.setValue({ x: 0, y: 0 });
        onUpdateSkill(skill, {
          display_x: Number(((nextLeft + size / 2) / width).toFixed(4)),
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
    [canDrag, height, left, onUpdateSkill, pan, plantHeight, size, skill, top, width]
  );

  const cycleLevel = () => {
    if (!editable || !onUpdateSkill) return;
    if (didDrag.current) {
      didDrag.current = false;
      return;
    }
    onUpdateSkill(skill, {
      enthusiasm_level: level === 5 ? 1 : level + 1,
    });
  };

  return (
    <Animated.View
      {...responder.panHandlers}
      style={{
        position: 'absolute',
        left,
        top,
        transform: [
          { translateX: pan.x },
          { translateY: Animated.add(pan.y, grow.interpolate({ inputRange: [0, 1], outputRange: [24, 0] })) },
          { scale: grow.interpolate({ inputRange: [0, 1], outputRange: [0.84, 1] }) },
        ],
        opacity: grow.interpolate({ inputRange: [0, 1], outputRange: [0.2, 1] }),
        ...(Platform.OS === 'web'
          ? ({
              cursor: canDrag ? 'grab' : editable ? 'pointer' : 'default',
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
        style={{
          width: size,
          minHeight: plantHeight,
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
            onPress={(event) => {
              event.stopPropagation?.();
              onDeleteSkill(skill);
            }}
            style={{
              position: 'absolute',
              right: size * 0.02,
              top: 0,
              width: 22,
              height: 22,
              borderRadius: 11,
              backgroundColor: 'rgba(255,255,255,0.9)',
              borderWidth: 1,
              borderColor: 'rgba(189,147,72,0.45)',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 2,
            }}
          >
            <Text style={{ fontFamily: 'Lato_700Bold', color: '#bd9348', fontSize: 13, lineHeight: 16 }}>
              x
            </Text>
          </Pressable>
        )}

        <View
          pointerEvents="none"
          style={{
            height: stemHeight + bloomSize,
            width: bloomSize * 1.4,
            alignItems: 'center',
            justifyContent: 'flex-end',
            marginBottom: 5,
          }}
        >
          <View
            style={{
              width: level >= 4 ? 2.4 : 2,
              height: stemHeight,
              backgroundColor: category.leaf,
              opacity: 0.88,
              borderRadius: 1,
              transform: [{ rotate: category.species === 'movement' ? '-2deg' : category.species === 'creative' ? '3deg' : '0deg' }],
            }}
          />
          <Leaf
            size={bloomSize * (level === 1 ? 0.28 : 0.36)}
            color={category.leaf}
            side="left"
            bottom={stemHeight * 0.18}
            rotate={-32}
            opacity={0.7}
          />
          <Leaf
            size={bloomSize * (level === 1 ? 0.24 : 0.32)}
            color={category.leaf}
            side="right"
            bottom={stemHeight * 0.34}
            rotate={28}
            opacity={0.66}
          />
          {level >= 3 && (
            <Leaf
              size={bloomSize * 0.28}
              color={category.leaf}
              side={category.species === 'creative' ? 'right' : 'left'}
              bottom={stemHeight * 0.62}
              rotate={category.species === 'creative' ? 18 : -18}
              opacity={0.52}
            />
          )}

          <PlantHead level={level} category={category} bloomSize={bloomSize} stemHeight={stemHeight} />
        </View>

        <Text
          selectable={false}
          numberOfLines={2}
          style={{
            fontFamily: 'Lato_700Bold',
            color: category.text,
            fontSize: Math.min(labelFont * 0.72, 12),
            lineHeight: Math.min(labelFont * 0.72, 12) * 1.12,
            textAlign: 'center',
            maxWidth: size * 0.82,
            opacity: 0.82,
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
      </Pressable>
    </Animated.View>
  );
}

function SeedButton({
  skill,
  index,
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
        minHeight: 28,
        maxWidth: 178,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: planted ? 'rgba(115,154,136,0.2)' : `${category.edge}55`,
        backgroundColor: planted ? 'rgba(238,246,240,0.42)' : category.pale,
        paddingHorizontal: 10,
        paddingVertical: 5,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        opacity: planted ? 0.58 : 1,
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
          width: 9,
          height: 13,
          borderRadius: 9,
          backgroundColor: planted ? '#eef6f0' : category.color,
          borderWidth: 1,
          borderColor: planted ? '#739a88' : category.edge,
          transform: [{ rotate: '-24deg' }],
        }}
      />
      <Text
        selectable={false}
        numberOfLines={1}
        style={{
          fontFamily: 'Lato_700Bold',
          color: planted ? '#8f8a7f' : category.text,
          fontSize: 11,
          lineHeight: 14,
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
        width: 32,
        height: 32,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: 'rgba(189,147,72,0.42)',
        backgroundColor: '#fffdf7',
        alignItems: 'center',
        justifyContent: 'center',
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
      <Text
        selectable={false}
        style={{
          fontFamily: 'Lato_700Bold',
          color: '#bd9348',
          fontSize: 20,
          lineHeight: 22,
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
  const autoFrames = useMemo(
    () => getAutoPlantFrames(displaySkills, width, meadowHeight),
    [displaySkills, meadowHeight, width]
  );
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
        }}
      >
        <View
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            height: 44,
            backgroundColor: 'rgba(238,246,240,0.46)',
            borderTopWidth: 1,
            borderTopColor: 'rgba(115,151,136,0.18)',
          }}
        />
        {GRASS_BLADES.map((blade, index) => (
          <View
            key={index}
            style={{
              position: 'absolute',
              left: width * blade.leftRatio,
              bottom: 28 + (index % 5),
              width: 1,
              height: blade.height,
              borderRadius: 1,
              backgroundColor: '#789883',
              opacity: blade.opacity,
              transform: [{ rotate: blade.rotate }],
            }}
          />
        ))}
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
            autoFrame={autoFrames.get(skill.id)}
          />
        ))}
        {displaySkills.length === 0 && (
          <View
            style={{
              flex: 1,
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: meadowHeight,
              paddingHorizontal: 24,
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
              Your garden is waiting.
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
              letterSpacing: 0.2,
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
                    <View
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: 5,
                        backgroundColor: category.color,
                        borderWidth: 1,
                        borderColor: category.edge,
                      }}
                    />
                    <Text selectable={false} style={{ fontFamily: 'Lato_700Bold', color: category.text, fontSize: 12 }}>
                      {group.label}
                    </Text>
                  </View>
                  <Text selectable={false} style={{ fontFamily: 'Lato_700Bold', color: '#bd9348', fontSize: 11 }}>
                    {readyCount}/{group.skills.length} {open ? '−' : '+'}
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
