'use strict';
/**
 * "Save its rating to OpenVibe Reviews" (browser/lib/rating.js, handoff.reviewUrl, platform.scripting.readRating,
 * controller.saveRating):
 *   - the rating a page publishes for search engines (JSON-LD aggregateRating, an EmployerAggregateRating, @graph),
 *     and, without it, the stars' own labels ("4.5 star rating", "4.5 of 5 bubbles", "Rated 4.2 out of 5");
 *   - which pages are review sites (Google only on Maps; Yelp only on a business page);
 *   - the button opens openvibe.reviews/save with the page, its name and the numbers, for the person to check there,
 *     and nothing is read before the press; a page that cannot be read still opens the form, without numbers.
 */
const assert = require('assert');
const rating = require('../browser/lib/rating');
const host = require('../browser/lib/host');
const handoffLib = require('../browser/lib/handoff');
const { createApiClient } = require('../browser/lib/api');
const { createPlatform } = require('../browser/lib/platform');
const { createController } = require('../browser/lib/controller');
const config = require('../browser/lib/config');
const { check, done, startStub, fakeExt } = require('./helpers/harness');

const GD = 'https://www.glassdoor.com/Overview/Working-at-Acme-EI_IE12345.11,15.htm';
const YELP = 'https://www.yelp.com/biz/joes-pizza-new-york?osq=pizza&utm_source=x#reviews';

(async () => {
    const stub = await startStub();
    const handoff = handoffLib.createHandoff(config);
    const popup = ({ url, title = '', scriptResult = null }) => {
        const ext = fakeExt({ url, title, scriptResult });
        const platform = createPlatform(ext, { ...config, API_ORIGIN: stub.origin });
        const api = createApiClient({ origin: stub.origin, fetch, getToken: platform.storage.getToken });
        return { ext, controller: createController({ api, platform, host, handoff, isRental: handoffLib.isRental }) };
    };

    await check('numbers as pages print them', () => {
        for (const [s, want] of [['4.5', 4.5], ['4,5', 4.5], ['1,234', 1234], ['1.234', 1234], ['12 345', 12345], [{ '@value': '3.9' }, 3.9], ['n/a', null], ['', null], [null, null]]) {
            assert.strictEqual(rating.num(s), want, JSON.stringify(s));
        }
    });

    await check('JSON-LD: a restaurant, an employer rating on its own, a @graph, and junk around them', () => {
        const restaurant = JSON.stringify({ '@context': 'https://schema.org', '@type': 'Restaurant', name: "Joe's Pizza", address: { '@type': 'PostalAddress', addressLocality: 'New York', addressRegion: 'NY' },
            aggregateRating: { '@type': 'AggregateRating', ratingValue: '4.5', reviewCount: '9,812' } });
        assert.deepStrictEqual(rating.fromJsonLd(['{not json', '{"@type":"BreadcrumbList"}', restaurant]),
            { name: "Joe's Pizza", value: 4.5, best: 5, count: 9812, place: 'New York, NY', type: 'Restaurant', how: 'structured' });
        const employer = JSON.stringify({ '@context': 'https://schema.org', '@type': 'EmployerAggregateRating', itemReviewed: { '@type': 'Organization', name: 'Acme Corp' }, ratingValue: 3.9, bestRating: 5, ratingCount: 1234 });
        assert.deepStrictEqual(rating.fromJsonLd([employer]), { name: 'Acme Corp', value: 3.9, best: 5, count: 1234, place: '', type: 'Organization', how: 'structured' });
        const graph = JSON.stringify({ '@graph': [{ '@type': 'WebPage' }, { '@type': 'LocalBusiness', name: 'Acme Plumbing', aggregateRating: { ratingValue: '8.6', bestRating: '10', ratingCount: '40' } }] });
        assert.strictEqual(rating.fromJsonLd([graph]).value, 8.6);
        assert.strictEqual(rating.fromJsonLd([graph]).best, 10);
        // A rating above its own scale is not a rating.
        assert.strictEqual(rating.fromJsonLd([JSON.stringify({ name: 'X', aggregateRating: { ratingValue: '7', bestRating: '5' } })]), null);
    });

    await check('the stars\' labels, in page order, with the count that follows', () => {
        assert.deepStrictEqual(rating.fromLabels(['Close', 'Menu', '4.5 star rating', '1,234 reviews']), { value: 4.5, best: 5, count: 1234, how: 'page' });
        assert.deepStrictEqual(rating.fromLabels(['4.5 of 5 bubbles', '(2,001)']), { value: 4.5, best: 5, count: 2001, how: 'page' });
        assert.deepStrictEqual(rating.fromLabels(['Rated 4.2 out of 5 stars']), { value: 4.2, best: 5, count: null, how: 'page' });
        assert.deepStrictEqual(rating.fromLabels(['4.3 stars', 'Directions', '312 reviews']), { value: 4.3, best: 5, count: 312, how: 'page' });
        assert.strictEqual(rating.fromLabels(['Share', 'Save', '5 photos']), null);
        assert.strictEqual(rating.nameFrom('', "Joe's Pizza - New York, NY - Yelp"), "Joe's Pizza");
        assert.strictEqual(rating.nameFrom('', 'Acme Corp Reviews | Glassdoor'), 'Acme Corp');
    });

    await check('read(): JSON-LD first, the labels otherwise, from a document', () => {
        const doc = (scripts, labels, h1, title) => ({
            title,
            querySelector: (sel) => (sel === 'h1' && h1 ? { textContent: h1 } : null),
            querySelectorAll: (sel) => (sel.startsWith('script') ? scripts.map((t) => ({ textContent: t })) : labels.map((l) => ({ getAttribute: (k) => (k === 'aria-label' ? l : null) }))),
        });
        assert.strictEqual(rating.read(doc([JSON.stringify({ '@type': 'Organization', name: 'Acme', aggregateRating: { ratingValue: 4.1, ratingCount: 10 } })], ['2 star rating'], 'Acme Corp', '')).value, 4.1);
        assert.deepStrictEqual(rating.read(doc([], ['4 star rating', '88 reviews'], "Joe's Pizza", '')), { value: 4, best: 5, count: 88, how: 'page', name: "Joe's Pizza", place: '', type: '' });
        assert.deepStrictEqual(rating.read(doc([], [], '', 'Acme | Trustpilot')), { name: 'Acme', value: null, best: 5, count: null, place: '', type: '', how: 'none' });
    });

    await check('review sites: which pages count', () => {
        const yes = [GD, 'https://www.indeed.com/cmp/Acme/reviews', YELP, 'https://www.bbb.org/us/ny/new-york/profile/plumber/acme-0121-1', 'https://www.trustpilot.com/review/acme.com',
            'https://www.google.com/maps/place/Joe%27s+Pizza/@40.7,-73.9,17z', 'https://www.tripadvisor.com/Restaurant_Review-g60763-d1-Reviews-Joes_Pizza-New_York_City_New_York.html', 'https://www.glassdoor.co.uk/Reviews/Acme-Reviews-E1.htm'];
        for (const u of yes) assert.ok(handoffLib.reviewSite(u), u);
        const no = ['https://www.google.com/search?q=acme', 'https://www.yelp.com/search?find_desc=pizza', 'https://www.indeed.com/jobs?q=x', 'http://www.glassdoor.com/x', 'https://glassdoor.com.evil.example/x', 'https://notyelp.com/biz/x', 'https://acme.com/'];
        for (const u of no) assert.strictEqual(handoffLib.reviewSite(u), null, u);
    });

    await check('the Reviews address: the page (cleaned), its name, the numbers, the kind from the site or the type', () => {
        const u = new URL(handoff.reviewUrl(YELP, "Joe's Pizza - Yelp", { name: "Joe's Pizza", value: 4.5, best: 5, count: 9812, place: 'New York, NY', type: 'Restaurant' }));
        assert.strictEqual(u.origin + u.pathname, 'https://openvibe.reviews/save');
        assert.deepStrictEqual(Object.fromEntries(u.searchParams), { site: 'yelp', url: 'https://www.yelp.com/biz/joes-pizza-new-york?osq=pizza', name: "Joe's Pizza", kind: 'restaurant', place: 'New York, NY', rating: '4.5', best: '5', count: '9812', via: 'companion' });
        const g = new URL(handoff.reviewUrl(GD, 'Working at Acme | Glassdoor', { name: 'Acme Corp', value: 3.9, best: 5, count: null, type: 'Organization' }));
        assert.strictEqual(g.searchParams.get('kind'), 'employer', 'Glassdoor is about employers whatever the type says');
        assert.strictEqual(g.searchParams.get('count'), null);
        // Unread: the page and its name, no numbers.
        const none = new URL(handoff.reviewUrl('https://www.trustpilot.com/review/acme.com', 'Acme Reviews | Read Customer Service Reviews of acme.com', null));
        assert.deepStrictEqual(Object.fromEntries(none.searchParams), { site: 'trustpilot', url: 'https://www.trustpilot.com/review/acme.com', name: 'Acme Reviews', via: 'companion' });
        assert.strictEqual(handoff.reviewUrl('https://acme.com/', 'Acme', { value: 4 }), null, 'not a review site');
        assert.ok(handoff.isHandoff('https://openvibe.reviews/save?x=1'));
    });

    await check('the popup: offered on a review site only, reads the page on the press, opens Reviews', async () => {
        const read = { name: "Joe's Pizza", value: 4.5, best: 5, count: 9812, place: 'New York, NY', type: 'Restaurant', how: 'structured' };
        const p = popup({ url: YELP, title: "Joe's Pizza - Yelp", scriptResult: read });
        await p.controller.open();
        assert.strictEqual(p.controller.page().review, true);
        assert.ok(!p.ext.log.some((l) => l[0] === 'scripting.executeScript'), 'nothing runs in the page before the press');
        const r = await p.controller.saveRating();
        assert.deepStrictEqual([r.ok, r.read], [true, true]);
        const injected = p.ext.log.filter((l) => l[0] === 'scripting.executeScript').map((l) => l[1]);
        assert.deepStrictEqual(injected[0], { target: { tabId: 1 }, files: ['lib/rating.js'] });
        assert.deepStrictEqual(injected[1].target, { tabId: 1 }, 'the active tab, its top frame');
        assert.strictEqual(p.ext.opened.length, 1);
        assert.match(p.ext.opened[0], /^https:\/\/openvibe\.reviews\/save\?site=yelp&url=https%3A%2F%2Fwww\.yelp\.com%2Fbiz%2Fjoes-pizza-new-york%3Fosq%3Dpizza&name=Joe%27s\+Pizza&kind=restaurant&place=New\+York%2C\+NY&rating=4\.5&best=5&count=9812&via=companion$/);
        assert.ok(!stub.requests.some((x) => /pizza|biz/i.test([x.url, x.body].join(' '))), 'beyond the hostname (the coupon lookup), the page goes only to Reviews, in the tab the person sees');

        const unread = popup({ url: 'https://www.trustpilot.com/review/acme.com', title: 'Acme | Trustpilot', scriptResult: null });
        await unread.controller.open();
        const r2 = await unread.controller.saveRating();
        assert.deepStrictEqual([r2.ok, r2.read], [true, false]);
        assert.ok(!/rating=/.test(unread.ext.opened[0]), 'no numbers when the page could not be read');

        const shop = popup({ url: 'https://shop.acme.com/cart', title: 'Cart' });
        await shop.controller.open();
        assert.strictEqual(shop.controller.page().review, false);
    });

    await stub.close();
    done();
})();
