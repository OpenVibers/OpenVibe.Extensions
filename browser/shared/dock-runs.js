/** The Dock's content-aware run list. All content comes from Network's action feed and Actor's skill catalogue. */
(function (root) {
    'use strict';
    if (typeof document === 'undefined' || root.OpenVibeDockRuns) return;
    const CSS = `
.ovdk-overview{display:grid;gap:8px;padding:4px 10px 12px}.ovdk-tiles{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px}
.ovdk-tile{min-width:0;display:grid;align-content:start;gap:2px;padding:10px 11px;border-radius:14px;background:color-mix(in srgb,var(--text-primary,#ececf1) 5%,transparent)}
.ovdk-tile small{font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--text-muted,#8b8b96)}
.ovdk-tile b{font-size:22px;font-weight:800;line-height:1.1;font-variant-numeric:tabular-nums;letter-spacing:-.02em}.ovdk-tile b em{font-style:normal;font-size:12px;font-weight:650;color:var(--text-secondary,#a8a8b2);letter-spacing:0;margin-left:4px}
.ovdk-tile span{white-space:pre-wrap;font-variant-numeric:tabular-nums;font-size:11.5px;color:var(--text-secondary,#a8a8b2);line-height:1.35;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.ovdk-tile .ovdk-dot{display:inline-block;width:6px;height:6px;border-radius:50%;margin:0 3px 1px 0;background:var(--ok,#3fb27f)}.ovdk-tile .ovdk-dot.is-bad{background:var(--live-red,#e5484d)}
.ovdk-tile-next b{font-size:15px;line-height:1.25;letter-spacing:0;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.ovdk-tile-next span{color:var(--accent-light,var(--accent,#60a5fa));font-weight:700}
.ovdk-overview h3{font-size:11px;font-weight:750;letter-spacing:.05em;text-transform:uppercase;color:var(--text-muted,#8b8b96);margin:8px 2px 0}.ovdk-skills{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px}
.ovdk-skills button{min-height:44px;padding:9px 11px;border-radius:12px;border:0;background:color-mix(in srgb,var(--accent,#3b82f6) 10%,transparent);color:inherit;text-align:left;cursor:pointer;font:inherit;font-size:12.5px;font-weight:650}
.ovdk-skills button:hover{background:color-mix(in srgb,var(--accent,#3b82f6) 18%,transparent)}.ovdk-overview .ovdk-runs{padding:0}.ovdk-run-filters{display:flex;gap:4px;overflow-x:auto;padding:8px 10px;scrollbar-width:none}.ovdk-run-filters::-webkit-scrollbar{display:none}
.ovdk-run-filters button{min-height:36px;padding:0 11px;border:1px solid var(--border,rgba(127,127,127,.2));border-radius:99px;background:transparent;color:inherit;cursor:pointer;white-space:nowrap;font:inherit;font-size:12px}
.ovdk-run-filters button[aria-pressed=true]{background:var(--accent,#3b82f6);color:var(--on-accent,#fff)}
.ovdk-runs{list-style:none;margin:0;padding:0 6px 10px;display:grid;gap:2px}.ovdk-run{display:grid;grid-template-columns:36px minmax(0,1fr) auto;gap:11px;padding:10px 8px;border-radius:14px;min-width:0}
.ovdk-run-more{position:relative;align-self:start}.ovdk-run-more summary{list-style:none;width:36px;height:36px;display:grid;place-items:center;border-radius:50%;cursor:pointer;color:var(--text-muted,#8b8b96)}
.ovdk-run-more summary::-webkit-details-marker{display:none}.ovdk-run-more summary svg{width:18px;height:18px;fill:currentColor}
@media (hover:hover){.ovdk-run-more summary:hover{background:color-mix(in srgb,var(--text-primary,#ececf1) 8%,transparent);color:var(--text-primary,#ececf1)}}
.ovdk-run-more menu{position:absolute;right:0;top:38px;z-index:3;min-width:210px;padding:4px;margin:0;list-style:none;border:1px solid var(--border,rgba(127,127,127,.2));border-radius:12px;background:var(--bg-primary,#19191f);box-shadow:0 10px 28px rgba(0,0,0,.28)}
.ovdk-run-more menu a,.ovdk-run-more menu button{display:flex;align-items:center;width:100%;min-height:40px;padding:0 12px;border:0;border-radius:9px;background:transparent;color:inherit;font:inherit;font-size:13px;text-decoration:none;cursor:pointer;text-align:left}
.ovdk-run-more menu a:hover,.ovdk-run-more menu button:hover{background:color-mix(in srgb,var(--text-primary,#ececf1) 7%,transparent)}
@media(max-width:640px){.ovdk-run-more summary{width:44px;height:44px}.ovdk-run-more menu{top:46px}}
@media (hover:hover){.ovdk-run:hover{background:color-mix(in srgb,var(--text-primary,#ececf1) 4%,transparent)}}
.ovdk-run-st{font-weight:750;margin-right:4px}.ovdk-run[data-state=running] .ovdk-run-st{color:var(--accent-light,var(--accent,#60a5fa))}.ovdk-run[data-state=waiting] .ovdk-run-st{color:#f0a73a}
.ovdk-run[data-state=scheduled] .ovdk-run-st{color:var(--text-primary,#ececf1)}.ovdk-run[data-state=done] .ovdk-run-st{color:var(--ok,#3fb27f)}.ovdk-run[data-state=failed] .ovdk-run-st{color:var(--live-red,#e5484d)}
.ovdk-run-ic{width:34px;height:34px;display:grid;place-items:center;border-radius:10px;background:color-mix(in srgb,var(--run-color,var(--accent,#3b82f6)) 15%,transparent);color:var(--run-color,var(--accent,#3b82f6))}
.ovdk-run-sub{min-width:0;display:grid;gap:3px}.ovdk-run-sub>b,.ovdk-run-title b{display:block;font-size:13.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ovdk-run-title{color:inherit;text-decoration:none;min-width:0}.ovdk-run-title:hover b{text-decoration:underline;text-underline-offset:2px}.ovdk-run-line{font-size:12.5px;color:var(--text-secondary,#a8a8b2);line-height:1.4;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.ovdk-run-model{display:inline-flex;align-items:center;gap:5px;font-size:12px;color:var(--text-secondary,#a8a8b2)}.ovdk-run-maker{display:inline-grid;place-items:center;width:20px;height:20px;border-radius:6px;background:color-mix(in srgb,var(--text-primary,#ececf1) 8%,transparent)}.ovdk-run-maker svg{width:14px;height:14px;fill:currentColor}
.ovdk-run-bar{height:3px;margin:2px 0;background:color-mix(in srgb,var(--accent,#3b82f6) 18%,transparent);border-radius:9px;overflow:hidden}.ovdk-run-bar:after{content:'';display:block;width:40%;height:100%;border-radius:9px;background:var(--accent,#3b82f6);animation:ovdk-run-go 1.6s cubic-bezier(.45,0,.2,1) infinite}
@keyframes ovdk-run-go{from{transform:translateX(-100%)}to{transform:translateX(250%)}}html[data-ov-motion=off] .ovdk-run-bar:after{width:45%}
.ovdk-run-actions{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:3px}.ovdk-run-actions a,.ovdk-run-actions button,.ovdk-run-actions summary{min-height:32px;display:inline-flex;align-items:center;padding:0 12px;border-radius:999px;color:inherit;background:color-mix(in srgb,var(--text-primary,#ececf1) 7%,transparent);border:0;cursor:pointer;font:inherit;font-size:12.5px;font-weight:650;text-decoration:none;list-style:none}
.ovdk-run-actions summary::-webkit-details-marker{display:none}.ovdk-run-actions .primary{background:var(--accent,#3b82f6);color:var(--on-accent,#fff)}
@media (hover:hover){.ovdk-run-actions a:hover,.ovdk-run-actions button:not(.primary):hover,.ovdk-run-actions summary:hover{background:color-mix(in srgb,var(--text-primary,#ececf1) 12%,transparent)}}
.ovdk-run-actions details{position:relative}.ovdk-run-actions details menu{position:absolute;right:0;z-index:2;min-width:180px;padding:4px;margin:0;list-style:none;border:1px solid var(--border,rgba(127,127,127,.2));border-radius:10px;background:var(--bg-primary,#19191f);box-shadow:0 8px 24px rgba(0,0,0,.2)}
.ovdk-run-repeat{display:block;width:100%;min-height:36px;padding:0 10px;text-align:left;border:0;border-radius:10px;background:transparent;color:var(--accent-light,var(--accent,#60a5fa));font:inherit;font-size:12.5px;font-weight:650;cursor:pointer}
@media(max-width:640px){.ovdk-run-filters button,.ovdk-run-actions a,.ovdk-run-actions button,.ovdk-run-actions summary,.ovdk-run-repeat{min-height:44px}.ovdk-skills button{min-height:52px}}
`;
    const h = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = String(text); return e; };
    const ago = (at) => { const n = Date.parse(at || ''); if (!Number.isFinite(n)) return ''; const m = Math.max(0, Math.round((Date.now() - n) / 60000)); return m < 1 ? 'now' : m < 60 ? `${m} min` : m < 1440 ? `${Math.floor(m / 60)} h` : `${Math.floor(m / 1440)} d`; };
    const until = (at) => { const m = Math.max(0, Math.ceil((Date.parse(at || '') - Date.now()) / 60000)); return m < 1 ? 'now' : m < 60 ? `in ${m} min` : m < 1440 ? `in ${Math.ceil(m / 60)} h` : `in ${Math.ceil(m / 1440)} d`; };
    const cash = (n) => n == null ? '' : Number(n) < .01 ? `$${Number(n).toFixed(4)}` : `$${Number(n).toFixed(2)}`;
    const iconOf = (it) => { const s = String(it.skill || it.subject && it.subject.kind || it.kind || ''); return /post|blog|write|changelog|draft|patch/.test(s) ? ['fa-pen','#d7974d'] : /wiki|article|research/.test(s) ? ['fa-book','#9875d8'] : /image|pic|meme/.test(s) ? ['fa-image','#d66bad'] : /chat|thread/.test(s) ? ['fa-comments','#61a9d7'] : /code|repo/.test(s) ? ['fa-code','#63b89c'] : /clip|stream|video/.test(s) ? ['fa-film','#dc866a'] : /quest/.test(s) ? ['fa-flag','#b9a74b'] : ['fa-sparkles','#8b92d9']; };
    const dots = () => { const NS = 'http://www.w3.org/2000/svg'; const s = document.createElementNS(NS, 'svg'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true');
        [5.5, 12, 18.5].forEach((x) => { const c = document.createElementNS(NS, 'circle'); c.setAttribute('cx', String(x)); c.setAttribute('cy', '12'); c.setAttribute('r', '1.7'); s.append(c); }); return s; };
    const isUrl = (u) => /^https:\/\//.test(String(u || ''));
    // Where a person picks the model a run uses, or adds their own key.
    const MODEL_PAGE = 'https://openvibe.actor/chat/model';
    function mount(panel, o) {
        const st = o.styles && o.styles(); if (st && !st.textContent.includes('.ovdk-overview{')) st.textContent += CSS;
        // A site's Dock passes no scopes (full behaviour); the extension passes its read-only set.
        const canDecide = !Array.isArray(o.scopes) || o.scopes.includes('actions.decide');
        let doc = null, busy = false, timer = 0, gone = false, filter = o.state().agent_filter || 'all';
        const request = async (path, init) => o.call(path, init);
        const all = () => doc ? ['waiting','running','scheduled','done','failed'].flatMap((b) => doc.buckets[b] || []) : [];
        function row(it) {
            const li = h('li', 'ovdk-run ovac-item'); li.dataset.state = it.bucket; li.dataset.bucket = it.bucket;
            const [glyph, color] = iconOf(it); li.style.setProperty('--run-color', color);
            const ic = h('span', 'ovdk-run-ic'); const i = h('i', `fa-solid ${glyph}`); i.setAttribute('aria-hidden', 'true'); ic.append(i);
            const body = h('div', 'ovdk-run-sub');
            const title = it.subject && it.subject.title || it.title || 'Agent run';
            const url = it.subject && it.subject.url || it.href;
            if (isUrl(url)) { const t = h('a', 'ovdk-run-title'); t.href = url; t.target = '_blank'; t.rel = 'noopener'; t.append(h('b', '', title)); body.append(t); } else body.append(h('b', '', title));
            const error = it.run_error; let st = 'Done', line = '';
            if (it.bucket === 'running') { st = 'Running'; line = it.step || it.summary || 'Working'; }
            else if (it.bucket === 'waiting') { st = 'Waiting'; line = it.summary || 'Your answer is needed'; }
            else if (it.bucket === 'scheduled') { st = 'Scheduled'; line = it.next_run_at ? until(it.next_run_at) : 'Time pending'; }
            else if (it.bucket === 'failed') { st = 'Failed'; line = error ? `${error.words} ${error.next}` : 'This run could not finish. Open it for details.'; }
            else line = [it.summary, cash(it.cost_usd), it.duration_ms != null ? `${Math.round(it.duration_ms / 1000)}s` : ''].filter(Boolean).join(' · ');
            const ln = h('span', 'ovdk-run-line'); ln.append(h('span', 'ovdk-run-st', st), document.createTextNode(line)); body.append(ln);
            if (it.model) { const model = h('span', 'ovdk-run-model'); const mark = root.OpenVibeAIMarks && root.OpenVibeAIMarks.mark(it.maker, it.model); if (mark) model.append(mark); model.append(String(it.model)); body.append(model); }
            if (it.bucket === 'running') body.append(h('span', 'ovdk-run-bar'));
            const acts = h('div', 'ovdk-run-actions'); let more = null;
            if (canDecide && it.bucket === 'waiting' && (it.actions || []).includes('approve')) for (const action of ['approve','decline']) {
                const b = h('button', action === 'approve' ? 'primary' : '', action === 'approve' ? 'Approve' : 'Decline'); b.type = 'button'; b.dataset.do = action;
                b.addEventListener('click', async () => { b.disabled = true; try { await request(`/api/v1/me/actions/${encodeURIComponent(it.service)}/${encodeURIComponent(it.id)}/${action}`, { method: 'POST', body: '{}' }); b.textContent = action === 'approve' ? 'Approved' : 'Declined'; } catch { b.disabled = false; b.textContent = 'Try again'; } }); acts.append(b);
            }

            // The error's own action says what the person can do about it: pick a model, add a key, or wait.
            const what = error && error.action;
            if (it.bucket === 'failed' && (what === 'pick_model' || what === 'add_key')) { const a = h('a', '', what === 'pick_model' ? 'Pick a model' : 'Add a key'); a.href = MODEL_PAGE; a.target = '_blank'; a.rel = 'noopener'; acts.append(a); }
            if (canDecide && it.bucket === 'running' && (it.actions || []).includes('cancel')) { const b = h('button', '', 'Stop'); b.type = 'button'; b.addEventListener('click', async () => { b.disabled = true; try { await request(`/api/v1/me/actions/${encodeURIComponent(it.service)}/${encodeURIComponent(it.id)}/cancel`, { method: 'POST', body: '{}' }); refresh(); } catch { b.disabled = false; } }); acts.append(b); }
            if (canDecide && it.bucket === 'failed' && (it.actions || []).includes('retry')) { const b = h('button', '', 'Retry'); b.type = 'button'; b.addEventListener('click', async () => { b.disabled = true; try { await request(`/api/v1/me/actions/${encodeURIComponent(it.service)}/${encodeURIComponent(it.id)}/retry`, { method: 'POST', body: '{}' }); refresh(); } catch { b.disabled = false; } }); acts.append(b); }
            if (canDecide && it.service === 'actor' && (it.kind === 'agent_task') && ['done', 'failed'].includes(it.bucket)) { const menu = h('details', 'ovdk-run-more'); const summary = h('summary'); summary.setAttribute('aria-label', 'More'); summary.title = 'More'; summary.append(dots()); menu.append(summary); const list = h('menu');
                const choose = h('li'); const a = h('a', '', 'Run again with another model'); a.href = MODEL_PAGE; a.target = '_blank'; a.rel = 'noopener'; choose.append(a); list.append(choose);
                const rerun = h('li'); const b = h('button', '', 'Run again'); b.type = 'button'; b.addEventListener('click', async () => { b.disabled = true; try { await request(`/api/v1/me/actions/actor/${encodeURIComponent(it.id)}/retry`, { method: 'POST', body: '{}' }); menu.open = false; refresh(); } catch { b.disabled = false; b.textContent = 'Try again'; } }); rerun.append(b); list.append(rerun); menu.append(list); more = menu; }
            if (acts.childNodes.length) body.append(acts); li.append(ic, body); if (more) li.append(more); if (root.OVGlyphs) root.OVGlyphs.swap(li); return li;
        }
        function grouped(items) { const map = new Map(); for (const it of items) { const day = String(it.updated_at || it.created_at || '').slice(0,10); const key = [it.skill || it.kind, it.subject && it.subject.kind || '', it.bucket, day].join('|'); if (!map.has(key)) map.set(key, []); map.get(key).push(it); } return [...map.values()]; }
        function rows(items, target) { const list = h('ul', 'ovdk-runs'); grouped(items).forEach((group) => { if (group.length === 1) list.append(row(group[0])); else { const li = row(group[0]); const b = h('button', 'ovdk-run-repeat', `×${group.length} similar runs · Show all`); const details = h('ul', 'ovdk-runs'); details.hidden = true; group.slice(1).forEach((it) => details.append(row(it))); b.addEventListener('click', () => { details.hidden = !details.hidden; b.textContent = details.hidden ? `×${group.length} similar runs · Show all` : 'Hide repeats'; }); li.querySelector('.ovdk-run-sub').append(b, details); list.append(li); } }); target.append(list); }
        async function skills(box) {
            try {
                // Through Network (every site's connect-src reaches openvibe.network and refuses openvibe.actor).
                const data = await request('/api/v1/me/actions/skills');
                const available = (data.listings || []).filter((x) => x && x.skill && x.scan && x.scan.state === 'passed' && x.curator && x.curator.state === 'active').slice(0, 6);
                if (gone || !available.length) return;
                box.append(h('h3', '', 'Things agents can do for you'));
                const grid = h('div', 'ovdk-skills');
                available.forEach((s) => {
                    const b = h('button', '', s.skill.name); b.type = 'button'; b.setAttribute('aria-label', `Start ${s.skill.name}`);
                    b.addEventListener('click', async () => {
                        b.disabled = true;
                        try {
                            const out = await request(`/api/v1/me/actions/skills/${encodeURIComponent(s.id)}/run`, { method: 'POST', body: JSON.stringify({ input: {}, choice: { mode: 'balanced' } }) });
                            if (out.run && out.run.id) root.location.href = `${o.actorBase}/tasks/${encodeURIComponent(out.run.id)}`;
                            else refresh();
                        } catch { b.disabled = false; b.textContent = `${s.skill.name} · Try again`; }
                    });
                    grid.append(b);
                });
                box.append(grid);
            } catch { /* catalogue unavailable */ }
        }
        function overview() { const box = h('section', 'ovdk-overview'); const tiles = h('div', 'ovdk-tiles'); const now = Date.now(); const items = all(); const next = (doc.buckets.scheduled || []).find((x) => x.next_run_at); const periods = [[1,'Today'],[7,'This week']];
            const first = h('div', 'ovdk-tile ovdk-tile-next'); first.append(h('small', '', 'Next'), h('b', '', next ? next.title : 'Nothing scheduled')); if (next) first.append(h('span', '', until(next.next_run_at))); tiles.append(first);
            periods.forEach(([days,label]) => { const recent = items.filter((x) => now - Date.parse(x.updated_at || x.created_at) < days * 86400000); const done = recent.filter((x) => x.bucket === 'done').length, failed = recent.filter((x) => x.bucket === 'failed').length; const cost = recent.reduce((n, x) => n + (Number(x.cost_usd) || 0), 0);
                const tile = h('div', 'ovdk-tile'); const n = h('b', '', String(recent.length)); n.append(h('em', '', recent.length === 1 ? 'run' : 'runs')); const sub = h('span');
                if (done) { sub.append(h('i', 'ovdk-dot'), document.createTextNode(`${done}  `)); } if (failed) { sub.append(h('i', 'ovdk-dot is-bad'), document.createTextNode(`${failed}  `)); } if (cost) sub.append(document.createTextNode(cash(cost))); if (!recent.length) sub.textContent = 'None yet';
                tile.setAttribute('aria-label', `${label}: ${recent.length} runs, ${done} done, ${failed} failed${cost ? `, ${cash(cost)}` : ''}`); sub.title = `${done} done · ${failed} failed`;
                tile.append(h('small', '', label), n, sub); tiles.append(tile); }); box.append(tiles);
            const recent = [...(doc.buckets.done || []), ...(doc.buckets.failed || [])].sort((a,b) => String(b.updated_at).localeCompare(String(a.updated_at))).slice(0,3); if (recent.length) { box.append(h('h3', '', 'Last results')); rows(recent, box); }
            skills(box); return box; }
        function paint() { if (gone || !doc) return; panel.textContent = ''; const items = all(); const filters = h('div', 'ovdk-run-filters'); for (const [id,label] of [['all','All'],['running','Running'],['waiting','Waiting'],['scheduled','Scheduled'],['done','Done'],['failed','Failed']]) { const b = h('button', '', label); b.type='button'; b.setAttribute('aria-pressed', String(filter===id)); b.addEventListener('click', () => { filter=id; o.save({agent_filter:id}); paint(); }); filters.append(b); } panel.append(filters);
            if (filter==='all' && !(doc.counts.running || doc.counts.waiting)) panel.append(overview());
            else { const shown = filter==='all' ? items : (doc.buckets[filter] || []); if (shown.length) rows(shown,panel); else panel.append(h('p','ovdk-none','No runs in this view.')); }
            const foot = o.foot || h('div','ovdk-foot'); foot.textContent=''; const allLink = h('a','','All runs'); allLink.href='https://openvibe.actor/tasks'; const give = h('a','','Give an agent a task'); give.href='https://openvibe.actor/skills'; foot.append(allLink,give); if (!o.foot) panel.append(foot); }
        async function refresh() { if (gone || busy || !o.active()) return; busy=true; clearTimeout(timer); try { doc = await request('/api/v1/me/actions'); if (gone) return; if (doc && doc.buckets) { paint(); if (o.onCounts) o.onCounts(doc.counts || {}); } } catch { if (!gone) { panel.textContent=''; panel.append(h('div','ovdk-none','Your runs did not load. Open Agents again to retry.')); } } finally { busy=false; if (!gone && o.active() && doc && doc.counts && doc.counts.running) timer=setTimeout(refresh,15000); } }
        refresh(); if (o.loadMarks) o.loadMarks().then((ok) => { if (!gone && ok && doc) paint(); });
        return { refresh, destroy: () => { gone = true; clearTimeout(timer); } };
    }
    root.OpenVibeDockRuns = { mount };
})(typeof window !== 'undefined' ? window : globalThis);
