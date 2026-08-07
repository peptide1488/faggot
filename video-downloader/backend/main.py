import asyncio
import os
import re
import shutil
import sys
import threading
import uuid
from pathlib import Path
from typing import Optional
from urllib.parse import urlsplit, urlunsplit

import yt_dlp
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel

# Our bundled extractors for sites yt-dlp doesn't support out of the box
# (e.g. the KVS/kt_player-based cumgloryhole/gloryholeswallow sites). Rather
# than rely on yt-dlp's plugin auto-discovery - which is fragile across
# versions and platforms - we import the classes directly and register them
# ahead of the Generic extractor on every YoutubeDL we build (see make_ydl).
sys.path.insert(0, str(Path(__file__).resolve().parent))
CUSTOM_EXTRACTORS = []
try:
    from yt_dlp_plugins.extractor.cumgloryhole import CumgloryholeIE

    CUSTOM_EXTRACTORS.append(CumgloryholeIE)
except Exception as exc:  # pragma: no cover - best-effort, don't kill startup
    print(f"Warning: could not load custom extractors: {exc}", flush=True)


def make_ydl(opts):
    """Build a YoutubeDL with our custom extractors checked BEFORE Generic.

    yt-dlp iterates its extractor dict in order and uses the first whose
    suitable() matches; Generic matches everything and sits last, so a
    dedicated extractor only wins if it comes earlier. add_info_extractor()
    appends after Generic, so instead we splice our extractors onto the front
    of the instance's extractor map.
    """
    ydl = yt_dlp.YoutubeDL(opts)
    customs = {}
    for cls in CUSTOM_EXTRACTORS:
        ie = cls()
        ie.set_downloader(ydl)
        customs[cls.ie_key()] = ie
    if customs:
        ydl._ies = {**customs, **ydl._ies}
        ydl._ies_instances.update(customs)
    return ydl


BASE_DIR = Path(__file__).resolve().parent.parent
DOWNLOAD_DIR = BASE_DIR / "downloads"
DOWNLOAD_DIR.mkdir(exist_ok=True)


def _git_revision() -> str:
    import subprocess

    try:
        return subprocess.run(
            ["git", "rev-parse", "--short", "HEAD"],
            capture_output=True, text=True, cwd=BASE_DIR, timeout=5,
        ).stdout.strip() or "unknown"
    except Exception:
        return "unknown"


# Captured at import, NOT per request: a pull updates the working tree
# immediately while this process keeps running the code it already loaded.
# Reporting the checkout would claim a fix is live before it actually is.
LOADED_REVISION = _git_revision()

# Set to a browser name (e.g. "firefox", "chrome", "edge") to let yt-dlp
# reuse that browser's cookies for sites that require login/age verification.
COOKIES_FROM_BROWSER = os.environ.get("COOKIES_FROM_BROWSER")

# Optional proxy for all yt-dlp traffic, e.g. socks5://127.0.0.1:9050 or
# http://127.0.0.1:8080 - useful where ISPs DNS-block sites
PROXY = os.environ.get("PROXY")

app = FastAPI(title="Omni Video Downloader")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_YDL_OPTS = {
    "socket_timeout": 30,
    "retries": 10,
    "fragment_retries": 10,
    "extractor_retries": 3,
    # Sites that block by region; bypass with X-Forwarded-For where possible
    "geo_bypass": True,
    # Some sites have broken/self-signed certs; we only download from them
    "nocheckcertificate": True,
    # Speeds up HLS/DASH (m3u8) downloads significantly
    "concurrent_fragment_downloads": 4,
    # Avoid characters Windows can't handle in filenames
    "windowsfilenames": True,
    # Rank formats by resolution (height, then width as a fallback when
    # height is unknown), prefer widely-compatible H.264 over AV1/HEVC which
    # stutter in older players like VLC, then higher bitrate/fps.
    "format_sort": ["res", "width", "vcodec:h264", "br", "fps"],
}
if COOKIES_FROM_BROWSER:
    BASE_YDL_OPTS["cookiesfrombrowser"] = (COOKIES_FROM_BROWSER,)
if PROXY:
    BASE_YDL_OPTS["proxy"] = PROXY

def extraction_attempts(opts):
    """Yield progressively more aggressive option sets for stubborn sites."""
    yield opts
    try:
        from yt_dlp.networking.impersonate import ImpersonateTarget

        # Sites that block on TLS fingerprint (e.g. Cloudflare-fronted)
        yield {**opts, "impersonate": ImpersonateTarget("chrome")}
    except ImportError:
        pass
    # Dedicated extractor broken: scan raw page HTML for video sources
    yield {**opts, "force_generic_extractor": True}


VALID_MEDIA_EXTENSIONS = {
    "mp4", "mkv", "webm", "avi", "mov", "flv", "m4v", "ts",
    "mp3", "m4a", "wav", "flac", "ogg", "opus", "aac",
}
MIN_VALID_FILESIZE = 10 * 1024  # 10 KB


def _has_dedicated_extractor(url: str) -> bool:
    for ie in CUSTOM_EXTRACTORS:
        if ie.suitable(url):
            return True
    for ie in yt_dlp.extractor.gen_extractor_classes():
        if ie.ie_key() != "Generic" and ie.suitable(url):
            return True
    return False


_BEEG_URL = re.compile(r"(https?://(?:www\.)?beeg\.com(?:/video)?/-?)(\d+)")


def _fixup_site_url(url: str) -> str:
    """Per-site URL corrections for known extractor/API quirks."""
    # Beeg's API rejects zero-padded IDs ("invalid integer"); strip leading
    # zeros so the metadata lookup succeeds.
    m = _BEEG_URL.match(url)
    if m:
        return m.group(1) + m.group(2).lstrip("0") + url[m.end():]
    return url


def normalize_url(url: str) -> str:
    """Apply per-site fixups, then rewrite language subdomains (fr., de., ...)
    to www when that makes a dedicated extractor match; otherwise sites
    silently fall back to the generic extractor, which often grabs poster
    images instead of video."""
    url = _fixup_site_url(url)
    if _has_dedicated_extractor(url):
        return url
    parts = urlsplit(url)
    sub, dot, rest = parts.netloc.partition(".")
    if dot and "." in rest and len(sub) <= 3 and sub.lower() != "www":
        candidate = urlunsplit(parts._replace(netloc=f"www.{rest}"))
        if _has_dedicated_extractor(candidate):
            return candidate
    return url


_IFRAME_SRC = re.compile(r"""<iframe[^>]+\bsrc\s*=\s*["']([^"']+)["']""", re.I)
_EMBED_URL = re.compile(r"""["'](https?://[^"'\s<>]+/embed[^"'\s<>]*)["']""", re.I)


_EMBED_ID = re.compile(r"^(https?://)([^/]+)/embed/(\d+)")

# Players are commonly served from a decorated hostname that fronts the real
# site: videotxxx.com and txxx.me both front txxx.com, the host extractors
# know. Strip the decoration and normalise the TLD to find the watch host.
_PLAYER_HOST_PREFIXES = ("video", "player", "embed", "stream", "cdn")


def watch_host_aliases(host: str) -> list:
    """Hosts to try for a watch page, most likely first."""
    bare = host.lower().removeprefix("www.")
    labels = bare.split(".")
    head, rest = labels[0], labels[1:]
    aliases = []
    for prefix in _PLAYER_HOST_PREFIXES:
        if head == prefix and rest:
            # player.example.net -> example.net
            aliases.append(".".join(rest))
        elif head.startswith(prefix) and len(head) - len(prefix) >= 3:
            # videotxxx.com -> txxx.com (never an empty label)
            aliases.append(".".join([head[len(prefix):]] + rest))
    # Mirrors serve the same ids from an alternate TLD; extractors know .com
    aliases += [".".join(a.split(".")[:-1] + ["com"]) for a in list(aliases)]
    for candidate in (".".join(labels[:-1] + ["com"]), bare):
        aliases.append(candidate)
    seen, ordered = set(), []
    for a in aliases:
        parts = a.split(".")
        if a not in seen and all(parts) and len(parts) >= 2:
            seen.add(a)
            ordered.append(a)
    return ordered


def embed_page_variants(url: str) -> list:
    """An /embed/ URL usually has no extractor even when the site's normal
    watch page does, and players are often served from a mirror domain
    (txxx.me for txxx.com). Offer the canonical watch-page forms so a
    dedicated extractor can match instead of falling through to Generic."""
    m = _EMBED_ID.match(url)
    if not m:
        return []
    scheme, host, video_id = m.groups()
    hosts = watch_host_aliases(host)
    return [
        f"{scheme}{h}/{path}/{video_id}/"
        for h in hosts
        for path in ("videos", "video")
    ]


def _registrable_domain(netloc: str) -> str:
    return ".".join(netloc.lower().split(":")[0].split(".")[-2:])


def discover_embed_urls(url: str, limit: int = 12) -> list:
    """Aggregator sites (pornzog and friends) host no media themselves - they
    iframe a third-party tube. When every extraction attempt fails, scrape the
    page for cross-domain iframe/embed URLs so we can retry against the host
    that actually serves the video."""
    try:
        opts = {**BASE_YDL_OPTS, "quiet": True, "no_warnings": True}
        with make_ydl(opts) as ydl:
            html = ydl.urlopen(url).read().decode("utf-8", "replace")
    except Exception:
        return []

    origin = _registrable_domain(urlsplit(url).netloc)
    found, seen = [], set()
    for match in list(_IFRAME_SRC.finditer(html)) + list(_EMBED_URL.finditer(html)):
        candidate = match.group(1).strip().replace("&amp;", "&")
        if candidate.startswith("//"):
            candidate = "https:" + candidate
        if not candidate.startswith("http"):
            continue
        if _registrable_domain(urlsplit(candidate).netloc) == origin:
            continue
        if candidate in seen:
            continue
        for variant in [candidate] + embed_page_variants(candidate):
            if variant in seen:
                continue
            seen.add(variant)
            found.append(variant)
    # Order: hosts yt-dlp knows, then URLs carrying a video id (a bare
    # "/most-popular/" nav link can't be the video), then players
    found.sort(
        key=lambda u: (
            not _has_dedicated_extractor(u),
            not re.search(r"/\d{4,}", u),
            "/embed" not in u,
        )
    )
    return found[:limit]


def source_candidates(url: str) -> list:
    """(url, extra_opts) pairs to try in order: the page itself, then anything
    it embeds. Embeds carry a Referer for the page that embedded them - embed
    endpoints routinely 403 requests that arrive without one."""
    candidates = [(url, {})]
    for embed in discover_embed_urls(url):
        candidates.append((embed, {"http_headers": {"Referer": url}}))
    return candidates


_HEIGHT_HINT = re.compile(r"(\d{3,4})[pP](?:[\b_./-]|$)")


def infer_missing_heights(info: dict):
    """Some sites report no height per format, so yt-dlp sorts them below
    known-but-low resolutions and "best" yields a tiny stream. Recover a
    height from the format name (e.g. '720p_60fps') or, failing that, from
    the width assuming 16:9, so resolution sorting works."""
    for f in info.get("formats") or []:
        if f.get("height"):
            continue
        for hint in (f.get("format_id"), f.get("format_note"), f.get("url")):
            m = _HEIGHT_HINT.search(hint or "")
            if m and 100 <= int(m.group(1)) <= 4320:
                f["height"] = int(m.group(1))
                break
        else:
            width = f.get("width")
            if width:
                f["height"] = round(width * 9 / 16)


jobs: dict[str, dict] = {}
job_lock = threading.Lock()
cancel_requests: set[str] = set()

# Connected websocket clients
ws_clients: set[WebSocket] = set()
main_loop: Optional[asyncio.AbstractEventLoop] = None


class InfoRequest(BaseModel):
    url: str


class DownloadRequest(BaseModel):
    url: str
    format_id: Optional[str] = None
    audio_only: bool = False
    audio_format: str = "mp3"
    playlist: bool = False


def broadcast(message: dict):
    if main_loop is None:
        return
    for ws in list(ws_clients):
        asyncio.run_coroutine_threadsafe(_safe_send(ws, message), main_loop)


async def _safe_send(ws: WebSocket, message: dict):
    try:
        await ws.send_json(message)
    except Exception:
        ws_clients.discard(ws)


def update_job(job_id: str, **kwargs):
    with job_lock:
        if job_id not in jobs:
            return
        jobs[job_id].update(kwargs)
        snapshot = dict(jobs[job_id])
    broadcast({"type": "job_update", "job": snapshot})


@app.get("/api/version")
def get_version():
    checkout = _git_revision()
    return {
        "revision": LOADED_REVISION,
        "yt_dlp": yt_dlp.version.__version__,
        # Differs when the tree was updated but the server wasn't restarted
        "checkout_revision": checkout,
        "restart_required": checkout != LOADED_REVISION,
    }


@app.get("/api/info")
def get_info(url: str):
    url = normalize_url(url)
    ydl_opts = {
        **BASE_YDL_OPTS,
        "quiet": True,
        "no_warnings": True,
        "skip_download": True,
        "noplaylist": False,
    }
    info = None
    primary_error = None
    # The page itself first; if nothing works, whatever it embeds
    for source_url, source_opts in source_candidates(url):
        for attempt_opts in extraction_attempts({**ydl_opts, **source_opts}):
            try:
                with make_ydl(attempt_opts) as ydl:
                    info = ydl.extract_info(source_url, download=False)
                break
            except Exception as exc:
                primary_error = primary_error or exc
        if info is not None:
            break
    if info is None:
        raise HTTPException(status_code=400, detail=str(primary_error))

    is_playlist = info.get("_type") == "playlist" or "entries" in info

    if is_playlist:
        entries = list(info.get("entries") or [])
        return {
            "is_playlist": True,
            "title": info.get("title"),
            "entry_count": len(entries),
            "entries": [
                {
                    "title": e.get("title"),
                    "url": e.get("webpage_url") or e.get("url"),
                    "duration": e.get("duration"),
                    "thumbnail": e.get("thumbnail"),
                }
                for e in entries[:50]
            ],
        }

    infer_missing_heights(info)
    formats = []
    for f in info.get("formats", []):
        if not f.get("url"):
            continue
        formats.append(
            {
                "format_id": f.get("format_id"),
                "ext": f.get("ext"),
                "resolution": f.get("resolution")
                or (f"{f['height']}p" if f.get("height") else None)
                or f.get("format_note"),
                "fps": f.get("fps"),
                "vcodec": f.get("vcodec"),
                "acodec": f.get("acodec"),
                "filesize": f.get("filesize") or f.get("filesize_approx"),
                "format_note": f.get("format_note"),
            }
        )

    return {
        "is_playlist": False,
        "title": info.get("title"),
        "thumbnail": info.get("thumbnail"),
        "duration": info.get("duration"),
        "uploader": info.get("uploader"),
        "webpage_url": info.get("webpage_url"),
        "formats": formats,
    }


def run_download(job_id: str, req: DownloadRequest):
    req.url = normalize_url(req.url)

    def progress_hook(d):
        if job_id in cancel_requests:
            raise yt_dlp.utils.DownloadCancelled("Cancelled by user")
        status = d.get("status")
        if status == "downloading":
            total = d.get("total_bytes") or d.get("total_bytes_estimate")
            downloaded = d.get("downloaded_bytes", 0)
            percent = (downloaded / total * 100) if total else 0
            update_job(
                job_id,
                status="downloading",
                percent=round(percent, 1),
                speed=d.get("speed"),
                eta=d.get("eta"),
                filename=Path(d.get("filename", "")).name,
            )
        elif status == "finished":
            update_job(job_id, status="processing", percent=100)

    # Download into a per-job staging dir; only validated media is moved
    # into DOWNLOAD_DIR, so failed extractions can't leave junk behind
    staging_dir = DOWNLOAD_DIR / f".staging-{job_id}"
    staging_dir.mkdir(parents=True, exist_ok=True)
    outtmpl = str(staging_dir / "%(title)s.%(ext)s")

    ydl_opts = {
        **BASE_YDL_OPTS,
        "outtmpl": outtmpl,
        "progress_hooks": [progress_hook],
        "noplaylist": not req.playlist,
        "quiet": True,
        "no_warnings": True,
    }

    if req.audio_only:
        ydl_opts["format"] = "bestaudio/best"
        ydl_opts["postprocessors"] = [
            {
                "key": "FFmpegExtractAudio",
                "preferredcodec": req.audio_format,
            }
        ]
    elif req.format_id:
        # Requested format, with progressively looser fallbacks so an
        # unavailable format never kills the whole download
        ydl_opts["format"] = f"{req.format_id}+bestaudio/{req.format_id}/bestvideo*+bestaudio/best"
        ydl_opts["merge_output_format"] = "mp4/mkv"
    else:
        # Highest quality video+audio; "best" fallback covers sites that
        # only serve a single pre-muxed stream
        ydl_opts["format"] = "bestvideo*+bestaudio/best"
        ydl_opts["merge_output_format"] = "mp4/mkv"

    update_job(job_id, status="downloading", percent=0)

    def invalid_reason(path: Path):
        """Return why a staged file isn't real media, or None if it's fine."""
        ext = path.suffix.lower().lstrip(".")
        size = path.stat().st_size
        if ext not in VALID_MEDIA_EXTENSIONS:
            return f"unexpected file type .{ext or 'unknown'}"
        if size < MIN_VALID_FILESIZE:
            return f"file too small ({size} bytes)"
        # Reject text/XML masquerading under a media extension (e.g. an
        # SVG or HTML error page saved as .mp4)
        head = path.open("rb").read(512).lstrip()
        if head[:1] in (b"<", b"{") or b"<svg" in head or b"<html" in head.lower():
            return "file contains text/markup, not media data"
        return None

    def collect_staged_media():
        """Validate everything in staging; move good files to DOWNLOAD_DIR."""
        moved, reasons = [], []
        for path in sorted(staging_dir.iterdir()):
            if not path.is_file():
                continue
            reason = invalid_reason(path)
            if reason:
                reasons.append(f"{path.name}: {reason}")
                continue
            dest = DOWNLOAD_DIR / path.name
            counter = 1
            while dest.exists():
                dest = DOWNLOAD_DIR / f"{path.stem} ({counter}){path.suffix}"
                counter += 1
            path.replace(dest)
            moved.append(dest.name)
        return moved, reasons

    def do_download(opts, source_url):
        with make_ydl(opts) as ydl:
            # Extract first without format processing so missing heights can
            # be recovered before "best" is chosen, then download
            info = ydl.extract_info(source_url, download=False, process=False)
            if isinstance(info, dict):
                infer_missing_heights(info)
            ydl.process_ie_result(info, download=True)
        moved, reasons = collect_staged_media()
        if not moved:
            raise ValueError(
                "; ".join(reasons)
                or "Extraction produced no files - the video could not be found"
            )
        if len(moved) == 1:
            return moved[0]
        return f"{moved[0]} (+{len(moved) - 1} more)"

    try:
        filename = None
        primary_error = None
        # The page itself first; if nothing works, whatever it embeds
        for source_url, source_opts in source_candidates(req.url):
            for attempt_opts in extraction_attempts({**ydl_opts, **source_opts}):
                try:
                    filename = do_download(attempt_opts, source_url)
                    break
                except Exception as exc:
                    if job_id in cancel_requests:
                        raise yt_dlp.utils.DownloadCancelled("Cancelled by user")
                    msg = f"[job {job_id}] extraction attempt failed: {exc}"
                    print(msg.encode("ascii", "backslashreplace").decode(), flush=True)
                    primary_error = primary_error or exc
                    # Clear leftovers so the next attempt starts clean
                    for leftover in staging_dir.iterdir():
                        if leftover.is_file():
                            leftover.unlink()
            if filename is not None:
                break
        if filename is None:
            raise primary_error
        update_job(
            job_id,
            status="completed",
            percent=100,
            filename=filename,
        )
    except yt_dlp.utils.DownloadCancelled:
        update_job(job_id, status="cancelled", error=None)
    except Exception as exc:
        update_job(job_id, status="error", error=str(exc))
    finally:
        cancel_requests.discard(job_id)
        shutil.rmtree(staging_dir, ignore_errors=True)


@app.post("/api/download")
def start_download(req: DownloadRequest):
    job_id = str(uuid.uuid4())
    with job_lock:
        jobs[job_id] = {
            "id": job_id,
            "url": req.url,
            "status": "queued",
            "percent": 0,
            "filename": None,
        }
    snapshot = dict(jobs[job_id])
    broadcast({"type": "job_update", "job": snapshot})

    thread = threading.Thread(target=run_download, args=(job_id, req), daemon=True)
    thread.start()
    return {"job_id": job_id}


@app.post("/api/jobs/{job_id}/cancel")
def cancel_job(job_id: str):
    with job_lock:
        job = jobs.get(job_id)
        if job is None:
            raise HTTPException(status_code=404, detail="Job not found")
        if job["status"] in ("completed", "error", "cancelled"):
            return {"status": job["status"]}
    cancel_requests.add(job_id)
    update_job(job_id, status="cancelling")
    return {"status": "cancelling"}


@app.get("/api/jobs")
def list_jobs():
    with job_lock:
        return list(jobs.values())


@app.get("/api/files")
def list_files():
    files = []
    for f in sorted(DOWNLOAD_DIR.iterdir(), key=lambda p: p.stat().st_mtime, reverse=True):
        if f.is_file() and not f.name.startswith('.'):
            files.append({"name": f.name, "size": f.stat().st_size})
    return files


@app.get("/api/files/{filename}")
def get_file(filename: str):
    path = DOWNLOAD_DIR / filename
    if not path.is_file() or DOWNLOAD_DIR not in path.resolve().parents:
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(path, filename=filename)


@app.delete("/api/files/{filename}")
def delete_file(filename: str):
    path = DOWNLOAD_DIR / filename
    if not path.is_file() or DOWNLOAD_DIR not in path.resolve().parents:
        raise HTTPException(status_code=404, detail="File not found")
    path.unlink()
    return {"status": "deleted"}


@app.websocket("/ws/progress")
async def websocket_progress(websocket: WebSocket):
    global main_loop
    main_loop = asyncio.get_event_loop()
    await websocket.accept()
    ws_clients.add(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        ws_clients.discard(websocket)
