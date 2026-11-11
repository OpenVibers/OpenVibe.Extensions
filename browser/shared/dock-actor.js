// ═══════════════════════════════════════════════════════════════
// OpenVibe — the Dock's Actor block (Actor v3 plan, stage A3; redrawn 2026-11-10)
//
// Your Actor at the top of the Dock's Agents tab, on every OpenVibe site. dock.js loads this file the first time that
// tab opens:
//   OpenVibeDockActor.mount(container, { token, base, active })  → { refresh(), destroy() }
//
// It reads OpenVibe.Actor's GET /api/v1/me/actor with the person's Network token (scope actor.me.read); the answers,
// pause, resume and tell are POSTs with actor.me.write. On a site every call goes through Network's same-origin relay
// (/api/frame/actor…) because every site's connect-src allows openvibe.network and refuses openvibe.actor; `base`
// reaches Actor itself in a test, and `frameBase` names the relay. Nothing is asked without a token.
//
// The look (the owner, 2026-11-10: "more intuitive, minimalist, elegant"): one row and one line to type in.
//   - Who: the face with a ring in the colour of its state, the name, and one quiet line (the state, today's spend
//     against the cap). The row is the way to the Actor's page; there is no separate "Open".
//   - One action beside it, the one that fits: "Resume" in the accent when it is paused, a quiet pause when it runs.
//   - What it does, only when there is something to say: the step it is on (a soft pulse), what it looks at, the
//     steps before it, and what comes next, as a short line of dots. A paused Actor shows none of this: the row says it.
//   - What it asks you, with its own buttons, in the warning tone (a lean and a glow, never a bar).
//   - One field to tell it something, with send inside the field.
// A person with no Actor sees nothing here. Everything people or the Actor wrote is set as text, never markup. The
// block is built once: a refresh repaints what changed and never touches the line being typed. Every control is 44 px.
// ═══════════════════════════════════════════════════════════════
(function (root) {
    'use strict';
    if (typeof document === 'undefined' || root.OpenVibeDockActor) return;

    const POLL_MS = 15000;
    const ACTOR_REV = { 'ov-window.js': 'd3d8f9e3e6d2', 'agent-sheet.js': '8d150490ad64' };
    const SCRIPT_BASE = document.currentScript && document.currentScript.src ? new URL('.', document.currentScript.src).href : '/shared/';
    const STATE = { working: 'Working', resting: 'Resting', paused: 'Paused', waiting: 'Waiting for you' };
    // The lines Actor sends as "the current step" when there is none: the state already says them.
    const NOT_A_STEP = /^(paused|resting\b.*)\.?$/i;
    const ICON = {
        play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8.5 5.6v12.8a.9.9 0 0 0 1.37.77l10.3-6.4a.9.9 0 0 0 0-1.54l-10.3-6.4a.9.9 0 0 0-1.37.77z" fill="currentColor"/></svg>',
        pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6.5" y="5" width="4" height="14" rx="1.3" fill="currentColor"/><rect x="13.5" y="5" width="4" height="14" rx="1.3" fill="currentColor"/></svg>',
        go: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.5 6.5 15 12l-5.5 5.5"/></svg>',
        send: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5.5M6 11l6-6 6 6"/></svg>',
        ask: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.2 9.3a2.9 2.9 0 1 1 4.4 2.5c-.9.6-1.6 1.2-1.6 2.3"/><path d="M12 17.6v.1"/></svg>',
        past: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12a8 8 0 1 0 2.6-5.9"/><path d="M4 5v3.6h3.6"/><path d="M12 8.2V12l2.6 1.7"/></svg>',
    };

    function styles(doc) {
        const d = doc || document;
        if (!d || d.getElementById('ovdac-styles')) return;
        const st = d.createElement('style');
        st.id = 'ovdac-styles';
        st.textContent = `
            .ovdac { display: none; flex: none; padding: 12px 12px 8px; border-bottom: 1px solid var(--border, rgba(255,255,255,.08));
                --ovdac-ok: var(--success, #22c55e); --ovdac-warn: var(--warning, #f5a524); --ovdac-ink: var(--text-primary, #ececf1); }
            .ovdac.on { display: grid; grid-template-columns: minmax(0, 1fr); gap: 10px; }
            .ovdac [hidden] { display: none !important; }
            .ovdac svg { width: 18px; height: 18px; flex: none; }
            .ovdac .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }

            .ovdac-head { display: flex; align-items: center; gap: 8px; min-width: 0; }
            .ovdac-id { flex: 1; min-width: 0; display: flex; align-items: center; gap: 12px; min-height: 48px; padding: 2px 8px 2px 4px; margin-left: -4px; border-radius: 14px;
                color: inherit; text-decoration: none; transition: background .15s ease; }
            .ovdac-id:hover { background: color-mix(in srgb, var(--ovdac-ink) 5%, transparent); }
            .ovdac-id:focus-visible, .ovdac-go:focus-visible, .ovdac-btn:focus-visible, .ovdac-link:focus-visible, .ovdac-send:focus-visible { outline: 2px solid var(--accent-light, var(--accent, #3b82f6)); outline-offset: 2px; }
            .ovdac-face { position: relative; flex: none; width: 40px; height: 40px; border-radius: 50%; display: grid; place-items: center;
                background: var(--accent, #3b82f6); color: var(--on-accent, #fff); font-weight: 800; font-size: 16px; transition: filter .2s ease, opacity .2s ease; }
            .ovdac-face img { width: 100%; height: 100%; border-radius: 50%; object-fit: cover; }
            .ovdac-face::after { content: ''; position: absolute; inset: -4px; border-radius: 50%; border: 2px solid transparent; transition: border-color .2s ease; }
            .ovdac[data-state="working"] .ovdac-face::after { border-color: var(--ovdac-ok); animation: ovdac-ring 2.4s ease-in-out infinite; }
            .ovdac[data-state="waiting"] .ovdac-face::after { border-color: var(--ovdac-warn); }
            .ovdac[data-state="paused"] .ovdac-face { filter: saturate(.5); opacity: .78; }
            .ovdac-who { min-width: 0; display: grid; gap: 1px; }
            .ovdac-name { display: flex; align-items: center; gap: 1px; min-width: 0; font-weight: 750; font-size: 15px; line-height: 1.25; color: var(--ovdac-ink); }
            .ovdac-name span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
            .ovdac-name svg { width: 16px; height: 16px; color: var(--text-muted, #8b8b96); transition: transform .18s ease, color .18s ease; }
            .ovdac-id:hover .ovdac-name svg { transform: translateX(2px); color: var(--text-secondary, #b6b6c0); }
            .ovdac-line { display: flex; gap: 6px; min-width: 0; font-size: 12.5px; line-height: 1.35; color: var(--text-muted, #8b8b96); white-space: nowrap; }
            .ovdac-state { flex: none; font-weight: 650; color: var(--text-secondary, #b6b6c0); }
            .ovdac[data-state="working"] .ovdac-state { color: color-mix(in srgb, var(--ovdac-ok) 72%, var(--ovdac-ink)); }
            .ovdac[data-state="waiting"] .ovdac-state { color: color-mix(in srgb, var(--ovdac-warn) 76%, var(--ovdac-ink)); }
            .ovdac-spend { min-width: 0; overflow: hidden; text-overflow: ellipsis; font-variant-numeric: tabular-nums; }
            .ovdac-spend::before { content: '·'; margin-right: 6px; }

            .ovdac-go { flex: none; display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-width: 44px; height: 44px; padding: 0; border-radius: 999px;
                border: 1px solid var(--border, rgba(255,255,255,.14)); background: transparent; color: var(--text-secondary, #b6b6c0);
                font: inherit; font-size: 13.5px; font-weight: 700; cursor: pointer; white-space: nowrap; transition: background .15s ease, color .15s ease, transform .12s ease, box-shadow .2s ease; }
            .ovdac-go:hover { color: var(--ovdac-ink); background: color-mix(in srgb, var(--ovdac-ink) 7%, transparent); }
            .ovdac-go.is-main { padding: 0 18px 0 13px; border-color: transparent; background: var(--accent-strong, var(--accent, #2563eb)); color: var(--on-accent-strong, #fff);
                box-shadow: 0 8px 20px -10px var(--accent, #3b82f6); }
            .ovdac-go.is-main:hover { background: var(--accent-strong, var(--accent, #2563eb)); color: var(--on-accent-strong, #fff); filter: brightness(1.08); }
            .ovdac-go:active, .ovdac-btn:active, .ovdac-send:active { transform: scale(.96); }
            .ovdac .is-busy { opacity: .6; pointer-events: none; animation: ovdac-pulse 1.1s ease-in-out infinite; }

            .ovdac-rail { list-style: none; margin: 0; padding: 2px 4px 2px 6px; display: grid; gap: 9px; }
            .ovdac-rail li { position: relative; padding-left: 22px; font-size: 12.5px; line-height: 1.4; color: var(--text-secondary, #b6b6c0); overflow-wrap: anywhere; }
            .ovdac-rail li::before { content: ''; position: absolute; left: 1px; top: .36em; width: 6px; height: 6px; border-radius: 50%; border: 1.5px solid var(--text-muted, #8b8b96); }
            .ovdac-rail li:not(:last-child)::after { content: ''; position: absolute; left: 5px; top: calc(.36em + 13px); bottom: -8px; width: 1px;
                background: color-mix(in srgb, var(--ovdac-ink) 14%, transparent); }
            .ovdac-rail .is-live { font-size: 13.5px; font-weight: 650; color: var(--ovdac-ink); }
            .ovdac-rail .is-live::before { border-color: var(--ovdac-ok); background: var(--ovdac-ok); box-shadow: 0 0 0 4px color-mix(in srgb, var(--ovdac-ok) 20%, transparent); animation: ovdac-pulse 1.8s ease-in-out infinite; }
            .ovdac-rail .is-next { color: var(--text-muted, #8b8b96); }
            .ovdac-rail .is-next::before { border-style: dashed; }
            .ovdac-rail b { font-weight: 650; }
            .ovdac-look { display: block; margin-top: 2px; font-size: 12px; font-weight: 400; color: var(--text-muted, #8b8b96); }

            .ovdac-ask { display: grid; gap: 10px; padding: 12px 14px 10px; border-radius: 16px;
                background: linear-gradient(135deg, color-mix(in srgb, var(--ovdac-warn) 15%, transparent), color-mix(in srgb, var(--ovdac-warn) 5%, transparent) 62%);
                box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--ovdac-warn) 22%, transparent), 0 12px 28px -20px var(--ovdac-warn); }
            .ovdac-ask-k { display: flex; align-items: center; gap: 8px; font-size: 12px; font-weight: 700; color: color-mix(in srgb, var(--ovdac-warn) 74%, var(--ovdac-ink)); }
            .ovdac-ask-k i { display: grid; place-items: center; width: 24px; height: 24px; border-radius: 50%; background: color-mix(in srgb, var(--ovdac-warn) 24%, transparent); }
            .ovdac-ask-k svg { width: 16px; height: 16px; }
            .ovdac-ask p { margin: 0; font-size: 14px; line-height: 1.45; color: var(--ovdac-ink); overflow-wrap: anywhere; }
            .ovdac-ask .row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
            .ovdac-btn { display: inline-flex; align-items: center; justify-content: center; min-height: 44px; padding: 0 16px; border-radius: 999px;
                border: 1px solid color-mix(in srgb, var(--ovdac-ink) 18%, transparent); background: transparent; color: var(--ovdac-ink);
                font: inherit; font-size: 13.5px; font-weight: 700; cursor: pointer; white-space: nowrap; transition: background .15s ease, transform .12s ease; }
            .ovdac-btn:hover { background: color-mix(in srgb, var(--ovdac-ink) 8%, transparent); }
            .ovdac-btn.is-yes { background: var(--accent-strong, var(--accent, #2563eb)); border-color: transparent; color: var(--on-accent-strong, #fff); }
            .ovdac-btn.is-yes:hover { background: var(--accent-strong, var(--accent, #2563eb)); filter: brightness(1.08); }
            .ovdac-btn.is-quiet { padding: 0 10px; border-color: transparent; color: var(--text-secondary, #b6b6c0); font-weight: 650; }
            .ovdac-more { display: inline-flex; align-items: center; min-height: 44px; margin: -8px 0 -8px; font-size: 12.5px; color: var(--text-secondary, #b6b6c0); text-decoration: underline; text-underline-offset: 3px; }

            .ovdac-tell { position: relative; display: flex; }
            .ovdac-tell input { flex: 1; min-width: 0; height: 52px; box-sizing: border-box; padding: 0 58px 0 18px; border-radius: 26px;
                border: 1px solid var(--border, rgba(255,255,255,.14)); background: var(--bg-input, color-mix(in srgb, var(--ovdac-ink) 4%, transparent));
                color: var(--ovdac-ink); font: inherit; font-size: 14.5px; outline: none; transition: border-color .15s ease, box-shadow .15s ease; }
            .ovdac-tell input::placeholder { color: var(--text-muted, #8b8b96); }
            .ovdac-tell input:focus { border-color: color-mix(in srgb, var(--accent, #3b82f6) 62%, transparent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent, #3b82f6) 18%, transparent); }
            .ovdac-send { position: absolute; right: 4px; top: 4px; display: grid; place-items: center; width: 44px; height: 44px; padding: 0; border: 0; border-radius: 50%;
                background: color-mix(in srgb, var(--ovdac-ink) 8%, transparent); color: var(--text-muted, #8b8b96); cursor: pointer;
                transition: background .18s ease, color .18s ease, transform .12s ease, box-shadow .2s ease; }
            .ovdac-tell.has-text .ovdac-send { background: var(--accent-strong, var(--accent, #2563eb)); color: var(--on-accent-strong, #fff); box-shadow: 0 6px 16px -8px var(--accent, #3b82f6); }

            .ovdac-foot { display: flex; align-items: center; gap: 10px; min-width: 0; margin-top: -6px; }
            .ovdac-link { flex: none; display: inline-flex; align-items: center; gap: 6px; min-height: 44px; padding: 0 8px; margin-left: -8px; border: 0; border-radius: 10px;
                background: none; color: var(--text-muted, #8b8b96); font: inherit; font-size: 12.5px; font-weight: 650; cursor: pointer; transition: color .15s ease; }
            .ovdac-link:hover, .ovdac-link[aria-expanded="true"] { color: var(--ovdac-ink); }
            .ovdac-link svg { width: 15px; height: 15px; }
            .ovdac-note { flex: 1; min-width: 0; text-align: right; font-size: 12.5px; line-height: 1.35; color: var(--text-muted, #8b8b96); overflow-wrap: anywhere; }
            .ovdac-note.is-ok { color: color-mix(in srgb, var(--ovdac-ok) 70%, var(--ovdac-ink)); }
            .ovdac-note.is-bad { color: color-mix(in srgb, var(--danger, #ef4444) 74%, var(--ovdac-ink)); }
            .ovdac-hist { list-style: none; margin: -4px 0 4px; padding: 0; display: grid; gap: 6px; font-size: 12.5px; line-height: 1.4; color: var(--text-secondary, #b6b6c0); overflow-wrap: anywhere; }
            .ovdac-hist b { margin-right: 6px; font-weight: 650; color: var(--text-muted, #8b8b96); }

            @keyframes ovdac-pulse { 50% { opacity: .45; } }
            @keyframes ovdac-ring { 50% { opacity: .35; transform: scale(1.06); } }
            @media (pointer: coarse) { .ovdac-tell input { font-size: 16px; } }
            html[data-ov-motion=off] .ovdac *, html[data-ov-motion=off] .ovdac *::before, html[data-ov-motion=off] .ovdac *::after { animation: none !important; transition: none !important; }
        `;
        (d.head || d.documentElement).appendChild(st);
    }

    const money = (n) => { const v = Number(n) || 0; return v < 0.01 && v > 0 ? `$${v.toFixed(3)}` : `$${v.toFixed(2)}`; };
    /** "in 40 min", "in 3 h", "tomorrow": when the next goal is due; '' when unknown or already due. */
    function due(at, now = Date.now()) {
        const t = Date.parse(at || '');
        if (!Number.isFinite(t)) return '';
        const min = Math.round((t - now) / 60000);
        if (min < 1) return '';
        if (min < 60) return `in ${min} min`;
        if (min < 24 * 60) return `in ${Math.round(min / 60)} h`;
        return min < 48 * 60 ? 'tomorrow' : `in ${Math.round(min / 1440)} days`;
    }

    function mount(container, opts = {}) {
        const d = container.ownerDocument || document;
        styles(d);
        const o = { ...opts };
        const h = (tag, cls, text) => { const n = d.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
        const icon = (name) => { const t = d.createElement('template'); t.innerHTML = ICON[name]; return t.content.firstChild; };
        const tip = (n, text) => { if (root.OVTip) n.setAttribute('data-ov-tip', text); else n.title = text; };
        let gone = false, timer = 0, busy = false, shown = false, last = '', actor = null, noteTimer = 0;
        container.replaceChildren();
        container.classList.add('ovdac');
        // Network's frame relay on a site; an explicit base reaches Actor itself (a test).
        const direct = o.base ? String(o.base).replace(/\/+$/, '') : '';
        const frameBase = String(o.frameBase || 'https://openvibe.network/api/frame').replace(/\/+$/, '');
        const endpoint = (path) => (direct ? direct + '/api/v1/me/actor' + path : frameBase + '/actor' + path);
        // The way to the Actor's page is a navigation, never a fetch: Actor's own site, wherever the API is.
        const openBase = direct || 'https://openvibe.actor';

        async function api(path, init = {}) {
            const t = typeof o.token === 'function' ? await o.token() : o.token;
            if (!t) throw Object.assign(new Error('Sign in to use your Actor'), { status: 401 });
            const headers = { accept: 'application/json', ...(init.json ? { 'content-type': 'application/json' } : {}), authorization: `Bearer ${t}` };
            const r = await fetch(endpoint(path), { method: init.method || 'GET', headers, credentials: 'omit', body: init.json ? JSON.stringify(init.body || {}) : undefined });
            const b = await r.json().catch(() => ({}));
            if (!r.ok) throw Object.assign(new Error(b.detail || `HTTP ${r.status}`), { status: r.status });
            return b;
        }

        function stateOf(a) {
            if (Array.isArray(a.asks) && a.asks.length) return 'waiting';
            return STATE[a.status] ? a.status : 'paused';
        }

        // ── The parts, built once ────────────────────────────────────────────────────────────────────────────────
        const head = h('div', 'ovdac-head');
        const id = h('a', 'ovdac-id'); id.href = openBase + '/you'; id.target = '_blank'; id.rel = 'noopener';
        function loadScript(file, ready) {
            if (ready()) return Promise.resolve(true);
            return new Promise((resolve) => {
                const sid = `ovdac-${file}`;
                let script = d.getElementById(sid);
                if (!script) { script = d.createElement('script'); script.id = sid; script.src = SCRIPT_BASE + file + (ACTOR_REV[file] ? `?v=${ACTOR_REV[file]}` : ''); script.async = true; d.head.appendChild(script); }
                script.addEventListener('load', () => resolve(!!ready()), { once: true });
                script.addEventListener('error', () => resolve(false), { once: true });
            });
        }
        // The row opens its sheet (agent-sheet.js in the one window: now, asks, work, schedule, memory, computer); the
        // Actor's page is the sheet's "Open". A modified click, or a sheet that cannot load, goes to the page as before.
        id.addEventListener('click', async (e) => {
            if (!actor || !(actor.agent_id || actor.id) || e.metaKey || e.ctrlKey || e.shiftKey || e.button) return;
            e.preventDefault();
            const ok = (await Promise.all([loadScript('ov-window.js', () => !!root.OVWindow), loadScript('agent-sheet.js', () => !!root.OVAgentSheet)])).every(Boolean);
            if (!ok) { d.defaultView.open(id.href, '_blank', 'noopener'); return; }
            root.OVAgentSheet.open({ kind: 'actor', id: actor.agent_id || actor.id, name: actor.name || 'Your Actor', token: o.token,
                frameBase: o.frameBase, base: direct || null, from: id, openHref: openBase + '/you' });
        });
        const face = h('span', 'ovdac-face');
        const who = h('span', 'ovdac-who');
        const name = h('span', 'ovdac-name'); const nameText = h('span'); name.append(nameText, icon('go'));
        const line = h('span', 'ovdac-line'); const stateText = h('span', 'ovdac-state'); const spend = h('span', 'ovdac-spend'); line.append(stateText, spend);
        who.append(name, line); id.append(face, who);
        const go = h('button', 'ovdac-go'); go.type = 'button';
        go.addEventListener('click', () => {
            if (!actor) return;
            const paused = actor.status === 'paused';
            act(paused ? '/resume' : '/pause', {}, go, paused ? 'Resumed.' : 'Paused.');
        });
        head.append(id, go);

        const rail = h('ul', 'ovdac-rail'); rail.hidden = true;
        const askBox = h('div', 'ovdac-ask'); askBox.hidden = true;

        const form = h('form', 'ovdac-tell');
        const input = h('input'); input.type = 'text'; input.maxLength = 2000; input.autocomplete = 'off'; input.enterKeyHint = 'send';
        input.placeholder = 'Tell your Actor something'; input.setAttribute('aria-label', 'Tell your Actor something');
        const send = h('button', 'ovdac-send'); send.type = 'submit'; send.setAttribute('aria-label', 'Send'); send.append(icon('send'));
        input.addEventListener('input', () => form.classList.toggle('has-text', !!input.value.trim()));
        form.append(input, send);
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            const text = input.value.trim();
            if (!text) { input.focus(); return; }
            const paused = actor && actor.status === 'paused';
            act('/tell', { text }, send, paused ? 'Sent. Your Actor reads it once you resume it.' : 'Sent. Your Actor reads it at its next step.')
                .then((ok) => { if (ok) { input.value = ''; form.classList.remove('has-text'); } });
        });

        const foot = h('div', 'ovdac-foot');
        const past = h('button', 'ovdac-link'); past.type = 'button'; past.setAttribute('aria-expanded', 'false'); past.append(icon('past'), d.createTextNode('Recent history'));
        const note = h('div', 'ovdac-note'); note.setAttribute('role', 'status'); note.setAttribute('aria-live', 'polite');
        const hist = h('ul', 'ovdac-hist'); hist.hidden = true;
        foot.append(past, note);
        // The button that opens the list closes it.
        past.addEventListener('click', async () => {
            if (!hist.hidden) { hist.hidden = true; past.setAttribute('aria-expanded', 'false'); return; }
            past.disabled = true; past.classList.add('is-busy');
            const one = (text) => { hist.replaceChildren(h('li', '', text)); };
            try {
                const t = typeof o.token === 'function' ? await o.token() : o.token;
                if (!t) throw new Error('Sign in to read history.');
                const url = String(o.networkBase || 'https://openvibe.network').replace(/\/+$/, '') + '/api/v1/history/agents/recent?limit=10';
                const response = await fetch(url, { headers: { accept: 'application/json', authorization: `Bearer ${t}` }, credentials: 'omit' });
                const result = await response.json().catch(() => ({}));
                if (response.status === 403) one('Your agent history setting is off. Turn it on in My settings to allow this read.');
                else if (!response.ok) one('Recent history is unavailable.');
                else {
                    const items = (result.items || []).slice(0, 10);
                    if (!items.length) one('No recent history.');
                    else hist.replaceChildren(...items.map((x) => { const li = h('li'); li.append(h('b', '', String(x.type || '')), d.createTextNode(String(x.title || ''))); return li; }));
                }
            } catch { one('Recent history is unavailable.'); }
            finally { past.disabled = false; past.classList.remove('is-busy'); }
            hist.hidden = false; past.setAttribute('aria-expanded', 'true');
        });

        /** One line under the field: what just happened. A good word goes by itself after a moment; a problem stays. */
        function say(text, tone) {
            clearTimeout(noteTimer);
            note.textContent = text || '';
            note.className = 'ovdac-note' + (tone ? ` is-${tone}` : '');
            if (text && tone === 'ok') noteTimer = setTimeout(() => { note.textContent = ''; note.className = 'ovdac-note'; }, 6000);
        }

        // ── A refresh repaints the row, the steps and the ask; the field and the history stay as they are ────────
        function paint(a) {
            if (!a || (a.enabled === false && !a.id)) {
                actor = null; shown = false; last = '';
                container.replaceChildren(); container.classList.remove('on'); container.removeAttribute('data-state');
                return;
            }
            actor = a;
            if (!shown) { container.replaceChildren(head, rail, askBox, form, foot, hist); container.classList.add('on'); shown = true; }
            const sig = JSON.stringify([a.name, a.status, a.avatar, a.brain, a.caps, a.now, a.asks]);
            if (sig === last) return;
            last = sig;
            const state = stateOf(a), now = a.now || {};
            container.setAttribute('data-state', state);

            // Who, and the one line about it.
            const label = String(a.name || 'Your Actor');
            const pic = a.avatar && typeof a.avatar.url === 'string' && /^https:\/\//.test(a.avatar.url) ? a.avatar.url : '';
            if (pic) { const img = h('img'); img.alt = ''; img.src = pic; face.replaceChildren(img); } else face.replaceChildren(d.createTextNode(label.trim().charAt(0).toUpperCase() || 'A'));
            nameText.textContent = label;
            id.setAttribute('aria-label', `${label}, ${STATE[state]}. Open your Actor's page`);
            stateText.textContent = STATE[state];
            const cap = a.caps && Number(a.caps.usd) > 0 ? ` of ${money(a.caps.usd)}` : '';
            spend.textContent = `${money(now.cost_today)}${cap} today`;
            tip(spend, `Model: ${a.brain && a.brain !== 'auto' ? a.brain : 'Auto'}`);

            // The one action that fits.
            const paused = a.status === 'paused';
            go.className = 'ovdac-go' + (paused ? ' is-main' : '');
            go.replaceChildren(icon(paused ? 'play' : 'pause'), h('span', paused ? '' : 'sr', paused ? 'Resume' : 'Pause'));
            tip(go, paused ? 'Your Actor does nothing until you resume it' : 'Pause your Actor');

            // What it does: the step it is on, the steps before it, what comes next. Nothing when there is nothing to say.
            const asks = Array.isArray(a.asks) ? a.asks : [];
            const ask = asks[0];
            const step = String(now.current_step || '').trim();
            const live = a.status === 'working' && step && !NOT_A_STEP.test(step) && !(ask && step === String(ask.text || '').trim()) ? step : '';
            const items = [];
            if (live) {
                const li = h('li', 'is-live'); li.append(d.createTextNode(live));
                const looking = now.looking_at && (now.looking_at.title || now.looking_at);
                if (looking) li.append(h('span', 'ovdac-look', `Looking at ${String(looking)}`));
                items.push(li);
            }
            const before = (Array.isArray(now.last_three_steps) ? now.last_three_steps : []).map((x) => String((x && x.text) || x || '').trim()).filter((t) => t && t !== live).slice(0, 3);
            if (!paused) before.forEach((t) => items.push(h('li', '', t)));
            if (!paused && now.next && (now.next.text || typeof now.next === 'string')) {
                const li = h('li', 'is-next'); const when = due(now.next.at);
                li.append(h('b', '', 'Next: '), d.createTextNode(String(now.next.text || now.next) + (when ? `, ${when}` : '')));
                items.push(li);
            }
            rail.replaceChildren(...items); rail.hidden = !items.length;

            // The first thing it asks, with its own buttons.
            if (ask) {
                const k = h('div', 'ovdac-ask-k'); const chip = h('i'); chip.append(icon('ask')); k.append(chip, d.createTextNode(`${label} asks`));
                const row = h('div', 'row');
                const options = Array.isArray(ask.options) && ask.options.length ? ask.options : [{ id: 'yes', label: 'Yes' }];
                options.slice(0, 3).forEach((op, i) => {
                    const b = h('button', `ovdac-btn${i === 0 ? ' is-yes' : ''}`, String(op.label || op)); b.type = 'button';
                    b.addEventListener('click', () => act(`/asks/${encodeURIComponent(ask.id)}/answer`, { option: op.id || op }, b, 'Answered.'));
                    row.append(b);
                });
                const no = h('button', 'ovdac-btn is-quiet', 'Not now'); no.type = 'button';
                no.addEventListener('click', () => act(`/asks/${encodeURIComponent(ask.id)}/decline`, {}, no));
                row.append(no);
                askBox.replaceChildren(k, h('p', '', String(ask.text || '')), row);
                if (asks.length > 1) { const more = h('a', 'ovdac-more', `${asks.length - 1} more on your Actor's page`); more.href = openBase + '/you'; more.target = '_blank'; more.rel = 'noopener'; askBox.append(more); }
            } else askBox.replaceChildren();
            askBox.hidden = !ask;
        }

        async function act(path, body, btn, done) {
            if (busy) return false;
            busy = true; if (btn) { btn.disabled = true; btn.classList.add('is-busy'); }
            say('');
            try {
                await api(path, { method: 'POST', json: true, body });
                last = '';
                await refresh();
                if (done) say(done, 'ok');
                return true;
            } catch (err) { say(`That did not go through: ${err.message}`, 'bad'); return false; }
            finally { busy = false; if (btn) { btn.disabled = false; btn.classList.remove('is-busy'); } }
        }

        async function refresh() {
            if (gone) return;
            if (o.active && !o.active()) return;
            try { const data = await api(''); if (!gone) paint(data); }
            catch (err) { if (!gone && (err.status === 401 || err.status === 403 || err.status === 404)) paint(null); }
        }
        refresh();
        timer = setInterval(refresh, POLL_MS);
        return { refresh, destroy() { gone = true; clearInterval(timer); clearTimeout(noteTimer); container.replaceChildren(); container.classList.remove('on'); container.removeAttribute('data-state'); } };
    }

    root.OpenVibeDockActor = { mount };
})(typeof window !== 'undefined' ? window : globalThis);
