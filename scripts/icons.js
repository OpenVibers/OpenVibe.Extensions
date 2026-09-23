#!/usr/bin/env node
'use strict';
/**
 * Draws the toolbar icons (a ticket in the network's coupons amber) as PNGs, with no dependency:
 * 4× supersampled coverage, written with zlib. Run once when the design changes:
 *   node scripts/icons.js      → browser/icons/icon-{16,32,48,128}.png
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const CRC_TABLE = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type, data) {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
}
function png(size, rgba) {
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
    const raw = Buffer.alloc((size * 4 + 1) * size);
    for (let y = 0; y < size; y++) { raw[y * (size * 4 + 1)] = 0; rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4); }
    return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

// Shape in unit coordinates (0..1): a rounded ticket with side notches and a perforation.
function inside(x, y) {
    const l = 0.08, r = 0.92, t = 0.24, b = 0.76, rad = 0.08;
    if (x < l || x > r || y < t || y > b) return 0;
    const cx = Math.min(Math.max(x, l + rad), r - rad), cy = Math.min(Math.max(y, t + rad), b - rad);
    if ((x - cx) ** 2 + (y - cy) ** 2 > rad * rad) return 0;
    const notch = 0.09;
    if ((x - l) ** 2 + (y - 0.5) ** 2 < notch * notch || (x - r) ** 2 + (y - 0.5) ** 2 < notch * notch) return 0;
    if (Math.abs(x - 0.36) < 0.025 && Math.floor((y - t) / 0.065) % 2 === 1) return 2; // perforation
    return 1;
}

function draw(size) {
    const px = Buffer.alloc(size * size * 4);
    const S = 4;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
        let fill = 0, hole = 0;
        for (let sy = 0; sy < S; sy++) for (let sx = 0; sx < S; sx++) {
            const v = inside((x + (sx + 0.5) / S) / size, (y + (sy + 0.5) / S) / size);
            if (v === 1) fill++; else if (v === 2) hole++;
        }
        const n = S * S, a = (fill + hole) / n;
        const i = (y * size + x) * 4;
        // amber #f59e0b, the perforation darker
        const mix = hole / Math.max(1, fill + hole);
        px[i] = Math.round(0xf5 * (1 - mix) + 0x92 * mix);
        px[i + 1] = Math.round(0x9e * (1 - mix) + 0x40 * mix);
        px[i + 2] = Math.round(0x0b * (1 - mix) + 0x0e * mix);
        px[i + 3] = Math.round(a * 255);
    }
    return png(size, px);
}

const out = path.join(__dirname, '..', 'browser', 'icons');
fs.mkdirSync(out, { recursive: true });
for (const s of [16, 32, 48, 128]) fs.writeFileSync(path.join(out, `icon-${s}.png`), draw(s));
console.log('icons written to', out);
