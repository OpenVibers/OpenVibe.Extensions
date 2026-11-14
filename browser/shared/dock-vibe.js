/**
 * openvibe-shared/dock-vibe.js: the Dock's Vibe tab (plan L48 V2), loaded by dock.js the first time the tab opens.
 *   OpenVibeDockVibe.mount(panel, { chatCall, active, styles, icons }) → { refresh(), pause(), talk() }
 * chatCall is the Dock's call to OpenVibe.Chat with the person's Network token; active() says whether the Vibe tab is
 * the one showing; styles() is the Dock's own <style> (this file adds its rules there, so a popped-out Dock has them).
 */
(function (root) {
    'use strict';
    if (typeof document === 'undefined' || root.OpenVibeDockVibe) return;
    const svg = (p) => `<svg viewBox="0 0 24 24" aria-hidden="true">${p}</svg>`;
    const h = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
    const PLUS = '<path d="M12 5.5v13M5.5 12h13"/>';
    const OUT = '<path d="M13.5 5.5h5v5M18.5 5.5l-7.5 7.5M17 13.5v4a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 5 17.5v-9A1.5 1.5 0 0 1 6.5 7h4"/>';
    const MIC = '<rect x="9" y="3.5" width="6" height="10.5" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5v3"/>';
    const CSS = `
            .ovdk-ib.is-new { background: color-mix(in srgb, var(--accent, #3b82f6) 16%, transparent); color: var(--accent-light, var(--accent, #60a5fa)); }
            .ovdk-ib.is-new:hover, .ovdk-ib.is-new:focus-visible { background: color-mix(in srgb, var(--accent, #3b82f6) 26%, transparent); }
            .ovdk-vibe-h .ovdk-i { color: var(--accent, #3b82f6); margin-left: 6px; }
            .ovdk-vibe-list { list-style: none; padding: 2px 6px 6px; margin: 0; display: grid; gap: 2px; }
            .ovdk-vibe-list button { width: 100%; min-height: 56px; display: grid; grid-template-columns: 36px minmax(0,1fr) auto; grid-template-rows: auto auto; gap: 2px 12px; align-items: center; padding: 9px 10px; border: 0; border-radius: 14px; background: transparent; color: var(--text-primary,#ececf1); text-align: left; cursor: pointer; font: inherit; }
            .ovdk-vibe-list .ovdk-vibe-site { grid-row: 1 / 3; width: 36px; height: 36px; border-radius: 11px; display: grid; place-items: center; background: color-mix(in srgb, var(--accent, #3b82f6) 14%, transparent); color: var(--accent-light, var(--accent, #60a5fa)); }
            .ovdk-vibe-list .ovdk-vibe-site svg { width: 19px; height: 19px; }
            .ovdk-vibe-list b { font-size: 14px; } .ovdk-vibe-list span { font-size: 12.5px; color: var(--text-secondary, #b6b6c0); }
            .ovdk-vibe-list small { justify-self: end; }
            .ovdk-vibe-list button:hover, .ovdk-vibe-list button:focus-visible { background: var(--hover-bg,rgba(127,127,127,.12)); }
            .ovdk-vibe-list b, .ovdk-vibe-list span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
            .ovdk-vibe-list small, .ovdk-vibe-list time { color: var(--text-muted,#8b8b96); font-size: 12px; }
            .ovdk-vibe-back { min-width: 44px; min-height: 44px; display: grid; place-items: center; border: 0; background: transparent; color: inherit; cursor: pointer; }
            .ovdk-msg.is-vibe .ovdk-text a { color: var(--accent, #3b82f6); text-decoration: underline; word-break: break-all; }
            .ovdk-typing .ovdk-text { display: inline-flex; gap: 4px; align-items: center; padding: 10px 12px; }
            .ovdk-typing i { width: 6px; height: 6px; border-radius: 50%; background: var(--text-muted, #8b8b96); animation: ovdk-hop 1s ease-in-out infinite; }
            .ovdk-typing i:nth-child(2) { animation-delay: .15s; } .ovdk-typing i:nth-child(3) { animation-delay: .3s; }
            .ovdk-vibe-start { list-style: none; display: grid; gap: 6px; padding: 18px 6px 8px; text-align: center; color: var(--text-muted, #8b8b96); font-size: 13.5px; line-height: 1.45; }
            .ovdk-vibe-start b { color: var(--text-primary, #ececf1); font-size: 15.5px; }
            .ovdk-chips { display: flex; flex-wrap: wrap; justify-content: center; gap: 6px; margin-top: 8px; }
            .ovdk-chip { padding: 7px 12px; border-radius: 999px; border: 1px solid var(--border, rgba(255,255,255,.12)); background: transparent; color: var(--text-primary, #ececf1); font: inherit; font-size: 12.5px; cursor: pointer; }
            .ovdk-chip:hover { border-color: var(--accent, #3b82f6); }
            .ovdk-mic, .ovdk-attach { width: 44px; height: 44px; flex: none; border: 0; border-radius: 12px; cursor: pointer; display: grid; place-items: center; background: transparent; color: var(--text-muted, #8b8b96); touch-action: none; }
            .ovdk-attach:hover { color: var(--text-primary,#ececf1); }
            .ovdk-mic:hover { color: var(--text-primary, #ececf1); }
            .ovdk-mic.is-on { color: var(--on-accent, #fff); background: var(--live-red, #e5484d); box-shadow: 0 0 0 4px color-mix(in srgb, var(--live-red, #e5484d) 28%, transparent); }
            .ovdk-res { display: grid; gap: 6px; margin-top: 6px; max-width: 100%; }
            .ovdk-res-c { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 4px 10px; padding: 8px 10px; border-radius: 12px;
                border: 1px solid color-mix(in srgb, var(--accent, #3b82f6) 35%, var(--border, rgba(255,255,255,.12))); background: color-mix(in srgb, var(--accent, #3b82f6) 8%, transparent); }
            .ovdk-res-c .ovdk-i { color: var(--accent, #3b82f6); }
            .ovdk-res-t { min-width: 0; font-size: 13px; line-height: 1.35; color: var(--text-primary, #ececf1); }
            .ovdk-res-t b { font-weight: 750; }
            .ovdk-res-t small { display: block; color: var(--text-muted, #8b8b96); font-size: 12px; }
            .ovdk-res-a { display: flex; gap: 4px; }
            .ovdk-res-a button, .ovdk-res-a a { min-height: 30px; padding: 0 10px; border-radius: 999px; border: 1px solid var(--border, rgba(255,255,255,.12)); background: transparent;
                color: var(--text-primary, #ececf1); font: inherit; font-size: 12.5px; font-weight: 650; cursor: pointer; text-decoration: none; display: inline-flex; align-items: center; }
            .ovdk-res-a button:hover, .ovdk-res-a a:hover { border-color: var(--accent, #3b82f6); }
            .ovdk-res-a button:disabled { opacity: .55; cursor: default; }
            .ovdk-res-c.is-stopped { border-color: var(--border, rgba(255,255,255,.12)); background: transparent; }
            .ovdk-res-c.is-stopped .ovdk-i, .ovdk-res-c.is-stopped .ovdk-res-t { color: var(--text-muted, #8b8b96); }
`;
    let ctx = null, G = {};
    // 4.203.0 (ask 349, "a better composer system unified across all sites"): Vibe's box is the one composer too, for
    // drafts, "/" commands and your own, the marks, what sends and your settings; its picture keeps its own upload.
    const selfSrc = (typeof document !== 'undefined' && document.currentScript && document.currentScript.src) || '';
    const VIBE_REV = { 'ov-composer.js': '9b3472802903' };
    function joinComposer(form) {
        if (!form || form.ownerDocument !== document) return;   // a popped-out Dock keeps its plain box
        form.setAttribute('data-ovc-no-files', '');
        const go = () => { try { if (root.OpenVibeComposer && form.isConnected) root.OpenVibeComposer.enhance(form); } catch (e) { console.error(e); } };
        if (root.OpenVibeComposer) { go(); return; }
        const m = /^(https?:\/\/[^?#]*\/)dock-vibe(?:\.[0-9a-f]{6,})?\.js(?:[?#]|$)/.exec(selfSrc);
        if (!m) return;
        let sc = document.getElementById('ov-composer-script');
        if (!sc) { sc = document.createElement('script'); sc.id = 'ov-composer-script'; sc.async = true; sc.src = m[1] + 'ov-composer.js' + (VIBE_REV['ov-composer.js'] ? '?v=' + VIBE_REV['ov-composer.js'] : ''); document.head.appendChild(sc); }
        sc.addEventListener('load', go, { once: true });
    }
    const icon = (path) => { const s = h('span', 'ovdk-i'); s.innerHTML = svg(path); return s; };
    /** A round icon button with its name as label and tooltip. */
    const iconButton = (tag, cls, path, label) => { const b = h(tag, cls); if (tag === 'button') b.type = 'button'; b.setAttribute('aria-label', label); b.setAttribute('data-ov-tip', label); b.title = label; b.innerHTML = svg(path); return b; };
    /** Open Vibe in OpenVibe.Chat, as an icon (the thread's own address when one is open). */
    const awayLink = () => { const a = iconButton('a', 'ovdk-ib ovdk-away', OUT, 'Open in Chat'); a.href = 'https://openvibe.chat/vibe'; a.target = '_blank'; a.rel = 'noopener'; return a; };

    // ── Vibe (plan L48 V2; the owner, 11-01: "access your agent or the AI… from across all websites… use a voice
    // feature to tell it to set a reminder… have a conversation with your Vibe AI") ──
    // The same conversation as openvibe.chat/vibe, through Chat's /api/vibe with the person's Network token: what is
    // asked on Live carries on on Chat and back. Vibe answers in the background; the tab waits for it (a quick poll
    // for a minute and a half after a message, then every 15 s while the tab is open). The mic is the browser's own
    // speech recognition, hold to talk or Alt+V, and only while the person asks: no wake word, never always on. A
    // browser without it (Firefox) records instead, up to 30 s, and Chat's /api/vibe/listen turns that into text
    // (OpenVibe.AI's speech-to-text on this network's own machines; the recording is never kept).
    // Everything is set as text; a link is a link only when it is https.
    const vibe = { panel: null, chat: null, view: 'list', fresh: false, msgs: [], last: 0, timer: 0, busy: false, waitUntil: 0, rec: null, talk: null, generation: 0 };
    const SR = root.SpeechRecognition || root.webkitSpeechRecognition || null;
    const MR = !SR && root.MediaRecorder && root.navigator && root.navigator.mediaDevices && root.navigator.mediaDevices.getUserMedia ? root.MediaRecorder : null;
    const TALK = Boolean(SR || MR);
    const REC_TYPES = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4', 'audio/webm', 'audio/ogg'];
    const REC_MAX_MS = 30000;
    const STARTERS = ['Remind me to stretch every 2 hours', 'What is on today?', 'Who is live right now?', 'Remind me tomorrow at 9 to call Sam'];
    function linkified(text) {
        const span = h('span', 'ovdk-text');
        String(text || '').split(/(https:\/\/[^\s<>"')]+)/).forEach((part, i) => {
            if (i % 2) { const a = h('a', '', part); a.href = part; a.target = '_blank'; a.rel = 'noopener noreferrer'; span.append(a); } else if (part) span.append(part);
        });
        return span;
    }
    const DAY = 24 * 3600 * 1000;
    /** One thing Vibe did (Chat's results on its answer): what, when, and Undo / Open. */
    function resultChip(m, r, i) {
        const set = r.action === 'set';
        const c = h('div', `ovdk-res-c${set ? '' : ' is-stopped'}`);
        c.append(icon(r.kind === 'timer' ? G.clock : G.bell));
        const t = h('div', 'ovdk-res-t');
        const what = r.kind === 'timer' ? (set ? 'Timer' : 'Timer stopped') : (set ? 'Reminder set' : 'Reminder stopped');
        t.append(h('b', '', `${what}: `), String(r.title || ''));
        if (r.when && set) t.append(h('small', '', String(r.when)));
        const a = h('div', 'ovdk-res-a');
        const young = !m.at || Date.now() - Date.parse(m.at) < DAY;
        if (set && young && Number(m.id) > 0) {
            const undo = h('button', '', 'Undo'); undo.type = 'button';
            undo.setAttribute('aria-label', `Undo: ${what} ${r.title || ''}`.trim());
            undo.addEventListener('click', async () => {
                undo.disabled = true;
                try {
                    const out = await ctx.chatCall('/api/vibe/undo', { method: 'POST', body: JSON.stringify({ message_id: Number(m.id), index: i }) });
                    m.results = (out && out.results) || m.results.map((x, k) => (k === i ? { ...x, action: 'stopped' } : x));
                    c.replaceWith(resultChip(m, m.results[i], i));
                    if (r.kind === 'timer' && ctx.refresh) ctx.refresh();
                } catch (e) {
                    undo.disabled = false; undo.textContent = e && e.status === 410 ? 'Too old to undo' : 'Try again';
                    if (e && (e.status === 409 || e.status === 410)) undo.disabled = true;
                }
            });
            a.append(undo);
        }
        if (r.url && /^https:\/\//.test(r.url)) { const o = h('a', '', 'Open'); o.href = r.url; o.target = '_blank'; o.rel = 'noopener'; a.append(o); }
        c.append(t, a);
        return c;
    }
    function results(m) {
        const box = h('div', 'ovdk-res');
        m.results.slice(0, 4).forEach((r, i) => { if (r && (r.kind === 'reminder' || r.kind === 'timer')) box.append(resultChip(m, r, i)); });
        return box;
    }
    function vbubble(m, prev) {
        const mine = m.from === 'you';
        const li = h('li', `ovdk-msg${mine ? ' is-mine' : ' is-vibe'}${prev && prev.from === m.from ? ' is-cont' : ''}`);
        if (!mine && !(prev && prev.from === m.from)) li.append(h('span', 'ovdk-who', 'Vibe'));
        li.append(linkified(m.text));
        if (!mine && Array.isArray(m.results) && m.results.length) li.append(results(m));
        if (m.at) li.title = new Date(m.at).toLocaleString();
        return li;
    }
    const age = (iso) => { const n = Date.parse(iso || ''); if (!Number.isFinite(n)) return ''; const m = Math.max(0, Math.floor((Date.now() - n) / 60000)); return m < 1 ? 'now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.floor(m / 60)} h ago` : `${Math.floor(m / 1440)} d ago`; };
    async function openList() {
        const generation = ++vibe.generation;
        clearTimeout(vibe.timer); vibe.view = 'list'; vibe.chat = null;
        const panel = vibe.panel; if (!panel) return;
        panel.textContent = '';
        // No heading (ask 335, the owner: "remove the text … new conversation … an icon plus button … open in Chat a
        // little button icon"): one slim row of two icon buttons over your chats.
        const head = h('div', 'ovdk-bar');
        const newer = iconButton('button', 'ovdk-ib is-new ovdk-vibe-new', PLUS, 'New chat'); newer.addEventListener('click', () => { vibe.fresh = true; vibe.chat = null; ctx.save({ vibe: null }); openVibe(); });
        head.append(newer, awayLink());
        const scroll = h('div', 'ovdk-scroll'); const list = h('ul', 'ovdk-vibe-list');
        scroll.append(list); panel.append(head, scroll);
        try {
            const out = await ctx.chatCall('/api/vibe/conversations');
            if (generation !== vibe.generation || vibe.view !== 'list' || vibe.panel !== panel) return;
            const conversations = Array.isArray(out.conversations) ? out.conversations : [];
            if (!conversations.length) list.append(h('li', 'ovdk-none', 'Your chats with Vibe will appear here. Press + to start one.'));
            conversations.forEach((c) => {
                const li = h('li'), b = h('button'); b.type = 'button';
                const title = h('b', '', c.name || 'Conversation'); const time = h('time', '', age(c.last_message_at));
                const line = h('span', '', c.last_line || 'No messages yet');
                // The site it began on, by name ("Blog", not openvibe.blog), beside the time.
                const host = String(c.site || '').replace(/^https?:\/\//, '').replace(/\/.*$/, '');
                const name = host ? (/^openvibe\.([a-z]+)$/.exec(host) || [])[1] : '';
                const site = h('small', '', name ? name.charAt(0).toUpperCase() + name.slice(1) : host);
                const mark = h('span', 'ovdk-vibe-site'); mark.append(icon(G.vibe));
                b.append(mark, title, time, line, site);
                b.setAttribute('aria-label', `${c.name || 'Conversation'}, ${age(c.last_message_at)}`);
                b.addEventListener('click', () => { vibe.fresh = false; vibe.chat = { slug: c.slug }; ctx.save({ vibe: { slug: c.slug, at: new Date().toISOString() } }); openVibe(); });
                li.append(b); list.append(li);
            });
        } catch (e) { if (generation === vibe.generation) list.append(h('li', 'ovdk-none', e && e.status === 401 ? 'Sign in to see your conversations.' : 'Conversations did not load. Open Vibe again to retry.')); }
    }
    async function openVibe() {
        const generation = ++vibe.generation;
        clearTimeout(vibe.timer);
        vibe.view = 'conversation';
        const panel = vibe.panel; if (!panel) return;
        vibe.msgs = []; vibe.last = 0;
        panel.textContent = '';
        const head = h('div', 'ovdk-thread-h ovdk-vibe-h');
        const title = h('b', '', 'Vibe');
        const back = h('button', 'ovdk-vibe-back'); back.type = 'button'; back.setAttribute('aria-label', 'Back to your chats'); back.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" width="16" height="16"><path d="M16.1 3.6l-8.4 8.4l8.4 8.4"/></svg>'; back.addEventListener('click', () => { ctx.save({ vibe: null }); openList(); });
        const away = awayLink();
        head.append(back, icon(G.vibe), title, away);
        const list = h('ol', 'ovdk-msgs'); list.setAttribute('aria-live', 'polite');
        const scroll = h('div', 'ovdk-scroll ovdk-thread'); scroll.append(list);
        const typing = h('li', 'ovdk-msg is-vibe ovdk-typing'); typing.innerHTML = '<span class="ovdk-text"><i></i><i></i><i></i></span>'; typing.setAttribute('aria-label', 'Vibe is writing');
        const form = h('form', 'ovdk-send');
        const box = h('textarea'); box.rows = 1; box.maxLength = 8000; box.placeholder = TALK ? 'Ask Vibe, or hold the mic' : 'Ask Vibe'; box.setAttribute('aria-label', 'Message Vibe');
        const go = h('button', 'ovdk-go'); go.type = 'submit'; go.setAttribute('aria-label', 'Send'); go.append(icon(G.send));
        const err = h('p', 'ovdk-err'); err.hidden = true;
        const reason = (e) => e && e.status === 401 ? 'Your sign in expired. Sign in again to continue.'
            : e && e.status === 429 ? 'Too many requests were sent. Wait a minute, then retry.'
            : e && e.code === 'vibe.off' ? 'Vibe is unavailable right now. Retry when it returns.'
            : e && e.status === 503 ? 'The AI service is unavailable right now. Retry shortly.'
            : 'The request could not reach Vibe. Check your connection and retry.';
        const showFailure = (e, retry) => { err.textContent = `Vibe did not answer: ${reason(e)} `; err.hidden = false;
            if (retry) { const b = h('button', '', 'Retry'); b.type = 'button'; b.addEventListener('click', async () => { b.disabled = true; try { await retry(); } catch (x) { showFailure(x, retry); } finally { b.disabled = false; } }); err.append(b); }
        };
        const attach = h('button', 'ovdk-attach', '＋'); attach.type = 'button'; attach.setAttribute('aria-label', 'Attach a picture'); attach.title = 'Attach a picture';
        const file = h('input'); file.type = 'file'; file.accept = 'image/*'; file.hidden = true;
        attach.addEventListener('click', () => file.click());
        file.addEventListener('change', async () => {
            const picture = file.files && file.files[0]; if (!picture) return;
            attach.disabled = true; err.hidden = true;
            try {
                const path = vibe.chat ? `/api/chat/rooms/${encodeURIComponent(vibe.chat.slug)}/pictures` : '/api/chat/vibe/picture';
                const out = await ctx.chatCall(path, { method: 'POST', body: picture, type: picture.type || 'image/jpeg' });
                if (out.room && out.room.slug) { vibe.chat = { slug: out.room.slug }; vibe.fresh = false; ctx.save({ vibe: { slug: out.room.slug, at: new Date().toISOString() } }); }
                openVibe();
            } catch { err.textContent = 'That picture could not be attached. Try again.'; err.hidden = false; }
            finally { attach.disabled = false; file.value = ''; }
        });
        // 350: Build it in Code. What you wrote, else Vibe's last answer, goes to the Code part as a new task's words.
        const build = iconButton('button', 'ovdk-attach ovdk-build', 'M8 7l-5 5 5 5M16 7l5 5-5 5', 'Build it in Code');
        build.addEventListener('click', () => {
            const last = [...vibe.msgs].reverse().find((m) => m.from !== 'you');
            const text = box.value.trim() || (last && last.text) || '';
            if (!text) { box.focus(); return; }
            build.dispatchEvent(new CustomEvent('ov-dock:part', { bubbles: true, detail: { part: 'code', text: text.slice(0, 16000) } }));
        });
        form.append(attach, file, build);
        let mic = null;
        if (TALK) {
            mic = h('button', 'ovdk-mic'); mic.type = 'button'; mic.append(icon(G.mic));
            mic.setAttribute('aria-label', 'Talk to Vibe: hold, or press Alt+V'); mic.title = 'Hold to talk (Alt+V)'; mic.setAttribute('aria-pressed', 'false');
            form.append(mic);
        }
        form.append(box, go);
        panel.append(head, scroll, err, form);
        const fit = () => { box.style.height = 'auto'; box.style.height = `${Math.min(box.scrollHeight, 140)}px`; };
        vibe.fill = (text) => { box.value = String(text || '').slice(0, 8000); fit(); try { box.focus(); box.setSelectionRange(box.value.length, box.value.length); } catch { /* */ } };
        if (vibe.pendingAsk) { vibe.fill(vibe.pendingAsk); vibe.pendingAsk = null; }
        box.addEventListener('input', fit);
        box.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); if (form.requestSubmit) form.requestSubmit(); else form.dispatchEvent(new Event('submit', { cancelable: true })); } });

        async function send(text) {
            if (!text || vibe.busy) return;
            vibe.busy = true; go.disabled = true; err.hidden = true;
            try {
                let timezone = null; try { timezone = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { /* */ }
                const out = await ctx.chatCall('/api/vibe/ask', { method: 'POST', body: JSON.stringify({ message: text, slug: vibe.chat ? vibe.chat.slug : undefined, fresh: vibe.fresh, timezone }) });
                if (generation !== vibe.generation) return;
                if (out.chat) { vibe.chat = out.chat; vibe.fresh = false; away.href = out.chat.url; ctx.save({ vibe: { slug: out.chat.slug, at: new Date().toISOString() } }); }
                box.value = ''; fit();
                const empty = list.querySelector('.ovdk-vibe-start'); if (empty) empty.remove();
                if (out.message && !vibe.msgs.some((x) => x.id === out.message.id)) { list.append(vbubble(out.message, vibe.msgs[vibe.msgs.length - 1])); vibe.msgs.push(out.message); vibe.last = Math.max(vibe.last, out.message.id || 0); }
                vibe.waitUntil = Date.now() + 90000;
                list.append(typing);
                scroll.scrollTop = scroll.scrollHeight;
                clearTimeout(vibe.timer); vibe.timer = setTimeout(() => pull(), 1200);
            } catch (x) {
                showFailure(x, () => send(text));
            } finally { vibe.busy = false; go.disabled = false; box.focus(); }
        }
        form.addEventListener('submit', (e) => { e.preventDefault(); send(box.value.trim()); });
        joinComposer(form);

        async function pull(first) {
            let got;
            try {
                got = vibe.fresh && !vibe.chat ? { chat: null, messages: [] } : await ctx.chatCall(`/api/vibe/chat${vibe.chat ? `?slug=${encodeURIComponent(vibe.chat.slug)}${vibe.last ? `&after=${vibe.last}` : ''}` : ''}`);
            } catch (e) {
                if (first && generation === vibe.generation) { list.textContent = ''; showFailure(e, () => pull(true)); }
                return;
            }
            if (generation !== vibe.generation || !ctx.active() || vibe.panel !== panel) return;
            if (got.chat) { vibe.chat = got.chat; away.href = got.chat.url; title.textContent = got.chat.name || 'Vibe'; }
            if (first) list.textContent = '';
            const atEnd = scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight < 40;
            let answered = false;
            (got.messages || []).forEach((m) => {
                if (vibe.msgs.some((x) => x.id === m.id)) return;
                list.insertBefore(vbubble(m, vibe.msgs[vibe.msgs.length - 1]), typing.parentNode === list ? typing : null);
                vibe.msgs.push(m); vibe.last = Math.max(vibe.last, Number(m.id) || 0);
                if (m.from === 'vibe') answered = true;
                if (!first && Array.isArray(m.results) && m.results.some((r) => r && r.kind === 'timer') && ctx.refresh) ctx.refresh();
            });
            if (answered || Date.now() > vibe.waitUntil) {
                typing.remove();
                if (!answered && vibe.waitUntil && Date.now() > vibe.waitUntil) {
                    showFailure({ status: 503 }, vibe.chat ? async () => { await ctx.chatCall(`/api/chat/vibe/${encodeURIComponent(vibe.chat.slug)}/retry`, { method: 'POST', body: '{}' }); err.hidden = true; vibe.waitUntil = Date.now() + 90000; list.append(typing); pull(); } : null);
                }
                vibe.waitUntil = 0;
            }
            if (first && !vibe.msgs.length) {
                const start = h('li', 'ovdk-vibe-start');
                start.append(h('b', '', 'Ask Vibe anything'), h('span', '', TALK ? 'Type, or hold the mic and say it. It sets reminders, finds what is live, and answers from the whole network.' : 'It sets reminders, finds what is live, and answers from the whole network.'));
                const chips = h('div', 'ovdk-chips');
                STARTERS.forEach((s) => { const c = h('button', 'ovdk-chip', s); c.type = 'button'; c.addEventListener('click', () => send(s)); chips.append(c); });
                start.append(chips);
                list.append(start);
            }
            if (first || atEnd || answered) scroll.scrollTop = scroll.scrollHeight;
            clearTimeout(vibe.timer);
            if (ctx.active()) vibe.timer = setTimeout(() => pull(), vibe.waitUntil ? 1500 : 15000);
        }

        // The mic: hold to talk (or a click to start and another to stop), Alt+V from anywhere while the Dock is open.
        if (mic) {
            let said = '', heard = false;
            const stop = () => { if (vibe.rec) { try { vibe.rec.stop(); } catch { /* */ } } };
            const on = (yes) => { mic.classList.toggle('is-on', yes); mic.setAttribute('aria-pressed', yes ? 'true' : 'false'); };
            const fail = (text) => { err.textContent = text; err.hidden = false; };
            // No speech recognition in this browser: record, then Chat's /api/vibe/listen says what was said.
            const record = async () => {
                const type = REC_TYPES.find((t) => { try { return MR.isTypeSupported(t); } catch { return false; } }) || '';
                let stream;
                try { stream = await root.navigator.mediaDevices.getUserMedia({ audio: true }); } catch (e) {
                    return fail(e && e.name === 'NotAllowedError' ? 'The microphone is off for this site: allow it in the browser to talk to Vibe.' : 'No microphone was found.');
                }
                const chunks = [];
                let r;
                try { r = new MR(stream, { ...(type ? { mimeType: type } : {}), audioBitsPerSecond: 32000 }); } catch { stream.getTracks().forEach((t) => t.stop()); return fail('This browser cannot record here.'); }
                const cap = setTimeout(stop, REC_MAX_MS);
                r.ondataavailable = (ev) => { if (ev.data && ev.data.size) chunks.push(ev.data); };
                r.onstop = async () => {
                    clearTimeout(cap); vibe.rec = null; on(false);
                    stream.getTracks().forEach((t) => t.stop());
                    const kind = String(r.mimeType || type || 'audio/webm').split(';')[0];
                    const blob = new Blob(chunks, { type: kind });
                    if (blob.size < 800) { box.placeholder = 'Ask Vibe, or hold the mic'; return; }
                    box.placeholder = 'Working out what you said…'; mic.disabled = true;
                    try {
                        const lang = String(document.documentElement.lang || root.navigator.language || 'en').slice(0, 2).toLowerCase();
                        const out = await ctx.chatCall(`/api/vibe/listen?lang=${encodeURIComponent(/^[a-z]{2}$/.test(lang) ? lang : 'en')}`, { method: 'POST', body: blob, type: kind });
                        const said = String((out && out.text) || '').trim();
                        if (said) { box.value = said; fit(); send(said); } else fail('I could not hear that. Try again, a little closer.');
                    } catch (e) {
                        fail(e && e.status === 429 ? 'That is a lot of talking for one minute: type it, or try again shortly.' : e && e.status === 413 ? 'Keep it under 30 seconds.' : 'I could not hear that just now. Try again, or type it.');
                    } finally { mic.disabled = false; box.placeholder = 'Ask Vibe, or hold the mic'; }
                };
                vibe.rec = r; err.hidden = true; on(true); box.placeholder = 'Listening… let go or tap to send';
                try { r.start(); } catch { vibe.rec = null; on(false); stream.getTracks().forEach((t) => t.stop()); }
            };
            const start = () => {
                if (vibe.rec) return stop();
                if (!SR) return record();
                const r = new SR();
                r.lang = document.documentElement.lang || navigator.language || 'en-US';
                r.interimResults = true; r.continuous = false;
                said = ''; heard = false;
                r.onresult = (ev) => {
                    let text = '';
                    for (let i = 0; i < ev.results.length; i++) text += ev.results[i][0].transcript;
                    said = text.trim(); heard = true; box.value = said; fit();
                };
                r.onerror = (ev) => {
                    if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed') { err.textContent = 'The microphone is off for this site: allow it in the browser to talk to Vibe.'; err.hidden = false; }
                };
                r.onend = () => {
                    vibe.rec = null; mic.classList.remove('is-on'); mic.setAttribute('aria-pressed', 'false');
                    if (heard && said) send(said);
                };
                vibe.rec = r;
                mic.classList.add('is-on'); mic.setAttribute('aria-pressed', 'true');
                try { r.start(); } catch { vibe.rec = null; mic.classList.remove('is-on'); }
            };
            let held = 0;
            mic.addEventListener('pointerdown', (e) => { if (e.button !== 0) return; held = Date.now(); start(); });
            mic.addEventListener('pointerup', () => { if (held && Date.now() - held > 400) stop(); held = 0; });
            mic.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); start(); } });
            vibe.talk = start;
        }
        list.append(h('li', 'ovdk-wait', null));
        list.firstChild.innerHTML = '<span></span>';
        await pull(true);
        // A touch screen does not get the keyboard on opening (11-09, the owner: it "immediately opens the keyboard… you
        // can't see the chat input or what it did"): the answer and the box show first; a tap on the box types.
        if (!(typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches)) setTimeout(() => { try { box.focus({ preventScroll: true }); } catch { /* */ } }, 0);
    }

    function mount(panel, c) {
        ctx = c || {};
        G = { mic: MIC, ...(ctx.icons || {}) };
        const st = typeof ctx.styles === 'function' ? ctx.styles() : null;
        if (st && !st.textContent.includes('.ovdk-vibe-start')) st.textContent += CSS;
        else if (!st && !document.getElementById('ovdk-vibe-styles')) { const s = document.createElement('style'); s.id = 'ovdk-vibe-styles'; s.textContent = CSS; document.head.appendChild(s); }
        vibe.panel = panel;
        // The Chats tab's AI chats row asks for the list, not for the last conversation.
        const onList = ctx.wantList ? ctx.wantList() : false;
        const selected = ctx.state && ctx.state().vibe;
        if (!onList && selected && selected.slug && Date.now() - Date.parse(selected.at) < 20 * 60000) { vibe.chat = { slug: selected.slug }; openVibe(); }
        else openList();
        return {
            refresh: () => { vibe.panel = panel; const list = ctx.wantList ? ctx.wantList() : false; if (list) return openList(); return vibe.view === 'list' ? openList() : openVibe(); },
            list: () => { vibe.panel = panel; return openList(); },
            pause: () => { vibe.generation++; clearTimeout(vibe.timer); if (vibe.rec) { try { vibe.rec.abort(); } catch { /* */ } } },
            talk: () => { if (vibe.talk) vibe.talk(); },
            // A page's "Ask your agent" (4.135.0): the question waits in the box, with its context, for the person to send.
            ask: (text) => { if (vibe.view === 'list') { vibe.pendingAsk = text; vibe.fresh = true; openVibe(); } else if (vibe.fill) vibe.fill(text); else vibe.pendingAsk = text; },
        };
    }
    root.OpenVibeDockVibe = { mount };
})(typeof window !== 'undefined' ? window : globalThis);
