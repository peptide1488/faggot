#!/usr/bin/env python3
"""
Import RPG Paper Maker Basic Resources textures into Grimoire.

Source root (you pointed here correctly):
  .../RPG Paper Maker/resources/app/dist/BR/Images/
    Textures2D/   ← world: characters, tilesets, walls, autotiles, objects, sky
    HUD/          ← UI: animations, icons, bars, facesets

Copies/crops into dnd-character/sprites/ for offline use.
Requires a valid RPM license. Do not redistribute BR publicly unless allowed.
"""
from __future__ import annotations

import shutil
from pathlib import Path

from PIL import Image

# --- paths ---
BR_IMAGES = Path(
    r"C:\Program Files (x86)\Steam\steamapps\common"
    r"\RPG Paper Maker\resources\app\dist\BR\Images"
)
TEX = BR_IMAGES / "Textures2D"
HUD = BR_IMAGES / "HUD"
OUT = Path(r"C:\Users\andrew\Desktop\faggot\dnd-character\sprites")


def copy(src: Path, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, dest)
    print(f"  copy {src.relative_to(BR_IMAGES)} -> {dest.relative_to(OUT.parent)}")


def crop_save(im: Image.Image, box: tuple[int, int, int, int], dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    piece = im.crop(box).convert("RGBA")
    bbox = piece.getbbox()
    if bbox:
        l, t, r, b = bbox
        piece = piece.crop(
            (
                max(0, l - 1),
                max(0, t - 1),
                min(piece.width, r + 1),
                min(piece.height, b + 1),
            )
        )
    piece.save(dest, "PNG")
    print(f"  crop {box} -> {dest.relative_to(OUT.parent)} {piece.size}")


def import_characters() -> None:
    chars = TEX / "Characters"
    class_map = {
        "fighter": "knight.png",
        "barbarian": "ogre.png",
        "paladin": "charles.png",
        "ranger": "caitlyn.png",
        "rogue": "shana.png",
        "monk": "lily.png",
        "bard": "dancer.png",
        "cleric": "fortune.png",
        "druid": "wooly.png",
        "wizard": "lucas.png",
        "sorcerer": "kate.png",
        "warlock": "demon.png",
        "artificer": "villager8.png",
    }
    for key, fname in class_map.items():
        src = chars / fname
        if src.exists():
            copy(src, OUT / "characters" / f"{key}.png")
        else:
            print("MISSING", src)

    monster_map = {
        "goblin": "goblin.png",
        "skeleton": "skeleton.png",
        "zombie": "zombie.png",
        "spider": "spider.png",
        "ogre": "ogre.png",
        "demon": "demon.png",
        "slime": "slime-blue.png",
        "ghost": "fantom.png",
        "wolf": "dog-black.png",
        "human": "villager1.png",
        "orc": "ogre.png",
        "bear": "wooly.png",
        "snake": "squid.png",
        "bat": "bat.png",
        "rat": "rat.png",
        "harpy": "harpy.png",
        "angel": "angel.png",
        "mimic": "slime-gold.png",
        "mushroom": "mushroomy.png",
        "imp": "demon.png",
        "specter": "fantom.png",
        "knight": "knight.png",
        "villager": "villager3.png",
        "cat": "cat-calico.png",
        "dog": "dog-brown.png",
        "chicken": "chicken-brown.png",
    }
    for key, fname in monster_map.items():
        src = chars / fname
        if src.exists():
            copy(src, OUT / "monsters" / f"{key}.png")


def import_decor() -> None:
    """Billboards cropped from Tilesets + a few Objects3D/Walls props."""
    plains = Image.open(TEX / "Tilesets" / "plains-woods.png").convert("RGBA")
    # Alpha-bbox crops (re-probed)
    for name, box in {
        "tree": (0, 128, 32, 240),
        "tree2": (32, 123, 96, 256),
        "tree_dead": (97, 145, 127, 224),
        "bush": (34, 17, 62, 48),
        "bush2": (0, 48, 48, 80),
        "bush3": (80, 48, 112, 80),
        "mushroom": (80, 80, 112, 112),
        "rock": (112, 80, 128, 112),
        "stump": (0, 80, 32, 112),
        "log": (32, 96, 80, 120),
    }.items():
        crop_save(plains, box, OUT / "decor" / f"{name}.png")

    # Snow variants
    snow = TEX / "Tilesets" / "plains-woods-snow.png"
    if snow.exists():
        sim = Image.open(snow).convert("RGBA")
        crop_save(sim, (0, 128, 32, 240), OUT / "decor" / "tree_snow.png")
        crop_save(sim, (34, 17, 62, 48), OUT / "decor" / "bush_snow.png")

    # Jungle upright props
    jungle = TEX / "Tilesets" / "jungle.png"
    if jungle.exists():
        jim = Image.open(jungle).convert("RGBA")
        crop_save(jim, (18, 81, 45, 128), OUT / "decor" / "jungle_tree.png")
        crop_save(jim, (84, 82, 108, 128), OUT / "decor" / "jungle_tree2.png")
        crop_save(jim, (98, 130, 126, 160), OUT / "decor" / "jungle_bush.png")

    # Dungeon props
    dung = TEX / "Tilesets" / "dungeon-mines.png"
    if dung.exists():
        dim = Image.open(dung).convert("RGBA")
        crop_save(dim, (97, 194, 127, 224), OUT / "decor" / "crystal.png")
        crop_save(dim, (16, 84, 45, 112), OUT / "decor" / "ore.png")

    # Wall strip textures used as low hedges / bush rows
    walls = TEX / "Walls"
    for key, fname in {
        "hedge": "hedge.png",
        "hedge_snow": "hedge-snow.png",
        "bush_wall": "bush.png",
        "bush_haunted": "bush-haunted.png",
    }.items():
        src = walls / fname
        if src.exists():
            copy(src, OUT / "decor" / f"{key}.png")

    # Objects3D atlas images (cube UV wraps — OK as simple props)
    o3 = TEX / "Objects3D"
    for key, fname in {
        "chest": "chest.png",
        "barrel": "barrel.png",
        "crate": "crate.png",
        "fence": "woodfence.png",
        "fence_snow": "woodfence-snow.png",
        "tent": "tent.png",
        "bench": "bench-wood.png",
        "table": "picnic-table-wood.png",
        "sign_post": "signs.png" if (TEX / "Characters" / "signs.png").exists() else None,
    }.items():
        if not fname:
            continue
        src = o3 / fname if (o3 / fname).exists() else TEX / "Characters" / fname
        if src.exists():
            # For walk-sheet signs/fires take first frame
            im = Image.open(src).convert("RGBA")
            w, h = im.size
            if w % 4 == 0 and h % 4 == 0 and w == h:
                fw, fh = w // 4, h // 4
                crop_save(im, (0, 0, fw, fh), OUT / "decor" / f"{key}.png")
            else:
                copy(src, OUT / "decor" / f"{key}.png")

    # Campfire / rocks from character sheets (animated objects)
    for key, fname in (("campfire", "fires.png"), ("rocks", "rocks.png")):
        src = TEX / "Characters" / fname
        if src.exists():
            im = Image.open(src).convert("RGBA")
            w, h = im.size
            if w % 4 == 0 and h % 4 == 0:
                crop_save(im, (0, 0, w // 4, h // 4), OUT / "decor" / f"{key}.png")
            else:
                copy(src, OUT / "decor" / f"{key}.png")


def import_tile_library() -> None:
    """Keep full texture sheets available for terrain / future WebGL sampling."""
    # Full autotiles
    for p in (TEX / "Autotiles").glob("*.png"):
        copy(p, OUT / "rpm" / "autotiles" / p.name)
    # Full tilesets
    for p in (TEX / "Tilesets").glob("*.png"):
        copy(p, OUT / "rpm" / "tilesets" / p.name)
    # Walls + mountains (cliff / hedge materials)
    for sub in ("Walls", "Mountains", "Particles"):
        folder = TEX / sub
        if not folder.exists():
            continue
        for p in folder.glob("*.png"):
            copy(p, OUT / "rpm" / sub.lower() / p.name)

    # Small CSS swatches for classic iso
    def swatch(src: Path, box: tuple[int, int, int, int], dest: Path) -> None:
        if not src.exists():
            return
        im = Image.open(src).convert("RGBA")
        dest.parent.mkdir(parents=True, exist_ok=True)
        im.crop(box).save(dest, "PNG")
        print(f"  swatch {dest.name}")

    auto = TEX / "Autotiles"
    swatch(auto / "general.png", (8, 8, 20, 20), OUT / "tiles" / "grass.png")
    swatch(auto / "general.png", (72, 40, 84, 52), OUT / "tiles" / "mud.png")
    swatch(auto / "general.png", (40, 80, 52, 92), OUT / "tiles" / "stone.png")
    swatch(auto / "general.png", (100, 8, 112, 20), OUT / "tiles" / "wood.png")
    swatch(auto / "water.png", (16, 16, 28, 28), OUT / "tiles" / "water.png")
    swatch(auto / "snow.png", (8, 8, 20, 20), OUT / "tiles" / "snow.png")
    swatch(auto / "snow.png", (40, 40, 52, 52), OUT / "tiles" / "ice.png")
    swatch(auto / "lava.png", (4, 4, 16, 16), OUT / "tiles" / "lava.png")
    swatch(auto / "haunted.png", (8, 8, 20, 20), OUT / "tiles" / "rubble.png")
    swatch(TEX / "Mountains" / "sand.png", (8, 8, 20, 20), OUT / "tiles" / "sand.png")
    if (TEX / "Walls" / "brick.png").exists():
        copy(TEX / "Walls" / "brick.png", OUT / "tiles" / "wall.png")
    if (TEX / "Walls" / "bush.png").exists():
        copy(TEX / "Walls" / "bush.png", OUT / "tiles" / "brush.png")


def import_hud_fx() -> None:
    anim = HUD / "Animations"
    if anim.exists():
        for p in anim.glob("*.png"):
            copy(p, OUT / "effects" / p.name)
    for p in (HUD / "Bars").glob("*.png") if (HUD / "Bars").exists() else []:
        copy(p, OUT / "ui" / "bars" / p.name)
    for p in (HUD / "Icons").glob("*.png") if (HUD / "Icons").exists() else []:
        copy(p, OUT / "ui" / "icons" / p.name)
    # Particles as soft FX
    for p in (TEX / "Particles").glob("*.png") if (TEX / "Particles").exists() else []:
        copy(p, OUT / "effects" / p.name)


def write_attribution() -> None:
    text = f"""# RPG Paper Maker — Basic Resources (BR)

Imported from a licensed Steam install:

```
{BR_IMAGES}
  Textures2D/   characters, tilesets, walls, autotiles, objects3d, mountains, sky, particles
  HUD/          animations, icons, bars, facesets, window skins
```

Re-import:
```
python tools/import_rpm_assets.py
```

**License:** You must own RPG Paper Maker. Do not redistribute these files in a public
repo or commercial product unless your RPM license explicitly allows redistributing BR.
"""
    (OUT / "RPM_ATTRIBUTION.md").write_text(text, encoding="utf-8")
    print("wrote sprites/RPM_ATTRIBUTION.md")


def main() -> None:
    if not BR_IMAGES.exists():
        raise SystemExit(f"Not found: {BR_IMAGES}")
    if not TEX.exists():
        raise SystemExit(f"Not found: {TEX}")
    print("BR Images root:", BR_IMAGES)
    print("  Textures2D:", TEX.exists(), " HUD:", HUD.exists())
    import_characters()
    import_decor()
    import_tile_library()
    import_hud_fx()
    write_attribution()
    print("Done.")


if __name__ == "__main__":
    main()
