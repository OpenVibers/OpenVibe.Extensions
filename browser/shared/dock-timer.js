/**
 * openvibe-shared/dock-timer.js: the Dock's timer (plan L48 R2; the owner, 11-01: "a reminder system… timer or however
 * often they want"). dock.js loads it when the person's Dock state carries a timer, or when they open the timer menu.
 *
 *   OpenVibeDockTimer.attach({ state, save, host, icon }) → { sync(), pillText(), menu(anchor), stop() }
 *
 * The timer lives in the Network's Dock state (network.dock-state@1 `timer`, contracts 0.271.0), so it counts down on
 * every OpenVibe site the person has open and follows them to the next. Each page counts from the same end time; the
 * page that sees the end rings (a soft chime, only on a page that is showing, and a notification when the person
 * allowed them) and moves a focus timer on to its break or its next round. Every page computes that next phase the same
 * way from the same end time, so two pages writing it at once write the same thing. Nothing spins: the pill shows the
 * minutes, and a line fills as the time goes.
 */
(function (root) {
    'use strict';
    if (typeof document === 'undefined' || root.OpenVibeDockTimer) return;

    const PRESETS = [[5, 'timer'], [10, 'timer'], [25, 'timer']];
    const CSS = `
.ovdk-timer { flex: none; display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 4px 10px; padding: 10px 12px 12px; border-bottom: 1px solid var(--border, rgba(255,255,255,.08)); }
.ovdk-timer-t { min-width: 0; display: grid; gap: 1px; }
.ovdk-timer-t b { font-size: 22px; font-weight: 800; font-variant-numeric: tabular-nums; letter-spacing: .01em; line-height: 1.1; }
.ovdk-timer-t span { color: var(--text-muted, #8b8b96); font-size: 12.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ovdk-timer-acts { display: flex; gap: 6px; }
.ovdk-timer-acts button, .ovdk-tmenu button { min-height: 32px; padding: 0 12px; border-radius: 999px; border: 1px solid var(--border, rgba(255,255,255,.12)); background: transparent; color: var(--text-primary, #ececf1); font: inherit; font-size: 12.5px; font-weight: 650; cursor: pointer; }
.ovdk-timer-acts button:hover, .ovdk-tmenu button:hover { border-color: var(--accent, #3b82f6); }
.ovdk-timer-bar { grid-column: 1 / -1; height: 4px; border-radius: 4px; background: color-mix(in srgb, var(--text-primary, #ececf1) 9%, transparent); overflow: hidden; }
.ovdk-timer-bar i { display: block; height: 100%; width: 0; border-radius: inherit; background: var(--accent, #3b82f6); transition: width 1s linear; }
.ovdk-timer[data-kind="break"] .ovdk-timer-bar i { background: #22c55e; }
.ovdk-timer.is-done b { color: var(--accent, #3b82f6); }
.ovdk-tmenu { position: absolute; z-index: 5; right: 8px; top: 52px; width: min(300px, calc(100% - 16px)); display: grid; gap: 10px; padding: 12px; border-radius: 14px; border: 1px solid var(--border, rgba(255,255,255,.12)); background: var(--bg-card, var(--bg-secondary, #16161d)); box-shadow: 0 16px 40px rgba(0,0,0,.4); }
.ovdk-tmenu p { margin: 0; color: var(--text-muted, #8b8b96); font-size: 11px; font-weight: 750; letter-spacing: .08em; text-transform: uppercase; }
.ovdk-tmenu .row { display: flex; flex-wrap: wrap; gap: 6px; }
.ovdk-tmenu .own { display: grid; grid-template-columns: 70px minmax(0, 1fr) auto; gap: 6px; }
.ovdk-tmenu input { min-height: 32px; min-width: 0; box-sizing: border-box; padding: 0 10px; border-radius: 10px; border: 1px solid var(--border, rgba(255,255,255,.12)); background: transparent; color: inherit; font: inherit; font-size: 13px; }
.ovdk-tmenu .go { background: var(--accent, #3b82f6); border-color: transparent; color: var(--on-accent, #fff); }
.ovdk-pill[data-tone="timer"] .ovdk-t { font-variant-numeric: tabular-nums; }
.ovdk-pill[data-tone="timer-done"] { box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent, #3b82f6) 45%, transparent); }
@media (prefers-reduced-motion: reduce) { .ovdk-timer-bar i { transition: none; } }
`;
    const pad = (n) => String(n).padStart(2, '0');
    const left = (ms) => {
        const s = Math.max(0, Math.ceil(ms / 1000));
        const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
        return h ? `${h}:${pad(m)}:${pad(r)}` : `${m}:${pad(r)}`;
    };
    const iso = (ms) => new Date(ms).toISOString();

    /** What comes after a timer that has ended: the break after a focus round, the next round, or nothing. */
    function nextOf(t) {
        if (!t || !t.rounds || t.kind === 'timer') return null;
        const end = Date.parse(t.ends_at);
        const round = t.round || 1;
        if (t.kind === 'focus' && round < t.rounds) return { ...t, kind: 'break', started_at: iso(end), ends_at: iso(end + (t.break_min || 5) * 60000) };
        if (t.kind === 'break') return { ...t, kind: 'focus', round: round + 1, started_at: iso(end), ends_at: iso(end + (t.focus_min || 25) * 60000) };
        return null;
    }
    const titleOf = (t) => (t.kind === 'break' ? 'Break' : t.kind === 'focus' ? `Focus${t.rounds > 1 ? ` ${t.round || 1} of ${t.rounds}` : ''}` : 'Timer');

    function chime() {
        try {
            const A = root.AudioContext || root.webkitAudioContext;
            if (!A) return;
            const ctx = new A();
            [[660, 0], [880, 0.22], [990, 0.44]].forEach(([f, at]) => {
                const o = ctx.createOscillator(), g = ctx.createGain();
                o.type = 'sine'; o.frequency.value = f;
                g.gain.setValueAtTime(0.0001, ctx.currentTime + at);
                g.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + at + 0.02);
                g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + at + 0.5);
                o.connect(g).connect(ctx.destination);
                o.start(ctx.currentTime + at); o.stop(ctx.currentTime + at + 0.55);
            });
            setTimeout(() => { try { ctx.close(); } catch { /* */ } }, 1500);
        } catch { /* no sound here */ }
    }

    function attach(c) {
        const ctx = c || {};
        let tick = 0, rang = '', doneUntil = 0, doneLabel = '';
        const now = () => Date.now();
        const timer = () => { const t = (ctx.state() || {}).timer; return t && Date.parse(t.ends_at) ? t : null; };
        const style = () => {
            const st = ctx.host && ctx.host() && ctx.host().ownerDocument.getElementById('ovdk-styles') || document.getElementById('ovdk-styles');
            if (st && !st.textContent.includes('.ovdk-timer {')) st.textContent += CSS;
        };

        function ended(t) {
            if (rang === t.ends_at) return;
            rang = t.ends_at;
            const next = nextOf(t);
            const said = next ? (next.kind === 'break' ? `Focus done: a ${next.break_min || 5}-minute break` : `Break over: focus ${next.round} of ${next.rounds}`) : `${t.label || titleOf(t)}: time's up`;
            if (!document.hidden) chime();
            try { if (root.Notification && Notification.permission === 'granted' && !document.hidden) new Notification('OpenVibe', { body: said, tag: `ov-timer-${t.ends_at}` }); } catch { /* */ }
            doneUntil = now() + 60000; doneLabel = said;
            ctx.save({ timer: next });
        }

        function paintStrip() {
            const host = ctx.host && ctx.host();
            if (!host) return;
            const body = host.querySelector('.ovdk-body');
            let strip = host.querySelector('.ovdk-timer');
            const t = timer();
            const done = !t && now() < doneUntil;
            if (!t && !done) { if (strip) strip.remove(); return; }
            if (!strip) {
                strip = document.createElement('div'); strip.className = 'ovdk-timer'; strip.setAttribute('role', 'timer'); strip.setAttribute('aria-live', 'off');
                strip.innerHTML = '<div class="ovdk-timer-t"><b></b><span></span></div><div class="ovdk-timer-acts"><button type="button" data-t="more">+5 min</button><button type="button" data-t="stop">Stop</button></div><div class="ovdk-timer-bar"><i></i></div>';
                strip.addEventListener('click', (e) => {
                    const b = e.target.closest('[data-t]'); if (!b) return;
                    const cur = timer();
                    if (b.dataset.t === 'stop') { doneUntil = 0; ctx.save({ timer: null }); }
                    if (b.dataset.t === 'more' && cur) ctx.save({ timer: { ...cur, ends_at: iso(Math.max(Date.parse(cur.ends_at), now()) + 5 * 60000) } });
                    if (b.dataset.t === 'ok') { doneUntil = 0; }
                    paintStrip();
                });
                if (body) body.parentNode.insertBefore(strip, body); else host.appendChild(strip);
            }
            strip.classList.toggle('is-done', done);
            strip.dataset.kind = t ? t.kind : 'done';
            strip.querySelector('b').textContent = t ? left(Date.parse(t.ends_at) - now()) : 'Done';
            strip.querySelector('span').textContent = t ? `${titleOf(t)}${t.label ? ` · ${t.label}` : ''}` : doneLabel;
            const total = t ? Date.parse(t.ends_at) - Date.parse(t.started_at) : 1;
            strip.querySelector('.ovdk-timer-bar i').style.width = t ? `${Math.min(100, Math.max(0, 100 * (now() - Date.parse(t.started_at)) / Math.max(1, total)))}%` : '100%';
            const acts = strip.querySelector('.ovdk-timer-acts');
            acts.innerHTML = t ? '<button type="button" data-t="more">+5 min</button><button type="button" data-t="stop">Stop</button>' : '<button type="button" data-t="ok">OK</button>';
        }

        function step() {
            const t = timer();
            if (t && now() >= Date.parse(t.ends_at)) ended(t);
            paintStrip();
            if (ctx.repaint) ctx.repaint();
            if (!timer() && now() >= doneUntil) { clearInterval(tick); tick = 0; }
        }
        function sync() {
            style();
            if ((timer() || now() < doneUntil) && !tick) tick = setInterval(step, 1000);
            step();
        }
        /** The pill's words while a timer runs (null when there is none): minutes left, or what just ended. */
        function pillText() {
            const t = timer();
            if (t) return { text: left(Date.parse(t.ends_at) - now()), tone: 'timer', label: `${titleOf(t)}${t.label ? `, ${t.label}` : ''}: ${left(Date.parse(t.ends_at) - now())} left` };
            if (now() < doneUntil) return { text: "Time's up", tone: 'timer-done', label: doneLabel };
            return null;
        }
        function start(minutes, kind, label, rounds) {
            const m = Math.max(1, Math.min(180, Math.round(Number(minutes) || 0)));
            const at = now();
            const t = { kind, started_at: iso(at), ends_at: iso(at + m * 60000), ...(label ? { label: String(label).slice(0, 60) } : {}) };
            if (kind === 'focus') Object.assign(t, { round: 1, rounds: rounds || 4, focus_min: m, break_min: 5 });
            rang = ''; doneUntil = 0;
            // Asked once, at the moment the person starts one (a click): may the end show as a notification?
            try { if (root.Notification && Notification.permission === 'default') Notification.requestPermission().catch(() => {}); } catch { /* */ }
            ctx.save({ timer: t });
            sync();
        }
        function menu(anchor) {
            style();
            const host = ctx.host && ctx.host();
            if (!host) return;
            let m = host.querySelector('.ovdk-tmenu');
            if (m) { m.remove(); return; }
            m = document.createElement('div'); m.className = 'ovdk-tmenu'; m.setAttribute('role', 'dialog'); m.setAttribute('aria-label', 'Start a timer');
            m.innerHTML = `<p>Timer</p><div class="row">${PRESETS.map(([n]) => `<button type="button" data-min="${n}">${n} min</button>`).join('')}</div>
<p>Focus</p><div class="row"><button type="button" data-focus="25">25 min, 5 min break, ×4</button><button type="button" data-focus="50">50 / 5, ×2</button></div>
<p>Your own</p><div class="own"><input type="number" min="1" max="180" value="15" aria-label="Minutes" data-own-min><input type="text" maxlength="60" placeholder="What for (optional)" aria-label="What it is for" data-own-label><button type="button" class="go" data-own>Start</button></div>`;
            m.addEventListener('click', (e) => {
                const b = e.target.closest('button'); if (!b) return;
                if (b.dataset.min) start(b.dataset.min, 'timer');
                else if (b.dataset.focus) start(b.dataset.focus, 'focus', '', b.dataset.focus === '50' ? 2 : 4);
                else if (b.hasAttribute('data-own')) start(m.querySelector('[data-own-min]').value, 'timer', m.querySelector('[data-own-label]').value.trim());
                else return;
                m.remove();
            });
            m.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); m.remove(); if (anchor) anchor.focus(); } });
            host.appendChild(m);
            const first = m.querySelector('button'); if (first) first.focus();
        }
        return { sync, pillText, menu, start, stop: () => { clearInterval(tick); tick = 0; } };
    }

    root.OpenVibeDockTimer = { attach, nextOf };
})(typeof window !== 'undefined' ? window : globalThis);
