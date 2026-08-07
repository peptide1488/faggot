"""What a socket set can and cannot express, read off its own manifest.

    python socket_spec.py [out/grass10A] [-o SOCKETS.md]

Two tiles may abut iff the facing sockets are equal. That rule is simple enough to
hold in your head and completely opaque about what it IMPLIES: whether the pieces
you have can actually build the shapes you want. A pond needs a ring of shore, and
a ring has corners; if no tile presents water on one edge and land on the next,
the solver cannot make that corner and the pond comes out square -- but nothing
reports an error, because every tile it did place agrees with its neighbours.

So this asks the question the adjacency rule cannot:

  VOCABULARY   every socket, and how many faces can present it
  PIECES       every tile as its four edges, at rotation 0
  CORNERS      which (edge, next edge) pairs any piece can express -- and which
               it cannot, which is the list of tiles that are missing
  SPANS        the same for OPPOSITE edges, which is what a piece crossed by
               something (a track, a level change) has to get right

A missing corner is not a hypothesis about why a map looks wrong. It is a shape
the set provably cannot make.
"""

import collections
import json
import os
import sys

EDGE_ORDER = ["X+", "Y+", "X-", "Y-"]
# Going round the tile, each edge and the one after it -- the four corners.
CORNERS = [(EDGE_ORDER[i], EDGE_ORDER[(i + 1) % 4]) for i in range(4)]
OPPOSITE = {"X+": "X-", "X-": "X+", "Y+": "Y-", "Y-": "Y+"}

# What each socket means. Kept here rather than in the manifest because it is
# documentation for a person, not data for the solver -- the solver only ever
# compares them for equality and does not care what they stand for.
MEANING = {
    "G0": "ground, low band",
    "G1": "ground, high band",
    "W": "open water",
    "G0+P": "ground low, with a track crossing this edge",
    "G1+P": "ground high, with a track crossing this edge",
    "W+P": "water, with a track crossing this edge (a ford)",
    "W+B": "water, with a track carried OVER it on a deck (a bridge)",
    "G2": "ground, top band",
    "G2+P": "ground top, with a track crossing this edge",
    "X01": "a level change crosses this edge (low <-> high)",
    "X12": "a level change crosses this edge (high <-> top)",
    "Xw0": "a level change crosses this edge (water <-> low)",
    "Xw1": "a level change crosses this edge (water <-> high)",
}

# WHICH BANDS AN EDGE TOUCHES. -1 water bed, 0 ground, 1 high ground. A crossing
# socket touches both of the bands it changes between.
#
# This is what separates a MISSING piece from an IMPOSSIBLE one, and without it
# the corner table is worse than useless: it reports 52 empty cells of 81 and
# most of them are empty because the contract forbids them. A tile cannot present
# plain low ground on one edge and plain high ground on the next -- that IS a
# level change, and a level change has to be declared on the edges it crosses.
# So two sockets can share a corner only if some band is common to both; where
# they cannot, the blank is the design working, not a hole to fill.
BANDS = {
    "G0": {0}, "G0+P": {0},
    "G1": {1}, "G1+P": {1},
    "G2": {2}, "G2+P": {2},
    # W+B touches the bed and nothing else: the deck over it is carried, not
    # ground, so it constrains no band. That is the whole reason the socket exists
    # -- both sides of the seam agree the GROUND here is riverbed.
    "W": {-1}, "W+P": {-1}, "W+B": {-1},
    "X01": {0, 1}, "Xw0": {-1, 0}, "Xw1": {-1, 1}, "X12": {1, 2},
}


def base(sock):
    """`X01>Y+` -> `X01`. A crossing carries the world edge it rises toward, so
    that two faces running opposite ways cannot abut; which bands it touches is
    the same question either way. Without this every oriented socket fell out of
    BANDS, compatible() said no to all of them, and the corner table reported a
    serene 0 missing because it had quietly decided nothing was possible."""
    return sock.split(">")[0]


AXIS = {"X+": "X", "X-": "X", "Y+": "Y", "Y-": "Y"}
OPP = {"X+": "X-", "X-": "X+", "Y+": "Y-", "Y-": "Y+"}


def rises(sock):
    """The world edge a crossing rises toward, or None for a flat band."""
    return sock.split(">")[1] if ">" in sock else None


def band_at(sock, edge, other):
    """Which band this socket puts at the corner where `edge` meets `other`.

    A crossing names the end of its own edge that is high, so the corner sitting
    at that end is the high band and the far one is the low band. A flat socket is
    the same band all the way along.
    """
    lo, hi = min(BANDS[base(sock)]), max(BANDS[base(sock)])
    d = rises(sock)
    if d is None:
        return lo                      # flat: lo == hi
    return hi if d == other else lo


def compatible(a, b, ea="X+", eb="Y+"):
    """Could one tile present these two sockets on these two adjacent edges?

    ONE rule, and it replaced three weaker ones that between them still let 8
    impossible corners through -- each of which reads as a tile somebody should
    go and model.

      AXIS      a crossing names which end of ITS OWN edge is high, so an edge
                running in Y can only rise toward Y+ or Y-. `X01>Y+` on a Y edge
                is not unbuilt, it is a sentence that does not parse.
      CORNER    the two edges MEET, and the corner they share is one piece of
                ground at one height. So each socket's band at that corner has to
                be the same band. `X01>Y+` on X+ says its Y+ end is high ground;
                `Xw0>X+` on Y+ says its X+ end is the low band -- and those are
                the same corner, so no tile can present both, however much the
                shape sounds like something a landscape ought to have.

    This subsumes the band-overlap test that came before it: two sockets with no
    band in common cannot agree about the corner either.
    """
    for sock, edge in ((a, ea), (b, eb)):
        d = rises(sock)
        if d is not None and AXIS[d] == AXIS[edge]:
            return False
    for sock in (a, b):
        if base(sock) not in BANDS:
            # A socket this table has never heard of would otherwise be
            # "incompatible with everything", so every corner using it reads as
            # forbidden and no gap involving it is ever reported. That is the
            # tool lying quietly, which is worse than it failing.
            raise SystemExit("socket_spec does not know the socket %r -- add it to "
                             "BANDS and MEANING, or the report is fiction" % sock)
    return band_at(a, ea, eb) == band_at(b, eb, ea)


def load(setdir):
    with open(os.path.join(setdir, "tiles.json")) as fh:
        man = json.load(fh)
    tiles = {n: t for n, t in man["tiles"].items() if t.get("sockets")}
    if not tiles:
        sys.exit("%s has no socketed tiles -- it is a wall-contract set" % setdir)
    return man, tiles


def short(name):
    """grass10A-scarp-0210 -> scarp-0210. The set prefix is on every line."""
    parts = name.split("-", 1)
    return parts[1] if len(parts) > 1 else name


def family(name):
    """The piece's family: scarp, strand, bluff, turf, mere, track..."""
    return short(name).split("-")[0]


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("-")]
    setdir = args[0] if args else "out/grass10A"
    out = sys.argv[sys.argv.index("-o") + 1] if "-o" in sys.argv else None

    man, tiles = load(setdir)
    rots = [str(r) for r in man.get("rotations", [0, 90, 180, 270])]
    L = []
    w = L.append

    w("# %s — edge and connection spec" % man.get("label", man.get("set")))
    w("")
    w("Generated by `socket_spec.py` from `%s/tiles.json`. Do not hand-edit: "
      "re-run it after any change to the tile table." % setdir)
    w("")
    w("**The rule:** two tiles may abut iff the facing sockets are equal. "
      "Everything below is a consequence of that rule and the pieces that exist.")
    w("")

    # ---- vocabulary --------------------------------------------------------
    supply = collections.Counter()
    presenters = collections.defaultdict(set)
    for n, t in tiles.items():
        for r in rots:
            for e, v in t["sockets"][r].items():
                supply[v] += 1
                presenters[v].add(family(n))
    w("## Vocabulary")
    w("")
    w("`faces` counts (tile x rotation x edge) instances, so it measures how "
      "much freedom the solver has when a neighbour demands that socket.")
    w("")
    w("| socket | meaning | faces | families that present it |")
    w("|---|---|---:|---|")
    for v, c in sorted(supply.items(), key=lambda kv: -kv[1]):
        w("| `%s` | %s | %d | %s |"
          % (v, MEANING.get(base(v), "?"), c, ", ".join(sorted(presenters[v]))))
    w("")
    thin = [v for v, c in supply.items() if c <= 4]
    if thin:
        w("**Thin:** %s — four faces or fewer. A neighbour demanding one of these "
          "leaves the solver a single piece to place, which is a constraint that "
          "propagates hard and shows up as rejected maps rather than as an error."
          % ", ".join("`%s`" % v for v in sorted(thin)))
        w("")

    # ---- pieces ------------------------------------------------------------
    w("## Pieces")
    w("")
    w("Edges at rotation 0, going round the tile. Every piece exists in all "
      "four rotations; the solver sees %d variants." % (len(tiles) * len(rots)))
    w("")
    w("| piece | role | band | %s |" % " | ".join("`%s`" % e for e in EDGE_ORDER))
    w("|---|---|---:|%s" % ("---|" * 4))
    for n in sorted(tiles, key=lambda k: (family(k), k)):
        t = tiles[n]
        s = t["sockets"]["0"]
        w("| %s | %s | %s | %s |"
          % (short(n), t.get("role", ""), t.get("band", ""),
             " | ".join("`%s`" % s[e] for e in EDGE_ORDER)))
    w("")

    # ---- corners -----------------------------------------------------------
    # A corner is what a tile promises on two edges that meet. Rotation makes the
    # four corners equivalent, so one table covers all of them: collect the pairs
    # any piece can express on (X+, Y+) over every rotation.
    have = collections.defaultdict(set)
    for n, t in tiles.items():
        for r in rots:
            s = t["sockets"][r]
            for a, b in CORNERS:
                have[(s[a], s[b])].add(short(n))
    vocab = sorted(supply)
    w("## Corners")
    w("")
    w("Two edges that MEET. A cell whose X+ neighbour demands `a` and whose Y+ "
      "neighbour demands `b` needs a piece presenting that pair; if none exists "
      "the cell is unsatisfiable and the solver backtracks. Read down for the "
      "first edge, across for the next one clockwise.")
    w("")
    w("| |%s" % "".join(" `%s` |" % v for v in vocab))
    w("|---|%s" % ("---|" * len(vocab)))
    for a in vocab:
        cells = []
        for b in vocab:
            if have[(a, b)]:
                cells.append("%d" % len(have[(a, b)]))
            elif not compatible(a, b):
                cells.append("—")
            else:
                cells.append("**·**")
        w("| `%s` |%s" % (a, "".join(" %s |" % c for c in cells)))
    w("")
    w("`—` = the band contract forbids it: no single tile is at both those "
      "heights without a level change declared between them. That blank is the "
      "design working. `·` = the contract allows it and **no piece exists** — "
      "a shape this set cannot make.")
    w("")

    gaps = [(a, b) for a in vocab for b in vocab
            if not have[(a, b)] and compatible(a, b)]
    ranked = sorted(gaps, key=lambda ab: -(supply[ab[0]] * supply[ab[1]]))
    w("### Missing corners — shapes the set cannot make")
    w("")
    w("%d of %d socket pairs are allowed by the band contract but have no piece."
      % (len(gaps), sum(1 for a in vocab for b in vocab if compatible(a, b))))
    w("")
    if not ranked:
        w("None: every corner the contract allows can be built.")
    else:
        w("| first edge | next edge | the shape that is missing |")
        w("|---|---|---|")
        for a, b in ranked:
            plain = {"G0+P": "G0", "G1+P": "G1", "W+P": "W"}
            xs = [s for s in (a, b) if s.startswith("X")]
            if a == b and "+P" in a:
                note = ("a track turning a corner on %s"
                        % MEANING[plain[a]].split(",")[0])
            elif a == b:
                note = "a run of `%s` that turns a corner" % a
            elif len(xs) == 2:
                note = ("two DIFFERENT level changes meeting — %s against %s, "
                        "which is a cliff running down into a shore"
                        % (a, b))
            elif xs:
                other = b if a in xs else a
                note = ("a %s level change with %s alongside it"
                        % (xs[0], MEANING.get(other, other)))
            else:
                note = "%s meeting %s" % (MEANING.get(a, a), MEANING.get(b, b))
            w("| `%s` | `%s` | %s |" % (a, b, note))
    if "W+B" in supply:
        w("**A CROSSING OVER SOMETHING HAS ITS OWN SOCKET NOW, and it is `W+B`.** "
          "A ford works because it is water the whole way across: its arms are "
          "`W+P` and the bank pieces meet them. A BRIDGE is not that -- the road is "
          "at ground level with water underneath -- and built as a track it "
          "disagreed with every track it touched by 0.95 units, exactly BED_Z, "
          "because the height field at the road edge is the riverbed and the deck "
          "is separate geometry the seam check rightly cannot see. `W+B` says the "
          "ground here is bed and something is CARRIED over it, so both sides of "
          "every seam agree about the ground and the deck is a promise they also "
          "both keep. It cost two pieces, not the three guessed at here: the far "
          "bank is the near bank at r180. What it still cannot make is a bridge "
          "that TURNS -- `W+B` against `W+B` round a corner -- and a bridge "
          "alongside a sea cliff; both are in the table above.")
    else:
        w("**A CROSSING OVER SOMETHING NEEDS ITS OWN SOCKET, and this set has "
          "none.** A ford works because it is water the whole way across: its arms "
          "are `W+P` and the bank pieces meet them. A BRIDGE is not that -- the "
          "road is at ground level with water underneath -- and a tile with water "
          "on two edges and road on the other two is a saddle whose edges can match "
          "neither a mere nor a track. What would work is a `W+B` socket: water, "
          "with a deck over it, presented by the span and by the bank approach.")
    w("")
    if any(rises(a) and rises(b) and base(a) != base(b) for a, b in ranked):
        w("")
        w("**Why the level-change corners are hard, from an attempt that failed.** "
          "A piece is only interchangeable with the family it abuts if its "
          "cross-section along that edge IS that family's -- a strand's beach on "
          "the `Xw0` edge, a bluff's cliff on the `Xw1` one. The headland manages "
          "both because the cliff's progress is CONSTANT along each of its "
          "crossing edges (0 on the shore edge, 1 on the cliff edge), so the "
          "composition collapses exactly to one family or the other. A piece "
          "whose two crossings sit on edges where that progress VARIES cannot do "
          "this: a `cove` built that way -- water in a corner, beach one side, "
          "sea cliff the other -- closed these last two corners and then "
          "disagreed with every bluff by 0.394 units, sixteen texels, along the "
          "seam they share. Closing them needs a construction where each "
          "crossing edge still sees a constant cliff progress, not another "
          "blend.")
    w("")

    # ---- spans -------------------------------------------------------------
    span = collections.defaultdict(set)
    for n, t in tiles.items():
        for r in rots:
            s = t["sockets"][r]
            for e in ("X+", "Y+"):
                span[(s[e], s[OPPOSITE[e]])].add(short(n))
    w("## Spans")
    w("")
    w("Two edges that FACE each other. This is what a piece crossed by something "
      "has to get right: a track entering one side has to leave the other, and a "
      "level change has to arrive somewhere.")
    w("")
    w("| |%s" % "".join(" `%s` |" % v for v in vocab))
    w("|---|%s" % ("---|" * len(vocab)))
    for a in vocab:
        cells = []
        for b in vocab:
            if span[(a, b)]:
                cells.append("%d" % len(span[(a, b)]))
            elif not compatible(a, b):
                cells.append("—")
            else:
                cells.append("**·**")
        w("| `%s` |%s" % (a, "".join(" %s |" % c for c in cells)))
    w("")
    sgaps = [(a, b) for a in vocab for b in vocab
             if not span[(a, b)] and compatible(a, b)]
    if sgaps:
        w("Missing spans — a piece cannot carry these two facing each other:")
        w("")
        for a, b in sorted(set(tuple(sorted(p)) for p in sgaps)):
            extra = ""
            if a == b and "+P" in a:
                extra = ("  <- a track cannot CONTINUE across this ground: "
                         "whatever climbs onto it has nothing to carry on with")
            elif a == b:
                extra = "  <- a straight run of `%s` is impossible" % a
            w("- `%s` <-> `%s`%s" % (a, b, extra))
        w("")

    # ---- closure -----------------------------------------------------------
    # A socket only works if it can be MET: presentable on both sides of an edge.
    w("## Closure")
    w("")
    dead = []
    for v in vocab:
        per = []
        for e in EDGE_ORDER:
            per.append(sum(1 for n, t in tiles.items() for r in rots
                           if t["sockets"][r][e] == v))
        if min(per) == 0:
            dead.append(v)
    if dead:
        w("**Broken:** %s cannot be presented on every edge, so a tile offering "
          "one can never be matched. This is a hard bug, not a shortage."
          % ", ".join("`%s`" % v for v in dead))
    else:
        w("Every socket can be presented on every edge, so nothing offers a "
          "connection that cannot be taken. The set is closed; what it lacks is "
          "shapes, listed under Corners above.")
    w("")

    text = "\n".join(L) + "\n"
    if out:
        with open(out, "w", encoding="utf-8") as fh:
            fh.write(text)
        print("WROTE", out, "(%d lines)" % len(L))
        print("missing corners:", len(gaps), "of", len(vocab) ** 2)
    else:
        print(text)


if __name__ == "__main__":
    main()
