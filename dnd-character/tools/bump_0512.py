#!/usr/bin/env python3
import re
import shutil
from pathlib import Path

root = Path(r"C:\Users\andrew\Desktop\faggot\dnd-character")
eng = Path(r"C:\Users\andrew\Desktop\faggot\iso3d-engine\src")

idx = root / "index.html"
t = idx.read_text(encoding="utf-8")
t = re.sub(r"const APP_VERSION='v[^']+'", "const APP_VERSION='v120.12'", t)
t = re.sub(r"iso3d/boot\.js\?v=[^\"']+", "iso3d/boot.js?v=0.5.12", t)
idx.write_text(t, encoding="utf-8", newline="\n")

sw = root / "sw.js"
st = re.sub(r"grimoire-v[0-9.]+", "grimoire-v120.12", sw.read_text(encoding="utf-8"))
sw.write_text(st, encoding="utf-8", newline="\n")

ver = root / "iso3d" / "src" / "version.js"
vt = re.sub(r"APP_VERSION = '[^']+'", "APP_VERSION = '0.5.12'", ver.read_text(encoding="utf-8"))
ver.write_text(vt, encoding="utf-8")

for n in ("adapter.js", "host.js", "sprites.js", "version.js", "terrainTextures.js"):
    src = root / "iso3d" / "src" / n
    if src.exists():
        shutil.copy2(src, eng / n)

for rel in ("iso3d/boot.js", "iso3d/src/host.js", "iso3d/src/adapter.js", "iso3d/src/renderer.js"):
    p = root / rel
    if not p.exists():
        continue
    tt = p.read_text(encoding="utf-8")
    for old in ("0.5.11", "0.5.10", "0.5.9"):
        tt = tt.replace(f"?v={old}", "?v=0.5.12")
    p.write_text(tt, encoding="utf-8")

print("v120.12 / 0.5.12 HQ pack live")
