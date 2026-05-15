import { useMemo, useState } from 'react';
import { LayoutChangeEvent, Platform, Text, View } from 'react-native';
import Svg, { Polygon } from 'react-native-svg';

export type HoneycombItem = {
  label: string;
  value?: string | null;
};

type ProfileHoneycombClusterProps = {
  title: string;
  items: HoneycombItem[];
  size?: 'compact' | 'roomy';
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function valueFontSize(value: string, compact: boolean) {
  if (compact) return value.length > 46 ? 13 : 14;
  if (value.length > 150) return 13;
  if (value.length > 95) return 14;
  return 15;
}

function HoneycombCell({
  item,
  width,
  height,
  compact,
}: {
  item: HoneycombItem;
  width: number;
  height: number;
  compact: boolean;
}) {
  const value = item.value?.trim() || 'Not set';
  const fontSize = valueFontSize(value, compact);

  return (
    <View
      style={{
        width,
        height,
        position: 'relative',
      }}
    >
      <Svg
        width="100%"
        height="100%"
        viewBox="0 0 260 190"
        preserveAspectRatio="none"
        style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }}
      >
        <Polygon
          points="66,3 194,3 257,95 194,187 66,187 3,95"
          fill="#fffaf0"
          stroke="#dec181"
          strokeWidth={compact ? 2.2 : 2.8}
        />
      </Svg>
      <View
        style={{
          minHeight: height,
          paddingHorizontal: compact ? 30 : 34,
          paddingVertical: compact ? 18 : 22,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text
          selectable={false}
          style={{
            fontFamily: 'Lato_700Bold',
            fontSize: compact ? 10 : 11,
            color: '#bd9348',
            letterSpacing: 0.6,
            marginBottom: compact ? 8 : 10,
            textAlign: 'center',
            textTransform: 'uppercase',
          }}
        >
          {item.label}
        </Text>
        <Text
          selectable={false}
          style={{
            fontFamily: 'Lato_400Regular',
            fontSize,
            lineHeight: fontSize * 1.34,
            color: '#2d2d2d',
            textAlign: 'center',
          }}
        >
          {value}
        </Text>
      </View>
    </View>
  );
}

export function ProfileHoneycombCluster({
  title,
  items,
  size = 'roomy',
}: ProfileHoneycombClusterProps) {
  const [containerWidth, setContainerWidth] = useState(0);
  const visibleItems = useMemo(
    () => items.filter(item => item.value && item.value.trim().length > 0).slice(0, 3),
    [items]
  );

  if (visibleItems.length === 0) return null;

  const handleLayout = (event: LayoutChangeEvent) => {
    setContainerWidth(event.nativeEvent.layout.width);
  };

  const compact = size === 'compact' || (containerWidth > 0 && containerWidth < 540);
  const longText = visibleItems.some(item => (item.value?.length ?? 0) > 95);
  const cellWidth = compact
    ? Math.min(326, Math.max(248, containerWidth - 8))
    : Math.min(300, Math.max(214, (containerWidth + 54) / Math.max(1, visibleItems.length)));
  const cellHeight = compact
    ? clamp(longText ? 226 : 176, 166, 236)
    : clamp(longText ? 218 : 174, 164, 226);
  const overlap = compact ? 0 : Math.min(28, cellWidth * 0.12);

  return (
    <View onLayout={handleLayout} style={{ marginBottom: 18 }}>
      <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 13, color: '#9ca3af', letterSpacing: 0.6, marginBottom: 8 }}>
        {title}
      </Text>
      <View
        style={{
          flexDirection: compact ? 'column' : 'row',
          flexWrap: compact ? 'nowrap' : 'nowrap',
          alignItems: 'center',
          justifyContent: compact ? 'flex-start' : 'center',
          alignSelf: 'stretch',
          ...(Platform.OS === 'web'
            ? ({
                userSelect: 'none',
                WebkitUserSelect: 'none',
              } as any)
            : {}),
        }}
      >
        {visibleItems.map((item, index) => (
          <View
            key={`${item.label}-${index}`}
            style={{
              marginLeft: compact ? 0 : index === 0 ? 0 : -overlap,
              marginTop: compact ? (index === 0 ? 0 : -8) : index % 2 === 1 ? 18 : 0,
              zIndex: visibleItems.length - index,
            }}
          >
            <HoneycombCell
              item={item}
              width={cellWidth}
              height={cellHeight}
              compact={compact}
            />
          </View>
        ))}
      </View>
    </View>
  );
}
