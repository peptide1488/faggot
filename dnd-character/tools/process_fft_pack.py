#!/usr/bin/env python3
"""
Process Imagine gens into FFT / Ogre Battle style terrain + decor.

Source: session images 25–36 (see MAP below).
"""
from __future__ import annotations

import colorsys
from pathlib import Path

from PIL import Image, ImageEnhance, ImageFilter

SESS = Path(
    r"C:\Users\andrew\.grok\sessions"
    r"\C%3A%5CUsers%5Candrew%5CDesktop%5Cfaggot"
    r"\019f68cc-a8fd-7432-849a-996dd00260ff\images"
)
ROOT = Path(__file__).resolve().parents[1]
HQ_T = ROOT / "sprites" / "hq" / "terrain"
HQ_D = ROOT / "sprites" / "hq" / "decor"
SPR_D = ROOT / "sprites" / "decor"

# stem -> output name(s) for seamless terrain (no chroma)
TERRAIN = {
    "25": "grass.png",
    "27": "stone.png",       # flagstone path
    "26": "brick.png",       # red brick sides
    "26": "brick.png",
    "31": "cave_wall.png",   # grey castle stone
    "31": "brick_top.png",   # reuse as wall top
    "34": "dirt.png",
    "32": "wood.png",
    "32": "wood_side.png",
    "35": "water.png",
    "36": "sand.png",
    "34": "mud.png",
}

# fixed explicit list (no dict key collision)
TERRAIN_LIST = [
    ("25", "grass.png"),
    ("27", "stone.png"),
    ("26", "brick.png"),
    ("26", "brick_top.png"),  # warm brick for tops too until we have a flat cap
    ("31", "cave_wall.png"),
    ("31", "cave_top.png"),
    ("34", "dirt.png"),
    ("34", "mud.png"),
    ("32", "wood.png"),
    ("32", "wood_side.png"),
    ("35", "water.png"),
    ("36", "sand.png"),
    ("27", "snow.png"),  # lighten path as snow stand-in later
]

DECOR_LIST = [
    ("29", "tree", 128, 176),
    ("30", "tree2", 112, 176),
    ("33", "tree_dead", 128, 176),
    ("28", "bush", 96, 88),
]


def chroma(im: Image.Image) -> Image.Image:
    im = im.convert("RGBA")
    px = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if r > 160 and b > 140 and g < 140 and (r + b) > g * 2.2:
                px[x, y] = (0, 0, 0, 0)
            elif r > 200 and b > 170 and g < 160:
                px[x, y] = (0, 0, 0, 0)
            elif r > 220 and g < 100 and b > 180:
                px[x, y] = (0, 0, 0, 0)
    return im


def crop_alpha(im: Image.Image, pad: int = 6) -> Image.Image:
    bb = im.getbbox()
    if not bb:
        return im
    l, t, r, b = bb
    return im.crop(
        (max(0, l - pad), max(0, t - pad), min(im.width, r + pad), min(im.height, b + pad))
    )


def seamless_tile(src: Path, size: int = 128) -> Image.Image:
    im = Image.open(src).convert("RGB")
    # center-crop square then resize
    w, h = im.size
    s = min(w, h)
    im = im.crop(((w - s) // 2, (h - s) // 2, (w + s) // 2, (h + s) // 2))
    im = im.resize((size, size), Image.Resampling.LANCZOS)
    im = ImageEnhance.Color(im).enhance(0.92)  # mute toward FFT
    im = ImageEnhance.Contrast(im).enhance(1.05)
    return im.convert("RGBA")


def lighten_snow(im: Image.Image) -> Image.Image:
    im = im.convert("RGBA")
    px = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            # push toward pale frost
            nr = min(255, int(r * 0.35 + 210))
            ng = min(255, int(g * 0.35 + 215))
            nb = min(255, int(b * 0.4 + 230))
            px[x, y] = (nr, ng, nb, a)
    return im


def fit_billboard(im: Image.Image, tw: int, th: int) -> Image.Image:
    im = chroma(im)
    im = crop_alpha(im, pad=8)
    # soft downscale then slight pixel snap
    scale = min(tw / im.width, th / im.height) * 0.96
    nw, nh = max(1, int(im.width * scale)), max(1, int(im.height * scale))
    mid = im.resize((nw, nh), Image.Resampling.LANCZOS)
    mid = ImageEnhance.Contrast(mid).enhance(1.06)
    mid = ImageEnhance.Color(mid).enhance(0.95)
    canvas = Image.new("RGBA", (tw, th), (0, 0, 0, 0))
    canvas.paste(mid, ((tw - nw) // 2, th - nh), mid)
    return canvas


def tint(im: Image.Image, hs: float, sm: float, vm: float) -> Image.Image:
    im = im.convert("RGBA")
    px = im.load()
    w, h = im.size
    out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    op = out.load()
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a < 12:
                continue
            if r < 35 and g < 35 and b < 35:
                op[x, y] = (r, g, b, a)
                continue
            hh, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
            hh = (hh + hs) % 1.0
            s = min(1.0, max(0.0, s * sm))
            v = min(1.0, max(0.0, v * vm))
            rr, gg, bb = colorsys.hsv_to_rgb(hh, s, v)
            op[x, y] = (int(rr * 255), int(gg * 255), int(bb * 255), a)
    return out


def snow_overlay(im: Image.Image) -> Image.Image:
    im = im.convert("RGBA")
    out = im.copy()
    px = im.load()
    op = out.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a < 20:
                continue
            if g > r and g > b and y < h * 0.55 and (x * 13 + y * 29) % 5 == 0:
                op[x, y] = (240, 244, 250, a)
    return out


def save_terrain(name: str, im: Image.Image):
    HQ_T.mkdir(parents=True, exist_ok=True)
    im.save(HQ_T / name)
    print("terrain", name, im.size)


def save_decor(name: str, im: Image.Image):
    for base in (HQ_D, SPR_D):
        base.mkdir(parents=True, exist_ok=True)
        im.save(base / f"{name}.png")
    print("decor", name, im.size)


def main():
    # terrain
    done = set()
    for stem, name in TERRAIN_LIST:
        src = SESS / f"{stem}.jpg"
        if not src.is_file():
            print("missing", stem)
            continue
        if name == "snow.png":
            im = lighten_snow(seamless_tile(src))
        else:
            im = seamless_tile(src)
        if name in done:
            continue
        save_terrain(name, im)
        done.add(name)

    # grass side: dirt-ish lower with green hint from grass
    grass = Image.open(HQ_T / "grass.png").convert("RGBA")
    dirt = Image.open(HQ_T / "dirt.png").convert("RGBA")
    side = dirt.copy()
    # paste thin grass strip at top of side texture
    gstrip = grass.resize((128, 40), Image.Resampling.LANCZOS)
    side.paste(gstrip, (0, 0), ImageEnhance.Brightness(gstrip).enhance(0.95))
    save_terrain("grass_side.png", side)

    # decor
    oak = fit_billboard(Image.open(SESS / "29.jpg"), 128, 176)
    pine = fit_billboard(Image.open(SESS / "30.jpg"), 112, 176)
    dead = fit_billboard(Image.open(SESS / "33.jpg"), 128, 176)
    bush = fit_billboard(Image.open(SESS / "28.jpg"), 96, 88)

    save_decor("tree_px", oak)
    save_decor("tree", oak)
    save_decor("tree2_px", pine)
    save_decor("tree2", pine)
    save_decor("tree_dead_px", dead)
    save_decor("tree_dead", dead)
    save_decor("tree_snow", snow_overlay(oak))
    save_decor("jungle_tree", tint(oak, 0.06, 1.08, 0.92))
    save_decor("jungle_tree2", tint(pine, 0.1, 1.05, 0.9))
    save_decor("bush_px", bush)
    save_decor("bush", bush)
    save_decor("bush2", tint(bush, 0.03, 1.05, 1.0))
    save_decor("bush3", tint(bush, -0.04, 1.05, 0.95))
    save_decor("bush_snow", snow_overlay(bush))
    save_decor("bush_haunted", tint(bush, 0.55, 0.45, 0.65))
    save_decor("jungle_bush", tint(bush, 0.1, 1.12, 0.9))

    print("FFT pack written.")


if __name__ == "__main__":
    main()
