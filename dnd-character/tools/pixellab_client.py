"""
Minimal PixelLab REST client.

- Bearer auth from PIXELLAB_API_KEY
- Sync endpoints (pixflux) return images immediately
- Async endpoints return background_job_id; poll until completed
- Global concurrency is owned by the runner (max 3)
"""

from __future__ import annotations

import base64
import io
import json
import os
import time
from pathlib import Path
from typing import Any

import requests
from PIL import Image

BASE = "https://api.pixellab.ai/v2"
TOOLS = Path(__file__).resolve().parent


def _load_dotenv() -> None:
    for p in (TOOLS / ".env", TOOLS.parent / ".env", TOOLS.parent.parent / ".env"):
        if not p.is_file():
            continue
        for line in p.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, _, v = line.partition("=")
            k, v = k.strip(), v.strip().strip('"').strip("'")
            if k and k not in os.environ:
                os.environ[k] = v


def get_token() -> str:
    _load_dotenv()
    tok = (
        os.environ.get("PIXELLAB_API_KEY")
        or os.environ.get("PIXELLAB_SECRET")
        or os.environ.get("PIXEL_LAB_API_KEY")
    )
    if not tok:
        raise RuntimeError("PIXELLAB_API_KEY not set (tools/.env)")
    return tok


class PixelLab:
    def __init__(self, token: str | None = None, timeout: float = 180.0):
        self.token = token or get_token()
        self.timeout = timeout
        self.session = requests.Session()
        self.session.headers.update(
            {
                "Authorization": f"Bearer {self.token}",
                "Content-Type": "application/json",
                "Accept": "application/json",
            }
        )

    def _url(self, path: str) -> str:
        return f"{BASE}{path if path.startswith('/') else '/' + path}"

    def get(self, path: str, **kw) -> Any:
        r = self.session.get(self._url(path), timeout=self.timeout, **kw)
        self._raise(r)
        return r.json()

    def post(self, path: str, body: dict, **kw) -> Any:
        r = self.session.post(self._url(path), data=json.dumps(body), timeout=self.timeout, **kw)
        self._raise(r)
        if r.status_code == 204 or not r.content:
            return {}
        return r.json()

    @staticmethod
    def _raise(r: requests.Response) -> None:
        if r.ok:
            return
        try:
            detail = r.json()
        except Exception:
            detail = r.text[:500]
        raise RuntimeError(f"HTTP {r.status_code} {r.request.method} {r.url}: {detail}")

    def balance(self) -> dict:
        return self.get("/balance")

    def poll_job(
        self,
        job_id: str,
        *,
        interval: float = 4.0,
        max_wait: float = 600.0,
    ) -> dict:
        t0 = time.time()
        while True:
            data = self.get(f"/background-jobs/{job_id}")
            status = (data.get("status") or "").lower()
            if status in ("completed", "complete", "success", "succeeded"):
                return data
            if status in ("failed", "error", "cancelled", "canceled"):
                raise RuntimeError(f"job {job_id} failed: {data.get('last_response') or data}")
            if time.time() - t0 > max_wait:
                raise TimeoutError(f"job {job_id} still {status} after {max_wait}s")
            time.sleep(interval)

    # ----- image helpers -----

    @staticmethod
    def image_from_payload(payload: Any) -> Image.Image:
        """Extract a PIL image from common PixelLab response shapes."""
        if payload is None:
            raise ValueError("empty image payload")
        if isinstance(payload, Image.Image):
            return payload.convert("RGBA")
        if isinstance(payload, dict):
            # {type, base64} or {base64} or nested image
            if "base64" in payload:
                return PixelLab._b64_to_image(payload["base64"])
            if "image" in payload:
                return PixelLab.image_from_payload(payload["image"])
            if "url" in payload:
                return PixelLab._url_to_image(payload["url"])
            if "image_url" in payload:
                return PixelLab._url_to_image(payload["image_url"])
        if isinstance(payload, str):
            if payload.startswith("http"):
                return PixelLab._url_to_image(payload)
            return PixelLab._b64_to_image(payload)
        if isinstance(payload, list) and payload:
            return PixelLab.image_from_payload(payload[0])
        raise ValueError(f"unrecognized image payload keys={list(payload) if isinstance(payload, dict) else type(payload)}")

    @staticmethod
    def _b64_to_image(b64: str) -> Image.Image:
        if "," in b64 and b64.strip().startswith("data:"):
            b64 = b64.split(",", 1)[1]
        raw = base64.b64decode(b64)
        return Image.open(io.BytesIO(raw)).convert("RGBA")

    @staticmethod
    def _url_to_image(url: str) -> Image.Image:
        r = requests.get(url, timeout=120)
        r.raise_for_status()
        return Image.open(io.BytesIO(r.content)).convert("RGBA")

    def extract_images(self, data: dict) -> list[Image.Image]:
        """Pull all images from a job last_response or sync response."""
        by = self.extract_directions(data)
        if by:
            order = ["south", "west", "east", "north"]
            return [by[d] for d in order if d in by] or list(by.values())
        out: list[Image.Image] = []
        if not data:
            return out
        lr = data.get("last_response") if isinstance(data, dict) and "last_response" in data else data
        if lr is None:
            lr = data

        def try_add(obj: Any) -> None:
            try:
                out.append(self.image_from_payload(obj))
            except Exception:
                pass

        if isinstance(lr, dict):
            if "image" in lr:
                try_add(lr["image"])
            imgs = lr.get("images")
            if isinstance(imgs, list):
                for im in imgs:
                    try_add(im)
            elif isinstance(imgs, dict):
                for im in imgs.values():
                    try_add(im)
            for uk in ("image_url", "url", "spritesheet_url"):
                if uk in lr and lr[uk]:
                    try_add(lr[uk])
        return out

    def extract_directions(self, data: dict) -> dict[str, Image.Image]:
        """
        Prefer labeled south/west/east/north frames from character responses.
        PixelLab returns storage_urls / rotation_urls / images as direction maps.
        """
        by: dict[str, Image.Image] = {}
        if not data:
            return by
        lr = data.get("last_response") if isinstance(data, dict) and "last_response" in data else data
        if not isinstance(lr, dict):
            return by

        blocks: list[Any] = []
        for key in (
            "storage_urls",
            "rotation_urls",
            "rotations",
            "directions",
            "images",
            "quantized_images",
        ):
            if key in lr and lr[key]:
                blocks.append(lr[key])
        # also accept nested character payload
        for key in ("character",):
            if isinstance(lr.get(key), dict):
                ch = lr[key]
                for k in ("rotation_urls", "storage_urls", "rotations"):
                    if ch.get(k):
                        blocks.append(ch[k])

        for block in blocks:
            if not isinstance(block, dict):
                continue
            for d in ("south", "west", "east", "north"):
                if d in by:
                    continue
                val = block.get(d)
                if not val:
                    continue
                try:
                    by[d] = self.image_from_payload(val)
                except Exception:
                    if isinstance(val, dict):
                        for kk in ("image", "url", "image_url", "base64"):
                            if val.get(kk):
                                try:
                                    by[d] = self.image_from_payload(val[kk] if kk != "image" else val)
                                    break
                                except Exception:
                                    pass
            if len(by) >= 4:
                break
        return by

    # ----- generation endpoints -----

    def create_image_pixflux(self, body: dict) -> Image.Image:
        data = self.post("/create-image-pixflux", body)
        imgs = self.extract_images(data)
        if not imgs and "image" in data:
            imgs = [self.image_from_payload(data["image"])]
        if not imgs:
            raise RuntimeError(f"pixflux returned no image: keys={list(data)}")
        return imgs[0]

    def create_image_pixen(self, body: dict) -> Image.Image:
        """Pixen + optional enhance_prompt — better text understanding than raw short prompts."""
        data = self.post("/create-image-pixen", body)
        imgs = self.extract_images(data)
        if not imgs and "image" in data:
            imgs = [self.image_from_payload(data["image"])]
        if not imgs:
            raise RuntimeError(f"pixen returned no image: keys={list(data)}")
        return imgs[0]

    def generate_image_v2(self, body: dict) -> list[Image.Image]:
        """
        Pro generate-image-v2. Async job.
        At ~128px returns up to 4 candidates — pick the best.
        """
        data = self.post("/generate-image-v2", body)
        job_id = data.get("background_job_id")
        if not job_id:
            imgs = self.extract_images(data)
            if imgs:
                return imgs
            raise RuntimeError(f"generate-image-v2 no job: {data}")
        done = self.poll_job(job_id, max_wait=600.0)
        imgs = self.extract_images(done)
        if not imgs:
            lr = done.get("last_response") or {}
            # Pro responses often use images: [{base64...}, ...]
            raw = lr.get("images") or lr.get("image")
            if isinstance(raw, list):
                for item in raw:
                    try:
                        imgs.append(self.image_from_payload(item))
                    except Exception:
                        pass
            elif raw:
                imgs.append(self.image_from_payload(raw))
        if not imgs:
            raise RuntimeError(f"generate-image-v2 empty: {json.dumps(done)[:600]}")
        return imgs

    def create_tiles_pro(self, body: dict) -> list[Image.Image]:
        """Pro square/iso tiles. Async. Returns list of tile images."""
        data = self.post("/create-tiles-pro", body)
        job_id = data.get("background_job_id")
        tile_id = data.get("tile_id") or data.get("id")

        def from_job(done: dict) -> list[Image.Image]:
            out: list[Image.Image] = []
            lr = done.get("last_response") or done
            if not isinstance(lr, dict):
                return out
            for key in ("images", "quantized_images", "tiles", "tile_images", "results"):
                block = lr.get(key)
                if isinstance(block, list):
                    for item in block:
                        try:
                            out.append(self.image_from_payload(item))
                        except Exception:
                            pass
                    if out:
                        return out
                if isinstance(block, dict):
                    for v in block.values():
                        if not v:
                            continue
                        try:
                            out.append(self.image_from_payload(v))
                        except Exception:
                            pass
                    if out:
                        return out
            return self.extract_images(done)

        if job_id:
            done = self.poll_job(job_id, max_wait=600.0)
            imgs = from_job(done)
            if imgs:
                return imgs
        if tile_id:
            # poll GET until storage_urls populated (job may finish before files land)
            for _ in range(30):
                info = self.get(f"/tiles-pro/{tile_id}")
                urls = info.get("storage_urls") or {}
                if isinstance(urls, dict) and urls:
                    ordered = []
                    # tile_0 .. tile_N
                    keys = sorted(
                        urls.keys(),
                        key=lambda k: int(k.split("_")[-1]) if "_" in k and k.split("_")[-1].isdigit() else k,
                    )
                    for k in keys:
                        try:
                            ordered.append(self.image_from_payload(urls[k]))
                        except Exception:
                            pass
                    if ordered:
                        return ordered
                imgs = from_job(info)
                if imgs:
                    return imgs
                time.sleep(2)
        raise RuntimeError(f"tiles-pro no images: {data}")

    def create_character_v3(self, body: dict) -> dict:
        """8-dir character v3. Returns by_dir + character_id (same shape as 4dir helper)."""
        data = self.post("/create-character-v3", body)
        job_id = data.get("background_job_id")
        character_id = data.get("character_id")
        if not job_id:
            raise RuntimeError(f"character-v3 no job: {data}")
        done = self.poll_job(job_id, max_wait=900.0)
        by = self.extract_directions(done)
        if character_id and len(by) < 4:
            try:
                ch = self.get(f"/characters/{character_id}")
                if ch.get("rotation_urls"):
                    by = {
                        **self.extract_directions(
                            {"last_response": {"rotation_urls": ch["rotation_urls"]}}
                        ),
                        **by,
                    }
            except Exception:
                pass
        # v3 often returns 8 dirs — keep cardinal for our 4-row sheets
        if not by:
            imgs = self.extract_images(done)
            labels = ["south", "west", "east", "north"]
            by = {labels[i]: imgs[i] for i in range(min(4, len(imgs)))}
        return {"character_id": character_id, "job": done, "by_dir": by, "images": list(by.values())}

    def create_map_object(self, body: dict) -> Image.Image:
        data = self.post("/map-objects", body)
        job_id = data.get("background_job_id")
        object_id = data.get("object_id")
        if not job_id:
            # maybe sync fallback
            imgs = self.extract_images(data)
            if imgs:
                return imgs[0]
            raise RuntimeError(f"map-objects no job id: {data}")
        done = self.poll_job(job_id)
        imgs = self.extract_images(done)
        if imgs:
            return imgs[0]
        # fallback: GET object
        if object_id:
            try:
                obj = self.get(f"/objects/{object_id}")
                imgs = self.extract_images(obj)
                if imgs:
                    return imgs[0]
                # common fields
                for k in ("image_url", "preview_url", "image"):
                    if k in obj and obj[k]:
                        return self.image_from_payload(obj[k])
                frames = obj.get("frames") or obj.get("images") or []
                if frames:
                    return self.image_from_payload(frames[0])
            except Exception as e:
                raise RuntimeError(f"map-object job done but no image (object={object_id}): {e}; last={done.get('last_response')}") from e
        raise RuntimeError(f"map-object job done but no image: {json.dumps(done)[:800]}")

    def create_character_4dir(self, body: dict) -> dict:
        """Returns by_dir {south, west, east, north} PIL images + character_id."""
        data = self.post("/create-character-with-4-directions", body)
        job_id = data.get("background_job_id")
        character_id = data.get("character_id")
        if not job_id:
            raise RuntimeError(f"character no job: {data}")
        done = self.poll_job(job_id, max_wait=900.0)
        result: dict[str, Any] = {
            "character_id": character_id,
            "job": done,
            "images": [],
            "by_dir": {},
        }
        # 1) last_response.storage_urls / images dict
        by = self.extract_directions(done)
        # 2) GET character rotation_urls
        if character_id and len(by) < 4:
            try:
                ch = self.get(f"/characters/{character_id}")
                result["character"] = ch
                by2 = self.extract_directions({"last_response": ch})
                # also rotation_urls at top level
                if ch.get("rotation_urls"):
                    by2 = {**self.extract_directions({"last_response": {"rotation_urls": ch["rotation_urls"]}}), **by2}
                by = {**by2, **by}
            except Exception:
                pass
        result["by_dir"] = by
        result["images"] = list(by.values())
        if not by:
            # last resort: any images list
            imgs = self.extract_images(done)
            result["images"] = imgs
            if len(imgs) >= 4:
                result["by_dir"] = {
                    "south": imgs[0],
                    "west": imgs[1],
                    "east": imgs[2],
                    "north": imgs[3],
                }
            elif len(imgs) == 1:
                result["sheet"] = imgs[0]
        return result
