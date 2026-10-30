/*
 * The Dock in the side panel: the same Dock every OpenVibe site shows, in the browser's own side
 * panel (Chrome's side panel, Firefox's sidebar), on any site.
 *
 * The Dock is the released OpenVibe.Shared one, bundled under browser/shared/ because the
 * extension's CSP allows no remote script. The panel gives it the Network origin and the
 * person's Network sign-in, so it reads and writes the same state as the Dock on a site: the
 * same tabs (Agents, Chats, Activity) and the same place.
 *
 * The extension had no Network sign-in of its own (it holds the Coupons install token, which is
 * not an OpenVibe sign-in), so the settings page asks for the person's Network token once, the
 * same way it asks for the Coupons one. Without it the panel says so instead of pretending.
 */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else { root.OVPanel = api; if (root.document && root.OpenVibeDock) api.boot(root); }
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    function createPanel(opts) {
        const doc = opts.doc;
        const gate = doc.getElementById('gate');
        const gateTitle = doc.getElementById('gate-title');
        const gateText = doc.getElementById('gate-text');
        const gateButton = doc.getElementById('gate-button');

        function showGate(title, text, button) {
            gateTitle.textContent = title;
            gateText.textContent = text;
            gateButton.textContent = button || '';
            gateButton.hidden = !button;
            gate.hidden = false;
        }

        /** The Dock, with the Network's state, or the gate that says what is missing. */
        async function start() {
            const token = await opts.platform.storage.getNetworkToken();
            if (!token) {
                showGate('Sign in to OpenVibe.Network',
                    'The Dock shows what your agents are doing and what your chats wait for. It needs your OpenVibe.Network sign-in.',
                    'Open the settings');
                return { mounted: false, reason: 'no-token' };
            }
            try {
                await opts.net.dock();
            } catch (err) {
                showGate('OpenVibe.Network said no',
                    'That sign-in was not accepted. Sign in to OpenVibe.Network again and paste a fresh token in the settings.',
                    'Open the settings');
                return { mounted: false, reason: 'refused' };
            }
            opts.dock.mount({
                token: token,
                apiBase: opts.config.NETWORK_ORIGIN,
                chatBase: opts.config.CHAT_ORIGIN,
                sibling: opts.sibling,
            });
            opts.dock.open();
            gate.hidden = true;
            return { mounted: true, reason: null };
        }

        if (gateButton && typeof gateButton.addEventListener === 'function') {
            gateButton.addEventListener('click', function () { if (opts.openSettings) opts.openSettings(); });
        }
        return { start: start, showGate: showGate };
    }

    /** The page wiring: the real browser APIs and the real Dock. */
    function boot(root) {
        const ext = root.browser || root.chrome;
        const config = root.OVConfig;
        const platform = root.OVPlatform.createPlatform(ext, config);
        const net = root.OVNetwork.createNetworkClient({
            origin: config.NETWORK_ORIGIN,
            fetch: self.fetch.bind(self),
            getToken: platform.storage.getNetworkToken,
            timeoutMs: config.TIMEOUT_MS,
        });
        const panel = createPanel({
            doc: root.document,
            config: config,
            platform: platform,
            net: net,
            dock: root.OpenVibeDock,
            sibling: function (name) { return ext.runtime.getURL('shared/' + name); },
            openSettings: function () { ext.runtime.openOptionsPage(); },
        });
        panel.start();
        return panel;
    }

    return { createPanel: createPanel, boot: boot };
});
