/*
 * Hand-offs: the pages the Companion opens on OpenVibe sites with the page you are on, when you
 * press a button for it — never on its own.
 *
 *   boardUrl(url, title)  https://openvibe.rent/board?url=…&title=…        keep a listing on your Rent board
 *   watchUrl(url, title)  https://openvibe.watch/watches/new?template=page… watch the page for changes
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
        const origins = config.HANDOFF_ORIGINS;
        return {
            boardUrl: function (url, title) { return boardUrl(RENT, url, title); },
            watchUrl: function (url, title) { return watchUrl(WATCH, url, title); },
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

    return { createHandoff, RENTAL_HOSTS, cleanUrl, isRental, isHandoff };
});
