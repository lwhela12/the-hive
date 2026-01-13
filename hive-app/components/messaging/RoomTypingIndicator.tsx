import { View, Text, Animated } from 'react-native';
import { useEffect, useRef } from 'react';
import type { TypingIndicator, Profile } from '../../types';

interface RoomTypingIndicatorProps {
  typingUsers: Array<TypingIndicator & { user?: Profile }>;
  currentUserId?: string;
}

export function RoomTypingIndicator({ typingUsers, currentUserId }: RoomTypingIndicatorProps) {
  const dot1 = useRef(new Animated.Value(0)).current;
  const dot2 = useRef(new Animated.Value(0)).current;
  const dot3 = useRef(new Animated.Value(0)).current;

  // Filter out current user
  const otherTyping = typingUsers.filter((t) => t.user_id !== currentUserId);

  useEffect(() => {
    if (otherTyping.length === 0) return;

    const animate = () => {
      Animated.sequence([
        Animated.timing(dot1, { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.timing(dot2, { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.timing(dot3, { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.parallel([
          Animated.timing(dot1, { toValue: 0, duration: 300, useNativeDriver: true }),
          Animated.timing(dot2, { toValue: 0, duration: 300, useNativeDriver: true }),
          Animated.timing(dot3, { toValue: 0, duration: 300, useNativeDriver: true }),
        ]),
      ]).start(() => animate());
    };

    animate();

    return () => {
      dot1.setValue(0);
      dot2.setValue(0);
      dot3.setValue(0);
    };
  }, [otherTyping.length, dot1, dot2, dot3]);

  if (otherTyping.length === 0) return null;

  const names = otherTyping
    .map((t) => t.user?.name?.split(' ')[0] || 'Someone')
    .slice(0, 3);

  let text = '';
  if (names.length === 1) {
    text = `${names[0]} is typing`;
  } else if (names.length === 2) {
    text = `${names[0]} and ${names[1]} are typing`;
  } else {
    text = `${names[0]} and ${names.length - 1} others are typing`;
  }

  return (
    <View className="px-4 py-2 flex-row items-center">
      <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-charcoal/50 text-sm mr-2">
        {text}
      </Text>
      <View className="flex-row items-center">
        {[dot1, dot2, dot3].map((dot, index) => (
          <Animated.View
            key={index}
            style={{
              opacity: dot,
              transform: [
                {
                  translateY: dot.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, -3],
                  }),
                },
              ],
            }}
            className="w-1.5 h-1.5 rounded-full bg-charcoal/40 mx-0.5"
          />
        ))}
      </View>
    </View>
  );
}
