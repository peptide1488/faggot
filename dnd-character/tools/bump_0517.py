#!/usr/bin/env python3
import re
import shutil
from pathlib import Path

root = Path(r"C:\Users\andrew\Desktop\faggot\dnd-character")
eng = Path(r"C:\Users\andrew\Desktop\faggot\iso3d-engine\src")
NEW = "0.5.17"
APP_NEW = "v120.17"

ver = root / "iso3d" / "src" / "version.js"
ver.write_text(
    re.sub(r"APP_VERSION = '[^']+'", f"APP_VERSION = '{NEW}'", ver.read_text(encoding="utf-8")),
    encoding="utf-8",
)

for rel in (
    "iso3d/boot.js",
    "iso3d/src/host.js",
    "iso3d/src/adapter.js",
    "iso3d/src/renderer.js",
    "iso3d/src/sprites.js",
    "iso3d/src/fx.js",
    "iso3d/src/pathfinding.js",
    "iso3d/src/terrainTextures.js",
):
    p = root / rel
    if not p.exists():
        continue
    t = re.sub(r"\?v=0\.5\.\d+", f"?v={NEW}", p.read_text(encoding="utf-8"))
    p.write_text(t, encoding="utf-8")

idx = root / "index.html"
it = idx.read_text(encoding="utf-8")
it = re.sub(r"const APP_VERSION='v[^']+'", f"const APP_VERSION='{APP_NEW}'", it)
it = re.sub(r"iso3d/boot\.js\?v=[^\"']+", f"iso3d/boot.js?v={NEW}", it)
idx.write_text(it, encoding="utf-8", newline="\n")

sw = root / "sw.js"
sw.write_text(
    re.sub(r"grimoire-v[0-9.]+", f"grimoire-{APP_NEW}", sw.read_text(encoding="utf-8")),
    encoding="utf-8",
    newline="\n",
)

if eng.exists():
    for n in (
        "adapter.js",
        "host.js",
        "sprites.js",
        "terrainTextures.js",
        "version.js",
        "fx.js",
        "pathfinding.js",
        "renderer.js",
    ):
        src = root / "iso3d" / "src" / n
        if src.exists():
            shutil.copy2(src, eng / n)

rend = (root / "iso3d" / "src" / "renderer.js").read_text(encoding="utf-8")
assert "const TEX_SUB = 16" in rend
assert "sprites/hq/terrain/grass.png" in (root / "iso3d" / "src" / "terrainTextures.js").read_text(
    encoding="utf-8"
)
assert (root / "sprites" / "hq" / "terrain" / "grass.png").exists()
print(f"OK {APP_NEW} / Iso3D {NEW}")
