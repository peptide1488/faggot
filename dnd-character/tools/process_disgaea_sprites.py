#!/usr/bin/env python3
"""
Turn Imagine-generated Disgaea-style full-body art into 128×128 walk sheets.

Input:  dnd-character/sprites/_disgaea_src/<n>.png  (magenta chroma)
Output: sprites/hq/{characters,monsters,decor}/*.png  512×512 (4×4 × 128)

  python dnd-character/tools/process_disgaea_sprites.py
"""
from __future__ import annotations

import shutil
from pathlib import Path

from PIL import Image, ImageEnhance, ImageOps

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "sprites" / "_disgaea_src"
HQ = ROOT / "sprites" / "hq"
SPR = ROOT / "sprites"

FRAME = 128
COLS = 4
ROWS = 4

# source file stem -> (kind, key)
# Identified from generated art (Disgaea/NIS chibi on magenta).
MAP = {
    "1": ("character", "wizard"),
    "2": ("monster", "slime"),
    "3": ("monster", "goblin"),
    "4": ("character", "fighter"),
    "5": ("character", "cleric"),
    "6": ("character", "rogue"),
    "7": ("character", "ranger"),
    "8": ("character", "barbarian"),
    "9": ("monster", "skeleton"),
    "10": ("monster", "wolf"),
    "11": ("decor", "tree"),
    "12": ("character", "paladin"),
    "13": ("monster", "demon"),
    "14": ("character", "druid"),
    "15": ("character", "sorcerer"),
    "16": ("character", "warlock"),
}

# Aliases: copy/tint from an existing key after primary process
ALIASES = {
    # characters
    "human": ("character", "fighter", None),
    "monk": ("character", "cleric", (0.08, 0.85, 1.05)),
    "bard": ("character", "rogue", (0.85, 1.1, 1.0)),
    "artificer": ("character", "fighter", (0.5, 0.9, 1.0)),
    # monsters
    "orc": ("monster", "goblin", (0.12, 1.05, 0.9)),
    "zombie": ("monster", "skeleton", (0.25, 0.7, 0.75)),
    "imp": ("monster", "demon", (-0.02, 1.15, 1.05)),
    "ogre": ("monster", "goblin", (0.05, 0.8, 0.75)),
    "ghost": ("monster", "slime", (0.55, 0.3, 1.3)),
    "specter": ("monster", "skeleton", (0.65, 0.4, 1.2)),
    "bear": ("monster", "wolf", (0.02, 0.9, 0.7)),
    "dog": ("monster", "wolf", (0.05, 1.1, 1.05)),
    "spider": ("monster", "slime", (0.95, 0.7, 0.5)),
    "bat": ("monster", "slime", (0.7, 0.5, 0.55)),
    "rat": ("monster", "wolf", (0.02, 0.5, 0.7)),
    "snake": ("monster", "slime", (0.3, 1.2, 0.85)),
    "harpy": ("monster", "demon", (0.8, 1.0, 1.0)),
    "angel": ("monster", "cleric", (0.12, 0.3, 1.35)),  # may fail if cleric is character only
    "mushroom": ("monster", "slime", (0.0, 1.2, 1.0)),
    "mimic": ("monster", "goblin", (0.08, 1.0, 0.85)),
    "knight": ("monster", "fighter", None),
    "villager": ("monster", "human", None),
    "chicken": ("monster", "slime", (0.1, 0.5, 1.2)),
    "cat": ("monster", "wolf", (0.08, 1.1, 1.1)),
    "human_m": ("monster", "fighter", (0.05, 0.85, 1.0)),
}


def chroma_key(im: Image.Image, thr: float = 55.0) -> Image.Image:
    """Remove magenta / hot pink background (Disgaea gen chroma)."""
    im = im.convert("RGBA")
    px = im.load()
    w, h = im.size
    corners = [px[2, 2], px[w - 3, 2], px[2, h - 3], px[w - 3, h - 3]]
    br = sum(c[0] for c in corners) / 4
    bg = sum(c[1] for c in corners) / 4
    bb = sum(c[2] for c in corners) / 4
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            dist = ((r - br) ** 2 + (g - bg) ** 2 + (b - bb) ** 2) ** 0.5
            # Magenta family: high R, low G, high B (covers #FF00FF and soft edges)
            is_mag = r > 160 and b > 140 and g < 120 and (r + b) > g * 2.4
            is_mag2 = r > 200 and b > 180 and g < 160
            # pink-magenta mid tones from soft AA on bg
            is_pink_bg = r > 220 and b > 160 and g < 140
            if dist < thr or is_mag or is_mag2 or is_pink_bg:
                px[x, y] = (0, 0, 0, 0)
            elif dist < thr * 1.5 or (r > 180 and b > 150 and g < 150):
                # soft fringe
                fa = int(max(0, min(255, a * 0.35)))
                if is_mag or is_mag2:
                    fa = 0
                px[x, y] = (r, g, b, fa) if fa else (0, 0, 0, 0)
    return im


def crop_alpha(im: Image.Image, pad: int = 4) -> Image.Image:
    bbox = im.getbbox()
    if not bbox:
        return im
    l, t, r, b = bbox
    l = max(0, l - pad)
    t = max(0, t - pad)
    r = min(im.width, r + pad)
    b = min(im.height, b + pad)
    return im.crop((l, t, r, b))


def to_pixel_frame(im: Image.Image, size: int = FRAME) -> Image.Image:
    """
    Fit character into size×size with feet at bottom-center.
    Downscale with LANCZOS then NEAREST snap for chunky pixel read.
    """
    im = im.convert("RGBA")
    # first fit height ~ 92% of frame
    target_h = int(size * 0.92)
    scale = min(size / im.width, target_h / im.height)
    nw = max(1, int(im.width * scale))
    nh = max(1, int(im.height * scale))
    # high quality downscale
    mid = im.resize((nw, nh), Image.Resampling.LANCZOS)
    # optional slight contrast for SRPG pop
    mid = ImageEnhance.Contrast(mid).enhance(1.08)
    mid = ImageEnhance.Color(mid).enhance(1.06)
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    x = (size - nw) // 2
    y = size - nh  # feet bottom
    canvas.paste(mid, (x, y), mid)
    return canvas


def walk_sheet(frame: Image.Image) -> Image.Image:
    """
    4×4 sheet: rows down/left/right/up, cols walk cycle.
    Left = H-flip of down; right = down; up = slightly darkened flip-ish of down.
    Walk = bob + horizontal sway (Disgaea-style idle bob until real anim exists).
    """
    fw = fh = FRAME
    sheet = Image.new("RGBA", (fw * COLS, fh * ROWS), (0, 0, 0, 0))
    down = frame
    left = down.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
    right = down
    # back: flip + slight desat/dark (fake rear)
    up = ImageEnhance.Brightness(left).enhance(0.92)

    facings = [down, left, right, up]
    bobs = [0, -5, 0, -4]
    sways = [0, 2, 0, -2]

    for ri, base in enumerate(facings):
        for ci in range(COLS):
            cell = Image.new("RGBA", (fw, fh), (0, 0, 0, 0))
            ox = sways[ci]
            oy = bobs[ci]
            cell.paste(base, (ox, oy), base)
            sheet.paste(cell, (ci * fw, ri * fh), cell)
    return sheet


def tint_hsv(im: Image.Image, hue_shift: float, sat_mul: float, val_mul: float) -> Image.Image:
    import colorsys

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
            # preserve near-black art pixels (never prompt for black outlines — see ART_PROMPTS.md)
            if r < 30 and g < 30 and b < 30:
                op[x, y] = (r, g, b, a)
                continue
            hh, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
            hh = (hh + hue_shift) % 1.0
            s = min(1.0, max(0.0, s * sat_mul))
            v = min(1.0, max(0.0, v * val_mul))
            rr, gg, bb = colorsys.hsv_to_rgb(hh, s, v)
            op[x, y] = (int(rr * 255), int(gg * 255), int(bb * 255), a)
    return out


def save_sheet(sheet: Image.Image, kind: str, key: str):
    if kind == "decor":
        # single billboard, not walk sheet — use one frame max height ~160
        frame = sheet.crop((0, 0, FRAME, FRAME))
        for base in (HQ / "decor", SPR / "decor"):
            base.mkdir(parents=True, exist_ok=True)
            frame.save(base / f"{key}.png")
            if key == "tree":
                frame.save(base / "tree_px.png")
                frame.save(base / "tree2_px.png")
                tint_hsv(frame, 0.08, 0.3, 0.75).save(base / "tree_dead_px.png")
                tint_hsv(frame, 0.05, 1.1, 1.0).save(base / "tree2.png")
        print(f"  decor {key} {frame.size}")
        return

    folder = "characters" if kind == "character" else "monsters"
    for base in (HQ / folder, SPR / folder):
        base.mkdir(parents=True, exist_ok=True)
        sheet.save(base / f"{key}.png")
    print(f"  {kind} {key} sheet {sheet.size}")


def process_one(src: Path, kind: str, key: str) -> Image.Image:
    im = Image.open(src)
    im = chroma_key(im, thr=58)
    im = crop_alpha(im, pad=8)
    frame = to_pixel_frame(im, FRAME)
    if kind == "decor":
        # build fake sheet so save_sheet can crop frame0
        sheet = Image.new("RGBA", (FRAME * 4, FRAME * 4), (0, 0, 0, 0))
        sheet.paste(frame, (0, 0), frame)
        return sheet
    return walk_sheet(frame)


def main():
    if not SRC.is_dir():
        raise SystemExit(f"missing {SRC}")

    primary: dict[tuple[str, str], Image.Image] = {}

    for stem, (kind, key) in MAP.items():
        src = SRC / f"{stem}.png"
        if not src.is_file():
            # try jpg path already converted
            print("  missing", stem)
            continue
        sheet = process_one(src, kind, key)
        save_sheet(sheet, kind, key)
        primary[(kind, key)] = sheet

    # also store character frames for monster aliases that point at fighter
    if ("character", "fighter") in primary:
        primary[("monster", "fighter")] = primary[("character", "fighter")]
    if ("character", "cleric") in primary:
        primary[("monster", "cleric")] = primary[("character", "cleric")]
    if ("character", "human") not in primary and ("character", "fighter") in primary:
        primary[("character", "human")] = primary[("character", "fighter")]
        save_sheet(primary[("character", "human")], "character", "human")

    for key, (kind, src_key, tint) in ALIASES.items():
        # resolve source
        src_kind = kind
        if (kind, src_key) in primary:
            base = primary[(kind, src_key)]
        elif ("character", src_key) in primary:
            base = primary[("character", src_key)]
        elif ("monster", src_key) in primary:
            base = primary[("monster", src_key)]
        else:
            print(f"  skip alias {key} (no {src_key})")
            continue
        sheet = base if tint is None else tint_hsv(base, *tint)
        save_sheet(sheet, kind, key)
        primary[(kind, key)] = sheet

    # idle crops
    for key in ("fighter", "goblin"):
        folder = "characters" if key == "fighter" else "monsters"
        p = HQ / folder / f"{key}.png"
        if p.is_file():
            im = Image.open(p)
            im.crop((0, 0, FRAME, FRAME)).save(HQ / folder / f"{key}_idle.png")

    # wiz 8-dir from wizard
    wp = HQ / "characters" / "wizard.png"
    if wp.is_file():
        w = Image.open(wp)
        w8 = Image.new("RGBA", (FRAME, FRAME * 8), (0, 0, 0, 0))
        for i in range(8):
            row = min(i, 3)
            fr = w.crop((0, row * FRAME, FRAME, (row + 1) * FRAME))
            w8.paste(fr, (0, i * FRAME), fr)
        w8.save(HQ / "characters" / "wiz.png")
        w8.save(HQ / "characters" / "wizard_purple.png")

    # bush from tree
    tp = HQ / "decor" / "tree_px.png"
    if tp.is_file():
        t = Image.open(tp).convert("RGBA")
        # crop lower canopy-ish as bush: take bottom 60% scaled
        bush = t.crop((0, int(FRAME * 0.35), FRAME, FRAME))
        bush = to_pixel_frame(crop_alpha(bush), 96)
        for base in (HQ / "decor", SPR / "decor"):
            base.mkdir(parents=True, exist_ok=True)
            bush.save(base / "bush_px.png")
            bush.save(base / "bush.png")
            bush.save(base / "bush2.png")
            bush.save(base / "bush3.png")

    print("done — 128×128 Disgaea-style sheets written.")


if __name__ == "__main__":
    main()
