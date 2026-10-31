'use strict';
/**
 * The Dock's one-click sign-in (lib/auth.js): PKCE S256, state, no client secret, the access token in
 * storage.session, the rotating refresh token in storage.local, single-flight refresh, Sign out revoke,
 * and the 0.7.0 pasted-token fallback. No browser is started; identity/storage are fakes and fetch is a
 * queue.
 */
const assert = require('assert');
const crypto = require('crypto');
const config = require('../browser/lib/config');
const { createAuth } = require('../browser/lib/auth');
const { check, done } = require('./helpers/harness');

const CHROME = config.OAUTH_REDIRECT_URIS[0];
const b64 = (buf) => Buffer.from(buf).toString('base64url');
const token = (sub = 7, username = 'ada') => `${b64(JSON.stringify({ alg: 'none', typ: 'JWT' }))}.${b64(JSON.stringify({ sub, username, display_name: 'Ada' }))}.sig`;

function platform({ redirect = CHROME, legacy = null, launch } = {}) {
    const session = new Map(), local = new Map();
    let old = legacy;
    const copy = (map, values) => { for (const k of Object.keys(values)) map.set(k, values[k]); };
    return {
        session, local,
        get legacy() { return old; },
        identity: {
            getRedirectURL() { return redirect; },
            launchWebAuthFlow(opts) { return launch ? launch(opts) : Promise.reject(new Error('no launch')); },
        },
        storage: {
            async getSession(k) { return session.has(k) ? session.get(k) : null; },
            async setSession(v) { copy(session, v); },
            async removeSession(keys) { for (const k of [].concat(keys)) session.delete(k); },
            async getLocal(k) { return local.has(k) ? local.get(k) : null; },
            async setLocal(v) { copy(local, v); },
            async removeLocal(keys) { for (const k of [].concat(keys)) local.delete(k); },
            async getNetworkToken() { return old; },
            async setNetworkToken(t) { old = t; },
            async clearNetworkToken() { old = null; },
        },
    };
}

function fetcher(responses) {
    const calls = [];
    const fetch = async (url, opts) => {
        const body = new URLSearchParams(opts.body);
        calls.push({ url, body: Object.fromEntries(body), headers: opts.headers });
        const r = responses.shift();
        if (r instanceof Error) throw r;
        return { ok: r.status < 400, status: r.status, json: async () => r.body };
    };
    fetch.calls = calls;
    return fetch;
}

(async () => {
    await check('sign-in: exact authorize parameters, S256, state, code exchange with no secret', async () => {
        let issuedChallenge = null;
        const p = platform({
            launch(opts) {
                const u = new URL(opts.url);
                const state = u.searchParams.get('state');
                assert.strictEqual(opts.interactive, true);
                assert.strictEqual(u.origin + u.pathname, config.NETWORK_ORIGIN + '/oauth/authorize');
                assert.strictEqual(u.searchParams.get('client_id'), 'companion');
                assert.strictEqual(u.searchParams.get('redirect_uri'), CHROME);
                assert.strictEqual(u.searchParams.get('response_type'), 'code');
                assert.strictEqual(u.searchParams.get('scope'), 'dock activity chat.read');
                assert.strictEqual(u.searchParams.get('code_challenge_method'), 'S256');
                assert.match(state, /^[A-Za-z0-9_-]{43}$/);
                issuedChallenge = u.searchParams.get('code_challenge');
                assert.match(issuedChallenge, /^[A-Za-z0-9_-]{43}$/);
                return Promise.resolve(`${CHROME}?code=code123&state=${encodeURIComponent(state)}`);
            },
        });
        const f = fetcher([{ status: 200, body: { access_token: token(), refresh_token: 'r'.repeat(96), expires_in: 3600, scope: 'dock activity chat.read' } }]);
        const auth = createAuth({ platform: p, config, fetch: f });
        const acc = await auth.signIn();
        assert.strictEqual(acc.token, token());
        assert.strictEqual(f.calls.length, 1);
        const ex = f.calls[0];
        assert.strictEqual(ex.url, config.NETWORK_ORIGIN + '/oauth/token');
        assert.strictEqual(ex.body.grant_type, 'authorization_code');
        assert.strictEqual(ex.body.client_id, 'companion');
        assert.strictEqual(ex.body.code, 'code123');
        assert.strictEqual(ex.body.redirect_uri, CHROME);
        assert.ok(!('client_secret' in ex.body), 'a public client never sends a secret');
        assert.match(ex.body.code_verifier, /^[A-Za-z0-9_-]{43}$/);
        const challenge = b64(crypto.createHash('sha256').update(ex.body.code_verifier).digest());
        assert.strictEqual(issuedChallenge, challenge, 'the authorize challenge is S256 of the verifier sent at exchange');
        assert.ok(p.session.get(config.DOCK_ACCESS_KEY).token);
        assert.strictEqual(p.session.get(config.DOCK_ACCESS_KEY).expires_at > Date.now(), true);
        assert.strictEqual(p.local.get(config.DOCK_REFRESH_KEY).token, 'r'.repeat(96));
        assert.deepStrictEqual(p.local.get(config.DOCK_ACCOUNT_KEY), { sub: 7, username: 'ada', display_name: 'Ada' });
        assert.deepStrictEqual(await auth.scopes(), ['dock', 'activity', 'chat.read']);
        assert.strictEqual((await auth.status()).mode, 'oauth');
    });

    await check('state mismatch and a wrong redirect reject before any token exchange', async () => {
        let p = platform({ launch: async (opts) => `${CHROME}?code=c&state=wrong` });
        let f = fetcher([]);
        let auth = createAuth({ platform: p, config, fetch: f });
        await assert.rejects(auth.signIn(), (e) => e.code === 'auth.state');
        assert.strictEqual(f.calls.length, 0);
        p = platform({ launch: async () => 'https://evil.example/cb?code=c&state=x' });
        auth = createAuth({ platform: p, config, fetch: fetcher([]) });
        await assert.rejects(auth.signIn(), (e) => e.code === 'auth.redirect');
    });

    await check('a cancelled window is auth.cancelled; a redirect error is mapped', async () => {
        let p = platform({ launch: async () => { throw new Error('The user did not approve access.'); } });
        let auth = createAuth({ platform: p, config, fetch: fetcher([]) });
        await assert.rejects(auth.signIn(), (e) => e.code === 'auth.cancelled');
        p = platform({ launch: async (opts) => `${CHROME}?error=access_denied&state=${new URL(opts.url).searchParams.get('state')}` });
        auth = createAuth({ platform: p, config, fetch: fetcher([]) });
        await assert.rejects(auth.signIn(), (e) => e.code === 'auth.cancelled');
    });

    await check('refresh rotates, single-flight, and never sends a secret', async () => {
        const p = platform();
        p.session.set(config.DOCK_ACCESS_KEY, { token: 'old', expires_at: 0, scope: 'dock activity chat.read', sub: 7, username: 'ada' });
        p.local.set(config.DOCK_REFRESH_KEY, { token: 'r1', scope: 'dock activity chat.read', sub: 7, username: 'ada' });
        const f = fetcher([
            { status: 200, body: { access_token: token(), refresh_token: 'r2', expires_in: 3600, scope: 'dock activity chat.read' } },
        ]);
        const auth = createAuth({ platform: p, config, fetch: f });
        const [a, b] = await Promise.all([auth.refresh(), auth.refresh()]);
        assert.strictEqual(a, b, 'both callers get one refreshed access token');
        assert.strictEqual(f.calls.length, 1, 'single-flight');
        assert.strictEqual(f.calls[0].body.grant_type, 'refresh_token');
        assert.strictEqual(f.calls[0].body.refresh_token, 'r1');
        assert.ok(!('client_secret' in f.calls[0].body));
        assert.strictEqual(p.local.get(config.DOCK_REFRESH_KEY).token, 'r2');
    });

    await check('a grant with a scope the extension did not ask for is refused and not stored', async () => {
        const p = platform({ launch: async (opts) => `${CHROME}?code=c&state=${new URL(opts.url).searchParams.get('state')}` });
        const f = fetcher([{ status: 200, body: { access_token: token(), refresh_token: 'r', expires_in: 3600, scope: 'dock coins' } }]);
        const auth = createAuth({ platform: p, config, fetch: f });
        await assert.rejects(auth.signIn(), (e) => e.code === 'auth.scope');
        assert.strictEqual(p.session.get(config.DOCK_ACCESS_KEY), undefined);
    });

    await check('Sign out revokes the refresh token and clears both stores; the pasted token is cleared too', async () => {
        const p = platform({ legacy: 'old-normal-token' });
        p.session.set(config.DOCK_ACCESS_KEY, { token: 'a', expires_at: Date.now() + 3600e3 });
        p.local.set(config.DOCK_REFRESH_KEY, { token: 'r9' });
        p.local.set(config.DOCK_ACCOUNT_KEY, { username: 'ada' });
        const f = fetcher([{ status: 200, body: {} }]);
        const auth = createAuth({ platform: p, config, fetch: f });
        await auth.signOut();
        assert.strictEqual(f.calls.length, 1);
        assert.strictEqual(f.calls[0].url, config.NETWORK_ORIGIN + '/oauth/revoke');
        assert.deepStrictEqual(f.calls[0].body, { client_id: 'companion', token: 'r9' });
        assert.strictEqual(p.session.get(config.DOCK_ACCESS_KEY), undefined);
        assert.strictEqual(p.local.get(config.DOCK_REFRESH_KEY), undefined);
        assert.strictEqual(p.local.get(config.DOCK_ACCOUNT_KEY), undefined);
        assert.strictEqual(p.legacy, null);
    });

    await check('the 0.7.0 pasted token is a fallback and is reported as legacy', async () => {
        const p = platform({ legacy: 'old-normal-token' });
        const auth = createAuth({ platform: p, config, fetch: fetcher([]) });
        assert.strictEqual(await auth.accessToken(), 'old-normal-token');
        assert.deepStrictEqual(await auth.status(), { mode: 'legacy', account: null });
        assert.strictEqual(await auth.scopes(), null);
    });

    done();
})();
