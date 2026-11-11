// ═══════════════════════════════════════════════════════════════
// OpenVibe — the Code part (openvibe-shared 4.201.0). Ask 350, the owner: openvibe.codes "should be better interconnected
// and shared … so that you can do chat, codes, and agents all in the same place and in one area". The menu's Vibe place
// is Chat · Code · Agents, and the Dock has the same Code tab. dock.js loads this file the first time it opens:
//   OpenVibeDockCode.mount(container, { token, frameBase, base, codes, active, take }) → { refresh(), focus(), destroy() }
// take() → the words another part handed over (Vibe's "Build it in Code"), which go in the box.
//
// One box to start a coding task, the way openvibe.codes starts one (Create: a new website, game or app; OpenVibe:
// a change to OpenVibe itself; My code: a repository of yours), and your latest tasks under it, running ones first,
// each with its state, its repository, how long ago, and Stop while it runs. The reads go through Network's same-origin
// relay (/api/frame/codes-tasks…), because every site's connect-src allows openvibe.network and refuses openvibe.codes;
// `base` reaches Codes itself in a test. While a task runs the list is read again every 8 seconds, only while the part
// is on screen. When Codes cannot be reached, the box still works: it opens openvibe.codes with what you wrote in it.
// Everything is set as text, never markup; a task's address is used only when it is on openvibe.codes.
// ═══════════════════════════════════════════════════════════════
(function (root) {
    'use strict';
    if (typeof document === 'undefined' || root.OpenVibeDockCode) return;

    const CODES = 'https://openvibe.codes';
    const SCRIPT_BASE = document.currentScript && document.currentScript.src ? new URL('.', document.currentScript.src).href : '/shared/';
    const POLL_MS = 8000;
    const MODES = [['create', 'Create', 'A new website, game or app'], ['openvibe', 'OpenVibe', 'A change to OpenVibe itself'], ['repo', 'My code', 'A repository of yours']];
    const STATE = { queued: 'Waiting', running: 'Running', 'needs-you': 'Needs you', done: 'Done', failed: 'Failed', stopped: 'Stopped' };
    const PLACEHOLDER = { create: 'A goal bar for my sub goal', openvibe: 'Make the menu remember my last tab', repo: 'Fix the login redirect and add a test' };
    const svg = (d) => `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;
    const G = {
        send: 'M5 12h13M13 6l6 6-6 6',
        stop: 'M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18zM9.5 9.5h5v5h-5z',
        open: 'M14 4h6v6M20 4l-9 9M19 14v5a1.5 1.5 0 0 1-1.5 1.5h-12A1.5 1.5 0 0 1 4 19V7a1.5 1.5 0 0 1 1.5-1.5H10',
        code: 'M8 7l-5 5 5 5M16 7l5 5-5 5',
    };

    function styles(d) {
        if (d.getElementById('ovdc-styles')) return;
        const st = d.createElement('style');
        st.id = 'ovdc-styles';
        st.textContent = `
            .ovdc { display: flex; flex-direction: column; gap: 12px; padding: 10px 10px 14px; }
            .ovdc-box { display: grid; gap: 8px; padding: 10px 10px 8px 12px; border-radius: 18px; border: 1px solid var(--border, rgba(255,255,255,.1)); background: var(--bg-card, rgba(255,255,255,.03)); }
            .ovdc-box:focus-within { border-color: color-mix(in srgb, var(--accent, #3b82f6) 60%, var(--border, rgba(255,255,255,.1))); }
            .ovdc-text { display: block; width: 100%; box-sizing: border-box; min-height: 44px; max-height: 30vh; padding: 2px 0; border: 0; outline: 0; resize: none; background: none; color: var(--text-primary, #ececf1); font: inherit; font-size: 15.5px; line-height: 1.45; }
            .ovdc-repo { width: 100%; box-sizing: border-box; height: 36px; padding: 0 10px; border-radius: 10px; border: 1px solid var(--border, rgba(255,255,255,.12)); background: var(--bg-input, rgba(0,0,0,.2)); color: inherit; font: inherit; font-size: 14px; }
            .ovdc-repo[hidden] { display: none; }
            .ovdc-row { display: flex; align-items: center; gap: 6px; }
            .ovdc-modes { flex: 1; min-width: 0; display: flex; gap: 4px; overflow-x: auto; scrollbar-width: none; }
            .ovdc-mode { flex: none; height: 32px; padding: 0 11px; border-radius: 999px; border: 1px solid transparent; background: none; color: var(--text-secondary, #a8b3c4); font: inherit; font-size: 13px; font-weight: 600; cursor: pointer; }
            .ovdc-mode:hover { color: var(--text-primary, #ececf1); background: var(--bg-hover, rgba(255,255,255,.06)); }
            .ovdc-mode[aria-checked="true"] { color: var(--accent-light, #93c5fd); border-color: color-mix(in srgb, var(--accent, #3b82f6) 45%, transparent); background: color-mix(in srgb, var(--accent, #3b82f6) 14%, transparent); }
            .ovdc-go { flex: none; display: grid; place-items: center; width: 40px; height: 40px; border: 0; border-radius: 13px; background: var(--accent, #3b82f6); color: var(--on-accent, #fff); cursor: pointer; }
            .ovdc-go:disabled { opacity: .45; cursor: default; }
            .ovdc-note { margin: 0 2px; font-size: 12.5px; color: var(--text-muted, #8b8b96); }
            .ovdc-note:empty { display: none; }
            .ovdc-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 0 4px; }
            .ovdc-head b { font-size: 13px; letter-spacing: .02em; color: var(--text-secondary, #a8b3c4); }
            .ovdc-all { display: inline-flex; align-items: center; gap: 5px; min-height: 32px; font-size: 13px; font-weight: 600; color: var(--accent-light, #93c5fd); text-decoration: none; }
            .ovdc-all svg { width: 15px; height: 15px; }
            .ovdc-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 2px; }
            .ovdc-task { display: grid; grid-template-columns: 1fr auto; align-items: center; gap: 8px; border-radius: 12px; }
            .ovdc-task:hover { background: var(--bg-hover, rgba(255,255,255,.05)); }
            .ovdc-a { min-width: 0; display: grid; gap: 3px; padding: 9px 4px 9px 10px; color: inherit; text-decoration: none; }
            .ovdc-t { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 14.5px; font-weight: 600; color: var(--text-primary, #ececf1); }
            .ovdc-m { display: flex; align-items: center; gap: 7px; min-width: 0; font-size: 12.5px; color: var(--text-muted, #8b8b96); white-space: nowrap; overflow: hidden; }
            .ovdc-s { flex: none; display: inline-flex; align-items: center; gap: 5px; font-weight: 650; }
            .ovdc-s::before { content: ""; width: 7px; height: 7px; border-radius: 50%; background: currentColor; }
            .ovdc-s[data-s="running"], .ovdc-s[data-s="queued"] { color: var(--accent-light, #93c5fd); }
            .ovdc-s[data-s="running"]::before { animation: ovdc-beat 1.2s ease-in-out infinite; }
            .ovdc-s[data-s="needs-you"] { color: #fbbf24; }
            .ovdc-s[data-s="done"] { color: #4ade80; }
            .ovdc-s[data-s="failed"] { color: var(--live-red, #f87171); }
            .ovdc-s[data-s="stopped"] { color: var(--text-muted, #8b8b96); }
            .ovdc-stop { display: grid; place-items: center; width: 36px; height: 36px; margin-right: 4px; border: 0; border-radius: 10px; background: none; color: var(--text-secondary, #a8b3c4); cursor: pointer; }
            .ovdc-stop:hover, .ovdc-stop:focus-visible { background: color-mix(in srgb, var(--live-red, #ef4444) 14%, transparent); color: var(--live-red, #f87171); }
            .ovdc-stop svg { width: 19px; height: 19px; }
            .ovdc-none { padding: 18px 12px; text-align: center; color: var(--text-muted, #8b8b96); font-size: 13.5px; line-height: 1.45; }
            .ovdc-none a { color: var(--accent-light, #93c5fd); }
            @keyframes ovdc-beat { 50% { opacity: .35; } }
            html[data-ov-motion=off] .ovdc-s::before { animation: none; }`;
        d.head.appendChild(st);
    }

    const ago = (t) => {
        const s = Math.max(0, (Date.now() - new Date(t).getTime()) / 1000);
        if (!isFinite(s)) return '';
        return s < 60 ? 'just now' : s < 3600 ? `${Math.floor(s / 60)} min ago` : s < 86400 ? `${Math.floor(s / 3600)} h ago` : `${Math.floor(s / 86400)} d ago`;
    };
    const onCodes = (u) => { try { const x = new URL(u); return x.protocol === 'https:' && (x.hostname === 'openvibe.codes' || x.hostname.endsWith('.openvibe.codes')) ? x.href : null; } catch { return null; } };
    const repoName = (r) => String(r || '').replace(/^https?:\/\/[^/]+\//, '').replace(/\.git$/, '');

    function mount(container, opts = {}) {
        const d = container.ownerDocument || document;
        styles(d);
        const o = { ...opts };
        const tok = () => (typeof o.token === 'function' ? o.token() : o.token) || null;
        const codes = String(o.codes || CODES).replace(/\/+$/, '');
        const direct = o.base ? String(o.base).replace(/\/+$/, '') : '';
        const relay = String(o.frameBase || 'https://openvibe.network/api/frame').replace(/\/+$/, '');
        const url = (what, id) => (direct
            ? direct + ({ list: '/api/v1/me/tasks?limit=8', start: '/api/v1/tasks', stop: `/api/v1/tasks/${encodeURIComponent(id)}/stop` })[what]
            : relay + ({ list: '/codes-tasks?limit=8', start: '/codes-tasks', stop: `/codes-tasks/${encodeURIComponent(id)}/stop` })[what]);
        const h = (tag, cls, text) => { const n = d.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
        let gone = false, timer = 0, mode = 'create', tasks = null, reachable = true;

        function loadScript(file, ready) {
            if (ready()) return Promise.resolve(true);
            return new Promise((resolve) => {
                const id = `ovdc-${file}`;
                let script = d.getElementById(id);
                if (!script) { script = d.createElement('script'); script.id = id; script.src = SCRIPT_BASE + file; script.async = true; d.head.appendChild(script); }
                script.addEventListener('load', () => resolve(!!ready()), { once: true });
                script.addEventListener('error', () => resolve(false), { once: true });
            });
        }
        function runUrl(id) {
            return (direct ? direct + '/api/v1/runs/' : relay + '/codes-runs/') + encodeURIComponent(id);
        }
        async function openRun(task, from) {
            const href = onCodes(task.url);
            if (!href || !tok()) return;
            const loaded = await Promise.all([
                loadScript('ov-window.js', () => !!root.OVWindow),
                loadScript('agent-session.js', () => !!root.OpenVibeAgentSession)
            ]);
            if (loaded.some((ok) => !ok)) { d.defaultView.location.assign(href); return; }
            const body = h('div');
            let stopped = false, controller = null, view = null;
            const win = root.OVWindow.open({ id: `codes-run-${task.id}`, title: task.title || 'Coding task', body, kind: 'dialog', size: 'md', from,
                onClose: () => { stopped = true; if (controller) controller.abort(); if (view) view.destroy(); } });
            body.appendChild(h('p', 'ovdc-none', 'Loading the run…'));
            const headers = () => ({ Authorization: `Bearer ${tok()}`, Accept: 'application/json' });
            try {
                const res = await fetch(runUrl(task.id), { headers: headers(), credentials: 'omit' });
                if (!res.ok) throw new Error('The run could not be read.');
                const run = await res.json();
                if (stopped) return;
                body.replaceChildren();
                view = root.OpenVibeAgentSession.mount(body, { title: run.title || task.title || 'Coding task',
                    status: run.status || task.status || 'running', mode: 'card', href });
                let last = 0;
                while (!stopped) {
                    controller = new AbortController();
                    const events = await fetch(runUrl(task.id) + '/events', { credentials: 'omit',
                        headers: { ...headers(), Accept: 'text/event-stream', 'Last-Event-ID': String(last) }, signal: controller.signal });
                    if (!events.ok || !events.body) break;
                    const reader = events.body.getReader();
                    const decoder = new TextDecoder();
                    let buffer = '', terminal = false;
                    while (!stopped) {
                        const part = await reader.read();
                        if (part.done) break;
                        buffer = (buffer + decoder.decode(part.value, { stream: true })).replace(/\r\n/g, '\n');
                        let cut;
                        while ((cut = buffer.indexOf('\n\n')) !== -1) {
                            const frame = buffer.slice(0, cut); buffer = buffer.slice(cut + 2);
                            const id = /^id: *(\d+)$/m.exec(frame), data = frame.split('\n').filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trimStart()).join('\n');
                            if (id) last = Number(id[1]);
                            if (!data) continue;
                            try { const event = JSON.parse(data); view.push(event); if (event.type === 'RUN_FINISHED' || event.type === 'RUN_ERROR') terminal = true; } catch { /* skip one malformed event */ }
                        }
                    }
                    if (terminal || !/running|queued|placed/.test(run.status || '')) break;
                    await new Promise((resolve) => setTimeout(resolve, 1500));
                }
            } catch (err) {
                if (!stopped) { body.replaceChildren(); const a = h('a', 'ovk-btn ovk-btn--quiet', 'Open on Codes'); a.href = href; body.appendChild(a); }
            }
            return win;
        }

        container.innerHTML = '';
        container.classList.add('ovdc');
        const box = h('form', 'ovdc-box');
        box.setAttribute('aria-label', 'Start a coding task');
        const text = h('textarea', 'ovdc-text');
        text.rows = 2; text.maxLength = 16000; text.placeholder = PLACEHOLDER.create;
        text.setAttribute('aria-label', 'What should we make?');
        const repo = h('input', 'ovdc-repo');
        repo.placeholder = 'Repository: owner/name or its address'; repo.setAttribute('aria-label', 'Repository'); repo.hidden = true; repo.maxLength = 300;
        const row = h('div', 'ovdc-row');
        const modes = h('div', 'ovdc-modes');
        modes.setAttribute('role', 'radiogroup'); modes.setAttribute('aria-label', 'Where it works');
        for (const [id, label, hint] of MODES) {
            const b = h('button', 'ovdc-mode', label);
            b.type = 'button'; b.dataset.mode = id; b.title = hint;
            b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', String(id === mode));
            modes.appendChild(b);
        }
        const go = h('button', 'ovdc-go'); go.type = 'submit'; go.innerHTML = svg(G.send); go.setAttribute('aria-label', 'Start'); go.disabled = true;
        row.append(modes, go);
        const note = h('p', 'ovdc-note'); note.setAttribute('role', 'status');
        box.append(text, repo, row, note);
        const head = h('div', 'ovdc-head');
        const all = h('a', 'ovdc-all'); all.href = `${codes}/`; all.innerHTML = `<span>Open Codes</span>${svg(G.open)}`;
        head.append(h('b', null, 'Your tasks'), all);
        const list = h('ul', 'ovdc-list');
        container.append(box, head, list);

        const ready = () => { go.disabled = !text.value.trim() || (mode === 'repo' && !repo.value.trim()); };
        text.addEventListener('input', () => { text.style.height = 'auto'; text.style.height = Math.min(text.scrollHeight, d.defaultView.innerHeight * 0.3) + 'px'; ready(); });
        repo.addEventListener('input', ready);
        text.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !go.disabled) { e.preventDefault(); box.requestSubmit ? box.requestSubmit() : start(); } });
        modes.addEventListener('click', (e) => {
            const b = e.target.closest && e.target.closest('[data-mode]'); if (!b) return;
            mode = b.dataset.mode;
            modes.querySelectorAll('[data-mode]').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
            text.placeholder = PLACEHOLDER[mode];
            repo.hidden = mode !== 'repo';
            ready();
            (mode === 'repo' && !repo.value ? repo : text).focus();
        });

        const fallback = () => `${codes}/?${new URLSearchParams({ prompt: text.value.trim(), mode, ...(mode === 'repo' ? { repo: repo.value.trim() } : {}) })}`;
        async function call(what, id, body) {
            const t = tok(); if (!t) throw new Error('signed out');
            const r = await fetch(url(what, id), { method: body || what === 'stop' ? 'POST' : 'GET', headers: { authorization: `Bearer ${t}`, accept: 'application/json', ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined, credentials: 'omit' });
            if (!r.ok) { const e = new Error(`HTTP ${r.status}`); e.status = r.status; try { e.body = await r.json(); } catch { /* */ } throw e; }
            return r.json().catch(() => ({}));
        }
        async function start() {
            if (go.disabled) return;
            if (!reachable) { d.defaultView.location.assign(fallback()); return; }
            go.disabled = true; note.textContent = 'Starting…';
            try {
                const r = await call('start', null, { text: text.value.trim(), mode, ...(mode === 'repo' ? { repo: repo.value.trim() } : {}) });
                text.value = ''; text.dispatchEvent(new Event('input'));
                note.textContent = '';
                const there = onCodes(r && r.url);
                if (there) { const a = h('a', null, 'Follow it on openvibe.codes'); a.href = there; note.textContent = 'Started. '; note.appendChild(a); }
                read();
            } catch (e) {
                ready();
                if (e.status === 404 || e.status === 502 || e.status === 503 || e.message === 'Failed to fetch') { d.defaultView.location.assign(fallback()); return; }
                note.textContent = (e.body && (e.body.message || e.body.error)) || 'It did not start. Try again in a moment.';
            }
        }
        box.addEventListener('submit', (e) => { e.preventDefault(); start(); });

        function paint() {
            list.replaceChildren();
            if (!tok()) { list.appendChild(h('li', 'ovdc-none', 'Sign in to start coding tasks and follow them here.')); return; }
            if (!reachable) {
                const li = h('li', 'ovdc-none');
                li.append('Your tasks are on ');
                const a = h('a', null, 'openvibe.codes'); a.href = `${codes}/`; li.append(a, '. Starting one here opens it there.');
                list.appendChild(li); return;
            }
            if (!tasks) return;
            if (!tasks.length) { list.appendChild(h('li', 'ovdc-none', 'Nothing yet. Say what to make, and an agent builds it while you watch.')); return; }
            for (const t of tasks) {
                const li = h('li', 'ovdc-task');
                const there = onCodes(t.url);
                const a = h(there ? 'a' : 'div', 'ovdc-a');
                if (there) { a.href = there; a.addEventListener('click', (event) => {
                    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                    event.preventDefault(); openRun(t, a);
                }); }
                a.appendChild(h('span', 'ovdc-t', t.title || 'A coding task'));
                const m = h('span', 'ovdc-m');
                const s = h('span', 'ovdc-s', STATE[t.status] || t.status || ''); s.dataset.s = t.status || '';
                m.appendChild(s);
                const bits = [t.mode === 'repo' && t.repo ? repoName(t.repo) : t.mode === 'openvibe' ? 'OpenVibe' : null, t.steps ? `${t.steps} steps` : null, ago(t.updated_at || t.started_at)].filter(Boolean);
                if (bits.length) m.appendChild(h('span', null, bits.join(' · ')));
                a.appendChild(m);
                li.appendChild(a);
                if (t.status === 'running' || t.status === 'queued' || t.status === 'needs-you') {
                    const x = h('button', 'ovdc-stop'); x.type = 'button'; x.innerHTML = svg(G.stop); x.setAttribute('aria-label', `Stop: ${t.title || 'this task'}`); x.title = 'Stop';
                    x.addEventListener('click', async () => { x.disabled = true; try { await call('stop', t.id); } catch { /* the next read says */ } read(); });
                    li.appendChild(x);
                }
                list.appendChild(li);
            }
        }
        async function read() {
            clearTimeout(timer);
            if (gone || !tok()) { paint(); return; }
            try {
                const j = await call('list');
                reachable = true;
                tasks = (Array.isArray(j) ? j : j.tasks || []).slice(0, 8);
                tasks.sort((a, b) => (/running|queued|needs-you/.test(b.status) ? 1 : 0) - (/running|queued|needs-you/.test(a.status) ? 1 : 0));
            } catch (e) {
                if (e.status === 401 || e.status === 403) tasks = [];
                else reachable = false;
            }
            if (gone) return;
            paint();
            if (reachable && tasks && tasks.some((t) => /running|queued/.test(t.status)) && (!o.active || o.active())) timer = setTimeout(read, POLL_MS);
        }
        // What another part handed over (Vibe's Build it in Code) goes in the box, ready to start.
        const take = () => { const t = typeof o.take === 'function' ? o.take() : ''; if (!t) return; text.value = t; text.dispatchEvent(new Event('input')); text.focus(); note.textContent = 'From your chat with Vibe. Start it, or change it first.'; };
        paint();
        read();
        take();
        return {
            refresh: () => { take(); read(); },
            focus: () => text.focus(),
            destroy() { gone = true; clearTimeout(timer); container.replaceChildren(); container.classList.remove('ovdc'); },
        };
    }

    root.OpenVibeDockCode = { mount };
    if (typeof module === 'object' && module.exports) module.exports = { mount };
})(typeof window !== 'undefined' ? window : globalThis);
