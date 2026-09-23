/*
 * The OpenVibe.Coupons public API client — the only code in the extension that makes requests.
 *
 *   const api = createApiClient({ origin, fetch, getToken });
 *   await api.resolve('shop.example.com')      GET  /api/v1/merchants/resolve?host=…   → merchant | null
 *   await api.coupons('mer_…')                 GET  /api/v1/merchants/:id/coupons      → { merchant, coupons }
 *   await api.report('cpn_…', 'worked')        POST /api/v1/coupons/:id/report         (needs a token)
 *   await api.check(token)                     is this install token accepted? (a lookup with it)
 *
 * What it sends: a hostname, a merchant id, a code id, "worked"/"failed" (+ an optional reason),
 * and — only if you connected the extension — your cpx_ install token. Never cookies
 * (credentials: 'omit'), never a Referer (referrerPolicy: 'no-referrer'), never a page URL.
 */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.OVApi = api;
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';
    const MERCHANT_RE = /^mer_[0-9A-HJKMNP-TV-Z]{26}$/;
    const COUPON_RE = /^cpn_[0-9A-HJKMNP-TV-Z]{26}$/;
    const HOST_RE = /^[a-z0-9.-]{3,253}$/;
    const TOKEN_RE = /^cpx_[A-Za-z0-9_-]{43}$/;
    const OUTCOMES = ['worked', 'failed'];
    const REASONS = ['invalid', 'expired', 'min_spend_not_met', 'not_eligible', 'other'];

    class ApiError extends Error {
        constructor(status, code, detail) {
            super(detail || code || ('HTTP ' + status));
            this.name = 'ApiError';
            this.status = status;
            this.code = code || null;
        }
    }

    function createApiClient(opts) {
        const origin = String(opts.origin || '').replace(/\/+$/, '');
        if (!/^https:\/\/[a-z0-9.-]+$/.test(origin) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
            throw new TypeError('origin must be an https origin (http only for localhost development)');
        }
        const doFetch = opts.fetch;
        const getToken = opts.getToken || (async function () { return null; });
        const timeoutMs = opts.timeoutMs || 8000;

        async function request(method, path, { body = null, token } = {}) {
            const headers = { Accept: 'application/json' };
            const t = token === undefined ? await getToken() : token;
            if (t) {
                if (!TOKEN_RE.test(t)) throw new ApiError(0, 'token.malformed', 'the saved token is not a cpx_ token');
                headers.Authorization = 'Bearer ' + t;
            }
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
                    redirect: 'error',
                    signal: ctrl ? ctrl.signal : undefined,
                });
            } catch (err) {
                throw new ApiError(0, err && err.name === 'AbortError' ? 'network.timeout' : 'network.error', 'could not reach OpenVibe.Coupons');
            } finally {
                if (timer) clearTimeout(timer);
            }
            let data = null;
            try { data = await res.json(); } catch (e) { data = null; }
            if (!res.ok) throw new ApiError(res.status, data && data.code, data && (data.detail || data.error));
            return data;
        }

        return {
            async resolve(hostname) {
                if (!HOST_RE.test(String(hostname || ''))) throw new TypeError('a hostname is required');
                try {
                    const out = await request('GET', '/api/v1/merchants/resolve?host=' + encodeURIComponent(hostname));
                    return out && out.merchant ? out.merchant : null;
                } catch (err) {
                    if (err.status === 404) return null;
                    throw err;
                }
            },
            async coupons(merchantId) {
                if (!MERCHANT_RE.test(String(merchantId || ''))) throw new TypeError('a merchant id is required');
                return request('GET', '/api/v1/merchants/' + merchantId + '/coupons');
            },
            async report(couponId, outcome, reason) {
                if (!COUPON_RE.test(String(couponId || ''))) throw new TypeError('a code id is required');
                if (OUTCOMES.indexOf(outcome) === -1) throw new TypeError('outcome must be worked or failed');
                const body = { outcome: outcome };
                if (outcome === 'failed' && reason && REASONS.indexOf(reason) !== -1) body.reason = reason;
                const token = await getToken();
                if (!token) throw new ApiError(401, 'auth.required', 'connect the extension to report');
                return request('POST', '/api/v1/coupons/' + couponId + '/report', { body: body, token: token });
            },
            /** true when the token is accepted, false when it is refused (401/403); throws on other errors. */
            async check(token) {
                if (!TOKEN_RE.test(String(token || ''))) return false;
                try {
                    await request('GET', '/api/v1/merchants/resolve?host=openvibe.coupons', { token: token });
                    return true;
                } catch (err) {
                    if (err.status === 404) return true;
                    if (err.status === 401 || err.status === 403) return false;
                    throw err;
                }
            },
        };
    }

    return { createApiClient, ApiError, TOKEN_RE, OUTCOMES, REASONS };
});
