#!/usr/bin/env python3
"""Generate seamless 128×128 FFT-style ground tiles (pixel art, not photo)."""
from __future__ import annotations

import math
import random
from pathlib import Path

from PIL import Image

OUT = Path(r"C:\Users\andrew\Desktop\faggot\dnd-character\sprites\hq\terrain")
SIZE = 128


def clamp(v, lo=0, hi=255):
    return max(lo, min(hi, int(v)))


def hash2(x, y, seed=0):
    n = (x * 374761393 + y * 668265263 + seed * 1274126177) & 0xFFFFFFFF
    n = (n ^ (n >> 13)) * 1274126177 & 0xFFFFFFFF
    return (n ^ (n >> 16)) / 4294967295.0


def value_noise(x, y, scale, seed):
    """Seamless-ish value noise by wrapping lattice to SIZE."""
    fx = x / scale
    fy = y / scale
    # wrap lattice to tile seamlessly
    period = max(1, SIZE // scale)
    x0 = int(math.floor(fx)) % period
    y0 = int(math.floor(fy)) % period
    x1 = (x0 + 1) % period
    y1 = (y0 + 1) % period
    tx = fx - math.floor(fx)
    ty = fy - math.floor(fy)
    # smoothstep
    sx = tx * tx * (3 - 2 * tx)
    sy = ty * ty * (3 - 2 * ty)
    n00 = hash2(x0, y0, seed)
    n10 = hash2(x1, y0, seed)
    n01 = hash2(x0, y1, seed)
    n11 = hash2(x1, y1, seed)
    a = n00 * (1 - sx) + n10 * sx
    b = n01 * (1 - sx) + n11 * sx
    return a * (1 - sy) + b * sy


def fbm(x, y, seed, octaves=4, base=16):
    amp = 0.5
    total = 0.0
    norm = 0.0
    s = base
    for i in range(octaves):
        total += value_noise(x, y, s, seed + i * 17) * amp
        norm += amp
        amp *= 0.5
        s = max(2, s // 2)
    return total / norm if norm else 0.5


def lerp(a, b, t):
    return a + (b - a) * t


def mix_rgb(c0, c1, t):
    return tuple(clamp(lerp(c0[i], c1[i], t)) for i in range(3)) + (255,)


def make_grass():
    """Lush FFT grass: chunky pixel clumps (not soft noise)."""
    img = Image.new("RGBA", (SIZE, SIZE))
    px = img.load()
    # discrete palette — reads as pixel art when sampled nearest
    palette = [
        (28, 58, 22),
        (40, 82, 30),
        (52, 104, 38),
        (68, 124, 46),
        (86, 142, 54),
        (104, 152, 58),
        (120, 140, 50),
        (72, 58, 34),  # dirt fleck
    ]
    for y in range(SIZE):
        for x in range(SIZE):
            # sample noise at lower freq then quantize → big crisp clumps
            n = fbm(x, y, 11, 4, 24)
            n2 = fbm(x + 40, y + 17, 23, 2, 10)
            t = n * 0.8 + n2 * 0.2
            # 6 green steps
            idx = min(5, int(t * 6))
            # occasional dirt / dry grass
            if hash2(x // 2, y // 2, 55) > 0.97:
                idx = 7
            elif hash2(x, y, 77) > 0.985:
                idx = 6
            c = palette[idx]
            # 1px blade highlights (vertical bias)
            if hash2(x, y, 99) > 0.94 and idx < 6:
                c = palette[min(5, idx + 1)]
            px[x, y] = c + (255,)
    return img


def make_stone():
    """Cobble / dungeon floor — flagstones with mortar."""
    img = Image.new("RGBA", (SIZE, SIZE))
    px = img.load()
    mortar = (62, 58, 54)
    stones = [
        (118, 112, 104),
        (98, 96, 92),
        (132, 124, 112),
        (88, 86, 82),
        (110, 106, 98),
    ]
    # flagstone cells ~16px
    cell = 16
    for y in range(SIZE):
        for x in range(SIZE):
            # staggered rows
            ox = (y // cell) % 2 * (cell // 2)
            cx = ((x + ox) // cell) % (SIZE // cell)
            cy = (y // cell) % (SIZE // cell)
            lx = (x + ox) % cell
            ly = y % cell
            # mortar seams
            if lx == 0 or ly == 0 or lx == cell - 1 or ly == cell - 1:
                n = hash2(x, y, 3)
                px[x, y] = mix_rgb(mortar, (48, 46, 44), n * 0.4)
                continue
            base = stones[int(hash2(cx, cy, 8) * len(stones)) % len(stones)]
            n = fbm(x, y, 41, 3, 8)
            c = mix_rgb(base, (base[0] - 20, base[1] - 18, base[2] - 16), n * 0.45)
            # cracks
            if hash2(x, y, 19) > 0.988:
                c = mix_rgb(c[:3], mortar, 0.7)
            # highlight edge
            if lx == 1 or ly == 1:
                c = mix_rgb(c[:3], (160, 154, 142), 0.25)
            px[x, y] = c
    return img


def make_sand():
    img = Image.new("RGBA", (SIZE, SIZE))
    px = img.load()
    dark = (168, 140, 78)
    mid = (198, 170, 100)
    light = (228, 204, 130)
    for y in range(SIZE):
        for x in range(SIZE):
            n = fbm(x, y, 7, 4, 24)
            # subtle dune bands
            band = (math.sin((x + y * 0.4) * 0.12) + 1) * 0.5
            t = n * 0.65 + band * 0.35
            if t < 0.45:
                c = mix_rgb(dark, mid, t / 0.45)
            else:
                c = mix_rgb(mid, light, (t - 0.45) / 0.55)
            if hash2(x, y, 33) > 0.96:
                c = mix_rgb(c[:3], light, 0.5)
            px[x, y] = c
    return img


def make_snow():
    img = Image.new("RGBA", (SIZE, SIZE))
    px = img.load()
    dark = (170, 186, 198)
    mid = (220, 230, 238)
    light = (248, 250, 252)
    for y in range(SIZE):
        for x in range(SIZE):
            n = fbm(x, y, 13, 4, 20)
            t = n
            if t < 0.4:
                c = mix_rgb(dark, mid, t / 0.4)
            else:
                c = mix_rgb(mid, light, (t - 0.4) / 0.6)
            if hash2(x, y, 44) > 0.97:
                c = light + (255,)
            # ice sparkle
            if hash2(x, y, 66) > 0.992:
                c = (200, 230, 255, 255)
            px[x, y] = c
    return img


def make_wood():
    """Wood plank floor."""
    img = Image.new("RGBA", (SIZE, SIZE))
    px = img.load()
    planks = [
        (120, 78, 42),
        (108, 70, 38),
        (132, 88, 48),
        (98, 64, 34),
    ]
    pw = 16
    for y in range(SIZE):
        for x in range(SIZE):
            pi = (x // pw) % len(planks)
            base = planks[pi]
            # grain along length
            g = value_noise(x, y, 4, 90 + pi) * 0.35
            c = mix_rgb(base, (base[0] + 30, base[1] + 22, base[2] + 10), g)
            # plank edge
            if x % pw == 0:
                c = mix_rgb(c[:3], (60, 40, 22), 0.55)
            # knots
            if hash2(x // 3, y // 3, 12 + pi) > 0.994:
                c = mix_rgb(c[:3], (70, 48, 28), 0.5)
            px[x, y] = c
    return img


def make_dirt():
    img = Image.new("RGBA", (SIZE, SIZE))
    px = img.load()
    dark = (72, 52, 32)
    mid = (104, 78, 48)
    light = (132, 102, 64)
    for y in range(SIZE):
        for x in range(SIZE):
            n = fbm(x, y, 29, 5, 16)
            if n < 0.4:
                c = mix_rgb(dark, mid, n / 0.4)
            else:
                c = mix_rgb(mid, light, (n - 0.4) / 0.6)
            if hash2(x, y, 5) > 0.97:
                c = mix_rgb(c[:3], (90, 90, 70), 0.35)
            px[x, y] = c
    return img


def make_water():
    img = Image.new("RGBA", (SIZE, SIZE))
    px = img.load()
    deep = (28, 72, 110)
    mid = (42, 110, 148)
    light = (78, 160, 180)
    foam = (180, 220, 230)
    for y in range(SIZE):
        for x in range(SIZE):
            n = fbm(x, y, 61, 4, 20)
            wave = (math.sin(x * 0.18 + y * 0.07) + math.sin(y * 0.22 - x * 0.05)) * 0.25 + 0.5
            t = n * 0.55 + wave * 0.45
            if t < 0.4:
                c = mix_rgb(deep, mid, t / 0.4)
            elif t < 0.75:
                c = mix_rgb(mid, light, (t - 0.4) / 0.35)
            else:
                c = mix_rgb(light, foam, (t - 0.75) / 0.25)
            px[x, y] = c
    return img


def make_mud():
    img = Image.new("RGBA", (SIZE, SIZE))
    px = img.load()
    dark = (48, 40, 28)
    mid = (70, 58, 36)
    light = (96, 80, 48)
    wet = (40, 50, 36)
    for y in range(SIZE):
        for x in range(SIZE):
            n = fbm(x, y, 37, 4, 18)
            if n < 0.45:
                c = mix_rgb(dark, mid, n / 0.45)
            else:
                c = mix_rgb(mid, light, (n - 0.45) / 0.55)
            if hash2(x, y, 88) > 0.94:
                c = mix_rgb(c[:3], wet, 0.45)
            px[x, y] = c
    return img


def make_brick():
    img = Image.new("RGBA", (SIZE, SIZE))
    px = img.load()
    mortar = (90, 86, 80)
    bricks = [(148, 72, 52), (132, 64, 48), (160, 80, 58), (120, 58, 44)]
    bw, bh = 16, 8
    for y in range(SIZE):
        for x in range(SIZE):
            row = y // bh
            ox = (row % 2) * (bw // 2)
            lx = (x + ox) % bw
            ly = y % bh
            if lx == 0 or ly == 0:
                px[x, y] = mix_rgb(mortar, (70, 68, 64), hash2(x, y, 1) * 0.3)
                continue
            cx = ((x + ox) // bw) % 8
            cy = row % 8
            base = bricks[int(hash2(cx, cy, 2) * len(bricks)) % len(bricks)]
            n = fbm(x, y, 50, 2, 6)
            c = mix_rgb(base, (base[0] - 25, base[1] - 15, base[2] - 10), n * 0.4)
            if lx == 1 or ly == 1:
                c = mix_rgb(c[:3], (180, 110, 80), 0.2)
            px[x, y] = c
    return img


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    gens = {
        "grass.png": make_grass,
        "stone.png": make_stone,
        "sand.png": make_sand,
        "snow.png": make_snow,
        "wood.png": make_wood,
        "dirt.png": make_dirt,
        "water.png": make_water,
        "mud.png": make_mud,
        "brick.png": make_brick,
    }
    for name, fn in gens.items():
        im = fn()
        # also save 64px nearest for classic UI if needed
        path = OUT / name
        im.save(path, "PNG")
        print("wrote", path, im.size)


if __name__ == "__main__":
    main()
