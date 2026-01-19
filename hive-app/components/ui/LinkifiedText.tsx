import { memo, useMemo } from 'react';
import { Text, Linking, TextStyle, StyleProp } from 'react-native';

interface LinkifiedTextProps {
  children: string;
  style?: StyleProp<TextStyle>;
  linkStyle?: StyleProp<TextStyle>;
  selectable?: boolean;
}

// Regex to match URLs (http, https, and www.)
const URL_REGEX = /(https?:\/\/[^\s]+|www\.[^\s]+)/gi;

/**
 * Renders text with clickable links.
 * Detects URLs in the text and makes them tappable.
 */
export const LinkifiedText = memo(function LinkifiedText({
  children,
  style,
  linkStyle,
  selectable = false,
}: LinkifiedTextProps) {
  const parts = useMemo(() => {
    if (!children) return [];

    const matches = children.match(URL_REGEX);
    if (!matches) return [{ text: children, isLink: false }];

    const result: { text: string; isLink: boolean }[] = [];
    let lastIndex = 0;

    children.replace(URL_REGEX, (match, _, offset) => {
      // Add text before the match
      if (offset > lastIndex) {
        result.push({ text: children.slice(lastIndex, offset), isLink: false });
      }
      // Add the URL
      result.push({ text: match, isLink: true });
      lastIndex = offset + match.length;
      return match;
    });

    // Add remaining text after last match
    if (lastIndex < children.length) {
      result.push({ text: children.slice(lastIndex), isLink: false });
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
        part.isLink ? (
          <Text
            key={index}
            style={[{ textDecorationLine: 'underline' }, linkStyle]}
            onPress={() => handleLinkPress(part.text)}
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
