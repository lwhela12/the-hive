import { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable } from 'react-native';
import { supabase } from '../../lib/supabase';
import { showAlert } from '../../lib/showAlert';

/**
 * Who is Speaker A?
 *
 * AssemblyAI splits a recording by VOICE, so a HIVE around one laptop comes
 * back as "Speaker A", "Speaker B", "Speaker C". Nat, 2026-08-19: *"Speaker A,
 * Speaker B, Speaker C is totally fine. It'd be cool if I could go in and label
 * that."*
 *
 * Her own plan for making it quick is the roll call the room already does at
 * the top of a meeting — *"hi, I'm Natalie ... and the next person will say,
 * I'm so-and-so"* — so this reads the first minute of the transcript, finds
 * anybody introducing themselves, matches the name against the HIVE's member
 * list, and offers it. The offer sits in the box marked as a suggestion. A
 * person presses Save; a guess never saves itself.
 *
 * The names live in `meetings.speaker_names` (migration 188) as
 * `{"A": "Nat", "B": "Charlee"}`. `transcript_raw` is left exactly as the
 * machine heard it, so a wrong name is one word to fix rather than a document
 * to redo.
 */

/** The transcript's own label mapped to the person's name — `{ A: 'Nat' }`. */
export type SpeakerNameMap = Record<string, string>;

/** Only the two fields this component needs from a member. */
export type SpeakerMember = { id: string; name?: string | null };

/**
 * A transcript line that came back labelled by voice.
 *
 * Lines from the Daily call already carry a real name ("Lucas Whelan: …"), so
 * only the "Speaker X" shape is treated as a voice waiting to be named.
 */
const SPEAKER_LINE = /^Speaker\s+([A-Za-z0-9]+)\s*:\s*(.*)$/;

/** Every distinct voice in a transcript, in the order they first speak. */
export function speakerLabelsIn(lines: string[]): string[] {
  const seen: string[] = [];
  for (const line of lines) {
    const match = line.match(SPEAKER_LINE);
    if (match && !seen.includes(match[1])) seen.push(match[1]);
  }
  return seen;
}

/**
 * One transcript line, with the real name on it wherever we know one.
 *
 * Anything we have no name for keeps the label it arrived with, so the line
 * still reads as a line rather than losing its speaker altogether.
 */
export function transcriptLineWithNames(line: string, names: SpeakerNameMap): string {
  const match = line.match(SPEAKER_LINE);
  if (!match) return line;
  const name = names[match[1]]?.trim();
  return name ? `${name}: ${match[2]}` : line;
}

/** The first thing each voice says, for telling one from another. */
function sampleLines(lines: string[]): Record<string, string> {
  const samples: Record<string, string> = {};
  for (const line of lines) {
    const match = line.match(SPEAKER_LINE);
    if (!match) continue;
    const [, label, text] = match;
    const spoken = text.trim();
    // The best sample is the first one long enough to recognise a person by.
    // A transcript often opens with "Yeah." or "Mm-hmm," which tells you
    // nothing, so keep looking until somebody says a sentence.
    if (spoken.length >= 25) {
      if (!samples[label] || samples[label].length < 25) samples[label] = spoken;
    } else if (!samples[label]) {
      samples[label] = spoken;
    }
  }
  return samples;
}

const shorten = (text: string, limit = 140) =>
  text.length <= limit ? text : `${text.slice(0, limit).trimEnd()}…`;

/**
 * How much of the transcript counts as the roll call.
 *
 * Names come out in the first minute, and a word like "I'm Nat" said in hour
 * two is somebody talking ABOUT Nat far more often than it is Nat arriving.
 */
const ROLL_CALL_CHARS = 2000;

/**
 * "hi, I'm Natalie" — the ways a person says their own name out loud.
 *
 * Both apostrophes are in every pattern on purpose: a phone, a laptop and a
 * transcription service disagree about which one they type, and a straight-only
 * pattern quietly matches none of the curly ones.
 */
const SELF_INTRO_PATTERNS = [
  /\bmy name is\s+([A-Za-z][A-Za-z'’-]*)/gi,
  /\bmy name['’]s\s+([A-Za-z][A-Za-z'’-]*)/gi,
  /\bi am\s+([A-Za-z][A-Za-z'’-]*)/gi,
  /\bi['’]m\s+([A-Za-z][A-Za-z'’-]*)/gi,
  /\bthis is\s+([A-Za-z][A-Za-z'’-]*)/gi,
];

const plainWord = (word: string) => word.toLowerCase().replace(/[^a-z]/g, '');

/**
 * Does a spoken word name this member?
 *
 * Straight equality is not enough: Nat introduces herself as "Natalie" and is
 * "Nat" everywhere in the app. So a spoken word also counts when it and the
 * member's own word are a prefix of each other, from three letters up — long
 * enough that "Nat" finds "Natalie" and short words do not find each other.
 */
function memberNamedBy(spoken: string, members: SpeakerMember[]): string | null {
  const said = plainWord(spoken);
  if (said.length < 2) return null;

  for (const member of members) {
    const full = (member.name ?? '').trim();
    if (!full) continue;
    for (const word of full.split(/\s+/)) {
      const known = plainWord(word);
      if (!known) continue;
      if (known === said) return full;
      if (known.length >= 3 && said.length >= 3
        && (known.startsWith(said) || said.startsWith(known))) return full;
    }
  }
  return null;
}

/**
 * Read the roll call and guess who each voice is.
 *
 * A guess only survives if the name matches somebody in this HIVE, which is
 * also what keeps "I'm going to share my screen" from naming Speaker B "Going".
 */
export function suggestNamesFromRollCall(
  lines: string[],
  members: SpeakerMember[]
): SpeakerNameMap {
  const suggestions: SpeakerNameMap = {};
  let read = 0;

  for (const line of lines) {
    if (read >= ROLL_CALL_CHARS) break;
    read += line.length;

    const match = line.match(SPEAKER_LINE);
    if (!match) continue;
    const [, label, text] = match;
    if (suggestions[label]) continue;

    for (const pattern of SELF_INTRO_PATTERNS) {
      pattern.lastIndex = 0;
      let found: RegExpExecArray | null;
      while ((found = pattern.exec(text)) !== null) {
        const name = memberNamedBy(found[1], members);
        // One name per voice, and one voice per name — two people cannot both
        // be Charlee, and the second match is the one saying somebody else's
        // name rather than their own.
        if (name && !Object.values(suggestions).includes(name)) {
          suggestions[label] = name;
          break;
        }
      }
      if (suggestions[label]) break;
    }
  }

  return suggestions;
}

interface SpeakerNamesProps {
  meetingId: string;
  /** The transcript, already split into non-empty lines. */
  lines: string[];
  /** Everyone in this HIVE, for matching the roll call and offering names. */
  members: SpeakerMember[];
  /** What is stored on the meeting today. */
  names: SpeakerNameMap;
  /** Admins and owners name the voices; everybody else reads them. */
  canEdit: boolean;
  onSaved: (names: SpeakerNameMap) => void;
}

export function SpeakerNames({
  meetingId,
  lines,
  members,
  names,
  canEdit,
  onSaved,
}: SpeakerNamesProps) {
  const labels = useMemo(() => speakerLabelsIn(lines), [lines]);
  const samples = useMemo(() => sampleLines(lines), [lines]);
  const suggestions = useMemo(
    () => suggestNamesFromRollCall(lines, members),
    [lines, members]
  );

  const [drafts, setDrafts] = useState<SpeakerNameMap>({});
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  /**
   * Voices somebody has deliberately left blank and saved that way.
   *
   * Without this, emptying a box and saving it would hand the box straight back
   * the guess it started with, which reads as the app arguing.
   */
  const declined = useRef<Set<string>>(new Set());

  // What is saved wins over what was guessed, and what somebody is typing right
  // now wins over both. The member list arrives a moment after this screen
  // does, so a suggestion can land while a person is already typing — it fills
  // empty boxes only.
  useEffect(() => {
    setDrafts((current) => {
      const next: SpeakerNameMap = {};
      for (const label of labels) {
        const typed = current[label];
        if (typed) { next[label] = typed; continue; }
        const saved = names[label]?.trim();
        if (saved) { next[label] = saved; continue; }
        next[label] = declined.current.has(label) ? '' : (suggestions[label] ?? '');
      }
      return next;
    });
  }, [labels, names, suggestions]);

  if (labels.length === 0) return null;

  const isSuggestion = (label: string) =>
    !names[label]?.trim() && !!suggestions[label] && drafts[label] === suggestions[label];

  const anySuggestion = labels.some(isSuggestion);

  const changed = labels.some(
    (label) => (drafts[label] ?? '').trim() !== (names[label]?.trim() ?? '')
  );

  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const kept: SpeakerNameMap = {};
      for (const label of labels) {
        const typed = (drafts[label] ?? '').trim();
        if (typed) {
          kept[label] = typed;
          declined.current.delete(label);
        } else {
          declined.current.add(label);
        }
      }
      // Names for voices from an older version of this transcript stay put.
      // Re-transcribing can change how many voices there are, and dropping a
      // name because today's split is shorter would lose somebody's work.
      const merged: SpeakerNameMap = { ...names, ...kept };
      for (const label of labels) {
        if (!kept[label]) delete merged[label];
      }

      const { error } = await supabase
        .from('meetings')
        .update({ speaker_names: merged })
        .eq('id', meetingId);
      if (error) throw error;

      onSaved(merged);
      setJustSaved(true);
    } catch (error) {
      console.error('Error saving speaker names:', error);
      showAlert('Names not saved', 'Those names could not be saved just now. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View className="mb-4 bg-honey-50 border border-honey-200 rounded-xl p-4">
      <Text className="text-honey-900 font-semibold">Who was speaking</Text>
      {/* Nat's standing rule: a second sentence never starts halfway along a
          line. Each one gets its own. */}
      <Text className="text-honey-800 mt-1">
        The recording tells the voices apart and calls them Speaker A, Speaker B and so on.
      </Text>
      <Text className="text-honey-800 mt-1">
        {canEdit
          ? 'Put a name to each one and the transcript below reads with their name on it.'
          : 'A HIVE admin puts the names to them.'}
      </Text>

      {canEdit && anySuggestion && (
        <>
          <Text className="text-honey-700 mt-2">
            Some boxes are filled in already, from the introductions at the top of the meeting.
          </Text>
          <Text className="text-honey-700">
            Check them, change anything that is wrong, then save.
          </Text>
        </>
      )}

      <View className="mt-4 bg-white rounded-xl overflow-hidden border border-honey-100">
        {labels.map((label, index) => {
          const saved = names[label]?.trim();
          return (
            <View
              key={label}
              className={`p-4 ${index > 0 ? 'border-t border-honey-100' : ''}`}
            >
              <Text className="font-medium text-gray-800">Speaker {label}</Text>
              {samples[label] ? (
                <Text className="text-gray-600 mt-1 italic">
                  “{shorten(samples[label])}”
                </Text>
              ) : null}

              {canEdit ? (
                <>
                  {/* A name is a short word, and a mic is no help with one —
                      dictation mangles names more often than it types them.
                      See the mic table in CLAUDE.md. */}
                  <TextInput
                    value={drafts[label] ?? ''}
                    onChangeText={(text) => {
                      // Editing a name means the last save is no longer the
                      // whole story, so the "Saved." note stands down.
                      setJustSaved(false);
                      setDrafts((current) => ({ ...current, [label]: text }));
                    }}
                    placeholder="Their name"
                    placeholderTextColor="#9ca3af"
                    autoCapitalize="words"
                    autoCorrect={false}
                    accessibilityLabel={`Name for Speaker ${label}`}
                    className="mt-3 border border-honey-200 rounded-lg px-3 py-2 text-gray-800"
                  />
                  {isSuggestion(label) && (
                    <>
                      <Text className="text-xs text-honey-700 mt-1">
                        Suggested from the introductions.
                      </Text>
                      <Text className="text-xs text-honey-700">
                        Save it to keep it.
                      </Text>
                    </>
                  )}
                </>
              ) : (
                <Text className="text-gray-700 mt-2">
                  {saved || 'Not named yet'}
                </Text>
              )}
            </View>
          );
        })}
      </View>

      {canEdit && (
        <View className="flex-row items-center flex-wrap gap-3 mt-4">
          <Pressable
            onPress={save}
            disabled={saving || !changed}
            accessibilityRole="button"
            className={`bg-honey-500 px-4 py-3 rounded-lg active:bg-honey-600 ${
              saving || !changed ? 'opacity-60' : ''
            }`}
          >
            <Text className="text-white font-semibold">
              {saving ? 'Saving…' : 'Save names'}
            </Text>
          </Pressable>
          {justSaved && !changed && (
            <Text className="text-honey-800 font-medium">Saved.</Text>
          )}
        </View>
      )}
    </View>
  );
}
