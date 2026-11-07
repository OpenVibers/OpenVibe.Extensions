/**
 * ov-mark.js — the OpenVibe mark as a drop-in.
 *   <span class="ov-mark"></span>                 → a 32px mark (the box is square, the mark centred in it)
 *   <span class="ov-mark" data-size="56">         → any size (the box's width); add data-static="1" for no motion
 *   <span class="ov-mark" data-wide>              → the box hugs the mark (92 × 56) instead of a square
 *   <span class="ov-mark" data-variant="live">    → the site's own touch (Live's record light in the O, see below)
 *   <span class="ov-mark" data-tone="ink|white">  → one colour: the text's (stamps, UI) or white (on a colour tile)
 *   <span class="ov-mark" data-form="heavy">      → force a form (default: heavy up to 22px wide, the pair above)
 *   data-state="busy|ok|error|no|notify|live|sleep" → what it shows (island.js sets busy/ok/error on the navbar's)
 *   data-progress="0.4" with style="--ovm-p:.4"    → a known progress: the ring draws round to that much
 * OVMark.busy(button) → { done, fail, reset }: a button at work shows the mark busy, then the tick or the "!". A form
 *   posted the old way (POST) does this by itself until the next page; data-ov-busy="off" on a form opts out.
 * Self-contained: injects its own CSS once, works on any page (Live, Network, static pages). The same mark as static
 * SVG, for servers and icons: openvibe-shared/mark (mark.js), whose numbers this file draws.
 *
 * The mark is the Pair (the owner, 2026-10-31: "Pair, halo … this should be our new logo"): a ring O and a round V,
 * with a gap of the ground around the V where it crosses the ring. The gap is a mask, so the mark sits on any ground.
 * The V is as tall as the O, so it sits level beside a word in the navbar and centred in a tile. Two forms: the pair,
 * and the heavy (thicker strokes) for 22px and under, where the pair's gap would close.
 *
 * Everything it does means something, and nothing spins:
 *   - intro: the O rises and draws itself round, the V drops in on a spring, then a glint of light crosses the mark;
 *   - hover: the V leans back, the O hops, a glint crosses and a soft glow of its two colours comes up behind it;
 *   - press: it gives a little and springs back;
 * Each stroke runs light to deep in its own colour (data-glow keeps the glow on, for heroes and brand pages).
 *   - a page on its way (navbar): the ring empties and draws itself round again as the next page loads, paced by how
 *     long this site's pages usually take in this browser (learned per site, boost moves and full loads apart); the
 *     V nods while it waits and hops when the page is here (window.OVMark.navStart/navEnd for single-page apps);
 *   - busy: the V bobs and the O breathes, in turn; ok: the V becomes a tick, green, and hops (the tick only ever
 *     means "done"); error: the V becomes "!", red, and the mark shakes; no: the V becomes "×", grey, and the O
 *     shakes its head; notify: a dot pops up by the V and the O bounces; live: the O is the record light, red, and
 *     ripples go out from it; sleep: the O closes like an eye and the V sinks.
 *
 * Motion budget: SVG animations restyle and re-lay-out on the main thread every frame, so an endlessly moving mark kept
 * idle pages 12-29% busy (browser check, OpenVibe.Host). A mark moves only for its intro (the first INTRO_MS of a
 * visit, from the first time a mark is on screen in this tab; later pages of a multi-page site open with the mark at
 * rest), while it or its link is hovered or focused (and LINGER_MS after), and while it shows a state, a page load or
 * progress. Otherwise its CSS animations are paused where they are. It never moves while the page is hidden, while it
 * is off-screen (IntersectionObserver), with data-static, under prefers-reduced-motion or under the network's own
 * reduced-motion setting (html[data-ov-motion=reduced], theme-loader.js); its colours and shapes still change.
 *
 * The season (theme-loader.js sets <html data-ov-season-mark="halloween|winter"> for anyone who has not turned seasonal
 * themes off, on any theme): the mark wears it, the O a pumpkin with its stem and leaf in October, caps of snow in
 * December. Now and then (every 4 to 8 minutes) a mark on screen flickers for a moment, and on the first visit of the
 * day a few leaves (snowflakes in December) drift down from the first mark seen. Never under either reduced-motion setting.
 */
(function () {
    'use strict';
    if (window.__ovMark) return; window.__ovMark = true;
    let n = 0;
    const f = (v) => +v.toFixed(2);
    // The Pair in a 100-unit box, centred on (50, 50) (openvibe-shared/mark: the same numbers; test/mark.test.js).
    function pair(r, sw, vsw, a = 0.86, t = 1.5, b = 2.16) {
        const R = r + sw / 2, right = b * R + vsw / 2, cx = 50 - (right - R) / 2, cy = 50;
        const A = [f(cx + a * R), f(cy - R + vsw / 2)], T = [f(cx + t * R), f(cy + R - vsw / 2)], B = [f(cx + b * R), f(cy - R + vsw / 2)];
        const ring = `M${f(cx)} ${f(cy - r)}A${r} ${r} 0 1 1 ${f(cx)} ${f(cy + r)}A${r} ${r} 0 1 1 ${f(cx)} ${f(cy - r)}`;
        const x0 = f(cx - R), x1 = f(B[0] + vsw / 2), pad = 2, w = f(x1 - x0 + 2 * pad);
        const box = `${f(50 - w / 2)} ${f(50 - w / 2)} ${w} ${w}`, wideBox = `${f(50 - w / 2)} ${f(50 - R - pad)} ${w} ${f(2 * R + 2 * pad)}`;
        // The V's two strokes, each from its first point, for every shape it takes.
        const vw = B[0] - A[0], vh = T[1] - A[1], mx = A[0] + vw / 2, my = A[1] + vh * 0.55, s = Math.min(vw, vh) * 0.42, tick = [A[0] + vw * 0.46, T[1]];
        const shapes = {
            v: [T[0], T[1], A[0], A[1], T[0], T[1], B[0], B[1]],
            tip: [T[0], T[1], T[0], T[1], T[0], T[1], T[0], T[1]],
            ok: [tick[0], tick[1], A[0] + vw * 0.16, A[1] + vh * 0.52, tick[0], tick[1], B[0] + vw * 0.06, A[1]],
            no: [mx - s + vw * 0.1, my - s, mx + s + vw * 0.1, my + s, mx - s + vw * 0.1, my + s, mx + s + vw * 0.1, my - s],
            err: [mx, A[1], mx, T[1] - vsw * 1.28, mx, T[1], mx, T[1] + 0.01],
        };
        for (const k in shapes) shapes[k] = shapes[k].map(f);
        return { cx: f(cx), cy, r, sw, R: f(R), vsw, halo: vsw + 7, A, T, B, ring, box, wideBox, shapes };
    }
    const FORMS = { pair: pair(20, 13, 13), heavy: pair(18, 18, 17) };
    const formOf = (v) => (v === 'heavy' || v === 'solid' ? 'heavy' : 'pair');
    const CSS = `
@property --ovm-fill{syntax:'<number>';inherits:true;initial-value:1}
.ov-mark{display:inline-grid;place-items:center;width:32px;height:32px;flex:none;vertical-align:middle;line-height:0;--ovm-o:#4f7cff;--ovm-v:#8b5cf6;--ovm-fill:1;transition:--ovm-fill .55s cubic-bezier(.3,.8,.2,1)}
.ov-mark[data-wide]{height:auto;aspect-ratio:94/57}
.ov-mark svg{width:100%;height:100%;overflow:visible}
.ov-mark .m,.ov-mark .og,.ov-mark .vg{transform-box:view-box}
.ov-mark .m{transform-origin:50px 50px}
.ov-mark .o,.ov-mark .ot{fill:none;stroke:var(--ovm-o);transition:stroke .35s}
.ov-mark .ot{opacity:0;transition:opacity .3s,stroke .35s}
.ov-mark .va,.ov-mark .vb{fill:none;stroke:var(--ovm-v);stroke-linecap:round;stroke-linejoin:round;transition:stroke .35s,opacity .5s}
.ov-mark .ha,.ov-mark .hb{fill:none;stroke:#000;stroke-linecap:round}
/* Depth (4.65.0): each stroke runs from a lighter to a deeper tone of its own colour, so states, seasons, tones and a
   page's own colour still decide it. Without color-mix the strokes are flat. */
.ov-mark .g1,.ov-mark .g2{stop-color:var(--ovm-o);transition:stop-color .35s}.ov-mark .g3,.ov-mark .g4{stop-color:var(--ovm-v);transition:stop-color .35s}
@supports (color:color-mix(in srgb,red 50%,blue)){.ov-mark .g1{stop-color:color-mix(in srgb,var(--ovm-o) 68%,#fff)}.ov-mark .g2{stop-color:color-mix(in srgb,var(--ovm-o) 84%,#000)}.ov-mark .g3{stop-color:color-mix(in srgb,var(--ovm-v) 70%,#fff)}.ov-mark .g4{stop-color:color-mix(in srgb,var(--ovm-v) 86%,#000)}
.ov-mark[data-tone] .g1,.ov-mark[data-tone] .g2{stop-color:var(--ovm-o)}.ov-mark[data-tone] .g3,.ov-mark[data-tone] .g4{stop-color:var(--ovm-v)}}
/* The glint: a band of light crosses the mark (its own shape is the mask) on the intro and on hover. */
.ov-mark .gr{transform-box:view-box;transform-origin:50px 50px;transform:translateX(-80px) skewX(-20deg)}
/* The glow: a soft light of the mark's two colours behind it, on hover; always on with data-glow (heroes, brand pages). */
.ov-mark{position:relative;isolation:isolate}
.ov-mark::before{content:"";position:absolute;inset:6%;z-index:-1;border-radius:50%;pointer-events:none;background:radial-gradient(closest-side at 36% 50%,var(--ovm-o),transparent),radial-gradient(closest-side at 70% 50%,var(--ovm-v),transparent);filter:blur(8px);opacity:0;transform:scale(.7);transition:opacity .45s,transform .6s cubic-bezier(.3,.8,.2,1)}
.ov-mark[data-glow]::before{opacity:.42;transform:none}
a:hover>.ov-mark::before,button:hover>.ov-mark::before,.ov-mark:hover::before,a:focus-visible>.ov-mark::before{opacity:.55;transform:scale(1.14)}
.ov-mark[data-tone]::before,.ov-mark[data-state=sleep]::before{display:none}
/* A press: the mark gives a little and springs back. */
.ov-mark .m{transition:transform .42s cubic-bezier(.34,1.56,.64,1)}
a:active>.ov-mark .m,button:active>.ov-mark .m,.ov-mark:active .m{transform:scale(.9);transition-duration:.1s}
.ov-mark .cd{display:none;fill:var(--ovm-dot,#ff3b5c);transform-box:fill-box;transform-origin:center}
.ov-mark .nd{fill:var(--danger,#ef4444);opacity:0;transform:scale(0);transform-box:fill-box;transform-origin:center;transition:opacity .2s,transform .42s cubic-bezier(.34,1.56,.64,1)}
.ov-mark .rp{fill:none;stroke:#ff3b5c;stroke-width:3;opacity:0;transform-box:fill-box;transform-origin:center}
.ov-mark[data-tone=ink]{--ovm-o:currentColor;--ovm-v:currentColor}
.ov-mark[data-tone=white]{--ovm-o:#fff;--ovm-v:#fff}
/* The season: the O is a pumpkin in October (states below still colour it). */
.ov-mark .sh,.ov-mark .sw2{display:none}
html[data-ov-season-mark=halloween] .ov-mark .sh,html[data-ov-season-mark=winter] .ov-mark .sw2{display:inline}
/* As weak as the base rule, so a state, a tone or a page's own colour (a brand page) wins over the season. */
:where(html[data-ov-season-mark=halloween]) .ov-mark{--ovm-o:#f97316}
.ov-mark .ss{fill:none;stroke:#5fae3c;stroke-width:4.4;stroke-linecap:round}
.ov-mark .sl{fill:#7fd04e;transform-box:fill-box;transform-origin:0 80%}
.ov-mark .sc{fill:none;stroke:#f4fbff;stroke-width:5.6;stroke-linecap:round}
.ov-mark .sd{fill:#f4fbff}
/* Hover and focus: the V leans back and the O hops. */
a:hover>.ov-mark:not([data-state]) .vg,button:hover>.ov-mark:not([data-state]) .vg,.ov-mark:not([data-state]):hover .vg,a:focus-visible>.ov-mark:not([data-state]) .vg{animation:ovmLean .62s ease-out 1}
a:hover>.ov-mark:not([data-state]) .og,button:hover>.ov-mark:not([data-state]) .og,.ov-mark:not([data-state]):hover .og,a:focus-visible>.ov-mark:not([data-state]) .og{animation:ovmHopO .62s ease-out 1}
a:hover>.ov-mark .gr,button:hover>.ov-mark .gr,.ov-mark:hover .gr,a:focus-visible>.ov-mark .gr{animation:ovmGlint .8s cubic-bezier(.45,0,.25,1) .05s 1}
/* The intro: the O rises and draws itself round, the V drops in on a spring, and a glint crosses the two. */
.ov-mark[data-ovm-intro] .og{animation:ovmRise .6s cubic-bezier(.34,1.4,.64,1) backwards}
.ov-mark[data-ovm-intro] .o{animation:ovmDraw .8s cubic-bezier(.65,0,.25,1) backwards}
.ov-mark[data-ovm-intro] .vg{animation:ovmDrop .62s cubic-bezier(.34,1.56,.64,1) .32s backwards}
.ov-mark[data-ovm-intro] .gr{animation:ovmGlint .9s cubic-bezier(.45,0,.25,1) .8s backwards}
html[data-ov-season-mark] .ov-mark[data-ovm-intro] .sl{animation:ovmLeaf .9s cubic-bezier(.3,1.6,.5,1) .5s both}
/* A page on its way, or a known progress: the ring draws itself round to the level over a faint track. */
.ov-mark[data-nav],.ov-mark[data-progress]{transition:--ovm-fill .3s linear}
.ov-mark[data-progress]{--ovm-fill:var(--ovm-p,0)}
.ov-mark[data-nav] .o,.ov-mark[data-progress] .o{stroke-dasharray:100 100;stroke-dashoffset:calc((1 - var(--ovm-fill)) * 100px)}
.ov-mark[data-nav] .ot,.ov-mark[data-progress] .ot{opacity:.24}
.ov-mark[data-nav]:not([data-ovm-arrive]) .vg{animation:ovmNod .9s ease-in-out infinite}
.ov-mark[data-ovm-arrive] .vg{animation:ovmHop .5s ease-out 1}
.ov-mark[data-ovm-arrive] .og{animation:ovmPulse .5s ease-out 1}
/* The states. */
.ov-mark[data-state=busy] .vg{animation:ovmBob .9s ease-in-out infinite}
.ov-mark[data-state=busy] .og{animation:ovmBreathe .9s ease-in-out .45s infinite}
.ov-mark[data-state=ok]{--ovm-o:var(--success,#22c55e);--ovm-v:var(--success,#22c55e)}
.ov-mark[data-state=ok] .vg{animation:ovmHop .56s ease-out .14s 1 both}
.ov-mark[data-state=error]{--ovm-o:var(--danger,#ef4444);--ovm-v:var(--danger,#ef4444)}
.ov-mark[data-state=error] .m{animation:ovmShake .56s ease-in-out 1}
.ov-mark[data-state=no]{--ovm-o:var(--text-muted,#94a3b8);--ovm-v:var(--text-muted,#94a3b8)}
.ov-mark[data-state=no] .og{animation:ovmNo .52s ease-in-out .1s 1}
.ov-mark[data-state=notify] .nd{opacity:1;transform:scale(1)}
.ov-mark[data-state=notify] .og{animation:ovmBounce .76s ease-out .14s 1}
.ov-mark[data-state=live]{--ovm-o:#ff3b5c}
.ov-mark[data-state=live] .og{animation:ovmPulse 1.6s ease-in-out infinite}
.ov-mark[data-state=live] .rp{animation:ovmRipple 1.6s ease-out infinite}
.ov-mark[data-state=live] .rp2{animation-delay:.8s}
.ov-mark[data-state=sleep] svg{filter:grayscale(1);opacity:.7}
.ov-mark[data-state=sleep] .og{transform:scaleY(.14);transition:transform .52s ease-in-out}
.ov-mark[data-state=sleep] .vg{transform:translateY(4px);transition:transform .52s ease-in-out}
.ov-mark[data-state=sleep] .va,.ov-mark[data-state=sleep] .vb{opacity:.5}
/* Per-site touches: one family, each site with its own light in the O and its own pace. */
.ov-mark[data-variant=live] .cd,.ov-mark[data-variant=vip] .cd,.ov-mark[data-variant=tips] .cd,.ov-mark[data-variant=deals] .cd,.ov-mark[data-variant=coupons] .cd{display:inline}
.ov-mark[data-variant=live][data-ovm-run]:not([data-state]) .cd{animation:ovmOnAir 1.4s ease-in-out infinite}
.ov-mark[data-variant=vip]{--ovm-dot:#facc15}
.ov-mark[data-variant=tips]{--ovm-dot:#22c55e}
.ov-mark[data-variant=deals],.ov-mark[data-variant=coupons]{--ovm-dot:#f59e0b}
.ov-mark[data-variant=games][data-state=busy] .vg,.ov-mark[data-variant=games][data-state=busy] .og{animation-duration:.6s}
.ov-mark[data-variant=chat][data-state=busy] .vg,.ov-mark[data-variant=chat][data-state=busy] .og{animation-duration:.55s}
.ov-mark[data-variant=codes][data-state=busy] .vg{animation-timing-function:steps(4,end)}
.ov-mark[data-variant=blog][data-state=busy] .vg,.ov-mark[data-variant=wiki][data-state=busy] .vg,.ov-mark[data-variant=news][data-state=busy] .vg,.ov-mark[data-variant=blog][data-state=busy] .og,.ov-mark[data-variant=wiki][data-state=busy] .og,.ov-mark[data-variant=news][data-state=busy] .og{animation-duration:1.2s}
@keyframes ovmRise{from{transform:scale(.55);opacity:0}}
@keyframes ovmDraw{from{stroke-dasharray:100 100;stroke-dashoffset:100}to{stroke-dasharray:100 100;stroke-dashoffset:0}}
@keyframes ovmDrop{from{transform:translateY(-18px) scale(.5);opacity:0}}
@keyframes ovmGlint{from{transform:translateX(-80px) skewX(-20deg)}to{transform:translateX(80px) skewX(-20deg)}}
@keyframes ovmLean{0%,100%{transform:rotate(0)}45%{transform:rotate(-11deg)}}
@keyframes ovmHopO{0%,100%{transform:translateY(0)}45%{transform:translateY(-3px)}}
@keyframes ovmNod{0%,100%{transform:rotate(0)}50%{transform:rotate(-7deg)}}
@keyframes ovmHop{0%,100%{transform:translateY(0) scaleY(1)}35%{transform:translateY(-9px) scaleY(1.04)}70%{transform:translateY(0) scaleY(.96)}}
@keyframes ovmBob{0%,100%{transform:translateY(0)}50%{transform:translateY(6px)}}
@keyframes ovmBreathe{0%,100%{transform:scale(1)}50%{transform:scale(.88)}}
@keyframes ovmPulse{0%,100%{transform:scale(1)}50%{transform:scale(1.06)}}
@keyframes ovmShake{0%,100%{transform:translateX(0)}15%{transform:translateX(-7px)}30%{transform:translateX(7px)}45%{transform:translateX(-6px)}60%{transform:translateX(6px)}80%{transform:translateX(-3px)}}
@keyframes ovmNo{0%,100%{transform:translateX(0)}20%{transform:translateX(-4px)}40%{transform:translateX(4px)}60%{transform:translateX(-3px)}80%{transform:translateX(3px)}}
@keyframes ovmBounce{0%,80%,100%{transform:translateY(0)}20%{transform:translateY(-6px)}40%{transform:translateY(0)}60%{transform:translateY(-4px)}}
@keyframes ovmOnAir{0%,100%{transform:scale(1);opacity:.8}50%{transform:scale(1.3);opacity:1}}
@keyframes ovmRipple{0%{transform:scale(1);opacity:.7}100%{transform:scale(1.9);opacity:0}}
.ov-mark[data-static] *{animation:none!important}
.ov-mark[data-ov]:not([data-ovm-run]) *{animation-play-state:paused!important}
.ov-mark[data-ovm-flourish] .sl{animation:ovmWiggle 1.2s ease-in-out 1}
.ov-mark[data-ovm-flourish] .sd{animation:ovmTwinkle 1.4s ease-in-out 1}
.ov-mark[data-ovm-flourish] .vg{animation:ovmLean .7s ease-out 1}
.ovm-fall{position:fixed;width:0;height:0;pointer-events:none;z-index:10010}
.ovm-fall i{position:absolute;left:-4px;top:-4px;width:9px;height:9px;border-radius:0 70% 0 70%;opacity:0;animation:ovmFall 3s cubic-bezier(.3,.1,.5,1) forwards}
html[data-ov-season-mark=winter] .ovm-fall i{width:6px;height:6px;border-radius:50%}
@keyframes ovmLeaf{from{transform:scale(0) rotate(-50deg)}to{transform:none}}
@keyframes ovmWiggle{0%,100%{transform:none}25%{transform:rotate(-18deg)}60%{transform:rotate(12deg)}}
@keyframes ovmTwinkle{0%,100%{opacity:1}50%{opacity:.3}}
@keyframes ovmFall{0%{opacity:0;transform:none}12%{opacity:1}72%{opacity:1;transform:translate(var(--x),var(--y)) rotate(var(--r))}100%{opacity:0;transform:translate(var(--x),var(--y)) rotate(var(--r))}}
@media (prefers-reduced-motion:reduce){.ov-mark *{animation:none!important}.ov-mark,.ov-mark *,.ov-mark::before{transition:none!important}.ovm-fall{display:none}}
html[data-ov-motion=reduced] .ov-mark *{animation:none!important}
.ov-busy{cursor:progress;pointer-events:none}
.ov-busy-mark{display:inline-block;vertical-align:-.2em;margin-right:.45em;flex:none}
`;
    const seg = (p, i) => `M${f(p[i])} ${f(p[i + 1])}L${f(p[i + 2])} ${f(p[i + 3])}`;
    function svg(id, G, wide) {
        const p = G.shapes.v, oc = `transform-origin:${G.cx}px ${G.cy}px`, vc = `transform-origin:${G.T[0]}px ${G.T[1]}px`;
        const ri = G.r - G.sw / 2, top = G.cy - G.R;
        // The season: a pumpkin's stem and leaf on the O; snow on the O and on the V's caps.
        const stem = `M${f(G.cx + 0.6)} ${f(top + 2.5)}c.3-4.6 1.6-8 5-10.6`, leaf = `M${f(G.cx + 5.2)} ${f(top - 7.4)}c4.4-4.8 11-5.2 15.8-2.4-3.6 5.2-10.4 6.8-15.8 2.4z`;
        const capR = f(G.r + G.sw / 2 - 1.6), at = (deg) => [f(G.cx + capR * Math.cos(deg * Math.PI / 180)), f(G.cy + capR * Math.sin(deg * Math.PI / 180))];
        const c0 = at(-150), c1 = at(-40);
        return `<svg viewBox="${wide ? G.wideBox : G.box}" aria-hidden="true"><defs>
<mask id="${id}h" maskUnits="userSpaceOnUse" x="-20" y="-20" width="140" height="140"><rect x="-20" y="-20" width="140" height="140" fill="#fff"/><g class="vg" style="${vc}"><path class="ha" d="${seg(p, 0)}" stroke-width="${G.halo}"/><path class="hb" d="${seg(p, 4)}" stroke-width="${G.halo}"/></g></mask>
<linearGradient id="${id}go" gradientUnits="userSpaceOnUse" x1="${f(G.cx - G.R)}" y1="${f(G.cy - G.R)}" x2="${f(G.cx + G.R)}" y2="${f(G.cy + G.R)}"><stop class="g1" offset="0"/><stop class="g2" offset="1"/></linearGradient>
<linearGradient id="${id}gv" gradientUnits="userSpaceOnUse" x1="0" y1="${G.A[1]}" x2="0" y2="${G.T[1]}"><stop class="g3" offset="0"/><stop class="g4" offset="1"/></linearGradient>
<linearGradient id="${id}gg"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".8"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
<mask id="${id}s" maskUnits="userSpaceOnUse" x="-20" y="-20" width="140" height="140"><g mask="url(#${id}h)"><g class="og" style="${oc}"><path d="${G.ring}" fill="none" stroke="#fff" stroke-width="${G.sw}"/></g></g><g class="vg" style="${vc}"><path class="ma" d="${seg(p, 0)}" fill="none" stroke="#fff" stroke-linecap="round" stroke-width="${G.vsw}"/><path class="mb" d="${seg(p, 4)}" fill="none" stroke="#fff" stroke-linecap="round" stroke-width="${G.vsw}"/></g></mask></defs>
<g class="m"><circle class="rp" cx="${G.cx}" cy="${G.cy}" r="${G.R}"/><circle class="rp rp2" cx="${G.cx}" cy="${G.cy}" r="${G.R}"/>
<g mask="url(#${id}h)"><g class="og" style="${oc}"><path class="ot" d="${G.ring}" stroke-width="${G.sw}"/><path class="o" d="${G.ring}" pathLength="100" stroke-width="${G.sw}" style="stroke:url(#${id}go)"/><circle class="cd" cx="${G.cx}" cy="${G.cy}" r="${f(ri * 0.62)}"/>
<g class="sw2"><path class="sc" d="M${c0[0]} ${c0[1]}A${capR} ${capR} 0 0 1 ${c1[0]} ${c1[1]}"/></g></g></g>
<g class="vg" style="${vc}"><path class="va" d="${seg(p, 0)}" stroke-width="${G.vsw}" style="stroke:url(#${id}gv)"/><path class="vb" d="${seg(p, 4)}" stroke-width="${G.vsw}" style="stroke:url(#${id}gv)"/>
<g class="sw2"><circle class="sd" cx="${G.A[0]}" cy="${f(G.A[1] - G.vsw * 0.18)}" r="${f(G.vsw * 0.36)}"/><circle class="sd" cx="${G.B[0]}" cy="${f(G.B[1] - G.vsw * 0.18)}" r="${f(G.vsw * 0.36)}"/></g></g>
<g mask="url(#${id}s)"><rect class="gr" x="38" y="-10" width="24" height="120" fill="url(#${id}gg)"/></g>
<circle class="nd" cx="${f(G.B[0] + 5.5)}" cy="${f(G.B[1] - 9)}" r="${f(G.vsw * 0.55)}"/>
<g class="sh"><path class="ss" d="${stem}"/><path class="sl" d="${leaf}"/></g>
<g class="sw2"><circle class="sd" cx="${f(G.cx - 12)}" cy="${f(top - 6)}" r="1.8"/><circle class="sd" cx="${f(G.B[0] - 6)}" cy="${f(G.B[1] - 12)}" r="1.5"/></g></g></svg>`;
    }

    // ── The V's shapes: a state turns it into a tick, a cross or "!" and back, the gap in the ring following it ──
    const SHAPE_OF = { ok: 'ok', error: 'err', no: 'no' };
    const backOut = (p) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2); };
    function drawV(q, p) {
        q.pts = p;
        const a = seg(p, 0), b = seg(p, 4);
        q.va.setAttribute('d', a); q.ha.setAttribute('d', a); q.vb.setAttribute('d', b); q.hb.setAttribute('d', b);
        if (q.ma) { q.ma.setAttribute('d', a); q.mb.setAttribute('d', b); }
    }
    function shape(el, animate) {
        const q = el.__ovm; if (!q) return;
        const name = SHAPE_OF[el.getAttribute('data-state')] || 'v';
        if (q.name === name) return;
        q.name = name;
        const to = FORMS[q.form].shapes[name], from = q.pts.slice();
        const raf = typeof window.requestAnimationFrame === 'function' ? window.requestAnimationFrame.bind(window) : null;
        if (q.raf && window.cancelAnimationFrame) window.cancelAnimationFrame(q.raf);
        if (!animate || !raf) { drawV(q, to); return; }
        const t0 = Date.now(), ms = 420;
        const step = () => { const t = Math.min(1, (Date.now() - t0) / ms), e = backOut(t); drawV(q, from.map((v, i) => v + (to[i] - v) * e)); q.raf = t < 1 ? raf(step) : 0; };
        q.raf = raf(step);
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
        // Anything the mark is showing keeps it moving: a state, a page on its way, a known progress.
        const showing = (s && s !== 'idle') || el.hasAttribute('data-nav') || el.hasAttribute('data-progress');
        const intro = now < st.introEnd;
        const run = may && (intro || st.hover || st.focus || now < st.lingerEnd || showing);
        if (run !== el.hasAttribute('data-ovm-run')) { if (run) el.setAttribute('data-ovm-run', ''); else el.removeAttribute('data-ovm-run'); }
        // The intro's pop and growth are on only inside the intro (paused with the rest while the mark cannot move).
        if ((may && intro) !== el.hasAttribute('data-ovm-intro') && (may || !intro)) { if (may && intro) el.setAttribute('data-ovm-intro', ''); else el.removeAttribute('data-ovm-intro'); }
        shape(el, run);
        try { if (run) svgEl.unpauseAnimations(); else svgEl.pauseAnimations(); } catch { /* no SMIL */ }
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
                if (size) { el.style.width = size + 'px'; if (!el.hasAttribute('data-wide')) el.style.height = size + 'px'; }
                // The form follows the size unless the page names one: under 22px the pair's gap closes, the heavy holds.
                if (!el.hasAttribute('data-form')) {
                    let px = size;
                    if (!px) { try { px = Math.round(el.getBoundingClientRect().width); } catch { px = 0; } }
                    el.setAttribute('data-form', px && px <= 22 ? 'heavy' : 'pair');
                }
                const form = formOf(el.getAttribute('data-form'));
                el.innerHTML = svg('ovm' + (++n) + '_', FORMS[form], el.hasAttribute('data-wide'));
                const pick = (c) => el.querySelector(c);
                el.__ovm = { form, name: 'v', pts: FORMS[form].shapes.v.slice(), raf: 0, va: pick('.va'), vb: pick('.vb'), ha: pick('.ha'), hb: pick('.hb'), ma: pick('.ma'), mb: pick('.mb') };
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
        hookNav();
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
            }).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-state', 'data-static', 'data-nav', 'data-progress', 'data-ov-motion', 'data-ov-season-mark'] });
        } catch { /* */ }
    }
    // ── A page on its way: the navbar's mark draws its ring round as the next page loads ──
    // The pace is learned: the usual time of this site's boost moves and full page loads in this browser (a running
    // average in localStorage). The ring reaches about four fifths at the usual time and never closes before the page
    // is really here; then it closes, the V hops, and the track fades on the new page.
    const loc = () => window.location || { host: '', href: 'http://localhost/', origin: 'http://localhost', pathname: '/', search: '' };
    const NAV_KEY = 'ov-nav-ms', NAV_FLAG = 'ov-nav-click', NAV_DEFAULT = { boost: 450, page: 1600 };
    const navMarks = () => [...document.querySelectorAll('.openvibe-navbar-brand .ov-mark, .navbar .nav-brand .ov-mark, .ov-mark[data-ov-nav]')].filter((m) => !m.closest('.openvibe-network-badge'));
    const navStore = () => { try { return JSON.parse(window.localStorage.getItem(NAV_KEY) || '{}') || {}; } catch { return {}; } };
    function usual(kind) { const v = Number(navStore()[`${loc().host}:${kind}`]); return v > 0 ? v : NAV_DEFAULT[kind] || 1000; }
    function learn(kind, ms) {
        if (!(ms > 30 && ms < 30000)) return;
        try {
            const all = navStore(), k = `${loc().host}:${kind}`;
            all[k] = Math.round(all[k] > 0 ? all[k] * 0.7 + ms * 0.3 : ms);
            window.localStorage.setItem(NAV_KEY, JSON.stringify(all));
        } catch { /* no storage: the default pace */ }
    }
    let nav = null;
    function setFill(marks, p) { marks.forEach((m) => { m.setAttribute('data-nav', ''); m.style.setProperty('--ovm-fill', String(p)); }); }
    function navStart(kind = 'page') {
        navStop();
        const marks = navMarks(); if (!marks.length) return;
        marks.forEach((m) => m.removeAttribute('data-ovm-arrive'));
        const t0 = Date.now(), avg = usual(kind);
        const me = { kind, t0, timer: 0 };
        const tick = () => {
            if (nav !== me) return;
            const t = Date.now() - t0;
            setFill(navMarks(), Math.min(0.94, 0.08 + 0.86 * (1 - Math.exp(-1.6 * t / avg))).toFixed(3));
            me.timer = setTimeout(tick, 120);
        };
        nav = me;
        tick();
    }
    function navStop() { if (nav) { clearTimeout(nav.timer); nav = null; } }
    /** The page is here: the ring closes and the V hops. A navbar re-rendered by the move gets the same ending. */
    // The ending runs after every other listener of the arrival (the navbar re-renders on it), and no timer keeps a mark:
    // each step looks the marks up again, so a replaced navbar is never held in memory.
    const clearNav = () => { if (!nav) navMarks().forEach((m) => { m.removeAttribute('data-nav'); m.removeAttribute('data-ovm-arrive'); m.style.removeProperty('--ovm-fill'); }); };
    function navEnd(kind) {
        const was = nav; navStop();
        if (was && kind) learn(kind, Date.now() - was.t0);
        setTimeout(() => {
            if (nav) return; mount();
            const marks = navMarks(); setFill(marks, 1); marks.forEach((m) => m.setAttribute('data-ovm-arrive', ''));
            setTimeout(clearNav, 520);
        }, 0);
    }
    function hookNav() {
        document.addEventListener('ov:boost:before', () => navStart('boost'));
        document.addEventListener('ov:boost:load', () => navEnd('boost'));
        // A full page load: a plain click on a link that leaves this page, in this tab, not taken by boost or the app.
        document.addEventListener('click', (e) => {
            if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
            const a = e.target && e.target.closest && e.target.closest('a[href]');
            if (!a || a.hasAttribute('download') || (a.target && a.target !== '_self')) return;
            const here = loc(); let u; try { u = new URL(a.href, here.href); } catch { return; }
            if (!/^https?:$/.test(u.protocol) || (u.origin === here.origin && u.pathname === here.pathname && u.search === here.search)) return;
            navStart('page');
            try { if (u.origin === here.origin) sessionStorage.setItem(NAV_FLAG, String(Date.now())); } catch { /* */ }
        });
        // Back to a page from the back/forward cache: nothing is loading any more.
        window.addEventListener('pageshow', (e) => { if (e.persisted) { navStop(); clearNav(); } });
        // This page came from a click on the last one: learn how long it took, and finish the ring here.
        let t = 0; try { t = Number(sessionStorage.getItem(NAV_FLAG)) || 0; sessionStorage.removeItem(NAV_FLAG); } catch { /* */ }
        if (t && Date.now() - t < 20000) {
            learn('page', Date.now() - t);
            const finish = () => { const marks = navMarks(); if (!marks.length) return false; setFill(marks, 0.9); setTimeout(() => navEnd(null), 60); return true; };
            let tries = 0; const again = () => { if (!finish() && ++tries <= 20) setTimeout(again, 100); }; again();
        }
    }
    /** Replay the intro on one mark (a brand page, a splash): the O draws itself round, the V drops in, a glint crosses. */
    function intro(el) {
        const st = el && state.get(el); if (!st) return;
        el.removeAttribute('data-ovm-intro');
        try { void el.getBoundingClientRect(); } catch { /* */ }
        st.introEnd = Date.now() + 2000; update(el);
    }
    // ── Busy buttons (the plan: "buttons' busy, then done or failed, from the mark's states", 2026-11-01) ──
    // A button that starts work shows the mark at work beside its label, keeps its width and takes no second press.
    // Script work ends it with done (the tick, and "Done" or a word) or fail (the "!", and a word), then the label
    // comes back; a form posted the old way stays busy until the next page arrives. The button is never disabled:
    // a disabled submitter's name and value would drop out of the form it posts.
    //   OVMark.busy(button) → { done(text?), fail(text?), reset() }
    const BUSY = new Map();
    function busy(btn) {
        if (!btn || !btn.isConnected) return null;
        if (BUSY.has(btn)) return BUSY.get(btn);
        const isInput = btn.tagName === 'INPUT';
        const before = isInput ? btn.value : btn.innerHTML;
        const width = btn.offsetWidth;
        if (width) btn.style.minWidth = width + 'px';
        btn.setAttribute('aria-busy', 'true');
        btn.classList.add('ov-busy');
        let mark = null;
        if (!isInput) {
            mark = document.createElement('span');
            mark.className = 'ov-mark ov-busy-mark';
            mark.setAttribute('data-size', '18'); mark.setAttribute('data-tone', 'ink'); mark.setAttribute('data-state', 'busy'); mark.setAttribute('aria-hidden', 'true');
            btn.insertBefore(mark, btn.firstChild);
            mount(btn);
        }
        let timer = 0;
        const reset = () => {
            clearTimeout(timer);
            if (!BUSY.has(btn)) return;
            BUSY.delete(btn);
            if (isInput) btn.value = before; else btn.innerHTML = before;
            btn.style.minWidth = '';
            btn.removeAttribute('aria-busy');
            btn.classList.remove('ov-busy');
            const form = btn.form || (btn.closest && btn.closest('form'));
            if (form) delete form.__ovBusy;
        };
        const end = (st, text, ms) => {
            if (!BUSY.has(btn)) return;
            if (mark) {
                mark.setAttribute('data-state', st);
                // The label after the mark says what happened, in the button's own place.
                while (mark.nextSibling) btn.removeChild(mark.nextSibling);
                btn.appendChild(document.createTextNode(text));
            } else btn.value = text;
            btn.setAttribute('aria-busy', 'false');
            clearTimeout(timer); timer = setTimeout(reset, ms);
        };
        const api = { done: (text) => end('ok', text || 'Done', 1400), fail: (text) => end('error', text || 'Failed', 2600), reset };
        BUSY.set(btn, api);
        return api;
    }
    // A form posted the old way (POST, no script of the page's own took the submit): its button shows the mark at work
    // until the next page arrives, and a second submit does nothing. data-ov-busy="off" on a form opts out.
    document.addEventListener('submit', (e) => {
        const form = e.target;
        if (!form || form.tagName !== 'FORM' || form.getAttribute('data-ov-busy') === 'off') return;
        if (String(form.getAttribute('method') || 'get').toLowerCase() !== 'post') return;
        if (form.__ovBusy) { e.preventDefault(); return; }
        if (e.defaultPrevented) return;
        const btn = e.submitter || form.querySelector('button[type=submit],button:not([type]),input[type=submit]');
        if (!btn) return;
        form.__ovBusy = true;
        busy(btn);
    });
    // Back to a page from the back/forward cache: nothing is busy any more.
    window.addEventListener('pageshow', (e) => { if (e.persisted) [...BUSY.values()].forEach((b) => b.reset()); });
    window.OVMark = { mount, navStart, navEnd, usual, intro, busy, FORMS };
    window.ovMarkMount = mount;
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
