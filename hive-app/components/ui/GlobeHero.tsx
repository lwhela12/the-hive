import { useEffect, useRef } from 'react';
import { View, Text, Platform } from 'react-native';
import React from 'react';

/**
 * HIVE-Wide's hero: a honeycomb world, lit from one side, turning.
 *
 * The first attempt was a pale SVG wireframe at 16% opacity behind a cream page,
 * and Nat called it "a giant fail" — correctly. She pointed at
 * savedyouaseatstudios.com and thenateffect.com, which are canvas pieces with
 * real atmosphere, and asked why this wasn't that.
 *
 * So this is built the way the SYAS sunrise is built: a deep ground to sit
 * against, one canvas, everything painted per frame with real gradients, and
 * depth done with light rather than with outlines. Three things sell a sphere —
 * a terminator (the line between lit and unlit), a limb glow at the edge where
 * atmosphere catches the light, and a graticule whose spacing bunches up toward
 * the edges. All three are here; the wireframe had none of them.
 *
 * Web draws to a real canvas. On native there's no canvas without another
 * dependency, so it renders the still ground and the title, which is a calm
 * fallback rather than a broken one.
 */

const isWeb = Platform.OS === 'web';

export function GlobeHero({
  title,
  subtitle,
  hue = 'green',
  height = 300,
}: {
  title: string;
  subtitle?: string;
  /** green for HIVE-Wide, slate for Admin — the two views above the HIVEs. */
  hue?: 'green' | 'slate';
  height?: number;
}) {
  const canvasRef = useRef<any>(null);

  const ground =
    hue === 'green'
      ? 'linear-gradient(160deg,#0E211A 0%,#16362A 45%,#1E4A36 100%)'
      : 'linear-gradient(160deg,#15171C 0%,#232833 45%,#2E3542 100%)';

  useEffect(() => {
    if (!isWeb) return;
    const canvas = canvasRef.current;
    if (!canvas || typeof window === 'undefined') return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const reduce =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const GOLD = '244,196,110';
    const HONEY = '226,163,66';
    const LIGHT = hue === 'green' ? '138,214,170' : '168,190,220';
    const DEEP = hue === 'green' ? '10,33,26' : '17,20,26';

    let W = 0, H = 0, raf = 0, spin = 0.18;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let motes: { x: number; y: number; r: number; v: number; drift: number; a: number }[] = [];
    let stars: { x: number; y: number; r: number; a: number }[] = [];

    function resize() {
      const rect = canvas.getBoundingClientRect();
      W = Math.max(1, rect.width);
      H = Math.max(1, rect.height);
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Dust rises through the whole band; stars sit still behind everything.
      motes = Array.from({ length: Math.round(W / 26) }, () => ({
        x: Math.random() * W,
        y: Math.random() * H,
        r: 0.6 + Math.random() * 1.7,
        v: 3 + Math.random() * 11,
        drift: (Math.random() - 0.5) * 14,
        a: 0.14 + Math.random() * 0.4,
      }));
      stars = Array.from({ length: Math.round((W * H) / 5200) }, () => ({
        x: Math.random() * W,
        y: Math.random() * H,
        r: Math.random() < 0.86 ? 0.4 + Math.random() * 0.6 : 1 + Math.random() * 0.7,
        a: 0.08 + Math.random() * 0.35,
      }));
    }

    /**
     * One great circle on the sphere, drawn as a real 3-D path so it bunches at
     * the limb the way a globe's lines do. An ellipse can't do that, which is
     * why the first version read as flat rings rather than a ball.
     */
    function circle3d(
      cx: number, cy: number, R: number, rot: number,
      kind: 'meridian' | 'parallel', k: number
    ) {
      const pts: { x: number; y: number; z: number }[] = [];
      const TILT = -0.38; // the pole leans towards us, as on a schoolroom globe
      for (let i = 0; i <= 90; i++) {
        const t = (i / 90) * Math.PI * 2;
        let x: number, y: number, z: number;
        if (kind === 'meridian') {
          x = Math.cos(t) * Math.sin(k + rot);
          z = Math.cos(t) * Math.cos(k + rot);
          y = Math.sin(t);
        } else {
          const r = Math.cos(k);
          x = Math.cos(t + rot) * r;
          z = Math.sin(t + rot) * r;
          y = Math.sin(k);
        }
        // tilt around the x axis
        const y2 = y * Math.cos(TILT) - z * Math.sin(TILT);
        const z2 = y * Math.sin(TILT) + z * Math.cos(TILT);
        pts.push({ x: cx + x * R, y: cy + y2 * R, z: z2 });
      }
      return pts;
    }

    function strokeVisible(pts: { x: number; y: number; z: number }[], colour: string, wBase: number) {
      // Only the near half is drawn, and it fades as it turns away — that's the
      // whole difference between a ball and a wire cage.
      let drawing = false;
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        if (p.z <= 0.02) { drawing = false; continue; }
        const a = Math.min(1, p.z * 1.6);
        if (!drawing) { ctx.beginPath(); ctx.moveTo(p.x, p.y); drawing = true; continue; }
        ctx.strokeStyle = `rgba(${colour},${(a * 0.5).toFixed(3)})`;
        ctx.lineWidth = wBase * (0.5 + a * 0.7);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
        ctx.beginPath(); ctx.moveTo(p.x, p.y);
      }
    }

    let last = performance.now();

    function frame(now: number) {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!reduce) spin += dt * 0.075;

      ctx.clearRect(0, 0, W, H);

      // stars
      for (const s of stars) {
        ctx.fillStyle = `rgba(255,247,230,${s.a})`;
        ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill();
      }

      const cx = W * 0.5;
      const cy = H * 0.56;
      const R = Math.min(H * 0.44, W * 0.28);

      // the atmosphere, well outside the body, so the globe sits IN something
      const halo = ctx.createRadialGradient(cx, cy, R * 0.85, cx, cy, R * 2.1);
      halo.addColorStop(0, `rgba(${LIGHT},0.20)`);
      halo.addColorStop(0.4, `rgba(${HONEY},0.07)`);
      halo.addColorStop(1, `rgba(${DEEP},0)`);
      ctx.fillStyle = halo;
      ctx.fillRect(0, 0, W, H);

      // the body, lit from upper-left so there's a terminator to read
      const body = ctx.createRadialGradient(
        cx - R * 0.42, cy - R * 0.45, R * 0.08,
        cx, cy, R
      );
      body.addColorStop(0, `rgba(${GOLD},0.52)`);
      body.addColorStop(0.32, `rgba(${HONEY},0.30)`);
      body.addColorStop(0.72, `rgba(${LIGHT},0.11)`);
      body.addColorStop(1, `rgba(${DEEP},0.62)`);
      ctx.fillStyle = body;
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();

      // graticule — meridians and parallels, near side only
      ctx.save();
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.clip();
      for (let m = 0; m < 8; m++) {
        strokeVisible(circle3d(cx, cy, R, spin, 'meridian', (m / 8) * Math.PI), GOLD, 1.05);
      }
      for (let p = -2; p <= 2; p++) {
        strokeVisible(circle3d(cx, cy, R, spin, 'parallel', (p / 5) * Math.PI * 0.82), GOLD, 0.9);
      }
      ctx.restore();

      // limb: the bright rim where the atmosphere catches the light
      const limb = ctx.createRadialGradient(cx, cy, R * 0.86, cx, cy, R * 1.02);
      limb.addColorStop(0, `rgba(${LIGHT},0)`);
      limb.addColorStop(0.82, `rgba(${LIGHT},0.30)`);
      limb.addColorStop(1, `rgba(${GOLD},0.55)`);
      ctx.fillStyle = limb;
      ctx.beginPath(); ctx.arc(cx, cy, R * 1.02, 0, Math.PI * 2); ctx.fill();

      // dust, rising
      for (const p of motes) {
        if (!reduce) {
          p.y -= p.v * dt;
          p.x += Math.sin(now / 2600 + p.y / 90) * p.drift * dt;
          if (p.y < -6) { p.y = H + 6; p.x = Math.random() * W; }
        }
        const fade = Math.min(1, Math.min(p.y, H - p.y) / 60);
        ctx.fillStyle = `rgba(${GOLD},${(p.a * fade).toFixed(3)})`;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
      }

      // a soft floor so the band meets the page rather than stopping dead
      const floor = ctx.createLinearGradient(0, H * 0.68, 0, H);
      floor.addColorStop(0, `rgba(${DEEP},0)`);
      floor.addColorStop(1, `rgba(${DEEP},0.85)`);
      ctx.fillStyle = floor;
      ctx.fillRect(0, H * 0.68, W, H * 0.32);

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
    <View style={{ height, backgroundColor: hue === 'green' ? '#0E211A' : '#15171C', overflow: 'hidden' }}>
      {/* react-native-web renders unknown tags straight to the DOM, which is how
          a real canvas gets in here without another dependency. */}
      <View
        style={
          ({ position: 'absolute', inset: 0, backgroundImage: isWeb ? ground : undefined }) as any
        }
      />
      {isWeb
        ? React.createElement('canvas', {
            ref: canvasRef,
            style: { position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' },
          })
        : null}

      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 }}>
        <Text
          style={{
            fontFamily: 'LibreBaskerville_700Bold',
            fontSize: 32,
            letterSpacing: 2,
            color: '#FFF8E9',
            textAlign: 'center',
            textShadowColor: 'rgba(0,0,0,0.45)',
            textShadowOffset: { width: 0, height: 2 },
            textShadowRadius: 14,
          }}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text
            style={{
              fontFamily: 'Lato_400Regular',
              fontSize: 14.5,
              lineHeight: 21,
              color: 'rgba(255,248,233,0.78)',
              textAlign: 'center',
              marginTop: 8,
              maxWidth: 460,
            }}
          >
            {subtitle}
          </Text>
        ) : null}
      </View>
    </View>
  );
}
