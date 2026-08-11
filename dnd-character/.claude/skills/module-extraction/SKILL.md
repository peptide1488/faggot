---
name: module-extraction
description: How to split a large single-file script (index.html's inline <script>, ui.js) into separate module files without silently corrupting it. Use when extracting functions from one JS file into another, or when any task needs to find where a function ends in source text. Records what went wrong the two times this was done by hand.
---

# Extracting functions out of a big JS file

Two hand-rolled line-position heuristics both produced real, silent corruption
before the Grimoire modularization shipped:

- a bare top-level statement between two functions got swept into the wrong one;
- a dedented closing `); }` from a multi-line arrow-function chain
  (`WIZ_BASE.filter(s=>\n ... \n); }`) got misread as a new top-level statement,
  truncating the function it belonged to.

Both were caught by actually running the test suite against the extraction, not
by assuming a mechanical script's output was correct.

## The method that worked

For each function's exact end line, grow a candidate end line one at a time and
use Node's real parser to check when the accumulated text first becomes
syntactically valid:

```js
const vm = require('vm');
function endOf(lines, start) {
  for (let end = start; end < lines.length; end++) {
    const text = lines.slice(start, end + 1).join('\n');
    try { new vm.Script(text); return end; } catch (e) { /* keep growing */ }
  }
  throw new Error('never became valid from line ' + start);
}
```

A function is complete the instant its own braces balance, so this is exact, not
heuristic.

**Don't hand-roll a brace/string/template-literal tracker for this.** It is a
known-hard problem — regex-vs-division ambiguity, nested `${}` in template
literals — that the real parser already solves correctly. The same trap caught a
later attempt at a static "is every called identifier defined?" guard: stripping
comments/strings/template literals with regex mangled the source and reported 195
false positives (`flashBanner`, `render`, `esc` …). Don't retry that without a
real parser either.

## After any extraction

Run the test suite against the result before believing it. `rules-test.js`
concatenates every module plus the extracted `<script>` content into ONE `eval()`
call, because `let`/`const` don't leak across *separate* eval calls the way they
do across script tags in a real page — keep any new module file in that same
concatenated eval, don't eval it alone.
