import { useEffect, useRef } from 'react';
import { View, Platform, StyleSheet } from 'react-native';
import React from 'react';

/**
 * Earth from orbit, sitting along the bottom of the screen.
 *
 * The history is worth keeping, because it explains the shape. Attempt one was a
 * green SVG wireframe ("a giant fail"). Attempt two, a honey wireframe on black
 * — "still not a big beautiful earth, it's a weird, yellow thing with lines"
 * (Nat 2026-08-03). Attempt three painted a real generated planet, ray-traced
 * per pixel, and it was genuinely lovely: continents, clouds, a terminator.
 *
 * And it was the wrong picture. A ball in the middle of the page puts the
 * subject where the words need to go, so every card and every headline had to
 * dodge it, and the ball itself had to shrink until it was a marble. Nat brought
 * two photographs of the real thing shot from the ISS — the planet's edge across
 * the bottom, the atmosphere lit like a wire, city lights underneath, and the
 * whole top of the frame empty and black. That is the picture. It is upscale
 * because it is mostly nothing, and text laid on nothing is easy to read.
 *
 * So the globe is now a limb rather than a disc. The sphere is enormous and
 * almost entirely below the screen; you see the top of the curve, the air glowing
 * along it, and the dark side of the world beneath. Everything above is space, and
 * space belongs to the words.
 *
 * It also ends the two-globes bug for good. That was `putImageData` writing raw
 * device pixels while the halo respected the retina transform, so the planet
 * landed at half size beside its own ghost. Nothing here uses putImageData —
 * it is arcs and gradients, which all obey the same transform.
 */

const isWeb = Platform.OS === 'web';

export const SPACE_BLACK = '#05060B';

/** Cheap value noise. Used to clump the city lights so they read as places. */
function makeNoise(seed: number) {
  const rand = (i: number, j: number) => {
    const n = Math.sin(i * 127.1 + j * 311.7 + seed) * 43758.5453;
    return n - Math.floor(n);
  };
  const smooth = (t: number) => t * t * (3 - 2 * t);
  return (x: number, y: number) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const a = rand(xi, yi), b = rand(xi + 1, yi);
    const c = rand(xi, yi + 1), d = rand(xi + 1, yi + 1);
    const u = smooth(xf), v = smooth(yf);
    return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
  };
}

type Star = { x: number; y: number; r: number; a: number; tw: number };
type Light = { a: number; d: number; s: number; b: number };
type Shooter = { x: number; y: number; vx: number; vy: number; life: number; len: number };

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

    // Admin wears the same sky with the colour drained out of it, so the god
    // view never looks like somewhere you live.
    const slate = hue === 'slate';
    const AIR_CORE = slate ? '255,255,255' : '214,238,255';
    const AIR_MID = slate ? '150,160,175' : '96,170,255';
    const AIR_FAR = slate ? '90,100,115' : '48,104,205';
    const CITY = slate ? '225,228,234' : '255,206,138';
    const SUN = slate ? '255,255,255' : '255,238,206';

    let W = 0, H = 0, raf = 0, t = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let stars: Star[] = [];
    let lights: Light[] = [];
    let shooters: Shooter[] = [];
    let nextShooter = 2.5;

    // Geometry of the limb. The sphere's centre sits far below the bottom edge,
    // so only the very top of a very large circle crosses the screen — that is
    // what makes the curve gentle instead of dome-shaped.
    let R = 0, cx = 0, cy = 0, horizon = 0;

    const noise = makeNoise(19.7);

    function layout() {
      // A wide screen wants a flatter curve; a phone wants the horizon a little
      // lower so there is still room for a title above it.
      R = Math.max(W, 520) * 1.45;
      horizon = H * (W < 520 ? 0.76 : 0.70);
      cx = W * 0.5;
      cy = horizon + R;
    }

    function resize() {
      const parent = canvas.parentElement;
      W = parent ? parent.clientWidth : window.innerWidth;
      H = parent ? parent.clientHeight : window.innerHeight;
      canvas.width = Math.floor(W * dpr);
      canvas.height = Math.floor(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      layout();

      // Stars only in the sky, and never right on the horizon where the air
      // would have washed them out anyway.
      const count = Math.round((W * H) / 5200);
      stars = Array.from({ length: count }, () => {
        const y = Math.pow(Math.random(), 1.35) * horizon;
        return {
          x: Math.random() * W,
          y,
          r: Math.random() < 0.86 ? Math.random() * 0.9 + 0.3 : Math.random() * 1.5 + 1,
          a: 0.22 + Math.random() * 0.6,
          tw: 0.4 + Math.random() * 1.9,
        };
      });

      // City lights, placed on the sphere rather than on the screen: an angle
      // around the limb and a depth away from it. Depth is squared so they
      // crowd toward the horizon the way they do in the photographs.
      lights = [];
      const want = Math.round(W * 0.9);
      for (let i = 0; i < want; i++) {
        const a = (Math.random() - 0.5) * 1.25;
        const d = Math.random();
        // Clumps, so it reads as cities and coastlines instead of static.
        const n = noise(a * 9 + 4, d * 5 + 2);
        if (n < 0.42) continue;
        lights.push({
          a,
          d,
          s: (n - 0.42) * 1.9 + 0.25,
          b: 0.28 + Math.random() * 0.72,
        });
      }
    }

    function drawSky() {
      // Not flat black — space photographs have a faint lift near the planet.
      const g = ctx.createLinearGradient(0, 0, 0, horizon);
      g.addColorStop(0, '#04050A');
      g.addColorStop(0.62, '#05070E');
      g.addColorStop(1, slate ? '#0B0E14' : '#070C18');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, horizon + 2);
    }

    function drawStars() {
      for (const s of stars) {
        const tw = reduce ? 1 : 0.72 + 0.28 * Math.sin(t * s.tw + s.x);
        ctx.globalAlpha = s.a * tw;
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    function drawShooters(dt: number) {
      if (reduce) return;
      nextShooter -= dt;
      if (nextShooter <= 0) {
        // Rare, and always up in the empty part of the sky. One at a time —
        // a shower would be a screensaver, and this is a page you read.
        nextShooter = 5 + Math.random() * 11;
        const fromLeft = Math.random() < 0.5;
        const speed = 460 + Math.random() * 320;
        const ang = (fromLeft ? 0.34 : Math.PI - 0.34) + (Math.random() - 0.5) * 0.16;
        shooters.push({
          x: fromLeft ? -60 : W + 60,
          y: Math.random() * horizon * 0.5,
          vx: Math.cos(ang) * speed,
          vy: Math.sin(ang) * speed * 0.55,
          life: 1,
          len: 70 + Math.random() * 90,
        });
      }

      shooters = shooters.filter((s) => s.life > 0);
      for (const s of shooters) {
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        s.life -= dt * 0.62;
        const nx = s.vx, ny = s.vy;
        const m = Math.hypot(nx, ny) || 1;
        const tail = ctx.createLinearGradient(
          s.x, s.y, s.x - (nx / m) * s.len, s.y - (ny / m) * s.len,
        );
        const a = Math.max(0, Math.min(1, s.life)) * 0.9;
        tail.addColorStop(0, `rgba(255,255,255,${a})`);
        tail.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.strokeStyle = tail;
        ctx.lineWidth = 1.6;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(s.x - (nx / m) * s.len, s.y - (ny / m) * s.len);
        ctx.stroke();
      }
    }

    /** The dark body of the planet, below the curve. */
    function drawEarth() {
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.clip();

      const g = ctx.createLinearGradient(0, horizon, 0, H);
      g.addColorStop(0, slate ? '#131820' : '#0A1424');
      g.addColorStop(0.5, slate ? '#0B0E13' : '#050B16');
      g.addColorStop(1, '#03050A');
      ctx.fillStyle = g;
      ctx.fillRect(0, horizon - 2, W, H - horizon + 4);

      // City lights. Each sits at (angle, depth) on the sphere and gets flattened
      // toward the limb, which is the whole reason they look like they are on a
      // curved surface rather than scattered on glass.
      ctx.globalCompositeOperation = 'lighter';
      for (const l of lights) {
        const rr = R - l.d * l.d * R * 0.30;
        const x = cx + Math.sin(l.a) * rr;
        const y = cy - Math.cos(l.a) * rr;
        if (y > H + 8 || y < horizon - 8) continue;
        const tw = reduce ? 1 : 0.82 + 0.18 * Math.sin(t * 1.7 + l.a * 40 + l.d * 12);
        // Distant lights are dimmer and smaller: haze, and less of them per pixel.
        const fade = 1 - l.d * 0.55;
        const size = (0.6 + l.s * 1.5) * fade;
        const alpha = l.b * fade * 0.85 * tw;

        const glow = ctx.createRadialGradient(x, y, 0, x, y, size * 4.2);
        glow.addColorStop(0, `rgba(${CITY},${alpha})`);
        glow.addColorStop(0.4, `rgba(${CITY},${alpha * 0.28})`);
        glow.addColorStop(1, `rgba(${CITY},0)`);
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(x, y, size * 4.2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.restore();
    }

    /**
     * The air. This is the thing that makes the photograph a photograph: a hard
     * bright wire exactly on the edge, going blue and then to nothing over a
     * surprisingly short distance.
     */
    function drawAtmosphere() {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';

      const outer = R * 1.055;
      const air = ctx.createRadialGradient(cx, cy, R * 0.995, cx, cy, outer);
      air.addColorStop(0, `rgba(${AIR_CORE},0.92)`);
      air.addColorStop(0.06, `rgba(${AIR_CORE},0.55)`);
      air.addColorStop(0.22, `rgba(${AIR_MID},0.30)`);
      air.addColorStop(0.55, `rgba(${AIR_FAR},0.12)`);
      air.addColorStop(1, `rgba(${AIR_FAR},0)`);
      ctx.fillStyle = air;
      ctx.beginPath();
      ctx.arc(cx, cy, outer, 0, Math.PI * 2);
      ctx.fill();

      // A sun just out of frame, low and to one side. Without it the limb is
      // evenly lit all the way across, which never happens and reads as fake.
      const sx = cx - W * 0.30;
      const sy = horizon - H * 0.015;
      const sunR = Math.max(W, H) * 0.34;
      const sun = ctx.createRadialGradient(sx, sy, 0, sx, sy, sunR);
      sun.addColorStop(0, `rgba(${SUN},0.30)`);
      sun.addColorStop(0.25, `rgba(${SUN},0.10)`);
      sun.addColorStop(1, `rgba(${SUN},0)`);
      ctx.fillStyle = sun;
      ctx.beginPath();
      ctx.arc(sx, sy, sunR, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();

      // And the edge itself, drawn as a line so it stays crisp at any size.
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = `rgba(${AIR_CORE},0.5)`;
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.arc(cx, cy, R, -Math.PI / 2 - 0.9, -Math.PI / 2 + 0.9);
      ctx.stroke();
      ctx.restore();
    }

    let last = performance.now();
    function frame(now: number) {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      t += dt;

      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = SPACE_BLACK;
      ctx.fillRect(0, 0, W, H);

      drawSky();
      drawStars();
      drawShooters(dt);
      drawEarth();
      drawAtmosphere();

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
