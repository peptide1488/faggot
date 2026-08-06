"""
Low-poly wizard, rendered as an 8-direction sprite set for the iso engine.

    blender -b -P build_wizard.py -- <outdir>

WHY A MODEL AND NOT A PAINTED SPRITE
A painted sprite is a flat billboard: it carries one camera-facing normal, so
torches cannot shade it, and it has no thickness, so a wall can only be entirely
in front of or entirely behind it. Rendering the character from the SAME camera
as the tiles gives it the same three buffers the tiles have -- albedo, world
normal, world height -- which means the runtime treats it as just another
surface: lit by the same lights, depth-tested per pixel against the same walls.

CONTRACTS THAT MUST MATCH build_tiles.py (or he will not line up):
    PPU         113.137 px per world unit  (= TILE_W_PX / (SIZE*sqrt2))
    projection  ortho, 30 deg elevation, 45 deg yaw
    HEIGHT_MAX  4.0, so _H decodes identically for tiles and characters
    view xform  Standard for albedo, Raw for _NRM and _H

ANCHORING: the camera is aimed at the ORIGIN and the model's feet sit at z=0,
so the IMAGE CENTRE IS HIS FEET. The runtime places the sprite by putting the
image centre on his ground position -- no alpha-bbox guessing. (The hand-painted
sprites this replaces had 64px of empty padding below the feet, which floated
him and inflated his height in the depth test.)

FACING: modelled facing local +X, then yawed per direction. The yaw for each
screen direction is SOLVED numerically rather than assumed, because screen angle
is not world angle under an iso projection:
    screen_angle = atan2(0.5*(fx-fy), fx+fy)
"""

import bpy
import math
import os
import sys
from mathutils import Vector

TILE_W_PX, SIZE = 640.0, 4.0
PPU = TILE_W_PX / (SIZE * math.sqrt(2.0))
RES = 384
ELEV, YAW, CAM_D = 30.0, 45.0, 30.0
HEIGHT_MAX = 4.0
HEIGHT_OFF, HEIGHT_RANGE = 4.0, 8.0
SAMPLES = 64
S = 8                      # polygon sides -- deliberately low

DIRS = ["east", "south-east", "south", "south-west",
        "west", "north-west", "north", "north-east"]

FRAMES = 6          # walk cycle length. 8 dirs x 6 frames x 3 passes = 144 renders.
STRIDE = 0.16       # how far a boot travels forward/back
BOB = 0.035         # vertical bounce at the top of each step


def scene():
    return bpy.context.scene


def mkmat(name, rgb, rough=0.8):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (rgb[0], rgb[1], rgb[2], 1.0)
    b.inputs["Roughness"].default_value = rough
    return m


def new_obj(name, verts, faces, mat):
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.update()
    ob = bpy.data.objects.new(name, me)
    ob.data.materials.append(mat)
    scene().collection.objects.link(ob)
    return ob


def tube(name, z0, z1, r0, r1, sides, mat, cx=0.0, cy=0.0):
    """low-poly n-gon frustum -- the whole character is built from these"""
    verts, faces = [], []
    for k in range(sides):
        a = 2 * math.pi * k / sides
        verts.append((cx + r0 * math.cos(a), cy + r0 * math.sin(a), z0))
    for k in range(sides):
        a = 2 * math.pi * k / sides
        verts.append((cx + r1 * math.cos(a), cy + r1 * math.sin(a), z1))
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


def build_wizard(phase=0.0):
    """Rebuild the whole figure at a point in the walk cycle.

    No rig: the parts are just placed differently each frame. For a dozen boxes
    that is simpler and more predictable than skinning, and the silhouette is
    what reads at this size anyway -- boots alternating, body bobbing, robe hem
    swinging opposite the lead foot.

    phase 0..1 is one full cycle (two steps).
    """
    # only the figure -- this now runs once per frame, and wiping everything
    # took the camera with it
    for ob in list(bpy.data.objects):
        if ob.type in ('MESH', 'EMPTY'):
            bpy.data.objects.remove(ob, do_unlink=True)
    ROBE = mkmat("w_robe", (0.20, 0.12, 0.33))
    HAT = mkmat("w_hat", (0.17, 0.10, 0.29))
    SKIN = mkmat("w_skin", (0.76, 0.58, 0.44))
    BEARD = mkmat("w_beard", (0.86, 0.86, 0.89), 0.9)
    WOOD = mkmat("w_wood", (0.32, 0.21, 0.12))
    GEM = mkmat("w_gem", (0.25, 0.72, 0.95), 0.25)
    BOOT = mkmat("w_boot", (0.16, 0.11, 0.09))

    a = 2.0 * math.pi * phase
    swing = math.sin(a) * STRIDE           # lead boot offset along facing (+X)
    bob = abs(math.sin(a)) * BOB           # body rises at mid-stride
    lean = math.sin(a) * 0.035             # slight body sway
    hem = 0.18                             # robe hem, lifted so boots show

    parts = [
        box("boot_l", 0.0 + swing, 0.085, 0.0, 0.20, 0.13, 0.11, BOOT),
        box("boot_r", 0.0 - swing, -0.085, 0.0, 0.20, 0.13, 0.11, BOOT),
        tube("robe",     hem + bob, 0.86 + bob, 0.29, 0.19, S, ROBE, cx=lean),
        tube("torso",    0.86 + bob, 1.06 + bob, 0.19, 0.16, S, ROBE, cx=lean),
        tube("neck",     1.06 + bob, 1.11 + bob, 0.07, 0.07, S, SKIN, cx=lean),
        tube("head",     1.11 + bob, 1.20 + bob, 0.115, 0.125, S, SKIN, cx=lean),
        tube("head_top", 1.20 + bob, 1.28 + bob, 0.125, 0.09, S, SKIN, cx=lean),
        tube("brim",     1.26 + bob, 1.30 + bob, 0.30, 0.28, S, HAT, cx=lean),
        tube("hat",      1.30 + bob, 1.58 + bob, 0.16, 0.015, S, HAT, cx=lean),
        tube("beard",    1.00 + bob, 1.21 + bob, 0.06, 0.12, 6, BEARD, cx=0.09 + lean),
        tube("arm_l",    0.72 + bob, 1.00 + bob, 0.055, 0.05, 6, ROBE,
             cx=0.02 - swing * 0.5 + lean, cy=0.20),
        tube("arm_r",    0.72 + bob, 1.00 + bob, 0.055, 0.05, 6, ROBE,
             cx=0.02 + swing * 0.5 + lean, cy=-0.20),
        # the staff plants and pivots rather than floating along with him
        tube("staff",    0.0, 1.44 + bob * 0.5, 0.028, 0.024, 6, WOOD,
             cx=0.24 - swing * 0.6, cy=0.24),
        tube("gemstone", 1.44 + bob * 0.5, 1.56 + bob * 0.5, 0.055, 0.02, 6, GEM,
             cx=0.24 - swing * 0.6, cy=0.24),
    ]
    pivot = bpy.data.objects.new("pivot", None)
    scene().collection.objects.link(pivot)
    for p in parts:
        p.parent = pivot
    return pivot


def yaw_for_screen_dir(index):
    """Solve for the world yaw whose FACING projects to this screen direction.

    Screen angle of a world facing (fx,fy), y down:
        atan2((fx-fy)*sin30*cos45, (fx+fy)*cos45) = atan2(0.5*(fx-fy), fx+fy)
    Solved by search: cheap, and immune to the sign slips that plague doing this
    by hand under an iso projection."""
    target = math.radians(45.0 * index)          # east=0, se=45, s=90, ...
    best, best_err = 0.0, 1e9
    for k in range(36000):
        psi = 2 * math.pi * k / 36000.0
        fx, fy = math.cos(psi), math.sin(psi)
        ang = math.atan2(0.5 * (fx - fy), fx + fy) % (2 * math.pi)
        err = abs((ang - target + math.pi) % (2 * math.pi) - math.pi)
        if err < best_err:
            best_err, best = err, psi
    return best


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
                           CAM_D * math.sin(e)))   # image centre == his feet
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


def render_to(path):
    scene().render.filepath = path
    bpy.ops.render.render(write_still=True)


def render_triple(outdir, stem):
    sc = scene()
    render_to(os.path.join(outdir, stem + ".png"))
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
    sc.cycles.samples = 16
    swap(normal_material())
    render_to(os.path.join(outdir, stem + "_NRM.png"))
    swap(height_material())
    render_to(os.path.join(outdir, stem + "_H.png"))

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
    outdir = os.path.abspath(args[0]) if args else os.path.abspath("out/wizard3d")
    os.makedirs(outdir, exist_ok=True)

    add_camera()
    add_lighting()
    configure_render()

    for i, name in enumerate(DIRS):
        psi = yaw_for_screen_dir(i)
        for f in range(FRAMES):
            pivot = build_wizard(f / float(FRAMES))
            pivot.rotation_euler = (0.0, 0.0, psi)
            bpy.context.view_layer.update()
            render_triple(outdir, "wizard_%s_f%d" % (name, f))
        print("RENDERED %-12s yaw=%6.1f deg x%d frames" % (name, math.degrees(psi), FRAMES))
    print("DONE ->", outdir)


if __name__ == "__main__":
    main()
