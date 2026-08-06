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
from mathutils import Vector

# ---------------------------------------------------------------- parameters

CELLS, CELL = 4, 1.0            # floor squares per tile edge; 1 cell = one 5ft square
SIZE = CELLS * CELL
HALF = SIZE / 2.0

TILE_W_PX = 640.0               # tile diamond width -- defines the lattice
PPU = TILE_W_PX / (SIZE * math.sqrt(2.0))   # pixels per blender unit (invariant)
RES = 1024                      # canvas floor; res_for_scene() grows it per tile
BLEED_PX = 1.0                  # floor plane overshoot per side, kills seam pinpricks

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
                     stone=(0.26, 0.34, 0.15),  # turf -- the tile's ground surface
                     mortar=(0.25, 0.19, 0.12), # the soil under it, seen at breaks
                     rock=(0.42, 0.41, 0.38),   # cliff face and boulders
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
    """The highland/meadow vocabulary, named for the zone that owns it."""
    T = {}

    def add(piece, serial, **spec):
        T["%s-%s-%04d" % (sid, piece, serial)] = spec

    # open ground, and the same ground one step up
    add("turf", 100, edges=[], base=0.0)
    add("turf", 110, edges=[], base=STEP)
    # scarps: a cliff edge. Same four sockets the solver needs from any barrier.
    add("scarp", 210, edges=["Y+"], base=0.0)
    add("scarp", 211, edges=["Y+", "X+"], base=0.0)
    add("scarp", 212, edges=["Y+", "Y-"], base=0.0)
    add("scarp", 213, edges=["Y+", "X+", "X-"], base=0.0)
    add("scarp", 220, edges=["Y+"], base=STEP)
    add("scarp", 221, edges=["Y+", "X+"], base=STEP)
    add("scarp", 222, edges=["Y+", "Y-"], base=STEP)
    add("scarp", 223, edges=["Y+", "X+", "X-"], base=STEP)
    # a gully: the chasm vocabulary, with every rim combination
    for n, rims in enumerate([[], ["Y+"], ["Y+", "X+"], ["Y+", "Y-"],
                              ["Y+", "X+", "X-"], ["Y+", "X+", "Y-", "X-"]]):
        add("gully", 300 + n * 2, edges=[], base=0.0, kind="pit", rims=rims)
    # a brook: same shapes, water in them
    for n, rims in enumerate([[], ["Y+"], ["Y+", "X+"], ["Y+", "Y-"],
                              ["Y+", "X+", "X-"], ["Y+", "X+", "Y-", "X-"]]):
        add("brook", 400 + n * 2, edges=[], base=0.0, kind="water", rims=rims)
    # crossings: stepping stones over the brook, a fallen log over the gully
    for n, rims in enumerate([[], ["X+"], ["X-"], ["X+", "X-"]]):
        add("ford", 420 + n * 2, edges=[], base=0.0, kind="water_bridge", rims=rims)
        add("log", 320 + n * 2, edges=[], base=0.0, kind="bridge", rims=rims)
    add("ford", 440, edges=[], base=0.0, kind="water_flank")
    add("log", 340, edges=[], base=0.0, kind="bridge_flank")
    # a worn path up the scarp
    add("path", 500, edges=[], base=0.0, kind="stairs")
    add("path", 510, edges=["X+", "X-"], base=0.0, kind="stairs")
    # a gate through a scarp, and the same gap without one
    add("gate", 600, edges=[], base=0.0, kind="door")
    add("gap", 610, edges=[], base=0.0, kind="arch")
    add("gate", 601, edges=["X+"], base=0.0, kind="door")
    add("gap", 611, edges=["X+"], base=0.0, kind="arch")
    add("gate", 602, edges=["X-"], base=0.0, kind="door")
    add("gap", 612, edges=["X-"], base=0.0, kind="arch")
    add("gate", 603, edges=["X+", "X-"], base=0.0, kind="door")
    add("gap", 613, edges=["X+", "X-"], base=0.0, kind="arch")
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


def add_turf(base=0.0):
    """Open ground: undulating turf, soil showing through at the breaks, scattered
    stones and grass clumps.

    THE BORDER RING IS PINNED TO `base`, whatever the relief does inside. Tiles are
    rendered independently and abutted on an exact lattice, so a displaced vertex on
    the seam is a crack or a step in the finished map -- the same invariant the
    flagstone floor keeps by being flat, just stated explicitly because here the
    surface genuinely moves. The displacement is faded out over the outermost cells
    so the pinned ring doesn't read as a rim either.

    Seeded per tile KIND rather than per rotation, like the flagstones: a tile and
    its own r90 must be the same patch of ground seen from another side."""
    m_grass = mkmat("grass", theme()["stone"], 0.92, vary=0.42)
    m_soil = mkmat("soil", theme()["mortar"], 0.95, vary=0.30)
    m_rock = mkmat("rock", theme().get("rock", (0.42, 0.41, 0.38)), 0.88, vary=0.38)

    rng = random.Random(SEED + 4243 + int(base * 97))
    bh = HALF * (TILE_W_PX + 2.0 * BLEED_PX) / TILE_W_PX

    # Soil bed: a zero-thickness plane under the turf, so any gap shows earth rather
    # than the void. It sits BELOW the deepest the turf can dip -- at the same height
    # the two planes interleave, and the ground came out half brown because the soil
    # won wherever the relief went negative.
    bed = base - TURF_RELIEF - 0.02
    new_obj("soil_bed",
            [(-bh, -bh, bed), (bh, -bh, bed), (bh, bh, bed), (-bh, bh, bed)],
            [(0, 1, 2, 3)], m_soil)

    # Two octaves of value noise, sampled on a lattice big enough that the tile is
    # a small window onto it -- so the ground reads as part of a wider landscape
    # rather than as a self-contained lump repeated across the map.
    def noise(x, y):
        n = 0.0
        for freq, amp in ((0.9, 1.0), (2.3, 0.45)):
            n += amp * (math.sin(x * freq * 1.7 + 2.1) * math.cos(y * freq * 1.3 - 0.7)
                        + 0.6 * math.sin((x + y) * freq * 0.9 + 1.3))
        return n / 2.4

    N = TURF_GRID
    verts = []
    for iy in range(N + 1):
        for ix in range(N + 1):
            x = -bh + 2.0 * bh * ix / N
            y = -bh + 2.0 * bh * iy / N
            # falloff: 0 on the border ring, 1 two cells in
            fx = min(ix, N - ix) / 2.0
            fy = min(iy, N - iy) / 2.0
            fall = max(0.0, min(1.0, min(fx, fy)))
            verts.append((x, y, base + TURF_RELIEF * noise(x, y) * fall))
    faces = []
    for iy in range(N):
        for ix in range(N):
            a = iy * (N + 1) + ix
            faces.append((a, a + 1, a + N + 2, a + N + 1))
    new_obj("turf", verts, faces, m_grass)

    def ground_z(x, y):
        fall = 1.0 if (abs(x) < bh * 0.7 and abs(y) < bh * 0.7) else 0.4
        return base + TURF_RELIEF * noise(x, y) * fall

    # Scatter. Kept inside 0.82 of the half-width: a clump that overhangs the
    # lattice cell would paint over whatever the neighbour turns out to be, and the
    # neighbour might be a cliff face rather than more grass.
    lim = HALF * 0.82
    for n in range(TUFTS):
        x, y = rng.uniform(-lim, lim), rng.uniform(-lim, lim)
        s = rng.uniform(0.13, 0.30)
        box("tuft%d" % n, x, y, ground_z(x, y) - 0.02, s, s * rng.uniform(0.7, 1.3),
            rng.uniform(0.05, 0.16), m_grass, rotz=rng.uniform(0, math.pi),
            bevel=(0.012, 1))
    for n in range(rng.randint(2, 5)):
        x, y = rng.uniform(-lim, lim), rng.uniform(-lim, lim)
        s = rng.uniform(0.18, 0.42)
        box("stone%d" % n, x, y, ground_z(x, y) - s * 0.35, s, s * rng.uniform(0.7, 1.2),
            s * rng.uniform(0.5, 0.9), m_rock, rotz=rng.uniform(0, math.pi),
            bevel=(0.03, 2))


def add_cliff(edge, seed=11, base=0.0, others=()):
    """A cliff face where the dungeon kit puts a coursed wall.

    Same contract as add_wall, and deliberately so: the outer face is flush with the
    tile boundary (neighbours never double up), the run is shortened by wall_limits
    so a Y edge owns its corners and an X edge butts against it, and a recessed
    backing slab stops daylight showing between the chunks. Only the masonry is
    replaced -- courses and running bond give way to vertical strata of irregular
    depth, which is what separates rock from brickwork at this camera."""
    m_rock = mkmat("rock", theme().get("rock", (0.42, 0.41, 0.38)), 0.9, vary=0.40)
    m_soil = mkmat("soil", theme()["mortar"], 0.95, vary=0.30)

    rng = random.Random(seed * 7 + 3)
    axis = 'x' if edge in ('Y+', 'Y-') else 'y'
    sign = 1.0 if edge in ('Y+', 'X+') else -1.0
    off = sign * (HALF - WALL_T / 2.0)
    lo, hi = wall_limits(edge, others)

    def slab(name, ctr, length, z0, depth, height, mat, rot=0.0):
        if axis == 'x':
            box(name, ctr, off, z0, length, depth, height, mat, rotz=rot,
                bevel=(0.02, 2))
        else:
            box(name, off, ctr, z0, depth, length, height, mat, rotz=rot,
                bevel=(0.02, 2))

    # Backing slab, in ROCK not soil: it is the mass of the cliff seen between the
    # crags, not a different material behind them. In soil it read as a flat brown
    # board propped up behind the stone. Deep enough that a recessed layer never
    # reveals its edge.
    span = (hi - lo) - 2.0 * SLAB_INSET
    slab("cliffback_" + edge, (lo + hi) / 2.0, span, base, WALL_T * 1.15,
         WALL_H - JOINT, m_rock)

    # Strata. The first version stacked three big blocks per column and read as grey
    # brickwork, because that is what a short stack of same-sized boxes IS. Rock
    # reads as rock through three things instead:
    #   BATTER      the face leans back as it rises, so it is not a plane
    #   FRACTURE    columns start at different heights and do not line up
    #   RECESSION   each layer sits at its own depth, some proud, some cut back
    # Layers are thin and numerous, so the silhouette is ragged at tile scale rather
    # than a row of kerbstones.
    n = 0
    u = lo
    while u < hi - 1e-6:
        w = min(rng.uniform(0.34, 0.72), hi - u)
        ctr = u + w / 2.0
        top = WALL_H * rng.uniform(0.80, 1.06)
        layers = rng.randint(5, 8)
        z = base - rng.uniform(0.0, 0.12)          # fracture: uneven footing
        for k in range(layers):
            hgt = (top / layers) * rng.uniform(0.65, 1.45)
            # batter: pull the layer back from the face as it climbs, plus its own
            # recession, and let the occasional bed jut out as an overhang
            climb = (z - base) / max(WALL_H, 1e-6)
            inset = WALL_T * (0.30 * climb + rng.uniform(-0.12, 0.34))
            if rng.random() < 0.16:
                inset -= WALL_T * rng.uniform(0.25, 0.55)     # overhanging bed
            depth = WALL_T * rng.uniform(0.75, 1.25)
            if axis == 'x':
                box("crag_%s_%d" % (edge, n), ctr, off - sign * inset, z,
                    w * rng.uniform(0.86, 1.04), depth, hgt, m_rock,
                    rotz=rng.uniform(-0.09, 0.09), bevel=(0.035, 2))
            else:
                box("crag_%s_%d" % (edge, n), off - sign * inset, ctr, z,
                    depth, w * rng.uniform(0.86, 1.04), hgt, m_rock,
                    rotz=rng.uniform(-0.09, 0.09), bevel=(0.035, 2))
            z += hgt
            n += 1
        u += w

    # Scree at the foot: the debris that makes a cliff look eroded rather than
    # extruded, and it hides the join between the face and the ground. Flatter and
    # more numerous than the first pass, which read as a line of dropped dice.
    for k in range(rng.randint(7, 12)):
        s = rng.uniform(0.10, 0.26)
        slab("scree_%s_%d" % (edge, k), rng.uniform(lo + s, hi - s), s,
             base - 0.03, WALL_T * rng.uniform(1.2, 2.4), s * rng.uniform(0.30, 0.62),
             m_rock, rot=rng.uniform(0, 1.2))


def add_floor(m_stone, m_mortar, base=0.0):
    # Outdoor kit: open ground rather than a laid floor. Dispatched here rather than
    # at every call site so pits, water, stairs and the elevation vocabulary keep
    # working unchanged for both kits.
    if kit() == "outdoor":
        return add_turf(base=base)
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
    # Outdoor kit: a cliff face, built to the same edge/ownership contract.
    if kit() == "outdoor":
        return add_cliff(edge, seed=seed, base=base, others=others)
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
    scene().render.filepath = path
    bpy.ops.render.render(write_still=True)


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


def write_manifest(outdir):
    """Emit tiles.json: the set's own description of itself.

    The runtime currently keeps a HAND-WRITTEN list of tile names and a hardcoded
    wall-set table, which is why adding pieces meant editing the demo in three
    places and why a name it had never heard of aborted the whole image loader.
    A set that ships its own manifest can be dropped in whole -- names, roles,
    sockets and rotations -- without the runtime knowing anything about it."""
    man = {"set": THEME, "label": theme().get("label", THEME), "kit": kit(),
           "tileW": TILE_W_PX, "rotations": ROTATIONS, "tiles": {}}
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
        for rot in ROTATIONS:
            print("RENDERED", build_and_render(name, T[name], rot, outdir))
    write_manifest(outdir)
    print("TILE SET:", " ".join(sorted(T)))
    print("DONE ->", outdir)


if __name__ == "__main__":
    main()
