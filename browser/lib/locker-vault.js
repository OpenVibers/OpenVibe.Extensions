(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api; else root.OVLockerVault = api;
})(globalThis, function () {
    'use strict';
    const IDLE = 15 * 60 * 1000, KEY = 'lockerUnlock';
    const EXACT_HTTPS_ORIGIN = /^https:\/\/[a-z0-9.-]+(:[0-9]{1,5})?$/;
    const FILL_REQUEST_ID = /^fr_[A-Za-z0-9_-]{16,64}$/;
    function origin(url) {
        try { const u = new URL(url); return ['https:', 'http:'].includes(u.protocol) && !u.username && !u.password ? u.origin : null; } catch { return null; }
    }
    function create({ core, payload, passwords, api, fillApi = null, storage, scheduleLock, cancelLock, tabs, fill, clipboard, account, now = Date.now }) {
        let generation = 0, mutations = Promise.resolve();
        function persist(saved, version) {
            mutations = mutations.catch(() => {}).then(async () => {
                if (version !== generation) throw new Error('Locker locked. Unlock again.');
                await storage.setSession({ [KEY]: saved }); await scheduleLock(saved.expires);
            });
            return mutations;
        }
        async function lock() {
            generation++;
            mutations = mutations.catch(() => {}).then(async () => { await storage.removeSession([KEY]); await cancelLock(); });
            await mutations; return { locked: true };
        }
        async function state(touch = false) {
            const version = generation;
            const saved = await storage.getSession(KEY);
            if (!saved) return null;
            if (version !== generation) return null;
            if (now() >= saved.expires || saved.account !== await account()) { await lock(); return null; }
            if (touch) { saved.expires = now() + IDLE; await persist(saved, version); }
            return saved;
        }
        async function active(message) {
            const tab = await tabs.active();
            const site = origin(tab.url);
            if (!site || tab.id !== message.tabId || site !== message.site) throw new Error('The active tab changed. Open Companion again.');
            return tab;
        }
        async function unlocked() {
            const version = generation;
            const s = await state(true);
            if (!s) throw new Error('Unlock your Locker first.');
            return { ...s, person: await core.importPersonKeys(s.privateKeys), generation: version };
        }
        async function still(s) {
            if (generation !== s.generation || !(await state()) || s.account !== await account()) throw new Error('Locker locked. Unlock again.');
        }
        async function read(id, s) {
            const bytes = await api.content(id);
            if (bytes.byteLength > 2 * 1024 ** 2) throw new Error('This login is too large.');
            const plain = await core.open(bytes, { privateKey: s.person.ecdhPrivateKey, subject: { type: 'user', id: s.subject } });
            const opened = await payload.unpack(new Blob([plain]).stream());
            const login = JSON.parse(await new Response(opened.stream).text());
            if (login.version !== 1 || origin(login.site) !== login.site || typeof login.username !== 'string' || typeof login.password !== 'string') throw new Error('Invalid saved login.');
            return login;
        }
        async function handle(m, sender, popupUrl) {
            // Web pages, iframes, panel, options and offscreen document cannot invoke password operations.
            if (sender?.url !== popupUrl || sender?.tab || !m || !m.type.startsWith('locker:')) return { ok: false };
            const action = m.type.slice(7);
            if (action === 'status') return { ok: true, locked: !(await state()) };
            if (m.clicked !== true && action !== 'list') return { ok: false };
            if (action === 'activity') return { ok: true, locked: !(await state(true)) };
            if (action === 'lock') return { ok: true, ...await lock() };
            if (action === 'fill-list') {
                if (!fillApi) throw new Error('Sign-in approvals are unavailable.');
                const data = await fillApi.requests();
                return { ok: true, requests: Array.isArray(data.requests) ? data.requests : [] };
            }
            if (action === 'fill-targets') {
                if (!fillApi) throw new Error('Sign-in approvals are unavailable.');
                const data = await fillApi.targets();
                return { ok: true, machines: Array.isArray(data.machines) ? data.machines : [] };
            }
            if (action === 'fill-grant') {
                if (!fillApi || typeof m.request_id !== 'string' || typeof m.envelope !== 'string' || m.clicked !== true) throw new Error('Choose a sign-in request first.');
                const data = await fillApi.grant(m.request_id, m.envelope);
                return { ok: true, outcome: data.outcome === 'ok' ? 'ok' : 'failed', reason: data.reason || null };
            }
            if (action === 'fill-site-list') {
                if (m.clicked !== true || typeof m.origin !== 'string' || !EXACT_HTTPS_ORIGIN.test(m.origin) || origin(m.origin) !== m.origin) throw new Error('Choose a valid site.');
                const s = await unlocked();
                const items = [];
                for (const item of await api.list()) {
                    const login = await read(item.id, s);
                    if (login.site === m.origin) items.push({ id: item.id, username: login.username, hasTotp: !!login.totp });
                    login.username = ''; login.password = ''; login.totp = '';
                }
                await still(s);
                return { ok: true, items };
            }
            if (action === 'seal-fill') {
                if (!fillApi || m.clicked !== true || !FILL_REQUEST_ID.test(String(m.request_id || '')) || typeof m.origin !== 'string' || !EXACT_HTTPS_ORIGIN.test(m.origin) || origin(m.origin) !== m.origin
                    || !/^lnk_[0-9A-HJKMNP-TV-Z]{26}$/.test(String(m.machine_id || '')) || typeof m.item_id !== 'string') throw new Error('Choose a valid sign-in request.');
                const s = await unlocked();
                const requests = await fillApi.requests();
                const pending = (requests.requests || []).find((r) => r.id === m.request_id && r.origin === m.origin && r.machine_node_id === m.machine_id && r.expires_at > now());
                if (!pending) throw new Error('That sign-in request is no longer waiting.');
                const targets = await fillApi.targets();
                const target = (targets.machines || []).find((machine) => machine.id === m.machine_id);
                if (!target || typeof target.public_key !== 'object' || typeof target.thumbprint !== 'string') throw new Error('That computer is not one of yours, so nothing can be sent to it.');
                const login = await read(m.item_id, s);
                if (login.site !== m.origin) throw new Error('This saved login belongs to a different site.');
                const grant = { request_id: m.request_id, origin: m.origin, username: login.username, password: login.password, submit: m.submit === true, exp: now() + 60_000 };
                if (m.include_code === true && login.totp) grant.code = await passwords.totp(login.totp);
                const plain = new TextEncoder().encode(JSON.stringify(grant));
                try {
                    const envelope = await core.seal(plain, { lock: 'people', keys: [{ subject: { type: 'link', id: m.machine_id }, publicKey: target.public_key }] });
                    await still(s);
                    let binary = ''; for (const b of envelope.bytes) binary += String.fromCharCode(b);
                    return { ok: true, envelope: btoa(binary), thumbprint: target.thumbprint };
                } finally {
                    plain.fill(0); grant.username = ''; grant.password = ''; grant.code = '';
                    login.username = ''; login.password = ''; login.totp = '';
                }
            }
            if (action === 'unlock') {
                await lock(); const g = generation;
                const owner = await account();
                const keys = await api.keys();
                const mode = m.mode === 'recovery' ? 'recovery' : 'passphrase';
                const backup = keys.backups?.[mode];
                if (!backup?.envelope) throw new Error('Use your recovery kit, or open Locker to set up a passphrase. Passkeys belong to openvibe.locker.');
                const secret = mode === 'recovery' ? String(m.secret).trim().toLowerCase().split(/\s+/).join(' ') : m.secret;
                const bytes = Uint8Array.from(atob(backup.envelope), (c) => c.charCodeAt(0));
                let privateKeys;
                try {
                    privateKeys = JSON.parse(new TextDecoder().decode(await core.open(bytes, { password: secret })));
                    await core.importPersonKeys(privateKeys);
                } catch { throw new Error('That passphrase or recovery kit could not unlock Locker.'); }
                if (g !== generation || owner !== await account()) throw new Error('Sign-in changed. Try again.');
                const expires = now() + IDLE;
                await persist({ privateKeys, subject: keys.subject, account: owner, expires }, g);
                return { ok: true, locked: false };
            }
            await active(m);
            const s = await unlocked();
            if (action === 'list') {
                const items = [];
                for (const item of await api.list()) {
                    const login = await read(item.id, s);
                    if (login.site === m.site) items.push({ id: item.id, username: login.username, hasTotp: !!login.totp });
                }
                await still(s); await active(m);
                return { ok: true, items };
            }
            if (action === 'save') {
                if (typeof m.username !== 'string' || typeof m.password !== 'string' || !m.password || m.password.length > 16384 || m.username.length > 4096) throw new Error('Enter a username and password.');
                if (m.totp) await passwords.totp(m.totp);
                const login = { version: 1, site: m.site, username: m.username, password: m.password, totp: m.totp || '', notes: '' };
                const body = new Blob([JSON.stringify(login)]);
                const packed = new Uint8Array(await new Response(payload.pack({ name: 'login.json', type: 'application/json', size: body.size }, body.stream())).arrayBuffer());
                const sealed = await core.seal(packed, { lock: 'people', keys: [{ subject: { type: 'user', id: s.subject }, publicKey: s.person.ecdhPublic }] });
                await still(s); await active(m); await api.save(sealed.bytes);
                return { ok: true };
            }
            if (!['fill', 'submit', 'password', 'totp'].includes(action)) return { ok: false };
            const login = await read(m.id, s);
            if (login.site !== m.site) throw new Error('This login belongs to a different origin.');
            await still(s); const tab = await active(m);
            if (action === 'fill' || action === 'submit') return await fill(tab.id, { site: login.site, username: login.username, password: login.password }, action === 'submit');
            await clipboard.write(action === 'totp' ? await passwords.totp(login.totp) : login.password);
            return { ok: true };
        }
        return { handle, lock, state };
    }
    return { create, origin, IDLE, KEY };
});
