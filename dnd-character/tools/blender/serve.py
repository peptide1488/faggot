"""Serve the demo without the browser second-guessing us.

    python serve.py [port]

python -m http.server sends no cache headers, so Chrome applies its own heuristic
and will happily hand back a tiles_demo.html or an actors.json from ten minutes
ago. That cost real time three separate ways in one session: a fix that "did not
work" because the page was stale, a roster of twenty-one bodies that kept coming
back as two, and a ?who= that would not take. The images are content-addressed by
name and re-baked rarely, so they may cache; the code and the manifests may not.
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
