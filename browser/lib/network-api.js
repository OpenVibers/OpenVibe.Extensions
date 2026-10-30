/*
 * The OpenVibe.Network client the side panel uses: the person's Dock state (GET and PUT
 * /api/v1/me/dock) with their own sign-in as a Bearer token, and never a cookie.
 *
 *   const net = createNetworkClient({ origin, fetch, getToken });
 *   await net.dock()        → { state, counts }
 *   await net.saveDock(p)   → { state, counts }
 *   await net.check(token)  → is this sign-in accepted?
 */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.OVNetwork = api;
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    function createNetworkClient(opts) {
        const origin = String(opts.origin || '').replace(/\/+$/, '');
        if (!/^https:\/\/[a-z0-9.-]+$/.test(origin) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
            throw new TypeError('origin must be an https origin (http only for localhost development)');
        }
        const doFetch = opts.fetch;
        const getToken = opts.getToken || async function () { return null; };
        const timeoutMs = opts.timeoutMs || 8000;

        async function request(method, path, body, tokenOverride) {
            const token = tokenOverride === undefined ? await getToken() : tokenOverride;
            const headers = { Accept: 'application/json' };
            if (token) headers.Authorization = 'Bearer ' + token;
            if (body) headers['Content-Type'] = 'application/json';
            const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
            const timer = ctrl ? setTimeout(function () { ctrl.abort(); }, timeoutMs) : null;
            let res;
            try {
                res = await doFetch(origin + path, {
                    method: method,
                    headers: headers,
                    body: body ? JSON.stringify(body) : undefined,
                    credentials: 'omit',
                    referrerPolicy: 'no-referrer',
                    signal: ctrl ? ctrl.signal : undefined,
                });
            } catch (err) {
                throw new Error('could not reach OpenVibe.Network');
            } finally {
                if (timer) clearTimeout(timer);
            }
            if (res.status === 401 || res.status === 403) throw new Error('OpenVibe.Network refused that sign-in');
            if (!res.ok) throw new Error('OpenVibe.Network answered ' + res.status);
            return res.json();
        }

        return {
            origin: origin,
            /** The person's Dock state, as the Network has it. */
            async dock() { return request('GET', '/api/v1/me/dock'); },
            /** The Dock's state, as the Network keeps it. */
            async saveDock(patch) { return request('PUT', '/api/v1/me/dock', patch); },
            /** Is this sign-in accepted? (the settings page asks before it saves one) */
            async check(token) {
                const res = await request('GET', '/api/v1/me/dock', null, token);
                return !!(res && res.state);
            },
        };
    }

    return { createNetworkClient: createNetworkClient };
});
