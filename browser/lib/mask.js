/*
 * The rules of the mask fill, with no DOM: which field is an email field on a form worth offering a
 * mask on, what a site's mask is called, which of the person's masks is that site's, and the words
 * the button and the note use.
 *
 *   siteLabel('www.Acme-Shop.com')        → 'acme-shop.com'
 *   isOpenVibeSite('openvibe.network')    → true
 *   isEmailField(field)                   → true for an email input, never for a password field
 *   classify({ passwordCount, texts })    → 'signup' | 'signin' | 'newsletter' | null
 *   maskForSite(masks, 'acme-shop.com')   → the person's mask for that site, or null
 *
 * The site label is the hostname without its leading "www.": the mask a person gets for a site is
 * the site's, and the same label finds it again the next time (lib/mail-api.js and background.js).
 */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.OVMask = api;
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const OPENVIBE_RE = /(^|\.)openvibe\.[a-z]{2,}$/;
    const EMAIL_RE = /e-?mail/i;
    const SIGNUP_RE = /sign\s*up|create\s+(an\s+)?account|register|join\s+now|get\s+started/i;
    const SIGNIN_RE = /sign\s*in|log\s*in|login/i;
    const NEWSLETTER_RE = /subscribe|newsletter|mailing\s*list|weekly\s+digest/i;

    // The words the button and the note use.
    const OFFER_LABEL = 'Use a mask for ';
    const SIGNED_OUT_LABEL = 'Sign in to use masks';
    const OFFER_MESSAGE = 'Mail to this address reaches your inbox; you can turn it off any time';

    /** The site's name: the hostname without its leading "www.". */
    function siteLabel(hostname) {
        const host = String(hostname == null ? '' : hostname).trim().toLowerCase().replace(/\.$/, '');
        if (!host) return null;
        return host.replace(/^www\./, '');
    }

    /** Our own sites are never offered a mask: the person is already ours there. */
    function isOpenVibeSite(hostname) {
        const host = String(hostname == null ? '' : hostname).trim().toLowerCase().replace(/\.$/, '');
        return OPENVIBE_RE.test(host);
    }

    /** Everything that names the field: name, id, placeholder, aria-label, autocomplete and its <label>s. */
    function nameText(field) {
        if (!field) return '';
        const get = field.getAttribute ? function (k) { return field.getAttribute(k); } : function () { return null; };
        const bits = [field.name, field.id, field.placeholder, get('placeholder'), get('aria-label'), get('autocomplete')];
        if (field.labels) for (let i = 0; i < field.labels.length; i++) bits.push(field.labels[i] && field.labels[i].textContent);
        return bits.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
    }

    /**
     * An email field is an input of type email (or a text box that calls itself one). A password
     * field never is, whatever it is called.
     */
    function isEmailField(field) {
        if (!field || field.tagName !== 'INPUT') return false;
        const type = String(field.type || 'text').toLowerCase();
        if (type === 'password') return false;
        if (type === 'email') return true;
        if (type !== 'text' && type !== '') return false;
        return EMAIL_RE.test(nameText(field));
    }

    /**
     * What the form around the field is: a sign-up, a sign-in or a newsletter (all three hand an
     * address to a site that does not need to know it), or nothing we should offer on.
     */
    function classify(ctx) {
        const c = ctx || {};
        const text = String(c.texts || '') + ' ' + String(c.submitText || '');
        if (NEWSLETTER_RE.test(text)) return 'newsletter';
        const passwords = Number(c.passwordCount || 0);
        if (passwords > 0) return SIGNIN_RE.test(text) && !SIGNUP_RE.test(text) ? 'signin' : 'signup';
        return SIGNUP_RE.test(text) ? 'signup' : null;
    }

    /** The person's mask for that site: the enabled one labelled with the site, or null. */
    function maskForSite(masks, site) {
        const label = String(site == null ? '' : site).toLowerCase();
        const list = Array.isArray(masks) ? masks : [];
        for (const m of list) {
            if (!m || m.enabled === false) continue;
            if (String(m.label || '').toLowerCase() === label) return m;
        }
        return null;
    }

    /** The masks of that site, newest first, whether they are on or off. */
    function masksForSite(masks, site) {
        const label = String(site == null ? '' : site).toLowerCase();
        const list = Array.isArray(masks) ? masks : [];
        return list.filter(function (m) { return m && String(m.label || '').toLowerCase() === label; });
    }

    /**
     * What to do for this site: the mask the person already has for it (reuse it — never make a second
     * one for the same site), or a new one labelled with the site.
     *   { action: 'reuse', mask }
     *   { action: 'create', label: 'acme-shop.com' }
     */
    function planFor(masks, site) {
        const existing = maskForSite(masks, site);
        if (existing) return { action: 'reuse', mask: existing };
        return { action: 'create', label: String(site == null ? '' : site) };
    }

    /**
     * Whether to offer a mask on this field, and why not when we do not.
     *   { offer: true, kind: 'signup' | 'signin' | 'newsletter' }
     *   { offer: false, reason: 'not_a_field' | 'password' | 'not_email' | 'other_form' }
     */
    function offerFor(field, ctx) {
        if (!field || field.tagName !== 'INPUT') return { offer: false, reason: 'not_a_field' };
        if (String(field.type || '').toLowerCase() === 'password') return { offer: false, reason: 'password' };
        if (!isEmailField(field)) return { offer: false, reason: 'not_email' };
        const kind = classify(ctx);
        if (!kind) return { offer: false, reason: 'other_form' };
        return { offer: true, kind: kind };
    }

    return {
        siteLabel, isOpenVibeSite, isEmailField, nameText, classify, maskForSite, masksForSite, planFor, offerFor,
        OFFER_LABEL, SIGNED_OUT_LABEL, OFFER_MESSAGE, OPENVIBE_RE,
    };
});
