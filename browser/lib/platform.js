/*
 * The browser APIs the helper uses, in one place (Chromium `chrome.*` and Firefox `browser.*`):
 *
 *   tabs.activeUrl()        the active tab's URL — available because the user opened the popup
 *                           (activeTab); handed straight to host.hostnameOf and dropped
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
                async activeUrl() {
                    const tabs = await call(ext.tabs.query, ext.tabs, [{ active: true, currentWindow: true }]);
                    return tabs && tabs[0] && typeof tabs[0].url === 'string' ? tabs[0].url : null;
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
