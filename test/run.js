#!/usr/bin/env node
/**
 * Runs every test/*.test.js in its own process and fails if any fails. No browser, no network:
 * the API is a local stub server and the browser APIs are fakes.
 *
 *   npm test                 # everything
 *   npm test -- manifest     # only files whose name contains one of the words
 */
'use strict';
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const filters = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const files = fs.readdirSync(__dirname).filter((f) => f.endsWith('.test.js')).filter((f) => !filters.length || filters.some((w) => f.includes(w))).sort();
if (!files.length) { console.error('no test files matched'); process.exit(1); }
let failed = 0;
for (const f of files) {
    const started = Date.now();
    const r = spawnSync(process.execPath, [path.join(__dirname, f)], { cwd: path.join(__dirname, '..'), encoding: 'utf8', timeout: 60000 });
    const ok = r.status === 0;
    if (!ok) failed++;
    console.log(`${ok ? '✓' : '✗'} ${f.padEnd(28)} ${String(Date.now() - started).padStart(6)}ms`);
    if (!ok || process.env.VERBOSE) console.log((r.stdout || '') + (r.stderr || ''));
}
console.log(`\n${files.length - failed}/${files.length} test files passed`);
process.exit(failed ? 1 : 0);
