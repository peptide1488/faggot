"""Dev server for the game: no-store caching (so edits show on reload) + HTTP Range support (so <audio> streams properly).
python serve.py  ->  http://127.0.0.1:8766/
"""
import http.server, functools, os, re, mimetypes
mimetypes.add_type("audio/ogg", ".ogg"); mimetypes.add_type("model/gltf-binary", ".glb")

class H(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate"); self.send_header("Expires", "0"); self.send_header("Accept-Ranges", "bytes")
        super().end_headers()
    def log_message(self, *a): pass
    def send_head(self):
        path = self.translate_path(self.path)
        rng = self.headers.get("Range")
        if not rng or os.path.isdir(path) or not os.path.exists(path):
            return super().send_head()
        m = re.match(r"bytes=(\d*)-(\d*)", rng)
        size = os.path.getsize(path)
        start = int(m.group(1)) if m and m.group(1) else 0
        end = int(m.group(2)) if m and m.group(2) else size - 1
        end = min(end, size - 1)
        if start > end:
            self.send_response(416); self.send_header("Content-Range", f"bytes */{size}"); self.end_headers(); return None
        f = open(path, "rb"); f.seek(start)
        self.send_response(206)
        self.send_header("Content-Type", self.guess_type(path)); self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        self.send_header("Content-Length", str(end - start + 1)); self.end_headers()
        self._range_len = end - start + 1
        return f
    def copyfile(self, source, outputfile):
        n = getattr(self, "_range_len", None)
        if n is None: return super().copyfile(source, outputfile)
        while n > 0:
            chunk = source.read(min(65536, n))
            if not chunk: break
            outputfile.write(chunk); n -= len(chunk)
        self._range_len = None

http.server.ThreadingHTTPServer(("127.0.0.1", 8766), functools.partial(H, directory=os.path.dirname(os.path.abspath(__file__)))).serve_forever()
