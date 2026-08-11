"""How long does the page take to show something, and where does that time go?

    python measure_load.py [url] [--headed]

Every capture in this project has been taken with --wait 16, which silently
turned "the page takes sixteen seconds" into a constant nobody looked at. The
user saw it immediately: a black screen that eventually fills in. This prints
the timeline instead of hiding it -- when the manifest lands, when the tile art
finishes decoding, when the first frame is actually on the canvas -- plus the
bytes fetched, so "it is slow" becomes a number with a cause attached.
"""
import sys, time
from playwright.sync_api import sync_playwright

args = sys.argv[1:]
url = args[0] if args and not args[0].startswith("-") else \
    "http://localhost:8777/tiles_demo.html?set=grass10A&seed=3&map=12"
headed = "--headed" in args

PROBE = """(() => {
  // A FRAME COUNTER, NOT THE CANVAS. readPixels on a presented WebGL drawing
  // buffer comes back black no matter what was drawn, so probing the pixels
  // reported a page that was visibly up as still loading.
  return {
    engine: !!window.__engine,
    frames: window.__engine ? __engine.frames() : 0,
    status: (document.getElementById('status')||{}).textContent || '',
    imgs: (window.__engine && __engine.vram) ? __engine.vram().loaded : 0,
  };
})()"""

with sync_playwright() as pw:
    b = pw.chromium.launch(headless=not headed, args=["--use-gl=angle", "--use-angle=d3d11"])
    pg = b.new_page(viewport={"width": 1600, "height": 900}, device_scale_factor=2)
    bytes_by_kind = {}
    def on_response(r):
        try:
            n = int(r.headers.get("content-length") or 0)
        except Exception:
            n = 0
        u = r.url.rsplit("/", 1)[-1]
        kind = ("tile art" if u.endswith(".png") and "/props/" not in r.url and
                "actors" not in r.url and "fx" not in r.url else
                "props" if "/props/" in r.url else
                "actors/fx" if ("actors" in r.url or "fx" in r.url) else
                "json" if u.endswith(".json") else "page")
        d = bytes_by_kind.setdefault(kind, [0, 0])
        d[0] += 1; d[1] += n
    pg.on("response", on_response)

    t0 = time.time()
    pg.goto(url)
    marks, seen = [], set()
    for _ in range(400):                      # up to ~60s
        try:
            st = pg.evaluate(PROBE)
        except Exception:
            st = {}
        t = time.time() - t0
        if st.get("engine") and "engine" not in seen:
            seen.add("engine"); marks.append(("engine ready", t))
        if st.get("frames", 0) > 0 and "painted" not in seen:
            seen.add("painted"); marks.append(("FIRST FRAME DRAWN", t))
        if st.get("imgs") and "art" not in seen:
            seen.add("art"); marks.append(("tile art decoded (%d)" % st["imgs"], t))
        if "painted" in seen:
            break
        time.sleep(0.15)
    total = time.time() - t0

    print("TIMELINE")
    for k, t in marks:
        print("  %-28s %6.2fs" % (k, t))
    print("  %-28s %6.2fs" % ("first pixels on canvas", total))
    print("\nFETCHED")
    for k, (n, by) in sorted(bytes_by_kind.items(), key=lambda x: -x[1][1]):
        print("  %-12s %4d requests  %8.1f MB" % (k, n, by / 1048576))
    b.close()
