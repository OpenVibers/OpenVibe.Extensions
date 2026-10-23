/*
 * Read a listing's price, place and size from its page: the OpenVibe Companion's "Keep on my Rent board" and
 * "Check the rent".
 *
 * Injected into the active tab only when the person presses one of those buttons (activeTab + scripting, as
 * lib/rating.js is), on any site: a listing is kept from wherever the person found it. It reads the page's DOM in
 * the extension's isolated world, makes no request, reads no cookies or storage, and returns only:
 *
 *   read(document) → { price, currency, place, beds } | null
 *     price     the asking price as a number (1850 for "$1,850/mo"), or null
 *     currency  its three-letter code when the page says (USD, CAD, GBP…), or ''
 *     place     "City, Region" from the listing's address, never the street, or ''
 *     beds      bedrooms (0 for a studio) when the page states them, or null
 *
 * Where it looks: the structured data the site publishes for search engines (JSON-LD, then microdata), then the
 * price tags a listing page shows (og:price / product:price meta tags, Craigslist's price beside its title). Never
 * the description, the photos, the contact details or anything about the person. The popup opens the Rent board or
 * the fair check with these values in the address; the person checks them there before anything is saved.
 */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.OVListing = api;
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    // What a listing is about (schema.org): a home, a room, a place to stay, and the offer or listing that sells it.
    const HOME = /^(Apartment|House|SingleFamilyResidence|Residence|ApartmentComplex|GatedResidenceCommunity|Accommodation|Room|HotelRoom|Suite|VacationRental|LodgingBusiness|Place)$/;
    const OFFER = /^(RealEstateListing|Product|Offer|AggregateOffer)$/;
    const MAX_PRICE = 100000000;

    function text(v, max) {
        return String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max || 200);
    }

    /**
     * A price as pages print it: "$1,850/mo" 1850, "1.850,50 €" 1850.5, "2300.00" 2300, 1850 1850. Groups of three
     * after a comma or dot are thousands; one or two digits after the last one are cents.
     */
    function price(v) {
        if (v == null) return null;
        if (typeof v === 'number') return Number.isFinite(v) && v > 0 && v < MAX_PRICE ? v : null;
        const s = String(typeof v === 'object' && v['@value'] != null ? v['@value'] : v).replace(/\s/g, '');
        const m = /(\d{1,3}(?:[,.]\d{3})+|\d+)(?:[.,](\d{1,2}))?(?!\d)/.exec(s);
        if (!m) return null;
        const n = Number(m[1].replace(/[,.]/g, '') + (m[2] ? '.' + m[2] : ''));
        return Number.isFinite(n) && n > 0 && n < MAX_PRICE ? n : null;
    }

    function currency(v) {
        const c = text(v, 8).toUpperCase();
        return /^[A-Z]{3}$/.test(c) ? c : '';
    }

    function typesOf(o) {
        const t = o && o['@type'];
        return (Array.isArray(t) ? t : [t]).map(function (x) { return text(x, 60).replace(/^https?:\/\/schema\.org\//, ''); }).filter(Boolean);
    }

    function first(v) { return Array.isArray(v) ? v[0] : v; }

    /** "City, Region" from a PostalAddress, or from an address line's last two parts ("…, Oakland, CA 94607"). */
    function placeOf(o) {
        const a = first(o && o.address);
        if (!a) return '';
        if (typeof a === 'string') {
            const parts = a.split(',').map(function (x) { return text(x, 60); }).filter(Boolean);
            if (parts.length < 2) return '';
            const region = parts[parts.length - 1].replace(/\b\d{4,6}(?:-\d{4})?\b/g, '').trim();
            const city = parts[parts.length - 2];
            return city && region && !/\d/.test(city) ? city + ', ' + region : '';
        }
        if (typeof a !== 'object') return '';
        const city = text(a.addressLocality, 60);
        const country = typeof a.addressCountry === 'object' && a.addressCountry ? a.addressCountry.name : a.addressCountry;
        const region = text(a.addressRegion, 40) || text(country, 40);
        return city ? [city, region].filter(Boolean).join(', ') : '';
    }

    function bedsOf(o) {
        const b = first(o && o.numberOfBedrooms);
        const n = b != null && typeof b === 'object' ? Number(b.value) : Number(b);
        return b != null && b !== '' && Number.isInteger(n) && n >= 0 && n <= 20 ? n : null;
    }

    /** The price an offer, a listing or a home states: its own, its price specification's, else its first offer's. */
    function priceOf(o, depth) {
        if (!o || typeof o !== 'object' || (depth || 0) > 3) return null;
        const spec = first(o.priceSpecification);
        const p = price(o.price) || price(o.lowPrice) || (spec && typeof spec === 'object' ? price(spec.price) || price(spec.minPrice) : null);
        if (p) return { price: p, currency: currency(o.priceCurrency) || (spec && typeof spec === 'object' ? currency(spec.priceCurrency) : '') };
        return o.offers ? priceOf(first(o.offers), (depth || 0) + 1) : null;
    }

    /** The listing in a page's JSON-LD blocks (their text): its price, place and bedrooms, each from the first object that states it. */
    function fromJsonLd(blocks) {
        const out = { price: null, currency: '', place: '', beds: null };
        const seen = [];
        const visit = function (o, depth) {
            if (!o || typeof o !== 'object' || depth > 6 || seen.length > 2000) return;
            seen.push(o);
            if (Array.isArray(o)) { o.forEach(function (x) { visit(x, depth + 1); }); return; }
            const types = typesOf(o);
            const home = types.some(function (t) { return HOME.test(t); });
            if (home || types.some(function (t) { return OFFER.test(t); })) {
                if (out.price == null) { const p = priceOf(o); if (p) { out.price = p.price; out.currency = p.currency; } }
                // A business's own address (the agent's office) is not where the home is.
                if (!out.place && home) out.place = placeOf(o);
                if (out.beds == null) out.beds = bedsOf(o);
            }
            ['@graph', 'mainEntity', 'itemOffered', 'offers', 'about', 'containedInPlace'].forEach(function (k) { if (o[k]) visit(o[k], depth + 1); });
        };
        for (const b of blocks || []) {
            let data;
            try { data = JSON.parse(String(b || '')); } catch (e) { continue; }
            visit(data, 0);
        }
        return out.price != null || out.place || out.beds != null ? out : null;
    }

    /** An attribute's value or an element's text, for the first element `sel` finds. */
    function valueAt(doc, sel, attr) {
        const el = doc.querySelector(sel);
        if (!el) return '';
        return text((attr && el.getAttribute(attr)) || el.getAttribute('content') || el.textContent, 120);
    }

    /** Microdata and the price tags a listing page shows, for what the JSON-LD left out. */
    function fromPage(doc) {
        const out = { price: null, currency: '', place: '', beds: null };
        out.price = price(valueAt(doc, '[itemprop="price"]')) || price(valueAt(doc, 'meta[property="og:price:amount"]', 'content'))
            || price(valueAt(doc, 'meta[property="product:price:amount"]', 'content')) || price(valueAt(doc, '.postingtitletext .price'));
        out.currency = currency(valueAt(doc, '[itemprop="priceCurrency"]')) || currency(valueAt(doc, 'meta[property="og:price:currency"]', 'content'))
            || currency(valueAt(doc, 'meta[property="product:price:currency"]', 'content'));
        const city = valueAt(doc, '[itemprop="addressLocality"]');
        if (city && !/\d/.test(city)) out.place = [city, valueAt(doc, '[itemprop="addressRegion"]')].filter(Boolean).join(', ').slice(0, 120);
        const beds = valueAt(doc, '[itemprop="numberOfBedrooms"]');
        out.beds = beds ? bedsOf({ numberOfBedrooms: beds }) : null;
        return out;
    }

    function read(doc) {
        doc = doc || document;
        const blocks = Array.prototype.map.call(doc.querySelectorAll('script[type="application/ld+json"]'), function (s) { return s.textContent; }).slice(0, 40);
        const ld = fromJsonLd(blocks) || { price: null, currency: '', place: '', beds: null };
        const page = fromPage(doc);
        const out = {
            price: ld.price != null ? ld.price : page.price,
            currency: ld.price != null ? ld.currency : page.currency,
            place: ld.place || page.place,
            beds: ld.beds != null ? ld.beds : page.beds,
        };
        return out.price != null || out.place || out.beds != null ? out : null;
    }

    return { read, fromJsonLd, fromPage, price, placeOf };
});
