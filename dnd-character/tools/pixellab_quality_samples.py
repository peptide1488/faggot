#!/usr/bin/env python3
"""
Generate a small quality matrix so we pick the RIGHT PixelLab path
before burning the full catalog again.

Outputs under sprites/hq/_samples/
  tree_mapobj.png      — /map-objects high detail @ 160
  tree_pro.png         — /generate-image-v2 Pro @ 128 (best of candidates)
  tree_pixen.png       — /create-image-pixen + enhance_prompt @ 128
  bush_mapobj.png
  rock_mapobj.png
  tiles_pro_sheet.png  — /create-tiles-pro square 32px grass/dirt/stone/sand
  fighter_v3_south.png — /create-character-v3 enhance (south only preview)

Run:  python tools/pixellab_quality_samples.py
"""

from __future__ import annotations

import sys
import time
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "sprites" / "hq" / "_samples"
sys.path.insert(0, str(Path(__file__).resolve().parent))

from pixellab_client import PixelLab
from pixellab_style import (
    DECOR_GEN,
    DECOR_SHIP,
    UNIT_H,
    UNIT_W,
    character_v3_body,
    map_object_body,
    pixen_body,
    pro_image_body,
    seed_for,
    tiles_pro_body,
)


def fit(img: Image.Image, w: int, h: int) -> Image.Image:
    img = img.convert("RGBA")
    a = img.split()[-1]
    bb = a.getbbox()
    if bb:
        img = img.crop(bb)
    iw, ih = img.size
    if iw < 1 or ih < 1:
        return Image.new("RGBA", (w, h), (0, 0, 0, 0))
    scale = min(w / iw, h / ih)
    nw, nh = max(1, int(iw * scale)), max(1, int(ih * scale))
    resized = img.resize((nw, nh), Image.Resampling.NEAREST)
    canvas = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    canvas.paste(resized, ((w - nw) // 2, h - nh), resized)
    return canvas


def pick_best(imgs: list[Image.Image]) -> Image.Image:
    """Prefer the candidate with most opaque pixels that aren't a tiny speck."""
    best, score = imgs[0], -1
    for im in imgs:
        im = im.convert("RGBA")
        opaque = sum(1 for p in im.getdata() if p[3] > 20)
        fill = opaque / max(1, im.size[0] * im.size[1])
        # mid fill is good; empty or full solid plate is bad
        s = opaque * (1.0 - abs(fill - 0.45))
        if s > score:
            best, score = im, s
    return best


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    c = PixelLab()
    bal = c.balance()
    print("balance:", bal)
    t0 = time.time()

    # --- TREE: three quality paths ---
    print("\n=== TREE map-objects 160 high detail ===")
    tree = c.create_map_object(
        map_object_body(
            "large oak tree with thick brown trunk and dense leafy green canopy",
            DECOR_GEN,
            DECOR_GEN,
            seed=seed_for("sample:tree:map"),
        )
    )
    fit(tree, DECOR_SHIP, DECOR_SHIP).save(OUT / "tree_mapobj.png")
    print("  saved tree_mapobj.png", tree.size)

    print("\n=== TREE generate-image-v2 Pro 128 ===")
    try:
        cands = c.generate_image_v2(
            pro_image_body(
                "large oak tree thick trunk full green canopy, isolated map prop",
                128,
                128,
                seed=seed_for("sample:tree:pro"),
                no_background=True,
            )
        )
        best = pick_best(cands)
        fit(best, DECOR_SHIP, DECOR_SHIP).save(OUT / "tree_pro.png")
        print(f"  saved tree_pro.png from {len(cands)} candidates")
    except Exception as e:
        print("  PRO FAILED:", e)

    print("\n=== TREE pixen+enhance 128 ===")
    try:
        tree_p = c.create_image_pixen(
            pixen_body(
                "large oak tree thick brown trunk dense green canopy",
                128,
                128,
                seed=seed_for("sample:tree:pixen"),
                no_background=True,
                view="low top-down",
                direction=None,
            )
        )
        fit(tree_p, DECOR_SHIP, DECOR_SHIP).save(OUT / "tree_pixen.png")
        print("  saved tree_pixen.png")
    except Exception as e:
        print("  PIXEN FAILED:", e)

    # --- bush + rock via map-objects (designed for this) ---
    print("\n=== BUSH / ROCK map-objects ===")
    bush = c.create_map_object(
        map_object_body(
            "round leafy green bush shrub, no trunk",
            DECOR_GEN,
            DECOR_GEN,
            seed=seed_for("sample:bush"),
        )
    )
    fit(bush, DECOR_SHIP, DECOR_SHIP).save(OUT / "bush_mapobj.png")
    rock = c.create_map_object(
        map_object_body(
            "grey brown boulder rock",
            DECOR_GEN,
            DECOR_GEN,
            seed=seed_for("sample:rock"),
        )
    )
    fit(rock, DECOR_SHIP, DECOR_SHIP).save(OUT / "rock_mapobj.png")
    print("  saved bush_mapobj.png rock_mapobj.png")

    # --- tiles pro ---
    print("\n=== TILES-PRO square 32 ===")
    try:
        tiles = c.create_tiles_pro(
            tiles_pro_body(
                "1). soft green grass field tile "
                "2). brown packed dirt tile "
                "3). grey cobblestone tile "
                "4). tan desert sand tile",
                tile_size=32,
                seed=seed_for("sample:tiles"),
            )
        )
        # save individual + contact sheet
        sheet_w = 32 * min(4, len(tiles))
        sheet = Image.new("RGBA", (sheet_w, 32 * ((len(tiles) + 3) // 4)), (0, 0, 0, 0))
        names = ["grass", "dirt", "stone", "sand"]
        for i, im in enumerate(tiles):
            im = im.convert("RGBA")
            if im.size != (32, 32):
                im = im.resize((32, 32), Image.Resampling.NEAREST)
            im.save(OUT / f"tile_{names[i] if i < len(names) else i}.png")
            # also 128 NN for in-engine sampling
            im.resize((128, 128), Image.Resampling.NEAREST).save(
                OUT / f"tile_{names[i] if i < len(names) else i}_128.png"
            )
            sheet.paste(im, ((i % 4) * 32, (i // 4) * 32), im)
        sheet.save(OUT / "tiles_pro_sheet.png")
        print(f"  saved {len(tiles)} tiles + sheet")
    except Exception as e:
        print("  TILES-PRO FAILED:", e)

    # --- character v3 preview ---
    print("\n=== FIGHTER character-v3 ===")
    try:
        res = c.create_character_v3(
            character_v3_body(
                "human fighter in leather armor holding a sword",
                UNIT_W,
                UNIT_H,
                seed=seed_for("sample:fighter"),
            )
        )
        by = res.get("by_dir") or {}
        if by.get("south"):
            fit(by["south"], UNIT_W, UNIT_H).save(OUT / "fighter_v3_south.png")
            print("  saved fighter_v3_south.png")
        else:
            print("  dirs:", list(by.keys()), "imgs", len(res.get("images") or []))
            for i, im in enumerate(res.get("images") or []):
                im.save(OUT / f"fighter_v3_{i}.png")
    except Exception as e:
        print("  CHAR-V3 FAILED:", e)

    print(f"\nDONE in {time.time()-t0:.0f}s → {OUT}")
    print("Open the _samples folder and pick the winner paths before full regen.")


if __name__ == "__main__":
    main()
