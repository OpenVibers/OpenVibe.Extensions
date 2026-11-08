#!/usr/bin/env node
'use strict';
/**
 * Lints the extension the way Firefox sees it.
 *
 * Firefox has no background service worker: it runs the background file as a background page. So the
 * Firefox manifest is the one the store build carries (`scripts/pack.js` forTarget), and this lint
 * runs over that manifest and not over the Chrome one in browser/.
 *
 * The extension's own tree is copied to a temporary directory, the Firefox manifest is written there,
 * and web-ext lint is run over it with warnings as errors.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { sourceFiles, forTarget } = require('./pack');

const ROOT = path.join(__dirname, '..');

function main() {
    const files = sourceFiles('https://openvibe.coupons');
    forTarget(files, 'firefox');
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ov-ext-firefox-'));
    try {
        for (const [name, data] of files) {
            fs.mkdirSync(path.dirname(path.join(tmp, name)), { recursive: true });
            fs.writeFileSync(path.join(tmp, name), data);
        }
        const cmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
        const run = spawnSync(cmd, ['--yes', 'web-ext@8.10.0', 'lint', '--source-dir', tmp, '--warnings-as-errors', '--ignore-files', 'shared/**'], { stdio: 'inherit', cwd: ROOT });
        process.exit(run.status == null ? 1 : run.status);
    } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
    }
}

if (require.main === module) main();

module.exports = { main };
