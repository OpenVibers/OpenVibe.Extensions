/*
 * The browser APIs the Companion uses, in one place (Chromium `chrome.*` and Firefox `browser.*`):
 *
 *   tabs.active()           the active tab's URL and title — available because the user opened the
 *                           popup (activeTab); the controller sends only the hostname anywhere, and
 *                           keeps the rest for a hand-off the person may press
 *   tabs.open(url)          open a new tab on one of config.HANDOFF_ORIGINS (and nowhere else) —
 *                           tabs.create needs no permission
 *   storage.getToken/setToken/clearToken   the optional cpx_ install token, in storage.local
 *                           (never storage.sync: it stays on this device)
 *   permissions.hasApi/requestApi          the host permission for the API origin (Firefox
 *                           lets people withhold it; reporting needs it)
 *
 * Nothing else: no cookies, no scripting, no history, no page access.
 */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.OVPlatform = api;
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    function createPlatform(ext, config) {
        const origins = [config.API_ORIGIN + '/*'];
        const call = function (fn, thisArg, args) {
            // chrome.* in MV3 and browser.* both return promises.
            return fn.apply(thisArg, args);
        };
        return {
            tabs: {
                async active() {
                    const tabs = await call(ext.tabs.query, ext.tabs, [{ active: true, currentWindow: true }]);
                    const t = tabs && tabs[0];
                    return { url: t && typeof t.url === 'string' ? t.url : null, title: t && typeof t.title === 'string' ? t.title : '' };
                },
                async open(url) {
                    const ok = typeof url === 'string' && config.HANDOFF_ORIGINS.some(function (o) { return url.indexOf(o + '/') === 0; });
                    if (!ok) throw new TypeError('not an OpenVibe hand-off page');
                    await call(ext.tabs.create, ext.tabs, [{ url: url }]);
                },
            },
            storage: {
                async getToken() {
                    const out = await call(ext.storage.local.get, ext.storage.local, [config.TOKEN_KEY]);
                    const t = out && out[config.TOKEN_KEY];
                    return typeof t === 'string' && config.TOKEN_RE.test(t) ? t : null;
                },
                async setToken(token) {
                    if (!config.TOKEN_RE.test(String(token || ''))) throw new TypeError('not a cpx_ token');
                    const o = {};
                    o[config.TOKEN_KEY] = token;
                    await call(ext.storage.local.set, ext.storage.local, [o]);
                },
                async clearToken() { await call(ext.storage.local.remove, ext.storage.local, [config.TOKEN_KEY]); },
            },
            permissions: {
                async hasApi() {
                    if (!ext.permissions || !ext.permissions.contains) return true;
                    return call(ext.permissions.contains, ext.permissions, [{ origins: origins }]);
                },
                async requestApi() {
                    if (!ext.permissions || !ext.permissions.request) return true;
                    return call(ext.permissions.request, ext.permissions, [{ origins: origins }]);
                },
            },
        };
    }

    return { createPlatform };
});
