import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { clearDraft, getDraft, getDraftAsync, setDraft } from '../draftStore';

export function usePersistentTextDraft(key: string | null | undefined, initialValue = '') {
  const normalizedKey = useMemo(() => key || null, [key]);
  const activeKeyRef = useRef(normalizedKey);
  const [value, setLocalValue] = useState(() => (
    normalizedKey ? getDraft(normalizedKey) || initialValue : initialValue
  ));

  useEffect(() => {
    let cancelled = false;
    activeKeyRef.current = normalizedKey;

    if (!normalizedKey) {
      setLocalValue(initialValue);
      return () => {
        cancelled = true;
      };
    }

    const syncDraft = getDraft(normalizedKey);
    setLocalValue(syncDraft || initialValue);

    getDraftAsync(normalizedKey).then((asyncDraft) => {
      if (!cancelled && activeKeyRef.current === normalizedKey && asyncDraft) {
        setLocalValue(asyncDraft);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [initialValue, normalizedKey]);

  const setValue = useCallback((nextValue: string | ((previousValue: string) => string)) => {
    setLocalValue((previousValue) => {
      const resolvedValue = typeof nextValue === 'function'
        ? nextValue(previousValue)
        : nextValue;

      if (normalizedKey) {
        setDraft(normalizedKey, resolvedValue);
      }

      return resolvedValue;
    });
  }, [normalizedKey]);

  const clearValue = useCallback(() => {
    if (normalizedKey) {
      clearDraft(normalizedKey);
    }

    setLocalValue(initialValue);
  }, [initialValue, normalizedKey]);

  return [value, setValue, clearValue] as const;
}
