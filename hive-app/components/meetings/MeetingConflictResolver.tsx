import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import type { SpeakerMember } from './SpeakerNames';
import type { MeetingConflictReview } from './SummarySections';

export type ConflictResolutionChoice = 'keep_owner' | 'reassign' | 'remove' | 'clarify';

export interface ConflictResolutionInput {
  resolution: ConflictResolutionChoice;
  newOwnerId?: string;
  note?: string;
}

interface MeetingConflictResolverProps {
  review: MeetingConflictReview;
  members: SpeakerMember[];
  saving: boolean;
  onResolve: (input: ConflictResolutionInput) => Promise<void>;
}

const firstName = (name?: string | null) => (name ?? '').trim().split(/\s+/)[0] || 'this person';

export function MeetingConflictResolver({
  review,
  members,
  saving,
  onResolve,
}: MeetingConflictResolverProps) {
  const linkedDuty = review.kind === 'action_item_owner' && !!review.action_item_id;
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState<ConflictResolutionChoice>(linkedDuty ? 'keep_owner' : 'clarify');
  const [newOwnerId, setNewOwnerId] = useState('');
  const [note, setNote] = useState('');

  const currentOwner = firstName(review.current_owner_name);
  const canSave = !saving
    && (choice !== 'reassign' || !!newOwnerId)
    && (choice !== 'clarify' || !!note.trim());

  if (!open) {
    return (
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`Edit review for ${review.task_description ?? 'this discrepancy'}`}
        className="mt-4 self-start rounded-lg bg-amber-100 px-3 py-2 active:bg-amber-200"
      >
        <Text className="font-semibold text-amber-900">Edit this review</Text>
      </Pressable>
    );
  }

  const option = (
    value: ConflictResolutionChoice,
    label: string,
    help: string,
  ) => {
    const selected = choice === value;
    return (
      <Pressable
        key={value}
        onPress={() => setChoice(value)}
        accessibilityRole="radio"
        accessibilityState={{ selected }}
        className={`rounded-xl border p-3 ${selected ? 'border-honey-500 bg-honey-50' : 'border-gray-200 bg-white'}`}
      >
        <View className="flex-row items-start">
          <View className={`mr-3 mt-0.5 h-5 w-5 items-center justify-center rounded-full border-2 ${selected ? 'border-honey-600' : 'border-gray-300'}`}>
            {selected ? <View className="h-2.5 w-2.5 rounded-full bg-honey-600" /> : null}
          </View>
          <View className="flex-1">
            <Text className="font-semibold text-gray-800">{label}</Text>
            <Text className="mt-0.5 text-sm leading-5 text-gray-600">{help}</Text>
          </View>
        </View>
      </Pressable>
    );
  };

  return (
    <View className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
      <Text className="text-base font-semibold text-amber-950">Fix it right here</Text>
      <Text className="mt-1 text-sm leading-5 text-amber-900">
        Your choice updates the meeting record{linkedDuty ? ' and the real to-do together' : ''}.
      </Text>

      <View className="mt-3" style={{ gap: 8 }} accessibilityRole="radiogroup">
        {linkedDuty ? (
          <>
            {option('keep_owner', `Keep ${currentOwner} as owner`, 'Confirm that the current to-do is already correct.')}
            {option('reassign', 'Assign someone else', 'Move the real duty to the person the room intended.')}
            {option('remove', 'Remove this duty', 'Retire the mistaken or stale to-do without deleting its history.')}
          </>
        ) : (
          option('clarify', 'Record the corrected version', 'Your human-reviewed wording becomes the trusted record.')
        )}
      </View>

      {choice === 'reassign' ? (
        <View className="mt-4">
          <Text className="mb-2 text-sm font-semibold text-gray-700">Who owns it?</Text>
          <View className="flex-row flex-wrap" style={{ gap: 8 }}>
            {members
              .filter((member) => member.id !== review.current_owner_id)
              .map((member) => {
                const selected = member.id === newOwnerId;
                return (
                  <Pressable
                    key={member.id}
                    onPress={() => setNewOwnerId(member.id)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    className={`rounded-full border px-3 py-2 ${selected ? 'border-honey-600 bg-honey-100' : 'border-gray-300 bg-white'}`}
                  >
                    <Text className={selected ? 'font-semibold text-honey-900' : 'text-gray-700'}>
                      {firstName(member.name)}
                    </Text>
                  </Pressable>
                );
              })}
          </View>
        </View>
      ) : null}

      <View className="mt-4">
        <Text className="mb-2 text-sm font-semibold text-gray-700">
          {choice === 'clarify' ? 'Corrected record' : 'What did you confirm? (optional)'}
        </Text>
        <TextInput
          value={note}
          onChangeText={setNote}
          multiline
          placeholder={choice === 'clarify' ? 'Write what the record should say…' : 'Add a short note for the history…'}
          accessibilityLabel={choice === 'clarify' ? 'Corrected meeting record' : 'Resolution note'}
          className="min-h-20 rounded-xl border border-gray-300 bg-white px-3 py-3 text-gray-800"
          textAlignVertical="top"
        />
      </View>

      <View className="mt-4 flex-row" style={{ gap: 10 }}>
        <Pressable
          onPress={() => setOpen(false)}
          disabled={saving}
          accessibilityRole="button"
          className="rounded-lg border border-gray-300 bg-white px-4 py-2.5"
        >
          <Text className="font-semibold text-gray-700">Cancel</Text>
        </Pressable>
        <Pressable
          onPress={() => onResolve({
            resolution: choice,
            newOwnerId: choice === 'reassign' ? newOwnerId : undefined,
            note: note.trim() || undefined,
          })}
          disabled={!canSave}
          accessibilityRole="button"
          accessibilityState={{ disabled: !canSave }}
          className={`rounded-lg bg-honey-600 px-4 py-2.5 ${canSave ? 'active:bg-honey-700' : 'opacity-40'}`}
        >
          <Text className="font-semibold text-white">{saving ? 'Saving…' : 'Save review'}</Text>
        </Pressable>
      </View>
    </View>
  );
}
