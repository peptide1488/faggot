#!/usr/bin/env python3
"""
Generate 32-bit JRPG spell FX spritesheet for the voxel spell overlay.

Layout: 8×5 cells of 32px → 256×160 PNG at src/voxel/textures/spell_fx.png

  0 soft_glow     1 spark        2 star         3 ring
  4 bolt_head     5 bolt_body    6 impact       7 pillar
  8 mote          9 flare       10 swirl       11 cross
 12 fire_blob    13 fire_burst  14 shockwave   15 ember
 16 lightning    17 zap_fork    18 cobweb      19 web_strand
 20 vine         21 leaf        22 ice_shard   23 snowflake
 24 poison_bubble 25 skull      26 insect      27 grease_drip
 28 sparkle      29 thorn       30 holy_ray    31 wind_slash
 32 magic_circle 33 multi_star  34 rune_ring   35 charge_orb
 36 debris       37 lens_flare  38 double_ring 39 spiral_arm
"""
from __future__ import annotations

import math
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "src" / "voxel" / "textures" / "spell_fx.png"

CELL = 32
COLS, ROWS = 8, 5
ATLAS_W, ATLAS_H = CELL * COLS, CELL * ROWS


def clamp(v, lo=0, hi=255):
    return max(lo, min(hi, int(v)))


def new_cell():
    return Image.new("RGBA", (CELL, CELL), (0, 0, 0, 0))


def soft_glow():
    im = new_cell()
    px = im.load()
    cx = cy = (CELL - 1) / 2
    for y in range(CELL):
        for x in range(CELL):
            d = math.hypot(x - cx, y - cy) / (CELL * 0.48)
            if d >= 1:
                continue
            a = (1 - d) ** 2
            v = 255 if d < 0.25 else (240 if d < 0.5 else 200)
            px[x, y] = (v, v, v, clamp(a * 255))
    return im


def spark():
    im = new_cell()
    px = im.load()
    cx = cy = CELL // 2
    for i in range(CELL):
        t = abs(i - cx) / (CELL * 0.5)
        w = max(0, int(3 * (1 - t)))
        a = clamp((1 - t) * 255)
        for o in range(-w, w + 1):
            if 0 <= cy + o < CELL:
                px[i, cy + o] = (255, 255, 255, a)
            if 0 <= cx + o < CELL:
                px[cx + o, i] = (255, 255, 255, a)
    for dy in range(-1, 2):
        for dx in range(-1, 2):
            px[cx + dx, cy + dy] = (255, 255, 255, 255)
    return im


def star():
    im = new_cell()
    px = im.load()
    cx = cy = (CELL - 1) / 2
    for y in range(CELL):
        for x in range(CELL):
            dx, dy = x - cx, y - cy
            d = (abs(dx) + abs(dy)) / (CELL * 0.55)
            arm = min(abs(dx), abs(dy)) / 2 + max(abs(dx), abs(dy)) * 0.35
            arm /= CELL * 0.45
            v = min(d, arm)
            if v >= 1:
                continue
            px[x, y] = (255, 255, 255, clamp((1 - v) ** 1.5 * 255))
    return im


def ring():
    im = new_cell()
    px = im.load()
    cx = cy = (CELL - 1) / 2
    r0, r1 = CELL * 0.28, CELL * 0.46
    for y in range(CELL):
        for x in range(CELL):
            d = math.hypot(x - cx, y - cy)
            if r0 <= d <= r1:
                t = min(d - r0, r1 - d) / max(0.01, (r1 - r0) * 0.5)
                px[x, y] = (255, 255, 255, clamp(min(1.0, t * 1.8) * 255))
    return im


def bolt_head():
    im = new_cell()
    px = im.load()
    cx, cy = CELL // 2, CELL // 2
    for y in range(CELL):
        for x in range(CELL):
            dx = (x - cx * 0.6) / (CELL * 0.55)
            dy = (y - cy) / (CELL * 0.28)
            d = dx * dx + dy * dy
            if d > 1:
                continue
            px[x, y] = (255, 255, 255, clamp((1 - d) ** 1.2 * 255))
    for y in range(cy - 2, cy + 3):
        for x in range(cx + 4, cx + 10):
            if 0 <= x < CELL and 0 <= y < CELL:
                px[x, y] = (255, 255, 255, 255)
    return im


def bolt_body():
    im = new_cell()
    px = im.load()
    cy = CELL // 2
    for y in range(CELL):
        for x in range(CELL):
            dy = abs(y - cy) / (CELL * 0.22)
            dx = abs(x - CELL * 0.5) / (CELL * 0.5)
            if dy > 1:
                continue
            a = (1 - dy) ** 2 * (0.4 + 0.6 * (1 - dx))
            px[x, y] = (255, 255, 255, clamp(a * 220))
    return im


def impact():
    im = new_cell()
    px = im.load()
    cx = cy = CELL // 2
    for i in range(8):
        ang = i * math.pi / 4
        for dist in range(0, 15):
            t = dist / 14
            w = max(0, 2.2 * (1 - t))
            x = cx + math.cos(ang) * dist
            y = cy + math.sin(ang) * dist
            a = clamp((1 - t) * 255)
            for o in range(-int(w) - 1, int(w) + 2):
                px_x = int(round(x + math.cos(ang + math.pi / 2) * o * 0.5))
                px_y = int(round(y + math.sin(ang + math.pi / 2) * o * 0.5))
                if 0 <= px_x < CELL and 0 <= px_y < CELL:
                    prev = px[px_x, px_y][3]
                    px[px_x, px_y] = (255, 255, 255, max(prev, a))
    for dy in range(-2, 3):
        for dx in range(-2, 3):
            if dx * dx + dy * dy <= 5:
                px[cx + dx, cy + dy] = (255, 255, 255, 255)
    return im


def pillar():
    im = new_cell()
    px = im.load()
    cx = CELL // 2
    for y in range(CELL):
        yf = 1.0
        if y < 4:
            yf = y / 4
        elif y > CELL - 5:
            yf = (CELL - 1 - y) / 4
        for x in range(CELL):
            dx = abs(x - cx) / (CELL * 0.35)
            if dx > 1:
                continue
            a = (1 - dx) ** 1.8 * yf
            v = 255 if dx < 0.25 else 220
            px[x, y] = (v, v, v, clamp(a * 255))
    return im


def mote():
    im = new_cell()
    px = im.load()
    cx = cy = CELL // 2
    for y in range(CELL):
        for x in range(CELL):
            d = math.hypot(x - cx, y - cy)
            if d <= 3:
                a = 255 if d <= 1.5 else clamp((1 - (d - 1.5) / 2) * 200)
                px[x, y] = (255, 255, 255, a)
    return im


def flare():
    im = new_cell()
    px = im.load()
    cy = CELL // 2
    for y in range(CELL):
        for x in range(CELL):
            dy = abs(y - cy) / 5.0
            dx = abs(x - CELL / 2) / (CELL * 0.48)
            if dy > 1:
                continue
            a = (1 - dy) ** 2 * (1 - dx * 0.5)
            if dx > 0.7:
                a *= (1 - (dx - 0.7) / 0.3)
            if a <= 0:
                continue
            px[x, y] = (255, 255, 255, clamp(a * 255))
    return im


def swirl():
    im = new_cell()
    px = im.load()
    cx = cy = CELL // 2
    for y in range(CELL):
        for x in range(CELL):
            dx, dy = x - cx, y - cy
            ang = math.atan2(dy, dx)
            r = math.hypot(dx, dy)
            if not (8 <= r <= 13):
                continue
            if ang < -0.4 or ang > 2.2:
                continue
            t = min(r - 8, 13 - r) / 2.5
            px[x, y] = (255, 255, 255, clamp(min(1.0, t) * 0.9 * 255))
    return im


def cross():
    im = new_cell()
    px = im.load()
    cx = cy = CELL // 2
    for i in range(CELL):
        t = abs(i - cx) / 12
        if t > 1:
            continue
        a = clamp((1 - t) * 255)
        w = 1 if t > 0.5 else 2
        for o in range(-w, w + 1):
            if 0 <= cy + o < CELL:
                px[i, cy + o] = (255, 255, 255, max(px[i, cy + o][3], a))
            if 0 <= cx + o < CELL:
                px[cx + o, i] = (255, 255, 255, max(px[cx + o, i][3], a))
    return im


# --- Themed cells ---

def fire_blob():
    """Teardrop flame (point up)."""
    im = new_cell()
    px = im.load()
    cx = CELL // 2
    for y in range(CELL):
        for x in range(CELL):
            # Flame body: wide bottom, pointed top
            ty = y / (CELL - 1)
            half = 0.12 + 0.38 * (1 - ty) ** 0.7
            dx = abs(x - cx) / (CELL * half + 0.01)
            if dx > 1:
                continue
            # Cut bottom rounded
            if y > CELL - 4:
                continue
            a = (1 - dx) ** 1.4 * (0.5 + 0.5 * (1 - ty))
            if ty < 0.15:
                a *= ty / 0.15
            px[x, y] = (255, 255, 255, clamp(a * 255))
    # Hot core
    for y in range(14, 26):
        for x in range(12, 20):
            d = abs(x - 15.5) / 3 + abs(y - 20) / 6
            if d < 1:
                prev = px[x, y][3]
                px[x, y] = (255, 255, 255, max(prev, clamp((1 - d) * 255)))
    return im


def fire_burst():
    """Big multi-lobe fireball explosion."""
    im = new_cell()
    px = im.load()
    cx = cy = CELL // 2
    # Outer lobes
    for i in range(10):
        ang = i * math.pi * 2 / 10 + 0.2
        for dist in range(0, 15):
            t = dist / 14
            wobble = 1.0 + 0.25 * math.sin(ang * 3)
            r_max = 13 * wobble
            if dist > r_max:
                continue
            x = int(round(cx + math.cos(ang) * dist))
            y = int(round(cy + math.sin(ang) * dist * 0.95))
            a = clamp((1 - t) ** 0.8 * 240)
            w = max(1, int(3.5 * (1 - t)))
            for oy in range(-w, w + 1):
                for ox in range(-w, w + 1):
                    xx, yy = x + ox, y + oy
                    if 0 <= xx < CELL and 0 <= yy < CELL:
                        px[xx, yy] = (255, 255, 255, max(px[xx, yy][3], a))
    # Core
    for y in range(CELL):
        for x in range(CELL):
            d = math.hypot(x - cx, y - cy) / 6
            if d < 1:
                px[x, y] = (255, 255, 255, max(px[x, y][3], clamp((1 - d) * 255)))
    return im


def shockwave():
    """Thick double-ring shockwave."""
    im = new_cell()
    px = im.load()
    cx = cy = (CELL - 1) / 2
    for y in range(CELL):
        for x in range(CELL):
            d = math.hypot(x - cx, y - cy)
            a = 0
            for r0, r1, peak in ((9, 13, 1.0), (5, 7.5, 0.55)):
                if r0 <= d <= r1:
                    t = min(d - r0, r1 - d) / max(0.01, (r1 - r0) * 0.5)
                    a = max(a, min(1.0, t * 1.6) * peak)
            if a > 0:
                px[x, y] = (255, 255, 255, clamp(a * 255))
    return im


def ember():
    """Small rising ember particle."""
    im = new_cell()
    px = im.load()
    for y, x, a in [
        (20, 15, 255), (19, 15, 240), (18, 15, 220), (17, 16, 180),
        (21, 15, 200), (20, 14, 180), (20, 16, 180), (16, 15, 120),
        (22, 15, 100), (15, 14, 80),
    ]:
        if 0 <= x < CELL and 0 <= y < CELL:
            px[x, y] = (255, 255, 255, a)
    return im


def lightning():
    """Zigzag lightning bolt (vertical)."""
    im = new_cell()
    px = im.load()
    # Main zig path
    path = [(15, 1), (18, 6), (12, 11), (17, 16), (11, 21), (16, 26), (14, 30)]
    for i in range(len(path) - 1):
        x0, y0 = path[i]
        x1, y1 = path[i + 1]
        steps = max(abs(x1 - x0), abs(y1 - y0)) * 2
        for s in range(steps + 1):
            t = s / max(1, steps)
            x = int(round(x0 + (x1 - x0) * t))
            y = int(round(y0 + (y1 - y0) * t))
            for o in range(-2, 3):
                for p in range(-1, 2):
                    xx, yy = x + o, y + p
                    if 0 <= xx < CELL and 0 <= yy < CELL:
                        a = 255 if abs(o) <= 1 else 140
                        px[xx, yy] = (255, 255, 255, max(px[xx, yy][3], a))
    # Side fork
    for s in range(8):
        x, y = 17 + s // 2, 16 + s
        if 0 <= x < CELL and 0 <= y < CELL:
            px[x, y] = (255, 255, 255, 200)
            if x + 1 < CELL:
                px[x + 1, y] = (255, 255, 255, 120)
    return im


def zap_fork():
    """Horizontal lightning fork / arc."""
    im = new_cell()
    px = im.load()
    path = [(1, 16), (6, 13), (11, 17), (16, 12), (21, 16), (26, 14), (30, 17)]
    for i in range(len(path) - 1):
        x0, y0 = path[i]
        x1, y1 = path[i + 1]
        steps = max(abs(x1 - x0), abs(y1 - y0)) * 2
        for s in range(steps + 1):
            t = s / max(1, steps)
            x = int(round(x0 + (x1 - x0) * t))
            y = int(round(y0 + (y1 - y0) * t))
            for o in range(-1, 2):
                if 0 <= y + o < CELL:
                    px[x, y + o] = (255, 255, 255, max(px[x, y + o][3], 220 if o == 0 else 120))
    # Fork down
    for s in range(7):
        x, y = 16 + s // 3, 12 + s
        if 0 <= x < CELL and 0 <= y < CELL:
            px[x, y] = (255, 255, 255, 200)
    return im


def cobweb():
    """Spider web radial strands."""
    im = new_cell()
    px = im.load()
    cx = cy = CELL // 2
    # Radial strands
    for i in range(8):
        ang = i * math.pi / 4
        for dist in range(2, 15):
            x = int(round(cx + math.cos(ang) * dist))
            y = int(round(cy + math.sin(ang) * dist))
            if 0 <= x < CELL and 0 <= y < CELL:
                px[x, y] = (255, 255, 255, 200)
    # Concentric arcs
    for r in (5, 9, 13):
        for a in range(0, 360, 4):
            rad = math.radians(a)
            x = int(round(cx + math.cos(rad) * r))
            y = int(round(cy + math.sin(rad) * r))
            if 0 <= x < CELL and 0 <= y < CELL:
                px[x, y] = (255, 255, 255, max(px[x, y][3], 170))
    # Center blob
    for dy in range(-1, 2):
        for dx in range(-1, 2):
            px[cx + dx, cy + dy] = (255, 255, 255, 230)
    return im


def web_strand():
    """Loose hanging web thread."""
    im = new_cell()
    px = im.load()
    x = 10
    for y in range(2, 28):
        x += 1 if y % 5 == 0 else (-1 if y % 7 == 0 else 0)
        x = max(6, min(22, x))
        for o in range(-1, 2):
            if 0 <= x + o < CELL:
                px[x + o, y] = (255, 255, 255, 200 if o == 0 else 100)
        # sticky blobs
        if y in (8, 16, 24):
            for dx in range(-2, 3):
                for dy in range(-1, 2):
                    if 0 <= x + dx < CELL and 0 <= y + dy < CELL:
                        px[x + dx, y + dy] = (255, 255, 255, max(px[x + dx, y + dy][3], 160))
    return im


def vine():
    """Curving vine with thorns."""
    im = new_cell()
    px = im.load()
    x = 8
    for y in range(2, 30):
        x += 1 if (y // 4) % 2 == 0 else -1
        x = max(6, min(24, x))
        for o in range(-2, 3):
            a = 220 if abs(o) <= 1 else 100
            if 0 <= x + o < CELL:
                px[x + o, y] = (255, 255, 255, max(px[x + o, y][3], a))
        # side tendril
        if y % 6 == 0:
            for k in range(4):
                xx = x + (3 if y % 12 == 0 else -3) + (k if y % 12 == 0 else -k)
                yy = y + k // 2
                if 0 <= xx < CELL and 0 <= yy < CELL:
                    px[xx, yy] = (255, 255, 255, 180)
    return im


def leaf():
    """Simple leaf / foliage chip."""
    im = new_cell()
    px = im.load()
    cx, cy = 16, 16
    for y in range(CELL):
        for x in range(CELL):
            dx, dy = (x - cx) / 8, (y - cy) / 12
            # Leaf diamond
            if abs(dx) + abs(dy) * 0.7 > 1:
                continue
            # Pointed ends
            if abs(dy) > 0.85:
                continue
            a = 1.0 - (abs(dx) + abs(dy) * 0.5) * 0.5
            px[x, y] = (255, 255, 255, clamp(a * 255))
    # Midrib
    for y in range(6, 26):
        px[16, y] = (255, 255, 255, 255)
    return im


def ice_shard():
    """Crystalline ice shard."""
    im = new_cell()
    px = im.load()
    # Diamond crystal
    pts = [(16, 2), (24, 14), (16, 28), (8, 14)]
    # Rasterize filled diamond
    for y in range(CELL):
        for x in range(CELL):
            # Barycentric-ish diamond test
            dx, dy = abs(x - 16) / 9.0, abs(y - 15) / 13.0
            if dx + dy <= 1:
                edge = dx + dy
                a = 1.0 if edge < 0.75 else (1 - edge) / 0.25
                px[x, y] = (255, 255, 255, clamp(a * 230))
    # Inner highlight facet
    for y in range(8, 16):
        for x in range(12, 17):
            if abs(x - 14) + abs(y - 12) < 5:
                px[x, y] = (255, 255, 255, 255)
    return im


def snowflake():
    """6-point snowflake."""
    im = new_cell()
    px = im.load()
    cx = cy = CELL // 2
    for i in range(6):
        ang = i * math.pi / 3
        for dist in range(0, 13):
            x = int(round(cx + math.cos(ang) * dist))
            y = int(round(cy + math.sin(ang) * dist))
            if 0 <= x < CELL and 0 <= y < CELL:
                px[x, y] = (255, 255, 255, 230)
            # side branches
            if 4 <= dist <= 9:
                for s in (-1, 1):
                    bx = int(round(x + math.cos(ang + s * 0.9) * 3))
                    by = int(round(y + math.sin(ang + s * 0.9) * 3))
                    if 0 <= bx < CELL and 0 <= by < CELL:
                        px[bx, by] = (255, 255, 255, 180)
    for dy in range(-1, 2):
        for dx in range(-1, 2):
            px[cx + dx, cy + dy] = (255, 255, 255, 255)
    return im


def poison_bubble():
    """Toxic bubble with highlight."""
    im = new_cell()
    px = im.load()
    cx = cy = CELL // 2
    for y in range(CELL):
        for x in range(CELL):
            d = math.hypot(x - cx, y - cy) / 11
            if d > 1:
                continue
            # Hollow-ish bubble shell
            if d > 0.75:
                a = (1 - (d - 0.75) / 0.25) * 0.95
            elif d < 0.55:
                a = 0.15 + 0.25 * (1 - d)
            else:
                a = 0.45
            # Specular
            if (x - cx + 3) ** 2 + (y - cy + 4) ** 2 < 8:
                a = max(a, 0.9)
            px[x, y] = (255, 255, 255, clamp(a * 255))
    return im


def skull():
    """Tiny necrotic skull mark."""
    im = new_cell()
    px = im.load()
    # Cranium
    for y in range(8, 20):
        for x in range(10, 22):
            dx, dy = (x - 15.5) / 6, (y - 13) / 6
            if dx * dx + dy * dy <= 1:
                px[x, y] = (255, 255, 255, 220)
    # Jaw
    for y in range(18, 24):
        for x in range(12, 20):
            if abs(x - 15.5) < 4 - (y - 18) * 0.3:
                px[x, y] = (255, 255, 255, 200)
    # Eye holes (erase)
    for ey, ex in [(12, 13), (12, 18)]:
        for dy in range(-1, 2):
            for dx in range(-1, 2):
                px[ex + dx, ey + dy] = (0, 0, 0, 0)
    return im


def insect():
    """Tiny bug silhouette."""
    im = new_cell()
    px = im.load()
    # Body
    for y in range(12, 22):
        for x in range(13, 19):
            px[x, y] = (255, 255, 255, 220)
    # Head
    for y in range(9, 14):
        for x in range(14, 18):
            px[x, y] = (255, 255, 255, 230)
    # Wings
    for y in range(12, 18):
        for x in range(8, 13):
            if (x - 12) ** 2 + (y - 15) ** 2 < 12:
                px[x, y] = (255, 255, 255, 140)
        for x in range(19, 24):
            if (x - 19) ** 2 + (y - 15) ** 2 < 12:
                px[x, y] = (255, 255, 255, 140)
    # Legs
    for i, (lx, ly) in enumerate([(12, 20), (11, 22), (19, 20), (20, 22), (12, 18), (19, 18)]):
        if 0 <= lx < CELL and 0 <= ly < CELL:
            px[lx, ly] = (255, 255, 255, 180)
    return im


def grease_drip():
    """Oil / grease blob with drip."""
    im = new_cell()
    px = im.load()
    cx = 16
    for y in range(8, 20):
        for x in range(CELL):
            dx = abs(x - cx) / (10 - (y - 8) * 0.15)
            if dx < 1:
                px[x, y] = (255, 255, 255, clamp((1 - dx) * 220))
    # Drip
    for y in range(19, 28):
        w = 2 if y < 24 else 1
        for o in range(-w, w + 1):
            px[cx + o, y] = (255, 255, 255, 200)
    # Highlight
    for y in range(10, 14):
        for x in range(12, 16):
            px[x, y] = (255, 255, 255, 255)
    return im


def sparkle():
    """Faerie / glitter 4-point sparkle."""
    im = new_cell()
    px = im.load()
    cx = cy = CELL // 2
    for i in range(CELL):
        t = abs(i - cx) / 14
        if t > 1:
            continue
        a = clamp((1 - t) ** 1.5 * 255)
        w = 1 if t > 0.4 else 2
        for o in range(-w, w + 1):
            if 0 <= cy + o < CELL:
                px[i, cy + o] = (255, 255, 255, max(px[i, cy + o][3], a))
            if 0 <= cx + o < CELL:
                px[cx + o, i] = (255, 255, 255, max(px[cx + o, i][3], a))
    # Diagonal smaller
    for d in range(-8, 9):
        t = abs(d) / 8
        a = clamp((1 - t) * 160)
        for p in (1, -1):
            x, y = cx + d, cy + d * p
            if 0 <= x < CELL and 0 <= y < CELL:
                px[x, y] = (255, 255, 255, max(px[x, y][3], a))
    return im


def thorn():
    """Spike / thorn point."""
    im = new_cell()
    px = im.load()
    for y in range(4, 28):
        t = (y - 4) / 24
        half = 1 + int(4 * (1 - t))
        for o in range(-half, half + 1):
            a = 220 if abs(o) < half else 120
            px[16 + o, y] = (255, 255, 255, a)
    # Tip
    px[16, 3] = (255, 255, 255, 255)
    px[15, 4] = (255, 255, 255, 200)
    px[17, 4] = (255, 255, 255, 200)
    return im


def holy_ray():
    """Radiant vertical beam with flare top."""
    im = new_cell()
    px = im.load()
    cx = CELL // 2
    for y in range(CELL):
        for x in range(CELL):
            dx = abs(x - cx) / 5.0
            if dx > 1:
                continue
            a = (1 - dx) ** 2
            if y < 8:
                # Top starburst widen
                d = math.hypot(x - cx, y - 6) / 10
                if d < 1:
                    a = max(a, (1 - d) ** 1.2)
            px[x, y] = (255, 255, 255, clamp(a * 255))
    return im


def wind_slash():
    """Curved wind gust slash."""
    im = new_cell()
    px = im.load()
    cx = cy = CELL // 2
    for y in range(CELL):
        for x in range(CELL):
            dx, dy = x - cx, y - cy
            ang = math.atan2(dy, dx)
            r = math.hypot(dx, dy)
            # Three arc bands
            for r0, r1 in ((6, 9), (10, 13), (14, 16)):
                if not (r0 <= r <= r1):
                    continue
                if ang < -1.2 or ang > 1.8:
                    continue
                t = min(r - r0, r1 - r) / max(0.5, (r1 - r0) * 0.5)
                a = min(1.0, t) * (0.95 if r1 < 14 else 0.55)
                px[x, y] = (255, 255, 255, max(px[x, y][3], clamp(a * 255)))
    return im


def magic_circle():
    """Disgaea-style summoning circle — outer ring + spokes + rune ticks."""
    im = new_cell()
    px = im.load()
    cx = cy = (CELL - 1) / 2
    for y in range(CELL):
        for x in range(CELL):
            d = math.hypot(x - cx, y - cy)
            a = 0.0
            # Outer ring
            if 12.2 <= d <= 14.5:
                a = max(a, min(1.0, min(d - 12.2, 14.5 - d) / 0.9))
            # Inner ring
            if 8.0 <= d <= 9.5:
                a = max(a, min(1.0, min(d - 8.0, 9.5 - d) / 0.6) * 0.85)
            # Core ring
            if 3.5 <= d <= 4.8:
                a = max(a, min(1.0, min(d - 3.5, 4.8 - d) / 0.5) * 0.7)
            if a > 0:
                px[x, y] = (255, 255, 255, clamp(a * 255))
    # 8 spokes
    for i in range(8):
        ang = i * math.pi / 4 + 0.2
        for dist in range(5, 14):
            x = int(round(cx + math.cos(ang) * dist))
            y = int(round(cy + math.sin(ang) * dist))
            if 0 <= x < CELL and 0 <= y < CELL:
                px[x, y] = (255, 255, 255, max(px[x, y][3], 160 if dist < 11 else 100))
    # Rune ticks on outer ring
    for i in range(16):
        ang = i * math.pi / 8
        x = int(round(cx + math.cos(ang) * 13.3))
        y = int(round(cy + math.sin(ang) * 13.3))
        for o in range(-1, 2):
            xx, yy = x + o, y
            if 0 <= xx < CELL and 0 <= yy < CELL:
                px[xx, yy] = (255, 255, 255, max(px[xx, yy][3], 220))
    return im


def multi_star():
    """Chunky 8-point Disgaea hit star."""
    im = new_cell()
    px = im.load()
    cx = cy = (CELL - 1) / 2
    for y in range(CELL):
        for x in range(CELL):
            dx, dy = x - cx, y - cy
            ang = math.atan2(dy, dx)
            r = math.hypot(dx, dy)
            # 8-point star radius modulates with angle
            point = abs(math.cos(ang * 4))
            r_max = 6 + 9 * (point ** 1.5)
            if r > r_max:
                continue
            t = r / max(0.1, r_max)
            a = (1 - t) ** 0.7
            if point > 0.7 and r < 10:
                a = max(a, 0.9)
            px[x, y] = (255, 255, 255, clamp(a * 255))
    # Hot core
    for dy in range(-2, 3):
        for dx in range(-2, 3):
            if dx * dx + dy * dy <= 5:
                px[int(cx) + dx, int(cy) + dy] = (255, 255, 255, 255)
    return im


def rune_ring():
    """Thin ornate ring with diamond ticks (secondary circle layer)."""
    im = new_cell()
    px = im.load()
    cx = cy = (CELL - 1) / 2
    for y in range(CELL):
        for x in range(CELL):
            d = math.hypot(x - cx, y - cy)
            if 11.0 <= d <= 13.2:
                t = min(d - 11.0, 13.2 - d) / 1.1
                px[x, y] = (255, 255, 255, clamp(min(1.0, t * 1.6) * 230))
    for i in range(12):
        ang = i * math.pi / 6
        for dist in (10.5, 13.5):
            x = int(round(cx + math.cos(ang) * dist))
            y = int(round(cy + math.sin(ang) * dist))
            if 0 <= x < CELL and 0 <= y < CELL:
                px[x, y] = (255, 255, 255, 255)
                if 0 <= x + 1 < CELL:
                    px[x + 1, y] = (255, 255, 255, 180)
    return im


def charge_orb():
    """Bright gathering orb with hard core (charge phase)."""
    im = new_cell()
    px = im.load()
    cx = cy = (CELL - 1) / 2
    for y in range(CELL):
        for x in range(CELL):
            d = math.hypot(x - cx, y - cy) / 13
            if d >= 1:
                continue
            a = (1 - d) ** 1.8
            if d < 0.25:
                a = 1.0
            px[x, y] = (255, 255, 255, clamp(a * 255))
    return im


def debris():
    """Angular rock/debris chip for residual layers."""
    im = new_cell()
    px = im.load()
    # Irregular polygon blob
    for y in range(CELL):
        for x in range(CELL):
            dx, dy = (x - 16) / 7.0, (y - 16) / 5.5
            # Squished diamond with warp
            warp = 0.15 * math.sin(x * 0.8)
            if abs(dx) + abs(dy + warp) * 1.1 > 1:
                continue
            edge = abs(dx) + abs(dy)
            a = 1.0 if edge < 0.65 else (1 - edge) / 0.35
            px[x, y] = (255, 255, 255, clamp(a * 220))
    return im


def lens_flare():
    """Horizontal anamorphic flare (Disgaea screen pop)."""
    im = new_cell()
    px = im.load()
    cy = CELL // 2
    for y in range(CELL):
        for x in range(CELL):
            dy = abs(y - cy) / 3.5
            dx = abs(x - 15.5) / 15.5
            if dy > 1:
                continue
            a = (1 - dy) ** 2 * (1 - dx * 0.55)
            if dx > 0.75:
                a *= (1 - (dx - 0.75) / 0.25)
            # Center vertical spike
            if abs(x - 15.5) < 2 and abs(y - cy) < 8:
                a = max(a, 0.7 * (1 - abs(y - cy) / 8))
            if a > 0:
                px[x, y] = (255, 255, 255, clamp(a * 255))
    return im


def double_ring():
    """Two concentric soft rings for stacked shockwaves."""
    im = new_cell()
    px = im.load()
    cx = cy = (CELL - 1) / 2
    for y in range(CELL):
        for x in range(CELL):
            d = math.hypot(x - cx, y - cy)
            a = 0.0
            for r0, r1, peak in ((10, 13.5, 1.0), (5.5, 7.5, 0.65)):
                if r0 <= d <= r1:
                    t = min(d - r0, r1 - d) / max(0.01, (r1 - r0) * 0.5)
                    a = max(a, min(1.0, t * 1.7) * peak)
            if a > 0:
                px[x, y] = (255, 255, 255, clamp(a * 255))
    return im


def spiral_arm():
    """Curved spiral arm for wind / charge swirl."""
    im = new_cell()
    px = im.load()
    cx = cy = CELL // 2
    for y in range(CELL):
        for x in range(CELL):
            dx, dy = x - cx, y - cy
            ang = math.atan2(dy, dx)
            r = math.hypot(dx, dy)
            # Archimedean spiral band
            target = 4 + (ang + math.pi) / (2 * math.pi) * 10
            if abs(r - target) < 1.8 and r > 3:
                a = 1.0 - abs(r - target) / 1.8
                # Fade by angle span
                if ang < -0.5 or ang > 2.5:
                    a *= 0.3
                px[x, y] = (255, 255, 255, clamp(a * 230))
    return im


GENERATORS = [
    soft_glow, spark, star, ring,
    bolt_head, bolt_body, impact, pillar,
    mote, flare, swirl, cross,
    fire_blob, fire_burst, shockwave, ember,
    lightning, zap_fork, cobweb, web_strand,
    vine, leaf, ice_shard, snowflake,
    poison_bubble, skull, insect, grease_drip,
    sparkle, thorn, holy_ray, wind_slash,
    magic_circle, multi_star, rune_ring, charge_orb,
    debris, lens_flare, double_ring, spiral_arm,
]


def main():
    sheet = Image.new("RGBA", (ATLAS_W, ATLAS_H), (0, 0, 0, 0))
    for i, gen in enumerate(GENERATORS):
        tile = gen()
        col, row = i % COLS, i // COLS
        sheet.paste(tile, (col * CELL, row * CELL), tile)
        print(f"  [{i:2d}] {gen.__name__:14s} → ({col},{row})")
    OUT.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(OUT, "PNG")
    print(f"Wrote {OUT} ({ATLAS_W}×{ATLAS_H})")


if __name__ == "__main__":
    main()
