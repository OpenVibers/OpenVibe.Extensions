'use strict';
/**
 * The Dock in the side panel: the panel page loads with a stubbed Network, mounts the Dock against
 * it, and says what is missing when there is no sign-in.
 */
const assert = require('assert');
const fs = require('fs');
const http = require('http');
const path = require('path');
const { check, done } = require('./helpers/harness');
const { createPanel } = require('../browser/panel.js');
const { createNetworkClient } = require('../browser/lib/network-api.js');

const DIR = path.join(__dirname, '..', 'browser');
const TOKEN = 'ov_token_' + 'x'.repeat(40);

/** The bits of a document the panel touches. */
function fakeDoc() {
    const node = (id) => ({ id, textContent: '', hidden: true, addEventListener(type, fn) { if (type === 'click') this.onclick = fn; } });
    const nodes = { gate: node('gate'), 'gate-title': node('gate-title'), 'gate-text': node('gate-text'), 'gate-button': node('gate-button') };
    return { nodes, getElementById: (id) => nodes[id] || null };
}

/** A stand-in for the Network's GET /api/v1/me/dock. */
async function startNetwork({ accept = TOKEN } = {}) {
    const requests = [];
    const server = http.createServer((req, res) => {
        requests.push({ url: req.url, auth: req.headers.authorization || null });
        const ok = req.headers.authorization === 'Bearer ' + accept;
        res.writeHead(ok ? 200 : 401, { 'content-type': 'application/json' });
        res.end(JSON.stringify(ok
            ? { state: { open: false, tab: 'activity', pinned: false, agent: null, chat: null, place: { phone: { corner: 'bottom-right' }, desktop: { corner: 'bottom-right', width: null, height: null } }, updated_at: new Date().toISOString() }, counts: { running: 1, waiting: 0, unread: 0 } }
            : { error: 'unauthorized' }));
    });
    await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
    const origin = 'http://127.0.0.1:' + server.address().port;
    return { origin, requests, close: () => server.close() };
}

function fakeDock() {
    const dock = { mounted: null, opened: 0, mount(opts) { dock.mounted = opts; }, open() { dock.opened++; } };
    return dock;
}

/** The OAuth auth surface the panel uses; `mode:'none'` is the signed-out gate. */
function fakeAuth({ mode = 'oauth', token = TOKEN } = {}) {
    const auth = {
        signIns: 0,
        status: async () => ({ mode, account: mode === 'oauth' ? { username: 'ada' } : null }),
        scopes: async () => (mode === 'oauth' ? ['dock', 'activity', 'chat.read'] : null),
        account: async () => (mode === 'oauth' ? { username: 'ada' } : null),
        accessToken: async () => { if (mode === 'none') throw Object.assign(new Error('auth required'), { code: 'auth.required' }); return token; },
        signIn: async () => { auth.signIns++; mode = 'oauth'; },
    };
    return auth;
}

(async () => {
    const net1 = await startNetwork();
    try {
        await check('the panel loads the Dock with the Network\'s state', async () => {
            const doc = fakeDoc();
            const dock = fakeDock();
            const net = createNetworkClient({ origin: net1.origin, fetch: (...a) => fetch(...a), getToken: async () => TOKEN });
            const panel = createPanel({ doc, config: { NETWORK_ORIGIN: 'https://openvibe.network', CHAT_ORIGIN: 'https://openvibe.chat' }, platform: { storage: { getNetworkToken: async () => null } }, auth: fakeAuth(), net, dock, sibling: (n) => 'chrome-extension://abc/shared/' + n });
            const out = await panel.start();
            assert.strictEqual(out.mounted, true, 'the Dock is mounted');
            assert.strictEqual(dock.opened, 1, 'and opened');
            assert.strictEqual(await dock.mounted.token(), TOKEN, "with the person's sign-in");
            assert.deepStrictEqual(dock.mounted.scopes, ['dock', 'activity', 'chat.read'], 'read-only scopes');
            assert.strictEqual(dock.mounted.me, 'ada', 'the account name');
            assert.strictEqual(dock.mounted.apiBase, 'https://openvibe.network', "the Network, where the Dock's state is");
            assert.strictEqual(dock.mounted.chatBase, 'https://openvibe.chat', 'and Chat, where the Chats tab reads');
            assert.strictEqual(dock.mounted.sibling('dock.js'), 'chrome-extension://abc/shared/dock.js', 'the bundled Dock, from this extension');
            assert.strictEqual(doc.nodes.gate.hidden, true, 'the gate steps aside');
            assert.ok(net1.requests.some((r) => r.url === '/api/v1/me/dock' && r.auth === 'Bearer ' + TOKEN), 'the Network is asked with that sign-in');
        });

        await check('without a sign-in the panel says what is missing', async () => {
            const doc = fakeDoc();
            const dock = fakeDock();
            const net = createNetworkClient({ origin: net1.origin, fetch: (...a) => fetch(...a), getToken: async () => null });
            const panel = createPanel({ doc, config: { NETWORK_ORIGIN: 'https://openvibe.network', CHAT_ORIGIN: 'https://openvibe.chat' }, platform: { storage: { getNetworkToken: async () => null } }, auth: fakeAuth({ mode: 'none' }), net, dock });
            const out = await panel.start();
            assert.strictEqual(out.mounted, false, 'no Dock without a sign-in');
            assert.strictEqual(doc.nodes.gate.hidden, false, 'the gate is shown');
            assert.match(doc.nodes['gate-title'].textContent, /OpenVibe\.Network/);
            assert.strictEqual(doc.nodes['gate-button'].hidden, false, 'with the way to fix it');
            assert.strictEqual(doc.nodes['gate-button'].textContent, 'Sign in');
        });

        await check('a sign-in the Network refuses is not used', async () => {
            const doc = fakeDoc();
            const dock = fakeDock();
            const bad = 'wrong_token_' + 'y'.repeat(40);
            const net = createNetworkClient({ origin: net1.origin, fetch: (...a) => fetch(...a), getToken: async () => bad });
            const panel = createPanel({ doc, config: { NETWORK_ORIGIN: 'https://openvibe.network', CHAT_ORIGIN: 'https://openvibe.chat' }, platform: { storage: { getNetworkToken: async () => null } }, auth: fakeAuth({ token: bad }), net, dock });
            const out = await panel.start();
            assert.strictEqual(out.mounted, false, 'no Dock with a sign-in the Network refused');
            assert.strictEqual(doc.nodes.gate.hidden, false, 'the gate says so');
            assert.match(doc.nodes['gate-title'].textContent, /said no/);
        });

        await check('the gate button starts the one-click sign-in and mounts after it', async () => {
            const doc = fakeDoc();
            const dock = fakeDock();
            const auth = fakeAuth({ mode: 'none' });
            const net = createNetworkClient({ origin: net1.origin, fetch: (...a) => fetch(...a), getToken: async () => TOKEN });
            const panel = createPanel({ doc, config: { NETWORK_ORIGIN: 'https://openvibe.network', CHAT_ORIGIN: 'https://openvibe.chat' }, platform: { storage: {} }, auth, net, dock });
            await panel.start();
            doc.nodes['gate-button'].onclick();
            // The click handler is async; wait until the grant is "connected" and the Dock mounted.
            const start = Date.now();
            while (!dock.mounted && Date.now() - start < 2000) await new Promise((r) => setTimeout(r, 20));
            assert.strictEqual(auth.signIns, 1, 'the button starts the OAuth flow');
            assert.strictEqual(dock.opened, 1, 'and the Dock mounts');
            assert.strictEqual(doc.nodes.gate.hidden, true);
        });
    } finally {
        net1.close();
    }

    await check('the panel bundles the released Dock and loads nothing remote', async () => {
        for (const f of ['shared/dock.js', 'shared/action-center.js', 'shared/notification-ui.js', 'shared/ov-mark.js', 'shared/kit.css']) {
            assert.ok(fs.existsSync(path.join(DIR, f)), 'the panel ships ' + f);
        }
        const html = fs.readFileSync(path.join(DIR, 'panel.html'), 'utf8');
        assert.ok(!/src="https?:/i.test(html), 'no remote script');
        assert.ok(!/href="https?:/i.test(html), 'no remote stylesheet');
        assert.match(html, /shared\/dock\.js/);
    });

    done();
})();
