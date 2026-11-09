(function (root) {
    'use strict';
    function mount({ container, ask, platform }) {
        const make = (tag, text, cls) => { const node = document.createElement(tag); if (text) node.textContent = text; if (cls) node.className = cls; return node; };
        let context, busy = false, tick, lastActivity = 0, isUnlocked = false;
        const note = make('p', '', 'note muted'); note.setAttribute('role', 'status');
        const body = make('div');
        const heading = make('div', '', 'locker-heading');
        heading.append(make('h2', 'Passwords'), make('span', 'Locker', 'status'));
        container.append(heading, body, note);
        function button(label, action, cls = 'btn') {
            const b = make('button', label, cls); b.type = 'button';
            b.addEventListener('click', (e) => { if (e.isTrusted) run(b, action); }); return b;
        }
        async function run(b, action) {
            if (busy) return; busy = true; b.disabled = true; note.textContent = '';
            try { await action(); } catch (e) { note.textContent = e.message; }
            finally { busy = false; b.disabled = false; }
        }
        async function request(action, fields = {}) {
            const r = await ask({ type: 'locker:' + action, ...context, ...fields });
            if (!r?.ok) throw new Error(r?.message || 'Could not complete that action. Check that the page has one visible login form.');
            return r;
        }
        function field(form, label, type, name) {
            const wrap = make('label', label, 'locker-field'); const input = make('input');
            input.name = name; input.type = type; input.autocomplete = 'off'; input.spellcheck = false;
            wrap.append(input); form.append(wrap); return input;
        }
        for (const event of ['pointerdown', 'keydown']) container.addEventListener(event, (e) => {
            if (!e.isTrusted || !isUnlocked || Date.now() - lastActivity < 60000) return;
            lastActivity = Date.now(); ask({ type: 'locker:activity', clicked: true });
        });
        function locked() {
            isUnlocked = false;
            clearInterval(tick); body.replaceChildren();
            body.append(make('p', 'Unlock to use a saved login on this site.', 'muted'));
            const form = make('form', '', 'locker-form');
            const modeLabel = make('label', 'Unlock with', 'locker-field'); const mode = make('select');
            for (const [value, label] of [['passphrase', 'Locker passphrase'], ['recovery', 'Recovery kit']]) { const opt = make('option', label); opt.value = value; mode.append(opt); }
            modeLabel.append(mode); form.append(modeLabel);
            const secret = field(form, 'Passphrase or recovery words', 'password', 'secret'); secret.required = true;
            const submit = make('button', 'Unlock Locker', 'btn primary'); submit.type = 'submit'; form.append(submit);
            form.addEventListener('submit', (e) => {
                e.preventDefault(); if (!e.isTrusted) return;
                const value = secret.value; secret.value = '';
                run(submit, async () => { await request('unlock', { clicked: true, mode: mode.value, secret: value }); await unlocked(); });
            });
            body.append(form, make('p', 'Your passkey belongs to openvibe.locker and cannot unlock here. Use your recovery kit or open Locker.', 'note muted'));
            const open = make('a', 'Open Locker'); open.href = 'https://openvibe.locker/passwords'; open.target = '_blank'; open.rel = 'noopener'; body.append(open);
            body.append(button('Sign in to Companion', async () => { const r = await ask({ type: 'locker:signin', clicked: true }); if (!r?.ok) throw new Error('Sign-in could not finish. Try again.'); note.textContent = 'Signed in. Unlock with your Locker passphrase or recovery kit.'; }));
        }
        async function unlocked() {
            isUnlocked = true; lastActivity = Date.now();
            body.replaceChildren(); clearInterval(tick);
            const controls = make('div', '', 'locker-heading');
            controls.append(make('p', 'Locks after 15 minutes idle', 'note muted'), button('Lock now', async () => { await request('lock', { clicked: true }); locked(); }));
            body.append(controls);
            if (!context) { body.append(make('p', 'Open a website to fill or save a login.', 'muted')); return; }
            body.append(make('p', context.site, 'locker-origin'));
            const list = make('div'); body.append(list);
            const data = await request('list');
            if (!data.items.length) list.append(make('p', 'No saved logins for this exact site.', 'muted'));
            for (const item of data.items) {
                const card = make('article', '', 'locker-login'); card.append(make('h3', item.username || 'No username'));
                const actions = make('div', '', 'row');
                const act = (label, action, primary) => button(label, async () => {
                    await request(action, { id: item.id, clicked: true });
                    note.textContent = action === 'password' || action === 'totp' ? 'Copied. Clipboard clears in 30 seconds.' : action === 'submit' ? 'Filled and submitted.' : 'Filled.';
                }, primary ? 'btn primary' : 'btn');
                actions.append(act('Fill', 'fill', true), act('Fill and sign in', 'submit'), act('Copy password', 'password'));
                if (item.hasTotp) actions.append(act('Copy code', 'totp')); card.append(actions); list.append(card);
            }
            const details = make('details', '', 'locker-save'); details.append(make('summary', 'Save this login'));
            const form = make('form', '', 'locker-form');
            const username = field(form, 'Username', 'text', 'username'); const password = field(form, 'Password', 'password', 'password'); password.required = true;
            const totp = field(form, 'TOTP secret or otpauth link (optional)', 'password', 'totp');
            const save = make('button', 'Save encrypted login', 'btn primary'); save.type = 'submit'; form.append(save);
            form.addEventListener('submit', (e) => {
                e.preventDefault(); if (!e.isTrusted) return;
                const values = { username: username.value, password: password.value, totp: totp.value, clicked: true }; form.reset();
                run(save, async () => { await request('save', values); await unlocked(); note.textContent = 'Saved to Locker.'; });
            }); details.append(form); body.append(details);
            tick = setInterval(async () => { const s = await ask({ type: 'locker:status' }); if (!s?.ok || s.locked) locked(); }, 5000);
        }
        (async () => {
            const tab = await platform.tabs.active();
            try { const u = new URL(tab.url); if (['http:', 'https:'].includes(u.protocol)) context = { tabId: tab.id, site: u.origin }; } catch { /* internal tab */ }
            const state = await request('status'); if (state.locked) locked(); else await unlocked();
        })().catch(() => { locked(); note.textContent = 'Unlock Locker to continue.'; });
    }
    root.OVLockerPanel = { mount };
})(globalThis);
