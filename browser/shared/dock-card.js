/**
 * openvibe-shared/dock-card.js: a known OpenVibe link's card under a message in the Dock (4.147.0).
 *
 * OpenVibe.Chat resolves the card when a message is sent (its server/chat/link-cards.js) and the DM API carries it on
 * the message as `card`: { kind, url, title, line, note?, image, action: { label, href } | null }, for a video on
 * OpenVibe.Video ("Watch together"), a party invite ("Join the party"), a shared voice or a skill on OpenVibe.Actor.
 * dock.js loads this file the first time an open conversation shows a message with a card, so the Dock that every
 * signed-in page carries stays small.
 *
 *   OpenVibeDockCard(card, h) → the card's node, or null when it is not a card this can draw
 *
 * Every field is data: set as text, cut to size, a link only when it is https, a picture only from openvibe.media.
 * The card is compact (a 72 px picture beside the words) because the Dock is narrow; the message stays the thing said.
 */
(function (root) {
    'use strict';
    if (typeof document === 'undefined' || root.OpenVibeDockCard) return;

    const CSS = `
.ovdk-card { display: flex; align-items: center; gap: 10px; box-sizing: border-box; max-width: min(100%, 300px); margin-top: 4px; padding: 8px 10px 8px 8px; border-radius: 14px; border: 1px solid var(--border, rgba(255,255,255,.1)); background: var(--bg-primary, #12141b); text-align: left; }
.ovdk-card-pic { flex: none; width: 72px; aspect-ratio: 16 / 9; object-fit: cover; border-radius: 8px; background: color-mix(in srgb, var(--text-primary, #ececf1) 7%, transparent); }
.ovdk-card-body { min-width: 0; display: grid; justify-items: start; gap: 2px; }
.ovdk-card-t { font-size: 13.5px; font-weight: 700; line-height: 1.3; color: var(--text-primary, #ececf1); text-decoration: none; overflow-wrap: anywhere; }
a.ovdk-card-t:hover { text-decoration: underline; }
.ovdk-card-l { font-size: 12.5px; line-height: 1.35; color: var(--text-secondary, #b6b6c0); overflow-wrap: anywhere; }
.ovdk-card-go { display: inline-flex; align-items: center; min-height: 32px; margin-top: 4px; padding: 0 12px; border-radius: 999px; font-size: 13px; font-weight: 700; text-decoration: none; color: var(--on-accent-strong, var(--on-accent, #fff)); background: var(--accent-strong, var(--accent, #3472d8)); }
.ovdk-card-go:hover { filter: brightness(1.08); }
@media (pointer: coarse) { .ovdk-card-go { min-height: 44px; padding: 0 16px; } }
`;

    const https = (u) => (typeof u === 'string' && /^https:\/\/[^\s"'<>]+$/.test(u) ? u : null);
    const cut = (v, n) => Array.from(String(v)).slice(0, n).join('');

    function styles() {
        if (document.getElementById('ovdk-card-styles')) return;
        const st = document.createElement('style');
        st.id = 'ovdk-card-styles';
        st.textContent = CSS;
        document.head.appendChild(st);
    }

    function card(c, h) {
        if (!c || typeof c !== 'object' || typeof c.title !== 'string' || !c.title || typeof h !== 'function') return null;
        styles();
        const url = https(c.url);
        const box = h('div', 'ovdk-card');
        if (c.kind) box.dataset.kind = cut(c.kind, 20);
        const pic = typeof c.image === 'string' && /^https:\/\/openvibe\.media\/[^\s"'<>]+$/.test(c.image) ? c.image : null;
        if (pic) {
            const img = h('img', 'ovdk-card-pic');
            img.src = pic; img.alt = ''; img.loading = 'lazy'; img.decoding = 'async';
            box.append(img);
        }
        const body = h('div', 'ovdk-card-body');
        const title = h(url ? 'a' : 'b', 'ovdk-card-t', cut(c.title, 120));
        if (url) { title.href = url; title.target = '_blank'; title.rel = 'noopener nofollow'; }
        body.append(title);
        if (typeof c.line === 'string' && c.line) body.append(h('span', 'ovdk-card-l', cut(c.line, 200)));
        if (typeof c.note === 'string' && c.note) body.append(h('span', 'ovdk-card-l', cut(c.note, 160)));
        const go = c.action && typeof c.action === 'object' && https(c.action.href) && typeof c.action.label === 'string' && c.action.label ? c.action : null;
        if (go) {
            const a = h('a', 'ovdk-card-go', cut(go.label, 40));
            a.href = https(go.href); a.target = '_blank'; a.rel = 'noopener nofollow';
            body.append(a);
        }
        box.append(body);
        return box;
    }

    root.OpenVibeDockCard = card;
})(typeof window !== 'undefined' ? window : globalThis);
