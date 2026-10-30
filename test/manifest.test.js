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
const ORIGINS = ['https://openvibe.coupons', 'https://openvibe.network', 'https://openvibe.chat'];

(async () => {
    const { manifest, origin, problems } = auditDir(DIR);

    await check('the shipped manifest passes the audit: activeTab + scripting + storage + sidePanel, three OpenVibe host permissions, MV3', async () => {
        assert.deepStrictEqual(problems, []);
        assert.strictEqual(origin, ORIGIN);
        assert.deepStrictEqual(manifest.permissions.slice().sort(), ['activeTab', 'scripting', 'sidePanel', 'storage']);
        assert.deepStrictEqual(manifest.host_permissions, ['https://openvibe.coupons/*', 'https://openvibe.network/*', 'https://openvibe.chat/*']);
        assert.strictEqual(manifest.side_panel.default_path, 'panel.html', 'the Dock lives in the side panel');
        for (const k of ['content_scripts', 'background', 'web_accessible_resources', 'externally_connectable', 'optional_permissions', 'optional_host_permissions']) {
            assert.ok(!(k in manifest), `${k} must not be present`);
        }
    });

    await check('the side panel is a key in both browsers\' manifests', async () => {
        const { forTarget } = require('../scripts/pack');
        const ff = new Map([['manifest.json', Buffer.from(JSON.stringify(manifest))]]);
        forTarget(ff, 'firefox');
        const firefox = JSON.parse(ff.get('manifest.json').toString('utf8'));
        assert.ok(!('side_panel' in firefox), 'Firefox has no Chrome key');
        assert.strictEqual(firefox.sidebar_action.default_panel, 'panel.html');
        assert.ok(firefox.permissions.includes('sidebarAction'), 'and its own side-panel permission');
        assert.ok(!firefox.permissions.includes('sidePanel'), 'not Chrome\'s');
        const ch = new Map([['manifest.json', Buffer.from(JSON.stringify(manifest))]]);
        forTarget(ch, 'chrome');
        const chrome = JSON.parse(ch.get('manifest.json').toString('utf8'));
        assert.ok(chrome.side_panel, 'Chrome keeps side_panel');
        assert.ok(!('sidebar_action' in chrome), 'and no Firefox key');
        assert.ok(chrome.permissions.includes('sidePanel'));
    });

    await check('the audit fails if anything widens', async () => {
        const widen = [
            (m) => m.permissions.push('tabs'),
            (m) => m.permissions.push('cookies'),
            (m) => m.permissions.push('declarativeNetRequest'),
            (m) => { m.permissions = m.permissions.filter((p) => p !== 'scripting').concat('tabs'); },
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
            assert.ok(auditManifest(m, { apiOrigin: ORIGIN, origins: ORIGINS }).length > 0, `widening #${i} was not caught: ${mutate}`);
        }
    });

    await check('the API origin agrees across lib/config.js, host_permissions and the CSP connect-src', async () => {
        const csp = manifest.content_security_policy.extension_pages;
        assert.match(csp, /connect-src https:\/\/openvibe\.coupons https:\/\/openvibe\.network https:\/\/openvibe\.chat;/);
        assert.strictEqual(auditManifest(manifest, { apiOrigin: 'https://evil.example.net' }).length > 0, true, 'another origin is caught');
    });

    await check('pages load only local scripts: no inline script, no inline handlers, no remote code', async () => {
        for (const p of ['popup.html', 'options.html', 'panel.html']) assert.deepStrictEqual(auditPage(fs.readFileSync(path.join(DIR, p), 'utf8'), p), []);
        assert.ok(auditPage('<script>alert(1)</script>', 'x').length);
        assert.ok(auditPage('<script src="https://cdn.example.net/x.js"></script>', 'x').length);
        assert.ok(auditPage('<button onclick="x()">', 'x').length);
    });

    await check('the code never uses cookies, dynamic code or HTML injection; only api.js fetches; only platform.js runs a script in a page', async () => {
        const files = [];
        // browser/shared/ is the released OpenVibe.Shared Dock, bundled as it is: it is audited in its own
        // repository (OpenVibe.Shared), not here.
        (function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) { if (e.name !== 'shared') walk(p); } else if (p.endsWith('.js')) files.push(p); } })(DIR);
        const forbidden = [/\binnerHTML\b/, /\bouterHTML\b/, /insertAdjacentHTML/, /document\.write/, /\beval\s*\(/, /new Function\s*\(/, /\bcookies\b/, /document\.cookie/,
            /\bhistory\.(search|getVisits)/, /webRequest/, /storage\.sync/, /sendMessage|onMessageExternal|runtime\.connect/, /XMLHttpRequest/, /importScripts/];
        for (const f of files) {
            // Comments may name what the code must not do; only code is scanned.
            const src = fs.readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"])\/\/.*$/gm, '$1');
            for (const re of forbidden) assert.doesNotMatch(src, re, `${path.relative(DIR, f)} uses ${re}`);
            const rel = path.relative(DIR, f);
            if (rel !== path.join('lib', 'api.js') && rel !== path.join('lib', 'network-api.js')) assert.doesNotMatch(src.replace(/fetch: self\.fetch\.bind\(self\)/g, ''), /\bfetch\s*\(/, `${rel} makes a request itself`);
        }
        const tabUse = files.filter((f) => /\btabs\.(query|create|update)\b/.test(fs.readFileSync(f, 'utf8'))).map((f) => path.relative(DIR, f));
        assert.deepStrictEqual(tabUse, [path.join('lib', 'platform.js')], 'only the platform wrapper touches tabs (it opens only hand-off pages)');
        // The page is touched only by "Try these codes on this page", "Save its rating to OpenVibe Reviews" and the two Rent
        // buttons ("Keep on my Rent board", "Check the rent"): platform.js injects the packaged file for that button and calls it.
        const injects = files.filter((f) => /executeScript|ext\.scripting/.test(fs.readFileSync(f, 'utf8'))).map((f) => path.relative(DIR, f));
        assert.deepStrictEqual(injects, [path.join('lib', 'platform.js')], 'only the platform wrapper runs a script in a page');
        const plat = fs.readFileSync(path.join(DIR, 'lib', 'platform.js'), 'utf8');
        assert.deepStrictEqual([...plat.matchAll(/files:\s*\[([^\]]*)\]/g)].map((m) => m[1].trim()), ["'lib/autoapply.js'", "'lib/rating.js'", "'lib/listing.js'"], 'the three files it injects');
        assert.doesNotMatch(plat, /allFrames|world:\s*['"]MAIN|tabId:(?!\s*tabId\b)/, 'the active tab only, its top frame, the isolated world');
        // What runs in the page makes no request and reads no stored data.
        for (const file of ['autoapply.js', 'rating.js', 'listing.js']) {
            const src = fs.readFileSync(path.join(DIR, 'lib', file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
            for (const re of [/\bfetch\s*\(/, /XMLHttpRequest/, /WebSocket/, /sendBeacon/, /localStorage|sessionStorage|indexedDB/, /document\.cookie/, /\.submit\s*\(|requestSubmit/, /KeyboardEvent|keydown|keypress/, /chrome\.|browser\./]) {
                assert.doesNotMatch(src, re, `lib/${file} uses ${re}`);
            }
        }
        // Reading a rating or a listing presses nothing and types nothing.
        for (const file of ['rating.js', 'listing.js']) {
            assert.doesNotMatch(fs.readFileSync(path.join(DIR, 'lib', file), 'utf8'), /\.click\s*\(|dispatchEvent|\.value\s*=|\.focus\s*\(/, `lib/${file} only reads`);
        }
    });

    done();
})();
