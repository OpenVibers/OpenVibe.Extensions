/*
 * The OpenVibe.Mail client the Companion uses: the person's masks, with their own sign-in as a
 * Bearer token, and never a cookie.
 *
 *   const mail = createMailClient({ origin, fetch, getToken });
 *   await mail.masks()                          GET  /api/v1/masks            → { masks }
 *   await mail.createMask(label, purpose)       POST /api/v1/masks            → { mask }
 *   await mail.disableMask(id)                  POST /api/v1/masks/:id/disable → { mask }
 *
 * What it sends: a label (the site's name), a purpose, a mask id, and the person's Bearer token.
 * Never a cookie (credentials: 'omit'), never a Referer, never a page URL.
 */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.OVMail = api;
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    class MailError extends Error {
        constructor(status, code, detail) {
            super(detail || code || ('HTTP ' + status));
            this.name = 'MailError';
            this.status = status;
            this.code = code || null;
        }
    }

    function createMailClient(opts) {
        const origin = String(opts.origin || '').replace(/\/+$/, '');
        if (!/^https:\/\/[a-z0-9.-]+$/.test(origin) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
            throw new TypeError('origin must be an https origin (http only for localhost development)');
        }
        const doFetch = opts.fetch;
        const getToken = opts.getToken || (async function () { return null; });
        const timeoutMs = opts.timeoutMs || 8000;

        async function request(method, path, body) {
            const token = await getToken();
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
                throw new MailError(0, err && err.name === 'AbortError' ? 'network.timeout' : 'network.error', 'could not reach OpenVibe.Mail');
            } finally {
                if (timer) clearTimeout(timer);
            }
            let data = null;
            try { data = await res.json(); } catch (e) { data = null; }
            if (!res.ok) throw new MailError(res.status, data && data.code, data && (data.detail || data.error));
            return data;
        }

        return {
            origin: origin,
            /** The person's masks. */
            async masks() {
                const out = await request('GET', '/api/v1/masks');
                return (out && out.masks) || [];
            },
            /** A mask for the person, labelled with the site. */
            async createMask(label, purpose) {
                const body = { label: String(label == null ? '' : label).slice(0, 120) };
                if (purpose) body.purpose = String(purpose).slice(0, 120);
                const out = await request('POST', '/api/v1/masks', body);
                return out && out.mask;
            },
            /** Turn a mask off: it bounces from then on. */
            async disableMask(id) {
                const out = await request('POST', '/api/v1/masks/' + encodeURIComponent(String(id || '')) + '/disable');
                return out && out.mask;
            },
        };
    }

    return { createMailClient, MailError };
});
