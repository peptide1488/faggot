"""
Side-by-side bench for tile MATERIAL work.

    blender -b -P art_bench.py -- <outdir> [tile_r rot ...]

Renders the same tiles through build_tiles.py's own geometry, swapping only the
stone material, so a change to the look can be judged against the current art
instead of against memory. Albedo only -- the normal and height passes do not
depend on base colour, so baking them here would just triple the wait.

WHY THE ALBEDO CARRIES THE ART. The runtime lights these tiles with moving
coloured torches, so the bake deliberately has no key light: a white world, no
direction, which makes the albedo an ambient-occlusion render. Everything that
reads as "old stone" rather than "grey concrete" therefore has to live in the
base colour -- grime settled in the crevices, wear on the exposed edges, damp
at the waterline. None of it can come from lighting, because lighting is the
runtime's job.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy                                                    # noqa: E402
import build_tiles as B                                       # noqa: E402


# ---------------------------------------------------------------- bench
#
# The material lives in build_tiles.py -- this file used to carry a second copy
# to A/B against, which immediately rotted when _stone_detail grew an output.
# The honest comparison is against the tiles ALREADY ON DISK from the last bake,
# so the bench renders the current look and nothing else.


def render_albedo_only(outdir, stem):
    B.render_to(os.path.join(outdir, stem + ".png"))


def main():
    argv = sys.argv
    args = argv[argv.index("--") + 1:] if "--" in argv else []
    outdir = os.path.abspath(args[0]) if args else os.path.abspath("bench")
    pairs = args[1:] or ["wall", "0", "floor", "0", "stairs", "0"]
    os.makedirs(outdir, exist_ok=True)
    B.render_pair = lambda od, stem: render_albedo_only(od, stem)
    for k in range(0, len(pairs), 2):
        tile, rot = pairs[k], int(pairs[k + 1])
        B.build_and_render(tile, B.TILES[tile], rot, outdir)
        src = os.path.join(outdir, "%s_r%d.png" % (tile, rot))
        dst = os.path.join(outdir, "%s__new.png" % tile)
        if os.path.exists(dst):
            os.remove(dst)
        os.replace(src, dst)
        print("BENCH", dst)
    print("DONE ->", outdir)


if __name__ == "__main__":
    main()
