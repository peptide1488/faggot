"""Serve the demo without the browser second-guessing us.

    python serve.py [port]

WHY THIS EXISTS: `python -m http.server` sends no cache headers, so Chrome
applies its own heuristic and hands back a tiles_demo.html or an actors.json from
ten minutes ago. That cost three separate bugs in one session -- a fix that "did
not work" because the page was stale, a roster of twenty-one bodies that kept
coming back as two, and a ?who= that would not take. The images are content-
addressed and re-baked rarely, so they may cache; the code and the manifests may
not.

WHAT IT IS NOT: faster than http.server in any way that matters. Measured head to
head on this machine, 20 requests each: http.server 3.0ms, this 2.3ms. An earlier
version of THIS FILE was 2048ms because it bound IPv4-only (so every request
waited for localhost's IPv6 attempt to time out) and spoke HTTP/1.0 (a new TCP
connection per file). I measured that, diagnosed it correctly, and then wrote it
up as a fault in http.server -- the thing that had been there all along -- rather
than in the file I had written twenty minutes earlier. It went into a commit
message and the handoff as fact. The comparison that disproves it is one command,
and check_serve.py now runs it.
"""

import socket
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

NEVER_CACHE = (".html", ".json", ".js")


class Handler(SimpleHTTPRequestHandler):
    # KEEP-ALIVE. SimpleHTTPRequestHandler speaks HTTP/1.0 by default, so the
    # connection closes after every response and the browser opens a new TCP
    # connection for each file. A tile set is about fourteen hundred of them, and
    # at ~210ms of connection setup each that is minutes of "loading tile images"
    # -- it looked exactly like the loader had hung.
    protocol_version = "HTTP/1.1"

    def end_headers(self):
        path = self.path.split("?")[0].lower()
        if path.endswith(NEVER_CACHE) or path.endswith("/"):
            self.send_header("Cache-Control", "no-store, must-revalidate")
        else:
            self.send_header("Cache-Control", "max-age=300")
        super().end_headers()

    def log_message(self, fmt, *args):
        pass                                    # the bake logs are noisy enough


class DualStack(ThreadingHTTPServer):
    """Listen on IPv6 AND IPv4.

    On Windows `localhost` resolves to ::1 before 127.0.0.1. A server bound to
    IPv4 only means every request waits for the v6 attempt to fail before
    retrying -- about two seconds each, measured, on a set of fourteen hundred
    files. It is indistinguishable from a hung loader and it is not the loader.
    """
    address_family = socket.AF_INET6

    def server_bind(self):
        self.socket.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 0)
        super().server_bind()


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8777
    print("serving . on http://localhost:%d/tiles_demo.html" % port)
    DualStack(("", port), Handler).serve_forever()
