import { useMemo, useState, type ComponentProps } from 'react';
import { LayoutChangeEvent, Platform, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';

export type HoneycombItem = {
  label: string;
  value?: string | null;
};

type ProfileHoneycombClusterProps = {
  title: string;
  items: HoneycombItem[];
  size?: 'compact' | 'roomy';
};

type IconName = ComponentProps<typeof Ionicons>['name'];

type HoneycombInfoCell = {
  key: string;
  label: string;
  icon: IconName;
  value: string;
};

const HEX_HEIGHT_RATIO = Math.sqrt(3) / 2;
const profileHoneycombCell = require('../../assets/generated/member-honeycomb-cell.png');

function clean(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
}

function valueFor(items: HoneycombItem[], label: string) {
  return clean(items.find(item => item.label.toLowerCase() === label.toLowerCase())?.value);
}

function buildInfoCells(items: HoneycombItem[]): HoneycombInfoCell[] {
  const title = valueFor(items, 'Title');
  const from = valueFor(items, 'From');
  const birthday = valueFor(items, 'Birthday');
  const project = valueFor(items, 'Project');
  const funFacts = items
    .filter(item => item.label.toLowerCase().startsWith('fun fact'))
    .map(item => clean(item.value))
    .filter(Boolean) as string[];
  return ([
    title && {
      key: 'snapshot',
      label: 'Title',
      icon: 'person-circle-outline',
      value: title,
    },
    from && {
      key: 'from',
      label: 'From',
      icon: 'location-outline',
      value: from,
    },
    birthday && {
      key: 'birthday',
      label: 'Bday',
      icon: 'calendar-outline',
      value: birthday,
    },
    project && {
      key: 'project',
      label: 'Project',
      icon: 'construct-outline',
      value: project,
    },
    ...funFacts.slice(0, 3).map((fact, index) => ({
      key: `fun-fact-${index + 1}`,
      label: `Fun fact ${index + 1}`,
      icon: 'sparkles-outline' as IconName,
      value: fact,
    })),
    valueFor(items, 'Book') && {
      key: 'book',
      label: 'Fav book',
      icon: 'book-outline',
      value: valueFor(items, 'Book')!,
    },
    valueFor(items, 'Food') && {
      key: 'food',
      label: 'Fav food',
      icon: 'restaurant-outline',
      value: valueFor(items, 'Food')!,
    },
    valueFor(items, 'Hobby') && {
      key: 'hobby',
      label: 'Fav hobby',
      icon: 'heart-outline',
      value: valueFor(items, 'Hobby')!,
    },
  ]).filter(Boolean) as HoneycombInfoCell[];
}

function valueFontSize(cell: HoneycombInfoCell, cellWidth: number, compact: boolean) {
  const textLength = cell.value.length;

  if (cellWidth < 124) return textLength > 72 ? 8.8 : 9.8;
  if (cellWidth < 148) return textLength > 88 ? 9.4 : textLength > 42 ? 10.4 : 11.4;
  if (compact) return textLength > 120 ? 10.2 : textLength > 62 ? 11.4 : 12.6;
  if (textLength > 150) return 11.8;
  if (textLength > 82) return 12.8;
  return 14;
}

function valueLineLimit(cell: HoneycombInfoCell) {
  if (cell.key === 'project') return 4;
  if (cell.key.startsWith('fun-fact')) return 3;
  if (cell.key === 'book' || cell.key === 'hobby') return 3;
  return 2;
}

function HoneycombCell({
  cell,
  width,
  height,
  compact,
}: {
  cell: HoneycombInfoCell;
  width: number;
  height: number;
  compact: boolean;
}) {
  const fontSize = valueFontSize(cell, width, compact);
  const iconSize = width < 150 ? 12 : 15;
  const headerGap = width < 150 ? 4 : 5;
  const headerFontSize = width < 150 ? 7.6 : compact ? 8.2 : 9;

  return (
    <View
      style={{
        width,
        height,
        position: 'relative',
        shadowOpacity: 0,
        elevation: 0,
      }}
    >
      <Image
        source={profileHoneycombCell}
        contentFit="fill"
        style={StyleSheet.absoluteFillObject}
      />

      <View
        pointerEvents="none"
        style={{
          minHeight: height,
          paddingHorizontal: Math.max(20, width * 0.17),
          paddingTop: Math.max(20, height * 0.16),
          paddingBottom: Math.max(20, height * 0.15),
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <View
          style={{
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: headerGap,
          }}
        >
          <Ionicons name={cell.icon} size={iconSize} color="#6f4510" />
          <Text
            selectable={false}
            numberOfLines={2}
            style={{
              fontFamily: 'Lato_700Bold',
              fontSize: headerFontSize,
              lineHeight: headerFontSize * 1.18,
              color: '#6f4510',
              letterSpacing: 0.4,
              marginTop: 2,
              textAlign: 'center',
              textTransform: 'uppercase',
            }}
          >
            {cell.label}
          </Text>
        </View>

        <Text
          selectable={false}
          numberOfLines={valueLineLimit(cell)}
          ellipsizeMode="tail"
          style={{
            fontFamily: 'Lato_700Bold',
            fontSize,
            lineHeight: fontSize * 1.14,
            color: '#2d2d2d',
            textAlign: 'center',
          }}
        >
          {cell.value}
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
  const cells = useMemo(() => buildInfoCells(items), [items]);

  const handleLayout = (event: LayoutChangeEvent) => {
    setContainerWidth(event.nativeEvent.layout.width);
  };

  const compact = size === 'compact' || (containerWidth > 0 && containerWidth < 540);
  const measuredWidth = containerWidth > 0 ? containerWidth : compact ? 360 : 520;
  const desiredColumns = measuredWidth >= 390 ? 3 : 2;
  const columns = Math.max(1, Math.min(desiredColumns, Math.max(1, cells.length)));
  const maxCellWidth = compact ? 154 : 164;
  const availableCellWidth = Math.max(104, (measuredWidth - 2) / (1 + 0.75 * (columns - 1)));
  const cellWidth = Math.round(Math.min(maxCellWidth, availableCellWidth));
  const cellHeight = Math.round(cellWidth * HEX_HEIGHT_RATIO);
  const stepX = cellWidth * 0.75;
  const placements = cells.map((cell, index) => {
    const col = index % columns;
    const row = Math.floor(index / columns);
    return {
      key: cell.key,
      left: col * stepX,
      top: row * cellHeight + (col % 2 === 1 ? cellHeight * 0.5 : 0),
    };
  });
  const clusterWidth = cellWidth + stepX * (columns - 1);
  const clusterHeight = placements.length === 0
    ? cellHeight
    : Math.max(...placements.map((placement) => placement.top + cellHeight));

  return (
    <View onLayout={handleLayout} style={{ marginBottom: 14 }}>
      <Text style={{ fontFamily: 'Lato_700Bold', fontSize: 13, color: '#9ca3af', letterSpacing: 0.6, marginBottom: 8 }}>
        {title}
      </Text>
      <View
        style={{
          alignItems: 'center',
          alignSelf: 'stretch',
          paddingVertical: compact ? 2 : 6,
          ...(Platform.OS === 'web'
            ? ({
                userSelect: 'none',
                WebkitUserSelect: 'none',
              } as any)
            : {}),
        }}
      >
        <View
          style={{
            width: clusterWidth,
            height: clusterHeight,
            position: 'relative',
          }}
        >
          {cells.map((cell, index) => (
            <View
              key={cell.key}
              style={{
                position: 'absolute',
                left: placements[index].left,
                top: placements[index].top,
                width: cellWidth,
                height: cellHeight,
                zIndex: cells.length - index,
              }}
            >
              <HoneycombCell
                cell={cell}
                width={cellWidth}
                height={cellHeight}
                compact={compact}
              />
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}
