# Omni Video Downloader

A self-hosted video/audio downloader powered by [yt-dlp](https://github.com/yt-dlp/yt-dlp),
similar to Open Video Downloader. Supports thousands of sites, playlists,
format selection, and audio extraction, with live progress over WebSockets.

## Stack

- **Backend**: FastAPI + yt-dlp (Python)
- **Frontend**: React + Vite

## Requirements

- Python 3.10+
- Node 18+
- `ffmpeg` (required for merging video/audio formats and audio extraction)

## Running locally

### Backend

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Open the URL printed by Vite (default `http://localhost:5173`).

## Features

- Paste any video/playlist URL to fetch title, thumbnail, duration, and available formats
- Choose video quality/format or extract audio only (MP3/M4A/WAV/FLAC)
- Download entire playlists or pick individual entries
- Live download progress via WebSocket
- Manage and download completed files from the UI

## Adding support for a site yt-dlp can't handle

Some sites (e.g. KVS / `kt_player`-based tube sites) aren't recognized by
yt-dlp's built-in extractors and fail with `ERROR: Unsupported URL`. You can
teach the downloader about them by dropping a yt-dlp **plugin extractor** into:

```
backend/yt_dlp_plugins/extractor/<yoursite>.py
```

The backend puts that folder on the import path and loads it automatically on
startup, so a dedicated extractor there is tried before the generic one. See
`backend/yt_dlp_plugins/extractor/cumgloryhole.py` for a worked KVS example.
