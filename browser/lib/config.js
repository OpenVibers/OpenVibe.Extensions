/*
 * OpenVibe Companion — configuration.
 *
 * API_ORIGIN is where the Coupons API lives. It must match the manifest's host_permissions and the
 * connect-src of its CSP; scripts/pack.js rewrites all three together for a development build
 * (--api http://localhost:4850) and test/manifest.test.js checks they agree. NETWORK_ORIGIN,
 * CHAT_ORIGIN and CODES_ORIGIN are the Dock's: its state, its Chats tab and its agent view.
 *
 * HANDOFF_ORIGINS are the sites the Companion may open a tab on when you press one of its buttons
 * (lib/handoff.js): the Rent board, a new Watch, Food's delivery comparison, and Reviews' page for saving the rating
 * a review site shows. It sends them nothing
 * itself; the address of the tab it opens carries the page you were on, and you see it.
 *
 * MAX_TRIES is how many codes "Try these codes on this page" types into a shop's coupon box at most
 * (lib/autoapply.js stops at the first that lowers the total).
 */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.OVConfig = api;
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';
    return Object.freeze({
        API_ORIGIN: 'https://openvibe.coupons',
        RENT_ORIGIN: 'https://openvibe.rent',
        WATCH_ORIGIN: 'https://openvibe.watch',
        FOOD_ORIGIN: 'https://openvibe.food',
        REVIEWS_ORIGIN: 'https://openvibe.reviews',
        HANDOFF_ORIGINS: Object.freeze(['https://openvibe.rent', 'https://openvibe.watch', 'https://openvibe.food', 'https://openvibe.reviews']),
        // NETWORK_ORIGIN is where the Dock's state lives (GET/PUT /api/v1/me/dock) and CHAT_ORIGIN where the
        // Dock's Chats tab reads the person's conversations from. Both are OpenVibe's own, and the only
        // origins the side panel may reach besides the API origin.
        NETWORK_ORIGIN: 'https://openvibe.network',
        CHAT_ORIGIN: 'https://openvibe.chat',
        // MAIL_ORIGIN is OpenVibe.Mail's API, where the person's masks live (GET/POST /api/v1/masks). The
        // Companion asks it for one mask per site, and never for anything else.
        LOCKER_ORIGIN: 'https://openvibe.locker',
        MAIL_ORIGIN: 'https://openvibe.email',
        // CODES_ORIGIN is OpenVibe.Codes' API: the Dock's agent view (GET /api/v1/me/agent-view and the
        // four controls), and the still Codes serves when nothing is live.
        CODES_ORIGIN: 'https://openvibe.codes',
        // One-click Dock sign-in (OAuth public client, no secret). The redirect URI is the browser's own
        // extension URL; the exact values are also in the Network client row. A build whose runtime
        // identity.getRedirectURL() is not one of these refuses to sign in rather than send an
        // unregistered redirect.
        OAUTH_CLIENT_ID: 'companion',
        OAUTH_SCOPES: Object.freeze(['dock', 'activity', 'chat.read', 'agent.view', 'mail.mask.manage', 'locker.login.manage']),
        OAUTH_REDIRECT_URIS: Object.freeze([
            'https://bjcjcfcecpkkmfndegkjekoipdmbgakd.chromiumapp.org/',
            'https://bb6593a68b1dcfbb7acd9650f04a169f4c5b57a0.extensions.allizom.org/',
        ]),
        // The OAuth grant: access in storage.session (memory), refresh in storage.local (this device).
        DOCK_ACCESS_KEY: 'dockAccess',
        DOCK_REFRESH_KEY: 'dockRefresh',
        DOCK_ACCOUNT_KEY: 'dockAccount',
        // Kept for the 0.7.0 pasted-token path until a later release removes it (see README).
        NETWORK_TOKEN_KEY: 'networkToken',
        // MAIL_SCOPE is the scope OpenVibe.Mail asks the Network for before it lets the Companion manage
        // the person's masks. Without it the Companion offers nothing and creates nothing.
        MAIL_SCOPE: 'mail.mask.manage',
        // MASK_MUTE_KEY is where the sites the person asked not to be offered a mask on are kept, on this
        // device only.
        MASK_MUTE_KEY: 'maskMutes',
        MAX_TRIES: 10,
        CONNECT_PATH: '/connect-extension',
        TOKEN_KEY: 'installToken',
        TOKEN_RE: /^cpx_[A-Za-z0-9_-]{43}$/,
        TIMEOUT_MS: 8000,
    });
});
