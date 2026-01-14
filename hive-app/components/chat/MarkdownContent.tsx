import { memo } from 'react';
import { Platform, StyleSheet, Linking } from 'react-native';
import Markdown from 'react-native-markdown-display';

interface MarkdownContentProps {
  content: string;
  isUser?: boolean;
}

/**
 * Renders markdown content with custom styling that matches the app's design.
 * Used for assistant messages to support rich text formatting.
 */
export const MarkdownContent = memo(function MarkdownContent({
  content,
  isUser = false,
}: MarkdownContentProps) {
  // Define colors based on message sender
  const textColor = isUser ? '#FFFFFF' : '#313130'; // white or charcoal
  const linkColor = isUser ? '#f6f4e5' : '#bd9348'; // cream or gold
  const codeBackgroundColor = isUser
    ? 'rgba(255,255,255,0.15)'
    : 'rgba(49,49,48,0.08)';
  const blockquoteBorderColor = isUser ? 'rgba(255,255,255,0.5)' : '#bd9348';
  const tableBorderColor = isUser
    ? 'rgba(255,255,255,0.3)'
    : 'rgba(49,49,48,0.2)';

  const markdownStyles = StyleSheet.create({
    body: {
      color: textColor,
      fontSize: 16,
      lineHeight: 24,
      fontFamily: 'Lato_400Regular',
      flexShrink: 1,
      flexWrap: 'wrap',
    },
    text: {
      flexShrink: 1,
      flexWrap: 'wrap',
    },
    paragraph: {
      marginTop: 0,
      marginBottom: 8,
      flexShrink: 1,
      flexWrap: 'wrap',
    },
    // Text styles
    strong: {
      fontFamily: 'Lato_700Bold',
      fontWeight: '700',
    },
    em: {
      fontStyle: 'italic',
    },
    s: {
      textDecorationLine: 'line-through',
    },
    // Links
    link: {
      color: linkColor,
      textDecorationLine: 'underline',
    },
    // Blockquotes
    blockquote: {
      borderLeftWidth: 3,
      borderLeftColor: blockquoteBorderColor,
      paddingLeft: 12,
      marginLeft: 0,
      marginVertical: 8,
      opacity: 0.9,
    },
    // Inline code
    code_inline: {
      backgroundColor: codeBackgroundColor,
      color: textColor,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 4,
      fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
      fontSize: 14,
    },
    // Code blocks
    code_block: {
      backgroundColor: codeBackgroundColor,
      color: textColor,
      padding: 12,
      borderRadius: 8,
      fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
      fontSize: 14,
      marginVertical: 8,
    },
    fence: {
      backgroundColor: codeBackgroundColor,
      color: textColor,
      padding: 12,
      borderRadius: 8,
      fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
      fontSize: 14,
      marginVertical: 8,
    },
    // Headers
    heading1: {
      fontSize: 22,
      fontFamily: 'LibreBaskerville_700Bold',
      fontWeight: '700',
      marginBottom: 8,
      marginTop: 16,
      color: textColor,
    },
    heading2: {
      fontSize: 19,
      fontFamily: 'LibreBaskerville_700Bold',
      fontWeight: '700',
      marginBottom: 6,
      marginTop: 14,
      color: textColor,
    },
    heading3: {
      fontSize: 17,
      fontFamily: 'Lato_700Bold',
      fontWeight: '700',
      marginBottom: 4,
      marginTop: 12,
      color: textColor,
    },
    heading4: {
      fontSize: 16,
      fontFamily: 'Lato_700Bold',
      fontWeight: '700',
      marginBottom: 4,
      marginTop: 10,
      color: textColor,
    },
    heading5: {
      fontSize: 15,
      fontFamily: 'Lato_700Bold',
      fontWeight: '600',
      marginBottom: 4,
      marginTop: 8,
      color: textColor,
    },
    heading6: {
      fontSize: 14,
      fontFamily: 'Lato_700Bold',
      fontWeight: '600',
      marginBottom: 4,
      marginTop: 8,
      color: textColor,
    },
    // Lists
    bullet_list: {
      marginVertical: 4,
    },
    ordered_list: {
      marginVertical: 4,
    },
    list_item: {
      marginVertical: 2,
      flexDirection: 'row',
    },
    bullet_list_icon: {
      marginRight: 8,
      color: textColor,
    },
    ordered_list_icon: {
      marginRight: 8,
      color: textColor,
    },
    // Tables
    table: {
      borderWidth: 1,
      borderColor: tableBorderColor,
      borderRadius: 4,
      marginVertical: 8,
    },
    thead: {
      backgroundColor: isUser
        ? 'rgba(255,255,255,0.1)'
        : 'rgba(49,49,48,0.05)',
    },
    th: {
      padding: 8,
      fontFamily: 'Lato_700Bold',
      fontWeight: '700',
      borderRightWidth: 1,
      borderRightColor: tableBorderColor,
    },
    tr: {
      borderBottomWidth: 1,
      borderBottomColor: tableBorderColor,
    },
    td: {
      padding: 8,
      borderRightWidth: 1,
      borderRightColor: tableBorderColor,
    },
    // Horizontal rule
    hr: {
      backgroundColor: tableBorderColor,
      height: 1,
      marginVertical: 16,
    },
    // Images (if any)
    image: {
      marginVertical: 8,
    },
  });

  const handleLinkPress = (url: string) => {
    Linking.openURL(url).catch((err) => {
      console.error('Failed to open URL:', err);
    });
    return false; // Prevent default behavior
  };

  return (
    <Markdown style={markdownStyles} onLinkPress={handleLinkPress}>
      {content}
    </Markdown>
  );
});
