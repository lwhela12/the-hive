import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * 🤏 The bar between the panes of the deck, and you can drag it.
 *
 * Nat, 2026-09-06, looking at the new Where the Honey Goes slide with the
 * outline down one side and the call down the other: *"i'd prob want to drag
 * the outline view smaller, you know, and have more room for the vercel
 * interactive thing."*
 *
 * This is the same bar as Jasmine's Jammin Sprouts' `RoomSplit`, which she
 * asked for on 2026-08-28 and then again on 2026-09-02 for the second edge —
 * *"so each user can adjust accordingly?"* Everything that one learned the hard
 * way is carried here rather than re-learned:
 *
 * **THE SHIELD.** The video is a cross-origin iframe and pointer capture does
 * not survive the pointer crossing into one — the moment a drag passes over
 * Daily's frame, that document takes the pointer and this page stops hearing
 * pointermove. In JJS that showed up as *"once I'm IN the video portion, my
 * slider goes away and I can't adjust any more."* A transparent sheet over the
 * whole window, present only between pointerdown and pointerup, means the
 * pointer never hit-tests into the iframe at all. HIVE's deck has the same
 * Daily iframe in the same place, so it would have the same bug.
 *
 * **IT REMEMBERS, PER DEVICE.** localStorage, because how much outline a person
 * wants is a fact about the screen in front of them, not about the HIVE. The
 * laptop casting to the frame TV and a phone at the same table want different
 * splits. Every read and write is wrapped: a private window or storage switched
 * off gets the default and the deck still opens.
 *
 * **ARROW KEYS TOO.** A separator you can only drag is a separator somebody on
 * a keyboard cannot use at all.
 *
 * Web only, on purpose — the sibling file is a signpost. The deck is a browser
 * thing (`DeckVideo.web.tsx` is too), and a phone has one pane at a time
 * anyway, so there is nothing there to split.
 */
export type DeckSplitProps = {
  /** Current width of the pane this bar sizes, in pixels. */
  width: number;
  /** Hand back the width the drag landed on. The deck holds the state. */
  onResize: (width: number) => void;
  /**
   * Measure from the RIGHT edge, not the left.
   *
   * The video bar sizes the pane BEFORE it, so the pointer's distance from the
   * left is the answer. The outline bar sizes the pane AFTER it, so the same
   * drag has to be read from the other end or the rail grows when you push it
   * away.
   */
  fromEnd?: boolean;
  min: number;
  max: number;
  /** Where this device remembers it. Two bars, two keys. */
  storageKey: string;
  label: string;
  accent: string;
  softBorder: string;
};

export function DeckSplit({
  width, onResize, fromEnd = false, min, max, storageKey, label, accent, softBorder,
}: DeckSplitProps) {
  const handle = useRef<HTMLDivElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const [hovered, setHovered] = useState(false);

  const clamp = useCallback((px: number) => Math.min(max, Math.max(min, px)), [min, max]);

  const apply = useCallback(
    (px: number) => {
      const next = Math.round(clamp(px));
      onResize(next);
      try {
        window.localStorage.setItem(storageKey, String(next));
      } catch {
        // A private window, or site data switched off. The split still works
        // for this sitting; it just starts fresh next time.
      }
    },
    [clamp, onResize, storageKey],
  );

  // The remembered width, put back before anybody looks at it.
  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(storageKey);
    } catch {
      stored = null;
    }
    const px = Number(stored);
    if (Number.isFinite(px) && px > 0) onResize(Math.round(clamp(px)));
    // Once, on mount. Re-running this on every clamp change would fight the drag.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** The row this handle sits inside — the thing the pointer is measured against. */
  const row = useCallback(() => handle.current?.parentElement ?? null, []);

  const moveTo = useCallback(
    (clientX: number) => {
      const el = row();
      if (!el) return;
      const box = el.getBoundingClientRect();
      apply(fromEnd ? box.right - clientX : clientX - box.left);
    },
    [apply, row, fromEnd],
  );

  const shield =
    dragging && typeof document !== 'undefined'
      ? createPortal(
          <div
            aria-hidden="true"
            style={{
              position: 'fixed',
              inset: 0,
              // Above Daily's iframe, and above anything else this app draws.
              zIndex: 2147483000,
              cursor: 'col-resize',
              touchAction: 'none',
            }}
          />,
          document.body,
        )
      : null;

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // Pointer capture, so a thumb that slides off a 12px bar mid-drag keeps
    // dragging instead of dropping the handle.
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    e.preventDefault();
    moveTo(e.clientX);
  };
  const stop = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    setDragging(false);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const grow = e.key === 'ArrowRight';
    const shrink = e.key === 'ArrowLeft';
    if (!grow && !shrink) return;
    e.preventDefault();
    // Grow always means "this pane gets bigger", whichever end it is measured
    // from — an arrow key that shrinks the thing it points at is a bug you find
    // by feel and never quite believe.
    apply(width + (grow !== fromEnd ? 16 : -16));
  };

  const lit = dragging || hovered;

  return (
    <div
      ref={handle}
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={Math.round(width)}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={stop}
      onPointerCancel={stop}
      onKeyDown={onKeyDown}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        // The whole touch target lives inside the bar. An invisible overhang
        // would lie across the edge of Daily's control tray, which is somebody
        // else's interface and uses all four of its corners.
        width: 12,
        alignSelf: 'stretch',
        flex: '0 0 auto',
        cursor: 'col-resize',
        touchAction: 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        outline: 'none',
        background: 'transparent',
      }}
    >
      {/* The grip: quiet until you go near it, so it never competes with a slide. */}
      <span
        aria-hidden="true"
        style={{
          width: lit ? 4 : 2,
          height: lit ? 64 : 34,
          borderRadius: 999,
          background: lit ? accent : softBorder,
          transition: 'all 120ms ease',
        }}
      />
      {shield}
    </div>
  );
}
