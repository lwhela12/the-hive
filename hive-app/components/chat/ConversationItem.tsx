import { createElement, memo, useState } from 'react';
import { View, Text, Pressable, Alert, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { formatDateShort } from '../../lib/dateUtils';
import type { Conversation, ConversationProject } from '../../types';

interface ConversationItemProps {
  conversation: Conversation;
  isActive: boolean;
  onSelect: (id: string) => void;
  onDelete?: (id: string) => void;
  projects?: ConversationProject[];
  onMove?: (conversationId: string, projectId: string | null) => Promise<boolean>;
  onDragStart?: (conversationId: string) => void;
  onDragEnd?: () => void;
}

export const ConversationItem = memo(function ConversationItem({
  conversation,
  isActive,
  onSelect,
  onDelete,
  projects = [],
  onMove,
  onDragStart,
  onDragEnd,
}: ConversationItemProps) {
  const [showActions, setShowActions] = useState(false);
  const displayTitle = conversation.title || 'New conversation';
  const date = new Date(conversation.updated_at);
  const now = new Date();

  // Format relative time
  const getRelativeTime = () => {
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;

    return formatDateShort(date);
  };

  const handleDelete = () => {
    if (Platform.OS === 'web') {
      if (window.confirm('Delete this conversation? This cannot be undone.')) {
        onDelete?.(conversation.id);
      }
    } else {
      Alert.alert(
        'Delete Conversation',
        'This cannot be undone.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete', style: 'destructive', onPress: () => onDelete?.(conversation.id) },
        ]
      );
    }
  };

  const handleMove = () => {
    if (!onMove) return;

    if (projects.length === 0) {
      Alert.alert('No Projects Yet', 'Create a project first, then move conversations into it.');
      return;
    }

    if (Platform.OS === 'web') {
      const options = projects
        .map((project, index) => `${index + 1}. ${project.name}`)
        .join('\n');
      const currentProject = projects.find((project) => project.id === conversation.project_id);
      const removeText = currentProject ? '\n0. Remove from project' : '';
      const choice = window.prompt(`Move to project:\n${options}${removeText}`);
      if (choice === null) return;

      if (choice.trim() === '0' && currentProject) {
        onMove(conversation.id, null);
        return;
      }

      const selectedIndex = Number(choice.trim()) - 1;
      const selectedProject = projects[selectedIndex];
      if (selectedProject) {
        onMove(conversation.id, selectedProject.id);
      }
      return;
    }

    Alert.alert(
      'Move to Project',
      displayTitle,
      [
        ...projects.map((project) => ({
          text: project.name,
          onPress: () => onMove(conversation.id, project.id),
        })),
        ...(conversation.project_id ? [{ text: 'Remove from Project', onPress: () => onMove(conversation.id, null) }] : []),
        { text: 'Cancel', style: 'cancel' as const },
      ]
    );
  };

  const isWeb = Platform.OS === 'web';
  const row = (
    <Pressable
      onPress={() => onSelect(conversation.id)}
      onLongPress={() => setShowActions(true)}
      onHoverIn={isWeb ? () => setShowActions(true) : undefined}
      onHoverOut={isWeb ? () => setShowActions(false) : undefined}
      className={`px-4 py-3 border-b border-gray-100 ${
        isActive ? 'bg-gold/10' : 'bg-white active:bg-gray-50'
      }`}
    >
      <View className="flex-row items-center justify-between">
        {isWeb && (
          <View className="mr-2 opacity-40">
            <Ionicons name="reorder-three-outline" size={18} color="#313130" />
          </View>
        )}
        <Text
          numberOfLines={1}
          style={{ fontFamily: 'Lato_400Regular' }}
          className={`flex-1 text-base ${
            isActive ? 'text-gold font-semibold' : 'text-charcoal'
          }`}
        >
          {displayTitle}
        </Text>
        {conversation.mode === 'onboarding' && (
          <View className="bg-gold/20 px-2 py-0.5 rounded ml-2">
            <Text
              style={{ fontFamily: 'Lato_400Regular' }}
              className="text-xs text-gold"
            >
              Onboarding
            </Text>
          </View>
        )}
        {showActions && (
          <View className="flex-row items-center ml-2">
            {onMove && (
              <Pressable
                onPress={(e) => {
                  e.stopPropagation?.();
                  handleMove();
                }}
                className="px-2 py-1 rounded hover:bg-gray-100 active:bg-gray-100"
              >
                <Text className="text-gray-500 text-xs">Move</Text>
              </Pressable>
            )}
            {onDelete && (
              <Pressable
                onPress={(e) => {
                  e.stopPropagation?.();
                  handleDelete();
                }}
                className="ml-1 p-1 rounded hover:bg-red-50 active:bg-red-100"
              >
                <Text className="text-red-500 text-sm">✕</Text>
              </Pressable>
            )}
          </View>
        )}
      </View>
      <Text
        style={{ fontFamily: 'Lato_400Regular' }}
        className="text-xs text-gray-400 mt-1"
      >
        {getRelativeTime()}
      </Text>
    </Pressable>
  );

  if (!isWeb) return row;

  return createElement(
    'div',
    {
      draggable: true,
      onDragStart: (event: any) => {
        event.dataTransfer?.setData('text/plain', conversation.id);
        event.dataTransfer?.setData('application/x-hive-conversation', conversation.id);
        event.dataTransfer.effectAllowed = 'move';
        onDragStart?.(conversation.id);
      },
      onDragEnd: () => onDragEnd?.(),
      style: { cursor: 'grab' },
      title: 'Drag to move into a project',
    },
    row
  );
});
