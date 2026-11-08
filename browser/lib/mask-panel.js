/*
 * The popup's masks section: the person's masks for the site of the tab they are on, with Copy and
 * Turn off, and the per-site "don't offer here" switch.
 *
 * It is DOM only (no innerHTML: every value is set as text) and it knows nothing about the
 * browser: the caller hands it the answer and the two actions, so the same code draws the section
 * for the popup and for the local screenshot page.
 */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.OVMaskPanel = api;
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    function el(tag, attrs) {
        const node = document.createElement(tag);
        const props = attrs || {};
        Object.keys(props).forEach(function (k) {
            if (k === 'text') node.textContent = props[k];
            else if (k === 'className') node.className = props[k];
            else if (k === 'checked') node.checked = !!props[k];
            else if (k === 'onclick') node.addEventListener('click', props[k]);
            else if (k === 'onchange') node.addEventListener('change', props[k]);
            else node.setAttribute(k, props[k]);
        });
        for (let i = 2; i < arguments.length; i++) {
            const child = arguments[i];
            if (child == null || child === false) continue;
            node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
        }
        return node;
    }

    /**
     * Draw the section.
     *   data.site      the site's name (the hostname without its www.)
     *   data.signedOut true when the person is not signed in (or has not given the scope)
     *   data.muted     true when the person asked not to be offered a mask on this site
     *   data.masks     [{ id, address, label, enabled }]
     *   onCopy(address), onDisable(mask), onMute(muted)
     */
    function render(container, data, actions) {
        const d = data || {};
        const act = actions || {};
        while (container.firstChild) container.removeChild(container.firstChild);

        container.appendChild(el('h2', { text: 'Masks for ' + (d.site || 'this site') }));

        if (d.signedOut) {
            container.appendChild(el('p', { className: 'muted', text: 'Sign in to use masks: open the Companion and press Sign in.' }));
            return;
        }

        if (!d.masks || !d.masks.length) {
            container.appendChild(el('p', { className: 'muted', text: 'No mask for this site yet. The button in an email field on a sign-up form makes one.' }));
        } else {
            for (const m of d.masks) {
                const copy = el('button', { type: 'button', text: 'Copy', onclick: function () { if (act.onCopy) act.onCopy(m.address, copy); } });
                const off = el('button', { type: 'button', text: 'Turn off', onclick: function () { if (act.onDisable) act.onDisable(m); } });
                container.appendChild(el('article', { className: 'coupon' },
                    el('div', { className: 'row' }, el('span', { className: 'code', text: m.address }), copy, off),
                    el('p', { className: 'muted', text: m.enabled === false ? 'Turned off: mail to this address bounces.' : 'On: mail to this address reaches your inbox.' })));
            }
        }

        const mute = el('input', { type: 'checkbox', id: 'masks-mute' });
        mute.checked = !!d.muted;
        mute.addEventListener('change', function () { if (act.onMute) act.onMute(mute.checked); });
        container.appendChild(el('p', { className: 'note' }, mute, ' Don\u2019t offer masks on this site'));
    }

    return { render };
});
