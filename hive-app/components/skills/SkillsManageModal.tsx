import { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  Platform,
  KeyboardAvoidingView,
  ScrollView,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '../ui/Button';
import { supabase } from '../../lib/supabase';
import { PREDEFINED_SKILLS, shuffleSkills } from './constants';
import type { Skill } from '../../types';

interface SkillsManageModalProps {
  visible: boolean;
  onClose: () => void;
  communityId: string | null;
  userId: string | undefined;
  existingSkills: Skill[];
  onSave: () => void;
}

export function SkillsManageModal({
  visible,
  onClose,
  communityId,
  userId,
  existingSkills,
  onSave,
}: SkillsManageModalProps) {
  // Selection state
  const [selectedPredefined, setSelectedPredefined] = useState<Set<string>>(new Set());
  const [skillsToDelete, setSkillsToDelete] = useState<Set<string>>(new Set());

  // Custom skills
  const [customInput, setCustomInput] = useState('');
  const [customSkills, setCustomSkills] = useState<string[]>([]);

  // UI state
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Shuffle skills once when modal opens
  const shuffledSkills = useMemo(() => {
    if (!visible) return [];
    return shuffleSkills(PREDEFINED_SKILLS);
  }, [visible]);

  // Filter out skills user already has
  const availableSkills = useMemo(() => {
    const existingDescriptions = new Set(
      existingSkills.map((s) => s.description.toLowerCase())
    );
    return shuffledSkills.filter(
      (skill) => !existingDescriptions.has(skill.toLowerCase())
    );
  }, [shuffledSkills, existingSkills]);

  // Reset form when modal closes
  useEffect(() => {
    if (!visible) {
      setSelectedPredefined(new Set());
      setSkillsToDelete(new Set());
      setCustomInput('');
      setCustomSkills([]);
      setError('');
    }
  }, [visible]);

  const togglePredefined = (skill: string) => {
    setSelectedPredefined((prev) => {
      const next = new Set(prev);
      if (next.has(skill)) {
        next.delete(skill);
      } else {
        next.add(skill);
      }
      return next;
    });
  };

  const toggleDelete = (skillId: string) => {
    setSkillsToDelete((prev) => {
      const next = new Set(prev);
      if (next.has(skillId)) {
        next.delete(skillId);
      } else {
        next.add(skillId);
      }
      return next;
    });
  };

  const addCustomSkill = () => {
    const trimmed = customInput.trim();
    if (trimmed && !customSkills.includes(trimmed)) {
      setCustomSkills((prev) => [...prev, trimmed]);
      setCustomInput('');
    }
  };

  const removeCustomSkill = (skill: string) => {
    setCustomSkills((prev) => prev.filter((s) => s !== skill));
  };

  const handleSave = async () => {
    if (!userId || !communityId) return;

    setSaving(true);
    setError('');

    try {
      // Delete marked skills
      if (skillsToDelete.size > 0) {
        const { error: deleteError } = await supabase
          .from('skills')
          .delete()
          .in('id', Array.from(skillsToDelete))
          .eq('user_id', userId);

        if (deleteError) throw deleteError;
      }

      // Insert new skills (predefined + custom)
      const newSkills = [
        ...Array.from(selectedPredefined).map((name) => ({
          user_id: userId,
          community_id: communityId,
          description: name,
          raw_input: name,
          extracted_from: 'manual' as const,
        })),
        ...customSkills.map((name) => ({
          user_id: userId,
          community_id: communityId,
          description: name,
          raw_input: name,
          extracted_from: 'manual' as const,
        })),
      ];

      if (newSkills.length > 0) {
        const { error: insertError } = await supabase
          .from('skills')
          .insert(newSkills);

        if (insertError) throw insertError;
      }

      onSave();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save skills');
    } finally {
      setSaving(false);
    }
  };

  const hasChanges =
    selectedPredefined.size > 0 ||
    skillsToDelete.size > 0 ||
    customSkills.length > 0;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView className="flex-1 bg-cream" edges={['top']}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          className="flex-1"
        >
          <ScrollView className="flex-1">
            <View className="p-6">
              {/* Header */}
              <View className="flex-row justify-between items-center mb-6">
                <Pressable onPress={onClose} className="py-2">
                  <Text
                    style={{ fontFamily: 'Lato_400Regular' }}
                    className="text-charcoal/60 text-base"
                  >
                    Cancel
                  </Text>
                </Pressable>
                <Text
                  style={{ fontFamily: 'Lato_700Bold' }}
                  className="text-xl text-charcoal"
                >
                  Manage Skills
                </Text>
                <View style={{ width: 50 }} />
              </View>

              {/* Existing Skills Section */}
              {existingSkills.length > 0 && (
                <View className="mb-6">
                  <Text
                    style={{ fontFamily: 'Lato_700Bold' }}
                    className="text-charcoal text-base mb-2"
                  >
                    Your Skills ({existingSkills.length - skillsToDelete.size})
                  </Text>
                  <Text
                    style={{ fontFamily: 'Lato_400Regular' }}
                    className="text-charcoal/60 text-sm mb-3"
                  >
                    Tap the X to remove a skill
                  </Text>
                  <View className="bg-white rounded-xl p-3">
                    <View className="flex-row flex-wrap gap-2">
                      {existingSkills.map((skill) => {
                        const isMarkedForDelete = skillsToDelete.has(skill.id);
                        return (
                          <Pressable
                            key={skill.id}
                            onPress={() => toggleDelete(skill.id)}
                            className={`flex-row items-center px-3 py-2 rounded-full border ${
                              isMarkedForDelete
                                ? 'bg-red-100 border-red-300'
                                : 'bg-gold border-gold'
                            }`}
                          >
                            <Text
                              style={{
                                fontFamily: 'Lato_700Bold',
                                textDecorationLine: isMarkedForDelete
                                  ? 'line-through'
                                  : 'none',
                              }}
                              className={`text-sm mr-1 ${
                                isMarkedForDelete ? 'text-red-600' : 'text-white'
                              }`}
                            >
                              {skill.description}
                            </Text>
                            <Ionicons
                              name={isMarkedForDelete ? 'refresh' : 'close'}
                              size={16}
                              color={isMarkedForDelete ? '#dc2626' : 'white'}
                            />
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                  {skillsToDelete.size > 0 && (
                    <Text
                      style={{ fontFamily: 'Lato_400Regular' }}
                      className="text-red-600 text-sm mt-2"
                    >
                      {skillsToDelete.size} skill
                      {skillsToDelete.size !== 1 ? 's' : ''} will be removed
                    </Text>
                  )}
                </View>
              )}

              {/* Add Skills Section */}
              <View className="mb-6">
                <Text
                  style={{ fontFamily: 'Lato_700Bold' }}
                  className="text-charcoal text-base mb-2"
                >
                  Add Skills
                </Text>
                <Text
                  style={{ fontFamily: 'Lato_400Regular' }}
                  className="text-charcoal/60 text-sm mb-3"
                >
                  Tap to select multiple skills
                </Text>
                <View className="bg-white rounded-xl p-3">
                  <View className="flex-row flex-wrap gap-2">
                    {availableSkills.map((skill) => {
                      const isSelected = selectedPredefined.has(skill);
                      return (
                        <Pressable
                          key={skill}
                          onPress={() => togglePredefined(skill)}
                          className={`px-4 py-2 rounded-full border ${
                            isSelected
                              ? 'bg-gold border-gold'
                              : 'bg-cream border-charcoal/20'
                          }`}
                        >
                          <Text
                            style={{ fontFamily: 'Lato_700Bold' }}
                            className={`text-sm ${
                              isSelected ? 'text-white' : 'text-charcoal'
                            }`}
                          >
                            {skill}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
                {selectedPredefined.size > 0 && (
                  <Text
                    style={{ fontFamily: 'Lato_400Regular' }}
                    className="text-gold text-sm mt-2"
                  >
                    {selectedPredefined.size} skill
                    {selectedPredefined.size !== 1 ? 's' : ''} selected
                  </Text>
                )}
              </View>

              {/* Custom Skill Section */}
              <View className="mb-6">
                <Text
                  style={{ fontFamily: 'Lato_700Bold' }}
                  className="text-charcoal text-base mb-2"
                >
                  Custom Skill
                </Text>
                <Text
                  style={{ fontFamily: 'Lato_400Regular' }}
                  className="text-charcoal/60 text-sm mb-3"
                >
                  Add a skill not listed above
                </Text>
                <View className="flex-row gap-2">
                  <TextInput
                    value={customInput}
                    onChangeText={setCustomInput}
                    placeholder="Type your skill..."
                    placeholderTextColor="#9ca3af"
                    className="flex-1 bg-white rounded-xl px-4 py-3 text-charcoal"
                    style={{ fontFamily: 'Lato_400Regular' }}
                    onSubmitEditing={addCustomSkill}
                    returnKeyType="done"
                  />
                  <Pressable
                    onPress={addCustomSkill}
                    disabled={!customInput.trim()}
                    className={`px-4 rounded-xl items-center justify-center ${
                      customInput.trim() ? 'bg-gold' : 'bg-charcoal/20'
                    }`}
                  >
                    <Ionicons
                      name="add"
                      size={24}
                      color={customInput.trim() ? 'white' : '#9ca3af'}
                    />
                  </Pressable>
                </View>

                {/* Custom skills queue */}
                {customSkills.length > 0 && (
                  <View className="mt-3">
                    <Text
                      style={{ fontFamily: 'Lato_400Regular' }}
                      className="text-charcoal/60 text-sm mb-2"
                    >
                      Added:
                    </Text>
                    <View className="flex-row flex-wrap gap-2">
                      {customSkills.map((skill) => (
                        <Pressable
                          key={skill}
                          onPress={() => removeCustomSkill(skill)}
                          className="flex-row items-center px-3 py-2 rounded-full bg-gold border border-gold"
                        >
                          <Text
                            style={{ fontFamily: 'Lato_700Bold' }}
                            className="text-white text-sm mr-1"
                          >
                            {skill}
                          </Text>
                          <Ionicons name="close" size={16} color="white" />
                        </Pressable>
                      ))}
                    </View>
                  </View>
                )}
              </View>

              {/* Error */}
              {error ? (
                <View className="bg-red-50 rounded-xl p-4 mb-4">
                  <Text
                    style={{ fontFamily: 'Lato_400Regular' }}
                    className="text-red-600"
                  >
                    {error}
                  </Text>
                </View>
              ) : null}

              {/* Save Button */}
              <Button
                title={saving ? 'Saving...' : 'Save Changes'}
                onPress={handleSave}
                loading={saving}
                disabled={saving || !hasChanges}
              />
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}
