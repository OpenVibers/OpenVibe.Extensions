'use strict';
/**
 * The mask fill: which field is worth offering a mask on, which mask that site's field gets, and
 * who may ask the Companion for what.
 *
 * The rules are DOM-free (browser/lib/mask.js), so a field is described here the way the browser
 * describes one: its tag, its type, its name and what it is called. The service (lib/mask-service.js)
 * is given a fake sign-in, a fake OpenVibe.Mail and a fake place to keep the muted sites.
 */
const assert = require('assert');
const rules = require('../browser/lib/mask');
const { createMaskService } = require('../browser/lib/mask-service');
const { createRouter } = require('../browser/lib/mask-router');
const { check, done } = require('./helpers/harness');

/** A field as the browser hands it over. */
function field(props) {
    const p = props || {};
    return {
        tagName: 'INPUT',
        type: p.type || 'text',
        name: p.name || '',
        id: p.id || '',
        placeholder: p.placeholder || '',
        labels: p.labels || [],
        getAttribute: function (k) { return Object.prototype.hasOwnProperty.call(p, k) ? p[k] : null; },
    };
}

const SIGNUP = { passwordCount: 1, texts: 'Create an account with your email and a password', submitText: 'Create account' };
const SIGNIN = { passwordCount: 1, texts: 'Sign in to your account', submitText: 'Sign in' };
const NEWSLETTER = { passwordCount: 0, texts: 'Subscribe to our newsletter for the weekly digest', submitText: 'Subscribe' };
const OTHER = { passwordCount: 0, texts: 'Search the catalogue of tents and sleeping bags', submitText: 'Search' };

/** A fake OpenVibe.Mail that records what it was asked. */
function fakeMail(masks) {
    const calls = { masks: 0, created: [], disabled: [] };
    let list = (masks || []).slice();
    return {
        calls: calls,
        async masks() { calls.masks++; return list.slice(); },
        async createMask(label, purpose) {
            calls.created.push({ label: label, purpose: purpose });
            const mask = { id: 'msk_' + (calls.created.length + 1), address: label.split('.').join('-') + '@mask.openvibe.email', label: label, enabled: true };
            list.push(mask);
            return mask;
        },
        async disableMask(id) { calls.disabled.push(id); const m = list.find(function (x) { return x.id === id; }); if (m) m.enabled = false; return m; },
    };
}

/** A fake sign-in: signed in with the scope, or not. */
function fakeAuth(signedIn, scopes) {
    return {
        async status() { return signedIn ? { mode: 'network' } : { mode: 'none' }; },
        async scopes() { return scopes || (signedIn ? ['dock', 'mail.mask.manage'] : []); },
        async accessToken() { return signedIn ? 'tok' : null; },
    };
}

function fakeStorage() {
    const store = {};
    return {
        store: store,
        async getLocal(k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
        async setLocal(v) { Object.keys(v).forEach(function (k) { store[k] = v[k]; }); },
    };
}

function service(opts) {
    const o = opts || {};
    const mail = o.mail || fakeMail(o.masks);
    const storage = o.storage || fakeStorage();
    const svc = createMaskService({
        rules: rules,
        auth: o.auth || fakeAuth(o.signedIn !== false),
        mail: mail,
        storage: storage,
        scope: 'mail.mask.manage',
        muteKey: 'maskMutes',
    });
    return { svc: svc, mail: mail, storage: storage };
}

(async () => {
    await check('the site is the hostname without its www.', async () => {
        assert.strictEqual(rules.siteLabel('www.Acme-Shop.com'), 'acme-shop.com');
        assert.strictEqual(rules.siteLabel('acme-shop.com'), 'acme-shop.com');
        assert.strictEqual(rules.siteLabel('shop.acme-shop.com'), 'shop.acme-shop.com');
        assert.strictEqual(rules.siteLabel(''), null);
        assert.strictEqual(rules.siteLabel(null), null);
    });

    await check('our own sites are never offered a mask', async () => {
        for (const h of ['openvibe.network', 'openvibe.coupons', 'www.openvibe.email', 'mail.openvibe.chat']) assert.ok(rules.isOpenVibeSite(h), h);
        for (const h of ['acme-shop.com', 'notopenvibe.network', 'openvibe.network.example.com']) assert.ok(!rules.isOpenVibeSite(h), h);
    });

    await check('an email field is an email or a text box that calls itself one', async () => {
        assert.ok(rules.isEmailField(field({ type: 'email' })));
        assert.ok(rules.isEmailField(field({ type: 'text', name: 'email' })));
        assert.ok(rules.isEmailField(field({ type: 'text', id: 'user_email' })));
        assert.ok(rules.isEmailField(field({ type: 'text', placeholder: 'Your e-mail address' })));
        assert.ok(rules.isEmailField(field({ type: 'text', labels: [{ textContent: 'Email address' }] })));
        assert.ok(!rules.isEmailField(field({ type: 'text', name: 'search' })));
        assert.ok(!rules.isEmailField(field({ type: 'tel' })));
    });

    await check('a password field is never an email field, whatever it is called', async () => {
        assert.ok(!rules.isEmailField(field({ type: 'password', name: 'email' })));
        assert.ok(!rules.isEmailField(field({ type: 'password', id: 'email' })));
        assert.ok(!rules.isEmailField(field({ type: 'password', placeholder: 'email' })));
        const d = rules.offerFor(field({ type: 'password', name: 'email' }), SIGNIN);
        assert.deepStrictEqual(d, { offer: false, reason: 'password' });
    });

    await check('a sign-up form is offered a mask, and so is a sign-in and a newsletter', async () => {
        assert.deepStrictEqual(rules.offerFor(field({ type: 'email', name: 'email' }), SIGNUP), { offer: true, kind: 'signup' });
        assert.deepStrictEqual(rules.offerFor(field({ type: 'email', name: 'email' }), SIGNIN), { offer: true, kind: 'signin' });
        assert.deepStrictEqual(rules.offerFor(field({ type: 'email', name: 'email' }), NEWSLETTER), { offer: true, kind: 'newsletter' });
    });

    await check('a form that asks for nothing we can help with is left alone', async () => {
        assert.deepStrictEqual(rules.offerFor(field({ type: 'email', name: 'email' }), OTHER), { offer: false, reason: 'other_form' });
        assert.deepStrictEqual(rules.offerFor(field({ type: 'text', name: 'search' }), SIGNUP), { offer: false, reason: 'not_email' });
        assert.deepStrictEqual(rules.offerFor({ tagName: 'DIV' }, SIGNUP), { offer: false, reason: 'not_a_field' });
    });

    await check('the site that already has a mask keeps it; a new site gets a new one labelled with the site', async () => {
        const masks = [{ id: 'msk_1', address: 'acme-shop@mask.openvibe.email', label: 'acme-shop.com', enabled: true }];
        const plan = rules.planFor(masks, 'acme-shop.com');
        assert.strictEqual(plan.action, 'reuse');
        assert.strictEqual(plan.mask.id, 'msk_1');
        const fresh = rules.planFor(masks, 'other-shop.com');
        assert.strictEqual(fresh.action, 'create');
        assert.strictEqual(fresh.label, 'other-shop.com');
        // A mask that was turned off is not the site's mask: the site gets a fresh one.
        const off = rules.planFor([{ id: 'msk_2', address: 'x@y', label: 'acme-shop.com', enabled: false }], 'acme-shop.com');
        assert.strictEqual(off.action, 'create');
    });

    await check('filling a field reuses that site\'s mask and never makes a second one', async () => {
        const { svc, mail } = service({ masks: [{ id: 'msk_1', address: 'acme-shop@mask.openvibe.email', label: 'acme-shop.com', enabled: true }] });
        const out = await svc.fill('www.acme-shop.com');
        assert.strictEqual(out.address, 'acme-shop@mask.openvibe.email');
        assert.strictEqual(out.reused, true);
        assert.strictEqual(out.message, rules.OFFER_MESSAGE);
        assert.strictEqual(mail.calls.created.length, 0, 'no mask was made');
    });

    await check('a site without a mask gets one, labelled with the site', async () => {
        const { svc, mail } = service({ masks: [] });
        const out = await svc.fill('acme-shop.com');
        assert.strictEqual(out.reused, false);
        assert.strictEqual(out.message, rules.OFFER_MESSAGE);
        assert.deepStrictEqual(mail.calls.created, [{ label: 'acme-shop.com', purpose: 'companion' }]);
    });

    await check('offering a mask never creates one', async () => {
        const { svc, mail } = service({ masks: [] });
        const out = await svc.offer('acme-shop.com');
        assert.strictEqual(out.offer, true);
        assert.strictEqual(out.label, 'Use a mask for acme-shop.com');
        assert.strictEqual(mail.calls.created.length, 0);
        assert.strictEqual(mail.calls.masks, 0, 'offering asks OpenVibe.Mail for nothing');
    });

    await check('signed out, the button asks the person to sign in and nothing is created', async () => {
        const { svc, mail } = service({ signedIn: false });
        const out = await svc.offer('acme-shop.com');
        assert.strictEqual(out.offer, true);
        assert.strictEqual(out.signedOut, true);
        assert.strictEqual(out.label, rules.SIGNED_OUT_LABEL);
        const fill = await svc.fill('acme-shop.com');
        assert.strictEqual(fill.signedOut, true);
        assert.strictEqual(fill.address, undefined);
        assert.strictEqual(mail.calls.created.length, 0);
    });

    await check('signed in without the mask scope, the button asks the person to sign in again', async () => {
        const { svc } = service({ auth: fakeAuth(true, ['dock', 'activity']) });
        const out = await svc.offer('acme-shop.com');
        assert.strictEqual(out.signedOut, true);
        assert.strictEqual(out.label, rules.SIGNED_OUT_LABEL);
    });

    await check('a muted site is never offered a mask', async () => {
        const { svc, mail } = service({ masks: [] });
        await svc.mute('acme-shop.com');
        const out = await svc.offer('acme-shop.com');
        assert.deepStrictEqual(out, { offer: false, reason: 'muted' });
        const fill = await svc.fill('acme-shop.com');
        assert.strictEqual(fill.address, undefined);
        assert.strictEqual(mail.calls.created.length, 0);
        await svc.unmute('acme-shop.com');
        assert.strictEqual((await svc.offer('acme-shop.com')).offer, true);
    });

    await check('an OpenVibe site is never offered a mask', async () => {
        const { svc } = service({ masks: [] });
        assert.deepStrictEqual(await svc.offer('openvibe.network'), { offer: false, reason: 'openvibe_site' });
    });

    await check('a page may ask for an offer and for an address, and for nothing else', async () => {
        const { svc, mail } = service({ masks: [] });
        const router = createRouter({ rules: rules, service: svc, isOwnPage: function () { return false; } });
        const page = { tab: { id: 7, url: 'https://www.acme-shop.com/sign-up' }, url: 'https://www.acme-shop.com/sign-up' };
        const offer = await router.handle({ type: 'mask:offer' }, page);
        assert.strictEqual(offer.offer, true);
        assert.strictEqual(offer.label, 'Use a mask for acme-shop.com');
        const fill = await router.handle({ type: 'mask:fill' }, page);
        assert.strictEqual(fill.address, 'acme-shop-com@mask.openvibe.email');
        assert.strictEqual(mail.calls.created.length, 1);
        // The list of masks, turning one off and the per-site switch are not the page's to ask for.
        for (const type of ['mask:list', 'mask:disable', 'mask:mute', 'mask:unmute']) {
            assert.deepStrictEqual(await router.handle({ type: type, site: 'acme-shop.com', id: 'msk_1' }, page), { ok: false }, type);
        }
    });

    await check('the site is the tab\'s own address, never the page\'s word for it', async () => {
        const { svc } = service({ masks: [] });
        const router = createRouter({ rules: rules, service: svc, isOwnPage: function () { return false; } });
        const page = { tab: { id: 7, url: 'https://www.acme-shop.com/sign-up' }, url: 'https://www.acme-shop.com/sign-up' };
        const out = await router.handle({ type: 'mask:offer', site: 'some-other-site.com' }, page);
        assert.strictEqual(out.label, 'Use a mask for acme-shop.com');
    });

    await check('a stranger (no tab, not one of our pages) is refused', async () => {
        const { svc } = service({ masks: [] });
        const router = createRouter({ rules: rules, service: svc, isOwnPage: function () { return false; } });
        assert.deepStrictEqual(await router.handle({ type: 'mask:fill' }, { id: 'other' }), { ok: false });
        assert.deepStrictEqual(await router.handle({ type: 'mask:fill' }, {}), { ok: false });
        assert.deepStrictEqual(await router.handle({ type: 'mask:fill' }, null), { ok: false });
    });

    await check('the popup may list the masks of a site, turn one off and set the per-site switch', async () => {
        const { svc, mail } = service({ masks: [{ id: 'msk_1', address: 'acme-shop@mask.openvibe.email', label: 'acme-shop.com', enabled: true }] });
        const router = createRouter({ rules: rules, service: svc, isOwnPage: function (sender) { return sender && sender.own === true; } });
        const popup = { own: true };
        const list = await router.handle({ type: 'mask:list', site: 'acme-shop.com' }, popup);
        assert.strictEqual(list.site, 'acme-shop.com');
        assert.strictEqual(list.signedOut, false);
        assert.deepStrictEqual(list.masks.map(function (m) { return m.address; }), ['acme-shop@mask.openvibe.email']);
        assert.strictEqual(list.muted, false);
        const muted = await router.handle({ type: 'mask:mute', site: 'acme-shop.com' }, popup);
        assert.strictEqual(muted.muted, true);
        assert.strictEqual((await router.handle({ type: 'mask:list', site: 'acme-shop.com' }, popup)).muted, true);
        await router.handle({ type: 'mask:unmute', site: 'acme-shop.com' }, popup);
        assert.strictEqual((await router.handle({ type: 'mask:list', site: 'acme-shop.com' }, popup)).muted, false);
        await router.handle({ type: 'mask:disable', id: 'msk_1' }, popup);
        assert.deepStrictEqual(mail.calls.disabled, ['msk_1']);
    });

    await check('the popup is told what it may show, and nothing more', async () => {
        const { svc } = service({ signedIn: false });
        const router = createRouter({ rules: rules, service: svc, isOwnPage: function (sender) { return sender && sender.own === true; } });
        const list = await router.handle({ type: 'mask:list', site: 'acme-shop.com' }, { own: true });
        assert.strictEqual(list.signedOut, true);
        assert.deepStrictEqual(list.masks, []);
        assert.ok(!('token' in list));
        assert.ok(!JSON.stringify(list).includes('tok'));
    });

    done();
})();
