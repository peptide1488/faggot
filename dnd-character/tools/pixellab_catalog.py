"""
Grimoire asset catalog — short subjects + sizes.
Style knobs live in pixellab_style.py.
"""

from __future__ import annotations

from pixellab_style import (
    DECOR_SHIP,
    HUMAN_PROPORTIONS,
    HERO_PROPORTIONS,
    SMALL_PROPORTIONS,
    TILE_SIZE,
    UNIT_H,
    UNIT_W,
)

# ---------------------------------------------------------------------------
# TERRAIN — 128×128 seamless (opaque). Pixflux only.
# ---------------------------------------------------------------------------
_TERRAIN_TAIL = "seamless tileable continuous top-down texture, even density, no center motif"
TERRAIN: dict[str, dict] = {
    "grass": {
        "description": f"soft green grass field, tiny blades, muted olive, {_TERRAIN_TAIL}",
    },
    "dirt": {
        "description": f"brown packed earth soil, fine grain, {_TERRAIN_TAIL}",
    },
    "sand": {
        "description": f"tan desert sand, fine grain, {_TERRAIN_TAIL}",
    },
    "snow": {
        "description": f"white snow ground, soft powder, {_TERRAIN_TAIL}",
    },
    "mud": {
        "description": f"dark wet mud, subtle puddle sheen, {_TERRAIN_TAIL}",
    },
    "stone": {
        "description": f"grey cobblestone floor, small stones, {_TERRAIN_TAIL}",
    },
    "water": {
        "description": f"blue water surface, soft ripples only, {_TERRAIN_TAIL}",
    },
    "wood": {
        "description": f"wooden plank floor boards horizontal, {_TERRAIN_TAIL}",
    },
    "brick_top": {
        "description": f"red brick pavement top view, small bricks, {_TERRAIN_TAIL}",
    },
    "cave_top": {
        "description": f"dark grey cave rock floor, {_TERRAIN_TAIL}",
    },
    "grass_side": {
        "description": (
            "dirt cliff bank side view with thin grass fringe only on the top edge, "
            "seamless horizontal strip, soft painted fantasy RPG, no objects"
        ),
    },
    "wood_side": {
        "description": (
            "vertical wooden wall planks seamless, soft painted fantasy RPG, no objects"
        ),
    },
    "brick": {
        "description": (
            "red brick wall face courses seamless, soft painted fantasy RPG, no objects"
        ),
    },
    "cave_wall": {
        "description": (
            "dark cave rock wall face seamless, soft painted fantasy RPG, no objects"
        ),
    },
}
for _v in TERRAIN.values():
    _v.setdefault("w", TILE_SIZE)
    _v.setdefault("h", TILE_SIZE)
    _v.setdefault("no_background", False)

# ---------------------------------------------------------------------------
# DECOR — 128×128 transparent via Pixflux (NOT map-objects blob mode)
# ---------------------------------------------------------------------------
DECOR: dict[str, dict] = {
    "tree": {
        "description": "full tall oak tree thick brown trunk dense green leafy canopy",
        "coverage": 92,
    },
    "tree2": {
        "description": "full tall deciduous tree brown bark full green foliage",
        "coverage": 92,
    },
    "tree_snow": {
        "description": "full tall pine tree snow on green needles brown trunk",
        "coverage": 92,
    },
    "jungle_tree": {
        "description": "full tall tropical palm tree green fronds brown trunk",
        "coverage": 92,
    },
    "jungle_tree2": {
        "description": "full tall jungle tree broad green leaves thick trunk",
        "coverage": 92,
    },
    "bush": {
        "description": "round leafy green bush shrub no trunk",
        "coverage": 88,
    },
    "bush2": {
        "description": "dense green bush clump no trunk",
        "coverage": 88,
    },
    "bush3": {
        "description": "olive green bush shrub no trunk",
        "coverage": 88,
    },
    "bush_snow": {
        "description": "round bush light snow on top no trunk",
        "coverage": 88,
    },
    "bush_haunted": {
        "description": "dark twisted purple bush no trunk",
        "coverage": 88,
    },
    "jungle_bush": {
        "description": "lush tropical fern bush no trunk",
        "coverage": 88,
    },
    "flower": {"description": "small wildflower cluster low plants", "coverage": 70},
    "mushroom": {"description": "cluster red white mushrooms", "coverage": 75},
    "hedge": {"description": "trimmed green hedge wall section", "coverage": 85},
    "hedge_snow": {"description": "trimmed hedge with snow cap", "coverage": 85},
    "rock": {"description": "grey brown boulder rock", "coverage": 82},
    "rocks": {"description": "small pile grey stones", "coverage": 80},
    "crystal": {"description": "blue purple crystal mineral cluster", "coverage": 82},
    "ore": {"description": "rock with gold ore veins", "coverage": 82},
    "log": {"description": "fallen brown timber log", "coverage": 80},
    "campfire": {"description": "campfire burning logs orange flames on the ground", "coverage": 80},
    # torch ≠ campfire / fireplace — wall sconce with single flame
    "torch": {
        "description": "wooden wall torch with iron bracket and single burning flame, tall vertical torch pole, not a campfire",
        "coverage": 80,
        "w": 96,
        "h": 128,
    },
    "torch_unlit": {
        "description": "wooden wall torch with iron bracket, unlit, no flame, empty sconce, tall vertical",
        "coverage": 80,
        "w": 96,
        "h": 128,
    },
    "barrel": {"description": "wooden barrel", "coverage": 82},
    "oil_barrel": {"description": "metal oil drum", "coverage": 82},
    "acid_barrel": {"description": "wooden barrel green toxic liquid", "coverage": 82},
    "powder_barrel": {"description": "gunpowder wooden barrel", "coverage": 82},
    "crate": {"description": "wooden crate box", "coverage": 82},
    "chest": {"description": "closed wooden treasure chest", "coverage": 82},
    "sign": {"description": "blank wooden sign on post", "coverage": 78},
    "sign_post": {"description": "wooden post blank sign", "coverage": 78},
    "bell": {"description": "metal hanging bell", "coverage": 75},
    "tent": {"description": "canvas camping tent", "coverage": 85},
    "fence": {"description": "wooden fence section", "coverage": 80},
    "table": {"description": "wooden table", "coverage": 82},
    "bench": {"description": "wooden bench", "coverage": 80},
    "cauldron": {"description": "iron cauldron pot", "coverage": 80},
    "cauldron_tipped": {"description": "tipped iron cauldron spilling", "coverage": 80},
    "lever": {"description": "stone floor lever", "coverage": 75},
    "switch": {"description": "stone wall lever switch", "coverage": 75},
    "trap": {"description": "floor spike trap open", "coverage": 78},
    "trap_safe": {"description": "disabled safe floor trap", "coverage": 78},
    "door": {"description": "closed wooden door front", "coverage": 85},
    "door_open": {"description": "open wooden door frame", "coverage": 85},
    "grate": {"description": "metal floor grate closed", "coverage": 80},
    "grate_open": {"description": "open metal floor grate hole", "coverage": 80},
}
for _v in DECOR.values():
    _v.setdefault("w", DECOR_SHIP)
    _v.setdefault("h", DECOR_SHIP)
    _v.setdefault("kind", "pixflux")
    _v.setdefault("coverage", 85)

# ---------------------------------------------------------------------------
# CHARACTERS / MONSTERS — unchanged approach (4-dir sheets)
# ---------------------------------------------------------------------------
CHARACTERS: dict[str, dict] = {
    "fighter": {"description": "human fighter leather armor sword standing", "proportions": HERO_PROPORTIONS},
    "barbarian": {"description": "human barbarian fur armor greataxe standing", "proportions": HERO_PROPORTIONS},
    "paladin": {"description": "human paladin plate armor shield holy symbol standing", "proportions": HERO_PROPORTIONS},
    "ranger": {"description": "human ranger cloak bow quiver standing", "proportions": HUMAN_PROPORTIONS},
    "rogue": {"description": "human rogue dark hood dual daggers standing", "proportions": HUMAN_PROPORTIONS},
    "monk": {"description": "human monk robes bare fists standing", "proportions": HUMAN_PROPORTIONS},
    "bard": {"description": "human bard colorful clothes lute standing", "proportions": HUMAN_PROPORTIONS},
    "cleric": {"description": "human cleric white robes mace holy symbol standing", "proportions": HUMAN_PROPORTIONS},
    "druid": {"description": "human druid leaf cloak staff standing", "proportions": HUMAN_PROPORTIONS},
    # Style anchor: https://www.pixellab.ai/create-character/d04f2a44-b68a-4698-a319-8cf128469903
    "wizard": {
        "description": (
            "A wizard with a long, flowing white beard and sharp, intelligent eyes. "
            "Wearing a voluminous, oversized deep purple robe embroidered with subtle "
            "gold star patterns and a matching wide-brimmed pointed wizard hat"
        ),
        "proportions": HUMAN_PROPORTIONS,
    },
    "sorcerer": {"description": "human sorcerer red robe arcane energy standing", "proportions": HUMAN_PROPORTIONS},
    "warlock": {"description": "human warlock dark robe eldritch book standing", "proportions": HUMAN_PROPORTIONS},
    "artificer": {"description": "human artificer goggles tools mechanical gauntlet standing", "proportions": HUMAN_PROPORTIONS},
    "human": {"description": "plain human villager simple clothes standing", "proportions": HUMAN_PROPORTIONS},
}

MONSTERS: dict[str, dict] = {
    "goblin": {"description": "green goblin warrior crude spear standing", "proportions": SMALL_PROPORTIONS},
    "orc": {"description": "green orc warrior axe standing", "proportions": HERO_PROPORTIONS},
    "skeleton": {"description": "animated skeleton warrior sword standing", "proportions": HUMAN_PROPORTIONS},
    "zombie": {"description": "rotting zombie shambling standing", "proportions": HUMAN_PROPORTIONS},
    "ogre": {"description": "large ogre club standing", "proportions": HERO_PROPORTIONS},
    "demon": {"description": "red demon horns wings standing", "proportions": HERO_PROPORTIONS},
    "ghost": {"description": "translucent blue ghost floating", "proportions": HUMAN_PROPORTIONS},
    "specter": {"description": "dark hooded specter spirit standing", "proportions": HUMAN_PROPORTIONS},
    "slime": {"description": "green blob slime monster", "proportions": SMALL_PROPORTIONS},
    "spider": {"description": "giant spider monster", "proportions": SMALL_PROPORTIONS},
    "wolf": {"description": "grey wolf animal standing", "template_id": "dog"},
    "bear": {"description": "brown bear animal standing", "template_id": "bear"},
    "dog": {"description": "brown dog animal standing", "template_id": "dog"},
    "cat": {"description": "orange tabby cat animal standing", "template_id": "cat"},
    "bat": {"description": "black bat wings spread", "proportions": SMALL_PROPORTIONS},
    "rat": {"description": "grey giant rat standing", "proportions": SMALL_PROPORTIONS},
    "snake": {"description": "green snake coiled", "proportions": SMALL_PROPORTIONS},
    "harpy": {"description": "harpy bird woman wings standing", "proportions": HUMAN_PROPORTIONS},
    "imp": {"description": "small red imp devil standing", "proportions": SMALL_PROPORTIONS},
    "mushroom": {"description": "walking mushroom creature standing", "proportions": SMALL_PROPORTIONS},
    "knight": {"description": "armored knight sword shield standing", "proportions": HERO_PROPORTIONS},
    "villager": {"description": "medieval villager commoner standing", "proportions": HUMAN_PROPORTIONS},
    "angel": {"description": "angel white wings halo standing", "proportions": HERO_PROPORTIONS},
    "mimic": {"description": "mimic treasure chest with teeth tongue", "proportions": SMALL_PROPORTIONS},
    "chicken": {"description": "brown chicken bird standing", "proportions": SMALL_PROPORTIONS},
}

for _pack in (CHARACTERS, MONSTERS):
    for _v in _pack.values():
        _v.setdefault("w", UNIT_W)
        _v.setdefault("h", UNIT_H)
        _v.setdefault("kind", "character_4dir")
        _v.setdefault("template_id", "mannequin")
