#!/usr/bin/env node
// whereis — answer "which file is this symbol in?" in ONE call.
//
// Why this exists: the data.js/rules.js/net.js/ui.js split was made by a heuristic (DOM signal
// -> ui.js, net signal -> net.js, else rules.js), so a symbol's file is genuinely hard to guess
// from what it *does*: applyHp/castSpell/attackFlow are core rules but live in ui.js, canCast
// lives in net.js, and Engine/BRAINS/CONTROLLERS/the adapters never left index.html at all
// (they're top-level statements whose execution order matters). CLAUDE.md's hand-written map
// drifted out of date on exactly those entries and cost real greps. A generated answer can't
// drift, so prefer this over trusting any hand-maintained anchor list.
//
//   node tools/whereis.js Engine applyHp SPELL_DESC
//   node tools/whereis.js grapple --loose     # substring search when you don't know the name
//
// Exit code 1 if any symbol wasn't found, so it can gate a script.

const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..');
const FILES = ['data.js', 'rules.js', 'net.js', 'ui.js', 'index.html', 'iso-renderer.js'];

const args = process.argv.slice(2);
const loose = args.includes('--loose');
const symbols = args.filter((a) => !a.startsWith('--'));

if (!symbols.length) {
  console.error('usage: node tools/whereis.js <symbol>... [--loose]');
  process.exit(2);
}

// A declaration, not a call site: `function foo(`, `const foo =`, `foo(a,b){` (object-method
// shorthand, which is how Engine's own methods are written), or `foo:` in an object literal.
const declPatterns = (s) => {
  const e = s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return [
    new RegExp(`\\b(?:async\\s+)?function\\s+${e}\\b`),
    new RegExp(`\\b(?:const|let|var)\\s+${e}\\b`),
    new RegExp(`^\\s*${e}\\s*\\([^)]*\\)\\s*\\{`),
    new RegExp(`^\\s*${e}\\s*[:=]\\s*(?:async\\s*)?(?:function\\b|\\([^)]*\\)\\s*=>)`),
  ];
};

let missing = 0;

for (const sym of symbols) {
  const pats = declPatterns(sym);
  const hits = [];
  for (const f of FILES) {
    const full = path.join(DIR, f);
    if (!fs.existsSync(full)) continue;
    const lines = fs.readFileSync(full, 'utf8').split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const match = loose
        ? line.toLowerCase().includes(sym.toLowerCase())
        : pats.some((p) => p.test(line));
      if (match) hits.push({ f, n: i + 1, text: line.trim().slice(0, 100) });
    }
  }
  if (!hits.length) {
    console.log(`${sym}: NOT FOUND` + (loose ? '' : '  (try --loose)'));
    missing++;
    continue;
  }
  console.log(`${sym}:`);
  for (const h of hits.slice(0, loose ? 12 : 6)) console.log(`  ${h.f}:${h.n}  ${h.text}`);
  if (hits.length > (loose ? 12 : 6)) console.log(`  … ${hits.length - (loose ? 12 : 6)} more`);
}

process.exit(missing ? 1 : 0);
