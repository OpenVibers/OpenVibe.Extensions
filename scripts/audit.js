#!/usr/bin/env node
'use strict';
/**
 * The permission audit for browser/manifest.json. test/manifest.test.js runs it, and so does
 * scripts/pack.js before it writes a zip. It fails when anything widens:
 *
 *   permissions            exactly activeTab + identity + scripting + storage, plus sidePanel in the Chrome build
 *                          (scripting runs lib/autoapply.js, lib/rating.js, lib/listing.js or lib/mask-fill.js in the
 *                          active tab only, when the person presses a button of the Companion: activeTab is the only
 *                          host access; Firefox's sidebar_action, the side panel there, needs no permission of its own;
 *                          identity starts the Dock's one-click OAuth sign-in)
 *   host_permissions       exactly the API origin, the Network origin, the Chat origin and the Codes
 *                          origin, all https://openvibe.<tld> sites (the coupon API, the Dock's state,
 *                          the Dock's Chats tab, and the Dock's agent view). OpenVibe.Mail is not among them: the
 *                          Companion reaches it with CORS, the way the Coupons API lets a first-party extension in.
 *   background             the service worker that holds the person's sign-in and talks to OpenVibe.Mail, and
 *                          nothing else: one key, one file, one type
 *   allowed key            key (Chrome's public key that fixes the extension id; dropped from the Firefox zip)
 *   forbidden keys         content_scripts, web_accessible_resources,
 *                          externally_connectable, optional_permissions, optional_host_permissions,
 *                          declarative_net_request, chrome_url_overrides, devtools_page, sandbox,
 *                          omnibox, … (anything not on the allow-list of keys; the side panel's own keys,
 *                          side_panel and sidebar_action, are on it)
 *   CSP                    script-src 'self' only; style-src 'self' 'unsafe-inline' (the Dock draws its
 *                          own styles in a <style> element); img-src 'self' blob: (the agent view's
 *                          still is a local object URL); connect-src only the OpenVibe origins (the four
 *                          the extension may reach with a host permission, and OpenVibe.Mail, which it
 *                          reaches with CORS); frame-src only Live's agent embed; no other unsafe-*, wildcard,
 *                          data: or remote http
 *   pages                  popup/options/panel HTML load only local scripts, no inline script
 *   config                 lib/config.js API_ORIGIN equals the host permission's origin
 *   hand-offs              lib/config.js HANDOFF_ORIGINS are https://openvibe.<tld> sites only (the
 *                          tabs the Companion may open when you press a button; never requested)
 */
const fs = require('fs');
const path = require('path');

const ALLOWED_KEYS = new Set(['manifest_version', 'name', 'short_name', 'version', 'description', 'homepage_url', 'author', 'icons',
    'action', 'options_ui', 'permissions', 'host_permissions', 'content_security_policy', 'minimum_chrome_version', 'browser_specific_settings',
    'side_panel', 'sidebar_action', 'key', 'background']);
const BASE_PERMISSIONS = ['activeTab', 'identity', 'scripting', 'storage'];
const SIDE_PERMISSIONS = ['sidePanel', 'sidebarAction'];
const PERMISSIONS = BASE_PERMISSIONS.concat(['sidePanel']);
const BACKGROUND = { service_worker: 'background.js', type: 'module' };

function auditManifest(m, { apiOrigin, origins, connectOrigins } = {}) {
    const problems = [];
    const os = (origins && origins.length ? origins : [apiOrigin]).filter(Boolean);
    const cs = (connectOrigins && connectOrigins.length ? connectOrigins : os).filter(Boolean);
    if (m.manifest_version !== 3) problems.push('manifest_version must be 3');
    for (const k of Object.keys(m)) if (!ALLOWED_KEYS.has(k)) problems.push(`manifest key "${k}" is not allowed`);
    const perms = Array.isArray(m.permissions) ? m.permissions : [];
    const extra = perms.filter((p) => !BASE_PERMISSIONS.includes(p));
    if (perms.length < BASE_PERMISSIONS.length || !BASE_PERMISSIONS.every((p) => perms.includes(p))) {
        problems.push(`permissions must be exactly ${BASE_PERMISSIONS.join(', ')} (got ${perms.join(', ') || 'none'})`);
    }
    if (extra.length > 1 || extra.some((p) => !SIDE_PERMISSIONS.includes(p))) {
        problems.push(`the only extra permission may be sidePanel (Chrome) (got ${extra.join(', ') || 'none'})`);
    }
    const hosts = Array.isArray(m.host_permissions) ? m.host_permissions : [];
    const want = os.map((o) => o + '/*').sort();
    if (hosts.length !== want.length || hosts.slice().sort().join() !== want.join()) {
        problems.push(`host_permissions must be exactly ${want.join(', ')} (got ${hosts.join(', ') || 'none'})`);
    }
    if (!m.background || m.background.service_worker !== BACKGROUND.service_worker || m.background.type !== BACKGROUND.type
        || Object.keys(m.background).length !== Object.keys(BACKGROUND).length) {
        problems.push(`background must be exactly ${JSON.stringify(BACKGROUND)}`);
    }
    const panel = m.side_panel || m.sidebar_action;
    if (!panel) problems.push('the side panel needs side_panel (Chrome) or sidebar_action (Firefox)');
    else if ((m.side_panel && m.side_panel.default_path !== 'panel.html') || (m.sidebar_action && m.sidebar_action.default_panel !== 'panel.html')) {
        problems.push('the side panel opens panel.html');
    }
    if (!m.action || m.action.default_popup !== 'popup.html') problems.push('action.default_popup must be popup.html');
    if (!m.options_ui || m.options_ui.page !== 'options.html') problems.push('options_ui.page must be options.html');
    const csp = m.content_security_policy && m.content_security_policy.extension_pages;
    if (!csp) problems.push('content_security_policy.extension_pages is required');
    else {
        const dirs = Object.fromEntries(csp.split(';').map((d) => d.trim()).filter(Boolean).map((d) => { const [k, ...v] = d.split(/\s+/); return [k, v]; }));
        if (JSON.stringify(dirs['script-src']) !== JSON.stringify(["'self'"])) problems.push("CSP script-src must be exactly 'self'");
        if (JSON.stringify(dirs['connect-src'].slice().sort()) !== JSON.stringify(cs.slice().sort())) problems.push(`CSP connect-src must be exactly ${cs.join(' ')}`);
        if (JSON.stringify(dirs['default-src']) !== JSON.stringify(["'none'"])) problems.push("CSP default-src must be 'none'");
        if (JSON.stringify(dirs['object-src']) !== JSON.stringify(["'none'"])) problems.push("CSP object-src must be 'none'");
        if (JSON.stringify(dirs['style-src']) !== JSON.stringify(["'self'", "'unsafe-inline'"])) problems.push("CSP style-src must be exactly 'self' 'unsafe-inline' (the Dock's own <style>)");
        if (JSON.stringify(dirs['img-src']) !== JSON.stringify(["'self'", 'blob:'])) problems.push("CSP img-src must be exactly 'self' blob: (the agent view's still)");
        if (JSON.stringify(dirs['frame-src']) !== JSON.stringify(['https://openvibe.live'])) problems.push('CSP frame-src must be exactly https://openvibe.live (the agent embed)');
        for (const [name, values] of Object.entries(dirs)) {
            if (name === 'style-src') continue;
            for (const v of values) {
                const devLocal = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(v);
                if (/unsafe-|\*|data:/.test(v) || (v === 'blob:' && name !== 'img-src') || (/^http:/.test(v) && !devLocal)) problems.push(`CSP ${name} must not allow ${v}`);
            }
        }
    }
    const gecko = m.browser_specific_settings && m.browser_specific_settings.gecko;
    if (!gecko || !gecko.id) problems.push('browser_specific_settings.gecko.id is required (Firefox)');
    return problems;
}

/** HTML pages load only local scripts and no inline script or handler. */
function auditPage(html, name) {
    const problems = [];
    for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
        const src = (m[1].match(/\bsrc="([^"]+)"/) || [])[1];
        if (!src) problems.push(`${name}: inline <script>`);
        else if (/^(https?:)?\/\//i.test(src)) problems.push(`${name}: remote script ${src}`);
        if (m[2].trim()) problems.push(`${name}: script body`);
    }
    if (/\son[a-z]+\s*=/i.test(html)) problems.push(`${name}: inline event handler`);
    if (/<link[^>]+href="(https?:)?\/\//i.test(html)) problems.push(`${name}: remote stylesheet`);
    return problems;
}

function auditDir(dir) {
    const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
    const configSrc = fs.readFileSync(path.join(dir, 'lib', 'config.js'), 'utf8');
    const origin = (configSrc.match(/API_ORIGIN:\s*'([^']+)'/) || [])[1];
    const network = (configSrc.match(/NETWORK_ORIGIN:\s*'([^']+)'/) || [])[1];
    const chat = (configSrc.match(/CHAT_ORIGIN:\s*'([^']+)'/) || [])[1];
    const codes = (configSrc.match(/CODES_ORIGIN:\s*'([^']+)'/) || [])[1];
    const mail = (configSrc.match(/MAIL_ORIGIN:\s*'([^']+)'/) || [])[1];
    const handoffs = ((configSrc.match(/HANDOFF_ORIGINS:\s*Object\.freeze\(\[([^\]]*)\]\)/) || [])[1] || '').split(',').map((x) => x.trim().replace(/^'|'$/g, '')).filter(Boolean);
    const problems = [];
    if (!origin) problems.push('lib/config.js has no API_ORIGIN');
    if (!handoffs.length) problems.push('lib/config.js has no HANDOFF_ORIGINS');
    for (const h of handoffs) if (!/^https:\/\/openvibe\.[a-z]+$/.test(h)) problems.push(`hand-off origin ${h} is not an https://openvibe.<tld> site`);
    const origins = [origin, network, chat, codes].filter(Boolean);
    for (const o of [network, chat, codes, mail].filter(Boolean)) if (!/^https:\/\/openvibe\.[a-z]+$/.test(o)) problems.push(`${o} is not an https://openvibe.<tld> site`);
    const connectOrigins = origins.concat(mail ? [mail] : []);
    problems.push(...auditManifest(manifest, { apiOrigin: origin, origins, connectOrigins }));
    for (const page of ['popup.html', 'options.html', 'panel.html']) problems.push(...auditPage(fs.readFileSync(path.join(dir, page), 'utf8'), page));
    return { manifest, origin, origins, connectOrigins, problems };
}

module.exports = { auditManifest, auditPage, auditDir, PERMISSIONS, BASE_PERMISSIONS, ALLOWED_KEYS, BACKGROUND };
