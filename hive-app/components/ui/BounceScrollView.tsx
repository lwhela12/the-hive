import { forwardRef, useCallback, useRef } from 'react';
import { Platform, ScrollView, type ScrollViewProps } from 'react-native';

/**
 * The rubber-band at the end of a scroll — the thing that says "that's the
 * bottom" instead of leaving somebody guessing.
 *
 * Nat, twice: *"When i try to scroll and the screen doesnt move, i assume its
 * broken & I try a few more times. We need to have an animation bounce, that
 * shows you're pulling up the bottom of the screen and there's nothing left
 * under there."* (2026-08-06)
 *
 * ## Why this file exists at all
 *
 * The first attempt set `bounces`, `alwaysBounceVertical` and `overScrollMode`
 * on the ScrollViews and stopped there. Those three are real on iOS and Android
 * and react-native-web drops all three on the floor — checked in
 * `node_modules/react-native-web/dist/exports/ScrollView`. Nearly everybody uses
 * HIVE in a browser and Nat tests on an iPhone through Safari, so on the
 * platform that matters those props bought nothing. A short page still refused
 * to move, which is the exact complaint.
 *
 * So the browser bounce is drawn here instead of asked for.
 *
 * ## What it does, per platform
 *
 * - **iOS and Android** — stands aside. The real props go on the real
 *   ScrollView and the system draws its own bounce, including the pull that
 *   drives `RefreshControl`. Drawing a second bounce over the top of the
 *   system's would fight it.
 * - **The browser** — listens for touch and wheel on the scrolling box. When
 *   that box is at an end (or has nothing to scroll at all) and the person keeps
 *   dragging, the content is translated a little in the direction of the drag,
 *   with resistance that grows the further it goes, then springs back when they
 *   let go.
 *
 * ## The two cases in a browser, kept apart on purpose
 *
 * 1. **Nothing to scroll.** The box's content already fits, so the browser will
 *    never rubber-band it — there is nothing to pull against, and
 *    `public/index.html` pins the document with `body { overflow: hidden }` so
 *    the page behind cannot bounce either. This is Nat's case, and here the
 *    bounce below owns the whole gesture. There is no real scrolling to break,
 *    because there is none.
 * 2. **Scrollable, and you have reached the end.** iOS Safari already
 *    rubber-bands an `overflow: auto` box at its ends, and once Safari has taken
 *    a touch for scrolling it stops letting anyone cancel it. So on an iPhone
 *    this case stays the system's. On a desktop browser the wheel is still
 *    cancelable at the end, so the bounce below takes it there — which is where
 *    the browser gives you nothing.
 *
 * ## Pull-to-refresh
 *
 * react-native-web's `RefreshControl` is, in full, a `View` with the refresh
 * props stripped off — it draws nothing and refreshes nothing. So in a browser
 * the downward pull is unowned and the bounce takes it. On iOS the real
 * RefreshControl is real, and this file has already stood aside. If a genuine
 * web pull-to-refresh is ever built, pass `bounceDown={false}` on that screen
 * and the downward pull goes back to it.
 *
 * ## Nested scrollers
 *
 * Before claiming a gesture the handlers walk from whatever was touched up to
 * this box, looking for a scrolling box in between that can still move in the
 * direction of travel. If there is one, the gesture is left alone. Wrap the
 * page's main scroller; leave the little scrolling panels inside it as plain
 * ScrollViews and they keep working.
 *
 * Honours `prefers-reduced-motion` by doing nothing at all.
 */

const isWeb = Platform.OS === 'web';

/**
 * Real on iOS and Android, so they only go on there. `alwaysBounceVertical` is
 * the one that matters: it bounces even when the content already fits.
 */
const NATIVE_BOUNCE_PROPS = {
  bounces: true,
  alwaysBounceVertical: true,
  overScrollMode: 'always',
} as const;

/** The furthest a finger drag can move the content, in points. */
const MAX_PULL_TOUCH = 92;

/**
 * The furthest a wheel or trackpad can move it. Smaller, because a mouse has no
 * finger to follow and a big throw reads as a glitch rather than an edge.
 */
const MAX_PULL_WHEEL = 44;

/** A wheel bounce holds this long after the last wheel event, then springs back. */
const WHEEL_SETTLE_MS = 90;

/** Slightly under critically damped, so it settles rather than snapping flat. */
const SPRING_STIFFNESS = 260;
const SPRING_DAMPING = 29;

/** A drag has to be mostly vertical before it counts, so sideways swipes and
 *  horizontal strips are left alone. */
const VERTICAL_INTENT_PX = 4;

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

/**
 * How far the content actually moves for a given amount of finger travel.
 *
 * Starts one-to-one — the first pixels track the finger exactly, which is what
 * makes it feel attached — then eases off towards `max` and never passes it.
 */
function resist(raw: number, max: number): number {
  const sign = raw < 0 ? -1 : 1;
  return sign * max * (1 - Math.exp(-Math.abs(raw) / max));
}

/** How much of the *next* pixel the content still follows, at this depth. */
function followRate(raw: number, max: number): number {
  return Math.exp(-Math.abs(raw) / max);
}

type BounceOptions = {
  /** Off entirely, right now. Read on every gesture, so a screen can turn it off mid-life. */
  enabled: boolean;
  /** Bounce when pulling the top edge down. Off if a real pull-to-refresh owns it. */
  bounceDown: boolean;
  /** Bounce when pushing past the bottom. */
  bounceUp: boolean;
};

/**
 * Wires the bounce onto one already-rendered scrolling box in the browser.
 * Returns the function that takes it all off again.
 */
function attachEndBounce(scrollNode: HTMLElement, getOptions: () => BounceOptions): () => void {
  // react-native-web renders a ScrollView as a scrolling div wrapping exactly
  // one content div. The content div is what moves — moving the scrolling div
  // itself would drag the clipping edge and the scrollbar along with it.
  const contentNode = scrollNode.firstElementChild as HTMLElement | null;
  if (!contentNode) return () => {};

  let offset = 0;
  let raf = 0;
  let wheelTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * The resting state leaves the DOM exactly as react-native-web wrote it. A
   * transform that is always present would turn the content div into the
   * containing block for anything positioned inside it, so it is written only
   * while the bounce is actually showing and wiped the moment it lands.
   */
  function paint(next: number) {
    offset = next;
    if (next === 0) {
      contentNode!.style.transform = '';
      contentNode!.style.willChange = '';
    } else {
      contentNode!.style.transform = `translate3d(0, ${next.toFixed(2)}px, 0)`;
      contentNode!.style.willChange = 'transform';
    }
  }

  function stopSpring() {
    if (raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
  }

  /** Springs the content home, carrying whatever speed it was released at. */
  function springHome(startVelocity: number) {
    stopSpring();
    if (offset === 0) return;
    let x = offset;
    let v = clamp(startVelocity, -2600, 2600);
    let last = 0;

    const step = (now: number) => {
      if (!last) last = now;
      let remaining = Math.min(now - last, 48);
      last = now;
      // Fixed sub-steps, so a long frame cannot make the spring explode.
      while (remaining > 0) {
        const h = Math.min(remaining, 8) / 1000;
        remaining -= 8;
        const a = -SPRING_STIFFNESS * x - SPRING_DAMPING * v;
        v += a * h;
        x += v * h;
      }
      if (Math.abs(x) < 0.25 && Math.abs(v) < 14) {
        paint(0);
        raf = 0;
        return;
      }
      paint(x);
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  }

  const canScroll = () => scrollNode.scrollHeight > scrollNode.clientHeight + 1;
  const atStart = () => scrollNode.scrollTop <= 0.5;
  const atEnd = () =>
    scrollNode.scrollTop + scrollNode.clientHeight >= scrollNode.scrollHeight - 0.5;

  /**
   * The nearest scrolling box between what was touched and this one, if there is
   * one. `pull` is which way the content is being asked to travel: positive
   * means downwards, the same sense as a finger moving down the screen.
   */
  function innerScrollerInTheWay(target: EventTarget | null, pull: number): boolean {
    let el = target as HTMLElement | null;
    while (el && el !== scrollNode && el.nodeType === 1) {
      if (el.scrollHeight > el.clientHeight + 1) {
        const overflowY = window.getComputedStyle(el).overflowY;
        if (overflowY === 'auto' || overflowY === 'scroll') {
          const room = pull > 0 ? el.scrollTop > 0.5 : el.scrollTop + el.clientHeight < el.scrollHeight - 0.5;
          if (room) return true;
        }
      }
      el = el.parentElement;
    }
    return false;
  }

  // ---- finger ----------------------------------------------------------

  let touchStartY = 0;
  let touchStartX = 0;
  let startScrollTop = 0;
  let lastY = 0;
  let lastT = 0;
  let velocity = 0;
  let claimed = false;
  let pull = 0;

  function endGesture() {
    if (!claimed) return;
    claimed = false;
    springHome(velocity * followRate(pull, MAX_PULL_TOUCH));
    pull = 0;
  }

  function onTouchStart(e: TouchEvent) {
    if (!getOptions().enabled) return;
    if (e.touches.length !== 1) {
      endGesture();
      return;
    }
    stopSpring();
    const t = e.touches[0];
    touchStartY = lastY = t.clientY;
    touchStartX = t.clientX;
    startScrollTop = scrollNode.scrollTop;
    lastT = e.timeStamp || performance.now();
    velocity = 0;
    claimed = false;
    pull = 0;
  }

  function onTouchMove(e: TouchEvent) {
    const opts = getOptions();
    if (!opts.enabled) {
      endGesture();
      return;
    }
    if (e.touches.length !== 1) {
      endGesture();
      return;
    }
    const t = e.touches[0];
    const y = t.clientY;
    const now = e.timeStamp || performance.now();

    const dy = y - touchStartY;
    const dx = t.clientX - touchStartX;
    if (Math.abs(dy) < VERTICAL_INTENT_PX || Math.abs(dy) <= Math.abs(dx)) return;

    if (innerScrollerInTheWay(e.target, dy)) {
      if (claimed) endGesture();
      return;
    }

    // How much of the drag the scrolling box did not absorb. The finger has
    // travelled `dy`; the box has moved `startScrollTop - scrollTop` of that.
    // Whatever is left over is the overscroll, and it comes out right in all
    // three cases — a box with nothing to scroll, a box already at the end when
    // the finger landed, and a box that ran out part-way through the drag.
    const nextPull = dy + scrollNode.scrollTop - startScrollTop;

    if (!claimed) {
      const wantsDown = nextPull > 0 && opts.bounceDown && atStart();
      const wantsUp = nextPull < 0 && opts.bounceUp && atEnd();
      if (!wantsDown && !wantsUp) return;
      // Once a browser has taken a touch for scrolling it stops letting anyone
      // cancel it. If it has, and there is real scrolling to do, leave it be —
      // that is iOS Safari's own rubber-band doing the job.
      if (!e.cancelable && canScroll()) return;
      claimed = true;
      pull = 0;
    }

    // Dragged back through where the bounce started: hand the gesture back so
    // ordinary scrolling picks up again.
    if ((pull > 0 && nextPull <= 0) || (pull < 0 && nextPull >= 0)) {
      claimed = false;
      pull = 0;
      paint(0);
      return;
    }
    pull = nextPull;

    if (e.cancelable) e.preventDefault();

    const dt = now - lastT;
    if (dt > 0) {
      const sample = ((y - lastY) / dt) * 1000;
      // A little smoothing, so one jittery sample does not decide the throw.
      velocity = velocity * 0.6 + sample * 0.4;
    }
    lastY = y;
    lastT = now;

    paint(resist(pull, MAX_PULL_TOUCH));
  }

  // ---- wheel and trackpad ---------------------------------------------

  let wheelPull = 0;
  let lastWheelAt = 0;

  function onWheel(e: WheelEvent) {
    const opts = getOptions();
    if (!opts.enabled) return;
    // deltaMode 1 counts lines and 2 counts pages; both need turning into pixels.
    const raw =
      e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * scrollNode.clientHeight : e.deltaY;
    if (raw === 0 || Math.abs(e.deltaX) > Math.abs(raw)) return;

    // A wheel down (positive) asks the content to travel up, so the pull is the
    // other sign — the same sense a finger would have.
    const pullDirection = -raw;
    if (innerScrollerInTheWay(e.target, pullDirection)) return;

    const wantsDown = pullDirection > 0 && opts.bounceDown && atStart();
    const wantsUp = pullDirection < 0 && opts.bounceUp && atEnd();
    if (!wantsDown && !wantsUp) {
      if (wheelPull !== 0) {
        wheelPull = 0;
        springHome(0);
      }
      return;
    }
    if (!e.cancelable && canScroll()) return;
    if (e.cancelable) e.preventDefault();

    stopSpring();
    const now = e.timeStamp || performance.now();
    // A trackpad keeps firing for about a second after the fingers lift. Letting
    // the pull relax between events means that long tail eases off instead of
    // piling up and pinning the bounce open.
    const elapsed = lastWheelAt ? Math.min(now - lastWheelAt, 400) : 0;
    wheelPull = wheelPull * Math.pow(0.9, elapsed / 16) + pullDirection;
    wheelPull = clamp(wheelPull, -MAX_PULL_WHEEL * 4, MAX_PULL_WHEEL * 4);
    lastWheelAt = now;

    paint(resist(wheelPull, MAX_PULL_WHEEL));

    if (wheelTimer) clearTimeout(wheelTimer);
    wheelTimer = setTimeout(() => {
      wheelTimer = null;
      wheelPull = 0;
      lastWheelAt = 0;
      springHome(0);
    }, WHEEL_SETTLE_MS);
  }

  // Ordinary scrolling never gets prevented, so `passive: false` costs nothing
  // here and is the only way `preventDefault` is allowed to work at the ends.
  scrollNode.addEventListener('touchstart', onTouchStart, { passive: true });
  scrollNode.addEventListener('touchmove', onTouchMove, { passive: false });
  scrollNode.addEventListener('touchend', endGesture, { passive: true });
  scrollNode.addEventListener('touchcancel', endGesture, { passive: true });
  scrollNode.addEventListener('wheel', onWheel, { passive: false });

  return () => {
    scrollNode.removeEventListener('touchstart', onTouchStart);
    scrollNode.removeEventListener('touchmove', onTouchMove);
    scrollNode.removeEventListener('touchend', endGesture);
    scrollNode.removeEventListener('touchcancel', endGesture);
    scrollNode.removeEventListener('wheel', onWheel);
    stopSpring();
    if (wheelTimer) clearTimeout(wheelTimer);
    paint(0);
  };
}

export type EndBounceOptions = {
  /**
   * Off entirely. Read fresh on every gesture, so a screen that hands its
   * scrolling over to something else — the skills garden, say — can turn the
   * bounce off and on again without the listeners being torn down.
   */
  enabled?: boolean;
  /** Bounce when the top edge is pulled down. Default on — see the note about RefreshControl above. */
  bounceDown?: boolean;
  /** Bounce when pushed past the bottom. Default on. */
  bounceUp?: boolean;
};

/**
 * The bounce, as a ref you can hand to anything that scrolls — a ScrollView, a
 * FlatList, a SectionList. Use this when the scroller is not a plain ScrollView;
 * use `BounceScrollView` when it is.
 *
 * ```tsx
 * const bounceRef = useEndBounce();
 * <FlatList ref={bounceRef} ... />
 * ```
 */
export function useEndBounce(options: EndBounceOptions = {}) {
  // The live values are read at gesture time rather than captured, so the ref
  // callback below can stay the same function for the life of the screen. A ref
  // callback that changed identity would tear the listeners down and put them
  // back on every render.
  const latest = useRef(options);
  latest.current = options;

  const detach = useRef<(() => void) | null>(null);

  return useCallback((node: any) => {
    if (detach.current) {
      detach.current();
      detach.current = null;
    }
    if (!isWeb || !node) return;
    if (typeof window === 'undefined') return;

    // Somebody who has asked for less movement gets none of this.
    if (
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      return;
    }

    // ScrollView, FlatList and SectionList all answer `getScrollableNode()` with
    // the actual scrolling element.
    const scrollNode: HTMLElement | null =
      typeof node.getScrollableNode === 'function'
        ? node.getScrollableNode()
        : node.nodeType === 1
          ? node
          : null;
    if (!scrollNode || scrollNode.nodeType !== 1) return;

    // An inverted list — a chat log, where the newest message sits at the
    // bottom — is drawn upside down with `scaleY(-1)` and then each row is
    // flipped back. Translating its content would move the bounce the wrong
    // way, and "at the end" would mean the top. Stand aside rather than draw it
    // backwards, and let the native props handle those on iOS.
    const flipped = window.getComputedStyle?.(scrollNode)?.transform;
    if (flipped && flipped.startsWith('matrix')) {
      const parts = flipped.slice(flipped.indexOf('(') + 1, -1).split(',').map(Number);
      // matrix(a, b, c, d, …) and matrix3d(…, m22 at index 5): d and m22 are
      // the vertical scale, and a negative one means upside down.
      const verticalScale = flipped.startsWith('matrix3d') ? parts[5] : parts[3];
      if (verticalScale < 0) return;
    }

    detach.current = attachEndBounce(scrollNode, () => ({
      enabled: latest.current.enabled !== false,
      bounceDown: latest.current.bounceDown !== false,
      bounceUp: latest.current.bounceUp !== false,
    }));
  }, []);
}

export type BounceScrollViewProps = ScrollViewProps & EndBounceOptions;

/**
 * A ScrollView that tells you when you have reached the end. Drop it in wherever
 * a page's main `ScrollView` is — every other prop is passed straight through.
 */
export const BounceScrollView = forwardRef<ScrollView, BounceScrollViewProps>(
  function BounceScrollView({ enabled, bounceDown, bounceUp, ...rest }, forwardedRef) {
    const bounceRef = useEndBounce({ enabled, bounceDown, bounceUp });

    const setRef = useCallback(
      (node: any) => {
        bounceRef(node);
        if (typeof forwardedRef === 'function') forwardedRef(node);
        else if (forwardedRef) (forwardedRef as any).current = node;
      },
      [bounceRef, forwardedRef]
    );

    return (
      <ScrollView
        ref={setRef}
        // Only on the platforms where they are real, so nothing inert ships to
        // the browser.
        {...(isWeb ? null : NATIVE_BOUNCE_PROPS)}
        {...rest}
      />
    );
  }
);
