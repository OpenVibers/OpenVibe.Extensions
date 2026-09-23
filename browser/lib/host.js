/*
 * The one thing the helper reads from the page you are on: the HOSTNAME of the active tab's URL.
 *
 *   hostnameOf('https://Shop.Example.com:8443/checkout?email=a@b.c#pay')  → 'shop.example.com'
 *
 * Path, query, fragment, port and credentials are dropped here, before anything else sees the
 * URL. Non-web pages (browser settings, files, other extensions), IP addresses and local names are
 * not shops: null.
 */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.OVHost = api;
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';
    const LOCAL = /(^|\.)(localhost|local|internal|invalid|test|example|arpa|lan|home)$/;

    function hostnameOf(url) {
        if (typeof url !== 'string' || !url) return null;
        let u;
        try { u = new URL(url); } catch (e) { return null; }
        if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
        const host = u.hostname.toLowerCase().replace(/\.$/, '');
        if (!host || host.indexOf('.') === -1) return null;
        if (host.charAt(0) === '[' || /^[0-9.]+$/.test(host)) return null;
        if (LOCAL.test(host)) return null;
        return host;
    }

    return { hostnameOf };
});
