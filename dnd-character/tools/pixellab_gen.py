#!/usr/bin/env python3
"""
Regenerate ALL Grimoire HQ art via PixelLab.

- Max 3 concurrent jobs (API is slow / rate-limited)
- Unified style knobs (lineless, medium shading, low top-down)
- Sizes: units 96×128, decor 128×128, terrain 32×32
- Checkpoint resume in tools/_pixellab_state.json

Usage:
  python tools/pixellab_gen.py --balance
  python tools/pixellab_gen.py --pack all
  python tools/pixellab_gen.py --pack terrain
  python tools/pixellab_gen.py --pack decor
  python tools/pixellab_gen.py --pack characters
  python tools/pixellab_gen.py --pack monsters
  python tools/pixellab_gen.py --only tree,fighter,grass
  python tools/pixellab_gen.py --pack all --force   # ignore checkpoint
"""

from __future__ import annotations

import argparse
import json
import sys
import threading
import time
import traceback
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

from PIL import Image

from pixellab_catalog import CHARACTERS, DECOR, MONSTERS, TERRAIN
from pixellab_client import PixelLab
from pixellab_style import (
    DECOR_SHIP,
    UNIT_H,
    UNIT_W,
    character_v3_body,
    map_object_body,
    seed_for,
)

ROOT = Path(__file__).resolve().parents[1]
TOOLS = Path(__file__).resolve().parent
OUT_TERRAIN = ROOT / "sprites" / "hq" / "terrain"
OUT_DECOR = ROOT / "sprites" / "hq" / "decor"
OUT_CHARS = ROOT / "sprites" / "hq" / "characters"
OUT_MONS = ROOT / "sprites" / "hq" / "monsters"
STATE_PATH = TOOLS / "_pixellab_state.json"
LOG_PATH = TOOLS / "_pixellab_gen.log"

MAX_WORKERS = 3
print_lock = threading.Lock()
state_lock = threading.Lock()


def log(msg: str) -> None:
    line = f"[{time.strftime('%H:%M:%S')}] {msg}"
    with print_lock:
        print(line, flush=True)
        with LOG_PATH.open("a", encoding="utf-8") as f:
            f.write(line + "\n")


def load_state() -> dict:
    if STATE_PATH.is_file():
        return json.loads(STATE_PATH.read_text(encoding="utf-8"))
    return {"done": {}, "failed": {}}


def save_state(state: dict) -> None:
    with state_lock:
        STATE_PATH.write_text(json.dumps(state, indent=2), encoding="utf-8")


def mark_done(state: dict, key: str, path: str) -> None:
    with state_lock:
        state.setdefault("done", {})[key] = {"path": path, "ts": time.time()}
        state.get("failed", {}).pop(key, None)
        STATE_PATH.write_text(json.dumps(state, indent=2), encoding="utf-8")


def mark_failed(state: dict, key: str, err: str) -> None:
    with state_lock:
        state.setdefault("failed", {})[key] = {"error": err[:500], "ts": time.time()}
        STATE_PATH.write_text(json.dumps(state, indent=2), encoding="utf-8")


def fit_canvas(img: Image.Image, w: int, h: int) -> Image.Image:
    """Center subject on transparent canvas of exact size (preserves aspect)."""
    img = img.convert("RGBA")
    # trim near-empty alpha
    alpha = img.split()[-1]
    bbox = alpha.getbbox()
    if bbox:
        img = img.crop(bbox)
    iw, ih = img.size
    if iw == 0 or ih == 0:
        return Image.new("RGBA", (w, h), (0, 0, 0, 0))
    scale = min(w / iw, h / ih)
    nw, nh = max(1, int(iw * scale)), max(1, int(ih * scale))
    # nearest for pixel art
    resized = img.resize((nw, nh), Image.Resampling.NEAREST)
    canvas = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    # feet toward bottom for units/props
    x = (w - nw) // 2
    y = h - nh  # bottom-align
    if y < 0:
        y = 0
    canvas.paste(resized, (x, y), resized)
    return canvas


def compose_4x4_sheet(by_dir: dict[str, Image.Image], fw: int, fh: int) -> Image.Image:
    """
    Rows: down/left/right/up  (south/west/east/north)
    Cols: 4 walk frames — duplicate idle (walk anim later via animate-character)
    """
    order = [
        ("down", "south"),
        ("left", "west"),
        ("right", "east"),
        ("up", "north"),
    ]
    sheet = Image.new("RGBA", (fw * 4, fh * 4), (0, 0, 0, 0))
    # pick any available as fallback
    fallback = None
    for im in by_dir.values():
        fallback = im
        break
    for row, (_name, dkey) in enumerate(order):
        src = by_dir.get(dkey) or fallback
        if src is None:
            continue
        frame = fit_canvas(src, fw, fh)
        for col in range(4):
            sheet.paste(frame, (col * fw, row * fh), frame)
    return sheet


def _motif_score(img: Image.Image) -> float:
    """
    Rough check for 'center logo' terrain failures.
    High score = center much more structured than edges → bad for tiling.
    """
    im = img.convert("L").resize((32, 32), Image.Resampling.BILINEAR)
    px = list(im.getdata())
    # 8×8 center vs outer ring variance
    def var(cells):
        if not cells:
            return 0.0
        m = sum(cells) / len(cells)
        return sum((c - m) ** 2 for c in cells) / len(cells)

    center, edge = [], []
    for y in range(32):
        for x in range(32):
            v = px[y * 32 + x]
            if 10 <= x < 22 and 10 <= y < 22:
                center.append(v)
            elif x < 4 or x >= 28 or y < 4 or y >= 28:
                edge.append(v)
    cv, ev = var(center), var(edge)
    # center-heavy patterns score high
    return (cv + 1) / (ev + 1)


def _strip_frame(img: Image.Image, margin: float = 0.12) -> Image.Image:
    """Crop outer margin (kills square-frame / vignette motifs) then scale back."""
    w, h = img.size
    mx, my = int(w * margin), int(h * margin)
    if mx < 1 or my < 1:
        return img
    cropped = img.crop((mx, my, w - mx, h - my))
    return cropped.resize((w, h), Image.Resampling.NEAREST)


def _make_tileable(img: Image.Image, blend: int = 16) -> Image.Image:
    """
    Cheap seamless-ish wrap: blend left/right and top/bottom edges.
    Not perfect Wang, but kills hard seams from framed gens.
    """
    img = img.convert("RGBA")
    w, h = img.size
    blend = max(4, min(blend, w // 4, h // 4))
    base = img.copy()
    # horizontal wrap blend
    left = img.crop((0, 0, blend, h))
    right = img.crop((w - blend, 0, w, h))
    for x in range(blend):
        a = (x + 1) / (blend + 1)
        # fade right-edge pixels into left side
        col_r = right.crop((x, 0, x + 1, h))
        col_l = left.crop((x, 0, x + 1, h))
        mixed = Image.blend(col_l, col_r, a)
        base.paste(mixed, (x, 0))
        mixed2 = Image.blend(col_r, col_l, a)
        base.paste(mixed2, (w - blend + x, 0))
    # vertical wrap blend
    top = base.crop((0, 0, w, blend))
    bot = base.crop((0, h - blend, w, h))
    for y in range(blend):
        a = (y + 1) / (blend + 1)
        row_t = top.crop((0, y, w, y + 1))
        row_b = bot.crop((0, y, w, y + 1))
        mixed = Image.blend(row_t, row_b, a)
        base.paste(mixed, (0, y))
        mixed2 = Image.blend(row_b, row_t, a)
        base.paste(mixed2, (0, h - blend + y))
    return base


def job_terrain(client: PixelLab, name: str, spec: dict) -> Path:
    w, h = int(spec.get("w", 128)), int(spec.get("h", 128))
    # hard floor — never gen terrain below 64 (32px became logo tiles)
    w, h = max(64, w), max(64, h)
    best = None
    best_score = 999.0
    # up to 3 tries if motif detector flags a logo / frame
    for attempt in range(3):
        body = {
            "description": spec["description"],
            "image_size": {"width": w, "height": h},
            "seed": seed_for(f"terrain:{name}:v3:{attempt}"),
            "no_background": False,
            "view": "high top-down",
            "detail": "highly detailed",
            "text_guidance_scale": 8.0,
        }
        img = client.create_image_pixflux(body)
        if img.size != (w, h):
            img = img.resize((w, h), Image.Resampling.NEAREST)
        # Only strip outer frame — full edge-blend was inventing quarter-circles.
        img = _strip_frame(img, 0.10)
        score = _motif_score(img)
        log(f"    terrain motif_score={score:.2f} attempt={attempt}")
        if score < best_score:
            best_score = score
            best = img
        if score < 1.5:
            break
    assert best is not None
    # Soft seamless pass only if still somewhat even
    if best_score < 3.0:
        best = _make_tileable(best, blend=12)
    else:
        # Motif-heavy: fall back to procedural seamless field tinted from gen palette
        log(f"    terrain fallback procedural (score={best_score:.2f})")
        best = _procedural_field(best, w, h, name)
    out = OUT_TERRAIN / f"{name}.png"
    out.parent.mkdir(parents=True, exist_ok=True)
    best.save(out, "PNG")
    return out


def _procedural_field(sample: Image.Image, w: int, h: int, name: str) -> Image.Image:
    """
    Guaranteed-seamless field using sample's average color + wrap-friendly noise.
    Used when PixelLab returns a logo/frame instead of a texture.
    """
    import math
    import random

    sample = sample.convert("RGB").resize((16, 16), Image.Resampling.BOX)
    pixels = list(sample.getdata())
    n = len(pixels)
    ar = sum(p[0] for p in pixels) // n
    ag = sum(p[1] for p in pixels) // n
    ab = sum(p[2] for p in pixels) // n
    # per-terrain variance / hue lean
    lean = {
        "grass": (0, 18, 0),
        "dirt": (12, -4, -8),
        "sand": (20, 12, -6),
        "snow": (8, 8, 12),
        "mud": (-6, -10, -12),
        "stone": (0, 0, 0),
        "water": (-20, -10, 30),
        "wood": (16, 4, -10),
        "brick_top": (20, -8, -8),
        "cave_top": (-10, -10, -8),
        "grass_side": (4, 10, -4),
        "wood_side": (14, 4, -10),
        "brick": (18, -10, -10),
        "cave_wall": (-12, -12, -10),
    }.get(name, (0, 0, 0))
    ar = max(0, min(255, ar + lean[0]))
    ag = max(0, min(255, ag + lean[1]))
    ab = max(0, min(255, ab + lean[2]))
    rng = random.Random(seed_for(f"proc:{name}"))
    # two wrap-friendly sin layers
    out = Image.new("RGB", (w, h))
    px = out.load()
    for y in range(h):
        for x in range(w):
            # seamless: period divides size
            n1 = math.sin(2 * math.pi * x / w * 4 + rng.random()) * math.cos(
                2 * math.pi * y / h * 4
            )
            n2 = math.sin(2 * math.pi * (x + y) / w * 3) * 0.5
            # discrete pixel grit
            grit = (rng.randrange(-14, 15) / 255.0)
            t = 0.55 + 0.25 * n1 + 0.12 * n2 + grit
            r = max(0, min(255, int(ar * t)))
            g = max(0, min(255, int(ag * t)))
            b = max(0, min(255, int(ab * t)))
            px[x, y] = (r, g, b)
    return out.convert("RGBA")


def job_decor(client: PixelLab, name: str, spec: dict) -> Path:
    """Map-objects for props (not character creator)."""
    w = int(spec.get("w", DECOR_SHIP))
    h = int(spec.get("h", DECOR_SHIP))
    body = map_object_body(
        spec["description"],
        max(w, 128),
        max(h, 128),
        seed=seed_for(f"decor:{name}:v3"),
    )
    img = client.create_map_object(body)
    img = fit_canvas(img, DECOR_SHIP, DECOR_SHIP)
    out = OUT_DECOR / f"{name}.png"
    out.parent.mkdir(parents=True, exist_ok=True)
    img.save(out, "PNG")
    if name in ("tree", "tree2", "bush"):
        img.save(OUT_DECOR / f"{name}_px.png", "PNG")
    return out


def job_unit(client: PixelLab, name: str, spec: dict, out_dir: Path) -> Path:
    """
    Character Creator UI settings (locked):
      Humanoid/quad template, v3, High Top-Down, 96×128,
      Highly detailed, Black outline, enhance_prompt.
    """
    w, h = int(spec.get("w", UNIT_W)), int(spec.get("h", UNIT_H))
    # Force creator canvas sizes
    w, h = UNIT_W, UNIT_H
    body = character_v3_body(
        spec["description"],
        w,
        h,
        seed=seed_for(f"unit:{name}:v3ui"),
        template_id=spec.get("template_id", "mannequin"),
        name=name,
    )
    result = client.create_character_v3(body)
    by_dir = result.get("by_dir") or {}
    if result.get("sheet") and not by_dir:
        sheet = result["sheet"].convert("RGBA")
    elif by_dir:
        # v3 returns 8 dirs; we sheet S/W/E/N for the game's 4-row walk layout
        sheet = compose_4x4_sheet(by_dir, w, h)
    elif result.get("images"):
        im = result["images"][0]
        by_dir = {d: im for d in ("south", "west", "east", "north")}
        sheet = compose_4x4_sheet(by_dir, w, h)
    else:
        raise RuntimeError(
            f"no directions for {name}: keys={list(result.get('job', {}).get('last_response') or {})}"
        )
    out = out_dir / f"{name}.png"
    out.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(out, "PNG")
    if by_dir.get("south"):
        fit_canvas(by_dir["south"], w, h).save(out_dir / f"{name}_idle.png", "PNG")
    return out


def build_jobs(packs: list[str], only: set[str] | None) -> list[tuple[str, str, dict, callable]]:
    """Return list of (key, pack_name, spec, fn)."""
    jobs = []

    def add(pack: str, catalog: dict, fn, out_hint: str):
        for name, spec in catalog.items():
            key = f"{pack}:{name}"
            if only and name not in only and key not in only:
                continue
            jobs.append((key, pack, spec, fn))

    if "terrain" in packs or "all" in packs:
        add("terrain", TERRAIN, job_terrain, "terrain")
    if "decor" in packs or "all" in packs:
        add("decor", DECOR, job_decor, "decor")
    if "characters" in packs or "all" in packs:
        add(
            "characters",
            CHARACTERS,
            lambda c, n, s: job_unit(c, n, s, OUT_CHARS),
            "characters",
        )
    if "monsters" in packs or "all" in packs:
        add(
            "monsters",
            MONSTERS,
            lambda c, n, s: job_unit(c, n, s, OUT_MONS),
            "monsters",
        )
    return jobs


def run_one(client: PixelLab, state: dict, key: str, pack: str, spec: dict, fn) -> str:
    name = key.split(":", 1)[1]
    log(f"START {key} — {spec.get('description', '')[:60]}")
    t0 = time.time()
    try:
        path = fn(client, name, spec)
        mark_done(state, key, str(path))
        log(f"OK    {key} -> {path.relative_to(ROOT)} ({time.time()-t0:.1f}s)")
        return "ok"
    except Exception as e:
        err = f"{e}"
        mark_failed(state, key, err)
        log(f"FAIL  {key}: {err}")
        with print_lock:
            traceback.print_exc()
        return "fail"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--balance", action="store_true")
    ap.add_argument(
        "--pack",
        default="all",
        help="all|terrain|decor|characters|monsters or comma list",
    )
    ap.add_argument("--only", default="", help="comma names to filter")
    ap.add_argument("--force", action="store_true", help="regen even if checkpoint done")
    ap.add_argument("--workers", type=int, default=MAX_WORKERS)
    ap.add_argument("--list", action="store_true")
    ap.add_argument("--retry-failed", action="store_true")
    args = ap.parse_args()

    packs = [p.strip() for p in args.pack.split(",") if p.strip()]
    only = {x.strip() for x in args.only.split(",") if x.strip()} or None

    if args.list:
        print(f"terrain ({len(TERRAIN)}):", ", ".join(TERRAIN))
        print(f"decor ({len(DECOR)}):", ", ".join(DECOR))
        print(f"characters ({len(CHARACTERS)}):", ", ".join(CHARACTERS))
        print(f"monsters ({len(MONSTERS)}):", ", ".join(MONSTERS))
        return

    client = PixelLab()
    if args.balance:
        bal = client.balance()
        print(json.dumps(bal, indent=2))
        return

    jobs = build_jobs(packs, only)
    state = load_state()
    if args.retry_failed:
        failed_keys = set(state.get("failed", {}))
        jobs = [j for j in jobs if j[0] in failed_keys]
    elif not args.force:
        jobs = [j for j in jobs if j[0] not in state.get("done", {})]

    workers = max(1, min(3, args.workers))  # hard cap 3
    log(f"queue={len(jobs)} workers={workers} packs={packs}")
    if not jobs:
        log("nothing to do (all checkpointed; use --force to redo)")
        return

    ok = fail = 0
    # One client per worker thread is safer for Session
    def worker(item):
        key, pack, spec, fn = item
        c = PixelLab()
        return run_one(c, state, key, pack, spec, fn)

    with ThreadPoolExecutor(max_workers=workers) as ex:
        futs = {ex.submit(worker, j): j[0] for j in jobs}
        for fut in as_completed(futs):
            try:
                r = fut.result()
            except Exception as e:
                log(f"worker crash {futs[fut]}: {e}")
                r = "fail"
            if r == "ok":
                ok += 1
            else:
                fail += 1

    log(f"DONE ok={ok} fail={fail} total={ok+fail}")
    if fail:
        log(f"failed keys: {list(load_state().get('failed', {}))}")
        sys.exit(1)


if __name__ == "__main__":
    main()
