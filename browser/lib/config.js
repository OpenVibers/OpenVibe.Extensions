/*
 * OpenVibe Companion — configuration.
 *
 * API_ORIGIN is the ONLY origin this extension ever sends a request to. It must match the manifest's
 * host_permissions and the connect-src of its CSP; scripts/pack.js rewrites all three together for
 * a development build (--api http://localhost:4850) and test/manifest.test.js checks they agree.
 *
 * HANDOFF_ORIGINS are the sites the Companion may open a tab on when you press one of its buttons
 * (lib/handoff.js): the Rent board and a new Watch. It sends them nothing itself; the address of the
 * tab it opens carries the page you were on, and you see it.
 */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.OVConfig = api;
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';
    return Object.freeze({
        API_ORIGIN: 'https://openvibe.coupons',
        RENT_ORIGIN: 'https://openvibe.rent',
        WATCH_ORIGIN: 'https://openvibe.watch',
        HANDOFF_ORIGINS: Object.freeze(['https://openvibe.rent', 'https://openvibe.watch']),
        CONNECT_PATH: '/connect-extension',
        TOKEN_KEY: 'installToken',
        TOKEN_RE: /^cpx_[A-Za-z0-9_-]{43}$/,
        TIMEOUT_MS: 8000,
    });
});
