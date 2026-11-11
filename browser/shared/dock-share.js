/**
 * openvibe-shared/dock-share.js: the Dock's "Send to…" (4.144.0). dock.js loads it the first time something is sent
 * from a page (OpenVibeDock.share, the share sheet's OpenVibe Chat), so the Dock that every signed-in page carries
 * stays small.
 *
 *   OpenVibeDockShare.bar({ draft, h, chatCall, open, cancel, host }) → the bar, drawn above the person's conversations
 *   OpenVibeDockShare.ready({ draft, h, panel, form, box, fit })    the text in a conversation's box, unsent, said so
 *
 * The bar says what is being sent and lets the person write to someone new by their OpenVibe name: Chat's
 * /api/dm/users/search finds them, POST /api/dm/conversations starts the conversation, both with the person's own
 * token (dock.js's chatCall). Nothing is sent from here: the message waits in the conversation's box until the person
 * presses Send there.
 */
(function (root) {
    'use strict';
    if (typeof document === 'undefined' || root.OpenVibeDockShare) return;

    const CSS = `
.ovdk-share { flex: none; display: grid; gap: 8px; padding: 12px 14px; border-bottom: 1px solid var(--border, rgba(255,255,255,.08)); background: color-mix(in srgb, var(--accent, #3b82f6) 9%, transparent); }
.ovdk-share-h { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.ovdk-share-h b { font-size: 14px; color: var(--text-primary, #ececf1); }
.ovdk-share-x { min-height: 32px; padding: 0 10px; border: 0; border-radius: 8px; background: none; color: var(--text-secondary, #b6b6c0); font: inherit; font-size: 13px; font-weight: 700; cursor: pointer; }
.ovdk-share-x:hover { color: var(--text-primary, #ececf1); }
.ovdk-share-what { margin: 0; font-size: 13px; color: var(--text-secondary, #b6b6c0); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ovdk-to { display: flex; gap: 8px; }
.ovdk-to input { flex: 1; min-width: 0; box-sizing: border-box; min-height: 40px; padding: 0 12px; border-radius: 12px; border: 1px solid var(--border-light, var(--border, rgba(255,255,255,.14))); background: var(--bg-primary, #12141b); color: var(--text-primary, #ececf1); font: inherit; font-size: 14px; }
.ovdk-to input:focus { outline: none; border-color: var(--accent, #3b82f6); }
.ovdk-to-go { flex: none; min-height: 40px; padding: 0 14px; border: 0; border-radius: 12px; cursor: pointer; font: inherit; font-size: 14px; font-weight: 700; color: var(--on-accent-strong, var(--on-accent, #fff)); background: var(--accent-strong, var(--accent, #3472d8)); }
.ovdk-to-go:disabled { opacity: .55; cursor: default; }
.ovdk-share .ovdk-err { margin: 0; }
.ovdk-ready { flex: none; margin: 6px 14px 0; font-size: 12.5px; color: var(--text-secondary, #b6b6c0); }
`;
    function style(host) {
        const st = (host && host.ownerDocument && host.ownerDocument.getElementById('ovdk-styles')) || document.getElementById('ovdk-styles');
        if (st && !st.textContent.includes('.ovdk-share {')) st.textContent += CSS;
    }

    function bar(c) {
        const { draft, h, chatCall, open, cancel, host } = c;
        style(host);
        let busy = false;
        const el = h('div', 'ovdk-share');
        const top = h('div', 'ovdk-share-h');
        const x = h('button', 'ovdk-share-x', 'Cancel'); x.type = 'button';
        x.addEventListener('click', () => cancel());
        top.append(h('b', '', 'Send to…'), x);
        const what = h('p', 'ovdk-share-what', draft.title || draft.text); what.title = draft.text;
        const to = h('form', 'ovdk-to');
        const name = h('input'); name.type = 'text'; name.maxLength = 40; name.autocomplete = 'off'; name.spellcheck = false;
        name.placeholder = 'Someone new: their OpenVibe name'; name.setAttribute('aria-label', 'Their OpenVibe name');
        const next = h('button', 'ovdk-to-go', 'Next'); next.type = 'submit';
        const err = h('p', 'ovdk-err'); err.hidden = true;
        to.append(name, next);
        to.addEventListener('submit', async (e) => {
            e.preventDefault();
            const want = name.value.trim().replace(/^@/, '');
            if (want.length < 2 || busy) return;
            busy = true; next.disabled = true; err.hidden = true;
            try {
                const found = (await chatCall(`/api/dm/users/search?q=${encodeURIComponent(want)}`)).users || [];
                const exact = found.find((u) => String(u.username || '').toLowerCase() === want.toLowerCase());
                if (!exact) {
                    err.textContent = found.length ? `Nobody is called @${want}. Did you mean @${found[0].username}?` : `Nobody on OpenVibe is called @${want}.`;
                    err.hidden = false;
                    return;
                }
                const made = await chatCall('/api/dm/conversations', { method: 'POST', body: JSON.stringify({ user_ids: [exact.id] }) });
                const id = (made.conversation && made.conversation.id) || made.id;
                if (!id) throw new Error('no conversation');
                await open(id);
            } catch (z) {
                err.textContent = z.status === 429 ? 'Too many new conversations just now. Try again in a little while.' : z.status === 403 ? (z.message || 'You can’t start a conversation with them.') : 'That did not work. Try again.';
                err.hidden = false;
            } finally { busy = false; next.disabled = false; }
        });
        el.append(top, what, to, err);
        return el;
    }

    /** The conversation the person picked: the text in its box, and a line saying nothing is sent until they send it. */
    function ready({ draft, h, panel, form, box, fit }) {
        box.value = draft;
        const line = h('p', 'ovdk-ready', 'Ready to send: change it if you like, then press Send.');
        panel.insertBefore(line, form);
        box.addEventListener('input', () => line.remove(), { once: true });
        form.addEventListener('submit', () => line.remove(), { once: true });
        setTimeout(fit, 0);
    }

    root.OpenVibeDockShare = { bar, ready };
})(typeof window !== 'undefined' ? window : globalThis);
