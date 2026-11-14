/**
 * ov-composer.js (openvibe-shared 4.201.0): one composer on every site. Ask 349, the owner: "how come on this composer
 * there's no file attaching system and all the other features … a better composer system unified across all sites …
 * moddable and fully customizable". ov-thread.js loads it for each thread.composer() form, and a site's own box joins
 * with OpenVibeComposer.enhance(form). The form's markup and its submit stay the site's; this adds:
 *   - files: the + menu, a paste, a drop; each one a chip above the box (a picture's thumbnail, the name and size, ×).
 *     A long paste becomes a text file, which you can put back in the box. Files go with the form (multipart); where a
 *     mod gives upload(file, onProgress), they go ahead of it, the chip shows the progress, and the form carries the ids;
 *   - "/" for commands (the site's, its mods', your own snippets) and "@" for mentions (the mods' sources);
 *   - voice, where the browser can listen; a draft kept per box until it is sent; Ctrl/⌘+B, I, E for bold, italic and
 *     code; the count near the box's limit;
 *   - your settings (what sends, voice, compact, your snippets), from "/settings" or the slash list's last row.
 *
 * Mods (a site, or a script on it): OpenVibeComposer.mod({
 *   id, match(form) → bool,                         which boxes it joins (all when absent)
 *   tools: [{ id, label, path (24-unit path data), run(ctx) }],
 *   commands: [{ name, hint, insert } | { name, hint, run(ctx) }],
 *   mentions: { search(q) → Promise<[{ label, handle, sub, avatar, insert }]> },
 *   upload(file, onProgress) → Promise<{ id }>,      files go to the site's store before the send
 *   beforeSend(ctx) → false to hold the send })
 * ctx: { form, text, value, set(v), insert(s), files(), add(files), note(s), send() }.
 * A box its page sends by script (a chat, an agent's run): form.__ovc.files() → the files (File objects), uploads(): the
 * ids a mod's upload gave, clear() after the send (the text, the chips, the draft); a form 'reset' clears the same.
 * A site without script says the same in data: data-ovt-commands='[{"name","hint","insert"}]', data-ovc-max-files,
 * data-ovc-max-mb, data-ovc-no-draft.
 */
(function (root) {
    'use strict';
    if (root.OpenVibeComposer || typeof document === 'undefined') return;

    // 4.203.0: the composer carries its own look (it was in thread.css), so any box on any page gets it: the Dock's
    // Vibe and Code boxes included. Injected once, before the first box is joined.
    const CSS = `.ovt-composer { position: relative; display: grid; gap: 6px; max-width: 780px; margin: 0 auto; padding: 10px 12px; border: 1px solid var(--border, rgba(148,163,184,.18)); border-radius: 18px; background: var(--bg-card, #131c2e); color: var(--text-primary, #e6edf7); }
.ovt-composer textarea { width: 100%; min-height: 48px; box-sizing: border-box; padding: 6px 2px; border: 0; outline: 0; resize: vertical; background: transparent; color: inherit; font: inherit; }
.ovt-c-row { display: flex; align-items: center; gap: 8px; }
.ovt-c-tools { flex: 1; display: flex; align-items: center; gap: 6px; }
.ovt-send { min-height: 40px; padding: 0 14px; border: 0; border-radius: 12px; background: var(--accent, #3b82f6); color: var(--on-accent, #fff); font: inherit; font-weight: 650; cursor: pointer; }
.ovt-send:disabled { opacity: .5; }
.ovt-composer .ovc-file.ovc-image { height: auto; min-height: 100px; flex-wrap: wrap; overflow: visible; }
.ovt-composer .ovc-image input { flex: 1 0 100%; min-width: 0; min-height: 36px; box-sizing: border-box; border: 1px solid var(--border, rgba(148,163,184,.18)); border-radius: 8px; background: var(--bg-primary, #0b1220); color: inherit; font: inherit; }
.ovc-files { display: flex; gap: 8px; overflow-x: auto; padding: 2px 0 8px; margin: 0 0 2px -4px; scrollbar-width: thin; }
.ovc-files[hidden] { display: none; }
.ovc-file { position: relative; flex: none; display: flex; align-items: center; gap: 9px; max-width: 230px; height: 52px; padding: 5px 30px 5px 5px; box-sizing: border-box; border-radius: 14px;
    border: 1px solid var(--ovt-line, var(--border, rgba(148, 163, 184, .18))); background: color-mix(in srgb, var(--text-primary, #fff) 4%, transparent); overflow: hidden; animation: ovc-in .2s cubic-bezier(.2, .9, .3, 1) both; }
.ovc-file.is-bad { border-color: color-mix(in srgb, var(--live-red, #ef4444) 70%, transparent); }
.ovc-file.is-up::after { content: ""; position: absolute; left: 0; bottom: 0; height: 3px; width: calc(var(--p, 0) * 100%); background: var(--ovt-accent, var(--accent, #3b82f6)); transition: width .2s; }
.ovc-file-th { flex: none; width: 40px; height: 40px; border-radius: 10px; object-fit: cover; background: #0b1220; }
.ovc-file-ic { display: grid; place-items: center; background: color-mix(in srgb, var(--ovt-accent, var(--accent, #3b82f6)) 16%, transparent); color: var(--ovt-accent, var(--accent, #3b82f6)); font-size: 11px; font-weight: 750; letter-spacing: .02em; }
.ovc-file-t { min-width: 0; display: grid; line-height: 1.25; }
.ovc-file-n { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13.5px; font-weight: 600; color: var(--text-primary, #e6edf7); }
.ovc-file-s { font-size: 12px; color: var(--text-muted, #7386a3); white-space: nowrap; }
.ovc-file.is-bad .ovc-file-s { color: var(--live-red, #ef4444); }
.ovc-file-x, .ovc-file-b { position: absolute; top: 4px; right: 4px; display: grid; place-items: center; width: 24px; height: 24px; padding: 0; border: 0; border-radius: 8px; background: none; color: var(--text-secondary, #b4c0d4); cursor: pointer; }
.ovc-file-b { top: auto; bottom: 4px; }
.ovc-file-x:hover, .ovc-file-b:hover, .ovc-file-x:focus-visible, .ovc-file-b:focus-visible { background: var(--bg-hover, color-mix(in srgb, var(--text-primary, #fff) 10%, transparent)); color: var(--text-primary, #e6edf7); }
.ovc-file-x svg, .ovc-file-b svg { width: 15px; height: 15px; }
.ovc-dropping { border-color: var(--ovt-accent, var(--accent, #3b82f6)); box-shadow: 0 0 0 3px color-mix(in srgb, var(--ovt-accent, var(--accent, #3b82f6)) 30%, transparent), 0 8px 30px rgba(0, 0, 0, .25); }
.ovc-dropping::before { content: "Drop to attach"; position: absolute; inset: 0; z-index: 5; display: grid; place-items: center; border-radius: inherit; background: color-mix(in srgb, var(--bg-card, #131c2e) 86%, var(--ovt-accent, var(--accent, #3b82f6))); color: var(--text-primary, #e6edf7); font-weight: 650; pointer-events: none; }
.ovc-pop { position: absolute; z-index: 40; left: 6px; right: 6px; bottom: calc(100% + 8px); max-height: min(320px, 50vh); overflow: auto; padding: 6px; border-radius: 16px; border: 1px solid var(--ovt-line, var(--border, rgba(148, 163, 184, .18)));
    background: var(--bg-card, #131c2e); box-shadow: 0 18px 50px rgba(0, 0, 0, .35); animation: ovc-in .16s cubic-bezier(.2, .9, .3, 1) both; }
.ovt.is-start .ovc-pop { bottom: auto; top: calc(100% + 8px); }
.ovc-pop[hidden] { display: none; }
.ovc-pop-i { display: grid; grid-template-columns: 30px 1fr auto; align-items: center; gap: 10px; width: 100%; min-height: 44px; padding: 6px 10px; box-sizing: border-box; border: 0; border-radius: 11px; background: none; color: inherit; font: inherit; text-align: left; cursor: pointer; }
.ovc-pop-i[aria-selected="true"], .ovc-pop-i:hover { background: color-mix(in srgb, var(--ovt-accent, var(--accent, #3b82f6)) 14%, transparent); }
.ovc-pop-ic, .ovc-pop-av { width: 30px; height: 30px; border-radius: 9px; display: grid; place-items: center; color: var(--ovt-accent, var(--accent, #3b82f6)); background: color-mix(in srgb, var(--ovt-accent, var(--accent, #3b82f6)) 12%, transparent); object-fit: cover; }
.ovc-pop-av { border-radius: 50%; }
.ovc-pop-ic svg { width: 17px; height: 17px; }
.ovc-pop-t { min-width: 0; display: grid; line-height: 1.3; }
.ovc-pop-t b { font-weight: 650; font-size: 14px; color: var(--text-primary, #e6edf7); }
.ovc-pop-t span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12.5px; color: var(--text-muted, #7386a3); }
.ovc-pop-tag { font-size: 11px; font-weight: 650; padding: 2px 7px; border-radius: 999px; color: var(--ovt-accent, var(--accent, #3b82f6)); background: color-mix(in srgb, var(--ovt-accent, var(--accent, #3b82f6)) 12%, transparent); }
.ovc-mic[aria-pressed="true"] { color: var(--live-red, #ef4444); background: color-mix(in srgb, var(--live-red, #ef4444) 14%, transparent); animation: ovc-listen 1.4s ease-in-out infinite; }
.ovc-count { flex: none; font-size: 12px; font-variant-numeric: tabular-nums; color: var(--text-muted, #7386a3); }
.ovc-count.is-low { color: var(--live-red, #ef4444); }
.ovc-count[hidden] { display: none; }
.ovt-composer.ovc-compact { padding: 6px 8px 6px 12px; border-radius: 18px; }
.ovt-composer.ovc-compact .ovt-c-row { margin-top: 0; }
.ovt-composer.ovc-compact .ovt-btn, .ovt-composer.ovc-compact .ovt-send { width: 36px; min-width: 36px; height: 36px; }
@keyframes ovc-in { from { opacity: 0; transform: translateY(4px) scale(.98); } }
@keyframes ovc-listen { 50% { box-shadow: 0 0 0 5px color-mix(in srgb, var(--live-red, #ef4444) 18%, transparent); } }
html[data-ov-motion=off] .ovc-file, html[data-ov-motion=off] .ovc-pop, html[data-ov-motion=off] .ovc-mic { animation: none; }
.ovc-set { width: min(460px, calc(100vw - 24px)); max-height: min(640px, calc(100vh - 32px)); padding: 0; border: 1px solid var(--ovt-line, rgba(148, 163, 184, .2)); border-radius: 20px; background: var(--bg-card, #131c2e); color: var(--text-primary, #e6edf7); box-shadow: 0 30px 80px rgba(0, 0, 0, .5); }
.ovc-set::backdrop { background: rgba(2, 6, 14, .55); }
.ovc-set.ovc-set-in { width: auto; max-height: none; border: 0; border-radius: 0; background: none; box-shadow: none; }
.ovc-set-in .ovc-set-f { padding: 0; }
.ovc-set-f { display: grid; gap: 14px; padding: 6px 18px 18px; }
.ovc-set-h { display: flex; align-items: center; justify-content: space-between; margin: 0 -8px 0 0; font-size: 17px; }
.ovc-set-g { margin: 0; padding: 0; border: 0; display: grid; gap: 6px; }
.ovc-set-g legend { padding: 0 0 6px; font-weight: 650; font-size: 14px; }
.ovc-set label { display: flex; align-items: center; gap: 10px; min-height: 40px; font-size: 14.5px; cursor: pointer; }
.ovc-set small, .ovc-set-p { color: var(--text-muted, #7386a3); font-size: 12.5px; margin: 0; }
.ovc-set input[type=radio], .ovc-set input[type=checkbox] { width: 18px; height: 18px; accent-color: var(--accent, #3b82f6); }
.ovc-set-l { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; }
.ovc-set-l li { display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 10px; padding: 4px 4px 4px 10px; border-radius: 10px; background: color-mix(in srgb, var(--text-primary, #fff) 4%, transparent); }
.ovc-set-l span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-secondary, #b4c0d4); font-size: 13px; }
.ovc-set-add { display: grid; grid-template-columns: 110px 1fr auto; gap: 8px; align-items: start; }
.ovc-set-add input, .ovc-set-add textarea { box-sizing: border-box; width: 100%; padding: 9px 10px; border-radius: 10px; border: 1px solid var(--ovt-line, rgba(148, 163, 184, .25)); background: var(--bg-input, rgba(2, 6, 14, .35)); color: inherit; font: inherit; font-size: 14px; resize: vertical; }
.ovc-set-btn { height: 40px; padding: 0 14px; border: 0; border-radius: 12px; background: var(--accent, #3b82f6); color: var(--on-accent, #fff); font: inherit; font-weight: 650; cursor: pointer; }
@media (max-width: 480px) { .ovc-set-add { grid-template-columns: 1fr; } .ovc-file { max-width: 200px; } }
/* 4.205.0: the composer's own tool buttons and row on a page without thread.css (an agent's run, a card, any box), so it
   is the same composer everywhere. Where thread.css is loaded its rules are the same. */
.ovc .ovt-btn { flex: none; display: grid; place-items: center; width: 40px; height: 40px; border-radius: 12px; border: 0; background: none; color: var(--text-secondary, #b4c0d4); cursor: pointer; text-decoration: none; }
.ovc .ovt-btn:hover, .ovc .ovt-btn:focus-visible { background: var(--bg-hover, color-mix(in srgb, var(--text-primary, #fff) 6%, transparent)); color: var(--text-primary, #e6edf7); }
.ovc .ovt-btn .ovt-ic, .ovc .ovt-btn svg { width: 22px; height: 22px; }
.ovc .ovt-c-row { display: flex; align-items: center; gap: 6px; }
.ovc .ovt-c-tools { flex: 1; min-width: 0; display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.ovc .ovt-sr { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
`;
    function styles() { if (document.getElementById('ovc-styles')) return; const st = document.createElement('style'); st.id = 'ovc-styles'; st.textContent = CSS; document.head.appendChild(st); }
    const mods = [];
    // 4.202.0: your settings open in the one window (ov-window.js: a sheet on a phone, swiped down to close), loaded
    // from beside this file; without it, a plain <dialog>.
    const COMPOSER_REV = { 'ov-window.js': 'd3d8f9e3e6d2' };
    const selfSrc = (document.currentScript && document.currentScript.src) || '';
    function needWindow() {
        return new Promise((ok) => {
            if (root.OVWindow) return ok(root.OVWindow);
            const m = /^(https?:\/\/[^?#]*\/)ov-composer(?:\.[0-9a-f]{6,})?\.js(?:[?#]|$)/.exec(selfSrc);
            if (!m) return ok(null);
            const sc = document.createElement('script');
            sc.src = m[1] + 'ov-window.js' + (COMPOSER_REV['ov-window.js'] ? '?v=' + COMPOSER_REV['ov-window.js'] : '');
            sc.onload = () => ok(root.OVWindow || null); sc.onerror = () => ok(null);
            document.head.appendChild(sc);
        });
    }
    const live = new Set();
    const PREFS_KEY = 'ov:composer';
    const DEFAULTS = { send_key: 'enter', voice: true, density: 'comfy', snippets: [] };
    const PATH_OK = /^[MmLlHhVvCcSsQqTtAaZz0-9 ,.\-]{1,2000}$/;
    const Speech = root.SpeechRecognition || root.webkitSpeechRecognition || null;
    const mac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '');
    const IC = {
        mic: 'M12 3a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3zM5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21',
        x: 'M7 7l10 10M17 7L7 17',
        file: 'M7 3h7l5 5v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM14 3v5h5',
        slash: 'M15 4L9 20',
        at: 'M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0zM16 12v1.5a2.5 2.5 0 0 0 5 0V12a9 9 0 1 0-3.5 7.1',
        gear: 'M12 9a3 3 0 1 1 0 6 3 3 0 0 1 0-6zM12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7',
        back: 'M9 14l-5-5 5-5M4 9h11a5 5 0 0 1 0 10h-3',
    };
    const svg = (d, cls) => `<svg${cls ? ` class="${cls}"` : ''} viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;
    const el = (tag, cls, html) => { const n = document.createElement(tag); if (cls) n.className = cls; if (html != null) n.innerHTML = html; return n; };
    const store = {
        get(k) { try { return JSON.parse(root.localStorage.getItem(k) || 'null'); } catch { return null; } },
        set(k, v) { try { if (v == null) root.localStorage.removeItem(k); else root.localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } },
    };
    const size = (n) => (n < 1024 ? `${n} B` : n < 1048576 ? `${Math.round(n / 1024)} KB` : `${(n / 1048576).toFixed(n < 10485760 ? 1 : 0)} MB`);

    // ── Your settings: this browser's copy, and your account's when the Network keeps them (the same on every site).
    let prefs = Object.assign({}, DEFAULTS, store.get(PREFS_KEY) || {});
    let synced = false, rev = null;
    const token = () => { try { const n = root.OpenVibeNavbar; return n && typeof n.token === 'function' ? n.token() : null; } catch { return null; } };
    const NET = 'https://openvibe.network/api/v1/me/composer';
    async function pull() {
        const t = token(); if (!t) return;
        try {
            const r = await fetch(NET, { headers: { authorization: `Bearer ${t}`, accept: 'application/json' }, credentials: 'omit' });
            if (!r.ok) return;
            const j = await r.json();
            synced = true; rev = j.rev != null ? j.rev : null;
            prefs = Object.assign({}, DEFAULTS, j.prefs || j);
            store.set(PREFS_KEY, prefs);
            live.forEach((c) => c.refresh());
        } catch { /* local only */ }
    }
    async function push() {
        const t = token(); if (!t || !synced) return;
        try {
            const r = await fetch(NET, { method: 'PUT', headers: { authorization: `Bearer ${t}`, 'content-type': 'application/json', accept: 'application/json' }, credentials: 'omit', body: JSON.stringify({ prefs, rev }) });
            if (r.status === 409) { await pull(); return; }
            if (r.ok) { const j = await r.json().catch(() => ({})); if (j.rev != null) rev = j.rev; }
        } catch { /* kept locally */ }
    }
    function setPrefs(next) {
        prefs = Object.assign({}, DEFAULTS, prefs, next);
        prefs.snippets = (prefs.snippets || []).filter((s) => s && /^[\w-]{1,30}$/.test(s.trigger || '') && s.text).slice(0, 50);
        store.set(PREFS_KEY, prefs);
        live.forEach((c) => c.refresh());
        push();
    }
    root.addEventListener('storage', (e) => { if (e.key === PREFS_KEY) { prefs = Object.assign({}, DEFAULTS, store.get(PREFS_KEY) || {}); live.forEach((c) => c.refresh()); } });

    // ── One box.
    function enhance(form) {
        if (!form || form.__ovc) return form && form.__ovc;
        styles();
        const text = form.querySelector('[data-ovt-text]') || form.querySelector('textarea');
        if (!text) return null;
        const row = form.querySelector('.ovt-c-row');
        const tools = form.querySelector('.ovt-c-tools');
        const note = form.querySelector('[data-ovt-note]');
        const send = form.querySelector('[data-ovt-send]') || form.querySelector('[type="submit"]');
        const inputs = () => [...form.querySelectorAll('input[type="file"]')];
        const mine = () => mods.filter((m) => !m.match || m.match(form));
        const uploader = () => { const m = mine().find((x) => typeof x.upload === 'function'); return m ? m.upload : null; };
        // data-ovc-no-files: the box handles its own files (the Dock's Vibe box uploads a picture as it is picked).
        const noFiles = form.hasAttribute('data-ovc-no-files');
        const canFile = () => !noFiles && !!(inputs().length || uploader());
        const maxFiles = Number(form.getAttribute('data-ovc-max-files')) || 10;
        const maxBytes = (Number(form.getAttribute('data-ovc-max-mb')) || 25) * 1048576;
        const files = [];
        let quiet = '';
        const wasRequired = !!text.required;   // a box that was not required stays so (the Dock's Vibe box)

        const say = (s) => { if (!note) return; if (!quiet) quiet = note.textContent; note.textContent = s; clearTimeout(say.t); say.t = setTimeout(() => { note.textContent = quiet; quiet = ''; }, 5000); };
        const fire = () => text.dispatchEvent(new Event('input', { bubbles: true }));
        const ctx = {
            form, text,
            get value() { return text.value; },
            set(v) { text.value = v; fire(); },
            insert(s) { const a = text.selectionStart, b = text.selectionEnd; text.setRangeText(s, a, b, 'end'); fire(); text.focus(); },
            files: () => files.map((f) => f.file),
            add: (list) => add(list),
            note: say,
            send: () => { if (form.requestSubmit) form.requestSubmit(send || undefined); else form.submit(); },
        };

        // Files: a strip of chips above the box.
        const strip = el('div', 'ovc-files');
        strip.hidden = true;
        strip.setAttribute('aria-label', 'Attached files');
        const firstLabel = form.querySelector(`label[for="${text.id}"]`);
        form.insertBefore(strip, firstLabel || text);
        const accepts = (file) => {
            const acc = (inputs()[0] && inputs()[0].getAttribute('accept')) || '';
            if (!acc) return true;
            const name = (file.name || '').toLowerCase(), type = (file.type || '').toLowerCase();
            return acc.split(',').map((x) => x.trim().toLowerCase()).some((a) => !a || (a.startsWith('.') ? name.endsWith(a) : a.endsWith('/*') ? type.startsWith(a.slice(0, -1)) : type === a));
        };
        function syncInputs() {
            if (noFiles) return;
            if (uploader()) { inputs().forEach((i) => { i.value = ''; }); return; }
            const [first, ...rest] = inputs();
            if (!first || typeof DataTransfer === 'undefined') return;
            const dt = new DataTransfer();
            files.forEach((f) => dt.items.add(f.file));
            first.files = dt.files;
            rest.forEach((i) => { i.value = ''; });
        }
        function paintFile(f) {
            const kind = (f.file.type || '').split('/')[0];
            const chip = f.chip || el('div', 'ovc-file');
            f.chip = chip;
            chip.classList.toggle('is-bad', !!f.error);
            chip.classList.toggle('is-up', f.progress != null && f.progress < 1 && !f.error);
            chip.style.setProperty('--p', String(f.progress == null ? 1 : f.progress));
            const ext = ((f.file.name || '').split('.').pop() || 'file').slice(0, 4).toUpperCase();
            const thumb = f.url && kind === 'image' ? `<img class="ovc-file-th" src="${f.url}" alt="">` : f.url && kind === 'video' ? `<video class="ovc-file-th" src="${f.url}" muted preload="metadata"></video>` : `<span class="ovc-file-th ovc-file-ic">${f.pasted ? svg(IC.file) : ext}</span>`;
            chip.innerHTML = `${thumb}<span class="ovc-file-t"><span class="ovc-file-n"></span><span class="ovc-file-s"></span></span>`
                + (f.pasted ? `<button type="button" class="ovc-file-b" data-ovc-back aria-label="Put the text back in the box" title="Put it back in the box">${svg(IC.back)}</button>` : '')
                + `<button type="button" class="ovc-file-x" data-ovc-x aria-label="Remove">${svg(IC.x)}</button>`;
            chip.querySelector('.ovc-file-n').textContent = f.pasted ? 'Pasted text' : f.file.name || 'File';
            chip.querySelector('.ovc-file-s').textContent = f.error || (f.pasted ? `${f.lines} lines · ${size(f.file.size)}` : f.progress != null && f.progress < 1 ? `${Math.round(f.progress * 100)}%` : size(f.file.size));
            chip.querySelector('[data-ovc-x]').setAttribute('aria-label', `Remove ${f.pasted ? 'the pasted text' : f.file.name || 'the file'}`);
            if (!chip.isConnected) strip.appendChild(chip);
        }
        function remove(f) {
            const i = files.indexOf(f); if (i < 0) return;
            files.splice(i, 1);
            if (f.url) URL.revokeObjectURL(f.url);
            if (f.hidden) f.hidden.remove();
            form.dispatchEvent(new CustomEvent('ovc:file-removed', { detail: { file: f.file, chip: f.chip } }));
            f.chip.remove();
            strip.hidden = !files.length;
            syncInputs();
            syncSend();
        }
        function add(list, pasted) {
            const up = uploader();
            for (const file of [...(list || [])]) {
                if (files.length >= maxFiles) { say(`Up to ${maxFiles} files at a time.`); break; }
                if (!accepts(file)) { say(`${file.name || 'That file'}: this box does not take that kind of file.`); continue; }
                if (file.size > maxBytes) { say(`${file.name || 'That file'} is ${size(file.size)}: the limit is ${size(maxBytes)}.`); continue; }
                const kind = (file.type || '').split('/')[0];
                const f = { file, url: kind === 'image' || kind === 'video' ? URL.createObjectURL(file) : null, pasted: !!pasted, lines: pasted ? pasted.lines : 0, text: pasted ? pasted.text : null };
                files.push(f);
                paintFile(f);
                form.dispatchEvent(new CustomEvent('ovc:file-added', { detail: { file, chip: f.chip } }));
                if (up) {
                    f.progress = 0; paintFile(f);
                    Promise.resolve(up(file, (p) => { f.progress = Math.max(0, Math.min(0.99, Number(p) || 0)); paintFile(f); syncSend(); }))
                        .then((r) => {
                            if (!files.includes(f)) return;
                            f.progress = 1; f.id = r && r.id;
                            if (f.id) { f.hidden = el('input'); f.hidden.type = 'hidden'; f.hidden.name = form.getAttribute('data-ovc-ids') || 'attachments'; f.hidden.value = f.id; form.appendChild(f.hidden); }
                            paintFile(f); syncSend();
                        }, (e) => { f.error = (e && e.message) || 'Did not upload'; paintFile(f); syncSend(); });
                }
            }
            strip.hidden = !files.length;
            syncInputs();
            syncSend();
        }
        strip.addEventListener('click', (e) => {
            const chip = e.target.closest && e.target.closest('.ovc-file'); if (!chip) return;
            const f = files.find((x) => x.chip === chip); if (!f) return;
            if (e.target.closest('[data-ovc-x]')) { remove(f); text.focus(); }
            else if (e.target.closest('[data-ovc-back]')) { const t = f.text; remove(f); ctx.insert(t); }
        });
        form.addEventListener('change', (e) => {
            const i = e.target; if (noFiles || !i || i.type !== 'file' || i.__ovcSync) return;
            const picked = [...(i.files || [])];
            i.__ovcSync = true; i.value = ''; i.__ovcSync = false;
            add(picked);
        });
        text.addEventListener('paste', (e) => {
            const cd = e.clipboardData; if (!cd || !canFile()) return;
            const got = [...(cd.files || [])];
            if (got.length) { e.preventDefault(); add(got); return; }
            const t = cd.getData('text/plain') || '';
            const lines = t.split('\n').length;
            if (t.length > 6000 || lines > 120) {
                // Only where the box takes a text file (or a mod uploads): a box for pictures keeps the paste as text.
                const asFile = new File([t], 'pasted-text.txt', { type: 'text/plain' });
                if (!uploader() && !accepts(asFile)) return;
                e.preventDefault();
                add([asFile], { lines, text: t });
                say('The long paste went in as a file: its Put back button returns it to the box.');
            }
        });
        const zone = form.closest('[data-ovt]') || form;
        let depth = 0;
        const hasFiles = (e) => e.dataTransfer && [...(e.dataTransfer.types || [])].includes('Files');
        zone.addEventListener('dragenter', (e) => { if (!hasFiles(e) || !canFile()) return; depth++; form.classList.add('ovc-dropping'); });
        zone.addEventListener('dragleave', () => { if (depth && --depth === 0) form.classList.remove('ovc-dropping'); });
        zone.addEventListener('dragover', (e) => { if (hasFiles(e) && canFile()) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } });
        zone.addEventListener('drop', (e) => { if (!hasFiles(e) || !canFile()) return; e.preventDefault(); depth = 0; form.classList.remove('ovc-dropping'); add(e.dataTransfer.files); text.focus(); });

        // Send waits for words or a file, and for uploads to finish.
        const busy = () => files.some((f) => f.progress != null && f.progress < 1 && !f.error);
        function syncSend() {
            if (!send || form.classList.contains('is-busy')) return;
            send.disabled = busy() || (!text.value.trim() && !files.length);
            if (wasRequired && text.required && files.length) text.required = false;
            else if (wasRequired && !files.length && !text.required && !form.classList.contains('is-busy')) text.required = true;
        }
        text.addEventListener('input', syncSend);

        // The slash list and the mention list: one popover above the box.
        const pop = el('div', 'ovc-pop');
        pop.setAttribute('role', 'listbox');
        pop.id = `ovc-pop-${Math.random().toString(36).slice(2, 8)}`;
        pop.hidden = true;
        form.appendChild(pop);
        text.setAttribute('aria-controls', pop.id);
        let items = [], at = 0, trig = null, seq = 0;
        function siteCommands() {
            let list = [];
            try { list = JSON.parse(form.getAttribute('data-ovt-commands') || '[]'); } catch { /* none */ }
            return list.filter((c) => c && /^[\w-]{1,30}$/.test(c.name || ''));
        }
        function commands() {
            const own = (prefs.snippets || []).map((s) => ({ name: s.trigger, hint: s.label || s.text.slice(0, 60), insert: s.text, mine: true }));
            const fromMods = mine().flatMap((m) => m.commands || []);
            return [...siteCommands(), ...fromMods, ...own, { name: 'settings', hint: 'Your composer: what sends, voice, your own commands', run: () => openSettings() }];
        }
        function caretWord() {
            const upto = text.value.slice(0, text.selectionStart);
            let m = upto.match(/(?:^|\n)\/([\w-]{0,30})$/);
            if (m) return { kind: 'slash', q: m[1], from: upto.length - m[1].length - 1 };
            m = upto.match(/(?:^|[\s(])@([\w.-]{0,30})$/);
            if (m && mine().some((x) => x.mentions && typeof x.mentions.search === 'function')) return { kind: 'at', q: m[1], from: upto.length - m[1].length - 1 };
            return null;
        }
        function close() { pop.hidden = true; items = []; trig = null; text.removeAttribute('aria-activedescendant'); text.setAttribute('aria-expanded', 'false'); }
        function paintPop() {
            if (!items.length) { close(); return; }
            pop.innerHTML = '';
            items.forEach((it, i) => {
                const b = el('button', 'ovc-pop-i');
                b.type = 'button'; b.id = `${pop.id}-${i}`;
                b.setAttribute('role', 'option');
                b.setAttribute('aria-selected', i === at ? 'true' : 'false');
                const lead = it.avatar ? el('img', 'ovc-pop-av') : el('span', 'ovc-pop-ic', svg(trig && trig.kind === 'at' ? IC.at : it.name === 'settings' ? IC.gear : IC.slash));
                if (it.avatar) { lead.src = it.avatar; lead.alt = ''; }
                const t = el('span', 'ovc-pop-t');
                const n = el('b'); n.textContent = trig && trig.kind === 'at' ? it.label : `/${it.name}`;
                const h = el('span'); h.textContent = trig && trig.kind === 'at' ? (it.sub || (it.handle ? `@${it.handle}` : '')) : it.hint || '';
                t.append(n, h);
                b.append(lead, t);
                if (it.mine) b.appendChild(el('span', 'ovc-pop-tag', 'Yours'));
                b.addEventListener('mousedown', (e) => e.preventDefault());
                b.addEventListener('click', () => choose(i));
                pop.appendChild(b);
            });
            pop.hidden = false;
            text.setAttribute('aria-expanded', 'true');
            text.setAttribute('aria-activedescendant', `${pop.id}-${at}`);
            const cur = pop.children[at]; if (cur && cur.scrollIntoView) cur.scrollIntoView({ block: 'nearest' });
        }
        async function look() {
            const w = caretWord();
            if (!w) { close(); return; }
            trig = w; const mineSeq = ++seq;
            if (w.kind === 'slash') {
                const q = w.q.toLowerCase();
                items = commands().filter((c) => !q || c.name.toLowerCase().startsWith(q) || (c.hint || '').toLowerCase().includes(q)).slice(0, 12);
                at = 0; paintPop(); return;
            }
            const srcs = mine().filter((m) => m.mentions && typeof m.mentions.search === 'function');
            const lists = await Promise.all(srcs.map((m) => Promise.resolve(m.mentions.search(w.q)).catch(() => [])));
            if (mineSeq !== seq) return;
            items = lists.flat().filter((x) => x && x.label).slice(0, 8);
            at = 0; paintPop();
        }
        function choose(i) {
            const it = items[i]; if (!it || !trig) return;
            const end = text.selectionStart;
            const from = trig.from, kind = trig.kind;
            close();
            if (kind === 'at') { text.setRangeText(it.insert || `@${it.handle || it.label} `, from, end, 'end'); fire(); text.focus(); return; }
            text.setRangeText('', from, end, 'end');
            if (typeof it.run === 'function') { fire(); try { it.run(ctx); } catch (e) { console.error(e); } return; }
            text.setRangeText(String(it.insert || ''), from, from, 'end'); fire(); text.focus();
        }
        let lookT = 0;
        text.addEventListener('input', () => { clearTimeout(lookT); lookT = setTimeout(() => { lookT = 0; look(); }, trig && trig.kind === 'at' ? 140 : 0); });
        text.addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== text) close(); }, 120));
        text.setAttribute('aria-autocomplete', 'list');

        // Keys, before the thread's own: the list's arrows and Enter, what sends, and the marks.
        form.addEventListener('keydown', (e) => {
            if (e.target !== text) return;
            // Enter right after the last letter: the slash list is read now, so "/settings" + Enter picks it.
            if (e.key === 'Enter' && lookT) { clearTimeout(lookT); lookT = 0; const w = caretWord(); if (w && w.kind === 'slash') look(); }
            if (!pop.hidden && items.length) {
                if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); e.stopPropagation(); at = (at + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length; paintPop(); return; }
                if ((e.key === 'Enter' && !e.shiftKey) || e.key === 'Tab') { e.preventDefault(); e.stopPropagation(); choose(at); return; }
                if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return; }
            }
            const mod = mac ? e.metaKey : e.ctrlKey;
            if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
                if (mod) { e.preventDefault(); e.stopPropagation(); if (!send || !send.disabled) ctx.send(); return; }
                if (prefs.send_key === 'mod-enter') { e.stopPropagation(); return; }
                if (busy()) { e.preventDefault(); e.stopPropagation(); say('A file is still uploading.'); return; }
                if (!text.value.trim() && files.length && (root.matchMedia ? root.matchMedia('(pointer: fine)').matches : true)) { e.preventDefault(); e.stopPropagation(); ctx.send(); return; }
            }
            const wrap = { b: '**', i: '_', e: '`' }[mod && !e.altKey && !e.shiftKey ? e.key.toLowerCase() : ''];
            if (wrap) {
                e.preventDefault(); e.stopPropagation();
                const a = text.selectionStart, z = text.selectionEnd, sel = text.value.slice(a, z);
                text.setRangeText(wrap + sel + wrap, a, z, 'select');
                if (!sel) text.setSelectionRange(a + wrap.length, a + wrap.length);
                else text.setSelectionRange(a + wrap.length, z + wrap.length);
                fire();
            }
        }, true);

        // The send: the mods may hold it; files still uploading hold it; the draft goes.
        const draftKey = form.hasAttribute('data-ovc-no-draft') ? null : `ov:draft:${location.pathname}#${form.id || form.getAttribute('action') || ''}`;
        form.addEventListener('submit', (e) => {
            if (busy()) { e.preventDefault(); e.stopImmediatePropagation(); say('A file is still uploading.'); return; }
            for (const m of mine()) {
                if (typeof m.beforeSend !== 'function') continue;
                let ok; try { ok = m.beforeSend(ctx); } catch (err) { console.error(err); }
                if (ok === false) { e.preventDefault(); e.stopImmediatePropagation(); return; }
            }
            if (draftKey) store.set(draftKey, null);
            close();
        }, true);
        if (draftKey) {
            const d = store.get(draftKey);
            if (d && d.t && !text.value && Date.now() - (d.at || 0) < 7 * 864e5) { text.value = d.t; fire(); }
            let dt = 0;
            text.addEventListener('input', () => { clearTimeout(dt); dt = setTimeout(() => store.set(draftKey, text.value.trim() ? { t: text.value, at: Date.now() } : null), 400); });
        }

        // The count, near the box's limit.
        let count = null;
        if (text.maxLength > 0 && row) {
            count = el('span', 'ovc-count'); count.setAttribute('aria-live', 'polite');
            row.insertBefore(count, send && send.parentNode === row ? send : null);
            // The count shows only near the limit: the last 15% of a box, at most 200 and at least 20 characters (a 120-character
            // search box said "120 left" while empty, 2026-11-11).
            const paintCount = () => { const left = text.maxLength - text.value.length; count.hidden = left > Math.min(200, Math.max(20, Math.round(text.maxLength * 0.15))); count.textContent = `${left} left`; count.classList.toggle('is-low', left < 20); };
            text.addEventListener('input', paintCount); paintCount();
        }

        // Voice: the browser listens, the words go in at the caret as they come.
        let mic = null, rec = null;
        function micButton() {
            if (!Speech || !tools) return;
            if (!prefs.voice) { if (mic) { mic.remove(); mic = null; } return; }
            if (mic) return;
            mic = el('button', 'ovt-btn ovc-mic', svg(IC.mic));
            mic.type = 'button'; mic.setAttribute('aria-label', 'Speak'); mic.title = 'Speak'; mic.setAttribute('aria-pressed', 'false');
            mic.addEventListener('click', () => {
                if (rec) { rec.stop(); return; }
                rec = new Speech();
                rec.lang = document.documentElement.lang || navigator.language || 'en-US';
                rec.interimResults = true; rec.continuous = true;
                const a = text.selectionStart, z = text.selectionEnd, head = text.value.slice(0, a), tail = text.value.slice(z);
                const pad = head && !/\s$/.test(head) ? ' ' : '';
                rec.onresult = (ev) => { let s = ''; for (let i = 0; i < ev.results.length; i++) s += ev.results[i][0].transcript; text.value = head + pad + s + tail; text.setSelectionRange((head + pad + s).length, (head + pad + s).length); fire(); };
                rec.onend = () => { rec = null; mic.setAttribute('aria-pressed', 'false'); mic.title = 'Speak'; text.focus(); };
                rec.onerror = (ev) => { if (ev.error === 'not-allowed') say('The microphone is blocked for this site.'); };
                try { rec.start(); mic.setAttribute('aria-pressed', 'true'); mic.title = 'Stop listening'; } catch { rec = null; }
            });
            tools.appendChild(mic);
        }

        // The mods' tools: buttons in the row, in the order the mods came.
        let modTools = [];
        function paintTools() {
            modTools.forEach((b) => b.remove()); modTools = [];
            if (!tools) return;
            for (const t of mine().flatMap((m) => m.tools || [])) {
                if (!t || !t.label || typeof t.run !== 'function') continue;
                const b = el('button', 'ovt-btn ovc-tool', svg(PATH_OK.test(t.path || '') ? t.path : IC.slash));
                b.type = 'button'; b.setAttribute('aria-label', t.label); b.title = t.label;
                b.addEventListener('click', () => { try { t.run(ctx); } catch (e) { console.error(e); } });
                tools.insertBefore(b, mic && mic.parentNode === tools ? mic : null);
                modTools.push(b);
            }
        }

        const api = {
            form, ctx,
            refresh() { form.classList.toggle('ovc-compact', prefs.density === 'compact'); micButton(); paintTools(); syncSend(); },
            add, files: () => files.map((f) => f.file), clearFiles: () => { [...files].forEach(remove); },
            uploads: () => files.map((f) => f.id).filter(Boolean),
            clear() { files.slice().forEach(remove); text.value = ''; if (draftKey) store.set(draftKey, null); fire(); },
            destroy() { live.delete(api); pop.remove(); strip.remove(); if (mic) mic.remove(); modTools.forEach((b) => b.remove()); form.__ovc = null; },
        };
        form.__ovc = api;
        form.addEventListener('reset', () => setTimeout(() => api.clear(), 0));
        live.add(api);
        form.classList.add('ovc');
        api.refresh();
        return api;
    }

    // ── Your settings, in a sheet: what sends, voice, compact, your own commands.
    let sheet = null;
    function openSettings(from) {
        const opener = from || document.activeElement;
        needWindow().then((W) => settingsIn(W, opener));
    }
    function settingsIn(W, opener) {
        let win = null;
        if (!W && !sheet) {
            sheet = el('dialog', 'ovc-set');
            sheet.setAttribute('aria-label', 'Your composer');
            sheet.addEventListener('click', (e) => { if (e.target === sheet) sheet.close(); });
            document.body.appendChild(sheet);
        }
        const k = mac ? '⌘' : 'Ctrl';
        const host = W ? el('div', 'ovc-set ovc-set-in') : sheet;
        host.innerHTML = `<form method="dialog" class="ovc-set-f">${W ? '' : `<header class="ovc-set-h"><b>Your composer</b><button class="ovt-btn" value="done" aria-label="Done">${svg(IC.x)}</button></header>`}
<fieldset class="ovc-set-g"><legend>Send with</legend><label><input type="radio" name="send_key" value="enter"> Enter <small>(Shift+Enter for a new line)</small></label><label><input type="radio" name="send_key" value="mod-enter"> ${k}+Enter <small>(Enter for a new line)</small></label></fieldset>
<label class="ovc-set-c"><input type="checkbox" name="voice"> A microphone button${Speech ? '' : ' <small>(this browser cannot listen)</small>'}</label>
<label class="ovc-set-c"><input type="checkbox" name="compact"> A compact box</label>
<fieldset class="ovc-set-g"><legend>Your commands</legend><p class="ovc-set-p">Type / and the word, and its text goes in. Up to 50.</p><ul class="ovc-set-l"></ul>
<div class="ovc-set-add"><input name="trigger" placeholder="word" maxlength="30" pattern="[A-Za-z0-9_-]+" aria-label="The word after /"><textarea name="snippet" rows="2" maxlength="4000" placeholder="The text it puts in" aria-label="The text it puts in"></textarea><button type="button" class="ovc-set-btn" data-ovc-add>Add</button></div></fieldset>
<p class="ovc-set-p">${synced ? 'Saved to your account: the same on every OpenVibe site.' : 'Saved in this browser.'}</p></form>`;
        const f = host.querySelector('form');
        f.send_key.value = prefs.send_key;
        f.voice.checked = !!prefs.voice; f.voice.disabled = !Speech;
        f.compact.checked = prefs.density === 'compact';
        const list = host.querySelector('.ovc-set-l');
        const paintList = () => {
            list.innerHTML = '';
            (prefs.snippets || []).forEach((s, i) => {
                const li = el('li');
                const w = el('b'); w.textContent = `/${s.trigger}`;
                const t = el('span'); t.textContent = s.text.slice(0, 80);
                const x = el('button', 'ovt-btn', svg(IC.x)); x.type = 'button'; x.setAttribute('aria-label', `Remove /${s.trigger}`);
                x.addEventListener('click', () => { const next = prefs.snippets.slice(); next.splice(i, 1); setPrefs({ snippets: next }); paintList(); });
                li.append(w, t, x); list.appendChild(li);
            });
        };
        paintList();
        f.addEventListener('change', (e) => {
            if (e.target.name === 'send_key') setPrefs({ send_key: f.send_key.value });
            else if (e.target.name === 'voice') setPrefs({ voice: f.voice.checked });
            else if (e.target.name === 'compact') setPrefs({ density: f.compact.checked ? 'compact' : 'comfy' });
        });
        host.querySelector('[data-ovc-add]').addEventListener('click', () => {
            const w = f.trigger.value.trim().replace(/^\//, ''), t = f.snippet.value;
            if (!/^[\w-]{1,30}$/.test(w)) { f.trigger.focus(); return; }
            if (!t.trim()) { f.snippet.focus(); return; }
            setPrefs({ snippets: (prefs.snippets || []).filter((s) => s.trigger !== w).concat([{ trigger: w, text: t }]) });
            f.trigger.value = ''; f.snippet.value = '';
            paintList(); f.trigger.focus();
        });
        f.addEventListener('submit', (e) => e.preventDefault());
        if (W) win = W.open({ id: 'ov-composer-settings', title: 'Your composer', body: host, kind: 'dialog', size: 'sm', from: opener, focus: 'input[name=send_key]:checked' });
        else { if (typeof sheet.showModal === 'function') sheet.showModal(); else sheet.setAttribute('open', ''); const first = f.querySelector('input[name=send_key]:checked'); if (first) first.focus(); }
        return win;
    }

    function mod(m) {
        if (!m || !m.id) return;
        const i = mods.findIndex((x) => x.id === m.id);
        if (i >= 0) mods[i] = m; else mods.push(m);
        live.forEach((c) => c.refresh());
    }
    function scan(scope) { (scope || document).querySelectorAll('[data-ovt-composer], [data-ovc]').forEach((f) => enhance(f)); }

    root.OpenVibeComposer = { enhance, mod, scan, settings: openSettings, get prefs() { return Object.assign({}, prefs); }, setPrefs };
    if (typeof module === 'object' && module.exports) module.exports = { enhance, mod, scan };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => scan(), { once: true }); else scan();
    document.addEventListener('ov:boost:load', () => { live.forEach((c) => { if (!c.form.isConnected) c.destroy(); }); scan(); });
    pull();
})(typeof window !== 'undefined' ? window : globalThis);
