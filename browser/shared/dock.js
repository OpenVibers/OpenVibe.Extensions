// ═══════════════════════════════════════════════════════════════
// OpenVibe — the Dock (Dock plan 2026-10-30, K-D1): your agents and your activity at the edge of every OpenVibe page
//
// navbar.js loads this file from beside itself for a signed-in person, after the bell, and mounts it:
//   OpenVibeDock.mount({ token: () => jwt, apiBase, sibling })   the pill; mount(null) takes it away (signed out)
//   OpenVibeDock.open({ tab }) · close() · isOpen()
//
// The pill (the mark, a word and a dot) shows only while an agent works, one needs you, or the person pinned it, in the
// corner the Dock sits in. It paints at once from this site's copy (localStorage ov-dock), then from the Network, and
// re-reads every 30 s while something runs and when the page comes back. A 404 (Network without the route yet) keeps
// { off } for a day, and navbar.js does not load this file until then.
//
// State: GET/PUT <apiBase>/api/v1/me/dock (network.dock-result@1, network.dock-state@1): open, tab, pinned and where it
// sits for each device class, so it follows the person from site to site. A change shows at once (onChange paints the
// pill and the site's copy) and reaches the Network a beat later; before Network has the route the copy stands.
// Tabs: Agents (action-center.js mount(): what needs you, then what runs, approve or decline in place), Chats (K-D2: the
// person's conversations and DMs from OpenVibe.Chat's own API, GET /api/dm/conversations, opened in place, read and
// answered there) and Activity (notification-ui.js renderDock(): the bell's list). The agent's live screen is K-D3.
// Desktop: a floating card at the pill's corner. Drag its head to move it (it snaps to the nearest corner), drag the
// free corner to resize (320-720 × 360-900 px). It is not modal: the page stays usable. Phones: a sheet from the
// bottom over a scrim; drag the head down, ×, Escape or a tap outside closes it. Motion is transform and opacity only.
// Pop out (K-D4): on desktop Chromium the panel moves into a window of its own (Document Picture-in-Picture) — the same
// DOM, the same tabs, the page's own styles copied in; the page keeps the pill, which says where the Dock went.
// ═══════════════════════════════════════════════════════════════
(function (root) {
    'use strict';
    if (typeof document === 'undefined' || root.OpenVibeDock) return;

    const W = [320, 720], H = [360, 900], DEF = { width: 400, height: 560 };
    const CORNERS = ['bottom-right', 'bottom-left', 'top-right', 'top-left'];
    const svg = (p) => `<svg viewBox="0 0 24 24" aria-hidden="true">${p}</svg>`;
    const G = {
        spark: '<path d="M12 3.5l1.9 5.1 5.1 1.9-5.1 1.9-1.9 5.1-1.9-5.1L5 10.5l5.1-1.9z"/><path d="M18.4 15.6l.6 1.6 1.6.6-1.6.6-.6 1.6-.6-1.6-1.6-.6 1.6-.6z"/>',
        bell: '<path d="M6.5 16.5V11a5.5 5.5 0 0 1 11 0v5.5l1.5 2h-14z"/><path d="M10 20.5a2.2 2.2 0 0 0 4 0"/>',
        pin: '<path d="M14.5 3.5l6 6-3 1.5-3.5 3.5.5 4-1.5 1.5-4-4-4.5 4.5M9 15l-4-4 1.5-1.5 4 .5L14 6.5z"/>',
        close: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
        open: '<path d="M13.5 5.5h5v5M18.5 5.5l-8 8M16.5 13.5v4a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1h4"/>',
        chat: '<path d="M5 6.5h14a1.5 1.5 0 0 1 1.5 1.5v8a1.5 1.5 0 0 1-1.5 1.5h-7l-4 3v-3H5A1.5 1.5 0 0 1 3.5 16V8A1.5 1.5 0 0 1 5 6.5z"/>',
        back: '<path d="M14.5 6.5L9 12l5.5 5.5"/>',
        send: '<path d="M4.5 12h11M11 6.5l5.5 5.5-5.5 5.5"/>',
    };
    const TABS = [['agent', 'Agents', G.spark], ['chats', 'Chats', G.chat], ['activity', 'Activity', G.bell]];
    const DEFAULT_STATE = { open: false, tab: 'activity', pinned: false, agent: null, chat: null, place: { phone: { corner: 'bottom-right' }, desktop: { corner: 'bottom-right', width: null, height: null } } };

    let el = null, o = {}, doc = null, tab = 'activity', saveT = 0, pending = {}, lastFocus = null;
    // Pop out (K-D4): the window the panel lives in while it is popped out, and whether it is in one.
    let pipWin = null, popped = false, pipClosing = false, popOk = true;
    const mounts = {};

    const phone = () => { try { return root.matchMedia('(max-width: 640px)').matches; } catch { return false; } };
    const reduced = () => { try { return root.matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.getAttribute('data-ov-motion') === 'reduced'; } catch { return false; } };
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    const state = () => (doc && doc.state) || DEFAULT_STATE;
    const counts = () => (doc && doc.counts) || {};
    const kind = () => (phone() ? 'phone' : 'desktop');
    const place = () => ({ ...DEFAULT_STATE.place[kind()], ...((state().place || {})[kind()] || {}) });
    const sibling = (name) => (typeof o.sibling === 'function' ? o.sibling(name) : `https://openvibe.network/shared/${name}`);

    function call(path, init = {}) {
        const base = String(o.apiBase || 'https://openvibe.network').replace(/\/+$/, '');
        const t = typeof o.token === 'function' ? o.token() : o.token;
        const headers = { accept: 'application/json', ...(init.body ? { 'content-type': 'application/json' } : {}), ...(t ? { authorization: `Bearer ${t}` } : {}) };
        return fetch(base + path, { ...init, headers, credentials: 'omit' }).then((r) => (r.ok ? r.json() : null));
    }
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
            let r = await call('/api/v1/me/dock', { method: 'PUT', body: JSON.stringify(body) });
            // A Network whose state contract does not know "popped" yet refuses the whole body; ask again without it,
            // so the Dock's place and its tab still reach the Network.
            if (!r && 'popped' in body) {
                const rest = { ...body }; delete rest.popped;
                r = await call('/api/v1/me/dock', { method: 'PUT', body: JSON.stringify(rest) });
            }
            if (r && r.state && !Object.keys(pending).length) { doc = { ...doc, state: r.state, counts: r.counts || counts() }; notify(); badges(); }
        } catch { /* offline, or no route yet: the copy stands and the next change tries again */ }
    }

    function load(src, test) {
        return new Promise((ok) => {
            if (test()) return ok(true);
            const id = `ov-dock-${src.replace(/\W/g, '')}`;
            let sc = document.getElementById(id);
            if (!sc) { sc = document.createElement('script'); sc.id = id; sc.src = sibling(src); sc.async = true; document.head.appendChild(sc); }
            sc.addEventListener('load', () => ok(test()));
            sc.addEventListener('error', () => ok(false));
        });
    }

    function styles() {
        if (document.getElementById('ovdk-styles')) return;
        const st = document.createElement('style');
        st.id = 'ovdk-styles';
        st.textContent = `
            .ovdk-pill { --t: var(--accent, #3b82f6); --bg: var(--bg-elevated, var(--bg-secondary, #252530)); position: fixed; z-index: 9995; right: max(16px, env(safe-area-inset-right, 0px)); bottom: calc(max(16px, env(safe-area-inset-bottom, 0px)) + var(--ovnav-appbar-h, 0px));
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
            @media (prefers-reduced-motion: reduce) { .ovdk-pill, .ovdk-m::before { animation: none !important; } }
            html[data-ov-motion="reduced"] .ovdk-pill, html[data-ov-motion="reduced"] .ovdk-m::before { animation: none; }
            .ovdk { --ovdk-gap: 16px; position: fixed; z-index: 9996; display: flex; flex-direction: column; overflow: hidden; box-sizing: border-box;
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
            .ovdk-head { position: relative; flex: none; display: flex; align-items: center; gap: 8px; padding: 10px 8px 8px 10px; cursor: grab; touch-action: none; user-select: none; }
            .ovdk-tabs { display: flex; gap: 2px; padding: 3px; border-radius: 999px; background: color-mix(in srgb, var(--text-primary, #ececf1) 6%, transparent); min-width: 0; }
            .ovdk-tabs button { position: relative; display: inline-flex; align-items: center; gap: 7px; height: 36px; padding: 0 14px 0 11px; border: 0; border-radius: 999px; background: transparent;
                color: var(--text-secondary, #b6b6c0); font: inherit; font-size: 13.5px; font-weight: 700; cursor: pointer; white-space: nowrap; transition: background .15s, color .15s; }
            .ovdk-tabs button svg { width: 17px; height: 17px; flex: none; }
            .ovdk-tabs button:hover { color: var(--text-primary, #ececf1); }
            .ovdk-tabs button[aria-selected="true"] { background: var(--bg-primary, #12141b); color: var(--text-primary, #ececf1); box-shadow: 0 1px 3px rgba(0,0,0,.25); }
            .ovdk-tabs button[aria-selected="true"] svg { color: var(--accent-light, var(--accent, #60a5fa)); }
            .ovdk-tabs button:focus-visible, .ovdk-acts button:focus-visible, .ovdk-foot :focus-visible { outline: 2px solid var(--accent-light, var(--accent, #3b82f6)); outline-offset: 1px; }
            .ovdk-tabs .n { min-width: 18px; padding: 1px 6px; box-sizing: border-box; border-radius: 999px; font-size: 11px; font-weight: 800; line-height: 1.35; text-align: center; font-variant-numeric: tabular-nums;
                color: var(--text-primary, #ececf1); background: color-mix(in srgb, var(--accent, #3b82f6) 26%, transparent); }
            .ovdk-tabs .n[data-tone="waiting"] { background: color-mix(in srgb, var(--warning, #f5a524) 34%, transparent); }
            .ovdk-tabs .n:empty { display: none; }
            .ovdk-acts { display: flex; gap: 2px; margin-left: auto; }
            .ovdk-acts button { width: 40px; height: 40px; border: 0; border-radius: 12px; background: transparent; color: var(--text-muted, #8b8b96); cursor: pointer; display: grid; place-items: center; }
            .ovdk-acts button:hover { background: color-mix(in srgb, var(--text-primary, #ececf1) 7%, transparent); color: var(--text-primary, #ececf1); }
            .ovdk-acts button svg { width: 19px; height: 19px; }
            .ovdk-acts [data-act="pin"][aria-pressed="true"] { color: var(--accent-light, var(--accent, #60a5fa)); }
            .ovdk-acts [data-act="pin"][aria-pressed="true"] svg { fill: color-mix(in srgb, currentColor 22%, transparent); }
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
            .ovdk-wait span { width: 20px; height: 20px; border-radius: 50%; border: 2px solid var(--border, rgba(255,255,255,.12)); border-top-color: var(--accent, #3b82f6); animation: ovdk-spin .8s linear infinite; }
            @keyframes ovdk-spin { to { transform: rotate(360deg); } }
            .ovdk-none { padding: 40px 24px; text-align: center; color: var(--text-muted, #8b8b96); font-size: 13.5px; line-height: 1.45; }
            .ovdk-size { position: absolute; z-index: 2; width: 22px; height: 22px; top: 0; left: 0; cursor: nwse-resize; touch-action: none; }
            .ovdk-size::after { content: ''; position: absolute; top: 9px; left: 9px; width: 7px; height: 7px; border-top: 2px solid var(--text-muted, #8b8b96); border-left: 2px solid var(--text-muted, #8b8b96); border-top-left-radius: 3px; opacity: 0; transition: opacity .15s; }
            .ovdk:hover .ovdk-size::after, .ovdk-size:active::after { opacity: .75; }
            .ovdk[data-corner="bottom-left"] .ovdk-size { left: auto; right: 0; cursor: nesw-resize; }
            .ovdk[data-corner="bottom-left"] .ovdk-size::after { left: auto; right: 9px; border-left: 0; border-right: 2px solid var(--text-muted, #8b8b96); border-top-left-radius: 0; border-top-right-radius: 3px; }
            .ovdk[data-corner="top-right"] .ovdk-size { top: auto; bottom: 0; cursor: nesw-resize; }
            .ovdk[data-corner="top-right"] .ovdk-size::after { top: auto; bottom: 9px; border-top: 0; border-bottom: 2px solid var(--text-muted, #8b8b96); border-top-left-radius: 0; border-bottom-left-radius: 3px; }
            .ovdk[data-corner="top-left"] .ovdk-size { top: auto; bottom: 0; left: auto; right: 0; }
            .ovdk[data-corner="top-left"] .ovdk-size::after { top: auto; bottom: 9px; left: auto; right: 9px; border: 0; border-bottom: 2px solid var(--text-muted, #8b8b96); border-right: 2px solid var(--text-muted, #8b8b96); border-radius: 0 0 3px 0; }
            @media (pointer: coarse) { .ovdk-acts button { width: 44px; height: 44px; } .ovdk-tabs button { height: 40px; } }
            .ovdk { container-type: inline-size; }
            @container (max-width: 440px) { .ovdk-tabs button { padding: 0 11px; gap: 6px; } .ovdk-tabs button svg { display: none; } }
            .ovdk-muted { color: var(--text-muted, #8b8b96); }
            .ovdk-i { display: inline-grid; place-items: center; }
            .ovdk-i svg { width: 18px; height: 18px; }
            .ovdk-chats { list-style: none; margin: 0; padding: 6px; display: grid; gap: 2px; }
            .ovdk-chat { display: grid; grid-template-columns: 40px minmax(0, 1fr) auto; align-items: center; gap: 12px; width: 100%; min-height: 60px; padding: 8px 10px; border: 0; border-radius: 14px;
                background: transparent; color: inherit; font: inherit; text-align: left; cursor: pointer; }
            .ovdk-chat:hover { background: color-mix(in srgb, var(--text-primary, #ececf1) 5%, transparent); }
            .ovdk-chat:focus-visible { outline: 2px solid var(--accent-light, var(--accent, #3b82f6)); outline-offset: -2px; }
            .ovdk-av { display: grid; place-items: center; width: 40px; height: 40px; border-radius: 50%; overflow: hidden; font-weight: 800; font-size: 15px;
                color: var(--accent-light, var(--accent, #60a5fa)); background: color-mix(in srgb, var(--accent, #3b82f6) 16%, transparent); }
            .ovdk-av img { width: 100%; height: 100%; object-fit: cover; }
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
            .ovdk-go { width: 40px; height: 40px; flex: none; border: 0; border-radius: 12px; cursor: pointer; display: grid; place-items: center;
                color: var(--on-accent-strong, var(--on-accent, #fff)); background: var(--accent-strong, var(--accent, #3472d8)); }
            .ovdk-go:disabled { opacity: .55; cursor: default; }
            .ovdk-err { margin: 0 14px; font-size: 12.5px; color: color-mix(in srgb, var(--live-red, #e5484d) 60%, var(--text-primary, #ececf1)); }
            .ovdk-err[hidden] { display: none; }
            .ovdk-none b { display: block; margin-bottom: 4px; font-size: 15px; color: var(--text-primary, #ececf1); }
            @media (max-width: 640px) {
                .ovdk, .ovdk[data-corner] { left: 0; right: 0; top: auto; bottom: 0; width: auto !important; height: min(86vh, 720px) !important; height: min(86dvh, 720px) !important; max-width: none; max-height: none;
                    border-radius: 24px 24px 0 0; border-bottom: 0; padding-bottom: env(safe-area-inset-bottom, 0px); box-shadow: 0 0 0 100vmax rgba(0,0,0,.5), 0 -12px 40px rgba(0,0,0,.35); transform-origin: 50% 100%; }
                .ovdk.is-in { animation-name: ovdk-rise; animation-duration: .3s; }
                .ovdk-head { padding-top: 22px; cursor: default; }
                .ovdk-head::before { content: ''; position: absolute; top: 8px; left: 50%; width: 40px; height: 4px; margin-left: -20px; border-radius: 2px; background: var(--border-light, var(--border, rgba(255,255,255,.22))); }
                .ovdk-size { display: none; }
                .ovdk-tabs { flex: 1; } .ovdk-tabs button { flex: 1; justify-content: center; }
            }
            html.ovdk-sheet-open, html.ovdk-sheet-open body { overflow: hidden; }
            @media (prefers-reduced-motion: reduce) { .ovdk.is-in, .ovdk-wait span { animation: none; } }
            html[data-ov-motion="reduced"] .ovdk.is-in { animation: none; }
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
                    <button type="button" data-act="pop" hidden title="Open the Dock in a window of its own" aria-label="Open the Dock in a window of its own">${svg(G.open)}</button>
                    <button type="button" data-act="pin" aria-pressed="false" title="Keep the Dock's button on every page" aria-label="Keep the Dock's button on every page">${svg(G.pin)}</button>
                    <button type="button" data-act="close" title="Close" aria-label="Close the Dock">${svg(G.close)}</button>
                </div>
            </header>
            <div class="ovdk-body">${TABS.map(([id]) => `<div class="ovdk-panel" role="tabpanel" id="ovdk-panel-${id}" aria-labelledby="ovdk-tab-${id}" data-panel="${id}" hidden></div>`).join('')}</div>
            <span class="ovdk-size" aria-hidden="true"></span>`;
        document.body.appendChild(el);

        const tabs = [...el.querySelectorAll('[role="tab"]')];
        tabs.forEach((b) => b.addEventListener('click', () => setTab(b.dataset.tab, true)));
        el.querySelector('.ovdk-tabs').addEventListener('keydown', (e) => {
            const i = tabs.indexOf(document.activeElement); if (i < 0) return;
            const j = e.key === 'ArrowRight' ? (i + 1) % tabs.length : e.key === 'ArrowLeft' ? (i - 1 + tabs.length) % tabs.length : e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : -1;
            if (j >= 0) { e.preventDefault(); setTab(tabs[j].dataset.tab, true); tabs[j].focus(); }
        });
        el.querySelector('[data-act="close"]').addEventListener('click', () => close());
        el.querySelector('[data-act="pop"]').addEventListener('click', () => { if (popped) backToPage(); else popOut(); });
        el.querySelector('[data-act="pin"]').addEventListener('click', () => { save({ pinned: !state().pinned }); paintPin(); });
        el.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } });
        // A tap outside closes the phone sheet. The path is the one at dispatch: a tap that redraws its own panel (opening a
        // chat) leaves its target detached, and must not read as outside.
        document.addEventListener('click', (e) => {
            if (!isOpen() || !phone()) return;
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
            if (e.button || e.target.closest('.ovdk-acts')) return;
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
        el.querySelector('#ovdk-tab-chats').setAttribute('aria-label', chats.unread ? `Chats, ${chats.unread} unread` : 'Chats');
        el.querySelector('#ovdk-tab-agent').setAttribute('aria-label', [`Agents`, c.waiting ? `${c.waiting} need${c.waiting === 1 ? 's' : ''} you` : '', c.running ? `${c.running} working` : ''].filter(Boolean).join(', '));
        el.querySelector('#ovdk-tab-activity').setAttribute('aria-label', c.unread ? `Activity, ${c.unread} unread` : 'Activity');
    }
    function paintPin() {
        const b = el.querySelector('[data-act="pin"]'), on = !!state().pinned;
        b.setAttribute('aria-pressed', String(on));
        const t = on ? "The Dock's button stays on every page" : "Keep the Dock's button on every page";
        b.title = t; b.setAttribute('aria-label', t);
    }
    function setTab(id, remember) {
        tab = TABS.some(([t]) => t === id) ? id : 'activity';
        if (tab !== 'chats') clearTimeout(chats.timer);
        el.querySelectorAll('[role="tab"]').forEach((b) => { const on = b.dataset.tab === tab; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; });
        el.querySelectorAll('[data-panel]').forEach((p) => { p.hidden = p.dataset.panel !== tab; });
        if (remember && state().tab !== tab) save({ tab });
        fill(tab);
    }

    async function fill(id) {
        const panel = el.querySelector(`[data-panel="${id}"]`);
        if (id === 'chats') { chats.panel = panel; mounts.chats = mounts.chats || { refresh: null }; return state().chat && chats.open !== state().chat ? openChat(state().chat, false) : chats.open ? openChat(chats.open, false) : chatList(); }
        if (mounts[id]) { if (mounts[id].refresh) mounts[id].refresh(); return; }
        mounts[id] = { refresh: null };
        panel.innerHTML = '<div class="ovdk-wait"><span></span></div>';
        if (id === 'agent') {
            const ok = await load('action-center.js', () => !!(root.OpenVibeActionCenter && root.OpenVibeActionCenter.mount));
            if (!ok) return failed(panel, id);
            panel.innerHTML = `<div class="ovdk-scroll"></div><div class="ovdk-foot"><button type="button" data-act="all">${svg(G.open)}Scheduled, done and failed</button><a href="https://openvibe.actor/">Give an agent a task →</a></div>`;
            const m = root.OpenVibeActionCenter.mount(panel.firstChild, {
                token: o.token, apiBase: o.apiBase, buckets: ['waiting', 'running'],
                onCounts: (c) => { doc = { ...(doc || {}), state: state(), counts: { ...counts(), running: c.running || 0, waiting: c.waiting || 0 } }; badges(); notify(); },
            });
            mounts[id] = m;
            panel.querySelector('[data-act="all"]').addEventListener('click', (e) => {
                const anchor = e.currentTarget;
                close();
                try { root.OpenVibeActionCenter.open({ token: o.token, apiBase: o.apiBase, anchor: (pill && !pill.hidden) ? pill : anchor }); } catch { /* */ }
            });
            return;
        }
        const ok = await load('notification-ui.js', () => !!(root.OpenVibeNotifications && root.OpenVibeNotifications.renderDock));
        if (!ok) return failed(panel, id);
        const N = root.OpenVibeNotifications;
        if (!N.__ovNavInit) { try { N.init({ token: typeof o.token === 'function' ? o.token() : o.token, apiBase: o.apiBase || 'https://openvibe.network' }); N.__ovNavInit = true; } catch { /* */ } }
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
    const chats = { panel: null, list: null, open: null, msgs: [], last: 0, timer: 0, unread: 0, unreadT: 0, busy: false };
    const chatBase = () => String(o.chatBase || 'https://openvibe.chat').replace(/\/+$/, '');
    const me = () => String(o.me || '');
    const h = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
    const icon = (path) => { const s = h('span', 'ovdk-i'); s.innerHTML = svg(path); return s; };
    function chatCall(path, init = {}) {
        const t = typeof o.token === 'function' ? o.token() : o.token;
        const headers = { accept: 'application/json', ...(init.body ? { 'content-type': 'application/json' } : {}), ...(t ? { authorization: `Bearer ${t}` } : {}) };
        return fetch(chatBase() + path, { ...init, headers, credentials: 'omit' }).then(async (r) => {
            const b = await r.json().catch(() => ({}));
            if (!r.ok) { const e = new Error(b.error || `HTTP ${r.status}`); e.status = r.status; throw e; }
            return b;
        });
    }
    function readUnread() {
        clearTimeout(chats.unreadT);
        chatCall('/api/dm/unread').then((b) => { chats.unread = Number(b && b.unread) || 0; badges(); }).catch(() => { /* Chat away: no count */ });
        if (isOpen()) chats.unreadT = setTimeout(readUnread, 30000);
    }
    const when = (iso) => {
        const t = Date.parse(iso || ''); if (!Number.isFinite(t)) return '';
        const m = Math.max(0, Math.round((Date.now() - t) / 60000));
        return m < 1 ? 'now' : m < 60 ? `${m} min` : m < 1440 ? `${Math.floor(m / 60)} h` : `${Math.floor(m / 1440)} d`;
    };
    function avatar(p, group) {
        const a = h('span', 'ovdk-av');
        const url = p && /^https:\/\//.test(String(p.avatar_url || '')) ? p.avatar_url : '';
        if (url && !group) { const img = h('img'); img.src = url; img.alt = ''; img.loading = 'lazy'; img.referrerPolicy = 'no-referrer'; a.append(img); }
        else a.textContent = group ? '#' : String((p && (p.display_name || p.username)) || '?').trim().charAt(0).toUpperCase() || '?';
        return a;
    }
    const others = (c) => (c.participants || []).filter((p) => p.username !== me());
    const titleOf = (c) => c.name || others(c).map((p) => p.display_name || p.username).join(', ') || 'Just you';
    function chatFoot(panel) {
        const foot = h('div', 'ovdk-foot');
        const a = h('a', '', 'Open Chat →'); a.href = `${chatBase()}/messages`; a.target = '_blank'; a.rel = 'noopener';
        foot.append(h('span', 'ovdk-muted', 'Your conversations and DMs'), a);
        panel.append(foot);
    }
    async function chatList() {
        clearTimeout(chats.timer);
        chats.open = null;
        const panel = chats.panel; if (!panel) return;
        if (!chats.list) { panel.innerHTML = '<div class="ovdk-wait"><span></span></div>'; }
        try { chats.list = (await chatCall('/api/dm/conversations')).conversations || []; } catch (e) { panel.textContent = ''; panel.append(h('div', 'ovdk-none', e.status === 401 ? 'Sign in to Chat to see your conversations.' : 'Your chats did not load. Check your connection, then open them again.')); chatFoot(panel); return; }
        if (chats.open || tab !== 'chats') return;
        panel.textContent = '';
        const scroll = h('div', 'ovdk-scroll');
        if (!chats.list.length) {
            const none = h('div', 'ovdk-none');
            none.append(h('b', '', 'No conversations yet'), document.createTextNode('A message to someone on OpenVibe starts one, and it shows here on every site.'));
            scroll.append(none);
        } else {
            const ul = h('ul', 'ovdk-chats');
            chats.list.forEach((c) => {
                const li = h('li'), b = h('button', 'ovdk-chat');
                b.type = 'button';
                const unread = Number(c.unread_count) || 0;
                const mine = (c.participants || []).some((p) => p.id === c.last_sender_id && p.username === me());
                const body = h('span', 'ovdk-chat-b');
                body.append(h('b', '', titleOf(c)), h('span', 'ovdk-chat-p', c.last_message ? `${mine ? 'You: ' : ''}${String(c.last_message).replace(/\s+/g, ' ').slice(0, 140)}` : 'No messages yet'));
                const meta = h('span', 'ovdk-chat-m');
                meta.append(h('time', '', when(c.last_message_at || c.updated_at)));
                if (unread) meta.append(h('b', 'ovdk-unread', unread > 99 ? '99+' : String(unread)));
                b.append(avatar(others(c)[0] || {}, !!c.is_group), body, meta);
                b.setAttribute('aria-label', `${titleOf(c)}${unread ? `, ${unread} unread` : ''}`);
                if (unread) li.className = 'is-unread';
                b.addEventListener('click', () => openChat(String(c.id), true));
                li.append(b); ul.append(li);
            });
            scroll.append(ul);
        }
        panel.append(scroll);
        chatFoot(panel);
    }
    function bubble(m, prev) {
        const mine = m.username === me();
        const li = h('li', `ovdk-msg${mine ? ' is-mine' : ''}${prev && prev.username === m.username ? ' is-cont' : ''}`);
        if (!mine && !(prev && prev.username === m.username)) li.append(h('span', 'ovdk-who', m.display_name || m.username || ''));
        li.append(h('span', 'ovdk-text', String(m.message || '')));
        li.title = new Date(m.created_at).toLocaleString();
        return li;
    }
    async function openChat(id, remember) {
        clearTimeout(chats.timer);
        const panel = chats.panel; if (!panel) return;
        chats.open = String(id); chats.msgs = []; chats.last = 0;
        if (remember) save({ chat: chats.open });
        const conv = (chats.list || []).find((c) => String(c.id) === chats.open);
        panel.textContent = '';
        const head = h('div', 'ovdk-thread-h');
        const back = h('button', 'ovdk-back'); back.type = 'button'; back.setAttribute('aria-label', 'Back to your chats'); back.append(icon(G.back));
        back.addEventListener('click', () => { save({ chat: null }); chatList(); });
        const title = h('b', '', conv ? titleOf(conv) : 'Conversation');
        head.append(back, title);
        // Opened from the Dock's state on another page: the list is not here yet, so the title comes with it.
        if (!conv) chatCall('/api/dm/conversations').then((b) => { chats.list = b.conversations || []; const c = chats.list.find((x) => String(x.id) === String(id)); if (c && chats.open === String(id)) title.textContent = titleOf(c); }).catch(() => { /* the title stays */ });
        const list = h('ol', 'ovdk-msgs'); list.setAttribute('aria-live', 'polite');
        const scroll = h('div', 'ovdk-scroll ovdk-thread'); scroll.append(list);
        const form = h('form', 'ovdk-send');
        const box = h('textarea'); box.rows = 1; box.maxLength = 4000; box.placeholder = 'Message'; box.setAttribute('aria-label', 'Message');
        const go = h('button', 'ovdk-go'); go.type = 'submit'; go.setAttribute('aria-label', 'Send'); go.append(icon(G.send));
        const err = h('p', 'ovdk-err'); err.hidden = true;
        form.append(box, go);
        panel.append(head, scroll, err, form);
        const fit = () => { box.style.height = 'auto'; box.style.height = `${Math.min(box.scrollHeight, 140)}px`; };
        box.addEventListener('input', fit);
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
        list.append(h('li', 'ovdk-wait', null));
        list.firstChild.innerHTML = '<span></span>';
        await pull(list, scroll, true);
        setTimeout(() => { try { box.focus({ preventScroll: true }); } catch { /* */ } }, 0);
    }
    /** New messages of the open thread (all of them the first time), drawn in place; read once shown. */
    async function pull(list, scroll, first) {
        const id = chats.open;
        let got = [];
        try { got = (await chatCall(`/api/dm/conversations/${encodeURIComponent(id)}/messages?limit=50${chats.last ? `&after=${chats.last}` : ''}`)).messages || []; } catch (e) {
            if (first) { list.textContent = ''; list.append(h('li', 'ovdk-none', e.status === 403 ? 'This conversation is not yours.' : 'The messages did not load. Try again.')); }
            return;
        }
        if (id !== chats.open) return;
        if (first) list.textContent = '';
        const atEnd = scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight < 40;
        got.forEach((m) => { if (chats.msgs.some((x) => x.id === m.id)) return; list.append(bubble(m, chats.msgs[chats.msgs.length - 1])); chats.msgs.push(m); chats.last = Math.max(chats.last, Number(m.id) || 0); });
        if (first && !chats.msgs.length) list.append(h('li', 'ovdk-none', 'No messages yet. Say hello.'));
        if (first || atEnd) scroll.scrollTop = scroll.scrollHeight;
        if (got.length || first) chatCall(`/api/dm/conversations/${encodeURIComponent(id)}/read`, { method: 'POST', body: '{}' }).then(readUnread).catch(() => { /* */ });
        clearTimeout(chats.timer);
        if (isOpen() && tab === 'chats' && chats.open === id) chats.timer = setTimeout(() => pull(list, scroll), 5000);
    }

    // ── The pill ─────────────────────────────────────────────
    let pill = null, readT = 0, bound = false;
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
        const show = !isOpen() && !!(w || r || st.pinned);
        pill.hidden = !show;
        pill.dataset.corner = CORNERS.includes(corner) ? corner : 'bottom-right';
        pill.dataset.tone = w ? 'waiting' : r ? 'running' : 'idle';
        pill.querySelector('.ov-mark').setAttribute('data-state', r && !w ? 'busy' : '');
        pill.querySelector('.ovdk-t').textContent = w ? 'Needs you' : r ? (r > 1 ? `${r} working` : 'Working') : '';
        pill.setAttribute('aria-label', [w ? `${w} need${w > 1 ? '' : 's'} you` : '', r ? `${r} working` : ''].filter(Boolean).join(', ') || 'Open the Dock');
        // Desktop toasts (bottom right, notification-ui.js) stack above a pill in their corner; an open Dock sets its own.
        if (!isOpen()) clear(show && pill.dataset.corner === 'bottom-right' && !phone() ? 58 : 0);
    }
    function read() {
        clearTimeout(readT);
        if (!pill || document.hidden) return;
        const t = typeof o.token === 'function' ? o.token() : o.token;
        if (!t) return;
        fetch(`${String(o.apiBase || 'https://openvibe.network').replace(/\/+$/, '')}/api/v1/me/dock`, { headers: { authorization: `Bearer ${t}`, accept: 'application/json' }, credentials: 'omit' })
            .then((r) => { if (r.status !== 404) return r.ok ? r.json() : null; store({ off: Date.now() + 864e5 }); if (pill) pill.hidden = true; return null; })
            .then((next) => {
                if (!next || !next.state || !pill) return;
                update(next);
                if (!isOpen() && next.state.open && !phone()) open();
                const c = next.counts || {};
                if (c.running || c.waiting) readT = setTimeout(read, 30000);
            }).catch(() => { /* offline: the copy stands */ });
    }
    /** The pill for a signed-in person (navbar.js), or none (null: signed out, or the site turned the Dock off). */
    function mount(opts) {
        if (!opts) {
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
        b.title = t; b.setAttribute('aria-label', t);
    }

    /** The window gets the Dock's styles, the theme's colours and the page's own type: the Dock looks the same there. */
    function dress(win) {
        const d = win.document;
        if (!d.documentElement) d.appendChild(d.createElement('html'));
        if (!d.head) d.documentElement.appendChild(d.createElement('head'));
        if (!d.body) d.documentElement.appendChild(d.createElement('body'));
        d.title = 'OpenVibe Dock';
        for (const id of ['ovdk-styles', 'ovac-styles', 'openvibe-notif-styles', 'ov-mark-css']) {
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
        save({ open: true, popped: true });
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
        save({ popped: false });
        paintPill();
    }

    // ── Open and close ───────────────────────────────────────
    function isOpen() { return !!(el && !el.hidden); }
    function open(opts = {}) {
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
        el.classList.remove('is-in'); void el.offsetWidth; el.classList.add('is-in');
        if (phone()) { el.setAttribute('aria-modal', 'true'); document.documentElement.classList.add('ovdk-sheet-open'); } else el.removeAttribute('aria-modal');
        setTab(want, false);
        readUnread();
        if (!state().open || state().tab !== tab) save({ open: true, tab }); else notify();
        setTimeout(() => { try { el.querySelector('[role="tab"][aria-selected="true"]').focus({ preventScroll: true }); } catch { /* */ } }, 0);
    }
    function close() {
        if (!isOpen()) return;
        const wasPopped = popped;
        if (wasPopped) { popped = false; const w = pipWin; pipWin = null; pipClosing = true; try { if (w) w.close(); } catch { /* already gone */ } pipClosing = false; if (el.parentNode !== document.body) document.body.appendChild(el); }
        const inside = el.contains(document.activeElement);
        el.hidden = true;
        el.style.transform = '';
        el.removeAttribute('aria-modal');
        document.documentElement.classList.remove('ovdk-sheet-open');
        clear(0);
        clearTimeout(chats.timer); clearTimeout(chats.unreadT);
        save(wasPopped ? { open: false, popped: false } : { open: false });
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
        paintPill();
        if (!el) return;
        badges();
        paintPin();
        if (isOpen()) layout();
    }

    root.OpenVibeDock = { mount, open, close, isOpen, update, _state: () => ({ doc, tab, pending }) };
})(typeof window !== 'undefined' ? window : globalThis);
