#!/usr/bin/env python3
"""Generate bitmap UI assets for the HIVE member honeycomb and skill garden.

The app intentionally uses these as PNG sprites instead of composing every
petal and honeycomb facet as runtime vector views. The generator is pure
standard-library Python so future runs do not depend on native image packages.
"""

from __future__ import annotations

import math
import random
import struct
import zlib
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "assets" / "generated"


def rgba(hex_color: str, alpha: int = 255) -> tuple[int, int, int, int]:
    value = hex_color.lstrip("#")
    return (
        int(value[0:2], 16),
        int(value[2:4], 16),
        int(value[4:6], 16),
        alpha,
    )


def mix(a: tuple[int, int, int, int], b: tuple[int, int, int, int], t: float) -> tuple[int, int, int, int]:
    return tuple(round(a[i] * (1 - t) + b[i] * t) for i in range(4))  # type: ignore[return-value]


class Canvas:
    def __init__(self, width: int, height: int, scale: int = 3, background: tuple[int, int, int, int] = (0, 0, 0, 0)):
        self.width = width
        self.height = height
        self.scale = scale
        self.sw = width * scale
        self.sh = height * scale
        self.pixels = bytearray(background * self.sw * self.sh)

    def blend_pixel(self, x: int, y: int, color: tuple[int, int, int, int]) -> None:
        if x < 0 or y < 0 or x >= self.sw or y >= self.sh:
            return
        src_a = color[3] / 255
        if src_a <= 0:
            return
        idx = (y * self.sw + x) * 4
        dst_a = self.pixels[idx + 3] / 255
        out_a = src_a + dst_a * (1 - src_a)
        if out_a <= 0:
            return
        for channel in range(3):
            src = color[channel] / 255
            dst = self.pixels[idx + channel] / 255
            out = (src * src_a + dst * dst_a * (1 - src_a)) / out_a
            self.pixels[idx + channel] = max(0, min(255, round(out * 255)))
        self.pixels[idx + 3] = max(0, min(255, round(out_a * 255)))

    def rect(self, x: float, y: float, width: float, height: float, color: tuple[int, int, int, int]) -> None:
        sx0 = max(0, math.floor(x * self.scale))
        sy0 = max(0, math.floor(y * self.scale))
        sx1 = min(self.sw, math.ceil((x + width) * self.scale))
        sy1 = min(self.sh, math.ceil((y + height) * self.scale))
        for py in range(sy0, sy1):
            for px in range(sx0, sx1):
                self.blend_pixel(px, py, color)

    def line(self, x1: float, y1: float, x2: float, y2: float, width: float, color: tuple[int, int, int, int]) -> None:
        pad = width + 2
        sx0 = max(0, math.floor((min(x1, x2) - pad) * self.scale))
        sy0 = max(0, math.floor((min(y1, y2) - pad) * self.scale))
        sx1 = min(self.sw, math.ceil((max(x1, x2) + pad) * self.scale))
        sy1 = min(self.sh, math.ceil((max(y1, y2) + pad) * self.scale))
        dx = x2 - x1
        dy = y2 - y1
        length_sq = dx * dx + dy * dy
        radius = width / 2
        for py in range(sy0, sy1):
            y = (py + 0.5) / self.scale
            for px in range(sx0, sx1):
                x = (px + 0.5) / self.scale
                if length_sq == 0:
                    dist = math.hypot(x - x1, y - y1)
                else:
                    t = max(0, min(1, ((x - x1) * dx + (y - y1) * dy) / length_sq))
                    cx = x1 + t * dx
                    cy = y1 + t * dy
                    dist = math.hypot(x - cx, y - cy)
                if dist <= radius:
                    self.blend_pixel(px, py, color)

    def ellipse(
        self,
        cx: float,
        cy: float,
        rx: float,
        ry: float,
        color: tuple[int, int, int, int],
        *,
        angle: float = 0,
        outline: tuple[int, int, int, int] | None = None,
        outline_width: float = 0,
    ) -> None:
        if outline and outline_width > 0:
            self.ellipse(cx, cy, rx + outline_width, ry + outline_width, outline, angle=angle)
        cos_a = math.cos(math.radians(angle))
        sin_a = math.sin(math.radians(angle))
        pad = max(rx, ry) + 2
        sx0 = max(0, math.floor((cx - pad) * self.scale))
        sy0 = max(0, math.floor((cy - pad) * self.scale))
        sx1 = min(self.sw, math.ceil((cx + pad) * self.scale))
        sy1 = min(self.sh, math.ceil((cy + pad) * self.scale))
        for py in range(sy0, sy1):
            y = (py + 0.5) / self.scale - cy
            for px in range(sx0, sx1):
                x = (px + 0.5) / self.scale - cx
                xr = x * cos_a + y * sin_a
                yr = -x * sin_a + y * cos_a
                if (xr * xr) / (rx * rx) + (yr * yr) / (ry * ry) <= 1:
                    self.blend_pixel(px, py, color)

    def polygon(
        self,
        points: list[tuple[float, float]],
        color: tuple[int, int, int, int],
        *,
        outline: tuple[int, int, int, int] | None = None,
        outline_width: float = 0,
    ) -> None:
        min_x = max(0, math.floor(min(p[0] for p in points) * self.scale))
        max_x = min(self.sw, math.ceil(max(p[0] for p in points) * self.scale))
        min_y = max(0, math.floor(min(p[1] for p in points) * self.scale))
        max_y = min(self.sh, math.ceil(max(p[1] for p in points) * self.scale))
        for py in range(min_y, max_y):
            y = (py + 0.5) / self.scale
            for px in range(min_x, max_x):
                x = (px + 0.5) / self.scale
                if point_in_poly(x, y, points):
                    self.blend_pixel(px, py, color)
        if outline and outline_width > 0:
            for index, start in enumerate(points):
                end = points[(index + 1) % len(points)]
                self.line(start[0], start[1], end[0], end[1], outline_width, outline)

    def downsample(self) -> bytearray:
        if self.scale == 1:
            return self.pixels
        result = bytearray(self.width * self.height * 4)
        block = self.scale * self.scale
        for y in range(self.height):
            for x in range(self.width):
                totals = [0, 0, 0, 0]
                for yy in range(self.scale):
                    for xx in range(self.scale):
                        src = ((y * self.scale + yy) * self.sw + (x * self.scale + xx)) * 4
                        for channel in range(4):
                            totals[channel] += self.pixels[src + channel]
                dst = (y * self.width + x) * 4
                for channel in range(4):
                    result[dst + channel] = round(totals[channel] / block)
        return result

    def save(self, path: Path) -> None:
        write_png(path, self.width, self.height, self.downsample())


def point_in_poly(x: float, y: float, points: list[tuple[float, float]]) -> bool:
    inside = False
    j = len(points) - 1
    for i, point in enumerate(points):
        xi, yi = point
        xj, yj = points[j]
        if (yi > y) != (yj > y):
            x_cross = (xj - xi) * (y - yi) / ((yj - yi) or 1e-9) + xi
            if x < x_cross:
                inside = not inside
        j = i
    return inside


def png_chunk(kind: bytes, data: bytes) -> bytes:
    return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)


def write_png(path: Path, width: int, height: int, pixels: bytearray) -> None:
    raw = bytearray()
    row_len = width * 4
    for y in range(height):
        raw.append(0)
        raw.extend(pixels[y * row_len : (y + 1) * row_len])
    payload = b"".join(
        [
            b"\x89PNG\r\n\x1a\n",
            png_chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)),
            png_chunk(b"IDAT", zlib.compress(bytes(raw), 9)),
            png_chunk(b"IEND", b""),
        ]
    )
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(payload)


def rotated_rect(cx: float, cy: float, width: float, height: float, angle: float) -> list[tuple[float, float]]:
    corners = [(-width / 2, -height / 2), (width / 2, -height / 2), (width / 2, height / 2), (-width / 2, height / 2)]
    cos_a = math.cos(math.radians(angle))
    sin_a = math.sin(math.radians(angle))
    return [(cx + x * cos_a - y * sin_a, cy + x * sin_a + y * cos_a) for x, y in corners]


CATEGORIES = {
    "wonder": {
        "primary": rgba("#c8b7f0"),
        "light": rgba("#f1ecff"),
        "edge": rgba("#8f75c7"),
        "center": rgba("#d8bd59"),
        "leaf": rgba("#6d8e76"),
    },
    "movement": {
        "primary": rgba("#d9be68"),
        "light": rgba("#fff3c8"),
        "edge": rgba("#b98232"),
        "center": rgba("#cf9243"),
        "leaf": rgba("#719879"),
    },
    "creative": {
        "primary": rgba("#dc9a9e"),
        "light": rgba("#ffe4e1"),
        "edge": rgba("#bd7178"),
        "center": rgba("#d6a15c"),
        "leaf": rgba("#769879"),
    },
    "care": {
        "primary": rgba("#efbfd0"),
        "light": rgba("#ffe8f0"),
        "edge": rgba("#c47796"),
        "center": rgba("#d6a45b"),
        "leaf": rgba("#789a82"),
    },
    "practical": {
        "primary": rgba("#bf9362"),
        "light": rgba("#ffe4bb"),
        "edge": rgba("#8f6538"),
        "center": rgba("#7f5730"),
        "leaf": rgba("#80946e"),
    },
    "tech": {
        "primary": rgba("#99bdae"),
        "light": rgba("#dff2e9"),
        "edge": rgba("#5e8b7a"),
        "center": rgba("#c7a54d"),
        "leaf": rgba("#628d79"),
    },
}


def sparkle(canvas: Canvas, x: float, y: float, size: float, color: tuple[int, int, int, int]) -> None:
    canvas.polygon([(x, y - size), (x + size * 0.45, y), (x, y + size), (x - size * 0.45, y)], color)


def draw_leaf(canvas: Canvas, x: float, y: float, size: float, angle: float, category: dict[str, tuple[int, int, int, int]]) -> None:
    canvas.ellipse(x, y, size * 0.72, size * 0.3, category["leaf"], angle=angle, outline=rgba("#3f5f44", 130), outline_width=1.4)
    canvas.line(x - math.cos(math.radians(angle)) * size * 0.32, y - math.sin(math.radians(angle)) * size * 0.32, x + math.cos(math.radians(angle)) * size * 0.22, y + math.sin(math.radians(angle)) * size * 0.22, 1.2, rgba("#eaf3e6", 105))


def draw_petals(canvas: Canvas, cx: float, cy: float, count: int, rx: float, ry: float, dist: float, category: dict[str, tuple[int, int, int, int]], twist: float = 0) -> None:
    for i in range(count):
        angle = -90 + i * 360 / count + twist
        px = cx + math.cos(math.radians(angle)) * dist
        py = cy + math.sin(math.radians(angle)) * dist
        color = category["light"] if i % 2 else mix(category["light"], category["primary"], 0.18)
        canvas.ellipse(px, py, rx, ry, color, angle=angle, outline=category["edge"], outline_width=1.6)
        canvas.ellipse(px - rx * 0.18, py - ry * 0.25, max(1.8, rx * 0.18), max(2, ry * 0.14), rgba("#ffffff", 105), angle=angle)


def draw_plant(species: str, level: int, path: Path) -> None:
    category = CATEGORIES[species]
    canvas = Canvas(256, 256, scale=1)
    stem_bottom = 220
    stem_height = 34 + level * 23
    sway = {"wonder": -5, "movement": 3, "creative": 5, "care": -2, "practical": 1, "tech": -3}[species]
    top_x = 128 + sway
    top_y = stem_bottom - stem_height

    canvas.ellipse(128, 226, 24 + level * 7, 5 + level, rgba("#3b2c1c", 30))
    canvas.line(128, stem_bottom, 126 + sway * 0.35, stem_bottom - stem_height * 0.48, 5.2 if level >= 3 else 4.2, rgba("#405e3f", 145))
    canvas.line(126 + sway * 0.35, stem_bottom - stem_height * 0.48, top_x, top_y + 8, 4.4 if level >= 4 else 3.6, category["leaf"])
    draw_leaf(canvas, 112 + sway * 0.2, stem_bottom - stem_height * 0.34, 24 + level * 1.6, -32, category)
    if level >= 2:
        draw_leaf(canvas, 142 + sway * 0.1, stem_bottom - stem_height * 0.52, 22 + level * 1.4, 28, category)
    if level >= 4:
        draw_leaf(canvas, 108 + sway * 0.3, stem_bottom - stem_height * 0.7, 18, -18, category)

    if level == 1:
        canvas.ellipse(top_x, top_y + 8, 13, 16, category["primary"], angle=-8, outline=category["edge"], outline_width=1.5)
        canvas.ellipse(top_x - 4, top_y + 2, 3, 4, rgba("#ffffff", 120), angle=-8)
    elif level == 2:
        canvas.ellipse(top_x, top_y + 7, 17, 23, category["light"], angle=5, outline=category["edge"], outline_width=1.7)
        canvas.ellipse(top_x - 5, top_y - 2, 4, 8, rgba("#ffffff", 110), angle=5)
    elif level == 3:
        canvas.ellipse(top_x, top_y + 3, 21, 34, category["light"], angle=-4, outline=category["edge"], outline_width=1.8)
        for offset, angle in [(-11, -28), (0, 0), (11, 28)]:
            canvas.ellipse(top_x + offset, top_y + 28, 7, 16, category["leaf"], angle=angle, outline=rgba("#405e3f", 95), outline_width=1)
        canvas.ellipse(top_x - 7, top_y - 7, 5, 12, rgba("#ffffff", 100), angle=-6)
    else:
        bloom = 48 if level == 4 else 62
        cx = top_x
        cy = top_y + 6
        if species == "wonder":
            canvas.ellipse(cx, cy - 1, bloom * 0.68, bloom * 0.38, category["light"], outline=category["edge"], outline_width=1.8)
            for offset in [-26, 0, 26]:
                canvas.ellipse(cx + offset, cy - 4 - abs(offset) * 0.04, bloom * 0.24, bloom * 0.27, mix(category["light"], category["primary"], 0.2), outline=category["edge"], outline_width=1.3)
            canvas.rect(cx - bloom * 0.55, cy + bloom * 0.18, bloom * 1.1, 8, rgba("#fffdf7", 150))
            for offset in [-22, 0, 22]:
                canvas.ellipse(cx + offset, cy - 8, 4.6, 4.6, rgba("#fffdf7", 190))
        elif species == "movement":
            draw_petals(canvas, cx, cy, 5 if level == 5 else 4, bloom * 0.16, bloom * 0.42, bloom * 0.24, category, twist=level * 3)
        elif species == "tech":
            count = 6 if level == 5 else 5
            for i in range(count):
                angle = -90 + i * 360 / count
                px = cx + math.cos(math.radians(angle)) * bloom * 0.28
                py = cy + math.sin(math.radians(angle)) * bloom * 0.28
                canvas.polygon(rotated_rect(px, py, bloom * 0.35, bloom * 0.35, angle + 45), category["light"], outline=category["edge"], outline_width=1.5)
                canvas.ellipse(px - 3, py - 4, 3, 3, rgba("#ffffff", 115))
        elif species == "creative":
            draw_petals(canvas, cx, cy, 7 if level == 5 else 6, bloom * 0.18, bloom * 0.34, bloom * 0.28, category, twist=11)
            draw_petals(canvas, cx, cy, 5, bloom * 0.13, bloom * 0.25, bloom * 0.17, category, twist=-8)
        elif species == "care":
            draw_petals(canvas, cx, cy, 8, bloom * 0.18, bloom * 0.25, bloom * 0.25, category, twist=level * 2)
            draw_petals(canvas, cx, cy, 4, bloom * 0.15, bloom * 0.21, bloom * 0.14, category, twist=45)
        else:
            draw_petals(canvas, cx, cy, 9 if level == 5 else 7, bloom * 0.13, bloom * 0.35, bloom * 0.3, category, twist=4)
        center = bloom * (0.22 if level == 4 else 0.25)
        canvas.ellipse(cx, cy, center, center, category["center"], outline=category["edge"], outline_width=1.5)
        for dot in range(7 if level == 5 else 4):
            angle = dot * 137.5
            dist = center * (0.18 + 0.1 * (dot % 3))
            canvas.ellipse(cx + math.cos(math.radians(angle)) * dist, cy + math.sin(math.radians(angle)) * dist, 2.2, 2.2, rgba("#fff8dc", 160))
        if level == 5:
            sparkle(canvas, cx - bloom * 0.64, cy - bloom * 0.46, 5, rgba("#fffdf7", 185))
            sparkle(canvas, cx + bloom * 0.62, cy - bloom * 0.26, 4, rgba("#fffdf7", 160))
            sparkle(canvas, cx + bloom * 0.42, cy + bloom * 0.44, 3.5, rgba("#fffdf7", 135))

    canvas.save(path)


def draw_member_cell(path: Path, mine: bool = False) -> None:
    canvas = Canvas(680, 589, scale=1)
    cell = [(170, 0), (510, 0), (680, 294.5), (510, 589), (170, 589), (0, 294.5)]
    inner = [(204, 48), (476, 48), (616, 294.5), (476, 541), (204, 541), (64, 294.5)]
    glow = [(188, 18), (492, 18), (648, 294.5), (492, 571), (188, 571), (32, 294.5)]

    base = rgba("#ffc62e" if mine else "#f7bb25", 250)
    edge = rgba("#ffffff", 248)
    rim = rgba("#d38f11" if mine else "#e0a019", 230)
    canvas.polygon(cell, edge)
    canvas.polygon(glow, base, outline=rim, outline_width=3.2 if mine else 2.4)

    random.seed(42 if mine else 24)
    for _ in range(180):
        x = random.uniform(48, 632)
        y = random.uniform(38, 550)
        if point_in_poly(x, y, cell):
            color = rgba("#ffffff", random.randint(18, 64)) if random.random() > 0.34 else rgba("#b9760d", random.randint(10, 32))
            canvas.ellipse(x, y, random.uniform(1.1, 4.6), random.uniform(1.1, 4.6), color)

    canvas.polygon(inner, rgba("#fff8df", 180), outline=rgba("#ffffff", 155), outline_width=2)
    canvas.polygon([(194, 34), (486, 34), (626, 276), (602, 294), (468, 74), (212, 74), (78, 294), (54, 276)], rgba("#ffffff", 50))
    if mine:
        canvas.polygon([(184, 24), (496, 24), (658, 294.5), (496, 565), (184, 565), (22, 294.5)], rgba("#fff3cf", 46), outline=rgba("#fff8df", 220), outline_width=3)
    canvas.save(path)


def draw_meadow_background(path: Path) -> None:
    canvas = Canvas(1200, 640, scale=1, background=rgba("#fffdf7"))
    top = rgba("#fffdf7")
    horizon = rgba("#eaf3e2")
    for y in range(0, 475):
        canvas.rect(0, y, 1200, 1, mix(top, horizon, y / 475))
    canvas.rect(0, 404, 1200, 132, rgba("#dfeedd", 190))
    canvas.rect(0, 504, 1200, 136, rgba("#9a7247", 218))
    canvas.rect(0, 494, 1200, 24, rgba("#d2ba84", 190))
    random.seed(7)
    for _ in range(260):
        x = random.uniform(0, 1200)
        y = random.uniform(530, 635)
        canvas.ellipse(x, y, random.uniform(1, 4), random.uniform(0.8, 2.8), rgba("#6b4b2d", random.randint(28, 64)))
    for index in range(430):
        x = index * 2.9 + random.uniform(-2, 2)
        base = random.uniform(496, 538)
        height = random.uniform(24, 78)
        color = rgba(random.choice(["#6f8f70", "#789883", "#8ca879", "#5f7e65"]), random.randint(100, 180))
        canvas.line(x, base, x + random.uniform(-9, 9), base - height, random.uniform(1.1, 2.5), color)
    for index in range(64):
        x = index * 19 + random.uniform(-8, 8)
        bloom = random.choice(["#f1bfd1", "#f9d56e", "#cab9f2", "#fff7df"])
        stem_top = 458 + random.uniform(-18, 24)
        canvas.line(x, 514, x + random.uniform(-4, 4), stem_top, 1.2, rgba("#6f8f70", 95))
        canvas.ellipse(x, stem_top, random.uniform(2.4, 4.2), random.uniform(2.4, 4.2), rgba(bloom, random.randint(72, 135)))
    canvas.save(path)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    draw_meadow_background(OUT / "skill-meadow-bg.png")
    draw_member_cell(OUT / "member-honeycomb-cell.png", mine=False)
    draw_member_cell(OUT / "member-honeycomb-cell-me.png", mine=True)
    for species in CATEGORIES:
        for level in range(1, 6):
            draw_plant(species, level, OUT / f"skill-{species}-{level}.png")


if __name__ == "__main__":
    main()
