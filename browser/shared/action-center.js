// ═══════════════════════════════════════════════════════════════
// OpenVibe — the Action Center (✦), every agent task in one place (plan 2026-10-28 §3.10; Shared 4.31.0)
//
// notification-ui.js draws the ✦ beside the bell and loads this file, from beside itself, on the first click.
//   OpenVibeActionCenter.toggle({ anchor, token: () => jwt, apiBase })   · open(opts) · close() · isOpen()
//   OpenVibeActionCenter.mount(container, { token, apiBase, buckets, onCounts })  → { refresh(), destroy() }
//       the Dock's Agent tab (dock.js): the items of some buckets in a container of the Dock's, waiting first, the
//       same rows and the same approve and decline, re-read every 15 s while something runs.
//
// Reads  GET  <apiBase>/api/v1/me/actions                     network.me-actions-result@1 (Bearer, or the cookie on
//                                                             openvibe.network itself)
// Writes POST <apiBase>/api/v1/me/actions/:service/:id/approve|decline
//
// Five tabs: Running (live: re-read every 15 s while open and something runs), Waiting for you (approve or decline
// here), Scheduled, Done (a receipt: cost, steps, the page), Failed (why, and open it to try again). A service that did
// not answer is named under the tabs; the rest still show. Desktop: a 420 px popover under the bar. Phones: a full-height
// sheet with a handle (drag down, ×, or a tap outside closes it). Opaque, on the theme's raised surface, and while it is
// open toasts wait (aria-modal: notification-ui.js holds them).
// ═══════════════════════════════════════════════════════════════
(function (root) {
    'use strict';
    if (typeof document === 'undefined' || root.OpenVibeActionCenter) return;

    const BUCKETS = [['running', 'Running'], ['waiting', 'Waiting for you'], ['scheduled', 'Scheduled'], ['done', 'Done'], ['failed', 'Failed']];
    const SHORT = { running: 'Running', waiting: 'Waiting', scheduled: 'Scheduled', done: 'Done', failed: 'Failed' };
    const EMPTY = {
        running: ['Nothing running', 'When an agent is working for you, its steps show here as they happen.'],
        waiting: ['Nothing needs you', 'When an agent asks before it spends, sends or deletes, you approve it here.'],
        scheduled: ['Nothing scheduled', 'Agents you set to run later, like a morning brief, show here.'],
        done: ['Nothing finished yet', 'Finished work shows here with what it cost and where it is.'],
        failed: ['Nothing failed', 'If a task fails, it shows here with why, so you can try again.'],
    };
    const SERVICE = { actor: 'Actor', codes: 'Codes', ai: 'AI', network: 'Network', run: 'Run' };
    const REFRESH_MS = 15000;
    const svg = (p) => `<svg viewBox="0 0 24 24" aria-hidden="true">${p}</svg>`;
    const G = {
        spark: '<path d="M12 3.5l1.9 5.1 5.1 1.9-5.1 1.9-1.9 5.1-1.9-5.1L5 10.5l5.1-1.9z"/><path d="M18.4 15.6l.6 1.6 1.6.6-1.6.6-.6 1.6-.6-1.6-1.6-.6 1.6-.6z"/>',
        code: '<path d="M8.5 7.5L4 12l4.5 4.5M15.5 7.5L20 12l-4.5 4.5M13.5 5.5l-3 13"/>',
        ai: '<rect x="6.5" y="6.5" width="11" height="11" rx="2.5"/><path d="M9.5 3.5v3M14.5 3.5v3M9.5 17.5v3M14.5 17.5v3M3.5 9.5h3M3.5 14.5h3M17.5 9.5h3M17.5 14.5h3"/>',
        key: '<circle cx="8.2" cy="14.8" r="4"/><path d="M11.1 12l8.2-8.2M16.4 6.7l2.3 2.3M14.2 8.9l1.8 1.8"/>',
        desk: '<rect x="3.5" y="4.5" width="17" height="11" rx="2"/><path d="M9 19.5h6M12 15.5v4"/>',
        refresh: '<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4.5v4h-4"/>',
        close: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
        open: '<path d="M14 4h6v6M20 4l-9 9M19 14v5a1.5 1.5 0 0 1-1.5 1.5h-12A1.5 1.5 0 0 1 4 19V7a1.5 1.5 0 0 1 1.5-1.5H10"/>',
    };
    const KIND_GLYPH = { agent_task: 'spark', code_task: 'code', ai_run: 'ai', approval: 'key', desk_session: 'desk' };
    const TONE = { running: 'var(--accent, #3b82f6)', waiting: 'var(--warning, #f5a524)', scheduled: 'var(--text-secondary, #a0a0ab)', done: 'var(--success, #30a46c)', failed: 'var(--live-red, #e5484d)' };

    let el = null, opts = null, data = null, tab = null, timer = null, loading = false, seq = 0;

    function esc(v) { return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
    const isPhone = () => { try { return root.matchMedia('(max-width: 640px)').matches; } catch { return false; } };
    function apiWith(o, path, init = {}) {
        const base = String((o && o.apiBase) || 'https://openvibe.network').replace(/\/+$/, '');
        let cross = true; try { cross = new URL(base).origin !== root.location.origin; } catch { /* */ }
        const headers = { accept: 'application/json', ...(init.body ? { 'content-type': 'application/json' } : {}) };
        const t = o && (typeof o.token === 'function' ? o.token() : o.token);
        if (t) headers.authorization = `Bearer ${t}`;
        return fetch(base + path, { ...init, headers, credentials: cross ? 'omit' : 'include' }).then(async (r) => {
            const body = await r.json().catch(() => ({}));
            if (!r.ok) { const e = new Error(body.detail || body.title || `HTTP ${r.status}`); e.status = r.status; throw e; }
            return body;
        });
    }
    const api = (path, init) => apiWith(opts, path, init);
    function ago(iso) {
        const t = Date.parse(iso || ''); if (!Number.isFinite(t)) return '';
        const s = (Date.now() - t) / 1000;
        if (s < 0) { const m = -s / 60; return m < 60 ? `in ${Math.max(1, Math.round(m))} min` : m < 1440 ? `in ${Math.round(m / 60)} h` : `in ${Math.round(m / 1440)} d`; }
        if (s < 45) return 'just now';
        if (s < 3600) return `${Math.max(1, Math.floor(s / 60))} min ago`;
        if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
        return `${Math.floor(s / 86400)} d ago`;
    }
    const money = (v) => (typeof v === 'number' && v > 0 ? (v < 0.01 ? `$${v.toFixed(4).replace(/0+$/, '')}` : `$${v.toFixed(2)}`) : null);

    function styles() {
        if (document.getElementById('ovac-styles')) return;
        const st = document.createElement('style');
        st.id = 'ovac-styles';
        st.textContent = `
            @keyframes ovac-in { from { transform: translateY(-8px); opacity: 0; } to { transform: none; opacity: 1; } }
            @keyframes ovac-up { from { transform: translateY(48px); opacity: .5; } to { transform: none; opacity: 1; } }
            @keyframes ovac-pulse { 0%, 100% { opacity: 1; } 50% { opacity: .35; } }
            .ovac { position: fixed; z-index: 99999; display: none; flex-direction: column; overflow: hidden; top: var(--ovac-top, 62px); right: max(8px, env(safe-area-inset-right, 0px));
                width: min(420px, calc(100vw - 16px)); max-height: calc(100vh - var(--ovac-top, 62px) - 12px); max-height: calc(100dvh - var(--ovac-top, 62px) - 12px);
                background: var(--bg-elevated, var(--bg-secondary, #1d1f27)); color: var(--text-primary, #ececf1); border: 1px solid var(--border, rgba(255,255,255,.1));
                border-radius: 18px; box-shadow: 0 24px 60px rgba(0,0,0,.45); font-family: inherit; animation: ovac-in .2s cubic-bezier(.2,.8,.2,1); }
            .ovac.open { display: flex; }
            .ovac svg { fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
            .ovac-head { position: relative; display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 14px 10px 8px 16px; }
            .ovac-head h3 { margin: 0; display: flex; align-items: center; gap: 8px; font-size: 17px; font-weight: 750; letter-spacing: -.01em; }
            .ovac-head h3 svg { width: 19px; height: 19px; color: var(--accent-light, var(--accent, #60a5fa)); }
            .ovac-acts { display: flex; gap: 2px; }
            .ovac-acts button { width: 36px; height: 36px; border: 0; border-radius: 10px; background: transparent; color: var(--text-muted, #8b8b96); cursor: pointer; display: grid; place-items: center; }
            .ovac-acts button:hover { background: var(--bg-hover, rgba(255,255,255,.06)); color: var(--text-primary, #ececf1); }
            .ovac-acts button svg { width: 18px; height: 18px; }
            .ovac-acts button.spin svg { animation: ovac-spin .8s linear infinite; }
            @keyframes ovac-spin { to { transform: rotate(360deg); } }
            .ovac-acts [data-act="close"] { display: none; }
            .ovac-tabs { display: flex; overflow-x: auto; scrollbar-width: none; padding: 0 6px; border-bottom: 1px solid var(--border, rgba(255,255,255,.08)); }
            .ovac-tabs::-webkit-scrollbar { display: none; }
            .ovac-tabs button { flex: none; position: relative; display: inline-flex; align-items: center; gap: 6px; min-height: 40px; padding: 0 10px; border: 0; background: transparent;
                color: var(--text-secondary, #b6b6c0); font: inherit; font-size: 13px; font-weight: 600; cursor: pointer; white-space: nowrap; }
            .ovac-tabs button:hover, .ovac-tabs button[aria-selected="true"] { color: var(--text-primary, #ececf1); }
            .ovac-tabs button[aria-selected="true"]::after { content: ''; position: absolute; left: 10px; right: 10px; bottom: 0; height: 2.5px; border-radius: 2px 2px 0 0; background: var(--accent, #3b82f6); }
            .ovac-tabs button:focus-visible { outline: 2px solid var(--accent, #3b82f6); outline-offset: -3px; border-radius: 10px; }
            .ovac-tabs .n { min-width: 18px; padding: 2px 5px; box-sizing: border-box; border-radius: 999px; font-size: 10.5px; font-weight: 750; line-height: 1.2; text-align: center; font-variant-numeric: tabular-nums;
                color: var(--text-primary, #ececf1); background: color-mix(in srgb, var(--accent, #3b82f6) 24%, transparent); }
            .ovac-tabs [data-tab="waiting"] .n { background: color-mix(in srgb, var(--warning, #f5a524) 30%, transparent); }
            .ovac-tabs .n:empty { display: none; }
            .ovac-note { margin: 8px 12px 0; padding: 8px 12px; border-radius: 12px; font-size: 12.5px; line-height: 1.4; color: var(--text-secondary, #b6b6c0); background: color-mix(in srgb, var(--warning, #f5a524) 12%, transparent); }
            .ovac-list { flex: 1; overflow-y: auto; overscroll-behavior: contain; padding: 6px 6px 10px; }
            .ovac-item { display: grid; grid-template-columns: 38px minmax(0, 1fr); gap: 12px; padding: 10px 10px 10px 8px; border-radius: 14px; }
            .ovac-item:hover { background: color-mix(in srgb, var(--text-primary, #ececf1) 4%, transparent); }
            .ovac-glyph { width: 38px; height: 38px; border-radius: 12px; display: grid; place-items: center; color: color-mix(in srgb, var(--ovac-tone) 68%, var(--text-primary, #ececf1)); background: color-mix(in srgb, var(--ovac-tone) 15%, transparent); }
            .ovac-glyph svg { width: 20px; height: 20px; }
            .ovac-body { min-width: 0; }
            .ovac-title { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; font-size: 13.5px; font-weight: 650; line-height: 1.32; color: inherit; text-decoration: none; }
            .ovac-title:hover { text-decoration: underline; text-underline-offset: 2px; }
            .ovac-sum { margin: 2px 0 0; font-size: 12.5px; line-height: 1.42; color: var(--text-secondary, #b6b6c0); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; overflow-wrap: anywhere; }
            .ovac-item[data-bucket="failed"] .ovac-sum { color: color-mix(in srgb, var(--live-red, #e5484d) 55%, var(--text-primary, #ececf1)); }
            .ovac-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 8px; margin-top: 6px; font-size: 11.5px; color: var(--text-muted, #8b8b96); }
            .ovac-state { display: inline-flex; align-items: center; gap: 5px; font-weight: 700; color: color-mix(in srgb, var(--ovac-tone) 55%, var(--text-primary, #ececf1)); }
            .ovac-state::before { content: ''; width: 7px; height: 7px; border-radius: 50%; background: var(--ovac-tone); }
            .ovac-item[data-bucket="running"] .ovac-state::before { animation: ovac-pulse 1.4s ease-in-out infinite; }
            .ovac-cost { font-variant-numeric: tabular-nums; font-weight: 650; color: var(--text-secondary, #b6b6c0); }
            .ovac-btns { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
            .ovac-btns button, .ovac-btns a { display: inline-flex; align-items: center; gap: 6px; min-height: 34px; padding: 0 14px; border-radius: 999px; font: inherit; font-size: 12.5px; font-weight: 700; cursor: pointer; text-decoration: none;
                border: 1px solid var(--border, rgba(255,255,255,.12)); background: transparent; color: var(--text-primary, #ececf1); }
            .ovac-btns .primary { background: var(--accent-strong, var(--accent, #3472d8)); border-color: transparent; color: var(--on-accent-strong, var(--on-accent, #fff)); }
            .ovac-btns button:disabled { opacity: .55; cursor: default; }
            .ovac-btns svg { width: 14px; height: 14px; }
            .ovac-err { margin: 6px 0 0; font-size: 12px; color: color-mix(in srgb, var(--live-red, #e5484d) 60%, var(--text-primary, #ececf1)); }
            .ovac-empty { text-align: center; padding: 44px 24px 52px; color: var(--text-muted, #8b8b96); font-size: 13.5px; line-height: 1.45; }
            .ovac-empty svg { width: 46px; height: 46px; display: block; margin: 0 auto 12px; color: var(--accent, #3b82f6); opacity: .75; stroke-width: 1.4; }
            .ovac-empty b { display: block; margin-bottom: 4px; font-size: 15px; color: var(--text-primary, #ececf1); }
            .ovac-wait { display: flex; justify-content: center; padding: 28px; }
            .ovac-wait span { width: 20px; height: 20px; border-radius: 50%; border: 2px solid var(--border, rgba(255,255,255,.12)); border-top-color: var(--accent, #3b82f6); animation: ovac-spin .8s linear infinite; }
            .ovac-foot { display: flex; justify-content: space-between; align-items: center; gap: 8px; padding: 10px 16px; border-top: 1px solid var(--border, rgba(255,255,255,.08)); font-size: 12px; color: var(--text-muted, #8b8b96); }
            .ovac-foot a { color: var(--accent-light, var(--accent, #60a5fa)); font-weight: 700; text-decoration: none; }
            @media (max-width: 640px) {
                .ovac { top: calc(env(safe-area-inset-top, 0px) + 10px); left: 0; right: 0; bottom: 0; width: auto; max-height: none; border-radius: 22px 22px 0 0; border-bottom: 0;
                    padding-bottom: env(safe-area-inset-bottom, 0px); box-shadow: 0 0 0 100vmax rgba(0,0,0,.5), 0 -12px 40px rgba(0,0,0,.35); animation-name: ovac-up; animation-duration: .28s; }
                .ovac-head { padding-top: 20px; touch-action: none; }
                .ovac-head::before { content: ''; position: absolute; top: 8px; left: 50%; width: 40px; height: 4px; margin-left: -20px; border-radius: 2px; background: var(--border-light, var(--border, rgba(255,255,255,.22))); }
                .ovac-acts [data-act="close"] { display: grid; }
                .ovac-acts button { width: 40px; height: 40px; }
            }
            html.ovac-sheet-open, html.ovac-sheet-open body { overflow: hidden; }
            .ovac-mounted { display: flex; flex-direction: column; min-height: 0; color: var(--text-primary, #ececf1); }
            .ovac-mounted .ovac-list { padding: 4px 6px 10px; }
            .ovac-mounted svg { fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
            .ovac-group { display: flex; align-items: center; gap: 8px; margin: 10px 10px 4px; font-size: 11px; font-weight: 800; letter-spacing: .07em; text-transform: uppercase; color: var(--text-muted, #8b8b96); }
            .ovac-group span { font-variant-numeric: tabular-nums; letter-spacing: 0; color: var(--text-secondary, #b6b6c0); }
            .ovac-group[data-bucket="waiting"] { color: color-mix(in srgb, var(--warning, #f5a524) 70%, var(--text-primary, #ececf1)); }
            @media (prefers-reduced-motion: reduce) { .ovac { animation: none; } .ovac-item[data-bucket="running"] .ovac-state::before { animation: none; } }
        `;
        document.head.appendChild(st);
    }

    function build() {
        styles();
        el = document.createElement('div');
        el.className = 'ovac';
        el.setAttribute('role', 'dialog');
        el.setAttribute('aria-label', 'Agents');
        el.hidden = true;
        el.innerHTML = `
            <div class="ovac-head"><h3>${svg(G.spark)}Agents</h3>
                <div class="ovac-acts"><button type="button" data-act="refresh" title="Refresh" aria-label="Refresh">${svg(G.refresh)}</button><button type="button" data-act="close" title="Close" aria-label="Close">${svg(G.close)}</button></div></div>
            <div class="ovac-tabs" role="tablist" aria-label="Agents">${BUCKETS.map(([id]) => `<button type="button" role="tab" data-tab="${id}" aria-selected="false" tabindex="-1">${SHORT[id]}<span class="n" data-n="${id}"></span></button>`).join('')}</div>
            <div class="ovac-note" hidden></div>
            <div class="ovac-list" role="tabpanel" aria-live="polite"></div>
            <div class="ovac-foot"><span data-role="when"></span><a href="https://openvibe.actor/">Give an agent a task →</a></div>`;
        document.body.appendChild(el);
        const tabs = [...el.querySelectorAll('[role="tab"]')];
        const pick = (b, focus) => { setTab(b.dataset.tab); if (focus) b.focus(); };
        tabs.forEach((b) => b.addEventListener('click', () => pick(b)));
        el.querySelector('.ovac-tabs').addEventListener('keydown', (e) => {
            const i = tabs.indexOf(document.activeElement); if (i < 0) return;
            const j = e.key === 'ArrowRight' ? (i + 1) % tabs.length : e.key === 'ArrowLeft' ? (i - 1 + tabs.length) % tabs.length : e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : -1;
            if (j >= 0) { e.preventDefault(); pick(tabs[j], true); }
        });
        el.querySelector('[data-act="refresh"]').addEventListener('click', () => load());
        el.querySelector('[data-act="close"]').addEventListener('click', () => close());
        el.querySelector('.ovac-list').addEventListener('click', (e) => {
            const b = e.target.closest('button[data-do]'); if (!b) return;
            decide(b.closest('.ovac-item'), b.dataset.do, b);
        });
        document.addEventListener('click', (e) => { if (isOpen() && !el.contains(e.target) && !(opts && opts.anchor && opts.anchor.contains(e.target))) close(); });
        document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && isOpen()) close(); });
        // Phones: the sheet's head drags down to close.
        const head = el.querySelector('.ovac-head');
        let y0 = null, dy = 0;
        head.addEventListener('pointerdown', (e) => { if (!isPhone() || e.pointerType === 'mouse' || e.target.closest('button')) return; y0 = e.clientY; dy = 0; el.style.transition = 'none'; });
        head.addEventListener('pointermove', (e) => { if (y0 == null) return; dy = Math.max(0, e.clientY - y0); el.style.transform = `translateY(${dy}px)`; });
        const end = () => { if (y0 == null) return; y0 = null; el.style.transition = 'transform .2s ease'; if (dy > 110) close(); else el.style.transform = ''; setTimeout(() => { el.style.transition = ''; }, 220); };
        head.addEventListener('pointerup', end); head.addEventListener('pointercancel', end);
        if (root.OpenVibePanels) { try { root.OpenVibePanels.register({ el, openClass: 'open', id: 'action-center', close: () => close() }); } catch { /* */ } }
    }

    function setTab(id) {
        tab = id;
        el.querySelectorAll('[role="tab"]').forEach((b) => { const on = b.dataset.tab === id; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; });
        el.querySelector('.ovac-list').setAttribute('aria-label', (BUCKETS.find(([b]) => b === id) || ['', ''])[1]);
        paint();
    }

    function itemHTML(it) {
        const tone = TONE[it.bucket] || TONE.running;
        const meta = [
            `<span class="ovac-state">${esc(it.bucket === 'waiting' ? 'Needs you' : SHORT[it.bucket] || it.state)}</span>`,
            `<span>${esc([SERVICE[it.service] || it.service, it.agent].filter(Boolean).join(' · '))}</span>`,
            money(it.cost_usd) ? `<span class="ovac-cost">${money(it.cost_usd)}</span>` : '',
            typeof it.steps === 'number' && it.steps > 0 ? `<span>${it.steps} step${it.steps === 1 ? '' : 's'}</span>` : '',
            `<span>${esc(it.bucket === 'scheduled' && it.next_run_at ? `runs ${ago(it.next_run_at)}` : ago(it.updated_at))}</span>`,
        ].join('');
        const decides = it.bucket === 'waiting' && it.actions.includes('approve');
        const btns = decides
            ? `<div class="ovac-btns"><button type="button" class="primary" data-do="approve">Approve</button><button type="button" data-do="decline">Decline</button><a href="${esc(it.href)}">${svg(G.open)}Details</a></div>`
            : it.bucket === 'failed' && it.actions.includes('retry') ? `<div class="ovac-btns"><a href="${esc(it.href)}">${svg(G.refresh)}Try again</a></div>` : '';
        const text = it.bucket === 'failed' && it.error ? it.error : it.summary;
        return `<article class="ovac-item" data-bucket="${esc(it.bucket)}" data-service="${esc(it.service)}" data-id="${esc(it.id)}" style="--ovac-tone:${tone}">
            <span class="ovac-glyph">${svg(G[KIND_GLYPH[it.kind]] || G.spark)}</span>
            <div class="ovac-body"><a class="ovac-title" href="${esc(it.href)}">${esc(it.title)}</a>${text ? `<p class="ovac-sum">${esc(text)}</p>` : ''}
            <div class="ovac-meta">${meta}</div>${btns}</div></article>`;
    }

    function paint() {
        if (!el) return;
        const list = el.querySelector('.ovac-list');
        const note = el.querySelector('.ovac-note');
        if (!data) { list.innerHTML = '<div class="ovac-wait"><span></span></div>'; note.hidden = true; return; }
        if (data.error) {
            list.innerHTML = `<div class="ovac-empty">${svg(G.spark)}<b>${data.error.status === 401 ? 'Sign in to see your agents' : 'Could not load your agents'}</b>${data.error.status === 401 ? '' : 'Check your connection and try again.'}</div>`;
            note.hidden = true;
            return;
        }
        for (const [id] of BUCKETS) {
            const n = data.counts[id] || 0;
            const span = el.querySelector(`[data-n="${id}"]`);
            span.textContent = n ? (n > 99 ? '99+' : String(n)) : '';
            span.parentNode.setAttribute('aria-label', n ? `${SHORT[id]}, ${n}` : SHORT[id]);
        }
        const missing = Object.entries(data.sources || {}).filter(([, s]) => s === 'timeout' || s === 'unavailable').map(([k]) => SERVICE[k] || k);
        note.hidden = !missing.length;
        note.textContent = missing.length ? `${missing.join(' and ')} did not answer, so some items may be missing. Refresh to try again.` : '';
        const items = data.buckets[tab] || [];
        if (!items.length) {
            const [t, s] = EMPTY[tab] || EMPTY.running;
            list.innerHTML = `<div class="ovac-empty">${svg(G.spark)}<b>${esc(t)}</b>${esc(s)}</div>`;
        } else list.innerHTML = items.map(itemHTML).join('');
        const when = el.querySelector('[data-role="when"]');
        when.textContent = data.generated_at ? `Updated ${ago(data.generated_at)}` : '';
    }

    async function load({ quiet = false } = {}) {
        if (loading) return;
        loading = true;
        const my = ++seq;
        const btn = el && el.querySelector('[data-act="refresh"]');
        if (btn) btn.classList.add('spin');
        if (!quiet && !data) paint();
        try {
            const doc = await api('/api/v1/me/actions');
            if (my !== seq) return;
            data = doc;
            // First open: the tab with something in it, waiting first.
            if (!tab) tab = ['waiting', 'running', 'scheduled', 'done', 'failed'].find((b) => (doc.counts[b] || 0) > 0) || 'running';
            setTab(tab);
        } catch (e) {
            if (my !== seq) return;
            data = { error: e };
            if (!tab) setTab('running'); else paint();
        } finally {
            loading = false;
            if (btn) btn.classList.remove('spin');
            schedule();
        }
    }
    function schedule() {
        clearTimeout(timer);
        if (isOpen() && data && !data.error && (data.counts.running || 0) > 0) timer = setTimeout(() => load({ quiet: true }), REFRESH_MS);
    }

    async function decide(item, what, btn, call = api, reload = () => load({ quiet: true })) {
        if (!item || (what !== 'approve' && what !== 'decline')) return;
        item.querySelectorAll('.ovac-btns button').forEach((b) => { b.disabled = true; });
        const old = item.querySelector('.ovac-err'); if (old) old.remove();
        try {
            await call(`/api/v1/me/actions/${encodeURIComponent(item.dataset.service)}/${encodeURIComponent(item.dataset.id)}/${what}`, { method: 'POST', body: '{}' });
            btn.textContent = what === 'approve' ? 'Approved' : 'Declined';
            setTimeout(reload, 600);
        } catch (e) {
            item.querySelectorAll('.ovac-btns button').forEach((b) => { b.disabled = false; });
            item.querySelector('.ovac-body').insertAdjacentHTML('beforeend', `<p class="ovac-err" role="alert">${esc(e.message || 'That did not work. Try again.')}</p>`);
        }
    }

    function isOpen() { return !!(el && el.classList.contains('open')); }
    function open(o) {
        opts = { ...(opts || {}), ...(o || {}) };
        if (!el) build();
        if (root.OpenVibePanels) { try { root.OpenVibePanels.closeAll(el); } catch { /* */ } }
        let bottom = 56;
        try {
            const bar = opts.anchor && opts.anchor.closest && opts.anchor.closest('nav, header, .navbar');
            bottom = (bar || opts.anchor || null) ? (bar || opts.anchor).getBoundingClientRect().bottom : 56;
        } catch { /* no layout: under a 56 px bar */ }
        el.style.setProperty('--ovac-top', `${Math.max(8, Math.round(bottom) + 6)}px`);
        el.hidden = false;
        el.setAttribute('aria-modal', 'true');
        el.classList.add('open');
        el.style.transform = '';
        document.documentElement.classList.toggle('ovac-sheet-open', isPhone());
        if (opts.anchor) { opts.anchor.setAttribute('aria-expanded', 'true'); opts.anchor.classList.add('open'); }
        load();
        setTimeout(() => { try { el.querySelector('[role="tab"][aria-selected="true"]')?.focus({ preventScroll: true }); } catch { /* */ } }, 0);
    }
    function close() {
        if (!el) return;
        const inside = el.contains(document.activeElement);
        el.classList.remove('open');
        el.removeAttribute('aria-modal');
        el.hidden = true;
        el.style.transform = '';
        clearTimeout(timer);
        document.documentElement.classList.remove('ovac-sheet-open');
        if (opts && opts.anchor) { opts.anchor.setAttribute('aria-expanded', 'false'); opts.anchor.classList.remove('open'); if (inside) { try { opts.anchor.focus({ preventScroll: true }); } catch { /* */ } } }
    }
    function toggle(o) { if (isOpen()) close(); else open(o); }

    /**
     * A list of some buckets in someone else's container (the Dock's Agent tab): waiting first, then running, each
     * bucket under a small heading when there is more than one. Its own data, timer and errors; the popover's are
     * untouched. onCounts(counts) hears every answer, so the Dock's tab and pill can follow it.
     */
    function mount(container, o = {}) {
        styles();
        const mo = { ...o };
        const want = Array.isArray(mo.buckets) && mo.buckets.length ? mo.buckets.filter((b) => SHORT[b]) : ['waiting', 'running'];
        const call = (path, init) => apiWith(mo, path, init);
        let doc = null, t = 0, gone = false, busy = false;
        container.classList.add('ovac-mounted');
        container.innerHTML = '<div class="ovac-list" aria-live="polite"><div class="ovac-wait"><span></span></div></div>';
        const list = container.firstChild;
        const draw = () => {
            if (gone) return;
            if (doc && doc.error) {
                list.innerHTML = `<div class="ovac-empty">${svg(G.spark)}<b>${doc.error.status === 401 ? 'Sign in to see your agents' : 'Could not load your agents'}</b>${doc.error.status === 401 ? '' : 'Check your connection and try again.'}</div>`;
                return;
            }
            if (!doc) return;
            const groups = want.map((b) => [b, (doc.buckets && doc.buckets[b]) || []]).filter(([, items]) => items.length);
            if (!groups.length) {
                const [h, p] = mo.empty || ['Nothing is running', 'When an agent works for you, it shows here with its steps, and anything it asks you shows first.'];
                list.innerHTML = `<div class="ovac-empty">${svg(G.spark)}<b>${esc(h)}</b>${esc(p)}</div>`;
                return;
            }
            list.innerHTML = groups.map(([b, items]) => (groups.length > 1 ? `<h4 class="ovac-group" data-bucket="${b}">${esc(b === 'waiting' ? 'Needs you' : SHORT[b])}<span>${items.length}</span></h4>` : '')
                + items.map(itemHTML).join('')).join('');
        };
        const refresh = async () => {
            if (gone || busy) return;
            busy = true; clearTimeout(t);
            try { doc = await call('/api/v1/me/actions'); } catch (e) { doc = { error: e }; }
            busy = false;
            if (gone) return;
            draw();
            if (doc && !doc.error && typeof mo.onCounts === 'function') { try { mo.onCounts(doc.counts || {}); } catch { /* */ } }
            if (doc && !doc.error && (doc.counts.running || 0) > 0) t = setTimeout(refresh, REFRESH_MS);
        };
        list.addEventListener('click', (e) => {
            const b = e.target.closest('button[data-do]'); if (!b) return;
            decide(b.closest('.ovac-item'), b.dataset.do, b, call, refresh);
        });
        refresh();
        return { refresh, destroy() { gone = true; clearTimeout(t); container.classList.remove('ovac-mounted'); container.innerHTML = ''; } };
    }

    root.OpenVibeActionCenter = { open, close, toggle, isOpen, mount, _state: () => ({ data, tab }) };
})(typeof window !== 'undefined' ? window : globalThis);
