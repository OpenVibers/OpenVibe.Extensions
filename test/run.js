#!/usr/bin/env node
/**
 * Runs every test/*.test.js in its own process and fails if any fails. No browser, no network:
 * the API is a local stub server and the browser APIs are fakes.
 *
 *   npm test                 # everything
 *   npm test -- manifest     # only files whose name contains one of the words
 *   npm test -- --strict     # a skipped test fails the run too (or OV_TEST_STRICT=1)
 *
 * A test that cannot run something here prints `<label>: skipped (<why>)`: that file is listed with
 * ○ and its reasons and not counted as passed, so the summary reads `7/8 test files passed,
 * 1 skipped (…)`; only a run with nothing skipped says `N/N test files passed`. This is the rule of
 * openvibe-shared/test-runner, copied here because this repository does not depend on openvibe-shared.
 */
'use strict';
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const strict = process.argv.includes('--strict') || process.env.OV_TEST_STRICT === '1';
const filters = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const files = fs.readdirSync(__dirname).filter((f) => f.endsWith('.test.js')).filter((f) => !filters.length || filters.some((w) => f.includes(w))).sort();
if (!files.length) { console.error('no test files matched'); process.exit(1); }

/** `<label>: skipped (<why>)` on a line of its own (SKIP_RE from openvibe-shared/test-runner). */
const SKIP_RE = /^[ \t]*[\w .,'()/+#-]{1,120}: skipped \((.+)\)[ \t]*$/gm;

/** The skip lines in a test's output, in order, without repeats (skipsIn from openvibe-shared/test-runner). */
function skipsIn(output) {
    const out = [];
    for (const m of String(output || '').matchAll(SKIP_RE)) {
        const line = m[0].trim();
        if (!out.includes(line)) out.push(line);
    }
    return out;
}

let failed = 0;
const skipped = [];
for (const f of files) {
    const started = Date.now();
    const r = spawnSync(process.execPath, [path.join(__dirname, f)], { cwd: path.join(__dirname, '..'), encoding: 'utf8', timeout: 60000 });
    const ok = r.status === 0;
    const skips = ok ? skipsIn((r.stdout || '') + (r.stderr || '')) : [];
    if (!ok) failed++;
    if (skips.length) skipped.push({ file: f, skips });
    const mark = !ok ? '✗' : skips.length ? '○' : '✓';
    console.log(`${mark} ${f.padEnd(28)} ${String(Date.now() - started).padStart(6)}ms${skips.length ? `  ${skips.join('; ')}` : ''}`);
    if (!ok || process.env.VERBOSE) console.log((r.stdout || '') + (r.stderr || ''));
}
const passed = files.length - failed - skipped.length;
console.log(skipped.length
    ? `\n${passed}/${files.length} test files passed, ${skipped.length} skipped (${skipped.map((s) => `${s.file}: ${s.skips.join('; ')}`).join(' | ')})${strict ? ' — strict: skips fail the run' : ''}`
    : `\n${passed}/${files.length} test files passed`);
process.exit(failed || (strict && skipped.length) ? 1 : 0);
