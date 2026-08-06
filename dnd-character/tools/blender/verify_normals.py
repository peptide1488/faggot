"""
Verify an albedo/_NRM pair, then relight it under a MOVING light.

    python verify_normals.py out/floor_r0.png

Why the moving light matters: a normal map that is subtly wrong -- wrong space,
wrong handedness, a tone curve baked in -- still looks plausible in a still. It
only betrays itself when the light travels and the highlight slides the wrong
way or fails to move at all. Stills are not evidence here.

Convention being checked (must match the Blender emission shader and whatever
the runtime WebGL shader does): world space, +Z up, encoded n*0.5+0.5, straight
alpha, no tone mapping.
"""
import os
import sys
import math
from PIL import Image

FLAT = (128, 128, 255)      # a floor-facing normal (0,0,1) after encoding
TOL = 2


def decode(px):
    return ((px[0] / 255.0) * 2 - 1, (px[1] / 255.0) * 2 - 1, (px[2] / 255.0) * 2 - 1)


def check_pair(albedo_path, nrm_path):
    alb = Image.open(albedo_path).convert("RGBA")
    nrm = Image.open(nrm_path).convert("RGBA")
    print("albedo %s   normal %s" % (alb.size, nrm.size))
    assert alb.size == nrm.size, "size mismatch"

    aa, na = alb.getchannel("A"), nrm.getchannel("A")
    diff = [1 for p, q in zip(aa.getdata(), na.getdata()) if abs(p - q) > 8]
    print("alpha parity: %d px differ by >8  (0 means the pair masks identically)" % len(diff))

    w, h = nrm.size
    px = nrm.load()
    apx = aa.load()
    flat = off = 0
    unit_err = 0.0
    n_checked = 0
    for y in range(0, h, 3):
        for x in range(0, w, 3):
            if apx[x, y] < 250:
                continue
            p = px[x, y]
            n_checked += 1
            if all(abs(p[i] - FLAT[i]) <= TOL for i in range(3)):
                flat += 1
            else:
                off += 1
            v = decode(p)
            unit_err = max(unit_err, abs(math.sqrt(v[0]**2 + v[1]**2 + v[2]**2) - 1.0))
    print("sampled %d opaque px: %d flat-up (%.1f%%), %d angled" %
          (n_checked, flat, 100.0 * flat / max(n_checked, 1), off))
    print("max |n|-1 error: %.4f   (should be ~0; large means encoding is wrong)" % unit_err)
    return alb, nrm


def relight(alb, nrm, lightdir, ambient=0.18):
    """Plain N.L lambert, exactly what the runtime shader will do."""
    w, h = alb.size
    out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    ap, np_, op = alb.load(), nrm.load(), out.load()
    lx, ly, lz = lightdir
    m = math.sqrt(lx*lx + ly*ly + lz*lz)
    lx, ly, lz = lx/m, ly/m, lz/m
    for y in range(h):
        for x in range(w):
            a = ap[x, y]
            if a[3] < 8:
                continue
            n = decode(np_[x, y])
            d = max(0.0, n[0]*lx + n[1]*ly + n[2]*lz) + ambient
            op[x, y] = (min(255, int(a[0]*d)), min(255, int(a[1]*d)),
                        min(255, int(a[2]*d)), a[3])
    return out


def main():
    albedo_path = sys.argv[1] if len(sys.argv) > 1 else "out/floor_r0.png"
    nrm_path = albedo_path.replace(".png", "_NRM.png")
    outdir = os.path.dirname(os.path.abspath(albedo_path))
    alb, nrm = check_pair(albedo_path, nrm_path)

    # crop to the tile so the contact sheet is readable
    box = alb.getchannel("A").getbbox()
    alb_c, nrm_c = alb.crop(box), nrm.crop(box)

    frames = []
    for i in range(4):
        ang = math.radians(90 * i + 45)
        # light orbits in the XY plane, well above the floor
        frames.append(relight(alb_c, nrm_c, (math.cos(ang), math.sin(ang), 0.85)))
    cw, ch = frames[0].size
    sheet = Image.new("RGBA", (cw * 4, ch), (20, 20, 24, 255))
    for i, f in enumerate(frames):
        sheet.alpha_composite(f, (cw * i, 0))
    path = os.path.join(outdir, "_relight_sweep.png")
    sheet.save(path)
    print("relight sweep (light orbiting 45/135/225/315 deg) -> %s" % path)


if __name__ == "__main__":
    main()
