#!/usr/bin/env python3
"""Process generated FFT-style art into transparent game sprites."""
from __future__ import annotations

from pathlib import Path

from PIL import Image

SESS = Path(
    r"C:\Users\andrew\.grok\sessions"
    r"\C%3A%5CUsers%5Candrew%5CDesktop%5Cfaggot%5Cnig"
    r"\019f473e-b510-78c0-becc-6cf98677154f\images"
)
OUT = Path(r"C:\Users\andrew\Desktop\faggot\dnd-character\sprites")


def remove_bg(im: Image.Image, thr: float = 42.0) -> Image.Image:
    im = im.convert("RGBA")
    px = im.load()
    w, h = im.size
    # sample corners for bg color
    samples = [px[2, 2], px[w - 3, 2], px[2, h - 3], px[w - 3, h - 3]]
    br = sum(s[0] for s in samples) / 4
    bg = sum(s[1] for s in samples) / 4
    bb = sum(s[2] for s in samples) / 4
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            dist = ((r - br) ** 2 + (g - bg) ** 2 + (b - bb) ** 2) ** 0.5
            if dist < thr:
                px[x, y] = (r, g, b, 0)
            elif dist < thr * 1.35:
                # soft edge
                fa = int(max(0, min(255, (dist - thr) / (thr * 0.35) * 255)))
                px[x, y] = (r, g, b, fa)
    return im


def crop_alpha(im: Image.Image, pad: int = 4) -> Image.Image:
    bbox = im.getbbox()
    if not bbox:
        return im
    l, t, r, b = bbox
    l = max(0, l - pad)
    t = max(0, t - pad)
    r = min(im.width, r + pad)
    b = min(im.height, b + pad)
    return im.crop((l, t, r, b))


def fit_frame(im: Image.Image, fw: int, fh: int) -> Image.Image:
    """Scale to fit in fw×fh, feet at bottom-center."""
    im = im.convert("RGBA")
    scale = min(fw / im.width, fh / im.height)
    nw = max(1, int(im.width * scale))
    nh = max(1, int(im.height * scale))
    resized = im.resize((nw, nh), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (fw, fh), (0, 0, 0, 0))
    x = (fw - nw) // 2
    y = fh - nh  # feet bottom
    canvas.paste(resized, (x, y), resized)
    return canvas


def make_sheet_4x4(frame: Image.Image) -> Image.Image:
    fw, fh = frame.size
    sheet = Image.new("RGBA", (fw * 4, fh * 4), (0, 0, 0, 0))
    for row in range(4):
        for col in range(4):
            sheet.paste(frame, (col * fw, row * fh), frame)
    return sheet


def process_unit(src: Path, dest: Path, fw: int = 96, fh: int = 112) -> None:
    im = Image.open(src)
    im = remove_bg(im, thr=48)
    im = crop_alpha(im, pad=6)
    frame = fit_frame(im, fw, fh)
    sheet = make_sheet_4x4(frame)
    dest.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(dest, "PNG")
    # also single-frame for reference
    frame.save(dest.with_name(dest.stem + "_idle.png"), "PNG")
    print("unit", dest, sheet.size)


def process_billboard(src: Path, dest: Path, max_h: int = 160) -> None:
    im = Image.open(src)
    im = remove_bg(im, thr=50)
    im = crop_alpha(im, pad=4)
    if im.height > max_h:
        scale = max_h / im.height
        im = im.resize(
            (max(1, int(im.width * scale)), max_h), Image.Resampling.LANCZOS
        )
    dest.parent.mkdir(parents=True, exist_ok=True)
    im.save(dest, "PNG")
    print("billboard", dest, im.size)


def process_tex(src: Path, dest: Path, size: int = 64) -> None:
    im = Image.open(src).convert("RGBA")
    im = im.resize((size, size), Image.Resampling.LANCZOS)
    dest.parent.mkdir(parents=True, exist_ok=True)
    im.save(dest, "PNG")
    print("tex", dest, im.size)


def main() -> None:
    # Identified from inspection
    process_unit(SESS / "6.jpg", OUT / "hq" / "characters" / "fighter.png")
    process_unit(SESS / "4.jpg", OUT / "hq" / "monsters" / "goblin.png")
    # alias common class keys to fighter for pack completeness
    fighter = OUT / "hq" / "characters" / "fighter.png"
    for alias in ("paladin", "barbarian", "human"):
        dest = OUT / "hq" / "characters" / f"{alias}.png"
        if fighter.exists():
            Image.open(fighter).save(dest)
            print("alias", dest.name)
    process_billboard(SESS / "3.jpg", OUT / "hq" / "decor" / "tree.png", max_h=180)
    process_billboard(SESS / "5.jpg", OUT / "hq" / "decor" / "bush.png", max_h=72)
    # also overwrite active decor for immediate visual upgrade
    process_billboard(SESS / "3.jpg", OUT / "decor" / "tree.png", max_h=180)
    process_billboard(SESS / "3.jpg", OUT / "decor" / "tree2.png", max_h=170)
    process_billboard(SESS / "5.jpg", OUT / "decor" / "bush.png", max_h=72)
    process_billboard(SESS / "5.jpg", OUT / "decor" / "bush2.png", max_h=64)
    process_tex(SESS / "2.jpg", OUT / "hq" / "terrain" / "grass.png", 64)
    process_tex(SESS / "1.jpg", OUT / "hq" / "terrain" / "stone.png", 64)
    process_tex(SESS / "2.jpg", OUT / "terrain" / "grass.png", 64)
    process_tex(SESS / "1.jpg", OUT / "terrain" / "stone.png", 64)
    process_tex(SESS / "1.jpg", OUT / "terrain" / "brick.png", 64)
    print("done")


if __name__ == "__main__":
    main()
