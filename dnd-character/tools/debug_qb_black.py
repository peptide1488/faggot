#!/usr/bin/env python3
from pathlib import Path

from playwright.sync_api import sync_playwright

OUT = Path(__file__).resolve().parent / "qb-debug"
OUT.mkdir(exist_ok=True)


def main() -> None:
    logs: list[tuple[str, str]] = []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1280, "height": 900})
        page.on("console", lambda m: logs.append((m.type, m.text)))
        page.on("pageerror", lambda e: logs.append(("pageerror", str(e))))

        page.goto("http://localhost:8080/", wait_until="networkidle")
        page.evaluate(
            "localStorage.setItem('grimoire.iso','1');"
            "localStorage.setItem('grimoire.iso3d','1');"
        )
        page.reload(wait_until="networkidle")
        page.wait_for_timeout(900)
        page.evaluate(
            "if (typeof openQuickBattle === 'function') openQuickBattle();"
        )
        page.wait_for_timeout(400)
        if page.locator("#qbRandHero").count():
            page.locator("#qbRandHero").click()
            page.wait_for_timeout(500)
        page.locator("#qbStart").click()
        page.wait_for_timeout(2000)

        errs = [
            t
            for k, t in logs
            if k in ("error", "pageerror")
            and "404" not in t
            and "Failed to load resource" not in t
        ]
        print("ERR COUNT", len(errs))
        for t in errs[:25]:
            print("---")
            print(t[:500])

        print(
            "ISO",
            page.evaluate("() => window.Iso3D && window.Iso3D.version"),
        )
        print("HOST", page.evaluate("() => !!window.__iso3dHost"))
        info = page.evaluate(
            """() => {
            const h = window.__iso3dHost;
            if (!h) return { err: 'no host' };
            try {
              h._frame();
              return {
                ok: true,
                decor: (h._view && h._view.decorSprites || []).length,
                units: (h._view && h._view.units || []).length,
                map: !!(h._view && h._view.map),
                mapCount: h.renderer && h.renderer.mapCount,
              };
            } catch (e) {
              return { err: String(e), stack: (e.stack || '').slice(0, 500) };
            }
          }"""
        )
        print("FRAME", info)

        page.screenshot(path=str(OUT / "qb-black2.png"), full_page=True)
        print("screenshot", OUT / "qb-black2.png")
        browser.close()


if __name__ == "__main__":
    main()
