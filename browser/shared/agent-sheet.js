// ═══════════════════════════════════════════════════════════════
// OpenVibe — an agent's sheet (openvibe-shared 4.211.0; Opus, 2026-11-11)
//
// One window (ov-window.js: a panel beside what opened it on a computer, a sheet on a phone) that says everything about
// one agent: who it is and its state, what it is doing now, what it asks you, the work it did, when it runs, what it
// remembers and its computer. The data is the agent's sheet (Contracts actor.agent-sheet@1 / codes.agent-sheet@1),
// read through Network's same-origin relay with the person's token:
//   OVAgentSheet.open({ kind: 'actor' | 'codes', id, name, token, frameBase, base, from, openHref })  → { close() }
// The parts are tabs (a segmented row; arrow keys move between them); a part with nothing in it says so in its own
// words (asks_empty) rather than disappearing. While it reads, the window shows the mark's wait; a failed read says so
// with Retry. Everything an agent or a person wrote is set as text, never markup.
// ═══════════════════════════════════════════════════════════════
(function (root) {
    'use strict';
    if (typeof document === 'undefined' || root.OVAgentSheet) return;

    const CSS = `.ovas { display: grid; gap: 12px; padding: 4px 2px 6px; }
.ovas-who { display: flex; align-items: center; gap: 12px; min-width: 0; }
.ovas-face { flex: none; width: 44px; height: 44px; border-radius: 50%; display: grid; place-items: center; overflow: hidden; font-weight: 800; font-size: 17px;
  color: #fff; background: linear-gradient(135deg, var(--accent, #3b82f6), color-mix(in srgb, var(--accent, #3b82f6) 45%, #7c3aed)); box-shadow: 0 0 0 3px var(--ovas-ring, transparent); }
.ovas-face img { width: 100%; height: 100%; object-fit: cover; }
.ovas[data-state="working"] { --ovas-ring: color-mix(in srgb, #22c55e 55%, transparent); }
.ovas[data-state="paused"] { --ovas-ring: color-mix(in srgb, #f59e0b 55%, transparent); }
.ovas-name { display: grid; gap: 2px; min-width: 0; flex: 1; }
.ovas-name b { font-size: 16px; overflow-wrap: anywhere; }
.ovas-name small { color: var(--text-secondary, #a8b3c4); font-size: 12.5px; overflow-wrap: anywhere; }
.ovas-state { display: inline-flex; align-items: center; gap: 6px; padding: 2px 9px; border-radius: 999px; font-size: 12px; font-weight: 650; width: fit-content;
  background: color-mix(in srgb, var(--text-primary, #e6edf7) 8%, transparent); }
.ovas-state::before { content: ""; width: 7px; height: 7px; border-radius: 50%; background: var(--ovas-dot, #94a3b8); }
.ovas[data-state="working"] .ovas-state { --ovas-dot: #22c55e; }
.ovas[data-state="paused"] .ovas-state { --ovas-dot: #f59e0b; }
.ovas-open { flex: none; display: inline-flex; align-items: center; min-height: 36px; padding: 0 12px; border-radius: 10px; color: var(--accent-light, #60a5fa);
  font-size: 13px; font-weight: 650; text-decoration: none; }
.ovas-open:hover { background: color-mix(in srgb, var(--accent, #3b82f6) 12%, transparent); }
.ovas-tabs { display: flex; gap: 4px; padding: 4px; border-radius: 999px; overflow-x: auto; scrollbar-width: none; background: color-mix(in srgb, var(--text-primary, #e6edf7) 6%, transparent); }
.ovas-tabs::-webkit-scrollbar { display: none; }
@media (max-width: 520px) { .ovas-tabs { -webkit-mask-image: linear-gradient(90deg, #000 85%, transparent); mask-image: linear-gradient(90deg, #000 85%, transparent); } }
.ovas-tab { flex: none; display: inline-flex; align-items: center; gap: 6px; min-height: 34px; padding: 0 13px; border: 0; border-radius: 999px; background: none;
  color: var(--text-secondary, #a8b3c4); font: inherit; font-size: 13px; cursor: pointer; }
.ovas-tab[aria-selected="true"] { background: var(--bg-primary, #0b1220); color: var(--text-primary, #e6edf7); font-weight: 650; box-shadow: 0 1px 3px rgba(0, 0, 0, .25); }
.ovas-tab em { font-style: normal; font-size: 11px; font-weight: 700; padding: 0 6px; border-radius: 999px; background: color-mix(in srgb, #f59e0b 22%, transparent); color: #fbbf24; }
.ovas-tab:focus-visible { outline: 2px solid var(--accent, #3b82f6); outline-offset: 1px; }
.ovas-part { display: grid; align-content: start; gap: 8px; min-height: 90px; }
.ovas-part[hidden] { display: none; }
.ovas-empty { margin: 0; padding: 18px 8px; text-align: center; color: var(--text-secondary, #a8b3c4); font-size: 13.5px; }
.ovas-card { display: grid; gap: 4px; padding: 11px 13px; border-radius: 14px; border: 1px solid var(--border, rgba(255, 255, 255, .1));
  background: color-mix(in srgb, var(--text-primary, #e6edf7) 3%, transparent); min-width: 0; }
.ovas-card b { font-size: 14px; font-weight: 650; overflow-wrap: anywhere; }
.ovas-card p { margin: 0; color: var(--text-secondary, #a8b3c4); font-size: 13px; overflow-wrap: anywhere; }
.ovas-line { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 10px; color: var(--text-muted, #7d8aa0); font-size: 12px; font-variant-numeric: tabular-nums; }
.ovas-chip { display: inline-flex; align-items: center; padding: 1px 8px; border-radius: 999px; font-size: 11.5px; font-weight: 650;
  background: color-mix(in srgb, var(--text-primary, #e6edf7) 8%, transparent); color: var(--text-primary, #e6edf7); }
.ovas-chip.is-ok { background: color-mix(in srgb, #22c55e 18%, transparent); color: #4ade80; }
.ovas-chip.is-bad { background: color-mix(in srgb, #ef4444 18%, transparent); color: #f87171; }
.ovas-chip.is-run { background: color-mix(in srgb, var(--accent, #3b82f6) 18%, transparent); color: var(--accent-light, #60a5fa); }
.ovas-card.is-now { border-color: color-mix(in srgb, #22c55e 45%, transparent); }
.ovas-card.is-ask { border-color: color-mix(in srgb, #f59e0b 50%, transparent); background: color-mix(in srgb, #f59e0b 7%, transparent); }
.ovas-go { justify-self: start; display: inline-flex; align-items: center; min-height: 40px; padding: 0 16px; border-radius: 12px; text-decoration: none; font-weight: 650; font-size: 14px;
  color: #fff; background: var(--accent, #3b82f6); }
.ovas-wait { display: grid; justify-items: center; gap: 10px; padding: 26px 8px; color: var(--text-secondary, #a8b3c4); font-size: 13.5px; }
.ovas-retry { min-height: 40px; padding: 0 16px; border-radius: 12px; border: 1px solid var(--border, rgba(255, 255, 255, .14)); background: none; color: inherit; font: inherit; cursor: pointer; }
@media (pointer: coarse) { .ovas-tab { min-height: 44px; } .ovas-open { min-height: 44px; } }`;

    function styles(d) {
        if (d.getElementById('ovas-css')) return;
        const s = d.createElement('style');
        s.id = 'ovas-css';
        s.textContent = CSS;
        d.head.appendChild(s);
    }
    const money = (n) => (Number(n) > 0 ? `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: Number(n) < 0.1 ? 4 : 2 })}` : '$0');
    function when(iso) {
        const t = Date.parse(iso || '');
        if (!Number.isFinite(t)) return '';
        const s = (t - Date.now()) / 1000;
        const a = Math.abs(s);
        const unit = a < 3600 ? [Math.max(1, Math.round(a / 60)), 'min'] : a < 86400 ? [Math.round(a / 3600), 'h'] : [Math.round(a / 86400), a < 172800 ? 'day' : 'days'];
        if (a < 60) return s > 0 ? 'in a moment' : 'just now';
        return s > 0 ? `in ${unit[0]} ${unit[1]}` : `${unit[0]} ${unit[1]} ago`;
    }
    const tone = (state) => (/^(done|succeeded|ok|passed|completed)$/i.test(state) ? 'is-ok' : /^(failed|error|refused|stopped)$/i.test(state) ? 'is-bad' : /^(running|working|started)$/i.test(state) ? 'is-run' : '');
    const STATE_WORD = { working: 'Working', idle: 'Resting', paused: 'Paused', ready: 'Ready' };

    function open(opts = {}) {
        const W = root.OVWindow;
        if (!W) throw new Error('ov-window.js is not loaded');
        const d = document;
        styles(d);
        const h = (tag, cls, text) => { const n = d.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = String(text); return n; };
        const kind = opts.kind === 'codes' ? 'codes' : 'actor';
        const frameBase = String(opts.frameBase || 'https://openvibe.network/api/frame').replace(/\/+$/, '');
        const aid = encodeURIComponent(String(opts.id || ''));
        // Through Network's relay on a site; `base` reaches the service itself (its own site, or a test).
        const direct = opts.base ? String(opts.base).replace(/\/+$/, '') : '';
        const url = direct ? (kind === 'codes' ? `${direct}/api/v1/me/agents/${aid}/sheet` : `${direct}/api/v1/me/agents/${aid}?view=sheet`)
            : `${frameBase}/${kind === 'codes' ? 'codes-agents' : 'agents'}/${aid}/sheet`;
        const body = h('div', 'ovas');
        // The window's title names what it is; the agent's own name leads the sheet under it (said once).
        const win = W.open({ id: `agent-sheet-${kind}`, title: kind === 'codes' ? 'Coding agent' : 'Your Actor', body, kind: 'panel', size: 'md', from: opts.from || null,
            onClose: () => { gone = true; } });
        let gone = false;

        function wait() {
            const box = h('div', 'ovas-wait');
            const mark = h('span', 'ov-mark');
            mark.setAttribute('data-state', 'busy'); mark.setAttribute('data-size', '34'); mark.setAttribute('aria-hidden', 'true');
            box.append(mark, h('span', '', 'Reading your agent…'));
            body.replaceChildren(box);
        }
        function failed(text) {
            const box = h('div', 'ovas-wait');
            const retry = h('button', 'ovas-retry', 'Retry'); retry.type = 'button';
            retry.addEventListener('click', load);
            box.append(h('span', '', text), retry);
            body.replaceChildren(box);
        }

        function card(cls, title, line, more) {
            const c = h('div', `ovas-card${cls ? ` ${cls}` : ''}`);
            c.append(h('b', '', title));
            if (more) c.append(h('p', '', more));
            if (line && line.childNodes.length) c.append(line);
            return c;
        }
        function workCard(w, isNow) {
            const line = h('div', 'ovas-line');
            if (w.state) line.append(h('span', `ovas-chip ${tone(w.state)}`, w.state));
            if (Number.isFinite(Number(w.cost_usd))) line.append(h('span', '', money(w.cost_usd)));
            if (w.updated_at || w.started_at || w.at) line.append(h('span', '', when(w.updated_at || w.started_at || w.at)));
            const result = typeof w.result === 'string' ? w.result : w.result && (w.result.summary || w.result.text) ? (w.result.summary || w.result.text) : '';
            return card(isNow ? 'is-now' : '', w.task || 'A task', line, result ? String(result).slice(0, 400) : '');
        }

        function render(sheet) {
            const a = sheet.agent || {};
            body.dataset.state = a.state || '';
            const who = h('div', 'ovas-who');
            const face = h('span', 'ovas-face');
            if (a.face && /^https:\/\//.test(a.face)) { const img = h('img'); img.src = a.face; img.alt = ''; face.append(img); } else face.textContent = String(a.name || opts.name || 'A').trim().charAt(0).toUpperCase();
            const name = h('span', 'ovas-name');
            name.append(h('b', '', a.name || opts.name || 'Your agent'), h('span', 'ovas-state', STATE_WORD[a.state] || a.state || 'Ready'));
            if (a.instructions) name.append(h('small', '', String(a.instructions).slice(0, 160)));
            else if (a.kind) name.append(h('small', '', a.kind));
            who.append(face, name);
            if (opts.openHref) { const go = h('a', 'ovas-open', 'Open'); go.insertAdjacentHTML('beforeend', '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" width="14" height="14" style="margin-left:5px;vertical-align:-2px"><path d="M14 3.8h6.3v6.3M20.2 3.8l-9.4 9.4M18.2 14.2v4.2a2.1 2.1 0 0 1-2.1 2.1H5.6a2.1 2.1 0 0 1-2.1-2.1V7.9a2.1 2.1 0 0 1 2.1-2.1h4.2"/></svg>'); go.href = opts.openHref; go.target = '_blank'; go.rel = 'noopener'; who.append(go); }

            const asks = Array.isArray(sheet.asks) ? sheet.asks : [];
            const work = Array.isArray(sheet.work) ? sheet.work : [];
            const parts = [
                ['now', 'Now', () => (sheet.now ? [workCard(sheet.now, true)] : [h('p', 'ovas-empty', a.state === 'paused' ? 'Paused. Nothing runs until you resume it.' : 'Nothing running right now.')])],
                ['asks', 'Asks', () => (asks.length ? asks.map((x) => {
                    const line = h('div', 'ovas-line');
                    if (x.state) line.append(h('span', 'ovas-chip', x.state));
                    if (x.touch && typeof x.touch === 'string') line.append(h('span', '', x.touch));
                    return card('is-ask', x.what || 'A request', line, x.why || '');
                }) : [h('p', 'ovas-empty', sheet.asks_empty || 'Nothing to approve.')]), asks.length],
                ['work', 'Work', () => (work.length ? work.map((w) => workCard(w, false)) : [h('p', 'ovas-empty', 'No work yet.')])],
                ['when', 'Schedule', () => {
                    const rows = (Array.isArray(sheet.schedules) ? sheet.schedules : []).filter((s) => s && s.schedule !== 'off');
                    if (!rows.length) return [h('p', 'ovas-empty', 'It runs when you ask, on no schedule.')];
                    return rows.map((s) => {
                        const line = h('div', 'ovas-line');
                        if (s.next_run_at) line.append(h('span', '', `Next ${when(s.next_run_at)}`));
                        if (s.last_run_at) line.append(h('span', '', `Last ${when(s.last_run_at)}`));
                        if (s.last_result) line.append(h('span', `ovas-chip ${tone(s.last_result)}`, s.last_result));
                        return card('', String(s.schedule || 'On a schedule'), line, '');
                    });
                }],
                ['memory', 'Memory', () => {
                    const rows = Array.isArray(sheet.memory) ? sheet.memory : [];
                    return rows.length ? rows.slice(0, 30).map((m) => { const line = h('div', 'ovas-line'); if (m.source) line.append(h('span', '', m.source)); return card('', String(m.text || '').slice(0, 300), line, ''); }) : [h('p', 'ovas-empty', 'Nothing remembered yet.')];
                }],
                ['computer', 'Computer', () => {
                    const c = sheet.computer;
                    if (!c) return [h('p', 'ovas-empty', 'No computer is attached to this agent.')];
                    const out = [card('', c.name || 'Its computer', null, c.state || c.status || '')];
                    const href = [c.url, c.open].find((u) => typeof u === 'string' && /^https:\/\//.test(u));
                    if (href) { const go = h('a', 'ovas-go', 'Watch its computer'); go.href = href; go.target = '_blank'; go.rel = 'noopener'; out.push(go); }
                    return out;
                }],
            ];
            const tabs = h('div', 'ovas-tabs');
            tabs.setAttribute('role', 'tablist');
            tabs.setAttribute('aria-label', 'About this agent');
            const panes = [];
            const first = asks.length ? 'asks' : 'now';
            parts.forEach(([id, label, build, count]) => {
                const tab = h('button', 'ovas-tab', label);
                tab.type = 'button';
                tab.setAttribute('role', 'tab');
                tab.id = `ovas-t-${id}`;
                tab.setAttribute('aria-controls', `ovas-p-${id}`);
                if (count) tab.append(h('em', '', count));
                const pane = h('div', 'ovas-part');
                pane.id = `ovas-p-${id}`;
                pane.setAttribute('role', 'tabpanel');
                pane.setAttribute('aria-labelledby', tab.id);
                pane.append(...build());
                const on = id === first;
                tab.setAttribute('aria-selected', on ? 'true' : 'false');
                tab.tabIndex = on ? 0 : -1;
                pane.hidden = !on;
                tab.addEventListener('click', () => select(id));
                tabs.append(tab);
                panes.push([id, tab, pane]);
            });
            function select(id) {
                panes.forEach(([pid, tab, pane]) => { const on = pid === id; tab.setAttribute('aria-selected', on ? 'true' : 'false'); tab.tabIndex = on ? 0 : -1; pane.hidden = !on; });
            }
            tabs.addEventListener('keydown', (e) => {
                if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
                const i = panes.findIndex(([, tab]) => tab.getAttribute('aria-selected') === 'true');
                const next = panes[(i + (e.key === 'ArrowRight' ? 1 : panes.length - 1)) % panes.length];
                select(next[0]); next[1].focus(); e.preventDefault();
            });
            body.replaceChildren(who, tabs, ...panes.map(([, , pane]) => pane));
        }

        async function load() {
            wait();
            try {
                const t = typeof opts.token === 'function' ? await opts.token() : opts.token;
                if (!t) { failed('Sign in to see your agent.'); return; }
                const r = await fetch(url, { headers: { accept: 'application/json', authorization: `Bearer ${t}` }, credentials: 'omit' });
                const b = await r.json().catch(() => null);
                if (gone) return;
                if (!r.ok || !b) { failed(r.status === 404 ? 'This agent is not there any more.' : 'Its sheet could not be read just now.'); return; }
                render(b.sheet || b);
            } catch { if (!gone) failed('Its sheet could not be read just now.'); }
        }
        load();
        return { close: () => win.close() };
    }

    root.OVAgentSheet = { open };
})(typeof window !== 'undefined' ? window : globalThis);
