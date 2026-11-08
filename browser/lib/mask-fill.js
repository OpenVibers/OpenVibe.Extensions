/*
 * The mask button in an email field: the Companion's own "Use a mask for <site>" control.
 *
 * It runs in the extension's isolated world (the Companion injects it into that one tab), so the
 * page can neither read it nor reach the extension through it: the only way into the extension is the
 * click on this button, and the only thing the page ever sees is the address that went into the field
 * and the words that go with it. The person's token never comes here.
 *
 * It draws nothing until the person focuses an email field on a sign-up, sign-in or newsletter form.
 * It asks the worker whether a mask may be offered here (the worker decides: the person may have
 * turned this site off, and it knows whether the person is signed in) and fills the field when the
 * worker answers with an address.
 *
 * The button is drawn in a layer over the field, never around it: the page's own markup is left
 * exactly as it was, so a form keeps the layout it had. The layer's words live in a closed shadow
 * root, so the page cannot read them either.
 *
 * The only extension API it uses is chrome.runtime.sendMessage: it reads no stored data, makes no
 * request of its own, and never learns the site from the page (the worker takes the site from the
 * tab's own address).
 */
(function (root, factory) {
    const api = factory(root);
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.OVMaskFill = api;
})(typeof self !== 'undefined' ? self : this, function (root) {
    'use strict';

    const LAYER_CLASS = 'ov-mask-layer';
    const BUTTON_CLASS = 'ov-mask-button';
    const NOTE_CLASS = 'ov-mask-note';

    /** Ask the extension's worker; the page never sees anything but the answer. */
    function ask(message) {
        return new Promise(function (resolve) {
            try {
                const runtime = (typeof chrome !== 'undefined' && chrome.runtime) || (typeof browser !== 'undefined' && browser.runtime);
                if (!runtime || !runtime.sendMessage) return resolve(null);
                runtime.sendMessage(message, function (answer) { resolve(answer || null); });
            } catch (e) {
                resolve(null);
            }
        });
    }

    /** What the form around the field is: a sign-up, a sign-in, a newsletter, or nothing we offer on. */
    function contextOf(field) {
        const form = (field.form || (field.closest && field.closest('form'))) || null;
        const scope = form || document;
        let passwordCount = 0;
        const passwords = scope.querySelectorAll ? scope.querySelectorAll('input[type=password]') : [];
        for (let i = 0; i < passwords.length; i++) passwordCount++;
        let submitText = '';
        const submits = scope.querySelectorAll ? scope.querySelectorAll('button[type=submit], input[type=submit], button') : [];
        for (let i = 0; i < submits.length; i++) {
            const t = String(submits[i].textContent || submits[i].value || '').replace(/\s+/g, ' ').trim();
            if (t) { submitText = t.slice(0, 60); break; }
        }
        const text = String(scope.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 600);
        return { passwordCount: passwordCount, texts: text, submitText: submitText };
    }

    /** The field the person focused, if it is one we may offer a mask on. */
    function candidate(target) {
        const r = root.OVMask;
        if (!r || !target || target.tagName !== 'INPUT') return null;
        const decision = r.offerFor(target, contextOf(target));
        if (!decision || !decision.offer) return null;
        return decision;
    }

    /** The layer over the field: a fixed box on top of it, with the button's words in a closed shadow root. */
    function layerFor(field) {
        const layer = document.createElement('div');
        layer.className = LAYER_CLASS;
        layer.style.cssText = 'position:fixed;left:0;top:0;z-index:2147483000;pointer-events:none;';
        const shadow = layer.attachShadow({ mode: 'closed' });
        layer.__ovShadow = shadow;
        document.body.appendChild(layer);
        place(layer, field);
        return layer;
    }

    /** Put the layer over the field, and keep it there while the page scrolls. */
    function place(layer, field) {
        if (!layer || !field || !field.getBoundingClientRect) return;
        const r = field.getBoundingClientRect();
        layer.style.left = r.left + 'px';
        layer.style.top = r.top + 'px';
        layer.style.width = r.width + 'px';
        layer.style.height = r.height + 'px';
    }

    function remove(layer) {
        if (!layer) return;
        if (layer.parentNode) layer.parentNode.removeChild(layer);
    }

    /** Set the field's value so React, Vue and plain pages all see it. */
    function setValue(input, value) {
        const proto = Object.getPrototypeOf(input);
        const desc = proto && Object.getOwnPropertyDescriptor(proto, 'value');
        if (desc && desc.set) desc.set.call(input, value); else input.value = value;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
    }

    function button(layer, field, label) {
        const shadow = layer.__ovShadow;
        const old = shadow.querySelector('.' + BUTTON_CLASS);
        if (old && old.parentNode) old.parentNode.removeChild(old);
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = BUTTON_CLASS;
        btn.textContent = label;
        btn.style.cssText = 'position:absolute;right:6px;top:50%;transform:translateY(-50%);pointer-events:auto;'
            + 'padding:2px 9px;border-radius:999px;border:1px solid #1d4ed8;background:#eff6ff;color:#1d4ed8;'
            + 'font:600 11px/1.7 system-ui,-apple-system,sans-serif;cursor:pointer;white-space:nowrap;';
        btn.addEventListener('mousedown', function (event) { event.preventDefault(); });
        btn.addEventListener('click', function (event) {
            // Only a real press by the person counts: a script on the page cannot make the extension act.
            if (!event.isTrusted) return;
            event.preventDefault();
            event.stopPropagation();
            btn.disabled = true;
            ask({ type: 'mask:fill' }).then(function (answer) {
                btn.disabled = false;
                if (answer && answer.address) {
                    setValue(field, answer.address);
                    note(layer, answer.message || '');
                } else if (answer && answer.signedOut) {
                    note(layer, answer.message || 'Sign in to use masks.');
                } else {
                    note(layer, (answer && answer.message) || 'OpenVibe.Mail could not be reached.');
                }
            });
        });
        shadow.appendChild(btn);
    }

    /** The words under the field: what the person is told about the address that went in. */
    function note(layer, text) {
        const shadow = layer.__ovShadow;
        const old = shadow.querySelector('.' + NOTE_CLASS);
        if (old && old.parentNode) old.parentNode.removeChild(old);
        const el = document.createElement('div');
        el.className = NOTE_CLASS;
        el.setAttribute('role', 'status');
        el.textContent = text;
        el.style.cssText = 'position:absolute;top:100%;left:0;max-width:320px;margin-top:5px;pointer-events:auto;'
            + 'padding:5px 9px;border-radius:7px;border:1px solid #d6dce6;background:#ffffff;color:#1d2433;'
            + 'font:12px/1.4 system-ui,-apple-system,sans-serif;box-shadow:0 2px 8px rgba(15,21,34,.18);';
        shadow.appendChild(el);
    }

    /** Put the button in the field the person focused, when the worker says a mask may be offered here. */
    async function offer(field, layer) {
        const answer = await ask({ type: 'mask:offer' });
        if (!answer || !answer.offer) { remove(layer); return false; }
        button(layer, field, answer.label || '');
        return true;
    }

    function install() {
        if (root.__ovMaskFillInstalled) return { installed: false, already: true };
        root.__ovMaskFillInstalled = true;
        let layer = null;
        let field = null;

        const drop = function () {
            remove(layer);
            layer = null;
            field = null;
        };

        document.addEventListener('focusin', function (event) {
            const target = event.target;
            if (!candidate(target)) return;
            if (layer) drop();
            field = target;
            layer = layerFor(field);
            offer(field, layer);
        }, true);

        document.addEventListener('focusout', function (event) {
            // The press on the button itself is not the end of the offer.
            window.setTimeout(function () {
                const active = document.activeElement;
                if (active && layer && layer.contains && layer.contains(active)) return;
                if (event.target !== field) return;
                drop();
            }, 0);
        }, true);

        window.addEventListener('scroll', function () { if (layer && field) place(layer, field); }, true);
        window.addEventListener('resize', function () { if (layer && field) place(layer, field); });

        return { installed: true };
    }

    // In a page (the isolated world) the script starts by itself; in Node (the tests) it does not.
    if (typeof module !== 'object' && typeof document !== 'undefined' && document.addEventListener) install();

    return { install, contextOf, candidate, setValue, offer, place, LAYER_CLASS, BUTTON_CLASS, NOTE_CLASS };
});
