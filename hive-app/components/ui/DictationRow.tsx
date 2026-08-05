import { Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { usePageSkin } from '../../lib/pageSkin';
import { VoiceMicButton } from './VoiceMicButton';
import { useDictation } from '../../lib/hooks/useDictation';
import { isDictationSupported } from './ComposerBar';

/**
 * A mic under a text box. The old answer — prefer `ComposerBar` for new work.
 *
 * This is right-aligned but on the wrong AXIS. It welds a strip UNDERNEATH the
 * field, where Clive keeps the mic INSIDE the pill on the text's own line, and
 * Clive's is the one that reads correctly: the mic is something you do to the
 * line you are writing, not a control for the whole form.
 *
 * `components/ui/ComposerBar.tsx` puts it back on the right axis —
 * `variant="form"` draws a labelled prose box with the mic on a footer strip
 * inside the box's own border. Twenty-five screens still call this one, and the
 * mic cannot be moved into their fields from in here (the field is their
 * TextInput, not ours), so this stays until each of those screens moves over.
 * Do not add a new call site.
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
  label = null,
  size = 20,
  align = 'right',
  style,
}: {
  setValue: (updater: (prev: string) => string) => void;
  /**
   * Off by default. Nat, 2026-08-04: "we need a continuity pass, so that
   * attachments, microphone & send are always in the same spot, no matter which
   * screen — see how it is in Clive, that should be the gold standard."
   *
   * In Clive and in Messages the bar reads clip · text · send · MIC, with the
   * mic hard against the right edge and no words on it. A form box had the mic
   * on the LEFT with "Talk instead of typing" beside it, so the one control the
   * app has for talking sat in two different places depending which screen you
   * were on. Right, and wordless, is the one that already exists in the two
   * places people use most. Pass a label only where a box genuinely needs the
   * hint.
   */
  label?: string | null;
  size?: number;
  align?: 'left' | 'right';
  style?: StyleProp<ViewStyle>;
}) {
  const skin = usePageSkin();
  const dictation = useDictation(setValue);

  // On a phone there is no speech recognition, so VoiceMicButton draws nothing —
  // and without this the strip stayed: an empty bordered shelf hanging off the
  // bottom of every box, holding a mic that was not there.
  if (!isDictationSupported() && !label) return null;

  // Tucked onto the bottom of the box it belongs to, rather than floating in
  // the gap below it (Nat 2026-08-04: "this talk instead of typing button
  // should go in a text box").
  //
  // In her screenshot it sat between the description field and the next
  // question, touching neither, so it read as a control for the whole form
  // instead of for the one box above it. It cannot go literally inside the
  // field — a React Native TextInput has no children — so it does the next
  // best thing: it overlaps upward into the field's bottom edge and wears the
  // same hairline, which is enough for the eye to file it as part of the box.
  return (
    <View
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          alignSelf: align === 'right' ? 'flex-end' : 'flex-start',
          justifyContent: align === 'right' ? 'flex-end' : 'flex-start',
          // Pulls up over the field's border so the two touch.
          marginTop: -1,
          marginLeft: align === 'right' ? 0 : 10,
          marginRight: align === 'right' ? 10 : 0,
          paddingHorizontal: 8,
          paddingVertical: 4,
          borderWidth: 1,
          borderTopWidth: 0,
          borderColor: skin.border,
          borderBottomLeftRadius: 12,
          borderBottomRightRadius: 12,
          backgroundColor: skin.field,
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
