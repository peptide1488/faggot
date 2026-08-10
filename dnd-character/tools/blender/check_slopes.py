"""Do two tiles that may abut agree about the SLOPE across the edge they share?

    python check_slopes.py [grass10A]

check_seams.py asks whether they agree about the HEIGHT there. Two tiles can
agree to 0.0000 and still KINK: a surface continuous in value but not in
gradient is a lighting crease, and the shader draws it as a line down every
seam. Nothing checked that until the 2026-08 seam work, which found ~10% of
abutting pairs with a gradient mismatch up to 0.93 (1.0 is 45 degrees) while
check_seams reported them perfect.

Both causes were per-tile noise whose DERIVATIVE did not vanish at the border:

  the frayed verge   scaled the mud mask, and the rut is cut from it, so two
                     tracks cut to different depths approaching the same edge
  the crown wander   sin(pi*t) is zero AT the edge but leaves with slope pi,
                     so two tracks met exactly and immediately bent apart

The rule this encodes: anything seeded per tile must reach the border with
zero value AND zero slope, or share the seed with its neighbour.

Runs on the FIELDS -- pure maths, no bake, no Blender. Seconds, not an hour.
Exit 1 if any pair exceeds SLOPE_LIMIT.
"""
import math
import os
import sys
import types
import zlib

# build_tiles imports bpy at module scope; stub enough to read its fields.
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

N = 21                    # samples along each edge
H = 1.0 / 512.0           # derivative step, well under one output texel
SLOPE_LIMIT = 0.05
OPP = {"X+": "X-", "X-": "X+", "Y+": "Y-", "Y-": "Y+"}


def field_for(name, spec, rot):
    """The same construction add_terrain uses, so this measures what is baked."""
    seed = bt.SEED * 977 + (zlib.crc32(name.encode()) % 99991)
    return bt.FIELDS[spec["terrain"]](bt.rotate_spec(spec, rot), seed)


def uv(edge, t, inset):
    """A point `inset` INSIDE the tile from `edge`, at along-edge position t."""
    if edge == "Y+":
        return t, 1.0 - inset
    if edge == "Y-":
        return t, inset
    if edge == "X+":
        return 1.0 - inset, t
    return inset, t


def edge_profile(f, edge):
    """Height and INWARD slope along one edge.

    Ordered by a WORLD axis, exactly as check_seams does it -- Y+ and Y- both
    run t->u, X+ and X- both run t->v -- so the neighbour compares like for
    like and no reversal is wanted. (Reversing was tried; it made the height
    figure disagree with check_seams by 2.76 units, which is how the error
    announced itself.)
    """
    zs, ds = [], []
    for k in range(N):
        t = k / float(N - 1)
        u0, v0 = uv(edge, t, 0.0)
        u1, v1 = uv(edge, t, H)
        z0 = f(u0, v0)[0]
        zs.append(z0)
        ds.append((f(u1, v1)[0] - z0) / H)
    return zs, ds


def main():
    theme = ([a for a in sys.argv[1:] if not a.startswith("-")] or ["grass10A"])[0]
    tiles = bt.outdoor_tiles(theme)
    rots = (0, 90, 180, 270)

    sock, prof = {}, {}
    for name, spec in tiles.items():
        for r in rots:
            sock[(name, r)] = bt.tile_sockets(bt.rotate_spec(spec, r))
            f = field_for(name, spec, r)
            prof[(name, r)] = {e: edge_profile(f, e) for e in bt.EDGE_ORDER}

    worst_h = worst_s = 0.0
    pairs = 0
    bad = []
    for (na, ra), sa in sock.items():
        for e in bt.EDGE_ORDER:
            o = OPP[e]
            for (nb, rb), sb in sock.items():
                if sa[e] != sb[o]:
                    continue
                pairs += 1
                za, da = prof[(na, ra)][e]
                zb, db = prof[(nb, rb)][o]
                dh = max(abs(x - y) for x, y in zip(za, zb))
                # A's inward slope and B's inward slope point in OPPOSITE world
                # directions across the seam, so a smooth surface has da == -db.
                ds = max(abs(x + y) for x, y in zip(da, db))
                worst_h = max(worst_h, dh)
                worst_s = max(worst_s, ds)
                bad.append((ds, dh, na, ra, e, nb, rb))

    vals = sorted(x[0] for x in bad)
    n = len(vals)
    print("\n%s: %d abutting (tile, rot, edge) pairs" % (theme, pairs))
    print("  slope mismatch percentiles:  " + "  ".join(
        "%d%%=%.3f" % (q, vals[min(n - 1, int(q / 100.0 * (n - 1)))])
        for q in (50, 90, 99, 100)))
    over = sum(1 for v in vals if v > SLOPE_LIMIT)
    print("  above %.2f: %d pairs (%.1f%%)" % (SLOPE_LIMIT, over, 100.0 * over / n))
    print("  worst HEIGHT disagreement: %.4f units (check_seams' texel is %.4f)"
          % (worst_h, bt.SIZE / bt.TILE_W_PX * 4))

    if over:
        bad.sort(reverse=True)
        print("\n  worst offenders by slope:")
        for ds, dh, na, ra, e, nb, rb in bad[:6]:
            print("    slope %6.3f  height %.4f   %s r%d %s  vs  %s r%d"
                  % (ds, dh, na.split("-", 1)[1], ra, e, nb.split("-", 1)[1], rb))
        sys.exit("FAIL: worst slope mismatch %.3f exceeds %.2f -- that seam will "
                 "show as a lighting crease. Look for per-tile noise whose value "
                 "or derivative does not vanish at the tile border."
                 % (worst_s, SLOPE_LIMIT))
    print("\nok: worst slope mismatch %.4f (limit %.2f)" % (worst_s, SLOPE_LIMIT))


if __name__ == "__main__":
    main()
