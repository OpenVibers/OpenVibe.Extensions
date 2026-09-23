#!/usr/bin/env node
'use strict';
/**
 * Packs browser/ into a zip for loading or store review. It never uploads anything anywhere.
 *
 *   node scripts/pack.js                          → dist/openvibe-coupons-helper-<version>.zip
 *   node scripts/pack.js --api http://localhost:4850
 *                                                 → dist/openvibe-coupons-helper-<version>-dev.zip,
 *     a development build whose API origin (lib/config.js), host permission and CSP connect-src
 *     are rewritten together. Only https origins, or http://localhost / http://127.0.0.1.
 *
 * The permission audit (scripts/audit.js) runs on the files that go into the zip; a failure stops
 * the build. Entries are sorted and dated 1980-01-01 so the same tree gives the same bytes.
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { auditDir } = require('./audit');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'browser');
const DEFAULT_ORIGIN = 'https://openvibe.coupons';

const CRC_TABLE = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };

/** entries: [{ name, data }] → zip Buffer (deflate, fixed DOS date 1980-01-01 00:00). */
function zip(entries) {
    const locals = [];
    const centrals = [];
    let offset = 0;
    for (const { name, data } of entries) {
        const nameBuf = Buffer.from(name, 'utf8');
        const deflated = zlib.deflateRawSync(data, { level: 9 });
        const useDeflate = deflated.length < data.length;
        const body = useDeflate ? deflated : data;
        const crc = crc32(data);
        const local = Buffer.alloc(30);
        local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6);
        local.writeUInt16LE(useDeflate ? 8 : 0, 8); local.writeUInt16LE(0, 10); local.writeUInt16LE(0x21, 12);
        local.writeUInt32LE(crc, 14); local.writeUInt32LE(body.length, 18); local.writeUInt32LE(data.length, 22);
        local.writeUInt16LE(nameBuf.length, 26); local.writeUInt16LE(0, 28);
        locals.push(local, nameBuf, body);
        const central = Buffer.alloc(46);
        central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(0x0800, 8);
        central.writeUInt16LE(useDeflate ? 8 : 0, 10); central.writeUInt16LE(0, 12); central.writeUInt16LE(0x21, 14);
        central.writeUInt32LE(crc, 16); central.writeUInt32LE(body.length, 20); central.writeUInt32LE(data.length, 24);
        central.writeUInt16LE(nameBuf.length, 28); central.writeUInt16LE(0, 30); central.writeUInt16LE(0, 32);
        central.writeUInt16LE(0, 34); central.writeUInt16LE(0, 36); central.writeUInt32LE(0, 38); central.writeUInt32LE(offset, 42);
        centrals.push(central, nameBuf);
        offset += local.length + nameBuf.length + body.length;
    }
    const cd = Buffer.concat(centrals);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
    end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
    return Buffer.concat([...locals, cd, end]);
}

function listFiles(dir, base = dir) {
    const out = [];
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.name.startsWith('.')) continue;
        const p = path.join(dir, e.name);
        if (e.isDirectory()) out.push(...listFiles(p, base)); else out.push(path.relative(base, p).split(path.sep).join('/'));
    }
    return out.sort();
}

/** Copy of browser/ with the API origin rewritten (dev builds), as { name → Buffer }. */
function sourceFiles(apiOrigin) {
    const files = new Map(listFiles(SRC).map((f) => [f, fs.readFileSync(path.join(SRC, f))]));
    if (apiOrigin !== DEFAULT_ORIGIN) {
        const swap = (name) => files.set(name, Buffer.from(files.get(name).toString('utf8').split(DEFAULT_ORIGIN).join(apiOrigin)));
        swap('manifest.json');
        swap('lib/config.js');
        const m = JSON.parse(files.get('manifest.json'));
        m.name += ' (development)';
        files.set('manifest.json', Buffer.from(JSON.stringify(m, null, 2) + '\n'));
    }
    return files;
}

function build({ api = DEFAULT_ORIGIN, outDir = path.join(ROOT, 'dist') } = {}) {
    if (!/^https:\/\/[a-z0-9.-]+(:\d+)?$/.test(api) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(api)) {
        throw new Error('--api must be an https origin, or http://localhost / http://127.0.0.1 for development');
    }
    const files = sourceFiles(api);
    const tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'ov-ext-pack-'));
    try {
        for (const [name, data] of files) { fs.mkdirSync(path.dirname(path.join(tmp, name)), { recursive: true }); fs.writeFileSync(path.join(tmp, name), data); }
        const audit = auditDir(tmp);
        if (audit.problems.length) throw new Error(`permission audit failed:\n  - ${audit.problems.join('\n  - ')}`);
        const version = audit.manifest.version;
        fs.mkdirSync(outDir, { recursive: true });
        const out = path.join(outDir, `openvibe-coupons-helper-${version}${api === DEFAULT_ORIGIN ? '' : '-dev'}.zip`);
        fs.writeFileSync(out, zip([...files].map(([name, data]) => ({ name, data }))));
        return { out, files: [...files.keys()], origin: api };
    } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
    }
}

if (require.main === module) {
    const i = process.argv.indexOf('--api');
    try {
        const r = build({ api: i > -1 ? String(process.argv[i + 1] || '').replace(/\/+$/, '') : DEFAULT_ORIGIN });
        console.log(`wrote ${path.relative(process.cwd(), r.out)} (${r.files.length} files, API ${r.origin})`);
    } catch (err) {
        console.error(err.message);
        process.exit(1);
    }
}

module.exports = { build, zip, crc32 };
