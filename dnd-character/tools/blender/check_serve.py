"""Is the dev server actually serving, and quickly?

    python check_serve.py [port]

A page loads ~1400 files. At 3ms that is four seconds; at 200ms it is five
minutes and looks exactly like a hung loader. This existed as a lesson and not as
a check, so it was learned twice: once when a "missing" prop image turned out to
be a slow server, and once when I attributed my own server's 2048ms to the stock
one without ever running them side by side.

Fails loudly rather than printing something a person has to interpret.
"""
import sys
import time
import urllib.error
import urllib.request

PORT = sys.argv[1] if len(sys.argv) > 1 else "8777"
BASE = "http://localhost:%s/" % PORT
# small files the page really asks for, hit repeatedly
PROBES = ["tiles_demo.html", "out/grass10A/packed/pack.json", "out/props/props.json"]
BUDGET_MS = 25.0          # generous: measured 2-3ms, and 1400 files at 25ms is 35s


def main():
    try:
        urllib.request.urlopen(BASE + PROBES[0], timeout=5).read()
    except (urllib.error.URLError, OSError) as e:
        raise SystemExit("no server on %s (%s)\n"
                         "start it with:  python serve.py %s" % (PORT, e, PORT))

    worst = 0.0
    for probe in PROBES:
        t0 = time.time()
        for _ in range(8):
            try:
                urllib.request.urlopen(BASE + probe, timeout=10).read()
            except urllib.error.HTTPError as e:
                if e.code == 404:
                    print("  skip %s (404 -- not baked?)" % probe)
                    break
                raise
        else:
            ms = (time.time() - t0) / 8 * 1000
            worst = max(worst, ms)
            print("  %-38s %6.1f ms" % (probe, ms))

    # cache headers: the reason this file exists at all
    with urllib.request.urlopen(BASE + "tiles_demo.html") as r:
        cc = r.headers.get("Cache-Control", "")
    print("  cache-control on the page              %s" % (cc or "(none)"))

    bad = []
    if worst > BUDGET_MS:
        bad.append("%.0f ms per request, budget %.0f -- a page is ~1400 files, so "
                   "this is %.0f s of loading and will look like a hang. Check the "
                   "server binds dual-stack and speaks HTTP/1.1."
                   % (worst, BUDGET_MS, worst * 1400 / 1000))
    if "no-store" not in cc:
        bad.append("the page is cacheable, so edits will not show up and the next "
                   "bug you chase will be a stale file. Use serve.py.")
    if bad:
        raise SystemExit("\nFAIL\n  " + "\n  ".join(bad))
    print("\nok  %.1f ms worst, no-store on the page" % worst)


if __name__ == "__main__":
    main()
