/*
 * Read the rating a review site's page states: the OpenVibe Companion's "Save its rating to OpenVibe Reviews".
 *
 * Injected into the active tab only when the person presses that button in the popup (activeTab + scripting, as
 * lib/autoapply.js is), on Glassdoor, Indeed, Yelp, the BBB, Trustpilot, Google Maps or Tripadvisor. It reads the
 * page's DOM in the extension's isolated world, makes no request, reads no cookies or storage, and returns only:
 *
 *   read(document) → { name, value, best, count, place, type, how } | null
 *     name    what the page is about (its structured data's name, else its heading)
 *     value   the rating, on the site's own scale; best: the top of that scale (5 when the page does not say)
 *     count   how many ratings it is from, or null
 *     place   "City, Region" from the structured data's address, or ''
 *     type    the structured data's @type (Restaurant, Organization…), or ''
 *     how     'structured' (JSON-LD or microdata the site publishes for search engines) or 'page' (the stars' own
 *             accessible label, like "4.5 star rating")
 *
 * The popup opens openvibe.reviews/save with these values; the person checks them against the page there before
 * anything is saved.
 */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.OVRating = api;
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    function num(v) {
        if (v == null) return null;
        const s = String(typeof v === 'object' && v['@value'] != null ? v['@value'] : v).trim().replace(/\s/g, '');
        // "1,234" and "1.234" (thousands) as counts; "4,5" (decimal comma) as a rating.
        const m = /^(\d{1,3}(?:[,.]\d{3})+|\d+(?:[.,]\d+)?)$/.exec(s);
        if (!m) return null;
        const t = /^\d{1,3}(?:[,.]\d{3})+$/.test(m[1]) ? m[1].replace(/[,.]/g, '') : m[1].replace(',', '.');
        const n = Number(t);
        return Number.isFinite(n) ? n : null;
    }

    function text(v, max) {
        return String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max || 200);
    }

    function typeOf(o) {
        const t = o && o['@type'];
        return text(Array.isArray(t) ? t[0] : t, 60);
    }

    function placeOf(o) {
        const a = o && (Array.isArray(o.address) ? o.address[0] : o.address);
        if (!a) return '';
        if (typeof a === 'string') return text(a, 120);
        const city = text(a.addressLocality, 60);
        const region = text(a.addressRegion, 40) || text(typeof a.addressCountry === 'object' && a.addressCountry ? a.addressCountry.name : a.addressCountry, 40);
        return [city, region].filter(Boolean).join(', ');
    }

    function ratingOf(owner, r) {
        const value = num(r.ratingValue);
        const best = num(r.bestRating) || 5;
        if (value == null || best <= 0 || value > best) return null;
        const count = num(r.ratingCount) != null ? num(r.ratingCount) : num(r.reviewCount);
        return { name: text(owner && owner.name, 200), value, best, count: count != null && Number.isInteger(count) ? count : null, place: placeOf(owner), type: typeOf(owner), how: 'structured' };
    }

    /** The first aggregateRating in a page's JSON-LD blocks (their text), with what it rates; null when none. */
    function fromJsonLd(blocks) {
        const seen = [];
        const walk = function (o, depth) {
            if (!o || typeof o !== 'object' || depth > 6 || seen.length > 2000) return null;
            seen.push(o);
            if (Array.isArray(o)) {
                for (const x of o) { const r = walk(x, depth + 1); if (r) return r; }
                return null;
            }
            if (o.aggregateRating && typeof o.aggregateRating === 'object') {
                const r = ratingOf(o.itemReviewed || o, Array.isArray(o.aggregateRating) ? o.aggregateRating[0] : o.aggregateRating);
                if (r) return r;
            }
            // An AggregateRating (or EmployerAggregateRating) on its own, naming what it rates.
            if (/AggregateRating$/.test(typeOf(o)) && o.ratingValue != null) {
                const r = ratingOf(o.itemReviewed || {}, o);
                if (r) return r;
            }
            for (const k of ['@graph', 'mainEntity', 'itemReviewed', 'about']) {
                if (o[k]) { const r = walk(o[k], depth + 1); if (r) return r; }
            }
            return null;
        };
        for (const b of blocks || []) {
            let data;
            try { data = JSON.parse(String(b || '')); } catch (e) { continue; }
            const r = walk(data, 0);
            if (r) return r;
        }
        return null;
    }

    // The stars' accessible labels: "4.5 star rating" (Yelp), "4.5 stars" (Google Maps), "4.5 of 5 bubbles"
    // (Tripadvisor), "Rated 4.2 out of 5" (Trustpilot, Indeed), "3.9 out of 5 stars" (Glassdoor).
    const LABEL_RES = [
        /^\s*rated\s+(\d+(?:[.,]\d+)?)\s+(?:out\s+)?of\s+(\d+)/i,
        /^\s*(\d+(?:[.,]\d+)?)\s*(?:out\s+of|of|\/)\s*(\d+)(?:\s*(?:stars?|bubbles?|points?))?\b/i,
        /^\s*(\d+(?:[.,]\d+)?)\s*(?:-|\s)?\s*stars?(?:\s+rating)?\s*$/i,
        /^\s*(\d+(?:[.,]\d+)?)\s+bubbles?\b/i,
    ];
    const COUNT_RE = /^\s*\(?\s*(\d[\d,.\s]*)\s*\)?\s*(?:reviews?|ratings?|bewertungen|avis)?\s*$/i;

    /** A rating from the stars' labels, in page order; the count from the first "1,234 reviews" label after it. */
    function fromLabels(labels) {
        const list = (labels || []).map(function (l) { return text(l, 120); }).filter(Boolean);
        for (let i = 0; i < list.length; i++) {
            for (const re of LABEL_RES) {
                const m = re.exec(list[i]);
                if (!m) continue;
                const value = num(m[1]);
                const best = m[2] ? num(m[2]) : 5;
                if (value == null || !best || value > best) continue;
                let count = null;
                for (let j = i + 1; j < Math.min(list.length, i + 6) && count == null; j++) {
                    if (/\b(reviews?|ratings?)\b/i.test(list[j]) || /^\(\s*\d/.test(list[j])) {
                        const c = COUNT_RE.exec(list[j]);
                        if (c) count = num(c[1].replace(/\s/g, ''));
                    }
                }
                return { value, best, count: count != null && Number.isInteger(count) ? count : null, how: 'page' };
            }
        }
        return null;
    }

    /** The page's own name for itself: its heading, else its title without the site's suffix. */
    function nameFrom(h1, title) {
        const h = text(h1, 200);
        if (h) return h;
        return text(String(title || '').split(/\s+[|\-–—]\s+/)[0].replace(/\s+(Reviews?|Employee Reviews|Company Reviews)$/i, ''), 200);
    }

    /** Microdata (itemprop="aggregateRating") as JSON-LD would say it. */
    function fromMicrodata(doc) {
        const box = doc.querySelector('[itemprop="aggregateRating"]');
        if (!box) return null;
        const prop = function (el, name) {
            const n = el.querySelector('[itemprop="' + name + '"]');
            return n ? (n.getAttribute('content') || n.textContent) : null;
        };
        const scope = box.parentElement && box.parentElement.closest ? box.parentElement.closest('[itemscope]') : null;
        const r = ratingOf({ name: scope ? prop(scope, 'name') : '' }, { ratingValue: prop(box, 'ratingValue'), bestRating: prop(box, 'bestRating'), ratingCount: prop(box, 'ratingCount'), reviewCount: prop(box, 'reviewCount') });
        return r;
    }

    function read(doc) {
        doc = doc || document;
        const blocks = Array.prototype.map.call(doc.querySelectorAll('script[type="application/ld+json"]'), function (s) { return s.textContent; }).slice(0, 40);
        const h1 = doc.querySelector('h1');
        const name = nameFrom(h1 && h1.textContent, doc.title);
        const found = fromJsonLd(blocks) || fromMicrodata(doc);
        if (found) return Object.assign(found, { name: found.name || name });
        const labels = Array.prototype.map.call(doc.querySelectorAll('[aria-label], [title]'), function (el) { return el.getAttribute('aria-label') || el.getAttribute('title'); }).slice(0, 3000);
        const page = fromLabels(labels);
        return page ? Object.assign(page, { name: name, place: '', type: '' }) : (name ? { name: name, value: null, best: 5, count: null, place: '', type: '', how: 'none' } : null);
    }

    return { read, fromJsonLd, fromLabels, nameFrom, num };
});
