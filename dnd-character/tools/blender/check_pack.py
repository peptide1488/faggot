"""Does the PACKED art tell the truth about who owns each pixel?

    python check_pack.py out/grass10A/packed [--expect-overshoot]

check_seams.py proves two tiles agree about the height along a shared edge --
in the FIELDS, before any image exists. Nothing checked the images the runtime
actually samples, and both halves of the 2026-08 seam saga lived there:

  OVERSHOOT   every tile is baked ~8px wider than its cell so the albedo can
              hide the AO-bright mesh boundary. The height/normal passes carried
              that strip too, so a tile stamped extrapolated surface data over
              its back neighbour's real ground -- a faint dark line on every
              seam (invariant A).
  DEAD ZONE   an attempted fix eroded the H/N masks blind, in Chebyshev pixels
              against a bleed measured perpendicular on a 1:2 edge, and ended
              ~4-7px INSIDE the cell. Fragments there decoded height 0 = world
              z -4, lost the taller-wins depth test, and the back neighbour's
              dirt skirt showed through -- a heavy black lattice (invariant B).

Both invariants are checked against the tile's WORLD-SPACE cell, recovered per
pixel by inverting the iso projection with that pixel's own decoded height --
the same math as the shader's worldAt, constants imported from build_tiles.py
rather than retyped. The inversion is validated by round trip before either
invariant is allowed to judge: on flat turf, opaque pixels must map inside
cell+bleed, and skirt pixels (which hang BELOW the cell in screen space but
belong to its boundary in world space) must map onto the cell edge. A wrong
constant -- especially the z sign -- blows the skirt test up immediately.
"""
import io
import json
import math
import os
import sys
import types

import numpy as np
from PIL import Image

# build_tiles imports bpy at module scope; stub enough to read its constants.
for _n in ("bpy", "bmesh", "mathutils", "addon_utils"):
    sys.modules.setdefault(_n, types.ModuleType(_n))


class _Any:
    def __getattr__(self, k): return _Any()
    def __call__(self, *a, **k): return _Any()
    def __getitem__(self, k): return _Any()
    def __iter__(self): return iter(())


for _m in ("bpy", "bmesh", "mathutils"):
    for _a in ("data", "context", "ops", "types", "app", "new", "Vector"):
        setattr(sys.modules[_m], _a, _Any())

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_tiles as bt

SXU = math.cos(math.radians(45)) * bt.PPU            # px per (wx+wy) unit: 80
SYU = 0.5 * math.cos(math.radians(45)) * bt.PPU      # px per (wx-wy) unit: 40
ZPX = math.cos(math.radians(30)) * bt.PPU            # px per world-z unit: ~98
CELL = bt.HALF                                        # the cell is |w| <= 2.0
BLEED_W = 10.0 / SXU          # generous bleed allowance in world units (~0.125)
TOL_OUT = 0.05                # overshoot slack: data may exist to cell+this
TOL_IN = 0.06                 # dead-zone slack, ~5px perpendicular


def world_xy(shape, dx, dy, z):
    """(wx, wy) for every pixel of a crop, given that pixel's own height."""
    h, w = shape
    px = dx + np.arange(w, dtype=np.float32) + 0.5
    py = dy + np.arange(h, dtype=np.float32)[:, None] + 0.5
    s = px[None, :] / SXU
    d = (py + z * ZPX) / SYU
    return (s + d) * 0.5, (s - d) * 0.5


def load_packed(packdir):
    man = json.load(open(os.path.join(packdir, "pack.json")))
    blob = None
    bp = os.path.join(packdir, "pack.bin")
    if os.path.exists(bp):
        blob = open(bp, "rb").read()

    def img(stem, ch, suffix):
        t = man["tiles"][stem]
        if blob is not None and "b" in t and ch in t["b"]:
            o, ln = t["b"][ch]
            return Image.open(io.BytesIO(blob[o:o + ln]))
        return Image.open(os.path.join(packdir, stem + suffix + ".webp"))

    return man, img


def check(packdir):
    man, img = load_packed(packdir)
    tiles = man["tiles"]
    over_bad = {}
    dead_bad = {}
    nrm_bad = {}
    rt_done = False

    for stem in sorted(tiles):
        e = tiles[stem]["a"]
        dx, dy = e[0], e[1]
        alb = np.asarray(img(stem, "a", "").convert("RGBA"), dtype=np.uint8)
        hgt = np.asarray(img(stem, "h", "_H").convert("RGBA"), dtype=np.uint8)
        nrm_im = img(stem, "n", "_NRM").convert("RGBA")
        if nrm_im.size != (alb.shape[1], alb.shape[0]):
            nrm_im = nrm_im.resize((alb.shape[1], alb.shape[0]), Image.BILINEAR)
        nrm = np.asarray(nrm_im, dtype=np.uint8)
        if alb.shape != hgt.shape:
            print("SIZE MISMATCH", stem); continue
        z = hgt[:, :, 0].astype(np.float32) / 255.0 * bt.HEIGHT_RANGE - bt.HEIGHT_OFF
        wx, wy = world_xy(z.shape, dx, dy, z)
        d = np.maximum(np.abs(wx), np.abs(wy))
        # THE HARMFUL OVERSHOOT IS BACK-SIDE ONLY. Tiles draw back to front, so
        # a tile's overshoot can only stamp the two neighbours drawn BEFORE it:
        # across its wx=-2 edge and its wy=+2 edge (up-screen). The front bleed
        # is always painted over by later tiles, and the skirt -- which the
        # renderer needs at the map boundary -- hangs on the front edges.
        back = (wx < -(CELL + TOL_OUT)) | (wy > (CELL + TOL_OUT))
        aa = alb[:, :, 3]
        ha = hgt[:, :, 3]

        # ---- round trip, once, on a flat turf: proves the constants before
        # anything else may judge. Opaque albedo must live inside cell+bleed,
        # and the skirt (z well below ground on a band-0 tile) must sit ON the
        # cell edge -- a wrong z sign throws it off by whole tiles.
        if not rt_done and "turf-0100_r0" in stem:
            # judged on pixels whose HEIGHT is trustworthy: on the eroded pack
            # the dead-zone pixels have zeroed height RGB, and running the round
            # trip through them reports "constants wrong" for what is actually
            # invariant B's bug. Interior pixels still validate the projection.
            op = (aa >= 250) & (ha >= 250)
            d99 = float(np.percentile(d[op], 99.9))
            skirt = op & (z < -0.5)
            msg = "round-trip on %s: d99.9=%.3f (want <= %.3f)" % (
                stem, d99, CELL + BLEED_W)
            ok = d99 <= CELL + BLEED_W
            if skirt.sum() > 100:
                sk_lo, sk_hi = (float(np.percentile(d[skirt], 1)),
                                float(np.percentile(d[skirt], 99)))
                msg += "; skirt d in [%.3f, %.3f] (want ~%.1f)" % (sk_lo, sk_hi, CELL)
                ok = ok and abs(sk_hi - CELL) < 0.15 and sk_lo > CELL - 0.5
            print(("  ok   " if ok else "  FAIL ") + msg)
            if not ok:
                sys.exit("projection constants are wrong -- refusing to judge")
            rt_done = True

        # ---- invariant A: no H data outside the cell (the overshoot stamp)
        n_over = int(((ha > 128) & back).sum())
        if n_over:
            over_bad[stem] = n_over
        # ---- invariant B: no opaque-albedo pixel inside the cell missing its
        # height (the erosion dead zone -- what turned the lattice black)
        n_dead = int(((aa >= 250) & (d < CELL - TOL_IN) & (ha < 250)).sum())
        if n_dead:
            dead_bad[stem] = n_dead
        # ---- invariant C: the NORMAL has to be there too. B checked the height
        # only, and the two masks are not the same: the normal is stored at half
        # resolution and its alpha is built by a different path, so it can be
        # absent where the height is present. A cleared normal decodes through
        # rgb*2-1 to a direction pointing away from the light and shades BLACK --
        # which is what the surviving magnified seam specks are made of.
        n_nrm = int(((aa >= 250) & (d < CELL - TOL_IN) & (nrm[:, :, 3] < 250)).sum())
        if n_nrm:
            nrm_bad[stem] = n_nrm

    n = len(tiles)
    print("\n%s: %d tiles" % (packdir, n))
    print("  A  back-side overshoot (H data beyond cell+%.2f): %d tiles, %d px%s"
          % (TOL_OUT, len(over_bad), sum(over_bad.values()),
             "" if over_bad else "   -- none"))
    print("  B  dead zone (opaque albedo, no height, inside cell-%.2f): %d tiles, %d px%s"
          % (TOL_IN, len(dead_bad), sum(dead_bad.values()),
             "" if dead_bad else "   -- none"))
    print("  C  missing normal (opaque albedo, no normal, inside cell-%.2f): %d tiles, %d px%s"
          % (TOL_IN, len(nrm_bad), sum(nrm_bad.values()),
             "" if nrm_bad else "   -- none"))
    for name, cnt in sorted(nrm_bad.items(), key=lambda kv: -kv[1])[:4]:
        print("       worst C: %-40s %d px" % (name, cnt))
    for name, cnt in sorted(dead_bad.items(), key=lambda kv: -kv[1])[:4]:
        print("       worst B: %-40s %d px" % (name, cnt))
    for name, cnt in sorted(over_bad.items(), key=lambda kv: -kv[1])[:4]:
        print("       worst A: %-40s %d px" % (name, cnt))
    return len(over_bad), len(dead_bad) + len(nrm_bad)


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("-")]
    packdir = args[0] if args else "out/grass10A/packed"
    a_bad, b_bad = check(packdir)
    # B failing is always a shipped bug. A failing is the (old) overshoot state;
    # --expect-overshoot lets the control run assert it rather than die on it.
    if "--expect-overshoot" in sys.argv:
        sys.exit(0 if (a_bad and not b_bad) else "control did not behave as a control")
    sys.exit(1 if (a_bad or b_bad) else 0)
