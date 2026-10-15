/*
 * Try coupon codes in the shop page's own coupon box: the OpenVibe Companion's "Try these codes on this page".
 *
 * Injected into the active tab only when the person presses that button in the popup (activeTab + scripting:
 * no host permission for any shop, no content script that runs by itself). It runs in the extension's isolated
 * world: it reads the page's DOM, types each code into the coupon field and presses the field's own Apply button,
 * and reads the order total before and after. It makes no network request of its own, reads no cookies or
 * storage, and returns only what it saw (which code changed the total) to the popup.
 *
 *   run(codes, opts) → { ok, reason?, before, after, results: [{ id, code, outcome, before, after }] }
 *     outcome  'worked'    the total went down after the code was applied
 *              'failed'    the page showed a "not valid / expired / not eligible…" message near the field
 *              'unknown'   neither within the wait
 *     reason   'no_field'  no coupon box on this page (not even behind a "Have a promo code?" link)
 *              'no_apply'  a coupon box but no Apply button next to it: nothing is pressed rather than risk
 *                          submitting the whole checkout form
 *
 * Safety: it never presses a button that reads like ordering or paying (DANGER_RE), never submits a form, and
 * never presses Enter. It stops at the first code that lowers the total and leaves it applied; at most ten codes
 * are tried.
 */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.OVAutoApply = api;
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const FIELD_RE = /(coupon|promo|discount|voucher|offer|redeem|reward|gift)[\s_-]*(code|cod|key)?|promocode|couponcode|code\s*promo/i;
    const NOT_FIELD_RE = /(e-?mail|zip|postal|phone|tel\b|card[\s_-]*(number|num|no)|cvv|cvc|security[\s_-]*code|expir|search|address|first[\s_-]*name|last[\s_-]*name|full[\s_-]*name|city|state|country|password|quantity|qty|gift[\s_-]*card[\s_-]*pin|pin\b)/i;
    const OPEN_RE = /(have|add|enter|apply|use|got)\b[^.]{0,25}\b(promo|coupon|discount|voucher|offer|gift)|^(\+\s*)?(promo|coupon|discount|voucher)\s*(code)?s?\s*\??$/i;
    const APPLY_RE = /^\s*(apply|redeem|use|add|submit|validate|ok|go)\b/i;
    const DANGER_RE = /(place|submit|complete|confirm|review)\s*(my\s*)?order|\bpay\b|pay\s*now|checkout|check\s*out|purchase|\bbuy\b|continue|next\s*step|proceed|subscribe|sign\s*up|log\s*in|remove|delete|cancel|\b(cart|bag|basket|wish\s*list)\b/i;
    const ERROR_RE = /(invalid|not valid|isn.t valid|is not a valid|expired|has ended|no longer|not applicable|cannot be applied|can.t be applied|could not be applied|couldn.t be applied|doesn.t apply|does not apply|not eligible|ineligible|minimum|not recognized|unable to apply|not found|does not exist|doesn.t exist|try another|not available|already been used|limit reached)/i;
    const TOTAL_RE = /\b(order\s*total|grand\s*total|estimated\s*total|total\s*due|amount\s*due|you\s*pay|total\s*to\s*pay|total)\b/i;
    const NOT_TOTAL_RE = /sub-?\s*total|total\s*savings|you\s*saved|items?\s*total|total\s*items|total\s*discount|tax|shipping/i;
    const AMOUNT_RE = /(?:[$€£¥₹]|\b(?:USD|EUR|GBP|CAD|AUD)\b)\s?-?\d{1,3}(?:[,.   ]\d{3})*(?:[.,]\d{1,2})?|-?\d{1,3}(?:[,.   ]\d{3})*(?:[.,]\d{1,2})?\s?(?:[$€£¥₹]|\b(?:USD|EUR|GBP|CAD|AUD)\b)/g;

    /** "$1,234.56" → 1234.56, "1.234,56 €" → 1234.56, "£12" → 12; null when no amount. */
    function parseAmount(text) {
        const m = String(text || '').match(AMOUNT_RE);
        if (!m) return null;
        let s = m[m.length - 1].replace(/[^\d.,-]/g, '');
        const lastDot = s.lastIndexOf('.');
        const lastComma = s.lastIndexOf(',');
        const dec = Math.max(lastDot, lastComma);
        if (dec > -1 && s.length - dec - 1 <= 2 && s.length - dec - 1 > 0) {
            s = s.slice(0, dec).replace(/[.,]/g, '') + '.' + s.slice(dec + 1);
        } else {
            s = s.replace(/[.,]/g, '');
        }
        const n = Number(s);
        return Number.isFinite(n) ? n : null;
    }

    function shown(el) {
        if (!el || !el.isConnected) return false;
        if (el.disabled || el.readOnly || el.type === 'hidden') return false;
        const view = el.ownerDocument && el.ownerDocument.defaultView;
        const st = view && view.getComputedStyle ? view.getComputedStyle(el) : null;
        if (st && (st.visibility === 'hidden' || st.display === 'none')) return false;
        return Boolean(el.getClientRects && el.getClientRects().length);
    }

    /** Everything that names a field: name, id, placeholder, aria-label, autocomplete and its <label>s. */
    function nameOf(el) {
        const bits = [el.name, el.id, el.getAttribute && el.getAttribute('placeholder'), el.getAttribute && el.getAttribute('aria-label'),
            el.getAttribute && el.getAttribute('autocomplete'), el.getAttribute && el.getAttribute('data-testid')];
        if (el.labels) for (let i = 0; i < el.labels.length; i++) bits.push(el.labels[i].textContent);
        return bits.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
    }

    function isCouponField(el) {
        if (!el || el.tagName !== 'INPUT') return false;
        const type = String(el.type || 'text').toLowerCase();
        if (type !== 'text' && type !== 'search' && type !== '') return false;
        const n = nameOf(el);
        return FIELD_RE.test(n) && !NOT_FIELD_RE.test(n.replace(FIELD_RE, ''));
    }

    function findField(doc) {
        const inputs = doc.querySelectorAll('input');
        for (let i = 0; i < inputs.length; i++) if (isCouponField(inputs[i]) && shown(inputs[i])) return inputs[i];
        return null;
    }

    const textOf = (el) => String((el && (el.innerText || el.textContent || el.value)) || '').replace(/\s+/g, ' ').trim();

    /** A "Have a promo code?" link or button that reveals the box. */
    function findOpener(doc) {
        const els = doc.querySelectorAll('a, button, summary, [role="button"], label');
        for (let i = 0; i < els.length; i++) {
            const t = textOf(els[i]);
            if (t && t.length <= 60 && OPEN_RE.test(t) && !DANGER_RE.test(t) && shown(els[i])) return els[i];
        }
        return null;
    }

    /** The field's own Apply button: a short "Apply/Redeem/Use…" label within three levels around the field, never an order or pay button. */
    function findApply(field) {
        let box = field.parentElement;
        for (let depth = 0; box && depth < 4; depth++, box = box.parentElement) {
            const els = box.querySelectorAll('button, input[type="submit"], input[type="button"], [role="button"], a');
            for (let i = 0; i < els.length; i++) {
                const el = els[i];
                if (el === field) continue;
                const t = textOf(el) || String(el.getAttribute('aria-label') || '');
                if (t && t.length <= 24 && APPLY_RE.test(t) && !DANGER_RE.test(t) && shown(el)) return el;
            }
        }
        return null;
    }

    /**
     * The order total: walking the page's text once, the last visible text that names a total (not a subtotal, tax or
     * saving) with an amount in it or just after it.
     */
    function readTotal(doc) {
        if (!doc.body || !doc.createTreeWalker) return null;
        const walker = doc.createTreeWalker(doc.body, 4 /* NodeFilter.SHOW_TEXT */);
        let found = null;
        for (let n = walker.nextNode(); n; n = walker.nextNode()) {
            const t = n.nodeValue;
            if (!t || t.length > 80 || !TOTAL_RE.test(t) || NOT_TOTAL_RE.test(t)) continue;
            const el = n.parentElement;
            if (!el || !el.getClientRects || !el.getClientRects().length) continue;
            let amount = parseAmount(textOf(el));
            for (let up = el, hop = 0; amount == null && up && hop < 3; up = up.parentElement, hop++) {
                const sib = up.nextElementSibling;
                if (sib) amount = parseAmount(textOf(sib));
                if (amount == null && up.parentElement) {
                    const row = textOf(up.parentElement);
                    if (row.length <= 120 && !NOT_TOTAL_RE.test(row)) amount = parseAmount(row);
                }
            }
            if (amount != null && amount >= 0) found = amount;
        }
        return found;
    }

    /** Set an input's value so React, Vue and plain pages all see it. */
    function setValue(input, value) {
        const proto = Object.getPrototypeOf(input);
        const desc = proto && Object.getOwnPropertyDescriptor(proto, 'value');
        if (desc && desc.set) desc.set.call(input, value); else input.value = value;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
    }

    /** The text around the field (where a shop writes "Code not valid"). */
    function around(field) {
        let box = field.parentElement;
        for (let depth = 0; box && box.parentElement && depth < 3 && textOf(box).length < 400; depth++) box = box.parentElement;
        return textOf(box);
    }

    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

    async function run(codes, opts) {
        const o = opts || {};
        const doc = o.document || document;
        const waitMs = o.waitMs || 4500;
        const list = (Array.isArray(codes) ? codes : []).filter((c) => c && typeof c.code === 'string' && c.code.trim()).slice(0, 10);
        let field = findField(doc);
        if (!field) {
            const opener = findOpener(doc);
            if (opener) { opener.click(); await sleep(o.openMs || 800); field = findField(doc); }
        }
        const before = readTotal(doc);
        if (!field) return { ok: false, reason: 'no_field', before, after: before, results: [] };
        if (!findApply(field)) return { ok: false, reason: 'no_apply', before, after: before, results: [] };
        const results = [];
        for (const c of list) {
            if (!field.isConnected) field = findField(doc);
            const button = field && findApply(field);
            if (!field || !button) break;
            const t0 = readTotal(doc);
            const said = around(field);
            setValue(field, c.code.trim());
            button.click();
            let outcome = 'unknown';
            let total = t0;
            const end = Date.now() + waitMs;
            while (Date.now() < end) {
                await sleep(o.pollMs || 250);
                total = readTotal(doc);
                if (t0 != null && total != null && total < t0 - 0.004) { outcome = 'worked'; break; }
                const f = field.isConnected ? field : findField(doc);
                const now = f ? around(f) : textOf(doc.body);
                if (now !== said && ERROR_RE.test(now)) { outcome = 'failed'; break; }
            }
            results.push({ id: c.id || null, code: c.code.trim(), outcome, before: t0, after: total });
            if (outcome === 'worked') break;
            // Clear the box for the next code.
            if (field.isConnected) setValue(field, '');
        }
        return { ok: true, before, after: readTotal(doc), results };
    }

    return { run, parseAmount, isCouponField, findField, findOpener, findApply, readTotal, nameOf, DANGER_RE, APPLY_RE };
});
