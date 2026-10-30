'use strict';
/**
 * The permission audit for browser/manifest.json. test/manifest.test.js runs it, and so does
 * scripts/pack.js before it writes a zip. It fails when anything widens:
 *
 *   permissions            exactly activeTab + scripting + storage, plus sidePanel in the Chrome build
 *                          (scripting runs lib/autoapply.js or lib/rating.js in the active tab only, when the
 *                          person presses "Try these codes on this page" or "Save its rating to OpenVibe
 *                          Reviews": activeTab is the only host access; Firefox's sidebar_action, the
 *                          side panel there, needs no permission of its own)
 *   host_permissions       exactly the API origin, the Network origin and the Chat origin, all three
 *                          https://openvibe.<tld> sites (the coupon API, the Dock's state, the Dock's
 *                          Chats tab)
 *   forbidden keys         content_scripts, background, web_accessible_resources,
 *                          externally_connectable, optional_permissions, optional_host_permissions,
 *                          declarative_net_request, chrome_url_overrides, devtools_page, sandbox,
 *                          omnibox, … (anything not on the allow-list of keys; the side panel's own keys,
 *                          side_panel and sidebar_action, are on it)
 *   CSP                    script-src 'self' only, connect-src only the OpenVibe origins, no unsafe-*
 *   pages                  popup/options/panel HTML load only local scripts, no inline script
 *   config                 lib/config.js API_ORIGIN equals the host permission's origin
 *   hand-offs              lib/config.js HANDOFF_ORIGINS are https://openvibe.<tld> sites only (the
 *                          tabs the Companion may open when you press a button; never requested)
 */
const fs = require('fs');
const path = require('path');

const ALLOWED_KEYS = new Set(['manifest_version', 'name', 'short_name', 'version', 'description', 'homepage_url', 'author', 'icons',
    'action', 'options_ui', 'permissions', 'host_permissions', 'content_security_policy', 'minimum_chrome_version', 'browser_specific_settings',
    'side_panel', 'sidebar_action']);
const BASE_PERMISSIONS = ['activeTab', 'scripting', 'storage'];
const SIDE_PERMISSIONS = ['sidePanel', 'sidebarAction'];
const PERMISSIONS = BASE_PERMISSIONS.concat(['sidePanel']);

function auditManifest(m, { apiOrigin, origins } = {}) {
    const problems = [];
    const os = (origins && origins.length ? origins : [apiOrigin]).filter(Boolean);
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
        if (JSON.stringify(dirs['connect-src'].slice().sort()) !== JSON.stringify(os.slice().sort())) problems.push(`CSP connect-src must be exactly ${os.join(' ')}`);
        if (JSON.stringify(dirs['default-src']) !== JSON.stringify(["'none'"])) problems.push("CSP default-src must be 'none'");
        if (JSON.stringify(dirs['object-src']) !== JSON.stringify(["'none'"])) problems.push("CSP object-src must be 'none'");
        if (/unsafe-|\*|data:|blob:|http:(?!\/\/(localhost|127\.0\.0\.1))/.test(csp)) problems.push('CSP must not allow unsafe-*, wildcards, data:, blob: or remote http');
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
    const handoffs = ((configSrc.match(/HANDOFF_ORIGINS:\s*Object\.freeze\(\[([^\]]*)\]\)/) || [])[1] || '').split(',').map((x) => x.trim().replace(/^'|'$/g, '')).filter(Boolean);
    const problems = [];
    if (!origin) problems.push('lib/config.js has no API_ORIGIN');
    if (!handoffs.length) problems.push('lib/config.js has no HANDOFF_ORIGINS');
    for (const h of handoffs) if (!/^https:\/\/openvibe\.[a-z]+$/.test(h)) problems.push(`hand-off origin ${h} is not an https://openvibe.<tld> site`);
    const origins = [origin, network, chat].filter(Boolean);
    for (const o of [network, chat].filter(Boolean)) if (!/^https:\/\/openvibe\.[a-z]+$/.test(o)) problems.push(`${o} is not an https://openvibe.<tld> site`);
    problems.push(...auditManifest(manifest, { apiOrigin: origin, origins }));
    for (const page of ['popup.html', 'options.html', 'panel.html']) problems.push(...auditPage(fs.readFileSync(path.join(dir, page), 'utf8'), page));
    return { manifest, origin, origins, problems };
}

module.exports = { auditManifest, auditPage, auditDir, PERMISSIONS, BASE_PERMISSIONS, ALLOWED_KEYS };
