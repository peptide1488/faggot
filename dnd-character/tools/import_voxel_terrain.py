#!/usr/bin/env python3
"""
Slice iso3d-engine's voxel atlas into Grimoire HQ terrain PNGs.

Source: iso3d-engine/src/voxel/atlas.png (8×8 × 32px cells, from tools/gen_atlas.py)
Target: dnd-character/sprites/hq/terrain/*.png

Upscales each 32px cell → 128px nearest-neighbor so tiling stays chunky/pixel-art
and matches the size other HQ tiles already used.
"""
from __future__ import annotations

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
ATLAS = ROOT / "iso3d-engine" / "src" / "voxel" / "atlas.png"
OUT = ROOT / "dnd-character" / "sprites" / "hq" / "terrain"

COLS, CELL = 8, 32
OUT_SIZE = 128  # 4× NN upscale

# Grimoire terrain filename → atlas TEX id (see iso3d-engine/src/voxel/blocks.js TEX)
# Only cells that exist as real voxel art — snow/lava stay on older Grimoire art.
EXPORTS = {
    "grass.png": 0,       # GRASS_TOP
    "grass_side.png": 1,  # GRASS_SIDE (dirt body + grass fringe) — for banks/cliffs
    "dirt.png": 2,        # DIRT
    "stone.png": 3,       # STONE
    "sand.png": 4,        # SAND
    "water.png": 6,       # WATER
    "wood.png": 8,        # PLANKS (floor boards — better ground than log WOOD)
    "wood_side.png": 7,   # WOOD log grain — wall faces
    "brick.png": 12,      # WALL_MID
    "brick_top.png": 16,  # WALL_TOP (cap looking down)
    "cave_wall.png": 20,  # CLIFF_MID stratified rock
    "cave_top.png": 18,   # CLIFF_TOP plateau
    "mud.png": 22,        # MUD
}


def cell_crop(atlas: Image.Image, tex_id: int) -> Image.Image:
    c, r = tex_id % COLS, tex_id // COLS
    x0, y0 = c * CELL, r * CELL
    return atlas.crop((x0, y0, x0 + CELL, y0 + CELL))


def main() -> None:
    if not ATLAS.is_file():
        raise SystemExit(f"missing atlas: {ATLAS}")
    atlas = Image.open(ATLAS).convert("RGBA")
    OUT.mkdir(parents=True, exist_ok=True)
    for name, tex_id in EXPORTS.items():
        tile = cell_crop(atlas, tex_id)
        big = tile.resize((OUT_SIZE, OUT_SIZE), Image.Resampling.NEAREST)
        path = OUT / name
        big.save(path, "PNG")
        print(f"  {name:18s}  TEX {tex_id:2d}  → {path.relative_to(ROOT)}  ({OUT_SIZE}px)")
    print(f"done — {len(EXPORTS)} terrain tiles from {ATLAS.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
