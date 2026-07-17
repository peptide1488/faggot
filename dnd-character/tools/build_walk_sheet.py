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
Columns picked from the 6-frame walk cycle: idle image, frame 1, frame 3, frame 5
(evenly spaced, skips near-duplicate contact-pose frames).
"""
from __future__ import annotations

import io
import json
import sys
import urllib.request
from pathlib import Path

from PIL import Image

CELL = 128
DIRS = ["south", "west", "east", "north"]  # down, left, right, up
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


def fit_cell(im: Image.Image) -> Image.Image:
    """Resize (preserving aspect, centered) into a CELLxCELL transparent canvas."""
    im = im.copy()
    im.thumbnail((CELL, CELL), Image.LANCZOS)
    canvas = Image.new("RGBA", (CELL, CELL), (0, 0, 0, 0))
    x = (CELL - im.width) // 2
    y = CELL - im.height  # feet anchored to bottom of cell
    canvas.paste(im, (x, y), im)
    return canvas


def build_one(manifest: dict) -> None:
    sheet = Image.new("RGBA", (CELL * 4, CELL * 4), (0, 0, 0, 0))
    for row, d in enumerate(DIRS):
        spec = manifest[d]
        idle_im = fit_cell(fetch(spec["idle"]))
        sheet.paste(idle_im, (0, row * CELL), idle_im)
        walk_urls = spec["walk"]
        for col, frame_idx in enumerate([1, 3, 5], start=1):
            im = fit_cell(fetch(walk_urls[frame_idx]))
            sheet.paste(im, (col * CELL, row * CELL), im)

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
