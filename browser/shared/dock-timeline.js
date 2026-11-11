// ═══════════════════════════════════════════════════════════════
// OpenVibe — the Dock's Agent panel (design 2026-11-07: one agent, one timeline behind the Dock), Shared 4.126.0
//
//   OpenVibeDockTimeline.mount(container, { token, base, active, focus })  → { refresh(), destroy() }
//
// `token` is the person's own Network token: a string, or the function the navbar hands over (which
// resolves it when it is needed). Nothing is asked without it: a signed-out page can never read the timeline.
// OpenVibe.Actor's API is GET /api/v1/agent/timeline (the person's own steps, newest first, with the cursor and the
// mode and needs-you filters), POST /api/v1/agent/approvals/:product/:id/decide (an approval is answered in the mode
// that owns it) and POST /api/v1/agent/kill-switch (stop what is open and pause the agent). On a site every call goes
// through Network's same-origin relay (/api/frame/agent…, /api/frame/tasks…) because every site's connect-src allows
// openvibe.network and refuses openvibe.actor; `base` reaches Actor itself in a test, and `frameBase` names the relay.
// `focus` is the id of the step to point at (the task id a site opened the Dock with): the entry that
// carries it is marked and brought into view.
//
// The panel is what the person reads:
//   Now       one card for what the agent is doing this moment: the mode's word, the step in plain words, how long,
//             and the mode's own controls (Stop, and Resume when it is paused). Nothing running: "Your agent is idle."
//   Needs you every approval or question from any mode, oldest first, with its buttons in place.
//   Timeline  one entry per step, newest first: the mode, the title, where it ran and why, the outcome, the time
//             and the cost, and a link to the step's own page. A mode change is a line of its own.
//   Folding   today's entries open; earlier days are counted folds ("Yesterday (14)"); a long run of one mode folds
//             into "12 more Code steps".
//   Filters   a chip for each mode and for "Needs you", in the URL of the panel; a filter never hides without a
//             count.
//
// Everything is set as text, never as markup: a title, a reason or a link label never becomes HTML.
// ═══════════════════════════════════════════════════════════════
(function (root) {
    'use strict';
    if (typeof document === 'undefined' || root.OpenVibeDockTimeline) return;

    const POLL_MS = 15000;
    const MODES = [
        { id: 'talk', word: 'Talk' }, { id: 'act', word: 'Act' }, { id: 'run', word: 'Run' },
        { id: 'code', word: 'Code' }, { id: 'browse', word: 'Browse' }, { id: 'watch', word: 'Watch' },
        { id: 'stream', word: 'Stream' },
    ];
    const word = (mode) => (MODES.find((m) => m.id === mode) || { word: 'Agent' }).word;
    const OUTCOME = { done: 'Done', failed: 'Failed', stopped: 'Stopped by you', running: 'Running', waiting: 'Waiting', needs_you: 'Needs you' };

    function el(doc, tag, cls, text) {
        const n = doc.createElement(tag);
        if (cls) n.className = cls;
        if (text !== undefined && text !== null) n.textContent = String(text);
        return n;
    }

    function since(startedAt) {
        const t = Date.parse(String(startedAt || ''));
        if (!Number.isFinite(t)) return '';
        const s = Math.max(0, Math.round((Date.now() - t) / 1000));
        if (s < 60) return s + 's';
        if (s < 3600) return Math.round(s / 60) + ' min';
        return Math.round(s / 3600) + ' h';
    }

    function dayKey(iso) {
        const d = new Date(String(iso || ''));
        if (Number.isNaN(d.getTime())) return '';
        return d.toISOString().slice(0, 10);
    }

    function styles(doc) {
        if (!doc || doc.getElementById('ovdt-styles')) return;
        const st = doc.createElement('style');
        st.id = 'ovdt-styles';
        st.textContent = [
            // The site's own theme (Opus, 11-07): the Dock's tokens, so the panel is the navy of a dark site and the paper
            // of a light one, never a grey card of its own. The site's font, a gutter that clears the panel's edge, one
            // primary button per card, and a breathing dot only on what is really running.
            '.ovdt{font:inherit;font-size:14px;line-height:1.45;color:var(--text-primary,#ececf1);padding:4px 12px 20px}',
            '.ovdt h3{margin:14px 2px 8px;font-size:11px;font-weight:800;letter-spacing:.07em;text-transform:uppercase;color:var(--text-muted,#93a0b4)}',
            '.ovdt h3:first-child{margin-top:6px}',
            '.ovdt-card{border:1px solid var(--border,rgba(255,255,255,.1));border-radius:14px;padding:12px 14px;margin:0 0 8px;background:color-mix(in srgb,var(--text-primary,#ececf1) 4%,transparent)}',
            '.ovdt-needs .ovdt-card{border-color:color-mix(in srgb,var(--warning,#f5a524) 38%,var(--border,rgba(255,255,255,.1)));background:color-mix(in srgb,var(--warning,#f5a524) 7%,transparent)}',
            '.ovdt-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}',
            '.ovdt-needs .ovdt-card>.ovdt-mode{margin-bottom:2px;font-size:11.5px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:color-mix(in srgb,var(--warning,#f5a524) 70%,var(--text-primary,#ececf1))}',
            '.ovdt-mode{font-weight:750}',
            '.ovdt-title{flex:1 1 100%;min-width:0;overflow-wrap:anywhere;font-size:14.5px;font-weight:550}',
            '.ovdt-meta{color:var(--text-muted,#93a0b4);font-size:12.5px;overflow-wrap:anywhere}',
            '.ovdt-outcome{display:inline-flex;align-items:center;gap:6px;padding:2px 9px;border-radius:999px;font-size:11px;font-weight:750;letter-spacing:.04em;text-transform:uppercase;color:var(--text-secondary,#a8b3c4);background:color-mix(in srgb,var(--text-primary,#ececf1) 7%,transparent)}',
            '.ovdt-outcome[data-s="running"]{color:color-mix(in srgb,var(--accent,#3b82f6) 72%,var(--text-primary,#ececf1));background:color-mix(in srgb,var(--accent,#3b82f6) 16%,transparent)}',
            '.ovdt-outcome[data-s="running"]::before{content:"";width:7px;height:7px;border-radius:50%;background:currentColor;animation:ovdt-breathe 1.8s ease-in-out infinite}',
            '.ovdt-outcome[data-s="failed"]{color:var(--danger-light,#f87171);background:color-mix(in srgb,var(--danger,#ef4444) 14%,transparent)}',
            '@keyframes ovdt-breathe{50%{opacity:.35;transform:scale(.8)}}',
            '.ovdt-buttons{display:flex;gap:8px;margin-top:10px;flex-wrap:wrap}',
            '.ovdt-btn{min-height:44px;min-width:44px;padding:0 16px;border-radius:12px;border:1px solid var(--border,rgba(255,255,255,.14));background:transparent;color:inherit;font:inherit;font-weight:650;cursor:pointer}',
            '.ovdt-btn.is-primary{border-color:transparent;background:var(--accent,#3b82f6);color:var(--on-accent,#fff)}',
            '.ovdt-btn.is-stop{border-color:color-mix(in srgb,var(--danger,#ef4444) 45%,transparent);color:var(--danger-light,#f87171)}',
            '.ovdt-btn:disabled{opacity:.55;cursor:default}',
            '.ovdt-btn:focus-visible,.ovdt-chip:focus-visible,.ovdt-fold:focus-visible{outline:2px solid var(--accent-light,var(--accent,#3b82f6));outline-offset:1px}',
            '@media (hover:hover){.ovdt-btn:not(.is-primary):hover,.ovdt-chip:hover{background:color-mix(in srgb,var(--text-primary,#ececf1) 7%,transparent)}.ovdt-btn.is-primary:hover{filter:brightness(1.08)}}',
            '.ovdt-chip{min-height:44px;padding:0 14px;border-radius:999px;border:1px solid var(--border,rgba(255,255,255,.12));background:transparent;color:var(--text-secondary,#a8b3c4);font:inherit;font-size:13.5px;font-weight:650;cursor:pointer;white-space:nowrap;flex:none}',
            '.ovdt-chip[aria-pressed="true"]{color:color-mix(in srgb,var(--accent,#3b82f6) 72%,var(--text-primary,#ececf1));border-color:color-mix(in srgb,var(--accent,#3b82f6) 55%,transparent);background:color-mix(in srgb,var(--accent,#3b82f6) 14%,transparent)}',
            '.ovdt-chips{display:flex;gap:8px;overflow-x:auto;margin:4px -12px 0;padding:6px 12px 10px;scrollbar-width:none;-webkit-overflow-scrolling:touch}',
            '.ovdt-chips::-webkit-scrollbar{display:none}',
            '.ovdt-fold{width:100%;text-align:left;min-height:44px;margin:0 0 8px;padding:0 14px;border-radius:12px;border:1px dashed var(--border,rgba(255,255,255,.16));background:transparent;color:var(--text-secondary,#a8b3c4);font:inherit;font-weight:650;cursor:pointer}',
            '.ovdt-card.ovdt-focus{border-color:color-mix(in srgb,var(--accent,#3b82f6) 55%,transparent)}',
            '.ovdt-empty{color:var(--text-muted,#93a0b4);padding:4px 2px 6px}',
            '.ovdt-card.ovdt-empty{padding:12px 14px}',
            '.ovdt-link{color:color-mix(in srgb,var(--accent,#3b82f6) 72%,var(--text-primary,#ececf1));font-weight:650;text-decoration:none}',
            '@media (max-width:640px){.ovdt-link{display:inline-flex;align-items:center;min-height:44px;padding:0 4px}}',
            '',
        ].join('');
        (doc.head || doc.documentElement).appendChild(st);
    }

    function mount(container, opts = {}) {
        const doc = container.ownerDocument || document;
        styles(doc);
        // Network's frame relay on a site; an explicit base reaches Actor itself (a test).
        const direct = opts.base ? String(opts.base).replace(/\/+$/, '') : '';
        const frameBase = String(opts.frameBase || 'https://openvibe.network/api/frame').replace(/\/+$/, '');
        const endpoint = (path) => (direct ? direct + path : frameBase + path.replace(/^\/api\/v1/, ''));
        const rawToken = opts.token;
        const active = typeof opts.active === 'function' ? opts.active : () => true;
        const focus = typeof opts.focus === 'function' ? opts.focus : () => opts.focus || null;
        const filters = new Set();
        let timer = null;
        let destroyed = false;

        // The navbar hands the Dock a function (the token may change when the person signs in again),
        // so it is resolved when a call is made, never read once at mount.
        async function bearer() {
            const t = typeof rawToken === 'function' ? await rawToken() : rawToken;
            return t ? 'Bearer ' + t : null;
        }

        const wrap = el(doc, 'div', 'ovdt');
        const nowHead = el(doc, 'h3', null, 'Now');
        const nowBox = el(doc, 'div', 'ovdt-now');
        const needsHead = el(doc, 'h3', null, 'Needs you');
        const needsBox = el(doc, 'div', 'ovdt-needs');
        const chips = el(doc, 'div', 'ovdt-chips');
        const list = el(doc, 'div', 'ovdt-list');
        wrap.append(nowHead, nowBox, needsHead, needsBox, chips, list);
        container.appendChild(wrap);

        async function api(path, options = {}) {
            const auth = await bearer();
            if (!auth) throw new Error('Sign in to see your agent');
            const res = await fetch(endpoint(path), Object.assign({ headers: { Accept: 'application/json', Authorization: auth } }, options));
            const body = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error((body && (body.detail || body.title)) || ('HTTP ' + res.status));
            return body;
        }

        function chip(id, label, count) {
            const b = el(doc, 'button', 'ovdt-chip', label + (count === undefined || count === null ? '' : ' (' + count + ')'));
            b.type = 'button';
            b.setAttribute('aria-pressed', filters.has(id) ? 'true' : 'false');
            b.addEventListener('click', () => {
                if (filters.has(id)) filters.delete(id); else filters.add(id);
                refresh();
            });
            return b;
        }

        /** The step's state as a small pill; data-s lets a running step breathe and a failed one show red. */
        function outcome(status) {
            const o = el(doc, 'span', 'ovdt-outcome', OUTCOME[status] || status);
            o.setAttribute('data-s', String(status || '').toLowerCase());
            return o;
        }

        function renderNow(now) {
            nowBox.textContent = '';
            if (!now) {
                nowBox.appendChild(el(doc, 'div', 'ovdt-card ovdt-empty', 'Your agent is idle. Ask it something in Talk.'));
                return;
            }
            const card = el(doc, 'div', 'ovdt-card');
            const row = el(doc, 'div', 'ovdt-row');
            row.appendChild(el(doc, 'span', 'ovdt-mode', word(now.mode)));
            row.appendChild(outcome(now.status));
            row.appendChild(el(doc, 'span', 'ovdt-title', now.title));
            row.appendChild(el(doc, 'span', 'ovdt-meta', since(now.started_at)));
            card.appendChild(row);
            if (now.placement && (now.placement.where || now.placement.why)) {
                card.appendChild(el(doc, 'div', 'ovdt-meta', [now.placement.where, now.placement.why].filter(Boolean).join(': ')));
            }
            // The Computer this step works on (plan 2026-11-07): the same machine and cost the task record carries.
            if (now.computer) card.appendChild(el(doc, 'div', 'ovdt-meta', [now.computer.machine, now.computer.cost_hint].filter(Boolean).join(' · ')));
            const buttons = el(doc, 'div', 'ovdt-buttons');
            // Take over / Give it back: one API on the task at Actor, the same hand-off the agent's own
            // hand_to_person tool uses. Only a step that names its task (ref) and its Computer offers it.
            if (now.computer && now.ref) {
                const driving = now.computer.driving === true || /^You took over/.test(String(now.title || ''));
                const take = el(doc, 'button', 'ovdt-btn is-primary', driving ? 'Give it back' : 'Take over');
                take.type = 'button';
                take.addEventListener('click', async () => {
                    take.disabled = true;
                    const auth = await bearer();
                    try {
                        await api('/api/v1/tasks/' + encodeURIComponent(now.ref) + (driving ? '/giveback' : '/takeover'), {
                            method: 'POST', headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: auth } : {}) }, body: '{}',
                        });
                    } catch (err) { /* the panel refreshes either way */ }
                    refresh();
                });
                buttons.appendChild(take);
            }
            const stop = el(doc, 'button', 'ovdt-btn is-stop', 'Stop');
            stop.type = 'button';
            stop.addEventListener('click', async () => {
                stop.disabled = true;
                const auth = await bearer();
                try { await api('/api/v1/agent/kill-switch', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: auth } : {}) }, body: JSON.stringify({ action: 'stop' }) }); } catch (err) { /* the panel refreshes either way */ }
                refresh();
            });
            buttons.appendChild(stop);
            card.appendChild(buttons);
            nowBox.appendChild(card);
        }

        function renderNeeds(needs) {
            needsBox.textContent = '';
            if (!needs.length) {
                needsBox.appendChild(el(doc, 'div', 'ovdt-empty', 'Nothing needs you.'));
                return;
            }
            for (const item of needs) {
                const card = el(doc, 'div', 'ovdt-card');
                card.appendChild(el(doc, 'div', 'ovdt-mode', word(item.mode) + ' needs you'));
                card.appendChild(el(doc, 'div', 'ovdt-title', item.title));
                if (item.reason) card.appendChild(el(doc, 'div', 'ovdt-meta', item.reason));
                const buttons = el(doc, 'div', 'ovdt-buttons');
                for (const [label, decision] of [['Approve', 'approve'], ['Decline', 'decline']]) {
                    const b = el(doc, 'button', decision === 'approve' ? 'ovdt-btn is-primary' : 'ovdt-btn', label);
                    b.type = 'button';
                    b.addEventListener('click', async () => {
                        b.disabled = true;
                        const approval = item.approval || {};
                        const auth = await bearer();
                        try {
                            await api('/api/v1/agent/approvals/' + encodeURIComponent(approval.product || item.product) + '/' + encodeURIComponent(approval.id) + '/decide', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: auth } : {}) },
                                body: JSON.stringify({ decision }),
                            });
                        } catch (err) { /* the panel refreshes either way */ }
                        refresh();
                    });
                    buttons.appendChild(b);
                }
                card.appendChild(buttons);
                needsBox.appendChild(card);
            }
        }

        function entryNode(entry) {
            const card = el(doc, 'div', 'ovdt-card');
            const row = el(doc, 'div', 'ovdt-row');
            row.appendChild(el(doc, 'span', 'ovdt-mode', word(entry.mode)));
            row.appendChild(outcome(entry.status));
            row.appendChild(el(doc, 'span', 'ovdt-title', entry.title));
            const when = new Date(entry.started_at || 0);
            row.appendChild(el(doc, 'span', 'ovdt-meta', Number.isNaN(when.getTime()) ? '' : when.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })));
            card.appendChild(row);
            if (entry.transition) card.appendChild(el(doc, 'div', 'ovdt-meta', entry.transition));
            else if (entry.placement && (entry.placement.where || entry.placement.why)) {
                card.appendChild(el(doc, 'div', 'ovdt-meta', [entry.placement.where, entry.placement.why].filter(Boolean).join(': ')));
            }
            if (entry.computer) card.appendChild(el(doc, 'div', 'ovdt-meta', [entry.computer.machine, entry.computer.cost_hint].filter(Boolean).join(' · ')));
            if (entry.reason) card.appendChild(el(doc, 'div', 'ovdt-meta', entry.reason));
            if (entry.cost_usd !== null && entry.cost_usd !== undefined) card.appendChild(el(doc, 'div', 'ovdt-meta', '$' + Number(entry.cost_usd).toFixed(2)));
            if (entry.link) {
                const a = el(doc, 'a', 'ovdt-link', 'Open');
                a.href = entry.link;
                a.rel = 'noopener noreferrer';
                a.target = '_blank';
                card.appendChild(a);
            }
            // The step a site opened the Dock at (its task id): it is marked, so the person sees where they landed.
            const wanted = focusId();
            if (wanted && (entry.id === wanted || entry.ref === wanted)) card.classList.add('ovdt-focus');
            return card;
        }

        /** The step to point at: the id (a task id) a site opened the Dock with, if it is still there. */
        function focusId() {
            try { return String(focus() || '').trim() || null; } catch (err) { return null; }
        }

        /** Bring the focused step into view (the Dock's panel is short; the step may be below the fold). */
        function scrollToFocus() {
            const wanted = focusId();
            if (!wanted) return;
            const node = list.querySelector('.ovdt-focus');
            if (!node || !node.scrollIntoView) return;
            try { node.scrollIntoView({ block: 'nearest' }); } catch (err) { node.scrollIntoView(); }
        }

        function renderList(entries) {
            list.textContent = '';
            if (!entries.length) {
                list.appendChild(el(doc, 'div', 'ovdt-empty', 'Nothing yet. The agent\u2019s steps show up here as it works.'));
                return;
            }
            // Today's entries are open; earlier days are counted folds.
            const today = new Date().toISOString().slice(0, 10);
            const groups = new Map();
            for (const entry of entries) {
                const key = dayKey(entry.started_at);
                if (!groups.has(key)) groups.set(key, []);
                groups.get(key).push(entry);
            }
            for (const [key, group] of groups) {
                if (key === today) {
                    for (const entry of group) list.appendChild(entryNode(entry));
                    continue;
                }
                const fold = el(doc, 'button', 'ovdt-fold', labelOf(key, group.length));
                fold.type = 'button';
                fold.setAttribute('aria-expanded', 'false');
                fold.addEventListener('click', () => {
                    const open = fold.getAttribute('aria-expanded') === 'true';
                    fold.setAttribute('aria-expanded', open ? 'false' : 'true');
                    const shown = fold.nextElementSibling;
                    if (shown && shown.classList.contains('ovdt-fold-body')) shown.remove();
                    if (!open) {
                        const box = el(doc, 'div', 'ovdt-fold-body');
                        for (const entry of group) box.appendChild(entryNode(entry));
                        fold.after(box);
                    }
                });
                list.appendChild(fold);
            }
            // A long run of one mode folds into "12 more Code steps".
            let run = 0;
            let runMode = null;
            const runs = [];
            for (const entry of entries) {
                if (entry.mode === runMode) { run += 1; continue; }
                if (run >= 3) runs.push({ mode: runMode, count: run });
                runMode = entry.mode;
                run = 1;
            }
            if (run >= 3) runs.push({ mode: runMode, count: run });
            for (const r of runs) {
                const more = el(doc, 'div', 'ovdt-meta', r.count + ' more ' + word(r.mode) + ' steps');
                list.appendChild(more);
            }
        }

        function labelOf(day, count) {
            const today = new Date();
            const d = new Date(day + 'T00:00:00Z');
            const diff = Math.round((Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()) - d.getTime()) / 86400000);
            if (diff === 1) return 'Yesterday (' + count + ')';
            if (diff < 7) return 'This week (' + count + ')';
            return day + ' (' + count + ')';
        }

        function renderChips(counts) {
            chips.textContent = '';
            for (const m of MODES) {
                const n = counts && counts[m.id];
                if (!n) continue;
                chips.appendChild(chip(m.id, m.word, n));
            }
            if (counts && counts.needs_you) chips.appendChild(chip('needs_you', 'Needs you', counts.needs_you));
        }

        async function refresh() {
            if (destroyed || !active()) return;
            const mode = [...filters].find((f) => f !== 'needs_you');
            const query = [];
            if (mode) query.push('mode=' + encodeURIComponent(mode));
            if (filters.has('needs_you')) query.push('needs_you=1');
            const path = '/api/v1/agent/timeline' + (query.length ? '?' + query.join('&') : '');
            let data;
            try { data = await api(path); } catch (err) {
                if (destroyed) return;
                container.hidden = true;
                return;
            }
            if (destroyed) return;
            container.hidden = !data.now && !(data.needs_you || []).length && !(data.entries || []).length;
            renderNow(data.now);
            renderNeeds(data.needs_you || []);
            renderChips(data.counts || {});
            renderList(data.entries || []);
            scrollToFocus();
            writeUrl();
        }

        function writeUrl() {
            try {
                const url = new URL(doc.defaultView.location.href);
                url.searchParams.delete('mode');
                url.searchParams.delete('needs_you');
                for (const f of filters) {
                    if (f === 'needs_you') url.searchParams.set('needs_you', '1');
                    else url.searchParams.set('mode', f);
                }
                doc.defaultView.history.replaceState(null, '', url.toString());
            } catch (err) { /* the panel keeps its filters in memory */ }
        }

        function start() {
            if (timer) return;
            timer = setInterval(refresh, POLL_MS);
            if (timer.unref) timer.unref();
        }

        refresh();
        start();

        return {
            refresh,
            destroy() {
                destroyed = true;
                if (timer) clearInterval(timer);
                timer = null;
                wrap.remove();
            },
        };
    }

    root.OpenVibeDockTimeline = { mount };
}(typeof window !== 'undefined' ? window : globalThis));
