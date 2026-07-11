# Sprite pipeline — walk sheets

## Why walk / facing “did nothing”

The engine **already** samples multi-direction walk sheets:

| Axis | Meaning |
|------|---------|
| **Row** | Facing: `down`, `left`, `right`, `up` (top → bottom) |
| **Column** | Walk cycle: col 0 idle, cols 1–3 steps |

Iso3D (`host._spriteFrame` + `getSpriteFrameUV`) advances the column while moving and picks the row from `unit.facing`.

**Note:** current HQ unit sheets may still be single-pose stubs (same frame tiled 4×4). The engine still samples rows/cols and applies a light walk bob; true multi-dir walk appears once you drop real walk sheets into `sprites/hq/` matching the grid below. Do **not** switch the default pack to RPM — HQ is intentional.

---

## Canonical sheet format (`SPRITE_SHEET_SPEC`)

Defined in code: `iso3d/src/adapter.js` → `SPRITE_SHEET_SPEC`.

| Property | Value |
|----------|--------|
| Layout | **4 columns × 4 rows** (default) |
| Rows (top→bottom) | down, left, right, up |
| Columns | walk cycle (col 0 = idle) |
| Anchor | **feet** at bottom-center of each cell |
| Format | PNG, RGBA, transparent background |
| Filtering | nearest-neighbor (`pixelPerfect: true`) |

Non-standard grids: set `cols` / `rows` / `dirOrder` on the key in `DEFAULT_SPRITE_DRAW` or `SPRITE_MANIFEST` (e.g. spider `4×2`).

### Example grid

```
        col0      col1      col2      col3
row0  idle↓     walk↓     walk↓     walk↓     ← facing down
row1  idle←     walk←     …                   ← facing left
row2  idle→     walk→     …                   ← facing right
row3  idle↑     walk↑     …                   ← facing up
```

Frame size is free (16×16, 32×32, 96×112, …). The renderer draws by **target on-screen height**, not native pixels.

---

## Folder layout

```
sprites/
  characters/<class>.png   # walk sheets (fighter, wizard, …)
  monsters/<key>.png       # monster walk sheets (goblin, skeleton, …)
  decor/                   # single-image billboards (trees, rocks)
  terrain/ + hq/terrain/   # ground textures
  hq/characters/           # optional HQ walk sheets (must be multi-frame)
  hq/monsters/
  SPRITE_PIPELINE.md
  RPM_ATTRIBUTION.md
```

### Register a sheet

1. Drop PNG at `sprites/characters/<key>.png` or `sprites/monsters/<key>.png`.
2. Ensure `DEFAULT_SPRITE_PATHS` / `SPRITE_MANIFEST` include the key (most already do).
3. Optional overrides in `DEFAULT_SPRITE_DRAW`:

```js
fighter: { targetFrameH: 58, cols: 4, rows: 4, dirOrder: ['down','left','right','up'], pixelPerfect: true }
```

### HQ upgrade checklist

1. Author a **true** 4×4 walk sheet (distinct dirs + walk columns) — not one idle frame tiled.
2. Save as `sprites/hq/characters/<key>.png` (or `monsters/`).
3. Add key to `HQ_CHARACTER_KEYS` / `HQ_MONSTER_KEYS` if new.
4. Keep `SPRITE_PACK = 'hq'` (default).
5. Tweak `targetFrameH` once if scale feels off.

---

## Runtime behavior (already wired)

| System | Behavior |
|--------|----------|
| `animatePath` / move events | Fractional grid pos + `facing` from step delta |
| `_spriteFrame` | Walk: cycle columns from distance; idle: 0↔1 bob; attack: mid frames |
| `getSpriteFrameUV` | Row from facing + `dirOrder`, col from frame |
| Classic iso tokens | `SPRITE_MANIFEST` + CSS background-position |

---

## Validate a sheet (optional)

```bash
python -c "
from PIL import Image
im=Image.open('sprites/characters/fighter.png')
print(im.size)  # e.g. 128x128 → 32x32 cells at 4x4
"
```

Dirs/walk should **not** all be pixel-identical. Idle-only stubs (all cells equal) will never show animation no matter what the code does.
