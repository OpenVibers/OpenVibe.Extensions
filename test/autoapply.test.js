'use strict';
/**
 * "Try these codes on this page" (browser/lib/autoapply.js, platform.scripting.tryCodes, controller.tryCodes) and the
 * delivery comparison hand-off:
 *   - amounts in the forms shops print them; which fields are coupon boxes; which buttons are never pressed;
 *   - the popup injects the one packaged file into the active tab only, codes reported working first, at most ten,
 *     never one reported not working, and says what happened;
 *   - a delivery app's page opens openvibe.food/delivery with the restaurant's name and nothing else;
 *   - and, when a Chrome is installed, the module itself on three fixture checkout pages (scripts/check-autoapply.js).
 */
const assert = require('assert');
const auto = require('../browser/lib/autoapply');
const host = require('../browser/lib/host');
const handoffLib = require('../browser/lib/handoff');
const { createApiClient } = require('../browser/lib/api');
const { createPlatform } = require('../browser/lib/platform');
const { createController } = require('../browser/lib/controller');
const config = require('../browser/lib/config');
const { check, done, startStub, fakeExt } = require('./helpers/harness');

const field = (attrs, labels = []) => ({
    tagName: 'INPUT', type: attrs.type || 'text', name: attrs.name || '', id: attrs.id || '',
    getAttribute: (k) => (attrs[k] == null ? null : attrs[k]), labels: labels.map((t) => ({ textContent: t })),
});

(async () => {
    const stub = await startStub();
    const handoff = handoffLib.createHandoff(config);
    const popup = ({ url, title = '', scriptResult = null }) => {
        const ext = fakeExt({ url, title, scriptResult });
        const platform = createPlatform(ext, { ...config, API_ORIGIN: stub.origin });
        const api = createApiClient({ origin: stub.origin, fetch, getToken: platform.storage.getToken });
        return { ext, controller: createController({ api, platform, host, handoff, isRental: handoffLib.isRental }) };
    };

    await check('amounts as shops print them', () => {
        const cases = [['$54.00', 54], ['Order total: $1,234.56', 1234.56], ['€1.234,56', 1234.56], ['1 234,56 €', 1234.56], ['£12', 12], ['USD 9.99', 9.99], ['Total $0.00', 0], ['no amount here', null], ['Save $5 — total $45.10', 45.1]];
        for (const [text, want] of cases) assert.strictEqual(auto.parseAmount(text), want, text);
    });

    await check('coupon boxes are told apart from the other checkout fields', () => {
        assert.ok(auto.isCouponField(field({ name: 'promo_code' })));
        assert.ok(auto.isCouponField(field({ placeholder: 'Enter coupon code' })));
        assert.ok(auto.isCouponField(field({ id: 'x' }, ['Discount code'])));
        assert.ok(auto.isCouponField(field({ 'aria-label': 'Gift card or discount code' })));
        assert.ok(!auto.isCouponField(field({ name: 'email', placeholder: 'Email for offers' })), 'an email field');
        assert.ok(!auto.isCouponField(field({ name: 'card_number', placeholder: 'Card number' })));
        assert.ok(!auto.isCouponField(field({ name: 'zip' })));
        assert.ok(!auto.isCouponField(field({ name: 'promo', type: 'password' })), 'not a text box');
        assert.ok(!auto.isCouponField({ ...field({ name: 'promo' }), tagName: 'SELECT' }));
    });

    await check('an Apply button is pressed; ordering, paying and leaving never are', () => {
        for (const t of ['Apply', 'Apply code', 'Redeem', 'Use code', 'Add']) assert.ok(auto.APPLY_RE.test(t) && !auto.DANGER_RE.test(t), t);
        for (const t of ['Place order', 'Pay now', 'Continue to checkout', 'Checkout', 'Buy now', 'Complete order', 'Submit order', 'Remove', 'Proceed to payment', 'Add to cart', 'Add to bag']) {
            assert.ok(auto.DANGER_RE.test(t), t);
        }
    });

    await check('the popup injects only lib/autoapply.js, in the active tab, with the codes worth trying first', async () => {
        const p = popup({ url: 'https://shop.acme-outdoor.com/cart', scriptResult: { ok: true, before: 54, after: 44, results: [
            { id: 'w', code: 'GOOD', outcome: 'failed', before: 54, after: 54 }, { id: 'u', code: 'SAVE10', outcome: 'worked', before: 54, after: 44 }] } });
        await p.controller.open();
        const coupons = [
            { id: 'u', code: 'SAVE10', status: 'unknown' }, { id: 'n', code: 'DEAD', status: 'reported_not_working' },
            { id: 'w', code: 'GOOD', status: 'reported_working' }, ...Array.from({ length: 12 }, (_, i) => ({ id: `x${i}`, code: `X${i}`, status: 'unknown' })),
        ];
        const r = await p.controller.tryCodes(coupons);
        const calls = p.ext.log.filter((l) => l[0] === 'scripting.executeScript').map((l) => l[1]);
        assert.strictEqual(calls.length, 2);
        assert.deepStrictEqual(calls[0], { target: { tabId: 1 }, files: ['lib/autoapply.js'] });
        assert.deepStrictEqual(calls[1].target, { tabId: 1 });
        const sent = calls[1].args[0];
        assert.strictEqual(sent.length, config.MAX_TRIES, 'at most ten codes');
        assert.deepStrictEqual(sent.slice(0, 2).map((c) => c.code), ['GOOD', 'SAVE10'], 'reported working first');
        assert.ok(!sent.some((c) => c.code === 'DEAD'), 'never a code reported not working');
        assert.deepStrictEqual(Object.keys(sent[0]).sort(), ['code', 'id'], 'only the code and its id reach the page');
        assert.strictEqual(r.ok, true);
        assert.match(r.message, /Applied SAVE10: the total went down by 10\.00\. Check the total before you pay\./);
        assert.deepStrictEqual(r.results.map((x) => [x.code, x.outcome, x.saved]), [['GOOD', 'failed', null], ['SAVE10', 'worked', 10]]);
    });

    await check('no coupon box, or no Apply button: it says so and presses nothing', async () => {
        for (const [reason, re] of [['no_field', /No coupon box on this page/], ['no_apply', /no Apply button next to it, so nothing was pressed/]]) {
            const p = popup({ url: 'https://shop.example.com/checkout', scriptResult: { ok: false, reason, before: 20, after: 20, results: [] } });
            await p.controller.open();
            const r = await p.controller.tryCodes([{ id: 'a', code: 'A', status: 'unknown' }]);
            assert.strictEqual(r.ok, false);
            assert.match(r.message, re);
        }
        const none = popup({ url: 'https://shop.example.com/' });
        await none.controller.open();
        assert.strictEqual((await none.controller.tryCodes([{ id: 'n', code: 'X', status: 'reported_not_working' }])).ok, false);
        assert.strictEqual(none.ext.log.filter((l) => l[0] === 'scripting.executeScript').length, 0, 'nothing injected without a code to try');
    });

    await check('a delivery app\'s page opens the comparison on openvibe.food with the restaurant\'s name only', async () => {
        const cases = [
            ['https://www.doordash.com/store/chipotle-123/?cart=abc#menu', 'Chipotle Mexican Grill Delivery Menu | 123 Main St San Francisco | DoorDash', 'Chipotle Mexican Grill'],
            ['https://www.ubereats.com/store/chipotle/xyz', 'Order Chipotle (Market St) Menu Delivery Online | San Francisco | Uber Eats', 'Chipotle'],
            ['https://www.grubhub.com/restaurant/joes-pizza/1', 'Joe\'s Pizza - Delivery & Pickup | Grubhub', 'Joe\'s Pizza'],
            ['https://www.instacart.com/store/costco/storefront', 'Costco Delivery Near Me | Instacart', 'Costco'],
            ['https://www.doordash.com/', 'DoorDash Food Delivery', null],
        ];
        for (const [url, title, q] of cases) {
            const u = new URL(handoff.deliveryUrl(url, title));
            assert.strictEqual(u.origin + u.pathname, 'https://openvibe.food/delivery');
            assert.strictEqual(u.searchParams.get('q'), q, title);
            assert.ok(!u.search.includes('123') && !u.search.includes('cart'), 'no address or cart');
        }
        assert.strictEqual(handoff.deliveryUrl('https://acme.com/pizza', 'Pizza'), null, 'not a delivery app');
        const p = popup({ url: cases[0][0], title: cases[0][1] });
        await p.controller.open();
        assert.deepStrictEqual(p.controller.page(), { handoff: true, rental: false, delivery: true });
        assert.deepStrictEqual(p.ext.opened, []);
        assert.strictEqual((await p.controller.compareDelivery()).ok, true);
        assert.deepStrictEqual(p.ext.opened, ['https://openvibe.food/delivery?q=Chipotle+Mexican+Grill']);
    });

    await check('in a real browser: three fixture checkout pages (skipped without Chrome)', async () => {
        const r = await require('../scripts/check-autoapply').main();
        if (r.skipped) { console.log(`      skipped: ${r.skipped}`); return; }
        assert.deepStrictEqual(r.failures, []);
    });

    await stub.close();
    done();
})();
