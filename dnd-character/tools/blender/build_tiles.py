"""
Procedural isometric dungeon tile renderer.

    blender -b -P build_tiles.py -- <outdir> [--theme NAME] [tile ...]

Renders into <outdir>/<theme>/, one directory per named look (see THEMES).
Baking a set never overwrites another one.

WHY THIS EXISTS
The pre-rendered tiles this replaces were fine as art but left one thing
unsolved: normal maps. Estimating normals from a finished image (StableNormal,
DSINE, Marigold, or just asking the generator) produces something that looks
plausible in a still and lies under a moving light. Modelling the tile in 3D
makes the normal exact by construction -- it IS the surface normal, not an
inference from shading.

    normals            emitted from the real geometry, not estimated
    tiling             the floor plane's edge is the lattice cell, by definition
    rotations          rotate-and-rerender, so wall height cannot drift
    relighting         world-space normals + AO-only albedo, so runtime lights
                       are free to move without fighting a baked key light

(An earlier version of this file blamed a "thick slab curb at every join" and a
"219px ragged edge" in the previous art. Both were measurement errors of my own
-- the ridges were the walls of a duplicated tile and the edge fit sampled
across a corner. The art was never the problem. Kept here because the correct
reason to be in Blender is the paragraph above, not a defect that didn't exist.)

PROJECTION -- 2:1 diamond, 30 deg elevation, 45 deg yaw.
Deliberately NOT Blender's "true isometric" (35.264 deg), whose height:width
ratio sin(35.264)=0.577 is irrational and accumulates sub-pixel drift across a
large map. 2:1 gives exactly W x W/2 per tile -- an integer lattice.

    tile diamond    800 x 400 px      lattice step  R=(+400,+200) L=(-400,+200)
    anchor          image centre      painter order -(i+j)

PIXELS PER UNIT IS THE INVARIANT, not the padding factor. Walls need a taller
canvas than floors; RES changes and ortho_scale = RES/PPU follows, so the tile
occupies the same 800px and the lattice never moves.

OUTPUT per tile, per rotation:
    <name>_r<rot>.png       albedo   (RGBA, straight alpha, Standard view)
    <name>_r<rot>_NRM.png   normals  (world space, n*0.5+0.5, Raw view)
    <name>_r<rot>_H.png     height   (world Z / HEIGHT_MAX, Raw view) -- the Z test

BLENDER 5.2 NOTES (verified live -- do not "fix" these back)
  * scene.node_tree is gone; it is scene.compositing_node_group, and the
    compositor was rewritten: CompositorNodeComposite / MixRGB / VecMath no
    longer exist and OutputFile has no file_slots. Hence the normal pass is done
    with a SHADER (emission of the geometry normal) and a second render, which
    is stable API and makes the encoding convention explicit anyway.
  * Default view_transform is AgX. It must be Standard for albedo and Raw for
    normals; AgX silently tone-maps a normal map into garbage.
  * Cycles works even though RenderSettings.engine's RNA enum lists only EEVEE.
  * Do NOT call read_factory_settings() when driving Blender over the MCP addon:
    it reloads addons and kills the socket. This script clears the scene by
    removing objects instead, so it is safe in both headless and live sessions.
"""

import bpy
import json
import math
import os
import random
import sys
import zlib
from mathutils import Vector

# ---------------------------------------------------------------- parameters

CELLS, CELL = 4, 1.0            # floor squares per tile edge; 1 cell = one 5ft square
SIZE = CELLS * CELL
HALF = SIZE / 2.0

TILE_W_PX = 640.0               # tile diamond width -- defines the lattice
PPU = TILE_W_PX / (SIZE * math.sqrt(2.0))   # pixels per blender unit (invariant)
RES = 1024                      # canvas floor; res_for_scene() grows it per tile
BLEED_PX = 1.0                  # floor plane overshoot per side, kills seam pinpricks
                                # (per-theme override: THEMES[x]["bleed"]) -- see _bh

GROUT, RISE = 0.09, 0.07        # flagstone joint width / relief height
WALL_H, WALL_T = 2.4, 0.35
QUOIN_PROUD = 0.03      # how far an end block stands out of the wall face
SLAB_INSET = 0.07       # backing slab held back from a run's ends AND its head:
                        # anywhere it outruns the brick it is an enclosed face
COURSE, BRICK, JOINT = 0.30, 0.78, 0.045

ELEVATION, YAW = 30.0, 45.0
SAMPLES = 64
SEED = 7

CAM_DIST = 30.0                 # ortho: only affects clipping; runtime depth uses it
HEIGHT_MAX = 4.0                # kept for reference; encoding now uses OFF/RANGE
# World Z is encoded as (z + HEIGHT_OFF)/HEIGHT_RANGE so it can carry NEGATIVE
# heights. A chasm floor at -3.4 clamped to 0 under the old z/HEIGHT_MAX scheme,
# which made the depth test treat the bottom of a pit as ground level.
HEIGHT_OFF, HEIGHT_RANGE = 4.0, 8.0     # -4..+4 world units, ~0.031 per 8-bit step

# Grain control. BUMP 1.0 with 38-scale noise made every surface sparkle: the
# normals changed direction every texel, so the lighting hunted pixel to pixel.
# Softer relief at a coarser scale reads as stone without the fizz.
NOISE_SCALE, NOISE_FINE = 5.0, 16.0    # stone mottling / grain, in world units
BUMP = 0.35                            # surface relief; feeds albedo AND _NRM

# ---------------------------------------------------------------- themes
#
# A THEME is a named look for the whole tile set, baked into its own directory:
#
#     out/stone/floor_r0.png      out/sandstone/floor_r0.png    ...
#
# Sets are ADDED, never overwritten -- "jungle" must not cost us "castle". The
# runtime picks a directory, so a map can change its whole material identity
# without a single change to geometry, lattice or lighting.
#
# PALETTE IS THE LEVER, and the reason is specific to this pipeline: the albedo
# is rendered against a white world with no key light (see add_lighting), so
# whatever base colour goes in comes back at close to full brightness. The
# original 0.62 neutral grey therefore baked to near-white, and a torch-lit pool
# and an unlit floor ended up the same paper colour -- the runtime lights had no
# headroom to work in. Darker base colours are what give them somewhere to go.
#
# What a theme CANNOT yet change is geometry: a jungle wants vines and roots, a
# cave wants irregular rock instead of running-bond brick. That is new modelling,
# not new colour, and it belongs in the per-kind builders above.
# ---------------------------------------------------------------------------
# SETS AND ROLES
#
# A set owns its own tile NAMES. `grassland` has a scarp and a brook, `hell` will
# have an obsidian spire, and neither is obliged to call itself "wall" because a
# dungeon got here first. Dozens of sets is the target, so nothing may be keyed by
# name outside the set that declares it.
#
# What the generator is allowed to know instead is a tile's ROLE, plus the edges it
# blocks. Those two facts are the entire contract between a set and the solver:
#
#   ground        walkable open surface; `edges` lists the sides it blocks
#   barrier       impassable, and it is what `edges` says it is
#   opening       a way through a barrier (door, gate, arch, gap in a hedge)
#   liquid        not walkable, fills the tile; `rims` are the sides that wall off
#   span          a crossing over a liquid or a drop
#   span_flank    the piece that closes the gap beside a span's landing
#   drop          a chasm; same shape as liquid, different consequence
#   stair         joins two elevations
#   high_ground   the same vocabulary one STEP up
#   upper         a second surface ABOVE another tile (bridge decks, galleries)
#
# A set that has no stairs simply declares none, and the generator stops offering
# elevation for it -- which is how a flat salt desert and a cliff-riddled highland
# can share one solver.
# ---------------------------------------------------------------------------

THEMES = {
    # the palette the set shipped with: neutral grey, no aging. (Not byte-exact
    # with the old renders -- the per-block tint ramp now runs warm-to-cool
    # rather than dark-to-light for every theme.)
    "stone": dict(stone=(0.62, 0.60, 0.57), mortar=(0.30, 0.29, 0.27),
                  grime=0.0, wear=0.0, damp=0.0),
    # warm, aged, and dark enough to leave the torches somewhere to go
    "sandstone": dict(stone=(0.42, 0.35, 0.27), mortar=(0.24, 0.20, 0.16),
                      grime=1.0, wear=1.0, damp=1.0),

    # OUTDOORS -- the same 43 tile names and the same edge/elevation vocabulary as
    # the dungeon kits, with only the geometry and palette swapped underneath. That
    # is the whole design: `wall` becomes a cliff, `floor` becomes turf, `water`
    # becomes a river, `_up` becomes high ground, and the WFC generator, the edge
    # contract and the demo need no changes at all to use it.
    "grass10A": dict(kit="outdoor", label="Highland Meadow",
                     stone=(0.105, 0.215, 0.065),  # sward -- the tile's ground surface
                     mortar=(0.115, 0.075, 0.045),  # subsoil, where the ground is cut
                     mud=(0.28, 0.19, 0.10),     # a worn track, a wallow
                     rock=(0.30, 0.20, 0.125),   # WARM brown, not grey limestone. Kept
                                                 # dark: baked albedo is what the
                                                 # runtime torches multiply, so a light
                                                 # rock has nowhere to go when it is lit
                     blade=(0.17, 0.36, 0.09),   # the lighter grass that catches the eye
                     moss=(0.20, 0.38, 0.09),    # low cover, and what caps a boulder
                     flower=(0.72, 0.70, 0.44),
                     water=(0.075, 0.235, 0.275),
                     posterize=7,               # flat value steps, no gradients
                     pixel=4,                   # render at 1/4 and nearest-upscale
                     bleed=7,                   # 2 render px of overshoot: enough to
                                                # bury the AO-bright rim (see _bh)
                     grime=0.55, wear=0.65, damp=0.5),
}


# ---------------------------------------------------------------------------
# TILE NAMES ARE IDENTITY; ROLE IS METADATA.
#
# A name says WHICH PIECE OF WHICH ZONE this is and nothing else:
#
#       grass10A-scarp-0210
#       |        |     |
#       |        |     +--  serial: variant within the piece, room to grow
#       |        +--------  piece:  what the set calls this thing
#       +-----------------  set id: zone slug + act number + variant letter
#
# Two zones can both have a cliff and never collide, a file on disk says where it
# belongs without a directory to tell you, and the generator still doesn't care --
# it reads `role` from the manifest. Serials are spaced so a variant can be slotted
# between two existing pieces without renumbering anything downstream.
# ---------------------------------------------------------------------------

def outdoor_tiles(sid):
    """The highland vocabulary, named for the zone that owns it.

    BANDS AND TRANSITIONS, NOT ONE-OFF PIECES. Cliff, shore and sea cliff are the
    same problem three times -- ground at one height meeting ground at another -- so
    they are one parameterised family with the band pair as its argument. That is
    what makes the corner and ramp variants free, and it is why a third band later
    costs a table entry rather than a rewrite.

    Every piece presents a SOCKET on each of its four edges, and the solver may abut
    two tiles only where the facing sockets agree:

        G0 / G1   walkable ground, low band / high band
        W         open water
        P0        a track crossing this edge (always at the exact midpoint)
        X01       a 0-to-1 level change crossing this edge   (cliff)
        Xw0       a water-to-0 level change crossing          (shore)
        Xw1       a water-to-1 level change crossing          (sea cliff)

    Straight, inside corner and outside corner each present their transition socket
    on exactly TWO edges, which is what lets them chain into a closed loop around a
    plateau or an island. The ramp presents the same sockets as a straight scarp, so
    a way up can go anywhere a cliff runs with no adjacency rule of its own."""
    T = {}

    def add(piece, serial, **spec):
        T["%s-%s-%04d" % (sid, piece, serial)] = spec

    # ---- open ground. Four cuts of the same meadow rather than one tile repeated:
    # the field is seeded from the NAME, so these differ from each other and each is
    # still identical to itself at every rotation.
    for n in range(4):
        add("turf", 100 + n, terrain="flat", band=0)
    # Four cuts of high ground as well as low. A plateau is usually several tiles
    # across, so two variants read as a chequerboard at exactly the size the eye
    # notices.
    for n in range(4):
        add("turf", 110 + n, terrain="flat", band=1)
    # ---- open water. Rippled bed under a flat surface plane.
    add("mere", 180, terrain="flat", band=-1, ripple=0.05, water=True)
    add("mere", 181, terrain="flat", band=-1, ripple=0.05, water=True)

    # ---- the transition family, once per band pair
    for piece, lo, hi, base_n, water in (("scarp", 0, 1, 200, False),
                                         ("strand", -1, 0, 300, True),
                                         ("bluff", -1, 1, 400, True)):
        common = dict(terrain="step", lo=lo, hi=hi, water=water)
        add(piece, base_n, high=["Y+"], **common)                   # straight
        add(piece, base_n + 10, high=["Y+", "X+"], join="max", **common)   # inside
        add(piece, base_n + 20, high=["Y+", "X+"], join="min", **common)   # outside
    # a way up, and a place to wade. Same sockets as the straight piece above it, so
    # either can stand anywhere the other can.
    add("ramp", 230, terrain="step", lo=0, hi=1, high=["Y+"], channel=0.38)
    add("shoal", 330, terrain="step", lo=-1, hi=0, high=["Y+"], channel=0.42,
        water=True)

    # ---- tracks. Five junctions out of one function; see _arms.
    add("track", 500, terrain="track", arms=["Y+", "Y-"])            # straight
    add("track", 510, terrain="track", arms=["Y+", "X+"])            # bend
    add("track", 520, terrain="track", arms=["Y+", "Y-", "X+"])      # tee
    add("track", 530, terrain="track", arms=["Y+", "Y-", "X+", "X-"])  # crossroads
    add("track", 540, terrain="track", arms=["Y+"])                  # dead end
    add("track", 550, terrain="track", arms=["Y+", "Y-"], high=["Y+"],
        lo=0, hi=1)                                                  # climbing
    add("ford", 560, terrain="track", arms=["Y+", "Y-"], high=["Y+"],
        lo=-1, hi=0, water=True)                                     # through water

    # ---- wet ground
    add("mire", 600, terrain="mire", water=True)
    add("mire", 601, terrain="mire", water=True)
    return T

# Sets that own a bespoke vocabulary register a BUILDER here; anything absent falls
# back to the shared dungeon table, which is how `stone` and `sandstone` keep the
# names they were already baked and packed under. Built on demand rather than at
# import: these tables are written in terms of STEP, which is defined further down.
SET_TILE_BUILDERS = {"grass10A": outdoor_tiles}
_set_tiles = {}
THEME = "sandstone"                    # overridden by --theme on the CLI

# Outdoor kit constants.
TURF_RELIEF = 0.085     # ground undulation. The BORDER RING stays pinned to the
                        # tile's base height whatever this is -- see add_turf.
TURF_GRID = 20          # ground mesh resolution across the tile
TUFTS = 34              # grass clumps scattered per tile
STRATA = 3              # rock layers stacked up a cliff face

GRIME_RGB = (0.20, 0.21, 0.16)         # what settles in a crevice: dark, green
WEAR_RGB = (0.86, 0.84, 0.79)          # freshly chipped stone on an exposed edge
STAIN_RGB = (0.17, 0.16, 0.12)         # damp rising up the foot of a wall
PATCH_SCALE = 0.55                     # region-scale colour drift, in world units
STAIN_H = 1.35                         # how far the stain climbs a wall
WEAR_AMT = 0.85                        # exposed-edge lightening
PATCH_AMT = 0.42                       # how far regions drift from each other
CELL_SCALE = 26.0                      # stone GRAIN size. Chosen by rendering
                                       # 9 / 16 / 26 side by side: coarse grain
                                       # reads as crazy paving competing with the
                                       # flagstones, fine grain reads as material
VEIN_WIDTH = 0.34                      # how wide a grain boundary reads
VEIN_DEPTH = 0.28                      # how deep a vein cuts into the height
CELL_AMT = 0.14                        # shade difference between grains
SPECK_AMT = 0.16                       # mineral glint


def theme():
    return THEMES[THEME]


def _bh():
    """Half-width of the ground mesh, in world units, including the overshoot.

    THE OVERSHOOT IS NOT COSMETIC. Ambient occlusion has nothing to occlude it at
    the boundary of a mesh, so the outermost ring of every tile bakes BRIGHTER than
    its interior -- measured at luma 147 against 101 -- and posterising snaps that
    into a band of its own. Abutted on the lattice that is a pale line around every
    tile, which is exactly the seam grid you see across a finished map.

    The fix is geometric, not cosmetic: overshoot far enough that the bright ring
    lands OUTSIDE the lattice cell, where the neighbouring tile paints over it.
    A pixel set needs more overshoot than a smooth one, because its outermost
    RENDERED pixel is `pixel` output pixels wide -- one px of bleed does not cover
    a four-px rim."""
    return HALF * (TILE_W_PX + 2.0 * theme().get("bleed", BLEED_PX)) / TILE_W_PX


def kit():
    """Which GEOMETRY vocabulary this theme builds with.

    A theme used to be a palette only. `meadow` needs different shapes as well as
    different colours -- turf instead of flagstones, a cliff instead of coursed
    masonry -- so the geometry primitives dispatch on this. Everything a theme does
    NOT override (pits, water, stairs, bridges, the elevation vocabulary) is shared
    between kits, which is why an outdoor set costs two new primitives rather than
    a second tile table."""
    return theme().get("kit", "dungeon")

STEP = 1.8        # height of the raised level (1 unit = one 5ft square)
RISER = 0.17      # target step height; step COUNT is derived from it, so a
                  # stair keeps human proportions whatever it has to climb
PIT = 3.4         # chasm depth -- deep enough to read as a drop, not a step down
BRIDGE_W = 1.6    # width of a walkway spanning a chasm
WATER_Z = -0.42   # water surface, just below the floor line
OVER_Z = 2.8      # upper-layer floor height. Must clear the character (1.58) with
                  # headroom, or "walk under" is only true on paper.
OVER_T = 0.28     # thickness of the upper slab
PILLAR = 0.34     # pillar side

# ELEVATION VOCABULARY.
# Every tile is ONE surface at varying height -- which is exactly what the
# runtime height buffer stores, so all of this needs no renderer change. What it
# cannot express is a floor ABOVE another floor (a height buffer holds one
# surface per pixel), so "rooms on top of rooms" needs layered buffers, not this.
#
#   base    floor height for this tile
#   kind    None      plain floor at `base`, plus a plinth if raised
#           stairs    stepped rise from `base` to base+STEP toward Y+
#           pit       floor dropped to -PIT, rim walls down from 0
#           bridge    a pit with a walkway across it at ground level
TILES = {
    "floor":        dict(edges=[], base=0.0),
    "wall":         dict(edges=["Y+"], base=0.0),
    "corner":       dict(edges=["Y+", "X+"], base=0.0),
    "corridor":     dict(edges=["Y+", "Y-"], base=0.0),
    "deadend":      dict(edges=["Y+", "X+", "X-"], base=0.0),

    "floor_up":     dict(edges=[], base=STEP),
    "wall_up":      dict(edges=["Y+"], base=STEP),
    "corner_up":    dict(edges=["Y+", "X+"], base=STEP),
    "corridor_up":  dict(edges=["Y+", "Y-"], base=STEP),
    "deadend_up":   dict(edges=["Y+", "X+", "X-"], base=STEP),

    "bridge_s0":       dict(edges=[], base=0.0, kind="bridge", rims=[]),
    "water_bridge_s0": dict(edges=[], base=0.0, kind="water_bridge", rims=[]),
    "bridge_s1":       dict(edges=[], base=0.0, kind="bridge", rims=['X+']),
    "water_bridge_s1": dict(edges=[], base=0.0, kind="water_bridge", rims=['X+']),
    "bridge_s2":       dict(edges=[], base=0.0, kind="bridge", rims=['X-']),
    "water_bridge_s2": dict(edges=[], base=0.0, kind="water_bridge", rims=['X-']),
    "bridge_s3":       dict(edges=[], base=0.0, kind="bridge", rims=['X+', 'X-']),
    "water_bridge_s3": dict(edges=[], base=0.0, kind="water_bridge", rims=['X+', 'X-']),
    "bridge_flank":    dict(edges=[], base=0.0, kind="bridge_flank"),
    "water_flank":     dict(edges=[], base=0.0, kind="water_flank"),
    "debug_edges":     dict(edges=[], base=0.0, kind="debug_edges"),
    "arch":         dict(edges=[], base=0.0, kind="arch"),
    "door":         dict(edges=[], base=0.0, kind="door"),

    # A doorway is only ever punched through an edge that WAS a wall, so the
    # tile it lands on normally still carries the rest of its run: a room corner
    # keeps one perpendicular wall, a one-tile-wide room keeps both. The bare
    # `arch`/`door` above draw an opening with nothing either side, which is why
    # the generator could only dress an opening on a tile with no other walls
    # and had to leave every other doorway as a plain gap. These are the same
    # opening plus its flanking masonry -- the arch/wall variant pair is exactly
    # the stairs/stairs_wall pattern, one step further.
    #
    # BOTH CHIRALITIES ARE REAL TILES. Rotation turns the opening and its walls
    # together, so an opening on Y+ with a wall on X+ can never be rotated into
    # one with a wall on X-; that is a reflection, and reflecting the render
    # would mirror the masonry bond and the lighting with it.
    "arch_l":       dict(edges=["X+"],        base=0.0, kind="arch"),
    "door_l":       dict(edges=["X+"],        base=0.0, kind="door"),
    "arch_r":       dict(edges=["X-"],        base=0.0, kind="arch"),
    "door_r":       dict(edges=["X-"],        base=0.0, kind="door"),
    "arch_wall":    dict(edges=["X+", "X-"],  base=0.0, kind="arch"),
    "door_wall":    dict(edges=["X+", "X-"],  base=0.0, kind="door"),
    "arch_end":     dict(edges=["Y-"],        base=0.0, kind="arch"),
    "door_end":     dict(edges=["Y-"],        base=0.0, kind="door"),
    "arch_nook_l":  dict(edges=["Y-", "X+"],  base=0.0, kind="arch"),
    "door_nook_l":  dict(edges=["Y-", "X+"],  base=0.0, kind="door"),
    "arch_nook_r":  dict(edges=["Y-", "X-"],  base=0.0, kind="arch"),
    "door_nook_r":  dict(edges=["Y-", "X-"],  base=0.0, kind="door"),

    "stairs":       dict(edges=[], base=0.0, kind="stairs"),
    "stairs_wall":  dict(edges=["X+", "X-"], base=0.0, kind="stairs"),

    "pit":   dict(edges=[], base=0.0, kind="pit", rims=[]),
    "water": dict(edges=[], base=0.0, kind="water", rims=[]),
    "pit_e":   dict(edges=[], base=0.0, kind="pit", rims=['Y+']),
    "water_e": dict(edges=[], base=0.0, kind="water", rims=['Y+']),
    "pit_c":   dict(edges=[], base=0.0, kind="pit", rims=['Y+', 'X+']),
    "water_c": dict(edges=[], base=0.0, kind="water", rims=['Y+', 'X+']),
    "pit_o":   dict(edges=[], base=0.0, kind="pit", rims=['Y+', 'Y-']),
    "water_o": dict(edges=[], base=0.0, kind="water", rims=['Y+', 'Y-']),
    "pit_d":   dict(edges=[], base=0.0, kind="pit", rims=['Y+', 'X+', 'X-']),
    "water_d": dict(edges=[], base=0.0, kind="water", rims=['Y+', 'X+', 'X-']),
    "pit_x":   dict(edges=[], base=0.0, kind="pit", rims=['Y+', 'X+', 'Y-', 'X-']),
    "water_x": dict(edges=[], base=0.0, kind="water", rims=['Y+', 'X+', 'Y-', 'X-']),

    # ---- UPPER LAYER -------------------------------------------------------
    # These are the pieces a single height buffer cannot express, because they
    # have floor BOTH above and below: the ground tile stays where it is and the
    # structure sits over it on pillars, with walkable space between. They are
    # composited into a SECOND set of buffers; see tiles_demo.html.
    "over_floor":   dict(edges=[], base=0.0, kind="over_floor"),
    "over_walk":    dict(edges=[], base=0.0, kind="over_walk"),
    "over_walk_n":  dict(edges=[], base=0.0, kind="over_walk_n"),
    "over_wall":    dict(edges=["Y+"], base=OVER_Z, kind="over_wall"),
    "over_stairs":  dict(edges=[], base=0.0, kind="over_stairs"),
    "over_stairs_wall": dict(edges=["X+", "X-"], base=0.0, kind="over_stairs"),
}
ROTATIONS = [0, 90, 180, 270]


# ---------------------------------------------------------------- primitives
# Everything is built with bpy.data + from_pydata. bpy.ops is avoided on
# purpose: context.active_object does not exist when this runs inside the MCP
# addon, and ops-based construction breaks there while this works in both.

def scene():
    return bpy.context.scene


def clear():
    for ob in list(bpy.data.objects):
        bpy.data.objects.remove(ob, do_unlink=True)


def _stone_detail(nt, scale, fine_scale):
    """Shared procedural stone: two octaves of noise driven by WORLD POSITION.

    World position (not UVs) because the tiles are generated meshes with no UV
    layout, and because world-space noise is continuous across the whole tile --
    a wall and the floor beside it read as the same rock.

    Returns (height_socket, random_socket). The height feeds a Bump node in BOTH
    the albedo material and the normal pass; if only the albedo had it, the
    runtime lighting would be flat against visibly bumpy artwork."""
    geo = nt.nodes.new("ShaderNodeNewGeometry")
    coarse = nt.nodes.new("ShaderNodeTexNoise")
    coarse.inputs["Scale"].default_value = scale
    coarse.inputs["Detail"].default_value = 8.0
    coarse.inputs["Roughness"].default_value = 0.62
    nt.links.new(geo.outputs["Position"], coarse.inputs["Vector"])

    fine = nt.nodes.new("ShaderNodeTexNoise")
    fine.inputs["Scale"].default_value = fine_scale
    fine.inputs["Detail"].default_value = 4.0
    nt.links.new(geo.outputs["Position"], fine.inputs["Vector"])

    grain = nt.nodes.new("ShaderNodeMath")
    grain.operation = 'MULTIPLY'
    grain.inputs[1].default_value = 0.18
    nt.links.new(fine.outputs["Fac"], grain.inputs[0])

    height = nt.nodes.new("ShaderNodeMath")
    height.operation = 'ADD'
    nt.links.new(coarse.outputs["Fac"], height.inputs[0])
    nt.links.new(grain.outputs[0], height.inputs[1])

    # A THIRD scale, much larger than a tile. The other two octaves vary the
    # surface WITHIN a block, which is why the set still read as one flat colour
    # from a distance: every block averaged to the same grey. This one varies
    # between whole REGIONS -- one corner of a room damper and darker than the
    # other -- and it is continuous in world space, so the patch runs across
    # tile joins instead of stopping at them.
    patch = nt.nodes.new("ShaderNodeTexNoise")
    patch.inputs["Scale"].default_value = PATCH_SCALE
    patch.inputs["Detail"].default_value = 2.0
    patch.inputs["Roughness"].default_value = 0.5
    nt.links.new(geo.outputs["Position"], patch.inputs["Vector"])

    # ---- the stone's own structure ------------------------------------------
    # Noise alone is fog: it varies everything smoothly and gives the eye no
    # feature to hold, which is why a wall of it reads as poured concrete however
    # many octaves you stack. Real stone has CELLS -- grains with edges -- and a
    # Voronoi is exactly that. Three uses of it, from one cell field:
    #   Color            a different random shade per grain, so the surface is
    #                    made of pieces instead of being one wash
    #   Distance-to-edge veins between the grains: darker in the albedo AND cut
    #                    into the height, so the runtime light catches them
    #   Smooth F1        a finer, softer field for mineral speckle
    cell = nt.nodes.new("ShaderNodeTexVoronoi")
    cell.feature = 'F1'
    cell.inputs["Scale"].default_value = CELL_SCALE
    cell.inputs["Randomness"].default_value = 1.0
    nt.links.new(geo.outputs["Position"], cell.inputs["Vector"])

    vein = nt.nodes.new("ShaderNodeTexVoronoi")
    vein.feature = 'DISTANCE_TO_EDGE'
    vein.inputs["Scale"].default_value = CELL_SCALE
    vein.inputs["Randomness"].default_value = 1.0
    nt.links.new(geo.outputs["Position"], vein.inputs["Vector"])
    # tight ramp: 0 at a grain boundary, 1 a short way inside it
    vramp = nt.nodes.new("ShaderNodeValToRGB")
    vramp.color_ramp.elements[0].position = 0.0
    vramp.color_ramp.elements[1].position = VEIN_WIDTH
    nt.links.new(vein.outputs["Distance"], vramp.inputs["Fac"])

    speck = nt.nodes.new("ShaderNodeTexVoronoi")
    speck.feature = 'SMOOTH_F1'
    speck.inputs["Scale"].default_value = CELL_SCALE * 9.0
    speck.inputs["Smoothness"].default_value = 0.7
    nt.links.new(geo.outputs["Position"], speck.inputs["Vector"])

    # Height = grain, minus the veins. Subtracting is the point: a vein is a
    # groove, and it has to be a groove in the NORMAL pass too or the runtime
    # lights a crack that is not there.
    cut = nt.nodes.new("ShaderNodeMath"); cut.operation = 'MULTIPLY'
    cut.inputs[1].default_value = VEIN_DEPTH
    nt.links.new(vramp.outputs["Color"], cut.inputs[0])
    h2 = nt.nodes.new("ShaderNodeMath"); h2.operation = 'ADD'
    nt.links.new(height.outputs[0], h2.inputs[0])
    nt.links.new(cut.outputs[0], h2.inputs[1])

    info = nt.nodes.new("ShaderNodeObjectInfo")
    return dict(height=h2.outputs[0], rnd=info.outputs["Random"],
                mottle=coarse.outputs["Fac"], patch=patch.outputs["Fac"],
                geo=geo, cell=cell.outputs["Color"], vein=vramp.outputs["Color"],
                speck=speck.outputs["Distance"])


def _break_up(nt, value, mottle, spread=0.55):
    """Multiply `value` by noise CENTRED ON 1.0, not by the noise itself.

    Multiplying an effect by a 0..1 noise looks like variation and is really an
    average halving -- the mean of that noise is 0.5. Both the wall stain and the
    edge wear were wired correctly and still invisible for exactly this reason:
    they were being dialled to half strength by the thing meant to give them
    texture. Centring the modulator keeps the variation and the amplitude."""
    m = nt.nodes.new("ShaderNodeMath"); m.operation = 'MULTIPLY'
    m.inputs[1].default_value = spread * 2.0
    nt.links.new(mottle, m.inputs[0])
    a = nt.nodes.new("ShaderNodeMath"); a.operation = 'ADD'
    a.inputs[1].default_value = 1.0 - spread
    nt.links.new(m.outputs[0], a.inputs[0])
    out = nt.nodes.new("ShaderNodeMath"); out.operation = 'MULTIPLY'
    nt.links.new(value, out.inputs[0])
    nt.links.new(a.outputs[0], out.inputs[1])
    return out.outputs[0]


def mkmat(name, rgb, rough, bump=BUMP, scale=NOISE_SCALE, fine=NOISE_FINE, vary=0.34,
          grime=None, wear=None, damp=None, stain=None):
    """Textured stone. Mottled by noise, tinted per block by ObjectInfo.Random so
    no two bricks are the same shade, bump-mapped for real surface relief, and
    aged by the three things that actually happen to dungeon stone:

    GRIME  ambient occlusion drives a dark green-grey into the cavities. Baked AO
           already darkens them; this TINTS as well, which is what separates dirt
           from shadow -- a shadow moves when the torch does, dirt does not.
    WEAR   Geometry.Pointiness is high on convex edges, so the same value that
           finds a corner finds where a boot or a shoulder has knocked the face
           off a block. Lightened, not darkened: fresh stone under old skin.
    DAMP   world Z, not a texture: everything near the bottom of a wet room is
           darker than everything at head height, and that gradient is what makes
           a basin read as holding water rather than as a grey box.

    All three live in the ALBEDO because they have to: the bake has no key light
    (see add_lighting), so anything that should read as surface history cannot
    come from lighting -- lighting is the runtime's job, and it moves."""
    t = theme()
    grime = t["grime"] if grime is None else grime
    wear = t["wear"] if wear is None else wear
    damp = t["damp"] if damp is None else damp
    stain = t.get("stain", 1.0) if stain is None else stain
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes["Principled BSDF"]
    b.inputs["Roughness"].default_value = rough

    d = _stone_detail(nt, scale, fine)
    height, rnd, mottle, patch, geo = (d['height'], d['rnd'], d['mottle'],
                                      d['patch'], d['geo'])

    dark = tuple(c * (1.0 - vary) for c in rgb)
    light = tuple(min(1.0, c * (1.0 + vary)) for c in rgb)

    mix1 = nt.nodes.new("ShaderNodeMixRGB")          # mottling within a block
    mix1.inputs["Color1"].default_value = (dark[0], dark[1], dark[2], 1.0)
    mix1.inputs["Color2"].default_value = (light[0], light[1], light[2], 1.0)
    nt.links.new(mottle, mix1.inputs["Fac"])

    tint = nt.nodes.new("ShaderNodeMixRGB")          # per-block shade variation
    tint.blend_type = 'MULTIPLY'
    tint.inputs["Fac"].default_value = 1.0
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    # warm at one end, cool at the other. A wall of one grey at eleven
    # brightnesses still reads as one poured slab; warm and cool greys read as
    # blocks quarried at different times.
    ramp.color_ramp.elements[0].color = (0.60, 0.57, 0.54, 1.0)
    ramp.color_ramp.elements[1].color = (1.32, 1.30, 1.26, 1.0)
    nt.links.new(rnd, ramp.inputs["Fac"])
    nt.links.new(mix1.outputs["Color"], tint.inputs["Color1"])
    nt.links.new(ramp.outputs["Color"], tint.inputs["Color2"])
    col = tint.outputs["Color"]

    # ---- per-GRAIN shade, then the veins between the grains -----------------
    # The block tint above varies whole bricks against each other. This varies
    # the stone WITHIN a brick, which is the difference between a surface made
    # of material and a surface made of one colour plus noise.
    gramp = nt.nodes.new("ShaderNodeValToRGB")
    gramp.color_ramp.elements[0].color = (1.0 - CELL_AMT, 1.0 - CELL_AMT * 0.92,
                                          1.0 - CELL_AMT * 0.80, 1.0)
    gramp.color_ramp.elements[1].color = (1.0 + CELL_AMT * 0.7, 1.0 + CELL_AMT * 0.66,
                                          1.0 + CELL_AMT * 0.6, 1.0)
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")          # Voronoi Color -> a scalar
    nt.links.new(d['cell'], sep.inputs[0])
    nt.links.new(sep.outputs["X"], gramp.inputs["Fac"])
    gm = nt.nodes.new("ShaderNodeMixRGB")
    gm.blend_type = 'MULTIPLY'
    gm.inputs["Fac"].default_value = 1.0
    nt.links.new(col, gm.inputs["Color1"])
    nt.links.new(gramp.outputs["Color"], gm.inputs["Color2"])
    col = gm.outputs["Color"]

    vm = nt.nodes.new("ShaderNodeMixRGB")
    vm.blend_type = 'MULTIPLY'
    vm.inputs["Color2"].default_value = (0.55, 0.53, 0.50, 1.0)
    inv = nt.nodes.new("ShaderNodeMath"); inv.operation = 'SUBTRACT'
    inv.inputs[0].default_value = 1.0
    nt.links.new(d['vein'], inv.inputs[1])              # 1 AT the boundary
    nt.links.new(inv.outputs[0], vm.inputs["Fac"])
    nt.links.new(col, vm.inputs["Color1"])
    col = vm.outputs["Color"]

    sm2 = nt.nodes.new("ShaderNodeMixRGB")              # mineral glint
    sm2.inputs["Color2"].default_value = (1.0, 0.99, 0.95, 1.0)
    sramp = nt.nodes.new("ShaderNodeValToRGB")
    sramp.color_ramp.elements[0].position = 0.72
    sramp.color_ramp.elements[1].position = 1.0
    nt.links.new(d['speck'], sramp.inputs["Fac"])
    sg = nt.nodes.new("ShaderNodeMath"); sg.operation = 'MULTIPLY'
    sg.inputs[1].default_value = SPECK_AMT
    nt.links.new(sramp.outputs["Color"], sg.inputs[0])
    nt.links.new(sg.outputs[0], sm2.inputs["Fac"])
    nt.links.new(col, sm2.inputs["Color1"])
    col = sm2.outputs["Color"]

    # ---- region drift: whole areas warmer/cooler, not just block to block ----
    if PATCH_AMT > 0.0:
        pramp = nt.nodes.new("ShaderNodeValToRGB")
        pramp.color_ramp.elements[0].color = (1.0 - PATCH_AMT * 0.55,
                                              1.0 - PATCH_AMT * 0.70,
                                              1.0 - PATCH_AMT * 0.85, 1.0)   # cool + dark
        pramp.color_ramp.elements[1].color = (1.0 + PATCH_AMT * 0.34,
                                              1.0 + PATCH_AMT * 0.22,
                                              1.0 + PATCH_AMT * 0.08, 1.0)   # warm + light
        nt.links.new(patch, pramp.inputs["Fac"])
        pm = nt.nodes.new("ShaderNodeMixRGB")
        pm.blend_type = 'MULTIPLY'
        pm.inputs["Fac"].default_value = 1.0
        nt.links.new(col, pm.inputs["Color1"])
        nt.links.new(pramp.outputs["Color"], pm.inputs["Color2"])
        col = pm.outputs["Color"]

    # ---- damp climbing the foot of a wall ------------------------------------
    # Gated on VERTICALITY, not height alone: a floor sits at the same z as the
    # bottom course, so a pure z gradient would stain every floor in the set an
    # even brown. 1-|N.z| is 1 on a wall face and 0 on a floor, which is exactly
    # the surface that wicks damp.
    if stain > 0.0:
        nsep = nt.nodes.new("ShaderNodeSeparateXYZ")
        nt.links.new(geo.outputs["Normal"], nsep.inputs[0])
        absz = nt.nodes.new("ShaderNodeMath"); absz.operation = 'ABSOLUTE'
        nt.links.new(nsep.outputs["Z"], absz.inputs[0])
        vert = nt.nodes.new("ShaderNodeMath"); vert.operation = 'SUBTRACT'
        vert.inputs[0].default_value = 1.0
        nt.links.new(absz.outputs[0], vert.inputs[1])

        zsep = nt.nodes.new("ShaderNodeSeparateXYZ")
        nt.links.new(geo.outputs["Position"], zsep.inputs[0])
        low = nt.nodes.new("ShaderNodeMapRange")
        low.inputs["From Min"].default_value = 0.0
        low.inputs["From Max"].default_value = STAIN_H
        low.inputs["To Min"].default_value = 1.0
        low.inputs["To Max"].default_value = 0.0
        low.clamp = True
        nt.links.new(zsep.outputs["Z"], low.inputs["Value"])

        amt = nt.nodes.new("ShaderNodeMath"); amt.operation = 'MULTIPLY'
        nt.links.new(vert.outputs[0], amt.inputs[0])
        nt.links.new(low.outputs["Result"], amt.inputs[1])
        # break the waterline up so it is not a ruled line across every wall
        brk = nt.nodes.new("ShaderNodeMath"); brk.operation = 'MULTIPLY'
        nt.links.new(amt.outputs[0], brk.inputs[0])
        nt.links.new(mottle, brk.inputs[1])
        gain = nt.nodes.new("ShaderNodeMath"); gain.operation = 'MULTIPLY'
        gain.inputs[1].default_value = 2.2 * stain
        nt.links.new(brk.outputs[0], gain.inputs[0])

        sm = nt.nodes.new("ShaderNodeMixRGB")
        sm.inputs["Color2"].default_value = STAIN_RGB + (1.0,)
        nt.links.new(gain.outputs[0], sm.inputs["Fac"])
        nt.links.new(col, sm.inputs["Color1"])
        col = sm.outputs["Color"]

    if grime > 0.0:
        ao = nt.nodes.new("ShaderNodeAmbientOcclusion")
        ao.samples = 8
        ao.inputs["Distance"].default_value = 0.30
        # AO is 1 in the open and falls toward 0 in a crevice. Remapped so only
        # the genuinely enclosed parts take dirt, not every gentle dip.
        amt = nt.nodes.new("ShaderNodeMapRange")
        amt.inputs["From Min"].default_value = 0.35
        amt.inputs["From Max"].default_value = 0.90
        amt.inputs["To Min"].default_value = 0.75 * grime
        amt.inputs["To Max"].default_value = 0.0
        amt.clamp = True
        nt.links.new(ao.outputs["AO"], amt.inputs["Value"])
        mixg = nt.nodes.new("ShaderNodeMixRGB")
        mixg.inputs["Color2"].default_value = GRIME_RGB + (1.0,)
        nt.links.new(amt.outputs["Result"], mixg.inputs["Fac"])
        nt.links.new(col, mixg.inputs["Color1"])
        col = mixg.outputs["Color"]

    if wear > 0.0:
        geo = nt.nodes.new("ShaderNodeNewGeometry")
        pw = nt.nodes.new("ShaderNodeMapRange")
        pw.inputs["From Min"].default_value = 0.50
        pw.inputs["From Max"].default_value = 0.62
        pw.inputs["To Min"].default_value = 0.0
        pw.inputs["To Max"].default_value = WEAR_AMT * wear
        pw.clamp = True
        nt.links.new(geo.outputs["Pointiness"], pw.inputs["Value"])
        # break the wear up with the mottle, or every edge in the tile is chipped
        # by exactly the same amount and the set reads as machined
        brk = nt.nodes.new("ShaderNodeMath")
        brk.operation = 'MULTIPLY'
        nt.links.new(pw.outputs["Result"], brk.inputs[0])
        nt.links.new(mottle, brk.inputs[1])
        mixw = nt.nodes.new("ShaderNodeMixRGB")
        mixw.inputs["Color2"].default_value = WEAR_RGB + (1.0,)
        nt.links.new(brk.outputs[0], mixw.inputs["Fac"])
        nt.links.new(col, mixw.inputs["Color1"])
        col = mixw.outputs["Color"]

    if damp > 0.0:
        geo2 = nt.nodes.new("ShaderNodeNewGeometry")
        sep = nt.nodes.new("ShaderNodeSeparateXYZ")
        nt.links.new(geo2.outputs["Position"], sep.inputs[0])
        wet = nt.nodes.new("ShaderNodeMapRange")
        wet.inputs["From Min"].default_value = -1.10     # deep: fully damp
        wet.inputs["From Max"].default_value = 0.35      # above the floor: dry
        wet.inputs["To Min"].default_value = 0.42 * damp
        wet.inputs["To Max"].default_value = 0.0
        wet.clamp = True
        nt.links.new(sep.outputs["Z"], wet.inputs["Value"])
        mixd = nt.nodes.new("ShaderNodeMixRGB")
        mixd.blend_type = 'MULTIPLY'
        mixd.inputs["Color2"].default_value = (0.62, 0.70, 0.68, 1.0)
        nt.links.new(wet.outputs["Result"], mixd.inputs["Fac"])
        nt.links.new(col, mixd.inputs["Color1"])
        col = mixd.outputs["Color"]

    nt.links.new(col, b.inputs["Base Color"])

    bmp = nt.nodes.new("ShaderNodeBump")
    bmp.inputs["Strength"].default_value = bump
    bmp.inputs["Distance"].default_value = 0.06
    nt.links.new(height, bmp.inputs["Height"])
    nt.links.new(bmp.outputs["Normal"], b.inputs["Normal"])
    return m


def new_obj(name, verts, faces, material):
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.update()
    ob = bpy.data.objects.new(name, me)
    ob.data.materials.append(material)
    scene().collection.objects.link(ob)
    return ob


def box(name, cx, cy, z0, sx, sy, sz, material, rotz=0.0, bevel=None):
    hx, hy = sx / 2.0, sy / 2.0
    c, s = math.cos(rotz), math.sin(rotz)
    verts = []
    for z in (z0, z0 + sz):
        for dx, dy in ((-hx, -hy), (hx, -hy), (hx, hy), (-hx, hy)):
            verts.append((cx + dx * c - dy * s, cy + dx * s + dy * c, z))
    faces = [(0, 1, 2, 3), (7, 6, 5, 4), (0, 4, 5, 1),
             (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)]
    ob = new_obj(name, verts, faces, material)
    if bevel:
        b = ob.modifiers.new("bevel", 'BEVEL')
        b.width, b.segments, b.limit_method = bevel[0], bevel[1], 'ANGLE'
    return ob


# ---------------------------------------------------------------- tile pieces

def add_plinth(base, m_stone):
    """The rock a raised tile stands on. Solid from 0 to `base` across the whole
    footprint: where two raised tiles abut, the nearer plinth covers the farther
    one, so a contiguous plateau shows rock only at its border."""
    if base <= 0.0:
        return
    bh = HALF * (TILE_W_PX + 2.0 * BLEED_PX) / TILE_W_PX
    box("plinth", 0.0, 0.0, 0.0, bh * 2, bh * 2, base, m_stone)


def add_stairs(edge, base, m_stone, steps=None):
    """Stepped rise from `base` to base+STEP, climbing toward `edge`.

    Steps rather than a smooth ramp: a ramp reads as a wedge from this camera and
    loses the read of 'this is climbable', while treads catch the light.

    STEP COUNT IS DERIVED, NOT PICKED. It used to be a flat 5, which over a
    1.8-unit rise is a 0.36 riser -- 21 inches at this scale, taller than the
    step is deep, and it read as a stack of crates rather than a stair. Deriving
    it from a target riser keeps the proportion right if STEP ever changes, and
    is why over_stairs (which climbs OVER_Z, not STEP) no longer needs its own
    hand-tuned number."""
    axis = 'y' if edge in ('Y+', 'Y-') else 'x'
    sign = 1.0 if edge in ('Y+', 'X+') else -1.0
    steps = steps or max(4, int(round(STEP / RISER)))
    depth = SIZE / steps
    rng = random.Random(SEED + 3)
    for i in range(steps):
        h = base + STEP * (i + 1) / steps
        c = -HALF + depth * (i + 0.5)
        if sign < 0:
            c = -c
        # a hand-laid stair is not machined: each tread sits a hair off
        j = rng.uniform(-0.012, 0.012)
        w = SIZE * rng.uniform(0.985, 1.0)
        if axis == 'y':
            box("step%d" % i, 0.0, c + j, 0.0, w, depth, h, m_stone,
                math.radians(rng.uniform(-0.5, 0.5)), bevel=(0.022, 3))
        else:
            box("step%d" % i, c + j, 0.0, 0.0, depth, w, h, m_stone,
                math.radians(rng.uniform(-0.5, 0.5)), bevel=(0.022, 3))


def rim_span(rimset, t):
    """How far an X rim runs, given which Y rims share its corners.

    The Y rims run the full tile edge and own both corners, so an X rim BUTTS
    against them. Letting the two overlap is what put a small pure-black diamond
    at the corner of every basin: overlapping boxes share a coplanar top face at
    z=0, and the albedo here is world-lit ambient occlusion, so whichever face
    ends up sealed inside the other box sees no world at all and bakes to 0,0,0.
    It read as a hole in the floor. It was two walls, one inside the other."""
    return (-HALF + (t if "Y-" in rimset else 0.0),
             HALF - (t if "Y+" in rimset else 0.0))


def _bank(edge, rimset, z_bot, depth, m_face, m_grass, rng, ledges=5):
    """One side of a gorge or stream bank, in place of the dungeon's flat rim slab.

    The masonry version is a single box of thickness t spanning the whole edge, which
    is exactly right for a cut stone basin and reads as a kerb outdoors. This steps
    the face instead -- a few beds of differing depth and height, some standing proud
    as ledges -- and finishes it with a turf lip so the grass runs to the brink rather
    than stopping at a grey line."""
    t = 0.32
    sign = 1.0 if edge in ("Y+", "X+") else -1.0
    off = sign * (HALF - t / 2.0)
    horiz = edge in ("Y+", "Y-")
    if horiz:
        lo, hi = -HALF, HALF
    else:
        lo, hi = rim_span(rimset, t)
    ctr, run = (lo + hi) / 2.0, hi - lo

    # SEGMENT THE RUN. A ledge spanning the whole edge gives a perfectly straight
    # horizontal band, and a stack of those reads as concrete terracing however much
    # the heights vary -- the first cut of this looked like a multi-storey car park.
    # Break the run into irregular chunks first, and let each chunk keep its own
    # ledge heights and depths, exactly as the cliff face breaks into columns.
    n = 0
    u = lo
    while u < hi - 1e-6:
        seg = min(rng.uniform(0.5, 1.3), hi - u)
        sctr = u + seg / 2.0
        z = z_bot - rng.uniform(0.0, 0.10)
        for k in range(ledges + rng.randint(-1, 2)):
            h = (depth / ledges) * rng.uniform(0.55, 1.5)
            if z + h > 0.0:
                h = max(0.02, -z)
            d = t * rng.uniform(1.0, 2.4)              # how far the bed juts in
            inset = t * rng.uniform(-0.2, 0.9)
            w = seg * rng.uniform(0.88, 1.02)
            rot = rng.uniform(-0.06, 0.06)
            if horiz:
                box("bank_%s_%d" % (edge, n), sctr, off - sign * inset, z,
                    w, d, h, m_face, rotz=rot, bevel=(0.035, 2))
            else:
                box("bank_%s_%d" % (edge, n), off - sign * inset, sctr, z,
                    d, w, h, m_face, rotz=rot, bevel=(0.035, 2))
            z += h
            n += 1
            if z >= -0.01:
                break
        u += seg
    # turf lip: the living edge of the bank, overhanging very slightly
    if horiz:
        box("lip_" + edge, ctr, off - sign * t * 0.15, -0.07, run, t * 1.5, 0.09,
            m_grass, bevel=(0.02, 1))
    else:
        box("lip_" + edge, off - sign * t * 0.15, ctr, -0.07, t * 1.5, run, 0.09,
            m_grass, bevel=(0.02, 1))


def add_gorge(walkway=False, span_axis='y', rims=None):
    """A rocky gorge: the outdoor reading of a chasm."""
    m_rock = mkmat("rock", theme().get("rock", (0.42, 0.41, 0.38)), 0.9, vary=0.40)
    m_soil = mkmat("soil", theme()["mortar"], 0.95, vary=0.30)
    m_grass = mkmat("grass", theme()["stone"], 0.92, vary=0.42)
    rng = random.Random(SEED + 771)
    bh = HALF * (TILE_W_PX + 2.0 * BLEED_PX) / TILE_W_PX
    new_obj("gorge_floor",
            [(-bh, -bh, -PIT), (bh, -bh, -PIT), (bh, bh, -PIT), (-bh, bh, -PIT)],
            [(0, 1, 2, 3)], m_soil)
    # boulders on the floor, so the bottom is not a flat brown card
    for k in range(rng.randint(4, 8)):
        s = rng.uniform(0.20, 0.55)
        box("boulder%d" % k, rng.uniform(-HALF * 0.8, HALF * 0.8),
            rng.uniform(-HALF * 0.8, HALF * 0.8), -PIT, s, s * rng.uniform(0.7, 1.3),
            s * rng.uniform(0.5, 1.0), m_rock, rotz=rng.uniform(0, math.pi),
            bevel=(0.04, 2))
    rimset = tuple(rims if rims is not None else ("Y+", "Y-", "X+", "X-"))
    for edge in rimset:
        _bank(edge, rimset, -PIT, PIT, m_rock, m_grass, rng)
    if walkway:
        # a felled trunk rather than a stone causeway
        L, W = SIZE, BRIDGE_W * 0.62
        if span_axis == 'y':
            box("log", 0.0, 0.0, -0.20, W, L, W, m_soil, bevel=(0.16, 3))
        else:
            box("log", 0.0, 0.0, -0.20, L, W, W, m_soil, bevel=(0.16, 3))


def add_stream(walkway=False, span_axis='y', rims=None):
    """A stream: shallow bed, earth banks, water surface at the same WATER_Z the
    dungeon basin uses so the runtime's height/lighting treatment is unchanged."""
    m_water = bpy.data.materials.get("water")
    if m_water is None:
        m_water = bpy.data.materials.new("water")
        m_water.use_nodes = True
        b = m_water.node_tree.nodes["Principled BSDF"]
        b.inputs["Base Color"].default_value = (0.06, 0.13, 0.14, 1.0)
        b.inputs["Roughness"].default_value = 0.12
        b.inputs["Metallic"].default_value = 0.35
    m_rock = mkmat("rock", theme().get("rock", (0.42, 0.41, 0.38)), 0.9, vary=0.40)
    m_soil = mkmat("soil", theme()["mortar"], 0.95, vary=0.30)
    m_grass = mkmat("grass", theme()["stone"], 0.92, vary=0.42)
    rng = random.Random(SEED + 772)
    bh = HALF * (TILE_W_PX + 2.0 * BLEED_PX) / TILE_W_PX
    new_obj("stream_bed",
            [(-bh, -bh, -0.95), (bh, -bh, -0.95), (bh, bh, -0.95), (-bh, bh, -0.95)],
            [(0, 1, 2, 3)], m_soil)
    for k in range(rng.randint(5, 9)):          # pebbles in the bed, seen through
        s = rng.uniform(0.10, 0.26)
        box("pebble%d" % k, rng.uniform(-HALF * 0.8, HALF * 0.8),
            rng.uniform(-HALF * 0.8, HALF * 0.8), -0.95, s, s, s * 0.5, m_rock,
            rotz=rng.uniform(0, math.pi), bevel=(0.03, 2))
    rimset = tuple(rims if rims is not None else ("Y+", "Y-", "X+", "X-"))
    for edge in rimset:
        _bank(edge, rimset, -0.95, 0.95, m_soil, m_grass, rng, ledges=3)
    if walkway:
        # stepping stones rather than a kerbed causeway
        for k in range(5):
            u = -HALF + (k + 0.5) * (SIZE / 5.0)
            s = rng.uniform(0.42, 0.62)
            x, y = (rng.uniform(-0.18, 0.18), u) if span_axis == 'y' else (u, rng.uniform(-0.18, 0.18))
            box("step%d" % k, x, y, WATER_Z - 0.30, s, s, 0.42, m_rock,
                rotz=rng.uniform(0, math.pi), bevel=(0.05, 2))
    new_obj("water_surface",
            [(-bh, -bh, WATER_Z), (bh, -bh, WATER_Z), (bh, bh, WATER_Z), (-bh, bh, WATER_Z)],
            [(0, 1, 2, 3)], m_water)


def add_pit(m_stone, m_mortar, walkway=False, span_axis='y', rims=None):
    if kit() == "outdoor":
        return add_gorge(walkway=walkway, span_axis=span_axis, rims=rims)
    """Floor dropped to -PIT with rim walls coming down from ground level.

    The rim is drawn on all four sides for the same reason the plinth is: a
    neighbouring pit tile's nearer rim hides this one's, so a multi-tile pit
    reads as one hole rather than a grid of boxes."""
    bh = HALF * (TILE_W_PX + 2.0 * BLEED_PX) / TILE_W_PX
    new_obj("pit_floor",
            [(-bh, -bh, -PIT), (bh, -bh, -PIT), (bh, bh, -PIT), (-bh, bh, -PIT)],
            [(0, 1, 2, 3)], m_mortar)
    # Rims ONLY where the neighbour is solid ground. Drawing all four on every
    # tile put two rim walls back to back in the middle of a chasm, so a rift
    # rendered as a row of separate boxes instead of one continuous gash.
    t = 0.32
    rimset = tuple(rims if rims is not None else ("Y+", "Y-", "X+", "X-"))
    for edge in rimset:
        sign = 1.0 if edge in ("Y+", "X+") else -1.0
        off = sign * (HALF - t / 2.0)
        if edge in ("Y+", "Y-"):
            box("rim_" + edge, 0.0, off, -PIT, SIZE, t, PIT, m_stone)
        else:
            lo, hi = rim_span(rimset, t)
            box("rim_" + edge, off, (lo + hi) / 2.0, -PIT, t, hi - lo, PIT, m_stone)
    if walkway:
        # A stone causeway at ground level. It must follow the tile's rotation --
        # spanning a fixed axis made bridge_r90 render identically to bridge_r0.
        if span_axis == 'y':
            box("span", 0.0, 0.0, -0.14, BRIDGE_W, SIZE, 0.14, m_stone, bevel=(0.03, 2))
            for s in (-1.0, 1.0):
                box("kerb%d" % int(s), s * (BRIDGE_W / 2 + 0.06), 0.0, -0.14,
                    0.12, SIZE, 0.22, m_stone, bevel=(0.02, 2))
        else:
            box("span", 0.0, 0.0, -0.14, SIZE, BRIDGE_W, 0.14, m_stone, bevel=(0.03, 2))
            for s in (-1.0, 1.0):
                box("kerb%d" % int(s), 0.0, s * (BRIDGE_W / 2 + 0.06), -0.14,
                    SIZE, 0.12, 0.22, m_stone, bevel=(0.02, 2))



def add_debug_edges(m_stone):
    """A floor with each EDGE painted a different colour.

    Y+ red, X+ green, Y- blue, X- yellow. Rendered through the same rotation
    machinery as every other tile, so it answers the question my data audits
    could not: does the ART agree with the logical edge, or is the rotation
    lookup lying? Colour beats reasoning for this."""
    cols = {"Y+": (0.85, 0.05, 0.05), "X+": (0.05, 0.75, 0.10),
            "Y-": (0.06, 0.16, 0.90), "X-": (0.90, 0.80, 0.05)}
    bh = HALF * (TILE_W_PX + 2.0 * BLEED_PX) / TILE_W_PX
    grey = mkmat("dbg_floor", (0.45, 0.45, 0.47), 0.9, vary=0.02)
    new_obj("dbg_bed", [(-bh, -bh, 0), (bh, -bh, 0), (bh, bh, 0), (-bh, bh, 0)],
            [(0, 1, 2, 3)], grey)
    t = 0.55
    for edge, rgb in cols.items():
        m = mkmat("dbg_" + edge, rgb, 0.85, vary=0.02)
        sign = 1.0 if edge in ("Y+", "X+") else -1.0
        off = sign * (HALF - t / 2.0)
        if edge in ("Y+", "Y-"):
            box("dbgedge_" + edge, 0.0, off, 0.0, SIZE, t, 0.06, m)
        else:
            box("dbgedge_" + edge, off, 0.0, 0.0, t, SIZE, 0.06, m)



def add_flank(m_stone, depth, edge="Y+"):
    """The two chasm-wall pieces either side of a causeway, at ONE edge.

    Drawn as a separate overlay rather than baked into the bridge tile, because
    whether a span edge needs them depends on the neighbour: at a landing they
    close the hole between deck and chasm rim, but between two deck tiles of a
    wide crossing there is no hole -- and baking them in left free-standing stubs
    poking out of the water. Baking every combination would need 64 variants.

    The piece follows `edge` the way add_water's rims do. It used to ignore the
    rotation entirely, so all four _r files were byte-identical Y+ pieces and a
    causeway landing on an X edge had nothing to close it."""
    t = 0.32
    off = (1.0 if edge in ("Y+", "X+") else -1.0) * (HALF - t / 2.0)
    # FULL WIDTH, INCLUDING UNDER THE DECK. It used to be two pieces with a
    # deck-width gap between them, which left you looking under the causeway at
    # its landing and straight out of the map -- a hard black rectangle against a
    # lit chasm floor, which reads as a hole in the art, not as depth. A landing
    # is where the span meets solid ground, so the honest thing there is an
    # abutment: the deck (0.14 thick, top at 0.0) simply sits in the top of it.
    if edge in ("Y+", "Y-"):
        box("flank", 0.0, off, -depth, SIZE, t, depth, m_stone)
    else:
        box("flank", off, 0.0, -depth, t, SIZE, depth, m_stone)


def add_over_floor(m_stone, m_mortar, span_axis=None, legs=True):
    """Upper-layer floor on pillars, with open space beneath.

    Rendered WITHOUT any ground tile: the ground is composited separately into
    layer 0, and this into layer 1. That separation is the whole point -- one
    height buffer can only hold the nearer of the two surfaces, so a character
    walking underneath would be occluded by a floor that, in a single-layer
    world, has no way to say 'there is also something below me'."""
    bh = HALF * (TILE_W_PX + 2.0 * BLEED_PX) / TILE_W_PX
    if span_axis is None:
        box("slab", 0.0, 0.0, OVER_Z - OVER_T, bh * 2, bh * 2, OVER_T, m_stone)
        legpos = ((HALF - 0.4, HALF - 0.4), (-HALF + 0.4, HALF - 0.4),
                  (HALF - 0.4, -HALF + 0.4), (-HALF + 0.4, -HALF + 0.4))
    else:
        if span_axis == 'y':
            box("slab", 0.0, 0.0, OVER_Z - OVER_T, BRIDGE_W, bh * 2, OVER_T, m_stone)
            for s in (-1.0, 1.0):
                box("rail%d" % int(s), s * (BRIDGE_W / 2 + 0.07), 0.0, OVER_Z,
                    0.14, bh * 2, 0.30, m_stone, bevel=(0.02, 2))
            legpos = ((0.0, HALF - 0.5), (0.0, -HALF + 0.5))
        else:
            box("slab", 0.0, 0.0, OVER_Z - OVER_T, bh * 2, BRIDGE_W, OVER_T, m_stone)
            for s in (-1.0, 1.0):
                box("rail%d" % int(s), 0.0, s * (BRIDGE_W / 2 + 0.07), OVER_Z,
                    bh * 2, 0.14, 0.30, m_stone, bevel=(0.02, 2))
            legpos = ((HALF - 0.5, 0.0), (-HALF + 0.5, 0.0))
    # Pillars belong at the ENDS of a span, not under every tile: one pair per
    # tile turns a three-tile walkway into six columns in a row.
    if legs:
        for k, (px, py) in enumerate(legpos):
            box("pillar%d" % k, px, py, 0.0, PILLAR, PILLAR, OVER_Z - OVER_T, m_stone,
                bevel=(0.03, 2))


def add_over_stairs(edge, m_stone):
    """Climb from ground to the upper layer in one tile. Steeper than the
    plateau stair because it covers OVER_Z rather than STEP."""
    axis = 'y' if edge in ('Y+', 'Y-') else 'x'
    sign = 1.0 if edge in ('Y+', 'X+') else -1.0
    steps = max(6, int(round(OVER_Z / RISER)))      # same riser as the low stair
    depth = SIZE / steps
    rng = random.Random(SEED + 5)
    for i in range(steps):
        h = OVER_Z * (i + 1) / steps
        c = -HALF + depth * (i + 0.5)
        if sign < 0:
            c = -c
        w = SIZE * 0.55 * rng.uniform(0.98, 1.0)
        if axis == 'y':
            box("ostep%d" % i, 0.0, c, 0.0, w, depth, h, m_stone, bevel=(0.022, 3))
        else:
            box("ostep%d" % i, c, 0.0, 0.0, depth, w, h, m_stone, bevel=(0.022, 3))


def add_water(m_stone, walkway=False, span_axis='y', rims=None):
    if kit() == "outdoor":
        return add_stream(walkway=walkway, span_axis=span_axis, rims=rims)
    """A flooded basin: shallow stone bed with a flat water surface above it.

    The water plane is a separate flat surface at WATER_Z, so in the height pass
    it reads as one clean level -- which is what makes reflections/rippling
    possible later, and what stops the runtime lighting treating it as rubble."""
    m_water = bpy.data.materials.get("water")
    if m_water is None:
        m_water = bpy.data.materials.new("water")
        m_water.use_nodes = True
        b = m_water.node_tree.nodes["Principled BSDF"]
        b.inputs["Base Color"].default_value = (0.05, 0.14, 0.20, 1.0)
        b.inputs["Roughness"].default_value = 0.12
        b.inputs["Metallic"].default_value = 0.35

    bh = HALF * (TILE_W_PX + 2.0 * BLEED_PX) / TILE_W_PX
    new_obj("water_bed",
            [(-bh, -bh, -0.95), (bh, -bh, -0.95), (bh, bh, -0.95), (-bh, bh, -0.95)],
            [(0, 1, 2, 3)], m_stone)
    t = 0.32
    rimset = tuple(rims if rims is not None else ("Y+", "Y-", "X+", "X-"))
    for edge in rimset:
        sign = 1.0 if edge in ("Y+", "X+") else -1.0
        off = sign * (HALF - t / 2.0)
        if edge in ("Y+", "Y-"):
            box("wrim_" + edge, 0.0, off, -0.95, SIZE, t, 0.95, m_stone)
        else:
            lo, hi = rim_span(rimset, t)
            box("wrim_" + edge, off, (lo + hi) / 2.0, -0.95, t, hi - lo, 0.95, m_stone)
    new_obj("water_surface",
            [(-bh, -bh, WATER_Z), (bh, -bh, WATER_Z), (bh, bh, WATER_Z), (-bh, bh, WATER_Z)],
            [(0, 1, 2, 3)], m_water)
    if walkway:
        if span_axis == 'y':
            box("wspan", 0.0, 0.0, -0.14, BRIDGE_W, SIZE, 0.14, m_stone, bevel=(0.03, 2))
        else:
            box("wspan", 0.0, 0.0, -0.14, SIZE, BRIDGE_W, 0.14, m_stone, bevel=(0.03, 2))


# --------------------------------------------------------------- terrain kit
#
# NATURAL GROUND IS ONE SURFACE, NOT A KIT OF PARTS.
#
# The first outdoor pass built a cliff the way the dungeon builds a wall: a run of
# boxes standing on flat ground. It read as masonry painted green, because that is
# what it was. Nothing here uses box(). A tile is a single displaced mesh -- the
# cliff is a STEEP PART OF THE GROUND, the path is a WORN PART OF THE GROUND, and
# the material is chosen per-vertex from the shape itself, so there is no edge
# anywhere for two materials to meet along.
#
# TILING WITHOUT A FLAT RIM.
# Tiles are rendered apart and abutted on an exact lattice, so the height along a
# seam has to agree with a neighbour that was rendered an hour earlier. The old
# answer was to pin the border flat, which buys the seam at the cost of a visible
# ruler-straight line around every tile. Instead every field here is PERIODIC over
# the tile (value noise on a lattice that wraps), and near the border each tile
# falls back to a SHARED field with a fixed seed:
#
#     border  ->  everyone samples the same wrapping field  ->  seams match exactly
#     middle  ->  the tile's own seed                       ->  no two tiles alike
#
# so the ground undulates straight through a seam and the tiles still stack.

TERRAIN_N = 132          # grid samples across a tile; ~5 world-units wide, so a
                         # cell is ~4px on the baked diamond -- fine enough that
                         # the silhouette of a scarp is a curve, not a staircase
SEAM_SEED = 90210        # the field EVERY tile shares within SEAM_BAND of its edge
SEAM_BAND = 0.30         # how far in (in tile widths) the shared field reaches
RELIEF = 0.21            # meadow undulation, world units peak to trough
SCARP_W = 0.155          # scarp run-out as a fraction of the tile: STEP over this
                         # is the face angle. Narrower reads as a wall, wider as a
                         # hill; this is the value that still says "you can't walk up"
PATH_W = 0.17            # half-width of a worn track, in tile widths
MEADOW_RELIEF = 0.03     # how far a nominally FLAT tile may move. Not zero --
                         # a dead plane reads as a table -- but far below
                         # RELIEF, which domed every open tile into a cushion
BED_Z = -0.95            # the bottom under open water
WATER_LEVEL = -0.20      # the surface itself, just below the ground band, so a
                         # shore shelves THROUGH it rather than stopping at it
PATH_CUT = 0.10          # how far a track sits below the turf it wore through


def _hash2(ix, iy, seed):
    n = (ix * 374761393 + iy * 668265263 + seed * 1013904223) & 0xFFFFFFFF
    n = ((n ^ (n >> 13)) * 1274126177) & 0xFFFFFFFF
    return ((n ^ (n >> 16)) & 0xFFFFFF) / float(0xFFFFFF)


def _sstep(t):
    t = 0.0 if t < 0.0 else (1.0 if t > 1.0 else t)
    return t * t * t * (t * (t * 6.0 - 15.0) + 10.0)


def _vnoise(x, y, period, seed):
    """Value noise, PERIODIC over `period` lattice cells in both axes.

    Periodicity is the whole reason this exists rather than a sin/cos hash: it is
    what lets a tile's field wrap, which is what lets two tiles share a seam."""
    ix, iy = math.floor(x), math.floor(y)
    fx, fy = x - ix, y - iy
    u, v = _sstep(fx), _sstep(fy)
    ix, iy = int(ix), int(iy)
    p = period
    a = _hash2(ix % p, iy % p, seed)
    b = _hash2((ix + 1) % p, iy % p, seed)
    c = _hash2(ix % p, (iy + 1) % p, seed)
    d = _hash2((ix + 1) % p, (iy + 1) % p, seed)
    ab = a + (b - a) * u
    cd = c + (d - c) * u
    return ab + (cd - ab) * v


def _fbm(u, v, seed, octaves=4, freq=2):
    """Fractal noise over the unit tile, wrapping at u=1 and v=1. Returns 0..1."""
    n, amp, tot, f = 0.0, 1.0, 0.0, freq
    for k in range(octaves):
        n += amp * _vnoise(u * f, v * f, f, seed + k * 7919)
        tot += amp
        amp *= 0.5
        f *= 2
    return n / tot


def _fbm1(t, seed, octaves=3, freq=3):
    """The same, along one axis -- for a line that has to meander across a seam."""
    n, amp, tot, f = 0.0, 1.0, 0.0, freq
    for k in range(octaves):
        n += amp * _vnoise(t * f, 0.5, f, seed + k * 6151)
        tot += amp
        amp *= 0.5
        f *= 2
    return n / tot


def _interior(u, v):
    """0 on the tile border, 1 once SEAM_BAND inside it."""
    uu, vv = u % 1.0, v % 1.0
    return _sstep(min(uu, 1.0 - uu, vv, 1.0 - vv) / SEAM_BAND)


def _ground(u, v, seed, octaves=5):
    """Undulation in -1..1: shared field at the border, own field in the middle."""
    a = _fbm(u, v, SEAM_SEED, 4)
    b = _fbm(u, v, seed, octaves)
    w = _interior(u, v)
    return (a + (b - a) * w - 0.5) * 2.0


def _scarp(u, v, seed, sides, join="max"):
    """Height 0..1 of ground rising toward each edge in `sides`.

    The break line MEANDERS: its position along the edge is periodic noise of the
    along-edge coordinate only, so the neighbouring tile computes the same curve at
    the shared corner and the cliff runs on unbroken across the map.

    JOIN is what gives the corner pieces, and it is the thing `sides` alone could
    never express. With two adjacent edges high:

        max   the two high half-planes UNION, so the low ground is a notch bitten
              out of one corner -- an INSIDE corner, the one you stand in
        min   they INTERSECT, so the high ground is a nub filling one corner --
              an OUTSIDE corner, the one you walk around

    Both are needed and neither is the other rotated.

    A single smoothstep gives a poured-concrete ramp: right height, no rock. A face
    reads as stone because it fails in LAYERS -- shelves where a soft bed weathered
    back, gullies where water found a line down, and a run-out that is near-vertical
    in one place and a talus slope ten feet along."""
    vals = []
    for e in sides:
        t = {"Y+": v, "Y-": 1.0 - v, "X+": u, "X-": 1.0 - u}[e]
        a = {"Y+": u, "Y-": 1.0 - u, "X+": v, "X-": 1.0 - v}[e]
        line, w = _scarp_line(a, seed)
        p = _sstep((t - line) / w + 0.5)
        steep = 4.0 * p * (1.0 - p)               # 0 at crest and toe, 1 mid-face
        # bedding planes: shelves across the face, out of phase along the edge
        p += 0.075 * steep * math.sin(p * math.pi * 5.5
                                      + 7.0 * _fbm1(a, seed + 97, 2, 4))
        # gullies: channels down the fall line, so the face is fluted not flat
        p += 0.115 * steep * (_fbm(a, t * 0.55, seed + 613, 3, 7) - 0.5) * 2.0
        vals.append(max(0.0, min(1.12, p)))
    if not vals:
        return 0.0
    return max(vals) if join == "max" else min(vals)


def _ramp(u, v, seed, side):
    """A walkable slope: the ground climbs across the WHOLE tile, so there is no
    face to scramble. A scarp is the wall; this is the way round it.

    Eased at both ends, not linear. A straight ramp meeting flat ground matches in
    height but not in GRADIENT, and that leaves a crease along the seam that reads
    as a step even though the heights agree to the millimetre."""
    t = {"Y+": v, "Y-": 1.0 - v, "X+": u, "X-": 1.0 - u}[side]
    a = {"Y+": u, "Y-": 1.0 - u, "X+": v, "X-": 1.0 - v}[side]
    s = _sstep(t)
    return s + 0.06 * s * (1.0 - s) * (_fbm1(a, seed + 41, 2, 3) - 0.5) * 2.0


def _arms(u, v, seed, arms, half_w):
    """Mask 0..1 for a track that leaves the tile through each edge in `arms`.

    THE WANDER GOES TO ZERO AT THE EDGE. A path has to meet whatever tile the solver
    puts next to it, so every arm crosses its edge at exactly the midpoint and does
    all its wandering in between. That one constraint is what makes straight, bend,
    tee, cross and dead-end all connect to each other in any combination, with no
    per-pair rule anywhere.

    Distance to a SEGMENT from the tile centre to an edge midpoint, unioned over the
    arms -- so the junction shapes are not five separate pieces of code. Two opposite
    arms is a straight, two adjacent is a bend, three is a tee, four is a crossroads,
    one is a dead end, and the rounded patch in the middle is both the junction and
    the terminus."""
    d0 = math.hypot(u - 0.5, v - 0.5)
    best = _sstep(1.0 - d0 / (half_w * 1.2))
    for e in arms:
        if e in ("Y+", "Y-"):
            alo = (v - 0.5) if e == "Y+" else (0.5 - v)
            lat = u
        else:
            alo = (u - 0.5) if e == "X+" else (0.5 - u)
            lat = v
        if alo < 0.0:
            continue
        t = min(1.0, alo / 0.5)
        phase = 0.0 if e in ("Y+", "X+") else 0.5
        c = 0.5 + 0.16 * math.sin(math.pi * t) * (
            _fbm1(t * 0.5 + phase, seed + 71, 2, 3) - 0.5) * 2.0
        best = max(best, _sstep(1.0 - abs(lat - c) / half_w))
    return best


# --- fields ---------------------------------------------------------------
# A field answers (height, mud weight) for a point in the unit tile. Everything
# else -- slope, rock, surfacing, scatter, crags -- is DERIVED from the surface it
# returns, so a new piece is a new field and nothing else.
#
# ELEVATION IS A BAND, AND A TRANSITION IS A PAIR OF THEM.
# Cliff, shore and sea-cliff are the same problem three times: ground at one height
# meeting ground at another. Writing them as one parameterised family rather than
# three hand-built pieces is what makes the corner and ramp variants free -- there
# is exactly one place that knows how a level change is shaped, and every family
# inherits any fix to it.

def field_flat(seed, z=0.0, ripple=0.0):
    """Open ground at one band. FLAT -- not domed.

    It used to carry the same relief every other piece does, and on a tile with
    nothing else in it that reads as a cushion: the middle sits proud of all four
    edges, so a field of them looks like a quilt. Flat ground should be flat; the
    interest comes from the surfacing, not the silhouette."""
    r = ripple or MEADOW_RELIEF

    def f(u, v):
        return z + r * _ground(u, v, seed), 0.0
    return f


def field_step(seed, sides, z_lo=0.0, z_hi=None, join="max", ramp=None,
               channel=0.0):
    """Ground climbing from `z_lo` to `z_hi` toward `sides`.

    This one function is the cliff, the shore and the sea cliff -- only the two
    band heights differ, and the surfacing follows from the slope and the water
    line rather than from which piece it is.

    `ramp` replaces the face with a walkable slope. `channel` cuts a walkable
    ramp through a face that otherwise stands: the banks either side keep the same
    profile, so a ramp tile presents exactly the sockets a straight scarp does and
    the solver can drop a way up anywhere a cliff runs."""
    z_hi = STEP if z_hi is None else z_hi
    span = z_hi - z_lo

    def f(u, v):
        if ramp:
            s = _ramp(u, v, seed, ramp)
            steep = 0.0
        else:
            s = _scarp(u, v, seed, sides, join)
            steep = 4.0 * s * (1.0 - s)
            if channel > 0.0:
                cut = _arms(u, v, seed, [sides[0], _opposite(sides[0])], channel)
                r = _ramp(u, v, seed, sides[0])
                s = s + (r - s) * cut
                steep *= 1.0 - cut
        z = z_lo + span * s + RELIEF * _ground(u, v, seed) * (1.0 - 0.8 * steep)
        return z, 0.0
    return f


def field_track(seed, arms, sides=(), z_lo=0.0, z_hi=None, join="max", ramp=None):
    """A worn track: turf scraped off, ground packed down, a rut down the crown.

    `arms` is the junction vocabulary. `sides`/`ramp` let the same track climb --
    where a path meets a scarp it CUTS one, because people walk the shallowest line
    they can find and wear it deeper, so the face gives way to an even slope exactly
    where the mud is and closes back up either side."""
    z_hi = STEP if z_hi is None else z_hi

    def f(u, v):
        mud = _arms(u, v, seed, arms, PATH_W)
        mud *= 0.74 + 0.52 * _fbm(u, v, seed + 88, 3, 6)     # frayed verge
        mud = max(0.0, min(1.0, mud))
        z = MEADOW_RELIEF * _ground(u, v, seed) * (1.0 - 0.6 * mud) + z_lo
        z -= PATH_CUT * mud
        if ramp:
            z += (z_hi - z_lo) * _ramp(u, v, seed, ramp)
        elif sides:
            s = _scarp(u, v, seed, sides, join)
            r = _ramp(u, v, seed, sides[0])
            z += (z_hi - z_lo) * (s + (r - s) * mud)
        return z, mud
    return f


def field_mire(seed):
    """A wallow: a basin that holds water, poached to mud around its rim.

    A BASIN, not a noise threshold. Thresholding fbm cannot promise how much of the
    tile it covers -- measured off the height pass, a threshold tuned to give a
    puddle put 76% of the tile under water on one seed and would have given a
    different answer on the next. Worse, it could wet the EDGES, and a mire presents
    plain ground on all four sockets: whatever the middle does, the rim has to be
    walkable or the tile is lying to the solver.

    Distance from the centre, with a noisy radius, says both things at once."""
    def f(u, v):
        dx, dy = u - 0.5, v - 0.5
        d = math.hypot(dx, dy) / 0.5                    # 0 centre, 1 at the edge
        # the rim wanders, so it is a wallow and not a dinner plate
        ang = math.atan2(dy, dx) / (2.0 * math.pi) + 0.5
        r = 0.62 + 0.26 * (_fbm1(ang, seed + 404, 3, 3) - 0.5) * 2.0
        mud = _sstep((r - d) / 0.30)
        z = MEADOW_RELIEF * _ground(u, v, seed) * (1.0 - 0.7 * mud)
        z -= 0.30 * mud * mud                            # the hollow
        z -= 0.035 * mud * (_fbm(u, v, seed + 909, 2, 9) - 0.5) * 2.0   # poaching
        return z, mud
    return f


def _opposite(e):
    return {"Y+": "Y-", "Y-": "Y+", "X+": "X-", "X-": "X+"}[e]


def _band_z(b):
    """World height of an elevation band. -1 is the bed under the water, not the
    water surface -- the surface is a separate plane at WATER_LEVEL, so a shore can
    shelve gently through it instead of stopping dead at it."""
    return {-1: BED_Z, 0: 0.0, 1: STEP}[b]


FIELDS = {
    "flat": lambda sp, sd: field_flat(sd, _band_z(sp.get("band", 0)),
                                      sp.get("ripple", 0.0)),
    "step": lambda sp, sd: field_step(sd, sp.get("high", []),
                                      _band_z(sp.get("lo", 0)),
                                      _band_z(sp.get("hi", 1)),
                                      sp.get("join", "max"),
                                      sp.get("ramp"), sp.get("channel", 0.0)),
    "track": lambda sp, sd: field_track(sd, sp.get("arms", ["Y+", "Y-"]),
                                        sp.get("high", ()),
                                        _band_z(sp.get("lo", 0)),
                                        _band_z(sp.get("hi", 1)),
                                        sp.get("join", "max"), sp.get("ramp")),
    "mire": lambda sp, sd: field_mire(sd),
}


def terrain_surface(field, base=0.0, name="ground", water=False):
    """Build the tile's ground as one smooth-shaded mesh, and paint it from its own
    shape: steep is rock, worn is mud, low and flat is wet, the rest is turf.

    Returns a sampler the scatter uses so a boulder sits ON the ground rather than
    at a height somebody had to guess."""
    N = TERRAIN_N
    bh = _bh()
    zs, muds, verts = [], [], []
    for iy in range(N + 1):
        for ix in range(N + 1):
            x = -bh + 2.0 * bh * ix / N
            y = -bh + 2.0 * bh * iy / N
            z, mud = field((x + HALF) / SIZE, (y + HALF) / SIZE)
            zs.append(base + z)
            muds.append(mud)
            verts.append((x, y, base + z))

    d = 2.0 * bh / N
    cols = []
    for iy in range(N + 1):
        for ix in range(N + 1):
            i = iy * (N + 1) + ix
            xa = zs[i - 1] if ix > 0 else zs[i]
            xb = zs[i + 1] if ix < N else zs[i]
            ya = zs[i - (N + 1)] if iy > 0 else zs[i]
            yb = zs[i + (N + 1)] if iy < N else zs[i]
            slope = math.hypot((xb - xa) / (2 * d), (yb - ya) / (2 * d))
            # Rock is a SLOPE THRESHOLD, not a region: grass holds on anything it
            # can root in and gives up where it can't, which is exactly why a real
            # scarp has green fingers running down its gentler ribs.
            rock = _sstep((slope - 0.75) / 1.35)
            mud = muds[i]
            z = zs[i]
            if water:
                # SHINGLE AND SHALLOWS COME FROM THE WATER LINE, not from which piece
                # this is. A band either side of WATER_LEVEL is beach; anything below
                # it is submerged and reads dark. So a shore, a wade and the foot of
                # a sea cliff all surface themselves, and so will anything added
                # later that happens to cross the same height.
                mud = max(mud, _sstep(1.0 - abs(z - WATER_LEVEL) / 0.34))
                wet = _sstep((WATER_LEVEL + 0.04 - z) / 0.18)
            else:
                wet = mud * _sstep((0.06 - (z - base)) / 0.14)
            cols.append((rock, mud * (1.0 - rock * 0.7), wet, 1.0))

    faces = []
    for iy in range(N):
        for ix in range(N):
            a = iy * (N + 1) + ix
            faces.append((a, a + 1, a + N + 2, a + N + 1))

    ob = new_obj(name, verts, faces, terrain_material())
    me = ob.data
    att = me.color_attributes.new(name="wt", type='FLOAT_COLOR', domain='POINT')
    for i, c in enumerate(cols):
        att.data[i].color = c
    for p in me.polygons:
        p.use_smooth = True

    # Skirt: the ground is a SURFACE, so anywhere the map ends or steps down you
    # would otherwise see through it to the void. It hangs just below the LOWEST
    # point of this tile -- deep enough that a neighbour one step down still covers
    # it, shallow enough that it is not the biggest object in the frame, which a
    # full-depth version very much was.
    sv, sf = [], []
    drop = min(zs) - 0.45
    ring = ([(iy * (N + 1)) for iy in range(N + 1)]                      # X-
            + [(N * (N + 1) + ix) for ix in range(N + 1)]                # Y+
            + [(iy * (N + 1) + N) for iy in range(N, -1, -1)]            # X+
            + [ix for ix in range(N, -1, -1)])                           # Y-
    for i in ring:
        x, y, z = verts[i]
        sv.append((x, y, z))
        sv.append((x, y, drop))
    for k in range(len(ring) - 1):
        a = k * 2
        sf.append((a, a + 1, a + 3, a + 2))
    new_obj(name + "_skirt", sv, sf, subsoil_material())

    def sample(x, y):
        """(z, rock, mud) at a world point, from the same grid the mesh uses."""
        fx = (x + bh) / (2.0 * bh) * N
        fy = (y + bh) / (2.0 * bh) * N
        ix = max(0, min(N, int(round(fx))))
        iy = max(0, min(N, int(round(fy))))
        i = iy * (N + 1) + ix
        return zs[i], cols[i][0], cols[i][1]

    # How deep this tile's own skirt hangs. The water volume needs it: its sides
    # must not outrun the earth that is supposed to hide them.
    sample.floor = drop
    return sample


# --- scatter ----------------------------------------------------------------

def _lump(name, cx, cy, cz, r, mat, seed, squash=0.6, rough=0.30, rings=9, segs=12):
    """A rounded, irregular mass -- boulder, clod, tussock base.

    A sphere pushed around by noise, smooth shaded. This is the replacement for
    box(): nothing in a landscape has a machined edge, and a bevelled cube still
    reads as a cube at 64 pixels."""
    verts, faces = [], []
    for i in range(rings + 1):
        th = math.pi * i / rings
        for j in range(segs):
            ph = 2.0 * math.pi * j / segs
            dx = math.sin(th) * math.cos(ph)
            dy = math.sin(th) * math.sin(ph)
            dz = math.cos(th)
            n = (_vnoise(dx * 2.0 + 4.0, dy * 2.0 + 4.0, 64, seed)
                 + _vnoise(dz * 2.3 + 4.0, dx * 1.7 + 4.0, 64, seed + 17)) * 0.5
            k = r * (1.0 + rough * (n - 0.5) * 2.0)
            verts.append((cx + dx * k, cy + dy * k, cz + dz * k * squash))
    for i in range(rings):
        for j in range(segs):
            a = i * segs + j
            b = i * segs + (j + 1) % segs
            faces.append((a, b, b + segs, a + segs))
    ob = new_obj(name, verts, faces, mat)
    for p in ob.data.polygons:
        p.use_smooth = True
    return ob


def _scarp_line(a, seed, freq_scale=1.0):
    """Where the break runs, and how far it takes to run out, at along-edge `a`.

    Factored out of _scarp because the ROCK has to stand on the same line the
    ground breaks along -- if the crags are placed from their own noise they sit
    in front of the slope or behind it, and the two never look like one landform."""
    line = (0.52
            + 0.115 * (_fbm1(a, seed + 31, 2, 2) - 0.5) * 2.0
            + 0.045 * (_fbm1(a, seed + 57, 2, 5) - 0.5) * 2.0)
    w = SCARP_W * (0.60 + 1.30 * _fbm1(a, seed + 83, 2, 3))
    return line, w


def _poly_rock(name, cx, cy, z0, rx, ry, h, mat, seed, sides=8, rings=3,
               jag=0.34, lean=(0.0, 0.0), taper=0.82, crest=0.30, rotz=0.0,
               zmax=None):
    """One fractured block: an irregular prism with a broken top.

    THIS IS WHY THE FIRST TWO PASSES FAILED. A cliff is not a smooth surface and it
    is not a stack of cubes -- it is rock that has PARTED along planes, so what the
    eye reads is flat facets meeting at hard angles, with deep shadowed cracks
    between the columns and a top edge that is broken rather than level. A height
    field cannot make any of that (it has one z per point, so no undercut and no
    crack), and box() cannot either (six faces, all square, all parallel).

    An n-gon prism with a jittered radius per ring gives the facets and the vertical
    fluting; a per-vertex broken top gives the crest; leaning the top off the base
    gives the overhang. Flat-shaded on purpose: smoothing rock is what turned the
    last pass into poured concrete.

    `zmax` CLAMPS the whole block. Nothing on a tile may stand above the walkable
    surface it belongs to: the runtime reads one height per pixel, so a crag poking
    over the crest tells it the plateau is taller than it is and everything standing
    up there sorts behind rock that is actually below it. The crest breaks DOWNWARD
    for the same reason -- chips come off the top, they do not grow out of it."""
    verts, faces = [], []
    rng = random.Random(seed)
    ang = [2.0 * math.pi * i / sides + rng.uniform(-0.18, 0.18) for i in range(sides)]
    rad = [1.0 + jag * (rng.random() - 0.5) * 2.0 for _ in range(sides)]
    for k in range(rings + 1):
        t = k / float(rings)
        sc = 1.0 + (taper - 1.0) * t
        # each bed sits at its own slightly different girth: that step in the
        # silhouette is the bedding plane you see banding a real face
        bed = 1.0 + 0.13 * (rng.random() - 0.5) * 2.0
        for i in range(sides):
            r = rad[i] * sc * bed
            z = z0 + h * t
            if k == rings:
                z -= h * crest * rng.random()              # broken crest, DOWN only
            if zmax is not None and z > zmax:
                z = zmax
            verts.append((cx + lean[0] * t + math.cos(ang[i] + rotz) * rx * r,
                          cy + lean[1] * t + math.sin(ang[i] + rotz) * ry * r,
                          z))
    for k in range(rings):
        for i in range(sides):
            a = k * sides + i
            b = k * sides + (i + 1) % sides
            faces.append((a, b, b + sides, a + sides))
    top = rings * sides
    faces.append(tuple(range(top, top + sides)))
    faces.append(tuple(reversed(range(sides))))
    ob = new_obj(name, verts, faces, mat)
    for p in ob.data.polygons:
        p.use_smooth = False
    return ob


def add_crags(seed, sample, cap, base=0.0):
    """Rock on the face, placed from the SURFACE rather than from a cliff line.

    The first version walked the analytic break line and stood a row of columns on
    it. That works for a straight scarp and for nothing else: an inside corner has
    two lines meeting, an outside corner has one wrapping round, a ramp has a gap in
    the middle, and a sea cliff starts underwater. Each would have needed its own
    placement rule, and every one of those rules would have been a restatement of
    the same fact -- rock goes where the ground is steep.

    So ask the ground. The surface sampler already returns the slope-derived rock
    weight per point, so walking a jittered grid and building where that weight is
    high covers every shape in the set, including ones not written yet.

    Nothing may rise above `cap`: the runtime reads ONE height per pixel, so a crag
    poking over the crest tells it the plateau is taller than it is, and everything
    standing up there sorts behind rock that is really below it."""
    m_rock = rock_material()
    rng = random.Random(seed * 61 + 17)
    lim = HALF * 0.99
    step = 0.34
    n = 0
    y = -lim
    while y <= lim:
        x = -lim
        while x <= lim:
            px = x + rng.uniform(-0.13, 0.13)
            py = y + rng.uniform(-0.13, 0.13)
            if abs(px) > lim or abs(py) > lim:
                x += step
                continue
            z, rock, mud = sample(px, py)
            if rock > 0.42 and rng.random() < 0.88:
                r = rng.uniform(0.20, 0.40)
                h = rng.uniform(0.45, 1.05)
                _poly_rock("crag%d" % n, px, py, z - h * rng.uniform(0.45, 0.8),
                           r, r * rng.uniform(0.7, 1.4), h, m_rock, seed * 977 + n,
                           sides=rng.randint(6, 8), rings=rng.randint(1, 2),
                           jag=rng.uniform(0.14, 0.30),
                           taper=rng.uniform(0.84, 1.02),
                           crest=0.35, rotz=rng.uniform(0.0, 1.2), zmax=cap)
                n += 1
            elif 0.14 < rock <= 0.42 and rng.random() < 0.30:
                # SCREE. Angular, because it broke off the face above and has not
                # travelled far enough to round off. Rounded boulders belong out in
                # the field, not at the foot of a cliff.
                s = rng.uniform(0.045, 0.15)
                _poly_rock("scree%d" % n, px, py, z - s * 0.5, s,
                           s * rng.uniform(0.6, 1.5), s * rng.uniform(0.8, 1.9),
                           m_rock, seed * 31 + n, sides=rng.randint(5, 7), rings=1,
                           jag=0.30, taper=rng.uniform(0.6, 1.0), crest=0.25,
                           rotz=rng.uniform(0, 3.14), zmax=cap)
                n += 1
            x += step
        y += step
    return n


def water_material():
    """Flat water. Opaque on purpose.

    A transparent surface would need the bed rendered through it, which costs
    nothing in Cycles and everything downstream: the height pass would report the
    BED where the runtime needs the SURFACE, so a token standing in the shallows
    would sink to the bottom of the lake. Opaque teal with banded highlights is also
    what the references draw, so the cheap answer and the right-looking one agree."""
    m = bpy.data.materials.get("water")
    if m:
        return m
    t = theme()
    c = t.get("water", (0.09, 0.26, 0.30))
    m = bpy.data.materials.new("water")
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes["Principled BSDF"]
    b.inputs["Roughness"].default_value = 0.35

    swell = _noise_node(nt, 3.0, 3.0, 0.5).outputs["Fac"]
    ripple = _noise_node(nt, 13.0, 5.0, 0.7).outputs["Fac"]
    col = _mix(nt, tuple(x * 0.72 for x in c), tuple(min(1.0, x * 1.5) for x in c),
               _band(nt, swell, 0.0, 1.0, 0.42, 0.60))
    col = _mix(nt, col, tuple(min(1.0, x * 2.1) for x in c),
               _band(nt, ripple, 0.0, 0.55, 0.50, 0.64))
    # glints: the bright dashes on the surface in every one of the references
    col = _mix(nt, col, (0.62, 0.78, 0.80), _dots(nt, 22.0, 0.12, 0.10))
    steps = t.get("posterize")
    if steps:
        col = _posterize(nt, col, steps)
    nt.links.new(col, b.inputs["Base Color"])
    return m


def add_water_plane(z=None, floor=None):
    """The water: a VOLUME, not a plane.

    A bare quad at the water line left the surface hovering over the bed with a
    daylight gap between the two -- the tile read as a blue sheet floating above a
    brown box. Water has to fill the tile the way the ground does, so this is a top
    face plus four sides running down past the bottom of the terrain skirt.

    The sides are held a hair INSIDE the lattice cell so that wherever the ground
    also reaches the boundary -- the grass half of a shore, say -- the terrain skirt
    covers them instead of the two fighting over the same plane."""
    z = WATER_LEVEL if z is None else z
    bh = _bh()
    top = [(-bh, -bh, z), (bh, -bh, z), (bh, bh, z), (-bh, bh, z)]
    new_obj("water", top, [(0, 1, 2, 3)], water_material())

    ih = bh * 0.998
    # Down to the TILE'S OWN skirt, not to a fixed depth. A pond in a meadow sits in
    # ground that is barely cut at all, so a full-depth water box hung a band of
    # blue below the earth all the way round the tile -- the wallow looked like it
    # was floating on a lake.
    floor = (BED_Z - 0.5) if floor is None else floor
    ring = [(-ih, -ih), (ih, -ih), (ih, ih), (-ih, ih), (-ih, -ih)]
    verts, faces = [], []
    for x, y in ring:
        verts.append((x, y, z))
        verts.append((x, y, floor))
    for k in range(len(ring) - 1):
        a = k * 2
        faces.append((a, a + 1, a + 3, a + 2))
    new_obj("water_side", verts, faces, water_deep_material())


def water_deep_material():
    """The water seen edge-on. Darker than the surface and flat -- what you get
    looking into a body of water is not what you get looking across it."""
    m = bpy.data.materials.get("water_deep")
    if m:
        return m
    t = theme()
    c = t.get("water", (0.075, 0.235, 0.275))
    m = bpy.data.materials.new("water_deep")
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes["Principled BSDF"]
    b.inputs["Roughness"].default_value = 0.6
    col = _mix(nt, tuple(x * 0.30 for x in c), tuple(x * 0.62 for x in c),
               _band(nt, _noise_node(nt, 5.0, 3.0, 0.5).outputs["Fac"],
                     0.0, 1.0, 0.42, 0.60))
    steps = t.get("posterize")
    if steps:
        col = _posterize(nt, col, steps)
    nt.links.new(col, b.inputs["Base Color"])
    return m


def terrain_scatter(sample, base, seed):
    """What has real VOLUME sits on the ground as geometry; everything else is in
    the texture.

    Grass used to be modelled -- thousands of tapered ribbons. It looked right in
    isolation and was wrong for this pipeline: the bake writes ONE height per pixel,
    so a blade standing 20cm proud tells the runtime the ground is 20cm higher than
    it is, and every token, prop and shadow standing in that grass sorts against the
    tips instead of the soil. Flat ground with grass IN THE ALBEDO composites
    correctly and costs nothing. Only things a character would actually walk around
    -- boulders, scree, the crag face -- are still geometry."""
    rng = random.Random(seed * 31 + 5)
    m_rock = rock_material()
    lim = HALF * 0.98

    # Field stones: rounded, because out in the grass they have been there long
    # enough to be. The angular rubble belongs at the foot of the face -- add_crags.
    for n in range(rng.randint(7, 13)):
        x, y = rng.uniform(-lim, lim), rng.uniform(-lim, lim)
        z, rock, mud = sample(x, y)
        if rock > 0.35 or rng.random() < 0.35:
            continue
        r = rng.uniform(0.09, 0.26)
        _lump("stone%d" % n, x, y, z - r * rng.uniform(0.35, 0.65), r, m_rock,
              seed * 13 + n, squash=rng.uniform(0.35, 0.70),
              rough=rng.uniform(0.24, 0.40))


# --- material ---------------------------------------------------------------

def _objcoord(nt):
    """One Object-space texture coordinate per material, NORMALISED BY TILE SIZE.

    Object coordinates run -HALF..HALF, four times the 0..1 range of the Generated
    coordinates they replaced -- so every texture scale in this file, all of them
    tuned against the old range, suddenly meant features four times too big and the
    ground went almost uniform. Dividing by SIZE restores the range without having
    to retune a dozen numbers, and keeps the property that actually matters: the
    mapping is the same for every tile in the set, whatever shape its mesh is."""
    for n in nt.nodes:
        if n.name.startswith("_objcoord"):
            return n.outputs["Vector"]
    tc = nt.nodes.new("ShaderNodeTexCoord")
    mp = nt.nodes.new("ShaderNodeMapping")
    mp.name = "_objcoord"
    mp.inputs["Scale"].default_value = (1.0 / SIZE, 1.0 / SIZE, 1.0 / SIZE)
    nt.links.new(tc.outputs["Object"], mp.inputs["Vector"])
    return mp.outputs["Vector"]


def _noise_node(nt, scale, detail=6.0, rough=0.55):
    """Noise in OBJECT space.

    A procedural texture with nothing wired to its Vector input falls back to
    GENERATED coordinates, which are the object's own bounding box normalised to
    0..1. That is invisible while every tile is the same shape and catastrophic the
    moment they are not: a plateau tile whose mesh sits at z=1.8 and a flat one at
    z=0 get completely different mappings, so the same material paints them at
    different scales and different offsets. That is exactly what made the raised
    tiles read as washed-out grey squares next to green ones, and what made the
    water and the shores look like they came from different sets.

    Object space is the tile's own frame, identical for every piece in the set, so
    the material means the same thing everywhere."""
    n = nt.nodes.new("ShaderNodeTexNoise")
    n.inputs["Scale"].default_value = scale
    n.inputs["Detail"].default_value = detail
    n.inputs["Roughness"].default_value = rough
    nt.links.new(_objcoord(nt), n.inputs["Vector"])
    return n


def _mix(nt, a, b, fac, blend='MIX'):
    m = nt.nodes.new("ShaderNodeMixRGB")
    m.blend_type = blend
    if hasattr(fac, "default_value") or hasattr(fac, "links"):
        nt.links.new(fac, m.inputs["Fac"])
    else:
        m.inputs["Fac"].default_value = fac
    for slot, val in (("Color1", a), ("Color2", b)):
        if isinstance(val, tuple):
            m.inputs[slot].default_value = (val[0], val[1], val[2], 1.0)
        else:
            nt.links.new(val, m.inputs[slot])
    return m.outputs["Color"]


def plant_material(name, rgb, spread=0.34, rough=0.72):
    """A plain mottled colour. Used for the subsoil skirt; kept general because it
    is the cheapest way to give a surface variation without the stone-aging passes
    in mkmat, which are wrong on anything that is not dungeon masonry."""
    m = bpy.data.materials.get("plant_" + name)
    if m:
        return m
    m = bpy.data.materials.new("plant_" + name)
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes["Principled BSDF"]
    b.inputs["Roughness"].default_value = rough
    dark = tuple(c * (1.0 - spread) for c in rgb)
    light = tuple(min(1.0, c * (1.0 + spread)) for c in rgb)
    col = _mix(nt, dark, light, _noise_node(nt, 24.0, 5.0, 0.6).outputs["Fac"])
    nt.links.new(col, b.inputs["Base Color"])
    return m


def _cut(nt, sock, at, invert=False):
    """Hard threshold: 1 on one side of `at`, 0 on the other."""
    r = nt.nodes.new("ShaderNodeValToRGB")
    r.color_ramp.interpolation = 'CONSTANT'
    r.color_ramp.elements[0].position = 0.0
    r.color_ramp.elements[1].position = at
    a = (1.0, 1.0, 1.0, 1.0) if invert else (0.0, 0.0, 0.0, 1.0)
    b = (0.0, 0.0, 0.0, 1.0) if invert else (1.0, 1.0, 1.0, 1.0)
    r.color_ramp.elements[0].color = a
    r.color_ramp.elements[1].color = b
    nt.links.new(sock, r.inputs["Fac"])
    return r.outputs["Color"]


def _cracks(nt, scale, width, randomness=1.0):
    """Dark lines along the boundaries between Voronoi cells.

    This is the single node that separates the painted look in the references from
    the photoreal one. Rock in all three of them is read as FLAT FACETS SEPARATED BY
    DARK LINES -- not as a noise field. Voronoi's distance-to-edge output is exactly
    that: near zero on a cell boundary, larger inside, so thresholding it gives a
    crack network that follows real cell shapes instead of a scribble."""
    v = nt.nodes.new("ShaderNodeTexVoronoi")
    v.feature = 'DISTANCE_TO_EDGE'
    v.inputs["Scale"].default_value = scale
    v.inputs["Randomness"].default_value = randomness
    nt.links.new(_objcoord(nt), v.inputs["Vector"])   # see _noise_node
    return _band(nt, v.outputs["Distance"], 1.0, 0.0, 0.0, width)


def _facets(nt, scale, randomness=1.0):
    """A random value per Voronoi cell -- one flat shade per block of stone."""
    v = nt.nodes.new("ShaderNodeTexVoronoi")
    v.feature = 'F1'
    v.inputs["Scale"].default_value = scale
    v.inputs["Randomness"].default_value = randomness
    nt.links.new(_objcoord(nt), v.inputs["Vector"])   # see _noise_node
    sep = nt.nodes.new("ShaderNodeSeparateColor")
    nt.links.new(v.outputs["Color"], sep.inputs["Color"])
    return sep.outputs[0]


def _dots(nt, scale, radius, keep):
    """Scattered round dots -- wildflowers, without modelling one.

    The first attempt thresholded a narrow band of smooth noise, which does not give
    dots: a level set of a continuous field is a CONTOUR, so the ground came out
    covered in confetti squiggles. Voronoi has actual cell centres, so `distance <
    radius` really is a disc, and a second threshold on the cell's own random value
    keeps only some of the cells -- otherwise every cell has a flower and a meadow
    turns into polka dots."""
    v = nt.nodes.new("ShaderNodeTexVoronoi")
    v.feature = 'F1'
    v.inputs["Scale"].default_value = scale
    nt.links.new(_objcoord(nt), v.inputs["Vector"])   # see _noise_node
    disc = _cut(nt, v.outputs["Distance"], radius, invert=True)
    sep = nt.nodes.new("ShaderNodeSeparateColor")
    nt.links.new(v.outputs["Color"], sep.inputs["Color"])
    some = _cut(nt, sep.outputs[0], 1.0 - keep, invert=False)
    m = nt.nodes.new("ShaderNodeMixRGB")
    m.blend_type = 'MULTIPLY'
    m.inputs["Fac"].default_value = 1.0
    nt.links.new(disc, m.inputs["Color1"])
    nt.links.new(some, m.inputs["Color2"])
    return m.outputs["Color"]


def _edge_fade(nt, inner=0.72):
    """1 in the middle of the tile, falling to 0 at its border.

    Used to switch AMBIENT OCCLUSION off near the edges. AO has nothing to occlude
    it at the boundary of a mesh, so the outer ring of every tile bakes brighter
    than its interior; posterising snaps that into a band of its own, and abutted
    on the lattice it draws a pale line around every tile -- the seam grid over a
    finished map. Overshooting the mesh helps but cannot fix it, because the bright
    ring then lands inside the NEIGHBOUR and whichever tile is painted second wins.

    Fading the term instead fixes it at the source: the edge of a tile is not really
    open sky, it is the middle of a continuous landscape, and AO there is a lie the
    renderer tells because it cannot see the next tile."""
    tc = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(tc.outputs["Object"], sep.inputs["Vector"])
    ax = nt.nodes.new("ShaderNodeMath"); ax.operation = 'ABSOLUTE'
    nt.links.new(sep.outputs["X"], ax.inputs[0])
    ay = nt.nodes.new("ShaderNodeMath"); ay.operation = 'ABSOLUTE'
    nt.links.new(sep.outputs["Y"], ay.inputs[0])
    mx = nt.nodes.new("ShaderNodeMath"); mx.operation = 'MAXIMUM'
    nt.links.new(ax.outputs[0], mx.inputs[0])
    nt.links.new(ay.outputs[0], mx.inputs[1])
    r = nt.nodes.new("ShaderNodeMapRange")
    r.inputs["From Min"].default_value = HALF * inner
    r.inputs["From Max"].default_value = HALF
    r.inputs["To Min"].default_value = 1.0
    r.inputs["To Max"].default_value = 0.0
    nt.links.new(mx.outputs[0], r.inputs["Value"])
    return r.outputs["Result"]


def _flatness(nt, lo=0.55, hi=0.92):
    """1 where a surface faces up, 0 where it stands vertical.

    The shading normal's Z IS the cosine of the slope, so this is the whole trick
    behind a moss/snow/scree layer: mask a material by which way the surface points
    and it lands only where that material could physically stay. Doing it in the
    SHADER rather than per-vertex on the CPU means it also works on geometry that
    carries no vertex weights -- the crags, the scree, the boulders -- which is why
    the rock face can grow moss on its ledges and nothing on its walls."""
    geo = nt.nodes.new("ShaderNodeNewGeometry")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(geo.outputs["Normal"], sep.inputs["Vector"])
    r = nt.nodes.new("ShaderNodeMapRange")
    r.inputs["From Min"].default_value = lo
    r.inputs["From Max"].default_value = hi
    nt.links.new(sep.outputs["Z"], r.inputs["Value"])
    return r.outputs["Result"]


def _mul(nt, a, b):
    m = nt.nodes.new("ShaderNodeMath")
    m.operation = 'MULTIPLY'
    nt.links.new(a, m.inputs[0])
    nt.links.new(b, m.inputs[1])
    return m.outputs[0]


def _max(nt, a, b):
    m = nt.nodes.new("ShaderNodeMath")
    m.operation = 'MAXIMUM'
    nt.links.new(a, m.inputs[0])
    nt.links.new(b, m.inputs[1])
    return m.outputs[0]


def _posterize(nt, col, steps):
    """Snap a colour to `steps` levels per channel.

    Pixel art does not have gradients -- it has a small number of flat values with
    hard boundaries between them, and that quantisation is most of what the eye
    reads as "pixel art" before it ever notices the resolution. A 3D render is all
    gradient by default (ambient occlusion alone puts a smooth ramp into every
    corner), so the bands have to be put back deliberately."""
    sep = nt.nodes.new("ShaderNodeSeparateColor")
    sep.mode = 'HSV'
    nt.links.new(col, sep.inputs["Color"])
    comb = nt.nodes.new("ShaderNodeCombineColor")
    comb.mode = 'HSV'
    nt.links.new(sep.outputs[0], comb.inputs[0])       # hue, untouched
    nt.links.new(sep.outputs[1], comb.inputs[1])       # saturation, untouched
    # Quantise to band CENTRES, not to multiples of the step: a plain snap rounds
    # everything below half a step down to zero, so the darkest band becomes pure
    # black and every shadowed area -- mud, a wallow, the foot of a scarp -- goes to
    # a hole. floor(v*n)+0.5 over n keeps the lowest band at half a step instead.
    mul = nt.nodes.new("ShaderNodeMath"); mul.operation = 'MULTIPLY'
    mul.inputs[1].default_value = float(steps)
    nt.links.new(sep.outputs[2], mul.inputs[0])
    flr = nt.nodes.new("ShaderNodeMath"); flr.operation = 'FLOOR'
    nt.links.new(mul.outputs[0], flr.inputs[0])
    add = nt.nodes.new("ShaderNodeMath"); add.operation = 'ADD'
    add.inputs[1].default_value = 0.5
    nt.links.new(flr.outputs[0], add.inputs[0])
    div = nt.nodes.new("ShaderNodeMath"); div.operation = 'DIVIDE'
    div.inputs[1].default_value = float(steps)
    nt.links.new(add.outputs[0], div.inputs[0])
    nt.links.new(div.outputs[0], comb.inputs[2])       # value, banded
    return comb.outputs["Color"]


def _band(nt, sock, lo, hi, f0=None, f1=None):
    """Remap a noise into lo..hi, optionally stretching f0..f1 to fill it first.

    Noise runs 0..1 but it is NOT uniform -- Perlin clusters hard around 0.5, so a
    plain 0..1 mix factor sits near a half-and-half blend of the two colours almost
    everywhere. That averages instead of choosing, and it is why two separate
    passes of this material came back flat: first uniformly grey, then a flat green
    with the grass layers invisible even though the node graph was wired correctly.

    Passing f0/f1 clamps and stretches the part of the distribution the noise
    actually occupies (roughly 0.35..0.65), which is what turns a mix factor into
    a decision. Leave them off for a genuine wash."""
    r = nt.nodes.new("ShaderNodeMapRange")
    if f0 is not None:
        r.inputs["From Min"].default_value = f0
        r.inputs["From Max"].default_value = f1
    r.inputs["To Min"].default_value = lo
    r.inputs["To Max"].default_value = hi
    nt.links.new(sock, r.inputs["Value"])
    return r.outputs["Result"]


def subsoil_material():
    """The cut face under the turf, seen wherever the ground drops away.

    It was a flat brown wash, which is what made every level change read as a
    cardboard box with a lawn on top. Real cut earth is BEDDED -- a dark humus lip
    right under the grass, paler subsoil below it, and stones caught in the layers.
    All three come from squashing the noise flat so it varies with height and barely
    across the face, which is the same trick the rock uses for its bedding."""
    m = bpy.data.materials.get("subsoil")
    if m:
        return m
    t = theme()
    e = t["mortar"]
    g = t["stone"]
    r = t.get("rock", (0.30, 0.20, 0.125))
    m = bpy.data.materials.new("subsoil")
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes["Principled BSDF"]
    b.inputs["Roughness"].default_value = 0.97

    # Two or three beds down the whole cut, not a stack of veneer: the skirt is
    # only about half a unit deep, so a fine vertical frequency reads as plywood.
    strat = _noise_node(nt, 3.0, 3.0, 0.55)
    mp = nt.nodes.new("ShaderNodeMapping")
    mp.inputs["Scale"].default_value = (0.25, 0.25, 2.2)
    nt.links.new(_objcoord(nt), mp.inputs["Vector"])
    nt.links.new(mp.outputs["Vector"], strat.inputs["Vector"])
    grain = _noise_node(nt, 26.0, 5.0, 0.62).outputs["Fac"]

    col = _mix(nt, tuple(c * 0.62 for c in e), tuple(min(1.0, c * 1.55) for c in e),
               _band(nt, strat.outputs["Fac"], 0.0, 1.0, 0.40, 0.60))
    col = _mix(nt, col, tuple(c * 0.55 for c in e), _band(nt, grain, 0.0, 0.35))
    # stones caught in the bank
    col = _mix(nt, col, tuple(min(1.0, c * 1.15) for c in r), _dots(nt, 20.0, 0.16, 0.28))
    col = _mix(nt, col, tuple(c * 0.55 for c in r), _dots(nt, 31.0, 0.13, 0.22))
    # the dark humus lip immediately under the turf: a band in the tile's own
    # height, so it tracks the top of the cut however deep the cut happens to be
    tc = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(tc.outputs["Object"], sep.inputs["Vector"])
    lip = nt.nodes.new("ShaderNodeMapRange")
    lip.inputs["From Min"].default_value = -0.30
    lip.inputs["From Max"].default_value = -0.02
    nt.links.new(sep.outputs["Z"], lip.inputs["Value"])
    col = _mix(nt, col, (g[0] * 0.85, g[1] * 0.70, g[2] * 0.60), lip.outputs["Result"])

    steps = t.get("posterize")
    if steps:
        col = _posterize(nt, col, steps)
    nt.links.new(col, b.inputs["Base Color"])
    return m


def rock_material():
    """Bare rock: crags, scree, boulders.

    NOT mkmat. That one ages dungeon stone -- it lightens convex edges (a boot has
    knocked the corner off this block) and adds a mineral speck. On a fractured
    crag every facet is a convex edge, so the wear pass fired everywhere at once
    and the whole face came back pale and hazy with what looked like snow on it.
    Rock wants the opposite: dark, warm, and built out of FLAT FACETS SEPARATED BY
    DARK CRACKS. That is what the painted references are made of -- not a noise
    field, which is what a fine bedding texture gives and which reads as stacked
    pancakes at tile scale. See _cracks and _facets."""
    m = bpy.data.materials.get("rock")
    if m:
        return m
    t = theme()
    r = t.get("rock", (0.30, 0.29, 0.27))
    g = t["stone"]
    m = bpy.data.materials.new("rock")
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes["Principled BSDF"]
    b.inputs["Roughness"].default_value = 0.92

    # FACETS AND CRACKS, not a noise field. Two scales of Voronoi: big cells are the
    # blocks the rock has parted into, small ones are the fractures across a single
    # block face. Each cell takes its own flat shade and the boundaries between them
    # go dark, which is what the painted references are actually made of.
    blocks = _facets(nt, 3.4)
    chips = _facets(nt, 8.0)
    crack_a = _cracks(nt, 3.4, 0.075)
    crack_b = _cracks(nt, 8.0, 0.030)
    patch = _noise_node(nt, 2.2, 3.0, 0.5).outputs["Fac"]
    grain = _noise_node(nt, 40.0, 6.0, 0.66).outputs["Fac"]
    # a little bedding still, squashed flat so it bands with height on a face
    strat = _noise_node(nt, 9.0, 3.0, 0.55)
    mp = nt.nodes.new("ShaderNodeMapping")
    mp.inputs["Scale"].default_value = (0.18, 0.18, 2.4)
    tc = nt.nodes.new("ShaderNodeTexCoord")
    nt.links.new(tc.outputs["Object"], mp.inputs["Vector"])
    nt.links.new(mp.outputs["Vector"], strat.inputs["Vector"])

    col = _mix(nt, tuple(c * 0.55 for c in r), tuple(min(1.0, c * 1.62) for c in r),
               _band(nt, blocks, 0.0, 1.0))
    col = _mix(nt, col, tuple(min(1.0, c * 1.25) for c in r),
               _band(nt, chips, 0.0, 0.55))
    col = _mix(nt, col, (r[0] * 1.35, r[1] * 1.0, r[2] * 0.62),
               _band(nt, patch, 0.0, 0.45))                     # iron staining
    col = _mix(nt, col, tuple(c * 0.80 for c in r),
               _band(nt, strat.outputs["Fac"], 0.0, 0.45, 0.40, 0.60))
    col = _mix(nt, col, tuple(c * 0.55 for c in r), _band(nt, grain, 0.0, 0.18))
    # A rock's upward faces are the bright ones in every one of the references --
    # the lit lip along the top of a scarp is most of what makes it read as a drop.
    col = _mix(nt, col, tuple(min(1.0, c * 1.75) for c in r),
               _band(nt, _flatness(nt, 0.55, 0.95), 0.0, 0.55))
    col = _mix(nt, col, tuple(c * 0.42 for c in r), crack_b)    # fractures
    col = _mix(nt, col, tuple(c * 0.16 for c in r), crack_a)    # block boundaries
    col = _mix(nt, col, (g[0] * 0.95, g[1] * 0.90, g[2] * 0.75),
               _band(nt, patch, 0.0, 0.22))                     # lichen, sparingly

    # LEDGE PLANTING. Anything that grows on a cliff grows on the bits of it that
    # face up: a bed that weathered back, the top of a fallen block, the crest. The
    # flatness mask finds those without anybody having to model or mark them, and
    # the noise keeps it patchy so it reads as colonised rather than painted.
    ledge = _mul(nt, _flatness(nt, 0.42, 0.86),
                 _band(nt, _noise_node(nt, 4.0, 4.0, 0.6).outputs["Fac"],
                       0.0, 1.0, 0.40, 0.60))
    moss = t.get("moss", (0.26, 0.47, 0.10))
    col = _mix(nt, col, moss, ledge)
    col = _mix(nt, col, tuple(c * 0.62 for c in moss),
               _mul(nt, ledge, _band(nt, grain, 0.0, 0.7)))
    col = _mix(nt, col, tuple(min(1.0, c * 1.35) for c in moss),
               _mul(nt, ledge, _band(nt, chips, 0.0, 0.5)))

    # The crack between two columns is a deep narrow gap, and AO is the only thing
    # in a light-free bake that knows it is deep. Run it hard.
    ao = nt.nodes.new("ShaderNodeAmbientOcclusion")
    ao.inputs["Distance"].default_value = 0.9
    inv = nt.nodes.new("ShaderNodeInvert")
    nt.links.new(ao.outputs["AO"], inv.inputs["Color"])
    col = _mix(nt, col, (0.09, 0.09, 0.08), _band(nt, inv.outputs["Color"], 0.0, 1.0),
               blend='MULTIPLY')
    steps = t.get("posterize")
    if steps:
        col = _posterize(nt, col, steps)
    nt.links.new(col, b.inputs["Base Color"])

    bmp = nt.nodes.new("ShaderNodeBump")
    bmp.inputs["Strength"].default_value = 0.6
    bmp.inputs["Distance"].default_value = 0.05
    nt.links.new(_mix(nt, _mix(nt, grain, strat.outputs["Fac"], 0.45),
                      crack_a, 0.5), bmp.inputs["Height"])
    nt.links.new(bmp.outputs["Normal"], b.inputs["Normal"])
    return m


def terrain_material():
    """ONE material for the whole landscape, mixed by the weights the surface
    computed for itself.

    Three materials on three objects would put a hard boundary wherever they meet,
    and that boundary is exactly the thing that made the first pass read as green
    paint on grey blocks. Here sward, mud and rock are a gradient in a single
    shader, so the transition is as soft as the slope that drives it.

    Everything is mixed DARK. The bake carries no key light -- the runtime torches
    multiply against this -- so a surface that is already bright has nowhere to go
    when it is lit, and a rock face at 0.55 albedo reads as poured concrete under
    every light in the game."""
    m = bpy.data.materials.get("terrain")
    if m:
        return m
    t = theme()
    m = bpy.data.materials.new("terrain")
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes["Principled BSDF"]

    att = nt.nodes.new("ShaderNodeAttribute")
    att.attribute_name = "wt"
    sep = nt.nodes.new("ShaderNodeSeparateColor")
    nt.links.new(att.outputs["Color"], sep.inputs["Color"])
    w_rock, w_mud, w_wet = sep.outputs[0], sep.outputs[1], sep.outputs[2]

    patch = _noise_node(nt, 1.6, 3.0, 0.50).outputs["Fac"]    # region drift
    clump = _noise_node(nt, 9.0, 6.0, 0.60).outputs["Fac"]    # clump scale
    grain = _noise_node(nt, 22.0, 5.0, 0.62).outputs["Fac"]   # surface grain

    def shades(rgb, dark, light):
        return (tuple(c * dark for c in rgb), tuple(min(1.0, c * light) for c in rgb))

    # GRASS IS TEXTURE, NOT GEOMETRY (see terrain_scatter) -- and it is FLAT.
    #
    # ALL OF IT HAS TO BE ALBEDO. The bake is lit by a uniform white world with no
    # key (add_lighting), so a normal that tilts receives exactly the same light as
    # one that does not -- bump contributes NOTHING to this image. It still matters,
    # because it is what the _NRM pass exports for the runtime torches to catch, but
    # anything that has to read in the baked tile must be a colour difference.
    #
    # An earlier pass covered the ground in fine crossed blade-streaks. It was more
    # faithful to a photograph and less faithful to the brief: the references are
    # BROAD FLAT FIELDS OF COLOUR with a few sparse marks on them, and continuous
    # fine texture is what stops a tile reading that way -- it turns a green field
    # into green fur and it fights every prop standing on it. So: two or three
    # tones of green over large areas, and marks you can count.
    broad = _noise_node(nt, 2.4, 2.0, 0.45).outputs["Fac"]     # which green, roughly
    drift = _noise_node(nt, 5.5, 3.0, 0.55).outputs["Fac"]     # softer second tone

    g = t["stone"]
    blade = t.get("blade", tuple(min(1.0, c * 1.35) for c in g))
    sward = _mix(nt, g, blade, _band(nt, broad, 0.0, 1.0, 0.42, 0.60))
    sward = _mix(nt, sward, tuple(c * 0.70 for c in g),
                 _band(nt, drift, 0.0, 0.85, 0.44, 0.62))
    # sun-bleached, drier ground: a whole region, not a speckle
    sward = _mix(nt, sward, (g[0] * 1.8, g[1] * 1.30, g[2] * 0.80),
                 _band(nt, patch, 0.0, 0.40, 0.46, 0.62))
    # moss in the hollows -- again a region, with a soft edge
    sward = _mix(nt, sward, t.get("moss", (0.26, 0.47, 0.10)),
                 _band(nt, _noise_node(nt, 4.2, 3.0, 0.5).outputs["Fac"],
                       0.0, 1.0, 0.54, 0.66))
    # DAPPLING. Mid-frequency mottle, added back after the flat pass read as too
    # bare. It is safe here in a way it was not before posterising: quantised to
    # seven value bands and dropped to a quarter resolution, fine noise stops being
    # fuzz and becomes flat irregular patches -- which is what hand-drawn grass in
    # the references actually is. Two scales so the patches nest.
    sward = _mix(nt, sward, tuple(min(1.0, c * 1.30) for c in blade),
                 _band(nt, _noise_node(nt, 11.0, 5.0, 0.60).outputs["Fac"],
                       0.0, 0.85, 0.42, 0.62))
    sward = _mix(nt, sward, tuple(c * 0.74 for c in g),
                 _band(nt, _noise_node(nt, 19.0, 6.0, 0.65).outputs["Fac"],
                       0.0, 0.75, 0.44, 0.64))
    sward = _mix(nt, sward, tuple(min(1.0, c * 1.5) for c in blade),
                 _band(nt, _noise_node(nt, 34.0, 4.0, 0.55).outputs["Fac"],
                       0.0, 0.45, 0.48, 0.66))
    # TUFT MARKS. The little scattered dashes that say "grass" in every one of the
    # references -- countable, and reading against the field they sit in.
    sward = _mix(nt, sward, tuple(c * 0.55 for c in g), _dots(nt, 16.0, 0.20, 0.42))
    sward = _mix(nt, sward, tuple(min(1.0, c * 1.55) for c in blade),
                 _dots(nt, 21.0, 0.16, 0.34))
    sward = _mix(nt, sward, tuple(c * 0.66 for c in g), _dots(nt, 29.0, 0.13, 0.26))
    # Flowers are RARE. At any density you can read as a pattern they stop being
    # flowers and become confetti -- the references have a handful per screen, not
    # per tile.
    for rgb, sc, rad, keep in (((0.60, 0.50, 0.13), 26.0, 0.09, 0.06),
                               ((0.34, 0.23, 0.48), 21.0, 0.08, 0.045),
                               ((0.66, 0.66, 0.57), 32.0, 0.07, 0.035)):
        sward = _mix(nt, sward, rgb, _dots(nt, sc, rad, keep))

    d = t.get("mud", t["mortar"])
    lo, hi = shades(d, 0.55, 1.60)
    mud = _mix(nt, lo, hi, _band(nt, clump, 0.0, 1.0, 0.40, 0.62))
    mud = _mix(nt, mud, (d[0] * 1.45, d[1] * 1.15, d[2] * 0.85),
               _band(nt, patch, 0.0, 0.55))                     # dried, dusty patches
    mud = _mix(nt, mud, tuple(c * 0.55 for c in d), _band(nt, grain, 0.0, 0.50))

    # Rock showing through the ground is the SAME rock the crags are made of, so it
    # is built the same way: flat facets, dark cracks between them.
    r = t.get("rock", (0.30, 0.20, 0.125))
    lo, hi = shades(r, 0.62, 1.42)
    rock = _mix(nt, lo, hi, _band(nt, _facets(nt, 7.0), 0.0, 1.0))
    rock = _mix(nt, rock, (r[0] * 1.30, r[1] * 1.0, r[2] * 0.65),
                _band(nt, patch, 0.0, 0.45))                      # iron staining
    rock = _mix(nt, rock, tuple(c * 0.50 for c in r), _band(nt, grain, 0.0, 0.30))
    rock = _mix(nt, rock, tuple(c * 0.22 for c in r), _cracks(nt, 18.0, 0.035))
    rock = _mix(nt, rock, tuple(c * 0.15 for c in r), _cracks(nt, 7.0, 0.05))
    # lichen: the green that lives on every real rock face, mottled not painted
    rock = _mix(nt, rock, (g[0] * 0.90, g[1] * 0.85, g[2] * 0.70),
                _band(nt, clump, 0.0, 0.45))

    col = _mix(nt, sward, mud, w_mud)
    # Rock where the surface is steep, whichever of the two ways says so: the vertex
    # weight measures the slope of the underlying FIELD, the flatness mask measures
    # the shaded normal, and the second one catches detail the grid was too coarse
    # to resolve -- the lip of a gully, the side of a boulder-sized bulge.
    col = _mix(nt, col, rock, _max(nt, w_rock, _flatness(nt, 0.86, 0.55)))
    # Wet earth goes DARK BROWN, not dark grey. Mixing toward a neutral turned the
    # wallow into asphalt -- water saturates a colour, it does not desaturate it.
    col = _mix(nt, col, (0.075, 0.050, 0.028), _band(nt, w_wet, 0.0, 0.82))

    # Ambient occlusion TINTS as well as darkens: the shade in a hollow is cool, the
    # dirt that collects there is not, and the bake has no key light to tell them
    # apart. This is what puts a dark line at the toe of a scarp and in every rut.
    ao = nt.nodes.new("ShaderNodeAmbientOcclusion")
    ao.inputs["Distance"].default_value = 1.1
    inv = nt.nodes.new("ShaderNodeInvert")
    nt.links.new(ao.outputs["AO"], inv.inputs["Color"])
    # faded to nothing at the tile border -- see _edge_fade
    col = _mix(nt, col, (0.16, 0.17, 0.12),
               _mul(nt, _band(nt, inv.outputs["Color"], 0.0, 0.9), _edge_fade(nt)),
               blend='MULTIPLY')

    steps = theme().get("posterize")
    if steps:
        col = _posterize(nt, col, steps)
    nt.links.new(col, b.inputs["Base Color"])
    b.inputs["Roughness"].default_value = 0.95

    bmp = nt.nodes.new("ShaderNodeBump")
    bmp.inputs["Strength"].default_value = 0.9
    bmp.inputs["Distance"].default_value = 0.07
    # The bump does not show in THIS image (uniform world, no key light) -- it is
    # exported by the _NRM pass for the runtime torches to catch, so it stays fine
    # even though the albedo above deliberately went flat.
    h = _mix(nt, grain, clump, 0.45)
    h = _mix(nt, h, _noise_node(nt, 48.0, 5.0, 0.7).outputs["Fac"], 0.4)
    nt.links.new(h, bmp.inputs["Height"])
    nt.links.new(bmp.outputs["Normal"], b.inputs["Normal"])
    return m


def add_terrain(name, spec, rot):
    """Outdoor tile: build the ground, then let it decide what stands on it.

    Seeded from the tile NAME and not the rotation, so `x_r90` is the same corner of
    the world as `x_r0` -- the same rule the flagstone floor keeps, and the reason a
    set does not look like four unrelated sets shuffled together."""
    seed = SEED * 977 + (zlib.crc32(name.encode()) % 99991)
    sp = dict(spec)
    for key in ("high", "arms"):
        if sp.get(key):
            sp[key] = rotate_edges(sp[key], rot)
    if sp.get("ramp"):
        sp["ramp"] = rotate_edges([sp["ramp"]], rot)[0]
    f = FIELDS[spec["terrain"]](sp, seed)
    sample = terrain_surface(f, name=name, water=bool(sp.get("water")))
    # Crags only where a level actually changes. `cap` is the top band: nothing on
    # the tile may stand above the walkable surface it belongs to.
    if spec["terrain"] in ("step", "track") and (sp.get("high") or sp.get("ramp")):
        add_crags(seed, sample, _band_z(sp.get("hi", 1)) - 0.06)
    terrain_scatter(sample, 0.0, seed)
    if sp.get("water"):
        add_water_plane(floor=getattr(sample, "floor", None))


def add_floor(m_stone, m_mortar, base=0.0):
    # Outdoor kit: open ground rather than a laid floor. Dispatched here rather than
    # at every call site so pits, water, stairs and the elevation vocabulary keep
    # working unchanged for both kits.
    if kit() == "outdoor":
        seed = SEED * 977 + int(base * 131)
        return terrain_scatter(terrain_surface(field_meadow(seed), base=base),
                               base, seed)
    """Mortar bed is a ZERO-THICKNESS plane: it has no side faces, so no join can
    ever show a curb. It overshoots the lattice cell by BLEED_PX so neighbouring
    tiles overlap fractionally -- measured, this takes the worst interior seam
    pixel from alpha 192 (a visible translucent line) to 249."""
    bh = HALF * (TILE_W_PX + 2.0 * BLEED_PX) / TILE_W_PX
    new_obj("mortar_bed",
            [(-bh, -bh, base), (bh, -bh, base), (bh, bh, base), (-bh, bh, base)],
            [(0, 1, 2, 3)], m_mortar)

    # FLAGSTONES ARE NOT A GRID. Sixteen identical squares per tile, jittered by
    # 4%, is what made the floor read as bathroom tiling: at this camera the eye
    # locks onto the repeating lattice long before it notices the noise texture.
    # A random rectangular subdivision breaks the lattice with slabs that span
    # two cells, and a few of them sunken, lifted or cracked in half stops the
    # remaining squares from reading as a pattern either.
    #
    # The subdivision is SEEDED PER TILE KIND, not per rotation: a tile and its
    # own r90 are the same stones seen from another side, which is what keeps a
    # rotated tile looking like the same piece of floor rather than a new one.
    rng = random.Random(SEED + int(base * 97))
    free = [[True] * CELLS for _ in range(CELLS)]
    for iy in range(CELLS):
        for ix in range(CELLS):
            if not free[iy][ix]:
                continue
            w = h = 1
            r = rng.random()
            can_x = ix + 1 < CELLS and free[iy][ix + 1]
            can_y = iy + 1 < CELLS and free[iy + 1][ix]
            can_xy = can_x and can_y and free[iy + 1][ix + 1]
            if r < 0.14 and can_xy:
                w = h = 2
            elif r < 0.34 and can_x:
                w = 2
            elif r < 0.52 and can_y:
                h = 2
            for yy in range(iy, iy + h):
                for xx in range(ix, ix + w):
                    free[yy][xx] = False

            cx = -HALF + (ix + w / 2.0) * CELL
            cy = -HALF + (iy + h / 2.0) * CELL
            sx, sy = w * CELL - GROUT, h * CELL - GROUT
            rise = RISE * rng.uniform(0.75, 1.25)
            worn = rng.random()
            if worn < 0.14:
                rise = -RISE * rng.uniform(0.4, 1.1)      # sunken: trodden down
            elif worn > 0.93:
                rise *= 1.9                               # proud: lifted by a root
            ang = math.radians(rng.uniform(-2.0, 2.0))

            if rng.random() < 0.16 and max(w, h) >= 1:
                # cracked clean through: two pieces that no longer sit level
                gap = GROUT * rng.uniform(0.8, 1.6)
                if sx >= sy:
                    a = sx * rng.uniform(0.35, 0.65)
                    box("slab_%d_%d_a" % (ix, iy), cx - (sx - a) / 2.0, cy, base,
                        a - gap / 2, sy, rise, m_stone, ang, bevel=(0.02, 3))
                    box("slab_%d_%d_b" % (ix, iy), cx + a / 2.0, cy, base,
                        sx - a - gap / 2, sy, rise * rng.uniform(0.7, 1.3),
                        m_stone, -ang, bevel=(0.02, 3))
                else:
                    a = sy * rng.uniform(0.35, 0.65)
                    box("slab_%d_%d_a" % (ix, iy), cx, cy - (sy - a) / 2.0, base,
                        sx, a - gap / 2, rise, m_stone, ang, bevel=(0.02, 3))
                    box("slab_%d_%d_b" % (ix, iy), cx, cy + a / 2.0, base,
                        sx, sy - a - gap / 2, rise * rng.uniform(0.7, 1.3),
                        m_stone, -ang, bevel=(0.02, 3))
            else:
                box("slab_%d_%d" % (ix, iy), cx, cy, base,
                    sx * rng.uniform(0.97, 1.0), sy * rng.uniform(0.97, 1.0),
                    rise, m_stone, ang, bevel=(0.022, 3))


DOOR_W, DOOR_H = 1.7, 2.0       # opening size in world units

def add_arch(edge, m_stone, m_mortar, door=False, seed=11):
    """A wall with a doorway punched through it, and optionally a door leaf.

    Built by the same running-bond loop as add_wall, but bricks whose span falls
    inside the opening are skipped and a lintel is laid across the top. Doing it
    this way (rather than a separate model) keeps the coursing continuous with
    the walls either side, so a doorway reads as part of the masonry."""
    rng = random.Random(seed)
    axis = 'x' if edge in ('Y+', 'Y-') else 'y'
    sign = 1.0 if edge in ('Y+', 'X+') else -1.0
    off = sign * (HALF - WALL_T / 2.0)
    half_open = DOOR_W / 2.0

    # backing slab, split either side of the opening
    for s_ in (-1.0, 1.0):
        seg = (HALF - half_open) / 2.0
        c = s_ * (half_open + seg)
        # inset at the OUTER end only -- the opening side is capped by the jamb
        ln = seg * 2 - SLAB_INSET
        c -= s_ * SLAB_INSET / 2.0
        if axis == 'x':
            box("wallback%d" % int(s_), c, off, 0.0, ln, WALL_T * 0.55, WALL_H - JOINT, m_mortar)
        else:
            box("wallback%d" % int(s_), off, c, 0.0, WALL_T * 0.55, ln, WALL_H - JOINT, m_mortar)

    n = 0
    for course in range(int(round(WALL_H / COURSE))):
        z0 = course * COURSE
        ch = COURSE - JOINT
        for u0, u1, is_end in _course_spans(course):
            # skip anything inside the opening, below the lintel
            if z0 < DOOR_H and u1 > -half_open and u0 < half_open:
                continue
            mid = (u0 + u1) / 2.0
            depth = WALL_T + QUOIN_PROUD if is_end else WALL_T * rng.uniform(0.88, 1.0)
            h = COURSE if is_end else ch * rng.uniform(0.94, 1.0)
            if axis == 'x':
                box("brick%d_%d" % (course, n), mid, off, z0, u1 - u0, depth, h,
                    m_stone, bevel=(0.018, 2))
            else:
                box("brick%d_%d" % (course, n), off, mid, z0, depth, u1 - u0, h,
                    m_stone, bevel=(0.018, 2))
            n += 1

    # lintel across the opening
    if axis == 'x':
        box("lintel", 0.0, off, DOOR_H - 0.06, DOOR_W + 0.5, WALL_T, 0.26,
            m_stone, bevel=(0.02, 2))
    else:
        box("lintel", off, 0.0, DOOR_H - 0.06, WALL_T, DOOR_W + 0.5, 0.26,
            m_stone, bevel=(0.02, 2))

    if door:
        WOOD = mkmat("door_wood", (0.30, 0.19, 0.10), 0.8, vary=0.10)
        IRON = mkmat("door_iron", (0.13, 0.13, 0.15), 0.5, vary=0.05)
        t = 0.12
        if axis == 'x':
            box("leaf", 0.0, off, 0.02, DOOR_W - 0.06, t, DOOR_H - 0.10, WOOD,
                bevel=(0.02, 2))
            for z in (0.35, DOOR_H - 0.45):
                box("band%f" % z, 0.0, off - sign * t * 0.6, z,
                    DOOR_W - 0.12, t * 0.5, 0.14, IRON)
        else:
            box("leaf", off, 0.0, 0.02, t, DOOR_W - 0.06, DOOR_H - 0.10, WOOD,
                bevel=(0.02, 2))
            for z in (0.35, DOOR_H - 0.45):
                box("band%f" % z, off - sign * t * 0.6, 0.0, z,
                    t * 0.5, DOOR_W - 0.12, 0.14, IRON)
    return n


def wall_limits(edge, others):
    """How far a wall runs, given which other walls share its corners.

    Same ownership rule as rim_span uses for basins, and for the same reason: a
    Y wall runs the full tile edge and OWNS both corners, an X wall butts against
    it. Letting both run full length buries each one's end inside the other, and
    a buried face in an ambient-occlusion bake is 0,0,0 -- the black notch in the
    corner of every corner tile. One convention, applied to walls and basins
    alike, so there is one thing to remember rather than two."""
    if edge in ("Y+", "Y-"):
        return -HALF, HALF
    return (-HALF + (WALL_T if "Y-" in others else 0.0),
             HALF - (WALL_T if "Y+" in others else 0.0))


def _course_spans(course, lo=None, hi=None):
    """Brick spans for one course, running bond, ALWAYS reaching both ends.

    Yields (u0, u1, is_end). The old loop generated spans the same way but threw
    away any fragment shorter than 0.12, which is exactly what a running bond
    leaves at the end of every other course. The dropped fragment left a cavity
    between the end brick and the recessed backing slab -- and a cavity in an
    ambient-occlusion bake is not a shadow, it is 0,0,0. That is the column of
    hard black squares up the end of every wall.

    A sliver is absorbed by its neighbour instead of dropped, so a course is a
    whole number of blocks that spans the full edge however the bond lands."""
    lo = -HALF if lo is None else lo
    hi = HALF if hi is None else hi
    spans = []
    u = lo - ((BRICK / 2.0) if (course % 2) else 0.0)
    while u < hi:
        u0, u1 = max(u, lo), min(u + BRICK - JOINT, hi)
        if u1 - u0 > 1e-6:
            spans.append([u0, u1])
        u += BRICK
    if not spans:
        spans = [[lo, hi]]
    if len(spans) >= 2 and spans[0][1] - spans[0][0] < 0.14:
        spans[1][0] = spans[0][0]
        spans.pop(0)
    if len(spans) >= 2 and spans[-1][1] - spans[-1][0] < 0.14:
        spans[-2][1] = spans[-1][1]
        spans.pop()
    return [(a, b, i == 0 or i == len(spans) - 1) for i, (a, b) in enumerate(spans)]


def add_wall(edge, m_stone, m_mortar, seed=11, base=0.0, others=()):
    """Courses of individual blocks in running bond.

    The wall sits INSIDE the tile with its outer face flush to the boundary, so
    two abutting tiles never double-wall: whichever tile owns the wall draws it,
    the neighbour draws none. A recessed backing slab stops daylight showing
    between blocks (verified: zero enclosed transparent pixels in the render)."""
    # NOTE: the outdoor kit has no branch here on purpose. A cliff is not a wall
    # standing on flat ground -- it is the ground itself getting steep -- so an
    # outdoor tile never reaches this function: it is built from a terrain FIELD
    # (see add_terrain) and carries no `edges` at all.
    rng = random.Random(seed)
    axis = 'x' if edge in ('Y+', 'Y-') else 'y'
    sign = 1.0 if edge in ('Y+', 'X+') else -1.0
    off = sign * (HALF - WALL_T / 2.0)

    # The slab is held BACK from both ends of the run. Full length, its end face
    # lands in exactly the same plane as the end bricks' -- coplanar, and buried
    # inside them, so it is a face that can see nothing. In an ambient-occlusion
    # bake that is not a dark joint, it is 0,0,0, and it z-fights the brick for
    # the pixel. That is the column of black squares up the end of every wall,
    # and it is the same fault as the black diamond at every basin corner: two
    # surfaces asked to occupy one plane.
    lo, hi = wall_limits(edge, others)
    span = (hi - lo) - 2.0 * SLAB_INSET
    ctr = (lo + hi) / 2.0
    if axis == 'x':
        box("wallback_" + edge, ctr, off, base, span, WALL_T * 0.55, WALL_H - JOINT, m_mortar)
    else:
        box("wallback_" + edge, off, ctr, base, WALL_T * 0.55, span, WALL_H - JOINT, m_mortar)

    n = 0
    for c in range(int(round(WALL_H / COURSE))):
        z0 = base + c * COURSE
        ch = COURSE - JOINT
        for u0, u1, is_end in _course_spans(c, lo, hi):
            mid = (u0 + u1) / 2.0
            # THE END OF A RUN IS A QUOIN, NOT A CUT BRICK.
            # Full thickness, full COURSE height (no JOINT gap), a little proud.
            # The gap is the point: every other block is laid COURSE-JOINT tall,
            # so at the end face you were looking down a full-thickness slot
            # between one course and the next -- enclosed, therefore 0,0,0 in an
            # ambient-occlusion bake, therefore a column of hard black squares.
            # Stacking the end blocks flush closes the slot, and the extra depth
            # turns what was a raw cut edge into a quoined pier: at a true wall
            # end it reads as a finished cap, and where a run continues into the
            # next tile it reads as a pilaster, which is what breaks up a long
            # blank wall.
            depth = WALL_T + QUOIN_PROUD if is_end else WALL_T * rng.uniform(0.88, 1.0)
            h = COURSE if is_end else ch * rng.uniform(0.94, 1.0)
            if axis == 'x':
                box("brick_%s_%d_%d" % (edge, c, n), mid, off, z0,
                    u1 - u0, depth, h, m_stone, bevel=(0.018, 2))
            else:
                box("brick_%s_%d_%d" % (edge, c, n), off, mid, z0,
                    depth, u1 - u0, h, m_stone, bevel=(0.018, 2))
            n += 1
    return n


def rotate_edges(edges, deg):
    order = ["Y+", "X+", "Y-", "X-"]        # clockwise viewed from +Z
    steps = (deg // 90) % 4
    return [order[(order.index(e) + steps) % 4] for e in edges]


# ---------------------------------------------------------------- scene setup

def res_for_scene(margin=24.0):
    """Canvas sized from the geometry that is actually in the scene.

    PIXELS PER UNIT IS THE INVARIANT: ortho_scale = RES/PPU, so a taller canvas
    adds room WITHOUT moving the lattice -- the tile still measures TILE_W_PX
    across and its anchor is still the image centre. Only the padding changes.

    This replaces a fixed 1024 that was checked against WALL_H alone and forgot
    `base`. A wall on a raised tile stands at base+WALL_H = 4.2 units, which
    projects 412px above centre against 352px of headroom, so every _up variant
    had its top course cut off by the edge of its own image -- and over_wall, at
    OVER_Z+WALL_H, lost about 158px. Measuring beats maintaining a table of how
    tall each kind can get: the geometry is right there, so ask it.
    """
    elev = math.radians(ELEVATION)
    c45, se, ce = math.cos(math.radians(45.0)), math.sin(elev), math.cos(elev)
    need = 0.0
    for ob in bpy.data.objects:
        if ob.type != 'MESH':
            continue
        for corner in ob.bound_box:                     # local -> world
            x, y, z = ob.matrix_world @ Vector(corner)
            need = max(need, abs((x + y) * c45 * PPU),
                             abs((x - y) * se * c45 * PPU - z * ce * PPU))
    half = int(math.ceil((need + margin) / 64.0)) * 64
    return max(RES, half * 2)


def add_camera(res=None):
    res = res or RES
    sc = scene()
    cd = bpy.data.cameras.new("cam")
    cd.type = 'ORTHO'
    cd.ortho_scale = res / PPU              # PPU is the invariant; RES may change
    cd.clip_start, cd.clip_end = 0.1, 500.0
    cam = bpy.data.objects.new("cam", cd)
    sc.collection.objects.link(cam)
    elev, yaw = math.radians(ELEVATION), math.radians(YAW)
    cam.rotation_euler = (math.radians(90.0 - ELEVATION), 0.0, yaw)
    d = 30.0
    cam.location = Vector((d * math.cos(elev) * math.sin(yaw),
                           -d * math.cos(elev) * math.cos(yaw),
                           d * math.sin(elev)))   # aimed at origin: centre == tile centre
    # the depth encoding assumes exactly this distance -- see depth_material()
    assert abs(d - CAM_DIST) < 1e-6, "CAM_DIST must match the camera distance"
    sc.camera = cam


def add_lighting():
    """Uniform white world, no directional key. Baked AO is light-direction
    independent so it never fights the runtime torches; a key light WOULD, which
    is the entire reason for this setup."""
    sc = scene()
    w = bpy.data.worlds.new("w")
    w.use_nodes = True
    bg = w.node_tree.nodes["Background"]
    bg.inputs["Color"].default_value = (1.0, 1.0, 1.0, 1.0)
    bg.inputs["Strength"].default_value = 1.0
    sc.world = w


def configure_render(res=None):
    sc = scene()
    sc.render.engine = 'CYCLES'
    sc.cycles.samples = SAMPLES
    sc.cycles.use_denoising = True
    sc.render.resolution_x = sc.render.resolution_y = res or RES
    sc.render.resolution_percentage = 100
    sc.render.film_transparent = True
    sc.render.image_settings.file_format = 'PNG'
    sc.render.image_settings.color_mode = 'RGBA'
    sc.view_settings.view_transform = 'Standard'


def normal_material():
    """Emission of the world-space shading normal, encoded n*0.5+0.5.

    THIS IS THE CONVENTION the runtime shader must agree with: world space,
    +Z up, straight alpha, no tone mapping. Antialiased pixels across a
    geometric edge are blended and therefore not unit length (~3% of pixels);
    the runtime must normalize() after sampling."""
    m = bpy.data.materials.get("_NRM") or bpy.data.materials.new("_NRM")
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    # Same bump chain as the albedo material, so the normals the runtime lights
    # agree with the surface detail you can see. A Bump node's Normal output is
    # computable on its own -- it does not need to be wired into a BSDF.
    height = _stone_detail(nt, NOISE_SCALE, NOISE_FINE)['height']
    bmp = nt.nodes.new("ShaderNodeBump")
    bmp.inputs["Strength"].default_value = BUMP
    bmp.inputs["Distance"].default_value = 0.06
    nt.links.new(height, bmp.inputs["Height"])

    mul = nt.nodes.new("ShaderNodeVectorMath"); mul.operation = 'MULTIPLY'
    mul.inputs[1].default_value = (0.5, 0.5, 0.5)
    add = nt.nodes.new("ShaderNodeVectorMath"); add.operation = 'ADD'
    add.inputs[1].default_value = (0.5, 0.5, 0.5)
    emi = nt.nodes.new("ShaderNodeEmission")
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    nt.links.new(bmp.outputs["Normal"], mul.inputs[0])
    nt.links.new(mul.outputs[0], add.inputs[0])
    nt.links.new(add.outputs[0], emi.inputs["Color"])
    nt.links.new(emi.outputs[0], out.inputs["Surface"])
    return m


def height_material():
    """Emission of world Z (surface height), encoded z / HEIGHT_MAX.

    This is what gives the runtime a real Z test instead of painter order, so a
    sprite can stand BEHIND a wall and be occluded per pixel -- and, just as
    importantly, NOT be occluded by the floor of a nearer tile it is standing on.

    WHY HEIGHT AND NOT DEPTH: camera depth is not invariant under blitting. A tile
    placed at lattice (i,j) sits at world offset (4i,-4j), shifting its camera depth
    by -2.4495*(i+j) -- so a baked depth map would need a per-tile bias, and once
    the range is stretched to cover a whole map (~40 units) an 8-bit channel leaves
    ~0.16 units per step, which is coarser than the relief it has to resolve.
    Height IS invariant: moving a tile sideways does not change how tall its walls
    are. 0..HEIGHT_MAX in 8 bits gives ~0.016 units per step.

    The runtime recovers depth from screen position + height. For an ortho camera
    at elevation 30 / yaw 45, a point (x,y,z) lands at
        sx = OX + (x+y)*cos45*PPU
        sy = OY + (x-y)*cos45*sin30*PPU - z*cos30*PPU
    so given a pixel and its height, (x-y) follows from sy, and
        Zview = CAM_DIST - (cos30*sin45*(x-y) + sin30*z)
    which is directly comparable between a scene pixel and a sprite pixel."""
    m = bpy.data.materials.get("_H") or bpy.data.materials.new("_H")
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    geo = nt.nodes.new("ShaderNodeNewGeometry")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    off = nt.nodes.new("ShaderNodeMath"); off.operation = 'ADD'
    off.inputs[1].default_value = HEIGHT_OFF
    div = nt.nodes.new("ShaderNodeMath"); div.operation = 'DIVIDE'
    div.inputs[1].default_value = HEIGHT_RANGE
    emi = nt.nodes.new("ShaderNodeEmission")
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    nt.links.new(geo.outputs["Position"], sep.inputs[0])
    nt.links.new(sep.outputs["Z"], off.inputs[0])
    nt.links.new(off.outputs[0], div.inputs[0])
    nt.links.new(div.outputs[0], emi.inputs["Color"])
    nt.links.new(emi.outputs[0], out.inputs["Surface"])
    return m


# ---------------------------------------------------------------- render

def render_to(path):
    """Render the current scene to `path`, at PIXEL SIZE if the theme asks for it.

    A pixel-art set is not a smooth render with a filter over it -- it is genuinely
    fewer pixels. So the frame is rendered at 1/N resolution and blown back up with
    NEAREST NEIGHBOUR, which is what puts a hard staircase on every edge and keeps
    the lattice invariant intact: the file that lands on disk is still exactly the
    size the runtime expects, and TILE_W_PX still measures what it always did.

    The upscale runs on the render result via numpy (bundled with Blender) rather
    than an image editor, because it has to happen for all three passes -- albedo,
    normals and height -- or they would disagree about where an edge is."""
    sc = scene()
    pix = theme().get("pixel", 1)
    if pix <= 1:
        sc.render.filepath = path
        bpy.ops.render.render(write_still=True)
        return
    import numpy as np
    full_x, full_y = sc.render.resolution_x, sc.render.resolution_y
    # A tile must divide evenly or the diamond stops landing on the lattice.
    assert full_x % pix == 0 and full_y % pix == 0, "resolution must divide by pixel"
    sc.render.resolution_x, sc.render.resolution_y = full_x // pix, full_y // pix
    sc.render.filter_size = 0.6          # near-box filter: no cross-pixel smear
    small_path = path + ".small.png"
    sc.render.filepath = small_path
    bpy.ops.render.render(write_still=True)
    sc.render.resolution_x, sc.render.resolution_y = full_x, full_y

    # Via the FILE, not via 'Render Result' -- that datablock does not hand out its
    # pixels (foreach_get comes back empty), which is a much-hit trap.
    src = bpy.data.images.load(small_path)
    w, h = src.size
    buf = np.empty(w * h * 4, dtype=np.float32)
    src.pixels.foreach_get(buf)
    px = buf.reshape(h, w, 4)
    # HARD SILHOUETTE. A pixel the geometry only partly covers gets its colour
    # divided by that coverage on the way to straight alpha, which amplifies
    # whatever sampling noise was in it -- so the outermost ring of every tile came
    # out measurably brighter than its interior (luma 147 against 101), posterising
    # snapped that into a band of its own, and abutting them drew a pale line around
    # every tile. It is not ambient occlusion: fading AO at the border changed
    # nothing, which is what ruled it out.
    #
    # Thresholding coverage removes the fringe rather than moving it, and a hard
    # silhouette is what this set wants regardless -- there is no such thing as a
    # half-covered pixel in pixel art.
    px[:, :, 3] = (px[:, :, 3] > 0.5).astype(np.float32)
    big = np.repeat(np.repeat(px, pix, axis=0), pix, axis=1)
    out = bpy.data.images.new("upscaled", width=w * pix, height=h * pix, alpha=True,
                              float_buffer=True)
    # Same colour space in and out, so the round trip is the identity and the
    # nearest-neighbour repeat is the only thing that happened to the image. That
    # matters most for _NRM and _H, which carry an encoding rather than a picture.
    out.colorspace_settings.name = src.colorspace_settings.name
    out.pixels.foreach_set(big.reshape(-1))
    out.file_format = 'PNG'
    out.filepath_raw = path
    out.save()
    bpy.data.images.remove(out)
    bpy.data.images.remove(src)
    os.remove(small_path)


def render_pair(outdir, stem):
    """albedo (Standard) + normals (Raw) + depth (Raw), all from one camera."""
    sc = scene()
    render_to(os.path.join(outdir, stem + ".png"))

    saved = {}
    for ob in bpy.data.objects:
        if ob.type == 'MESH':
            saved[ob.name] = ob.data.materials[0] if ob.data.materials else None

    def swap(mat):
        for ob in bpy.data.objects:
            if ob.type != 'MESH':
                continue
            ob.data.materials.clear()
            ob.data.materials.append(mat)

    vt, sm, dn = sc.view_settings.view_transform, sc.cycles.samples, sc.cycles.use_denoising
    sc.view_settings.view_transform = 'Raw'   # any tone map corrupts an encoding
    sc.cycles.samples = 16
    sc.cycles.use_denoising = False

    swap(normal_material())
    render_to(os.path.join(outdir, stem + "_NRM.png"))
    swap(height_material())
    render_to(os.path.join(outdir, stem + "_H.png"))

    for ob in bpy.data.objects:
        if ob.type != 'MESH':
            continue
        ob.data.materials.clear()
        if saved.get(ob.name):
            ob.data.materials.append(saved[ob.name])
    sc.view_settings.view_transform, sc.cycles.samples, sc.cycles.use_denoising = vt, sm, dn


def build_and_render(name, spec, rot, outdir):
    clear()
    m_stone = mkmat("stone", theme()["stone"], 0.85)
    m_mortar = mkmat("mortar", theme()["mortar"], 0.95)
    base = spec.get("base", 0.0)
    kind = spec.get("kind")
    # An opening is masonry too: it runs the full tile edge and owns both of its
    # corners exactly like a Y wall does, so a flanking wall has to butt against
    # it rather than run past. wall_limits() reads that off `others`, and the
    # arch is not in spec["edges"] -- without this the two runs would bury each
    # other's end faces, which is the black-notch fault the corner convention
    # exists to prevent.
    occupied = []

    # A terrain tile answers for its whole footprint -- ground, elevation change,
    # surfacing and scatter all come out of one field -- so it takes the dispatch
    # before anything that would try to lay a floor or stand a wall on it.
    if spec.get("terrain"):
        add_terrain(name, spec, rot)
        res = res_for_scene()
        add_camera(res)
        add_lighting()
        configure_render(res)
        stem = "%s_r%d" % (name, rot)
        render_pair(outdir, stem)
        return stem

    if kind == "pit":
        add_pit(m_stone, m_mortar, rims=rotate_edges(spec.get("rims", []), rot))
    elif kind == "bridge":
        e = rotate_edges(["Y+"], rot)[0]
        add_pit(m_stone, m_mortar, walkway=True,
                span_axis='y' if e in ("Y+", "Y-") else 'x',
                rims=rotate_edges(spec.get("rims", []), rot))
    elif kind in ("arch", "door"):
        add_floor(m_stone, m_mortar, base=base)
        occupied = rotate_edges(["Y+"], rot)
        add_arch(occupied[0], m_stone, m_mortar, door=(kind == "door"))
    elif kind == "bridge_flank":
        add_flank(m_stone, PIT, rotate_edges(["Y+"], rot)[0])
    elif kind == "water_flank":
        add_flank(m_stone, 0.95, rotate_edges(["Y+"], rot)[0])
    elif kind == "debug_edges":
        add_debug_edges(m_stone)
    elif kind == "over_floor":
        add_over_floor(m_stone, m_mortar)
    elif kind in ("over_walk", "over_walk_n"):
        e = rotate_edges(["Y+"], rot)[0]
        add_over_floor(m_stone, m_mortar, span_axis='y' if e in ("Y+", "Y-") else 'x',
                       legs=(kind == "over_walk"))
    elif kind == "over_wall":
        pass                      # walls are added below at base=OVER_Z
    elif kind == "over_stairs":
        add_over_stairs(rotate_edges(["Y+"], rot)[0], m_stone)
    elif kind == "water":
        add_water(m_stone, rims=rotate_edges(spec.get("rims", []), rot))
    elif kind == "water_bridge":
        e = rotate_edges(["Y+"], rot)[0]
        add_water(m_stone, walkway=True, span_axis='y' if e in ("Y+", "Y-") else 'x',
                  rims=rotate_edges(spec.get("rims", []), rot))
    elif kind == "stairs":
        add_stairs(rotate_edges(["Y+"], rot)[0], base, m_stone)
    else:
        add_plinth(base, m_stone)
        add_floor(m_stone, m_mortar, base=base)

    walls = rotate_edges(spec.get("edges", []), rot)
    for i, e in enumerate(walls):
        add_wall(e, m_stone, m_mortar, seed=11 + i, base=base,
                 others=walls + occupied)
    res = res_for_scene()               # AFTER the geometry: measured, not guessed
    add_camera(res)
    add_lighting()
    configure_render(res)
    stem = "%s_r%d" % (name, rot)
    render_pair(outdir, stem)
    return stem


def tiles():
    """The active set's tile table -- its OWN names, or the shared dungeon ones."""
    if THEME not in SET_TILE_BUILDERS:
        return TILES
    if THEME not in _set_tiles:
        _set_tiles[THEME] = SET_TILE_BUILDERS[THEME](THEME)
    return _set_tiles[THEME]


def tile_role(name, spec):
    """The ROLE this tile plays, derived from what it is rather than what it is
    called. This is the only thing the generator is allowed to read, so that a set
    can name its pieces whatever suits it -- see the SETS AND ROLES note at the top.

    Derived rather than hand-declared for now, because every existing tile's spec
    already says exactly what it is; a set with a piece these rules cannot classify
    should carry an explicit `role` in its spec, which wins."""
    if "role" in spec:
        return spec["role"]
    terrain = spec.get("terrain")
    if terrain:
        if terrain == "flat":
            return {-1: "liquid", 0: "ground", 1: "high_ground"}[spec.get("band", 0)]
        if terrain == "mire":
            # Its own role, not plain ground. A wallow is walkable and so shares
            # ground's sockets, but the generator has to be able to want FEWER of
            # them: reporting it as ground made ponds exactly as common as grass,
            # and a map came out with six of them in a row.
            return "wallow"
        if terrain == "track":
            return "track_slope" if spec.get("high") else "track"
        if spec.get("channel"):
            return "slope"
        return "transition"
    kind = spec.get("kind")
    base = spec.get("base", 0.0)
    if kind in ("arch", "door"):
        return "opening"
    if kind == "stairs":
        return "stair"
    if kind == "over_stairs":
        return "upper_stair"
    if kind in ("pit",):
        return "drop"
    if kind in ("water",):
        return "liquid"
    if kind in ("bridge", "water_bridge"):
        return "span"
    if kind in ("bridge_flank", "water_flank"):
        return "span_flank"
    # The upper layer is a second surface ABOVE another tile, so it gets its own
    # roles rather than one lump: a solid gallery floor, a walkway on legs, the
    # same walkway with none, and the wall that runs along the top.
    if kind == "over_floor":
        return "upper_ground"
    if kind == "over_walk":
        return "upper_span"
    if kind == "over_walk_n":
        return "upper_span_bare"
    if kind == "over_wall":
        return "upper_ground"
    if kind == "debug_edges":
        return "debug"
    # NOT a separate "barrier" role. Nothing in this kit is a solid block: a tile
    # with edges is walkable ground that happens to carry masonry (or a cliff) along
    # the sides `edges` names, which is exactly what the solver's edge contract wants
    # to hear. The first cut of this function called those barriers and would have
    # taught the generator that three quarters of every set was impassable.
    return "ground" if base == 0.0 else "high_ground"


EDGE_ORDER = ["Y+", "X+", "Y-", "X-"]


def tile_sockets(spec):
    """What each of the four edges PRESENTS to its neighbour.

    This is the whole adjacency contract, and it is derived rather than declared for
    the same reason `role` is: the spec already says what the piece is, and a hand-
    written socket table is a second copy of that fact waiting to disagree with the
    first. The solver may abut two tiles only where the facing sockets are equal.

        G0 / G1   walkable ground, low band / high band
        W         open water
        P0        a track crosses here -- always at the exact edge midpoint, which
                  is why any junction connects to any other (see _arms)
        X<lo><hi> a level change crosses here, named by the bands it joins

    A transition piece presents its X socket on exactly TWO edges and a flat band on
    the other two, which is what lets straight / inside corner / outside corner chain
    into a closed loop around a plateau or an island. The ramp is deliberately given
    the SAME sockets as the straight scarp it replaces, so a way up needs no
    adjacency rule of its own -- it can stand anywhere a cliff runs."""
    kind = spec.get("terrain")
    if not kind:
        return None

    def band(b):
        return {-1: "W", 0: "G0", 1: "G1"}[b]

    if kind == "flat":
        return {e: band(spec.get("band", 0)) for e in EDGE_ORDER}

    if kind == "mire":
        return {e: "G0" for e in EDGE_ORDER}

    lo, hi = spec.get("lo", 0), spec.get("hi", 1)
    cross = "X%s%s" % ("w" if lo == -1 else lo, hi)

    if kind == "track":
        # A track sits ON a band, so its edges are that band's socket with a P
        # marker where an arm leaves. A climbing track also carries the level change.
        high = spec.get("high", [])
        out = {}
        for e in EDGE_ORDER:
            if high:
                if e in high:
                    out[e] = band(hi)
                elif _opposite(e) in high:
                    out[e] = band(lo)
                else:
                    out[e] = cross
            else:
                out[e] = band(lo)
            if e in spec.get("arms", []):
                out[e] = out[e] + "+P"
        return out

    # kind == "step": the transition family
    high = spec.get("high", [])
    join = spec.get("join", "max")
    out = {}
    if len(high) == 1:
        h = high[0]
        for e in EDGE_ORDER:
            if e == h:
                out[e] = band(hi)
            elif e == _opposite(h):
                out[e] = band(lo)
            else:
                out[e] = cross
    else:
        # Two adjacent edges. Under `max` the high ground unions and fills both of
        # them (inside corner); under `min` it intersects to a nub and neither edge
        # is fully high (outside corner). The two other edges carry the crossing in
        # the first case and the flat low band in the second -- which is exactly the
        # asymmetry that makes them different tiles rather than rotations.
        for e in EDGE_ORDER:
            if join == "max":
                out[e] = band(hi) if e in high else cross
            else:
                out[e] = cross if e in high else band(lo)
    return out


def write_manifest(outdir):
    """Emit tiles.json: the set's own description of itself.

    The runtime currently keeps a HAND-WRITTEN list of tile names and a hardcoded
    wall-set table, which is why adding pieces meant editing the demo in three
    places and why a name it had never heard of aborted the whole image loader.
    A set that ships its own manifest can be dropped in whole -- names, roles,
    sockets and rotations -- without the runtime knowing anything about it."""
    man = {"set": THEME, "label": theme().get("label", THEME), "kit": kit(),
           "tileW": TILE_W_PX, "rotations": ROTATIONS, "tiles": {}}
    # The runtime has to know a set is pixel art: it decides texture filtering and
    # whether the packer may use a lossy codec, and neither is guessable from the
    # images.
    if theme().get("pixel"):
        man["pixel"] = theme()["pixel"]
    if theme().get("posterize"):
        man["posterize"] = theme()["posterize"]
    # Two facts role alone cannot carry, both of which the runtime has to know:
    #   FAMILY  a span over water is not interchangeable with one over a chasm, and
    #           the rim pieces have to match the hazard they surround
    #   CLOSED  an opening with a leaf that can be shut, versus an open arch
    FAMILY = {"water": "liquid", "water_bridge": "liquid", "water_flank": "liquid",
              "pit": "drop", "bridge": "drop", "bridge_flank": "drop"}
    for name, spec in tiles().items():
        kind = spec.get("kind")
        ent = {
            "role": tile_role(name, spec),
            "edges": list(spec.get("edges", [])),
            "rims": list(spec.get("rims", [])),
            "base": spec.get("base", 0.0),
        }
        if kind in FAMILY:
            ent["family"] = FAMILY[kind]
        if kind == "door":
            ent["closed"] = True
        sock = tile_sockets(spec)
        if sock:
            # Rotations are emitted too. The solver should never have to know that
            # r90 means "shift the socket list by one" -- that is a fact about how
            # this baker names files, not about the tileset.
            ent["sockets"] = {str(r): {e: sock[EDGE_ORDER[
                (EDGE_ORDER.index(e) - (r // 90)) % 4]] for e in EDGE_ORDER}
                for r in ROTATIONS}
            ent["band"] = spec.get("band", spec.get("lo", 0))
        man["tiles"][name] = ent
    path = os.path.join(outdir, "tiles.json")
    with open(path, "w") as f:
        json.dump(man, f, indent=1, sort_keys=True)
    print("MANIFEST", path, len(man["tiles"]), "tiles")


def main():
    global THEME
    argv = sys.argv
    args = argv[argv.index("--") + 1:] if "--" in argv else []
    if "--theme" in args:
        k = args.index("--theme")
        THEME = args[k + 1]
        if THEME not in THEMES:
            raise SystemExit("unknown theme %r -- have %s"
                             % (THEME, ", ".join(sorted(THEMES))))
        args = args[:k] + args[k + 2:]
    # A set baked before manifests existed only needs its tiles.json written, not
    # 500 renders repeated. Same table, same derivation, no Cycles.
    manifest_only = "--manifest-only" in args
    if manifest_only:
        args = [a for a in args if a != "--manifest-only"]
    # Benching a look costs one rotation, not four. Nothing about a tile's
    # appearance is decided by which way up it was rendered.
    rots = ROTATIONS
    if "--rot" in args:
        k = args.index("--rot")
        rots = [int(x) for x in args[k + 1].split(",")]
        args = args[:k] + args[k + 2:]
    root = os.path.abspath(args[0]) if args else os.path.abspath("out")
    # Each theme owns a directory. Baking a new set never costs us an old one.
    outdir = os.path.join(root, THEME)
    wanted = args[1:] if len(args) > 1 else list(tiles().keys())
    os.makedirs(outdir, exist_ok=True)
    print("THEME", THEME, "->", outdir)

    T = tiles()
    if manifest_only:
        write_manifest(outdir)
        print("DONE (manifest only) ->", outdir)
        return
    for name in wanted:
        if name not in T:
            print("SKIP unknown tile", name)
            continue
        for rot in rots:
            print("RENDERED", build_and_render(name, T[name], rot, outdir))
    write_manifest(outdir)
    print("TILE SET:", " ".join(sorted(T)))
    print("DONE ->", outdir)


if __name__ == "__main__":
    main()
