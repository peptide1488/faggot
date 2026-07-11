#!/usr/bin/env python3
import re
import shutil
from pathlib import Path

root = Path(r"C:\Users\andrew\Desktop\faggot\dnd-character")
eng = Path(r"C:\Users\andrew\Desktop\faggot\iso3d-engine\src")

idx = root / "index.html"
t = idx.read_text(encoding="utf-8")
t = re.sub(r"const APP_VERSION='v[^']+'", "const APP_VERSION='v120.10'", t)
t = re.sub(r"iso3d/boot\.js\?v=[^\"']+", "iso3d/boot.js?v=0.5.9", t)
if "boot.js?v=" not in t:
    t = t.replace('src="iso3d/boot.js"', 'src="iso3d/boot.js?v=0.5.9"')
idx.write_text(t, encoding="utf-8", newline="\n")

sw = root / "sw.js"
st = sw.read_text(encoding="utf-8")
st = re.sub(r"grimoire-v[0-9.]+", "grimoire-v120.10", st)
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
    "terrainTextures.js",
):
    src = root / "iso3d" / "src" / n
    if src.exists():
        shutil.copy2(src, eng / n)

smoke = root / "tools" / "smoke_qb_iso3d.py"
sm = smoke.read_text(encoding="utf-8")
for a, b in (("0.5.8", "0.5.9"), ("0.5.7", "0.5.9")):
    sm = sm.replace(a, b)
smoke.write_text(sm, encoding="utf-8")
print("v120.10 / Iso3D 0.5.9")
