"""Serve the demo without the browser second-guessing us.

    python serve.py [port]

python -m http.server sends no cache headers, so Chrome applies its own heuristic
and will happily hand back a tiles_demo.html or an actors.json from ten minutes
ago. That cost real time three separate ways in one session: a fix that "did not
work" because the page was stale, a roster of twenty-one bodies that kept coming
back as two, and a ?who= that would not take. The images are content-addressed by
name and re-baked rarely, so they may cache; the code and the manifests may not.
"""
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

NEVER_CACHE = (".html", ".json", ".js")


class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        path = self.path.split("?")[0].lower()
        if path.endswith(NEVER_CACHE) or path.endswith("/"):
            self.send_header("Cache-Control", "no-store, must-revalidate")
        else:
            self.send_header("Cache-Control", "max-age=300")
        super().end_headers()

    def log_message(self, fmt, *args):
        pass                                    # the bake logs are noisy enough


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8777
    print("serving %s on http://localhost:%d/tiles_demo.html" % (".", port))
    ThreadingHTTPServer(("", port), Handler).serve_forever()
