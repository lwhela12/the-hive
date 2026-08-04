import { Image, Pressable, ScrollView, Text, View } from 'react-native';
import { usePageSkin } from '../../lib/pageSkin';
import { AttachmentPicker } from './AttachmentPicker';
import { VoiceMicButton } from './VoiceMicButton';
import { useDictation } from '../../lib/hooks/useDictation';
import type { SelectedImage } from '../../lib/imagePicker';
import type { SelectedFile } from '../../lib/filePicker';

/**
 * The clip and the mic, under a text box. The same two, in the same order,
 * everywhere.
 *
 * Nat's rule, stated as a rule (2026-08-04): *"any and every time we have a text
 * box we always want both of those"* — and then, when it turned out the app had
 * ten different ideas about this: *"we want a uniform experience, so all text
 * boxes behave the same way."*
 *
 * Which boxes get what, and why it is not literally every box:
 *
 *   PROSE — a reply, a post, a wish, a bio, a note. Clip AND mic. This is
 *   anywhere somebody writes something for another person to read, and it is
 *   almost exactly the set of boxes marked `multiline`.
 *
 *   SHORT WORDS — a title, a skill, a fun fact, a search. Mic only. Talking is
 *   still faster than typing; attaching a photograph to a thread title is not a
 *   thing anybody wants to do. Pass `attach={false}`.
 *
 *   STRUCTURED — a time, an amount of money, an email address, a URL, an emoji.
 *   Neither. Dictating "seven thirty PM" into a field that wants `7:30 PM` makes
 *   more work, not less, and these are the boxes where being wrong is expensive.
 *   Do not put this component there.
 *
 * The mic disappears by itself where speech recognition is unavailable (today:
 * anything that is not a browser), so a screen never has to ask.
 */
export function ComposerTools({
  setValue,
  attach = true,
  selectedImages,
  onImagesChange,
  selectedFiles,
  onFilesChange,
  hint,
  disabled = false,
  compactHint = false,
}: {
  /** The box's setState. Must accept an updater — dictation reads the previous value. */
  setValue: (updater: (prev: string) => string) => void;
  /** False for short-word boxes: mic, no clip. */
  attach?: boolean;
  selectedImages?: SelectedImage[];
  onImagesChange?: (images: SelectedImage[]) => void;
  selectedFiles?: SelectedFile[];
  onFilesChange?: (files: SelectedFile[]) => void;
  /** Optional line of encouragement beside the buttons. */
  hint?: string;
  disabled?: boolean;
  /** Drops the hint on narrow rows. */
  compactHint?: boolean;
}) {
  const skin = usePageSkin();
  const dictation = useDictation(setValue);

  const images = selectedImages ?? [];
  const files = selectedFiles ?? [];
  const canAttach = attach && !!onImagesChange;
  const hasPicked = images.length > 0 || files.length > 0;

  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        {canAttach ? (
          <AttachmentPicker
            compact
            selectedImages={images}
            onImagesChange={onImagesChange!}
            selectedFiles={files}
            onFilesChange={onFilesChange}
            disabled={disabled}
          />
        ) : null}
        <VoiceMicButton
          size={20}
          onTranscript={dictation.onTranscript}
          onInterimTranscript={dictation.onInterimTranscript}
        />
        {hint && !compactHint ? (
          <Text
            style={{
              fontFamily: 'Lato_400Regular',
              fontSize: 13,
              color: skin.inkFaint,
              marginLeft: 4,
              flexShrink: 1,
            }}
          >
            {hint}
          </Text>
        ) : null}
      </View>

      {/* Previews, so nobody sends a picture they cannot see. */}
      {hasPicked ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ marginTop: 10 }}
          contentContainerStyle={{ gap: 8 }}
        >
          {images.map((image, index) => (
            <View key={image.uri} style={{ position: 'relative' }}>
              <Image
                source={{ uri: image.uri }}
                style={{ width: 84, height: 84, borderRadius: 10, backgroundColor: skin.field }}
                resizeMode="cover"
              />
              <Pressable
                onPress={() => onImagesChange?.(images.filter((_, i) => i !== index))}
                accessibilityRole="button"
                accessibilityLabel="Remove picture"
                style={{
                  position: 'absolute',
                  top: -6,
                  right: -6,
                  width: 22,
                  height: 22,
                  borderRadius: 11,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: '#313130',
                }}
              >
                <Text style={{ color: '#fff', fontSize: 13, lineHeight: 15 }}>×</Text>
              </Pressable>
            </View>
          ))}
          {files.map((file, index) => (
            <Pressable
              key={`${file.uri}-${index}`}
              onPress={() => onFilesChange?.(files.filter((_, i) => i !== index))}
              accessibilityRole="button"
              accessibilityLabel={`Remove ${file.name}`}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 10,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: skin.border,
                backgroundColor: skin.field,
                justifyContent: 'center',
              }}
            >
              <Text
                numberOfLines={1}
                style={{ fontFamily: 'Lato_400Regular', fontSize: 13, color: skin.inkBody, maxWidth: 160 }}
              >
                📎 {file.name}
              </Text>
              <Text style={{ fontFamily: 'Lato_400Regular', fontSize: 11, color: skin.inkFaint }}>
                tap to remove
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}
    </View>
  );
}
