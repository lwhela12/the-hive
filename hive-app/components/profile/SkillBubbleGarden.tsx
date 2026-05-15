import { useMemo, useRef, useState } from 'react';
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

const PALETTES = [
  { seed: '#fff8e6', edge: '#c6953f', text: '#5f4b22', leaf: '#789883', petal: '#f7edd4', center: '#d4a447' },
  { seed: '#eef6f0', edge: '#6f9584', text: '#315d4e', leaf: '#6f9584', petal: '#edf5ef', center: '#c8a24f' },
  { seed: '#f8eee2', edge: '#bd8f5d', text: '#694321', leaf: '#80936f', petal: '#f4e3d0', center: '#c99a55' },
  { seed: '#f3f0fb', edge: '#a28bc9', text: '#4b3a68', leaf: '#778f7a', petal: '#eee8f8', center: '#c7aa68' },
  { seed: '#fff0f0', edge: '#ca8f8f', text: '#713f3f', leaf: '#78977d', petal: '#fae3e3', center: '#cf9a61' },
];

const GRASS_BLADES = Array.from({ length: 68 }, (_, index) => ({
  leftRatio: ((index * 1.47) % 100) / 100,
  height: 8 + ((index * 7) % 16),
  opacity: 0.24 + ((index * 11) % 18) / 100,
  rotate: `${-12 + ((index * 13) % 25)}deg`,
}));

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
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

function getMeadowHeight(skillCount: number, width: number) {
  const base = skillCount === 0 ? (width < 420 ? 150 : 175) : (width < 420 ? 270 : 310);
  const extraRows = Math.max(0, Math.ceil(skillCount / (width < 620 ? 4 : 7)) - 1);
  return clamp(base + extraRows * 72, base, 560);
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
  const size = getPlantSize(level, width);
  const palette = PALETTES[index % PALETTES.length];
  const fallback = getDefaultPosition(index, count);
  const storedX = typeof skill.display_x === 'number' ? skill.display_x : fallback.x;
  const storedY = typeof skill.display_y === 'number' ? skill.display_y : fallback.y;
  const x = clamp(storedX, 0.08, 0.92);
  const y = clamp(storedY < 0.5 ? fallback.y : storedY, 0.58, 0.91);
  const bloomSize = level >= 4 ? size * (level === 5 ? 0.56 : 0.5) : size * 0.36;
  const stemHeight = size * (0.24 + level * 0.055);
  const labelFont = clamp(size / (skill.description.length > 22 ? 12.5 : 10.2), 10, 18);
  const plantHeight = stemHeight + bloomSize + labelFont * 2.8;
  const left = clamp(x * width - size / 2, 0, Math.max(0, width - size));
  const top = clamp(y * height - plantHeight, 12, Math.max(12, height - plantHeight - 20));
  const pan = useRef(new Animated.ValueXY()).current;
  const dragStart = useRef({ left, top });
  const didDrag = useRef(false);

  const responder = useMemo(
    () => PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) =>
        !!editable && Math.abs(gesture.dx) + Math.abs(gesture.dy) > 3,
      onMoveShouldSetPanResponderCapture: (_, gesture) =>
        !!editable && Math.abs(gesture.dx) + Math.abs(gesture.dy) > 3,
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
        if (!editable || !onUpdateSkill) return;
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
    [editable, height, left, onUpdateSkill, pan, plantHeight, size, skill, top, width]
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
        transform: [{ translateX: pan.x }, { translateY: pan.y }],
        ...(Platform.OS === 'web'
          ? ({
              cursor: editable ? 'grab' : 'default',
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
              width: 2,
              height: stemHeight,
              backgroundColor: palette.leaf,
              opacity: 0.88,
              borderRadius: 1,
            }}
          />
          <View
            style={{
              position: 'absolute',
              bottom: stemHeight * 0.2,
              left: bloomSize * 0.25,
              width: bloomSize * (level === 1 ? 0.32 : 0.42),
              height: bloomSize * 0.18,
              borderRadius: bloomSize * 0.2,
              backgroundColor: palette.leaf,
              opacity: 0.72,
              transform: [{ rotate: '-30deg' }],
            }}
          />
          <View
            style={{
              position: 'absolute',
              bottom: stemHeight * 0.34,
              right: bloomSize * 0.22,
              width: bloomSize * (level === 1 ? 0.28 : 0.38),
              height: bloomSize * 0.16,
              borderRadius: bloomSize * 0.2,
              backgroundColor: palette.leaf,
              opacity: 0.66,
              transform: [{ rotate: '28deg' }],
            }}
          />
          {level >= 3 && (
            <View
              style={{
                position: 'absolute',
                bottom: stemHeight * 0.62,
                left: bloomSize * 0.14,
                width: bloomSize * 0.34,
                height: bloomSize * 0.14,
                borderRadius: bloomSize * 0.16,
                backgroundColor: palette.leaf,
                opacity: 0.56,
                transform: [{ rotate: '-18deg' }],
              }}
            />
          )}

          {level <= 2 && (
            <View
              style={{
                position: 'absolute',
                bottom: stemHeight - bloomSize * 0.05,
                width: bloomSize * (level === 1 ? 0.68 : 0.84),
                height: bloomSize * (level === 1 ? 0.2 : 0.26),
                borderRadius: bloomSize,
                borderWidth: 1.4,
                borderColor: palette.edge,
                backgroundColor: level === 1 ? '#fbf7ec' : palette.seed,
              }}
            />
          )}

          {level === 3 && (
            <View
              style={{
                position: 'absolute',
                bottom: stemHeight - bloomSize * 0.1,
                width: bloomSize * 0.5,
                height: bloomSize * 0.82,
                borderTopLeftRadius: bloomSize * 0.4,
                borderTopRightRadius: bloomSize * 0.4,
                borderBottomLeftRadius: bloomSize * 0.18,
                borderBottomRightRadius: bloomSize * 0.18,
                borderWidth: 1.6,
                borderColor: palette.edge,
                backgroundColor: palette.seed,
                transform: [{ rotate: '-3deg' }],
              }}
            />
          )}

          {level >= 4 && (
            <View
              style={{
                position: 'absolute',
                bottom: stemHeight - bloomSize * 0.28,
                width: bloomSize,
                height: bloomSize,
                alignItems: 'center',
                justifyContent: 'center',
                shadowColor: '#000',
                shadowOpacity: 0.08 + level * 0.015,
                shadowRadius: 8 + level,
                shadowOffset: { width: 0, height: 4 },
              }}
            >
              {Array.from({ length: level === 5 ? 6 : 5 }, (_, petal) => (
                <Petal
                  key={petal}
                  size={bloomSize * (level === 5 ? 0.44 : 0.4)}
                  color={palette.petal}
                  borderColor={palette.edge}
                  rotation={petal * (level === 5 ? 60 : 72)}
                  distance={bloomSize * (level === 5 ? 0.24 : 0.2)}
                />
              ))}
              <View
                style={{
                  width: bloomSize * (level === 5 ? 0.42 : 0.36),
                  height: bloomSize * (level === 5 ? 0.42 : 0.36),
                  borderRadius: bloomSize,
                  backgroundColor: palette.center,
                  borderWidth: 1.3,
                  borderColor: palette.edge,
                }}
              />
            </View>
          )}
        </View>

        <Text
          selectable={false}
          numberOfLines={level >= 4 ? 4 : 3}
          style={{
            fontFamily: 'Lato_700Bold',
            color: palette.text,
            fontSize: labelFont,
            lineHeight: labelFont * 1.12,
            textAlign: 'center',
            maxWidth: size * 0.96,
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
}: {
  skill: string;
  index: number;
  onPlantSkill?: (skillDescription: string) => void;
}) {
  const palette = PALETTES[index % PALETTES.length];

  return (
    <Pressable
      onPress={() => onPlantSkill?.(skill)}
      disabled={!onPlantSkill}
      style={{
        minHeight: 28,
        maxWidth: 178,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: 'rgba(189,147,72,0.28)',
        backgroundColor: '#fbf7ed',
        paddingHorizontal: 10,
        paddingVertical: 5,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        ...(Platform.OS === 'web'
          ? ({
              cursor: onPlantSkill ? 'pointer' : 'default',
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
          backgroundColor: palette.seed,
          borderWidth: 1,
          borderColor: palette.edge,
          transform: [{ rotate: '-24deg' }],
        }}
      />
      <Text
        selectable={false}
        numberOfLines={1}
        style={{
          fontFamily: 'Lato_700Bold',
          color: '#6d5b3b',
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
  const displaySkills = useMemo(() => [...skills], [skills]);
  const plantedNames = useMemo(
    () => new Set(displaySkills.map((skill) => skill.description.trim().toLowerCase())),
    [displaySkills]
  );
  const dormantSeeds = useMemo(
    () => editable
      ? seedSkills.filter((skill) => !plantedNames.has(skill.trim().toLowerCase()))
      : [],
    [editable, plantedNames, seedSkills]
  );
  const meadowHeight = getMeadowHeight(displaySkills.length, width || 680);

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
      {(dormantSeeds.length > 0 || (editable && onAddCustomSkill)) && (
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
            Seed Bank
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            {dormantSeeds.map((skill, index) => (
              <SeedButton
                key={skill}
                skill={skill}
                index={index}
                onPlantSkill={onPlantSkill}
              />
            ))}
            {editable && onAddCustomSkill ? (
              <CustomSeedButton onPress={onAddCustomSkill} />
            ) : null}
          </View>
        </View>
      )}
    </View>
  );
}
