# Grimoire sprites

Original **chunky pixel** art for the battle map and Iso3D host.

## Layout

| Path | Contents |
|------|----------|
| `hq/characters/` | Class walk sheets (4×4) |
| `hq/monsters/` | Monster walk sheets (4×4) |
| `hq/decor/` | Billboard props (trees, rocks, …) |
| `hq/terrain/` | Ground textures (from voxel atlas + snow) |
| `characters/`, `monsters/`, `decor/` | Same generated art (mirrors for older paths) |

## Regenerate

```sh
# Units + decor (original pixel art)
python tools/gen_pixel_sprites.py

# Terrain faces from iso3d-engine voxel atlas
python tools/import_voxel_terrain.py
```

## Walk sheets

See `SPRITE_PIPELINE.md`. Rows = facing (down / left / right / up), columns = walk cycle.

No RPG Paper Maker / commercial BR assets ship with this project.
