import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabase';
import { useAuth } from './useAuth';
import type { Skill, ActionItem } from '../../types';

export function useUser() {
  const { profile, communityId, refreshProfile } = useAuth();
  const [skills, setSkills] = useState<Skill[]>([]);
  const [actionItems, setActionItems] = useState<ActionItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchUserData = useCallback(async () => {
    if (!profile || !communityId) {
      setLoading(false);
      return;
    }

    setLoading(true);

    // Fetch skills
    const { data: skillsData } = await supabase
      .from('skills')
      .select('*')
      .eq('user_id', profile.id)
      .eq('community_id', communityId)
      .order('created_at', { ascending: false });

    if (skillsData) setSkills(skillsData);

    // Fetch action items
    const { data: actionsData } = await supabase
      .from('action_items')
      .select('*')
      .eq('assigned_to', profile.id)
      .eq('community_id', communityId)
      .eq('completed', false)
      .order('due_date', { ascending: true });

    if (actionsData) setActionItems(actionsData);

    setLoading(false);
  }, [profile?.id, communityId]);

  useEffect(() => {
    fetchUserData();
  }, [fetchUserData]);

  const updateProfile = async (updates: Partial<typeof profile>) => {
    if (!profile) return { error: new Error('No profile') };

    const { error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', profile.id);

    if (!error) {
      await refreshProfile();
    }

    return { error };
  };

  const completeActionItem = async (itemId: string) => {
    const { error } = await supabase
      .from('action_items')
      .update({
        completed: true,
        completed_at: new Date().toISOString(),
      })
      .eq('id', itemId);

    if (!error) {
      setActionItems((prev) => prev.filter((i) => i.id !== itemId));
    }

    return { error };
  };

  const deleteSkill = async (skillId: string) => {
    const { error } = await supabase
      .from('skills')
      .delete()
      .eq('id', skillId)
      .eq('user_id', profile?.id)
      .eq('community_id', communityId);

    if (!error) {
      setSkills((prev) => prev.filter((s) => s.id !== skillId));
    }

    return { error };
  };

  return {
    profile,
    skills,
    actionItems,
    loading,
    refresh: fetchUserData,
    updateProfile,
    completeActionItem,
    deleteSkill,
  };
}
