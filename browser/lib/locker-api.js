(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api; else root.OVLockerApi = api;
})(globalThis, function () {
    'use strict';
    function create({ fetch: request, getToken, origin }) {
        async function call(path, body) {
            const token = await getToken();
            const r = await request(origin + '/api/v1/companion' + path, {
                method: body ? 'POST' : 'GET', credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'error',
                headers: { Authorization: 'Bearer ' + token, ...(body ? { 'Content-Type': 'application/octet-stream' } : {}) },
                ...(body ? { body: new Blob([body], { type: 'application/octet-stream' }) } : {}), signal: AbortSignal.timeout(15000),
            });
            if (!r.ok) throw new Error(r.status === 401 || r.status === 403 ? 'Sign in again to allow Companion to use Locker.' : 'Locker could not complete this request.');
            return r;
        }
        return {
            keys: async () => (await call('/keys')).json(),
            async list() {
                const items = []; let before = '';
                do {
                    const page = await (await call('/logins' + (before ? '?before=' + encodeURIComponent(before) : ''))).json();
                    items.push(...page.items); before = page.next_cursor;
                } while (before);
                return items;
            },
            content: async (id) => new Uint8Array(await (await call('/logins/' + encodeURIComponent(id) + '/content')).arrayBuffer()),
            save: async (bytes) => (await call('/logins', bytes)).json(),
        };
    }
    return { create };
});
