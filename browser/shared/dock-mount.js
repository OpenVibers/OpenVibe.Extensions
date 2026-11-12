// The Dock body inside a host sheet. Loaded only when mountInto is first used.
(function (root) {
    'use strict';
    function mount(host, first, bridge) {
        if (!document.getElementById('ovdk-mount-styles')) {
            const style = document.createElement('style');
            style.id = 'ovdk-mount-styles';
            style.textContent = `
                .ovdk.ovdk-inline, .ovdk.ovdk-inline[data-corner] { position: relative !important; inset: auto !important; z-index: auto !important; width: 100% !important; height: 100% !important; max-width: 100% !important; max-height: none !important; min-height: 0; padding: 0 !important; border: 0; border-radius: 0; box-shadow: none !important; transform: none !important; animation: none !important; }
                .ovdk-inline .ovdk-body { width: 100%; min-width: 0; border: 0; overflow: hidden; }
                .ovdk-inline .ovdk-panel { min-width: 0; overflow-x: hidden; }
                @media (max-width: 640px) { .ovdk-inline button, .ovdk-inline a, .ovdk-inline summary, .ovdk-inline input, .ovdk-inline textarea { min-height: 44px !important; max-height: none !important; box-sizing: border-box; } }
            `;
            document.head.append(style);
        }
        const wrap = document.createElement('section');
        wrap.className = 'ovdk ovdk-inline';
        wrap.setAttribute('aria-label', 'Dock panel');
        host.replaceChildren(wrap);
        bridge.start(wrap);
        let gone = false;
        const show = (tab) => { if (!gone) bridge.show(tab); };
        show(first);
        return { show, destroy() { if (gone) return; gone = true; bridge.end(); host.replaceChildren(); } };
    }
    root.OpenVibeDockMount = { mount };
})(typeof window !== 'undefined' ? window : globalThis);
