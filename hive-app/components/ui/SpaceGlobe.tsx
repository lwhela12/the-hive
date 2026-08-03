import { useEffect, useRef } from 'react';
import { View, Platform, StyleSheet } from 'react-native';
import React from 'react';

/**
 * Outer space, with a honeycomb world turning in the middle of it.
 *
 * Nat, 2026-08-03: "maybe HIVE-Wide is black, like outer space? Then we can save
 * the green colour for another future HIVE, then it's really really obvious when
 * you're in HIVE-Wide, cos there's no header, it's just part of outer space."
 *
 * Two things follow from that, and both are why this replaced the green band:
 *
 *   The page IS the sky. This fills the whole screen and the content floats over
 *   it on see-through cards, the way savedyouaseatstudios.com does. A band at the
 *   top with a cream page beneath it was a picture OF space; this is space.
 *
 *   Green is free again. It was doing a job — "you are above the HIVEs" — that
 *   black does better and more obviously, which hands green back to whichever
 *   HIVE wants it next.
 *
 * Drawn on canvas for the same reason as the sunrise on the studio site: a
 * sphere needs a terminator, a limb glow, and a graticule that bunches at the
 * edge, and none of those are things you can fake with flat shapes.
 */

const isWeb = Platform.OS === 'web';

export function SpaceGlobe({ hue = 'space' }: { hue?: 'space' | 'slate' }) {
  const canvasRef = useRef<any>(null);

  useEffect(() => {
    if (!isWeb) return;
    const canvas = canvasRef.current;
    if (!canvas || typeof window === 'undefined') return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const reduce =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // The world stays honey-coloured wherever it hangs — it is HIVE's planet,
    // and it should look like HIVE against the dark.
    const GOLD = '246,199,113';
    const HONEY = '223,158,60';
    const RIM = hue === 'slate' ? '150,175,205' : '255,226,166';

    let W = 0, H = 0, raf = 0, spin = 0.35;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let stars: { x: number; y: number; r: number; a: number; tw: number }[] = [];
    let motes: { x: number; y: number; r: number; v: number; drift: number; a: number }[] = [];

    function resize() {
      const rect = canvas.getBoundingClientRect();
      W = Math.max(1, rect.width);
      H = Math.max(1, rect.height);
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      stars = Array.from({ length: Math.round((W * H) / 2600) }, () => ({
        x: Math.random() * W,
        y: Math.random() * H,
        r: Math.random() < 0.88 ? 0.4 + Math.random() * 0.7 : 1.1 + Math.random() * 0.9,
        a: 0.18 + Math.random() * 0.6,
        tw: Math.random() * Math.PI * 2,
      }));
      motes = Array.from({ length: Math.round(W / 34) }, () => ({
        x: Math.random() * W,
        y: Math.random() * H,
        r: 0.6 + Math.random() * 1.5,
        v: 2 + Math.random() * 7,
        drift: (Math.random() - 0.5) * 10,
        a: 0.1 + Math.random() * 0.3,
      }));
    }

    /** A great circle on the sphere, in 3-D, so it crowds at the limb. */
    function circle3d(cx: number, cy: number, R: number, rot: number, meridian: boolean, k: number) {
      const pts: { x: number; y: number; z: number }[] = [];
      const TILT = -0.36;
      for (let i = 0; i <= 96; i++) {
        const t = (i / 96) * Math.PI * 2;
        let x: number, y: number, z: number;
        if (meridian) {
          x = Math.cos(t) * Math.sin(k + rot);
          z = Math.cos(t) * Math.cos(k + rot);
          y = Math.sin(t);
        } else {
          const r = Math.cos(k);
          x = Math.cos(t + rot) * r;
          z = Math.sin(t + rot) * r;
          y = Math.sin(k);
        }
        const y2 = y * Math.cos(TILT) - z * Math.sin(TILT);
        const z2 = y * Math.sin(TILT) + z * Math.cos(TILT);
        pts.push({ x: cx + x * R, y: cy + y2 * R, z: z2 });
      }
      return pts;
    }

    function strokeNearSide(pts: { x: number; y: number; z: number }[], w: number) {
      let started = false;
      for (const p of pts) {
        if (p.z <= 0.02) { started = false; continue; }
        const a = Math.min(1, p.z * 1.7);
        if (!started) { ctx.beginPath(); ctx.moveTo(p.x, p.y); started = true; continue; }
        ctx.strokeStyle = `rgba(${GOLD},${(a * 0.45).toFixed(3)})`;
        ctx.lineWidth = w * (0.45 + a * 0.75);
        ctx.lineTo(p.x, p.y); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(p.x, p.y);
      }
    }

    let last = performance.now();

    function frame(now: number) {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!reduce) spin += dt * 0.055;

      ctx.clearRect(0, 0, W, H);

      for (const s of stars) {
        const tw = reduce ? 1 : 0.72 + 0.28 * Math.sin(now / 1500 + s.tw);
        ctx.fillStyle = `rgba(255,250,240,${(s.a * tw).toFixed(3)})`;
        ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill();
      }

      // Centred, and sized to sit behind the content rather than fight it.
      const cx = W * 0.5;
      const cy = H * 0.44;
      const R = Math.max(120, Math.min(W * 0.3, H * 0.34));

      const halo = ctx.createRadialGradient(cx, cy, R * 0.9, cx, cy, R * 2.4);
      halo.addColorStop(0, `rgba(${RIM},0.17)`);
      halo.addColorStop(0.38, `rgba(${HONEY},0.06)`);
      halo.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = halo; ctx.fillRect(0, 0, W, H);

      const body = ctx.createRadialGradient(cx - R * 0.4, cy - R * 0.44, R * 0.06, cx, cy, R);
      body.addColorStop(0, `rgba(${GOLD},0.40)`);
      body.addColorStop(0.34, `rgba(${HONEY},0.22)`);
      body.addColorStop(0.74, 'rgba(40,28,12,0.55)');
      body.addColorStop(1, 'rgba(6,6,10,0.9)');
      ctx.fillStyle = body;
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();

      ctx.save();
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.clip();
      for (let m = 0; m < 9; m++) strokeNearSide(circle3d(cx, cy, R, spin, true, (m / 9) * Math.PI), 1);
      for (let p = -2; p <= 2; p++) strokeNearSide(circle3d(cx, cy, R, spin, false, (p / 5) * Math.PI * 0.8), 0.85);
      ctx.restore();

      const limb = ctx.createRadialGradient(cx, cy, R * 0.88, cx, cy, R * 1.03);
      limb.addColorStop(0, `rgba(${RIM},0)`);
      limb.addColorStop(0.85, `rgba(${RIM},0.24)`);
      limb.addColorStop(1, `rgba(${GOLD},0.5)`);
      ctx.fillStyle = limb;
      ctx.beginPath(); ctx.arc(cx, cy, R * 1.03, 0, Math.PI * 2); ctx.fill();

      for (const p of motes) {
        if (!reduce) {
          p.y -= p.v * dt;
          p.x += Math.sin(now / 3000 + p.y / 110) * p.drift * dt;
          if (p.y < -6) { p.y = H + 6; p.x = Math.random() * W; }
        }
        ctx.fillStyle = `rgba(${GOLD},${p.a})`;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
      }

      raf = window.requestAnimationFrame(frame);
    }

    resize();
    raf = window.requestAnimationFrame(frame);
    window.addEventListener('resize', resize);
    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, [hue]);

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFillObject, { backgroundColor: SPACE_BLACK }]}>
      {isWeb
        ? React.createElement('canvas', {
            ref: canvasRef,
            style: { position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' },
          })
        : null}
    </View>
  );
}

/** The one black everything above the HIVEs is painted on. */
export const SPACE_BLACK = '#07070C';
