'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
require('../browser/shared/ov-locker-core');
const core = globalThis.OVLockerCore;
const payload = require('../browser/lib/locker-payload');
const passwords = require('../browser/lib/locker-passwords');
const { create, KEY, IDLE } = require('../browser/lib/locker-vault');
const { fill } = require('../browser/lib/locker-fill');
const SUBJECT = 'usr_01JAB2C3D4E5F6G7H8J9K0MNPQ', POPUP = 'chrome-extension://test/popup.html';

async function fixture() {
    let clock = 1000, active = { id: 1, url: 'https://example.test/login' }, account = 'owner';
    const memory = new Map(), ciphertexts = new Map(), writes = [], fills = [], clipboard = [];
    const person = await core.generatePersonKeys(); const priv = await core.exportPrivateKeys(person);
    const pass = 'test passphrase used only by fixtures';
    const recovery = 'test recovery words';
    const sealBackup = async (password) => Buffer.from((await core.seal(JSON.stringify(priv), { lock: 'password', password })).bytes).toString('base64');
    const backups = { passphrase: { envelope: await sealBackup(pass) }, recovery: { envelope: await sealBackup(recovery) } };
    const api = {
        keys: async () => ({ subject: SUBJECT, backups }), list: async () => [...ciphertexts.keys()].map((id) => ({ id })),
        content: async (id) => ciphertexts.get(id), save: async (bytes) => { ciphertexts.set(String(ciphertexts.size + 1), bytes); return { id: '1' }; },
    };
    const storage = { getSession: async (k) => memory.get(k), setSession: async (obj) => { writes.push(obj); for (const [k, v] of Object.entries(obj)) memory.set(k, v); }, removeSession: async (keys) => keys.forEach((k) => memory.delete(k)) };
    const options = { core, payload, passwords, api, storage, scheduleLock: async () => {}, cancelLock: async () => {}, tabs: { active: async () => active }, fill: async (...args) => { fills.push(args); return { ok: true }; }, clipboard: { write: async (v) => clipboard.push(v) }, account: async () => account, now: () => clock };
    const vault = create(options);
    const ask = (type, values = {}, sender = { url: POPUP }) => vault.handle({ type: 'locker:' + type, tabId: 1, site: 'https://example.test', ...values }, sender, POPUP);
    return { vault, ask, memory, fills, clipboard, api, options, writes, pass, recovery, ciphertexts,
        advance: (ms) => { clock += ms; }, active: (tab) => { active = tab; }, account: (id) => { account = id; } };
}

test('passphrase/recovery unlock, sealed save/list, local TOTP and explicit-click fill/copy only', async () => {
    const f = await fixture();
    assert.deepEqual(await f.ask('unlock', { secret: f.pass }), { ok: false });
    assert.deepEqual(await f.ask('unlock', { clicked: true, secret: f.pass }, { url: 'https://example.test' }), { ok: false });
    await f.ask('unlock', { clicked: true, secret: f.pass });
    assert.equal((await f.ask('status')).locked, false);
    await f.ask('save', { clicked: true, username: 'alice', password: 'fixture password', totp: 'otpauth://totp/x?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ' });
    assert.ok(!Buffer.from(f.ciphertexts.get('1')).includes(Buffer.from('fixture password')));
    assert.deepEqual((await f.ask('list')).items, [{ id: '1', username: 'alice', hasTotp: true }]);
    assert.equal(f.fills.length, 0, 'unlock and list never fill');
    assert.deepEqual(await f.ask('fill', { id: '1' }), { ok: false });
    assert.deepEqual(await f.ask('fill', { id: '1', clicked: true }, { url: POPUP, tab: { id: 1 } }), { ok: false });
    await f.ask('fill', { id: '1', clicked: true }); assert.equal(f.fills[0][2], false);
    await f.ask('submit', { id: '1', clicked: true }); assert.equal(f.fills[1][2], true);
    await f.ask('password', { id: '1', clicked: true }); assert.equal(f.clipboard[0], 'fixture password');
    await f.ask('totp', { id: '1', clicked: true }); assert.match(f.clipboard[1], /^\d{6}$/);
    assert.ok(!JSON.stringify(f.writes).includes('fixture password'), 'passwords never go to storage');
    await f.ask('lock', { clicked: true }); assert.equal(f.memory.has(KEY), false);
    await assert.rejects(f.ask('unlock', { clicked: true, secret: 'wrong' }), /could not unlock/);
    await f.ask('unlock', { clicked: true, mode: 'recovery', secret: '  TEST   recovery WORDS  ' });
    assert.equal((await f.ask('status')).locked, false);
});

test('idle expiry survives worker restart; polling does not keep it unlocked; browser restart and account change lock', async () => {
    const f = await fixture(); await f.ask('unlock', { clicked: true, secret: f.pass });
    f.advance(IDLE - 1); assert.equal((await f.ask('status')).locked, false);
    const restarted = create(f.options); f.advance(1); assert.equal(await restarted.state(), null); assert.equal(f.memory.has(KEY), false);
    await f.ask('unlock', { clicked: true, secret: f.pass });
    f.advance(IDLE - 1); await f.ask('activity', { clicked: true }); f.advance(IDLE - 1);
    assert.equal((await f.ask('status')).locked, false, 'trusted popup activity extends the deadline');
    f.memory.clear(); assert.equal((await f.ask('status')).locked, true, 'storage.session clears at browser restart');
    await f.ask('unlock', { clicked: true, secret: f.pass }); f.account('other'); assert.equal((await f.ask('status')).locked, true);
});

test('saved origin never follows subdomains, protocol changes, another active tab or navigation', async () => {
    const f = await fixture(); await f.ask('unlock', { clicked: true, secret: f.pass });
    await f.ask('save', { clicked: true, username: 'alice', password: 'fixture password' });
    for (const site of ['https://sub.example.test', 'http://example.test', 'https://example.test:444']) {
        f.active({ id: 1, url: site });
        await assert.rejects(f.ask('fill', { id: '1', clicked: true }), /active tab changed/);
        await assert.rejects(f.ask('fill', { id: '1', site, clicked: true }), /different origin/);
    }
    f.active({ id: 2, url: 'https://example.test' }); await assert.rejects(f.ask('fill', { id: '1', clicked: true }), /active tab changed/);
    assert.equal(f.fills.length, 0);
});

test('locking during a pending decrypt cancels the fill', async () => {
    const f = await fixture(); await f.ask('unlock', { clicked: true, secret: f.pass });
    await f.ask('save', { clicked: true, username: 'alice', password: 'fixture password' });
    let release, entered;
    const started = new Promise((r) => { entered = r; });
    f.api.content = () => { entered(); return new Promise((r) => { release = r; }); };
    const pending = f.ask('fill', { id: '1', clicked: true }); await started; await f.vault.lock(); release(f.ciphertexts.get('1'));
    await assert.rejects(pending, /locked/); assert.equal(f.fills.length, 0);
});

function page({ site = 'https://example.test', frame = false, clicked = true, submit = false, hidden = false, navigate = false } = {}) {
    const calls = []; const form = { querySelectorAll: () => [username, password] };
    class Input { set value(v) { calls.push(v); } }
    class Form { requestSubmit() { calls.push('submit'); } }
    const input = (type, name) => Object.assign(new Input(), { type, name, id: name, autocomplete: name, form, isConnected: true, getClientRects: () => hidden ? [] : [{ width: 160, height: 40 }], closest: () => null, dispatchEvent: () => { if (navigate) ctx.location.origin = 'https://evil.test'; } });
    const username = input('text', 'username'), password = input('password', 'password');
    const win = {}; win.top = frame ? {} : win;
    const ctx = { window: win, location: { origin: site }, document: { querySelectorAll: () => [password] }, HTMLInputElement: Input, HTMLFormElement: Form, Event: class {}, getComputedStyle: () => ({ display: 'block', visibility: 'visible', opacity: '1' }) };
    const result = vm.runInNewContext('(' + fill.toString() + ')(login, submit, clicked)', { ...ctx, login: { site: 'https://example.test', username: 'alice', password: 'fixture password' }, submit, clicked });
    return { result, calls };
}
test('injected function rechecks origin and top frame before typing and submits only on explicit request', () => {
    assert.deepEqual(page().calls, ['alice', 'fixture password']); assert.deepEqual(page({ submit: true }).calls, ['alice', 'fixture password', 'submit']);
    for (const opts of [{ site: 'https://sub.example.test' }, { site: 'http://example.test' }, { frame: true }, { clicked: false }, { hidden: true }]) assert.deepEqual(page(opts).calls, []);
    assert.deepEqual(page({ navigate: true }).calls, ['alice'], 'navigation from a username handler prevents password typing');
});

test('clipboard clear is scheduled outside popup, replacement resets the deadline, and TOTP matches RFC vector', async () => {
    const { create } = require('../browser/lib/locker-clipboard'); let callback, delay, cancelled = 0; const writes = [];
    const c = create({ write: async (v) => writes.push(v), later: (cb, ms) => { callback = cb; delay = ms; return 1; }, cancel: () => { cancelled++; } });
    await c.write('fixture password'); assert.equal(delay, 30000); await c.write('123456'); assert.equal(cancelled, 2);
    callback(); await c.clear(); assert.equal(writes.at(-1), '');
    assert.equal(await passwords.totp('otpauth://totp/x?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', 59000), '287082');
    const bg = fs.readFileSync('browser/background.js', 'utf8'); assert.match(bg, /onStartup.addListener\(\(\) => \{ vault.lock\(\)/);
});


test('platform injection targets only the active top frame in the isolated world', async () => {
    const { createPlatform } = require('../browser/lib/platform');
    const calls = []; globalThis.self = { OVLockerFill: { fill } };
    try {
        const p = createPlatform({ scripting: { executeScript: async (arg) => { calls.push(arg); return [{ result: { ok: true } }]; } } }, {});
        await p.scripting.fillLogin(42, { site: 'https://example.test', username: 'alice', password: 'fixture' }, false);
        assert.deepEqual(calls[0].target, { tabId: 42, allFrames: false });
        assert.equal(calls[0].world, 'ISOLATED'); assert.equal(calls[0].func, fill); assert.equal(calls[0].args[2], true);
    } finally { delete globalThis.self; }
});

test('Locker HTTP client only sends the token and sealed bytes; failure bodies are not reflected', async () => {
    const { create } = require('../browser/lib/locker-api'); const requests = [];
    const client = create({ origin: 'https://openvibe.locker', getToken: async () => 'fixture-token', fetch: async (url, options) => {
        requests.push({ url, options }); return new Response(JSON.stringify({ id: 'fixture' }), { status: 201 });
    } });
    const sealed = (await core.seal('fixture password', { lock: 'password', password: 'fixture passphrase' })).bytes;
    await client.save(sealed);
    assert.equal(requests[0].url, 'https://openvibe.locker/api/v1/companion/logins');
    assert.equal(requests[0].options.credentials, 'omit'); assert.equal(requests[0].options.redirect, 'error');
    const wire = Buffer.from(await requests[0].options.body.arrayBuffer());
    assert.deepEqual(wire, Buffer.from(sealed)); assert.ok(!wire.includes(Buffer.from('fixture password')));
    const bad = create({ origin: 'https://openvibe.locker', getToken: async () => 'fixture-token', fetch: async () => new Response('sensitive remote error', { status: 500 }) });
    await assert.rejects(bad.keys(), (e) => !e.message.includes('sensitive') && /Locker/.test(e.message));
});
