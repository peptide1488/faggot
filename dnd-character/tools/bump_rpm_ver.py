#!/usr/bin/env python3
import re
import shutil
from pathlib import Path

root = Path(r"C:\Users\andrew\Desktop\faggot\dnd-character")
eng = Path(r"C:\Users\andrew\Desktop\faggot\iso3d-engine\src")

for name in ("adapter.js", "fx.js", "host.js", "sprites.js", "version.js", "renderer.js"):
    src = root / "iso3d" / "src" / name
    if src.exists():
        shutil.copy2(src, eng / name)
        print("sync", name)

ver = root / "iso3d" / "src" / "version.js"
vt = ver.read_text(encoding="utf-8")
vt = re.sub(r"APP_VERSION = '[^']+'", "APP_VERSION = '0.5.7'", vt)
ver.write_text(vt, encoding="utf-8")
shutil.copy2(ver, eng / "version.js")

idx = root / "index.html"
it = idx.read_text(encoding="utf-8")
it = re.sub(r"const APP_VERSION='v[^']+'", "const APP_VERSION='v120.9'", it)
if "iso3d/boot.js?v=" in it:
    it = re.sub(r"iso3d/boot\.js\?v=[^\"']+", "iso3d/boot.js?v=0.5.7", it)
else:
    it = it.replace('src="iso3d/boot.js"', 'src="iso3d/boot.js?v=0.5.7"')
idx.write_text(it, encoding="utf-8", newline="\n")

sw = root / "sw.js"
st = sw.read_text(encoding="utf-8")
st = re.sub(r"grimoire-v[0-9.]+", "grimoire-v120.9", st)
sw.write_text(st, encoding="utf-8", newline="\n")
print("Grimoire v120.9 / Iso3D 0.5.7")
