"""Static sprites: key the magenta, crop to the sprite, nearest-downscale to game size, save RGBA.
Tiles are just downscaled (no key). Writes sprites/<name>.png + sprites/manifest.json."""
import os, glob, json
import numpy as np
from PIL import Image
import make_sheet as ms

HERE = os.path.dirname(os.path.abspath(__file__))
SIZES = {  # longest side in game pixels
    "prop_tree": 160, "prop_house": 224, "prop_shrub": 72, "prop_mailbox": 72, "prop_flamingo": 72,
    "prop_grill": 80, "prop_fence": 96,
    "pickup_dollar": 40, "pickup_cap": 44, "pickup_beer6": 48, "pickup_burger": 44,
    "proj_beer": 36, "proj_golfball": 24, "proj_weedwhacker": 96, "proj_flag": 44,
}
TILE = 64      # world px = art px everywhere (1:1), so every sprite shares one pixel size

manifest = {}
for path in sorted(glob.glob(os.path.join(HERE, "raw", "*.png"))):
    name = os.path.splitext(os.path.basename(path))[0]
    if name.endswith("_in") or name.startswith("_"):
        continue
    if name.startswith("tile_"):
        # area-downscale (true re-pixelation) then quantize, same treatment as the character sheets
        im = Image.open(path).convert("RGB").resize((TILE, TILE), Image.BOX)
        im = im.quantize(colors=32, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).convert("RGB")
        im.save(os.path.join(HERE, "sprites", name + ".png"))
        manifest[name] = {"w": TILE, "h": TILE, "tile": True}
        print("tile", name)
        continue
    if name not in SIZES:
        continue
    a = np.array(Image.open(path).convert("RGB"))
    m = ms.key(a, ms.bg_colour(a))
    ys, xs = np.where(m)
    crop = a[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    mm = m[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    ch, cw = crop.shape[:2]
    s = SIZES[name] / max(cw, ch)
    nw, nh = max(1, round(cw * s)), max(1, round(ch * s))
    rgba = np.dstack([crop, (mm * 255).astype(np.uint8)])
    small = Image.fromarray(rgba, "RGBA").resize((nw, nh), Image.BOX)      # true re-pixelation
    sa = np.array(small); alpha = sa[:, :, 3] >= 110
    rgb = sa[:, :, :3].copy(); rgb[~alpha] = 0
    q = Image.fromarray(rgb).quantize(colors=32, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).convert("RGB")
    out = Image.fromarray(np.dstack([np.array(q), (alpha * 255).astype(np.uint8)]), "RGBA")
    out.save(os.path.join(HERE, "sprites", name + ".png"))
    manifest[name] = {"w": nw, "h": nh}
    print("sprite", name, nw, nh)
json.dump(manifest, open(os.path.join(HERE, "sprites", "manifest.json"), "w"), indent=1)
