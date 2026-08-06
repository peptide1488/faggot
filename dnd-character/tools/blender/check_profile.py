"""What SHAPE is each level change, in world units?

    blender -b -P check_profile.py -- [--theme grass10A]

check_seams.py asks whether two tiles AGREE at the edge they share. This asks the
other question: whether the cross-section between those edges is the shape it is
supposed to be. Both tiles can agree perfectly on a shore that is really a cliff.

That is not hypothetical. The shore used the cliff's run-out for its whole life --
one SCARP_W for every band pair -- so it dropped 0.95 units over 0.37-1.18 world
units, and 78% of that drop is below the water surface. What was left above water
was 0.08-0.25 units of beach: nine to twenty-eight pixels. Land ended and water
began over a near-vertical face, every pond read as a hole cut in the map, and no
test noticed, because every seam matched and every tile rendered correctly alone.

Prints, per band pair: the heights it spans, its steepest gradient, its steepest
gradient ABOVE THE WATER LINE (what is below is neither visible nor walkable), and
how wide a dry ledge it leaves. 1.00 is 45 degrees; the runtime will not let an
actor stand on ground steeper than STAND_SLOPE (0.95 in tiles_demo.html).
"""

import importlib.util
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location("bt", os.path.join(HERE, "build_tiles.py"))
bt = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(bt)

SAMPLES = 400


def profile(lo, hi, side="Y+", seed=7):
    """Walk straight across a transition of this band pair, perpendicular to
    `side`, and return [(t, z)] in world units along the crossing."""
    run, shelf = bt._shelf(lo, hi)
    f = bt.field_step(seed, [side], bt._band_z(lo), bt._band_z(hi),
                      run=run, shelf=shelf)
    return [(v * bt.SIZE, f(0.5, v)[0]) for v in
            (i / float(SAMPLES) for i in range(SAMPLES + 1))], run, shelf


def report(name, lo, hi):
    prof, run, shelf = profile(lo, hi)
    zs = [z for _, z in prof]
    steep = dry_steep = 0.0
    for i in range(1, len(prof)):
        dz = abs(prof[i][1] - prof[i - 1][1])
        dt = prof[i][0] - prof[i - 1][0]
        g = dz / dt
        steep = max(steep, g)
        # Only count it against the piece if it is out of the water: a shore is
        # ALLOWED to plunge once it is under, and judging the whole profile is
        # what made a beach look like the same problem as a cliff.
        if min(prof[i][1], prof[i - 1][1]) > bt.WATER_LEVEL:
            dry_steep = max(dry_steep, g)
    top = bt._band_z(hi)
    # A LEDGE ONLY MEANS SOMETHING WHERE THERE IS A WATER LINE. For a dry pair the
    # test "above the water and below the top" is true of the entire approach to
    # the cliff, so it reported the whole tile as ledge and two thirds of a sheer
    # scarp as standable -- a number that is not wrong so much as about nothing.
    # ...and INTENT comes from the same table the geometry does. A bluff is wet on
    # its low side and is still supposed to plunge -- it is a sea cliff. What says
    # "this one should shelve" is SHELF giving it a wider run than a cliff, so read
    # the intent there rather than inferring it from the bands and calling a sea
    # cliff a failed beach.
    wet = lo == -1 and (run > 1.0 or shelf > 1.0)
    ledge = [t for t, z in prof if bt.WATER_LEVEL < z < top - 0.02] if wet else []
    width = (max(ledge) - min(ledge)) if ledge else 0.0

    # AND THE NUMBER THAT ACTUALLY DECIDES ANYTHING. `dry` above is a maximum over
    # 400 samples, so it reports the single steepest sliver of the profile; the
    # runtime asks a coarser question -- slopeUnder() takes a +/-0.5 world-unit
    # central difference at a square's centre -- and never sees a spike that
    # narrow. Judging the shore by the fine number says a beach is unwalkable when
    # every square on it is standable, which is an invitation to go and re-bake
    # something that was already right.
    stand = None
    if wet:
        f2 = bt.field_step(7, ["Y+"], bt._band_z(lo), bt._band_z(hi),
                           run=run, shelf=shelf)
        zf = lambda t: f2(0.5, t / bt.SIZE)[0]
        ok = tot = 0
        for i in range(1, int(bt.SIZE / 0.05)):
            t = i * 0.05
            if not (bt.WATER_LEVEL < zf(t) < top - 0.02):
                continue
            tot += 1
            ok += abs(zf(t + 0.5) - zf(t - 0.5)) <= 0.95
        stand = (100 * ok // tot) if tot else 0

    # INTENT vs OUTCOME, kept apart. `wet` above says this pair was ASKED to
    # shelve, by having a run or a curve a cliff would not have. Reporting a bare
    # "-" for everything else could not tell "no beach intended" from "the beach
    # failed to form", so a new wet family that quietly came out vertical would
    # have read exactly like the sea cliff that is supposed to be.
    if not wet and lo == -1:
        shape = "%4s" % "n/a"
        note = "wet, and asked to stay a cliff (run x1.0) -- a sea cliff"
    elif not wet:
        shape = "%4s" % "n/a"
        note = "dry: a cliff, as intended"
    elif stand >= 95:
        shape, note = "%3d%%" % stand, "asked to shelve, and does"
    else:
        shape, note = "%3d%%" % stand, "ASKED TO SHELVE AND DOES NOT" 
    print("%-9s %+5.2f -> %+5.2f  run x%.1f shelf %.1f | steepest %6.2f  "
          "dry %5.2f  ledge %4.2f  standable %s  %s"
          % (name, bt._band_z(lo), bt._band_z(hi), run, shelf,
             steep, dry_steep, width, shape, note))


def main():
    argv = sys.argv
    args = argv[argv.index("--") + 1:] if "--" in argv else []
    if "--theme" in args:
        bt.THEME = args[args.index("--theme") + 1]
    print("theme %s | WATER_LEVEL %+.2f  BED_Z %+.2f  STEP %+.2f  SCARP_W %.3f"
          % (bt.THEME, bt.WATER_LEVEL, bt.BED_Z, bt.STEP, bt.SCARP_W))
    print("tile is %.0f world units across; 1.00 gradient is 45 degrees\n"
          % bt.SIZE)
    # DRIVEN BY THE SHELF TABLE, not by a list written out here. A band pair that
    # someone adds to build_tiles.py is a new cross-section, and a checker that
    # has to be told about it separately is one that silently stops covering the
    # newest thing in the set -- which is always the thing most likely to be wrong.
    NAMES = {(0, 1): "scarp", (-1, 0): "strand", (-1, 1): "bluff"}
    for (lo, hi) in sorted(bt.SHELF):
        report(NAMES.get((lo, hi), "band %+d%+d" % (lo, hi)), lo, hi)
    print()
    print("A cliff SHOULD be a cliff. It is the shore that has to be gentle above")
    print("the water line, because that is the only part of it anyone stands on.")


if __name__ == "__main__":
    main()
