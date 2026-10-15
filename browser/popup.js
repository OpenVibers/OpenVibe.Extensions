/*
 * OpenVibe Companion popup wiring: DOM only (no innerHTML — every value is set as text), clipboard, and the calls to
 * the controller. All logic lives in lib/controller.js.
 */
(function () {
    'use strict';
    const ext = typeof browser !== 'undefined' ? browser : chrome;
    const config = self.OVConfig;
    const platform = self.OVPlatform.createPlatform(ext, config);
    const api = self.OVApi.createApiClient({ origin: config.API_ORIGIN, fetch: self.fetch.bind(self), getToken: platform.storage.getToken, timeoutMs: config.TIMEOUT_MS });
    const handoff = self.OVHandoff.createHandoff(config);
    const controller = self.OVController.createController({ api: api, platform: platform, host: self.OVHost, handoff: handoff, isRental: self.OVHandoff.isRental });
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

    /** The two hand-off buttons: the board leads on a rental listing, Watch everywhere else. */
    function renderActions() {
        const p = controller.page();
        const section = document.getElementById('actions');
        if (!p.handoff) return;
        const keep = document.getElementById('keep');
        const watch = document.getElementById('watch');
        const delivery = document.getElementById('delivery');
        const note = document.getElementById('actions-note');
        document.getElementById('actions-lede').textContent = p.delivery
            ? 'Ordering delivery? See the same restaurant on every delivery app, with each app’s own prices and fees.'
            : p.rental
                ? 'A rental listing? Keep it on your board with your notes, next to the ones from every other site.'
                : 'Keep this page on your Rent board, or have OpenVibe.Watch tell you when it changes.';
        delivery.hidden = !p.delivery;
        (p.delivery ? delivery : p.rental ? keep : watch).classList.add('primary');
        const go = function (fn) {
            return async function () {
                const r = await fn();
                if (r.ok) window.close();
                else note.textContent = r.message;
            };
        };
        keep.addEventListener('click', go(controller.keepOnBoard));
        watch.addEventListener('click', go(controller.watchPage));
        delivery.addEventListener('click', go(controller.compareDelivery));
        section.hidden = false;
    }

    const OUTCOME = { worked: 'lowered the total', failed: 'not accepted', unknown: 'no change seen' };

    /** "Try these codes on this page": the button, what it does, and what happened to each code. */
    function tester(coupons, connected) {
        const list = el('ol');
        const note = el('p', { className: 'note muted', text: 'Types each code into this page’s coupon box and presses its Apply button: never checkout or pay. It stops at the first code that lowers the total and leaves it applied.' });
        const status = el('p', { className: 'note', 'aria-live': 'polite' });
        const send = el('button', { type: 'button', hidden: 'hidden', text: 'Send these results to OpenVibe.Coupons' });
        const run = el('button', { type: 'button', className: 'btn primary', text: 'Try these codes on this page' });
        let done = [];
        run.addEventListener('click', async function () {
            run.disabled = true;
            status.textContent = 'Trying codes…';
            while (list.firstChild) list.removeChild(list.firstChild);
            const r = await controller.tryCodes(coupons);
            status.textContent = r.message;
            done = r.results.filter(function (x) { return x.outcome !== 'unknown' && x.id; });
            r.results.forEach(function (x) {
                list.appendChild(el('li', { className: x.outcome, text: x.code + ': ' + OUTCOME[x.outcome] + (x.saved ? ' (−' + x.saved.toFixed(2) + ')' : '') }));
            });
            send.hidden = !(connected && done.length);
            run.disabled = false;
            run.textContent = 'Try again';
        });
        send.addEventListener('click', async function () {
            send.disabled = true;
            let ok = 0;
            for (const x of done) {
                const r = await controller.report(x.id, x.outcome === 'worked' ? 'worked' : 'failed', x.outcome === 'failed' ? 'invalid' : null);
                if (r.ok) ok++;
            }
            status.textContent = ok ? 'Thanks: ' + ok + ' result' + (ok === 1 ? '' : 's') + ' sent.' : 'The results could not be sent.';
            send.hidden = true;
        });
        return el('section', { className: 'try', 'aria-label': 'Try the codes on this page' }, run, note, status, list, send);
    }

    async function render() {
        const vm = await controller.open();
        if (vm.host) site.textContent = vm.host;
        renderActions();
        if (vm.state === 'not_a_site') return show(el('p', { text: 'Open this on a website: a shop for its coupon codes, a delivery app to compare with the others, a rental listing for your board, any page to watch.' }));
        if (vm.state === 'no_merchant') return show(el('p', { className: 'muted', text: 'No coupon codes for ' + vm.host + ' on OpenVibe.Coupons. ' }, link('Submit one', '/submit')));
        if (vm.state === 'error') return show(el('p', { text: vm.message }));
        const header = el('h2', { text: 'Coupon codes for ' + vm.merchant.name });
        if (!vm.coupons.length) return show(header, el('p', { text: 'No active codes right now.' }), el('p', null, link('See the shop page', '/m/' + encodeURIComponent(vm.merchant.slug))));
        return show(header, tester(vm.coupons, vm.connected), ...vm.coupons.map(function (c) { return couponNode(c, vm.connected); }), el('p', { className: 'muted' }, link('All codes and details', '/m/' + encodeURIComponent(vm.merchant.slug))));
    }

    document.getElementById('settings').addEventListener('click', function (ev) {
        if (ext.runtime && ext.runtime.openOptionsPage) { ev.preventDefault(); ext.runtime.openOptionsPage(); }
    });
    render().catch(function () { show(el('p', { text: 'Something went wrong. Try again later.' })); });
})();
