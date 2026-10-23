'use strict';
/**
 * "Keep on my Rent board" and "Check the rent" with what the listing states (browser/lib/listing.js, handoff.boardUrl and
 * fairUrl, platform.scripting.readListing, controller.keepOnBoard and checkRent):
 *   - the price, "City, Region" and bedrooms a page publishes for search engines (JSON-LD: a home, a RealEstateListing
 *     and its mainEntity, an offer's price specification, a @graph beside an agency's own address, a building around
 *     an apartment), then microdata and price tags (og:price, Craigslist's price beside its title);
 *   - never the street: an address line gives its city and region only;
 *   - the board gets the price and place, the fair check a monthly dollar rent, the bedrooms and the city;
 *   - nothing is read before the press, and a page that cannot be read still opens with its address and title.
 */
const assert = require('assert');
const listing = require('../browser/lib/listing');
const host = require('../browser/lib/host');
const handoffLib = require('../browser/lib/handoff');
const { createApiClient } = require('../browser/lib/api');
const { createPlatform } = require('../browser/lib/platform');
const { createController } = require('../browser/lib/controller');
const config = require('../browser/lib/config');
const { check, done, startStub, fakeExt } = require('./helpers/harness');

const CL = 'https://saltlakecity.craigslist.org/apa/d/salt-lake-city-sunny-2br/7712345678.html?utm_source=x#photos';
const SHOP = 'https://www.rentfaster.ca/ab/calgary/rentals/apartment/2-bedrooms/123456';

/** A document as listing.read() sees it: JSON-LD blocks, and elements by selector ({ text, content }). */
function doc(scripts, elements = {}) {
    const el = (v) => (v ? { textContent: v.text || '', getAttribute: (k) => (k === 'content' ? v.content || null : null) } : null);
    return {
        querySelector: (sel) => el(elements[sel]),
        querySelectorAll: (sel) => (sel.startsWith('script') ? scripts.map((t) => ({ textContent: typeof t === 'string' ? t : JSON.stringify(t) })) : []),
    };
}

(async () => {
    const stub = await startStub();
    const handoff = handoffLib.createHandoff(config);
    const popup = ({ url, title = '', scriptResult = null }) => {
        const ext = fakeExt({ url, title, scriptResult });
        const platform = createPlatform(ext, { ...config, API_ORIGIN: stub.origin });
        const api = createApiClient({ origin: stub.origin, fetch, getToken: platform.storage.getToken });
        return { ext, controller: createController({ api, platform, host, handoff, isRental: handoffLib.isRental }) };
    };

    await check('prices as pages print them', () => {
        for (const [s, want] of [['$1,850', 1850], ['$1,850/mo', 1850], ['1850', 1850], [1850, 1850], ['2300.00', 2300], ['1,850.50', 1850.5], ['1.850,50 €', 1850.5],
            ['£1.200 pcm', 1200], ['CA$ 2 150', 2150], [{ '@value': '975' }, 975], ['Contact for price', null], ['', null], [null, null], [0, null], [-5, null], ['$0', null]]) {
            assert.strictEqual(listing.price(s), want, JSON.stringify(s));
        }
    });

    await check('JSON-LD: a home, a RealEstateListing around it, a price specification, a @graph with an agency, a building', () => {
        assert.deepStrictEqual(listing.fromJsonLd([JSON.stringify({ '@context': 'https://schema.org', '@type': 'Apartment', name: 'Sunny 2BR', numberOfBedrooms: 2,
            address: { '@type': 'PostalAddress', streetAddress: '123 Main St', addressLocality: 'Salt Lake City', addressRegion: 'UT', postalCode: '84101' } })]),
        { price: null, currency: '', place: 'Salt Lake City, UT', beds: 2 }, 'the street stays on the page');
        assert.deepStrictEqual(listing.fromJsonLd([JSON.stringify({ '@type': 'RealEstateListing', offers: { '@type': 'Offer', price: '2300', priceCurrency: 'usd' },
            mainEntity: { '@type': 'SingleFamilyResidence', numberOfBedrooms: { '@type': 'QuantitativeValue', value: 3 }, address: { addressLocality: 'Austin', addressRegion: 'TX' } } })]),
        { price: 2300, currency: 'USD', place: 'Austin, TX', beds: 3 });
        assert.deepStrictEqual(listing.fromJsonLd(['not json', JSON.stringify({ '@graph': [
            { '@type': 'RealEstateAgent', name: 'Agency', address: { addressLocality: 'Denver', addressRegion: 'CO' } },
            { '@type': ['Product', 'Accommodation'], name: '2 bed', offers: [{ priceSpecification: { '@type': 'UnitPriceSpecification', price: 1450, priceCurrency: 'CAD', unitText: 'MONTH' } }],
                address: { addressLocality: 'Toronto', addressCountry: { name: 'Canada' } } },
        ] })]), { price: 1450, currency: 'CAD', place: 'Toronto, Canada', beds: null }, "the agency's office is not where the home is");
        assert.deepStrictEqual(listing.fromJsonLd([JSON.stringify({ '@type': 'Apartment', numberOfBedrooms: 0,
            containedInPlace: { '@type': 'ApartmentComplex', name: 'The Elms', address: { addressLocality: 'Portland', addressRegion: 'OR' }, offers: { '@type': 'AggregateOffer', lowPrice: '1,295' } } })]),
        { price: 1295, currency: '', place: 'Portland, OR', beds: 0 }, 'a studio, in a building that states the place and the price');
        assert.strictEqual(listing.fromJsonLd([JSON.stringify({ '@type': 'Organization', name: 'Acme', address: { addressLocality: 'Boston' } }), JSON.stringify({ '@type': 'BreadcrumbList' })]), null);
        assert.strictEqual(listing.fromJsonLd(['{', '']), null);
    });

    await check('an address line gives its city and region, never the street', () => {
        assert.strictEqual(listing.placeOf({ address: '123 Main St, Oakland, CA 94607' }), 'Oakland, CA');
        assert.strictEqual(listing.placeOf({ address: 'Oakland, CA' }), 'Oakland, CA');
        assert.strictEqual(listing.placeOf({ address: '123 Main St' }), '');
        assert.strictEqual(listing.placeOf({ address: 'Unit 4, 55 Elm Rd' }), '', 'a street in the city spot gives nothing');
        assert.strictEqual(listing.placeOf({ address: { streetAddress: '9 Elm' } }), '');
    });

    await check('read(): JSON-LD first; microdata and price tags fill what it left out; nothing found is null', () => {
        const craigslist = doc([{ '@type': 'Apartment', numberOfBedrooms: 2, address: { addressLocality: 'Salt Lake City', addressRegion: 'UT' } }], { '.postingtitletext .price': { text: '$1,850' } });
        assert.deepStrictEqual(listing.read(craigslist), { price: 1850, currency: '', place: 'Salt Lake City, UT', beds: 2 });
        const tags = doc([], { 'meta[property="og:price:amount"]': { content: '2150.00' }, 'meta[property="og:price:currency"]': { content: 'CAD' } });
        assert.deepStrictEqual(listing.read(tags), { price: 2150, currency: 'CAD', place: '', beds: null });
        const micro = doc([], { '[itemprop="price"]': { content: '1395' }, '[itemprop="addressLocality"]': { text: ' Madison ' }, '[itemprop="addressRegion"]': { text: 'WI' }, '[itemprop="numberOfBedrooms"]': { text: '1' } });
        assert.deepStrictEqual(listing.read(micro), { price: 1395, currency: '', place: 'Madison, WI', beds: 1 });
        const ldWins = doc([{ '@type': 'Offer', price: 1700, priceCurrency: 'USD' }], { '.postingtitletext .price': { text: '$9' } });
        assert.strictEqual(listing.read(ldWins).price, 1700, "the structured price before the page's");
        assert.strictEqual(listing.read(doc([{ '@type': 'WebSite', name: 'x' }], {})), null);
    });

    await check('the board gets the price and the place; the fair check a monthly dollar rent, the bedrooms and the city', () => {
        const read = { price: 1850, currency: '', place: 'Salt Lake City, UT', beds: 2 };
        const b = new URL(handoff.boardUrl(CL, 'Sunny 2BR - apts/housing for rent', read));
        assert.deepStrictEqual(Object.fromEntries(b.searchParams), { url: 'https://saltlakecity.craigslist.org/apa/d/salt-lake-city-sunny-2br/7712345678.html', title: 'Sunny 2BR - apts/housing for rent', price: '1850', place: 'Salt Lake City, UT' });
        const f = new URL(handoff.fairUrl(CL, 'Sunny 2BR', read));
        assert.deepStrictEqual(Object.fromEntries(f.searchParams), { url: b.searchParams.get('url'), title: 'Sunny 2BR', rent: '1850', beds: '2', where: 'Salt Lake City, UT' });
        // A sale price or another currency is not a US monthly rent: the board keeps it, the fair check leaves it out.
        assert.strictEqual(new URL(handoff.fairUrl(CL, 'x', { price: 450000, currency: 'USD', place: '', beds: 3 })).searchParams.get('rent'), null);
        const cad = { price: 2150.5, currency: 'CAD', place: 'Calgary, AB', beds: null };
        assert.strictEqual(new URL(handoff.fairUrl(SHOP, 'x', cad)).searchParams.get('rent'), null);
        assert.strictEqual(new URL(handoff.boardUrl(SHOP, 'x', cad)).searchParams.get('price'), '2150.5');
        // Unread: the address and title, as before.
        assert.deepStrictEqual(Object.fromEntries(new URL(handoff.boardUrl(CL, 'Sunny', null)).searchParams), { url: b.searchParams.get('url'), title: 'Sunny' });
        assert.deepStrictEqual(Object.fromEntries(new URL(handoff.fairUrl(CL, 'Sunny', { price: NaN, place: '', beds: 1.5 })).searchParams), { url: b.searchParams.get('url'), title: 'Sunny' });
    });

    await check('the popup: reads the page on the press only, opens the board and the fair check with what it read', async () => {
        const read = { price: 1850, currency: '', place: 'Salt Lake City, UT', beds: 2 };
        const p = popup({ url: CL, title: 'Sunny 2BR - apts/housing for rent - craigslist', scriptResult: read });
        await p.controller.open();
        assert.strictEqual(p.controller.page().rental, true);
        assert.ok(!p.ext.log.some((l) => l[0] === 'scripting.executeScript'), 'nothing runs in the page before the press');
        assert.deepStrictEqual(await p.controller.keepOnBoard(), { ok: true });
        const injected = p.ext.log.filter((l) => l[0] === 'scripting.executeScript').map((l) => l[1]);
        assert.deepStrictEqual(injected[0], { target: { tabId: 1 }, files: ['lib/listing.js'] });
        assert.deepStrictEqual(injected[1].target, { tabId: 1 }, 'the active tab, its top frame');
        assert.match(p.ext.opened[0], /^https:\/\/openvibe\.rent\/board\?url=[^&]+&title=[^&]+&price=1850&place=Salt\+Lake\+City%2C\+UT$/);
        assert.deepStrictEqual(await p.controller.checkRent(), { ok: true });
        assert.match(p.ext.opened[1], /^https:\/\/openvibe\.rent\/fair\?url=[^&]+&title=[^&]+&rent=1850&beds=2&where=Salt\+Lake\+City%2C\+UT$/);
        assert.ok(!stub.requests.some((x) => /\/apa\/|1850|Salt( |\+|%20)Lake/.test([x.url, x.body].join(' '))), 'beyond the hostname (the coupon lookup), the page goes only to Rent, in the tab the person sees');

        // Any site: a page that is not a known rental site is read the same way when the person keeps it.
        const any = popup({ url: 'https://elmstreetrentals.com/units/4b', title: 'Unit 4B', scriptResult: { price: 1200, currency: 'USD', place: 'Dayton, OH', beds: 1 } });
        await any.controller.open();
        assert.strictEqual(any.controller.page().rental, false);
        await any.controller.keepOnBoard();
        assert.match(any.ext.opened[0], /&price=1200&place=Dayton%2C\+OH$/);

        const unread = popup({ url: CL, title: 'Sunny 2BR', scriptResult: null });
        await unread.controller.open();
        assert.deepStrictEqual(await unread.controller.keepOnBoard(), { ok: true });
        assert.ok(!/price=|place=/.test(unread.ext.opened[0]), 'an unread page opens with its address and title only');

        const browserPage = popup({ url: 'chrome://extensions', scriptResult: read });
        await browserPage.controller.open();
        assert.strictEqual((await browserPage.controller.keepOnBoard()).ok, false);
        assert.ok(!browserPage.ext.log.some((l) => l[0] === 'scripting.executeScript'), 'nothing is injected where nothing can be kept');
    });

    await stub.close();
    done();
})();
