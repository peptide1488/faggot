#!/usr/bin/env python3
import re
import shutil
from pathlib import Path

ROOT = Path(r"C:\Users\andrew\Desktop\faggot\dnd-character")
ENG = Path(r"C:\Users\andrew\Desktop\faggot\iso3d-engine\src")
VEN = ROOT / "iso3d" / "src"

for name in ("adapter.js", "fx.js", "host.js", "renderer.js", "version.js"):
    shutil.copy2(VEN / name, ENG / name)
    print("synced", name)

# version already set in version.js to 0.5.6
ver_js = (VEN / "version.js").read_text(encoding="utf-8")
assert "0.5.6" in ver_js, ver_js

idx = ROOT / "index.html"
t = idx.read_text(encoding="utf-8")
t = re.sub(r"const APP_VERSION='v[^']+'", "const APP_VERSION='v120.8'", t)
if "iso3d/boot.js?v=" in t:
    t = re.sub(r'iso3d/boot\.js\?v=[^"\']+', "iso3d/boot.js?v=0.5.6", t)
else:
    t = t.replace('src="iso3d/boot.js"', 'src="iso3d/boot.js?v=0.5.6"')
idx.write_text(t, encoding="utf-8", newline="\n")
print("index APP_VERSION + boot cache bust")

sw = ROOT / "sw.js"
st = sw.read_text(encoding="utf-8")
st = re.sub(r"grimoire-v[0-9.]+", "grimoire-v120.8", st)
sw.write_text(st, encoding="utf-8", newline="\n")
print("sw", re.search(r"grimoire-v[0-9.]+", st).group(0))
