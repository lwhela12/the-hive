import { useEffect, useRef } from 'react';
import { View, Platform, StyleSheet } from 'react-native';
import React from 'react';

/**
 * A real Earth, hanging in space.
 *
 * Attempt one was a green SVG wireframe ("a giant fail"). Attempt two was a
 * honey-coloured wireframe on black — "still not a big beautiful earth, it's a
 * weird, yellow thing with lines" (Nat 2026-08-03), with a photo of the blue
 * marble attached. Fair. Lines drawn on a circle are a diagram of a planet.
 *
 * So this paints one. A world map is generated once into an off-screen strip —
 * oceans with depth, continents with coastlines and deserts and green, ice at
 * both poles — and then every frame each pixel of the disc is traced back to a
 * point on the sphere and sampled from that strip. That's what gives real
 * curvature: land stretches and compresses toward the limb the way it does on a
 * globe, which no amount of ellipses can fake.
 *
 * Over that: a cloud layer turning at its own speed, a day/night terminator with
 * a warm sunrise edge, a blue atmosphere rim, and a starfield behind.
 *
 * The map is deliberately NOT a photograph of Earth — it's a generated world.
 * HIVE is going to have HIVEs in places, and a planet that is recognisably
 * nowhere in particular is a friendlier thing to belong to than one where you
 * can see that your country isn't on it.
 */

const isWeb = Platform.OS === 'web';

export const SPACE_BLACK = '#05060B';

/** Cheap value noise, tiled in longitude so the map wraps without a seam. */
function makeNoise(seed: number) {
  const rand = (i: number, j: number) => {
    const n = Math.sin(i * 127.1 + j * 311.7 + seed) * 43758.5453;
    return n - Math.floor(n);
  };
  const smooth = (t: number) => t * t * (3 - 2 * t);
  return (x: number, y: number, wrapX: number) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const x0 = ((xi % wrapX) + wrapX) % wrapX;
    const x1 = (x0 + 1) % wrapX;
    const a = rand(x0, yi), b = rand(x1, yi);
    const c = rand(x0, yi + 1), d = rand(x1, yi + 1);
    const u = smooth(xf), v = smooth(yf);
    return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
  };
}

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

    const MAP_W = 1024, MAP_H = 512;
    let W = 0, H = 0, raf = 0, spin = 2.1, cloudSpin = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let stars: { x: number; y: number; r: number; a: number; tw: number }[] = [];

    // ---- the world, painted once -------------------------------------------
    const map = document.createElement('canvas');
    map.width = MAP_W; map.height = MAP_H;
    const mapCtx = map.getContext('2d')!;
    const mapData = mapCtx.createImageData(MAP_W, MAP_H);

    const clouds = document.createElement('canvas');
    clouds.width = MAP_W; clouds.height = MAP_H;
    const cloudCtx = clouds.getContext('2d')!;
    const cloudData = cloudCtx.createImageData(MAP_W, MAP_H);

    (function paintWorld() {
      const n1 = makeNoise(11.3), n2 = makeNoise(57.9), n3 = makeNoise(93.1);
      const F = 7; // continents this big

      for (let y = 0; y < MAP_H; y++) {
        const lat = (y / MAP_H) * Math.PI - Math.PI / 2;
        const latAbs = Math.abs(lat) / (Math.PI / 2);
        for (let x = 0; x < MAP_W; x++) {
          const u = x / MAP_W;
          // fractal sum: big shapes, then coastline detail
          const h =
            n1(u * F, (y / MAP_H) * F * 0.5, F) * 0.6 +
            n2(u * F * 2.4, (y / MAP_H) * F * 1.2, F * 2.4) * 0.26 +
            n3(u * F * 6, (y / MAP_H) * F * 3, F * 6) * 0.14;

          // less land at the equator's edges so it reads as continents, not soup
          const land = h - 0.06 * Math.cos(lat * 2) - 0.44;
          const i = (y * MAP_W + x) * 4;
          let r: number, g: number, b: number;

          if (land > 0) {
            const alt = Math.min(1, land * 3.6);
            if (alt < 0.16) { r = 214; g = 198; b = 150; }               // sand at the shore
            else if (alt < 0.55) { r = 66 + alt * 40; g = 104 + alt * 46; b = 52; }  // green
            else { r = 122 + alt * 52; g = 108 + alt * 44; b = 88 + alt * 40; }      // high ground
            // a couple of deserts, so it isn't uniformly green
            const dry = n2(u * 9, (y / MAP_H) * 5, 9);
            if (dry > 0.66 && latAbs > 0.18 && latAbs < 0.44) { r = 202; g = 172; b = 118; }
          } else {
            const deep = Math.min(1, -land * 2.8);
            r = 12 + (1 - deep) * 26;
            g = 46 + (1 - deep) * 62;
            b = 92 + (1 - deep) * 66;
          }

          // ice caps, with a ragged edge
          const iceLine = 0.80 + n3(u * 14, 3, 14) * 0.09;
          if (latAbs > iceLine) {
            const t = Math.min(1, (latAbs - iceLine) / 0.14);
            r = r + (238 - r) * t; g = g + (243 - g) * t; b = b + (250 - b) * t;
          }

          mapData.data[i] = r; mapData.data[i + 1] = g; mapData.data[i + 2] = b; mapData.data[i + 3] = 255;

          // clouds: banded, so they read as weather rather than fog
          const cl =
            n3(u * 10, (y / MAP_H) * 6, 10) * 0.62 +
            n1(u * 22, (y / MAP_H) * 13, 22) * 0.38;
          const band = 0.5 + 0.5 * Math.cos(lat * 6);
          const a = Math.max(0, cl * (0.55 + band * 0.6) - 0.46) * 3.1;
          cloudData.data[i] = 255; cloudData.data[i + 1] = 255; cloudData.data[i + 2] = 255;
          cloudData.data[i + 3] = Math.min(235, a * 255);
        }
      }
      mapCtx.putImageData(mapData, 0, 0);
      cloudCtx.putImageData(cloudData, 0, 0);
    })();

    const mapPixels = mapCtx.getImageData(0, 0, MAP_W, MAP_H).data;
    const cloudPixels = cloudCtx.getImageData(0, 0, MAP_W, MAP_H).data;

    function resize() {
      const rect = canvas.getBoundingClientRect();
      W = Math.max(1, rect.width); H = Math.max(1, rect.height);
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      stars = Array.from({ length: Math.round((W * H) / 2400) }, () => ({
        x: Math.random() * W, y: Math.random() * H,
        r: Math.random() < 0.88 ? 0.4 + Math.random() * 0.7 : 1.1 + Math.random() * 0.9,
        a: 0.16 + Math.random() * 0.6,
        tw: Math.random() * Math.PI * 2,
      }));
    }

    let last = performance.now();
    let disc: ImageData | null = null;
    let discSize = 0;

    function frame(now: number) {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!reduce) { spin += dt * 0.035; cloudSpin += dt * 0.049; }

      ctx.clearRect(0, 0, W, H);

      for (const s of stars) {
        const tw = reduce ? 1 : 0.7 + 0.3 * Math.sin(now / 1600 + s.tw);
        ctx.fillStyle = `rgba(255,251,243,${(s.a * tw).toFixed(3)})`;
        ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill();
      }

      // Sits low, leaving the top of the page for the title (Nat 2026-08-03).
      const cx = W * 0.5;
      const cy = H * 0.62;
      const R = Math.max(110, Math.min(W * 0.27, H * 0.31));
      const D = Math.ceil(R * 2) + 2;

      // Reused between frames — allocating a quarter-million-byte buffer sixty
      // times a second is how a beautiful thing becomes a hot laptop.
      if (!disc || discSize !== D) { disc = ctx.createImageData(D, D); discSize = D; }
      const buf = disc as ImageData;
      const px = buf.data;

      // Light from the upper left, as in every photograph of the thing.
      const LX = -0.55, LY = -0.42, LZ = 0.72;

      for (let y = 0; y < D; y++) {
        const ny = (y - R) / R;
        for (let x = 0; x < D; x++) {
          const nx = (x - R) / R;
          const q = nx * nx + ny * ny;
          const o = (y * D + x) * 4;
          if (q > 1) { px[o + 3] = 0; continue; }

          const nz = Math.sqrt(1 - q);
          // tilt the axis so the poles sit where the eye expects them
          const TILT = 0.41;
          const wy = ny * Math.cos(TILT) - nz * Math.sin(TILT);
          const wz = ny * Math.sin(TILT) + nz * Math.cos(TILT);

          const lat = Math.asin(Math.max(-1, Math.min(1, wy)));
          const lon = Math.atan2(nx, wz) + spin;

          const mx = ((lon / (Math.PI * 2)) * MAP_W) % MAP_W;
          const my = ((lat + Math.PI / 2) / Math.PI) * MAP_H;
          const mi = ((Math.floor(my) * MAP_W + Math.floor(mx < 0 ? mx + MAP_W : mx)) * 4) | 0;

          let r = mapPixels[mi], g = mapPixels[mi + 1], b = mapPixels[mi + 2];

          // clouds, on their own rotation
          const cxr = ((lon + cloudSpin) / (Math.PI * 2)) * MAP_W % MAP_W;
          const ci = ((Math.floor(my) * MAP_W + Math.floor(cxr < 0 ? cxr + MAP_W : cxr)) * 4) | 0;
          const ca = cloudPixels[ci + 3] / 255;
          if (ca > 0) { r += (252 - r) * ca; g += (252 - g) * ca; b += (255 - b) * ca; }

          // day and night, with a warm line between them
          const lam = nx * LX + ny * LY + nz * LZ;
          const day = Math.max(0, Math.min(1, (lam + 0.14) / 0.62));
          const dusk = Math.max(0, 1 - Math.abs(lam) * 5.5);
          const night = 0.07 + 0.055 * (r + g + b) / 765;
          r = r * (night + day * 0.95) + dusk * 62;
          g = g * (night + day * 0.95) + dusk * 30;
          b = b * (night + day * 0.95) + dusk * 8;

          // atmosphere thickening toward the limb
          const rim = Math.pow(q, 5);
          r += rim * 40 * day; g += rim * 92 * day; b += rim * 150 * day;

          px[o] = Math.min(255, r);
          px[o + 1] = Math.min(255, g);
          px[o + 2] = Math.min(255, b);
          px[o + 3] = 255;
        }
      }

      ctx.putImageData(buf, Math.round(cx - R), Math.round(cy - R));

      // the halo of air around it
      const air = ctx.createRadialGradient(cx, cy, R * 0.97, cx, cy, R * 1.30);
      air.addColorStop(0, 'rgba(126,186,255,0.34)');
      air.addColorStop(0.45, 'rgba(96,150,224,0.11)');
      air.addColorStop(1, 'rgba(96,150,224,0)');
      ctx.fillStyle = air;
      ctx.beginPath(); ctx.arc(cx, cy, R * 1.30, 0, Math.PI * 2); ctx.fill();

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
