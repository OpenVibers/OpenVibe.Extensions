'use strict';
/**
 * Test helpers: a tiny check/done runner, a stub OpenVibe.Coupons API (records every request:
 * method, URL, headers, body), and fakes of the browser APIs the extension uses.
 */
const http = require('http');

let failures = 0;
async function check(name, fn) {
    try { await fn(); console.log('  ✓', name); } catch (e) { failures++; console.log('  ✗', name, '\n     ', (e.stack || String(e)).split('\n').slice(0, 8).join('\n      ')); }
}
function done() { console.log(failures ? `\n${failures} failed` : '\nall passed'); process.exit(failures ? 1 : 0); }

const MERCHANT = { id: 'mer_01K5ZK3M9P2Q4R6S8T0V2W4X6Y', slug: 'acme', name: 'Acme Outdoor', homepage_url: 'https://acme-outdoor.com/', url: 'https://openvibe.coupons/m/acme', domains: [{ host: 'acme-outdoor.com', include_subdomains: true, path_prefix: null }], active_codes: 1, hints: [] };
const COUPON = {
    id: 'cpn_01K5ZK3M9P2Q4R6S8T0V2W4X6Z', merchant_id: MERCHANT.id, code: 'TRAIL15', title: '15% off tents', description: null, status: 'unknown', active: true, confidence: null,
    reports: { worked: 0, failed: 0, window_days: 30, last_report_at: null, last_worked_at: null, last_failed_at: null },
    expiry: { known: false, expires_at: null, precision: null, basis: null }, restrictions: [], hints: [], evidence: [], origin: 'member',
    created_at: '2026-09-22T12:00:00.000Z', updated_at: '2026-09-22T12:00:00.000Z', expired_at: null, url: 'https://openvibe.coupons/c/cpn_01K5ZK3M9P2Q4R6S8T0V2W4X6Z',
};
const GOOD_TOKEN = `cpx_${'a'.repeat(43)}`;
const REVOKED_TOKEN = `cpx_${'r'.repeat(43)}`;
const NO_REPORT_TOKEN = `cpx_${'n'.repeat(43)}`;

/** A stub of the Coupons API with the behaviour the extension relies on. */
function startStub({ delayMs = 0 } = {}) {
    const requests = [];
    const server = http.createServer((req, res) => {
        const chunks = [];
        req.on('data', (c) => chunks.push(c));
        req.on('end', () => {
            const body = Buffer.concat(chunks).toString('utf8');
            requests.push({ method: req.method, url: req.url, headers: req.headers, body });
            const send = (status, obj) => setTimeout(() => {
                res.writeHead(status, { 'Content-Type': status >= 400 ? 'application/problem+json' : 'application/json' });
                res.end(JSON.stringify(obj));
            }, delayMs);
            const auth = req.headers.authorization || '';
            if (auth === `Bearer ${REVOKED_TOKEN}`) return send(401, { code: 'token.revoked', detail: 'disconnected' });
            if (auth && ![`Bearer ${GOOD_TOKEN}`, `Bearer ${NO_REPORT_TOKEN}`].includes(auth)) return send(401, { code: 'token.invalid', detail: 'unknown' });
            const u = new URL(req.url, 'http://x');
            if (req.method === 'GET' && u.pathname === '/api/v1/merchants/resolve') {
                const host = u.searchParams.get('host');
                if (host === 'acme-outdoor.com' || host.endsWith('.acme-outdoor.com')) return send(200, { host, registrable_domain: 'acme-outdoor.com', matched_rule: {}, merchant: MERCHANT });
                if (host === 'down.example-shop.com') return send(503, { code: 'unavailable' });
                if (host === 'busy-shop.com') return send(429, { code: 'lookup.rate_limited' });
                return send(404, { code: 'merchant.not_found' });
            }
            if (req.method === 'GET' && u.pathname === `/api/v1/merchants/${MERCHANT.id}/coupons`) return send(200, { merchant: MERCHANT, coupons: [COUPON] });
            if (req.method === 'POST' && u.pathname === `/api/v1/coupons/${COUPON.id}/report`) {
                if (!auth) return send(401, { code: 'auth.required' });
                if (auth === `Bearer ${NO_REPORT_TOKEN}`) return send(403, { code: 'token.scope' });
                return send(201, { accepted: true, deduplicated: false, corrected: false, coupon: { ...COUPON, status: 'reported_working', confidence: 0.67 } });
            }
            return send(404, { code: 'route.not_found' });
        });
    });
    return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({
        origin: `http://127.0.0.1:${server.address().port}`, requests, close: () => new Promise((r) => server.close(r)),
    })));
}

/** fetch that records the options the client passes (and forwards to the real fetch). */
function recordingFetch() {
    const calls = [];
    const f = (url, opts) => { calls.push({ url, opts }); return fetch(url, opts); };
    f.calls = calls;
    return f;
}

/** Fakes of chrome.tabs / chrome.storage.local / chrome.permissions. */
function fakeExt({ url = null, token = null, hasPermission = true } = {}) {
    const store = token ? { installToken: token } : {};
    const log = [];
    return {
        log,
        store,
        tabs: { async query(q) { log.push(['tabs.query', q]); return url === undefined ? [] : [{ id: 1, url }]; } },
        storage: { local: {
            async get(k) { log.push(['storage.get', k]); return { [k]: store[k] }; },
            async set(o) { log.push(['storage.set', Object.keys(o)]); Object.assign(store, o); },
            async remove(k) { log.push(['storage.remove', k]); delete store[k]; },
        } },
        permissions: {
            async contains(p) { log.push(['permissions.contains', p]); return hasPermission; },
            async request(p) { log.push(['permissions.request', p]); return true; },
        },
    };
}

module.exports = { check, done, startStub, recordingFetch, fakeExt, MERCHANT, COUPON, GOOD_TOKEN, REVOKED_TOKEN, NO_REPORT_TOKEN };
