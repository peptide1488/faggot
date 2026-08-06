"""
Fetch CC0 stone textures from Poly Haven for the tile bake.

    python fetch_textures.py [asset ...]

Poly Haven is CC0 -- public domain, no attribution required, safe for a repo
that gets served publicly. (That matters here: ripping sprites out of a shipped
game was considered and rejected for exactly this reason.)

WHAT WE TAKE AND WHY:
    Diffuse       the colour. This is the point -- two octaves of procedural
                  noise will never have the tonal variety of a photograph of
                  actual stone, which is the whole "everything is the same
                  colour" problem.
    Displacement  a HEIGHT FIELD, which is what the bake actually needs. The
                  tangent-space normal map (nor_gl) is useless to us: these
                  tiles are generated meshes with no UV layout, so the textures
                  are box-projected, and box projection has no tangents to
                  interpret a tangent-space normal in. A scalar height drives a
                  Bump node correctly under any projection, and the same chain
                  feeds the _NRM pass, so what the runtime lights matches what
                  you see.
    Rough         specular breakup; cheap to take while we are here.
"""

import json
import os
import sys
import urllib.request

API = "https://api.polyhaven.com"
UA = {"User-Agent": "iso-tile-bake/1.0"}
HERE = os.path.dirname(os.path.abspath(__file__))
DEST = os.path.join(HERE, "textures")

# what each tile surface is made of
WANT = {
    "medieval_blocks_05": "wall",        # coursed blocks -- reads as built
    "cobblestone_floor_08": "floor",     # laid stones -- reads as walked on
    "castle_brick_broken_06": "wall_alt",
}
MAPS = {"Diffuse": "diffuse", "Displacement": "disp", "Rough": "rough"}
RES = "2k"


def get(url):
    return json.load(urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60))


def fetch(asset):
    files = get("%s/files/%s" % (API, asset))
    out = os.path.join(DEST, asset)
    os.makedirs(out, exist_ok=True)
    got = {}
    for key, short in MAPS.items():
        if key not in files:
            print("   no %s map" % key)
            continue
        node = files[key].get(RES) or list(files[key].values())[0]
        fmt = "jpg" if "jpg" in node else sorted(node)[0]
        url = node[fmt]["url"]
        path = os.path.join(out, "%s.%s" % (short, fmt))
        if not os.path.exists(path):
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=180) as r, open(path, "wb") as f:
                f.write(r.read())
        got[short] = path
        print("   %-8s %6.1f MB  %s" % (short, os.path.getsize(path) / 1e6, os.path.basename(path)))
    return got


if __name__ == "__main__":
    assets = sys.argv[1:] or list(WANT)
    os.makedirs(DEST, exist_ok=True)
    for a in assets:
        print(a, "(%s)" % WANT.get(a, "?"))
        fetch(a)
    print("->", DEST)
