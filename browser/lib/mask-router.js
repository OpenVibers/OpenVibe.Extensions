/*
 * Who may ask the Companion for what.
 *
 * This is the message boundary, kept apart from the browser so it can be read and tested on its own
 * (test/mask.test.js). The background worker (background.js) hands it the sender of every message;
 * it answers with what that sender is allowed to have.
 *
 *   a page (a message with a tab behind it)   may ask for an offer and for an address, and nothing
 *                                              else. The site is the tab's own address, never the
 *                                              page's word for it.
 *   one of our own pages (the popup)          may ask for the masks of a site, turn one off, and
 *                                              set the per-site switch.
 *   anything else                             is refused.
 *
 * The page never learns anything but an address and the words that go with it: the person's token
 * stays in the worker.
 */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.OVMaskRouter = api;
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    function createRouter(opts) {
        const rules = opts.rules;
        const service = opts.service;
        // isOwnPage(sender): is this one of the Companion's own pages (the popup)?
        const isOwnPage = opts.isOwnPage || function () { return false; };

        /** The site of the page that is talking to us: the tab's own address, not the page's word. */
        function siteOf(sender) {
            const url = (sender && (sender.url || (sender.tab && sender.tab.url))) || '';
            let host = '';
            try { host = new URL(url).hostname; } catch (e) { host = ''; }
            return rules.siteLabel(host);
        }

        async function handle(message, sender) {
            const m = message || {};
            // A page may ask for an offer and for an address. Nothing else.
            if (sender && sender.tab) {
                const site = siteOf(sender);
                if (m.type === 'mask:offer') return service.offer(site);
                if (m.type === 'mask:fill') return service.fill(site);
                return { ok: false };
            }
            // Our own pages may list, turn off and mute.
            if (isOwnPage(sender)) {
                const site = rules.siteLabel(m.site);
                if (m.type === 'mask:list') {
                    const masks = await service.masks(site);
                    const muted = (await service.mutedSites()).indexOf(site) !== -1;
                    return { site: site, signedOut: !!masks.signedOut, masks: masks.masks || [], muted: muted };
                }
                if (m.type === 'mask:disable') return service.disable(m.id);
                if (m.type === 'mask:mute') return service.mute(site);
                if (m.type === 'mask:unmute') return service.unmute(site);
                return { ok: false };
            }
            return { ok: false };
        }

        return { handle, siteOf };
    }

    return { createRouter };
});
