"""Sprite prep + loop-safe sheet builder (the pixel-processing half of the VELVET VICE pack,
done in Pillow so it runs without the custom nodes).

prep  <raw png>            -> raw/<name>_in.png : keyed bbox, padded square 512 on flat magenta
sheet <loop folder> <name> -> sprites/<name>.png : N frames evenly spaced, DUPLICATE LAST FRAME
                              EXCLUDED (loop-safe), magenta keyed to alpha, one shared palette,
                              nearest resize, horizontal strip + a .json with frame size

  python make_sheet.py prep raw/boomer_down.png
  python make_sheet.py sheet "C:/.../output/boomer_survivors/loop/boomer_down" boomer_down --frames 8 --size 96
"""
import sys, os, glob, json, argparse
from PIL import Image
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
MAGENTA = np.array([255, 0, 255])


def bg_colour(arr):
    # the corners vote for the background colour (Krea drifts the magenta a little)
    h, w, _ = arr.shape
    c = np.concatenate([arr[:8, :8].reshape(-1, 3), arr[:8, -8:].reshape(-1, 3),
                        arr[-8:, :8].reshape(-1, 3), arr[-8:, -8:].reshape(-1, 3)])
    return np.median(c, axis=0)


def key(arr, bg, tol=70):
    d = np.abs(arr[:, :, :3].astype(int) - bg.astype(int)).sum(axis=2)
    mask = d > tol
    # magenta-ish anything (Krea paints a halo): high R, low G, high B
    r, g, b = arr[:, :, 0].astype(int), arr[:, :, 1].astype(int), arr[:, :, 2].astype(int)
    halo = (r > g + 60) & (b > g + 45) & (g < 130)
    mask &= ~halo
    return mask


def prep(path, size=512, bg_out=(255, 0, 255)):
    im = Image.open(path).convert("RGB")
    arr = np.array(im)
    bg = bg_colour(arr)
    mask = key(arr, bg)
    ys, xs = np.where(mask)
    if len(xs) == 0:
        raise SystemExit("nothing keyed in " + path)
    x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
    crop = arr[y0:y1 + 1, x0:x1 + 1]
    m = mask[y0:y1 + 1, x0:x1 + 1]
    ch, cw = crop.shape[:2]
    # fit into 80% of the square, keep aspect, integer-ish scale for pixels
    scale = min(size * 0.8 / cw, size * 0.8 / ch)
    nw, nh = max(1, int(cw * scale)), max(1, int(ch * scale))
    rgba = np.dstack([crop, (m * 255).astype(np.uint8)])
    sprite = Image.fromarray(rgba, "RGBA").resize((nw, nh), Image.NEAREST)
    canvas = Image.new("RGB", (size, size), bg_out)
    canvas.paste(sprite, ((size - nw) // 2, (size - nh) // 2), sprite)
    out = os.path.splitext(path)[0] + "_in.png"
    canvas.save(out)
    print("prep ->", out, f"({cw}x{ch} keyed, scaled {scale:.2f})")
    return out


def sheet(folder, name, frames=8, size=96, colours=64, keep_bg=False, ref=None):
    """ref = the crisp source still (raw/<name>_in.png by default): its flat colours become THE
    palette (reference colour match) so LTX's soft in-between shades snap back to hard pixels."""
    files = sorted(glob.glob(os.path.join(folder, "*.png")))
    if ref is None:
        cand = os.path.join(HERE, "raw", name + "_in.png")
        ref = cand if os.path.exists(cand) else None
    if len(files) < frames + 1:
        raise SystemExit(f"only {len(files)} frames in {folder}")
    n = len(files) - 1                      # exclude the duplicated final frame (loop-safe)
    idx = [round(i * n / frames) for i in range(frames)]
    ims = [Image.open(files[i]).convert("RGB") for i in idx]
    # key FIRST (per frame, against that frame's own corner colour), then quantize only the
    # foreground on one shared palette - quantizing with the magenta in the strip pulled the
    # red cap toward magenta (v1 sheets)
    w0, h0 = ims[0].size
    masks = []
    strip = Image.new("RGB", (w0 * frames, h0), (0, 0, 0))
    for i, im in enumerate(ims):
        a = np.array(im)
        m = key(a, bg_colour(a), tol=60) if not keep_bg else np.ones(a.shape[:2], bool)
        masks.append(m)
        fg = a.copy(); fg[~m] = 0
        strip.paste(Image.fromarray(fg), (i * w0, 0))
    # TRUE PIXEL ART: LTX frames come back smeared (its VAE has no pixel grid), so every frame is
    # area-downscaled to the sprite's native resolution (`size`, e.g. 64) - that re-snaps it to a
    # grid - then the whole strip is quantized once, then keyed. The game scales up with nearest.
    frames_small = []
    for i in range(frames):
        fg = np.array(strip)[:, i * w0:(i + 1) * w0]
        rgba = np.dstack([fg, (masks[i] * 255).astype(np.uint8)])
        im = Image.fromarray(rgba, "RGBA")
        from PIL import ImageFilter
        im = im.filter(ImageFilter.UnsharpMask(radius=3, percent=180, threshold=2)).resize((size, size), Image.BOX)
        frames_small.append(im)
    small = Image.new("RGB", (size * frames, size), (0, 0, 0))
    alphas = []
    for i, im in enumerate(frames_small):
        a = np.array(im)
        alphas.append(a[:, :, 3] >= 110)
        rgb = a[:, :, :3].copy(); rgb[~alphas[-1]] = 0
        small.paste(Image.fromarray(rgb), (i * size, 0))
    if ref:
        ra = np.array(Image.open(ref).convert("RGB")); rm = key(ra, bg_colour(ra))
        rfg = ra[rm]                                            # foreground pixels only
        pal_img = Image.fromarray(rfg.reshape(1, -1, 3)).quantize(colors=colours, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
        q = small.quantize(palette=pal_img, dither=Image.Dither.NONE).convert("RGB")
    else:
        q = small.quantize(colors=colours, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).convert("RGB")
    arr = np.array(q)
    out = Image.new("RGBA", (size * frames, size), (0, 0, 0, 0))
    for i in range(frames):
        fr = arr[:, i * size:(i + 1) * size]
        rgba = np.dstack([fr, (alphas[i] * 255).astype(np.uint8)])
        out.paste(Image.fromarray(rgba, "RGBA"), (i * size, 0))
    os.makedirs(os.path.join(HERE, "sprites"), exist_ok=True)
    dst = os.path.join(HERE, "sprites", name + ".png")
    out.save(dst)
    json.dump({"frames": frames, "size": size, "src": folder}, open(dst[:-4] + ".json", "w"))
    print("sheet ->", dst, idx)
    return dst


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["prep", "sheet"])
    ap.add_argument("a"); ap.add_argument("b", nargs="?")
    ap.add_argument("--frames", type=int, default=8); ap.add_argument("--size", type=int, default=96)
    ap.add_argument("--colours", type=int, default=64); ap.add_argument("--keep-bg", action="store_true")
    x = ap.parse_args()
    if x.cmd == "prep":
        prep(x.a)
    else:
        sheet(x.a, x.b, x.frames, x.size, x.colours, x.keep_bg)
