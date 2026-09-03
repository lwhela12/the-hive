import { useCallback, useEffect, useRef, useState } from 'react';
import { getStoredItemAsync, setStoredItemAsync } from '../webStorage';

/**
 * A panel that opens the way you left it.
 *
 * Nat, 2026-09-02: *"I think it should be however you left it last. I always
 * have to shut the 'what is HIVE-Wide' and I'd like it to remember that
 * choice."*
 *
 * This lives in a hook because the first version did not: the memory was built
 * inside HIVE-Wide's local `TopBox`, and **the panel she named is not a
 * TopBox** — the welcome is `HiveWideWelcome` and the door is
 * `WayIntoYourHive`, both holding their own `useState`. So the one drawer that
 * prompted the whole thing kept springing open on every visit, on any screen
 * wide enough to default it open. Found by an audit the same evening.
 *
 * `fallback` is what a panel does the FIRST time somebody meets it, and only
 * then. Every later visit is whatever they last chose.
 */
export function useRememberedPanel(key: string, fallback = false) {
  const [open, setOpen] = useState(fallback);
  const [remembered, setRemembered] = useState(false);
  /**
   * Whether a person has touched it since this mount.
   *
   * On the web the stored value comes back in a microtask, but native storage
   * is a real round trip — long enough for somebody to shut a panel and have
   * a remembered "open" arrive afterwards and spring it back open under their
   * finger. A tap always wins.
   */
  const tapped = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void getStoredItemAsync(key).then((was) => {
      if (cancelled || tapped.current) { setRemembered(true); return; }
      // Both answers are honoured — a stored "shut" has to beat a `fallback`
      // of open, which is the whole of Nat's complaint.
      if (was === 'open') setOpen(true);
      else if (was === 'shut') setOpen(false);
      setRemembered(true);
    });
    return () => { cancelled = true; };
  }, [key]);

  const set = useCallback((next: boolean) => {
    tapped.current = true;
    setOpen(next);
    void setStoredItemAsync(key, next ? 'open' : 'shut');
  }, [key]);

  return { open, setOpen: set, remembered };
}
