#!/usr/bin/env python3
import re
import shutil
from pathlib import Path

root = Path(r"C:\Users\andrew\Desktop\faggot\dnd-character")
eng = Path(r"C:\Users\andrew\Desktop\faggot\iso3d-engine\src")

for n in ("adapter.js", "host.js", "sprites.js", "terrainTextures.js"):
    src = root / "iso3d" / "src" / n
    if src.exists():
        shutil.copy2(src, eng / n)

ver = root / "iso3d" / "src" / "version.js"
ver.write_text(
    re.sub(r"APP_VERSION = '[^']+'", "APP_VERSION = '0.5.14'", ver.read_text(encoding="utf-8")),
    encoding="utf-8",
)
shutil.copy2(ver, eng / "version.js")

for rel in ("iso3d/boot.js", "iso3d/src/host.js", "iso3d/src/adapter.js", "iso3d/src/renderer.js"):
    p = root / rel
    if not p.exists():
        continue
    t = p.read_text(encoding="utf-8")
    for o in ("0.5.13", "0.5.12", "0.5.11"):
        t = t.replace(f"?v={o}", "?v=0.5.14")
    p.write_text(t, encoding="utf-8")

idx = root / "index.html"
it = idx.read_text(encoding="utf-8")
it = re.sub(r"const APP_VERSION='v[^']+'", "const APP_VERSION='v120.14'", it)
it = re.sub(r"iso3d/boot\.js\?v=[^\"']+", "iso3d/boot.js?v=0.5.14", it)
idx.write_text(it, encoding="utf-8", newline="\n")

sw = root / "sw.js"
sw.write_text(
    re.sub(r"grimoire-v[0-9.]+", "grimoire-v120.14", sw.read_text(encoding="utf-8")),
    encoding="utf-8",
    newline="\n",
)

assert "forceClassic" in idx.read_text(encoding="utf-8")
assert "SPRITE_PACK = 'rpm'" in (root / "iso3d" / "src" / "adapter.js").read_text(encoding="utf-8")
print("v120.14 / 0.5.14 OK")
