import { memo, useMemo } from 'react';
import { Text, Linking, TextStyle, StyleProp } from 'react-native';

interface LinkifiedTextProps {
  children: string;
  style?: StyleProp<TextStyle>;
  linkStyle?: StyleProp<TextStyle>;
  mentionStyle?: StyleProp<TextStyle>;
  selectable?: boolean;
}

const URL_OR_MENTION_REGEX = /(https?:\/\/[^\s]+|www\.[^\s]+|@[a-z0-9._-]+)/gi;

/**
 * Renders text with clickable links.
 * Detects URLs in the text and makes them tappable.
 */
export const LinkifiedText = memo(function LinkifiedText({
  children,
  style,
  linkStyle,
  mentionStyle,
  selectable = false,
}: LinkifiedTextProps) {
  const parts = useMemo(() => {
    if (!children) return [];

    const matches = children.match(URL_OR_MENTION_REGEX);
    if (!matches) return [{ text: children, type: 'text' as const }];

    const result: { text: string; type: 'text' | 'link' | 'mention' }[] = [];
    let lastIndex = 0;

    children.replace(URL_OR_MENTION_REGEX, (match, _, offset) => {
      // Add text before the match
      if (offset > lastIndex) {
        result.push({ text: children.slice(lastIndex, offset), type: 'text' });
      }
      result.push({
        text: match,
        type: match.startsWith('@') ? 'mention' : 'link',
      });
      lastIndex = offset + match.length;
      return match;
    });

    // Add remaining text after last match
    if (lastIndex < children.length) {
      result.push({ text: children.slice(lastIndex), type: 'text' });
    }

    return result;
  }, [children]);

  const handleLinkPress = (url: string) => {
    // Add https:// if the URL starts with www.
    const fullUrl = url.startsWith('www.') ? `https://${url}` : url;
    Linking.openURL(fullUrl).catch((err) => {
      console.error('Failed to open URL:', err);
    });
  };

  return (
    <Text style={style} selectable={selectable}>
      {parts.map((part, index) =>
        part.type === 'link' ? (
          <Text
            key={index}
            style={[{ textDecorationLine: 'underline' }, linkStyle]}
            onPress={() => handleLinkPress(part.text)}
          >
            {part.text}
          </Text>
        ) : part.type === 'mention' ? (
          <Text
            key={index}
            style={[
              {
                color: '#2563eb',
                backgroundColor: 'rgba(37,99,235,0.1)',
                fontFamily: 'Lato_700Bold',
              },
              mentionStyle,
            ]}
          >
            {part.text}
          </Text>
        ) : (
          part.text
        )
      )}
    </Text>
  );
});
