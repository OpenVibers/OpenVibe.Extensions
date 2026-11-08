'use strict';
// Optional real-browser check. PLAYWRIGHT_MODULE may point at an installed Playwright module.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { sourceFiles, forTarget } = require('../scripts/pack');
const root = path.join(__dirname, '..');
const artifacts = process.env.LOCKER_SHOTS || path.join(root, 'artifacts', 'locker');
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
    fs.mkdirSync(artifacts, { recursive: true });
    const browser = await chromium.launch({ headless: true });
    try {
        for (const width of [320, 390, 1280]) for (const scheme of ['light', 'dark']) {
            const page = await browser.newPage({ viewport: { width, height: 900 }, colorScheme: scheme });
            const errors = []; page.on('pageerror', (error) => errors.push(error.message));
            await page.setContent('<html><head></head><body><header><h1>OpenVibe Companion</h1></header><section id="locker" class="locker"></section></body></html>');
            await page.addStyleTag({ path: path.join(root, 'browser/popup.css') });
            await page.addScriptTag({ path: path.join(root, 'browser/lib/locker-panel.js') });
            await page.evaluate(() => {
                let locked = true; window.actions = [];
                OVLockerPanel.mount({ container: document.getElementById('locker'), platform: { tabs: { active: async () => ({ id: 7, url: 'https://example.test/signin' }) } },
                    ask: async (m) => {
                        window.actions.push(m.type);
                        if (m.type === 'locker:status') return { ok: true, locked };
                        if (m.type === 'locker:unlock') { locked = false; return { ok: true }; }
                        if (m.type === 'locker:lock') { locked = true; return { ok: true }; }
                        if (m.type === 'locker:list') return { ok: true, items: [{ id: 'fixture', username: 'alice@example.test', hasTotp: true }] };
                        return { ok: true };
                    } });
            });
            await page.getByRole('button', { name: 'Unlock Locker', exact: true }).waitFor();
            await page.screenshot({ path: path.join(artifacts, `locked-${width}-${scheme}.png`), fullPage: true });
            await page.locator('[name=secret]').fill('fixture passphrase');
            await page.getByRole('button', { name: 'Unlock Locker', exact: true }).click();
            await page.getByRole('button', { name: 'Fill', exact: true }).waitFor();
            assert.deepEqual(await page.evaluate(() => actions), ['locker:status', 'locker:unlock', 'locker:list']);
            await page.getByRole('button', { name: 'Fill', exact: true }).click();
            await page.getByRole('button', { name: 'Fill and sign in', exact: true }).click();
            await page.getByText('Save this login', { exact: true }).click();
            await page.locator('[name=username]').fill('new@example.test'); await page.locator('[name=password]').fill('fixture password');
            await page.screenshot({ path: path.join(artifacts, `unlocked-${width}-${scheme}.png`), fullPage: true });
            assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width);
            assert.equal(await page.locator('#locker button').evaluateAll((nodes) => nodes.every((n) => n.getBoundingClientRect().height >= 44)), true);
            await page.getByRole('button', { name: 'Save encrypted login', exact: true }).click();
            await page.getByRole('button', { name: 'Lock now', exact: true }).click();
            assert.equal(await page.locator('[name=password]').count(), 0);
            assert.deepEqual(errors, []); await page.close();
        }
    } finally { await browser.close(); }
    console.log('Popup: 12 screenshots, 320/390/1280 px, both themes, no overflow or console errors, 44 px controls; trusted clicks exercised.');

    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'companion-locker-browser-'));
    const files = sourceFiles('https://openvibe.coupons'); forTarget(files, 'chrome');
    for (const [name, data] of files) { fs.mkdirSync(path.dirname(path.join(tmp, name)), { recursive: true }); fs.writeFileSync(path.join(tmp, name), data); }
    const context = await chromium.launchPersistentContext('', { headless: true, channel: 'chromium', args: [`--disable-extensions-except=${tmp}`, `--load-extension=${tmp}`] });
    try {
        const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
        await context.route('https://example.test/**', (route) => route.fulfill({ contentType: 'text/html', body: '<html><body>Clipboard test</body></html>' }));
        const page = await context.newPage(); await page.goto('https://example.test');
        await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'https://example.test' });
        await worker.evaluate(async () => { await OVPlatform.createPlatform(chrome, OVConfig).clipboard.write('clipboard test fixture'); });
        assert.equal(await page.evaluate(() => navigator.clipboard.readText()), 'clipboard test fixture');
        console.log('Packaged worker/offscreen copied successfully; checking 30-second clearing with no popup open.');
        await pause(31000);
        assert.equal(await page.evaluate(() => navigator.clipboard.readText()), '');
        assert.equal(await worker.evaluate(async () => (await chrome.storage.local.get('lockerUnlock')).lockerUnlock), undefined);
        console.log('Real clipboard cleared after 30 seconds with no popup open.');
    } finally { await context.close(); fs.rmSync(tmp, { recursive: true, force: true }); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
