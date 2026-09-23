/*
 * The popup's logic, without the DOM (so Node tests can drive it):
 *
 *   const c = createController({ api, platform, host });
 *   const vm = await c.open();          // what to show for the active tab
 *   await c.report(couponId, 'worked')  // → { ok, message }
 *
 * open() reads the active tab's URL once, keeps only its hostname (host.hostnameOf), and asks the
 * API which shop that is and which codes it has. That hostname is the only thing about the page
 * that ever leaves the browser.
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

        return {
            async open() {
                const url = await platform.tabs.activeUrl();
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
