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

type SkillBubbleGardenProps = {
  skills: Array<Pick<Skill, 'id' | 'description'> & Partial<Skill>>;
  editable?: boolean;
  onUpdateSkill?: (
    skill: Pick<Skill, 'id' | 'description'> & Partial<Skill>,
    updates: Pick<Skill, 'enthusiasm_level' | 'display_x' | 'display_y'>
  ) => void;
  onDeleteSkill?: (skill: Pick<Skill, 'id' | 'description'> & Partial<Skill>) => void;
  seedSkills?: string[];
  onPlantSkill?: (skillDescription: string) => void;
};

const COLORS = [
  { bg: '#fff8e6', border: '#c6953f', text: '#5f4b22', leaf: '#769784', petal: '#f7edd4' },
  { bg: '#eef6f0', border: '#6f9584', text: '#315d4e', leaf: '#6f9584', petal: '#edf5ef' },
  { bg: '#f8eee2', border: '#bd8f5d', text: '#694321', leaf: '#7f9474', petal: '#f4e3d0' },
  { bg: '#f3f0fb', border: '#a28bc9', text: '#4b3a68', leaf: '#778f7a', petal: '#ece6f8' },
  { bg: '#fff0f0', border: '#ca8f8f', text: '#713f3f', leaf: '#78977d', petal: '#fae3e3' },
];

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function getLevel(skill: Partial<Skill>) {
  const level = Number(skill.enthusiasm_level ?? 1);
  return clamp(Number.isFinite(level) ? level : 1, 1, 5);
}

function getPlantSize(level: number, width: number) {
  const maxSize = width < 420 ? 154 : 190;
  const sizes = width < 420
    ? [76, 92, 110, 132, maxSize]
    : [88, 108, 132, 158, maxSize];
  return sizes[level - 1];
}

function getDefaultPosition(index: number, count: number) {
  const cols = Math.max(2, Math.ceil(Math.sqrt(count * 1.45)));
  const rows = Math.max(2, Math.ceil(count / cols));
  const col = index % cols;
  const row = Math.floor(index / cols);
  const jitterX = ((index * 37) % 17 - 8) / 100;
  const jitterY = ((index * 53) % 15 - 7) / 100;

  return {
    x: clamp((col + 0.5) / cols + jitterX, 0.12, 0.88),
    y: clamp((row + 0.5) / rows + jitterY, 0.14, 0.86),
  };
}

function getMeadowHeight(skillCount: number, width: number) {
  const base = skillCount === 0 ? (width < 420 ? 185 : 220) : (width < 420 ? 330 : 380);
  const extraRows = Math.max(0, Math.ceil(skillCount / (width < 620 ? 4 : 6)) - 2);
  return clamp(base + extraRows * 78, base, 620);
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
  skill: Pick<Skill, 'id' | 'description'> & Partial<Skill>;
  index: number;
  count: number;
  width: number;
  height: number;
}) {
  const level = getLevel(skill);
  const size = getPlantSize(level, width);
  const fallback = getDefaultPosition(index, count);
  const x = typeof skill.display_x === 'number' ? skill.display_x : fallback.x;
  const y = typeof skill.display_y === 'number' ? skill.display_y : fallback.y;
  const left = clamp(x * width - size / 2, 0, Math.max(0, width - size));
  const top = clamp(y * height - size / 2, 0, Math.max(0, height - size));
  const palette = COLORS[index % COLORS.length];
  const float = useRef(new Animated.Value(0)).current;
  const pan = useRef(new Animated.ValueXY()).current;
  const dragStart = useRef({ left, top });
  const didDrag = useRef(false);

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(float, {
          toValue: 1,
          duration: 1800 + (index % 5) * 240,
          useNativeDriver: true,
        }),
        Animated.timing(float, {
          toValue: 0,
          duration: 1800 + (index % 5) * 240,
          useNativeDriver: true,
        }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [float, index]);

  useEffect(() => {
    dragStart.current = { left, top };
    pan.setValue({ x: 0, y: 0 });
  }, [left, pan, top]);

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
        const nextTop = clamp(dragStart.current.top + gesture.dy, 0, Math.max(0, height - size));
        pan.setValue({ x: 0, y: 0 });
        onUpdateSkill(skill, {
          display_x: Number(((nextLeft + size / 2) / width).toFixed(4)),
          display_y: Number(((nextTop + size / 2) / height).toFixed(4)),
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
    [editable, height, left, onUpdateSkill, pan, size, skill, top, width]
  );

  const floatY = float.interpolate({
    inputRange: [0, 1],
    outputRange: [-(index % 3 + 2), index % 4 + 3],
  });
  const floatX = float.interpolate({
    inputRange: [0, 1],
    outputRange: [index % 2 === 0 ? -3 : 3, index % 2 === 0 ? 4 : -4],
  });

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

  const bloomSize = level >= 4 ? size * 0.66 : size * 0.48;
  const stemHeight = size * (0.18 + level * 0.045);
  const petalSize = bloomSize * (level === 5 ? 0.48 : 0.42);
  const centerSize = bloomSize * (level >= 4 ? 0.58 : 0.42);
  const labelFont = clamp(size / (skill.description.length > 24 ? 11.5 : 9.8), 10, 20);

  return (
    <Animated.View
      {...responder.panHandlers}
      style={{
        position: 'absolute',
        left,
        top,
        transform: [
          { translateX: Animated.add(pan.x, floatX) },
          { translateY: Animated.add(pan.y, floatY) },
        ],
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
          height: size,
          alignItems: 'center',
          justifyContent: 'center',
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
              top: size * 0.02,
              width: 22,
              height: 22,
              borderRadius: 11,
              backgroundColor: 'rgba(255,255,255,0.88)',
              borderWidth: 1,
              borderColor: 'rgba(189,147,72,0.45)',
              alignItems: 'center',
              justifyContent: 'center',
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
            width: bloomSize,
            alignItems: 'center',
            justifyContent: 'flex-end',
            marginBottom: 4,
          }}
        >
          <View
            style={{
              width: 2,
              height: stemHeight,
              backgroundColor: palette.leaf,
              opacity: 0.9,
              borderRadius: 1,
            }}
          />
          {level >= 2 && (
            <>
              <View
                style={{
                  position: 'absolute',
                  bottom: stemHeight * 0.34,
                  left: bloomSize * 0.2,
                  width: bloomSize * 0.26,
                  height: bloomSize * 0.15,
                  borderRadius: bloomSize * 0.14,
                  backgroundColor: palette.leaf,
                  opacity: 0.75,
                  transform: [{ rotate: '-28deg' }],
                }}
              />
              <View
                style={{
                  position: 'absolute',
                  bottom: stemHeight * 0.48,
                  right: bloomSize * 0.17,
                  width: bloomSize * 0.25,
                  height: bloomSize * 0.14,
                  borderRadius: bloomSize * 0.14,
                  backgroundColor: palette.leaf,
                  opacity: 0.68,
                  transform: [{ rotate: '28deg' }],
                }}
              />
            </>
          )}
          {level <= 2 && (
            <View
              style={{
                position: 'absolute',
                bottom: stemHeight - 2,
                width: bloomSize * 0.52,
                height: bloomSize * 0.28,
                borderTopLeftRadius: bloomSize * 0.3,
                borderTopRightRadius: bloomSize * 0.3,
                borderBottomLeftRadius: bloomSize * 0.08,
                borderBottomRightRadius: bloomSize * 0.08,
                borderWidth: 1.5,
                borderColor: palette.border,
                backgroundColor: level === 1 ? '#fbf7ec' : palette.bg,
                transform: [{ rotate: level === 1 ? '-5deg' : '4deg' }],
              }}
            />
          )}
          {level === 3 && (
            <View
              style={{
                position: 'absolute',
                bottom: stemHeight - 4,
                width: bloomSize * 0.55,
                height: bloomSize * 0.78,
                borderTopLeftRadius: bloomSize * 0.42,
                borderTopRightRadius: bloomSize * 0.42,
                borderBottomLeftRadius: bloomSize * 0.18,
                borderBottomRightRadius: bloomSize * 0.18,
                borderWidth: 2,
                borderColor: palette.border,
                backgroundColor: palette.bg,
                shadowColor: '#000',
                shadowOpacity: 0.08,
                shadowRadius: 5,
                shadowOffset: { width: 0, height: 2 },
              }}
            />
          )}
          {level >= 4 && (
            <View
              style={{
                position: 'absolute',
                bottom: stemHeight - bloomSize * 0.2,
                width: bloomSize,
                height: bloomSize,
                alignItems: 'center',
                justifyContent: 'center',
                shadowColor: '#000',
                shadowOpacity: 0.08 + level * 0.02,
                shadowRadius: 8 + level,
                shadowOffset: { width: 0, height: 4 },
              }}
            >
              {[0, 1, 2, 3, 4].map((petal) => (
                <View
                  key={petal}
                  style={{
                    position: 'absolute',
                    width: petalSize,
                    height: petalSize * 1.15,
                    borderRadius: petalSize,
                    backgroundColor: palette.petal,
                    borderWidth: 1.4,
                    borderColor: palette.border,
                    transform: [
                      { rotate: `${petal * 72}deg` },
                      { translateY: -bloomSize * 0.22 },
                    ],
                  }}
                />
              ))}
              <View
                style={{
                  width: centerSize,
                  minHeight: centerSize,
                  borderRadius: centerSize / 2,
                  backgroundColor: palette.bg,
                  borderWidth: 1.6,
                  borderColor: palette.border,
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 5,
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
            maxWidth: size * 0.94,
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
  const palette = COLORS[index % COLORS.length];

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
          backgroundColor: palette.bg,
          borderWidth: 1,
          borderColor: palette.border,
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

export function SkillBubbleGarden({
  skills,
  editable = false,
  onUpdateSkill,
  onDeleteSkill,
  seedSkills = [],
  onPlantSkill,
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
            bottom: 18,
            height: 1,
            backgroundColor: 'rgba(115,151,136,0.25)',
          }}
        />
        <View
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 10,
            height: 18,
            backgroundColor: 'rgba(238,246,240,0.5)',
          }}
        />
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
      {dormantSeeds.length > 0 && (
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
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {dormantSeeds.map((skill, index) => (
              <SeedButton
                key={skill}
                skill={skill}
                index={index}
                onPlantSkill={onPlantSkill}
              />
            ))}
          </View>
        </View>
      )}
    </View>
  );
}
