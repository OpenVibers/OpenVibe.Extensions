'use strict';
/**
 * The permission audit: the shipped manifest passes, and every way of widening it fails. Plus a
 * scan of the extension's code for APIs it must never use.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { auditDir, auditManifest, auditPage } = require('../scripts/audit');
const { check, done } = require('./helpers/harness');

const DIR = path.join(__dirname, '..', 'browser');
const ORIGIN = 'https://openvibe.coupons';

(async () => {
    const { manifest, origin, problems } = auditDir(DIR);

    await check('the shipped manifest passes the audit: activeTab + storage, one host permission (the API), MV3', async () => {
        assert.deepStrictEqual(problems, []);
        assert.strictEqual(origin, ORIGIN);
        assert.deepStrictEqual(manifest.permissions.slice().sort(), ['activeTab', 'storage']);
        assert.deepStrictEqual(manifest.host_permissions, ['https://openvibe.coupons/*']);
        for (const k of ['content_scripts', 'background', 'web_accessible_resources', 'externally_connectable', 'optional_permissions', 'optional_host_permissions']) {
            assert.ok(!(k in manifest), `${k} must not be present`);
        }
    });

    await check('the audit fails if anything widens', async () => {
        const widen = [
            (m) => m.permissions.push('tabs'),
            (m) => m.permissions.push('cookies'),
            (m) => m.permissions.push('scripting'),
            (m) => m.permissions.push('<all_urls>'),
            (m) => m.permissions.push('webRequest'),
            (m) => m.permissions.push('history'),
            (m) => m.permissions.push('clipboardRead'),
            (m) => m.host_permissions.push('<all_urls>'),
            (m) => m.host_permissions.push('https://*/*'),
            (m) => { m.host_permissions = ['https://*.openvibe.coupons/*']; },
            (m) => { m.content_scripts = [{ matches: ['<all_urls>'], js: ['x.js'] }]; },
            (m) => { m.background = { service_worker: 'bg.js' }; },
            (m) => { m.web_accessible_resources = [{ resources: ['popup.html'], matches: ['<all_urls>'] }]; },
            (m) => { m.externally_connectable = { matches: ['https://*/*'] }; },
            (m) => { m.optional_host_permissions = ['https://*/*']; },
            (m) => { m.optional_permissions = ['tabs']; },
            (m) => { m.content_security_policy.extension_pages = "default-src 'none'; script-src 'self' 'unsafe-eval'; connect-src https://openvibe.coupons; object-src 'none'"; },
            (m) => { m.content_security_policy.extension_pages = "default-src 'none'; script-src 'self'; connect-src https://openvibe.coupons https://tracker.example.net; object-src 'none'"; },
            (m) => { m.content_security_policy.extension_pages = "default-src 'none'; script-src 'self' https://cdn.example.net; connect-src https://openvibe.coupons; object-src 'none'"; },
            (m) => { m.manifest_version = 2; },
        ];
        for (const [i, mutate] of widen.entries()) {
            const m = JSON.parse(JSON.stringify(manifest));
            mutate(m);
            assert.ok(auditManifest(m, { apiOrigin: ORIGIN }).length > 0, `widening #${i} was not caught: ${mutate}`);
        }
    });

    await check('the API origin agrees across lib/config.js, host_permissions and the CSP connect-src', async () => {
        const csp = manifest.content_security_policy.extension_pages;
        assert.match(csp, /connect-src https:\/\/openvibe\.coupons;/);
        assert.strictEqual(auditManifest(manifest, { apiOrigin: 'https://evil.example.net' }).length > 0, true);
    });

    await check('pages load only local scripts: no inline script, no inline handlers, no remote code', async () => {
        for (const p of ['popup.html', 'options.html']) assert.deepStrictEqual(auditPage(fs.readFileSync(path.join(DIR, p), 'utf8'), p), []);
        assert.ok(auditPage('<script>alert(1)</script>', 'x').length);
        assert.ok(auditPage('<script src="https://cdn.example.net/x.js"></script>', 'x').length);
        assert.ok(auditPage('<button onclick="x()">', 'x').length);
    });

    await check('the code never uses page access, cookies, dynamic code or HTML injection; only api.js fetches', async () => {
        const files = [];
        (function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (p.endsWith('.js')) files.push(p); } })(DIR);
        const forbidden = [/\binnerHTML\b/, /\bouterHTML\b/, /insertAdjacentHTML/, /document\.write/, /\beval\s*\(/, /new Function\s*\(/, /\bcookies\b/, /document\.cookie/,
            /executeScript/, /\.scripting\b/, /\bhistory\.(search|getVisits)/, /webRequest/, /storage\.sync/, /sendMessage|onMessageExternal|runtime\.connect/, /XMLHttpRequest/, /importScripts/];
        for (const f of files) {
            // Comments may name what the code must not do; only code is scanned.
            const src = fs.readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"])\/\/.*$/gm, '$1');
            for (const re of forbidden) assert.doesNotMatch(src, re, `${path.relative(DIR, f)} uses ${re}`);
            const rel = path.relative(DIR, f);
            if (rel !== path.join('lib', 'api.js')) assert.doesNotMatch(src.replace(/fetch: self\.fetch\.bind\(self\)/g, ''), /\bfetch\s*\(/, `${rel} makes a request itself`);
        }
        const tabUse = files.filter((f) => /\btabs\.query\b/.test(fs.readFileSync(f, 'utf8'))).map((f) => path.relative(DIR, f));
        assert.deepStrictEqual(tabUse, [path.join('lib', 'platform.js')], 'only the platform wrapper touches tabs');
    });

    done();
})();
