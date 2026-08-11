"""Drive the demo in a real browser from the command line.

    python shot.py [url] [-o out.png] [--wait 14] [--eval "expr"] [--key e]

The MCP browser dropped mid-session and needed a restart to come back, and I took
that to mean the browser was unavailable. It was not: playwright is installed as a
python package with its own chromium, so the loop that actually matters -- load the
page, wait for the bake to load, screenshot it, read the console -- is a script.

Prints console errors and the value of --eval, so a failure says what went wrong
rather than just looking wrong.
"""
import sys
from playwright.sync_api import sync_playwright

args = sys.argv[1:]


def opt(flag, default=None):
    return args[args.index(flag) + 1] if flag in args else default


url = args[0] if args and not args[0].startswith("-") else \
    "http://localhost:8777/tiles_demo.html?set=grass10A"
out = opt("-o", "shot.png")
wait = float(opt("--wait", "14"))
expr = opt("--eval")
key = opt("--key")

with sync_playwright() as pw:
    b = pw.chromium.launch(args=["--use-gl=angle", "--use-angle=d3d11"])  # real GPU via ANGLE/D3D11 -- headless defaults to
        # SwiftShader, which rasterises ~60fps scenes on the CPU and once
        # pegged the machine for 8 minutes; with these flags the headless
        # browser uses the same GPU the desktop one does, and falls back to
        # software by itself if the driver refuses
    pg = b.new_page(viewport={"width": 1600, "height": 900},
                    device_scale_factor=2)
    errs = []
    pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
    pg.on("pageerror", lambda e: errs.append("PAGEERROR " + str(e)))
    pg.goto(url)
    pg.wait_for_timeout(int(wait * 1000))
    if key:
        pg.keyboard.press(key)
        pg.wait_for_timeout(1200)
    if expr:
        try:
            print("EVAL", pg.evaluate(expr))
        except Exception as e:
            print("EVAL FAILED", e)
    pg.screenshot(path=out)
    b.close()

print("SHOT", out)
if errs:
    print("CONSOLE ERRORS (%d):" % len(errs))
    for e in errs[:12]:
        print("  " + e[:200])
else:
    print("no console errors")
