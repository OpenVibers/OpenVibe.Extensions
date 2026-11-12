// ═══════════════════════════════════════════════════════════════
// OpenVibe — the Dock's agent view (Dock plan 2026-10-30, K-D3; Agent Streams S1), Shared 4.120.0; Float 4.154.0
//
// The person's own agent desk stream at the top of the Dock's Agents tab. dock.js loads this file the first time that
// tab opens:
//   OpenVibeDockAgent.mount(container, { token, base, active })  → { refresh(), destroy() }
//
// The read is OpenVibe.Codes' GET /api/v1/me/agent-view (the same POST for pause, Curtain now, mute and End, and the
// frame). It asks Network's same-origin relay (/api/frame/agent-view…) because every site's connect-src allows
// openvibe.network and refuses openvibe.codes; `frameBase` overrides the relay, and `base` reaches Codes itself in a
// test or the extension (an explicit base wins). Nothing is asked when there is no token: a signed-out page can never
// read the view. Agent Streams S5 adds the four controls: a moderator cannot resume the owner's pause on Live, and the
// Dock is the owner's own view, so it may always resume.
// Codes mints the view ticket server-side with the person's own token — an iframe on another site has no Live cookie —
// so the frame it answers is already Live's /embed/agent/<ags_id>?vt=wvt_…: the picture, the "AI agent" label, the
// curtain state and the viewer count. The embed renews its own ticket while it plays.
//
// Nothing live: the last frame through the same API (an <img> cannot carry a token), with the task and the worked time.
// Live's S2 current step comes through Codes when available; an older stream simply has no step line.
// Everything is set as text, never markup; the frame's address is the one Codes answered, as an https Live address.
// ═══════════════════════════════════════════════════════════════
(function (root) {
    'use strict';
    if (typeof document === 'undefined' || root.OpenVibeDockAgent) return;

    const POLL_MS = 20000;
    const EMBED = /^https:\/\/openvibe\.live\/embed\/agent\/ags_[0-9A-HJKMNP-TV-Z]{26}\?vt=wvt_[A-Za-z0-9_-]+$/;
    const CODES = 'https://openvibe.codes';
    // How long the embed gets to announce itself before the panel decides the frame is refused (a CSP
    // `frame-ancestors` refusal shows an error page, which the parent cannot read; a rendered embed says hello).
    const FRAME_MS = 3000;
    /** The token's payload, never verified: only the panel's own behaviour is chosen from it (Codes is the judge). */
    function payloadOf(token) {
        const parts = String(token || '').split('.');
        if (parts.length !== 3) return null;
        try {
            const b = parts[1].replace(/-/g, '+').replace(/_/g, '/');
            const c = JSON.parse(root.atob(b + '='.repeat((4 - b.length % 4) % 4)));
            return c && typeof c === 'object' ? c : null;
        } catch { return null; }
    }
    /** True for the extension's Dock token: Network's `/dock` issuer, client companion, the agent.view scope. */
    function readOnlyToken(token) {
        const c = payloadOf(token);
        if (!c || c.client_id !== 'companion' || !/\/dock$/.test(String(c.iss || ''))) return false;
        return String(c.scope || '').split(/\s+/).filter(Boolean).includes('agent.view');
    }
    /** The browser's own scheme, for the one case no allow-list can name: a Firefox extension's changing id. */
    function extensionScheme() {
        try { return String((root.location && root.location.protocol) || ''); } catch { return ''; }
    }
    const svg = (p) => `<svg viewBox="0 0 24 24" aria-hidden="true">${p}</svg>`;
    const G = {
        eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/><path d="M4 4l16 16"/>',
        pause: '<rect x="7" y="5" width="3.5" height="14" rx="1"/><rect x="13.5" y="5" width="3.5" height="14" rx="1"/>',
        play: '<path d="M8 5.5v13l10-6.5z"/>',
        mute: '<path d="M4 9.5h4L13 5v14l-5-4.5H4z"/><path d="M17 9l4 4m0-4l-4 4"/>',
        sound: '<path d="M4 9.5h4L13 5v14l-5-4.5H4z"/><path d="M17 9.5a4 4 0 0 1 0 5"/>',
        stop: '<rect x="6.5" y="6.5" width="11" height="11" rx="2.5"/>',
        open: '<path d="M14 4h6v6M20 4l-9 9M19 14v5a1.5 1.5 0 0 1-1.5 1.5h-12A1.5 1.5 0 0 1 4 19V7a1.5 1.5 0 0 1 1.5-1.5H10"/>',
        float: '<rect x="3.5" y="5" width="17" height="14" rx="2.5"/><rect x="11.5" y="11" width="7" height="6" rx="1.2" fill="currentColor" stroke="none"/>',
    };

    // The style goes into the document the view lives in: the page, or the Dock's own window when it is popped out.
    function styles(doc) {
        const d = doc || (typeof document !== 'undefined' ? document : null);
        if (!d || d.getElementById('ovda-styles')) return;
        const st = d.createElement('style');
        st.id = 'ovda-styles';
        st.textContent = `
            .ovda { display: none; flex: none; padding: 8px 8px 2px; border-bottom: 1px solid var(--border, rgba(255,255,255,.08)); }
            .ovda.on { display: block; }
            .ovda-stage { position: relative; overflow: hidden; aspect-ratio: 16 / 9; border-radius: 14px; background: #0a0c11; border: 1px solid var(--border, rgba(255,255,255,.1)); }
            .ovda-frame, .ovda-still { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; object-fit: contain; background: #0a0c11; }
            .ovda-still { object-fit: cover; opacity: .92; }
            .ovda-stage[hidden] { display: none; }
            .ovda-wait { position: absolute; inset: 0; display: grid; place-items: center; color: var(--text-muted, #8b8b96); font-size: 12.5px; text-align: center; padding: 12px; }
            .ovda-line { display: flex; align-items: center; gap: 6px; min-height: 34px; font-size: 12.5px; color: var(--text-secondary, #b6b6c0); }
            .ovda-line b { color: var(--text-primary, #ececf1); font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
            .ovda-line b a { color: inherit; text-decoration: none; }
            .ovda-line b a:hover { text-decoration: underline; }
            .ovda-line .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--accent, #3b82f6); flex: none; }
            .ovda-line .dot.live { background: var(--live-red, #e5484d); animation: ovda-pulse 1.6s ease-in-out infinite; }
            .ovda-line .dot.off { background: var(--text-muted, #8b8b96); }
            .ovda-meta { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; font-size: 11.5px; color: var(--text-muted, #8b8b96); }
            .ovda-watch { align-self: flex-start; font-size: 12.5px; color: var(--accent, #3b82f6); text-decoration: underline; min-height: 30px; display: inline-flex; align-items: center; }
            .ovda-watch[hidden] { display: none; }
            .ovda-acts { display: flex; gap: 6px; margin-left: auto; }
            .ovda-acts button, .ovda-acts a { display: inline-flex; align-items: center; gap: 5px; min-height: 30px; padding: 0 10px; border-radius: 999px; border: 1px solid var(--border, rgba(255,255,255,.12));
                background: transparent; color: var(--text-secondary, #b6b6c0); font: inherit; font-size: 12px; font-weight: 700; cursor: pointer; text-decoration: none; }
            .ovda-acts button:hover, .ovda-acts a:hover { color: var(--text-primary, #ececf1); background: color-mix(in srgb, var(--text-primary, #ececf1) 7%, transparent); }
            .ovda-acts button:disabled { opacity: .5; cursor: default; }
            .ovda-acts svg { width: 14px; height: 14px; }
            .ovda-acts button[data-act="end"] { color: color-mix(in srgb, var(--live-red, #e5484d) 65%, var(--text-primary, #ececf1)); }
            /* A session that ended is two lines of words with its one way out beside them, not a button on a row of its own. */
            .ovda.is-ended .ovda-head { display: grid; grid-template-columns: minmax(0, 1fr) auto; column-gap: 8px; align-items: center; padding: 2px 4px 6px; }
            .ovda.is-ended .ovda-line, .ovda.is-ended .ovda-meta { grid-column: 1; }
            .ovda.is-ended .ovda-acts { grid-column: 2; grid-row: 1 / span 2; margin: 0; }
            .ovda.is-ended .ovda-acts:empty { display: none; }
            @media (pointer: coarse) { .ovda-acts button, .ovda-acts a { min-height: 44px; min-width: 44px; justify-content: center; } }
            .ovda svg { fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
            @keyframes ovda-pulse { 0%, 100% { opacity: 1; } 50% { opacity: .35; } }
        `;
        (d.head || d.documentElement).appendChild(st);
    }

    const mins = (s) => {
        const m = Math.max(0, Math.round((Number(s) || 0) / 60));
        return m < 1 ? 'under a minute' : m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
    };

    function mount(container, opts = {}) {
        const d = container.ownerDocument || document;
        styles(d);
        const o = { ...opts };
        const h = (tag, cls, text) => { const n = d.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
        const codesBase = String(o.base || CODES).replace(/\/+$/, '');
        // Network's frame relay on a site; an explicit base reaches Codes itself (a test, or the extension's panel).
        const direct = o.base ? String(o.base).replace(/\/+$/, '') : '';
        const frameBase = String(o.frameBase || 'https://openvibe.network/api/frame').replace(/\/+$/, '');
        const endpoint = (path) => (direct ? direct + path : frameBase + path.replace(/^\/api\/v1\/me\/agent-view/, '/agent-view'));
        let gone = false, timer = 0, busy = false, agent = null, frameUrl = null, lastFrame = '';
        let readOnly = false, framedFor = '', frameRefused = '', frameTimer = 0;
        container.innerHTML = '';
        container.classList.add('ovda');
        const stage = h('div', 'ovda-stage');
        const line = h('div', 'ovda-line');
        const step = h('div', 'ovda-meta ovda-step');
        const meta = h('div', 'ovda-meta');
        const watch = h('a', 'ovda-watch', 'Watch on openvibe.live');
        watch.target = '_blank';
        watch.rel = 'noopener';
        watch.hidden = true;
        const acts = h('div', 'ovda-acts');
        const head = h('div', 'ovda-head');
        head.append(line, meta, step, watch, acts);
        const body = h('div');
        body.append(stage, head);
        container.append(body);

        async function api(path, init = {}) {
            const t = typeof o.token === 'function' ? await o.token() : o.token;
            readOnly = readOnlyToken(t);
            if (!t) throw Object.assign(new Error('Sign in to see your agent'), { status: 401 });
            const headers = { accept: 'application/json', ...(init.json ? { 'content-type': 'application/json' } : {}), authorization: `Bearer ${t}` };
            const r = await fetch(endpoint(path), { ...init, headers, credentials: 'omit', body: init.json ? JSON.stringify(init.body || {}) : undefined });
            const b = await r.json().catch(() => ({}));
            if (!r.ok) throw Object.assign(new Error(b.detail || `HTTP ${r.status}`), { status: r.status });
            return b;
        }

        /** The still is behind the person's token, so it is read here and shown as a local object URL. */
        function still(url) {
            if (!url || frameUrl === url) return;
            frameUrl = url;
            Promise.resolve(typeof o.token === 'function' ? o.token() : o.token).then((t) => (t
                ? fetch(endpoint('/api/v1/me/agent-view/frame'), { headers: { authorization: `Bearer ${t}`, accept: 'image/jpeg, image/webp' }, credentials: 'omit' })
                : null))
                .then((r) => (r && r.ok ? r.blob() : null))
                .then((blob) => {
                    if (!blob || gone || frameUrl !== url) return;
                    const next = URL.createObjectURL(blob);
                    const img = h('img', 'ovda-still');
                    img.alt = 'The last frame of your agent';
                    img.src = next;
                    img.decoding = 'async';
                    const old = stage.querySelector('img.ovda-still');
                    if (old) { stage.removeChild(old); }
                    stage.append(img);
                    if (lastFrame) URL.revokeObjectURL(lastFrame);
                    lastFrame = next;
                })
                .catch(() => { /* no still: the line says enough */ });
        }

        function paint() {
            if (gone) return;
            const has = !!agent;
            container.classList.toggle('on', has);
            if (!has) { stage.innerHTML = ''; line.innerHTML = ''; meta.textContent = ''; acts.innerHTML = ''; watch.hidden = true; return; }

            const live = agent.state === 'live';
            const ended = agent.state === 'ended';
            container.classList.toggle('is-ended', ended);
            // The picture: the live embed when there is one and it may be framed, else the still and a plain link.
            // A refused frame looks loaded to its parent (the browser shows its own error page), so the embed
            // announces itself (Live's agent-embed.js); no hello in time means frame-ancestors kept it out, and the
            // still is the honest view. A Firefox extension's moz-extension id changes per install and no allow-list
            // can name it, so it is never tried.
            const embed = typeof agent.embed_url === 'string' && EMBED.test(agent.embed_url) ? agent.embed_url : null;
            const blocked = !!embed && (frameRefused === agent.id || extensionScheme() === 'moz-extension:');
            const shown = stage.querySelector('iframe.ovda-frame');
            if (embed && !blocked) {
                watch.hidden = true;
                if (!shown || shown.getAttribute('src') !== embed) {
                    stage.innerHTML = '';
                    frameUrl = null;
                    const f = h('iframe', 'ovda-frame');
                    f.src = embed;
                    f.title = 'Your agent\'s screen';
                    f.setAttribute('allow', 'autoplay; fullscreen; picture-in-picture');
                    f.setAttribute('referrerpolicy', 'no-referrer');
                    stage.append(f);
                    armFrame(f);
                } else {
                    shown.style.display = '';
                }
            } else {
                if (shown) shown.style.display = 'none';
                if (agent.last_frame_url) {
                    if (!stage.querySelector('img.ovda-still')) frameUrl = null;
                    still(agent.last_frame_url);
                } else if (!ended && !stage.querySelector('img.ovda-still') && !stage.querySelector('.ovda-wait')) {
                    stage.append(h('div', 'ovda-wait', 'Waiting for the desk'));
                }
                // The plain way to the stream, when this browser cannot frame it. It is a real link, not a control.
                const page = typeof agent.page_url === 'string' && /^https:\/\/openvibe\.live\//.test(agent.page_url) ? agent.page_url : null;
                if (page) watch.href = page;
                watch.hidden = !blocked || !page;
            }
            // A session that ended and left no picture has no stage: a black box saying "Nothing to show" told nobody
            // anything (the owner, 2026-11-10). The line under it still says what it was and how long it worked.
            stage.hidden = ended && !embed && !agent.last_frame_url && !stage.querySelector('img');

            // The line: what it is doing, one row.
            line.innerHTML = '';
            line.append(h('span', `dot ${live ? 'live' : 'off'}`));
            const title = h('b');
            const url = agent.task && /^https:\/\//.test(String(agent.task.url || '')) ? agent.task.url : (/^https:\/\//.test(String(agent.page_url || '')) ? agent.page_url : null);
            const text = (agent.task && agent.task.title) || agent.title || 'Your agent';
            if (url) { const a = h('a', null, text); a.href = url; a.rel = 'noopener'; a.target = '_blank'; title.append(a); }
            else title.textContent = text;
            line.append(title);

            const current = agent.current_step;
            step.textContent = current && typeof current.title === 'string' && current.title.trim()
                ? `Step: ${current.title} · ${current.status || 'started'}` : '';
            step.hidden = !step.textContent;

            // The meta: the state, the viewers, the curtain, the worked time.
            meta.textContent = '';
            const bits = [live ? 'Live' : ended ? 'Ended' : 'Waiting for the desk'];
            if (live && agent.viewers > 0) bits.push(`${agent.viewers} watching`);
            if (agent.paused) bits.push(agent.paused_by ? `Paused by @${agent.paused_by}` : 'Paused');
            if (live && agent.curtain && agent.curtain.up) bits.push('Private screen');
            bits.push(`worked ${mins(agent.worked_seconds)}`);
            meta.textContent = bits.join(' · ');

            // S5: the four controls, for the owner (the Dock is their own view, so resume is always theirs).
            // The side panel holds the Dock's read-only token, so there the buttons are links to Codes, where the
            // person's own session does the same four things.
            acts.innerHTML = '';
            const control = (act, label, title) => {
                if (readOnly) {
                    const a = h('a');
                    a.href = codesBase;
                    a.target = '_blank';
                    a.rel = 'noopener';
                    a.dataset.act = act;
                    a.innerHTML = label;
                    a.title = `${title} (opens openvibe.codes)`;
                    return a;
                }
                const b = h('button');
                b.type = 'button';
                b.dataset.act = act;
                b.innerHTML = label;
                b.title = title;
                return b;
            };
            if (!ended) acts.append(control('pause', `${svg(agent.paused ? G.play : G.pause)}${agent.paused ? 'Resume' : 'Pause'}`, agent.paused && agent.paused_by ? `Paused by @${agent.paused_by}` : 'Pause the agent at the next safe point'));
            if (live && !(agent.curtain && agent.curtain.up)) acts.append(control('curtain', `${svg(G.eye)}Curtain now`, 'Hide the screen now; your desk lifts it when it is clear'));
            if (!ended) acts.append(control('mute', `${svg(agent.voice_muted ? G.sound : G.mute)}${agent.voice_muted ? 'Unmute' : 'Mute'}`, agent.voice_muted ? 'Let the agent speak again' : 'Mute the agent\'s voice'));
            if (!ended) acts.append(control('end', `${svg(G.stop)}End`, 'End the agent stream'));
            // 4.154.0: Float puts the agent's screen in a floating card (overlay.js) that stays on screen as the person
            // moves around this site and on to other OpenVibe sites, so the Dock can close while they watch.
            if (embed && !ended) {
                const b = h('button', null);
                b.type = 'button';
                b.dataset.act = 'float';
                b.innerHTML = `${svg(G.float)}Float`;
                b.title = 'Keep watching in a small window that follows you';
                acts.append(b);
            }
            if (agent.page_url && /^https:\/\/openvibe\.live\//.test(agent.page_url)) {
                const a = h('a');
                a.href = agent.page_url;
                a.target = '_blank';
                a.rel = 'noopener';
                a.setAttribute('aria-label', 'Open the stream on OpenVibe.Live');
                a.title = 'Open the stream on OpenVibe.Live';
                a.innerHTML = svg(G.open);
                acts.append(a);
            }
        }

        /** The embed must say hello before FRAME_MS, or the still takes its place (see paint above). */
        function armFrame(f) {
            clearTimeout(frameTimer);
            const url = f.getAttribute('src');
            if (framedFor === url) return;
            frameTimer = setTimeout(() => {
                if (gone || !agent || framedFor === url) return;
                frameRefused = agent.id;
                paint();
            }, FRAME_MS);
        }
        function onFrameHello(e) {
            if (!e || !e.data || e.data.type !== 'ov-agent-embed' || !agent) return;
            const f = stage.querySelector('iframe.ovda-frame');
            if (!f || e.source !== f.contentWindow) return;
            clearTimeout(frameTimer);
            framedFor = f.getAttribute('src') || framedFor;
            if (frameRefused) { frameRefused = ''; paint(); }
        }
        root.addEventListener('message', onFrameHello);

        async function refresh() {
            if (gone || busy) return;
            if (typeof o.active === 'function' && !o.active()) { schedule(); return; }
            busy = true;
            clearTimeout(timer);
            try {
                const doc = await api('/api/v1/me/agent-view');
                if (gone) return;
                agent = doc && doc.agent && typeof doc.agent === 'object' ? doc.agent : null;
                paint();
            } catch (e) {
                // Codes away, or Live away: no stream, and the rest of the tab is untouched.
                if (!gone) { agent = null; paint(); }
            } finally {
                busy = false;
                schedule();
            }
        }
        function schedule() {
            clearTimeout(timer);
            if (!gone && agent && agent.state !== 'ended') timer = setTimeout(refresh, POLL_MS);
        }

        async function control(what, btn, body = {}) {
            if (!btn || btn.disabled) return;
            btn.disabled = true;
            try {
                const doc = await api(`/api/v1/me/agent-view/${what}`, { method: 'POST', json: true, body });
                agent = doc && doc.agent ? doc.agent : agent;
                if (what === 'end') frameUrl = '';
                paint();
            } catch (e) {
                btn.disabled = false;
                btn.title = e.message || 'That did not work. Try again.';
                return;
            }
            if (agent && agent.state !== 'ended') schedule();
        }

        acts.addEventListener('click', (e) => {
            const b = e.target.closest('button[data-act]');
            if (!b) return;
            if (b.dataset.act === 'pause') control('pause', b, { paused: !(agent && agent.paused) });
            else if (b.dataset.act === 'curtain') control('curtain', b);
            else if (b.dataset.act === 'mute') control('mute', b, { muted: !(agent && agent.voice_muted) });
            else if (b.dataset.act === 'end') control('end', b);
            else if (b.dataset.act === 'float') floatIt(b);
        });

        function floatIt(btn) {
            const embed = agent && typeof agent.embed_url === 'string' && EMBED.test(agent.embed_url) ? agent.embed_url : null;
            const nav = root.OpenVibeNavbar;
            if (!embed || !nav || typeof nav.overlay !== 'function') { btn.title = 'Floating is not available on this page.'; return; }
            const pageUrl = agent.page_url && /^https:\/\/openvibe\.live\//.test(agent.page_url) ? agent.page_url : null;
            nav.overlay({ id: 'agent', src: embed, title: (agent.task && agent.task.title) || agent.title || 'Your agent', live: agent.state === 'live', href: pageUrl || undefined })
                .then((card) => { if (card && root.OpenVibeDock && typeof root.OpenVibeDock.close === 'function') root.OpenVibeDock.close(); })
                .catch(() => { btn.title = 'That did not work. Try again.'; });
        }

        refresh();
        return { refresh, destroy() { gone = true; clearTimeout(timer); clearTimeout(frameTimer); root.removeEventListener('message', onFrameHello); if (lastFrame) URL.revokeObjectURL(lastFrame); container.innerHTML = ''; container.classList.remove('ovda'); } };
    }

    root.OpenVibeDockAgent = { mount };
})(typeof window !== 'undefined' ? window : globalThis);
