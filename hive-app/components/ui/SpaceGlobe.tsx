import { useEffect, useRef } from 'react';
import { View, Platform, StyleSheet } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
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
 *
 * ── It is a picture, so it is painted once (2026-08-06) ───────────────────────
 *
 * Nat, twice in one day: "still a really long load time for such a simple app",
 * about HIVE-Wide specifically. Every database call in the app answers in about
 * 150ms whatever it asks, so the wait was never the data — it was this. The
 * backdrop draws only at HIVE-Wide, which is exactly the difference she felt.
 *
 * Then she looked at it and named the real thing: "we dont even have a spinning
 * earth any more. We just have this static one, with the occasional shooting
 * star. So totally ditch the spinning whatever thats slowing us down."
 *
 * She was reading the code correctly from the outside. Nothing here rotates or
 * advances. What the old version did was run an animation loop sixty times a
 * second to redraw a picture identical to the one before it — nine gradients, a
 * full-screen stamp, around eighty-five city lights each building its own radial
 * gradient, and five canvas blur passes at 14, 5, 18, 6 and 3 pixels. Canvas
 * blur is the expensive one: on iOS Safari it is a real filter over every pixel
 * it touches, and there were five of them per frame, full-screen, at a phone's
 * pixel density. All of that to produce the same image again.
 *
 * The only movement in it was two brightness wobbles nobody could see — stars
 * breathing by a quarter of their own faintness, city lights by a fifth of
 * almost nothing — and the shooting star, which Nat named because it is the one
 * you notice.
 *
 * So: the whole scene is painted ONCE into an offscreen canvas and stamped, and
 * then the app does nothing at all while you read. The two wobbles are baked at
 * the average brightness they used to pass through, so the picture at rest is
 * the picture you were already looking at. The shooting star still flies — a
 * frame loop starts when one launches and stops the moment it lands.
 *
 * Three things follow from the same idea:
 *
 * - **The scene outlives the mount.** Stepping between HIVE-Wide screens
 *   unmounts and remounts this component, and painting the scene is a
 *   synchronous burst on the same thread that has to lay out Members. `painted`
 *   below keeps the last one, so the second visit pays nothing.
 * - **It repaints on geometry, never on a timer** — the window resizing, the
 *   side rail opening or closing, the display's pixel density changing. A
 *   ResizeObserver on the parent catches all three, which a window `resize`
 *   listener alone does not.
 * - **Nothing happens off screen.** Another screen in front (`useIsFocused`),
 *   the tab hidden, or the canvas scrolled out of view all stop the shooting
 *   stars being scheduled. `usePathname` is banned for this — it is global, so
 *   every screen holding one re-renders on every navigation.
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
type Cloud = { a: number; d: number; r: number; squash: number; turn: number; b: number };
type Shooter = { x: number; y: number; vx: number; vy: number; life: number; len: number };

/**
 * The picture, kept between mounts.
 *
 * Every step into a HIVE-Wide screen mounts a fresh globe, and painting the
 * scene means 46 land blobs, 58 clouds, a field of city lights and five blurred
 * passes — all synchronous, all on the thread that is trying to lay out the page
 * you just asked for. One scene is held, keyed by colour, size and pixel
 * density, so going Members → Boards → The Buzz pays for the planet once.
 *
 * One entry rather than a list, deliberately: each scene is a canvas the size of
 * the window, which on a large desktop is tens of megabytes. Holding several
 * would trade a load time for a memory problem.
 */
type Painted = { key: string; scene: any };

let painted: Painted | null = null;

export function SpaceGlobe({ hue = 'space' }: { hue?: 'space' | 'slate' }) {
  const canvasRef = useRef<any>(null);

  // Whether this screen is the one in front. When it is not — Members sitting
  // behind an open thread, say — no shooting star gets scheduled.
  const focused = useIsFocused();
  const focusedRef = useRef(true);
  const syncRef = useRef<(() => void) | null>(null);

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

    // Where the sun sits on the limb. RIGHT of centre and just below the edge,
    // so it reads as rising rather than as a lamp hung over the planet.
    // (It was on the left for an afternoon; Nat wanted it the other way.)
    //
    // 0.34 put him OFF THE SCREEN, at every window size — and it was not obvious,
    // because his bloom is enormous and the glow spilling in from the right edge
    // looks like a sunrise you can nearly see. The geometry says it plainly:
    // R is 1.55 × the width, so x = W/2 + sin(a)·1.55W, and sin(0.34)·1.55 =
    // 0.516 — always 1.6% of the width past the right edge, forever. Nat asked
    // "can I see him a little more?" on 2026-08-03 and got him pushed radially
    // outward, which made him clear the limb but did nothing about the fact that
    // he was sideways off the page. 0.25 lands him at 88% of the width, sitting
    // on the curve, in frame.
    const SUN_A = 0.25;

    // The brightness each wobble used to average out at, now painted and left
    // there. A star spent its life between 0.44 and 1 of its own alpha and a
    // city light between 0.64 and 1 of its own; these are the middles, so the
    // still picture is the picture that was on screen at any given moment.
    const STAR_LEVEL = 0.72;
    const CITY_LEVEL = 0.82;

    let W = 0, H = 0, dpr = 1;
    let stars: Star[] = [];
    let lights: Light[] = [];
    let lands: Land[] = [];
    let clouds: Cloud[] = [];

    // The scene, painted once. Everything below draws into it except the
    // shooting star, which is the only thing that ever moves.
    let scene: any = null;

    // Real blur, where the browser has it. Every edge in a photograph of the
    // Earth is soft — the air, the coastlines, the cloud tops — and drawing them
    // with gradients alone is what made this read as vector art rather than a
    // picture (Nat 2026-08-04: "make it look more 'real'... or blur it out a
    // little"). Safari only shipped canvas filters in 17, so it is a feature
    // test: without it everything still draws, just crisper.
    //
    // All five passes happen while the scene is being painted, so they are paid
    // once for as long as the page is open.
    const canBlur = typeof ctx.filter === 'string';
    const softly = (c: any, px: number) => {
      if (canBlur) c.filter = `blur(${px}px)`;
    };
    const sharp = (c: any) => {
      if (canBlur) c.filter = 'none';
    };

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

    /** A fresh transparent canvas the size of the window, at the same density. */
    function canvasLike(): { off: any; c: any } | null {
      const off = document.createElement('canvas');
      off.width = Math.max(1, Math.floor(W * dpr));
      off.height = Math.max(1, Math.floor(H * dpr));
      const c = off.getContext('2d');
      if (!c) return null;
      // Destination sizes are always given in CSS pixels, so everything lands
      // exactly where it was painted whatever the device pixel ratio — the same
      // discipline that keeps `putImageData` out of this file.
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      return { off, c };
    }

    function scatter() {
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
      // More of them, and reaching further round the curve. "Make it more
      // earthy" (Nat 2026-08-04) — at 26 blobs over a narrow arc the surface was
      // a flat wash with a couple of smudges in it, and what makes a planet look
      // like a planet is that the dark is not all the same dark.
      lands = [];
      for (let i = 0; i < 46; i++) {
        const a = (Math.random() - 0.5) * 2.1;
        const d = Math.random() * 0.9;
        lands.push({
          a, d,
          r: 0.03 + Math.random() * 0.09,
          warm: Math.random(),
        });
      }

      // Weather. The one thing the photograph has that the drawing did not.
      //
      // In Nat's reference the planet is not a dark ball with a bright rim — it
      // is covered in cloud, and the cloud is what the sunrise actually lands
      // on. Without it there is nothing between the wire of atmosphere and the
      // black, so the eye reads the edge as a stroke somebody drew.
      //
      // Placed in sphere coordinates like the land and the lights, squashed
      // toward the limb by the same rule, and rotated a little each so the
      // banding reads as systems rather than as a row of ovals.
      clouds = [];
      for (let i = 0; i < 58; i++) {
        const a = (Math.random() - 0.5) * 2.3;
        const d = Math.pow(Math.random(), 1.6) * 0.85;
        clouds.push({
          a,
          d,
          r: 0.04 + Math.random() * 0.13,
          squash: 0.14 + Math.random() * 0.24,
          turn: (Math.random() - 0.5) * 0.8,
          b: 0.35 + Math.random() * 0.65,
        });
      }

      lights = [];
      // Fewer as well as dimmer. At 0.9 per pixel of width there were enough of
      // them to form a visible field, and a visible field of dots on a dark
      // sphere is glitter no matter how faint each one is.
      const want = Math.round(W * 0.38);
      for (let i = 0; i < want; i++) {
        const a = (Math.random() - 0.5) * 1.25;
        // Never right on the edge. A light at depth 0 lands exactly on the
        // bright wire of atmosphere, where it reads as a sparkle stuck to the
        // rim rather than a town under it — you cannot see a city THROUGH the
        // limb, only inside it.
        const d = 0.16 + Math.random() * 0.84;
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

    /**
     * Land and weather, painted into their own canvas first.
     *
     * Everything in here is blurred hard and kept dim. The temptation with
     * clouds is to make them white and legible, which turns the planet into a
     * cartoon globe; in the photograph they are barely there except where the
     * sun catches them, so brightness is a function of how close each one sits
     * to the sunrise.
     */
    function buildSurface() {
      const made = canvasLike();
      if (!made) return null;
      const c = made.c;

      c.save();
      c.beginPath();
      c.arc(cx, cy, R, 0, Math.PI * 2);
      c.clip();

      // SEA, before anything sits on it.
      //
      // Nat asked whether land and sea texture was in my wheelhouse
      // (2026-08-04). It is, and the sea is the half that was missing: the
      // ocean was one vertical gradient, so every bit of water at the same
      // height was the same colour, which is the one thing an ocean never is.
      // Broad cool patches at very low strength give it depth and current
      // without ever resolving into shapes you could mistake for a map.
      softly(c, 34);
      for (const l of lands) {
        // Reuse the land field, offset, so the water varies where the land
        // does not — one set of numbers, two layers.
        const a = l.a + 0.55;
        const rr = R - l.d * l.d * R * 0.30;
        const x = cx + Math.sin(a) * rr;
        const y = cy - Math.cos(a) * rr;
        const size = R * (l.r + 0.06) * (1 - l.d * 0.3);
        if (y - size > H || y + size < horizon - 30) continue;
        const water = slate
          ? '40,44,52'
          : l.warm > 0.5 ? '18,42,70' : '10,30,54';   // shelf / deep
        const patch = c.createRadialGradient(x, y, 0, x, y, size);
        patch.addColorStop(0, `rgba(${water},0.30)`);
        patch.addColorStop(0.6, `rgba(${water},0.13)`);
        patch.addColorStop(1, `rgba(${water},0)`);
        c.fillStyle = patch;
        c.beginPath();
        c.ellipse(x, y, size, size * 0.5, 0, 0, Math.PI * 2);
        c.fill();
      }

      // Land, over the water and under the weather.
      softly(c, 22);
      for (const l of lands) {
        const rr = R - l.d * l.d * R * 0.30;
        const x = cx + Math.sin(l.a) * rr;
        const y = cy - Math.cos(l.a) * rr;
        const size = R * l.r * (1 - l.d * 0.4);
        if (y - size > H || y + size < horizon - 20) continue;
        // Three grounds rather than two, and stronger. Ochre, green and a rusty
        // red read as different places; one brown reads as a stain.
        const earth = slate
          ? '58,60,66'
          : l.warm > 0.72
            ? '92,66,34'                                  // desert / dry ground
            : l.warm > 0.4
              ? '46,62,42'                                // vegetation
              : '78,48,32';                               // iron-red earth
        const blob = c.createRadialGradient(x, y, 0, x, y, size);
        blob.addColorStop(0, `rgba(${earth},0.52)`);
        blob.addColorStop(0.5, `rgba(${earth},0.26)`);
        blob.addColorStop(1, `rgba(${earth},0)`);
        c.fillStyle = blob;
        c.beginPath();
        c.ellipse(x, y, size, size * (0.42 + 0.3 * (1 - l.d)), 0, 0, Math.PI * 2);
        c.fill();

        // A brighter core inside each mass, offset from its centre. A single
        // radial falloff makes every landmass an identical soft lozenge; two
        // circles that do not share a centre make an edge that bulges one way,
        // and that asymmetry is most of what reads as "coast".
        const inner = c.createRadialGradient(
          x - size * 0.22, y - size * 0.1, 0,
          x - size * 0.22, y - size * 0.1, size * 0.62,
        );
        inner.addColorStop(0, `rgba(${earth},0.34)`);
        inner.addColorStop(1, `rgba(${earth},0)`);
        c.fillStyle = inner;
        c.beginPath();
        c.ellipse(x - size * 0.22, y - size * 0.1, size * 0.62, size * 0.34, 0.4, 0, Math.PI * 2);
        c.fill();
      }

      // Cloud. Brightest near the sunrise, almost nothing on the far side —
      // which is what tells you where the light is coming from.
      softly(c, 16);
      c.globalCompositeOperation = 'lighter';
      for (const cl of clouds) {
        const rr = R - cl.d * cl.d * R * 0.30;
        const x = cx + Math.sin(cl.a) * rr;
        const y = cy - Math.cos(cl.a) * rr;
        const size = R * cl.r * (1 - cl.d * 0.35);
        if (y - size > H || y + size < horizon - 40) continue;

        // How lit this one is: 1 at the sunrise, falling away around the curve.
        const lit = Math.max(0, 1 - Math.abs(cl.a - SUN_A) / 1.9);
        const warmth = Math.pow(lit, 1.5);
        const alpha = cl.b * (0.10 + warmth * 0.58) * (1 - cl.d * 0.45);
        // Cloud tops near the sun pick up the gold; the rest stay cold white.
        const tint = warmth > 0.45 ? SUN_CORE : AIR_CORE;

        const puff = c.createRadialGradient(x, y, 0, x, y, size);
        puff.addColorStop(0, `rgba(${tint},${alpha})`);
        puff.addColorStop(0.45, `rgba(${tint},${alpha * 0.42})`);
        puff.addColorStop(1, `rgba(${tint},0)`);
        c.fillStyle = puff;
        c.save();
        c.translate(x, y);
        c.rotate(cl.turn);
        c.beginPath();
        c.ellipse(0, 0, size, size * cl.squash, 0, 0, Math.PI * 2);
        c.fill();
        c.restore();
      }

      c.restore();
      sharp(c);
      return made.off;
    }

    function drawSky(c: any) {
      // Not flat black — space photographs have a faint lift near the planet.
      //
      // Painted over the WHOLE height, which is the fix for Nat's "staunch
      // lines" (2026-08-04). It used to fill only down to `horizon + 2` and
      // leave everything below as raw SPACE_BLACK — but `horizon` is the top of
      // the curve, at the centre of the screen, so away from centre the planet's
      // edge sits well below it. That left a band of sky under the cut-off, and
      // #070C18 meeting #05060B along a perfectly straight line drew a hard rule
      // right across the picture. Nothing in a photograph is that straight.
      const g = c.createLinearGradient(0, 0, 0, H);
      const edge = Math.max(0.001, Math.min(0.999, horizon / Math.max(H, 1)));
      g.addColorStop(0, '#04050A');
      g.addColorStop(edge * 0.62, '#05070E');
      g.addColorStop(edge, slate ? '#0B0E14' : '#070C18');
      g.addColorStop(1, slate ? '#0B0E14' : '#070C18');
      c.fillStyle = g;
      c.fillRect(0, 0, W, H);
    }

    function drawStars(c: any) {
      c.fillStyle = '#fff';
      for (const s of stars) {
        c.globalAlpha = s.a * STAR_LEVEL;
        c.beginPath();
        c.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        c.fill();
      }
      c.globalAlpha = 1;
    }

    /** The dark body of the planet, below the curve. */
    function drawEarth(c: any) {
      c.save();
      c.beginPath();
      c.arc(cx, cy, R, 0, Math.PI * 2);
      c.clip();

      // Ocean at night: deep, and warmer at the lit edge than in the depths.
      const g = c.createLinearGradient(0, horizon, 0, H);
      g.addColorStop(0, slate ? '#161B23' : '#0C1A2C');
      g.addColorStop(0.45, slate ? '#0B0E13' : '#06101E');
      g.addColorStop(1, '#03050A');
      c.fillStyle = g;
      c.fillRect(0, horizon - 2, W, H - horizon + 4);

      // Land and cloud, stamped from their own layer. Destination size is given
      // in CSS pixels so it lands exactly where it was painted, whatever the
      // device pixel ratio.
      const surface = buildSurface();
      if (surface) c.drawImage(surface, 0, 0, W, H);

      // Daybreak creeping across the surface. The world is dark on the far side
      // and warm where the sun has reached it — without this the sun hangs over
      // a planet that hasn't noticed it (Nat's reference photograph, 2026-08-03).
      {
        const sun = sunPoint();
        // Wide and weak. An earlier pass had this at half the size and twice
        // the strength, which put a visible brown disc on the planet — you
        // could see where the gradient ended (Nat spotted it, 2026-08-03).
        const reach = R * 1.05;
        c.globalCompositeOperation = 'lighter';
        const dawn = c.createRadialGradient(sun.x, sun.y, 0, sun.x, sun.y, reach);
        dawn.addColorStop(0, `rgba(${SUN_WARM},0.17)`);
        dawn.addColorStop(0.22, `rgba(${SUN_DEEP},0.075)`);
        dawn.addColorStop(0.6, `rgba(${SUN_DEEP},0.02)`);
        dawn.addColorStop(1, `rgba(${SUN_DEEP},0)`);
        c.fillStyle = dawn;
        c.beginPath();
        c.arc(sun.x, sun.y, reach, 0, Math.PI * 2);
        c.fill();
        c.globalCompositeOperation = 'source-over';
      }

      // City lights. Each sits at (angle, depth) on the sphere and gets flattened
      // toward the limb, which is the whole reason they look like they are on a
      // curved surface rather than scattered on glass.
      c.globalCompositeOperation = 'lighter';
      for (const l of lights) {
        const rr = R - l.d * l.d * R * 0.30;
        const x = cx + Math.sin(l.a) * rr;
        const y = cy - Math.cos(l.a) * rr;
        if (y > H + 8 || y < horizon - 8) continue;
        // Distant lights are dimmer and smaller: haze, and less of them per pixel.
        const fade = 1 - l.d * 0.55;
        const size = (0.6 + l.s * 1.5) * fade;
        // Halved on 2026-08-04. At full strength they were the brightest thing
        // on the planet and read as glitter scattered over the top of it —
        // "confetti", in Nat's screenshot — instead of towns seen from orbit.
        // In the photograph the ground at night is very nearly nothing.
        const alpha = l.b * fade * 0.30 * CITY_LEVEL;

        const glow = c.createRadialGradient(x, y, 0, x, y, size * 4.2);
        glow.addColorStop(0, `rgba(${CITY},${alpha})`);
        glow.addColorStop(0.4, `rgba(${CITY},${alpha * 0.28})`);
        glow.addColorStop(1, `rgba(${CITY},0)`);
        c.fillStyle = glow;
        c.beginPath();
        c.arc(x, y, size * 4.2, 0, Math.PI * 2);
        c.fill();
      }
      c.globalCompositeOperation = 'source-over';
      c.restore();
    }

    /**
     * The air. This is the thing that makes the photograph a photograph: a hard
     * bright wire exactly on the edge, going blue and then to nothing over a
     * surprisingly short distance.
     */
    function drawAtmosphere(c: any) {
      c.save();
      c.globalCompositeOperation = 'lighter';

      // The ring starts well INSIDE the planet and ramps up to the edge, rather
      // than switching on at full strength exactly at R*0.985. That switch was
      // the second of Nat's "staunch lines": a near-white at 92% alpha beginning
      // on a perfect circle drew a hard bright arc a few pixels inside the limb,
      // so the bright band had a defined bottom that no real atmosphere has.
      // Air glows on the planet's side of the edge too — it just fades in.
      const inner = R * 0.94;
      const outer = R * 1.075;
      const air = c.createRadialGradient(cx, cy, inner, cx, cy, outer);
      air.addColorStop(0, `rgba(${AIR_FAR},0)`);
      air.addColorStop(0.30, `rgba(${AIR_MID},0.10)`);
      // 0.444 is where R itself falls between inner and outer — the true edge.
      air.addColorStop(0.444, `rgba(${AIR_CORE},0.88)`);
      air.addColorStop(0.52, `rgba(${AIR_CORE},0.52)`);
      air.addColorStop(0.66, `rgba(${AIR_MID},0.34)`);
      air.addColorStop(0.84, `rgba(${AIR_FAR},0.14)`);
      air.addColorStop(1, `rgba(${AIR_FAR},0)`);
      c.fillStyle = air;
      // A RING, not a disc. Filling the whole circle painted the planet's
      // entire face with the gradient's first stop — a radial gradient hands
      // everything inside its inner radius that colour — so a near-white at 92%
      // in "lighter" mode was being laid over the world every frame. That is
      // why it read as a glowing ice dome rather than a planet at night
      // (Nat: "look a little more earthy", 2026-08-03).
      c.beginPath();
      c.arc(cx, cy, outer, 0, Math.PI * 2);
      c.arc(cx, cy, inner, 0, Math.PI * 2, true);
      c.fill();

      c.restore();

      // ── the edge itself ────────────────────────────────────────────────────
      //
      // Three passes over the same arc: a wide soft halo, a mid band, and a
      // thin bright filament in the middle. That is what a lit atmosphere looks
      // like from orbit and it is emphatically NOT what a single 1.4px stroke
      // looked like — Nat's screenshot showed a drawn circle with a hairline on
      // it, because a hairline is exactly what it was (2026-08-04).
      //
      // Blurring the wide passes is what sells it. The filament stays sharp so
      // the edge still has somewhere definite to be; softness everywhere would
      // read as fog rather than air.
      const sun = sunPoint();
      c.save();
      c.globalCompositeOperation = 'lighter';

      const wire = c.createLinearGradient(sun.x - R * 0.5, 0, sun.x + R * 0.9, 0);
      wire.addColorStop(0, `rgba(${AIR_CORE},0.30)`);
      wire.addColorStop(0.28, `rgba(${SUN_CORE},0.85)`);
      wire.addColorStop(0.55, `rgba(${AIR_CORE},0.55)`);
      wire.addColorStop(1, `rgba(${AIR_MID},0.16)`);

      const halo = c.createLinearGradient(sun.x - R * 0.5, 0, sun.x + R * 0.9, 0);
      halo.addColorStop(0, `rgba(${AIR_MID},0.16)`);
      halo.addColorStop(0.28, `rgba(${SUN_WARM},0.40)`);
      halo.addColorStop(0.55, `rgba(${AIR_MID},0.28)`);
      halo.addColorStop(1, `rgba(${AIR_FAR},0.08)`);

      c.lineCap = 'round';
      const arc = () => {
        c.beginPath();
        c.arc(cx, cy, R, -Math.PI / 2 - 1.0, -Math.PI / 2 + 1.0);
        c.stroke();
      };

      softly(c, 14);
      c.strokeStyle = halo;
      c.lineWidth = 16;
      arc();

      softly(c, 5);
      c.strokeStyle = wire;
      c.lineWidth = 5;
      arc();

      sharp(c);
      c.strokeStyle = wire;
      c.lineWidth = 1.2;
      arc();

      c.restore();

      drawSunrise(c, sun);
    }

    /** Where on the limb the sun is, in screen coordinates. */
    function sunPoint() {
      // A hair PROUD of the limb rather than tucked just inside it. At 0.998 the
      // planet's edge cut through the middle of the disc and most of the sun was
      // behind the world; at 1.0015 he clears it and reads as a sun rather than
      // a glow leaking over the horizon. Nat, 2026-08-03: "I love the sun
      // peeking over here — can I see him a little more?"
      const r = R * 1.0015;
      return { x: cx + Math.sin(SUN_A) * r, y: cy - Math.cos(SUN_A) * r };
    }

    /**
     * The sun coming up over the edge.
     *
     * Three layers, because one radial gradient reads as a torch rather than a
     * star: a wide warm bloom that spills into the black, a tighter gold core,
     * and a hot white centre small enough to look like it hurts to look at.
     */
    function drawSunrise(c: any, sun: { x: number; y: number }) {
      c.save();
      c.globalCompositeOperation = 'lighter';

      const bloom = Math.max(W, H) * 0.5;
      const g1 = c.createRadialGradient(sun.x, sun.y, 0, sun.x, sun.y, bloom);
      g1.addColorStop(0, `rgba(${SUN_WARM},0.46)`);
      g1.addColorStop(0.14, `rgba(${SUN_DEEP},0.27)`);
      g1.addColorStop(0.45, `rgba(${SUN_DEEP},0.10)`);
      g1.addColorStop(1, `rgba(${SUN_DEEP},0)`);
      c.fillStyle = g1;
      c.beginPath();
      c.arc(sun.x, sun.y, bloom, 0, Math.PI * 2);
      c.fill();

      // The flare along the edge. When the sun clears a planet's limb the light
      // smears sideways ALONG it, and that streak is most of why the reference
      // photograph reads as a photograph. Squashed hard against the curve and
      // blurred, so it never resolves into a shape you could name.
      softly(c, 18);
      const flareW = R * 0.30;
      const flare = c.createRadialGradient(sun.x, sun.y, 0, sun.x, sun.y, flareW);
      flare.addColorStop(0, `rgba(${SUN_CORE},0.55)`);
      flare.addColorStop(0.35, `rgba(${SUN_WARM},0.22)`);
      flare.addColorStop(1, `rgba(${SUN_WARM},0)`);
      c.fillStyle = flare;
      c.save();
      c.translate(sun.x, sun.y);
      // Tangent to the limb at the sun's angle — the streak lies along the
      // horizon rather than across it.
      c.rotate(SUN_A);
      c.beginPath();
      c.ellipse(0, 0, flareW, flareW * 0.20, 0, 0, Math.PI * 2);
      c.fill();
      c.restore();

      const glow = R * 0.115;
      softly(c, 6);
      const g2 = c.createRadialGradient(sun.x, sun.y, 0, sun.x, sun.y, glow);
      g2.addColorStop(0, `rgba(${SUN_CORE},0.95)`);
      g2.addColorStop(0.18, `rgba(${SUN_WARM},0.72)`);
      g2.addColorStop(0.55, `rgba(${SUN_WARM},0.22)`);
      g2.addColorStop(1, `rgba(${SUN_WARM},0)`);
      c.fillStyle = g2;
      c.beginPath();
      c.arc(sun.x, sun.y, glow, 0, Math.PI * 2);
      c.fill();

      // The hot centre. Small and slightly soft — at 0.22 of the glow radius
      // and perfectly sharp it was a white circle sitting on the picture like a
      // sticker, which is the single most drawn-looking thing a sun can do. In
      // a photograph the blown-out core has no edge at all; the sensor just
      // gives up somewhere in the middle of the bloom.
      softly(c, 3);
      c.fillStyle = `rgba(${SUN_CORE},0.98)`;
      c.beginPath();
      c.arc(sun.x, sun.y, glow * 0.13, 0, Math.PI * 2);
      c.fill();
      sharp(c);

      c.restore();
    }

    /** The whole picture, in one pass, into whatever canvas is handed over. */
    function paintScene(c: any) {
      c.fillStyle = SPACE_BLACK;
      c.fillRect(0, 0, W, H);
      drawSky(c);
      drawStars(c);
      drawEarth(c);
      drawAtmosphere(c);
    }

    /** Paint the scene, or take the one the last mount left behind. */
    function build() {
      const key = `${hue}|${W}x${H}|${dpr}`;
      if (painted && painted.key === key) {
        scene = painted.scene;
        return;
      }
      scatter();
      const made = canvasLike();
      if (made) paintScene(made.c);
      scene = made ? made.off : null;
      painted = { key, scene };
    }

    // ── the one thing that moves ──────────────────────────────────────────────
    //
    // Rare, and always up in the empty part of the sky. One at a time — a shower
    // would be a screensaver, and this is a page you read. A frame loop runs for
    // as long as a star is in flight, about a second and a half, and stops the
    // moment it lands.

    let shooters: Shooter[] = [];
    let raf = 0;
    let waiting: any = 0;
    let last = 0;

    function stamp() {
      if (scene) ctx.drawImage(scene, 0, 0, W, H);
    }

    function tick(now: number) {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      for (const s of shooters) {
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        s.life -= dt * 0.62;
      }
      shooters = shooters.filter((s) => s.life > 0);

      stamp();
      for (const s of shooters) {
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

      if (shooters.length) {
        raf = window.requestAnimationFrame(tick);
        return;
      }
      // Landed. Back to a still picture and no work at all.
      raf = 0;
      queue();
    }

    function launch() {
      waiting = 0;
      if (!watched()) return;
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
      if (!raf) {
        last = performance.now();
        raf = window.requestAnimationFrame(tick);
      }
    }

    /** Book the next one. The first comes sooner, so arriving feels alive. */
    function queue(first = false) {
      if (reduce || waiting || raf) return;
      const wait = first ? 2.5 : 5 + Math.random() * 11;
      waiting = window.setTimeout(launch, wait * 1000);
    }

    function hush() {
      if (waiting) {
        window.clearTimeout(waiting);
        waiting = 0;
      }
      if (raf) {
        window.cancelAnimationFrame(raf);
        raf = 0;
      }
      shooters = [];
      stamp();
    }

    // ── when any of this is worth doing ───────────────────────────────────────

    let onScreen = true;

    function watched() {
      return (
        onScreen &&
        focusedRef.current &&
        (typeof document === 'undefined' || document.visibilityState !== 'hidden')
      );
    }

    function sync() {
      if (watched()) queue();
      else hush();
    }

    syncRef.current = sync;

    /**
     * Repaint only when the picture would genuinely be a different shape: the
     * window resizing, the side rail opening or closing, the display's pixel
     * density changing. A ResizeObserver on the parent catches the rail, which a
     * window `resize` listener never sees.
     */
    function measure() {
      const parent = canvas.parentElement;
      const w = parent ? parent.clientWidth : window.innerWidth;
      const h = parent ? parent.clientHeight : window.innerHeight;
      const d = Math.min(window.devicePixelRatio || 1, 2);
      // A ResizeObserver can report a box of nothing before the page has been
      // laid out, and painting a scene for that would throw away the one the
      // last screen left behind.
      if (!w || !h) return;
      if (w === W && h === H && d === dpr && scene) return;

      W = w;
      H = h;
      dpr = d;
      canvas.width = Math.floor(W * dpr);
      canvas.height = Math.floor(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      layout();
      build();
      stamp();
    }

    let box: any = null;
    if (typeof ResizeObserver === 'function' && canvas.parentElement) {
      box = new ResizeObserver(() => measure());
      box.observe(canvas.parentElement);
    }

    let seen: any = null;
    if (typeof IntersectionObserver === 'function') {
      seen = new IntersectionObserver((entries: any[]) => {
        onScreen = entries.some((e) => e.isIntersecting);
        sync();
      });
      seen.observe(canvas);
    }

    // Moving a window to a display with a different pixel density fires nothing
    // else, so it gets asked directly.
    const density =
      typeof window.matchMedia === 'function'
        ? window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`)
        : null;
    const onDensity = () => measure();
    if (density && typeof density.addEventListener === 'function') {
      density.addEventListener('change', onDensity);
    }

    const onVisibility = () => sync();
    const onResize = () => measure();

    measure();
    queue(true);

    window.addEventListener('resize', onResize);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      hush();
      syncRef.current = null;
      window.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVisibility);
      if (density && typeof density.removeEventListener === 'function') {
        density.removeEventListener('change', onDensity);
      }
      if (box) box.disconnect();
      if (seen) seen.disconnect();
      scene = null;
    };
  }, [hue]);

  // Kept after the painting effect so the scene exists by the time this runs.
  useEffect(() => {
    focusedRef.current = focused;
    syncRef.current?.();
  }, [focused]);

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
