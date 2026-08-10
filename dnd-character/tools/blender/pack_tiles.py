"""
Pack a baked tile set for the runtime.

    python pack_tiles.py out/sandstone [--nrm-scale 0.5] [--albedo-q 90]

The bake writes what Blender is good at writing: three full-canvas RGBA PNGs per
tile. That is the right SOURCE format and a terrible delivery format -- a set
came to 255 MB, which is most of a Diablo II install for one dungeon's worth of
floor tiles. D2 shipped palettised 8-bit sprites, cropped per frame and RLE'd;
the modern equivalent of that discipline is this file.

Three separate wastes, each fixed by knowing what the pass actually contains:

    CROP     a floor tile fills 643x324 of a 1024x1024 canvas -- 20%. The rest is
             transparent padding that exists only so every tile can share one
             anchor. Crop to the alpha box and record the offset instead; the
             anchor stays exact because it is stored, not assumed.
    HEIGHT   is ONE 8-bit value written into R=G=B=A. Stored as a single channel
             it is 8x smaller before any codec gets involved. It must stay
             LOSSLESS: the runtime reads it as a depth buffer, and a codec's idea
             of an acceptable error is a sprite standing through a wall.
    ALBEDO   is the only pass a human looks at, so it is the only one that can
             take lossy compression. WebP q90 with its alpha plane (which WebP
             keeps lossless regardless) is visually indistinguishable here.

NORMALS are the awkward one. They are high-frequency by construction -- BUMP
feeds surface grain into every texel -- so they compress worst and cost the most.
Lossy WebP is the wrong tool: it encodes YUV 4:2:0, so it halves the resolution
of exactly the X/Y components that ARE the signal, and the error shows up as
lighting that swims. Half-resolution lossless is the better trade, and it is not
even a loss in practice: the runtime samples normals LINEAR and supersamples the
frame, so the fine grain was being averaged away anyway (it is what the
anti-alias slider exists to fight).

Writes <dir>/packed/<name>.webp plus <dir>/packed/pack.json:

    {"tile": {"a": [dx, dy, w, h], "n": [...], "h": [...]}, ...}

dx,dy are the crop's top-left RELATIVE TO THE CANVAS CENTRE, which is the anchor
every tile is positioned by. The runtime adds them; nothing else changes.
"""

import glob
import json
import multiprocessing
import os
import sys
import time

import numpy as np
from PIL import Image, ImageFilter

# ---- the world-space cell cut ----------------------------------------------
# Every tile is baked wider than its lattice cell so the albedo can hide the
# AO-bright mesh boundary. Carried into the HEIGHT and NORMAL passes, that
# overshoot is the seam: tiles draw back to front, so a tile's back-edge strip
# stamps extrapolated surface data over the two neighbours drawn before it --
# a faint dark line on every seam. (Blind erosion was tried instead and became
# the black-lattice disaster: it cut in Chebyshev pixels against a bleed
# measured perpendicular on a 1:2 edge, and ate ~4-7px of the cell itself.)
#
# The cut is exact, not eroded: invert the iso projection per pixel USING THAT
# PIXEL'S OWN HEIGHT (same math as the shader's worldAt; constants below are
# derived from the same PPU/angles the bake renders with) and zero everything
# beyond the two BACK edges of the cell. Back only, because the front bleed is
# always painted over by later-drawn neighbours, and the SKIRT -- the curtain
# the map boundary needs -- hangs on the front edges at exactly the overshoot
# boundary. A symmetric cut would turn the outer skirt black.
# check_pack.py holds the invariants and their known-bad controls.
_SXU = 640.0 / (4.0 * (2.0 ** 0.5)) * (0.5 ** 0.5)     # 80 px per (wx+wy)
_SYU = _SXU * 0.5                                       # 40 px per (wx-wy)
_ZPX = 640.0 / (4.0 * (2.0 ** 0.5)) * (3.0 ** 0.5) / 2  # ~98 px per world z
_CELL, _DELTA = 2.0, 0.012      # cell half-extent; ~2px of deliberate overlap
                                # (0.04 was tried: black-speck count 642 -> 647,
                                #  so the specks are NOT a rounding gap in the cut)
_HOFF, _HRANGE = 4.0, 8.0       # build_tiles HEIGHT_OFF / HEIGHT_RANGE


def cell_world(hl, dx, dy):
    """(wx, wy) for every texel, from that texel's own decoded height."""
    z = np.asarray(hl, dtype=np.float32) / 255.0 * _HRANGE - _HOFF
    hh, ww = z.shape
    px = dx + np.arange(ww, dtype=np.float32) + 0.5
    py = dy + np.arange(hh, dtype=np.float32)[:, None] + 0.5
    su = px[None, :] / _SXU
    di = (py + z * _ZPX) / _SYU
    return (su + di) * 0.5, (su - di) * 0.5


def cell_mask(alpha, wx, wy):
    """alpha with everything beyond the cell's two BACK edges zeroed."""
    keep = (wx >= -(_CELL + _DELTA)) & (wy <= (_CELL + _DELTA))
    return Image.fromarray(np.asarray(alpha, dtype=np.uint8) * keep, "L")


def front_handicap(hl, wx, wy, quanta=2):
    """Lower the height of FRONT-overshoot texels so they can never outrank a
    neighbour's real ground.

    The front bleed is kept deliberately -- it is what hides the AO-bright ring
    at the mesh boundary. But those texels are this tile's surface EXTRAPOLATED
    past its cell, and the G-buffer resolves the overlap by height with LEQUAL.
    Height is 8-bit, so one quantum is 8/255 = 0.031 world, and two tiles' bakes
    legitimately differ by about that much at a shared edge (check_seams' whole
    tolerance is one texel, 0.025). Wherever the back tile's extrapolation came
    out one quantum taller, it WON -- and what it painted there is the dark
    skirt-fold band the beauty pass antialiases into the ground/skirt crease,
    luma ~76 against interior grass at ~145. That is the dotted line of black
    specks along every seam at high zoom: measured mean RGB (64,84,65), luma 78.
    An extrapolated texel must never beat a real one, so give it a 2-quantum
    handicap -- larger than any legitimate disagreement, and invisible where
    these texels actually get displayed, which is only the map's outer skirt.
    """
    over = (wx > _CELL + _DELTA) | (wy < -(_CELL + _DELTA))
    arr = np.asarray(hl, dtype=np.int16)
    return Image.fromarray(
        np.where(over, np.maximum(arr - quanta, 0), arr).astype(np.uint8), "L")


def crop_box(im):
    """Alpha bounding box, or None when the image is empty."""
    a = im.getchannel("A")
    return a.getbbox()


def pack_one(job):
    """One tile, three passes. Pure function of its inputs so it can run in a
    worker process -- the work is CPU-bound encoding, and there are 8 cores
    sitting idle while one of them does 172 tiles in sequence."""
    dirpath, out, stem, nrm_scale, albedo_q, method, erode = job
    pa = os.path.join(dirpath, stem + ".png")
    pn = os.path.join(dirpath, stem + "_NRM.png")
    ph = os.path.join(dirpath, stem + "_H.png")
    if not (os.path.exists(pn) and os.path.exists(ph)):
        return stem, None, 0, 0, "missing a pass"
    before = sum(os.path.getsize(p) for p in (pa, pn, ph))

    alb = Image.open(pa).convert("RGBA")
    box = crop_box(alb)
    if box is None:
        return stem, None, before, 0, "empty"
    W, H = alb.size
    cx, cy = W / 2.0, H / 2.0
    x0, y0, _, _ = box

    # ---- albedo: lossy is fine for a smoothly-shaded set, and WRONG for a pixel
    # one. A posterised, nearest-upscaled tile is all hard edges and flat fields,
    # which is the worst case for a DCT codec: it rings along every boundary and
    # smears the flats, so the art arrives visibly blurred no matter what the
    # sampler does. Lossless costs little here because flat banded colour is
    # exactly what a lossless codec is good at.
    a = alb.crop(box)
    # The mask needs each pixel's own height, so the height pass loads first.
    hl = Image.open(ph).convert("RGBA").crop(box).convert("L")
    W2, H2 = alb.size
    _wx, _wy = cell_world(hl, x0 - W2 / 2.0, y0 - H2 / 2.0)
    masked = cell_mask(a.getchannel("A"), _wx, _wy)
    hl = front_handicap(hl, _wx, _wy)
    a.putalpha(masked)
    if albedo_q >= 100:
        a.save(os.path.join(out, stem + ".webp"), "WEBP", lossless=True,
               quality=100, method=method)
    else:
        a.save(os.path.join(out, stem + ".webp"), "WEBP", quality=albedo_q,
               method=method)

    # EVERY PASS KEEPS ITS ALPHA. Cropping to the bounding box does not make the
    # image solid: a tile is a diamond, so the corners of its own box are still
    # transparent, and the composite relies on that to let the tile behind show
    # through. Storing the normal as RGB and the height as L dropped the alpha,
    # turned each crop into an opaque rectangle, and let every tile stamp its
    # corners over its neighbours' normals and heights -- floors then faced the
    # wrong way and lit black while the walls beside them lit correctly.
    alpha = masked

    # ---- THE OVERSHOOT BELONGS TO THE ALBEDO AND TO NOTHING ELSE.
    # Every tile is baked wider than its lattice cell (theme "bleed", 7 output px
    # for grass10A; the packed tile is 656 across a 640 cell). That strip exists
    # for ONE reason: AO has nothing to occlude at the boundary of a mesh, so the
    # outermost ring bakes brighter -- luma 147 against 101 -- and posterising
    # turns it into a pale grid, which the neighbour paints over.
    #
    # Height and normal never wanted it. In that strip they carry this tile's own
    # surface extrapolated past where it exists, and the paint-over only happens
    # for neighbours that draw LATER: iso order is back to front, so a tile's
    # overshoot into its BACK neighbour is never covered. That band then shades
    # from a surface that is not there, at 63% of its neighbours' brightness --
    # the dotted lattice on every tile edge.
    #
    # Eroding the mask on those two passes is the same fix as suppressing them in
    # the shader, done where the geometry is actually KNOWN. A shader has to infer
    # the cell from the anchor and the lattice basis; the packer has the bleed.
    # The erosion is deliberately a couple of px SHORT of the full bleed, so
    # neighbours still overlap slightly and rasterisation cannot open a gap.
    data_alpha = alpha
    for _ in range(erode):
        data_alpha = data_alpha.filter(ImageFilter.MinFilter(3))

    # ---- normal: crop to the SAME box (it must line up with the albedo),
    # optionally halve, always lossless
    n = Image.open(pn).convert("RGB").crop(box)
    n.putalpha(data_alpha)
    if nrm_scale != 1.0:
        # PREMULTIPLIED RESIZE, IN FLOAT. A plain LANCZOS on straight-alpha RGBA
        # mixes the transparent texels' BLACK rgb into every edge value, so the
        # half-res normal was wrong within ~2px of any alpha boundary. The old
        # MinFilter erode existed to HIDE that contamination -- and hiding it is
        # what put this tile's normals over its neighbour's ground. Premultiply,
        # resize each channel as float, un-premultiply: edge values stay true,
        # and the erode -- and everything it was covering for -- goes away.
        arr = np.asarray(n, dtype=np.float32)
        al = arr[:, :, 3:4] / 255.0
        sz = (max(1, round(n.width * nrm_scale)),
              max(1, round(n.height * nrm_scale)))
        def fres(ch):
            return np.asarray(Image.fromarray(ch, "F").resize(sz, Image.LANCZOS),
                              dtype=np.float32)
        pr = [fres(arr[:, :, k] * al[:, :, 0]) for k in range(3)]
        aa2 = fres(arr[:, :, 3])
        safe = np.maximum(aa2 / 255.0, 1e-4)
        out4 = np.stack([np.clip(pr[0] / safe, 0, 255),
                         np.clip(pr[1] / safe, 0, 255),
                         np.clip(pr[2] / safe, 0, 255),
                         np.clip(aa2, 0, 255)], axis=2)
        # COVERAGE MUST SURVIVE THE HALVING. A resized mask shrinks by up to a
        # texel, and the runtime samples the half-res normal LINEAR -- so a
        # full-res pixel near any boundary got PARTIAL normal alpha, blended
        # toward the cleared buffer, and a cleared normal decodes through
        # rgb*2-1 to a direction facing away from the light: black. Invisible at
        # 1:1, 45 luma deep magnified, and 46,880 px per set by invariant C.
        # The old code ERODED here, which is the same mistake pointing the other
        # way. Threshold instead: any texel with real coverage keeps it, so the
        # upscale spans the whole footprint. The silhouette is hard-edged now,
        # which is what the height pass has always been -- this is a data pass,
        # not a picture, and the albedo still carries the antialiased outline.
        # Threshold, then DILATE by one half-res texel. Thresholding alone left
        # 3,558 px uncovered (invariant C): a half-res texel upscales to two
        # full-res ones, so coverage has to extend a texel PAST the footprint to
        # span it after the LINEAR upscale, not merely reach it.
        out4[:, :, 3] = np.where(out4[:, :, 3] > 8.0, 255.0, 0.0)
        am = Image.fromarray(out4[:, :, 3].astype(np.uint8), "L")
        am = am.filter(ImageFilter.MaxFilter(3))
        out4[:, :, 3] = np.asarray(am, dtype=np.float32)
        n = Image.fromarray((out4 + 0.5).astype(np.uint8), "RGBA")
    n.save(os.path.join(out, stem + "_NRM.webp"), "WEBP",
           lossless=True, quality=100, method=method, exact=True)

    # ---- height: one value, lossless, full resolution. This is a depth buffer,
    # not a picture -- but it still needs the mask, for the same reason.
    h = Image.merge("RGBA", (hl, hl, hl, data_alpha))
    # exact=True or the encoder ZEROES RGB under alpha-0 texels -- and the
    # runtime samples these LINEAR, so a zeroed height next to the cut decodes
    # toward world z -4 and the seam comes back as a half-texel dark line.
    # Measured: default webp returns (0,0,0,0) where exact returns the value.
    h.save(os.path.join(out, stem + "_H.webp"), "WEBP",
           lossless=True, quality=100, method=method, exact=True)

    after = sum(os.path.getsize(os.path.join(out, stem + s + ".webp"))
                for s in ("", "_NRM", "_H"))
    # DEST size for every pass: the half-res normal is drawn scaled back up to
    # exactly the albedo's footprint, so it shares one box.
    e = [x0 - cx, y0 - cy, a.width, a.height]
    return stem, {"a": e, "n": e, "h": e}, before, after, None


def pack(dirpath, nrm_scale=0.5, albedo_q=90, method=4, jobs=None, erode=0):
    out = os.path.join(dirpath, "packed")
    os.makedirs(out, exist_ok=True)
    stems = sorted({os.path.basename(f)[:-4] for f in glob.glob(os.path.join(dirpath, "*.png"))
                    if not f.endswith("_NRM.png") and not f.endswith("_H.png")
                    and not os.path.basename(f).startswith("_")})
    work = [(dirpath, out, s, nrm_scale, albedo_q, method, erode) for s in stems]
    jobs = jobs or max(1, (os.cpu_count() or 4))

    manifest = {}
    before = after = 0
    t0 = time.time()
    with multiprocessing.Pool(jobs) as pool:
        for stem, entry, b, a_, err in pool.imap_unordered(pack_one, work, chunksize=2):
            before += b
            after += a_
            if err:
                print("SKIP", stem, "(%s)" % err)
            else:
                manifest[stem] = entry

    # ---- one file instead of 576 -------------------------------------------
    # THE COST OF A SET IS ITS REQUEST COUNT, NOT ITS BYTES. Measured on a 12x12
    # grass10A: 577 requests to packed/ for 26 MB, and a browser runs six at a
    # time to one host, so the art arrives in ~96 sequential rounds each paying
    # its own latency. That was most of the time to first frame.
    #
    # A TEXTURE ATLAS is the usual answer and is the wrong one here: 54.6 Mpx per
    # channel needs about nine 4096-square sheets, and slicing per-tile images
    # back out of them transiently doubles an already large decoded footprint.
    # Concatenating the same files into one blob costs nothing extra -- the
    # runtime slices byte ranges and decodes exactly the images it decodes today,
    # so memory, filtering and the draw path are all untouched.
    blob = os.path.join(out, "pack.bin")
    index = {}
    with open(blob, "wb") as bf:
        for stem in sorted(manifest):
            for ch, suffix in (("a", ""), ("n", "_NRM"), ("h", "_H")):
                p = os.path.join(out, stem + suffix + ".webp")
                if not os.path.exists(p):
                    continue
                data = open(p, "rb").read()
                index.setdefault(stem, {})[ch] = [bf.tell(), len(data)]
                bf.write(data)
                os.remove(p)          # the blob replaces them; keeping both
                                      # doubles the set on disk for no gain
    for stem, chans in index.items():
        manifest[stem]["b"] = chans   # byte ranges, alongside the crop boxes

    with open(os.path.join(out, "pack.json"), "w") as f:
        # `built` is a cache buster. Every pack rewrites the SAME filenames, so a
        # browser will happily serve the previous bake's tiles and show no change
        # at all -- which is indistinguishable from "the bake did nothing". The
        # runtime appends this to each image URL, so a new pack is a new URL.
        json.dump({"nrmScale": nrm_scale, "built": int(time.time()),
                   "tiles": manifest}, f, separators=(",", ":"))
    print("packed %d tiles on %d cores in %.0fs: %.1f MB -> %.1f MB  (%.1fx smaller)"
          % (len(manifest), jobs, time.time() - t0,
             before / 1e6, after / 1e6, before / max(after, 1)))
    print("bundled into pack.bin: %d images, %.1f MB, 2 requests instead of %d"
          % (sum(len(c) for c in index.values()), os.path.getsize(blob) / 1e6,
             sum(len(c) for c in index.values()) + 1))


if __name__ == "__main__":
    args = sys.argv[1:]
    d = args[0] if args else "out/sandstone"
    ns = float(args[args.index("--nrm-scale") + 1]) if "--nrm-scale" in args else 0.5
    q = int(args[args.index("--albedo-q") + 1]) if "--albedo-q" in args else 90
    # WebP's `method` trades encode time for a few percent of size. 6 is the
    # slowest setting there is and bought ~5%; 4 is the sane default for a step
    # that runs after every bake.
    me = int(args[args.index("--method") + 1]) if "--method" in args else 4
    er = int(args[args.index("--erode") + 1]) if "--erode" in args else 0
    js = int(args[args.index("--jobs") + 1]) if "--jobs" in args else None
    pack(d, ns, q, me, js, erode=er)
