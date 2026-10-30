/**
 * ov-mark.js — the OpenVibe "OV" brand mark as a drop-in.
 *   <span class="ov-mark"></span>            → 32px animated mark
 *   <span class="ov-mark" data-size="56">    → any size; add data-static="1" for no motion
 *   <span class="ov-mark" data-variant="live">  → the site's own twist on the motion (see VARIANTS)
 * Self-contained: injects its own CSS once, works on any page (Live, Network, static pages).
 * The mark is one stroke, the "open loop" (4.25.0; the owner, 2026-10-28: "the open vibe logo isn't even that great…
 * come up with new ideas… more modern… better effects"): an O opened at the top by the V, so it reads OV and "open" at
 * once. The stroke runs from the site's accent towards violet; it draws itself in on a visit's first view, a short light
 * runs along it, and the site's dot sits in the opening (Live's is red and on air). Transform/opacity/stroke motion only.
 *
 * Motion budget: SVG animations restyle and re-lay-out on the main thread every frame, so an
 * endlessly moving mark kept idle pages 12-29% busy (browser check, OpenVibe.Host). A mark now
 * moves only for its intro (the first INTRO_MS of a visit, from the first time a mark is on screen
 * in this tab; later pages of a multi-page site open with the mark at rest), while it or its link
 * is hovered or focused (and LINGER_MS after), and while it shows activity (data-state busy/ok,
 * island.js). Otherwise its CSS animations are paused where they are and its SMIL clock stopped,
 * so it keeps its look. It never moves while the page is hidden, while it is off-screen
 * (IntersectionObserver), with data-static, under prefers-reduced-motion or under the network's
 * own reduced-motion setting (html[data-ov-motion=reduced], theme-loader.js).
 *
 * The season (theme-loader.js sets <html data-ov-season-mark="halloween|winter"> for anyone who has not turned seasonal
 * themes off, on any theme): the mark wears it, a pumpkin's stem, leaf and ribs in October, a cap of snow in December.
 * Now and then (every 4 to 8 minutes) a mark on screen flickers for a moment, and on the first visit of the day a few
 * leaves (snowflakes in December) drift down from the first mark seen. Never under either reduced-motion setting.
 */
(function () {
    'use strict';
    if (window.__ovMark) return; window.__ovMark = true;
    let n = 0;
    const CSS = `
.ov-mark{display:inline-grid;place-items:center;width:32px;height:32px;color:var(--accent,#8b5cf6);flex:none;vertical-align:middle;line-height:0;--ovm-to:color-mix(in oklab,currentColor 50%,#e879f9)}
.ov-mark svg{width:100%;height:100%;overflow:visible;transform-origin:50% 50%}
.ov-mark .g{fill:currentColor;opacity:.12;transform-box:fill-box;transform-origin:center;animation:ovmGlow 3.4s ease-in-out infinite}
.ov-mark .lp{fill:none;stroke-width:5.2;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:100;animation:ovmDraw 1.2s cubic-bezier(.3,.8,.2,1) both}
.ov-mark .sw{fill:none;stroke:#fff;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:7 93;opacity:.9;animation:ovmSweep 3s linear infinite}
.ov-mark .d{fill:var(--ovm-dot,var(--text-primary,#fff));transform-box:fill-box;transform-origin:center;animation:ovmDot 2.4s ease-in-out infinite}
/* Per-site variants: one family, each site with its own rhythm so the network reads as one brand with many rooms.
   Colours stay with the theme (currentColor); only the dot and the motion change. */
.ov-mark[data-variant=live]{--ovm-dot:#ef4444}
.ov-mark[data-variant=live] .d{animation:ovmOnAir 1.4s ease-in-out infinite}
.ov-mark[data-variant=tools] .sw{animation-duration:2s}
.ov-mark[data-variant=media] .sw,.ov-mark[data-variant=video] .sw{stroke-dasharray:3 6;animation-duration:6s}
.ov-mark[data-variant=games] svg{animation:ovmBounce 1.6s cubic-bezier(.3,1.4,.4,1) infinite}
.ov-mark[data-variant=games] .d{animation-duration:1.6s}
.ov-mark[data-variant=community] .sw{animation-direction:reverse}
.ov-mark[data-variant=network] .g{animation-duration:2.4s}
.ov-mark[data-variant=chat] .d{animation:ovmDot 1s ease-in-out infinite}
.ov-mark[data-variant=stream] .sw{stroke-dasharray:20 80;animation-duration:2.4s}
.ov-mark[data-variant=codes] .lp{animation:ovmDraw 1.1s cubic-bezier(.2,.8,.2,1) infinite alternate}
.ov-mark[data-variant=blog] .sw,.ov-mark[data-variant=wiki] .sw,.ov-mark[data-variant=news] .sw{animation-duration:6s}
.ov-mark[data-variant=vip]{--ovm-dot:#facc15}
.ov-mark[data-variant=tips]{--ovm-dot:#22c55e}
.ov-mark[data-variant=deals],.ov-mark[data-variant=coupons]{--ovm-dot:#f59e0b}
.ov-mark[data-variant=trade] .sw{animation-timing-function:cubic-bezier(.4,0,.2,1)}
.ov-mark[data-variant=host] svg{animation:none}
@keyframes ovmOnAir{0%,100%{transform:scale(1);opacity:.75}50%{transform:scale(1.6);opacity:1}}
@keyframes ovmBounce{0%,100%{transform:translateY(0)}50%{transform:translateY(-2.5px)}}
.ov-mark:hover svg,a:hover>.ov-mark svg,button:hover>.ov-mark svg{animation:ovmSpin .9s cubic-bezier(.2,1.5,.3,1) 1}
.ov-mark:hover .sw,a:hover>.ov-mark .sw{animation-duration:1s}
.ov-mark[data-static] svg,.ov-mark[data-static] .g,.ov-mark[data-static] .lp,.ov-mark[data-static] .sw,.ov-mark[data-static] .d{animation:none!important}
.ov-mark[data-static] .sw{display:none}
.ov-mark[data-ov]:not([data-ovm-run]) svg,.ov-mark[data-ov]:not([data-ovm-run]) .g,.ov-mark[data-ov]:not([data-ovm-run]) .sw,.ov-mark[data-ov]:not([data-ovm-run]) .d{animation-play-state:paused!important}
.ov-mark[data-ov]:not([data-ovm-run]) .sw{opacity:0;transition:opacity .4s}
.ov-mark[data-ov][data-variant=codes]:not([data-ovm-run]) .lp{animation:none!important;stroke-dashoffset:0}
.ov-mark .p{fill:none;stroke:currentColor;stroke-width:3.4;stroke-linecap:round;transform:rotate(-90deg);transform-box:fill-box;transform-origin:center;stroke-dasharray:138.2;stroke-dashoffset:calc(138.2px * (1 - var(--ovm-p,0)));opacity:0;transition:stroke-dashoffset .35s cubic-bezier(.2,.8,.2,1),opacity .2s}
.ov-mark[data-progress] .p{opacity:1}
.ov-mark[data-progress] .sw{opacity:0}
.ov-mark[data-state=busy] .sw{animation-duration:1s}
.ov-mark[data-state=ok]{color:var(--success,#22c55e)!important}
.ov-mark[data-state=error]{color:var(--danger,#ef4444)!important}
.ov-mark[data-state=ok] svg{animation:ovmSpin .9s cubic-bezier(.2,1.5,.3,1) 1}
@keyframes ovmGlow{0%,100%{opacity:.08;transform:scale(.92)}50%{opacity:.2;transform:scale(1.06)}}
@keyframes ovmDraw{from{stroke-dashoffset:100}to{stroke-dashoffset:0}}
@keyframes ovmSweep{from{stroke-dashoffset:100}to{stroke-dashoffset:0}}
@keyframes ovmDot{0%,100%{transform:scale(1);opacity:.85}50%{transform:scale(1.45);opacity:1}}
@keyframes ovmSpin{from{transform:rotate(0deg) scale(1)}40%{transform:rotate(200deg) scale(1.15)}to{transform:rotate(360deg) scale(1)}}
.ov-mark .sh,.ov-mark .sw2{display:none}
html[data-ov-season-mark=halloween] .ov-mark .sh,html[data-ov-season-mark=winter] .ov-mark .sw2{display:inline}
html[data-ov-season-mark=halloween] .ov-mark .d{display:none}
.ov-mark .ss{fill:none;stroke:#5fae3c;stroke-width:3.2;stroke-linecap:round}
.ov-mark .sl{fill:#7fd04e;transform-box:fill-box;transform-origin:0 70%}
.ov-mark .sc{fill:none;stroke:#f4fbff;stroke-width:4.6;stroke-linecap:round}
.ov-mark .sd{fill:#f4fbff}
html[data-ov-season-mark=halloween] .ov-mark{--ovm-to:#f97316}
html[data-ov-season-mark] .ov-mark[data-ovm-run] .sl{animation:ovmLeaf .9s cubic-bezier(.3,1.6,.5,1) both}
.ov-mark[data-ovm-flourish] .sl{animation:ovmWiggle 1.2s ease-in-out 1}
.ov-mark[data-ovm-flourish] .sd{animation:ovmTwinkle 1.4s ease-in-out 1}
.ov-mark[data-ovm-flourish] .sw{animation:ovmSweep .9s linear 1;opacity:.9}
.ovm-fall{position:fixed;width:0;height:0;pointer-events:none;z-index:10010}
.ovm-fall i{position:absolute;left:-4px;top:-4px;width:9px;height:9px;border-radius:0 70% 0 70%;opacity:0;animation:ovmFall 3s cubic-bezier(.3,.1,.5,1) forwards}
html[data-ov-season-mark=winter] .ovm-fall i{width:6px;height:6px;border-radius:50%}
@keyframes ovmLeaf{from{transform:scale(0) rotate(-50deg)}to{transform:none}}
@keyframes ovmWiggle{0%,100%{transform:none}25%{transform:rotate(-18deg)}60%{transform:rotate(12deg)}}
@keyframes ovmTwinkle{0%,100%{opacity:1}50%{opacity:.3}}
@keyframes ovmFall{0%{opacity:0;transform:none}12%{opacity:1}72%{opacity:1;transform:translate(var(--x),var(--y)) rotate(var(--r))}100%{opacity:0;transform:translate(var(--x),var(--y)) rotate(var(--r))}}
@media (prefers-reduced-motion:reduce){.ov-mark svg,.ov-mark .g,.ov-mark .lp,.ov-mark .sw,.ov-mark .d,.ov-mark .sl,.ov-mark .sd{animation:none!important}.ov-mark .sw,.ovm-fall{display:none}}
html[data-ov-motion=reduced] .ov-mark .sw{display:none}`;
    // The open loop: from the opening's left end round the bottom to its right end, then down the V and back up.
    // pathLength=100 lets the draw-in and the running light be written in hundredths of the stroke.
    const LOOP = 'M15.2 8.8A17.5 17.5 0 1 0 32.8 8.8L24 30.5Z';
    function svg(id) {
        return `<svg viewBox="0 0 48 48" aria-hidden="true"><defs>
<linearGradient id="${id}g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="currentColor"/><stop offset="1" style="stop-color:var(--ovm-to)"/></linearGradient></defs>
<circle class="g" cx="24" cy="24" r="22"/>
<circle class="p" cx="24" cy="24" r="22"/>
<path class="lp" d="${LOOP}" pathLength="100" stroke="url(#${id}g)"/>
<path class="sw" d="${LOOP}" pathLength="100"/>
<circle class="d" cx="24" cy="7.4" r="2.7"/>
<g class="sh"><path class="ss" d="M24 9.6c.2-2.8 1-4.8 2.7-6.1"/><path class="sl" d="M26.4 4.6c2.3-2.5 5.8-2.7 8.3-1.2-1.9 2.7-5.4 3.5-8.3 1.2z"/></g>
<g class="sw2"><path class="sc" d="M6.6 15.4A19.4 19.4 0 0 1 14.3 7.2"/><path class="sc" d="M33.7 7.2A19.4 19.4 0 0 1 41.4 15.4"/><circle class="sd" cx="10.4" cy="9" r="1.4"/><circle class="sd" cx="38.2" cy="9.6" r="1.2"/></g></svg>`;
    }
    const INTRO_MS = 8000, LINGER_MS = 1200;
    const state = new WeakMap(); // mark → { introEnd, lingerEnd, hover, focus, onScreen, timer }
    let io = null, rm = null;
    // One intro per visit (tab): the deadline is kept in sessionStorage so the next page of a
    // multi-page site finishes the same intro instead of starting another.
    const INTRO_KEY = 'ov-mark-intro-end';
    function introDeadline(now) {
        let end = 0;
        try { end = Number(sessionStorage.getItem(INTRO_KEY)) || 0; } catch { /* no storage */ }
        if (!end || end > now + INTRO_MS) { end = now + INTRO_MS; try { sessionStorage.setItem(INTRO_KEY, String(end)); } catch { /* */ } }
        return end;
    }
    function reduced() {
        return !!(rm && rm.matches) || document.documentElement.getAttribute('data-ov-motion') === 'reduced';
    }
    function update(el) {
        const st = state.get(el); if (!st) return;
        const svgEl = el.querySelector('svg');
        if (!el.isConnected || !svgEl) { forget(el); return; }
        const now = Date.now();
        const may = !reduced() && !el.hasAttribute('data-static') && !document.hidden && st.onScreen === true;
        if (may && !st.introEnd) { st.introEnd = introDeadline(now); if (season()) setTimeout(() => fallOnce(el), 900); }
        const s = el.getAttribute('data-state');
        const run = may && (now < st.introEnd || st.hover || st.focus || now < st.lingerEnd || s === 'busy' || s === 'ok');
        if (run !== el.hasAttribute('data-ovm-run')) { if (run) el.setAttribute('data-ovm-run', ''); else el.removeAttribute('data-ovm-run'); }
        try {
            if (run) svgEl.unpauseAnimations();
            else {
                // Never run yet: rest on the frame where the V's light sweep is centred.
                if (svgEl.getCurrentTime() < 0.5) svgEl.setCurrentTime(1.6);
                svgEl.pauseAnimations();
            }
        } catch { /* no SMIL */ }
        clearTimeout(st.timer); st.timer = 0;
        const next = Math.min(...[st.introEnd, st.lingerEnd].filter((t) => t > now));
        if (run && next !== Infinity) st.timer = setTimeout(() => update(el), next - now + 20);
    }
    // A mark taken out of the page stops and is let go (a navbar re-render replaces its mark);
    // mount() picks it up again if it comes back.
    function forget(el) {
        const st = state.get(el); if (!st) return;
        clearTimeout(st.timer); state.delete(el);
        if (io) try { io.unobserve(el); } catch { /* */ }
        el.removeAttribute('data-ovm-run');
        try { el.querySelector('svg').pauseAnimations(); } catch { /* */ }
    }
    function updateAll() { document.querySelectorAll('.ov-mark[data-ov]').forEach(update); }
    // ── The season ──
    const season = () => document.documentElement.getAttribute('data-ov-season-mark');
    let flourishTimer = 0;
    function scheduleFlourish() {
        clearTimeout(flourishTimer); flourishTimer = 0;
        if (!season()) return;
        flourishTimer = setTimeout(() => {
            if (season() && !reduced() && !document.hidden) {
                document.querySelectorAll('.ov-mark[data-ov]:not([data-static])').forEach((el) => {
                    const st = state.get(el); if (!st || st.onScreen === false) return;
                    el.setAttribute('data-ovm-flourish', ''); setTimeout(() => el.removeAttribute('data-ovm-flourish'), 1700);
                });
            }
            scheduleFlourish();
        }, (4 + Math.random() * 4) * 60000);
    }
    const FALL_KEY = 'ov-season-fall';
    function fallOnce(el) {
        const id = season(); if (!id || reduced() || document.hidden || !el.isConnected) return;
        const day = id + ':' + new Date().toDateString();
        try { const ls = window.localStorage; if (ls.getItem(FALL_KEY) === day) return; ls.setItem(FALL_KEY, day); } catch { return; }
        const r = el.getBoundingClientRect(); if (!r.width || !document.body) return;
        const box = document.createElement('div'); box.className = 'ovm-fall'; box.setAttribute('aria-hidden', 'true');
        const x0 = r.left + r.width / 2, y0 = r.top + r.height * 0.6;
        box.style.left = x0 + 'px'; box.style.top = y0 + 'px';
        // The leaves land on the bottom edge of the bar the mark sits in and fade there, so they never cross a page's
        // heading (they fell 120-280 px over it on phones, 10-30). A mark outside a bar gets a short fall.
        const bar = el.closest('.openvibe-navbar,header,nav');
        const rb = bar && bar.getBoundingClientRect();
        const floor = rb && rb.bottom > y0 + 8 ? rb.bottom - y0 - 4 : 0;
        const colors = id === 'winter' ? ['#f4fbff', '#d8f3ff', '#ffffff'] : ['#ff7a1a', '#f5a524', '#d9481f', '#7fd04e'];
        for (let i = 0; i < 7; i++) {
            const s = document.createElement('i');
            const dx = Math.max(8 - x0, Math.min((window.innerWidth || 0) - 8 - x0, Math.round((Math.random() - 0.3) * 200)));
            const dy = floor ? Math.round(floor - Math.random() * 3) : Math.round(36 + Math.random() * 28);
            s.style.cssText = `--x:${dx}px;--y:${dy}px;--r:${Math.round(Math.random() * 540 - 270)}deg;animation-delay:${(i * 0.18 + Math.random() * 0.2).toFixed(2)}s;animation-duration:${(2.4 + Math.random() * 1.2).toFixed(2)}s;background:${colors[i % colors.length]}`;
            box.appendChild(s);
        }
        document.body.appendChild(box);
        setTimeout(() => box.remove(), 5200);
    }
    const bound = new WeakSet();
    function track(el) {
        state.set(el, { introEnd: 0, lingerEnd: 0, hover: false, focus: false, onScreen: io ? null : true, timer: 0 });
        if (!bound.has(el)) {
            bound.add(el);
            const host = el.closest('a,button') || el;
            const set = (k, v) => () => {
                const st = state.get(el); if (!st) return;
                st[k] = v; if (!v) st.lingerEnd = Date.now() + LINGER_MS;
                update(el);
            };
            host.addEventListener('pointerenter', set('hover', true)); host.addEventListener('pointerleave', set('hover', false));
            host.addEventListener('focusin', set('focus', true)); host.addEventListener('focusout', set('focus', false));
        }
        if (io) io.observe(el);
        update(el);
    }
    function mount(root) {
        (root || document).querySelectorAll('.ov-mark').forEach(el => {
            if (!el.hasAttribute('data-ov')) {
                el.setAttribute('data-ov', '1');
                const size = parseInt(el.getAttribute('data-size'), 10);
                if (size) { el.style.width = size + 'px'; el.style.height = size + 'px'; }
                el.innerHTML = svg('ovm' + (++n) + '_');
            }
            if (!state.has(el) && el.isConnected) track(el);
        });
    }
    function init() {
        if (!document.getElementById('ov-mark-css')) { const st = document.createElement('style'); st.id = 'ov-mark-css'; st.textContent = CSS; document.head.appendChild(st); }
        try {
            io = new IntersectionObserver((entries) => entries.forEach((e) => {
                const st = state.get(e.target); if (!st) return;
                st.onScreen = e.isIntersecting; update(e.target);
            }));
        } catch { io = null; }
        try { rm = window.matchMedia('(prefers-reduced-motion: reduce)'); rm.addEventListener('change', updateAll); } catch { rm = null; }
        document.addEventListener('visibilitychange', updateAll);
        mount();
        scheduleFlourish();
        try {
            new MutationObserver((records) => {
                let added = false;
                for (const r of records) {
                    if (r.type === 'attributes') { if (r.target === document.documentElement) { updateAll(); if (r.attributeName === 'data-ov-season-mark') scheduleFlourish(); } else if (state.has(r.target)) update(r.target); continue; }
                    if (r.addedNodes.length) added = true;
                    r.removedNodes.forEach((node) => {
                        if (node.nodeType !== 1) return;
                        if (state.has(node) && !node.isConnected) forget(node);
                        if (node.querySelectorAll) node.querySelectorAll('.ov-mark[data-ov]').forEach((m) => { if (!m.isConnected) forget(m); });
                    });
                }
                if (added) mount();
            }).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-state', 'data-static', 'data-ov-motion', 'data-ov-season-mark'] });
        } catch { /* */ }
    }
    window.ovMarkMount = mount;
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
