import { View, Text, TextInput, type TextInputProps } from 'react-native';

/**
 * The plain field — for the things a person types that are not words.
 *
 * `components/ui/ComposerBar.tsx` is the gold standard for anything somebody
 * COMPOSES: replies, notes, descriptions, wishes, the name of a thing. It puts
 * a microphone inside the box, because a member should be able to talk instead
 * of type anywhere they'd write a sentence.
 *
 * A dollar amount, a date, a time, a number, an email address, a password, a
 * web address or a search box is a different job. Dictating a URL is a joke, so
 * those keep a plain input — but they must look like they came from the same
 * set of controls, or the app reads as a pile of screens rather than one app.
 *
 * That is this file. Same fill, same corner, same hairline, same placeholder
 * ink as ComposerBar's box. Put a field through here instead of hand-styling
 * it, and it can never drift again.
 *
 * Nat, 2026-08-05: *"we want to make sure it looks like that everywhere all the
 * time, in every single place that you can input text, from all screens and all
 * accounts."*
 */

/**
 * The one field look, in numbers, so a field that CANNOT go through `Input`
 * (an emoji box that has to be 44 wide, a cell inside a row) can still wear it.
 *
 * This is the ONE place these numbers are written down. `ComposerBar` reads its
 * hairline, fill, ink and placeholder from here too, so moving a value here
 * moves every box in the app at once. Both files used to declare them
 * separately, which is how a look drifts apart while every comment insists it
 * hasn't (fixed 2026-08-05).
 */
export const FIELD_LOOK = {
  /** A bordered box you type into — ComposerBar's form variant. */
  fill: '#ffffff',
  /** The chat pill's fill. Only the send-a-message bar uses this one. */
  pillFill: '#f6f4e5',
  /** The hairline every field in the app wears. */
  border: 'rgba(189,147,72,0.24)',
  /** Something is wrong with what's in the box. */
  borderError: '#ef4444',
  /** rounded-xl. The chat pill is rounded-2xl; a field is one step softer. */
  radius: 12,
  /** Placeholder ink — muted gold-brown, never grey. */
  placeholder: '#a09274',
  /** What you have typed, and the caret. */
  ink: '#313130',
  font: 'Lato_400Regular',
  labelFont: 'Lato_700Bold',
  paddingHorizontal: 16,
  paddingVertical: 12,
  fontSize: 16,
} as const;

/**
 * The same field, drawn for a page made of night sky.
 *
 * Nat, 2026-08-05, on App Feedback at HIVE-Wide: *"I think this is very pretty,
 * but the white is a little jarring, can we make it match the rest of the form a
 * little more please?"* A white box on black is the brightest thing on the
 * screen, so the empty box outshouted the question above it.
 *
 * Every value has a counterpart rather than a tweak, because a field is a set of
 * decisions that have to agree: light ink needs a dark ground, and a placeholder
 * has to be quieter than the text without disappearing into the page.
 */
export const FIELD_LOOK_DARK = {
  ...FIELD_LOOK,
  fill: 'rgba(255,248,233,0.06)',
  pillFill: 'rgba(255,248,233,0.09)',
  border: 'rgba(255,226,166,0.22)',
  placeholder: 'rgba(255,248,233,0.45)',
  ink: '#FFF8E9',
} as const;

/** Whichever of the two belongs on the page you are on. */
export function fieldLookFor(tone: 'light' | 'dark') {
  return tone === 'dark' ? FIELD_LOOK_DARK : FIELD_LOOK;
}

interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
}

export function Input({ label, error, className, style, multiline, ...props }: InputProps) {
  return (
    <View className="mb-4">
      {label && (
        <Text style={{ fontFamily: FIELD_LOOK.labelFont, color: FIELD_LOOK.ink }} className="mb-2">
          {label}
        </Text>
      )}
      <TextInput
        placeholderTextColor={FIELD_LOOK.placeholder}
        selectionColor={FIELD_LOOK.ink}
        multiline={multiline}
        // A one-line field centres its text; a prose box starts at the top,
        // otherwise the first line floats in the middle of an empty box.
        textAlignVertical={multiline ? 'top' : 'center'}
        className={className}
        style={[
          {
            backgroundColor: FIELD_LOOK.fill,
            borderWidth: 1,
            borderColor: error ? FIELD_LOOK.borderError : FIELD_LOOK.border,
            borderRadius: FIELD_LOOK.radius,
            paddingHorizontal: FIELD_LOOK.paddingHorizontal,
            paddingVertical: FIELD_LOOK.paddingVertical,
            fontSize: FIELD_LOOK.fontSize,
            color: FIELD_LOOK.ink,
            fontFamily: FIELD_LOOK.font,
            // Browsers draw their own focus ring, which sits outside our corner
            // and in the wrong colour.
            outlineStyle: 'none',
            caretColor: FIELD_LOOK.ink,
          } as any,
          style,
        ]}
        {...props}
      />
      {error && (
        <Text style={{ fontFamily: FIELD_LOOK.font }} className="text-red-500 text-sm mt-1">
          {error}
        </Text>
      )}
    </View>
  );
}
