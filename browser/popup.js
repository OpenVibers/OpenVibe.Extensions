/*
 * Popup wiring: DOM only (no innerHTML — every value is set as text), clipboard, and the calls to
 * the controller. All logic lives in lib/controller.js.
 */
(function () {
    'use strict';
    const ext = typeof browser !== 'undefined' ? browser : chrome;
    const config = self.OVConfig;
    const platform = self.OVPlatform.createPlatform(ext, config);
    const api = self.OVApi.createApiClient({ origin: config.API_ORIGIN, fetch: self.fetch.bind(self), getToken: platform.storage.getToken, timeoutMs: config.TIMEOUT_MS });
    const controller = self.OVController.createController({ api: api, platform: platform, host: self.OVHost });
    const fmt = self.OVFormat;
    const content = document.getElementById('content');
    const site = document.getElementById('site');

    function el(tag, attrs) {
        const node = document.createElement(tag);
        const props = attrs || {};
        Object.keys(props).forEach(function (k) {
            if (k === 'text') node.textContent = props[k];
            else if (k === 'className') node.className = props[k];
            else if (k === 'onclick') node.addEventListener('click', props[k]);
            else node.setAttribute(k, props[k]);
        });
        for (let i = 2; i < arguments.length; i++) {
            const child = arguments[i];
            if (child == null || child === false) continue;
            node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
        }
        return node;
    }

    function show() {
        while (content.firstChild) content.removeChild(content.firstChild);
        for (let i = 0; i < arguments.length; i++) if (arguments[i]) content.appendChild(arguments[i]);
    }

    function link(text, path) {
        return el('a', { href: config.API_ORIGIN + path, target: '_blank', rel: 'noopener noreferrer', text: text });
    }

    async function copy(code, button) {
        try {
            await navigator.clipboard.writeText(code);
            button.textContent = 'Copied';
        } catch (e) {
            button.textContent = 'Select the code to copy';
        }
    }

    function couponNode(c, connected) {
        const note = el('p', { className: 'note muted' });
        const copyBtn = el('button', { type: 'button', text: 'Copy', onclick: function () { copy(c.code, copyBtn); } });
        let actions = null;
        if (connected) {
            const reason = el('select', { 'aria-label': 'Why it did not work' },
                el('option', { value: '', text: '(reason)' }),
                el('option', { value: 'invalid', text: 'Code not accepted' }),
                el('option', { value: 'expired', text: 'Said it has expired' }),
                el('option', { value: 'min_spend_not_met', text: 'Minimum spend not met' }),
                el('option', { value: 'not_eligible', text: 'Not eligible' }),
                el('option', { value: 'other', text: 'Other' }));
            const send = async function (outcome) {
                note.textContent = 'Sending…';
                const r = await controller.report(c.id, outcome, outcome === 'failed' ? reason.value : null);
                note.textContent = r.message;
            };
            actions = el('div', { className: 'row' },
                el('button', { type: 'button', text: 'It worked', onclick: function () { send('worked'); } }),
                el('button', { type: 'button', text: 'It didn’t work', onclick: function () { send('failed'); } }),
                reason);
        } else {
            actions = el('p', { className: 'note muted' }, 'To report whether it worked, ', el('a', { href: 'options.html', target: '_blank', text: 'connect the extension' }), '.');
        }
        return el('article', { className: 'coupon' },
            el('h3', { text: c.title }),
            el('div', { className: 'row' }, el('span', { className: 'code', text: c.code }), copyBtn, el('span', { className: 'status ' + c.status, text: fmt.status(c.status) })),
            el('p', { className: 'muted', text: fmt.confidence(c) }),
            el('p', { className: 'muted', text: fmt.expiry(c.expiry) }),
            el('ul', null, ...fmt.restrictions(c.restrictions).map(function (t) { return el('li', { text: t }); })),
            ...(c.hints || []).map(function (h) { return el('p', { className: 'muted', text: 'How to apply: ' + h.text }); }),
            actions,
            note);
    }

    async function render() {
        const vm = await controller.open();
        if (vm.host) site.textContent = vm.host;
        if (vm.state === 'not_a_site') return show(el('p', { text: 'Open this on a shop’s website.' }));
        if (vm.state === 'no_merchant') return show(el('p', { text: 'OpenVibe.Coupons has no codes for ' + vm.host + '.' }), el('p', null, link('Submit a code', '/submit')));
        if (vm.state === 'error') return show(el('p', { text: vm.message }));
        const header = el('h2', { text: vm.merchant.name });
        if (!vm.coupons.length) return show(header, el('p', { text: 'No active codes right now.' }), el('p', null, link('See the shop page', '/m/' + encodeURIComponent(vm.merchant.slug))));
        return show(header, ...vm.coupons.map(function (c) { return couponNode(c, vm.connected); }), el('p', { className: 'muted' }, link('All codes and details', '/m/' + encodeURIComponent(vm.merchant.slug))));
    }

    document.getElementById('settings').addEventListener('click', function (ev) {
        if (ext.runtime && ext.runtime.openOptionsPage) { ev.preventDefault(); ext.runtime.openOptionsPage(); }
    });
    render().catch(function () { show(el('p', { text: 'Something went wrong. Try again later.' })); });
})();
