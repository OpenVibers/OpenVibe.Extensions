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
    const MIC = '<rect x="9" y="3.5" width="6" height="10.5" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5v3"/>';
    const CSS = `
            .ovdk-vibe-h .ovdk-i { color: var(--accent, #3b82f6); margin-left: 6px; }
            .ovdk-away { margin-left: auto; font-size: 12.5px; font-weight: 650; color: var(--accent, #3b82f6); text-decoration: none; white-space: nowrap; }
            .ovdk-away:hover { text-decoration: underline; }
            .ovdk-msg.is-vibe .ovdk-text a { color: var(--accent, #3b82f6); text-decoration: underline; word-break: break-all; }
            .ovdk-typing .ovdk-text { display: inline-flex; gap: 4px; align-items: center; padding: 10px 12px; }
            .ovdk-typing i { width: 6px; height: 6px; border-radius: 50%; background: var(--text-muted, #8b8b96); animation: ovdk-hop 1s ease-in-out infinite; }
            .ovdk-typing i:nth-child(2) { animation-delay: .15s; } .ovdk-typing i:nth-child(3) { animation-delay: .3s; }
            .ovdk-vibe-start { list-style: none; display: grid; gap: 6px; padding: 18px 6px 8px; text-align: center; color: var(--text-muted, #8b8b96); font-size: 13.5px; line-height: 1.45; }
            .ovdk-vibe-start b { color: var(--text-primary, #ececf1); font-size: 15.5px; }
            .ovdk-chips { display: flex; flex-wrap: wrap; justify-content: center; gap: 6px; margin-top: 8px; }
            .ovdk-chip { padding: 7px 12px; border-radius: 999px; border: 1px solid var(--border, rgba(255,255,255,.12)); background: transparent; color: var(--text-primary, #ececf1); font: inherit; font-size: 12.5px; cursor: pointer; }
            .ovdk-chip:hover { border-color: var(--accent, #3b82f6); }
            .ovdk-mic { width: 40px; height: 40px; flex: none; margin-left: -8px; border: 0; border-radius: 12px; cursor: pointer; display: grid; place-items: center; background: transparent; color: var(--text-muted, #8b8b96); touch-action: none; }
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
            @media (prefers-reduced-motion: reduce) { .ovdk-typing i { animation: none; } }
`;
    let ctx = null, G = {};
    const icon = (path) => { const s = h('span', 'ovdk-i'); s.innerHTML = svg(path); return s; };

    // ── Vibe (plan L48 V2; the owner, 11-01: "access your agent or the AI… from across all websites… use a voice
    // feature to tell it to set a reminder… have a conversation with your Vibe AI") ──
    // The same conversation as openvibe.chat/vibe, through Chat's /api/vibe with the person's Network token: what is
    // asked on Live carries on on Chat and back. Vibe answers in the background; the tab waits for it (a quick poll
    // for a minute and a half after a message, then every 15 s while the tab is open). The mic is the browser's own
    // speech recognition, hold to talk or Alt+V, and only while the person asks: no wake word, never always on. A
    // browser without it (Firefox) records instead, up to 30 s, and Chat's /api/vibe/listen turns that into text
    // (OpenVibe.AI's speech-to-text on this network's own machines; the recording is never kept).
    // Everything is set as text; a link is a link only when it is https.
    const vibe = { panel: null, chat: null, msgs: [], last: 0, timer: 0, busy: false, waitUntil: 0, rec: null, talk: null };
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
    async function openVibe() {
        clearTimeout(vibe.timer);
        const panel = vibe.panel; if (!panel) return;
        vibe.msgs = []; vibe.last = 0;
        panel.textContent = '';
        const head = h('div', 'ovdk-thread-h ovdk-vibe-h');
        const title = h('b', '', 'Vibe');
        const away = h('a', 'ovdk-away', 'Open in Chat'); away.href = 'https://openvibe.chat/vibe'; away.target = '_blank'; away.rel = 'noopener';
        head.append(icon(G.vibe), title, away);
        const list = h('ol', 'ovdk-msgs'); list.setAttribute('aria-live', 'polite');
        const scroll = h('div', 'ovdk-scroll ovdk-thread'); scroll.append(list);
        const typing = h('li', 'ovdk-msg is-vibe ovdk-typing'); typing.innerHTML = '<span class="ovdk-text"><i></i><i></i><i></i></span>'; typing.setAttribute('aria-label', 'Vibe is writing');
        const form = h('form', 'ovdk-send');
        const box = h('textarea'); box.rows = 1; box.maxLength = 8000; box.placeholder = TALK ? 'Ask Vibe, or hold the mic' : 'Ask Vibe'; box.setAttribute('aria-label', 'Message Vibe');
        const go = h('button', 'ovdk-go'); go.type = 'submit'; go.setAttribute('aria-label', 'Send'); go.append(icon(G.send));
        const err = h('p', 'ovdk-err'); err.hidden = true;
        let mic = null;
        if (TALK) {
            mic = h('button', 'ovdk-mic'); mic.type = 'button'; mic.append(icon(G.mic));
            mic.setAttribute('aria-label', 'Talk to Vibe: hold, or press Alt+V'); mic.title = 'Hold to talk (Alt+V)'; mic.setAttribute('aria-pressed', 'false');
            form.append(mic);
        }
        form.append(box, go);
        panel.append(head, scroll, err, form);
        const fit = () => { box.style.height = 'auto'; box.style.height = `${Math.min(box.scrollHeight, 140)}px`; };
        box.addEventListener('input', fit);
        box.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); if (form.requestSubmit) form.requestSubmit(); else form.dispatchEvent(new Event('submit', { cancelable: true })); } });

        async function send(text) {
            if (!text || vibe.busy) return;
            vibe.busy = true; go.disabled = true; err.hidden = true;
            try {
                let timezone = null; try { timezone = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { /* */ }
                const out = await ctx.chatCall('/api/vibe/ask', { method: 'POST', body: JSON.stringify({ message: text, slug: vibe.chat ? vibe.chat.slug : undefined, timezone }) });
                if (out.chat) { vibe.chat = out.chat; away.href = out.chat.url; }
                box.value = ''; fit();
                const empty = list.querySelector('.ovdk-vibe-start'); if (empty) empty.remove();
                if (out.message && !vibe.msgs.some((x) => x.id === out.message.id)) { list.append(vbubble(out.message, vibe.msgs[vibe.msgs.length - 1])); vibe.msgs.push(out.message); vibe.last = Math.max(vibe.last, out.message.id || 0); }
                vibe.waitUntil = Date.now() + 90000;
                list.append(typing);
                scroll.scrollTop = scroll.scrollHeight;
                clearTimeout(vibe.timer); vibe.timer = setTimeout(() => pull(), 1200);
            } catch (x) {
                err.textContent = x.status === 429 ? 'That is a lot of questions at once: wait a minute, then ask again.' : x.status === 401 ? 'Sign in again to talk to Vibe.' : 'That did not reach Vibe. Try again.';
                err.hidden = false;
            } finally { vibe.busy = false; go.disabled = false; box.focus(); }
        }
        form.addEventListener('submit', (e) => { e.preventDefault(); send(box.value.trim()); });

        async function pull(first) {
            let got;
            try {
                got = await ctx.chatCall(`/api/vibe/chat${vibe.chat ? `?slug=${encodeURIComponent(vibe.chat.slug)}${vibe.last ? `&after=${vibe.last}` : ''}` : ''}`);
            } catch (e) {
                if (first) { list.textContent = ''; list.append(h('li', 'ovdk-none', e.status === 401 ? 'Sign in to OpenVibe.Chat to talk to Vibe.' : 'Vibe did not answer just now. Try again in a moment.')); }
                return;
            }
            if (!ctx.active() || vibe.panel !== panel) return;
            if (got.chat) { vibe.chat = got.chat; away.href = got.chat.url; }
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
            if (answered || Date.now() > vibe.waitUntil) { typing.remove(); vibe.waitUntil = 0; }
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
        setTimeout(() => { try { box.focus({ preventScroll: true }); } catch { /* */ } }, 0);
    }

    function mount(panel, c) {
        ctx = c || {};
        G = { mic: MIC, ...(ctx.icons || {}) };
        const st = typeof ctx.styles === 'function' ? ctx.styles() : null;
        if (st && !st.textContent.includes('.ovdk-vibe-start')) st.textContent += CSS;
        else if (!st && !document.getElementById('ovdk-vibe-styles')) { const s = document.createElement('style'); s.id = 'ovdk-vibe-styles'; s.textContent = CSS; document.head.appendChild(s); }
        vibe.panel = panel;
        openVibe();
        return {
            refresh: () => { vibe.panel = panel; return openVibe(); },
            pause: () => { clearTimeout(vibe.timer); if (vibe.rec) { try { vibe.rec.abort(); } catch { /* */ } } },
            talk: () => { if (vibe.talk) vibe.talk(); },
        };
    }
    root.OpenVibeDockVibe = { mount };
})(typeof window !== 'undefined' ? window : globalThis);
