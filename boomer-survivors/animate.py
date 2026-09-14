"""One still -> loop-safe sprite strip, all local (LTX 2.5 loop + palette-snapped re-pixelize).

  python animate.py NAME path/to/still.png --size 96 [--prompt "..."] [--frames 49] [--seed 5]

Steps: key/prep the still onto magenta at 512 (raw/NAME_in.png) -> gen_loop (LTX, first frame
strength 1.0, same still pinned as last frame) -> make_sheet at --size with the still's own palette
(so colours never drift) -> sprites/NAME.png + .json. Enemy sheets in the game are 96 px, the Boomer
is 128. Direction strips are named <char>_down / _up / _side (or boomer8_<dir>).
"""
import argparse, os, subprocess, sys, shutil
from PIL import Image
HERE = os.path.dirname(os.path.abspath(__file__))
IDLE = ("pixel art sprite, the character stays in place and does a small idle motion: gentle breathing bob, "
        "slight sway, feet planted, flat solid magenta background, camera locked, nothing else changes")
WALK = ("pixel art sprite, the character walks in place: legs and arms swing in a steady walking cycle, "
        "body bobs with each step, stays centred, flat solid magenta background, camera locked, nothing else changes")

def prep(src, name):
    im = Image.open(src).convert("RGBA")
    if im.getbbox() and any(im.getpixel((0, 0))[3] == 0 for _ in [0]):      # transparent still: crop + centre on magenta
        im = im.crop(im.getbbox()); s = 512 * 0.8 / max(im.size); im = im.resize((max(1, round(im.width * s)), max(1, round(im.height * s))), Image.NEAREST)
        bg = Image.new("RGB", (512, 512), (255, 0, 255)); bg.paste(im, ((512 - im.width) // 2, (512 - im.height) // 2), im); out = bg
    else:
        sys.path.insert(0, HERE); import make_sheet as ms; out = Image.open(ms.prep(src)).convert("RGB")
    dst = os.path.join(HERE, "raw", name + "_in.png"); out.save(dst); return dst

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("name"); ap.add_argument("still"); ap.add_argument("--size", type=int, default=96)
    ap.add_argument("--prompt", default=None); ap.add_argument("--walk", action="store_true"); ap.add_argument("--frames", type=int, default=49); ap.add_argument("--seed", type=int, default=5)
    a = ap.parse_args()
    prep(a.still, a.name)
    prompt = a.prompt or (WALK if a.walk else IDLE)
    r = subprocess.run([sys.executable, os.path.join(HERE, "gen_loop.py"), a.name, prompt, "--frames", str(a.frames), "--first", "1.0", "--seed", str(a.seed)], capture_output=True, text=True)
    folder = r.stdout.strip().splitlines()[-1] if r.stdout.strip() else ""
    if not os.path.isdir(folder): raise SystemExit("loop failed:\n" + r.stdout[-800:] + r.stderr[-800:])
    subprocess.check_call([sys.executable, os.path.join(HERE, "make_sheet.py"), "sheet", folder, a.name, "--frames", "8", "--size", str(a.size)])
    sh = Image.open(os.path.join(HERE, "sprites", a.name + ".png")); prev = sh.resize((sh.width * 2, sh.height * 2), Image.NEAREST)
    bg = Image.new("RGBA", prev.size, (60, 90, 60, 255)); bg.paste(prev, (0, 0), prev); p = os.path.join(HERE, "raw", f"_{a.name}_sheet2x.png"); bg.save(p)
    print("sheet:", os.path.join(HERE, "sprites", a.name + ".png"), "preview:", p)

if __name__ == "__main__":
    main()
