'use strict';
/**
 * The extension never sends page content or URLs beyond the hostname: drive the popup controller
 * (the same code popup.js runs) over tabs whose URLs carry paths, queries, fragments, credentials
 * and personal data, and inspect every request the stub API receives.
 */
const assert = require('assert');
const host = require('../browser/lib/host');
const { createApiClient } = require('../browser/lib/api');
const { createPlatform } = require('../browser/lib/platform');
const { createController } = require('../browser/lib/controller');
const config = require('../browser/lib/config');
const { check, done, startStub, recordingFetch, fakeExt, COUPON, GOOD_TOKEN, REVOKED_TOKEN } = require('./helpers/harness');

const SECRETS = ['checkout', 'confirm', 'alice', 'mail.example', 'order', '4111', 'pay', 'session', 'hunter2', 'utm_'];

(async () => {
    const stub = await startStub();
    const popup = ({ url, token = null }) => {
        const ext = fakeExt({ url, token });
        const platform = createPlatform(ext, { ...config, API_ORIGIN: stub.origin });
        const f = recordingFetch();
        const api = createApiClient({ origin: stub.origin, fetch: f, getToken: platform.storage.getToken });
        return { ext, f, controller: createController({ api, platform, host }) };
    };
    const everything = () => stub.requests.map((r) => [r.method, r.url, JSON.stringify(r.headers), r.body].join(' ')).join('\n');

    await check('hostnameOf keeps only the hostname and drops everything else', async () => {
        assert.strictEqual(host.hostnameOf('https://user:hunter2@Shop.Acme-Outdoor.com:8443/checkout/confirm?email=alice@mail.example#pay'), 'shop.acme-outdoor.com');
        for (const u of ['chrome://settings', 'about:blank', 'file:///home/alice/cart.html', 'moz-extension://x/popup.html', 'https://192.168.1.10/', 'http://localhost:3000/', 'https://[::1]/', 'https://printer.local/', 'javascript:alert(1)', '', null]) {
            assert.strictEqual(host.hostnameOf(u), null, String(u));
        }
    });

    await check('opening the popup on a checkout page sends the hostname and a merchant id — nothing from the URL beyond the host', async () => {
        stub.requests.length = 0;
        const url = 'https://user:hunter2@www.acme-outdoor.com/checkout/confirm?email=alice%40mail.example&order=4111&session=abc&utm_source=x#pay';
        const { controller } = popup({ url, token: GOOD_TOKEN });
        const vm = await controller.open();
        assert.strictEqual(vm.state, 'merchant');
        assert.strictEqual(vm.host, 'www.acme-outdoor.com');
        assert.strictEqual(vm.connected, true);
        assert.deepStrictEqual(stub.requests.map((r) => `${r.method} ${r.url}`), [
            'GET /api/v1/merchants/resolve?host=www.acme-outdoor.com',
            `GET /api/v1/merchants/${vm.merchant.id}/coupons`,
        ]);
        const all = everything();
        for (const s of SECRETS) assert.ok(!all.includes(s), `"${s}" left the browser`);
        for (const r of stub.requests) {
            assert.strictEqual(r.body, '');
            assert.strictEqual(r.headers.cookie, undefined);
            assert.strictEqual(r.headers.referer, undefined);
        }
    });

    await check('reporting sends the code id and the outcome only', async () => {
        stub.requests.length = 0;
        const { controller } = popup({ url: 'https://acme-outdoor.com/cart?coupon=TRAIL15&email=alice@mail.example', token: GOOD_TOKEN });
        const r = await controller.report(COUPON.id, 'failed', 'invalid');
        assert.strictEqual(r.ok, true);
        assert.deepStrictEqual(stub.requests.map((x) => `${x.method} ${x.url} ${x.body}`), [`POST /api/v1/coupons/${COUPON.id}/report {"outcome":"failed","reason":"invalid"}`]);
        for (const s of SECRETS) assert.ok(!everything().includes(s), s);
    });

    await check('pages that are not shops send nothing at all', async () => {
        stub.requests.length = 0;
        for (const url of ['chrome://extensions', 'about:preferences', 'file:///tmp/x.html', 'https://10.0.0.1/admin', 'http://localhost:8080/', undefined]) {
            const vm = await popup({ url }).controller.open();
            assert.strictEqual(vm.state, 'not_a_site', String(url));
        }
        assert.strictEqual(stub.requests.length, 0);
    });

    await check('an unknown shop: one lookup with the hostname, a friendly "no codes" state', async () => {
        stub.requests.length = 0;
        const vm = await popup({ url: 'https://www.unknown-store.co.uk/basket/42' }).controller.open();
        assert.deepStrictEqual(vm, { state: 'no_merchant', host: 'www.unknown-store.co.uk' });
        assert.deepStrictEqual(stub.requests.map((r) => r.url), ['/api/v1/merchants/resolve?host=www.unknown-store.co.uk']);
    });

    await check('the only browser APIs touched are tabs.query (active tab), storage.local (the token) — no permission prompts on open', async () => {
        const p = popup({ url: 'https://acme-outdoor.com/', token: null });
        await p.controller.open();
        assert.deepStrictEqual([...new Set(p.ext.log.map((x) => x[0]))], ['tabs.query', 'storage.get']);
        assert.strictEqual(p.ext.log.filter((x) => x[0] === 'tabs.query').length, 1, 'the tab URL is read once');
        assert.deepStrictEqual(p.ext.log[0][1], { active: true, currentWindow: true });
        for (const [op, key] of p.ext.log.slice(1)) assert.deepStrictEqual([op, key], ['storage.get', 'installToken']);
    });

    await check('without a token the popup still shows codes and asks to connect before reporting; a revoked token says so', async () => {
        const vm = await popup({ url: 'https://acme-outdoor.com/' }).controller.open();
        assert.strictEqual(vm.connected, false);
        assert.strictEqual(vm.coupons.length, 1);
        const r = await popup({ url: 'https://acme-outdoor.com/' }).controller.report(COUPON.id, 'worked');
        assert.strictEqual(r.ok, false);
        assert.match(r.message, /Connect the extension/);
        const revoked = await popup({ url: 'https://acme-outdoor.com/', token: REVOKED_TOKEN }).controller.open();
        assert.strictEqual(revoked.state, 'error');
        assert.match(revoked.message, /disconnected on openvibe\.coupons/);
    });

    await check('storage: the token lives in storage.local only, and only a cpx_ token is ever saved', async () => {
        const ext = fakeExt({});
        const platform = createPlatform(ext, config);
        await assert.rejects(platform.storage.setToken('eyJhbGciOiJSUzI1NiJ9.network.jwt'), TypeError);
        await platform.storage.setToken(GOOD_TOKEN);
        assert.deepStrictEqual(ext.store, { installToken: GOOD_TOKEN });
        await platform.storage.clearToken();
        assert.deepStrictEqual(ext.store, {});
        ext.store.installToken = 'tampered';
        assert.strictEqual(await platform.storage.getToken(), null, 'a stored value that is not a cpx_ token is ignored');
    });

    await stub.close();
    done();
})();
