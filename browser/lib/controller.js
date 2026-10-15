/*
 * The popup's logic, without the DOM (so Node tests can drive it):
 *
 *   const c = createController({ api, platform, host, handoff });
 *   const vm = await c.open();          // the codes for the active tab's shop
 *   c.page()                            // { handoff, rental }: which buttons to offer
 *   await c.keepOnBoard()               // open the Rent board with this page (a new tab)
 *   await c.watchPage()                 // open a new Watch for this page (a new tab)
 *   await c.report(couponId, 'worked')  // → { ok, message }
 *
 * open() reads the active tab's URL and title once. Only the hostname (host.hostnameOf) is sent
 * anywhere: to the Coupons API, to say which shop that is. The URL and title stay in this closure
 * for the two hand-offs, which open a tab on openvibe.rent or openvibe.watch only when the person
 * presses their button (lib/handoff.js cleans the URL first).
 *
 * View models:
 *   { state: 'not_a_site' }                                   browser pages, files, IPs, local names
 *   { state: 'no_merchant', host }
 *   { state: 'merchant', host, merchant, coupons, connected }
 *   { state: 'error', host, message, code }
 */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.OVController = api;
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    function messageFor(err) {
        const code = err && err.code;
        if (code === 'token.revoked') return 'This browser was disconnected on openvibe.coupons. Connect it again in the settings.';
        if (code === 'token.expired') return 'The saved token expired. Connect the extension again in the settings.';
        if (code === 'token.invalid' || code === 'token.malformed') return 'The saved token is not valid. Connect the extension again in the settings.';
        if (code === 'token.scope') return 'This token cannot report. Create one with reporting allowed on openvibe.coupons.';
        if (code === 'auth.required') return 'Connect the extension in the settings to report.';
        if (code === 'report.rate_limited' || code === 'lookup.rate_limited' || (err && err.status === 429)) return 'Too many requests right now. Try again in a minute.';
        if (code === 'coupon.not_active') return 'This code is no longer in active results.';
        if (code === 'report.own_submission') return 'You can’t report on a code you submitted.';
        if (code === 'network.timeout' || code === 'network.error') return 'Could not reach OpenVibe.Coupons.';
        return 'Something went wrong. Try again later.';
    }

    function createController(deps) {
        const api = deps.api;
        const platform = deps.platform;
        const host = deps.host;
        const handoff = deps.handoff || null;
        let tab = { url: null, title: '' };

        async function handOff(build) {
            const target = handoff && build(tab.url, tab.title);
            if (!target) return { ok: false, message: 'This page cannot be sent there.' };
            await platform.tabs.open(target);
            return { ok: true };
        }

        return {
            async open() {
                tab = await platform.tabs.active();
                const url = tab.url;
                const hostname = host.hostnameOf(url);
                if (!hostname) return { state: 'not_a_site' };
                const connected = Boolean(await platform.storage.getToken());
                try {
                    const merchant = await api.resolve(hostname);
                    if (!merchant) return { state: 'no_merchant', host: hostname };
                    const out = await api.coupons(merchant.id);
                    return { state: 'merchant', host: hostname, merchant: out.merchant, coupons: out.coupons || [], connected: connected };
                } catch (err) {
                    return { state: 'error', host: hostname, message: messageFor(err), code: (err && err.code) || null };
                }
            },

            /** Which hand-offs make sense for this page: any web page can go to the board or a watch; a rental site leads with the board. */
            page() {
                const ok = Boolean(handoff && host.hostnameOf(tab.url) && handoff.boardUrl(tab.url, tab.title));
                return { handoff: ok, rental: ok && deps.isRental ? deps.isRental(tab.url) : false };
            },

            keepOnBoard() { return handOff(function (u, t) { return handoff.boardUrl(u, t); }); },
            watchPage() { return handOff(function (u, t) { return handoff.watchUrl(u, t); }); },

            async report(couponId, outcome, reason) {
                try {
                    const out = await api.report(couponId, outcome, reason);
                    const msg = out && out.deduplicated ? (out.corrected ? 'Your report for today was updated.' : 'You already reported this today.') : 'Thanks — your report was recorded.';
                    return { ok: true, message: msg, coupon: out && out.coupon };
                } catch (err) {
                    return { ok: false, message: messageFor(err), code: (err && err.code) || null };
                }
            },
        };
    }

    return { createController, messageFor };
});
