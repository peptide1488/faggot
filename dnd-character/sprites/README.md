# Sprites

Drop a PNG here and the app picks it up for isometric / Iso3D view.

## Folders
- `characters/<class>.png` — walk sheets for classes (fighter, wizard, …)
- `monsters/<key>.png` — monster walk sheets (`sprite` field on `MONSTERS_5E`)
- `decor/<key>.png` — static billboards (trees, bushes, chests, …)
- `tiles/<terrain>.png` — small swatches for classic iso CSS
- `effects/` — combat FX sheets (projectiles / skill anims)

## Sheet format
Walk sheets: **4 columns × 4 rows** (down / left / right / up), idle = column 0.  
Matches RPG Maker / **RPG Paper Maker** BR character sheets. Odd sizes auto-detect (e.g. spider 4×2).

## RPG Paper Maker BR pack
Many files here are curated copies from a licensed Steam install of RPG Paper Maker Basic Resources.

- See **`RPM_ATTRIBUTION.md`** for license notes.
- Re-import from your PC:  
  `python tools/import_rpm_assets.py`  
  (expects RPM at the default Steam path)

**Do not publish these assets** in a public repo unless your RPM license allows redistributing BR.
