#!/usr/bin/env python3
"""
DEPRECATED — the rectangle stick-figure generator produced unusable art.

Use instead:
  python dnd-character/tools/build_hq_pack.py

That builds the pack from real PixelLab HQ bases (fighter/goblin/trees)
plus palette variants and the critters wolf sheet.
"""
from __future__ import annotations

import runpy
from pathlib import Path

if __name__ == "__main__":
    print("gen_pixel_sprites.py is deprecated → running build_hq_pack.py")
    runpy.run_path(str(Path(__file__).with_name("build_hq_pack.py")), run_name="__main__")
