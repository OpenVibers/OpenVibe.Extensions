'use strict';
/**
 * The API client against a stub of the Coupons API: the right routes, the token only when there
 * is one, no cookies, no referrer, no redirects, errors as codes, timeouts, and input it refuses.
 */
const assert = require('assert');
const { createApiClient, ApiError } = require('../browser/lib/api');
const { check, done, startStub, recordingFetch, MERCHANT, COUPON, GOOD_TOKEN, REVOKED_TOKEN, NO_REPORT_TOKEN } = require('./helpers/harness');

(async () => {
    const stub = await startStub();
    const make = (token = null, extra = {}) => {
        const f = recordingFetch();
        return { f, api: createApiClient({ origin: stub.origin, fetch: f, getToken: async () => token, ...extra }) };
    };

    await check('resolve: a hostname in, the merchant out; unknown sites are null, not an error', async () => {
        const { api } = make();
        assert.deepStrictEqual(await api.resolve('www.acme-outdoor.com'), MERCHANT);
        assert.strictEqual(await api.resolve('other-shop.com'), null);
        assert.strictEqual(stub.requests[0].url, '/api/v1/merchants/resolve?host=www.acme-outdoor.com');
    });

    await check('coupons: the merchant\'s active codes', async () => {
        const { api } = make();
        const out = await api.coupons(MERCHANT.id);
        assert.deepStrictEqual(out.coupons, [COUPON]);
    });

    await check('without a token no Authorization header; with one, Bearer cpx_…; never cookies, never a referrer, no redirects', async () => {
        stub.requests.length = 0;
        const anon = make();
        await anon.api.resolve('acme-outdoor.com');
        assert.strictEqual(stub.requests[0].headers.authorization, undefined);
        const signed = make(GOOD_TOKEN);
        await signed.api.resolve('acme-outdoor.com');
        assert.strictEqual(stub.requests[1].headers.authorization, `Bearer ${GOOD_TOKEN}`);
        for (const c of [...anon.f.calls, ...signed.f.calls]) {
            assert.strictEqual(c.opts.credentials, 'omit');
            assert.strictEqual(c.opts.referrerPolicy, 'no-referrer');
            assert.strictEqual(c.opts.redirect, 'error');
            assert.ok(c.url.startsWith(stub.origin + '/api/v1/'));
        }
        for (const r of stub.requests) { assert.strictEqual(r.headers.cookie, undefined); assert.strictEqual(r.headers.referer, undefined); }
    });

    await check('report: needs a token; sends only the outcome (and a known reason for failures)', async () => {
        stub.requests.length = 0;
        await assert.rejects(make().api.report(COUPON.id, 'worked'), (e) => e instanceof ApiError && e.code === 'auth.required');
        assert.strictEqual(stub.requests.length, 0, 'nothing sent without a token');
        const { api } = make(GOOD_TOKEN);
        const out = await api.report(COUPON.id, 'failed', 'min_spend_not_met');
        assert.strictEqual(out.coupon.status, 'reported_working');
        assert.deepStrictEqual(JSON.parse(stub.requests[0].body), { outcome: 'failed', reason: 'min_spend_not_met' });
        await api.report(COUPON.id, 'worked', 'invalid');
        assert.deepStrictEqual(JSON.parse(stub.requests[1].body), { outcome: 'worked' }, 'no reason on a "worked" report');
        await api.report(COUPON.id, 'failed', '<script>');
        assert.deepStrictEqual(JSON.parse(stub.requests[2].body), { outcome: 'failed' }, 'unknown reasons are dropped');
    });

    await check('errors come back as codes: revoked, missing scope, rate limited, unavailable', async () => {
        await assert.rejects(make(REVOKED_TOKEN).api.resolve('acme-outdoor.com'), (e) => e.status === 401 && e.code === 'token.revoked');
        await assert.rejects(make(NO_REPORT_TOKEN).api.report(COUPON.id, 'worked'), (e) => e.status === 403 && e.code === 'token.scope');
        await assert.rejects(make().api.resolve('busy-shop.com'), (e) => e.status === 429);
        await assert.rejects(make().api.resolve('down.example-shop.com'), (e) => e.status === 503);
    });

    await check('check(token): accepted → true, refused → false, malformed → false without a request', async () => {
        stub.requests.length = 0;
        const { api } = make();
        assert.strictEqual(await api.check(GOOD_TOKEN), true);
        assert.strictEqual(await api.check(REVOKED_TOKEN), false);
        assert.strictEqual(await api.check('cpx_short'), false);
        assert.strictEqual(await api.check('eyJhbGciOiJSUzI1NiJ9.a.b'), false, 'a Network JWT is never sent');
        assert.strictEqual(stub.requests.length, 2);
    });

    await check('timeouts and unreachable servers are network errors', async () => {
        const slow = await startStub({ delayMs: 300 });
        const api = createApiClient({ origin: slow.origin, fetch: recordingFetch(), timeoutMs: 50 });
        await assert.rejects(api.resolve('acme-outdoor.com'), (e) => e.code === 'network.timeout');
        await slow.close();
        const gone = createApiClient({ origin: slow.origin, fetch: recordingFetch(), timeoutMs: 1000 });
        await assert.rejects(gone.resolve('acme-outdoor.com'), (e) => e.code === 'network.error');
    });

    await check('refused input: bad origins, ids, hosts, outcomes, and a stored value that is not a cpx_ token', async () => {
        assert.throws(() => createApiClient({ origin: 'http://openvibe.coupons', fetch }), /https/);
        assert.throws(() => createApiClient({ origin: 'https://openvibe.coupons/path', fetch }), /https/);
        const { api } = make();
        await assert.rejects(api.coupons('../admin'), TypeError);
        await assert.rejects(api.report('cpn_1/../../x', 'worked'), TypeError);
        await assert.rejects(api.resolve('https://acme-outdoor.com/cart?x=1'), TypeError);
        await assert.rejects(api.report(COUPON.id, 'great'), TypeError);
        await assert.rejects(make('not-a-token').api.resolve('acme-outdoor.com'), (e) => e.code === 'token.malformed');
    });

    await stub.close();
    done();
})();
