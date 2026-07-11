#!/usr/bin/env python3
import re
import shutil
from pathlib import Path

root = Path(r"C:\Users\andrew\Desktop\faggot\dnd-character")
eng = Path(r"C:\Users\andrew\Desktop\faggot\iso3d-engine\src")
OLD, NEW = "0.5.15", "0.5.16"
APP_NEW = "v120.16"

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
):
    p = root / rel
    if not p.exists():
        continue
    t = p.read_text(encoding="utf-8")
    t = t.replace(f"?v={OLD}", f"?v={NEW}")
    t = re.sub(r"\?v=0\.5\.\d+", f"?v={NEW}", t)
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
    ):
        src = root / "iso3d" / "src" / n
        if src.exists():
            shutil.copy2(src, eng / n)

h = (root / "iso3d" / "src" / "host.js").read_text(encoding="utf-8")
assert "drawCorpse" in h
assert f"sprites.js?v={NEW}" in h
assert "export function drawCorpse" in (root / "iso3d" / "src" / "sprites.js").read_text(
    encoding="utf-8"
)
assert f"APP_VERSION = '{NEW}'" in ver.read_text(encoding="utf-8")
assert APP_NEW in idx.read_text(encoding="utf-8")
print(f"OK {APP_NEW} / Iso3D {NEW}")
print("drawCorpse imported:", "drawCorpse," in h or "drawCorpse\n" in h)
