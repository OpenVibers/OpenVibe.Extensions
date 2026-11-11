#!/usr/bin/env node
'use strict';
/**
 * The side panel in a real browser: headless Chrome (CDP over Node's own WebSocket, no dependencies) loads the
 * unpacked extension, opens panel.html with a stubbed Network/Chat/Codes and a live agent view, and checks what a
 * person would see: the Dock on its Agents tab, the agent's stream frame, the line and the meta, the four controls
 * (Pause/Resume, Curtain now, Mute/Unmute, End, and the local Float), and the Dock's own styles and nothing a CSP refused.
 *
 *   node scripts/check-panel.js            (CHROME=/path/to/chrome to choose the browser; OV_EXT_DIR=an unpacked build, default browser/)
 *
 * test/panel.test.js runs it when a Chrome is installed and says so when it is not.
 */
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const CHROME = process.env.CHROME || ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => fs.existsSync(p));
const ROOT = path.join(__dirname, '..');
const EXT_DIR = process.env.OV_EXT_DIR || path.join(ROOT, 'browser');
const MANIFEST = JSON.parse(fs.readFileSync(path.join(EXT_DIR, 'manifest.json'), 'utf8'));

/** Chrome's extension id from the public key in the manifest (the same rule test/manifest.test.js checks). */
function extensionId(key) {
    const hash = crypto.createHash('sha256').update(Buffer.from(key, 'base64')).digest();
    let id = '';
    for (let i = 0; i < 16; i++) id += String.fromCharCode(97 + (hash[i] >> 4)) + String.fromCharCode(97 + (hash[i] & 15));
    return id;
}
const EXT_ID = extensionId(MANIFEST.key);

/** The Companion's Dock token: private issuer, client companion, the read-only scopes (unverified, as the panel reads it). */
const TOKEN = `${Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url')}.${Buffer.from(JSON.stringify({
    iss: 'https://openvibe.network/dock', sub: 'usr_test', username: 'ada', client_id: 'companion',
    scope: 'dock activity chat.read agent.view', fam: 'fam_0123456789abcdef01234567',
})).toString('base64url')}.signature`;
const FRAME = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0xff, 0xd9]);
const AGENT_ID = 'ags_01JAB2C3D4E5F6G7H8J9K0MNPQ';
const AGENT = {
    paused: true, paused_by: 'ada', paused_by_role: 'owner', mode: 'watch',
    id: AGENT_ID, state: 'live', title: 'Ship the Dock',
    task: { title: 'Ship the Dock', url: 'https://openvibe.codes/tasks/1' },
    curtain: { up: false }, viewers: 2, worked_seconds: 754, visibility: 'private',
    started_at: new Date(Date.now() - 754000).toISOString(), ended_at: null,
    page_url: `https://openvibe.live/@ada/agents/${AGENT_ID}`,
    embed_url: `https://openvibe.live/embed/agent/${AGENT_ID}?vt=wvt_test_ticket`,
    last_frame_url: 'https://openvibe.codes/api/v1/me/agent-view/frame', voice_muted: true,
};
const DOCK = {
    state: {
        open: true, tab: 'agent', pinned: true, agent: AGENT_ID, chat: null,
        place: { phone: { corner: 'bottom-right' }, desktop: { corner: 'bottom-right', width: null, height: null } },
        updated_at: new Date().toISOString(),
    },
    counts: { running: 0, waiting: 0, unread: 0 },
};

/** A CDP client over Node's WebSocket: requests by id, and events to listeners. */
function cdp(url) {
    const ws = new WebSocket(url);
    let id = 0;
    const waiting = new Map();
    const events = new Map();
    ws.addEventListener('message', (ev) => {
        const m = JSON.parse(ev.data);
        if (m.id && waiting.has(m.id)) {
            const w = waiting.get(m.id); waiting.delete(m.id);
            if (m.error) w.reject(new Error(m.error.message)); else w.resolve(m.result);
        } else if (m.method) {
            for (const fn of events.get(m.method) || []) fn(m.params);
        }
    });
    const ready = new Promise((resolve, reject) => { ws.addEventListener('open', resolve); ws.addEventListener('error', reject); });
    return {
        ready,
        send(method, params = {}) { return new Promise((resolve, reject) => { const n = ++id; waiting.set(n, { resolve, reject }); ws.send(JSON.stringify({ id: n, method, params })); }); },
        on(method, fn) { if (!events.has(method)) events.set(method, []); events.get(method).push(fn); },
        close() { ws.close(); },
    };
}

async function evaluate(c, expression) {
    const r = await c.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception ? r.exceptionDetails.exception.description : r.exceptionDetails.text);
    return r.result.value;
}

const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const json = (v) => ({ status: 200, type: 'application/json', body: JSON.stringify(v) });

/** What the stubbed first parties answer. A route this file does not know gets an empty object, never a refusal. */
let refuseFrame = false;
function answer(url, method) {
    const u = new URL(url);
    const p = u.pathname;
    if (method === 'OPTIONS') return { status: 204, type: 'text/plain', body: '' };
    if (u.origin === 'https://openvibe.live') {
        // A rendered embed announces itself to its parent (Live's agent-embed.js). With refuseFrame the page is
        // served without that hello: what a browser shows a parent when `frame-ancestors` keeps the embed out.
        const hello = refuseFrame ? '' : '<script>parent.postMessage({type:"ov-agent-embed",v:1},"*")</script>';
        return { status: 200, type: 'text/html', body: `<!doctype html><html><body><p id="stub-embed">embed</p>${hello}</body></html>` };
    }
    if (u.origin === 'https://openvibe.network' && p === '/api/v1/me/dock') return json(DOCK);
    if (u.origin === 'https://openvibe.network' && p === '/api/v1/me/actions') return json({ items: [], counts: {} });
    if (u.origin === 'https://openvibe.codes' && p === '/api/v1/me/agent-view') return json({ agent: AGENT });
    if (u.origin === 'https://openvibe.codes' && p === '/api/v1/me/agent-view/frame') return { status: 200, type: 'image/jpeg', body: FRAME };
    return json({});
}

async function main() {
    if (!CHROME) return { skipped: 'no Chrome or Chromium installed (set CHROME)' };
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ov-panel-'));
    const proc = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--no-sandbox',
        '--enable-unsafe-extension-debugging', `--user-data-dir=${dir}`, '--remote-debugging-port=0', 'about:blank'], { stdio: 'ignore' });
    let page = null;
    try {
        let port = null;
        for (let i = 0; i < 100 && !port; i++) {
            await pause(100);
            try { port = fs.readFileSync(path.join(dir, 'DevToolsActivePort'), 'utf8').split('\n')[0]; } catch { /* not yet */ }
        }
        if (!port) throw new Error('Chrome did not start');
        const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
        const target = targets.find((t) => t.type === 'page');
        if (!target) throw new Error('Chrome has no page target');
        const version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
        const browser = cdp(version.webSocketDebuggerUrl);
        await browser.ready;
        let loaded;
        try {
            loaded = await browser.send('Extensions.loadUnpacked', { path: EXT_DIR });
        } catch (err) {
            // An older Chrome has no Extensions domain; that is this browser's limit, not the panel's.
            if (/method|not available|not found|unsupported/i.test(String(err && err.message))) {
                browser.close();
                return { skipped: `this Chrome cannot load an unpacked extension over CDP (${err.message})` };
            }
            throw err;
        }
        if (loaded.id !== EXT_ID) throw new Error(`Chrome loaded ${loaded.id}, the manifest key says ${EXT_ID}`);
        browser.close();

        page = cdp(target.webSocketDebuggerUrl);
        await page.ready;
        await page.send('Page.enable');
        await page.send('Runtime.enable');
        await page.send('Log.enable');
        const security = [];
        page.on('Log.entryAdded', ({ entry }) => { if (entry && entry.source === 'security') security.push(entry.text); });
        const paused = [];
        page.on('Fetch.requestPaused', (p) => { paused.push(p.request.url); void (async () => {
            const a = answer(p.request.url, p.request.method);
            const headers = [
                { name: 'Access-Control-Allow-Origin', value: '*' },
                { name: 'Access-Control-Allow-Headers', value: 'authorization, content-type' },
                { name: 'Access-Control-Allow-Methods', value: 'GET, POST, OPTIONS' },
                { name: 'Content-Type', value: a.type },
            ];
            const params = { requestId: p.requestId, responseCode: a.status, responseHeaders: headers };
            if (a.status !== 204) params.body = Buffer.from(a.body).toString('base64');
            await page.send('Fetch.fulfillRequest', params);
        })().catch(() => { /* the page went away */ }); });
        await page.send('Fetch.enable', { patterns: [
            { urlPattern: 'https://openvibe.network/*' }, { urlPattern: 'https://openvibe.chat/*' },
            { urlPattern: 'https://openvibe.codes/*' }, { urlPattern: 'https://openvibe.live/*' },
        ] });

        await page.send('Page.navigate', { url: `chrome-extension://${EXT_ID}/panel.html` });
        for (let i = 0; i < 100 && (await evaluate(page, 'document.readyState')) !== 'complete'; i++) await pause(50);
        await evaluate(page, `chrome.storage.session.set(${JSON.stringify({ dockAccess: { token: TOKEN, expires_at: Date.now() + 3600000, scope: 'dock activity chat.read agent.view', username: 'ada' } })}).then(() => true)`);
        await evaluate(page, `chrome.storage.local.set(${JSON.stringify({ dockAccount: { username: 'ada', sub: 'usr_test' } })}).then(() => true)`);
        await page.send('Page.reload');

        let seen = null;
        for (let i = 0; i < 100; i++) {
            await pause(100);
            seen = await evaluate(page, `(() => {
                const q = (s) => document.querySelector(s);
                const text = (n) => n ? n.textContent.trim() : null;
                return {
                    gateHidden: q('#gate') ? q('#gate').hidden : null,
                    dock: !!q('.ovdk'),
                    agent: !!q('.ovda.on'),
                    line: text(q('.ovda-line')),
                    meta: text(q('.ovda-meta')),
                    acts: [...document.querySelectorAll('.ovda-acts [data-act]')].map((b) => b.dataset.act + ':' + b.textContent.trim()),
                    actLinks: [...document.querySelectorAll('.ovda-acts a[data-act]')].map((a) => a.getAttribute('href')),
                    watch: (() => { const w = q('a.ovda-watch'); return w ? { hidden: w.hidden, text: w.textContent.trim() } : null; })(),
                    frame: (q('iframe.ovda-frame') || {}).src || null,
                    tab: text(q('[role="tab"][aria-selected="true"]')),
                    styles: !!document.getElementById('ovdk-styles') && !!document.getElementById('ovda-styles'),
                    lineDisplay: q('.ovda-line') ? getComputedStyle(q('.ovda-line')).display : null,
                };
            })()`);
            if (seen && seen.agent) break;
        }

        for (let i = 0; i < 20 && !(paused.some((u) => u.startsWith('https://openvibe.live/embed/agent/')) && paused.some((u) => u.startsWith('https://openvibe.codes/api/v1/me/agent-view'))); i++) await pause(100);

        // A frame the browser refuses: the embed never says hello, so the panel shows the still and the plain link
        // instead of an empty frame, and the four controls are links to Codes (the panel's token is read-only).
        refuseFrame = true;
        await page.send('Page.reload');
        let fallback = null;
        for (let i = 0; i < 100; i++) {
            await pause(100);
            fallback = await evaluate(page, `(() => {
                const q = (s) => document.querySelector(s);
                const f = q('iframe.ovda-frame');
                const w = q('a.ovda-watch');
                const s = q('img.ovda-still');
                return {
                    agent: !!q('.ovda.on'),
                    frame: f ? f.src : null,
                    frameShown: f ? getComputedStyle(f).display !== 'none' : false,
                    watch: w ? { hidden: w.hidden, text: w.textContent.trim(), href: w.href } : null,
                    still: s ? s.src : null,
                };
            })()`);
            if (fallback && fallback.agent && fallback.watch && !fallback.watch.hidden && fallback.still) break;
        }

        const failures = [];
        if (!seen || !seen.dock) failures.push('the panel did not mount the Dock');
        if (!seen || !seen.gateHidden) failures.push('the sign-in gate stayed up with a signed-in Dock');
        if (!seen || !seen.agent) failures.push('the Agents tab did not draw the agent view');
        if (seen && seen.tab !== 'Agents') failures.push(`the Dock opened on "${seen.tab}", not Agents`);
        if (seen && seen.line !== 'Ship the Dock') failures.push(`the agent's line is "${seen.line}"`);
        if (seen && !/Paused by @ada/.test(seen.meta || '')) failures.push(`the meta does not say who paused it: "${seen.meta}"`);
        if (seen && !/2 watching/.test(seen.meta || '')) failures.push(`the meta does not say how many watch: "${seen.meta}"`);
        const wantActs = ['pause:Resume', 'curtain:Curtain now', 'mute:Unmute', 'end:End', 'float:Float'];
        if (seen && JSON.stringify(seen.acts) !== JSON.stringify(wantActs)) failures.push(`the controls are ${JSON.stringify(seen.acts)}`);
        if (seen && seen.actLinks.length !== 4) failures.push(`the four server controls are not read-only links: ${JSON.stringify(seen.actLinks)}`);
        if (seen && seen.actLinks.some((href) => href !== 'https://openvibe.codes')) failures.push(`a control does not open Codes: ${JSON.stringify(seen.actLinks)}`);
        if (seen && seen.frame !== AGENT.embed_url) failures.push(`the stream frame is "${seen.frame}"`);
        if (seen && !seen.styles) failures.push("the Dock's and agent view's own styles are missing");
        if (seen && seen.lineDisplay !== 'flex') failures.push(`the agent's styles did not apply (line display ${seen.lineDisplay})`);
        if (security.length) failures.push(`CSP refused: ${security.join(' | ')}`);
        if (!paused.some((u) => u.startsWith('https://openvibe.live/embed/agent/'))) failures.push('the panel never asked for the agent embed');
        if (!paused.some((u) => u.startsWith('https://openvibe.codes/api/v1/me/agent-view'))) failures.push('the panel never asked Codes for the agent view');
        // The refused frame: the still, the plain link, and no empty frame.
        if (!fallback || !fallback.agent) failures.push('the panel did not draw the agent view with a refused frame');
        if (fallback && fallback.frameShown) failures.push('a refused frame stayed on screen');
        if (fallback && (!fallback.watch || fallback.watch.hidden)) failures.push('a refused frame has no "Watch on openvibe.live" link');
        else if (fallback && fallback.watch.text !== 'Watch on openvibe.live') failures.push(`the watch link says "${fallback.watch.text}"`);
        else if (fallback && fallback.watch.href !== AGENT.page_url) failures.push(`the watch link opens "${fallback.watch.href}"`);
        if (fallback && !fallback.still) failures.push('a refused frame shows no still');
        return { failures, staged: paused.length, seen, fallback };
    } finally {
        if (page) page.close();
        proc.kill();
        await pause(200);
        fs.rmSync(dir, { recursive: true, force: true });
    }
}

module.exports = { main };

if (require.main === module) {
    main().then((r) => {
        if (r.skipped) { console.log(`side panel in Chrome: skipped (${r.skipped})`); return; }
        if (r.failures.length) { console.error(r.failures.join('\n')); process.exit(1); }
        console.log(`side panel in Chrome: the Dock opened on Agents with the agent view and its four controls (${r.staged} stubbed requests)`);
    }).catch((err) => { console.error(err); process.exit(1); });
}
