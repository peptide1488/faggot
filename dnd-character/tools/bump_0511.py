#!/usr/bin/env python3
import re
import shutil
from pathlib import Path

root = Path(r"C:\Users\andrew\Desktop\faggot\dnd-character")
eng = Path(r"C:\Users\andrew\Desktop\faggot\iso3d-engine\src")

idx = root / "index.html"
t = idx.read_text(encoding="utf-8")
t = re.sub(r"const APP_VERSION='v[^']+'", "const APP_VERSION='v120.11'", t)
t = re.sub(r"iso3d/boot\.js\?v=[^\"']+", "iso3d/boot.js?v=0.5.11", t)
idx.write_text(t, encoding="utf-8", newline="\n")

sw = root / "sw.js"
st = re.sub(r"grimoire-v[0-9.]+", "grimoire-v120.11", sw.read_text(encoding="utf-8"))
sw.write_text(st, encoding="utf-8", newline="\n")

ver = root / "iso3d" / "src" / "version.js"
vt = re.sub(r"APP_VERSION = '[^']+'", "APP_VERSION = '0.5.11'", ver.read_text(encoding="utf-8"))
ver.write_text(vt, encoding="utf-8")

for n in ("adapter.js", "host.js", "sprites.js", "version.js"):
    shutil.copy2(root / "iso3d" / "src" / n, eng / n)

for rel in ("iso3d/boot.js", "iso3d/src/host.js", "iso3d/src/adapter.js"):
    p = root / rel
    if p.exists():
        tt = p.read_text(encoding="utf-8")
        for old in ("0.5.10", "0.5.9", "0.5.8"):
            tt = tt.replace(f"?v={old}", "?v=0.5.11")
        p.write_text(tt, encoding="utf-8")

text = idx.read_text(encoding="utf-8")
for s in ("Mechanics Lab", "pathToMeta", "qbPromptRopeThenMove", "jumpAcrobaticsDC"):
    assert s in text, s
print("v120.11 / Iso3D 0.5.11 OK")
