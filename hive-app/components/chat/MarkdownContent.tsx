import { memo } from 'react';
import { Platform, StyleSheet, Linking, ScrollView, View } from 'react-native';
import Markdown, { MarkdownIt } from 'react-native-markdown-display';
import type { RenderRules } from 'react-native-markdown-display';
import { LinkifiedText } from '../ui/LinkifiedText';

interface MarkdownContentProps {
  content: string;
  isUser?: boolean;
}

type MarkdownTableNode = {
  type: string;
  children?: MarkdownTableNode[];
};

const MIN_TABLE_COLUMN_WIDTH = 118;

const getTableColumnCount = (node: MarkdownTableNode): number => {
  if (node.type === 'tr') {
    return node.children?.filter((child) => child.type === 'th' || child.type === 'td').length ?? 0;
  }

  return node.children?.reduce((maxColumns, child) => {
    return Math.max(maxColumns, getTableColumnCount(child));
  }, 0) ?? 0;
};

const markdownIt = MarkdownIt({
  typographer: true,
  linkify: true,
});

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
  const tableHeaderBackgroundColor = isUser
    ? 'rgba(255,255,255,0.1)'
    : 'rgba(49,49,48,0.05)';

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
    tableScroll: {
      maxWidth: '100%',
      marginVertical: 8,
    },
    table: {
      borderWidth: 1,
      borderColor: tableBorderColor,
      borderRadius: 4,
      marginVertical: 0,
      overflow: 'hidden',
      alignSelf: 'flex-start',
    },
    thead: {
      backgroundColor: tableHeaderBackgroundColor,
    },
    th: {
      padding: 8,
      fontFamily: 'Lato_700Bold',
      fontWeight: '700',
      borderRightWidth: 1,
      borderRightColor: tableBorderColor,
      minWidth: MIN_TABLE_COLUMN_WIDTH,
      flexBasis: MIN_TABLE_COLUMN_WIDTH,
      flexGrow: 1,
    },
    tr: {
      borderBottomWidth: 1,
      borderBottomColor: tableBorderColor,
      flexDirection: 'row',
      alignItems: 'stretch',
    },
    td: {
      padding: 8,
      borderRightWidth: 1,
      borderRightColor: tableBorderColor,
      minWidth: MIN_TABLE_COLUMN_WIDTH,
      flexBasis: MIN_TABLE_COLUMN_WIDTH,
      flexGrow: 1,
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

  const renderRules: RenderRules = {
    table: (node, children, _parent, styles) => {
      const columnCount = Math.max(1, getTableColumnCount(node));
      const minWidth = columnCount * MIN_TABLE_COLUMN_WIDTH;

      return (
        <ScrollView
          key={node.key}
          horizontal
          nestedScrollEnabled
          showsHorizontalScrollIndicator
          style={styles.tableScroll}
          contentContainerStyle={{ minWidth }}
        >
          <View style={[styles._VIEW_SAFE_table, { minWidth }]}>
            {children}
          </View>
        </ScrollView>
      );
    },
    text: (node, _children, _parent, styles, inheritedStyles = {}) => (
      <LinkifiedText
        key={node.key}
        style={[inheritedStyles, styles.text]}
        linkStyle={styles.link}
      >
        {node.content}
      </LinkifiedText>
    ),
  };

  return (
    <Markdown
      style={markdownStyles}
      markdownit={markdownIt}
      onLinkPress={handleLinkPress}
      rules={renderRules}
    >
      {content}
    </Markdown>
  );
});
