"""
Assemble a dungeon room from the rendered kit and light it with the normal maps.

    python assemble_room.py [outdir]

This is the payoff test: it uses the tiles exactly the way the runtime engine
will (blit on the lattice, painter order) and then lights the result with real
point lights through the _NRM pair. If the pipeline is sound, torches cast
directional shading on the masonry that MOVES with the light, and no join is
visible anywhere.

Screen mapping (derived from the camera basis, not guessed):
    camera right = (0.707, 0.707, 0)      camera up = (-0.354, 0.354, 0.866)
    world +X -> screen right & DOWN       world +Y -> screen right & UP
so a tile's four world edges land on screen as
    Y+ upper-right   X+ lower-right   Y- lower-left   X- upper-left
and the lattice steps are  i:+X = (+400,+200)   j:-Y = (-400,+200).
"""
import math
import os
import sys
from PIL import Image

TILE_W, RES = 800, 1280
ANCHOR = (RES // 2, RES // 2)          # tile centre inside its own canvas
STEP_I = (TILE_W // 2, TILE_W // 4)    # +X : right & down
STEP_J = (-TILE_W // 2, TILE_W // 4)   # -Y : left & down
PPU = TILE_W / (4.0 * math.sqrt(2.0))

# which (tile, rotation) puts walls on exactly this set of world edges
ORDER = ["Y+", "X+", "Y-", "X-"]
BASE = {"floor": [], "wall": ["Y+"], "corner": ["Y+", "X+"],
        "corridor": ["Y+", "Y-"], "deadend": ["Y+", "X+", "X-"]}


def variants():
    out = {}
    for name, edges in BASE.items():
        for rot in (0, 90, 180, 270):
            steps = (rot // 90) % 4
            key = frozenset(ORDER[(ORDER.index(e) + steps) % 4] for e in edges)
            out.setdefault(key, (name, rot))
    return out


def load(d, name, rot):
    a = Image.open(os.path.join(d, "%s_r%d.png" % (name, rot))).convert("RGBA")
    n = Image.open(os.path.join(d, "%s_r%d_NRM.png" % (name, rot))).convert("RGBA")
    return a, n


def build(d, W=4, H=4):
    """Room with walls along the two BACK edges (X- upper-left, Y+ upper-right)
    so the camera looks into the room."""
    V = variants()
    cells = {}
    for i in range(W):
        for j in range(H):
            edges = set()
            if j == 0:
                edges.add("Y+")     # far upper-right boundary
            if i == 0:
                edges.add("X-")     # far upper-left boundary
            cells[(i, j)] = V[frozenset(edges)]

    pts = [(i * STEP_I[0] + j * STEP_J[0], i * STEP_I[1] + j * STEP_J[1])
           for (i, j) in cells]
    minx, maxx = min(p[0] for p in pts), max(p[0] for p in pts)
    miny, maxy = min(p[1] for p in pts), max(p[1] for p in pts)
    ox, oy = -minx + ANCHOR[0], -miny + ANCHOR[1]
    cw = (maxx - minx) + RES
    ch = (maxy - miny) + RES

    alb = Image.new("RGBA", (cw, ch), (0, 0, 0, 0))
    nrm = Image.new("RGBA", (cw, ch), (0, 0, 0, 0))
    for (i, j) in sorted(cells, key=lambda c: c[0] + c[1]):     # painter: far first
        name, rot = cells[(i, j)]
        a, n = load(d, name, rot)
        px = ox + i * STEP_I[0] + j * STEP_J[0] - ANCHOR[0]
        py = oy + i * STEP_I[1] + j * STEP_J[1] - ANCHOR[1]
        alb.alpha_composite(a, (px, py))
        nrm.alpha_composite(n, (px, py))
    return alb, nrm, (ox, oy)


def screen_to_world(sx, sy):
    """Invert the iso projection assuming the pixel lies on the z=0 floor."""
    s = sx / (0.7071 * PPU)      # = X + Y
    t = sy / (0.35355 * PPU)     # = X - Y
    return (s + t) / 2.0, (s - t) / 2.0


def light(alb, nrm, origin, lights, ambient=(0.16, 0.16, 0.20)):
    w, h = alb.size
    out = Image.new("RGBA", (w, h), (0, 0, 0, 255))
    ap, np_, op = alb.load(), nrm.load(), out.load()
    ox, oy = origin
    pre = []
    for (wx, wy, wz, col, rng) in lights:
        pre.append((wx, wy, wz, col, rng))
    for y in range(h):
        for x in range(w):
            a = ap[x, y]
            if a[3] < 8:
                continue
            n = ((np_[x, y][0] / 255.0) * 2 - 1,
                 (np_[x, y][1] / 255.0) * 2 - 1,
                 (np_[x, y][2] / 255.0) * 2 - 1)
            m = math.sqrt(n[0] ** 2 + n[1] ** 2 + n[2] ** 2) or 1.0
            n = (n[0] / m, n[1] / m, n[2] / m)      # AA pixels are not unit length
            px_, py_ = screen_to_world(x - ox, y - oy)
            r = g = b = 0.0
            for (lx, ly, lz, col, rng) in pre:
                dx, dy, dz = lx - px_, ly - py_, lz
                dist = math.sqrt(dx * dx + dy * dy + dz * dz) or 1e-6
                ndl = max(0.0, (n[0] * dx + n[1] * dy + n[2] * dz) / dist)
                att = 1.0 / (1.0 + (dist / rng) ** 2)
                r += col[0] * ndl * att
                g += col[1] * ndl * att
                b += col[2] * ndl * att
            op[x, y] = (min(255, int(a[0] * (r + ambient[0]))),
                        min(255, int(a[1] * (g + ambient[1]))),
                        min(255, int(a[2] * (b + ambient[2]))), 255)
    return out


def main():
    d = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), "out")
    alb, nrm, origin = build(d)
    alb.save(os.path.join(d, "_room_flat.png"))
    print("assembled %s -> _room_flat.png" % (alb.size,))

    # two torches sitting inside the room, in world units (tile = 4 units)
    lit = light(alb, nrm, origin, [
        (2.0,  -2.0, 2.2, (1.35, 0.92, 0.55), 7.0),    # warm torch, near-left
        (-9.0,  9.0, 2.6, (0.42, 0.60, 1.30), 9.0),    # cold light, far corner
    ])
    lit.save(os.path.join(d, "_room_lit.png"))
    print("lit -> _room_lit.png")

    w, h = lit.size
    lit.crop((w // 2 - 700, h // 2 - 500, w // 2 + 500, h // 2 + 300)).save(
        os.path.join(d, "_room_detail.png"))
    print("detail crop -> _room_detail.png")


if __name__ == "__main__":
    main()
