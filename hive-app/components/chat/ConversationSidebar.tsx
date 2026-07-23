import { createElement, useMemo, memo, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { View, Text, Pressable, ScrollView, Image, useWindowDimensions, StyleSheet, Alert, Platform } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { ConversationItem } from './ConversationItem';
import type { Conversation, ConversationProject } from '../../types';

const cliveIcon = require('../../assets/Clive_logo.png');

interface ConversationSidebarProps {
  conversations: Conversation[];
  projects?: ConversationProject[];
  currentConversationId: string | null;
  onSelectConversation: (id: string) => void;
  onNewConversation: () => void;
  onNewConversationInProject?: (projectId: string) => void | Promise<void>;
  onCreateProject?: (name: string) => Promise<ConversationProject | null>;
  onMoveConversation?: (conversationId: string, projectId: string | null) => Promise<boolean>;
  onDelete?: (id: string) => void;
  isOpen?: boolean;
  onClose?: () => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

const DRAWER_WIDTH_PERCENT = 0.85;
const SPRING_CONFIG = {
  damping: 20,
  stiffness: 200,
  mass: 0.5,
};

// Group conversations by date
function groupByDate(conversations: Conversation[]) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const lastWeek = new Date(today);
  lastWeek.setDate(lastWeek.getDate() - 7);

  const groups: { [key: string]: Conversation[] } = {
    Today: [],
    Yesterday: [],
    'This Week': [],
    Earlier: [],
  };

  conversations.forEach((conv) => {
    const convDate = new Date(conv.updated_at);
    convDate.setHours(0, 0, 0, 0);

    if (convDate.getTime() === today.getTime()) {
      groups['Today'].push(conv);
    } else if (convDate.getTime() === yesterday.getTime()) {
      groups['Yesterday'].push(conv);
    } else if (convDate > lastWeek) {
      groups['This Week'].push(conv);
    } else {
      groups['Earlier'].push(conv);
    }
  });

  // Remove empty groups
  return Object.entries(groups).filter(([, convs]) => convs.length > 0);
}

export const ConversationSidebar = memo(function ConversationSidebar({
  conversations,
  projects = [],
  currentConversationId,
  onSelectConversation,
  onNewConversation,
  onNewConversationInProject,
  onCreateProject,
  onMoveConversation,
  onDelete,
  isOpen = true,
  onClose,
  isCollapsed = false,
  onToggleCollapse,
}: ConversationSidebarProps) {
  const [expandedProjectIds, setExpandedProjectIds] = useState<Set<string>>(new Set());
  const [draggingConversationId, setDraggingConversationId] = useState<string | null>(null);
  const [dropTargetProjectId, setDropTargetProjectId] = useState<string | null>(null);
  const { width: screenWidth } = useWindowDimensions();
  const drawerWidth = screenWidth * DRAWER_WIDTH_PERCENT;

  const recents = useMemo(
    () => conversations.filter((conversation) => !conversation.project_id),
    [conversations]
  );

  const groupedConversations = useMemo(
    () => groupByDate(recents),
    [recents]
  );

  const projectConversations = useMemo(
    () => projects.map((project) => ({
      project,
      conversations: conversations.filter((conversation) => conversation.project_id === project.id),
    })),
    [projects, conversations]
  );

  // Use mobile layout for narrow screens (< 768px)
  const isMobile = screenWidth < 768;

  // Animation values — drawer starts off-screen, always mounted so opening is instant
  const translateX = useSharedValue(-drawerWidth);
  const backdropOpacity = useSharedValue(0);

  // Update animation when isOpen changes
  useEffect(() => {
    if (isMobile) {
      if (isOpen) {
        translateX.value = withSpring(0, SPRING_CONFIG);
        backdropOpacity.value = withTiming(1, { duration: 200 });
      } else {
        translateX.value = withSpring(-drawerWidth, SPRING_CONFIG);
        backdropOpacity.value = withTiming(0, { duration: 200 });
      }
    }
  }, [isOpen, isMobile, drawerWidth]);

  // Animated styles
  const drawerAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const backdropAnimatedStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));

  const closeAndSelectConversation = (id: string) => {
    onClose?.();
    onSelectConversation(id);
  };

  const closeAndNewConversation = () => {
    onClose?.();
    onNewConversation();
  };

  const startProjectConversation = (projectId: string) => {
    setExpandedProjectIds((prev) => new Set(prev).add(projectId));
    if (isMobile) {
      onClose?.();
    }
    onNewConversationInProject?.(projectId);
  };

  const toggleProject = (projectId: string) => {
    setExpandedProjectIds((prev) => {
      const next = new Set(prev);
      if (next.has(projectId)) {
        next.delete(projectId);
      } else {
        next.add(projectId);
      }
      return next;
    });
  };

  const handleCreateProject = () => {
    if (!onCreateProject) return;

    if (Platform.OS === 'web') {
      const name = window.prompt('Project name');
      if (name?.trim()) {
        onCreateProject(name).then((project) => {
          if (!project) {
            window.alert('Could not create project yet. The conversation projects database migration may need to be applied first.');
          }
        });
      }
      return;
    }

    Alert.prompt(
      'New Project',
      'Name this project',
      (name) => {
        if (name?.trim()) {
          onCreateProject(name).then((project) => {
            if (!project) {
              Alert.alert('Project Not Created', 'The conversation projects database migration may need to be applied first.');
            }
          });
        }
      }
    );
  };

  const getDraggedConversationId = (event: any) => {
    return (
      event.dataTransfer?.getData('application/x-hive-conversation') ||
      event.dataTransfer?.getData('text/plain') ||
      draggingConversationId
    );
  };

  const handleDropOnProject = async (event: any, projectId: string) => {
    event.preventDefault?.();
    event.stopPropagation?.();
    setDropTargetProjectId(null);

    const conversationId = getDraggedConversationId(event);
    if (!conversationId || !onMoveConversation) return;

    await onMoveConversation(conversationId, projectId);
    setExpandedProjectIds((prev) => new Set(prev).add(projectId));
  };

  const handleDropOnRecents = async (event: any) => {
    event.preventDefault?.();
    event.stopPropagation?.();
    setDropTargetProjectId(null);

    const conversationId = getDraggedConversationId(event);
    if (!conversationId || !onMoveConversation) return;

    await onMoveConversation(conversationId, null);
  };

  const createDropProps = (projectId: string | null) => Platform.OS === 'web'
    ? ({
        onDragOver: (event: any) => {
          event.preventDefault?.();
          event.dataTransfer.dropEffect = 'move';
          setDropTargetProjectId(projectId ?? 'recents');
        },
        onDragLeave: () => setDropTargetProjectId(null),
        onDrop: (event: any) => {
          if (projectId) {
            handleDropOnProject(event, projectId);
          } else {
            handleDropOnRecents(event);
          }
        },
      } as any)
    : {};

  const wrapDropTarget = (projectId: string | null, child: ReactNode) => {
    if (Platform.OS !== 'web') return child;

    return createElement(
      'div',
      {
        ...createDropProps(projectId),
        style: { borderRadius: 12 },
      },
      child
    );
  };

  const sidebarContent = (
    <View className="flex-1 bg-[#fffdf5]">
      {/* Mobile drawer identity header — on desktop the page's gold AppHeader
          carries the crest + "Clive", so the sidebar doesn't repeat it. */}
      {isMobile && (
        <View
          className="flex-row items-center justify-between px-4 py-2.5 border-b"
          style={{ borderBottomColor: 'rgba(222,193,129,0.5)' }}
        >
          <View className="flex-row items-center">
            <Image source={cliveIcon} style={{ width: 32, height: 32, borderRadius: 16, marginRight: 8 }} />
            <Text
              style={{ fontFamily: 'LibreBaskerville_700Bold' }}
              className="text-lg text-charcoal"
            >
              Clive
            </Text>
          </View>
          {onClose && (
            <Pressable
              onPress={onClose}
              className="w-8 h-8 items-center justify-center rounded-full active:bg-gold/10"
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Text className="text-2xl text-charcoal leading-none">×</Text>
            </Pressable>
          )}
        </View>
      )}

      {/* New Clive conversation button (+ collapse control on desktop) */}
      <View className="flex-row items-center mx-4 mt-4 mb-2">
        <Pressable
          onPress={isMobile ? closeAndNewConversation : onNewConversation}
          className="flex-1 bg-gold py-2.5 px-4 rounded-full flex-row items-center justify-center active:opacity-80"
          style={{
            shadowColor: '#bd9348',
            shadowOpacity: 0.28,
            shadowRadius: 10,
            shadowOffset: { width: 0, height: 3 },
            elevation: 3,
          }}
        >
          <Text className="text-white text-base mr-2">+</Text>
          <Text
            style={{ fontFamily: 'Lato_700Bold' }}
            className="text-white text-sm"
          >
            New Clive Chat
          </Text>
        </Pressable>
        {!isMobile && onToggleCollapse && (
          <Pressable
            onPress={onToggleCollapse}
            className="ml-2 w-8 h-8 items-center justify-center rounded-full active:bg-gold/10"
            accessibilityLabel="Collapse sidebar"
          >
            <Text className="text-xl text-gold">«</Text>
          </Pressable>
        )}
      </View>

      {/* Conversations List */}
      <ScrollView className="flex-1" showsVerticalScrollIndicator={true}>
        <View>
          <View className="px-4 pt-4 pb-2 flex-row items-center">
            <Text
              style={{ fontFamily: 'Lato_700Bold', letterSpacing: 0.8 }}
              className="text-xs uppercase text-[#8e7a5e]"
            >
              Projects
            </Text>
            <Ionicons name="chevron-down" size={13} color="#bd9348" style={{ marginLeft: 4, marginTop: 1 }} />
          </View>
          <Pressable
            onPress={handleCreateProject}
            className="mx-3 mb-0.5 px-3 py-2 rounded-xl flex-row items-center active:bg-gold/10"
          >
            <View style={{ width: 24, marginRight: 8 }}>
              <Ionicons name="folder-open-outline" size={18} color="#bd9348" />
              <Ionicons name="add" size={12} color="#bd9348" style={{ position: 'absolute', right: 0, bottom: -2 }} />
            </View>
            <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-charcoal text-[15px]">
              New project
            </Text>
          </Pressable>
          {projectConversations.map(({ project, conversations: projectItems }) => {
            const isExpanded = expandedProjectIds.has(project.id);
            const isDropTarget = dropTargetProjectId === project.id;
            return (
              <View key={project.id}>
                {wrapDropTarget(project.id, (
                  <View
                    className={`mx-3 px-3 py-2 rounded-xl flex-row items-center ${
                      isDropTarget ? 'bg-gold/10 border border-gold/40' : ''
                    }`}
                  >
                    <Pressable
                      onPress={() => toggleProject(project.id)}
                      className="flex-1 flex-row items-center active:opacity-70"
                    >
                      <Ionicons
                        name={isExpanded ? 'folder-open-outline' : 'folder-outline'}
                        size={18}
                        color="#bd9348"
                        style={{ marginRight: 10 }}
                      />
                      <Text style={{ fontFamily: 'Lato_400Regular' }} className="flex-1 text-charcoal text-[15px]" numberOfLines={1}>
                        {project.name}
                      </Text>
                    </Pressable>
                    {isDropTarget ? (
                      <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-xs text-gold ml-2">
                        Drop
                      </Text>
                    ) : null}
                    {projectItems.length > 0 ? (
                      <Text style={{ fontFamily: 'Lato_400Regular' }} className="text-xs text-[#a09274] ml-2">
                        {projectItems.length}
                      </Text>
                    ) : null}
                    {onNewConversationInProject ? (
                      <Pressable
                        onPress={() => startProjectConversation(project.id)}
                        className="ml-2 w-8 h-8 rounded-full items-center justify-center active:bg-gold/10"
                        accessibilityLabel={`New chat in ${project.name}`}
                        {...(Platform.OS === 'web' ? { title: `New chat in ${project.name}` } as any : {})}
                      >
                        <Ionicons name="add" size={19} color="#bd9348" />
                      </Pressable>
                    ) : null}
                  </View>
                ))}
                {isExpanded && onNewConversationInProject ? (
                  <Pressable
                    onPress={() => startProjectConversation(project.id)}
                    className="ml-8 mr-3 px-3 py-2 rounded-xl flex-row items-center active:bg-gray-50"
                  >
                    <Ionicons name="add-circle-outline" size={18} color="#bd9348" style={{ marginRight: 10 }} />
                    <Text style={{ fontFamily: 'Lato_700Bold' }} className="text-gold text-sm">
                      New chat
                    </Text>
                  </Pressable>
                ) : null}
                {isExpanded && projectItems.map((conversation) => (
                  <View key={conversation.id} className="ml-5">
                    <ConversationItem
                      conversation={conversation}
                      isActive={conversation.id === currentConversationId}
                      onSelect={isMobile ? closeAndSelectConversation : onSelectConversation}
                      onDelete={onDelete}
                      projects={projects}
                      onMove={onMoveConversation}
                      onDragStart={setDraggingConversationId}
                      onDragEnd={() => {
                        setDraggingConversationId(null);
                        setDropTargetProjectId(null);
                      }}
                    />
                  </View>
                ))}
              </View>
            );
          })}
        </View>

        {wrapDropTarget(null, (
          <Text
            style={{ fontFamily: 'Lato_700Bold', letterSpacing: 0.8 }}
            className={`px-4 pt-7 pb-2 text-xs uppercase text-[#8e7a5e] ${
              dropTargetProjectId === 'recents' ? 'bg-gold/10' : ''
            }`}
          >
            Recents
          </Text>
        ))}

        {groupedConversations.length === 0 ? (
          <View className="px-4 py-8">
            <Text
              style={{ fontFamily: 'Lato_400Regular' }}
              className="text-[#a09274] text-center"
            >
              No conversations yet
            </Text>
          </View>
        ) : (
          groupedConversations.map(([group, convs]) => (
            <View key={group}>
              {group !== 'Today' && (
                <Text
                  style={{ fontFamily: 'Lato_700Bold', letterSpacing: 0.8 }}
                  className="px-4 pt-4 pb-1.5 text-[11px] text-[#b3a27f] uppercase"
                >
                  {group}
                </Text>
              )}
              {convs.map((conversation) => (
                <ConversationItem
                  key={conversation.id}
                  conversation={conversation}
                  isActive={conversation.id === currentConversationId}
                  onSelect={isMobile ? closeAndSelectConversation : onSelectConversation}
                  onDelete={onDelete}
                  projects={projects}
                  onMove={onMoveConversation}
                  onDragStart={setDraggingConversationId}
                  onDragEnd={() => {
                    setDraggingConversationId(null);
                    setDropTargetProjectId(null);
                  }}
                />
              ))}
            </View>
          ))
        )}
      </ScrollView>

    </View>
  );

  // On mobile, render as animated overlay (always mounted so opening is instant)
  if (isMobile) {
    return (
      <View style={StyleSheet.absoluteFill} pointerEvents={isOpen ? 'auto' : 'none'} className="z-50">
        {/* Animated Backdrop */}
        <Animated.View style={[StyleSheet.absoluteFill, backdropAnimatedStyle]}>
          <Pressable
            onPress={onClose}
            style={StyleSheet.absoluteFill}
            className="bg-black/40"
          />
        </Animated.View>

        {/* Animated Drawer */}
        <Animated.View
          style={[
            {
              position: 'absolute',
              top: 0,
              left: 0,
              bottom: 0,
              width: drawerWidth,
              maxWidth: 400,
            },
            drawerAnimatedStyle,
          ]}
          className="bg-[#fffdf5] shadow-2xl"
        >
          {sidebarContent}
        </Animated.View>
      </View>
    );
  }

  // On web/desktop, render as fixed sidebar (collapsible)
  if (isCollapsed) {
    return (
      <View
        className="w-12 border-r h-full bg-[#fffdf5] items-center pt-3"
        style={{ borderRightColor: 'rgba(222,193,129,0.5)' }}
      >
        <Pressable
          onPress={onToggleCollapse}
          className="w-8 h-8 items-center justify-center rounded-full active:bg-gold/10"
          accessibilityLabel="Expand sidebar"
        >
          <Text className="text-xl text-gold">»</Text>
        </Pressable>
        <Pressable
          onPress={onNewConversation}
          className="mt-2 w-8 h-8 items-center justify-center bg-gold rounded-full active:opacity-80"
          accessibilityLabel="New Clive chat"
        >
          <Text className="text-white text-lg leading-none">+</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View
      className="w-72 border-r h-full"
      style={{ borderRightColor: 'rgba(222,193,129,0.5)' }}
    >
      {sidebarContent}
    </View>
  );
});
