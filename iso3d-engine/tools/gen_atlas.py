#!/usr/bin/env python3
"""
Generate built-in voxel face textures and pack them into src/voxel/atlas.png.

Layout matches blocks.js:
  ATLAS_COLS=8, ATLAS_ROWS=8, ATLAS_CELL_PX=32  →  256×256 atlas
  TEX ids 0..15 are the built-in slots (row 0 + first half of row 1).
  Cells 16..63 stay empty (black/transparent) for runtime custom materials.

Style: chunky pixel art, mild noise, tileable where it matters (grass top, stone, dirt).
"""

from __future__ import annotations

import math
import random
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "src" / "voxel" / "atlas.png"

COLS, ROWS, CELL = 8, 8, 32
ATLAS = COLS * CELL  # 256

# Deterministic so re-running the tool doesn't thrash git diffs randomly.
RNG = random.Random(20260715)


def clamp(v: int, lo: int = 0, hi: int = 255) -> int:
    return max(lo, min(hi, v))


def rgb(h: str) -> tuple[int, int, int]:
    h = h.lstrip("#")
    return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)


def mix(a: tuple[int, int, int], b: tuple[int, int, int], t: float) -> tuple[int, int, int]:
    return (
        clamp(int(a[0] + (b[0] - a[0]) * t)),
        clamp(int(a[1] + (b[1] - a[1]) * t)),
        clamp(int(a[2] + (b[2] - a[2]) * t)),
    )


def vary(c: tuple[int, int, int], amt: int = 12) -> tuple[int, int, int]:
    return (
        clamp(c[0] + RNG.randint(-amt, amt)),
        clamp(c[1] + RNG.randint(-amt, amt)),
        clamp(c[2] + RNG.randint(-amt, amt)),
    )


def new_tile(fill: tuple[int, int, int] | None = None) -> Image.Image:
    im = Image.new("RGBA", (CELL, CELL), (0, 0, 0, 0))
    if fill is not None:
        im.paste((*fill, 255), [0, 0, CELL, CELL])
    return im


def noise_fill(im: Image.Image, base: tuple[int, int, int], amt: int = 14, density: float = 1.0) -> None:
    px = im.load()
    for y in range(CELL):
        for x in range(CELL):
            if density < 1.0 and RNG.random() > density:
                continue
            px[x, y] = (*vary(base, amt), 255)


def speckles(im: Image.Image, color: tuple[int, int, int], count: int, size: int = 1) -> None:
    px = im.load()
    for _ in range(count):
        x = RNG.randint(0, CELL - 1)
        y = RNG.randint(0, CELL - 1)
        for dy in range(size):
            for dx in range(size):
                xx, yy = (x + dx) % CELL, (y + dy) % CELL
                px[xx, yy] = (*vary(color, 8), 255)


def h_lines(im: Image.Image, color: tuple[int, int, int], every: int, thickness: int = 1, jitter: int = 6) -> None:
    px = im.load()
    for y in range(0, CELL, every):
        c = vary(color, jitter)
        for t in range(thickness):
            yy = min(CELL - 1, y + t)
            for x in range(CELL):
                if RNG.random() < 0.12:
                    continue
                px[x, yy] = (*vary(c, 4), 255)


def v_lines(im: Image.Image, color: tuple[int, int, int], every: int, thickness: int = 1, jitter: int = 6) -> None:
    px = im.load()
    for x in range(0, CELL, every):
        c = vary(color, jitter)
        for t in range(thickness):
            xx = min(CELL - 1, x + t)
            for y in range(CELL):
                if RNG.random() < 0.1:
                    continue
                px[xx, y] = (*vary(c, 4), 255)


# --- Per-slot generators -------------------------------------------------------

def gen_grass_top() -> Image.Image:
    im = new_tile()
    base = rgb("#3f9a38")
    dark = rgb("#2d6f2a")
    light = rgb("#6bc45a")
    blade = rgb("#8fd96a")
    noise_fill(im, base, 10)
    speckles(im, dark, 40, 1)
    speckles(im, light, 50, 1)
    # Small blade clusters
    px = im.load()
    for _ in range(28):
        x, y = RNG.randint(1, CELL - 2), RNG.randint(1, CELL - 2)
        c = vary(blade, 10)
        px[x, y] = (*c, 255)
        if RNG.random() < 0.5:
            px[x, y - 1] = (*mix(c, light, 0.3), 255)
    # Corner darken for subtle patchiness
    for y in range(CELL):
        for x in range(CELL):
            d = (abs(x - 16) + abs(y - 16)) / 32
            if d > 0.85 and RNG.random() < 0.3:
                r, g, b, a = px[x, y]
                px[x, y] = (*mix((r, g, b), dark, 0.25), a)
    return im


def gen_grass_side() -> Image.Image:
    """Top course of a 3-high grass stack: soft dirt body + grass transition at TOP.
    No modular crosshatch — dirt is noise-only so it reads as soil, not a grid."""
    im = new_tile()
    dirt = rgb("#6b4a2f")
    dirt_d = rgb("#4e3420")
    dirt_l = rgb("#8a6540")
    grass = rgb("#4a9c3e")
    grass_d = rgb("#2f6e2a")
    fringe = rgb("#8fd96a")
    px = im.load()
    # Dirt body (lower ~2/3) — pure noise, no (x+y)% patterns
    for y in range(11, CELL):
        for x in range(CELL):
            px[x, y] = (*vary(dirt, 14), 255)
    speckles(im, dirt_d, 40, 1)
    speckles(im, dirt_l, 25, 1)
    # Re-assert dirt only on the body (speckles may have painted the grass zone)
    for y in range(0, 11):
        for x in range(CELL):
            px[x, y] = (0, 0, 0, 0)
    # Grass cap + transition (file-top = world-top)
    for y in range(0, 12):
        for x in range(CELL):
            if y < 3:
                c = vary(fringe if RNG.random() < 0.4 else grass, 10)
            elif y < 7:
                c = vary(mix(grass, grass_d, (y - 3) / 4), 8)
            else:
                c = vary(mix(grass_d, dirt, (y - 7) / 4), 8)
            px[x, y] = (*c, 255)
    # Jagged dirt↔grass seam (organic, not diagonal hatch)
    for x in range(CELL):
        edge = 10 + RNG.randint(-2, 2)
        for y in range(max(5, edge - 2), min(CELL, edge + 3)):
            if y < edge:
                px[x, y] = (*vary(grass_d if RNG.random() < 0.5 else grass, 7), 255)
            else:
                px[x, y] = (*vary(dirt, 10), 255)
    # Hanging blades
    for _ in range(10):
        x = RNG.randint(0, CELL - 1)
        for y in range(RNG.randint(8, 14), RNG.randint(14, 18)):
            if y < CELL:
                px[x, y] = (*vary(grass_d, 6), 255)
    return im


def gen_grass_base() -> Image.Image:
    """Bottom course: soft dirt body + rough grass/root trim at FOOT. No crosshatch."""
    im = new_tile()
    dirt = rgb("#6b4a2f")
    dirt_d = rgb("#4e3420")
    grass = rgb("#3d7a32")
    grass_d = rgb("#2a5524")
    root = rgb("#3a2a18")
    fringe = rgb("#5a9a40")
    px = im.load()
    # Dirt body (upper ~2/3) — noise only
    for y in range(0, CELL - 9):
        for x in range(CELL):
            px[x, y] = (*vary(dirt, 14), 255)
    speckles(im, dirt_d, 35, 1)
    # Foot grass/root band
    for y in range(CELL - 10, CELL):
        for x in range(CELL):
            t = (y - (CELL - 10)) / 9.0
            if t < 0.25:
                c = vary(mix(dirt, root, 0.55), 8)
            elif t < 0.55:
                c = vary(grass_d if RNG.random() < 0.5 else grass, 10)
            else:
                c = vary(fringe if RNG.random() < 0.55 else grass, 10)
            if RNG.random() < 0.14:
                c = vary(root, 6)
            px[x, y] = (*c, 255)
    for x in range(CELL):
        edge = CELL - 10 + RNG.randint(-2, 2)
        for y in range(max(0, edge - 2), min(CELL, edge + 3)):
            if y < edge:
                px[x, y] = (*vary(dirt_d, 8), 255)
            else:
                px[x, y] = (*vary(grass_d, 7), 255)
    for _ in range(24):
        x = RNG.randint(0, CELL - 1)
        y0 = CELL - 12 - RNG.randint(0, 5)
        for y in range(max(0, y0), CELL - 4):
            if RNG.random() < 0.6:
                px[x, y] = (*vary(grass if RNG.random() < 0.5 else root, 8), 255)
    return im


def gen_dirt() -> Image.Image:
    """Soft soil — noise + speckles only, no modular hatch grid."""
    im = new_tile()
    base = rgb("#6b4a2f")
    dark = rgb("#4a321f")
    light = rgb("#8a6540")
    pebble = rgb("#5a5040")
    noise_fill(im, base, 14)
    speckles(im, dark, 50, 1)
    speckles(im, light, 30, 1)
    speckles(im, pebble, 10, 2)
    return im


def gen_stone() -> Image.Image:
    im = new_tile()
    base = rgb("#8a8a8a")
    dark = rgb("#5e5e5e")
    light = rgb("#b0b0b0")
    noise_fill(im, base, 11)
    # Crack / joint lines
    px = im.load()
    for _ in range(6):
        x0, y0 = RNG.randint(0, CELL - 1), RNG.randint(0, CELL - 1)
        for step in range(RNG.randint(6, 14)):
            x0 = clamp(x0 + RNG.randint(-1, 1), 0, CELL - 1)
            y0 = clamp(y0 + RNG.randint(-1, 1), 0, CELL - 1)
            px[x0, y0] = (*vary(dark, 5), 255)
    speckles(im, light, 40, 1)
    speckles(im, dark, 30, 1)
    return im


def gen_sand() -> Image.Image:
    im = new_tile()
    base = rgb("#d9c98a")
    dark = rgb("#b8a56a")
    light = rgb("#f0e4b0")
    noise_fill(im, base, 10)
    speckles(im, dark, 45, 1)
    speckles(im, light, 40, 1)
    # Soft dune ripples
    px = im.load()
    for y in range(CELL):
        for x in range(CELL):
            wave = math.sin((x + y * 0.4) * 0.55) * 0.5 + 0.5
            if wave > 0.72 and RNG.random() < 0.45:
                r, g, b, a = px[x, y]
                px[x, y] = (*mix((r, g, b), light, 0.35), a)
    return im


def gen_bedrock() -> Image.Image:
    im = new_tile()
    base = rgb("#1e1e22")
    mid = rgb("#2c2c32")
    light = rgb("#3a3a44")
    noise_fill(im, base, 8)
    speckles(im, mid, 50, 1)
    speckles(im, light, 20, 1)
    # Harsh blocky cracks
    px = im.load()
    for _ in range(8):
        x = RNG.randint(0, CELL - 1)
        for y in range(CELL):
            if RNG.random() < 0.7:
                px[x, y] = (*vary(base, 4), 255)
            x = clamp(x + RNG.choice([-1, 0, 0, 1]), 0, CELL - 1)
    return im


def gen_water() -> Image.Image:
    im = new_tile()
    deep = rgb("#1e5a9a")
    mid = rgb("#2f7fd0")
    light = rgb("#5ab0ef")
    foam = rgb("#a8d8ff")
    px = im.load()
    for y in range(CELL):
        for x in range(CELL):
            w = math.sin(x * 0.45 + y * 0.2) * 0.5 + math.cos(y * 0.55) * 0.5
            t = (w + 1) * 0.5
            c = mix(deep, mid, t)
            if t > 0.7:
                c = mix(c, light, 0.4)
            px[x, y] = (*vary(c, 6), 210)  # slight translucency hint in alpha
    # Sparse foam highlights
    for _ in range(18):
        x, y = RNG.randint(0, CELL - 1), RNG.randint(0, CELL - 1)
        px[x, y] = (*vary(foam, 8), 230)
    return im


def gen_wood() -> Image.Image:
    """End-grain log rings (top of logs / wood block)."""
    im = new_tile()
    bark = rgb("#5a3a1c")
    heart = rgb("#c49a5a")
    ring = rgb("#8a5a2f")
    light = rgb("#d4b078")
    px = im.load()
    cx, cy = 15.5, 15.5
    for y in range(CELL):
        for x in range(CELL):
            dx, dy = x - cx, y - cy
            r = math.hypot(dx, dy)
            # Outer bark ring
            if r > 14.5:
                px[x, y] = (*vary(bark, 8), 255)
                continue
            band = math.sin(r * 1.35) * 0.5 + 0.5
            c = mix(heart, ring, band)
            if r < 2.2:
                c = mix(c, light, 0.35)
            px[x, y] = (*vary(c, 6), 255)
    return im


def gen_planks() -> Image.Image:
    im = new_tile()
    base = rgb("#a97a4a")
    dark = rgb("#7a5530")
    light = rgb("#c99860")
    grain = rgb("#8e6238")
    # Vertical plank boards
    board_w = 8
    px = im.load()
    for x in range(CELL):
        board = x // board_w
        shade = 0.0 if board % 2 == 0 else 0.12
        for y in range(CELL):
            c = mix(base, dark, shade)
            # wood grain
            if (y + board * 3) % 7 == 0:
                c = mix(c, grain, 0.4)
            px[x, y] = (*vary(c, 7), 255)
    # Board seams
    for x in range(board_w - 1, CELL, board_w):
        for y in range(CELL):
            px[x, y] = (*vary(dark, 4), 255)
    speckles(im, light, 20, 1)
    return im


def gen_books() -> Image.Image:
    im = new_tile()
    shelf = rgb("#5a3a1e")
    colors = [
        rgb("#7a2f2f"),
        rgb("#2f4a7a"),
        rgb("#2f6a3a"),
        rgb("#6a4a1f"),
        rgb("#5a2f6a"),
        rgb("#8a5a20"),
        rgb("#1f5a5a"),
    ]
    px = im.load()
    # Shelf wood background
    for y in range(CELL):
        for x in range(CELL):
            px[x, y] = (*vary(shelf, 6), 255)
    # Horizontal shelves
    for sy in (0, 10, 21):
        for y in range(sy, min(CELL, sy + 2)):
            for x in range(CELL):
                px[x, y] = (*vary(mix(shelf, rgb("#3a2410"), 0.4), 4), 255)
    # Books in rows
    for row_y, row_h in ((2, 7), (12, 8), (23, 8)):
        x = 1
        while x < CELL - 1:
            w = RNG.randint(2, 4)
            col = colors[RNG.randint(0, len(colors) - 1)]
            for yy in range(row_y, min(CELL - 1, row_y + row_h)):
                for xx in range(x, min(CELL - 1, x + w)):
                    # Spine highlight
                    c = col if xx > x else mix(col, (255, 255, 255), 0.15)
                    px[xx, yy] = (*vary(c, 5), 255)
            x += w + 1
    return im


def gen_glass() -> Image.Image:
    """Clear translucent glass block — soft tint, subtle rim, no busy diagonal hatch."""
    im = new_tile()
    px = im.load()
    for y in range(CELL):
        for x in range(CELL):
            # Soft center-to-edge falloff (pane looks thicker at edges, clearer center)
            dx = (x - (CELL - 1) / 2) / (CELL / 2)
            dy = (y - (CELL - 1) / 2) / (CELL / 2)
            dist = min(1.0, math.sqrt(dx * dx + dy * dy))
            # Cool aqua tint
            r = clamp(int(140 + 30 * (1 - dist) + RNG.randint(-6, 6)))
            g = clamp(int(190 + 25 * (1 - dist) + RNG.randint(-6, 6)))
            b = clamp(int(210 + 30 * (1 - dist) + RNG.randint(-6, 6)))
            a = clamp(int(55 + 70 * dist * dist))  # more opaque at rim, clearer center
            px[x, y] = (r, g, b, a)
    # Thin bright rim (1 px) so cube edges read against the sky
    rim = (210, 235, 245, 160)
    for i in range(CELL):
        px[i, 0] = rim
        px[i, CELL - 1] = rim
        px[0, i] = rim
        px[CELL - 1, i] = rim
    # Single soft specular blotch (not a diagonal hatch line)
    for _ in range(18):
        x = RNG.randint(6, 14)
        y = RNG.randint(6, 14)
        r, g, b, a = px[x, y]
        px[x, y] = (
            clamp(r + 40),
            clamp(g + 35),
            clamp(b + 30),
            clamp(a + 40),
        )
    return im


def _draw_bricks(
    im: Image.Image,
    y0: int,
    y1: int,
    base: tuple[int, int, int],
    dark: tuple[int, int, int],
    light: tuple[int, int, int],
    mortar: tuple[int, int, int],
    brick_h: int = 8,
    brick_w: int = 14,
) -> None:
    px = im.load()
    for y in range(y0, y1):
        row = (y - y0) // brick_h
        offset = (brick_w // 2) if row % 2 else 0
        for x in range(CELL):
            if (y - y0) % brick_h == 0 or (x - offset) % brick_w == 0:
                px[x, y] = (*vary(mortar, 4), 255)
            else:
                bx = (x - offset) // brick_w
                seed = (row * 17 + bx * 31) & 7
                c = mix(base, light if seed < 3 else dark, 0.2 + seed * 0.05)
                px[x, y] = (*vary(c, 5), 255)


def gen_wall(course: str) -> Image.Image:
    """Dungeon wall side courses for 3-high stacks (depth 0=cap, 1=mid, 2+=base)."""
    base = rgb("#5c5c5c")
    dark = rgb("#404040")
    light = rgb("#7a7a7a")
    mortar = rgb("#2a2a2a")
    im = new_tile()

    if course == "mid":
        # Plain brick — full tile
        _draw_bricks(im, 0, CELL, base, dark, light, mortar)
        speckles(im, light, 12, 1)
        return im

    if course == "base":
        # Brick body with green grass trim along the FOOT of the wall (y near CELL-1)
        _draw_bricks(im, 0, CELL - 6, base, dark, light, mortar)
        grass = rgb("#4a9c3e")
        grass_d = rgb("#2f6e2a")
        fringe = rgb("#7ecf55")
        dirt = rgb("#5a3f28")
        px = im.load()
        for y in range(CELL - 6, CELL):
            for x in range(CELL):
                t = (y - (CELL - 6)) / 5
                if t < 0.35:
                    c = vary(mix(base, dirt, 0.4), 6)
                elif t < 0.7:
                    c = vary(grass_d if RNG.random() < 0.4 else grass, 8)
                else:
                    c = vary(fringe if RNG.random() < 0.45 else grass, 8)
                px[x, y] = (*c, 255)
        # Jagged grass line into brick
        for x in range(CELL):
            edge = CELL - 6 + RNG.randint(-1, 1)
            for y in range(max(0, edge - 1), min(CELL, edge + 1)):
                if y < edge:
                    px[x, y] = (*vary(dark, 4), 255)
                else:
                    px[x, y] = (*vary(grass_d, 6), 255)
        return im

    # cap — brick with weather moulding / cornice along the TOP edge
    _draw_bricks(im, 6, CELL, base, dark, light, mortar)
    px = im.load()
    mould_light = rgb("#9a9a9a")
    mould_mid = rgb("#707070")
    mould_dark = rgb("#3a3a3a")
    # Stepped cornice (3 bands)
    for y in range(0, 6):
        for x in range(CELL):
            if y <= 1:
                c = mould_light
            elif y <= 3:
                c = mould_mid
            else:
                c = mould_dark
            # Bevel highlight on top edge
            if y == 0 and x % 3 != 0:
                c = mix(c, (255, 255, 255), 0.15)
            # Underside shadow of moulding
            if y == 5:
                c = mix(c, mortar, 0.5)
            px[x, y] = (*vary(c, 5), 255)
    # Small drip notches every few bricks
    for x in range(2, CELL, 8):
        for y in range(4, 7):
            if x < CELL:
                px[x, y] = (*vary(mould_dark, 3), 255)
    speckles(im, light, 10, 1)
    return im


def gen_wall_top() -> Image.Image:
    """Top-down view of a dungeon wall cap (looking straight down)."""
    im = new_tile()
    base = rgb("#6a6a6a")
    dark = rgb("#454545")
    light = rgb("#8a8a8a")
    mortar = rgb("#2e2e2e")
    noise_fill(im, base, 8)
    # Checker / cobble tiles
    px = im.load()
    tile = 8
    for y in range(CELL):
        for x in range(CELL):
            tx, ty = x // tile, y // tile
            if x % tile == 0 or y % tile == 0:
                px[x, y] = (*vary(mortar, 4), 255)
            else:
                seed = (tx * 13 + ty * 7) & 7
                c = mix(base, light if seed < 3 else dark, 0.15 + seed * 0.04)
                px[x, y] = (*vary(c, 6), 255)
    # Outer rim (weathered edge of wall top)
    for i in range(CELL):
        for t in range(2):
            px[i, t] = (*vary(dark, 4), 255)
            px[i, CELL - 1 - t] = (*vary(dark, 4), 255)
            px[t, i] = (*vary(dark, 4), 255)
            px[CELL - 1 - t, i] = (*vary(dark, 4), 255)
    speckles(im, light, 18, 1)
    return im


def gen_unit() -> Image.Image:
    """Bright unit placeholder — readable standee tile."""
    im = new_tile()
    gold = rgb("#e8d24a")
    dark = rgb("#a89020")
    light = rgb("#fff0a0")
    noise_fill(im, gold, 8)
    # Diamond mark
    px = im.load()
    cx, cy = 15, 15
    for y in range(CELL):
        for x in range(CELL):
            d = abs(x - cx) + abs(y - cy)
            if d < 6:
                px[x, y] = (*vary(light, 6), 255)
            elif d < 8:
                px[x, y] = (*vary(dark, 5), 255)
    # Border
    for i in range(CELL):
        px[i, 0] = (*dark, 255)
        px[i, CELL - 1] = (*dark, 255)
        px[0, i] = (*dark, 255)
        px[CELL - 1, i] = (*dark, 255)
    return im


def gen_gas() -> Image.Image:
    im = new_tile()
    base = (90, 170, 85)
    light = (150, 220, 130)
    dark = (50, 110, 55)
    px = im.load()
    for y in range(CELL):
        for x in range(CELL):
            n = (
                math.sin(x * 0.4 + y * 0.25) * 0.4
                + math.cos(y * 0.5 - x * 0.15) * 0.4
                + RNG.random() * 0.2
            )
            t = clamp(int((n + 1) * 0.5 * 255), 0, 255) / 255
            c = mix(dark, light, t)
            a = int(80 + 100 * t)
            px[x, y] = (*c, a)
    speckles(im, light, 12, 1)
    return im


def _cliff_base_colors():
    """Chunky JRPG cliff palette — cool taupe rock, purple-brown crevices, cel ramps.

    Style refs: stacked outlined boulders / basalt columns (not brick shelves).
    """
    return {
        "hi": rgb("#cfc6b6"),        # sunlit stone facet
        "mid": rgb("#9a9080"),       # main rock body
        "shade": rgb("#5c5348"),     # underside of each stone
        "deep": rgb("#2e2824"),      # crevice between stones
        "dark": rgb("#181410"),      # hard outline
        "rim": rgb("#e8e0d0"),       # hot highlight chip
        "dirt": rgb("#6b4a2f"),
        "dirt_l": rgb("#8a6540"),
        "grass": rgb("#4a9c3e"),
        "grass_d": rgb("#2f6e2a"),
        "grass_l": rgb("#8fd96a"),
        "moss": rgb("#4a6838"),
    }


def _set(px, x, y, col):
    if 0 <= x < CELL and 0 <= y < CELL:
        px[x, y] = (*col, 255)


def _hline(px, y, x0, x1, col, jitter=0):
    for x in range(max(0, x0), min(CELL, x1 + 1)):
        c = vary(col, jitter) if jitter else col
        _set(px, x, y, c)


def _draw_boulder(px, cx, cy, rx, ry, c, *, darker=False, column=False):
    """Single cel-shaded stone: hard outline, TL highlight, BR shade.

    column=True → taller prism / basalt-column silhouette (side faces).
    column=False → flatter cobble (top faces).
    """
    hi = mix(c["hi"], c["shade"], 0.12) if darker else c["hi"]
    mid = mix(c["mid"], c["shade"], 0.18) if darker else c["mid"]
    sh = mix(c["shade"], c["deep"], 0.12) if darker else c["shade"]
    rim = c["rim"] if not darker else c["hi"]
    outline = c["dark"]

    x0 = max(0, int(cx - rx) - 2)
    x1 = min(CELL - 1, int(cx + rx) + 2)
    y0 = max(0, int(cy - ry) - 2)
    y1 = min(CELL - 1, int(cy + ry) + 2)

    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            warp = ((x * 19 + y * 37) % 9) / 9.0 - 0.5
            dx = (x + 0.5 - cx) / max(0.55, rx * (1.0 + warp * 0.16))
            dy = (y + 0.5 - cy) / max(0.55, ry * (1.0 - warp * 0.10))
            if column:
                # Faceted column: flatter sides, slightly rounded top/bottom
                d2 = (abs(dx) ** 1.35) ** 2 + (abs(dy) ** 1.12) ** 2
            else:
                d_ell = dx * dx + dy * dy
                d_hex = max(abs(dx), abs(dy) * 0.9) ** 2 + min(abs(dx), abs(dy)) ** 2 * 0.3
                d2 = d_ell * 0.5 + d_hex * 0.5
            if d2 > 1.08:
                continue
            # Hard dark outline
            if d2 > 0.72:
                px[x, y] = (*vary(outline, 1), 255)
                continue
            # Top facet band (lighter cap on each stone — classic tileset cliff read)
            top_facet = dy < -0.25 and abs(dx) < 0.75
            light = (-dx * 0.55 - dy * 0.8)
            if top_facet and d2 < 0.55:
                col = rim if light > 0.2 else hi
            elif light > 0.22 and d2 < 0.4:
                col = hi
            elif light < -0.2 or dy > 0.4:
                col = sh
            else:
                col = mid
            if (x * 11 + y * 5) % 13 == 0:
                col = mix(col, sh, 0.15)
            px[x, y] = (*vary(col, 2), 255)


def _paint_rocky_face(im, *, rim_grass=False, darken=0.0):
    """Cliff SIDE — stacked outlined columns / boulders (JRPG outdoor tileset).

    Inspired by basalt-column + cobble cliff sheets: tall faceted stones,
    deep crevices, hard outlines, cel ramps. Not brick shelves.
    rim_grass: hanging tufts only on the top edge (top course).
    """
    c = _cliff_base_colors()
    if darken > 0.05:
        c = {
            **c,
            "hi": mix(c["hi"], c["shade"], 0.2 * darken / 0.12),
            "mid": mix(c["mid"], c["shade"], 0.25 * darken / 0.12),
            "shade": mix(c["shade"], c["deep"], 0.18),
            "rim": mix(c["rim"], c["mid"], 0.25),
        }
    px = im.load()

    # Deep crevice fill
    for y in range(CELL):
        for x in range(CELL):
            t = y / max(1, CELL - 1)
            col = mix(c["deep"], c["dark"], 0.35 + t * 0.25)
            px[x, y] = (*vary(col, 2), 255)

    # Vertical-leaning columns in staggered rows (side face, not top-down cobbles)
    # (cx, cy, rx, ry) — ry taller than rx for column read
    rows = [
        # bottom (clipped)
        [(4, 27, 4, 6), (11, 28, 4, 5), (18, 27, 4, 6), (25, 28, 4, 5), (30, 27, 3, 5)],
        # lower mid
        [(3, 20, 4, 6), (10, 19, 4, 7), (17, 20, 4, 6), (24, 19, 4, 7), (30, 20, 3, 5)],
        # mid
        [(4, 12, 4, 6), (11, 13, 4, 6), (18, 12, 4, 7), (25, 13, 4, 6), (31, 12, 3, 5)],
        # upper
        [(3, 5, 4, 5), (10, 4, 4, 6), (17, 5, 4, 5), (24, 4, 4, 6), (30, 5, 3, 5)],
        # top lip — slightly shorter heads
        [(5, 1, 4, 3), (13, 0, 4, 3), (21, 1, 4, 3), (28, 0, 3, 3)],
    ]
    for ri, row in enumerate(rows):
        darker = darken > 0.08 and ri < 2
        for cx, cy, rx, ry in row:
            jx = RNG.randint(-1, 1)
            jy = RNG.randint(0, 1) if ri < 4 else 0
            _draw_boulder(px, cx + jx, cy + jy, rx, ry, c, darker=darker, column=True)

    # Small wedge stones plugging gaps
    for cx, cy, rx, ry in [
        (7, 23, 3, 4), (21, 23, 3, 4), (14, 16, 3, 4),
        (28, 16, 3, 3), (7, 8, 3, 3), (21, 9, 3, 3),
    ]:
        _draw_boulder(px, cx, cy, rx, ry, c, darker=darken > 0.08, column=True)

    # Deepen vertical crevices between columns
    for _ in range(8):
        x = RNG.randint(2, CELL - 3)
        y = RNG.randint(0, CELL - 1)
        for _s in range(RNG.randint(6, 14)):
            px[x, y] = (*vary(c["dark"], 1), 255)
            if 0 <= x - 1 < CELL:
                r, g, b, a = px[x - 1, y]
                if r + g + b < 380:
                    px[x - 1, y] = (*mix((r, g, b), c["deep"], 0.4), 255)
            x = clamp(x + RNG.choice([-1, 0, 0, 1]), 1, CELL - 2)
            y = clamp(y + 1, 0, CELL - 1)

    # Highlight chips on column tops
    for _ in range(14):
        x, y = RNG.randint(1, CELL - 2), RNG.randint(0, CELL // 2)
        r, g, b, a = px[x, y]
        if r + g + b > 300:
            px[x, y] = (*vary(c["rim"], 2), 255)

    if rim_grass:
        # Hanging grass tufts from the plateau — irregular, not a painted band
        for x in range(CELL):
            if RNG.random() < 0.12:
                continue
            # denser tufts, occasional skip for gaps
            if RNG.random() < 0.18:
                continue
            length = RNG.randint(3, 7)
            ox = 0 if RNG.random() < 0.7 else RNG.choice([-1, 1])
            for dy in range(length):
                xx = clamp(x + ox, 0, CELL - 1)
                yy = dy
                if yy >= 10:
                    break
                if dy == 0:
                    col = c["grass_l"] if RNG.random() < 0.5 else c["grass"]
                elif dy < length - 1:
                    col = c["grass"] if RNG.random() < 0.55 else c["grass_d"]
                else:
                    col = c["moss"] if RNG.random() < 0.55 else c["grass_d"]
                px[xx, yy] = (*vary(col, 5), 255)
                if RNG.random() < 0.4 and xx + 1 < CELL:
                    px[xx + 1, yy] = (*vary(col, 5), 255)
            # small overhang drip to the side
            if RNG.random() < 0.35 and length > 3:
                drip_x = clamp(x + RNG.choice([-1, 1, 2]), 0, CELL - 1)
                px[drip_x, min(CELL - 1, length)] = (*vary(c["grass_d"], 4), 255)


def _cliff_apply_foot(im, foot):
    """Overlay substrate foot trim on lower ~8 px of a cliff face."""
    c = _cliff_base_colors()
    px = im.load()
    if foot == "grass":
        f_d, f_c, f_l = c["dirt"], c["grass_d"], c["grass"]
    elif foot == "sand":
        f_d, f_c, f_l = rgb("#b8a56a"), rgb("#d9c98a"), rgb("#f0e4b0")
    elif foot == "stone":
        f_d, f_c, f_l = rgb("#3e3c38"), rgb("#6a6860"), rgb("#8a8880")
    elif foot == "mud":
        f_d, f_c, f_l = rgb("#241c16"), rgb("#3a2e22"), rgb("#524030")
    elif foot == "water":
        f_d, f_c, f_l = rgb("#2a4a5a"), rgb("#3a6a7a"), rgb("#5a9aaa")
    else:
        f_d, f_c, f_l = c["dirt"], c["grass_d"], c["grass"]

    foot_start = CELL - 8
    for y in range(foot_start, CELL):
        for x in range(CELL):
            t = (y - foot_start) / 7.0
            if t < 0.3:
                r, g, b, a = px[x, y]
                col = mix((r, g, b), f_d, t / 0.3)
            elif t < 0.65:
                col = f_d if RNG.random() < 0.4 else f_c
            else:
                col = f_l if RNG.random() < 0.4 else f_c
            px[x, y] = (*vary(col, 6), 255)
    # Jagged contact line under lowest boulders
    for x in range(CELL):
        edge = foot_start + RNG.randint(-1, 1)
        for y in range(max(0, edge - 1), min(CELL, edge + 2)):
            if y < edge:
                px[x, y] = (*vary(c["deep"], 3), 255)
            else:
                px[x, y] = (*vary(f_d, 5), 255)
    return im


def gen_cliff_top():
    """Cliff TOP — packed rounded stones from above (tileset plateau surface)."""
    c = _cliff_base_colors()
    im = new_tile()
    px = im.load()

    # Crevice / dirt under stones
    for y in range(CELL):
        for x in range(CELL):
            col = mix(c["deep"], c["shade"], 0.35)
            px[x, y] = (*vary(col, 3), 255)

    # Top-down cobbles — slightly flatter ellipses, packed tight
    stones = [
        (6, 6, 6, 5), (15, 5, 5, 5), (24, 6, 6, 5),
        (4, 14, 5, 5), (12, 13, 6, 5), (21, 14, 5, 5), (28, 13, 4, 5),
        (7, 21, 6, 5), (16, 22, 5, 5), (25, 21, 6, 5),
        (5, 28, 5, 4), (14, 28, 6, 4), (23, 28, 5, 4),
        (10, 9, 4, 4), (19, 18, 4, 4), (27, 24, 3, 3),
    ]
    for cx, cy, rx, ry in stones:
        _draw_boulder(px, cx + RNG.randint(-1, 1), cy + RNG.randint(-1, 1), rx, ry, c, darker=False)

    # Sparse grit / highlight
    speckles(im, c["rim"], 8, 1)
    speckles(im, c["dark"], 6, 1)
    return im


def gen_cliff_side():
    """Top course — stacked boulders only (no green lip).

    Grass belongs on grass blocks / CLIFF_BASE foot trims sitting on grass — NOT painted
    onto the upper cliff face (reads as 'green trim on top block' and looks wrong).
    """
    im = new_tile()
    _paint_rocky_face(im, rim_grass=False, darken=0.0)
    return im


def gen_cliff_mid():
    """Mid face — pure stacked boulders, no grass."""
    im = new_tile()
    _paint_rocky_face(im, rim_grass=False, darken=0.12)
    return im


def gen_cliff_base():
    """Bottom foot used ONLY when cliff sits on grass (FOOT_CLIFF.grass → CLIFF_BASE).

    Pure rock + grass substrate trim. Never used as the default cliff side — mid rock
    (CLIFF_MID) is the non-grass foot, so green only appears when connected to grass.
    """
    im = new_tile()
    _paint_rocky_face(im, rim_grass=False, darken=0.05)
    return _cliff_apply_foot(im, "grass")


def gen_mud() -> Image.Image:
    """Dark wet soil — soft noise, no hatch."""
    im = new_tile()
    base = rgb("#3a2e22")
    dark = rgb("#241c16")
    light = rgb("#524030")
    wet = rgb("#2a2218")
    noise_fill(im, base, 12)
    speckles(im, dark, 55, 1)
    speckles(im, light, 22, 1)
    speckles(im, wet, 18, 2)
    return im


def _gen_grass_foot(foot: str) -> Image.Image:
    """Dirt body (upper) + material-specific foot trim (lower). foot: stone|sand|mud|water."""
    im = new_tile()
    dirt = rgb("#6b4a2f")
    dirt_d = rgb("#4e3420")
    px = im.load()
    for y in range(0, CELL - 9):
        for x in range(CELL):
            px[x, y] = (*vary(dirt, 14), 255)
    speckles(im, dirt_d, 30, 1)

    if foot == "stone":
        foot_c = rgb("#6a6860")
        foot_d = rgb("#3e3c38")
        foot_l = rgb("#8a8880")
    elif foot == "sand":
        foot_c = rgb("#d9c98a")
        foot_d = rgb("#b8a56a")
        foot_l = rgb("#f0e4b0")
    elif foot == "water":
        foot_c = rgb("#3a6a5a")
        foot_d = rgb("#2a4a40")
        foot_l = rgb("#5a9a80")
    else:  # mud
        foot_c = rgb("#3a2e22")
        foot_d = rgb("#241c16")
        foot_l = rgb("#524030")

    for y in range(CELL - 9, CELL):
        for x in range(CELL):
            t = (y - (CELL - 9)) / 8.0
            if t < 0.3:
                col = mix(dirt_d, foot_d, t / 0.3)
            elif t < 0.65:
                col = foot_d if RNG.random() < 0.45 else foot_c
            else:
                col = foot_l if RNG.random() < 0.4 else foot_c
            px[x, y] = (*vary(col, 10), 255)
    for x in range(CELL):
        edge = CELL - 9 + RNG.randint(-2, 2)
        for y in range(max(0, edge - 2), min(CELL, edge + 3)):
            if y < edge:
                px[x, y] = (*vary(dirt_d, 8), 255)
            else:
                px[x, y] = (*vary(foot_d, 8), 255)
    # Loose chunks of the foot material climbing into dirt
    for _ in range(20):
        x = RNG.randint(0, CELL - 1)
        y0 = CELL - 11 - RNG.randint(0, 4)
        for y in range(max(0, y0), CELL - 2):
            if RNG.random() < 0.55:
                px[x, y] = (*vary(foot_c if RNG.random() < 0.5 else foot_d, 8), 255)
    return im


def gen_cliff_foot_sand() -> Image.Image:
    im = new_tile()
    _paint_rocky_face(im, rim_grass=False, darken=0.12)
    return _cliff_apply_foot(im, "sand")


def gen_cliff_foot_stone() -> Image.Image:
    im = new_tile()
    _paint_rocky_face(im, rim_grass=False, darken=0.12)
    return _cliff_apply_foot(im, "stone")


def gen_cliff_foot_mud() -> Image.Image:
    im = new_tile()
    _paint_rocky_face(im, rim_grass=False, darken=0.12)
    return _cliff_apply_foot(im, "mud")


def gen_cliff_foot_water() -> Image.Image:
    im = new_tile()
    _paint_rocky_face(im, rim_grass=False, darken=0.15)
    return _cliff_apply_foot(im, "water")


def _gen_stone_foot(foot: str) -> Image.Image:
    """Stone body + substrate foot trim (grass/sand/mud/water/dirt)."""
    im = gen_stone()
    px = im.load()
    if foot == "grass":
        f_c, f_d, f_l = rgb("#4a9c3e"), rgb("#2f6e2a"), rgb("#7ecf55")
        mid = rgb("#5a3f28")
    elif foot == "sand":
        f_c, f_d, f_l = rgb("#d9c98a"), rgb("#b8a56a"), rgb("#f0e4b0")
        mid = rgb("#8a7850")
    elif foot == "mud":
        f_c, f_d, f_l = rgb("#3a2e22"), rgb("#241c16"), rgb("#524030")
        mid = rgb("#2a2218")
    elif foot == "water":
        f_c, f_d, f_l = rgb("#3a6a7a"), rgb("#2a4a5a"), rgb("#5a9aaa")
        mid = rgb("#2a3a40")
    else:  # dirt
        f_c, f_d, f_l = rgb("#6b4a2f"), rgb("#4e3420"), rgb("#8a6540")
        mid = rgb("#5a3f28")
    stone_d = rgb("#5e5e5e")
    for y in range(CELL - 9, CELL):
        for x in range(CELL):
            t = (y - (CELL - 9)) / 8.0
            if t < 0.28:
                r, g, b, a = px[x, y]
                col = mix((r, g, b), mid, t / 0.28)
            elif t < 0.6:
                col = f_d if RNG.random() < 0.4 else f_c
            else:
                col = f_l if RNG.random() < 0.35 else f_c
            px[x, y] = (*vary(col, 10), 255)
    for x in range(CELL):
        edge = CELL - 9 + RNG.randint(-2, 2)
        for y in range(max(0, edge - 2), min(CELL, edge + 3)):
            if y < edge:
                px[x, y] = (*vary(stone_d, 6), 255)
            else:
                px[x, y] = (*vary(f_d, 8), 255)
    for _ in range(18):
        x = RNG.randint(0, CELL - 1)
        y0 = CELL - 11 - RNG.randint(0, 4)
        for y in range(max(0, y0), CELL - 2):
            if RNG.random() < 0.55:
                px[x, y] = (*vary(f_c if RNG.random() < 0.5 else f_d, 8), 255)
    return im


def _gen_wall_foot(foot: str) -> Image.Image:
    """Brick body + substrate foot (same idea as WALL_BASE grass, other materials)."""
    base = rgb("#5c5c5c")
    dark = rgb("#404040")
    light = rgb("#7a7a7a")
    mortar = rgb("#2a2a2a")
    im = new_tile()
    _draw_bricks(im, 0, CELL - 7, base, dark, light, mortar)
    if foot == "grass":
        f_c, f_d, f_l = rgb("#4a9c3e"), rgb("#2f6e2a"), rgb("#7ecf55")
        mid = rgb("#5a3f28")
    elif foot == "sand":
        f_c, f_d, f_l = rgb("#d9c98a"), rgb("#b8a56a"), rgb("#f0e4b0")
        mid = rgb("#8a7850")
    elif foot == "stone":
        f_c, f_d, f_l = rgb("#6a6860"), rgb("#3e3c38"), rgb("#8a8880")
        mid = rgb("#505048")
    elif foot == "mud":
        f_c, f_d, f_l = rgb("#3a2e22"), rgb("#241c16"), rgb("#524030")
        mid = rgb("#2a2218")
    else:  # water
        f_c, f_d, f_l = rgb("#3a6a7a"), rgb("#2a4a5a"), rgb("#5a9aaa")
        mid = rgb("#2a3a40")
    px = im.load()
    for y in range(CELL - 7, CELL):
        for x in range(CELL):
            t = (y - (CELL - 7)) / 6.0
            if t < 0.3:
                col = mix(mid, f_d, t / 0.3)
            elif t < 0.65:
                col = f_d if RNG.random() < 0.4 else f_c
            else:
                col = f_l if RNG.random() < 0.4 else f_c
            px[x, y] = (*vary(col, 8), 255)
    for x in range(CELL):
        edge = CELL - 7 + RNG.randint(-1, 2)
        for y in range(max(0, edge - 1), min(CELL, edge + 2)):
            if y < edge:
                px[x, y] = (*vary(dark, 4), 255)
            else:
                px[x, y] = (*vary(f_d, 6), 255)
    return im


GENERATORS = [
    ("GRASS_TOP", gen_grass_top),
    ("GRASS_SIDE", gen_grass_side),
    ("DIRT", gen_dirt),
    ("STONE", gen_stone),
    ("SAND", gen_sand),
    ("BEDROCK", gen_bedrock),
    ("WATER", gen_water),
    ("WOOD", gen_wood),
    ("PLANKS", gen_planks),
    ("BOOKS", gen_books),
    ("GLASS", gen_glass),
    ("WALL_CAP", lambda: gen_wall("cap")),    # 11 — top course moulding
    ("WALL_MID", lambda: gen_wall("mid")),    # 12 — plain brick
    ("WALL_BASE", lambda: gen_wall("base")),  # 13 — brick + grass trim
    ("UNIT", gen_unit),                       # 14
    ("GAS", gen_gas),                         # 15
    ("WALL_TOP", gen_wall_top),               # 16 — top-down wall cap
    ("GRASS_BASE", gen_grass_base),           # 17 — grass foot (default field)
    ("CLIFF_TOP", gen_cliff_top),             # 18
    ("CLIFF_SIDE", gen_cliff_side),           # 19
    ("CLIFF_MID", gen_cliff_mid),             # 20
    ("CLIFF_BASE", gen_cliff_base),           # 21 — rock + grass foot
    ("MUD", gen_mud),                         # 22
    ("GRASS_FOOT_STONE", lambda: _gen_grass_foot("stone")),  # 23
    ("GRASS_FOOT_SAND", lambda: _gen_grass_foot("sand")),    # 24
    ("GRASS_FOOT_MUD", lambda: _gen_grass_foot("mud")),      # 25
    ("CLIFF_FOOT_SAND", gen_cliff_foot_sand),                # 26
    ("WALL_FOOT_STONE", lambda: _gen_wall_foot("stone")),    # 27
    ("WALL_FOOT_SAND", lambda: _gen_wall_foot("sand")),      # 28
    ("WALL_FOOT_MUD", lambda: _gen_wall_foot("mud")),        # 29
    ("WALL_FOOT_WATER", lambda: _gen_wall_foot("water")),    # 30
    ("GRASS_FOOT_WATER", lambda: _gen_grass_foot("water")),  # 31
    ("CLIFF_FOOT_STONE", gen_cliff_foot_stone),              # 32
    ("CLIFF_FOOT_MUD", gen_cliff_foot_mud),                  # 33
    ("CLIFF_FOOT_WATER", gen_cliff_foot_water),              # 34
    ("STONE_FOOT_GRASS", lambda: _gen_stone_foot("grass")),  # 35
    ("STONE_FOOT_SAND", lambda: _gen_stone_foot("sand")),    # 36
    ("STONE_FOOT_MUD", lambda: _gen_stone_foot("mud")),      # 37
    ("STONE_FOOT_WATER", lambda: _gen_stone_foot("water")),  # 38
    ("STONE_FOOT_DIRT", lambda: _gen_stone_foot("dirt")),    # 39
]


def main() -> None:
    atlas = Image.new("RGBA", (ATLAS, ATLAS), (0, 0, 0, 0))
    for tex_id, (name, gen) in enumerate(GENERATORS):
        tile = gen()
        assert tile.size == (CELL, CELL), name
        col, row = tex_id % COLS, tex_id // COLS
        atlas.paste(tile, (col * CELL, row * CELL))
        print(f"  [{tex_id:2d}] {name:12s} → cell ({col},{row})")

    OUT.parent.mkdir(parents=True, exist_ok=True)
    atlas.save(OUT, "PNG")
    print(f"Wrote {OUT} ({ATLAS}×{ATLAS})")


if __name__ == "__main__":
    main()
