'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createFillClient } = require('../browser/lib/network-api');

test('Companion fill client sends only the scoped token and encrypted grant to Run', async () => {
    const calls = [];
    const client = createFillClient({ networkOrigin: 'https://openvibe.network', runOrigin: 'https://openvibe.run', getToken: async () => 'dock-token', fetch: async (url, init) => {
        calls.push({ url, init });
        return new Response(JSON.stringify(url.includes('fill-targets') ? { machines: [] } : url.endsWith('/fill-requests') ? { requests: [] } : { outcome: 'ok' }), { status: 200 });
    } });
    assert.deepEqual(await client.requests(), { requests: [] });
    assert.deepEqual(await client.targets(), { machines: [] });
    assert.deepEqual(await client.grant('fill_1', 'sealed-envelope'), { outcome: 'ok' });
    assert.deepEqual(calls.map((x) => new URL(x.url).origin), ['https://openvibe.run', 'https://openvibe.network', 'https://openvibe.run']);
    assert.ok(calls.every((x) => x.init.credentials === 'omit' && x.init.headers.Authorization === 'Bearer dock-token'));
    assert.deepEqual(JSON.parse(calls[2].init.body), { request_id: 'fill_1', envelope: 'sealed-envelope' });
    assert.ok(!JSON.stringify(calls).includes('password'));
});
