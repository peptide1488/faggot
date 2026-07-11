# Blank sprite templates

Every PNG here is transparent, at the exact size the engine expects for its
category. Paint into them directly (any tool), keep the same filename and
canvas size, then copy into the real folder listed below.

## characters/ and monsters/ — 256×256, 4×4 grid, 64px frames

Walk sheet: 4 columns × 4 rows.

```
        col0      col1      col2      col3
row0  idle↓     walk↓     walk↓     walk↓     ← facing DOWN
row1  idle←     walk←     walk←     walk←     ← facing LEFT
row2  idle→     walk→     walk→     walk→     ← facing RIGHT
row3  idle↑     walk↑     walk↑     walk↑     ← facing UP
```

- Each cell is 64×64. Anchor the character's **feet at the bottom-center** of
  each cell (some headroom above is fine, don't crop close).
- Column 0 = idle pose. Columns 1–3 = a walk cycle for that facing.
- If you only draw one pose per row (skip the walk cycle for now), that's
  fine — copy col 0 into cols 1–3 as a stub; the engine already does a light
  idle bob so it won't look frozen, it just won't have a true walk animation
  until the extra frames exist (see `sprites/SPRITE_PIPELINE.md`).
- Drop finished files into `sprites/hq/characters/<key>.png` or
  `sprites/hq/monsters/<key>.png`.

## decor/ — 64×64, single view

Static props — one image, no facing/rows. These are billboards that always
face the camera. Anchor the object's **base at the bottom-center**.

**Highest-value fills** — these currently all share one unrelated placeholder
image and look wrong in-game:
- `door` / `door_open` / `grate` / `grate_open` → currently reuse `fence.png`
- `plank` / `drawbridge` / `drawbridge_down` → currently reuse `log.png`
- `trap` / `trap_safe` → currently reuse `ore.png`
- `cauldron` / `cauldron_tipped` / `oil_barrel` / `acid_barrel` / `powder_barrel`
  → currently **all five** reuse the same `barrel.png` — most in need of
  distinct art (a cauldron, an intact oil barrel, an intact acid barrel, and
  a powder keg all currently look identical)
- `bell` → currently reuses `crystal.png`
- `lever` / `switch` → currently reuse `sign_post.png` / `sign.png`

Drop finished files into `sprites/decor/<key>.png`.

## terrain/ — 128×128, seamless tileable

Ground/wall textures, sampled repeating across the map — must tile cleanly
(right edge continues left edge, bottom continues top). `cave_wall` is a new
key: Cave currently reuses the same brick wall texture as every dungeon map,
which reads as "wood/brick" instead of natural rock — this is its dedicated
replacement once painted (see AUDIT.md Cave note).

Drop finished files into `sprites/hq/terrain/<key>.png`, except `cave_wall`
which needs one line added to `iso3d/src/terrainTextures.js` pointing the
Cave preset's wall key at it (ask and I'll wire that up once the file exists).

## Not templated here (on purpose)

`pit` / `void` — intentionally has **no texture**; it renders as a flat dark
color at the bottom of a real 3D drop instead. Don't paint one.
