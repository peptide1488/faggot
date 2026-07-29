/* Grimoire UI smoke test — catches the class of bug rules-test.js structurally cannot.
 *
 * WHY THIS EXISTS: rules-test.js evals the app against a stub DOM and exercises *rules*. It never
 * executes a click handler. On 2026-07-29 a handler called a `dmLog()` that does not exist; the
 * full ~1000-assertion suite passed and the button would have thrown the instant it was pressed.
 * Only running the real UI catches that. (A static "is every identifier defined?" check was tried
 * and abandoned — regex-stripping comments/strings/templates gave 195 false positives including
 * `flashBanner` and `render`. See VISION.md's engineering-strategy section.)
 *
 * HOW TO RUN — this is a page-side function on purpose, so it needs no npm dependency:
 *   • Playwright/CDP:  evaluate this file's source, then call `grimoireSmoke()`
 *   • By hand:         paste into devtools on the live site and call `grimoireSmoke()`
 *
 * SAFETY — this is the important part. A smoke test that clicks indiscriminately would hit
 * "Delete this character" and "Reset app — delete ALL data" and destroy the user's real data. So:
 *   1. it NEVER clicks anything matching DESTRUCTIVE below;
 *   2. it only clicks controls on an explicit allowlist;
 *   3. all mutation happens inside a synthetic DM session it creates and tears down. It does not
 *      touch DB, localStorage, or the character sheet.
 * Anything outside that is reported as "not covered" rather than silently skipped, so the report
 * never overstates what was actually verified.
 *
 * HOW FAILURES ACTUALLY SURFACE — do not "simplify" this away: an exception thrown inside a click
 * handler does NOT propagate back to the `el.click()` caller, so it will not appear in `threw`.
 * It reaches the window 'error' event instead. That is why this captures window.onerror as well
 * as console.error, and why `ok` requires BOTH to be empty. Verified 2026-07-29 by pointing
 * `hideMonster` at an undefined function: the run flipped to ok:false with
 * "Uncaught ReferenceError: … is not defined" in consoleErrors, and recovered when restored.
 * A guard that has never been seen to fail is not a guard.
 */
(function () {
  const DESTRUCTIVE = /reset|delete|del\b|mdel|remove|wipe|clear|leave|exit|import/i;

  // Roster / battle controls that are safe to press against a throwaway session.
  const SAFE_CLICKS = [
    { sel: '[data-mhide]', what: 'monster Hide (v120.237)' },
    { sel: '[data-msheet]', what: 'monster stat block' },
    { sel: '[data-mloot]', what: 'monster inventory' },
    { sel: '[data-matk]', what: 'monster attack' },
    { sel: '#dmRoll', what: 'roll initiative' },
    { sel: '#pbFogBtn', what: 'fog toggle (v120.241)' },
    { sel: '#pbRotBtn', what: 'rotate map' },
  ];

  function collectErrors() {
    const errs = [];
    const origErr = console.error;
    const onErr = (e) => errs.push('window.onerror: ' + (e.message || e));
    console.error = function (...a) { errs.push('console.error: ' + a.map(String).join(' ')); return origErr.apply(this, a); };
    window.addEventListener('error', onErr);
    return {
      stop() { console.error = origErr; window.removeEventListener('error', onErr); return errs; },
      errs,
    };
  }

  window.grimoireSmoke = async function grimoireSmoke(opts) {
    opts = opts || {};
    const report = { version: (typeof APP_VERSION !== 'undefined' ? APP_VERSION : '?'), clicked: [], threw: [], skipped: [], notCovered: [], consoleErrors: [] };
    const cap = collectErrors();
    const savedNet = (typeof net !== 'undefined') ? net : null;

    try {
      // 1. Every tab must render without throwing. Pure render, no mutation.
      for (const tab of ['char', 'combat', 'spells', 'items', 'notes']) {
        try { window.tab = tab; render(); report.clicked.push('render tab:' + tab); }
        catch (e) { report.threw.push('render tab:' + tab + ' → ' + e.message); }
      }

      // 2. A synthetic DM session, so any mutation lands on throwaway data.
      try {
        dmHost();
        await new Promise((r) => setTimeout(r, 1500));
        const s = net.session;
        s.map = { cols: 6, rows: 3, tiles: {}, light: { mode: 'night' } };
        s.monsters = [{ id: 'smoke1', name: 'Goblin', base: 'Goblin', hp: 7, max: 7, ac: 15, x: 1, y: 1, conds: [], num: 1 }];
        s.players = [{ id: 'smokeP', cid: 'smokeP', name: 'Dummy', ac: 12, hpCur: 9, hpMax: 9, x: 0, y: 0, conds: [] }];
        if (!s.battle) s.battle = {}; s.battle.active = true; s.battle.round = 1;
        render();
        await new Promise((r) => setTimeout(r, 400));
      } catch (e) {
        report.threw.push('dmHost setup → ' + e.message);
      }

      // 3. Click the allowlist. Destructive controls are refused even if listed by mistake.
      for (const { sel, what } of SAFE_CLICKS) {
        const el = document.querySelector(sel);
        if (!el) { report.notCovered.push(what + ' (' + sel + ' not present on this screen)'); continue; }
        const label = (el.id || '') + ' ' + (el.textContent || '');
        if (DESTRUCTIVE.test(label) || DESTRUCTIVE.test(sel)) { report.skipped.push(what + ' (destructive)'); continue; }
        try { el.click(); await new Promise((r) => setTimeout(r, 250)); report.clicked.push(what); }
        catch (e) { report.threw.push(what + ' → ' + e.message); }
      }

      // 4. Report what was on screen but deliberately not pressed, so coverage isn't overstated.
      const all = [...document.querySelectorAll('button[id], [data-mhide], [data-matk], [data-msheet]')];
      report.notCovered = report.notCovered.concat(
        all.filter((el) => DESTRUCTIVE.test((el.id || '') + ' ' + (el.textContent || '')))
           .map((el) => (el.id || el.textContent.trim().slice(0, 24)) + ' (destructive, never clicked)')
      );
    } finally {
      if (typeof net !== 'undefined') net = savedNet;
      try { render(); } catch (e) { /* restoring the previous view is best-effort */ }
      report.consoleErrors = cap.stop();
    }

    report.ok = report.threw.length === 0 && report.consoleErrors.length === 0;
    return report;
  };
})();
