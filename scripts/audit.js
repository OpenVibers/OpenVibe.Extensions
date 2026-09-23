'use strict';
/**
 * The permission audit for browser/manifest.json. test/manifest.test.js runs it, and so does
 * scripts/pack.js before it writes a zip. It fails when anything widens:
 *
 *   permissions            exactly activeTab + storage
 *   host_permissions       exactly <API origin>/*
 *   forbidden keys         content_scripts, background, web_accessible_resources,
 *                          externally_connectable, optional_permissions, optional_host_permissions,
 *                          declarative_net_request, chrome_url_overrides, devtools_page, sandbox,
 *                          side_panel, omnibox, … (anything not on the allow-list of keys)
 *   CSP                    script-src 'self' only, connect-src only the API origin, no unsafe-*
 *   pages                  popup/options HTML load only local scripts, no inline script
 *   config                 lib/config.js API_ORIGIN equals the host permission's origin
 */
const fs = require('fs');
const path = require('path');

const ALLOWED_KEYS = new Set(['manifest_version', 'name', 'short_name', 'version', 'description', 'homepage_url', 'author', 'icons',
    'action', 'options_ui', 'permissions', 'host_permissions', 'content_security_policy', 'minimum_chrome_version', 'browser_specific_settings']);
const PERMISSIONS = ['activeTab', 'storage'];

function auditManifest(m, { apiOrigin }) {
    const problems = [];
    if (m.manifest_version !== 3) problems.push('manifest_version must be 3');
    for (const k of Object.keys(m)) if (!ALLOWED_KEYS.has(k)) problems.push(`manifest key "${k}" is not allowed`);
    const perms = Array.isArray(m.permissions) ? m.permissions : [];
    if (perms.length !== PERMISSIONS.length || !PERMISSIONS.every((p) => perms.includes(p))) problems.push(`permissions must be exactly ${PERMISSIONS.join(', ')} (got ${perms.join(', ') || 'none'})`);
    const hosts = Array.isArray(m.host_permissions) ? m.host_permissions : [];
    if (hosts.length !== 1 || hosts[0] !== `${apiOrigin}/*`) problems.push(`host_permissions must be exactly ${apiOrigin}/* (got ${hosts.join(', ') || 'none'})`);
    if (!m.action || m.action.default_popup !== 'popup.html') problems.push('action.default_popup must be popup.html');
    if (!m.options_ui || m.options_ui.page !== 'options.html') problems.push('options_ui.page must be options.html');
    const csp = m.content_security_policy && m.content_security_policy.extension_pages;
    if (!csp) problems.push('content_security_policy.extension_pages is required');
    else {
        const dirs = Object.fromEntries(csp.split(';').map((d) => d.trim()).filter(Boolean).map((d) => { const [k, ...v] = d.split(/\s+/); return [k, v]; }));
        if (JSON.stringify(dirs['script-src']) !== JSON.stringify(["'self'"])) problems.push("CSP script-src must be exactly 'self'");
        if (JSON.stringify(dirs['connect-src']) !== JSON.stringify([apiOrigin])) problems.push(`CSP connect-src must be exactly ${apiOrigin}`);
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
    const problems = [];
    if (!origin) problems.push('lib/config.js has no API_ORIGIN');
    problems.push(...auditManifest(manifest, { apiOrigin: origin }));
    for (const page of ['popup.html', 'options.html']) problems.push(...auditPage(fs.readFileSync(path.join(dir, page), 'utf8'), page));
    return { manifest, origin, problems };
}

module.exports = { auditManifest, auditPage, auditDir, PERMISSIONS, ALLOWED_KEYS };
