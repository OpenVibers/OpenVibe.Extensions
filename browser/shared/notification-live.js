/*
 * openvibe-shared/notification-live.js — the notification badge's realtime feed (roadmap WS-E task 3, WS-F task 1;
 * ADR-005 amendment 2). notification-ui.js loads it on demand when a site turns it on (navbar notificationsRealtime).
 * For every (re)connect it asks Network for a realtime ticket (POST <api>/api/v1/realtime/ticket: Bearer token, or the
 * cookie on openvibe.network itself) and opens Events' stream with it, without credentials:
 *   <stream_url>?topics=network.notification.*&ticket=<ticket>[&last_event_id=<cursor>]
 * Events streams only the person's own network.notification.created events (subject visibility); one whose subject is
 * not the ticket's is ignored all the same. Each calls onNotification(payload); `event: gap` calls onGap.
 * The cursor is the last SSE id Events sent (opaque, handed back as it came); an event already heard (by event_id) is
 * skipped. A ticket opens one stream: errors close it and reconnect with a fresh ticket from the cursor, backing off 2 s to 15 min
 * with jitter. Stops (the caller's polling is all there is) after 10 failures in a row, on a Content-Security-Policy
 * refusal, when signed out (401/403) or when Network has realtime off (404/503). Hidden 5 min: closed; shown: resumed.
 * OVNotificationLive.create({ ticketUrl, token, credentials, onNotification, onGap, onState }) → { start, stop, restart, state }
 */
(function (root) {
    'use strict';
    if (typeof document === 'undefined' || root.OVNotificationLive) return;
    const TYPE_RE = /^network\.notification\./;
    const SUBJECT_RE = /^usr_[0-9A-HJKMNP-TV-Z]{26}$/;
    const MAX_FAILURES = 10;   // 2 s, 4 s, … 512 s: about 9 to 17 minutes of retries before polling only
    const SEEN_MAX = 256;      // event ids remembered for dedupe

    function create(o) {
        const rt = { state: 'off', failures: 0, lastId: null, subject: null, origin: null, events: 0, ignored: 0, gaps: 0, tickets: 0 };
        let es = null; let stopped = true; let gen = 0;
        const seen = new Set();
        const t = {};   // timers: retry, hide
        const later = (k, f, ms) => { root.clearTimeout(t[k]); t[k] = root.setTimeout(() => { t[k] = null; f(); }, ms); };
        const call = (f, ...a) => { try { if (typeof f === 'function') f(...a); } catch { /* the page's handler must not break the feed */ } };
        function set(s) { if (rt.state !== s) { rt.state = s; call(o.onState, s); } }
        function close() { const s = es; es = null; if (s) try { s.close(); } catch { /* */ } }
        function halt(s) { close(); root.clearTimeout(t.retry); t.retry = null; set(s); }

        async function open() {
            if (stopped || es || rt.state === 'ticket') return;
            if (document.hidden) { set('hidden'); return; }
            const g = gen;
            set('ticket');
            let tk;
            try {
                const tok = typeof o.token === 'function' ? await o.token() : o.token;
                const r = await root.fetch(o.ticketUrl, { method: 'POST', credentials: o.credentials || 'omit', cache: 'no-store', headers: tok ? { Authorization: `Bearer ${tok}` } : {} });
                if (g !== gen) return;
                if (r.status === 401 || r.status === 403) return halt('signed-out');
                if (r.status === 404 || r.status === 501 || r.status === 503) return halt('unavailable');
                if (!r.ok) throw new Error('ticket');
                tk = await r.json();
                if (!tk || typeof tk.ticket !== 'string' || !SUBJECT_RE.test(String(tk.subject)) || !Array.isArray(tk.topics)) throw new Error('ticket');
            } catch {
                if (g === gen) fail();
                return;
            }
            if (g !== gen) return;
            let u;
            try {
                u = new URL(tk.stream_url);
                if (!/^https?:$/.test(u.protocol)) throw new Error('url');
                u.searchParams.set('topics', tk.topics.join(','));
                u.searchParams.set('ticket', tk.ticket);
                if (rt.lastId != null) u.searchParams.set('last_event_id', rt.lastId);
            } catch { fail(); return; }
            rt.tickets++; rt.origin = u.origin;
            rt.subject = tk.subject;
            set('connecting');
            let s;
            try { s = es = new root.EventSource(u.href); } catch { es = null; fail(); return; }
            s.onopen = () => { if (es === s) { rt.failures = 0; set('open'); } };
            s.onmessage = (e) => { if (es === s) heard(e); };
            s.onerror = () => { if (es === s) fail(); };
            s.addEventListener('gap', (e) => {
                if (es !== s) return;
                let gap = null; try { gap = JSON.parse(e.data); } catch { /* */ }
                rt.gaps++;
                call(o.onGap, gap);
            });
        }
        function heard(e) {
            let m; try { m = JSON.parse(e.data); } catch { return; }
            const ev = m && m.event;
            const id = ev && typeof ev.event_id === 'string' ? ev.event_id : null;
            if (id) {
                if (seen.has(id)) return;   // already heard (a replay after a reconnect)
                seen.add(id);
                if (seen.size > SEEN_MAX) seen.delete(seen.values().next().value);
            }
            if (e.lastEventId) rt.lastId = String(e.lastEventId);
            // Events already sends only this person's own; anything else is never shown.
            if (!ev || !TYPE_RE.test(String(ev.event_type)) || !ev.subject || ev.subject.type !== 'user' || ev.subject.id !== rt.subject) { rt.ignored++; return; }
            rt.events++;
            call(o.onNotification, ev.payload && typeof ev.payload === 'object' ? ev.payload : {}, ev);
        }
        // A ticket opens one stream, so the browser's own reconnect (same URL) is never used: close, back off, new ticket.
        function fail() {
            close();
            if (stopped || rt.state === 'blocked') return;
            if (++rt.failures >= MAX_FAILURES) { set('failed'); return; }
            set('backoff');
            later('retry', () => { if (!stopped) { if (document.hidden) set('hidden'); else open(); } }, Math.min(9e5, 2e3 * 2 ** (rt.failures - 1)) * (0.5 + Math.random() / 2));
        }

        // A Content-Security-Policy whose connect-src leaves Events out: one refusal, then polling only.
        document.addEventListener('securitypolicyviolation', (e) => {
            if (stopped || !rt.origin || String(e.blockedURI || '').indexOf(rt.origin) !== 0) return;
            halt('blocked');
        });
        document.addEventListener('visibilitychange', () => {
            if (stopped) return;
            if (document.hidden) { if (es) later('hide', () => { if (document.hidden && es) { close(); set('hidden'); } }, 5 * 60 * 1000); return; }
            root.clearTimeout(t.hide); t.hide = null;
            if (rt.state === 'hidden') open();
        });
        root.addEventListener('online', () => { if (!stopped && (rt.state === 'failed' || rt.state === 'backoff')) { rt.failures = 0; root.clearTimeout(t.retry); set('off'); open(); } });

        const api = {
            start() { if (!stopped) return api; stopped = false; set('off'); open(); return api; },
            stop() { stopped = true; gen++; close(); Object.keys(t).forEach((k) => { root.clearTimeout(t[k]); t[k] = null; }); set('off'); return api; },
            /** Another account (or a new token): forget the cursor and the subject, start again. */
            restart() { api.stop(); rt.lastId = null; seen.clear(); rt.subject = null; rt.failures = 0; return api.start(); },
            state: () => ({ ...rt }),
        };
        return api;
    }

    root.OVNotificationLive = { create };
    if (typeof module !== 'undefined' && module.exports) module.exports = root.OVNotificationLive;
})(typeof window !== 'undefined' ? window : globalThis);
