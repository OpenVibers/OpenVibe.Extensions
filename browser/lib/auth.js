/*
 * The Dock's one-click sign-in (OAuth authorization code + PKCE S256, public client `companion`).
 *
 * The extension never holds a client secret. Sign in opens the browser's own auth flow
 * (identity.launchWebAuthFlow) at the Network; the code comes back to the browser-owned extension
 * redirect URL, is exchanged for an access token and a rotating refresh token, and is never put in a
 * page URL we control. The access token lives in storage.session (memory, this browser run); the
 * refresh token lives in storage.local (this device). Sign out revokes the refresh family at the
 * Network before clearing both.
 *
 * The 0.7.0 pasted `networkToken` is still accepted as a fallback until a later release removes it:
 * token() prefers a live OAuth grant and falls back to that string. It is a normal Network session,
 * not this client's scoped token.
 */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.OVAuth = api;
})(typeof self !== 'undefined' ? self : globalThis, function () {
    'use strict';
    const root = typeof self !== 'undefined' ? self : globalThis;

    class AuthError extends Error {
        constructor(code, message) { super(message || code); this.code = code; }
    }

    const enc = new TextEncoder();
    function bytes(n) {
        const out = new Uint8Array(n);
        root.crypto.getRandomValues(out);
        return out;
    }
    function b64url(input) {
        const b = typeof input === 'string' ? enc.encode(input) : new Uint8Array(input);
        let s = '';
        for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
        return root.btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    }
    async function challengeFor(verifier) {
        const digest = await root.crypto.subtle.digest('SHA-256', enc.encode(verifier));
        return b64url(digest);
    }
    function decodePayload(token) {
        const parts = String(token || '').split('.');
        if (parts.length !== 3) return null;
        try {
            const b = parts[1].replace(/-/g, '+').replace(/_/g, '/');
            return JSON.parse(root.atob(b + '='.repeat((4 - b.length % 4) % 4)));
        } catch { return null; }
    }
    const scopeList = (v) => String(v || '').split(/\s+/).filter(Boolean);
    const subset = (a, b) => a.every((s) => b.includes(s));

    function createAuth(opts) {
        const platform = opts.platform;
        const config = opts.config;
        const doFetch = opts.fetch || root.fetch.bind(root);
        const now = opts.now || (() => Date.now());
        const pending = new Map();
        let refreshing = null;

        const err = (code, message) => new AuthError(code, message);

        async function getAccess() {
            const acc = await platform.storage.getSession(config.DOCK_ACCESS_KEY);
            return acc && typeof acc.token === 'string' ? acc : null;
        }
        async function getRefresh() {
            const r = await platform.storage.getLocal(config.DOCK_REFRESH_KEY);
            return r && typeof r.token === 'string' ? r : null;
        }
        async function getAccount() {
            const a = await platform.storage.getLocal(config.DOCK_ACCOUNT_KEY);
            return a && typeof a === 'object' ? a : null;
        }
        async function legacy() {
            return await platform.storage.getNetworkToken();
        }

        function storeGrant(body, requested) {
            const scope = String(body.scope || '');
            const scopes = scopeList(scope);
            if (requested && !subset(scopes, requested)) throw err('auth.scope', 'the Network granted a scope this extension did not ask for');
            const claims = decodePayload(body.access_token) || {};
            const account = { sub: claims.sub || null, username: claims.username || null, display_name: claims.display_name || null };
            const access = { token: body.access_token, expires_at: now() + (Number(body.expires_in) || 3600) * 1000, scope, ...account };
            const refresh = { token: body.refresh_token, scope, ...account };
            return Promise.resolve()
                .then(() => platform.storage.setSession({ [config.DOCK_ACCESS_KEY]: access }))
                .then(() => platform.storage.setLocal({ [config.DOCK_REFRESH_KEY]: refresh, [config.DOCK_ACCOUNT_KEY]: account }))
                .then(() => access);
        }

        async function postToken(params) {
            let res;
            try {
                res = await doFetch(config.NETWORK_ORIGIN + '/oauth/token', {
                    method: 'POST',
                    headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
                    body: new URLSearchParams(params).toString(),
                    credentials: 'omit',
                    referrerPolicy: 'no-referrer',
                });
            } catch {
                throw err('auth.network', 'could not reach OpenVibe.Network');
            }
            const body = await res.json().catch(() => ({}));
            if (!res.ok) throw err(body.error || `auth.http_${res.status}`, body.error_description);
            if (!body.access_token || !body.refresh_token) throw err('auth.invalid', 'the Network did not return a token pair');
            return body;
        }

        function parseRedirect(finalUrl, state, redirectUri) {
            let got;
            let want;
            try { got = new URL(String(finalUrl)); want = new URL(redirectUri); } catch { throw err('auth.redirect', 'the sign-in returned an address this extension cannot read'); }
            if (got.origin !== want.origin || got.pathname !== want.pathname) throw err('auth.redirect', 'the sign-in returned to an address that is not this extension');
            if (got.searchParams.get('state') !== state) throw err('auth.state', 'the sign-in state did not match');
            const error = got.searchParams.get('error');
            if (error) {
                const code = error === 'access_denied' ? 'auth.cancelled'
                    : error === 'login_required' ? 'auth.login_required'
                        : error === 'invalid_scope' ? 'auth.scope' : 'auth.server';
                throw err(code, got.searchParams.get('error_description') || error);
            }
            const code = got.searchParams.get('code');
            if (!code) throw err('auth.invalid', 'the sign-in returned no code');
            return code;
        }

        async function signIn({ interactive = true } = {}) {
            let redirectUri;
            try { redirectUri = platform.identity.getRedirectURL(); } catch { throw err('auth.redirect', 'this browser cannot start the sign-in'); }
            if (!config.OAUTH_REDIRECT_URIS.includes(redirectUri)) throw err('auth.redirect', 'this build’s redirect URL is not registered with OpenVibe.Network');
            const verifier = b64url(bytes(32));
            const state = b64url(bytes(32));
            const url = new URL(config.NETWORK_ORIGIN + '/oauth/authorize');
            url.searchParams.set('client_id', config.OAUTH_CLIENT_ID);
            url.searchParams.set('redirect_uri', redirectUri);
            url.searchParams.set('response_type', 'code');
            url.searchParams.set('scope', config.OAUTH_SCOPES.join(' '));
            url.searchParams.set('state', state);
            url.searchParams.set('code_challenge', await challengeFor(verifier));
            url.searchParams.set('code_challenge_method', 'S256');
            pending.set(state, { verifier, redirectUri, at: now() });
            // A stale flow from a closed panel cannot be redeemed; prune.
            for (const [k, v] of pending) if (now() - v.at > 10 * 60 * 1000) pending.delete(k);

            let finalUrl;
            try {
                finalUrl = await platform.identity.launchWebAuthFlow({ url: url.toString(), interactive });
            } catch (e) {
                pending.delete(state);
                const m = String(e && e.message || '');
                if (/cancel|did not approve|closed/i.test(m)) throw err('auth.cancelled', 'sign-in was cancelled');
                throw err('auth.network', 'the sign-in window could not be opened');
            }
            const saved = pending.get(state);
            pending.delete(state);
            if (!saved) throw err('auth.state', 'the sign-in state was lost');
            if (!finalUrl) throw err('auth.cancelled', 'sign-in was cancelled');
            const code = parseRedirect(finalUrl, state, redirectUri);
            const body = await postToken({
                grant_type: 'authorization_code',
                client_id: config.OAUTH_CLIENT_ID,
                code,
                redirect_uri: redirectUri,
                code_verifier: verifier,
            });
            return await storeGrant(body, config.OAUTH_SCOPES);
        }

        async function refresh() {
            if (refreshing) return refreshing;
            refreshing = (async () => {
                const saved = await getRefresh();
                if (!saved) throw err('auth.required', 'sign in to OpenVibe.Network');
                try {
                    const body = await postToken({ grant_type: 'refresh_token', client_id: config.OAUTH_CLIENT_ID, refresh_token: saved.token });
                    return (await storeGrant(body, config.OAUTH_SCOPES)).token;
                } catch (e) {
                    // Two panels of one extension can refresh at once. The Network refuses the loser
                    // inside its 10 s grace without revoking the family; if the other panel wrote the new
                    // token, use it. A real invalid_grant means sign in again.
                    if (e.code === 'invalid_grant') {
                        const again = await getRefresh();
                        if (again && again.token !== saved.token) {
                            const acc = await getAccess();
                            if (acc) return acc.token;
                        }
                        await clearOAuth();
                        throw err('auth.required', 'sign in to OpenVibe.Network again');
                    }
                    throw e;
                }
            })().finally(() => { refreshing = null; });
            return refreshing;
        }

        async function accessToken() {
            const acc = await getAccess();
            if (acc && acc.expires_at > now() + 60_000) return acc.token;
            try {
                return await refresh();
            } catch (e) {
                // 0.7.0 compatibility: a pasted normal Network token still works until a later release.
                const old = await legacy();
                if (old) return old;
                throw e;
            }
        }

        async function clearOAuth() {
            await Promise.all([
                platform.storage.removeSession([config.DOCK_ACCESS_KEY]),
                platform.storage.removeLocal([config.DOCK_REFRESH_KEY, config.DOCK_ACCOUNT_KEY]),
            ]);
        }

        async function signOut() {
            const saved = await getRefresh();
            if (saved) {
                try {
                    await doFetch(config.NETWORK_ORIGIN + '/oauth/revoke', {
                        method: 'POST',
                        headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
                        body: new URLSearchParams({ client_id: config.OAUTH_CLIENT_ID, token: saved.token }).toString(),
                        credentials: 'omit',
                        referrerPolicy: 'no-referrer',
                    });
                } catch { /* clear locally anyway; the account page can revoke */ }
            }
            pending.clear();
            await clearOAuth();
            await platform.storage.clearNetworkToken();
        }

        async function status() {
            const [acc, ref, old] = await Promise.all([getAccess(), getRefresh(), legacy()]);
            if (acc || ref) return { mode: 'oauth', account: await getAccount() };
            if (old) return { mode: 'legacy', account: null };
            return { mode: 'none', account: null };
        }

        async function scopes() {
            const acc = await getAccess();
            if (acc && acc.scope) return scopeList(acc.scope);
            const ref = await getRefresh();
            if (ref && ref.scope) return scopeList(ref.scope);
            return null; // legacy string: a full session, let the Dock show its normal controls
        }

        return { signIn, refresh, accessToken, token: accessToken, signOut, status, scopes, account: getAccount, clear: clearOAuth, AuthError };
    }

    return { createAuth, AuthError, _b64url: b64url, _challengeFor: challengeFor, _decodePayload: decodePayload };
});
