/*
 * OpenVibe Coupons Helper — configuration.
 *
 * API_ORIGIN is the ONLY origin this extension ever talks to. It must match the manifest's
 * host_permissions and the connect-src of its CSP; scripts/pack.js rewrites all three together for
 * a development build (--api http://localhost:4850) and test/manifest.test.js checks they agree.
 */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.OVConfig = api;
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';
    return Object.freeze({
        API_ORIGIN: 'https://openvibe.coupons',
        CONNECT_PATH: '/connect-extension',
        TOKEN_KEY: 'installToken',
        TOKEN_RE: /^cpx_[A-Za-z0-9_-]{43}$/,
        TIMEOUT_MS: 8000,
    });
});
