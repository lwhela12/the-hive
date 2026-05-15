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
};

const COLORS = [
  { bg: '#fff7dc', border: '#dec181', text: '#5f4b22' },
  { bg: '#eef6f0', border: '#739a88', text: '#315d4e' },
  { bg: '#f8eee2', border: '#c99a6b', text: '#694321' },
  { bg: '#f5f0ff', border: '#aa93cc', text: '#4b3a68' },
  { bg: '#fff0f0', border: '#d99a9a', text: '#713f3f' },
];

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function getLevel(skill: Partial<Skill>) {
  const level = Number(skill.enthusiasm_level ?? 1);
  return clamp(Number.isFinite(level) ? level : 1, 1, 5);
}

function getBubbleSize(level: number, width: number) {
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

function getGardenHeight(skillCount: number, width: number) {
  const base = width < 420 ? 330 : 380;
  const extraRows = Math.max(0, Math.ceil(skillCount / (width < 620 ? 4 : 6)) - 2);
  return clamp(base + extraRows * 78, base, 620);
}

function SkillBubble({
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
  const size = getBubbleSize(level, width);
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
          borderRadius: size / 2,
          backgroundColor: palette.bg,
          borderWidth: 1.5 + level * 0.35,
          borderColor: palette.border,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: Math.max(10, size * 0.13),
          shadowColor: '#000',
          shadowOpacity: 0.08 + level * 0.02,
          shadowRadius: 8 + level * 1.5,
          shadowOffset: { width: 0, height: 4 },
          elevation: 1 + level,
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
              right: size * 0.08,
              top: size * 0.08,
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
        <Text
          selectable={false}
          numberOfLines={level >= 4 ? 4 : 3}
          style={{
            fontFamily: 'Lato_700Bold',
            color: palette.text,
            fontSize: clamp(size / (skill.description.length > 24 ? 9.5 : 7.8), 11, 23),
            lineHeight: clamp(size / (skill.description.length > 24 ? 7.8 : 6.6), 15, 28),
            textAlign: 'center',
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

export function SkillBubbleGarden({
  skills,
  editable = false,
  onUpdateSkill,
  onDeleteSkill,
}: SkillBubbleGardenProps) {
  const [width, setWidth] = useState(0);
  const displaySkills = useMemo(() => [...skills], [skills]);
  const height = getGardenHeight(displaySkills.length, width || 680);

  const handleLayout = (event: LayoutChangeEvent) => {
    setWidth(event.nativeEvent.layout.width);
  };

  return (
    <View
      onLayout={handleLayout}
      style={{
        minHeight: height,
        borderRadius: 18,
        backgroundColor: '#fffdf7',
        borderWidth: 1,
        borderColor: 'rgba(222,193,129,0.42)',
        overflow: 'hidden',
      }}
    >
      {width > 0 && displaySkills.map((skill, index) => (
        <SkillBubble
          key={skill.id}
          skill={skill}
          index={index}
          count={displaySkills.length}
          width={width}
          height={height}
          editable={editable}
          onUpdateSkill={onUpdateSkill}
          onDeleteSkill={onDeleteSkill}
          skills={skills}
        />
      ))}
    </View>
  );
}
