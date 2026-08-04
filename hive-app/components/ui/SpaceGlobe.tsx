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
type Land = { a: number; d: number; r: number; warm: number };
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
    // The sunrise, in HIVE's own colours. Nat brought a photograph of the sun
    // cresting Earth's limb — hot gold against black, blue wire of atmosphere
    // along the edge — and said it looks like the logo, which it does. So the
    // light is gold rather than white (2026-08-03).
    const SUN_CORE = slate ? '255,255,255' : '255,246,214';
    const SUN_WARM = slate ? '210,214,224' : '255,178,64';
    const SUN_DEEP = slate ? '120,126,138' : '214,116,26';

    // Where the sun sits on the limb. Left of centre and just below the edge,
    // so it reads as rising rather than as a lamp hung over the planet.
    const SUN_A = -0.34;

    let W = 0, H = 0, raf = 0, t = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let stars: Star[] = [];
    let lights: Light[] = [];
    let lands: Land[] = [];
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
      //
      // Sat lower again on 2026-08-03 — Nat wanted more sky and less planet,
      // and the cards down the page were landing on the curve.
      R = Math.max(W, 520) * 1.55;
      horizon = H * (W < 520 ? 0.88 : 0.83);
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
      // Landmasses. Broad, soft, warm — the difference between a planet and a
      // dark ball is that the dark is not all the same dark (Nat 2026-08-03).
      // Placed in sphere coordinates like the lights, so they flatten toward
      // the limb instead of sitting on the glass.
      lands = [];
      for (let i = 0; i < 14; i++) {
        const a = (Math.random() - 0.5) * 1.5;
        const d = Math.random() * 0.9;
        lands.push({
          a, d,
          r: 0.06 + Math.random() * 0.13,
          warm: Math.random(),
        });
      }

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

      // Ocean at night: deep, and warmer at the lit edge than in the depths.
      const g = ctx.createLinearGradient(0, horizon, 0, H);
      g.addColorStop(0, slate ? '#161B23' : '#0C1A2C');
      g.addColorStop(0.45, slate ? '#0B0E13' : '#06101E');
      g.addColorStop(1, '#03050A');
      ctx.fillStyle = g;
      ctx.fillRect(0, horizon - 2, W, H - horizon + 4);

      // Land over the water. Soft-edged and low-contrast on purpose — this is
      // meant to read as continents glimpsed at night, not as a map.
      for (const l of lands) {
        const rr = R - l.d * l.d * R * 0.30;
        const x = cx + Math.sin(l.a) * rr;
        const y = cy - Math.cos(l.a) * rr;
        const size = R * l.r * (1 - l.d * 0.4);
        if (y - size > H || y + size < horizon - 20) continue;
        const earth = slate
          ? '58,60,66'
          : (l.warm > 0.55 ? '74,58,34' : '44,58,40');   // dry ground / green
        const blob = ctx.createRadialGradient(x, y, 0, x, y, size);
        blob.addColorStop(0, `rgba(${earth},0.55)`);
        blob.addColorStop(0.55, `rgba(${earth},0.30)`);
        blob.addColorStop(1, `rgba(${earth},0)`);
        ctx.fillStyle = blob;
        ctx.beginPath();
        ctx.ellipse(x, y, size, size * (0.42 + 0.3 * (1 - l.d)), 0, 0, Math.PI * 2);
        ctx.fill();
      }

      // Daybreak creeping across the surface. The world is dark on the far side
      // and warm where the sun has reached it — without this the sun hangs over
      // a planet that hasn't noticed it (Nat's reference photograph, 2026-08-03).
      {
        const sun = sunPoint();
        const reach = R * 0.55;
        ctx.globalCompositeOperation = 'lighter';
        const dawn = ctx.createRadialGradient(sun.x, sun.y, 0, sun.x, sun.y, reach);
        dawn.addColorStop(0, `rgba(${SUN_WARM},0.30)`);
        dawn.addColorStop(0.35, `rgba(${SUN_DEEP},0.13)`);
        dawn.addColorStop(1, `rgba(${SUN_DEEP},0)`);
        ctx.fillStyle = dawn;
        ctx.beginPath();
        ctx.arc(sun.x, sun.y, reach, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
      }

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

      const inner = R * 0.985;
      const outer = R * 1.055;
      const air = ctx.createRadialGradient(cx, cy, inner, cx, cy, outer);
      air.addColorStop(0, `rgba(${AIR_CORE},0.92)`);
      air.addColorStop(0.06, `rgba(${AIR_CORE},0.55)`);
      air.addColorStop(0.22, `rgba(${AIR_MID},0.30)`);
      air.addColorStop(0.55, `rgba(${AIR_FAR},0.12)`);
      air.addColorStop(1, `rgba(${AIR_FAR},0)`);
      ctx.fillStyle = air;
      // A RING, not a disc. Filling the whole circle painted the planet's
      // entire face with the gradient's first stop — a radial gradient hands
      // everything inside its inner radius that colour — so a near-white at 92%
      // in "lighter" mode was being laid over the world every frame. That is
      // why it read as a glowing ice dome rather than a planet at night
      // (Nat: "look a little more earthy", 2026-08-03).
      ctx.beginPath();
      ctx.arc(cx, cy, outer, 0, Math.PI * 2);
      ctx.arc(cx, cy, inner, 0, Math.PI * 2, true);
      ctx.fill();

      ctx.restore();

      // ── the edge itself ────────────────────────────────────────────────────
      // Drawn as a line so it stays crisp at any size. Brightest near the sun
      // and fading away around the curve, which is what stops the limb reading
      // as a drawn circle.
      const sun = sunPoint();
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const wire = ctx.createLinearGradient(sun.x - R * 0.5, 0, sun.x + R * 0.9, 0);
      wire.addColorStop(0, `rgba(${AIR_CORE},0.30)`);
      wire.addColorStop(0.28, `rgba(${SUN_CORE},0.85)`);
      wire.addColorStop(0.55, `rgba(${AIR_CORE},0.55)`);
      wire.addColorStop(1, `rgba(${AIR_MID},0.16)`);
      ctx.strokeStyle = wire;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(cx, cy, R, -Math.PI / 2 - 1.0, -Math.PI / 2 + 1.0);
      ctx.stroke();
      ctx.restore();

      drawSunrise(sun);
    }

    /** Where on the limb the sun is, in screen coordinates. */
    function sunPoint() {
      const r = R * 0.998;
      return { x: cx + Math.sin(SUN_A) * r, y: cy - Math.cos(SUN_A) * r };
    }

    /**
     * The sun coming up over the edge.
     *
     * Three layers, because one radial gradient reads as a torch rather than a
     * star: a wide warm bloom that spills into the black, a tighter gold core,
     * and a hot white centre small enough to look like it hurts to look at.
     */
    function drawSunrise(sun: { x: number; y: number }) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';

      const bloom = Math.max(W, H) * 0.42;
      const g1 = ctx.createRadialGradient(sun.x, sun.y, 0, sun.x, sun.y, bloom);
      g1.addColorStop(0, `rgba(${SUN_WARM},0.34)`);
      g1.addColorStop(0.14, `rgba(${SUN_DEEP},0.20)`);
      g1.addColorStop(0.45, `rgba(${SUN_DEEP},0.07)`);
      g1.addColorStop(1, `rgba(${SUN_DEEP},0)`);
      ctx.fillStyle = g1;
      ctx.beginPath();
      ctx.arc(sun.x, sun.y, bloom, 0, Math.PI * 2);
      ctx.fill();

      const glow = R * 0.085;
      const g2 = ctx.createRadialGradient(sun.x, sun.y, 0, sun.x, sun.y, glow);
      g2.addColorStop(0, `rgba(${SUN_CORE},0.95)`);
      g2.addColorStop(0.18, `rgba(${SUN_WARM},0.72)`);
      g2.addColorStop(0.55, `rgba(${SUN_WARM},0.22)`);
      g2.addColorStop(1, `rgba(${SUN_WARM},0)`);
      ctx.fillStyle = g2;
      ctx.beginPath();
      ctx.arc(sun.x, sun.y, glow, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = `rgba(${SUN_CORE},0.95)`;
      ctx.beginPath();
      ctx.arc(sun.x, sun.y, glow * 0.17, 0, Math.PI * 2);
      ctx.fill();

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
