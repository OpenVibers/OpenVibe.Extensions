/*
 * The Companion's mask service: when a mask may be offered on a site, which address that site
 * gets, and what the person is told.
 *
 * It has no DOM and no browser API of its own: it is given the person's sign-in, the OpenVibe.Mail
 * client and the place the muted sites are kept, and it answers questions. The background worker
 * (background.js) wires it to the browser; the tests (test/mask.test.js) wire it to fakes.
 *
 * The rules it follows:
 *
 *   - a mask is never offered on an openvibe.* site: the person is already ours there
 *   - a site the person muted ("don't offer here") is never offered one either
 *   - no mask is created until the person presses the button: this service creates one only when
 *     it is asked to fill a field
 *   - the site that already has a mask keeps it: a second mask for the same site is never made
 *   - the page is told an address and the words that go with it, never the person's token
 */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.OVMaskService = api;
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const MUTED_MESSAGE = 'You turned masks off for this site.';
    const SIGNOUT_MESSAGE = 'Sign in to use masks: open the Companion and sign in.';
    const PURPOSE = 'companion';

    function createMaskService(opts) {
        const rules = opts.rules;
        const auth = opts.auth;
        const mail = opts.mail;
        const storage = opts.storage;
        const scope = opts.scope;
        const muteKey = opts.muteKey;

        /** The sites the person asked not to be offered a mask on. */
        async function mutedSites() {
            const raw = await storage.getLocal(muteKey);
            return Array.isArray(raw) ? raw : [];
        }

        /** Signed in, and holding the scope OpenVibe.Mail asks for. */
        async function signedIn() {
            let status = null;
            try { status = await auth.status(); } catch (e) { status = null; }
            if (!status || status.mode === 'none') return false;
            const scopes = await auth.scopes();
            if (Array.isArray(scopes) && scopes.indexOf(scope) === -1) return false;
            return true;
        }

        /** May a mask be offered on this site, and what does the button say? */
        async function offer(site) {
            const label = rules.siteLabel(site);
            if (!label) return { offer: false, reason: 'no_site' };
            if (rules.isOpenVibeSite(label)) return { offer: false, reason: 'openvibe_site' };
            if ((await mutedSites()).indexOf(label) !== -1) return { offer: false, reason: 'muted' };
            if (!(await signedIn())) return { offer: true, label: rules.SIGNED_OUT_LABEL, signedOut: true, site: label };
            return { offer: true, label: rules.OFFER_LABEL + label, signedOut: false, site: label };
        }

        /** The address this site's field gets: the mask it already has, or a new one labelled with it. */
        async function fill(site) {
            const label = rules.siteLabel(site);
            if (!label) return { message: 'This page has no site name.' };
            if (rules.isOpenVibeSite(label)) return { message: 'This is an OpenVibe site.' };
            if ((await mutedSites()).indexOf(label) !== -1) return { message: MUTED_MESSAGE };
            if (!(await signedIn())) return { signedOut: true, label: rules.SIGNED_OUT_LABEL, message: SIGNOUT_MESSAGE };
            const masks = await mail.masks();
            const plan = rules.planFor(masks, label);
            const mask = plan.action === 'reuse' ? plan.mask : await mail.createMask(plan.label, PURPOSE);
            if (!mask || !mask.address) return { message: 'OpenVibe.Mail did not answer with an address.' };
            return { address: mask.address, message: rules.OFFER_MESSAGE, reused: plan.action === 'reuse', site: label };
        }

        /** The person's masks for this site, newest first, whether they are on or off. */
        async function masks(site) {
            const label = rules.siteLabel(site);
            if (!label) return { signedOut: true, masks: [] };
            if (!(await signedIn())) return { signedOut: true, masks: [] };
            const all = await mail.masks();
            return {
                signedOut: false,
                masks: rules.masksForSite(all, label).map(function (m) {
                    return { id: m.id, address: m.address, label: m.label, enabled: m.enabled !== false };
                }),
            };
        }

        /** "Don't offer here": the site is remembered on this device only. */
        async function mute(site) {
            const label = rules.siteLabel(site);
            if (!label) return { ok: false };
            const list = await mutedSites();
            if (list.indexOf(label) === -1) list.push(label);
            await storage.setLocal({ [muteKey]: list });
            return { ok: true, muted: true, site: label };
        }

        async function unmute(site) {
            const label = rules.siteLabel(site);
            if (!label) return { ok: false };
            const list = (await mutedSites()).filter(function (s) { return s !== label; });
            await storage.setLocal({ [muteKey]: list });
            return { ok: true, muted: false, site: label };
        }

        /** Turn a mask off: the address stops resolving at once. */
        async function disable(id) {
            if (!id) return { ok: false };
            await mail.disableMask(id);
            return { ok: true };
        }

        return { offer, fill, masks, mute, unmute, disable, signedIn, mutedSites };
    }

    return { createMaskService, MUTED_MESSAGE, SIGNOUT_MESSAGE, PURPOSE };
});
