# Sprite pipeline — walk sheets

## Engine behaviour

Iso3D (`host._spriteFrame` + `getSpriteFrameUV`) samples multi-direction walk sheets:

| Axis | Meaning |
|------|---------|
| **Row** | Facing: `down`, `left`, `right`, `up` (top → bottom) |
| **Column** | Walk cycle: col 0 idle, cols 1–3 steps |

## Canonical sheet format

| Property | Value |
|----------|--------|
| Layout | **4 columns × 4 rows** |
| Rows (top→bottom) | down, left, right, up |
| Columns | walk cycle (col 0 = idle) |
| Anchor | **feet** at bottom-center of each cell |
| Format | PNG, RGBA, transparent background |
| Filtering | nearest-neighbor (`pixelPerfect: true`) |

Frame size (HQ): **128×128** px per cell → sheet **512×512**.
Built via Imagine gens + process tools (magenta chroma → walk sheet).

**Art rule:** never ask the model for black outlines / ink strokes — see `tools/ART_PROMPTS.md`.

## Folder layout

```
sprites/
  hq/characters/<class>.png
  hq/monsters/<key>.png
  hq/decor/
  hq/terrain/
  SPRITE_PIPELINE.md
```

Default pack is **HQ only** (`SPRITE_PACK = 'hq'` in `iso3d/src/adapter.js`).

## Authoring

1. Edit / re-run `python tools/gen_pixel_sprites.py`, **or** drop hand-drawn sheets into `hq/characters|monsters/`.
2. Keys are listed in `HQ_CHARACTER_KEYS` / `HQ_MONSTER_KEYS` and `SPRITE_MANIFEST` in `index.html`.
3. Optional size overrides: `DEFAULT_SPRITE_DRAW` in `adapter.js`.
