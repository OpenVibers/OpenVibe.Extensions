/*
 * Hand-offs: the pages the Companion opens on OpenVibe sites with the page you are on, when you
 * press a button for it — never on its own.
 *
 *   boardUrl(url, title)  https://openvibe.rent/board?url=…&title=…        keep a listing on your Rent board
 *   fairUrl(url, title)   https://openvibe.rent/fair?url=…&title=…         is this rent fair? (Rent reads the rent, size
 *                         and city from the address and title, says what it read, and compares with the city's median)
 *   watchUrl(url, title)  https://openvibe.watch/watches/new?template=page… watch the page for changes
 *   deliveryUrl(url, title)  https://openvibe.food/delivery?q=…            the same restaurant on every delivery app
 *                         (on a DoorDash, Uber Eats, Grubhub, Seamless, Caviar or Instacart page: the restaurant or
 *                         store name read from the page title, never the address or the cart)
 *
 * This is the only code that uses more of the page than its hostname, and what it builds is a page
 * address opened in a new tab you see, never a request the extension makes. cleanUrl() drops the
 * credentials, the fragment and the tracking parameters (utm_*, fbclid, gclid, …) first; anything
 * that is not an http(s) page gives null and nothing opens. platform.tabs.open() refuses any
 * address outside lib/config.js HANDOFF_ORIGINS.
 */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.OVHandoff = api;
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const TRACKING = /^(utm_[a-z_]+|fbclid|gclid|gbraid|wbraid|dclid|msclkid|mc_cid|mc_eid|igshid|yclid|_hsenc|_hsmi|ref_src|spm)$/i;

    /** Sites whose pages are rental listings: there, keeping it on the board is the main action. */
    const RENTAL_HOSTS = ['craigslist.org', 'zillow.com', 'apartments.com', 'zumper.com', 'rent.com', 'rentcafe.com', 'apartmentlist.com',
        'padmapper.com', 'hotpads.com', 'trulia.com', 'realtor.com', 'roomies.com', 'furnishedfinder.com', 'airbnb.com', 'vrbo.com',
        'loopnet.com', 'spothero.com', 'sparefoot.com', 'turo.com', 'spareroom.com', 'spareroom.co.uk', 'rightmove.co.uk', 'zoopla.co.uk',
        'kijiji.ca', 'rentals.ca', 'idealista.com', 'domain.com.au', 'realestate.com.au', 'openvibe.rent'];

    /** The delivery apps Food compares, and how each one's page title names the restaurant or store. */
    const DELIVERY = [
        { host: 'doordash.com', name: /^(?:Order\s+)?(.+?)\s+(?:Delivery|Menu|Near Me|-|\||\u2013)/i },
        { host: 'ubereats.com', name: /^(?:Order\s+)?(.+?)\s*(?:\(|Menu|Delivery|-|\||\u2013)/i },
        { host: 'grubhub.com', name: /^(?:Order\s+)?(.+?)\s+(?:Delivery|Menu|-|\||\u2013)/i },
        { host: 'seamless.com', name: /^(?:Order\s+)?(.+?)\s+(?:Delivery|Menu|-|\||\u2013)/i },
        { host: 'trycaviar.com', name: /^(?:Order\s+)?(.+?)\s+(?:Delivery|Menu|-|\||\u2013)/i },
        { host: 'instacart.com', name: /^(?:Order\s+)?(.+?)\s+(?:Delivery|Same-Day|-|\||\u2013)/i },
    ];
    // A title about the app itself (its home or a search page) names no restaurant.
    const GENERIC_TITLE = /^(doordash|uber\s*eats|grubhub|seamless|caviar|instacart)\b|^(food|restaurant|grocery)( delivery)?$|^home$|^search\b/i;

    function deliveryApp(url) {
        let u;
        try { u = new URL(String(url)); } catch (e) { return null; }
        const h = u.hostname.toLowerCase().replace(/^www\./, '');
        return DELIVERY.find(function (d) { return h === d.host || h.endsWith('.' + d.host); }) || null;
    }

    function isDelivery(url) { return Boolean(deliveryApp(url)); }

    /** The restaurant or store a delivery app's page is about, from its title; '' when the title names none. */
    function deliveryQuery(url, title) {
        const app = deliveryApp(url);
        const t = cleanTitle(title, 200);
        if (!app || !t) return '';
        const m = app.name.exec(t);
        const name = cleanTitle(m ? m[1] : t.split(/\s[|\-\u2013]\s/)[0], 80).replace(/\s+(Delivery|Menu)$/i, '');
        return name && !GENERIC_TITLE.test(name) ? name : '';
    }

    function cleanUrl(url) {
        if (typeof url !== 'string' || !url || url.length > 4000) return null;
        let u;
        try { u = new URL(url); } catch (e) { return null; }
        if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
        u.username = '';
        u.password = '';
        u.hash = '';
        const keep = [];
        u.searchParams.forEach(function (v, k) { if (!TRACKING.test(k)) keep.push([k, v]); });
        u.search = '';
        keep.forEach(function (kv) { u.searchParams.append(kv[0], kv[1]); });
        const out = u.href;
        return out.length <= 2000 ? out : null;
    }

    function cleanTitle(title, max) {
        return String(title == null ? '' : title).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
    }

    function isRental(url) {
        let u;
        try { u = new URL(String(url)); } catch (e) { return false; }
        const h = u.hostname.toLowerCase().replace(/^www\./, '');
        if (h === 'facebook.com' || h.endsWith('.facebook.com')) return /^\/marketplace\b/.test(u.pathname);
        return RENTAL_HOSTS.some(function (r) { return h === r || h.endsWith('.' + r); });
    }

    /** The hand-offs for one configuration (lib/config.js RENT_ORIGIN, WATCH_ORIGIN, HANDOFF_ORIGINS). */
    function createHandoff(config) {
        const RENT = config.RENT_ORIGIN;
        const WATCH = config.WATCH_ORIGIN;
        const FOOD = config.FOOD_ORIGIN;
        const origins = config.HANDOFF_ORIGINS;
        return {
            boardUrl: function (url, title) { return boardUrl(RENT, url, title); },
            fairUrl: function (url, title) { return fairUrl(RENT, url, title); },
            watchUrl: function (url, title) { return watchUrl(WATCH, url, title); },
            deliveryUrl: function (url, title) {
                if (!FOOD || !isDelivery(url)) return null;
                const q = deliveryQuery(url, title);
                return FOOD + '/delivery' + (q ? '?' + new URLSearchParams({ q: q }).toString() : '');
            },
            isHandoff: function (url) { return isHandoff(origins, url); },
        };
    }

    function boardUrl(RENT, url, title) {
        const page = cleanUrl(url);
        if (!page) return null;
        const q = new URLSearchParams({ url: page });
        const t = cleanTitle(title, 200);
        if (t) q.set('title', t);
        return RENT + '/board?' + q.toString();
    }

    function fairUrl(RENT, url, title) {
        const page = cleanUrl(url);
        if (!page) return null;
        const q = new URLSearchParams({ url: page });
        const t = cleanTitle(title, 200);
        if (t) q.set('title', t);
        return RENT + '/fair?' + q.toString();
    }

    function watchUrl(WATCH, url, title) {
        const page = cleanUrl(url);
        if (!page) return null;
        const q = new URLSearchParams({ template: 'page', url: page });
        const t = cleanTitle(title, 80);
        if (t) q.set('name', t);
        return WATCH + '/watches/new?' + q.toString();
    }

    /** True when `url` is a page on one of the hand-off sites (what platform.tabs.open() accepts). */
    function isHandoff(origins, url) {
        return typeof url === 'string' && origins.some(function (o) { return url.indexOf(o + '/') === 0; });
    }

    return { createHandoff, RENTAL_HOSTS, cleanUrl, isRental, isHandoff, isDelivery, deliveryQuery };
});
