#!/usr/bin/env python3
"""Repair UTF-8 mojibake (cp1252 misread) mixed with already-good UTF-8."""
from __future__ import annotations

import re
import sys
from collections import Counter
from pathlib import Path

# Windows CP1252 0x80-0x9F (undefined slots kept as C1 controls)
CP1252_U = {
    0x80: 0x20AC, 0x81: 0x0081, 0x82: 0x201A, 0x83: 0x0192, 0x84: 0x201E,
    0x85: 0x2026, 0x86: 0x2020, 0x87: 0x2021, 0x88: 0x02C6, 0x89: 0x2030,
    0x8A: 0x0160, 0x8B: 0x2039, 0x8C: 0x0152, 0x8D: 0x008D, 0x8E: 0x017D,
    0x8F: 0x008F, 0x90: 0x0090, 0x91: 0x2018, 0x92: 0x2019, 0x93: 0x201C,
    0x94: 0x201D, 0x95: 0x2022, 0x96: 0x2013, 0x97: 0x2014, 0x98: 0x02DC,
    0x99: 0x2122, 0x9A: 0x0161, 0x9B: 0x203A, 0x9C: 0x0153, 0x9D: 0x009D,
    0x9E: 0x017E, 0x9F: 0x0178,
}
REV = {u: b for b, u in CP1252_U.items()}
for i in range(256):
    if i not in CP1252_U:
        REV[i] = i


def char_to_byte(ch: str) -> int | None:
    return REV.get(ord(ch))


def try_decode_span(s: str) -> str | None:
    by = bytearray()
    for ch in s:
        b = char_to_byte(ch)
        if b is None:
            return None
        by.append(b)
    try:
        dec = bytes(by).decode("utf-8")
    except UnicodeDecodeError:
        return None
    if dec == s or "\ufffd" in dec:
        return None
    return dec


def fix_mojibake(text: str) -> tuple[str, int]:
    out: list[str] = []
    i = 0
    n = len(text)
    fixes = 0
    while i < n:
        ch = text[i]
        if ord(ch) >= 0x80:
            best = None
            for L in range(2, min(17, n - i + 1)):
                span = text[i : i + L]
                if any(char_to_byte(c) is None for c in span):
                    break
                dec = try_decode_span(span)
                if dec is None:
                    continue
                if len(dec) < L or (len(dec) <= L and any(ord(c) > 127 for c in dec)):
                    score = (L, -len(dec))
                    if best is None or score > best[0]:
                        best = (score, L, dec)
            if best:
                out.append(best[2])
                i += best[1]
                fixes += 1
                continue
        out.append(ch)
        i += 1
    return "".join(out), fixes


def main() -> int:
    path = Path(sys.argv[1] if len(sys.argv) > 1 else "index.html")
    raw = path.read_bytes()
    if raw.startswith(b"\xef\xbb\xbf"):
        raw = raw[3:]
    text = raw.decode("utf-8")

    fixed, fixes = fix_mojibake(text)

    title_m = re.search(r"<title>([^<]+)</title>", fixed)
    ver_m = re.search(r"""const APP_VERSION\s*=\s*['"]([^'"]+)['"]""", fixed)

    print(f"file: {path}")
    print(f"fixes: {fixes}")
    print(f"len: {len(text)} -> {len(fixed)}")
    print(f"title: {title_m.group(1) if title_m else 'MISSING'}")
    print(f"APP_VERSION: {ver_m.group(1) if ver_m else 'MISSING'}")

    bad = ["Â·", "â€", "ðŸ", "Ã—", "â†", "âœ"]
    remaining = {b: fixed.count(b) for b in bad if fixed.count(b)}
    if remaining:
        print("WARNING remaining markers:", remaining)
        return 1

    runs = re.findall(r"[^\x00-\x7f]{1,8}", fixed)
    print("top non-ascii:")
    for s, c in Counter(runs).most_common(15):
        print(f"  {c:4d}  {s!r}")

    # UTF-8, no BOM
    path.write_bytes(fixed.encode("utf-8"))
    print(f"wrote {path.stat().st_size} bytes (UTF-8 no BOM)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
