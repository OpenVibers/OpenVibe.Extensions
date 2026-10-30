/*
 * Settings: connect (save a cpx_ install token after checking it is accepted), disconnect (remove
 * it), and grant the host permission for the API origin when the browser withheld it.
 */
(function () {
    'use strict';
    const ext = typeof browser !== 'undefined' ? browser : chrome;
    const config = self.OVConfig;
    const platform = self.OVPlatform.createPlatform(ext, config);
    const api = self.OVApi.createApiClient({ origin: config.API_ORIGIN, fetch: self.fetch.bind(self), getToken: platform.storage.getToken, timeoutMs: config.TIMEOUT_MS });
    const net = self.OVNetwork.createNetworkClient({ origin: config.NETWORK_ORIGIN, fetch: self.fetch.bind(self), getToken: platform.storage.getNetworkToken, timeoutMs: config.TIMEOUT_MS });
    const state = document.getElementById('state');
    const networkState = document.getElementById('network-state');
    const networkInput = document.getElementById('network-token');
    const input = document.getElementById('token');
    const permissionRow = document.getElementById('permission-row');
    document.getElementById('connect-link').href = config.API_ORIGIN + config.CONNECT_PATH;

    async function refresh() {
        const token = await platform.storage.getToken();
        state.textContent = token ? 'Connected (token ' + token.slice(0, 10) + '…).' : 'Not connected: lookups work, reporting does not.';
        permissionRow.hidden = await platform.permissions.hasApi();
    }

    document.getElementById('token-form').addEventListener('submit', async function (ev) {
        ev.preventDefault();
        const token = input.value.trim();
        if (!config.TOKEN_RE.test(token)) { state.textContent = 'That is not a token from openvibe.coupons (it starts with cpx_).'; return; }
        state.textContent = 'Checking…';
        try {
            if (!(await api.check(token))) { state.textContent = 'openvibe.coupons refused that token (revoked or expired?).'; return; }
            await platform.storage.setToken(token);
            input.value = '';
            await refresh();
        } catch (e) {
            state.textContent = 'Could not reach openvibe.coupons. The token was not saved.';
        }
    });

    async function refreshNetwork() {
        const token = await platform.storage.getNetworkToken();
        networkState.textContent = token ? 'Connected (the Dock in the side panel works).' : 'Not connected: the side panel asks for your OpenVibe sign-in.';
    }

    document.getElementById('network-form').addEventListener('submit', async function (ev) {
        ev.preventDefault();
        const token = networkInput.value.trim();
        if (token.length < 20) { networkState.textContent = 'That does not look like an OpenVibe token.'; return; }
        networkState.textContent = 'Checking…';
        try {
            if (!(await net.check(token))) { networkState.textContent = 'openvibe.network did not accept that token.'; return; }
            await platform.storage.setNetworkToken(token);
            networkInput.value = '';
            await refreshNetwork();
        } catch (e) {
            networkState.textContent = 'Could not reach openvibe.network. The token was not saved.';
        }
    });

    document.getElementById('network-disconnect').addEventListener('click', async function () {
        await platform.storage.clearNetworkToken();
        await refreshNetwork();
    });

    document.getElementById('disconnect').addEventListener('click', async function () {
        await platform.storage.clearToken();
        await refresh();
    });

    document.getElementById('grant').addEventListener('click', async function () {
        await platform.permissions.requestApi();
        await refresh();
    });

    refresh();
    refreshNetwork();
})();
