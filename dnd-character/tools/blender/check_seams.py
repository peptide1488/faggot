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
    sp = dict(spec)
    for key in ("high", "arms"):
        if sp.get(key):
            sp[key] = bt.rotate_edges(sp[key], rot)
    if sp.get("ramp"):
        sp["ramp"] = bt.rotate_edges([sp["ramp"]], rot)[0]
    return bt.FIELDS[spec["terrain"]](sp, seed)


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
    socks = {n: bt.tile_sockets(s) for n, s in terrain.items()}

    worst = []
    pairs = 0
    for na, sa in terrain.items():
        for nb, sb in terrain.items():
            for e in EDGES:
                if socks[na][e] != socks[nb][OPP[e]]:
                    continue          # the solver would never put these together
                pairs += 1
                fa = field_for(na, sa, 0)
                fb = field_for(nb, sb, 0)
                pa = edge_profile(fa, e)
                pb = edge_profile(fb, OPP[e])
                d = max(abs(x - y) for x, y in zip(pa, pb))
                worst.append((d, na, nb, e))

    worst.sort(reverse=True)
    bad = [w for w in worst if w[0] > TEXEL]
    print("checked %d abutting pairs; texel = %.4f units" % (pairs, TEXEL))
    print("worst 8:")
    for d, na, nb, e in worst[:8]:
        flag = "  <-- STEP" if d > TEXEL else ""
        print("  %.4f  %s %s | %s%s"
              % (d, na.replace(bt.THEME + "-", ""), e,
                 nb.replace(bt.THEME + "-", ""), flag))
    print("%d of %d pairs disagree by more than a texel" % (len(bad), len(worst)))


main()
