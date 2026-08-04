import { Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { usePageSkin } from '../../lib/pageSkin';
import { VoiceMicButton } from './VoiceMicButton';
import { useDictation } from '../../lib/hooks/useDictation';

/**
 * A mic under a text box. One line to add, and it looks the same everywhere.
 *
 * Nat, 2026-08-04: *"we want a uniform experience, so all text boxes behave the
 * same way."* The app had a hundred text inputs and about ten different answers
 * to that — some with a mic, most without, and the few that had one had each
 * been styled by hand where it happened to be added.
 *
 * So the mic, its label and its spacing live here rather than at every call
 * site, and adding one to a new box is a single line that cannot drift:
 *
 *   <DictationRow setValue={setBio} />
 *
 * `setValue` takes an UPDATER, because dictation has to read the previous text
 * to append to it. For a plain `useState` setter, pass it straight in. For a box
 * whose value lives inside an object or a keyed map, adapt at the call site:
 *
 *   <DictationRow setValue={(u) => setForm((f) => ({ ...f, note: u(f.note) }))} />
 *
 * It renders nothing at all where speech recognition is unavailable — today,
 * anything that is not a browser — because `VoiceMicButton` bows out on its own.
 * On a phone the keyboard has its own dictation key an inch below, so an inert
 * button here would be the worse answer.
 */
export function DictationRow({
  setValue,
  label = 'Talk instead of typing',
  size = 20,
  align = 'left',
  style,
}: {
  setValue: (updater: (prev: string) => string) => void;
  /** Pass null to show the mic with no words beside it. */
  label?: string | null;
  size?: number;
  align?: 'left' | 'right';
  style?: StyleProp<ViewStyle>;
}) {
  const skin = usePageSkin();
  const dictation = useDictation(setValue);

  return (
    <View
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          marginTop: 8,
          justifyContent: align === 'right' ? 'flex-end' : 'flex-start',
        },
        style,
      ]}
    >
      <VoiceMicButton
        size={size}
        onTranscript={dictation.onTranscript}
        onInterimTranscript={dictation.onInterimTranscript}
      />
      {label ? (
        <Text
          style={{
            fontFamily: 'Lato_400Regular',
            fontSize: 13,
            color: skin.inkFaint,
            flexShrink: 1,
          }}
        >
          {label}
        </Text>
      ) : null}
    </View>
  );
}
