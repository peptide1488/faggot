"""Spell effects: short radial animations, baked like everything else.

    blender -b -P build_effects.py -- out/effects [--only fireball]

NOT EIGHT DIRECTIONS. A figure has a facing, so it needs one render per screen
direction; a blast does not. Every effect here is radially symmetric about its own
centre, which cuts the bake by 8x and -- more usefully -- means the runtime can
rotate the view without the effects having to agree about which way is north.

EMISSIVE, AND THAT MATTERS. These are the one thing in the pipeline that makes its
own light, so unlike a tile or an actor they must NOT be multiplied by the scene
lighting: a fireball in a dark room is bright. They bake with emission strength on
the material and the runtime is expected to add them, not multiply.

The height pass is still written. A blast has volume and a token standing behind
one should be occluded by it, which is the same argument that made trees geometry
and grass texture.
"""

import importlib.util
import math
import os
import sys

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location("bw", os.path.join(HERE, "build_wizard.py"))
bw = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(bw)

scene, new_obj, tube = bw.scene, bw.new_obj, bw.tube

EFFECTS = {"fireball": 7, "bolt": 5, "heal": 6, "frost": 6}


def emat(name, rgb, strength):
    """Emissive, unlit.

    STRENGTHS LIVE NEAR 1.0. The bake uses the Standard view transform (no tone
    mapping, because a tone curve would corrupt the normal and height encodings
    rendered through the same rig), so anything above 1.0 CLIPS. The first pass used
    8 to 22 -- values that would be reasonable under Filmic -- and every effect came
    out a silhouette in pure white: correct shapes, correct timing, no colour at all.
    A fireball has to be orange more than it has to be bright."""
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    # What clips is COLOUR TIMES STRENGTH, not strength -- so a hue whose brightest
    # channel is already 1.0 goes white at any strength above 1.0, however modest
    # the number looks. Dropping the strengths from 8-22 to 1.0-2.6 fixed the
    # fireball, whose orange has a low blue channel, and left heal and frost exactly
    # as white as before. Clamping here means a colour is declared once, in the
    # hue it should read as, and comes out as bright as that hue can be.
    # BLACK BASE COLOUR. The clamp above was not enough on its own, and the reason
    # is that these surfaces were still being LIT: base colour and emission colour
    # were the same, so the world's diffuse contribution stacked on top of the glow
    # and pushed the sum past 1.0 in every channel. Green went white while orange
    # survived, because orange had a low blue channel with room to spare. A thing
    # that makes its own light should reflect none.
    hi = max(rgb) or 1.0
    k = min(strength, 1.0 / hi)
    b.inputs["Base Color"].default_value = (0.0, 0.0, 0.0, 1.0)
    b.inputs["Emission Color"].default_value = (rgb[0], rgb[1], rgb[2], 1.0)
    b.inputs["Emission Strength"].default_value = k
    return m


def sphere(name, cx, cy, cz, r, mat, seed=0, wob=0.0, rings=9, segs=12):
    rnd = [((seed * 7919 + i * 104729) % 1000) / 1000.0 - 0.5 for i in range(64)]
    verts, faces = [], []
    for i in range(rings + 1):
        th = math.pi * i / rings
        for k in range(segs):
            ph = 2.0 * math.pi * k / segs
            dx, dy, dz = (math.sin(th) * math.cos(ph), math.sin(th) * math.sin(ph),
                          math.cos(th))
            f = 1.0 + wob * rnd[(i * segs + k) % 64]
            verts.append((cx + dx * r * f, cy + dy * r * f, cz + dz * r * f))
    for i in range(rings):
        for k in range(segs):
            a = i * segs + k
            b = i * segs + (k + 1) % segs
            faces.append((a, b, b + segs, a + segs))
    ob = new_obj(name, verts, faces, mat)
    for p in ob.data.polygons:
        p.use_smooth = True
    return ob


def ring(name, cz, r, thick, mat, segs=20):
    """A flat annulus on the ground: the footprint of a blast, and the part that
    tells you which squares it covered after the flash has gone."""
    verts, faces = [], []
    for k in range(segs):
        a = 2.0 * math.pi * k / segs
        c, s = math.cos(a), math.sin(a)
        verts.append((c * (r - thick), s * (r - thick), cz))
        verts.append((c * (r + thick), s * (r + thick), cz))
    for k in range(segs):
        n = (k + 1) % segs
        faces.append((k * 2, k * 2 + 1, n * 2 + 1, n * 2))
    ob = new_obj(name, verts, faces, mat)
    for p in ob.data.polygons:
        p.use_smooth = True
    return ob


def clear():
    for ob in list(bpy.data.objects):
        if ob.type in ('MESH', 'EMPTY'):
            bpy.data.objects.remove(ob, do_unlink=True)


def fx_fireball(t):
    """Flash, bloom, collapse to smoke. The bright core dies FIRST and the outer
    shell keeps expanding -- that ordering is what reads as an explosion rather
    than a balloon inflating, and it costs nothing but two different curves."""
    core = emat("fx_core", (1.0, 0.92, 0.55), 2.6)
    body = emat("fx_body", (1.0, 0.42, 0.10), 1.45)
    smoke = emat("fx_smoke", (0.26, 0.15, 0.11), 0.75)
    r = 0.35 + 1.05 * (1.0 - (1.0 - t) ** 2)
    if t < 0.55:
        k = 1.0 - t / 0.55
        sphere("core", 0, 0, 0.55, 0.30 + 0.55 * t, core, 1, wob=0.10 * t)
        sphere("body", 0, 0, 0.55, r * (0.55 + 0.45 * k), body, 2, wob=0.22)
    else:
        k = (t - 0.55) / 0.45
        sphere("body", 0, 0, 0.55 + 0.30 * k, r * 0.85, body, 2, wob=0.26)
        sphere("smoke", 0, 0, 0.62 + 0.45 * k, r * (0.70 + 0.30 * k), smoke, 3,
               wob=0.34)
    ring("scorch", 0.02, 0.55 + 0.85 * t, 0.09, body if t < 0.6 else smoke)


def fx_bolt(t):
    """A dart that arrives. Drawn as a streak along +X with a bright head, so the
    runtime can point it at a target with one rotation."""
    head = emat("fx_head", (0.72, 0.86, 1.0), 2.4)
    tail = emat("fx_tail", (0.30, 0.50, 1.0), 1.25)
    x = -0.9 + 2.0 * t
    sphere("head", x, 0, 0.62, 0.16 + 0.05 * math.sin(t * 9.0), head, 4, wob=0.16)
    for k in range(4):
        f = 1.0 - k / 4.0
        sphere("tail%d" % k, x - 0.17 * (k + 1), 0, 0.62, 0.12 * f, tail, 5 + k,
               wob=0.22)


def fx_heal(t):
    """Rising motes and a ring that closes inward. Everything moves UP and IN,
    which is the opposite of the fireball on both axes -- at this size a spell is
    read by its direction of travel long before its colour."""
    glow = emat("fx_glow", (0.55, 1.0, 0.62), 1.7)
    soft = emat("fx_soft", (0.30, 0.85, 0.45), 1.05)
    ring("halo", 0.03, 1.05 - 0.55 * t, 0.06, glow)
    for k in range(6):
        a = 2.0 * math.pi * k / 6.0 + t * 1.2
        rr = 0.62 * (1.0 - 0.45 * t)
        z = 0.12 + 1.35 * ((t + k / 6.0) % 1.0)
        sphere("mote%d" % k, math.cos(a) * rr, math.sin(a) * rr, z,
               0.075 * (1.0 - 0.5 * ((t + k / 6.0) % 1.0)), soft, 9 + k, wob=0.2)


def fx_frost(t):
    """A ground burst: spikes out of the floor, no airborne mass. Distinct from
    the fireball in silhouette as well as palette, so the two never get confused
    in a crowded round."""
    ice = emat("fx_ice", (0.62, 0.90, 1.0), 1.35)
    pale = emat("fx_pale", (0.85, 0.96, 1.0), 1.9)
    ring("rime", 0.02, 0.45 + 0.95 * t, 0.07, ice)
    n = 9
    for k in range(n):
        a = 2.0 * math.pi * k / n + 0.4
        rr = (0.35 + 0.75 * t) * (0.75 + 0.25 * math.sin(k * 2.1))
        h = (0.55 + 0.35 * math.sin(k * 1.7)) * min(1.0, t * 1.6)
        tube("spike%d" % k, 0.0, h, 0.085 * (1.0 - 0.3 * t), 0.005, 5,
             pale if k % 3 == 0 else ice,
             cx=math.cos(a) * rr, cy=math.sin(a) * rr)


FX = {"fireball": fx_fireball, "bolt": fx_bolt, "heal": fx_heal, "frost": fx_frost}


def main():
    argv = sys.argv
    args = argv[argv.index("--") + 1:] if "--" in argv else []
    outdir = os.path.abspath(args[0]) if args else os.path.abspath("out/effects")
    only = args[args.index("--only") + 1] if "--only" in args else None
    os.makedirs(outdir, exist_ok=True)

    bw.add_camera()
    bw.add_lighting()
    bw.configure_render()

    names = [only] if only else list(EFFECTS)
    for name in names:
        n = EFFECTS[name]
        for f in range(n):
            clear()
            FX[name](f / float(n - 1) if n > 1 else 0.0)
            bpy.context.view_layer.update()
            bw.render_triple(outdir, "%s_f%d" % (name, f))
        print("RENDERED %-9s x%d frames" % (name, n))
    import json
    with open(os.path.join(outdir, "effects.json"), "w") as fh:
        json.dump({"res": bw.RES, "ppu": bw.PPU, "effects": EFFECTS,
                   "additive": True, "radial": True,
                   "aimed": ["bolt"]}, fh, indent=1)
    print("DONE ->", outdir)


if __name__ == "__main__":
    main()
