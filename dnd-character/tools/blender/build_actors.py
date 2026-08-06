"""Actors: the same figure pipeline as the wizard, with more than one body and
more than one thing to do.

    blender -b -P build_actors.py -- out/actors [--only goblin] [--action attack]

build_wizard.py renders ONE character doing ONE thing. Everything about it that is
not the wizard -- the camera solve, the three passes, the eight screen directions,
the per-frame rebuild with no rig -- is reusable, so this imports it rather than
copying it, and adds the two axes it is missing:

    BODIES    a spec of proportions and colours, so a goblin is data and not a
              second copy of the builder
    ACTIONS   walk / attack / hit / death, as functions of normalised time

WHY NO RIG, STILL. The parts are placed differently each frame. For a dozen solids
that is simpler and more predictable than skinning, and at ~100 pixels tall the
silhouette is the whole performance: what reads is the shape of the pose, not the
deformation. It also means an action is a handful of numbers rather than a keyed
armature, which is what lets death and hit be six lines each.

Actions are held at their LAST frame by the runtime, not looped -- a death that
loops is a resurrection -- so the final pose of `death` is the one the corpse keeps.
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

DIRS = bw.DIRS
S = bw.S
mkmat, tube, box, scene = bw.mkmat, bw.tube, bw.box, bw.scene

# Frame counts per action. Walk keeps the wizard's 6 so the two can march together;
# the rest are as short as they can be and still read -- every frame is 3 renders
# times 8 directions, so a generous attack costs more than the whole goblin body.
ACTIONS = {"walk": 6, "attack": 5, "hit": 3, "death": 6}

# ---------------------------------------------------------------- the bodies
#
# A body is proportions plus palette. Everything is a fraction of `h` (standing
# height in world units) so a goblin is not a shrunken wizard: he is squat, so his
# shoulders are wide for his height and his head is large, which is what makes him
# read as a different species rather than the same model further away.

WIZARD = dict(
    h=1.58, hip=0.18, waist=0.29, chest=0.19, shoulder=0.20, head=0.125,
    stride=0.16, bob=0.035,
    robe=(0.20, 0.12, 0.33), trim=(0.17, 0.10, 0.29), skin=(0.76, 0.58, 0.44),
    hair=(0.86, 0.86, 0.89), wood=(0.32, 0.21, 0.12), metal=(0.25, 0.72, 0.95),
    boot=(0.16, 0.11, 0.09),
    hat="wizard", beard=True, weapon="staff", hunch=0.0)

# Radii are ABSOLUTE world units, not fractions of `h` -- which is a trap the first
# goblin fell straight into. Copying the wizard's numbers onto a body two thirds his
# height produced a barrel with a head on it. A goblin is small AND slight: narrower
# than the wizard in absolute terms, with a head that is large only relative to the
# rest of him.
GOBLIN = dict(
    h=1.02, hip=0.135, waist=0.095, chest=0.150, shoulder=0.150, head=0.108,
    stride=0.12, bob=0.045, hunch=0.075,
    robe=(0.30, 0.20, 0.10), trim=(0.20, 0.13, 0.07), skin=(0.26, 0.38, 0.14),
    hair=(0.14, 0.10, 0.06), wood=(0.30, 0.20, 0.12), metal=(0.46, 0.46, 0.50),
    boot=(0.14, 0.10, 0.07),
    hat="none", beard=False, weapon="cleaver")

BODIES = {"wizard": WIZARD, "goblin": GOBLIN}


# ---------------------------------------------------------------- the actions
#
# Each returns the pose parameters the builder reads. Keeping them in one dict
# rather than as branches inside the builder is what makes it possible to see, in
# one screen, that death ends face down and hit does not move the feet.

def act_walk(t):
    a = 2.0 * math.pi * t
    return dict(swing=math.sin(a), bob=abs(math.sin(a)), lean=math.sin(a) * 0.035,
                pitch=0.0, drop=0.0, arm=math.sin(a) * 0.5, reach=0.0, twist=0.0)


def act_attack(t):
    """Wind up, strike, recover. The strike is FAST -- frames 0-1 pull back over
    half the action, 2 lands, 3-4 return -- because an even-tempo swing reads as
    a wave. Anticipation is most of what sells a hit at this size."""
    if t < 0.45:
        k = t / 0.45
        return dict(swing=0.0, bob=0.0, lean=-0.10 * k, pitch=-0.10 * k,
                    drop=0.0, arm=-1.5 * k, reach=-0.10 * k, twist=-0.25 * k)
    k = (t - 0.45) / 0.55
    e = 1.0 - (1.0 - k) * (1.0 - k)                 # ease out of the strike
    return dict(swing=0.0, bob=0.0, lean=0.10 + 0.16 * e - 0.26 * e * e,
                pitch=0.22 * e - 0.30 * e * e, drop=0.0,
                arm=1.9 * e - 0.6, reach=0.26 * e - 0.36 * e * e,
                twist=0.34 * e - 0.10)


def act_hit(t):
    """A flinch, not a stagger: back and down, then most of the way home. Three
    frames, because the runtime interrupts whatever else he was doing to play it
    and a long recoil would eat the turn it belongs to."""
    # Amplitudes are LARGE. At three frames and ~100 pixels tall a subtle recoil is
    # no recoil at all -- the first version moved so little that the three frames
    # were indistinguishable side by side. It has to overshoot to register.
    # The flinch lives in PITCH and BOB -- doubling over and dropping -- not in
    # `lean`, `reach` or `arm`. Those three also position the weapon, so cranking
    # them to make the recoil visible threw the cleaver off to one side: the body
    # lurched one way and the thing it was holding lurched further. Big numbers on
    # the axes that only move the body; small ones on the axes the hand rides.
    k = math.sin(math.pi * min(1.0, t * 1.15))
    return dict(swing=0.10 * k, bob=-1.0 * k, lean=-0.09 * k, pitch=-0.62 * k,
                drop=0.06 * k, arm=-0.55 * k, reach=-0.07 * k, twist=0.42 * k)


def act_death(t):
    """Legs go, then the body follows it down. Ends flat and stays there -- the
    last frame IS the corpse, so it has to be readable as one from directly above
    as well as from the side."""
    k = t * t                                        # accelerate into the fall
    return dict(swing=0.0, bob=-0.55 * k, lean=0.0, pitch=-1.45 * k,
                drop=0.62 * k, arm=-0.9 * k, reach=0.0, twist=0.35 * k,
                collapse=k)


ACTS = {"walk": act_walk, "attack": act_attack, "hit": act_hit, "death": act_death}


# ---------------------------------------------------------------- the builder

def build(body, action, t):
    """Rebuild the whole figure at a point in one action.

    Only meshes and empties are cleared: wiping everything took the camera with it,
    which cost a confusing half hour the first time build_wizard did it."""
    for ob in list(bpy.data.objects):
        if ob.type in ('MESH', 'EMPTY'):
            bpy.data.objects.remove(ob, do_unlink=True)

    b = body
    p = ACTS[action](t)
    h = b["h"]
    ROBE = mkmat("a_robe", b["robe"])
    TRIM = mkmat("a_trim", b["trim"])
    SKIN = mkmat("a_skin", b["skin"])
    HAIR = mkmat("a_hair", b["hair"], 0.9)
    WOOD = mkmat("a_wood", b["wood"])
    METAL = mkmat("a_metal", b["metal"], 0.3)
    BOOT = mkmat("a_boot", b["boot"])

    sw = p["swing"] * b["stride"]
    bob = p["bob"] * b["bob"] + p.get("drop", 0.0) * -h
    lean = p["lean"]
    # `collapse` folds the whole figure toward the ground. Applied as a height
    # scale rather than a rotation because these are stacked solids with no joints:
    # rotating the torso alone would leave the legs standing under a fallen body.
    fold = 1.0 - 0.72 * p.get("collapse", 0.0)
    z = lambda v: (v * fold + bob)

    # A hunch carries the head and chest FORWARD of the feet. It is the other half
    # of reading as a goblin rather than a short man: the wizard stands upright and
    # this one does not.
    hunch = b.get("hunch", 0.0)
    hipz = h * 0.11
    waistz = h * 0.55
    chestz = h * 0.67
    neckz = h * 0.70
    headz = h * 0.76
    topz = h * 0.83

    parts = [
        box("boot_l", sw + lean, 0.085, z(0.0) + 0.0, h * 0.13, h * 0.085, h * 0.07, BOOT),
        box("boot_r", -sw + lean, -0.085, z(0.0), h * 0.13, h * 0.085, h * 0.07, BOOT),
        # Hip -> waist -> chest, and the WAIST IS THE NARROWEST. A monotonic stack
        # of radii is a cylinder however carefully the numbers are chosen, and a
        # cylinder is what the first two goblins were. The pinch is the silhouette.
        tube("robe", z(hipz), z(waistz), b["hip"], b["waist"], S, ROBE, cx=lean),
        tube("torso", z(waistz), z(chestz), b["waist"], b["chest"], S, ROBE,
             cx=lean + hunch * 0.5 + p["pitch"] * 0.10),
        tube("neck", z(chestz), z(neckz), b["head"] * 0.5, b["head"] * 0.5, S, SKIN,
             cx=lean + hunch * 0.8 + p["pitch"] * 0.16),
        tube("head", z(neckz), z(headz), b["head"] * 0.92, b["head"], S, SKIN,
             cx=lean + hunch + p["pitch"] * 0.22),
        tube("head_top", z(headz), z(topz), b["head"], b["head"] * 0.72, S, SKIN,
             cx=lean + hunch + p["pitch"] * 0.26),
    ]
    if b["hat"] == "wizard":
        parts += [
            tube("brim", z(topz - 0.02), z(topz + 0.02), b["head"] * 2.4,
                 b["head"] * 2.2, S, TRIM, cx=lean + p["pitch"] * 0.26),
            tube("hat", z(topz + 0.02), z(topz + h * 0.19), b["head"] * 1.28, 0.015,
                 S, TRIM, cx=lean + p["pitch"] * 0.30),
        ]
    else:
        # A hood, and the EARS: a goblin is read by his silhouette above the
        # shoulders before anything else, and two spikes off the skull do more work
        # than any amount of face.
        # EARS SWEPT BACK, not up. A vertical cone either side of the skull is a
        # horn, and two horns on a green head is a devil, not a goblin. Flat blades
        # angled back and slightly down break the outline behind the head, which is
        # where the eye expects a goblin's ears to be.
        for side, cy in (("l", 1.0), ("r", -1.0)):
            parts.append(box("ear_" + side,
                             lean + hunch - b["head"] * 0.95 + p["pitch"] * 0.20,
                             cy * b["head"] * 0.72,
                             z(headz - h * 0.005),
                             b["head"] * 1.5, 0.014, b["head"] * 0.52, SKIN,
                             rotz=cy * 0.42))
    if b["beard"]:
        parts.append(tube("beard", z(chestz - 0.06), z(headz), b["head"] * 0.48,
                          b["head"] * 0.96, 6, HAIR,
                          cx=b["head"] * 0.72 + lean + p["pitch"] * 0.20))

    if b.get("shoulders", True) and b["hat"] != "wizard":
        parts.append(tube("shoulders", z(chestz - h * 0.05), z(chestz + h * 0.01),
                          b["chest"], b["shoulder"] * 1.15, S, ROBE,
                          cx=lean + hunch * 0.6))
    armz0, armz1 = z(waistz + h * 0.06), z(chestz)
    parts += [
        tube("arm_l", armz0, armz1, h * 0.035, h * 0.032, 6, ROBE,
             cx=lean - p["arm"] * b["stride"] * 0.5 + p["reach"], cy=b["shoulder"]),
        tube("arm_r", armz0, armz1, h * 0.035, h * 0.032, 6, ROBE,
             cx=lean + p["arm"] * b["stride"] * 0.5 + p["reach"], cy=-b["shoulder"]),
    ]

    # BOTH WEAPONS HANG OFF THE HAND. The staff had the same fault the cleaver did
    # -- placed at a fixed offset from the torso, so it stood apart from the figure
    # with daylight between them and did not move when he swung. One rule for both:
    # start from where the arm actually is.
    hand_x = lean + p["reach"] + p["arm"] * b["stride"] * 0.5
    if b["weapon"] == "staff":
        # It plants and pivots rather than floating along with him, so the walk
        # swing is damped -- but the ATTACK reach carries it, which is the whole
        # gesture: he thrusts the staff, he does not wave from the elbow.
        sx = lean + p["reach"] * 1.6 + b["waist"] * 0.55 - sw * 0.5
        sy = b["shoulder"] * 1.05
        parts += [
            tube("staff", z(0.0), z(h * 0.91), 0.028, 0.024, 6, WOOD, cx=sx, cy=sy),
            tube("gem", z(h * 0.91), z(h * 0.99), 0.055, 0.02, 6, METAL,
                 cx=sx, cy=sy),
        ]
    elif b["weapon"] == "cleaver":
        # ANCHORED TO THE HAND, not to the body's centre. The first version put the
        # weapon a fixed distance in front of the torso, so it hung in the air beside
        # him with a visible gap -- a prop lying on nothing. It swings from the arm's
        # own position, and `twist` carries it around him, which at this size reads
        # better than an elbow ever could.
        tw = p["twist"]
        hand_y = -b["shoulder"]
        bx = hand_x + math.cos(tw) * h * 0.075
        by = hand_y - math.sin(tw) * h * 0.075
        parts += [
            tube("haft", z(armz1 - h * 0.16), z(armz1 + h * 0.05), 0.017, 0.015,
                 5, WOOD, cx=bx, cy=by),
            box("blade", bx + math.cos(tw) * h * 0.045, by - math.sin(tw) * h * 0.045,
                z(armz1 + h * 0.02), h * 0.105, 0.015, h * 0.075, METAL,
                rotz=tw),
        ]

    pivot = bpy.data.objects.new("pivot", None)
    scene().collection.objects.link(pivot)
    for part in parts:
        part.parent = pivot
    return pivot


def main():
    argv = sys.argv
    args = argv[argv.index("--") + 1:] if "--" in argv else []
    outdir = os.path.abspath(args[0]) if args else os.path.abspath("out/actors")
    only = args[args.index("--only") + 1] if "--only" in args else None
    onlyact = args[args.index("--action") + 1] if "--action" in args else None
    os.makedirs(outdir, exist_ok=True)

    bw.add_camera()
    bw.add_lighting()
    bw.configure_render()

    names = [only] if only else list(BODIES)
    acts = [onlyact] if onlyact else list(ACTIONS)
    total = 0
    for name in names:
        body = BODIES[name]
        for action in acts:
            n = ACTIONS[action]
            for i, d in enumerate(DIRS):
                psi = bw.yaw_for_screen_dir(i)
                for f in range(n):
                    pivot = build(body, action, f / float(n))
                    pivot.rotation_euler = (0.0, 0.0, psi)
                    bpy.context.view_layer.update()
                    bw.render_triple(outdir, "%s_%s_%s_f%d" % (name, action, d, f))
                    total += 1
            print("RENDERED %-8s %-7s x%d frames x8 dirs" % (name, action, n))
    import json
    with open(os.path.join(outdir, "actors.json"), "w") as fh:
        json.dump({"res": bw.RES, "ppu": bw.PPU, "dirs": DIRS,
                   "actions": ACTIONS, "bodies": list(BODIES),
                   "hold_last": ["death"]}, fh, indent=1)
    print("DONE %d frames ->" % total, outdir)


if __name__ == "__main__":
    main()
