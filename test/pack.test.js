'use strict';
/**
 * scripts/pack.js: the zip holds exactly browser/, passes the audit, is byte-for-byte reproducible,
 * and a development build rewrites the API origin in all three places together.
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const { build } = require('../scripts/pack');
const { auditManifest } = require('../scripts/audit');
const { check, done } = require('./helpers/harness');

/** Minimal zip reader for the test: name → Buffer. */
function unzip(buf) {
    const out = new Map();
    const end = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
    const count = buf.readUInt16LE(end + 10);
    let p = buf.readUInt32LE(end + 16);
    for (let i = 0; i < count; i++) {
        const method = buf.readUInt16LE(p + 10);
        const csize = buf.readUInt32LE(p + 20);
        const nameLen = buf.readUInt16LE(p + 28);
        const extra = buf.readUInt16LE(p + 30);
        const comment = buf.readUInt16LE(p + 32);
        const local = buf.readUInt32LE(p + 42);
        const name = buf.slice(p + 46, p + 46 + nameLen).toString('utf8');
        const lname = buf.readUInt16LE(local + 26);
        const lextra = buf.readUInt16LE(local + 28);
        const data = buf.slice(local + 30 + lname + lextra, local + 30 + lname + lextra + csize);
        out.set(name, method === 8 ? zlib.inflateRawSync(data) : data);
        p += 46 + nameLen + extra + comment;
    }
    return out;
}

(async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ov-ext-test-'));

    await check('the release zip holds exactly browser/, byte for byte, and its manifest passes the audit', async () => {
        const r = build({ outDir: tmp });
        assert.match(path.basename(r.out), /^openvibe-coupons-helper-\d+\.\d+\.\d+\.zip$/);
        const files = unzip(fs.readFileSync(r.out));
        const src = path.join(__dirname, '..', 'browser');
        for (const [name, data] of files) assert.ok(data.equals(fs.readFileSync(path.join(src, name))), name);
        assert.ok(files.has('manifest.json') && files.has('popup.html') && files.has('lib/api.js') && files.has('icons/icon-128.png'));
        assert.deepStrictEqual(auditManifest(JSON.parse(files.get('manifest.json')), { apiOrigin: 'https://openvibe.coupons' }), []);
    });

    await check('the build is reproducible', async () => {
        const a = fs.readFileSync(build({ outDir: tmp }).out);
        const b = fs.readFileSync(build({ outDir: tmp }).out);
        assert.ok(a.equals(b));
    });

    await check('a development build points config, host permission and CSP at the dev origin together', async () => {
        const r = build({ api: 'http://localhost:4850', outDir: tmp });
        assert.match(r.out, /-dev\.zip$/);
        const files = unzip(fs.readFileSync(r.out));
        const m = JSON.parse(files.get('manifest.json'));
        assert.deepStrictEqual(m.host_permissions, ['http://localhost:4850/*']);
        assert.match(m.content_security_policy.extension_pages, /connect-src http:\/\/localhost:4850;/);
        assert.match(m.name, /development/);
        assert.match(files.get('lib/config.js').toString(), /API_ORIGIN: 'http:\/\/localhost:4850'/);
        assert.doesNotMatch(files.get('manifest.json').toString() + files.get('lib/config.js').toString(), /openvibe\.coupons\//);
    });

    await check('refuses remote http origins and anything that is not an origin', async () => {
        for (const bad of ['http://openvibe.coupons', 'http://evil.example.net', 'https://openvibe.coupons/path', 'ftp://x', '']) {
            assert.throws(() => build({ api: bad, outDir: tmp }), /--api/, bad);
        }
    });

    fs.rmSync(tmp, { recursive: true, force: true });
    done();
})();
