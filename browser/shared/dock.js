// The Dock: navbar.js calls mount({ token, apiBase, sibling }) for the pill. open({ tab }) opens the floating card;
// mountInto(host, { tab }) places its panel body inside another sheet. Both use the same state, counts and loaders.
(function (root) {
    'use strict';
    if (typeof document === 'undefined' || root.OpenVibeDock) return;

    const W = [320, 720], H = [360, 900], DEF = { width: 420, height: 640 };
    const CORNERS = ['bottom-right', 'bottom-left', 'top-right', 'top-left'];
    const svg = (p) => `<svg viewBox="0 0 24 24" aria-hidden="true">${p}</svg>`;
    // Close is the OpenVibe menu's orb in its × form (11-09, the owner: "replace this close button with our own… the
    // corner button… its close form… nice animations"): nine dots that fold into an × as the Dock opens.
    // The close button is the menu button, already crossed (navbar.js, root.OpenVibeOrb): it forms as the sheet opens.
    const ORBX = () => (root.OpenVibeOrb ? root.OpenVibeOrb.svg(22, true) : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7L7 17" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>');
    const G = {
        code: '<path d="M8 7l-5 5 5 5M16 7l5 5-5 5"/>',
        spark: '<path d="M12 3.5l1.9 5.1 5.1 1.9-5.1 1.9-1.9 5.1-1.9-5.1L5 10.5l5.1-1.9z"/><path d="M18.4 15.6l.6 1.6 1.6.6-1.6.6-.6 1.6-.6-1.6-1.6-.6 1.6-.6z"/>',
        bell: '<path d="M6.5 16.5V11a5.5 5.5 0 0 1 11 0v5.5l1.5 2h-14z"/><path d="M10 20.5a2.2 2.2 0 0 0 4 0"/>',
        // An upright pushpin whose lines never cross (owner, 11-09: the old one had "a line going through it").
        pin: '<path d="M7.5 3.5h9M10 3.5v5.3L6.5 13h11L14 8.8V3.5M12 13v7.5"/>',
        close: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
        open: '<path d="M13.5 5.5h5v5M18.5 5.5l-8 8M16.5 13.5v4a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1h4"/>',
        chat: '<path d="M5 6.5h14a1.5 1.5 0 0 1 1.5 1.5v8a1.5 1.5 0 0 1-1.5 1.5h-7l-4 3v-3H5A1.5 1.5 0 0 1 3.5 16V8A1.5 1.5 0 0 1 5 6.5z"/>',
        back: '<path d="M14.5 6.5L9 12l5.5 5.5"/>',
        send: '<path d="M4.5 12h11M11 6.5l5.5 5.5-5.5 5.5"/>',
        vibe: '<path d="M12 4.5a7.5 7.5 0 0 1 6.4 11.4L19.5 19.5l-3.6-1.1A7.5 7.5 0 1 1 12 4.5z"/><path d="M9 11.5h.01M12 11.5h.01M15 11.5h.01"/>',
        // Three filled dots on the exact centre line (a stroked h.01 path drew them a hair off centre: the owner, 11-09).
        more: '<g fill="currentColor" stroke="none"><circle cx="5.5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="18.5" cy="12" r="1.7"/></g>',
        clock: '<circle cx="12" cy="13" r="7.5"/><path d="M12 9.5V13l2.5 1.5M9.5 3h5"/>',
    };
    // Vibe first (L48 V2): the person's AI, on every site.
    const ROBOT = '<rect x="5" y="8" width="14" height="10" rx="3"/><path d="M12 8V4.5M9.5 13h.01M14.5 13h.01M3 12.5v2M21 12.5v2"/>';   // as in the menu's row
    const TABS = [['vibe', 'Vibe', G.spark], ['code', 'Code', G.code], ['agent', 'Agents', ROBOT], ['chats', 'Chat', G.chat], ['activity', 'Activity', G.bell]];
    // The tabs the Network keeps in the person's Dock state (network.dock-state@1; vibe since contracts 0.270.0); a
    // newer one stays on this site's copy until the Network learns it.
    const SAVED_TABS = ['vibe', 'code', 'agent', 'chats', 'activity'];
    const DEFAULT_STATE = { open: false, tab: 'activity', pinned: false, agent: null, chat: null, place: { phone: { corner: 'bottom-right' }, desktop: { corner: 'bottom-right', width: null, height: null } } };

    let el = null, bodyEl = null, inline = null, panelEpoch = 0, o = {}, doc = null, tab = 'activity', saveT = 0, pending = {}, lastFocus = null, dockSurface = null;
    // Pop out (K-D4): the window the panel lives in while it is popped out, and whether it is in one.
    let pipWin = null, popped = false, pipClosing = false, popOk = true;
    const mounts = {};

    const phone = () => { try { return root.matchMedia('(max-width: 640px)').matches; } catch { return false; } };
    // Motion off (html[data-ov-motion=off], theme-loader.js) is the only setting that skips an effect; Calm plays it.
    const reduced = () => document.documentElement.getAttribute('data-ov-motion') === 'off';
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    const state = () => (doc && doc.state) || DEFAULT_STATE;
    const counts = () => (doc && doc.counts) || {};
    const kind = () => (phone() ? 'phone' : 'desktop');
    const place = () => ({ ...DEFAULT_STATE.place[kind()], ...((state().place || {})[kind()] || {}) });
    const sibling = (name) => (typeof o.sibling === 'function' ? o.sibling(name) : `https://openvibe.network/shared/${name}`);
    // K-D3: the agent stream is OpenVibe.Codes' (it mints the view ticket with the person's own token) and the one
    // timeline behind the Dock is OpenVibe.Actor's (design 2026-11-07). On a site both go through Network's frame
    // relay: every site's connect-src allows openvibe.network and refuses openvibe.codes and openvibe.actor. A test
    // or the extension passes agentBase/actorBase and reaches the product itself; actorBase also names the Actor's
    // pages in the run list.
    const frameBase = () => String(o.frameBase || (String(o.apiBase || 'https://openvibe.network').replace(/\/+$/, '') + '/api/frame')).replace(/\/+$/, '');
    const directBase = (v) => (v ? String(v).replace(/\/+$/, '') : '');
    const actorBase = () => String(o.actorBase || 'https://openvibe.actor').replace(/\/+$/, '');

    async function call(path, init = {}) {
        const base = String(o.apiBase || 'https://openvibe.network').replace(/\/+$/, '');
        const t = await tokenOf();
        const headers = { accept: 'application/json', ...(init.body ? { 'content-type': 'application/json' } : {}), ...(t ? { authorization: `Bearer ${t}` } : {}) };
        const r = await fetch(base + path, { ...init, headers, credentials: 'omit' });
        return r.ok ? r.json() : null;
    }
    /** A token may be a string, a sync function or an async function (the extension refreshes it). */
    async function tokenOf() { return typeof o.token === 'function' ? await o.token() : o.token; }
    const notify = () => { store(doc); paintPill(); };

    /** A change to the state: painted now, sent to the Network a beat later (several changes go as one PUT). */
    function save(patch) {
        const st = state();
        const next = { ...st, ...patch, place: patch.place ? { ...st.place, ...patch.place } : st.place };
        doc = { ...(doc || {}), state: next, counts: counts() };
        pending = { ...pending, ...patch, ...(patch.place ? { place: { ...(pending.place || {}), ...patch.place } } : {}) };
        notify();
        clearTimeout(saveT);
        saveT = setTimeout(flush, 700);
    }
    async function flush() {
        const body = pending; pending = {};
        if (!Object.keys(body).length) return;
        try {
            const r = await call('/api/v1/me/dock', { method: 'PUT', body: JSON.stringify(body) });
            if (r && r.state && !Object.keys(pending).length) { doc = { ...doc, state: r.state, counts: r.counts || counts() }; notify(); badges(); }
        } catch { /* offline, or no route yet: the copy stands and the next change tries again */ }
    }

    // Each sibling's content hash (scripts/sibling-revs.js writes it), so a release gives each a new URL.
    const DOCK_REV = { 'dock-vibe.js': 'ee110f2a0c1d', 'dock-code.js': '7a768982eff3', 'dock-mount.js': 'fb07dccadb8c', 'dock-runs.js': '4368f039df7c', 'ai-marks-client.js': 'f4a880a9f206', 'action-center.js': 'e40346ec1f16', 'dock-timeline.js': 'bffaed38fccf', 'dock-actor.js': 'f9aea671c7ad', 'dock-agent.js': '8787080a04d3', 'dock-timer.js': '460d68aa8321', 'dock-share.js': 'e83b2e27b3ef', 'dock-card.js': '2643c20b0016', 'dock-chat-edits.js': '21e125e3f1e9' };
    function load(src, test) {
        return new Promise((ok) => {
            if (test()) return ok(true);
            const id = `ov-dock-${src.replace(/\W/g, '')}`;
            let sc = document.getElementById(id);
            if (!sc) { sc = document.createElement('script'); sc.id = id; sc.src = sibling(src) + (DOCK_REV[src] ? `?v=${DOCK_REV[src]}` : ''); sc.async = true; document.head.appendChild(sc); }
            sc.addEventListener('load', () => ok(test()));
            sc.addEventListener('error', () => ok(false));
        });
    }

    function styles() {
        if (document.getElementById('ovdk-styles')) return;
        const st = document.createElement('style');
        st.id = 'ovdk-styles';
        st.textContent = `
            .ovdk-pill { --t: var(--accent, #3b82f6); --bg: var(--bg-elevated, var(--bg-secondary, #252530)); position: fixed; z-index: var(--ovb-z-pill, 9995); right: max(16px, env(safe-area-inset-right, 0px)); bottom: max(calc(16px + var(--ovb-dock, calc(max(var(--ovnav-appbar-h, 0px), env(safe-area-inset-bottom, 0px)) + var(--ovb-mini, 0px)))), var(--ovb-composer, 0px)); translate: 0 calc(-1 * var(--ovb-lift, 0px));
                display: inline-flex; align-items: center; gap: 9px; height: 46px; padding: 0 18px 0 9px; border-radius: 99px; border: 1px solid var(--border, #333340); background: var(--bg); color: var(--text-primary, #e0e0e0);
                font: inherit; font-size: 13.5px; font-weight: 700; letter-spacing: -.005em; box-shadow: 0 14px 34px -14px rgba(0,0,0,.6); cursor: pointer; -webkit-tap-highlight-color: transparent; animation: ovdk-in .3s cubic-bezier(.2,.9,.25,1.2); }
            .ovdk-pill[hidden] { display: none; }
            .ovdk-pill[data-corner$="left"] { right: auto; left: max(16px, env(safe-area-inset-left, 0px)); }
            .ovdk-pill[data-corner^="top"] { bottom: auto; top: calc(66px + env(safe-area-inset-top, 0px)); }
            .ovdk-pill[data-tone="waiting"] { --t: var(--warning, #f5a524); }
            .ovdk-pill:hover { border-color: color-mix(in srgb, var(--t) 45%, var(--border, #333340)); }
            .ovdk-pill:active { scale: .96; }
            .ovdk-pill:focus-visible { outline: 2px solid var(--accent-light, var(--accent, #3b82f6)); outline-offset: 3px; }
            .ovdk-m { position: relative; display: grid; place-items: center; width: 30px; height: 30px; }
            .ovdk-m::before, .ovdk-m::after { content: ''; position: absolute; top: -1px; right: -2px; width: 9px; height: 9px; border-radius: 50%; background: var(--t); }
            .ovdk-m::after { box-shadow: 0 0 0 2.5px var(--bg); }
            .ovdk-pill[data-tone="waiting"] .ovdk-m::before { animation: ovdk-ping 1.8s ease-out infinite; }
            .ovdk-pill[data-tone="idle"] .ovdk-m::before, .ovdk-pill[data-tone="idle"] .ovdk-m::after, .ovdk-t:empty { display: none; }
            .ovdk-pill:has(.ovdk-t:empty) { padding-right: 8px; }
            @keyframes ovdk-in { from { opacity: 0; transform: translateY(10px) scale(.9); } }
            @keyframes ovdk-ping { to { transform: scale(2.6); opacity: 0; } }
            .ovdk { --ovdk-gap: 16px; position: fixed; z-index: var(--ovb-z-dock, 9996); display: flex; flex-direction: column; overflow: hidden; box-sizing: border-box;
                right: max(var(--ovdk-gap), env(safe-area-inset-right, 0px)); bottom: calc(max(var(--ovdk-gap), env(safe-area-inset-bottom, 0px)) + var(--ovnav-appbar-h, 0px));
                width: ${DEF.width}px; height: ${DEF.height}px; max-width: calc(100vw - 32px); max-height: calc(100vh - 96px); max-height: calc(100dvh - 96px);
                background: var(--bg-elevated, var(--bg-secondary, #1d1f27)); color: var(--text-primary, #ececf1); border: 1px solid var(--border, rgba(255,255,255,.1));
                border-radius: 22px; box-shadow: 0 30px 80px -24px rgba(0,0,0,.62), 0 2px 10px -2px rgba(0,0,0,.25); font-family: inherit; transform-origin: 100% 100%; }
            .ovdk[hidden] { display: none; }
            .ovdk[data-corner$="left"] { right: auto; left: max(var(--ovdk-gap), env(safe-area-inset-left, 0px)); }
            .ovdk[data-corner^="top"] { bottom: auto; top: calc(66px + env(safe-area-inset-top, 0px)); }
            .ovdk[data-corner="bottom-left"] { transform-origin: 0 100%; }
            .ovdk[data-corner="top-right"] { transform-origin: 100% 0; }
            .ovdk[data-corner="top-left"] { transform-origin: 0 0; }
            .ovdk.is-in { animation: ovdk-grow .3s cubic-bezier(.2,.9,.25,1.08); }
            .ovdk.is-moving { transition: none !important; box-shadow: 0 40px 90px -20px rgba(0,0,0,.7); cursor: grabbing; }
            @keyframes ovdk-grow { from { opacity: 0; transform: scale(.82); } }
            @keyframes ovdk-rise { from { transform: translateY(100%); } }
            .ovdk svg { fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
            /* The menu button's drawing (navbar.js) has its own fills: the line style above is not its. */
            .ovdk svg.ovmb { fill: currentColor; stroke: none; stroke-width: 0; }
            .ovdk-head { position: relative; flex: none; display: flex; align-items: center; gap: 8px; padding: 10px 8px 8px 10px; cursor: grab; touch-action: none; user-select: none; }
            .ovdk-tabs { display: flex; gap: 2px; padding: 3px; border-radius: 999px; background: color-mix(in srgb, var(--text-primary, #ececf1) 6%, transparent); min-width: 0; flex: 0 1 auto; overflow-x: auto; overscroll-behavior-x: contain; scrollbar-width: none; }
            .ovdk-tabs::-webkit-scrollbar { display: none; }
            .ovdk-tabs button { flex: none; }
            .ovdk-tabs button { position: relative; display: inline-flex; align-items: center; gap: 7px; height: 36px; padding: 0 14px 0 11px; border: 0; border-radius: 999px; background: transparent;
                color: var(--text-secondary, #b6b6c0); font: inherit; font-size: 13.5px; font-weight: 700; cursor: pointer; white-space: nowrap; transition: background .15s, color .15s; }
            .ovdk-tabs button svg { width: 17px; height: 17px; flex: none; }
            .ovdk-tabs button:hover { color: var(--text-primary, #ececf1); }
            .ovdk-tabs button[aria-selected="true"] { background: color-mix(in srgb, var(--accent, #3b82f6) 18%, transparent); color: var(--accent-light, var(--accent, #8ab4ff)); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent, #3b82f6) 30%, transparent); }
            .ovdk-tabs button[aria-selected="true"] svg { color: var(--accent-light, var(--accent, #60a5fa)); }
            .ovdk-tabs button:focus-visible, .ovdk-acts button:focus-visible, .ovdk-foot :focus-visible { outline: 2px solid var(--accent-light, var(--accent, #3b82f6)); outline-offset: 1px; }
            .ovdk-tabs .n { min-width: 18px; padding: 1px 6px; box-sizing: border-box; border-radius: 999px; font-size: 11px; font-weight: 800; line-height: 1.35; text-align: center; font-variant-numeric: tabular-nums;
                color: var(--text-primary, #ececf1); background: color-mix(in srgb, var(--accent, #3b82f6) 26%, transparent); }
            .ovdk-tabs .n[data-tone="waiting"] { background: color-mix(in srgb, var(--warning, #f5a524) 34%, transparent); }
            .ovdk-tabs .n:empty { display: none; }
            .ovdk-acts { display: flex; gap: 2px; margin-left: auto; }
            .ovdk-acts button { width: 40px; height: 40px; border: 0; border-radius: 12px; background: transparent; color: var(--text-muted, #8b8b96); cursor: pointer; display: grid; place-items: center; }
            .ovdk-acts button:hover { background: color-mix(in srgb, var(--text-primary, #ececf1) 7%, transparent); color: var(--text-primary, #ececf1); }
            .ovdk-acts button svg { width: 19px; height: 19px; display: block; }
            .ovdk-acts .ovdk-tomenu span { display: none; }
            .ovdk-orbx svg { width: 22px !important; height: 22px !important; overflow: visible; }
            .ovdk-orbx { --ovo-a: var(--accent-light, var(--accent, #60a5fa)); }
            .ovdk.is-in .ovdk-orbx .ovmb :is(.ovmb-bar, .ovmb-app) { animation: ovmb-form .5s cubic-bezier(.2,1.3,.3,1) both; }
            .ovdk-orbx:hover .ovmb, .ovdk-orbx:focus-visible .ovmb { transform: rotate(90deg); }
            .ovdk-orbx .ovmb { transition: transform .35s cubic-bezier(.2,1.3,.3,1); }
            .ovdk-orbx:active .ovmb { transform: rotate(90deg) scale(.8); }
            /* A phone's sheet opens out of the navbar's orb as the menu's does (4.186.0; see CHANGELOG): one move, one close button. */
            .ovdk.from-orb.is-in { animation: ovdk-reveal .38s cubic-bezier(.2,.9,.25,1) both; }
            .ovdk.from-orb.is-out { animation: ovdk-fold .28s cubic-bezier(.5,0,.75,.2) both; pointer-events: none; }
            @keyframes ovdk-reveal { from { clip-path: circle(28px at var(--ovdk-ox) var(--ovdk-oy)); } to { clip-path: circle(150% at var(--ovdk-ox) var(--ovdk-oy)); } }
            @keyframes ovdk-fold { from { clip-path: circle(150% at var(--ovdk-ox) var(--ovdk-oy)); } to { clip-path: circle(20px at var(--ovdk-ox) var(--ovdk-oy)); opacity: 0; } }
            .ovdk.from-orb .ovdk-head { padding: 4px 14px 6px 8px; }
            .from-orb .ovdk-acts .ovdk-orbx { position: relative; width: 40px; height: 40px; margin: 2px; border-radius: 50%; background: color-mix(in srgb, var(--accent, #3b82f6) 16%, var(--bg-primary, #0b0f19));
                box-shadow: 0 0 0 1px color-mix(in srgb, var(--accent-light, #60a5fa) 35%, transparent), 0 6px 18px -6px color-mix(in srgb, var(--accent, #3b82f6) 70%, transparent); transition: background-color .3s, box-shadow .3s; }
            .from-orb .ovdk-acts .ovdk-orbx.is-from { background: transparent; box-shadow: none; }
            .from-orb.is-in .ovdk-orbx::before { content: ""; position: absolute; inset: 0; border-radius: 50%; border: 2px solid var(--accent-light, #60a5fa); pointer-events: none; animation: ovdk-ring .6s cubic-bezier(.2,.8,.2,1) .1s both; }
            @keyframes ovdk-ring { from { opacity: .8; transform: scale(.9); } to { opacity: 0; transform: scale(calc(1 + 2.2 * var(--ov-move, 1))); } }
            .from-orb .ovdk-orbx { color: var(--text-primary, #ececf1); }
            .from-orb .ovdk-orbx svg { transition: transform .42s cubic-bezier(.2, 1.1, .3, 1); }
            .ovdk-orbx.is-set, .ovdk-orbx.is-set * { transition: none !important; }
            .from-orb .is-from svg { transform: translate(var(--orb-dx, 0), var(--orb-dy, 0)) scale(var(--orb-s, 1)); }
            .ovnav-orb.is-dock { transform: translate(var(--dock-dx, 0), var(--dock-dy, 0)) scale(var(--dock-s, 1)) !important; color: var(--text-primary, #e6edf7) !important; }
            .ovdk-more { position: absolute; z-index: 6; right: 8px; top: calc(100% - 4px); width: min(320px, calc(100% - 16px)); display: grid; gap: 2px; padding: 6px; border-radius: 16px;
                border: 1px solid var(--border, rgba(255,255,255,.12)); background: var(--bg-elevated, var(--bg-secondary, #1d1f27)); box-shadow: 0 18px 40px -12px rgba(0,0,0,.55); cursor: default; }
            .ovdk-more[hidden] { display: none; }
            .ovdk-more button { display: flex; align-items: center; gap: 12px; min-height: 52px; padding: 8px 10px; border: 0; border-radius: 12px; background: transparent; color: var(--text-primary, #ececf1); font: inherit; text-align: left; cursor: pointer; }
            .ovdk-more button[hidden] { display: none; }
            .ovdk-more button:hover, .ovdk-more button:focus-visible { background: color-mix(in srgb, var(--text-primary, #ececf1) 7%, transparent); outline: none; }
            .ovdk-more button > svg { flex: none; width: 20px; height: 20px; color: var(--text-muted, #8b8b96); }
            .ovdk-more span { flex: 1; min-width: 0; display: grid; gap: 2px; }
            .ovdk-more b { font-size: 14px; font-weight: 650; }
            .ovdk-more small { font-size: 12px; color: var(--text-muted, #8b8b96); line-height: 1.35; }
            .ovdk-sw { flex: none; position: relative; width: 38px; height: 22px; border-radius: 11px; background: var(--bg-tertiary, rgba(255,255,255,.14)); transition: background .15s; }
            .ovdk-sw::after { content: ''; position: absolute; top: 3px; left: 3px; width: 16px; height: 16px; border-radius: 50%; background: #fff; transition: transform .15s; }
            .ovdk-more [aria-checked="true"] .ovdk-sw { background: var(--accent-strong, var(--accent, #2563eb)); }
            .ovdk-more [aria-checked="true"] .ovdk-sw::after { transform: translateX(16px); }
            .ovdk-body { position: relative; flex: 1; min-height: 0; display: flex; flex-direction: column; border-top: 1px solid var(--border, rgba(255,255,255,.08)); }
            .ovdk-panel { flex: 1; min-height: 0; display: flex; flex-direction: column; }
            .ovdk-panel[hidden] { display: none; }
            .ovdk-scroll { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; }
            .ovdk-foot { flex: none; display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 10px 14px; border-top: 1px solid var(--border, rgba(255,255,255,.08)); font-size: 12.5px; }
            .ovdk-foot a, .ovdk-foot button { display: inline-flex; align-items: center; gap: 6px; min-height: 32px; padding: 0; border: 0; background: none; font: inherit; font-weight: 700; cursor: pointer; text-decoration: none; color: var(--accent-light, var(--accent, #60a5fa)); }
            .ovdk-foot button { color: var(--text-secondary, #b6b6c0); }
            .ovdk-foot button:hover { color: var(--text-primary, #ececf1); }
            .ovdk-foot svg { width: 15px; height: 15px; }
            .ovdk-wait { display: flex; justify-content: center; padding: 36px; }
            .ovdk-wait span { position: relative; display: inline-block; width: 6px; height: 6px; margin: 0 10px; border: 0; border-radius: 50%; background: var(--accent, #3b82f6); animation: ovdk-hop 1s ease-in-out .15s infinite; }
            .ovdk-wait span::before, .ovdk-wait span::after { content: ''; position: absolute; top: 0; width: 6px; height: 6px; border-radius: 50%; background: inherit; animation: ovdk-hop 1s ease-in-out infinite; }
            .ovdk-wait span::before { left: -10px; } .ovdk-wait span::after { left: 10px; animation-delay: .3s; }
            @keyframes ovdk-hop { 0%, 80%, 100% { transform: translateY(0); opacity: .45; } 40% { transform: translateY(-4px); opacity: 1; } }
            .ovdk-none { padding: 40px 24px; text-align: center; color: var(--text-muted, #8b8b96); font-size: 13.5px; line-height: 1.45; }
            .ovdk-size { position: absolute; z-index: 2; width: 22px; height: 22px; top: 0; left: 0; cursor: nwse-resize; touch-action: none; }
            .ovdk-size::after { content: ''; position: absolute; top: 9px; left: 9px; width: 7px; height: 7px; border-top: 2px solid var(--text-muted, #8b8b96); border-left: 2px solid var(--text-muted, #8b8b96); border-top-left-radius: 3px; opacity: 0; transition: opacity .15s; }
            .ovdk .ovdk-size::after { opacity: .75; }
            .ovdk[data-corner="bottom-left"] .ovdk-size { left: auto; right: 0; cursor: nesw-resize; }
            .ovdk[data-corner="bottom-left"] .ovdk-size::after { left: auto; right: 9px; border-left: 0; border-right: 2px solid var(--text-muted, #8b8b96); border-top-left-radius: 0; border-top-right-radius: 3px; }
            .ovdk[data-corner="top-right"] .ovdk-size { top: auto; bottom: 0; cursor: nesw-resize; }
            .ovdk[data-corner="top-right"] .ovdk-size::after { top: auto; bottom: 9px; border-top: 0; border-bottom: 2px solid var(--text-muted, #8b8b96); border-top-left-radius: 0; border-bottom-left-radius: 3px; }
            .ovdk[data-corner="top-left"] .ovdk-size { top: auto; bottom: 0; left: auto; right: 0; }
            .ovdk[data-corner="top-left"] .ovdk-size::after { top: auto; bottom: 9px; left: auto; right: 9px; border: 0; border-bottom: 2px solid var(--text-muted, #8b8b96); border-right: 2px solid var(--text-muted, #8b8b96); border-radius: 0 0 3px 0; }
            @media (pointer: coarse) { .ovdk-acts button { width: 44px; height: 44px; } .ovdk-tabs button { height: 40px; } }
            .ovdk { container-type: inline-size; }
            @container (max-width: 440px) { .ovdk-tabs button { padding: 0 8px; gap: 6px; font-size: 13px; } .ovdk-acts { gap: 0; } .ovdk-acts button { width: 34px; } }
            /* A narrow Dock (Opus, 11-07: "Activity" was cut off at the strip's edge): the open tab keeps its icon and name,
               the others show their icon and count only, their names kept for screen readers. All four always fit. */
            @container (max-width: 480px) {
                .ovdk-tabs button:not([aria-selected="true"]) { padding: 0 10px; gap: 4px; }
                .ovdk-tabs button:not([aria-selected="true"]) span { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
            }
            .ovdk-muted { color: var(--text-muted, #8b8b96); }
            .ovdk-i { display: inline-grid; place-items: center; }
            .ovdk-i svg { width: 18px; height: 18px; }
            .ovdk-bar { flex: none; display: flex; justify-content: flex-end; gap: 4px; padding: 4px 8px 0; }
            .ovdk-ib { flex: none; width: 40px; height: 40px; display: grid; place-items: center; border: 0; border-radius: 12px; background: transparent; color: var(--text-secondary, #b6b6c0); cursor: pointer; text-decoration: none; }
            .ovdk-ib svg { width: 20px; height: 20px; fill: none; stroke: currentColor; stroke-width: 1.9; stroke-linecap: round; }
            .ovdk-ib:hover, .ovdk-ib:focus-visible { background: var(--hover-bg, rgba(127,127,127,.12)); color: var(--text-primary, #ececf1); }
            .ovdk-thread-h .ovdk-ib { margin-left: auto; }
            .ovdk-chats { list-style: none; margin: 0; padding: 6px; display: grid; gap: 2px; }
            .ovdk-chat { display: grid; grid-template-columns: 40px minmax(0, 1fr) auto; align-items: center; gap: 12px; width: 100%; min-height: 60px; padding: 8px 10px; border: 0; border-radius: 14px;
                background: transparent; color: inherit; font: inherit; text-align: left; cursor: pointer; }
            .ovdk-chat:hover { background: color-mix(in srgb, var(--text-primary, #ececf1) 5%, transparent); }
            .ovdk-chat:focus-visible { outline: 2px solid var(--accent-light, var(--accent, #3b82f6)); outline-offset: -2px; }
            .ovdk-av { display: grid; place-items: center; width: 40px; height: 40px; border-radius: 50%; overflow: hidden; font-weight: 800; font-size: 15px;
                color: var(--accent-light, var(--accent, #60a5fa)); background: color-mix(in srgb, var(--accent, #3b82f6) 16%, transparent); }
            .ovdk-av img { width: 100%; height: 100%; object-fit: cover; }
            .ovdk-av-vibe { color: #fff; background: radial-gradient(120% 120% at 30% 20%, color-mix(in srgb, var(--accent, #3b82f6) 70%, #a78bfa), var(--accent-strong, var(--accent, #2563eb))); }
            .ovdk-av-vibe svg { width: 22px; height: 22px; }
            .ovdk-av-group { display: flex; align-items: center; overflow: visible; background: transparent; }
            .ovdk-av-group .ovdk-av { width: 27px; height: 27px; margin-left: -12px; border: 2px solid var(--bg-elevated, var(--bg-secondary, #1d1f27)); font-size: 11px; }
            .ovdk-av-group .ovdk-av:first-child { margin-left: 0; }
            .ovdk-chat-b { display: grid; gap: 1px; min-width: 0; }
            .ovdk-chat-b b { font-size: 14px; font-weight: 650; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
            .ovdk-chat-p { font-size: 12.5px; color: var(--text-secondary, #b6b6c0); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
            .is-unread .ovdk-chat-b b, .is-unread .ovdk-chat-p { color: var(--text-primary, #ececf1); font-weight: 750; }
            .ovdk-chat-m { display: grid; justify-items: end; gap: 4px; font-size: 11.5px; color: var(--text-muted, #8b8b96); font-variant-numeric: tabular-nums; }
            .ovdk-unread { min-width: 20px; padding: 1px 6px; box-sizing: border-box; border-radius: 999px; text-align: center; font-size: 11px; font-weight: 800;
                color: var(--on-accent-strong, var(--on-accent, #fff)); background: var(--accent-strong, var(--accent, #3472d8)); }
            .ovdk-thread-h { flex: none; display: flex; align-items: center; gap: 6px; padding: 6px 10px 6px 6px; border-bottom: 1px solid var(--border, rgba(255,255,255,.08)); }
            .ovdk-thread-h b { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 14.5px; }
            .ovdk-back { width: 40px; height: 40px; flex: none; border: 0; border-radius: 12px; background: transparent; color: var(--text-secondary, #b6b6c0); cursor: pointer; display: grid; place-items: center; }
            .ovdk-back:hover { background: color-mix(in srgb, var(--text-primary, #ececf1) 7%, transparent); color: var(--text-primary, #ececf1); }
            .ovdk-msgs { list-style: none; margin: 0; padding: 12px; display: flex; flex-direction: column; gap: 3px; }
            .ovdk-msg { display: grid; justify-items: start; max-width: 84%; margin-top: 8px; }
            .ovdk-msg.is-cont { margin-top: 0; }
            .ovdk-msg.is-mine { align-self: flex-end; justify-items: end; }
            .ovdk-who { margin: 0 0 3px 10px; font-size: 11.5px; font-weight: 700; color: var(--text-muted, #8b8b96); }
            .ovdk-text { padding: 8px 12px; border-radius: 16px; font-size: 14px; line-height: 1.42; white-space: pre-wrap; overflow-wrap: anywhere;
                background: color-mix(in srgb, var(--text-primary, #ececf1) 7%, transparent); }
            .ovdk-msg.is-mine .ovdk-text { color: var(--on-accent-strong, var(--on-accent, #fff)); background: var(--accent-strong, var(--accent, #3472d8)); }
            .ovdk-send { flex: none; display: flex; align-items: flex-end; gap: 8px; margin: 8px 10px 10px; padding: 4px 4px 4px 12px; border-radius: 16px;
                border: 1px solid var(--border-light, var(--border, rgba(255,255,255,.14))); background: var(--bg-primary, #12141b); }
            .ovdk-send:focus-within { border-color: var(--accent, #3b82f6); }
            .ovdk-send textarea { flex: 1; min-width: 0; box-sizing: border-box; min-height: 36px; max-height: 140px; padding: 8px 0; resize: none; border: 0; outline: none; background: transparent; color: var(--text-primary, #ececf1); font: inherit; font-size: 14px; line-height: 1.4; }
            .ovdk-go { width: 44px; height: 44px; flex: none; border: 0; border-radius: 12px; cursor: pointer; display: grid; place-items: center;
                color: var(--on-accent-strong, var(--on-accent, #fff)); background: var(--accent-strong, var(--accent, #3472d8)); }
            .ovdk-go:disabled { opacity: .55; cursor: default; }
            .ovdk-err { margin: 0 14px; font-size: 12.5px; color: color-mix(in srgb, var(--live-red, #e5484d) 60%, var(--text-primary, #ececf1)); }
            .ovdk-err[hidden] { display: none; }
            .ovdk-none b { display: block; margin-bottom: 4px; font-size: 15px; color: var(--text-primary, #ececf1); }
            @media (max-width: 640px) {
                .ovdk, .ovdk[data-corner] { z-index: 10010; left: 0; right: 0; top: 0; bottom: var(--ov-kb, 0px); width: auto !important; height: auto !important; max-width: none; max-height: none;
                    border: 0; border-radius: 0; padding-top: env(safe-area-inset-top, 0px); padding-bottom: env(safe-area-inset-bottom, 0px); box-shadow: none; transform-origin: 50% 100%; }
                .ovdk.is-in { animation-name: ovdk-rise; animation-duration: .3s; }
                .ovdk-head { cursor: default; }
                .ovdk-size { display: none; }
                .ovdk-tabs { flex: 1; } .ovdk-tabs button { flex: 1; justify-content: center; }
                /* A thumb, not a cursor: every control on the sheet is 44 px (design 2026-11-07 §1, Phone). */
                .ovdk-tabs button { height: 44px; }
                .ovdk-acts button { width: 44px; height: 44px; }
                /* Two rows (4.150.0, the owner: the strip was "cut off", "Activity" read "Ac"): the tools sit beside the grab
                   handle; the four tabs share the full width below, each icon over its name, every one whole. */
                .ovdk-head { flex-wrap: nowrap; gap: 4px; padding: 6px 6px 6px 8px; }
                .ovdk-acts { flex: none; gap: 0; }
                .ovdk-acts button[data-act="pop"] { display: none !important; }
                .ovdk-tabs { order: 0; flex: 1 1 auto; min-width: 0; padding: 3px; border-radius: 16px; }
                .ovdk-tabs button, .ovdk-tabs button:not([aria-selected="true"]) { flex: 1 1 0; min-width: 0; height: 54px; padding: 4px 2px; flex-direction: column; justify-content: center; gap: 3px; border-radius: 12px; font-size: 11.5px; font-weight: 650; }
                .ovdk-tabs button span, .ovdk-tabs button:not([aria-selected="true"]) span { position: static; width: auto; height: auto; overflow: hidden; clip: auto; max-width: 100%; text-overflow: ellipsis; white-space: nowrap; }
                .ovdk-tabs button svg { width: 19px; height: 19px; }
                .ovdk-tabs .n { position: absolute; top: 4px; left: calc(50% + 6px); min-width: 17px; padding: 1px 5px; font-size: 10.5px; }
                .ovdk-foot a, .ovdk-foot button { min-height: 44px; }
                /* Two rows, as the menu's head (4.189.0): the way back to the menu, More and Close; under them the four tabs,
                   full width, in the look of the menu's row that leads here. */
                .ovdk-head, .ovdk.from-orb .ovdk-head { flex-wrap: wrap; gap: 6px 4px; padding: 6px 12px 8px; }
                .ovdk-acts { order: 0; flex: 1 0 100%; align-items: center; gap: 2px; }
                .ovdk-acts .ovdk-tomenu { width: auto; margin-right: auto; padding: 0 14px 0 10px; gap: 8px; display: inline-flex; align-items: center; border-radius: 999px; font: inherit; font-size: 13.5px; font-weight: 700;
                    color: var(--text-secondary, #a8b3c4); background: color-mix(in srgb, var(--text-primary, #e6edf7) 6%, transparent); }
                .ovdk-acts .ovdk-tomenu span { display: inline; }
                .ovdk-tabs { order: 1; flex: 1 0 100%; gap: 4px; padding: 0; border-radius: 0; background: transparent; overflow: visible; }
                .ovdk-tabs button, .ovdk-tabs button:not([aria-selected="true"]) { height: 50px; gap: 2px; background: color-mix(in srgb, var(--accent, #3b82f6) 7%, transparent); }
                .ovdk-tabs button[aria-selected="true"] { background: color-mix(in srgb, var(--accent, #3b82f6) 18%, transparent); }
                .ovdk-tabs button:not([aria-selected="true"]) svg { color: var(--accent-light, var(--accent, #60a5fa)); }
            }
            @media (min-width: 641px) and (max-width: 1023px) {
                .ovdk, .ovdk[data-corner] { z-index: 10010; top: 0; bottom: 0; right: 0; left: auto; width: min(460px, calc(100vw - 48px)) !important; height: auto !important;
                    max-width: none; max-height: none; border-radius: 22px 0 0 22px; border-right: 0; padding-top: env(safe-area-inset-top, 0px); padding-bottom: env(safe-area-inset-bottom, 0px);
                    box-shadow: 0 0 0 100vmax rgba(0,0,0,.4), -16px 0 40px rgba(0,0,0,.3); transform-origin: 100% 50%; }
                .ovdk-size { display: none; }
                .ovdk-head { cursor: default; }
            }
            html.ovdk-sheet-open, html.ovdk-sheet-open body { overflow: hidden; }
            // In a window of its own the panel is the window: full bleed, no card, no phone sheet.
            .ovdk-pip .ovdk, .ovdk-pip .ovdk[data-corner] { left: 0 !important; top: 0 !important; right: 0 !important; bottom: 0 !important;
                width: 100% !important; height: 100% !important; max-width: none !important; max-height: none !important;
                border-radius: 0 !important; border-bottom: 1px solid var(--border, rgba(255,255,255,.1)) !important; box-shadow: none !important; }
            .ovdk-pip .ovdk-head { padding-top: 10px !important; cursor: grab !important; }
            .ovdk-pip .ovdk-head::before { display: none !important; }
            .ovdk-pip .ovdk-size { display: none !important; }
        `;
        document.head.appendChild(st);
    }

    function build() {
        styles();
        el = document.createElement('section');
        el.className = 'ovdk';
        el.setAttribute('role', 'dialog');
        el.setAttribute('aria-label', 'Dock');
        el.hidden = true;
        el.innerHTML = `
            <header class="ovdk-head">
                <div class="ovdk-tabs" role="tablist" aria-label="Dock">${TABS.map(([id, label, g]) => `<button type="button" role="tab" id="ovdk-tab-${id}" aria-controls="ovdk-panel-${id}" data-tab="${id}" aria-selected="false" tabindex="-1">${svg(g)}<span>${label}</span><b class="n" data-n="${id}"></b></button>`).join('')}</div>
                <div class="ovdk-acts">
                    <button type="button" data-act="menu" class="ovdk-tomenu" title="The OpenVibe menu" aria-label="The OpenVibe menu: every site, the feed, you">${root.OpenVibeOrb ? root.OpenVibeOrb.svg(20) : ''}<span>Menu</span></button>
                    <button type="button" data-act="more" aria-haspopup="true" aria-expanded="false" title="More" aria-label="More: a timer, the Dock's button">${svg(G.more)}</button>
                    <button type="button" data-act="close" class="ovdk-orbx" title="Close" aria-label="Close the Dock">${ORBX()}</button>
                </div>
                <div class="ovdk-more" role="menu" aria-label="More" hidden>
                    <button type="button" role="menuitem" data-act="timer">${svg(G.clock)}<span><b>Start a timer</b><small>A countdown or a focus round, on the Dock's button</small></span></button>
                    <button type="button" role="menuitemcheckbox" aria-checked="false" data-act="pin">${svg(G.pin)}<span><b>Keep the Dock's button on every page</b><small>When off, it shows only while something works or needs you</small></span><i class="ovdk-sw" aria-hidden="true"></i></button>
                    <button type="button" role="menuitem" data-act="pop" hidden>${svg(G.open)}<span><b>Open the Dock in a window of its own</b><small>Keep it beside whatever you are doing</small></span></button>
                </div>
            </header>
            <div class="ovdk-body">${TABS.map(([id]) => `<div class="ovdk-panel" role="tabpanel" id="ovdk-panel-${id}" aria-labelledby="ovdk-tab-${id}" data-panel="${id}" hidden></div>`).join('')}</div>
            <span class="ovdk-size" aria-hidden="true"></span>`;
        document.body.appendChild(el);
        bodyEl = el.querySelector('.ovdk-body');

        const tabs = [...el.querySelectorAll('[role="tab"]')];
        tabs.forEach((b) => b.addEventListener('click', () => setTab(b.dataset.tab, true)));
        el.querySelector('.ovdk-tabs').addEventListener('keydown', (e) => {
            const i = tabs.indexOf(document.activeElement); if (i < 0) return;
            const j = e.key === 'ArrowRight' ? (i + 1) % tabs.length : e.key === 'ArrowLeft' ? (i - 1 + tabs.length) % tabs.length : e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : -1;
            if (j >= 0) { e.preventDefault(); setTab(tabs[j].dataset.tab, true); tabs[j].focus(); }
        });
        el.querySelector('[data-act="close"]').addEventListener('click', () => close());
        // The way back to the menu: this sheet folds, the menu opens out of the same button.
        { const m = el.querySelector('[data-act="menu"]'); if (m) { if (!root.OpenVibeNavbar || !root.OpenVibeOrb) m.hidden = true; m.addEventListener('click', () => { close(); setTimeout(() => { try { root.OpenVibeNavbar.openSwitcher(); } catch { /* no bar */ } }, 300); }); } }
        el.querySelector('[data-act="pop"]').addEventListener('click', () => { if (popped) backToPage(); else popOut(); });
        el.querySelector('[data-act="pin"]').addEventListener('click', () => { save({ pinned: !state().pinned }); paintPin(); });
        el.querySelector('[data-act="timer"]').addEventListener('click', () => { const a = el.querySelector('[data-act="more"]'); closeMore(); withTimer((t) => t.menu(a)); });
        const moreBtn = el.querySelector('[data-act="more"]'), moreMenu = el.querySelector('.ovdk-more');
        function closeMore() { moreMenu.hidden = true; moreBtn.setAttribute('aria-expanded', 'false'); }
        moreBtn.addEventListener('click', () => {
            const open = moreMenu.hidden;
            closeMore();
            const tm = el.querySelector('.ovdk-tmenu'); if (tm) tm.remove();
            if (open) { moreMenu.hidden = false; moreBtn.setAttribute('aria-expanded', 'true'); const first = moreMenu.querySelector('button:not([hidden])'); if (first) first.focus(); }
        });
        moreMenu.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b && b.dataset.act !== 'pin') closeMore(); });
        moreMenu.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); closeMore(); moreBtn.focus(); } });
        // A pop-over (More, the timer) closes on a tap anywhere else, in the Dock or on the page (owner, 11-09: "clicked off
        // something else, and it didn't actually close").
        const awayFrom = (e) => {
            const path = typeof e.composedPath === 'function' ? e.composedPath() : [e.target];
            if (!moreMenu.hidden && !path.includes(moreMenu) && !path.includes(moreBtn)) closeMore();
            const tm = el.querySelector('.ovdk-tmenu');
            if (tm && !path.includes(tm) && !path.includes(moreMenu) && !path.includes(moreBtn)) tm.remove();
        };
        el.addEventListener('pointerdown', awayFrom, true);
        document.addEventListener('pointerdown', (e) => { if (!el.contains(e.target)) awayFrom(e); }, true);
        el.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } });
        // A tap outside closes the phone sheet. The path is the one at dispatch: a tap that redraws its own panel (opening a
        // chat) leaves its target detached, and must not read as outside.
        document.addEventListener('click', (e) => {
            if (!isOpen() || !phone()) return;
            // The tap that opened the sheet (a page's button, the share sheet's OpenVibe Chat, Ask your agent) is still on
            // its way up when the sheet opens: an event made before the sheet opened is never "a tap outside" (4.145.1).
            if (e.timeStamp && e.timeStamp <= openedAt) return;
            const path = typeof e.composedPath === 'function' ? e.composedPath() : [e.target];
            if (path.includes(el) || (pill && path.includes(pill)) || (e.target && e.target.isConnected === false)) return;
            close();
        });
        root.addEventListener('resize', () => { if (isOpen()) layout(); });
        bindMove();
        bindSize();
        paintPop();
    }

    // ── Where it sits ────────────────────────────────────────
    function layout() {
        const p = place();
        el.dataset.corner = CORNERS.includes(p.corner) ? p.corner : 'bottom-right';
        if (phone()) { el.style.width = ''; el.style.height = ''; clear(0); return; }
        const w = clamp(p.width || DEF.width, W[0], Math.max(W[0], Math.min(W[1], root.innerWidth - 32)));
        const h = clamp(p.height || DEF.height, H[0], Math.max(H[0], Math.min(H[1], root.innerHeight - 96)));
        el.style.width = `${w}px`; el.style.height = `${h}px`;
        // Desktop toasts (bottom right) stack above the card when there is room, so neither hides the other.
        clear(el.dataset.corner === 'bottom-right' && root.innerHeight - h > 320 ? h + 12 : 0);
    }
    const clear = (px) => document.documentElement.style.setProperty('--ov-dock-clear', `${px}px`);

    /**
     * The head drags the card, the tabs too once the pointer has moved 6 px (a tap still picks the tab; pin and close
     * never drag). On release it snaps to the nearest corner (a FLIP, so it glides there).
     */
    function bindMove() {
        const head = el.querySelector('.ovdk-head');
        let s = null, swallow = false;
        // Armed on the press; the window hears the moves, so a quick drag that leaves the head before 6 px still counts.
        const move = (e) => {
            if (!s || e.pointerId !== s.id) return;
            s.dx = e.clientX - s.x; s.dy = e.clientY - s.y;
            if (!s.live) {
                if (Math.abs(s.dx) + Math.abs(s.dy) < 6) return;
                s.live = true;
                if (!phone()) el.classList.add('is-moving');
            }
            if (phone()) { if (e.pointerType !== 'mouse') el.style.transform = `translateY(${Math.max(0, s.dy)}px)`; return; }
            el.style.transform = `translate(${s.dx}px, ${s.dy}px)`;
        };
        const end = (e) => {
            if (!s || (e && e.pointerId !== s.id)) return;
            const { r, dx, dy, live } = s; s = null;
            root.removeEventListener('pointermove', move); root.removeEventListener('pointerup', end); root.removeEventListener('pointercancel', end);
            if (!live) return;
            swallow = true; setTimeout(() => { swallow = false; }, 0);
            el.classList.remove('is-moving');
            if (phone()) {
                el.style.transition = 'transform .2s ease';
                if (dy > 110) close(); else el.style.transform = '';
                setTimeout(() => { el.style.transition = ''; }, 220);
                return;
            }
            const cx = r.left + dx + r.width / 2, cy = r.top + dy + r.height / 2;
            const corner = `${cy < root.innerHeight / 2 ? 'top' : 'bottom'}-${cx < root.innerWidth / 2 ? 'left' : 'right'}`;
            const from = { x: r.left + dx, y: r.top + dy };
            el.style.transform = '';
            save({ place: { desktop: { ...place(), corner } } });
            layout();
            const to = el.getBoundingClientRect();
            if (reduced()) return;
            el.style.transform = `translate(${from.x - to.left}px, ${from.y - to.top}px)`;
            el.getBoundingClientRect();
            el.style.transition = 'transform .28s cubic-bezier(.2,.9,.25,1.05)';
            el.style.transform = '';
            setTimeout(() => { el.style.transition = ''; }, 300);
        };
        head.addEventListener('pointerdown', (e) => {
            if (e.button || e.target.closest('.ovdk-acts, .ovdk-more')) return;
            s = { x: e.clientX, y: e.clientY, r: el.getBoundingClientRect(), dx: 0, dy: 0, id: e.pointerId, live: false };
            root.addEventListener('pointermove', move); root.addEventListener('pointerup', end); root.addEventListener('pointercancel', end);
        });
        // A drag that began on a tab is a drag, not a pick.
        head.addEventListener('click', (e) => { if (swallow) { swallow = false; e.preventDefault(); e.stopPropagation(); } }, true);
    }

    /** The free corner (the one away from the anchor) resizes the card. */
    function bindSize() {
        const grip = el.querySelector('.ovdk-size');
        let s = null;
        grip.addEventListener('pointerdown', (e) => {
            if (e.button || phone()) return;
            e.preventDefault();
            const r = el.getBoundingClientRect();
            s = { x: e.clientX, y: e.clientY, w: r.width, h: r.height, id: e.pointerId, c: el.dataset.corner };
            try { grip.setPointerCapture(e.pointerId); } catch { /* */ }
        });
        grip.addEventListener('pointermove', (e) => {
            if (!s || e.pointerId !== s.id) return;
            const dx = e.clientX - s.x, dy = e.clientY - s.y;
            const w = clamp(s.w + (s.c.endsWith('right') ? -dx : dx), W[0], Math.min(W[1], root.innerWidth - 32));
            const h = clamp(s.h + (s.c.startsWith('bottom') ? -dy : dy), H[0], Math.min(H[1], root.innerHeight - 96));
            el.style.width = `${Math.round(w)}px`; el.style.height = `${Math.round(h)}px`;
            s.nw = Math.round(w); s.nh = Math.round(h);
        });
        const end = (e) => {
            if (!s || (e && e.pointerId !== s.id)) return;
            const { nw, nh } = s; s = null;
            if (nw && nh) { save({ place: { desktop: { ...place(), width: nw, height: nh } } }); layout(); }
        };
        grip.addEventListener('pointerup', end); grip.addEventListener('pointercancel', end);
    }

    // ── Tabs ─────────────────────────────────────────────────
    function badges() {
        if (!el) return;
        const c = counts();
        const agent = (c.waiting || 0) + (c.running || 0);
        const n = (k, v, tone) => { const b = el.querySelector(`[data-n="${k}"]`); b.textContent = v ? (v > 99 ? '99+' : String(v)) : ''; b.dataset.tone = tone || ''; };
        n('agent', agent, c.waiting ? 'waiting' : '');
        n('activity', c.unread || 0);
        n('chats', chats.unread || 0);
        el.querySelector('#ovdk-tab-chats').setAttribute('aria-label', chats.unread ? `Chat, ${chats.unread} unread` : 'Chat');
        el.querySelector('#ovdk-tab-agent').setAttribute('aria-label', [`Agents`, c.waiting ? `${c.waiting} need${c.waiting === 1 ? 's' : ''} you` : '', c.running ? `${c.running} working` : ''].filter(Boolean).join(', '));
        el.querySelector('#ovdk-tab-activity').setAttribute('aria-label', c.unread ? `Activity, ${c.unread} unread` : 'Activity');
    }
    function paintPin() {
        const b = el.querySelector('[data-act="pin"]'), on = !!state().pinned;
        b.setAttribute('aria-checked', String(on));
        b.title = on ? "On: the Dock's button stays on every page" : "Off: the Dock's button shows only while something works or needs you";
    }
    function setTab(id, remember) {
        if (id === 'agents') id = 'agent';
        if (inline && tab !== id) disposePanel();
        tab = TABS.some(([t]) => t === id) ? id : 'activity';
        if (tab !== 'chats') clearTimeout(chats.timer);
        if (tab !== 'vibe' && vibe.api) vibe.api.pause();
        el.querySelectorAll('[role="tab"]').forEach((b) => { const on = b.dataset.tab === tab; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; });
        bodyEl.querySelectorAll('[data-panel]').forEach((p) => { p.hidden = p.dataset.panel !== tab; });
        if (remember && state().tab !== tab && SAVED_TABS.includes(tab)) save({ tab });
        fill(tab);
        if (inline && tab === 'chats') readUnread();
    }
    const panelActive = (id) => tab === id && (isOpen() || !!inline);
    function disposePanel() {
        panelEpoch++;
        clearTimeout(chats.timer); clearTimeout(chats.unreadT);
        if (vibe.api) { vibe.api.pause(); vibe.api = null; }
        for (const k of Object.keys(mounts)) { if (mounts[k] && mounts[k].destroy) mounts[k].destroy(); delete mounts[k]; }
        if (root.OpenVibeNotifications && root.OpenVibeNotifications.unmountDock && bodyEl) root.OpenVibeNotifications.unmountDock(bodyEl.querySelector('[data-panel="activity"]'));
        chats.panel = null; chats.open = null; vibe.panel = null;
        if (bodyEl) bodyEl.querySelectorAll('[data-panel]').forEach((p) => { p.replaceChildren(); p.hidden = true; });
    }

    async function fill(id) {
        const epoch = panelEpoch;
        const panel = bodyEl.querySelector(`[data-panel="${id}"]`);
        if (id === 'vibe') {
            vibe.panel = panel;
            if (vibe.api) return vibe.api.refresh();
            panel.innerHTML = '<div class="ovdk-wait"><span></span></div>';
            const ok = await load('dock-vibe.js', () => !!(root.OpenVibeDockVibe && root.OpenVibeDockVibe.mount));
            if (epoch !== panelEpoch || !panelActive(id)) return;
            if (!ok) { panel.innerHTML = '<div class="ovdk-none">Vibe did not load. Check your connection, then open it again.</div>'; return; }
            vibe.api = root.OpenVibeDockVibe.mount(panel, { chatCall, active: () => panelActive('vibe'), state, save, wantList: () => { const v = vibeOnList; vibeOnList = false; return v; }, styles: () => (el && el.ownerDocument.getElementById('ovdk-styles')) || document.getElementById('ovdk-styles'), icons: { vibe: G.vibe, send: G.send, clock: G.clock, bell: G.bell }, refresh: () => read() });
            return;
        }
        if (id === 'chats') { chats.panel = panel; mounts.chats = mounts.chats || { refresh: null }; if (chats.draft) return chatList(); return state().chat && chats.open !== state().chat ? openChat(state().chat, false) : chats.open ? openChat(chats.open, false) : chatList(); }
        // The Agent panel reads the step.
        if (mounts[id]) { if (mounts[id].refresh) mounts[id].refresh(); if (mounts[id + 'Timeline']) mounts[id + 'Timeline'].refresh(); return; }
        mounts[id] = { refresh: null };
        panel.innerHTML = '<div class="ovdk-wait"><span></span></div>';
        if (id === 'code') {
            const ok = await load('dock-code.js', () => !!(root.OpenVibeDockCode && root.OpenVibeDockCode.mount));
            if (epoch !== panelEpoch || !panelActive(id)) { delete mounts[id]; return; }
            if (!ok) return failed(panel, id);
            mounts[id] = root.OpenVibeDockCode.mount(panel, { token: o.token, frameBase: frameBase(), active: () => panelActive('code') });
            return;
        }
        if (id === 'agent') {
            const ok = await load('dock-runs.js', () => !!(root.OpenVibeDockRuns && root.OpenVibeDockRuns.mount));
            if (epoch !== panelEpoch || !panelActive(id)) { delete mounts[id]; return; }
            if (!ok) return failed(panel, id);
            // K-D3: the person's own agent stream above the list; it hides itself when there is none.
            panel.innerHTML = '<div class="ovdk-actor"></div><div class="ovdk-timeline"></div><div class="ovdk-agent"></div><div class="ovdk-scroll"></div><div class="ovdk-runs-foot ovdk-foot"></div>';
            // The Agent panel: Now, Needs you and the one timeline (design 2026-11-07). It is first in the tab, so on a
            // phone Now and Needs you are on screen before anything else.
            load('dock-timeline.js', () => !!(root.OpenVibeDockTimeline && root.OpenVibeDockTimeline.mount)).then((on) => {
                if (on && epoch === panelEpoch && !mounts[id + 'Timeline'] && panel.isConnected && panelActive(id)) mounts[id + 'Timeline'] = root.OpenVibeDockTimeline.mount(panel.querySelector('.ovdk-timeline'), { token: o.token, base: directBase(o.actorBase), frameBase: frameBase(), active: () => panelActive('agent'), focus: () => o.task || null });
            });
            // Actor v3 (A3): your Actor first, on every site; it shows nothing for a person without one.
            load('dock-actor.js', () => !!(root.OpenVibeDockActor && root.OpenVibeDockActor.mount)).then((on) => {
                if (on && epoch === panelEpoch && !mounts[id + 'Actor'] && panel.isConnected && panelActive(id)) mounts[id + 'Actor'] = root.OpenVibeDockActor.mount(panel.querySelector('.ovdk-actor'), { token: o.token, base: directBase(o.actorBase), frameBase: frameBase(), networkBase: o.apiBase || 'https://openvibe.network', active: () => panelActive('agent') });
            });
            load('dock-agent.js', () => !!(root.OpenVibeDockAgent && root.OpenVibeDockAgent.mount)).then((on) => {
                if (on && epoch === panelEpoch && !mounts[id + 'View'] && panel.isConnected && panelActive(id)) mounts[id + 'View'] = root.OpenVibeDockAgent.mount(panel.querySelector('.ovdk-agent'), { token: o.token, base: directBase(o.agentBase), frameBase: frameBase(), active: () => panelActive('agent') });
            });
            const m = root.OpenVibeDockRuns.mount(panel.querySelector('.ovdk-scroll'), {
                call, state, save, scopes: o.scopes, active: () => panelActive('agent'), actorBase: actorBase(), loadMarks: () => load('ai-marks-client.js', () => !!root.OpenVibeAIMarks),
                styles: () => (el && el.ownerDocument.getElementById('ovdk-styles')) || document.getElementById('ovdk-styles'),
                foot: panel.querySelector('.ovdk-runs-foot'),
                onCounts: (c) => { doc = { ...(doc || {}), state: state(), counts: { ...counts(), running: c.running || 0, waiting: c.waiting || 0 } }; badges(); notify(); },
            });
            mounts[id] = m;
            return;
        }
        const ok = await load('notification-ui.js', () => !!(root.OpenVibeNotifications && root.OpenVibeNotifications.renderDock));
        if (epoch !== panelEpoch || !panelActive(id)) { delete mounts[id]; return; }
        if (!ok) return failed(panel, id);
        const N = root.OpenVibeNotifications;
        if (!N.__ovNavInit) { try { N.init({ token: o.token, apiBase: o.apiBase || 'https://openvibe.network', scopes: o.scopes }); N.__ovNavInit = true; } catch { /* */ } }
        panel.innerHTML = '';
        N.renderDock(panel);
        mounts[id] = { refresh: () => { try { N.refresh(); } catch { /* */ } } };
    }
    function failed(panel, id) {
        mounts[id] = null;
        panel.innerHTML = `<div class="ovdk-none">That part of the Dock did not load. Check your connection, then open it again.</div>`;
    }

    // ── Chats (Dock plan K-D2) ───────────────────────────────
    // The person's conversations and DMs, from OpenVibe.Chat's own API with their Network token (Chat checks they are
    // in each one). Everything people wrote is set as text, never markup; only https pictures are shown. A thread polls
    // for new messages every 5 s while it is open in the Dock, and is marked read as it is shown.
    const chats = { panel: null, list: null, open: null, msgs: [], last: 0, timer: 0, edits: null, unread: 0, unreadT: 0, busy: false, draft: null, vibeSummary: null, filter: '' };
    const chatBase = () => String(o.chatBase || 'https://openvibe.chat').replace(/\/+$/, '');
    const me = () => String(o.me || '');
    const scopes = () => Array.isArray(o.scopes) ? o.scopes : null;
    const canWriteChat = () => !scopes() || scopes().includes('chat.write');
    const h = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
    const icon = (path) => { const s = h('span', 'ovdk-i'); s.innerHTML = svg(path); return s; };
    const toChat = (href) => { const a = h('a', 'ovdk-ib ovdk-away'); a.href = href; a.target = '_blank'; a.rel = 'noopener'; a.title = 'Open in Chat'; a.setAttribute('aria-label', 'Open in Chat'); a.setAttribute('data-ov-tip', 'Open in Chat'); a.innerHTML = svg('<path d="M13.5 5.5h5v5M18.5 5.5l-7.5 7.5M17 13.5v4a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 5 17.5v-9A1.5 1.5 0 0 1 6.5 7h4"/>'); return a; };
    async function chatCall(path, init = {}) {
        const t = await tokenOf();
        const headers = { accept: 'application/json', ...(init.body ? { 'content-type': init.type || 'application/json' } : {}), ...(t ? { authorization: `Bearer ${t}` } : {}) };
        const { type: _type, ...rest } = init;
        return fetch(chatBase() + path, { ...rest, headers, credentials: 'omit' }).then(async (r) => {
            const b = await r.json().catch(() => ({}));
            if (!r.ok) { const e = new Error(b.error || `HTTP ${r.status}`); e.status = r.status; e.code = b.code || null; throw e; }
            return b;
        });
    }
    function readUnread() {
        clearTimeout(chats.unreadT);
        chatCall('/api/dm/unread').then((b) => { chats.unread = Number(b && b.unread) || 0; badges(); }).catch(() => { /* Chat away: no count */ });
        if (panelActive('chats')) chats.unreadT = setTimeout(readUnread, 30000);
    }
    const when = (iso) => {
        const t = Date.parse(iso || ''); if (!Number.isFinite(t)) return '';
        const m = Math.max(0, Math.round((Date.now() - t) / 60000));
        return m < 1 ? 'now' : m < 60 ? `${m} min` : m < 1440 ? `${Math.floor(m / 60)} h` : `${Math.floor(m / 1440)} d`;
    };
    // "answered 4 min ago", and "answered just now" when it was this minute.
    const answered = (iso) => { const w = when(iso); return !w ? '' : w === 'now' ? 'answered just now' : `answered ${w} ago`; };
    function avatar(p, group) {
        const a = h('span', 'ovdk-av');
        const url = p && /^https:\/\//.test(String(p.avatar_url || '')) ? p.avatar_url : '';
        if (url && !group) { const img = h('img'); img.src = url; img.alt = ''; img.loading = 'lazy'; img.referrerPolicy = 'no-referrer'; a.append(img); }
        else a.textContent = group ? '#' : String((p && (p.display_name || p.username)) || '?').trim().charAt(0).toUpperCase() || '?';
        return a;
    }
    function groupAvatar(c) {
        const people = others(c).slice(0, 3);
        if (!people.length) return avatar({}, false);
        const stack = h('span', 'ovdk-av ovdk-av-group');
        people.forEach((p) => stack.append(avatar(p, false)));
        return stack;
    }
    const others = (c) => (c.participants || []).filter((p) => p.username !== me());
    const titleOf = (c) => c.name || others(c).map((p) => p.display_name || p.username).join(', ') || 'Just you';
    async function chatList() {
        clearTimeout(chats.timer);
        if (chats.edits) { chats.edits.stop(); chats.edits = null; }
        chats.open = null;
        const panel = chats.panel; if (!panel) return;
        if (!chats.list) { panel.innerHTML = '<div class="ovdk-wait"><span></span></div>'; }
        const sharing = chats.draft && canWriteChat() ? load('dock-share.js', () => !!(root.OpenVibeDockShare && root.OpenVibeDockShare.bar)) : null;
        try {
            const [dm, ai] = await Promise.all([chatCall('/api/dm/conversations'), chatCall('/api/vibe/conversations').catch(() => null)]);
            chats.list = dm.conversations || [];
            chats.vibeSummary = ai && ai.count ? { kind: 'vibe', count: ai.count, latest: ai.conversations && ai.conversations[0], last_message_at: ai.conversations && ai.conversations[0] && ai.conversations[0].last_message_at } : null;
        } catch (e) { if (panel !== chats.panel || !panelActive('chats')) return; panel.textContent = ''; panel.append(h('div', 'ovdk-none', e.status === 401 ? 'Sign in to Chat to see your conversations.' : 'Your chats did not load. Check your connection, then open them again.')); chatFoot(panel); return; }
        if (sharing) await sharing;
        if (panel !== chats.panel || !panelActive('chats') || chats.open) return;
        panel.textContent = '';
        if (chats.draft && canWriteChat() && root.OpenVibeDockShare) panel.append(root.OpenVibeDockShare.bar({ draft: chats.draft, h, chatCall, host: el, cancel: () => { chats.draft = null; chatList(); }, open: (id) => { chats.list = null; return openChat(String(id), true); } }));
        // Open in Chat, as an icon over your conversations (ask 336).
        const bar = h('div', 'ovdk-bar'); bar.append(toChat('https://openvibe.chat/messages')); panel.append(bar);
        const scroll = h('div', 'ovdk-scroll');
        if (!chats.list.length && !chats.vibeSummary) {
            const none = h('div', 'ovdk-none');
            none.append(h('b', '', 'No conversations yet'), document.createTextNode('A message to someone on OpenVibe starts one, and it shows here on every site.'));
            scroll.append(none);
        } else {
            const ul = h('ul', 'ovdk-chats');
            [...chats.list.filter((c) => !chats.filter || titleOf(c).toLowerCase().includes(chats.filter)), ...(chats.vibeSummary ? [chats.vibeSummary] : [])].sort((a, b) => String(b.last_message_at || b.updated_at || '').localeCompare(String(a.last_message_at || a.updated_at || ''))).forEach((c) => {
                if (c.kind === 'vibe') {
                    const li = h('li'), b = h('button', 'ovdk-chat'); b.type = 'button';
                    const body = h('span', 'ovdk-chat-b'); body.append(h('b', '', 'Vibe'), h('span', 'ovdk-chat-p', `${c.count} chat${c.count === 1 ? '' : 's'}${c.latest && c.latest.name ? ` · ${c.latest.name}` : ''}`));
                    const meta = h('span', 'ovdk-chat-m'); const at = c.latest && c.latest.last_answer_at;
                    const t = h('time', '', when(at || c.last_message_at)); if (at) t.title = answered(at); meta.append(t);
                    const av = h('span', 'ovdk-av ovdk-av-vibe'); av.append(icon(G.vibe));
                    b.append(av, body, meta); b.setAttribute('aria-label', 'Open Vibe');
                    b.addEventListener('click', () => {
                        if (!b.dispatchEvent(new CustomEvent('openvibe:open-vibe', { bubbles: true, cancelable: true }))) return;
                        vibeOnList = true; save({ vibe: null }); setTab('vibe', true);
                    });
                    li.append(b); ul.append(li); return;
                }
                const li = h('li'), b = h('button', 'ovdk-chat');
                b.type = 'button';
                const unread = Number(c.unread_count) || 0;
                const mine = (c.participants || []).some((p) => p.id === c.last_sender_id && p.username === me());
                const body = h('span', 'ovdk-chat-b');
                body.append(h('b', '', titleOf(c)), h('span', 'ovdk-chat-p', c.last_message ? `${mine ? 'You: ' : ''}${String(c.last_message).replace(/\s+/g, ' ').slice(0, 140)}` : 'No messages yet'));
                const meta = h('span', 'ovdk-chat-m');
                meta.append(h('time', '', when(c.last_message_at || c.updated_at)));
                if (unread) meta.append(h('b', 'ovdk-unread', unread > 99 ? '99+' : String(unread)));
                b.append(c.is_group ? groupAvatar(c) : avatar(others(c)[0] || {}, false), body, meta);
                b.setAttribute('aria-label', `${titleOf(c)}${unread ? `, ${unread} unread` : ''}`);
                if (unread) li.className = 'is-unread';
                b.addEventListener('click', () => openChat(String(c.id), true));
                li.append(b); ul.append(li);
            });
            scroll.append(ul);
        }
        panel.append(scroll);
    }
    function bubble(m, prev) {
        const mine = m.username === me();
        const li = h('li', `ovdk-msg${mine ? ' is-mine' : ''}${prev && prev.username === m.username ? ' is-cont' : ''}`);
        if (!mine && !(prev && prev.username === m.username)) li.append(h('span', 'ovdk-who', m.display_name || m.username || ''));
        li.dataset.id = String(m.id);
        li.append(h('span', 'ovdk-text', String(m.message || '')));
        if (m.edited_at) li.append(h('small', 'ovdk-edited', `edited · ${String(m.edited_at).slice(11, 16)}`));
        if (mine && canWriteChat()) { const edit = h('button', 'ovk-btn ovk-btn--quiet ovdk-edit', 'Edit'); edit.type = 'button'; li.append(edit); }
        // A known OpenVibe link's card (Chat's link cards): dock-card.js draws it, loaded the first time one shows.
        if (m.card) load('dock-card.js', () => !!root.OpenVibeDockCard).then((ok) => { const c = ok && root.OpenVibeDockCard(m.card, h); if (c) li.append(c); });
        li.title = new Date(m.created_at).toLocaleString();
        return li;
    }
    async function openChat(id, remember) {
        clearTimeout(chats.timer);
        if (chats.edits) { chats.edits.stop(); chats.edits = null; }
        const panel = chats.panel; if (!panel) return;
        chats.open = String(id); chats.msgs = []; chats.last = 0;
        const draft = chats.draft && canWriteChat() ? chats.draft.text : '';
        chats.draft = null;
        if (remember) save({ chat: chats.open });
        const conv = (chats.list || []).find((c) => String(c.id) === chats.open);
        panel.textContent = '';
        const head = h('div', 'ovdk-thread-h');
        const back = h('button', 'ovdk-back'); back.type = 'button'; back.setAttribute('aria-label', 'Back to your chats'); back.append(icon(G.back));
        back.addEventListener('click', () => { save({ chat: null }); chatList(); });
        const title = h('b', '', conv ? titleOf(conv) : 'Conversation');
        head.append(back, title, toChat('https://openvibe.chat/messages'));
        // Opened from the Dock's state on another page: the list is not here yet, so the title comes with it.
        if (!conv) chatCall('/api/dm/conversations').then((b) => { chats.list = b.conversations || []; const c = chats.list.find((x) => String(x.id) === String(id)); if (c && chats.open === String(id)) title.textContent = titleOf(c); }).catch(() => { /* the title stays */ });
        const list = h('ol', 'ovdk-msgs'); list.setAttribute('aria-live', 'polite');
        const scroll = h('div', 'ovdk-scroll ovdk-thread'); scroll.append(list);
        const form = h('form', 'ovdk-send');
        const box = h('textarea'); box.rows = 1; box.maxLength = 4000; box.placeholder = 'Message'; box.setAttribute('aria-label', 'Message');
        const go = h('button', 'ovdk-go'); go.type = 'submit'; go.setAttribute('aria-label', 'Send'); go.append(icon(G.send));
        const err = h('p', 'ovdk-err'); err.hidden = true;
        form.append(box, go);
        panel.append(head, scroll, err);
        if (canWriteChat()) {
            panel.append(form);
            const fit = () => { box.style.height = 'auto'; box.style.height = `${Math.min(box.scrollHeight, 140)}px`; };
            box.addEventListener('input', fit);
            if (draft && root.OpenVibeDockShare) root.OpenVibeDockShare.ready({ draft, h, panel, form, box, fit });
            box.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); if (form.requestSubmit) form.requestSubmit(); else form.dispatchEvent(new Event('submit', { cancelable: true })); } });
            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                const text = box.value.trim();
                if (!text || chats.busy) return;
                chats.busy = true; go.disabled = true; err.hidden = true;
                try {
                    await chatCall(`/api/dm/conversations/${encodeURIComponent(chats.open)}/messages`, { method: 'POST', body: JSON.stringify({ message: text }) });
                    box.value = ''; fit();
                    await pull(list, scroll);
                } catch (x) {
                    err.textContent = x.status === 429 ? 'Slow down a little, then send it again.' : x.status === 403 ? 'You can’t send messages in this conversation.' : 'That did not send. Try again.';
                    err.hidden = false;
                } finally { chats.busy = false; go.disabled = false; box.focus(); }
            });
        } else {
            panel.append(h('div', 'ovdk-none', 'Reading only. Answer in OpenVibe.Chat.'));
        }
        list.append(h('li', 'ovdk-wait', null));
        list.firstChild.innerHTML = '<span></span>';
        await pull(list, scroll, true);
        load('dock-chat-edits.js', () => !!root.OpenVibeDockChatEdits).then((ok) => { if (ok && chats.open === String(id)) chats.edits = root.OpenVibeDockChatEdits({ id: String(id), list, messages: chats.msgs, error: err, tokenOf, chatCall, chatBase, active: () => chats.open === String(id) && panelActive('chats'), load, h }); });
        if (canWriteChat() && !(typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches)) setTimeout(() => { try { box.focus({ preventScroll: true }); if (draft) box.setSelectionRange(box.value.length, box.value.length); } catch { /* */ } }, 0);
    }
    /** New messages of the open thread (all of them the first time), drawn in place; read once shown. */
    async function pull(list, scroll, first) {
        const id = chats.open;
        let got = [];
        try { got = (await chatCall(`/api/dm/conversations/${encodeURIComponent(id)}/messages?limit=50${chats.last ? `&after=${chats.last}` : ''}`)).messages || []; } catch (e) {
            if (first && panelActive('chats')) { list.textContent = ''; list.append(h('li', 'ovdk-none', e.status === 403 ? 'This conversation is not yours.' : 'The messages did not load. Try again.')); }
            return;
        }
        if (id !== chats.open || !panelActive('chats')) return;
        if (first) list.textContent = '';
        const atEnd = scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight < 40;
        got.forEach((m) => { if (chats.msgs.some((x) => x.id === m.id)) return; list.append(bubble(m, chats.msgs[chats.msgs.length - 1])); chats.msgs.push(m); chats.last = Math.max(chats.last, Number(m.id) || 0); });
        if (first && !chats.msgs.length) list.append(h('li', 'ovdk-none', 'No messages yet. Say hello.'));
        if (first || atEnd) scroll.scrollTop = scroll.scrollHeight;
        if (got.length || first) chatCall(`/api/dm/conversations/${encodeURIComponent(id)}/read`, { method: 'POST', body: '{}' }).then(readUnread).catch(() => { /* */ });
        clearTimeout(chats.timer);
        if (panelActive('chats') && chats.open === id) chats.timer = setTimeout(() => pull(list, scroll), 5000);
    }

    // ── Vibe (plan L48 V2): the person's Vibe, in dock-vibe.js, loaded the first time the tab opens (the Dock is on
    // every page for signed-in people; Vibe's conversation and mic are not needed until then). Alt+V talks to Vibe from
    // any page: it opens the Dock on Vibe and starts listening (only where the browser can listen).
    const vibe = { panel: null, api: null };
    // The Chats tab's AI chats row opens the Vibe tab on its list, not on the last conversation.
    let vibeOnList = false;
    const canListen = () => !!(root.SpeechRecognition || root.webkitSpeechRecognition);
    document.addEventListener('keydown', (e) => {
        if (!e.altKey || e.ctrlKey || e.metaKey || String(e.key).toLowerCase() !== 'v' || !canListen() || !o || typeof o.token !== 'function') return;
        e.preventDefault();
        const talk = () => { if (vibe.api && vibe.api.talk) vibe.api.talk(); };
        if (!isOpen() || tab !== 'vibe') { open({ tab: 'vibe' }); setTimeout(talk, 600); } else talk();
    });

    // ── The timer (plan L48 R2): dock-timer.js, loaded when the state carries one or the person opens its menu ──
    let timerMod = null, timerLoading = null;
    function withTimer(fn) {
        if (timerMod) return fn(timerMod);
        timerLoading = timerLoading || load('dock-timer.js', () => !!(root.OpenVibeDockTimer && root.OpenVibeDockTimer.attach)).then((ok) => {
            if (ok && !timerMod) timerMod = root.OpenVibeDockTimer.attach({ state, save, host: () => inline || el, repaint: () => paintPill() });
            return timerMod;
        });
        return timerLoading.then((m) => (m ? fn(m) : null));
    }

    // ── The pill ─────────────────────────────────────────────
    let pill = null, readT = 0, bound = false, openedAt = 0;
    function store(v) {
        try { if (v === undefined) return JSON.parse(localStorage.getItem('ov-dock') || 'null'); localStorage.setItem('ov-dock', JSON.stringify(v)); } catch { /* */ }
        return null;
    }
    function paintPill() {
        if (!pill) return;
        const c = counts(), st = state(), w = c.waiting || 0, r = c.running || 0;
        const corner = place().corner;
        // Popped out: the page keeps the pill, and it says where the Dock went.
        if (popped) {
            pill.hidden = false;
            pill.dataset.corner = CORNERS.includes(corner) ? corner : 'bottom-right';
            pill.dataset.tone = 'idle';
            pill.querySelector('.ovdk-t').textContent = 'In a window';
            pill.setAttribute('aria-label', 'The Dock is in a window of its own \u2014 click to bring it back');
            return;
        }
        // A running timer: its minutes, unless an agent needs the person (that comes first).
        if (st.timer && !timerMod) withTimer((m) => m.sync());
        const tm = timerMod && !w ? timerMod.pillText() : null;
        const show = !isOpen() && !!(w || r || st.pinned || tm);
        pill.hidden = !show;
        pill.dataset.corner = CORNERS.includes(corner) ? corner : 'bottom-right';
        pill.dataset.tone = w ? 'waiting' : tm ? tm.tone : r ? 'running' : 'idle';
        pill.querySelector('.ov-mark').setAttribute('data-state', r && !w ? 'busy' : '');
        pill.querySelector('.ovdk-t').textContent = w ? 'Needs you' : tm ? tm.text : r ? (r > 1 ? `${r} working` : 'Working') : '';
        pill.setAttribute('aria-label', tm ? tm.label : [w ? `${w} need${w > 1 ? '' : 's'} you` : '', r ? `${r} working` : ''].filter(Boolean).join(', ') || 'Open the Dock');
        // Desktop toasts (bottom right, notification-ui.js) stack above a pill in their corner; an open Dock sets its own.
        if (!isOpen()) clear(show && pill.dataset.corner === 'bottom-right' && !phone() ? 58 : 0);
    }
    async function read() {
        clearTimeout(readT);
        if (!pill || document.hidden) return;
        const t = await tokenOf();
        if (!t) return;
        try {
            const r = await fetch(`${String(o.apiBase || 'https://openvibe.network').replace(/\/+$/, '')}/api/v1/me/dock`, { headers: { authorization: `Bearer ${t}`, accept: 'application/json' }, credentials: 'omit' });
            if (r.status === 404) { store({ off: Date.now() + 864e5 }); if (pill) pill.hidden = true; return; }
            const next = r.ok ? await r.json() : null;
            if (!next || !next.state || !pill) return;
            update(next);
            if (!isOpen() && !inline && next.state.open && !phone()) open();
            const c = next.counts || {};
            if (c.running || c.waiting || next.state.timer) readT = setTimeout(read, 30000);
        } catch { /* offline: the copy stands */ }
    }
    /** The pill for a signed-in person (navbar.js), or none (null: signed out, or the site turned the Dock off). */
    function mount(opts) {
        if (!opts) {
            if (mountHandle) mountHandle.destroy();
            clearTimeout(readT);
            if (pill) { pill.remove(); pill = null; }
            if (isOpen()) close();
            doc = null;
            return;
        }
        o = { ...o, ...opts };
        styles();
        if (!pill) {
            const kept = store();
            if (kept && kept.off > Date.now()) return;
            if (kept && kept.state && !doc) doc = kept;
            pill = document.createElement('button');
            pill.type = 'button'; pill.id = 'ovdk-pill'; pill.className = 'ovdk-pill'; pill.hidden = true;
            pill.innerHTML = '<span class="ovdk-m"><span class="ov-mark" data-size="26"></span></span><span class="ovdk-t"></span>';
            pill.addEventListener('click', () => { if (popped) backToPage(); else open(); });
            document.body.appendChild(pill);
            paintPill();
        }
        if (!bound) { bound = true; document.addEventListener('visibilitychange', () => { if (!document.hidden) read(); }); }
        read();
    }

    // ── Pop out (K-D4) ────────────────────────────────────────
    // On desktop Chromium the panel can move into a window of its own (Document Picture-in-Picture). The same DOM and
    // the same tabs go with it; the window is dressed with the Dock's styles and the theme's colours, so the Dock looks
    // there as it does here. The page keeps the pill, which says where the Dock went; clicking it brings the panel back.
    const PIP_W = 360, PIP_H = 520;
    const pip = () => (root.documentPictureInPicture && typeof root.documentPictureInPicture.requestWindow === 'function') ? root.documentPictureInPicture : null;
    // The theme's tokens, so the window is painted in the same colours (the names only: the values are read from the page).
    const TOKENS = 'accent accent-light accent-strong bg bg-card bg-elevated bg-hover bg-input bg-primary bg-secondary bg-tertiary border border-light danger danger-strong gold live-red on-accent on-accent-strong success text-muted text-primary text-secondary warning'.split(' ');

    function paintPop() {
        const b = el.querySelector('[data-act="pop"]');
        if (!b) return;
        b.hidden = !pip();
        const t = popped ? 'Bring the Dock back to the page' : 'Open the Dock in a window of its own';
        b.title = t; const name = b.querySelector('b'); if (name) name.textContent = t;
    }

    /** The window gets the Dock's styles, the theme's colours and the page's own type: the Dock looks the same there. */
    function dress(win) {
        const d = win.document;
        if (!d.documentElement) d.appendChild(d.createElement('html'));
        if (!d.head) d.documentElement.appendChild(d.createElement('head'));
        if (!d.body) d.documentElement.appendChild(d.createElement('body'));
        d.title = 'OpenVibe Dock';
        for (const id of ['ovdk-styles', 'ovac-styles', 'openvibe-notif-styles', 'ovda-styles', 'ov-mark-css']) {
            const s = document.getElementById(id);
            if (!s) continue;
            const c = d.createElement('style');
            c.id = id; c.textContent = s.textContent;
            d.head.appendChild(c);
        }
        const cs = getComputedStyle(document.documentElement);
        for (const n of TOKENS) { const v = cs.getPropertyValue('--' + n); if (v) d.documentElement.style.setProperty('--' + n, v.trim()); }
        const b = getComputedStyle(document.body);
        const s = d.body.style;
        s.fontFamily = b.fontFamily; s.fontSize = b.fontSize; s.fontWeight = b.fontWeight; s.lineHeight = b.lineHeight;
        s.background = b.backgroundColor;
        d.documentElement.style.colorScheme = cs.colorScheme || '';
        d.documentElement.classList.add('ovdk-pip');
    }

    /** The panel moves into a window of its own. Only from a click: the browser wants a gesture, and a Dock that opened
     * a window by itself would be a window nobody asked for. */
    async function popOut() {
        if (popped || !pip()) return;
        let win = null;
        try { win = await pip().requestWindow({ width: PIP_W, height: PIP_H }); } catch { return; }
        if (!win || !win.document) return;
        pipWin = win;
        popped = true;
        dress(win);
        win.document.body.appendChild(el);
        win.addEventListener('pagehide', () => { if (popped && !pipClosing) backToPage(); });
        paintPop();
        // Whether the Dock is in a window stays with this page: the window belongs to one page in one browser, closes
        // with it, and no other device could open it again (the browser wants a click), so the Network is not told.
        save({ open: true });
        paintPill();
    }

    /** The panel comes back to the page: the window was closed, or the pill was pressed. */
    function backToPage() {
        if (!popped) return;
        popped = false;
        const w = pipWin; pipWin = null;
        pipClosing = true;
        try { if (w && !w.closed) w.close(); } catch { /* the window is already gone */ }
        pipClosing = false;
        if (el.parentNode !== document.body) document.body.appendChild(el);
        el.hidden = false;
        layout();
        paintPop();
        paintPill();
    }

    // ── Open and close ───────────────────────────────────────
    // Ask your agent (4.135.0): Vibe opens with the question in its box, unsent.
    function ask({ text = '' } = {}, n = 0) { if (!n) open({ tab: 'vibe' }); if (vibe.api && vibe.api.ask) vibe.api.ask(text); else if (n < 40) setTimeout(() => ask({ text }, n + 1), 100); }
    function isOpen() { return !!(el && !el.hidden); }
    // A phone's sheet and the navbar's orb are one button (.from-orb).
    let orbLink = null, closing = 0;
    function navOrb() {
        if (!phone()) return null;
        const list = document.querySelectorAll('.openvibe-navbar .ovnav-orb');
        for (let i = 0; i < list.length; i++) { const r = list[i].getBoundingClientRect(); if (r.width && r.left > root.innerWidth / 2 && r.top < 120 && r.bottom > 0) return list[i]; }
        return null;
    }
    function fromOrb() {
        unlinkOrb();
        const nav = navOrb(), mine = el.querySelector('.ovdk-orbx'), mineSvg = mine && mine.querySelector('svg');
        if (!nav || !mineSvg || reduced() || popped) return;
        el.classList.add('from-orb');   // first: it sets the header's layout, and the close orb is measured where it will rest
        const a = (nav.querySelector('svg') || nav).getBoundingClientRect(), b = mineSvg.getBoundingClientRect(), box = el.getBoundingClientRect();
        if (!a.width || !b.width) { el.classList.remove('from-orb'); return; }
        const ax = a.left + a.width / 2, ay = a.top + a.height / 2, bx = b.left + b.width / 2, by = b.top + b.height / 2, s = a.width / b.width;
        el.style.setProperty('--ovdk-ox', `${Math.round(ax - box.left)}px`); el.style.setProperty('--ovdk-oy', `${Math.round(ay - box.top)}px`);
        mine.style.setProperty('--orb-dx', `${(ax - bx).toFixed(1)}px`); mine.style.setProperty('--orb-dy', `${(ay - by).toFixed(1)}px`); mine.style.setProperty('--orb-s', s.toFixed(3));
        nav.style.setProperty('--dock-dx', `${(bx - ax).toFixed(1)}px`); nav.style.setProperty('--dock-dy', `${(by - ay).toFixed(1)}px`); nav.style.setProperty('--dock-s', (1 / s).toFixed(3));
        mine.classList.add('is-set', 'is-from');
        orbLink = { nav, mine };
        void mine.offsetWidth;   // the starting pose is put on, not animated into
        mine.classList.remove('is-set');
        void mine.offsetWidth;
        nav.style.transition = 'transform .42s cubic-bezier(.2, 1.1, .3, 1), color .3s';
        root.requestAnimationFrame(() => { if (!orbLink || orbLink.mine !== mine) return; mine.classList.remove('is-from'); nav.classList.add('is-dock'); });
    }
    function unlinkOrb() {
        if (closing) { clearTimeout(closing); closing = 0; }
        if (el) el.classList.remove('from-orb', 'is-out');
        if (!orbLink) return;
        orbLink.nav.classList.remove('is-dock'); orbLink.nav.style.transition = ''; orbLink.mine.classList.remove('is-from', 'is-set');
        orbLink = null;
    }
    function share({ text = '', title = '' } = {}) {
        const t = String(text || '').trim().slice(0, 4000);
        if (!t) return;
        chats.draft = { text: t, title: String(title || '').trim().slice(0, 140) }; chats.open = null;
        // A bar left from an earlier share would show the old words until the list reloads: it goes now.
        const stale = chats.panel && chats.panel.querySelector('.ovdk-share'); if (stale) stale.remove();
        open({ tab: 'chats' });
    }
    function open(opts = {}) {
        if (mountHandle) mountHandle.destroy();
        openedAt = typeof performance !== 'undefined' && performance.now ? performance.now() : 0;
        o = { ...o, ...opts };
        if (opts.doc) doc = opts.doc;
        if (!el) build();
        lastFocus = document.activeElement;
        const c = counts();
        const want = opts.tab || (c.waiting || c.running ? 'agent' : state().tab || 'activity');
        layout();
        badges();
        paintPin();
        paintPop();
        el.hidden = false;
        el.classList.remove('is-in');
        fromOrb();
        void el.offsetWidth; el.classList.add('is-in');
        // On a computer it grows out of its pill; a phone's sheet opens out of the navbar's orb (fromOrb), or rises.
        if (!phone() && root.OpenVibeNavbar && root.OpenVibeNavbar.pop) {
            const pill = document.getElementById('ovdk-pill');
            root.OpenVibeNavbar.pop(el, pill?.offsetWidth ? pill : null);
        }
        if (phone()) {
            el.setAttribute('aria-modal', 'true'); document.documentElement.classList.add('ovdk-sheet-open');
            if (root.OVSurfaces && !dockSurface) { dockSurface = root.OVSurfaces.sheet({ el, body: el.querySelector('.ovdk-body'), close }); dockSurface.open(); }
        } else { el.removeAttribute('aria-modal'); if (dockSurface) { dockSurface.destroy(); dockSurface = null; } }
        setTab(want, false);
        readUnread();
        if (!state().open || (state().tab !== tab && SAVED_TABS.includes(tab))) save({ open: true, ...(SAVED_TABS.includes(tab) ? { tab } : {}) }); else notify();
        setTimeout(() => { try { el.querySelector('[role="tab"][aria-selected="true"]').focus({ preventScroll: true }); } catch { /* */ } }, 0);
    }
    function close() {
        if (!isOpen()) return;
        // Fold back into the navbar's orb first, then go.
        if (orbLink && !closing && !popped && !reduced() && el.classList.contains('from-orb')) {
            el.classList.remove('is-in'); el.classList.add('is-out');
            orbLink.mine.classList.add('is-from'); orbLink.nav.classList.remove('is-dock');
            closing = setTimeout(() => { closing = 0; shut(); }, 280);
            return;
        }
        shut();
    }
    function shut(keepState = false) {
        if (!isOpen()) return;
        unlinkOrb();
        const wasPopped = popped;
        if (wasPopped) { popped = false; const w = pipWin; pipWin = null; pipClosing = true; try { if (w) w.close(); } catch { /* already gone */ } pipClosing = false; if (el.parentNode !== document.body) document.body.appendChild(el); }
        const inside = el.contains(document.activeElement);
        el.hidden = true;
        if (dockSurface) { dockSurface.destroy(); dockSurface = null; }
        el.style.transform = '';
        el.removeAttribute('aria-modal');
        document.documentElement.classList.remove('ovdk-sheet-open');
        clear(0);
        clearTimeout(chats.timer); clearTimeout(chats.unreadT);
        if (!keepState) save({ open: false });
        if (inside) {
            const back = pill && !pill.hidden ? pill : (lastFocus && lastFocus.isConnected ? lastFocus : null);
            try { if (back) back.focus({ preventScroll: true }); } catch { /* */ }
        }
    }
    /** A fresh copy from the Network (navbar.js reads it while something runs): counts and anything changed elsewhere. */
    function update(next) {
        if (!next || !next.state) return;
        doc = Object.keys(pending).length ? { ...next, state: state() } : next;
        store(doc);
        if (timerMod) timerMod.sync();
        paintPill();
        if (!el) return;
        badges();
        paintPin();
        if (isOpen()) layout();
    }

    let mountHandle = null;
    /** Place the same panel body under another sheet's head. The helper and its layout load on first use. */
    function mountInto(host, { tab: first = 'activity' } = {}) {
        if (!(host instanceof Element)) throw new TypeError('mountInto needs a host element');
        if (mountHandle) mountHandle.destroy();
        if (isOpen()) { clearTimeout(closing); closing = 0; shut(true); }
        let api = null, gone = false, wanted = first;
        const handle = {
            show(id) { if (gone) return; wanted = id; if (api) api.show(id); },
            destroy() { if (gone) return; gone = true; if (api) api.destroy(); if (mountHandle === handle) mountHandle = null; },
        };
        mountHandle = handle;
        load('dock-mount.js', () => !!root.OpenVibeDockMount).then((ok) => {
            if (ok && !gone) api = root.OpenVibeDockMount.mount(host, wanted, {
                start(wrap) { if (!el) build(); inline = wrap; wrap.append(bodyEl); },
                show(id) { setTab(id, false); badges(); },
                end() { disposePanel(); inline = null; if (el) el.insertBefore(bodyEl, el.querySelector('.ovdk-size')); paintPill(); },
            });
        });
        return handle;
    }

    root.OpenVibeDock = { mount, mountInto, open, close, isOpen, update, ask, share,
        filterChats: (v) => { chats.filter = v.toLowerCase(); chatList(); },
        more: a => el.querySelector(`[data-act="${a}"]`).click(), canSend: () => canWriteChat(), _state: () => ({ doc, tab, pending }) };
})(typeof window !== 'undefined' ? window : globalThis);
