import { useCallback, useRef } from 'react';

/**
 * Talking into a text box, in one place.
 *
 * `VoiceMicButton` reports two kinds of thing: interim guesses, which change as
 * you keep talking, and finals, which do not. Showing the interim in the box is
 * what makes dictation feel alive — you can see it hearing you — but it means
 * every guess has to REPLACE the last one rather than pile on top, so the caller
 * has to remember what the box said before the microphone opened.
 *
 * That bookkeeping was written out by hand in `ChatInput` and again in App
 * Feedback, and it has a bug in it both times. The base text is captured when
 * the first interim arrives and then trusted forever — so if you TYPE while the
 * mic is still listening, the next guess rewinds the box to the moment you
 * started talking and throws your typing away.
 *
 * This fixes it by noticing. It remembers the exact string it last wrote; if the
 * value it is handed does not match, somebody else changed it, and the base is
 * taken again from wherever the text actually is now. Type mid-sentence and your
 * words survive — the dictation simply carries on after them.
 *
 * Usage:
 *
 *   const dictation = useDictation(setMessage);
 *   <VoiceMicButton {...dictation} />
 *
 * Call `dictation.reset()` after sending, so the next mic press starts clean.
 */
export function useDictation(setValue: (updater: (prev: string) => string) => void) {
  /** What the box said before the current run of speech started. */
  const baseRef = useRef<string | null>(null);
  /** The exact string we last wrote, so we can tell our own edits from theirs. */
  const lastWrittenRef = useRef<string | null>(null);

  const join = (base: string, spoken: string) => {
    const left = base.replace(/\s+$/, '');
    const right = spoken.trim();
    if (!right) return left;
    return left ? `${left} ${right}` : right;
  };

  const reset = useCallback(() => {
    baseRef.current = null;
    lastWrittenRef.current = null;
  }, []);

  const onInterimTranscript = useCallback(
    (text: string) => {
      // An empty interim means the phrase closed. The next one starts fresh from
      // wherever the text now stands, which by then includes the final.
      if (!text) {
        baseRef.current = null;
        lastWrittenRef.current = null;
        return;
      }

      setValue((prev) => {
        // Either we have never written, or the user has typed since we did.
        // Both mean: whatever is in the box right now is the new base.
        if (baseRef.current === null || prev !== lastWrittenRef.current) {
          baseRef.current = prev;
        }
        const next = join(baseRef.current, text);
        lastWrittenRef.current = next;
        return next;
      });
    },
    [setValue]
  );

  const onTranscript = useCallback(
    (text: string) => {
      const spoken = text.trim();
      if (!spoken) return;

      setValue((prev) => {
        const base = baseRef.current === null || prev !== lastWrittenRef.current ? prev : baseRef.current;
        return join(base, spoken);
      });

      // The phrase is finished and committed. Anything said next is a new one
      // and must build on the text including this.
      baseRef.current = null;
      lastWrittenRef.current = null;
    },
    [setValue]
  );

  return { onTranscript, onInterimTranscript, reset };
}
