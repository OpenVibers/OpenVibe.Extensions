/**
 * ov-window.js (openvibe-shared 4.202.0): one window for every little interface. Asks 304 and 318, the owner: "a system
 * that's used for all the windows [in] harmony … people can make their own or … custom … everything … feels connected".
 * One frame (a head with the title and ×, a body, a foot) in three kinds, the same motion, the same keys:
 *   dialog: centred on a computer; a sheet from the bottom on a phone
 *   sheet:  a sheet from the bottom on every screen
 *   panel:  floats beside what opened it on a computer, draggable by its head (where you leave it is kept per id);
 *           a sheet on a phone
 * It grows out of the button that opened it (the navbar's pop motion), closes with ×, Escape, a press outside (a dialog
 * or a sheet; a panel stays until closed, and the page under it stays usable) or a swipe down on a phone, keeps the focus inside while open, and gives it back to that button. Windows stack: Escape closes the
 * top one. The look follows the person's theme and their window style, <html data-ov-window="glass|solid|outline">
 * (OVWindow.setStyle), on every window at once.
 *
 *   const w = OVWindow.open({ id, title, body: node | text, foot: node, kind: 'dialog', size: 'md', from: button,
 *                             label, onClose, bare, width });   bare: the content draws its own head (the title is still
 *                             read); width: px, for content that wants its own
 *   w.el, w.body, w.foot, w.setTitle(text), w.close()
 * A panel can be resizable (4.204.0, the owner: a robot's controls "can be popped out … and resized"): { resizable: true,
 * minWidth, minHeight, onResize({ width, height }) } adds a grip at its corner that a mouse, a finger or a pen drags and
 * the arrow keys move (Shift for bigger steps, Enter for the first size); the size is kept with its place per id.
 * A site's content goes in as nodes (or text, set as text): the window never parses markup it is given.
 */
(function (root) {
    'use strict';
    if (typeof document === 'undefined' || root.OVWindow) return;
    const HERE = document.currentScript && document.currentScript.src;
    const WINDOW_REV = { 'ov-float.js': '5c8251ac3738' };

    const STYLES = ['glass', 'solid', 'outline'];
    const CSS = `.ovw-scrim { position: fixed; inset: 0; z-index: var(--ovw-z, 10040); background: rgba(3, 7, 15, .5); animation: ovw-fade .2s ease-out both; }
.ovw-scrim.is-clear { background: transparent; }
.ovw { position: fixed; z-index: var(--ovw-z, 10040); box-sizing: border-box; display: flex; flex-direction: column; max-height: min(86vh, 760px); color: var(--text-primary, #e6edf7);
  font: 500 15px/1.45 var(--font, Inter, system-ui, -apple-system, 'Segoe UI', sans-serif); border-radius: 20px; overflow: hidden;
  background: var(--ovw-bg); border: 1px solid var(--ovw-line); box-shadow: var(--ovw-shadow); -webkit-backdrop-filter: var(--ovw-blur); backdrop-filter: var(--ovw-blur);
  transform-origin: var(--ov-pop-x, 50%) var(--ov-pop-y, 0); animation: ovw-in .28s cubic-bezier(.2, 1.2, .3, 1) both; }
:root { --ovw-bg: color-mix(in srgb, var(--bg-elevated, var(--bg-secondary, var(--bg-primary, #111826))) 92%, transparent); --ovw-line: var(--border, rgba(255, 255, 255, .12));
  --ovw-shadow: 0 28px 70px rgba(0, 0, 0, .45), 0 2px 8px rgba(0, 0, 0, .2); --ovw-blur: blur(16px) saturate(1.3); }
html[data-ov-window="solid"] { --ovw-bg: var(--bg-elevated, var(--bg-secondary, var(--bg-primary, #111826))); --ovw-blur: none; }
html[data-ov-window="outline"] { --ovw-bg: var(--bg-primary, #0b1220); --ovw-blur: none; --ovw-line: color-mix(in srgb, var(--accent, #3b82f6) 55%, transparent); --ovw-shadow: 0 0 0 1px color-mix(in srgb, var(--accent, #3b82f6) 20%, transparent), 0 18px 40px rgba(0, 0, 0, .35); }
.ovw.is-out { animation: ovw-out .16s ease-in both; }
.ovw-h { flex: none; display: flex; align-items: center; gap: 10px; min-height: 56px; padding: 6px 8px 6px 18px; border-bottom: 1px solid color-mix(in srgb, var(--ovw-line) 70%, transparent); }
.ovw-t { flex: 1; min-width: 0; margin: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 16.5px; font-weight: 700; letter-spacing: -.01em; }
.ovw-x { flex: none; display: grid; place-items: center; width: 40px; height: 40px; padding: 0; border: 0; border-radius: 12px; background: none; color: var(--text-secondary, #a8b3c4); cursor: pointer; }
.ovw-x:hover, .ovw-x:focus-visible { background: color-mix(in srgb, var(--text-primary, #e6edf7) 9%, transparent); color: var(--text-primary, #e6edf7); }
.ovw-x:focus-visible { outline: 2px solid var(--accent, #3b82f6); outline-offset: 1px; }
.ovw-b { flex: 1; min-height: 0; overflow: auto; overscroll-behavior: contain; padding: 16px 18px 18px; }
.ovw-f { flex: none; display: flex; justify-content: flex-end; flex-wrap: wrap; gap: 8px; padding: 12px 18px calc(12px + env(safe-area-inset-bottom, 0px)); border-top: 1px solid color-mix(in srgb, var(--ovw-line) 70%, transparent); }
.ovw-f:empty { display: none; }
.ovw.is-dialog { left: 50%; top: 50%; width: min(var(--ovw-w), calc(100vw - 32px)); transform: translate(-50%, -50%); animation-name: ovw-in-c; }
.ovw.is-dialog.is-out { animation-name: ovw-out-c; }
.ovw.is-panel { width: min(var(--ovw-w), calc(100vw - 24px)); }
.ovw.is-panel .ovw-h { cursor: grab; touch-action: none; }
.ovw.is-panel.is-dragging { animation: none; transition: none; box-shadow: 0 34px 90px rgba(0, 0, 0, .55); }
.ovw.is-panel.is-dragging .ovw-h { cursor: grabbing; }
.ovw.is-sheet { left: 0; right: 0; bottom: 0; width: auto; max-height: 92vh; margin: 0 auto; max-width: 720px; border-radius: 22px 22px 0 0; border-bottom: 0; animation: ovw-up .32s cubic-bezier(.2, 1, .3, 1) both; }
.ovw.is-sheet.is-out { animation: ovw-down .2s ease-in both; }
.ovw.is-sheet .ovw-h { position: relative; padding-top: 16px; touch-action: none; }
.ovw.is-sheet .ovw-h::before { content: ""; position: absolute; left: 50%; top: 6px; width: 38px; height: 4px; margin-left: -19px; border-radius: 4px; background: color-mix(in srgb, var(--text-primary, #e6edf7) 28%, transparent); }
.ovw.is-sheet.is-dragging { animation: none; }
.ovw.is-resizable { max-height: none; }
.ovw-grip { position: absolute; right: 2px; bottom: 2px; z-index: 2; width: 26px; height: 26px; padding: 0; border: 0; border-radius: 8px; background: none; cursor: nwse-resize; touch-action: none; color: var(--text-secondary, #a8b3c4); }
.ovw-grip::before { content: ""; position: absolute; right: 6px; bottom: 6px; width: 10px; height: 10px; border-right: 2px solid currentColor; border-bottom: 2px solid currentColor; border-radius: 0 0 3px 0; opacity: .55; }
.ovw-grip:hover::before, .ovw-grip:focus-visible::before, .ovw.is-resizing .ovw-grip::before { opacity: 1; color: var(--accent, #3b82f6); }
.ovw-grip:focus-visible { outline: 2px solid var(--accent, #3b82f6); outline-offset: -2px; }
.ovw.is-resizing { animation: none; transition: none; user-select: none; }
.ovw { --ovw-w: 520px; }
.ovw.is-sm { --ovw-w: 380px; }
.ovw.is-lg { --ovw-w: 760px; }
.ovw.is-full { --ovw-w: 1100px; }
@keyframes ovw-in { from { opacity: 0; transform: translateY(calc(-6px * var(--ov-move, 1))) scale(.94); } }
@keyframes ovw-out { to { opacity: 0; transform: scale(.96); } }
@keyframes ovw-in-c { from { opacity: 0; transform: translate(-50%, calc(-50% + 10px * var(--ov-move, 1))) scale(.95); } }
@keyframes ovw-out-c { to { opacity: 0; transform: translate(-50%, -50%) scale(.97); } }
@keyframes ovw-up { from { transform: translateY(100%); } }
@keyframes ovw-down { to { transform: translateY(100%); } }
@keyframes ovw-fade { from { opacity: 0; } }
html[data-ov-motion=off] .ovw, html[data-ov-motion=off] .ovw-scrim { animation: none !important; }
html.ovw-locked { overflow: hidden; }
/* bare: the content carries its own head (a card's banner); the title is for screen readers, × floats on top, and
   the top strip is still the handle (drag a panel, swipe a sheet). */
.ovw.is-bare .ovw-h { position: absolute; left: 0; right: 0; top: 0; z-index: 3; min-height: 52px; padding: 6px; justify-content: flex-end; border: 0; background: none; }
.ovw.is-bare .ovw-t { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
.ovw.is-bare .ovw-x { width: 36px; height: 36px; border-radius: 50%; color: #fff; background: rgba(4, 8, 16, .42); -webkit-backdrop-filter: blur(8px); backdrop-filter: blur(8px); }
.ovw.is-bare .ovw-x:hover, .ovw.is-bare .ovw-x:focus-visible { background: rgba(4, 8, 16, .62); color: #fff; }
.ovw.is-bare .ovw-b { padding: 0; }
.ovw.is-bare.is-sheet .ovw-h { padding-top: 14px; }`;

    const stack = [];
    let uid = 0;
    function styles() { if (document.getElementById('ovw-styles')) return; const st = document.createElement('style'); st.id = 'ovw-styles'; st.textContent = CSS; document.head.appendChild(st); }

    // The panel's move, tuck and place are OVFloat's (ov-float.js, loaded from beside this file the first time a panel
    // opens). A page that already loaded it uses that.
    let floatLoading = null;
    const floatWait = [];
    function withFloat(cb) {
        if (root.OVFloat) { cb(root.OVFloat); return; }
        if (!HERE || floatLoading === false) return;
        if (floatLoading) { floatWait.push(cb); return; }
        floatWait.push(cb);
        const s = document.createElement('script');
        const rev = WINDOW_REV['ov-float.js'];
        s.src = HERE.replace(/ov-window\.js(?:\?.*)?$/, 'ov-float.js') + (rev ? `?v=${rev}` : '');
        s.onload = () => {
            floatLoading = null;
            for (const fn of floatWait.splice(0)) { try { fn(root.OVFloat); } catch (e) { console.error(e); } }
        };
        s.onerror = () => { floatLoading = false; floatWait.length = 0; };
        floatLoading = s;
        (document.head || document.documentElement).appendChild(s);
    }
    const phone = () => !!(root.matchMedia && root.matchMedia('(max-width: 640px)').matches);
    const focusables = (el) => [...el.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')].filter((x) => x.offsetParent !== null || x === document.activeElement);
    const place = { get(id) { try { return JSON.parse(root.localStorage.getItem(`ov:window:${id}`) || 'null'); } catch { return null; } }, set(id, v) { try { root.localStorage.setItem(`ov:window:${id}`, JSON.stringify(v)); } catch { /* private mode */ } } };
    function put(parent, v) { if (v == null) return; if (typeof v === 'string') parent.textContent = v; else parent.appendChild(v); }

    function open(o = {}) {
        styles();
        const kind0 = ['dialog', 'sheet', 'panel'].includes(o.kind) ? o.kind : 'dialog';
        const kind = phone() ? 'sheet' : kind0;
        const id = o.id || `ovw-${++uid}`;
        const opener = o.from || document.activeElement;
        const modal = o.modal !== false && kind !== 'panel';
        const z = 10040 + stack.length * 2;
        const scrim = document.createElement('div');
        scrim.className = `ovw-scrim${modal ? '' : ' is-clear'}`;
        scrim.style.setProperty('--ovw-z', String(z));
        const el = document.createElement('section');
        el.className = `ovw is-${kind} is-${['sm', 'md', 'lg', 'full'].includes(o.size) ? o.size : 'md'}${o.bare ? ' is-bare' : ''}`;
        el.style.setProperty('--ovw-z', String(z + 1));
        if (Number(o.width) > 0) el.style.setProperty('--ovw-w', `${Math.round(Number(o.width))}px`);
        el.setAttribute('role', 'dialog');
        if (modal) el.setAttribute('aria-modal', 'true');
        el.dataset.ovWindow = id;
        const head = document.createElement('header'); head.className = 'ovw-h';
        const title = document.createElement('h2'); title.className = 'ovw-t'; title.id = `${id}-t`; title.textContent = o.title || '';
        const x = document.createElement('button'); x.type = 'button'; x.className = 'ovw-x'; x.setAttribute('aria-label', 'Close');
        x.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
        head.append(title, x);
        const body = document.createElement('div'); body.className = 'ovw-b'; put(body, o.body);
        const foot = document.createElement('footer'); foot.className = 'ovw-f'; put(foot, o.foot);
        el.append(head, body, foot);
        if (o.title) el.setAttribute('aria-labelledby', title.id); else el.setAttribute('aria-label', o.label || 'Window');
        if (modal) document.body.append(scrim, el); else document.body.append(el);
        if (modal) document.documentElement.classList.add('ovw-locked');

        // Where it opens: a panel beside its opener (or where it was left), a dialog centred, a sheet at the bottom.
        let panelLeft = 0, panelTop = 0;
        if (kind === 'panel') {
            const saved = o.id ? place.get(o.id) : null;
            const cs = document.documentElement;
            const r = el.getBoundingClientRect(), vw = cs.clientWidth || root.innerWidth, vh = cs.clientHeight || root.innerHeight;
            let left, top;
            if (saved) { left = saved.x; top = saved.y; }
            else if (opener && opener.getBoundingClientRect) { const f = opener.getBoundingClientRect(); left = f.left; top = f.bottom + 8; if (top + r.height > vh - 12) top = Math.max(12, f.top - r.height - 8); }
            else { left = vw - r.width - 24; top = 72; }
            left = Math.max(8, Math.min(left, vw - r.width - 8));
            top = Math.max(8, Math.min(top, vh - 60));
            panelLeft = left; panelTop = top;
            el.style.left = `${left}px`;
            el.style.top = `${top}px`;
        }
        if (opener && opener.getBoundingClientRect && kind !== 'sheet') {
            const r = el.getBoundingClientRect(), f = opener.getBoundingClientRect();
            el.style.setProperty('--ov-pop-x', `${Math.round(f.left + f.width / 2 - r.left)}px`);
            el.style.setProperty('--ov-pop-y', `${Math.round(f.top + f.height / 2 - r.top)}px`);
        }

        let closed = false;
        const w = {
            id, el, body, foot,
            setTitle(t) { title.textContent = t || ''; },
            close(why) {
                if (closed) return; closed = true;
                if (w.float) { try { w.float.destroy(); } catch { /* */ } w.float = null; }
                const i = stack.indexOf(w); if (i >= 0) stack.splice(i, 1);
                if (!stack.some((s) => s.modal)) document.documentElement.classList.remove('ovw-locked');
                const gone = () => { el.remove(); scrim.remove(); };
                if (document.documentElement.getAttribute('data-ov-motion') === 'off') gone();
                else { el.classList.add('is-out'); scrim.style.opacity = '0'; scrim.style.transition = 'opacity .16s'; let done = false; const end = () => { if (!done) { done = true; gone(); } }; el.addEventListener('animationend', end, { once: true }); setTimeout(end, 260); }
                if (opener && opener.focus && document.contains(opener)) { try { opener.focus({ preventScroll: true }); } catch { /* */ } }
                if (typeof o.onClose === 'function') { try { o.onClose(why || 'close'); } catch (e) { console.error(e); } }
            },
            modal,
            float: null,
        };
        stack.push(w);
        if (kind === 'panel') {
            const panelId = o.id ? String(o.id) : '';
            withFloat((OVFloat) => {
                if (closed) return;
                w.float = OVFloat.attach(el, {
                    frame: null, key: panelId ? `ov:window:float:${panelId}` : undefined,
                    defaults: {
                        x: Math.max(0, Math.min(1, panelLeft / Math.max(1, (document.documentElement.clientWidth || root.innerWidth)))),
                        y: Math.max(0, Math.min(1, panelTop / Math.max(1, (document.documentElement.clientHeight || root.innerHeight)))),
                        mode: 'float',
                    },
                    aspect: null, size: false, resize: false, doubleTap: false, activeBar: false,
                    viewport: 'client', handle: head, store: null, hintClass: 'ovw-dock-hint',
                    onChange(geom) {
                        if (!panelId) return;
                        // The fractions convert back to the same pixels without reading a rect mid-landing. (The old
                        // key stays as the absolute place older releases wrote, and for the size the grip keeps there.)
                        const vw = document.documentElement.clientWidth || root.innerWidth;
                        const vh = document.documentElement.clientHeight || root.innerHeight;
                        place.set(panelId, Object.assign(place.get(panelId) || {}, { x: Math.round(geom.x * vw), y: Math.round(geom.y * vh) }));
                    },
                });
            });
        }
        x.addEventListener('click', () => w.close('x'));
        if (modal) scrim.addEventListener('pointerdown', () => w.close('outside'));
        el.addEventListener('keydown', (e) => {
            if (e.key === 'Tab') {
                const f = focusables(el); if (!f.length) return;
                const first = f[0], last = f[f.length - 1];
                if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
                else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
            }
        });

        // A sheet goes down when swiped down on a phone; a panel's head is OVFloat's handle (with its tuck and place).
        if (kind === 'sheet') {
            head.addEventListener('pointerdown', (e) => {
                if (e.target.closest('.ovw-x') || (e.button !== undefined && e.button !== 0)) return;
                const r = el.getBoundingClientRect(), sx = e.clientX, sy = e.clientY;
                let moved = false;
                el.classList.add('is-dragging');
                try { head.setPointerCapture(e.pointerId); } catch { /* */ }
                const move = (ev) => {
                    const dx = ev.clientX - sx, dy = ev.clientY - sy;
                    if (!moved && Math.hypot(dx, dy) < 4) return;
                    moved = true;
                    if (kind === 'panel') {
                        el.style.left = `${Math.max(8, Math.min(r.left + dx, root.innerWidth - r.width - 8))}px`;
                        el.style.top = `${Math.max(8, Math.min(r.top + dy, root.innerHeight - 56))}px`;
                    } else el.style.transform = `translateY(${Math.max(0, dy)}px)`;
                };
                const up = (ev) => {
                    head.removeEventListener('pointermove', move); head.removeEventListener('pointerup', up); head.removeEventListener('pointercancel', up);
                    el.classList.remove('is-dragging');
                    if (kind === 'panel') { if (moved && o.id) { const b = el.getBoundingClientRect(); place.set(o.id, Object.assign(place.get(o.id) || {}, { x: Math.round(b.left), y: Math.round(b.top) })); } return; }
                    const dy = ev.clientY - sy;
                    if (moved && dy > Math.min(140, r.height * 0.28)) w.close('swipe');
                    else { el.style.transition = 'transform .2s cubic-bezier(.2, 1, .3, 1)'; el.style.transform = ''; setTimeout(() => { el.style.transition = ''; }, 220); }
                };
                head.addEventListener('pointermove', move); head.addEventListener('pointerup', up); head.addEventListener('pointercancel', up);
            });
        }

        if (kind === 'panel' && o.resizable) resizable(el, o);

        const first = o.focus ? body.querySelector(o.focus) : focusables(body)[0];
        (first || x).focus({ preventScroll: true });
        return w;
    }

    /** A panel's corner grip: pointer drag (mouse, finger, pen) and the arrow keys; the size is kept with its place. */
    function resizable(el, o) {
        el.classList.add('is-resizable');
        const minW = Math.max(200, Number(o.minWidth) || 260), minH = Math.max(120, Number(o.minHeight) || 160);
        const grip = document.createElement('button');
        grip.type = 'button'; grip.className = 'ovw-grip';
        grip.setAttribute('aria-label', 'Resize: drag, or use the arrow keys');
        el.append(grip);
        const first = { w: el.offsetWidth, h: el.offsetHeight };
        const set = (w, h, save) => {
            const r = el.getBoundingClientRect();
            const W = Math.round(Math.max(minW, Math.min(w, root.innerWidth - r.left - 8)));
            const H = Math.round(Math.max(minH, Math.min(h, root.innerHeight - r.top - 8)));
            el.style.width = `${W}px`; el.style.height = `${H}px`;
            if (save && o.id) place.set(o.id, Object.assign(place.get(o.id) || {}, { x: Math.round(r.left), y: Math.round(r.top), w: W, h: H }));
            if (typeof o.onResize === 'function') { try { o.onResize({ width: W, height: H }); } catch { /* the page's own */ } }
        };
        const saved = o.id ? place.get(o.id) : null;
        if (saved && saved.w && saved.h) set(saved.w, saved.h, false);
        grip.addEventListener('pointerdown', (e) => {
            if (e.button !== undefined && e.button !== 0) return;
            e.preventDefault();
            const sx = e.clientX, sy = e.clientY, w0 = el.offsetWidth, h0 = el.offsetHeight;
            el.classList.add('is-resizing');
            try { grip.setPointerCapture(e.pointerId); } catch { /* */ }
            const move = (ev) => set(w0 + ev.clientX - sx, h0 + ev.clientY - sy, false);
            const up = () => {
                grip.removeEventListener('pointermove', move); grip.removeEventListener('pointerup', up); grip.removeEventListener('pointercancel', up);
                el.classList.remove('is-resizing');
                set(el.offsetWidth, el.offsetHeight, true);
            };
            grip.addEventListener('pointermove', move); grip.addEventListener('pointerup', up); grip.addEventListener('pointercancel', up);
        });
        grip.addEventListener('keydown', (e) => {
            const step = e.shiftKey ? 80 : 24;
            const d = { ArrowRight: [step, 0], ArrowLeft: [-step, 0], ArrowDown: [0, step], ArrowUp: [0, -step] }[e.key];
            if (e.key === 'Enter' || e.key === 'Home') { e.preventDefault(); set(first.w, first.h, true); return; }
            if (!d) return;
            e.preventDefault();
            set(el.offsetWidth + d[0], el.offsetHeight + d[1], true);
        });
    }

    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape' || !stack.length || e.defaultPrevented) return;
        e.preventDefault();
        stack[stack.length - 1].close('escape');
    });

    // The style is the person's display setting (theme-loader: saved, synced to their account, painted at boot as
    // <html data-ov-window>); setStyle saves through it, or straight onto the page where the theme loader is absent.
    function setStyle(name) {
        const v = STYLES.includes(name) ? name : 'glass';
        const T = root.OpenVibeThemeLoader;
        if (T && T.display && typeof T.display.set === 'function') { try { T.display.set({ window: v }); } catch { /* */ } }
        if (v === 'glass') document.documentElement.removeAttribute('data-ov-window'); else document.documentElement.setAttribute('data-ov-window', v);
        return v;
    }

    root.OVWindow = { open, setStyle, styles: STYLES.slice(), top: () => stack[stack.length - 1] || null, closeAll: () => [...stack].reverse().forEach((w) => w.close('all')) };
})(typeof window !== 'undefined' ? window : globalThis);
