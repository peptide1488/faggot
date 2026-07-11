#!/usr/bin/env python3
from playwright.sync_api import sync_playwright

def main():
    logs = []
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
        page.wait_for_timeout(800)
        page.evaluate(
            "if (typeof openQuickBattle === 'function') openQuickBattle();"
        )
        page.wait_for_timeout(500)
        if page.locator("#qbRandHero").count():
            page.locator("#qbRandHero").click()
            page.wait_for_timeout(500)
        page.locator("#qbStart").click()
        page.wait_for_timeout(1800)
        ver = page.evaluate("() => window.Iso3D && window.Iso3D.version")
        host = page.evaluate("() => !!window.__iso3dHost")
        errs = [
            t
            for kind, t in logs
            if kind in ("error", "pageerror")
            and "404" not in t
            and "Failed to load resource" not in t
        ]
        strata = any("strataColor" in t for _, t in logs)
        print("Iso3D version:", ver)
        print("host:", host)
        print("strataColor errors:", strata)
        print("other non-404 errors:", len(errs))
        for t in errs[:8]:
            print(" ", t[:250])
        browser.close()
        if strata or not host or ver != "0.5.5":
            raise SystemExit(1)


if __name__ == "__main__":
    main()
