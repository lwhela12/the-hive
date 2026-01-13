import { useState, useRef, useEffect } from 'react';
import { View, Text, Pressable, Animated, LayoutAnimation, Platform, UIManager } from 'react-native';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface ExpandableSectionProps {
  title: string;
  icon?: string;
  defaultExpanded?: boolean;
  children: React.ReactNode;
}

export function ExpandableSection({
  title,
  icon,
  defaultExpanded = false,
  children,
}: ExpandableSectionProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const rotateAnim = useRef(new Animated.Value(defaultExpanded ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(rotateAnim, {
      toValue: expanded ? 1 : 0,
      duration: 200,
      useNativeDriver: true,
    }).start();
  }, [expanded, rotateAnim]);

  const toggleExpanded = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded(!expanded);
  };

  const rotateInterpolate = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '180deg'],
  });

  return (
    <View className="mb-4">
      <Pressable
        onPress={toggleExpanded}
        className="flex-row items-center justify-between bg-white rounded-xl p-4 shadow-sm"
      >
        <View className="flex-row items-center">
          {icon && <Text className="text-xl mr-2">{icon}</Text>}
          <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-lg text-charcoal">
            {title}
          </Text>
        </View>
        <Animated.Text
          style={{
            transform: [{ rotate: rotateInterpolate }],
            fontSize: 16,
          }}
        >
          ^
        </Animated.Text>
      </Pressable>
      {expanded && (
        <View className="mt-2">
          {children}
        </View>
      )}
    </View>
  );
}
