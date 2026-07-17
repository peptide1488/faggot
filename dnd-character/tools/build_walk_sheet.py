#!/usr/bin/env python3
"""
Build a 4-col x 4-row walk-cycle sheet (down/left/right/up rows, idle+3-walk-frame
columns) from real PixelLab character rotations + walk animations, replacing the
old palette-tint hack in build_hq_pack.py.

Usage:
  python build_walk_sheet.py manifest.json

manifest.json: {"out": "sprites/hq/characters/wizard.png",
  "south": {"idle": "URL", "walk": ["URL","URL","URL","URL","URL","URL"]},
  "west": {...}, "east": {...}, "north": {...}}

Cell size: 128x128 (matches SPRITE_PIPELINE.md's documented canonical format).

Column semantics (must match host.js's _spriteFrame exactly):
  - WALKING cycles through all 4 columns (0,1,2,3) as the stride.
  - IDLE (not walking) alternates ONLY columns 0<->1 as a subtle "breathing" bob.
  col0 = the static rotation/idle image. col1 = SAME idle image (not a walk-cycle
  frame) so idle never shows a mid-stride lunge — a real bug hit live ("idle
  animation totally wrong": a standing character kept popping into a walking
  lunge pose every ~420ms, because col1 held a genuine mid-stride frame and
  idle alternates 0<->1). col2/col3 = walk-cycle frames 2 and 4 (of the 6-frame
  cycle), giving two real stride poses for the WALKING cycle at some cost to
  walk smoothness (col0/col1 repeat during walking) — a minor tradeoff against
  the much more jarring idle bug.

Cropping: every frame (idle + all 6 walk frames) for a given direction is
cropped to the SAME shared bounding box (the union of all their alpha content),
then scaled up uniformly. PixelLab pads its canvas ~40% larger than the actual
character to leave room for animations, so naively resizing the whole padded
canvas per frame (the original approach) made the character read far too small
and let independent per-frame crops drift the body/weapon registration between
frames — a real bug hit live ("goblins... not holding a weapon, its floating
beside them"). A single shared crop/scale applied to every frame preserves
PixelLab's own relative positioning exactly, so nothing jitters.
"""
from __future__ import annotations

import io
import json
import sys
import urllib.request
from pathlib import Path

from PIL import Image

CELL = 128
# PixelLab rotation label -> engine sheet row (down/left/right/up). PixelLab's
# "west"/"east" are compass-relative turntable labels, not screen-relative —
# empirically checked against the actual generated art (south="north"=the two
# unambiguous full front/back views) but the left/right assignment for the two
# profile shots is the one part not yet re-verified live in-engine after the
# "facing wrong directions" report. If a class still faces backwards after this
# rebuild, swap the "west"/"east" values below.
DIRS = {"down": "south", "left": "west", "right": "east", "up": "north"}
ROW_ORDER = ["down", "left", "right", "up"]
ROOT = Path(__file__).resolve().parents[1]

_cache: dict[str, Image.Image] = {}


def fetch(url: str) -> Image.Image:
    if url in _cache:
        return _cache[url]
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req) as r:
        data = r.read()
    im = Image.open(io.BytesIO(data)).convert("RGBA")
    _cache[url] = im
    return im


def union_bbox(images: list[Image.Image]) -> tuple[int, int, int, int]:
    l, t, r, b = None, None, None, None
    for im in images:
        bbox = im.split()[-1].getbbox()
        if not bbox:
            continue
        l = bbox[0] if l is None else min(l, bbox[0])
        t = bbox[1] if t is None else min(t, bbox[1])
        r = bbox[2] if r is None else max(r, bbox[2])
        b = bbox[3] if b is None else max(b, bbox[3])
    if l is None:
        w, h = images[0].size
        return (0, 0, w, h)
    return (l, t, r, b)


def place_in_cell(im: Image.Image, crop_box: tuple[int, int, int, int]) -> Image.Image:
    """Crop to the shared box, scale uniformly to fit CELLxCELL, feet-anchor bottom."""
    cropped = im.crop(crop_box)
    cropped.thumbnail((CELL, CELL), Image.LANCZOS)
    canvas = Image.new("RGBA", (CELL, CELL), (0, 0, 0, 0))
    x = (CELL - cropped.width) // 2
    y = CELL - cropped.height  # feet anchored to bottom of cell
    canvas.paste(cropped, (x, y), cropped)
    return canvas


def build_one(manifest: dict) -> None:
    sheet = Image.new("RGBA", (CELL * 4, CELL * 4), (0, 0, 0, 0))
    for row, row_name in enumerate(ROW_ORDER):
        pixellab_dir = DIRS[row_name]
        spec = manifest[pixellab_dir]
        idle_im = fetch(spec["idle"])
        walk_urls = spec.get("walk") or []
        walk_ims = [fetch(u) for u in walk_urls]
        # Shared crop reference across every frame of this direction, so nothing
        # drifts relative to anything else (see module docstring).
        crop_box = union_bbox([idle_im] + walk_ims)

        col0 = place_in_cell(idle_im, crop_box)
        sheet.paste(col0, (0, row * CELL), col0)
        # col1 = idle duplicate (see docstring) so idle-bob never shows a lunge.
        sheet.paste(col0, (CELL, row * CELL), col0)
        if len(walk_ims) >= 5:
            # Real walk cycle available: cols 2-3 get real stride frames.
            for col, frame_idx in [(2, 2), (3, 4)]:
                im = place_in_cell(walk_ims[frame_idx], crop_box)
                sheet.paste(im, (col * CELL, row * CELL), im)
        else:
            # No walk animation for this character (static-pose-only mode) —
            # every column repeats the idle pose rather than crashing on a
            # missing frame index. The character just won't animate while
            # moving until a walk cycle is generated later.
            sheet.paste(col0, (2 * CELL, row * CELL), col0)
            sheet.paste(col0, (3 * CELL, row * CELL), col0)

    out_path = ROOT / manifest["out"]
    out_path.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(out_path)
    print(f"wrote {out_path} ({sheet.width}x{sheet.height})")


def main():
    manifest_path = Path(sys.argv[1])
    data = json.loads(manifest_path.read_text())
    entries = data if isinstance(data, list) else [data]
    for entry in entries:
        build_one(entry)


if __name__ == "__main__":
    main()
