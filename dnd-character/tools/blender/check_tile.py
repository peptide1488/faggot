"""
Verify a rendered iso tile against the projection it claims to have.

    python check_tile.py out/floor_r0.png

Two checks, both against numbers predicted from the camera setup rather than
eyeballed -- the mistake that cost the Nano Banana round was concluding a defect
from a measurement with no control:

  1. FOOTPRINT  the alpha bounding box must be TILE_W x TILE_W/2, centred.
  2. TILING     blit the tile on the lattice (anchor + i*R + j*L) and check the
                seam columns. A curb, a gap or scale drift all show up as the
                seam row differing from the same row inside a tile interior.
"""
import os
import sys
from PIL import Image

TILE_W = 800                      # must match TILE_W_PX in the Blender setup
STEP_R = (TILE_W // 2, TILE_W // 4)      # (+400, +200)
STEP_L = (-TILE_W // 2, TILE_W // 4)     # (-400, +200)


def footprint(im):
    bbox = im.getchannel("A").getbbox()
    x0, y0, x1, y1 = bbox
    w, h = x1 - x0, y1 - y0
    cx, cy = (x0 + x1) / 2.0, (y0 + y1) / 2.0
    return bbox, w, h, cx, cy


def bed_metrics(im):
    """The blit lattice is defined by the FLOOR PLANE's diamond, not by the whole
    silhouette -- raised relief (stones, walls) legitimately sticks out above the
    far corner and would otherwise read as scale drift. Measure the plane: its
    widest row is the diamond's waist, its lowest opaque pixel the near vertex."""
    a = im.getchannel("A")
    w, h = a.size
    px = a.load()
    best_w, best_y, low_y = 0, 0, 0
    for y in range(h):
        run = [x for x in range(w) if px[x, y] > 8]
        if not run:
            continue
        low_y = y
        span = run[-1] - run[0] + 1
        if span > best_w:
            best_w, best_y = span, y
    return best_w, best_y, low_y


def tile_3x3(im):
    """Assemble 3x3 in painter order -(i+j) and return the canvas."""
    W, H = im.size
    pad = TILE_W * 2
    canvas = Image.new("RGBA", (W + pad * 2, H + pad * 2), (0, 0, 0, 0))
    cells = [(i, j) for i in range(3) for j in range(3)]
    cells.sort(key=lambda c: -(c[0] + c[1]), reverse=True)
    for i, j in cells:
        ox = pad + i * STEP_R[0] + j * STEP_L[0]
        oy = pad + i * STEP_R[1] + j * STEP_L[1]
        canvas.alpha_composite(im, (ox, oy))
    return canvas


MARGIN = 12   # px of each row's span to ignore: the assembly's own ragged outer tips


def seam_report(canvas):
    """Minimum alpha strictly INSIDE the assembly.

    The outer silhouette of a diamond grid ends in long shallow AA ramps at every
    boundary tile's left/right vertex, which dip to alpha 0 over a few pixels. Those
    are the border of the test canvas, not a seam -- counting them reported five
    'defects' that did not exist. Skip MARGIN px at each end of a row and the metric
    becomes a real one: if two tiles abut correctly, every interior pixel is fully
    opaque, and any join that gaps or blends shows as interior alpha < 255."""
    a = canvas.getchannel("A")
    w, h = a.size
    px = a.load()
    worst = []
    for y in range(h):
        run = [x for x in range(w) if px[x, y] > 8]
        if len(run) < 2 + 2 * MARGIN:
            continue
        lo, hi = run[0] + MARGIN, run[-1] - MARGIN
        for x in range(lo, hi):
            v = px[x, y]
            if v < 255:
                worst.append((v, x, y))
    return worst


def main():
    path = sys.argv[1] if len(sys.argv) > 1 else "out/floor_r0.png"
    outdir = os.path.dirname(os.path.abspath(path))
    im = Image.open(path).convert("RGBA")
    bbox, w, h, cx, cy = footprint(im)
    W, H = im.size
    print("image        %dx%d" % (W, H))
    print("alpha bbox   %s   (silhouette, relief included)" % (bbox,))

    bw, by, low = bed_metrics(im)
    print("bed waist    %d px wide at y=%d   (expected %d at y=%d)"
          % (bw, by, TILE_W + 1, H // 2))
    print("near vertex  y=%d                 (expected %d)" % (low, H // 2 + TILE_W // 4))
    print("relief above far corner: %d px" % ((H // 2 - TILE_W // 4) - bbox[1]))

    canvas = tile_3x3(im)
    canvas.save(os.path.join(outdir, "_tiling_3x3.png"))
    soft = seam_report(canvas)
    print("3x3 assembly -> %s" % os.path.join(outdir, "_tiling_3x3.png"))
    if not soft:
        print("SEAMS        clean: every interior pixel is alpha 255")
    else:
        soft.sort()
        print("SEAMS        %d interior px below alpha 255; worst (alpha,x,y): %s"
              % (len(soft), soft[:5]))


if __name__ == "__main__":
    main()
