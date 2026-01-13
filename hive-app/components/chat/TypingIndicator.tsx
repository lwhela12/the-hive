import { View, Platform, StyleSheet } from 'react-native';
import { useEffect, useRef } from 'react';

export function TypingIndicator() {
  // Add CSS keyframes for web
  useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const styleId = 'typing-indicator-styles';
      if (!document.getElementById(styleId)) {
        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = `
          @keyframes typingBounce {
            0%, 60%, 100% {
              transform: translateY(0);
              opacity: 0.4;
            }
            30% {
              transform: translateY(-8px);
              opacity: 1;
            }
          }
          .typing-dot {
            animation: typingBounce 1.4s infinite ease-in-out;
          }
          .typing-dot:nth-child(1) {
            animation-delay: 0s;
          }
          .typing-dot:nth-child(2) {
            animation-delay: 0.2s;
          }
          .typing-dot:nth-child(3) {
            animation-delay: 0.4s;
          }
        `;
        document.head.appendChild(style);
      }
    }
  }, []);

  return (
    <View className="self-start bg-cream rounded-2xl rounded-bl-md px-4 py-3 mb-3 ml-2">
      <View className="flex-row items-center h-6 gap-1.5">
        {[0, 1, 2].map((index) => (
          <View
            key={index}
            // @ts-ignore - className for web CSS animation
            className="typing-dot"
            style={{
              width: 10,
              height: 10,
              borderRadius: 5,
              backgroundColor: '#bd9348', // gold color
            }}
          />
        ))}
      </View>
    </View>
  );
}
