#!/usr/bin/env python3
"""
Build a full HQ sprite pack from the real PixelLab base art + free packs.

Does NOT use the broken rectangle stick-figure generator.
Bases (restored from git / PixelLab pipeline):
  sprites/hq/characters/fighter.png   384×448  4×4
  sprites/hq/monsters/goblin.png      384×448  4×4
  sprites/hq/decor/tree*.png, bush*

Also imports wolf from random assets/critters when present.

Run:  python dnd-character/tools/build_hq_pack.py
"""
from __future__ import annotations

import colorsys
import shutil
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SPR = ROOT / "dnd-character" / "sprites"
HQ = SPR / "hq"
CRITTERS = ROOT / "random assets" / "critters" / "critters"

# Class: (hue_shift 0..1, sat_mul, val_mul, name for log)
# Applied to non-skin / non-outline pixels on the fighter base.
CLASS_TINT = {
    "fighter": (0.0, 1.0, 1.0),
    "paladin": (0.12, 1.05, 1.08),   # gold / warm armor
    "barbarian": (-0.08, 1.15, 0.95),  # red-brown
    "ranger": (0.28, 1.1, 0.92),     # green
    "rogue": (0.72, 0.95, 0.85),     # purple-dark
    "monk": (0.08, 0.7, 1.1),        # pale cloth
    "bard": (0.85, 1.2, 1.0),        # magenta
    "cleric": (0.55, 0.4, 1.15),     # white-blue holy
    "druid": (0.32, 1.2, 0.9),       # forest
    "wizard": (0.68, 1.15, 0.95),    # violet
    "sorcerer": (-0.05, 1.3, 1.0),   # crimson
    "warlock": (0.75, 1.1, 0.75),    # deep purple
    "artificer": (0.5, 0.85, 1.0),   # steel cyan
    "human": (0.05, 0.85, 1.0),
}

# Goblin-base monster tints
MONSTER_TINT = {
    "goblin": (0.0, 1.0, 1.0),
    "orc": (0.15, 1.1, 0.9),
    "skeleton": (0.0, 0.15, 1.35),   # desaturate → bone
    "zombie": (0.25, 0.7, 0.75),
    "demon": (-0.05, 1.3, 0.85),
    "imp": (-0.02, 1.25, 1.0),
    "ogre": (0.1, 0.8, 0.85),
    "knight": (0.55, 0.3, 1.1),
    "human": (0.05, 0.7, 1.05),
    "villager": (0.08, 0.75, 1.0),
    "harpy": (0.8, 1.0, 1.0),
    "specter": (0.65, 0.5, 1.2),
    "ghost": (0.55, 0.25, 1.35),
    "angel": (0.15, 0.2, 1.4),
    "mushroom": (0.0, 1.2, 1.0),  # will still look goblin-ish; ok for now
    "mimic": (0.08, 1.0, 0.9),
}


def is_skin(r, g, b) -> bool:
    """Rough skin detector so faces don't go full green/purple."""
    if r < 90 or g < 50 or b < 40:
        return False
    if r <= g or r <= b:
        return False
    # warm peachy / tan band
    return (r - g) > 10 and (r - b) > 15 and g > 60 and b < 200


def is_near_black(r, g, b) -> bool:
    return r < 28 and g < 28 and b < 28


def is_near_white(r, g, b) -> bool:
    return r > 235 and g > 235 and b > 235


def tint_image(im: Image.Image, hue_shift: float, sat_mul: float, val_mul: float) -> Image.Image:
    im = im.convert("RGBA")
    px = im.load()
    w, h = im.size
    out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    opx = out.load()
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a < 10:
                continue
            if is_near_black(r, g, b) or is_skin(r, g, b):
                opx[x, y] = (r, g, b, a)
                continue
            # preserve pure metal-ish greys a bit for knight feel
            mx, mn = max(r, g, b), min(r, g, b)
            if mx - mn < 18 and mx > 80 and not is_near_white(r, g, b):
                # slight value tweak only
                v = min(255, max(0, int(mx * val_mul)))
                opx[x, y] = (v, v, v, a)
                continue
            h_, s, v = colorsys.rgb_to_hsv(r / 255.0, g / 255.0, b / 255.0)
            h_ = (h_ + hue_shift) % 1.0
            s = min(1.0, max(0.0, s * sat_mul))
            v = min(1.0, max(0.0, v * val_mul))
            rr, gg, bb = colorsys.hsv_to_rgb(h_, s, v)
            opx[x, y] = (int(rr * 255), int(gg * 255), int(bb * 255), a)
    return out


def save_unit(sheet: Image.Image, key: str, kind: str):
    folder = "characters" if kind == "character" else "monsters"
    for base in (HQ / folder, SPR / folder):
        base.mkdir(parents=True, exist_ok=True)
        sheet.save(base / f"{key}.png")


def fit_frame(im: Image.Image, fw: int, fh: int) -> Image.Image:
    im = im.convert("RGBA")
    # scale to fit height mostly
    scale = min(fw / max(1, im.width), fh / max(1, im.height))
    nw, nh = max(1, int(im.width * scale)), max(1, int(im.height * scale))
    resized = im.resize((nw, nh), Image.Resampling.NEAREST)
    canvas = Image.new("RGBA", (fw, fh), (0, 0, 0, 0))
    canvas.paste(resized, ((fw - nw) // 2, fh - nh), resized)
    return canvas


def sheet_from_frames(frames: list[Image.Image], cols: int, rows: int, fw: int, fh: int) -> Image.Image:
    sheet = Image.new("RGBA", (fw * cols, fh * rows), (0, 0, 0, 0))
    for i, fr in enumerate(frames):
        if i >= cols * rows:
            break
        r, c = divmod(i, cols)
        # actually row-major: i = row * cols + col
        row, col = i // cols, i % cols
        f = fit_frame(fr, fw, fh)
        sheet.paste(f, (col * fw, row * fh), f)
    # fill missing with first frame
    if frames:
        f0 = fit_frame(frames[0], fw, fh)
        for i in range(len(frames), cols * rows):
            row, col = i // cols, i % cols
            sheet.paste(f0, (col * fw, row * fh), f0)
    return sheet


def import_wolf():
    """Build 4×4-ish walk sheet from wolf-all strip pack."""
    src = CRITTERS / "wolf" / "no shadow & effects" / "wolf-all.png"
    if not src.is_file():
        src = CRITTERS / "wolf" / "wolf-all.png"
    if not src.is_file():
        print("  skip wolf (no critters pack)")
        return
    im = Image.open(src).convert("RGBA")
    # wolf-all is typically a grid; treat as 4 rows × N cols of equal cells
    # 960×1024 → try 4 rows × 4 cols of 240×256
    cols, rows = 4, 4
    cw, ch = im.width // cols, im.height // rows
    frames = []
    for row in range(rows):
        for col in range(cols):
            frames.append(im.crop((col * cw, row * ch, (col + 1) * cw, (row + 1) * ch)))
    # remap to our facing order if needed; pack may be different — still better art
    sheet = sheet_from_frames(frames, 4, 4, 96, 112)
    save_unit(sheet, "wolf", "monster")
    # dog = warmer tint of wolf
    save_unit(tint_image(sheet, 0.05, 1.1, 1.05), "dog", "monster")
    # bear = darker bulkier (tint only)
    save_unit(tint_image(sheet, 0.02, 0.9, 0.7), "bear", "monster")
    print("  wolf/dog/bear from critters")


def import_simple_quadruped(name: str, folder: str, hue=0.0):
    """Use a single idle strip frame if available."""
    base = CRITTERS / folder
    if not base.is_dir():
        return
    # pick largest idle-ish png
    cands = sorted(base.rglob("*.png"), key=lambda p: p.stat().st_size, reverse=True)
    if not cands:
        return
    im = Image.open(cands[0]).convert("RGBA")
    # horizontal strip → take first cell ~ square
    ch = im.height
    cw = ch if im.width >= ch else im.width
    frames = []
    n = max(1, im.width // max(1, cw))
    for i in range(min(4, n)):
        frames.append(im.crop((i * cw, 0, (i + 1) * cw, ch)))
    while len(frames) < 4:
        frames.append(frames[-1])
    # 4 dirs × 4 walk: repeat strip per row
    all_f = frames * 4
    sheet = sheet_from_frames(all_f, 4, 4, 96, 96)
    if hue:
        sheet = tint_image(sheet, hue, 1.0, 1.0)
    save_unit(sheet, name, "monster")
    print(f"  {name} from {folder}")


def slime_sheet_from_goblin(goblin: Image.Image) -> Image.Image:
    """Extreme green squash tint — placeholder until real slime art."""
    return tint_image(goblin, 0.35, 1.4, 1.1)


def spider_like(goblin: Image.Image) -> Image.Image:
    return tint_image(goblin, 0.95, 0.8, 0.55)


def decor_variants():
    tree = HQ / "decor" / "tree_px.png"
    bush = HQ / "decor" / "bush_px.png"
    if not tree.is_file():
        print("  no tree_px base")
        return
    t = Image.open(tree).convert("RGBA")
    b = Image.open(bush).convert("RGBA") if bush.is_file() else t

    variants = {
        "tree": t,
        "tree2": tint_image(t, 0.05, 1.1, 1.0),
        "tree_dead": tint_image(t, 0.08, 0.25, 0.75),
        "tree_snow": snow_overlay(t),
        "jungle_tree": tint_image(t, 0.12, 1.2, 0.85),
        "jungle_tree2": tint_image(t, 0.18, 1.15, 0.9),
        "bush": b,
        "bush2": tint_image(b, 0.05, 1.0, 1.05),
        "bush3": tint_image(b, -0.03, 1.1, 0.95),
        "bush_snow": snow_overlay(b),
        "bush_haunted": tint_image(b, 0.7, 0.6, 0.7),
        "jungle_bush": tint_image(b, 0.15, 1.2, 0.9),
    }
    for name, im in variants.items():
        for base in (HQ / "decor", SPR / "decor"):
            base.mkdir(parents=True, exist_ok=True)
            im.save(base / f"{name}.png")
        if name in ("tree", "tree2", "tree_dead", "bush"):
            (HQ / "decor").mkdir(parents=True, exist_ok=True)
            im.save(HQ / "decor" / f"{name}_px.png")
    # re-save canonical px names from good bases
    t.save(HQ / "decor" / "tree_px.png")
    tint_image(t, 0.05, 1.1, 1.0).save(HQ / "decor" / "tree2_px.png")
    tint_image(t, 0.08, 0.25, 0.75).save(HQ / "decor" / "tree_dead_px.png")
    b.save(HQ / "decor" / "bush_px.png")
    print("  decor tree/bush variants")


def snow_overlay(im: Image.Image) -> Image.Image:
    im = im.convert("RGBA")
    px = im.load()
    w, h = im.size
    out = im.copy()
    opx = out.load()
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a < 20:
                continue
            # top-ish green pixels get snow flecks
            if g > r and g > b and y < h * 0.55 and (x * 17 + y * 31) % 7 == 0:
                opx[x, y] = (240, 244, 255, a)
            elif g > r + 10 and y < h * 0.4 and (x + y) % 5 == 0:
                opx[x, y] = (230, 236, 250, a)
    return out


def copy_prop_placeholders():
    """
    Non-billboard props are mostly meshes in Iso3D. For 2D map icons, use
    small crops from tree/bush/rock-like tints rather than stick art.
    """
    rock_src = HQ / "decor" / "tree_dead_px.png"
    if not rock_src.is_file():
        rock_src = HQ / "decor" / "tree_px.png"
    base = Image.open(rock_src).convert("RGBA")
    # rock = grey squat version
    rock = tint_image(base, 0.0, 0.05, 0.75)
    # scale down on canvas
    rock = fit_frame(rock, 64, 48)

    props = {
        "rock": rock,
        "rocks": rock,
        "stump": tint_image(fit_frame(base, 48, 56), 0.05, 0.6, 0.8),
        "log": tint_image(fit_frame(base, 72, 40), 0.06, 0.5, 0.75),
        "mushroom": tint_image(fit_frame(base, 40, 48), -0.05, 1.3, 1.0),
        "crystal": tint_image(fit_frame(base, 40, 56), 0.55, 1.4, 1.2),
        "ore": tint_image(fit_frame(base, 48, 48), 0.5, 1.2, 0.9),
        "campfire": tint_image(fit_frame(base, 48, 48), -0.05, 1.5, 1.1),
        "flower": tint_image(fit_frame(base, 32, 48), 0.9, 1.3, 1.1),
        "barrel": tint_image(fit_frame(base, 40, 52), 0.07, 0.7, 0.7),
        "oil_barrel": tint_image(fit_frame(base, 40, 52), 0.0, 0.2, 0.45),
        "acid_barrel": tint_image(fit_frame(base, 40, 52), 0.3, 1.2, 0.8),
        "powder_barrel": tint_image(fit_frame(base, 40, 52), -0.02, 1.0, 0.55),
        "chest": tint_image(fit_frame(base, 48, 40), 0.1, 1.0, 0.9),
        "crate": tint_image(fit_frame(base, 48, 48), 0.08, 0.6, 0.85),
        "sign": tint_image(fit_frame(base, 40, 56), 0.1, 0.5, 0.9),
        "sign_post": tint_image(fit_frame(base, 40, 56), 0.1, 0.5, 0.9),
        "tent": tint_image(fit_frame(base, 56, 48), -0.02, 1.0, 0.85),
        "table": tint_image(fit_frame(base, 56, 40), 0.08, 0.5, 0.8),
        "bench": tint_image(fit_frame(base, 56, 36), 0.08, 0.5, 0.8),
        "fence": tint_image(fit_frame(base, 56, 48), 0.08, 0.4, 0.75),
        "fence_snow": snow_overlay(tint_image(fit_frame(base, 56, 48), 0.08, 0.4, 0.75)),
        "hedge": tint_image(fit_frame(base, 56, 48), 0.3, 1.2, 0.7),
        "hedge_snow": snow_overlay(tint_image(fit_frame(base, 56, 48), 0.3, 1.2, 0.7)),
        "trap": tint_image(fit_frame(base, 48, 40), -0.02, 0.3, 0.6),
        "trap2": tint_image(fit_frame(base, 48, 40), -0.02, 0.3, 0.55),
        "trap3": tint_image(fit_frame(base, 48, 40), -0.02, 0.3, 0.5),
        "trap_safe": tint_image(fit_frame(base, 48, 40), 0.3, 0.8, 0.8),
        "trap_safe2": tint_image(fit_frame(base, 48, 40), 0.3, 0.8, 0.85),
        "trap_safe3": tint_image(fit_frame(base, 48, 40), 0.3, 0.8, 0.9),
        "door": tint_image(fit_frame(base, 40, 64), 0.07, 0.6, 0.7),
        "door_open": tint_image(fit_frame(base, 40, 64), 0.07, 0.5, 0.75),
        "door_n": tint_image(fit_frame(base, 40, 64), 0.07, 0.6, 0.7),
        "door_ne": tint_image(fit_frame(base, 40, 64), 0.07, 0.6, 0.7),
        "door_nw": tint_image(fit_frame(base, 40, 64), 0.07, 0.6, 0.7),
        "door_se": tint_image(fit_frame(base, 40, 64), 0.07, 0.6, 0.7),
        "door_sw": tint_image(fit_frame(base, 40, 64), 0.07, 0.6, 0.7),
        "grate": tint_image(fit_frame(base, 48, 40), 0.0, 0.1, 0.5),
        "grate_open": tint_image(fit_frame(base, 48, 40), 0.0, 0.1, 0.55),
        "cauldron": tint_image(fit_frame(base, 48, 48), 0.55, 0.2, 0.4),
        "cauldron_tipped": tint_image(fit_frame(base, 48, 48), 0.55, 0.2, 0.45),
        "lever": tint_image(fit_frame(base, 32, 56), 0.0, 0.2, 0.7),
        "switch": tint_image(fit_frame(base, 40, 48), 0.3, 0.5, 0.8),
        "bush_wall": tint_image(fit_frame(base, 56, 48), 0.3, 1.1, 0.7),
    }
    for name, im in props.items():
        for base_dir in (HQ / "decor", SPR / "decor"):
            base_dir.mkdir(parents=True, exist_ok=True)
            im.save(base_dir / f"{name}.png")
    print(f"  {len(props)} prop icons (mesh props still preferred in 3D)")


def main():
    fighter_p = HQ / "characters" / "fighter.png"
    goblin_p = HQ / "monsters" / "goblin.png"
    if not fighter_p.is_file() or not goblin_p.is_file():
        raise SystemExit(
            "Missing PixelLab bases. Restore with:\n"
            "  git checkout HEAD -- dnd-character/sprites/hq/characters/fighter.png "
            "dnd-character/sprites/hq/monsters/goblin.png"
        )

    fighter = Image.open(fighter_p).convert("RGBA")
    goblin = Image.open(goblin_p).convert("RGBA")
    print(f"base fighter {fighter.size}, goblin {goblin.size}")

    # --- characters from fighter ---
    for key, (h, s, v) in CLASS_TINT.items():
        if key == "fighter":
            sheet = fighter
        else:
            sheet = tint_image(fighter, h, s, v)
        save_unit(sheet, key, "character")
        print(f"  class {key}")

    # wiz 8-dir from wizard tint first col
    wiz_sheet = Image.open(HQ / "characters" / "wizard.png")
    fw, fh = wiz_sheet.size[0] // 4, wiz_sheet.size[1] // 4
    w8 = Image.new("RGBA", (fw, fh * 8), (0, 0, 0, 0))
    for i in range(8):
        row = min(i, 3)
        fr = wiz_sheet.crop((0, row * fh, fw, (row + 1) * fh))
        w8.paste(fr, (0, i * fh), fr)
    w8.save(HQ / "characters" / "wiz.png")
    w8.save(HQ / "characters" / "wizard_purple.png")
    fighter.crop((0, 0, fighter.size[0] // 4, fighter.size[1] // 4)).save(
        HQ / "characters" / "fighter_idle.png"
    )

    # --- monsters from goblin ---
    for key, (h, s, v) in MONSTER_TINT.items():
        sheet = goblin if key == "goblin" else tint_image(goblin, h, s, v)
        save_unit(sheet, key, "monster")
        print(f"  mon {key}")

    save_unit(slime_sheet_from_goblin(goblin), "slime", "monster")
    save_unit(spider_like(goblin), "spider", "monster")
    save_unit(tint_image(goblin, 0.45, 0.4, 1.2), "bat", "monster")
    save_unit(tint_image(goblin, 0.02, 0.5, 0.7), "rat", "monster")
    save_unit(tint_image(goblin, 0.3, 1.1, 0.9), "snake", "monster")
    save_unit(tint_image(goblin, 0.1, 0.6, 1.15), "chicken", "monster")
    save_unit(tint_image(goblin, 0.05, 0.8, 1.0), "cat", "monster")
    print("  mon slime/spider/bat/rat/snake/chicken/cat")

    goblin.crop((0, 0, goblin.size[0] // 4, goblin.size[1] // 4)).save(
        HQ / "monsters" / "goblin_idle.png"
    )

    import_wolf()
    import_simple_quadruped("stag_unused", "stag")  # optional

    decor_variants()
    copy_prop_placeholders()

    # mirror fighter aliases already saved; ensure SPR mirrors HQ fighters
    for p in (HQ / "characters").glob("*.png"):
        dest = SPR / "characters" / p.name
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(p, dest)
    for p in (HQ / "monsters").glob("*.png"):
        dest = SPR / "monsters" / p.name
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(p, dest)

    print("done — pack built from PixelLab bases + critters (no stick figures).")


if __name__ == "__main__":
    main()
