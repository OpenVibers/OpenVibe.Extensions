'use strict';
/**
 * The hand-offs (browser/lib/handoff.js): the Companion opens the Rent board or a new Watch with the
 * page you are on only when you press the button, only on openvibe.rent or openvibe.watch, and with
 * the page's credentials, fragment and tracking parameters gone. Opening the popup sends the Coupons
 * API the hostname and nothing more, as before.
 */
const assert = require('assert');
const host = require('../browser/lib/host');
const handoffLib = require('../browser/lib/handoff');
const { createApiClient } = require('../browser/lib/api');
const { createPlatform } = require('../browser/lib/platform');
const { createController } = require('../browser/lib/controller');
const config = require('../browser/lib/config');
const { check, done, startStub, fakeExt } = require('./helpers/harness');

const LISTING = 'https://user:hunter2@saltlakecity.craigslist.org/apa/d/sunny-2br/7790000001.html?lang=en&utm_source=share&fbclid=abc#photos';
const CLEAN = 'https://saltlakecity.craigslist.org/apa/d/sunny-2br/7790000001.html?lang=en';

(async () => {
    const stub = await startStub();
    const handoff = handoffLib.createHandoff(config);
    const popup = ({ url, title = '' }) => {
        const ext = fakeExt({ url, title });
        const platform = createPlatform(ext, { ...config, API_ORIGIN: stub.origin });
        const api = createApiClient({ origin: stub.origin, fetch, getToken: platform.storage.getToken });
        return { ext, controller: createController({ api, platform, host, handoff, isRental: handoffLib.isRental }) };
    };

    await check('cleanUrl drops credentials, the fragment and tracking parameters, and keeps what identifies the page', () => {
        assert.strictEqual(handoffLib.cleanUrl(LISTING), CLEAN);
        assert.strictEqual(handoffLib.cleanUrl('https://www.facebook.com/marketplace/item/100000000000001/?ref=search&gclid=x'), 'https://www.facebook.com/marketplace/item/100000000000001/?ref=search');
        ['chrome://settings', 'file:///home/a.html', 'javascript:alert(1)', 'about:blank', '', null, `https://a.com/${'x'.repeat(2100)}`]
            .forEach((u) => assert.strictEqual(handoffLib.cleanUrl(u), null, String(u).slice(0, 40)));
    });

    await check('the board and Watch addresses carry the cleaned page and a tidy title', () => {
        const b = new URL(handoff.boardUrl(LISTING, '  Sunny 2BR\n near the park  '));
        assert.strictEqual(b.origin + b.pathname, 'https://openvibe.rent/board');
        assert.deepStrictEqual(Object.fromEntries(b.searchParams), { url: CLEAN, title: 'Sunny 2BR near the park' });
        const w = new URL(handoff.watchUrl(LISTING, 'T'.repeat(300)));
        assert.strictEqual(w.origin + w.pathname, 'https://openvibe.watch/watches/new');
        assert.deepStrictEqual([w.searchParams.get('template'), w.searchParams.get('url'), w.searchParams.get('name').length], ['page', CLEAN, 80]);
        assert.strictEqual(handoff.boardUrl('chrome://extensions', 'x'), null);
        const f = new URL(handoff.fairUrl(LISTING, '$1,850 / 2br - Sunny'));
        assert.strictEqual(f.origin + f.pathname, 'https://openvibe.rent/fair', 'is this rent fair?');
        assert.deepStrictEqual(Object.fromEntries(f.searchParams), { url: CLEAN, title: '$1,850 / 2br - Sunny' });
        assert.strictEqual(handoff.fairUrl('file:///x.html', 'x'), null);
    });

    await check('rental sites lead with the board: the listing sites and Facebook Marketplace, not the rest of Facebook', () => {
        ['https://saltlakecity.craigslist.org/apa/1.html', 'https://www.zillow.com/homedetails/x', 'https://www.apartments.com/x/', 'https://www.facebook.com/marketplace/item/1/', 'https://www.airbnb.com/rooms/1']
            .forEach((u) => assert.ok(handoffLib.isRental(u), u));
        ['https://www.facebook.com/someone', 'https://www.amazon.com/dp/1', 'https://notzillow.com/x']
            .forEach((u) => assert.ok(!handoffLib.isRental(u), u));
    });

    await check('opening the popup opens nothing and sends the API the hostname only; pressing a button opens one tab', async () => {
        stub.requests.length = 0;
        const p = popup({ url: LISTING, title: 'Sunny 2BR - apts/housing for rent - craigslist' });
        await p.controller.open();
        assert.deepStrictEqual(p.ext.opened, [], 'nothing opens on its own');
        assert.deepStrictEqual(stub.requests.map((r) => r.url), ['/api/v1/merchants/resolve?host=saltlakecity.craigslist.org']);
        assert.deepStrictEqual(p.controller.page(), { handoff: true, rental: true, delivery: false, review: false });

        assert.deepStrictEqual(await p.controller.keepOnBoard(), { ok: true });
        assert.strictEqual(p.ext.opened.length, 1);
        assert.ok(p.ext.opened[0].startsWith('https://openvibe.rent/board?url='));
        assert.ok(!/hunter2|utm_|fbclid|#photos/.test(p.ext.opened[0]), 'nothing private or tracking goes along');
        await p.controller.watchPage();
        assert.ok(p.ext.opened[1].startsWith('https://openvibe.watch/watches/new?template=page&url='));
        assert.deepStrictEqual(await p.controller.checkRent(), { ok: true });
        assert.ok(p.ext.opened[2].startsWith('https://openvibe.rent/fair?url='), 'check the rent opens Rent\'s fair check');
        assert.ok(!/hunter2|utm_|fbclid|#photos/.test(p.ext.opened[2]));
        assert.strictEqual(stub.requests.length, 1, 'a hand-off is a tab you see, never a request the extension makes');
    });

    await check('pages that are not websites offer no hand-off, and platform.tabs.open refuses anywhere else', async () => {
        const p = popup({ url: 'chrome://extensions' });
        await p.controller.open();
        assert.deepStrictEqual(p.controller.page(), { handoff: false, rental: false, delivery: false, review: false });
        assert.strictEqual((await p.controller.keepOnBoard()).ok, false);
        assert.deepStrictEqual(p.ext.opened, []);
        const platform = createPlatform(fakeExt({}), config);
        await Promise.all(['https://evil.example/board', 'https://openvibe.rent.evil.example/x', 'javascript:alert(1)', 'https://openvibe.rentx/']
            .map((u) => assert.rejects(platform.tabs.open(u), TypeError, u)));
        await platform.tabs.open('https://openvibe.rent/board?url=x');
    });

    await check('a shop page that is not a rental leads with Watch', async () => {
        const p = popup({ url: 'https://acme-outdoor.com/tents/trail-2' });
        await p.controller.open();
        assert.deepStrictEqual(p.controller.page(), { handoff: true, rental: false, delivery: false, review: false });
    });

    await stub.close();
    done();
})();
