#!/usr/bin/env python3
import re
import shutil
from pathlib import Path

root = Path(r"C:\Users\andrew\Desktop\faggot\dnd-character")
eng = Path(r"C:\Users\andrew\Desktop\faggot\iso3d-engine\src")

idx = root / "index.html"
t = idx.read_text(encoding="utf-8")
t = re.sub(r"const APP_VERSION='v[^']+'", "const APP_VERSION='v120.9.1'", t)
if "iso3d/boot.js?v=" in t:
    t = re.sub(r"iso3d/boot\.js\?v=[^\"']+", "iso3d/boot.js?v=0.5.8", t)
else:
    t = t.replace('src="iso3d/boot.js"', 'src="iso3d/boot.js?v=0.5.8"')
idx.write_text(t, encoding="utf-8", newline="\n")

sw = root / "sw.js"
st = sw.read_text(encoding="utf-8")
st = re.sub(r"grimoire-v[0-9.]+", "grimoire-v120.9.1", st)
sw.write_text(st, encoding="utf-8", newline="\n")

for n in (
    "renderer.js",
    "map.js",
    "host.js",
    "adapter.js",
    "pathfinding.js",
    "version.js",
    "sprites.js",
    "fx.js",
):
    shutil.copy2(root / "iso3d" / "src" / n, eng / n)

smoke = root / "tools" / "smoke_qb_iso3d.py"
sm = smoke.read_text(encoding="utf-8")
smoke.write_text(sm.replace("0.5.7", "0.5.8"), encoding="utf-8")

print("bumped to v120.9.1 / Iso3D 0.5.8")
