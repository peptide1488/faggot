"""
PixelLab style bible for Grimoire.

================================================================
STYLE ANCHOR (user-approved):
  https://www.pixellab.ai/create-character/d04f2a44-b68a-4698-a319-8cf128469903
  Character id: d04f2a44-b68a-4698-a319-8cf128469903
  Local frames: sprites/hq/_style_ref/wizard_*.png
  Anchor PNG:   sprites/hq/_style_ref/STYLE_ANCHOR.png  (south)

WHAT "THE LOOK" IS:
  - Classic high fantasy pixel art (not chibi, not stick figures, not Disgaea soup)
  - High top-down camera (~35°)
  - Clean black outlines, readable silhouette
  - Rich cloth folds, embroidery, face detail, hat volume
  - Transparent BG, subject small-on-canvas (v3 pads for animation)
  - Generation mode: pixen_v3

ANCHOR PROMPT (exact from PixelLab):
  "A wizard with a long, flowing white beard and sharp, intelligent eyes.
   Wearing a voluminous, oversized deep purple robe embroidered with subtle
   gold star patterns and a matching wide-brimmed pointed wizard hat.
   standing, arms at side.  Classic high fantasy mage design.
   top down isometric angle"

CHARACTER CREATOR UI (locked):
  Create from Text | Humanoid | v3 | High Top-Down | 96×128
  Detail: Highly detailed | Outline: Black outline
================================================================
"""

from __future__ import annotations

from pathlib import Path

# --- style anchor ---
STYLE_CHARACTER_ID = "d04f2a44-b68a-4698-a319-8cf128469903"
STYLE_ANCHOR_PATH = (
    Path(__file__).resolve().parents[1] / "sprites" / "hq" / "_style_ref" / "STYLE_ANCHOR.png"
)

# Prompt tail — D&D / Ogre Battle / Diablo 2: detailed dark fantasy, not chibi/cartoon
STYLE_TAIL = (
    "Classic dark fantasy RPG design, Ogre Battle and Diablo 2 style. "
    "Detailed pixel art, grim and grounded, not cute not chibi not cartoon. "
    "Clean black outlines, readable silhouette, top down isometric angle"
)

# --- sizes ---
UNIT_W, UNIT_H = 96, 128
DECOR_GEN = 160
DECOR_SHIP = 128
TILE_SIZE = 32

# --- character creator knobs (match UI + anchor) ---
CHAR_VIEW = "high top-down"
CHAR_OUTLINE = "single color black outline"
CHAR_DETAIL = "highly detailed"
CHAR_TEMPLATE_HUMANOID = "mannequin"

# props
PROP_OUTLINE = "selective outline"
PROP_SHADING = "detailed shading"
PROP_DETAIL = "high detail"
PROP_VIEW = "low top-down"
GUIDANCE = 8.0

HUMAN_PROPORTIONS = {"type": "preset", "name": "stylized"}
HERO_PROPORTIONS = {"type": "preset", "name": "heroic"}
SMALL_PROPORTIONS = {"type": "preset", "name": "chibi"}

SEED_BASE = 88001


def seed_for(name: str) -> int:
    return (SEED_BASE + sum(ord(c) * (i + 3) for i, c in enumerate(name))) % 2_147_483_647


def style_description(subject: str) -> str:
    """Subject first, then the wizard-style tail (same structure as the anchor prompt)."""
    s = subject.strip().rstrip(".")
    # mirror anchor: concrete subject + pose + style tags
    if "standing" not in s.lower():
        s = f"{s}, standing, arms at side"
    return f"{s}. {STYLE_TAIL}"


def character_v3_body(
    description: str,
    w: int = UNIT_W,
    h: int = UNIT_H,
    *,
    seed: int,
    template_id: str = CHAR_TEMPLATE_HUMANOID,
    name: str | None = None,
) -> dict:
    """
    POST /create-character-v3 — matches Character Creator UI + wizard style anchor.
    """
    return {
        "description": style_description(description),
        "image_size": {"width": w, "height": h},
        "view": CHAR_VIEW,
        "template_id": template_id or CHAR_TEMPLATE_HUMANOID,
        "no_background": True,
        "outline": CHAR_OUTLINE,
        "detail": CHAR_DETAIL,
        "enhance_prompt": True,
        "seed": seed,
        "name": (name or description)[:50],
    }


def map_object_body(description: str, w: int = DECOR_GEN, h: int = DECOR_GEN, *, seed: int) -> dict:
    return {
        "description": f"{description.strip()}. Classic high fantasy game prop, detailed pixel art",
        "image_size": {"width": w, "height": h},
        "view": PROP_VIEW,
        "outline": PROP_OUTLINE,
        "shading": PROP_SHADING,
        "detail": PROP_DETAIL,
        "text_guidance_scale": GUIDANCE,
        "seed": seed,
    }


def pixen_body(
    description: str,
    w: int,
    h: int,
    *,
    seed: int,
    no_background: bool = True,
    view: str = PROP_VIEW,
    direction: str | None = "south",
) -> dict:
    body = {
        "description": f"{description.strip()}. Classic high fantasy, detailed pixel art",
        "image_size": {"width": w, "height": h},
        "outline": PROP_OUTLINE,
        "detail": "highly detailed",
        "view": view,
        "no_background": no_background,
        "background_removal_task": "remove_complex_background",
        "enhance_prompt": True,
        "seed": seed,
    }
    if direction:
        body["direction"] = direction
    return body


def pro_image_body(description: str, w: int, h: int, *, seed: int, no_background: bool = True) -> dict:
    return {
        "description": f"{description.strip()}. Classic high fantasy, detailed pixel art",
        "image_size": {"width": w, "height": h},
        "no_background": no_background,
        "seed": seed,
    }


def tiles_pro_body(description: str, tile_size: int = TILE_SIZE, *, seed: int | None = None) -> dict:
    body = {
        "description": description,
        "tile_type": "square_topdown",
        "tile_size": tile_size,
        "tile_view": "top-down",
    }
    if seed is not None:
        body["seed"] = seed
    return body
