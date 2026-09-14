"""Full asset pipeline: Krea-2 stills (gen_assets) -> prep -> LTX 2.5 loop (gen_loop) -> sheet.
Krea first for everything missing, THEN LTX for every character (one checkpoint family at a time).

  python build_all.py            # everything missing
  python build_all.py boomer     # only names containing 'boomer'
"""
import os, sys, subprocess, glob
import gen_assets, gen_loop, make_sheet

HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(HERE, "raw")
LOOPS = os.path.join(gen_loop.OUT, "boomer_survivors", "loop")

LOCK = ("The camera is locked off and never moves, the character stays in the exact same place and "
        "size in the frame, the flat magenta background stays perfectly solid and unchanged. Crisp "
        "pixel art, no smoothing, no new objects.")
MOWER = ("Pixel art sprite animation of a fat pale wojak boomer man in a red S&P cap, sunglasses and gray tank top "
         "riding a GREEN John Deere style riding lawnmower with a yellow seat and yellow wheel hubs, {view}. The mower "
         "idles in place: the black tires rotate slowly, the whole mower and rider vibrate with a small engine shake, "
         "a tiny wisp of gray exhaust puffs from the back of the mower and fades, the cigarette glows. The mower stays "
         "GREEN and exactly the same shape and size the whole time. " + LOCK)
WALK = ("Pixel art sprite animation of {who}, {view}, walking in place with a steady two-step walk cycle: "
        "legs stepping alternately, arms swinging, body bobbing up and down slightly with each step. " + LOCK)
ROLL = ("Pixel art sprite animation of {who}, {view}, rolling forward in place: the wheelchair wheels "
        "rotate, his hands push the wheel rims, his head bobs slightly, the small flag flutters. " + LOCK)
VIEW = {"down": "seen from the front three-quarter view", "up": "seen from behind", "side": "seen in profile facing right"}
WHO = {"zoomer": "a skinny zoomer teenager in a hoodie holding a phone",
       "soyjak": "a pale bald soyjak man with round glasses",
       "karen": "an angry blonde middle-aged woman in a pink cardigan holding a clipboard",
       "bobo": "a chubby brown cartoon bear in a red t-shirt",
       "biden": "an old white-haired man in a navy suit in a wheelchair"}

CHARS = ["boomer", "bobo", "zoomer", "soyjak", "karen", "biden"]
FRAMES = 8
SIZES = {"boomer": 256}          # user: 128-256 for the mower; enemies default 128
DEF_SIZE = 128


def prompt_for(char, d):
    if char == "boomer":
        return MOWER.format(view=VIEW[d])
    if char == "biden":
        return ROLL.format(who=WHO[char], view=VIEW[d])
    return WALK.format(who=WHO[char], view=VIEW[d])


if __name__ == "__main__":
    want = sys.argv[1:]
    # 1. stills
    if "--no-krea" in want:
        want.remove("--no-krea")
    else:
        subprocess.run([sys.executable, os.path.join(HERE, "gen_assets.py")] + want, check=False)
    # 2. loops + sheets
    for char in CHARS:
        if want and not any(w in char for w in want):
            continue
        for d in ("down", "up", "side"):
            name = f"{char}_{d}"
            raw = os.path.join(RAW, name + ".png")
            if not os.path.exists(raw):
                print("missing still", name); continue
            sheet_path = os.path.join(HERE, "sprites", name + ".png")
            if os.path.exists(sheet_path):
                print("skip (sheet exists)", name); continue
            folder = os.path.join(LOOPS, name)
            if len(glob.glob(os.path.join(folder, "*.png"))) < 97:
                if not os.path.exists(os.path.join(RAW, name + "_in.png")):
                    make_sheet.prep(raw)
                folder = gen_loop.run(name, prompt_for(char, d), seed=700 + hash(name) % 1000, first_strength=1.0)
                if not folder:
                    print("LOOP FAILED", name); continue
            make_sheet.sheet(folder, name, FRAMES, SIZES.get(char, DEF_SIZE))
    print("build_all done")
