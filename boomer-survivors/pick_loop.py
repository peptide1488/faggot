"""Render N seeds of one loop and keep the steadiest: the one whose sprite bounding box drifts
least from frame 0 (LTX likes to swing a front-facing mower round to three-quarter view).

  python pick_loop.py boomer_down "prompt..." --seeds 3
"""
import os, sys, glob, shutil, argparse
import numpy as np
from PIL import Image
import gen_loop, make_sheet as ms

LOOPS = os.path.join(gen_loop.OUT, "boomer_survivors", "loop")


def drift(folder):
    fs = sorted(glob.glob(os.path.join(folder, "*.png")))
    boxes = []
    for f in fs[:-1]:
        a = np.array(Image.open(f).convert("RGB"))
        m = ms.key(a, ms.bg_colour(a))
        ys, xs = np.where(m)
        boxes.append((xs.min(), xs.max(), ys.min(), ys.max()))
    b0 = boxes[0]
    d = [abs(b[0] - b0[0]) + abs(b[1] - b0[1]) + abs(b[2] - b0[2]) + abs(b[3] - b0[3]) for b in boxes]
    return max(d), float(np.mean(d))


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("name"); ap.add_argument("prompt"); ap.add_argument("--seeds", type=int, default=3)
    ap.add_argument("--base", type=int, default=9000); ap.add_argument("--size", type=int, default=256)
    a = ap.parse_args()
    results = []
    for k in range(a.seeds):
        seed = a.base + k
        folder = gen_loop.run(a.name, a.prompt, seed=seed, first_strength=1.0, tag=f"s{seed}")
        if not folder:
            continue
        mx, mean = drift(folder)
        print(f"seed {seed}: max drift {mx}px mean {mean:.1f}px", flush=True)
        results.append((mx, mean, seed, folder))
    results.sort()
    mx, mean, seed, folder = results[0]
    print("BEST", seed, mx, mean)
    final = os.path.join(LOOPS, a.name)
    if os.path.exists(final):
        shutil.rmtree(final)
    shutil.copytree(folder, final)
    ms.sheet(final, a.name, 8, a.size)
