#!/usr/bin/env python3
"""Smoke: Grimoire Quick Battle + Iso3D mounts without fatal console errors."""
from __future__ import annotations

import sys

from playwright.sync_api import sync_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8080/"


def main() -> int:
    logs: list[tuple[str, str]] = []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1280, "height": 900})
        page.on("console", lambda m: logs.append((m.type, m.text)))
        page.on("pageerror", lambda e: logs.append(("pageerror", str(e))))

        page.goto(URL, wait_until="networkidle", timeout=30000)
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
        page.wait_for_timeout(1800)

        # Open attack targeting to exercise badges + range highlights
        if page.locator("#qbAttack").count():
            page.locator("#qbAttack").click()
            page.wait_for_timeout(800)

        state = page.evaluate(
            """() => ({
            ver: window.Iso3D && window.Iso3D.version,
            host: !!window.__iso3dHost,
            qb: typeof QB !== 'undefined' && !!QB,
            mount: !!document.getElementById('iso3dMount'),
            app: typeof APP_VERSION !== 'undefined' ? APP_VERSION : null,
        })"""
        )

        fatal = [
            t
            for k, t in logs
            if k in ("error", "pageerror")
            and "404" not in t
            and "Failed to load resource" not in t
            and "strataColor" not in t  # should not appear; listed for clarity
        ]
        # strataColor is fatal if present
        if any("strataColor" in t for _, t in logs):
            fatal.append("strataColor crash")

        print("state", state)
        print("fatal_errors", len(fatal))
        for t in fatal[:12]:
            print(" ", t[:240])

        browser.close()

        ok = (
            state.get("host")
            and state.get("qb")
            and state.get("mount")
            and state.get("ver") == "0.5.9"
            and not fatal
        )
        print("PASS" if ok else "FAIL")
        return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
