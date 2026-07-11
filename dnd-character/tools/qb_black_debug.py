#!/usr/bin/env python3
"""Diagnose Quick Battle black screen at localhost:8080."""
from __future__ import annotations

import json
from pathlib import Path

from playwright.sync_api import sync_playwright

URL = "http://localhost:8080/"
OUT = Path(__file__).resolve().parent / "qb-debug"
OUT.mkdir(parents=True, exist_ok=True)


def main() -> None:
    logs: list[dict] = []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1280, "height": 900})
        page = context.new_page()
        page.on("console", lambda m: logs.append({"type": m.type, "text": m.text}))
        page.on("pageerror", lambda e: logs.append({"type": "pageerror", "text": str(e)}))
        page.on(
            "requestfailed",
            lambda r: logs.append(
                {"type": "requestfailed", "text": f"{r.url} {r.failure}"}
            ),
        )

        page.goto(URL, wait_until="networkidle", timeout=30000)
        page.evaluate(
            """() => {
            localStorage.setItem('grimoire.iso', '1');
            localStorage.setItem('grimoire.iso3d', '1');
        }"""
        )
        page.reload(wait_until="networkidle")
        page.wait_for_timeout(1200)

        info = page.evaluate(
            """() => ({
            iso: localStorage.getItem('grimoire.iso'),
            iso3d: localStorage.getItem('grimoire.iso3d'),
            hasIso3D: !!(window.Iso3D && window.Iso3D.Host),
            ver: window.Iso3D && window.Iso3D.version,
            dbLen: (typeof DB !== 'undefined' && Array.isArray(DB)) ? DB.length : -1,
        })"""
        )
        print("INFO", info)

        if page.locator("#appMenu").count():
            page.locator("#appMenu").click()
            page.wait_for_timeout(250)
        if page.locator("#mnQuick").count():
            page.locator("#mnQuick").click()
        else:
            page.evaluate(
                "() => { if (typeof openQuickBattle === 'function') openQuickBattle(); }"
            )
        page.wait_for_timeout(600)

        if page.locator("#qbRandHero").count():
            # Start may be disabled with no heroes
            page.locator("#qbRandHero").click()
            page.wait_for_timeout(500)

        page.evaluate(
            """() => {
            const cb = document.getElementById('qbIso3d');
            if (cb && !cb.checked) {
              cb.checked = true;
              cb.dispatchEvent(new Event('change', { bubbles: true }));
            }
        }"""
        )
        page.locator("#qbStart").click()
        page.wait_for_timeout(2000)

        state = page.evaluate(
            """() => {
            const mount = document.getElementById('iso3dMount');
            const grid = document.querySelector('.mapgrid.iso3dmode');
            const gl = mount && mount.querySelector('canvas.iso3d-gl');
            const ov = mount && mount.querySelector('canvas.iso3d-overlay');
            let glInfo = null;
            if (gl) {
              glInfo = {
                w: gl.width, h: gl.height,
                cw: gl.clientWidth, ch: gl.clientHeight,
              };
            }
            return {
              title: document.title,
              qbActive: typeof QB !== 'undefined' && !!QB,
              iso3dView: typeof iso3dView !== 'undefined' ? iso3dView : null,
              isoView: typeof isoView !== 'undefined' ? isoView : null,
              host: !!window.__iso3dHost,
              Iso3D: !!(window.Iso3D && window.Iso3D.Host),
              mount: mount ? {
                w: mount.clientWidth, h: mount.clientHeight,
                kids: mount.children.length,
                display: getComputedStyle(mount).display,
                z: getComputedStyle(mount).zIndex,
              } : null,
              grid: grid ? {
                w: grid.clientWidth, h: grid.clientHeight,
                className: grid.className,
                bg: getComputedStyle(grid).backgroundColor,
              } : null,
              glInfo,
              overlay: ov ? { w: ov.width, h: ov.height } : null,
              cards: document.querySelectorAll('.card').length,
              h2: Array.from(document.querySelectorAll('h2')).map(h => h.textContent.slice(0, 40)),
            };
        }"""
        )
        print("STATE", json.dumps(state, indent=2))

        page.screenshot(path=str(OUT / "qb-full.png"), full_page=True)

        pix = page.evaluate(
            """() => {
            const glc = document.querySelector('canvas.iso3d-gl');
            if (!glc) return { err: 'no gl canvas' };
            const c = document.createElement('canvas');
            c.width = glc.width || 1;
            c.height = glc.height || 1;
            const ctx = c.getContext('2d');
            try { ctx.drawImage(glc, 0, 0); }
            catch (e) { return { err: String(e), w: glc.width, h: glc.height }; }
            const samples = [];
            const pts = [
              [10, 10],
              [c.width >> 1, c.height >> 1],
              [c.width - 10, c.height - 10],
              [c.width >> 1, (c.height / 3) | 0],
            ];
            for (const [x, y] of pts) {
              const d = ctx.getImageData(
                Math.max(0, Math.min(c.width - 1, x)),
                Math.max(0, Math.min(c.height - 1, y)),
                1, 1
              ).data;
              samples.push({ x, y, r: d[0], g: d[1], b: d[2], a: d[3] });
            }
            const img = ctx.getImageData(0, 0, c.width, c.height).data;
            let nonBlack = 0;
            let n = 0;
            for (let i = 0; i < img.length; i += 16) {
              n++;
              if (img[i] > 30 || img[i + 1] > 30 || img[i + 2] > 30) nonBlack++;
            }
            return { w: c.width, h: c.height, samples, nonBlack, sampled: n };
        }"""
        )
        print("PIX", json.dumps(pix, indent=2))

        print("LOGS:")
        for L in logs:
            print(f"  [{L['type']}] {L['text'][:400]}")

        (OUT / "logs.json").write_text(json.dumps(logs, indent=2), encoding="utf-8")
        (OUT / "state.json").write_text(json.dumps(state, indent=2), encoding="utf-8")
        browser.close()
    print("wrote", OUT)


if __name__ == "__main__":
    main()
