(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api; else root.OVLockerClipboard = api;
})(globalThis, function () {
    'use strict';
    function create({ write, later = setTimeout, cancel = clearTimeout }) {
        let timer, queue = Promise.resolve();
        function clear() { queue = queue.catch(() => {}).then(() => write('')); return queue; }
        return {
            write(value) {
                queue = queue.catch(() => {}).then(async () => {
                    await write(value);
                    cancel(timer);
                    timer = later(() => { clear().catch(() => { timer = later(() => clear().catch(() => {}), 1000); }); }, 30000);
                });
                return queue;
            },
            clear,
        };
    }
    return { create };
});
