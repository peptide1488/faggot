"""
Low-poly dungeon props: wall torches and furniture.

    blender -b -P build_props.py -- <outdir>

Same three-buffer contract as the tiles and the wizard (albedo / _NRM / _H) and
the same camera, so props drop into the scene as ordinary surfaces: lit by the
same lights, depth-tested per pixel, and -- because they are static -- baked
straight into the room's composite, which gets them shadow casting for free.

ANCHORING: every prop is modelled in WORLD SPACE with its ground footprint at
the origin and at its true height, and the camera aims at the origin. So the
image centre is the prop's ground position, exactly like the wizard's feet.
A wall torch is modelled already raised to TORCH_Z -- it is not offset at
runtime, because then its _H heights would not be true world heights and the
depth test and shadows would both be wrong.

RES is larger than the character's because a wall torch's flame reaches ~2.2
world units, which is 216px above the anchor at this PPU.
"""

import bpy
import random
import math
import os
import sys
from mathutils import Vector

TILE_W_PX, SIZE = 640.0, 4.0
PPU = TILE_W_PX / (SIZE * math.sqrt(2.0))
# A prop standing on a grass10A tile has to be made of the same stuff the tile is:
# quantised colour and honest low resolution. Anything smoothly shaded reads as
# pasted on top of the map rather than standing in it. Both are declared here rather
# than guessed per prop, and both are OFF for the dungeon props, which were baked
# smooth and are still packed that way.
PIXEL = 2          # render at 1/PIXEL and nearest-upscale (see render_triple)
POSTER = 7         # value bands, quantised in HSV (see mkmat)

RES = 768       # a torch on a FAR wall (Y+/X-) sits ~309px above the anchor:
                # 1.82 units out along the wall normal plus 2.4 units of height.
                # At 512 those two variants were clipped at the top edge, which
                # read as the torch "facing the wrong way" -- it was just cropped.
ELEV, YAW, CAM_D = 30.0, 45.0, 30.0
HEIGHT_MAX = 4.0
HEIGHT_OFF, HEIGHT_RANGE = 4.0, 8.0
SAMPLES = 48
# Bracket height. The flame tops out at TORCH_Z + 0.86, and walls are WALL_H=2.4
# in build_tiles.py -- at 1.55 the flame reached 2.41 and poked over the crest, so
# a torch on the FAR face of a wall showed from the next room. Keep it clear.
TORCH_Z = 1.30


def scene():
    return bpy.context.scene


def mkmat(name, rgb, rough=0.85, emit=0.0, mottle=0.0, poster=0):
    """Flat colour, optionally broken up and banded.

    `mottle` adds noise variation -- a tree canopy at one flat green is a balloon,
    and the thing that makes it read as leaves is patchiness at about the scale of a
    branch. `poster` quantises VALUE in HSV afterwards, which is what keeps a prop
    in the same visual language as a posterised tile; quantising R, G and B
    separately would shift the hue every time two channels rounded opposite ways."""
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes["Principled BSDF"]
    b.inputs["Roughness"].default_value = rough
    col = None
    if mottle > 0.0:
        n = nt.nodes.new("ShaderNodeTexNoise")
        n.inputs["Scale"].default_value = 9.0
        n.inputs["Detail"].default_value = 5.0
        r = nt.nodes.new("ShaderNodeMapRange")
        r.inputs["From Min"].default_value = 0.40
        r.inputs["From Max"].default_value = 0.62
        nt.links.new(n.outputs["Fac"], r.inputs["Value"])
        mix = nt.nodes.new("ShaderNodeMixRGB")
        dark = tuple(c * (1.0 - mottle) for c in rgb)
        light = tuple(min(1.0, c * (1.0 + mottle)) for c in rgb)
        mix.inputs["Color1"].default_value = (dark[0], dark[1], dark[2], 1.0)
        mix.inputs["Color2"].default_value = (light[0], light[1], light[2], 1.0)
        nt.links.new(r.outputs["Result"], mix.inputs["Fac"])
        col = mix.outputs["Color"]
    if poster:
        src = col
        if src is None:
            rgbn = nt.nodes.new("ShaderNodeRGB")
            rgbn.outputs[0].default_value = (rgb[0], rgb[1], rgb[2], 1.0)
            src = rgbn.outputs[0]
        sep = nt.nodes.new("ShaderNodeSeparateColor"); sep.mode = 'HSV'
        nt.links.new(src, sep.inputs["Color"])
        comb = nt.nodes.new("ShaderNodeCombineColor"); comb.mode = 'HSV'
        nt.links.new(sep.outputs[0], comb.inputs[0])
        nt.links.new(sep.outputs[1], comb.inputs[1])
        mul = nt.nodes.new("ShaderNodeMath"); mul.operation = 'MULTIPLY'
        mul.inputs[1].default_value = float(poster)
        nt.links.new(sep.outputs[2], mul.inputs[0])
        flr = nt.nodes.new("ShaderNodeMath"); flr.operation = 'FLOOR'
        nt.links.new(mul.outputs[0], flr.inputs[0])
        add = nt.nodes.new("ShaderNodeMath"); add.operation = 'ADD'
        add.inputs[1].default_value = 0.5
        nt.links.new(flr.outputs[0], add.inputs[0])
        div = nt.nodes.new("ShaderNodeMath"); div.operation = 'DIVIDE'
        div.inputs[1].default_value = float(poster)
        nt.links.new(add.outputs[0], div.inputs[0])
        nt.links.new(div.outputs[0], comb.inputs[2])
        col = comb.outputs["Color"]
    if col is not None:
        nt.links.new(col, b.inputs["Base Color"])
    else:
        b.inputs["Base Color"].default_value = (rgb[0], rgb[1], rgb[2], 1.0)
    if emit > 0.0:
        b.inputs["Emission Color"].default_value = (rgb[0], rgb[1], rgb[2], 1.0)
        b.inputs["Emission Strength"].default_value = emit
    return m


def new_obj(name, verts, faces, mat):
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.update()
    ob = bpy.data.objects.new(name, me)
    ob.data.materials.append(mat)
    scene().collection.objects.link(ob)
    return ob


def tube(name, z0, z1, r0, r1, sides, mat, cx=0.0, cy=0.0, rot=0.0):
    verts, faces = [], []
    for r, z in ((r0, z0), (r1, z1)):
        for k in range(sides):
            a = 2 * math.pi * k / sides + rot
            verts.append((cx + r * math.cos(a), cy + r * math.sin(a), z))
    for k in range(sides):
        n = (k + 1) % sides
        faces.append((k, n, sides + n, sides + k))
    faces.append(tuple(range(sides - 1, -1, -1)))
    faces.append(tuple(range(sides, 2 * sides)))
    return new_obj(name, verts, faces, mat)


def box(name, cx, cy, z0, sx, sy, sz, mat, rotz=0.0):
    hx, hy = sx / 2.0, sy / 2.0
    c, s = math.cos(rotz), math.sin(rotz)
    verts = []
    for z in (z0, z0 + sz):
        for dx, dy in ((-hx, -hy), (hx, -hy), (hx, hy), (-hx, hy)):
            verts.append((cx + dx * c - dy * s, cy + dx * s + dy * c, z))
    faces = [(0, 1, 2, 3), (7, 6, 5, 4), (0, 4, 5, 1),
             (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)]
    return new_obj(name, verts, faces, mat)


def clear():
    for ob in list(bpy.data.objects):
        if ob.type == 'MESH':
            bpy.data.objects.remove(ob, do_unlink=True)


def blob(name, cx, cy, cz, rx, ry, rz, mat, seed, rough=0.26, rings=9, segs=12,
         smooth=True):
    """A rounded irregular mass: canopy, bush, boulder.

    Nothing outdoors has a machined edge, and a bevelled cube still reads as a cube
    at sixty pixels. A sphere pushed around by noise costs the same and reads as
    something that grew."""
    rnd = random.Random(seed)
    tab = [rnd.uniform(-1.0, 1.0) for _ in range(64)]

    def wob(a, b, c):
        i = (int(abs(a) * 7 + abs(b) * 13 + abs(c) * 23)) % 64
        j = (i * 7 + 3) % 64
        return (tab[i] + tab[j]) * 0.5

    verts, faces = [], []
    for i in range(rings + 1):
        th = math.pi * i / rings
        for k in range(segs):
            ph = 2.0 * math.pi * k / segs
            dx = math.sin(th) * math.cos(ph)
            dy = math.sin(th) * math.sin(ph)
            dz = math.cos(th)
            f = 1.0 + rough * wob(dx * 3.0, dy * 3.0, dz * 3.0)
            verts.append((cx + dx * rx * f, cy + dy * ry * f, cz + dz * rz * f))
    for i in range(rings):
        for k in range(segs):
            a = i * segs + k
            b = i * segs + (k + 1) % segs
            faces.append((a, b, b + segs, a + segs))
    ob = new_obj(name, verts, faces, mat)
    for p in ob.data.polygons:
        p.use_smooth = smooth
    return ob


# ---- outdoor props. Real volume, so unlike grass they occlude correctly and can
# be geometry: the height buffer wants to know a tree is there, and a token walking
# behind one should be hidden by it.

BARK = (0.16, 0.105, 0.065)
LEAF = (0.115, 0.225, 0.065)
LEAF2 = (0.155, 0.275, 0.075)
STONE = (0.30, 0.20, 0.125)


def prop_tree():
    """A broadleaf: leaning trunk, two boughs, three canopy masses.

    Three masses rather than one sphere, because a single blob is a lollipop. They
    overlap on purpose -- the silhouette wants to be one shape with dents in it, not
    three balls in a bag."""
    bark = mkmat("bark", BARK, 0.92, mottle=0.30, poster=POSTER)
    leaf = mkmat("leaf", LEAF, 0.95, mottle=0.34, poster=POSTER)
    tube("trunk", 0.0, 1.05, 0.115, 0.075, 7, bark)
    tube("bough_a", 0.72, 1.18, 0.05, 0.03, 5, bark, cx=0.10, cy=0.06)
    tube("bough_b", 0.66, 1.10, 0.045, 0.03, 5, bark, cx=-0.09, cy=-0.05)
    blob("canopy_a", 0.0, 0.0, 1.44, 0.52, 0.50, 0.40, leaf, 11, rough=0.30)
    blob("canopy_b", 0.26, 0.16, 1.24, 0.34, 0.33, 0.27, leaf, 12, rough=0.32)
    blob("canopy_c", -0.24, -0.13, 1.28, 0.31, 0.30, 0.25, leaf, 13, rough=0.32)
    return {"foot": 1.0}


def prop_pine():
    """A conifer: bare lower trunk and four stacked skirts. Tall and narrow, so it
    reads as a different tree at a glance rather than a recoloured one."""
    bark = mkmat("bark", BARK, 0.92, mottle=0.30, poster=POSTER)
    needle = mkmat("needle", (0.075, 0.17, 0.065), 0.95, mottle=0.30, poster=POSTER)
    tube("pine_trunk", 0.0, 0.95, 0.10, 0.055, 7, bark)
    z, r = 0.52, 0.62
    for k in range(4):
        tube("skirt%d" % k, z, z + 0.52, r, 0.03, 9, needle)
        z += 0.36
        r *= 0.74
    return {"foot": 1.0}


def prop_shrub():
    """Low scrub -- three small masses, none of them tall enough to hide anything.
    The map needs something between bare ground and a whole tree."""
    leaf = mkmat("shrub", LEAF2, 0.95, mottle=0.36, poster=POSTER)
    blob("shrub_a", 0.0, 0.0, 0.20, 0.30, 0.28, 0.20, leaf, 21, rough=0.34)
    blob("shrub_b", 0.20, 0.12, 0.15, 0.20, 0.19, 0.14, leaf, 22, rough=0.36)
    blob("shrub_c", -0.17, -0.10, 0.14, 0.17, 0.17, 0.13, leaf, 23, rough=0.36)
    return {"foot": 1.0}


def prop_boulder():
    """A standing stone big enough to walk around, in the same rock the crags use --
    faceted rather than smoothed, because rock parts along planes."""
    rock = mkmat("boulder_rock", STONE, 0.90, mottle=0.30, poster=POSTER)
    blob("boulder", 0.0, 0.0, 0.24, 0.42, 0.36, 0.30, rock, 31, rough=0.34,
         rings=7, segs=9, smooth=False)
    blob("boulder_b", 0.26, -0.18, 0.10, 0.17, 0.15, 0.12, rock, 32, rough=0.38,
         rings=6, segs=8, smooth=False)
    return {"foot": 1.0}


def prop_stump():
    """A cut stump. Cheap, and it says someone has been here."""
    bark = mkmat("bark", BARK, 0.92, mottle=0.30, poster=POSTER)
    tube("stump", 0.0, 0.30, 0.20, 0.17, 8, bark)
    return {"foot": 1.0}


# ---------------------------------------------------------------- the props

def prop_torch(face):
    """Wall bracket + flame. `face` is which world edge the wall is on, so the
    bracket sticks out from that wall into the room."""
    WOOD = mkmat("p_wood", (0.26, 0.17, 0.09))
    IRON = mkmat("p_iron", (0.14, 0.14, 0.16), 0.55)
    # Emission is clipped by the Standard view transform, so anything much above
    # ~3 renders as flat white and the flame reads as a pale cone, not fire.
    FLAME = mkmat("p_flame", (1.0, 0.42, 0.08), 0.4, emit=2.6)
    CORE = mkmat("p_core", (1.0, 0.80, 0.30), 0.4, emit=4.2)

    n = {"Y+": (0.0, 1.0), "Y-": (0.0, -1.0), "X+": (1.0, 0.0), "X-": (-1.0, 0.0)}[face]
    bx, by = n[0] * 1.82, n[1] * 1.82          # on the wall face
    ox, oy = n[0] * 1.58, n[1] * 1.58          # bracket tip, out into the room

    box("plate", bx, by, TORCH_Z - 0.16, 0.20, 0.20, 0.34, IRON,
        rotz=math.atan2(n[1], n[0]))
    # arm from wall to tip
    steps = 6
    for i in range(steps):
        t0, t1 = i / steps, (i + 1) / steps
        x0, y0 = bx + (ox - bx) * t0, by + (oy - by) * t0
        x1, y1 = bx + (ox - bx) * t1, by + (oy - by) * t1
        box("arm%d" % i, (x0 + x1) / 2, (y0 + y1) / 2,
            TORCH_Z + 0.02 + 0.10 * t0, 0.07, 0.07, 0.07, IRON)
    tube("handle", TORCH_Z + 0.12, TORCH_Z + 0.40, 0.055, 0.05, 6, WOOD, cx=ox, cy=oy)
    tube("cup", TORCH_Z + 0.38, TORCH_Z + 0.52, 0.055, 0.11, 6, IRON, cx=ox, cy=oy)
    tube("flame", TORCH_Z + 0.48, TORCH_Z + 0.86, 0.10, 0.012, 6, FLAME, cx=ox, cy=oy)
    tube("core", TORCH_Z + 0.47, TORCH_Z + 0.70, 0.055, 0.01, 6, CORE, cx=ox, cy=oy)
    return {"light": [ox, oy, TORCH_Z + 0.58]}


def prop_barrel():
    WOOD = mkmat("p_barrel", (0.30, 0.19, 0.10))
    IRON = mkmat("p_iron", (0.14, 0.14, 0.16), 0.55)
    tube("belly", 0.0, 0.34, 0.26, 0.30, 10, WOOD)
    tube("belly2", 0.34, 0.68, 0.30, 0.26, 10, WOOD)
    tube("hoop1", 0.31, 0.37, 0.312, 0.312, 10, IRON)
    tube("hoop2", 0.06, 0.11, 0.275, 0.275, 10, IRON)
    tube("hoop3", 0.58, 0.63, 0.275, 0.275, 10, IRON)
    return {}


def prop_crate():
    WOOD = mkmat("p_crate", (0.36, 0.25, 0.13))
    DARK = mkmat("p_crate2", (0.26, 0.17, 0.09))
    box("body", 0, 0, 0.0, 0.62, 0.62, 0.60, WOOD)
    for z in (0.03, 0.53):
        box("rail%f" % z, 0, 0, z, 0.66, 0.66, 0.06, DARK)
    for dx, dy in ((0.30, 0.30), (-0.30, 0.30), (0.30, -0.30), (-0.30, -0.30)):
        box("post%f%f" % (dx, dy), dx, dy, 0.0, 0.07, 0.07, 0.60, DARK)
    return {}


def prop_chest():
    WOOD = mkmat("p_chest", (0.31, 0.19, 0.10))
    IRON = mkmat("p_iron", (0.14, 0.14, 0.16), 0.55)
    GOLD = mkmat("p_gold", (0.72, 0.55, 0.18), 0.35)
    box("base", 0, 0, 0.0, 0.72, 0.46, 0.34, WOOD)
    tube("lid", 0.0, 0.72, 0.23, 0.23, 8, WOOD, rot=math.pi / 8)
    lid = bpy.data.objects["lid"]
    lid.rotation_euler = (0.0, math.pi / 2, 0.0)
    lid.location = (-0.36, 0.0, 0.34)
    box("band1", -0.22, 0, 0.0, 0.06, 0.48, 0.36, IRON)
    box("band2", 0.22, 0, 0.0, 0.06, 0.48, 0.36, IRON)
    box("lock", 0.0, -0.23, 0.20, 0.14, 0.05, 0.14, GOLD)
    return {}


def prop_table():
    WOOD = mkmat("p_table", (0.33, 0.22, 0.12))
    box("top", 0, 0, 0.62, 1.30, 0.72, 0.08, WOOD)
    for dx, dy in ((0.56, 0.28), (-0.56, 0.28), (0.56, -0.28), (-0.56, -0.28)):
        box("leg%f%f" % (dx, dy), dx, dy, 0.0, 0.09, 0.09, 0.62, WOOD)
    return {}


PROPS = {
    "barrel": prop_barrel,
    "crate": prop_crate,
    "chest": prop_chest,
    "table": prop_table,
    "tree": prop_tree,
    "pine": prop_pine,
    "shrub": prop_shrub,
    "boulder": prop_boulder,
    "stump": prop_stump,
}
TORCH_FACES = ["Y+", "X+", "Y-", "X-"]


# ---------------------------------------------------------------- render rig

def add_camera():
    sc = scene()
    cd = bpy.data.cameras.new("cam")
    cd.type = 'ORTHO'
    cd.ortho_scale = RES / PPU
    cd.clip_start, cd.clip_end = 0.1, 500.0
    cam = bpy.data.objects.new("cam", cd)
    sc.collection.objects.link(cam)
    e, y = math.radians(ELEV), math.radians(YAW)
    cam.rotation_euler = (math.radians(90.0 - ELEV), 0.0, y)
    cam.location = Vector((CAM_D * math.cos(e) * math.sin(y),
                           -CAM_D * math.cos(e) * math.cos(y),
                           CAM_D * math.sin(e)))
    sc.camera = cam


def add_lighting():
    sc = scene()
    w = bpy.data.worlds.new("w")
    w.use_nodes = True
    bg = w.node_tree.nodes["Background"]
    bg.inputs["Color"].default_value = (1.0, 1.0, 1.0, 1.0)
    bg.inputs["Strength"].default_value = 1.0
    sc.world = w


def configure_render():
    sc = scene()
    sc.render.engine = 'CYCLES'
    sc.cycles.samples = SAMPLES
    sc.cycles.use_denoising = True
    sc.render.resolution_x = sc.render.resolution_y = RES
    sc.render.resolution_percentage = 100
    sc.render.film_transparent = True
    sc.render.image_settings.file_format = 'PNG'
    sc.render.image_settings.color_mode = 'RGBA'
    sc.view_settings.view_transform = 'Standard'


def normal_material():
    m = bpy.data.materials.get("_NRM") or bpy.data.materials.new("_NRM")
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    geo = nt.nodes.new("ShaderNodeNewGeometry")
    mul = nt.nodes.new("ShaderNodeVectorMath"); mul.operation = 'MULTIPLY'
    mul.inputs[1].default_value = (0.5, 0.5, 0.5)
    add = nt.nodes.new("ShaderNodeVectorMath"); add.operation = 'ADD'
    add.inputs[1].default_value = (0.5, 0.5, 0.5)
    emi = nt.nodes.new("ShaderNodeEmission")
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    nt.links.new(geo.outputs["Normal"], mul.inputs[0])
    nt.links.new(mul.outputs[0], add.inputs[0])
    nt.links.new(add.outputs[0], emi.inputs["Color"])
    nt.links.new(emi.outputs[0], out.inputs["Surface"])
    return m


def height_material():
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


def _render_to(path):
    """Render at PIXEL SIZE if the prop set asks for it.

    Same rule the tiles follow (build_tiles.render_to): a pixel-art prop is not a
    smooth render with a filter over it, it is genuinely fewer pixels, blown back up
    with nearest neighbour. It runs on all three passes or the albedo, normals and
    height disagree about where the silhouette is -- and the silhouette is what the
    depth test uses to decide whether a token is behind this tree.

    Coverage is thresholded for the same reason as the tiles: a partly covered edge
    pixel has its colour divided by that coverage on the way to straight alpha,
    which amplifies sampling noise into a bright fringe."""
    sc = scene()
    if PIXEL <= 1:
        sc.render.filepath = path
        bpy.ops.render.render(write_still=True)
        return
    import numpy as np
    fx, fy = sc.render.resolution_x, sc.render.resolution_y
    assert fx % PIXEL == 0 and fy % PIXEL == 0, "resolution must divide by PIXEL"
    sc.render.resolution_x, sc.render.resolution_y = fx // PIXEL, fy // PIXEL
    sc.render.filter_size = 0.6
    small = path + ".small.png"
    sc.render.filepath = small
    bpy.ops.render.render(write_still=True)
    sc.render.resolution_x, sc.render.resolution_y = fx, fy

    src = bpy.data.images.load(small)          # via the FILE: 'Render Result'
    w, h = src.size                            # does not hand out its pixels
    buf = np.empty(w * h * 4, dtype=np.float32)
    src.pixels.foreach_get(buf)
    px = buf.reshape(h, w, 4)
    px[:, :, 3] = (px[:, :, 3] > 0.5).astype(np.float32)
    big = np.repeat(np.repeat(px, PIXEL, axis=0), PIXEL, axis=1)
    out = bpy.data.images.new("up", width=w * PIXEL, height=h * PIXEL, alpha=True,
                              float_buffer=True)
    out.colorspace_settings.name = src.colorspace_settings.name
    out.pixels.foreach_set(big.reshape(-1))
    out.file_format = 'PNG'
    out.filepath_raw = path
    out.save()
    bpy.data.images.remove(out)
    bpy.data.images.remove(src)
    os.remove(small)


def render_triple(outdir, stem):
    sc = scene()
    _render_to(os.path.join(outdir, stem + ".png"))
    saved = {ob.name: (ob.data.materials[0] if ob.data.materials else None)
             for ob in bpy.data.objects if ob.type == 'MESH'}

    def swap(mat):
        for ob in bpy.data.objects:
            if ob.type == 'MESH':
                ob.data.materials.clear()
                ob.data.materials.append(mat)

    vt, dn = sc.view_settings.view_transform, sc.cycles.use_denoising
    sc.view_settings.view_transform = 'Raw'
    sc.cycles.use_denoising = False
    sc.cycles.samples = 12
    swap(normal_material())
    _render_to(os.path.join(outdir, stem + "_NRM.png"))
    swap(height_material())
    _render_to(os.path.join(outdir, stem + "_H.png"))

    for ob in bpy.data.objects:
        if ob.type == 'MESH':
            ob.data.materials.clear()
            if saved.get(ob.name):
                ob.data.materials.append(saved[ob.name])
    sc.view_settings.view_transform, sc.cycles.use_denoising = vt, dn
    sc.cycles.samples = SAMPLES


def main():
    argv = sys.argv
    args = argv[argv.index("--") + 1:] if "--" in argv else []
    outdir = os.path.abspath(args[0]) if args else os.path.abspath("out/props")
    os.makedirs(outdir, exist_ok=True)

    for ob in list(bpy.data.objects):
        bpy.data.objects.remove(ob, do_unlink=True)
    add_camera()
    add_lighting()
    configure_render()

    meta = {}
    for face in TORCH_FACES:
        clear()
        meta["torch_" + face] = prop_torch(face)
        render_triple(outdir, "torch_" + face)
        print("RENDERED torch_%s" % face)

    for name, fn in PROPS.items():
        clear()
        meta[name] = fn()
        render_triple(outdir, name)
        print("RENDERED %s" % name)

    with open(os.path.join(outdir, "props.json"), "w") as f:
        import json
        json.dump({"res": RES, "ppu": PPU, "heightMax": HEIGHT_MAX,
                   "torchZ": TORCH_Z, "props": meta}, f, indent=1)
    print("DONE ->", outdir)


if __name__ == "__main__":
    main()
