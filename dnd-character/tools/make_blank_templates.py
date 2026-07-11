#!/usr/bin/env python3
"""
Generate blank transparent PNG templates for every sprite/texture key the
engine actually references, at the canonical size for its category, so art
can be hand-filled and dropped straight into place.

Run: python tools/make_blank_templates.py
Output: dnd-character/sprites/_templates/{characters,monsters,decor,terrain}/*.png
"""
from pathlib import Path
from PIL import Image

OUT = Path(__file__).resolve().parent.parent / "sprites" / "_templates"

# --- Characters & monsters: 4x4 walk sheet, 64x64 per frame (256x256 total). ---
# Row = facing (down, left, right, up), col = walk frame (0 idle, 1-3 steps).
FRAME = 64
SHEET = FRAME * 4

CHARACTERS = [
    "fighter", "barbarian", "paladin", "ranger", "rogue", "monk", "bard",
    "cleric", "druid", "wizard", "sorcerer", "warlock", "artificer",
]

MONSTERS = [
    "skeleton", "zombie", "spider", "ogre", "demon", "slime", "goblin",
    "ghost", "wolf", "human", "orc", "bear", "snake", "bat", "rat",
    "harpy", "imp", "specter", "mushroom",
]

# --- Decor / interactable props: single-view billboard, 64x64. ---
# Grouped by what currently shares a placeholder (see adapter.js DEFAULT_DECOR_PATHS) —
# fill each key in separately even if several currently point at the same stand-in file.
DECOR = [
    # nature
    "tree", "tree2", "tree_dead", "tree_snow", "jungle_tree", "jungle_tree2",
    "bush", "bush2", "bush3", "bush_snow", "jungle_bush",
    "rock", "stump", "log", "mushroom", "crystal", "ore",
    # light sources
    "torch", "torch_unlit", "campfire",
    # interactables — currently ALL aliased to unrelated art (door=fence, trap=ore,
    # cauldron/oil_barrel/acid_barrel/powder_barrel all share one barrel.png). These
    # are the highest-value fills.
    "door", "door_open", "grate", "grate_open", "plank", "loose_rock",
    "lever", "switch", "trap", "trap_safe",
    "cauldron", "cauldron_tipped",
    "bell", "drawbridge", "drawbridge_down",
    "oil_barrel", "acid_barrel", "powder_barrel",
]
DECOR_SIZE = 64

# --- Terrain: seamless tileable ground/wall textures, 128x128. One per unique
# underlying file the engine samples (several Grimoire keys already alias the
# same file on purpose, e.g. grass+brush, stone+rubble+fog+web+caltrops). ---
TERRAIN = [
    "grass", "wood", "stone", "brick_wall", "sand", "snow", "mud", "dirt",
    "water", "lava", "cave_wall",  # cave_wall = new distinct rock wall (see Cave map fix)
]
TERRAIN_SIZE = 128


def blank(size_w, size_h=None):
    return Image.new("RGBA", (size_w, size_h or size_w), (0, 0, 0, 0))


def main():
    for key in CHARACTERS:
        dest = OUT / "characters" / f"{key}.png"
        dest.parent.mkdir(parents=True, exist_ok=True)
        blank(SHEET).save(dest)
    for key in MONSTERS:
        dest = OUT / "monsters" / f"{key}.png"
        dest.parent.mkdir(parents=True, exist_ok=True)
        blank(SHEET).save(dest)
    for key in DECOR:
        dest = OUT / "decor" / f"{key}.png"
        dest.parent.mkdir(parents=True, exist_ok=True)
        blank(DECOR_SIZE).save(dest)
    for key in TERRAIN:
        dest = OUT / "terrain" / f"{key}.png"
        dest.parent.mkdir(parents=True, exist_ok=True)
        blank(TERRAIN_SIZE).save(dest)

    n = len(CHARACTERS) + len(MONSTERS) + len(DECOR) + len(TERRAIN)
    print(f"Wrote {n} blank templates to {OUT}")
    print(f"  characters/  {len(CHARACTERS)} x {SHEET}x{SHEET} (4x4 sheet, {FRAME}px/frame)")
    print(f"  monsters/    {len(MONSTERS)} x {SHEET}x{SHEET} (4x4 sheet, {FRAME}px/frame)")
    print(f"  decor/       {len(DECOR)} x {DECOR_SIZE}x{DECOR_SIZE} (single view)")
    print(f"  terrain/     {len(TERRAIN)} x {TERRAIN_SIZE}x{TERRAIN_SIZE} (seamless tile)")


if __name__ == "__main__":
    main()
