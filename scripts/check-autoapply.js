#!/usr/bin/env node
'use strict';
/**
 * browser/lib/autoapply.js in a real browser: headless Chrome (CDP over Node's own WebSocket, no dependencies) opens
 * each fixture checkout page in test/fixtures/, runs the module there, and checks what it did:
 *
 *   checkout-simple.html   a promo box with an Apply button: the bad code fails on the page's message, SAVE10 lowers
 *                          the total and is kept; the Place order button is never pressed
 *   checkout-hidden.html   the box sits behind "Have a promo code?" and the page reads its value from input events (a
 *                          framework-style field); € amounts with a decimal comma
 *   checkout-noapply.html  a discount field with no Apply button, in a form whose only button is "Pay now": nothing
 *                          is typed or pressed (reason no_apply)
 *
 *   node scripts/check-autoapply.js            (CHROME=/path/to/chrome to choose the browser)
 *
 * test/autoapply.test.js runs it when a Chrome is installed and says so when it is not.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const CHROME = process.env.CHROME || ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => fs.existsSync(p));
const ROOT = path.join(__dirname, '..');
const SOURCE = fs.readFileSync(path.join(ROOT, 'browser', 'lib', 'autoapply.js'), 'utf8');

const CASES = [
    {
        file: 'checkout-simple.html',
        codes: [{ id: 'cpn_bad', code: 'NOPE5' }, { id: 'cpn_good', code: 'SAVE10' }, { id: 'cpn_never', code: 'LATER' }],
        expect: (r, page) => {
            const out = r.results.map((x) => `${x.code}:${x.outcome}`).join(' ');
            if (out !== 'NOPE5:failed SAVE10:worked') return `results ${out}`;
            if (r.before !== 54 || r.after !== 44) return `totals ${r.before} → ${r.after}`;
            if (page.submits) return 'the checkout form was submitted';
            if (page.tried.join(',') !== 'NOPE5,SAVE10') return `tried ${page.tried}`;
            return null;
        },
    },
    {
        file: 'checkout-hidden.html',
        codes: [{ id: 'a', code: 'OLD' }, { id: 'b', code: 'WELCOME' }],
        expect: (r, page) => {
            const out = r.results.map((x) => `${x.code}:${x.outcome}`).join(' ');
            if (out !== 'OLD:failed WELCOME:worked') return `results ${out}`;
            if (r.before !== 1234.56 || r.after !== 1111.1) return `totals ${r.before} → ${r.after}`;
            if (page.tried.join(',') !== 'OLD,WELCOME') return `the page saw ${page.tried} (framework value)`;
            return null;
        },
    },
    {
        file: 'checkout-noapply.html',
        codes: [{ id: 'a', code: 'SAVE10' }],
        expect: (r, page) => {
            if (r.ok || r.reason !== 'no_apply') return `ok ${r.ok} reason ${r.reason}`;
            if (page.submits) return 'the form was submitted';
            if (page.value) return `the field was filled (${page.value})`;
            return null;
        },
    },
];

function cdp(url) {
    const ws = new WebSocket(url);
    let id = 0;
    const waiting = new Map();
    ws.addEventListener('message', (ev) => {
        const m = JSON.parse(ev.data);
        if (m.id && waiting.has(m.id)) { const w = waiting.get(m.id); waiting.delete(m.id); if (m.error) w.reject(new Error(m.error.message)); else w.resolve(m.result); }
    });
    const ready = new Promise((resolve, reject) => { ws.addEventListener('open', resolve); ws.addEventListener('error', reject); });
    return {
        ready,
        send(method, params = {}) { return new Promise((resolve, reject) => { const n = ++id; waiting.set(n, { resolve, reject }); ws.send(JSON.stringify({ id: n, method, params })); }); },
        close() { ws.close(); },
    };
}

async function evaluate(c, expression) {
    const r = await c.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception ? r.exceptionDetails.exception.description : r.exceptionDetails.text);
    return r.result.value;
}

const pause = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
    if (!CHROME) return { skipped: 'no Chrome or Chromium installed (set CHROME)' };
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ov-autoapply-'));
    const proc = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--allow-file-access-from-files',
        `--user-data-dir=${dir}`, '--remote-debugging-port=0', 'about:blank'], { stdio: 'ignore' });
    try {
        let port = null;
        for (let i = 0; i < 100 && !port; i++) {
            await pause(100);
            try { port = fs.readFileSync(path.join(dir, 'DevToolsActivePort'), 'utf8').split('\n')[0]; } catch { /* not yet */ }
        }
        if (!port) throw new Error('Chrome did not start');
        const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
        const page = targets.find((t) => t.type === 'page');
        const c = cdp(page.webSocketDebuggerUrl);
        await c.ready;
        const failures = [];
        for (const k of CASES) {
            await c.send('Page.navigate', { url: `file://${path.join(ROOT, 'test', 'fixtures', k.file)}` });
            for (let i = 0; i < 50 && (await evaluate(c, 'document.readyState')) !== 'complete'; i++) await pause(50);
            await evaluate(c, SOURCE);
            const r = await evaluate(c, `OVAutoApply.run(${JSON.stringify(k.codes)}, { waitMs: 2500, openMs: 300 })`);
            const seen = await evaluate(c, '({ tried: window.tried || [], submits: window.submits || 0, value: (document.querySelector("input[name=discount_code]") || {}).value || "" })');
            const problem = k.expect(r, seen);
            if (problem) failures.push(`${k.file}: ${problem} — ${JSON.stringify(r)}`);
        }
        c.close();
        return { failures, cases: CASES.length };
    } finally {
        proc.kill();
        await pause(200);
        fs.rmSync(dir, { recursive: true, force: true });
    }
}

module.exports = { main };

if (require.main === module) {
    main().then((r) => {
        if (r.skipped) { console.log(`autoapply in Chrome: skipped (${r.skipped})`); return; }
        if (r.failures.length) { console.error(r.failures.join('\n')); process.exit(1); }
        console.log(`autoapply in Chrome: ${r.cases}/${r.cases} fixture pages behave`);
    }).catch((err) => { console.error(err); process.exit(1); });
}
