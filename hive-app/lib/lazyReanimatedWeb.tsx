/**
 * react-native-reanimated, as the web build ships it.
 *
 * The real library is 707KB of the 4MB web script — 18% of everything a member
 * downloads on a cold load — and the only thing HIVE animates with it is
 * Clive's conversation drawer sliding in and its backdrop fading: two numbers,
 * measured 2026-08-12 (components/chat/ConversationSidebar.tsx is the one
 * importer on the web side; react-native-screens and NativeWind's css-interop
 * only reach for reanimated in their native code paths).
 *
 * So metro.config.js hands the web bundle this file instead. iOS keeps the
 * real library — worklets run on the UI thread there and earn their weight.
 * On web there is no UI thread to hop to anyway: the real reanimated already
 * runs these animations in plain JavaScript, which is exactly what this does,
 * in a few hundred lines instead of seven hundred kilobytes.
 *
 * WHAT IS COVERED: shared values, useAnimatedStyle, useDerivedValue, timing
 * and spring animations (spring approximated as an eased tween — the drawer
 * uses a stiff, non-bouncy spring, so the difference is not visible), delay,
 * completion callbacks, cancelAnimation, runOnJS/runOnUI, interpolate, and
 * the Animated.* component wrappers.
 *
 * WHAT IS NOT: entering/exiting layout animations, gesture-driven worklets,
 * useAnimatedScrollHandler, animated props. TypeScript will NOT catch a new
 * use of those — the compiler still reads the real library's types — so a
 * screen using them would work on iOS and fail on web at runtime. If a screen
 * genuinely needs one of them, add it here on purpose; the price of extending
 * this file is minutes, and the price of un-shimming the library is 700KB on
 * every member's cold load.
 */
import { useEffect, useReducer, useRef, useState } from 'react';
import { View, Text, Image, ScrollView, FlatList } from 'react-native';
import type { ComponentType } from 'react';

type Listener = () => void;

// While a useAnimatedStyle/useDerivedValue factory runs, every shared value it
// reads adds itself here, so the hook knows exactly which values to watch.
// Same trick the real library's web build uses, minus the Babel plugin.
let activeTracker: Set<HiveSharedValue> | null = null;

type AnimationRequest = {
  __hiveWebAnimation: true;
  target: unknown;
  durationMs: number;
  delayMs: number;
  easing: (t: number) => number;
  onDone?: (finished?: boolean) => void;
};

function isAnimationRequest(value: unknown): value is AnimationRequest {
  return !!value && typeof value === 'object' && (value as AnimationRequest).__hiveWebAnimation === true;
}

// Ease-out cubic: fast start, gentle landing. Standing in for reanimated's
// spring solver because every spring in the app today (the drawer's
// damping 20 / stiffness 200 / mass 0.5) settles without a visible bounce.
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
const linear = (t: number) => t;

class HiveSharedValue<T = unknown> {
  private _value: T;
  private listeners = new Set<Listener>();
  private frame: number | null = null;

  constructor(initial: T) {
    this._value = initial;
  }

  get value(): T {
    if (activeTracker) activeTracker.add(this as HiveSharedValue);
    return this._value;
  }

  set value(next: T) {
    if (isAnimationRequest(next)) {
      this.animateTo(next);
      return;
    }
    this.stop();
    this.write(next);
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  stop(): void {
    if (this.frame !== null && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(this.frame);
    }
    this.frame = null;
  }

  private write(next: T): void {
    if (Object.is(this._value, next)) return;
    this._value = next;
    this.listeners.forEach((listener) => listener());
  }

  private animateTo(request: AnimationRequest): void {
    this.stop();
    const from = this._value;
    const to = request.target as T;

    // Only numbers can tween. Anything else — and any environment without
    // animation frames — lands on the target immediately, which is the same
    // place the animation would have ended.
    if (
      typeof from !== 'number' ||
      typeof to !== 'number' ||
      typeof requestAnimationFrame !== 'function'
    ) {
      this.write(to);
      request.onDone?.(true);
      return;
    }

    const start = performance.now() + request.delayMs;
    const step = (now: number) => {
      if (now < start) {
        this.frame = requestAnimationFrame(step);
        return;
      }
      const t = request.durationMs <= 0 ? 1 : Math.min(1, (now - start) / request.durationMs);
      this.write((from + (to - from) * request.easing(t)) as T);
      if (t < 1) {
        this.frame = requestAnimationFrame(step);
      } else {
        this.frame = null;
        request.onDone?.(true);
      }
    };
    this.frame = requestAnimationFrame(step);
  }
}

export type SharedValue<T> = { value: T };

export function useSharedValue<T>(initial: T): SharedValue<T> {
  const [sv] = useState(() => new HiveSharedValue<T>(initial));
  return sv as SharedValue<T>;
}

/**
 * Re-runs the factory whenever a shared value it read last time changes.
 * Re-subscribes after every render on purpose: the factory is a fresh closure
 * each render (the drawer's reads its current width), and watching last
 * render's reads is how animations go stale.
 */
export function useAnimatedStyle<S>(factory: () => S, _deps?: unknown[]): S {
  const [, force] = useReducer((c: number) => c + 1, 0);

  const tracked = new Set<HiveSharedValue>();
  const before = activeTracker;
  activeTracker = tracked;
  let style: S;
  try {
    style = factory();
  } finally {
    activeTracker = before;
  }

  const trackedRef = useRef(tracked);
  trackedRef.current = tracked;
  useEffect(() => {
    const unsubscribes = Array.from(trackedRef.current).map((sv) => sv.subscribe(force));
    return () => unsubscribes.forEach((unsubscribe) => unsubscribe());
  });

  return style;
}

export function useDerivedValue<T>(factory: () => T, _deps?: unknown[]): SharedValue<T> {
  const [sv] = useState(() => new HiveSharedValue<T>(undefined as T));
  // Reuses useAnimatedStyle's tracking: the factory's answer is the "style".
  const next = useAnimatedStyle(factory);
  (sv as HiveSharedValue<T>).value = next;
  return sv as SharedValue<T>;
}

type TimingConfig = { duration?: number; easing?: (t: number) => number };

export function withTiming(
  target: unknown,
  config?: TimingConfig,
  onDone?: (finished?: boolean) => void
): never {
  return {
    __hiveWebAnimation: true,
    target,
    durationMs: config?.duration ?? 300,
    delayMs: 0,
    easing: config?.easing ?? easeOutCubic,
    onDone,
  } as never;
}

export function withSpring(
  target: unknown,
  _config?: unknown,
  onDone?: (finished?: boolean) => void
): never {
  return {
    __hiveWebAnimation: true,
    target,
    durationMs: 320,
    delayMs: 0,
    easing: easeOutCubic,
    onDone,
  } as never;
}

export function withDelay(delayMs: number, animation: unknown): never {
  if (isAnimationRequest(animation)) {
    return { ...animation, delayMs } as never;
  }
  return withTiming(animation, { duration: 0 }) as never;
}

export function cancelAnimation(sv: SharedValue<unknown>): void {
  (sv as HiveSharedValue).stop();
}

// No worklet thread on web — both of these are just "call the function".
export function runOnJS<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
  return (...args: A) => fn(...args);
}
export const runOnUI = runOnJS;

export enum Extrapolation {
  IDENTITY = 'identity',
  CLAMP = 'clamp',
  EXTEND = 'extend',
}
// The pre-v3 spelling, still widely typed from muscle memory.
export const Extrapolate = Extrapolation;

/** Piecewise-linear mapping, clamped unless told otherwise — enough for every interpolate in a UI. */
export function interpolate(
  x: number,
  input: readonly number[],
  output: readonly number[],
  extrapolation?: Extrapolation | string | { extrapolateLeft?: string; extrapolateRight?: string }
): number {
  const clamp =
    extrapolation === undefined ||
    extrapolation === Extrapolation.CLAMP ||
    (typeof extrapolation === 'object' && extrapolation !== null);
  // Clamping the INPUT is what reanimated's CLAMP means: past either end of
  // the range, the answer holds at that end's output.
  const clamped = clamp ? Math.min(input[input.length - 1], Math.max(input[0], x)) : x;
  let i = 1;
  while (i < input.length - 1 && clamped > input[i]) i += 1;
  const x0 = input[i - 1];
  const x1 = input[i];
  const y0 = output[i - 1];
  const y1 = output[i];
  const t = x1 === x0 ? 0 : (clamped - x0) / (x1 - x0);
  return y0 + (y1 - y0) * t;
}

// The handful of easings screens actually name. bezier() falls back to
// ease-out rather than solving the curve — close enough for UI moves, and a
// screen that disagrees can add the real solver here when it needs it.
export const Easing = {
  linear,
  ease: easeOutCubic,
  quad: (t: number) => t * t,
  cubic: (t: number) => t * t * t,
  exp: (t: number) => (t === 0 ? 0 : Math.pow(2, 10 * (t - 1))),
  bezier: () => easeOutCubic,
  in: (fn: (t: number) => number) => fn,
  out: (fn: (t: number) => number) => (t: number) => 1 - fn(1 - t),
  inOut: (fn: (t: number) => number) => (t: number) =>
    t < 0.5 ? fn(t * 2) / 2 : 1 - fn((1 - t) * 2) / 2,
};

// On web an "animated" component is an ordinary one — useAnimatedStyle hands
// it a fresh plain style each frame through a normal React render.
export function createAnimatedComponent<P>(component: ComponentType<P>): ComponentType<P> {
  return component;
}

const Animated = {
  View,
  Text,
  Image,
  ScrollView,
  FlatList,
  createAnimatedComponent,
};

export default Animated;
