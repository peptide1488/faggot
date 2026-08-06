"""Do two tiles that may abut agree about the height of the border they share?

    blender -b -P check_seams.py -- [--theme grass10A]

The lattice guarantees the tiles LINE UP; nothing guarantees their surfaces meet.
Each field used to scale the shared border noise by its own relief amplitude, so
two tiles sampled the same shape and placed it at different heights -- a step of up
to a fifth of a unit that no test could see, because the renders are correct in
isolation and the map only shows the skirt quietly filling the gap. That reads as a
smooth wall where a cliff face should be.

This walks every pair of tiles whose facing sockets match and measures the worst
disagreement along the seam, in world units. A texel is about 0.009 units at the
current lattice, so anything under that is invisible; anything over it is a step.
"""
import importlib.util
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("bt", os.path.join(HERE, "build_tiles.py"))
bt = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bt)

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
bt.THEME = argv[argv.index("--theme") + 1] if "--theme" in argv else "grass10A"

TILES = bt.tiles()
EDGES = ["Y+", "X+", "Y-", "X-"]
OPP = {"Y+": "Y-", "Y-": "Y+", "X+": "X-", "X-": "X+"}
N = 41                                   # samples along the seam
TEXEL = bt.SIZE / bt.TILE_W_PX * 4       # ~one output pixel of height, generously


def field_for(name, spec, rot):
    """The same construction add_terrain uses, so this measures what is baked."""
    import zlib
    seed = bt.SEED * 977 + (zlib.crc32(name.encode()) % 99991)
    # bt.rotate_spec, NOT a copy of it: this file existed to catch seams that
    # disagree, and a second hand-kept list of which spec keys name an edge is
    # itself a way to disagree -- it would have reported the headland as fine
    # while the bake put its geometry at the wrong rotation.
    return bt.FIELDS[spec["terrain"]](bt.rotate_spec(spec, rot), seed)


def edge_profile(f, edge):
    """Height along one edge, ordered by a WORLD axis so two tiles compare like
    for like -- an edge read in tile-local order is reversed on the neighbour."""
    out = []
    for k in range(N):
        t = k / float(N - 1)
        if edge == "Y+":
            u, v = t, 1.0
        elif edge == "Y-":
            u, v = t, 0.0
        elif edge == "X+":
            u, v = 1.0, t
        else:
            u, v = 0.0, t
        out.append(f(u, v)[0])
    return out


def main():
    terrain = {n: s for n, s in TILES.items() if s.get("terrain")}
    if not terrain:
        print("set %r has no terrain tiles" % bt.THEME)
        return

    # EVERY VARIANT, NOT EVERY TILE. This compared tile A at r0 against tile B at
    # r0 and nothing else, which is a small corner of what the solver actually
    # builds: almost every adjacency on a real map is against a ROTATED
    # neighbour. Worse, it is exactly the case an unoriented crossing socket can
    # hide -- X01 says "a level change crosses here" and not which end of the
    # edge is the high one, so two pieces whose faces run opposite ways still
    # match on paper. Profiles are computed once per (variant, edge) and then
    # only compared, so covering 16x more pairs costs almost nothing.
    prof = {}
    socks = {}
    for n, sp in terrain.items():
        for rot in bt.ROTATIONS:
            f = field_for(n, sp, rot)
            for e in EDGES:
                prof[(n, rot, e)] = edge_profile(f, e)
            socks[(n, rot)] = bt.tile_sockets(bt.rotate_spec(sp, rot))

    variants = sorted(socks)
    worst = []
    pairs = 0
    for a in variants:
        for b in variants:
            for e in EDGES:
                if socks[a][e] != socks[b][OPP[e]]:
                    continue          # the solver would never put these together
                pairs += 1
                d = max(abs(x - y) for x, y in
                        zip(prof[(a[0], a[1], e)], prof[(b[0], b[1], OPP[e])]))
                worst.append((d, a, b, e))

    worst.sort(reverse=True, key=lambda w: w[0])
    bad = [w for w in worst if w[0] > TEXEL]
    print("checked %d abutting pairs over %d variants; texel = %.4f units"
          % (pairs, len(variants), TEXEL))
    seen, shown = set(), 0
    print("worst offenders (one line per pair of PIECES):")
    for d, a, b, e in worst:
        if d <= TEXEL or shown >= 10:
            break
        key = tuple(sorted((a[0], b[0])))
        if key in seen:
            continue
        seen.add(key); shown += 1
        print("  %.4f  %s r%d %s | %s r%d"
              % (d, a[0].replace(bt.THEME + "-", ""), a[1], e,
                 b[0].replace(bt.THEME + "-", ""), b[1]))
    print("%d of %d pairs disagree by more than a texel" % (len(bad), len(worst)))


main()
