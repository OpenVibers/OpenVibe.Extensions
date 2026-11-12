/* Edit events for an open Dock DM. Loaded when the conversation opens. */
(function (root) {
    'use strict';
    root.OpenVibeDockChatEdits = function ({ id, list, messages, error, tokenOf, chatCall, chatBase, active, load, h }) {
        let socket = null, timer = null, stopped = false;
        function apply(m) {
            const old = messages.find((x) => Number(x.id) === Number(m && m.id));
            const li = old && list.querySelector(`[data-id="${Number(m.id)}"]`);
            if (!li || !m.edited_at || (old.edited_at && old.edited_at >= m.edited_at)) return;
            Object.assign(old, { message: m.message, card: m.card, edited_at: m.edited_at });
            li.querySelector('.ovdk-text').textContent = String(m.message || '');
            let mark = li.querySelector('.ovdk-edited');
            if (!mark) { mark = h('small', 'ovdk-edited'); li.append(mark); }
            mark.textContent = `edited · ${String(m.edited_at).slice(11, 16)}`;
            const card = li.querySelector('.ovdk-card'); if (card) card.remove();
            if (m.card) load('dock-card.js', () => !!root.OpenVibeDockCard).then((ok) => { if (ok && active() && li.isConnected) { const c = root.OpenVibeDockCard(m.card, h); if (c) li.append(c); } });
        }
        async function connect() {
            if (stopped || !active() || !root.WebSocket) return;
            const token = await tokenOf();
            if (!token || stopped || !active()) return;
            const ws = new root.WebSocket(chatBase().replace(/^http/, 'ws') + '/ws/chat');
            socket = ws;
            ws.onopen = () => ws.send(JSON.stringify({ type: 'join', token }));
            ws.onmessage = (event) => { let frame; try { frame = JSON.parse(event.data); } catch { return; } if (frame.type === 'dm_edited' && String(frame.conversation_id) === id) apply(frame.message); };
            ws.onclose = () => { if (socket === ws) socket = null; if (!stopped && active()) timer = setTimeout(connect, 3000); };
        }
        list.addEventListener('click', async (event) => {
            if (!event.target.classList.contains('ovdk-edit')) return;
            const li = event.target.closest('[data-id]');
            const old = li && messages.find((m) => Number(m.id) === Number(li.dataset.id));
            if (!old) return;
            const body = root.prompt('Edit message', old.message);
            if (body == null || body.trim() === old.message.trim()) return;
            try { const result = await chatCall(`/api/dm/conversations/${encodeURIComponent(id)}/messages/${encodeURIComponent(old.id)}`, { method: 'PATCH', body: JSON.stringify({ message: body }) }); apply(result.message); }
            catch (e) { error.textContent = e.message || 'Could not edit'; error.hidden = false; }
        });
        connect().catch(() => {});
        return { stop() { stopped = true; clearTimeout(timer); if (socket) { socket.onclose = null; socket.close(); socket = null; } } };
    };
})(typeof window === 'undefined' ? globalThis : window);
