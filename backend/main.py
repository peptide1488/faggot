import asyncio
import threading
import uuid
from pathlib import Path
from typing import Optional

import yt_dlp
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel

BASE_DIR = Path(__file__).resolve().parent.parent
DOWNLOAD_DIR = BASE_DIR / "downloads"
DOWNLOAD_DIR.mkdir(exist_ok=True)

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
}

jobs: dict[str, dict] = {}
job_lock = threading.Lock()

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


@app.get("/api/info")
def get_info(url: str):
    ydl_opts = {
        **BASE_YDL_OPTS,
        "quiet": True,
        "no_warnings": True,
        "skip_download": True,
        "noplaylist": False,
    }
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))

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

    formats = []
    for f in info.get("formats", []):
        if not f.get("url"):
            continue
        formats.append(
            {
                "format_id": f.get("format_id"),
                "ext": f.get("ext"),
                "resolution": f.get("resolution") or f.get("format_note"),
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
    def progress_hook(d):
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

    outtmpl = str(DOWNLOAD_DIR / "%(title)s.%(ext)s")

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
        ydl_opts["format"] = f"{req.format_id}+bestaudio/best"
        ydl_opts["merge_output_format"] = "mp4"
    else:
        ydl_opts["format"] = "bestvideo+bestaudio/best"
        ydl_opts["merge_output_format"] = "mp4"

    update_job(job_id, status="downloading", percent=0)

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(req.url, download=True)
            filename = ydl.prepare_filename(info)
            if req.audio_only:
                filename = str(Path(filename).with_suffix(f".{req.audio_format}"))
        update_job(
            job_id,
            status="completed",
            percent=100,
            filename=Path(filename).name,
        )
    except Exception as exc:
        update_job(job_id, status="error", error=str(exc))


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
