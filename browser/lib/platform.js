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
 *   storage.getNetworkToken/setNetworkToken/clearNetworkToken
 *                           the person's OpenVibe sign-in for the Dock in the side panel, also in
 *                           storage.local
 *   permissions.hasApi/requestApi          the host permission for the API origin (Firefox
 *                           lets people withhold it; reporting needs it)
 *   scripting.tryCodes(tabId, codes)       when the person presses "Try these codes on this page": inject
 *                           lib/autoapply.js into that tab (activeTab grants it for this one tab, after
 *                           that click) and run it with the codes; returns what it saw
 *   scripting.readRating(tabId)            when the person presses "Save its rating to OpenVibe Reviews" on a review
 *                           site: inject lib/rating.js the same way and return the rating the page states
 *   scripting.readListing(tabId)           when the person presses "Keep on my Rent board" or "Check the rent": inject
 *                           lib/listing.js the same way and return the price, city and bedrooms the page states
 *
 * Nothing else: no cookies, no history, and the page is touched only by that one button.
 */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.OVPlatform = api;
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    function createPlatform(ext, config) {
        const origins = [config.API_ORIGIN + '/*', config.NETWORK_ORIGIN + '/*', config.CHAT_ORIGIN + '/*'];
        const call = function (fn, thisArg, args) {
            // chrome.* in MV3 and browser.* both return promises.
            return fn.apply(thisArg, args);
        };
        return {
            tabs: {
                async active() {
                    const tabs = await call(ext.tabs.query, ext.tabs, [{ active: true, currentWindow: true }]);
                    const t = tabs && tabs[0];
                    return { id: t && Number.isInteger(t.id) ? t.id : null, url: t && typeof t.url === 'string' ? t.url : null, title: t && typeof t.title === 'string' ? t.title : '' };
                },
                async open(url) {
                    const ok = typeof url === 'string' && config.HANDOFF_ORIGINS.some(function (o) { return url.indexOf(o + '/') === 0; });
                    if (!ok) throw new TypeError('not an OpenVibe hand-off page');
                    await call(ext.tabs.create, ext.tabs, [{ url: url }]);
                },
            },
            scripting: {
                async tryCodes(tabId, codes) {
                    if (!ext.scripting || !Number.isInteger(tabId)) throw new TypeError('this browser cannot run the code tester');
                    const list = (Array.isArray(codes) ? codes : []).slice(0, config.MAX_TRIES).map(function (c) { return { id: String(c.id || ''), code: String(c.code || '') }; });
                    await call(ext.scripting.executeScript, ext.scripting, [{ target: { tabId: tabId }, files: ['lib/autoapply.js'] }]);
                    const out = await call(ext.scripting.executeScript, ext.scripting, [{
                        target: { tabId: tabId },
                        func: function (c) { return self.OVAutoApply.run(c); },
                        args: [list],
                    }]);
                    return out && out[0] ? out[0].result : null;
                },
                async readRating(tabId) {
                    if (!ext.scripting || !Number.isInteger(tabId)) throw new TypeError('this browser cannot read the page');
                    await call(ext.scripting.executeScript, ext.scripting, [{ target: { tabId: tabId }, files: ['lib/rating.js'] }]);
                    const out = await call(ext.scripting.executeScript, ext.scripting, [{ target: { tabId: tabId }, func: function () { return self.OVRating.read(document); } }]);
                    return out && out[0] ? out[0].result : null;
                },
                async readListing(tabId) {
                    if (!ext.scripting || !Number.isInteger(tabId)) throw new TypeError('this browser cannot read the page');
                    await call(ext.scripting.executeScript, ext.scripting, [{ target: { tabId: tabId }, files: ['lib/listing.js'] }]);
                    const out = await call(ext.scripting.executeScript, ext.scripting, [{ target: { tabId: tabId }, func: function () { return self.OVListing.read(document); } }]);
                    return out && out[0] ? out[0].result : null;
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
                // The person's own OpenVibe sign-in, for the Dock in the side panel. It is the Network's own
                // token (the one every OpenVibe site uses), not a new kind of credential, and it stays on
                // this device like the install token.
                async getNetworkToken() {
                    const out = await call(ext.storage.local.get, ext.storage.local, [config.NETWORK_TOKEN_KEY]);
                    const t = out && out[config.NETWORK_TOKEN_KEY];
                    return typeof t === 'string' && t.length >= 20 ? t : null;
                },
                async setNetworkToken(token) {
                    if (typeof token !== 'string' || token.length < 20) throw new TypeError('that is not an OpenVibe.Network token');
                    const o = {};
                    o[config.NETWORK_TOKEN_KEY] = token;
                    await call(ext.storage.local.set, ext.storage.local, [o]);
                },
                async clearNetworkToken() { await call(ext.storage.local.remove, ext.storage.local, [config.NETWORK_TOKEN_KEY]); },
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
