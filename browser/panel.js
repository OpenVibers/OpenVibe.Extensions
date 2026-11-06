/*
 * The Dock in the side panel: the same Dock every OpenVibe site shows, in the browser's own side
 * panel (Chrome's side panel, Firefox's sidebar), on any site.
 *
 * The Dock is the released OpenVibe.Shared one, bundled under browser/shared/ because the
 * extension's CSP allows no remote script. The panel gives it the Network origin and the
 * person's Network sign-in, so it reads and writes the same state as the Dock on a site: the
 * same tabs (Agents, Chats, Activity) and the same place.
 *
 * The sign-in is the Network's OAuth public client (lib/auth.js): one press, PKCE, a scoped access
 * token in storage.session and a rotating refresh token in storage.local. The 0.7.0 pasted
 * `networkToken` is still accepted as a fallback until a later release removes it.
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
        let current = null, mounted = false;

        function showGate(title, text, button) {
            gateTitle.textContent = title;
            gateText.textContent = text;
            gateButton.textContent = button || '';
            gateButton.hidden = !button;
            gate.hidden = false;
        }

        function messageFor(e) {
            const code = e && e.code;
            if (code === 'auth.cancelled') return 'Sign-in was cancelled.';
            if (code === 'auth.login_required') return 'Sign in to OpenVibe.Network first, then try again.';
            if (code === 'auth.scope') return 'This version of the extension asks for something this Network does not offer.';
            if (code === 'auth.redirect') return 'This build’s sign-in address is not registered. Update the extension.';
            if (code === 'auth.network') return 'Could not reach openvibe.network. Try again.';
            return 'Sign-in could not be completed. Try again.';
        }

        /** The Dock, with the Network's state, or the gate that says what is missing. */
        async function start() {
            let status;
            try { status = await opts.auth.status(); } catch { status = { mode: 'none' }; }
            if (!status || status.mode === 'none') {
                showGate('Sign in to OpenVibe.Network',
                    'The Dock shows what your agents are doing and what your chats wait for. It needs your OpenVibe.Network sign-in.',
                    'Sign in');
                return { mounted: false, reason: 'no-token' };
            }
            try {
                current = await opts.net.dock();
            } catch (err) {
                showGate('OpenVibe.Network said no',
                    'That sign-in was not accepted. Sign in to OpenVibe.Network again.',
                    'Sign in');
                return { mounted: false, reason: 'refused' };
            }
            const scopes = await opts.auth.scopes();
            const account = await opts.auth.account();
            opts.dock.mount({
                token: function () { return opts.auth.accessToken(); },
                scopes: scopes,
                me: account && account.username ? account.username : '',
                apiBase: opts.config.NETWORK_ORIGIN,
                chatBase: opts.config.CHAT_ORIGIN,
                sibling: opts.sibling,
            });
            // Hand the state we just read to the Dock as it opens, so its own first read cannot race it back to the
            // default tab. The page and the side panel then open on the same tab, chat and agent.
            opts.dock.open({ doc: current });
            mounted = true;
            gate.hidden = true;
            return { mounted: true, reason: null, mode: status.mode };
        }

        /** Re-read the Network's Dock state and hand it to the open Dock in place (the panel follows the page). */
        async function sync() {
            if (!mounted) return null;
            try {
                const next = await opts.net.dock();
                current = next;
                if (opts.dock.update) opts.dock.update(next);
                return next;
            } catch { return null; }
        }

        async function signIn() {
            if (!opts.auth) return;
            gateButton.disabled = true;
            const old = gateButton.textContent;
            gateButton.textContent = 'Signing in…';
            try {
                await opts.auth.signIn({ interactive: true });
                await start();
            } catch (e) {
                showGate('Sign-in was not completed', messageFor(e), 'Try again');
            } finally {
                gateButton.disabled = false;
                if (gate.hidden) gateButton.textContent = old;
            }
        }

        if (gateButton && typeof gateButton.addEventListener === 'function') {
            gateButton.addEventListener('click', function () { signIn(); });
        }
        return { start: start, sync: sync, signIn: signIn, showGate: showGate, messageFor: messageFor };
    }

    /** The page wiring: the real browser APIs and the real Dock. */
    function boot(root) {
        const ext = root.browser || root.chrome;
        const config = root.OVConfig;
        const platform = root.OVPlatform.createPlatform(ext, config);
        const auth = root.OVAuth.createAuth({ platform: platform, config: config, fetch: self.fetch.bind(self) });
        const net = root.OVNetwork.createNetworkClient({
            origin: config.NETWORK_ORIGIN,
            fetch: self.fetch.bind(self),
            getToken: function () { return auth.accessToken(); },
            timeoutMs: config.TIMEOUT_MS,
        });
        const panel = createPanel({
            doc: root.document,
            config: config,
            platform: platform,
            auth: auth,
            net: net,
            dock: root.OpenVibeDock,
            sibling: function (name) { return ext.runtime.getURL('shared/' + name); },
            openSettings: function () { ext.runtime.openOptionsPage(); },
        });
        panel.start();
        // The side panel stays open while the person moves between tabs and sites: re-read the Network's Dock state
        // again every 30 s, and when the browser shows the panel again, so the page, the pop-out and the panel agree.
        const syncT = setInterval(function () { panel.sync(); }, 30000);
        if (syncT && typeof syncT.unref === 'function') syncT.unref();
        root.document.addEventListener('visibilitychange', function () {
            if (!root.document.hidden) panel.sync();
        });
        return panel;
    }

    return { createPanel: createPanel, boot: boot };
});
