// ═══════════════════════════════════════════════════════════════
// OpenVibe — Notification UI Client (shared across every OpenVibe site)
//
// One store (openvibe.network) → one bell everywhere. This file renders the bell + its panel, toasts, a full-page
// inbox, and handles Web Push subscription.
//
// Usage: <script src="https://openvibe.network/shared/notification-ui.js"></script>
//        OpenVibeNotifications.init({ token, apiBase, swPath, onAction })
//        OpenVibeNotifications.createBell(mountEl)
//        OpenVibeNotifications.renderInbox(containerEl)      // full-page inbox
//        OpenVibeNotifications.renderDock(containerEl)       // the Dock's Activity tab (dock.js): the same list, no frame
//
// Reads: GET /api/notifications?limit&offset&unread_only&tab&q&since
//        GET /api/notifications/unread-count, /unread-by-tab (the counts on the bell's tabs)
// Realtime (init({ realtime: true }), off by default): notification-live.js, loaded from beside this file, hears the
//        person's network.notification.created over OpenVibe.Events with a ticket from POST /api/v1/realtime/ticket;
//        each event or gap re-reads the count. Polling stays: every 15 s without a stream, every 2 min with one.
// Writes: POST /:id/read, /read-batch, /read-all, /:id/dismiss, /api/push/{subscribe,unsubscribe}
//
// Notifications 2.0 (2026-10-28, the owner's screenshot of three alert toasts drawn over the open menu):
//   • a toast is an opaque, themed card: a line glyph for its category (never an emoji) or the sender's avatar with
//     the glyph as a badge, a one-line title, at most two lines of text, chips, up to two actions, a timeout bar;
//   • toasts never draw over an open menu, panel or dialog: they wait (timers paused) and show when it closes;
//   • phones show one at a time under the bar (with "+N more" and swipe to dismiss), desktops up to three at the
//     bottom right;
//   • the same notice arriving again within 15 minutes joins the card that is showing (a count, site chips);
//   • operator alerts (OPERATOR_ALERT, or rich_content.kind "ops_alert") read as System cards: "Browser check
//     failed · events · release 80b7955", a status link, and the fix command behind a copy button in the bell —
//     never raw shell text in the body;
//   • the ✦ beside the bell (4.31.0, desktop) opens the Action Center (action-center.js, loaded from beside this file
//     on the first click): every agent task in one place; on phones the bell's Agents tab links to it;
//   • the bell (4.30.0) is a 420 px popover on desktop and a full-height sheet on phones: tabs (All · Mentions · Live ·
//     Deals & alerts · System · Agents) counted by Network's unread-by-tab, an Unread filter, day headers, thumbnails,
//     unread dots and grouped repeats; on touch screens a row swipes right to read and left to clear.
// ═══════════════════════════════════════════════════════════════

(function (root) {
    'use strict';

    const POLL_INTERVAL = 15_000;
    const REALTIME_POLL = 120_000;   // with an open realtime stream the poll is only a safety net (reads made on other sites)
    const SELF_SRC = (typeof document !== 'undefined' && document.currentScript && document.currentScript.src) || '';
    const PAGE_SIZE = 30;
    const TOAST_DURATION = { low: 0, normal: 5200, high: 8000, critical: 0 }; // 0 = sticky
    const MAX_TOASTS = 3;            // desktop; phones show one and count the rest
    const GROUP_WINDOW = 15 * 60 * 1000;
    const SOUNDS = { normal: 'notification.mp3', high: 'notification-high.mp3', critical: 'notification-alarm.mp3' };
    const CATEGORY_LABELS = {
        stream: 'Live', social: 'Social', chat: 'Chat', game: 'Games', economy: 'Money & deals',
        achievement: 'Achievements', service: 'Services', moderation: 'Moderation', system: 'System', admin: 'Announcements',
    };
    const SERVICE_LABELS = { live: 'Live', tools: 'Tools', games: 'Games', media: 'Media', network: 'Network', host: 'Host', deals: 'Deals', coupons: 'Coupons', trade: 'Trade', chat: 'Chat' };

    // Line glyphs (24×24, stroked like the open-loop mark): one per kind of notice.
    const GLYPH = {
        live: '<circle cx="12" cy="12" r="2.6"/><path d="M6.4 6.4a8 8 0 0 0 0 11.2M17.6 6.4a8 8 0 0 1 0 11.2M9.2 9.2a4 4 0 0 0 0 5.6M14.8 9.2a4 4 0 0 1 0 5.6"/>',
        people: '<circle cx="9" cy="8.5" r="3.2"/><path d="M3.5 19.5a5.5 5.5 0 0 1 11 0"/><circle cx="17.2" cy="9.4" r="2.4"/><path d="M15.6 14.4a4.5 4.5 0 0 1 5.4 4.6"/>',
        chat: '<path d="M4.5 5.5h15v10.5H10l-5.5 4z"/>',
        game: '<path d="M6.5 8.5h11a3.5 3.5 0 0 1 3.5 3.5v2.6a2.9 2.9 0 0 1-5.1 1.9L14.2 14.6H9.8L8.1 16.5A2.9 2.9 0 0 1 3 14.6V12a3.5 3.5 0 0 1 3.5-3.5z"/><path d="M8.3 10.6v3M6.8 12.1h3"/><path d="M15.6 11.4h.01M17.2 12.9h.01"/>',
        coin: '<circle cx="12" cy="12" r="8.2"/><path d="M14.6 9.6c-.6-.9-1.5-1.3-2.6-1.3-1.5 0-2.6.8-2.6 1.9s1.1 1.6 2.6 1.9 2.6.8 2.6 2-1.1 1.9-2.6 1.9c-1.1 0-2.1-.5-2.6-1.3M12 6.6v1.7M12 15.7v1.7"/>',
        tag: '<path d="M4 4.5h7.2l8.8 8.8-6.7 6.7-8.8-8.8z"/><circle cx="8.4" cy="8.9" r="1.3"/>',
        trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0zM8 6H5.2a3 3 0 0 0 3 3.6M16 6h2.8a3 3 0 0 1-3 3.6M12 13v3.6M8.6 20h6.8"/>',
        shield: '<path d="M12 3.2l7 3v5.2c0 4.3-2.9 7.8-7 9.6-4.1-1.8-7-5.3-7-9.6V6.2z"/>',
        gear: '<circle cx="12" cy="12" r="3"/><path d="M12 3.5v2.2M12 18.3v2.2M3.5 12h2.2M18.3 12h2.2M6 6l1.6 1.6M16.4 16.4L18 18M6 18l1.6-1.6M16.4 7.6L18 6"/>',
        grid: '<rect x="4" y="4" width="6.6" height="6.6" rx="1.6"/><rect x="13.4" y="4" width="6.6" height="6.6" rx="1.6"/><rect x="4" y="13.4" width="6.6" height="6.6" rx="1.6"/><rect x="13.4" y="13.4" width="6.6" height="6.6" rx="1.6"/>',
        pulse: '<path d="M3 12.5h4.2l2.3-5.5 4.2 10.5 2.3-5h4.9"/>',
        check: '<path d="M5 12.6l4.6 4.6L19 7.6"/>',
        bell: '<path d="M6.2 16.2V11a5.8 5.8 0 0 1 11.6 0v5.2l1.6 2H4.6z"/><path d="M10 20.2a2.1 2.1 0 0 0 4 0"/>',
        key: '<circle cx="8.2" cy="14.8" r="4"/><path d="M11.1 12l8.2-8.2M16.4 6.7l2.3 2.3M14.2 8.9l1.8 1.8"/>',
        spark: '<path d="M12 3.5l1.9 5.1 5.1 1.9-5.1 1.9-1.9 5.1-1.9-5.1L5 10.5l5.1-1.9z"/><path d="M18.4 15.6l.6 1.6 1.6.6-1.6.6-.6 1.6-.6-1.6-1.6-.6 1.6-.6z"/>',
    };
    const CATEGORY_GLYPH = { stream: 'live', social: 'people', chat: 'chat', game: 'game', economy: 'coin', achievement: 'trophy', moderation: 'shield', system: 'gear', service: 'grid', admin: 'bell' };
    const TONE = {
        live: 'var(--live-red, #e5484d)', danger: 'var(--live-red, #e5484d)', warn: 'var(--warning, #f5a524)', ok: 'var(--success, #30a46c)',
        gold: 'var(--gold, #e3b341)', accent: 'var(--accent, #3b82f6)', muted: 'var(--text-secondary, #a0a0ab)',
    };
    const CATEGORY_TONE = { stream: 'live', social: 'accent', chat: 'accent', game: 'accent', economy: 'gold', achievement: 'gold', moderation: 'warn', system: 'muted', service: 'accent', admin: 'accent' };
    // The bell's tabs. Network defines what each holds (server/notifications/tabs.js, ?tab= and /unread-by-tab).
    const TABS = [['all', 'All'], ['mentions', 'Mentions'], ['live', 'Live'], ['alerts', 'Deals & alerts'], ['system', 'System'], ['agents', 'Agents']];
    const TAB_EMPTY = {
        all: ['No notifications yet', 'When something happens across OpenVibe, it lands here.'],
        mentions: ['No mentions yet', 'When someone mentions you, replies to you or messages you, it shows here.'],
        live: ['Nobody has gone live yet', 'When someone you follow goes live, it shows here.'],
        alerts: ['No alerts yet', 'Deal, coupon, price and trade watches you set tell you here.'],
        system: ['Nothing from the system', 'Sign-ins, security notices and announcements show here.'],
        agents: ['No agent work yet', 'When an agent needs your approval or finishes a task, it shows here.'],
    };

    let _config = { token: null, apiBase: 'https://openvibe.network', soundBase: '/assets/sounds', swPath: '/openvibe-sw.js', onAction: null, inboxUrl: null };
    let _pollTimer = null;
    let _lastSeenAt = null;       // newest created_at we have toasted / seen
    let _unreadCount = 0;
    let _toastContainer = null;
    let _panelEl = null;
    let _bellEl = null;
    let _audioCache = {};
    let _preferences = { enabled: true, sound: true, toasts: true, muted_categories: [] };
    let _channel = null;          // BroadcastChannel for same-origin tab sync
    let _live = null;             // OVNotificationLive feed (realtime on)
    let _lastPoll = 0;
    let _soon = null; let _soonAll = false;
    const _views = new Map();     // container → view state (panel + inboxes)
    const _queue = [];            // toast cards waiting for a free screen (a menu open, or a phone already showing one)
    let _menuOpen = false;        // the OpenVibe menu (search.js) says so through its 'openvibe-menu' event

    // ── Styles ──────────────────────────────────────────────
    function injectStyles() {
        if (document.getElementById('openvibe-notif-styles')) return;
        const style = document.createElement('style');
        style.id = 'openvibe-notif-styles';
        style.textContent = `
            @keyframes ovn-in-up { from { transform: translateY(14px) scale(.98); opacity: 0; } to { transform: none; opacity: 1; } }
            @keyframes ovn-in-down { from { transform: translateY(-14px) scale(.98); opacity: 0; } to { transform: none; opacity: 1; } }
            @keyframes ovn-out { to { transform: translateX(24px); opacity: 0; } }
            @keyframes ovn-badge-pop { 0%,100% { transform: scale(1); } 50% { transform: scale(1.22); } }
            @keyframes ovn-bell-ring { 0%{ transform: rotate(0); } 12%{ transform: rotate(13deg); } 24%{ transform: rotate(-12deg); } 36%{ transform: rotate(8deg); } 48%{ transform: rotate(-4deg); } 60%{ transform: rotate(0); } }
            @keyframes ovn-panel-in { from { transform: translateY(-8px); opacity: 0; } to { transform: none; opacity: 1; } }
            @keyframes ovn-sheet-up { from { transform: translateY(48px); opacity: .5; } to { transform: none; opacity: 1; } }
            @keyframes ovn-spin { to { transform: rotate(360deg); } }

            /* Toasts. Opaque cards on the theme's raised surface; held (hidden, timers paused) while a menu is open. */
            .openvibe-toast-container { position: fixed; z-index: 2147482600; display: flex; flex-direction: column; gap: 10px; pointer-events: none;
                right: max(16px, env(safe-area-inset-right, 0px)); bottom: calc(max(16px, env(safe-area-inset-bottom, 0px)) + var(--ov-dock-clear, 0px)); width: min(380px, calc(100vw - 32px));
                font-family: inherit; transition: opacity .18s ease; }
            .openvibe-toast-container.ovn-held { opacity: 0; visibility: hidden; }
            .openvibe-toast-container.ovn-phone { top: var(--ovn-top, 64px); bottom: auto; left: max(8px, env(safe-area-inset-left, 0px)); right: max(8px, env(safe-area-inset-right, 0px)); width: auto; }
            .openvibe-toast { pointer-events: auto; position: relative; overflow: hidden; display: grid; grid-template-columns: 38px 1fr; gap: 12px; align-items: start;
                padding: 12px 34px 12px 12px; border-radius: 16px; cursor: pointer; touch-action: pan-y;
                background: var(--bg-elevated, var(--bg-card, #1f2129)); color: var(--text-primary, #ececf1);
                border: 1px solid var(--border, rgba(255,255,255,.1)); box-shadow: 0 18px 40px rgba(0,0,0,.34), 0 2px 6px rgba(0,0,0,.2);
                animation: ovn-in-up .26s cubic-bezier(.2,.8,.2,1); }
            .ovn-phone .openvibe-toast { animation-name: ovn-in-down; }
            .openvibe-toast::before { content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 3px; background: var(--ovn-tone, var(--accent, #3b82f6)); }
            .openvibe-toast:hover, .openvibe-toast:focus-visible { border-color: color-mix(in srgb, var(--ovn-tone, var(--accent, #3b82f6)) 55%, var(--border, #333)); outline: none; }
            .openvibe-toast.removing { animation: ovn-out .24s ease forwards; }
            .openvibe-toast-body { min-width: 0; }
            .openvibe-toast-title { display: flex; align-items: baseline; gap: 6px; min-width: 0; font-size: 14px; font-weight: 650; line-height: 1.3; }
            .openvibe-toast-title .t { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
            .openvibe-toast-title .n { flex: none; font-size: 11px; font-weight: 700; padding: 1px 7px; border-radius: 999px; color: color-mix(in srgb, var(--ovn-tone, var(--accent, #3b82f6)) 50%, var(--text-primary, #ececf1)); background: color-mix(in srgb, var(--ovn-tone, var(--accent, #3b82f6)) 16%, transparent); }
            .openvibe-toast-sub { margin-top: 1px; font-size: 11.5px; color: var(--text-muted, #8b8b96); display: flex; gap: 6px; align-items: center; }
            .openvibe-toast-msg { margin-top: 4px; font-size: 13px; line-height: 1.4; color: var(--text-secondary, #b6b6c0); overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow-wrap: anywhere; }
            .openvibe-toast-actions { display: flex; gap: 8px; margin-top: 10px; flex-wrap: wrap; }
            .openvibe-toast-actions button, .openvibe-toast-actions a { font: inherit; font-size: 12.5px; font-weight: 650; padding: 7px 13px; border-radius: 999px; cursor: pointer; text-decoration: none; line-height: 1;
                border: 1px solid var(--border, rgba(255,255,255,.12)); background: transparent; color: var(--text-primary, #ececf1); }
            .openvibe-toast-actions .primary { background: var(--accent-strong, var(--accent, #3472d8)); border-color: transparent; color: var(--on-accent-strong, var(--on-accent, #fff)); }
            .openvibe-toast-close { position: absolute; top: 8px; right: 8px; width: 26px; height: 26px; border-radius: 50%; border: none; background: transparent; color: var(--text-muted, #8b8b96); cursor: pointer; display: grid; place-items: center; font-size: 16px; line-height: 1; }
            .openvibe-toast-close:hover { background: var(--bg-hover, rgba(255,255,255,.06)); color: var(--text-primary, #ececf1); }
            .openvibe-toast-progress { position: absolute; left: 0; bottom: 0; height: 2px; width: 100%; transform-origin: left; background: var(--ovn-tone, var(--accent, #3b82f6)); opacity: .7; }
            .openvibe-toast-more { margin-left: auto; flex: none; font: inherit; font-size: 11px; font-weight: 700; padding: 2px 9px; border-radius: 999px; cursor: pointer;
                border: 1px solid color-mix(in srgb, var(--ovn-tone, var(--accent, #3b82f6)) 40%, var(--border, #333)); background: transparent; color: var(--text-secondary, #b6b6c0); }
            .openvibe-toast.priority-critical { border-color: color-mix(in srgb, var(--ovn-tone) 60%, var(--border, #333)); }

            /* The glyph (or avatar with a glyph badge), shared by toasts and the list. */
            .ovn-glyph { position: relative; width: 38px; height: 38px; border-radius: 12px; display: grid; place-items: center; flex: none;
                color: color-mix(in srgb, var(--ovn-tone, var(--accent, #3b82f6)) 68%, var(--text-primary, #ececf1)); background: color-mix(in srgb, var(--ovn-tone, var(--accent, #3b82f6)) 15%, transparent); }
            .ovn-glyph svg { width: 21px; height: 21px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
            .ovn-glyph.ovn-avatar { border-radius: 50%; background: var(--bg-tertiary, #2a2b33); }
            .ovn-glyph.ovn-avatar img { width: 38px; height: 38px; border-radius: 50%; object-fit: cover; display: block; }
            .ovn-glyph .ovn-badge { position: absolute; right: -3px; bottom: -3px; width: 18px; height: 18px; border-radius: 50%; display: grid; place-items: center;
                background: var(--ovn-tone, var(--accent, #3b82f6)); color: var(--bg-elevated, var(--bg-card, #1f2129)); box-shadow: 0 0 0 2px var(--bg-elevated, var(--bg-card, #1f2129)); }
            .ovn-glyph .ovn-badge svg { width: 11px; height: 11px; stroke-width: 2.4; }
            .ovn-chips { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 7px; }
            .ovn-chip { font-size: 11px; font-weight: 600; line-height: 1; padding: 4px 8px; border-radius: 999px; color: var(--text-secondary, #b6b6c0); background: var(--bg-tertiary, rgba(255,255,255,.06)); border: 1px solid var(--border, rgba(255,255,255,.08)); }
            .ovn-chip.sev { color: color-mix(in srgb, var(--ovn-tone) 50%, var(--text-primary, #ececf1)); background: color-mix(in srgb, var(--ovn-tone) 14%, transparent); border-color: transparent; text-transform: uppercase; letter-spacing: .03em; font-size: 10px; }

            .openvibe-bell { position: relative; cursor: pointer; padding: 6px; display: inline-flex; align-items: center; justify-content: center; border-radius: 10px; }
            .openvibe-bell svg { width: 22px; height: 22px; fill: none; stroke: var(--text-secondary, #b0b0b8); stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; transition: stroke .2s; }
            .openvibe-bell:hover svg, .openvibe-bell.open svg { stroke: var(--accent-light, var(--accent, #60a5fa)); }
            .openvibe-bell:focus-visible { outline: 2px solid var(--accent, #3b82f6); outline-offset: 2px; }
            .openvibe-bell .badge { position: absolute; top: 1px; right: 0; min-width: 17px; height: 17px; padding: 0 5px; box-sizing: border-box; background: var(--live-red, #e5484d); color: #fff; border-radius: 999px;
                font-size: 10px; font-weight: 750; display: flex; align-items: center; justify-content: center; line-height: 1; pointer-events: none; box-shadow: 0 0 0 2px var(--bg-primary, #111);
                font-variant-numeric: tabular-nums; animation: ovn-badge-pop .36s ease; }
            .openvibe-bell .badge.hidden { display: none; }
            .openvibe-bell.ringing svg { animation: ovn-bell-ring .7s ease; transform-origin: 50% 15%; }
            /* The ✦ beside the bell: the Action Center (desktop; phones reach it from the bell's Agents tab). */
            .openvibe-actions-btn { position: relative; cursor: pointer; padding: 6px; display: inline-flex; align-items: center; justify-content: center; border-radius: 10px; }
            .openvibe-actions-btn svg { width: 21px; height: 21px; fill: none; stroke: var(--text-secondary, #b0b0b8); stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; transition: stroke .2s; }
            .openvibe-actions-btn:hover svg, .openvibe-actions-btn.open svg { stroke: var(--accent-light, var(--accent, #60a5fa)); }
            .openvibe-actions-btn:focus-visible { outline: 2px solid var(--accent, #3b82f6); outline-offset: 2px; }
            @media (max-width: 640px) { .openvibe-actions-btn { display: none; } }
            .ovn-ac-link { display: flex; align-items: center; gap: 10px; width: calc(100% - 12px); margin: 6px; padding: 10px 14px; border-radius: 14px; border: 1px dashed color-mix(in srgb, var(--accent, #3b82f6) 45%, var(--border, #333));
                background: color-mix(in srgb, var(--accent, #3b82f6) 7%, transparent); color: var(--text-primary, #ececf1); font: inherit; font-size: 13px; font-weight: 650; cursor: pointer; text-align: left; }
            .ovn-ac-link svg { width: 18px; height: 18px; flex: none; fill: none; stroke: var(--accent-light, var(--accent, #60a5fa)); stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }

            /* The panel (desktop popover, phone sheet) and the full inbox share one list view. */
            .openvibe-notif-panel { position: fixed; z-index: 99999; display: none; flex-direction: column; overflow: hidden;
                top: var(--ovn-top, 62px); right: max(8px, env(safe-area-inset-right, 0px)); width: min(420px, calc(100vw - 16px));
                max-height: calc(100vh - var(--ovn-top, 62px) - 12px); max-height: calc(100dvh - var(--ovn-top, 62px) - 12px - env(safe-area-inset-bottom, 0px));
                background: var(--bg-elevated, var(--bg-secondary, #1d1f27)); color: var(--text-primary, #ececf1); border: 1px solid var(--border, rgba(255,255,255,.1));
                border-radius: 18px; box-shadow: 0 24px 60px rgba(0,0,0,.45); animation: ovn-panel-in .2s cubic-bezier(.2,.8,.2,1); font-family: inherit; }
            .openvibe-notif-panel.open { display: flex; }
            .openvibe-notif-panel, .openvibe-notif-inbox, .openvibe-notif-dock { --ovn-bg: var(--bg-elevated, var(--bg-secondary, #1d1f27)); }
            .openvibe-notif-dock { display: flex; flex-direction: column; min-height: 0; flex: 1; color: var(--text-primary, #ececf1); }
            .openvibe-notif-dock .openvibe-nv-head { display: none; }
            .openvibe-notif-dock .openvibe-nv-tools { padding-top: 10px; }
            .openvibe-notif-dock .openvibe-nv-foot { gap: 12px; }
            .openvibe-notif-dock .openvibe-nv-foot [data-role="status"] { margin-right: auto; }
            .ovn-foot-read { display: inline-flex; align-items: center; gap: 6px; min-height: 32px; padding: 0; border: 0; background: none; font: inherit; font-weight: 700; color: var(--text-secondary, #b6b6c0); cursor: pointer; }
            .ovn-foot-read:hover { color: var(--text-primary, #ececf1); }
            .ovn-foot-read svg { width: 15px; height: 15px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
            .openvibe-notif-inbox { display: flex; flex-direction: column; overflow: hidden; min-height: 420px; max-height: 78vh; border-radius: 18px;
                background: var(--bg-elevated, var(--bg-secondary, #1d1f27)); color: var(--text-primary, #ececf1); border: 1px solid var(--border, rgba(255,255,255,.1)); font-family: inherit; }

            .openvibe-nv-head { padding: 14px 14px 10px 16px; display: flex; align-items: center; justify-content: space-between; gap: 8px; }
            .openvibe-nv-head h3 { font-size: 17px; font-weight: 750; letter-spacing: -.01em; margin: 0; display: flex; align-items: center; gap: 8px; }
            .openvibe-nv-head h3 .count { font-size: 11px; font-weight: 750; background: var(--live-red, #e5484d); color: #fff; border-radius: 999px; padding: 2px 7px; font-variant-numeric: tabular-nums; }
            .openvibe-nv-head h3 .count.zero { display: none; }
            .openvibe-nv-actions { display: flex; gap: 2px; align-items: center; }
            .openvibe-nv-actions button, .openvibe-nv-actions a { width: 34px; height: 34px; border-radius: 10px; display: grid; place-items: center; border: none; background: transparent; color: var(--text-muted, #8b8b96); cursor: pointer; text-decoration: none; }
            .openvibe-nv-actions button > span, .openvibe-nv-actions a > span { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
            .openvibe-nv-actions button:hover, .openvibe-nv-actions a:hover { background: var(--bg-hover, rgba(255,255,255,.06)); color: var(--text-primary, #ececf1); }
            .openvibe-nv-actions button.on { color: var(--accent-light, var(--accent, #60a5fa)); }
            .openvibe-nv-actions button:disabled { opacity: .4; cursor: default; }
            .openvibe-nv-actions svg { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }

            .openvibe-nv-tools { padding: 0 12px; display: flex; flex-direction: column; gap: 6px; border-bottom: 1px solid var(--border, rgba(255,255,255,.08)); }
            .openvibe-nv-search { position: relative; }
            .openvibe-nv-search input { width: 100%; box-sizing: border-box; padding: 9px 30px 9px 34px; border-radius: 12px; border: 1px solid var(--border, rgba(255,255,255,.1)); background: var(--bg-input, var(--bg-tertiary, rgba(255,255,255,.04))); color: var(--text-primary, #ececf1); font: inherit; font-size: 13px; outline: none; }
            .openvibe-nv-search input:focus { border-color: var(--accent, #3b82f6); }
            .openvibe-nv-search > svg { position: absolute; left: 11px; top: 50%; transform: translateY(-50%); width: 16px; height: 16px; fill: none; stroke: var(--text-muted, #8b8b96); stroke-width: 1.8; stroke-linecap: round; pointer-events: none; }
            .openvibe-nv-search .clear { position: absolute; right: 6px; top: 50%; transform: translateY(-50%); background: none; border: none; color: var(--text-muted, #8b8b96); cursor: pointer; font-size: 16px; display: none; }
            .openvibe-nv-search.has-q .clear { display: block; }
            .openvibe-nv-find { display: flex; gap: 8px; align-items: center; }
            .openvibe-nv-find .openvibe-nv-search { flex: 1; min-width: 0; }
            .openvibe-nv-unread { flex: none; display: inline-flex; align-items: center; gap: 6px; height: 37px; padding: 0 12px; border-radius: 12px; border: 1px solid var(--border, rgba(255,255,255,.1)); background: transparent; color: var(--text-secondary, #b6b6c0); font: inherit; font-size: 12.5px; font-weight: 650; cursor: pointer; }
            .openvibe-nv-unread:hover { color: var(--text-primary, #ececf1); }
            .openvibe-nv-unread[aria-pressed="true"] { background: var(--accent-strong, var(--accent, #3472d8)); border-color: transparent; color: var(--on-accent-strong, var(--on-accent, #fff)); }
            .openvibe-nv-unread svg { width: 15px; height: 15px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
            .openvibe-nv-tabs { display: flex; overflow-x: auto; scrollbar-width: none; margin: 0 -12px; padding: 0 6px; }
            .openvibe-nv-tabs::-webkit-scrollbar { display: none; }
            .openvibe-nv-tabs button { flex: none; position: relative; display: inline-flex; align-items: center; gap: 6px; min-height: 40px; padding: 0 10px; border: 0; background: transparent; color: var(--text-secondary, #b6b6c0); font: inherit; font-size: 13px; font-weight: 600; cursor: pointer; white-space: nowrap; }
            .openvibe-nv-tabs button:hover, .openvibe-nv-tabs button[aria-selected="true"] { color: var(--text-primary, #ececf1); }
            .openvibe-nv-tabs button[aria-selected="true"]::after { content: ''; position: absolute; left: 10px; right: 10px; bottom: 0; height: 2.5px; border-radius: 2px 2px 0 0; background: var(--accent, #3b82f6); }
            .openvibe-nv-tabs button:focus-visible { outline: 2px solid var(--accent, #3b82f6); outline-offset: -3px; border-radius: 10px; }
            .openvibe-nv-tabs .n { min-width: 18px; padding: 2px 5px; box-sizing: border-box; border-radius: 999px; font-size: 10.5px; font-weight: 750; line-height: 1.2; text-align: center; font-variant-numeric: tabular-nums;
                color: var(--text-primary, #ececf1); background: color-mix(in srgb, var(--accent, #3b82f6) 24%, transparent); }
            .openvibe-nv-tabs .n:empty { display: none; }
            .openvibe-nv-tabs.is-more { -webkit-mask-image: linear-gradient(90deg, #000 calc(100% - 36px), transparent); mask-image: linear-gradient(90deg, #000 calc(100% - 36px), transparent); }

            .openvibe-nv-list { flex: 1; overflow-y: auto; padding: 2px 0 6px; overscroll-behavior: contain; }
            .openvibe-nv-day { position: sticky; top: 0; z-index: 1; padding: 10px 16px 6px; font-size: 11.5px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; color: var(--text-muted, #8b8b96); background: var(--bg-elevated, var(--bg-secondary, #1d1f27)); }
            /* A row: the opaque .ovn-row over .ovn-under, which a swipe uncovers (Read on the left, Clear on the right). */
            .openvibe-notif-item { position: relative; margin: 0 6px; border-radius: 14px; overflow: hidden; cursor: pointer; }
            .openvibe-notif-item .ovn-row { position: relative; z-index: 1; display: grid; grid-template-columns: 38px minmax(0, 1fr); gap: 12px; padding: 10px 14px 10px 16px; border-radius: 14px;
                background: var(--ovn-bg, var(--bg-elevated, #1d1f27)); transition: background .15s, transform .2s ease; touch-action: pan-y; outline: none; }
            .openvibe-notif-item .ovn-row.has-thumb { grid-template-columns: 38px minmax(0, 1fr) 56px; }
            .openvibe-notif-item .ovn-row:focus-visible { box-shadow: inset 0 0 0 2px var(--accent, #3b82f6); }
            .openvibe-notif-item:hover .ovn-row { background: color-mix(in srgb, var(--text-primary, #ececf1) 5%, var(--ovn-bg, #1d1f27)); }
            .openvibe-notif-item.unread .ovn-row { background: color-mix(in srgb, var(--accent, #3b82f6) 8%, var(--ovn-bg, #1d1f27)); }
            .openvibe-notif-item.unread:hover .ovn-row { background: color-mix(in srgb, var(--accent, #3b82f6) 12%, var(--ovn-bg, #1d1f27)); }
            .openvibe-notif-item.swiping .ovn-row { transition: none; }
            .openvibe-notif-item .thumb { width: 56px; height: 56px; border-radius: 10px; object-fit: cover; display: block; background: var(--bg-tertiary, #2a2b33); }
            .openvibe-notif-item .ovn-under { position: absolute; inset: 0; display: none; align-items: center; justify-content: space-between; padding: 0 22px; font-size: 13px; font-weight: 750; }
            .openvibe-notif-item[data-swipe] .ovn-under { display: flex; }
            .openvibe-notif-item[data-swipe="read"] .ovn-under { background: var(--accent-strong, var(--accent, #3472d8)); color: var(--on-accent-strong, var(--on-accent, #fff)); }
            .openvibe-notif-item[data-swipe="clear"] .ovn-under { background: var(--danger-strong, #c42b30); color: #fff; justify-content: flex-end; }
            .openvibe-notif-item[data-swipe="read"] .ovn-under .clear, .openvibe-notif-item[data-swipe="clear"] .ovn-under .read { display: none; }
            .openvibe-notif-item .ovn-under span { display: inline-flex; align-items: center; gap: 6px; }
            .openvibe-notif-item .ovn-under svg { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round; }
            .openvibe-notif-item .content { min-width: 0; }
            .openvibe-notif-item .title { font-size: 13.5px; font-weight: 550; line-height: 1.32; display: flex; align-items: baseline; gap: 6px; }
            .openvibe-notif-item .title .t { min-width: 0; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
            .openvibe-notif-item.unread .title { font-weight: 700; }
            .openvibe-notif-item .title .count { flex: none; font-size: 11px; font-weight: 700; padding: 1px 7px; border-radius: 999px; color: color-mix(in srgb, var(--ovn-tone, var(--accent, #3b82f6)) 50%, var(--text-primary, #ececf1)); background: color-mix(in srgb, var(--ovn-tone, var(--accent, #3b82f6)) 15%, transparent); }
            .openvibe-notif-item .msg { margin-top: 2px; font-size: 12.5px; color: var(--text-secondary, #b6b6c0); line-height: 1.42; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow-wrap: anywhere; }
            .openvibe-notif-item .meta { font-size: 11.5px; color: var(--text-muted, #8b8b96); margin-top: 5px; display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
            .openvibe-notif-item .meta .dot { width: 3px; height: 3px; border-radius: 50%; background: currentColor; opacity: .6; }
            .openvibe-notif-item .unread-dot { position: absolute; left: 5px; top: 26px; width: 7px; height: 7px; border-radius: 50%; background: var(--accent, #3b82f6); }
            .openvibe-notif-item .row-actions { margin-left: auto; display: flex; gap: 2px; opacity: 0; transition: opacity .15s; }
            .openvibe-notif-item:hover .row-actions, .openvibe-notif-item:focus-within .row-actions { opacity: 1; }
            /* The row's buttons sit on its time line, never over its text; touch screens always show them. */
            @media (hover: none), (pointer: coarse) { .openvibe-notif-item .row-actions { opacity: 1; } }
            .openvibe-notif-item .row-actions button { width: 28px; height: 28px; border-radius: 8px; border: none; background: var(--bg-elevated, var(--bg-secondary, #1d1f27)); color: var(--text-muted, #8b8b96); cursor: pointer; display: grid; place-items: center; }
            .openvibe-notif-item .row-actions button:hover { color: var(--text-primary, #ececf1); background: var(--bg-hover, rgba(255,255,255,.08)); }
            .openvibe-notif-item .row-actions svg { width: 15px; height: 15px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
            .openvibe-notif-item .copy { font: inherit; font-size: 11.5px; font-weight: 650; margin-top: 7px; padding: 5px 10px; border-radius: 999px; border: 1px solid var(--border, rgba(255,255,255,.12)); background: transparent; color: var(--text-secondary, #b6b6c0); cursor: pointer; }
            .openvibe-notif-item .copy:hover { color: var(--text-primary, #ececf1); }
            .openvibe-nv-empty { text-align: center; padding: 48px 24px 56px; color: var(--text-muted, #8b8b96); font-size: 13.5px; }
            .openvibe-nv-empty svg { width: 64px; height: 64px; display: block; margin: 0 auto 12px; fill: none; stroke: var(--accent, #3b82f6); stroke-width: 1.4; stroke-linecap: round; stroke-linejoin: round; opacity: .75; }
            .openvibe-nv-empty b { display: block; font-size: 15px; color: var(--text-primary, #ececf1); margin-bottom: 4px; }
            .openvibe-nv-more { display: flex; justify-content: center; padding: 12px; }
            .openvibe-nv-more button { border: 1px solid var(--border, rgba(255,255,255,.1)); background: transparent; color: var(--text-secondary, #b6b6c0); font: inherit; font-size: 12.5px; padding: 7px 16px; border-radius: 999px; cursor: pointer; }
            .openvibe-nv-more .spinner { width: 18px; height: 18px; border: 2px solid var(--border, rgba(255,255,255,.12)); border-top-color: var(--accent, #3b82f6); border-radius: 50%; animation: ovn-spin .8s linear infinite; }
            .openvibe-nv-foot { padding: 10px 16px; border-top: 1px solid var(--border, rgba(255,255,255,.08)); font-size: 12px; color: var(--text-muted, #8b8b96); display: flex; justify-content: space-between; align-items: center; gap: 8px; }
            .openvibe-nv-foot a { color: var(--accent-light, var(--accent, #60a5fa)); text-decoration: none; font-weight: 650; }
            .openvibe-nv-note { font-size: 12px; color: var(--text-secondary, #b6b6c0); padding: 8px 16px; background: color-mix(in srgb, var(--warning, #f5a524) 12%, transparent); }

            /* Phones: the panel is a full-height sheet over a scrim; its handle drags down to close, as do × and a tap outside. */
            .openvibe-nv-actions [data-act="close"] { display: none; }
            @media (max-width: 640px) {
                .openvibe-notif-panel { top: calc(env(safe-area-inset-top, 0px) + 10px); left: 0; right: 0; bottom: 0; width: auto; max-height: none; border-radius: 22px 22px 0 0; border-bottom: 0;
                    padding-bottom: env(safe-area-inset-bottom, 0px); box-shadow: 0 0 0 100vmax rgba(0,0,0,.5), 0 -12px 40px rgba(0,0,0,.35); animation-name: ovn-sheet-up; animation-duration: .28s; }
                .openvibe-notif-panel .openvibe-nv-head { position: relative; padding-top: 20px; touch-action: none; }
                .openvibe-notif-panel .openvibe-nv-head::before { content: ''; position: absolute; top: 8px; left: 50%; width: 40px; height: 4px; margin-left: -20px; border-radius: 2px; background: var(--border-light, var(--border, rgba(255,255,255,.22))); }
                .openvibe-notif-panel .openvibe-nv-actions [data-act="close"] { display: grid; }
                .openvibe-notif-panel .openvibe-nv-actions [data-act="inbox"] { display: none; }
                .openvibe-nv-actions button, .openvibe-nv-actions a { width: 40px; height: 40px; }
                .openvibe-notif-item .row-actions { opacity: 1; }
            }
            html.ovn-sheet-open, html.ovn-sheet-open body { overflow: hidden; }
            @media (max-height: 520px) { .openvibe-notif-item .msg { -webkit-line-clamp: 1; } }
            @media (prefers-reduced-motion: reduce) {
                .openvibe-toast, .ovn-phone .openvibe-toast, .openvibe-notif-panel { animation: none; }
                .openvibe-toast.removing { animation: none; opacity: 0; }
                .openvibe-bell.ringing svg, .openvibe-bell .badge { animation: none; }
                .openvibe-toast-progress { display: none; }
            }
        `;
        document.head.appendChild(style);
    }

    // ── Helpers ─────────────────────────────────────────────
    function esc(v) {
        if (v == null) return '';
        return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
    function richOf(n) {
        const rc = n && (n.rich_content ?? n.richContent);
        if (!rc) return {};
        if (typeof rc === 'object') return rc;
        try { return JSON.parse(rc) || {}; } catch { return {}; }
    }
    function urlOf(n) { return (n && n.url) || richOf(n).url || null; }
    function isRead(n) { return !!(n && (n.is_read === 1 || n.is_read === true || n.read === true)); }
    function parseDate(v) {
        if (!v) return null;
        // SQLite "YYYY-MM-DD HH:MM:SS" is UTC without a zone marker.
        const s = String(v);
        const d = new Date(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s) ? s.replace(' ', 'T') + 'Z' : s);
        return isNaN(d.getTime()) ? null : d;
    }
    function timeAgo(v) {
        const d = parseDate(v); if (!d) return '';
        const diff = (Date.now() - d.getTime()) / 1000;
        if (diff < 45) return 'just now';
        if (diff < 3600) return `${Math.max(1, Math.floor(diff / 60))} min ago`;
        if (diff < 86400) return `${Math.floor(diff / 3600)} h ago`;
        if (diff < 604800) return `${Math.floor(diff / 86400)} d ago`;
        return d.toLocaleDateString();
    }
    /** "Today", "Yesterday", a weekday this week, else the date: the list's day headers. */
    function dayLabel(v) {
        const d = parseDate(v); if (!d) return 'Earlier';
        const start = new Date(); start.setHours(0, 0, 0, 0);
        const day = new Date(d.getTime()); day.setHours(0, 0, 0, 0);
        const days = Math.round((start - day) / 86400000);
        if (days <= 0) return 'Today';
        if (days === 1) return 'Yesterday';
        if (days < 7) { try { return d.toLocaleDateString(undefined, { weekday: 'long' }); } catch { return 'This week'; } }
        try { return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); } catch { return 'Earlier'; }
    }
    function inboxUrl() {
        if (_config.inboxUrl) return _config.inboxUrl;
        try { return new URL('/notifications', _config.apiBase).toString(); } catch { return 'https://openvibe.network/notifications'; }
    }
    function navigateTo(url) {
        if (!url) return;
        try {
            const u = new URL(url, window.location.href);
            window.location.href = u.toString();
        } catch { window.location.href = url; }
    }
    const svg = (paths) => `<svg viewBox="0 0 24 24" aria-hidden="true">${paths}</svg>`;
    function isPhone() {
        try { return !!(root.matchMedia && root.matchMedia('(max-width: 640px)').matches); } catch { return false; }
    }

    // ── What a notification says (one presentation for toasts and the list) ─────
    /** OpenVibeBrowserCheckFailed → "Browser check failed". */
    function humanize(name) {
        const s = String(name || '').replace(/^OpenVibe(?=[A-Z])/, '').replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').trim();
        return s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : 'Alert';
    }
    function isOpsAlert(n, rich) { return !!n && (n.type === 'OPERATOR_ALERT' || rich.kind === 'ops_alert'); }
    /**
     * An operator alert, from its structured fields (rich_content.kind "ops_alert": name, state, severity, sites,
     * release, summary, command) or, for older notices, read out of its title and message.
     */
    function presentOps(n, rich) {
        const title = String(n.title || '');
        const m = /^(Alert|Still firing|Resolved):\s*(.+)$/i.exec(title);
        const state = rich.state || (m ? (m[1].toLowerCase() === 'resolved' ? 'resolved' : (m[1].toLowerCase() === 'still firing' ? 'reminded' : 'firing')) : 'firing');
        const name = rich.name || (m ? m[2] : title);
        const raw = String(n.message || '');
        const command = rich.command || ((/run:\s*(sudo [^;]+?)(?:\.\s|;|\.$|$)/.exec(raw) || [])[1]) || null;
        const sites = Array.isArray(rich.sites) && rich.sites.length ? rich.sites.slice(0, 6)
            : [...new Set(((raw.match(/(?:^|\.\s+)([a-z0-9][a-z0-9.-]{1,30}):\s/g) || []).map(s => s.replace(/^\.\s+/, '').replace(/:\s$/, ''))))].slice(0, 6);
        const release = rich.release || ((/release ([0-9a-f]{7,40})/i.exec(raw) || [])[1] || null);
        const failing = (/\((\d+) failing check/i.exec(raw) || [])[1];
        let summary = rich.summary || raw
            .replace(/run:\s*sudo [^;]+?(?:\.\s|;|\.$|$)/g, '')
            .replace(/Firing since [^.]+\.?/g, '')
            .replace(/(?:^|\.\s+)[a-z0-9][a-z0-9.-]{1,30}:\s/g, ' ')
            .replace(/\s+/g, ' ').trim();
        if (release || failing) summary = [release ? `Release ${String(release).slice(0, 7)}` : null, failing ? `${failing} failing check${failing === '1' ? '' : 's'}` : null].filter(Boolean).join(' · ');
        const severity = rich.severity || (n.priority === 'critical' ? 'critical' : n.priority === 'high' ? 'warning' : 'info');
        const tone = state === 'resolved' ? 'ok' : severity === 'critical' ? 'danger' : 'warn';
        return {
            kind: 'ops', key: `ops:${name}:${state === 'resolved' ? 'resolved' : 'open'}`, tone, glyph: state === 'resolved' ? 'check' : 'pulse',
            title: (state === 'resolved' ? 'Resolved: ' : state === 'reminded' ? 'Still failing: ' : '') + humanize(name),
            message: summary.slice(0, 220), chips: sites, severity: state === 'resolved' ? 'resolved' : severity, command,
            label: 'System', url: rich.runbook_url || urlOf(n), actionLabel: 'Open status',
        };
    }
    function present(n) {
        const rich = richOf(n);
        if (isOpsAlert(n, rich)) return presentOps(n, rich);
        const cat = n.category || 'system';
        const t = String(n.type || '');
        const glyph = /DEAL|COUPON|PRICE|TRADE/.test(t) ? 'tag' : /CONFIRM|APPROV|SECUR|SIGN/.test(t) ? 'key' : (CATEGORY_GLYPH[cat] || 'bell');
        const tone = n.priority === 'critical' ? 'danger' : (CATEGORY_TONE[cat] || 'accent');
        const chips = Array.isArray(rich.chips) ? rich.chips.filter(c => typeof c === 'string').slice(0, 4) : [];
        return {
            kind: 'plain', key: [t, n.title || '', n.service || '', cat].join('\u0001'), tone, glyph,
            title: String(n.title || ''), message: String(n.message || ''), chips, severity: null, command: null,
            label: SERVICE_LABELS[n.service] || (n.service && n.service !== 'network' ? n.service : '') || CATEGORY_LABELS[cat] || '',
            url: urlOf(n), actionLabel: null,
        };
    }
    function avatarOf(n) {
        const rich = richOf(n);
        const img = n.sender_avatar || rich.thumbnail || (rich.user && rich.user.avatar_url);
        return img && /^https?:\/\//.test(String(img)) ? String(img) : null;
    }
    /** A picture for the right of a row (rich_content.image, thumbnail_url or thumbnail), unless it is the avatar. */
    function thumbOf(n) {
        const rich = richOf(n);
        const img = rich.image || rich.thumbnail_url || rich.thumbnail;
        if (!img || !/^https:\/\//.test(String(img))) return null;
        return String(img) === avatarOf(n) ? null : String(img);
    }
    function glyphHtml(n, p) {
        const tone = TONE[p.tone] || TONE.accent;
        const img = p.kind === 'ops' ? null : avatarOf(n);
        if (img) return `<span class="ovn-glyph ovn-avatar" style="--ovn-tone:${tone}"><img src="${esc(img)}" alt="" loading="lazy" onerror="this.remove()"><span class="ovn-badge">${svg(GLYPH[p.glyph] || GLYPH.bell)}</span></span>`;
        return `<span class="ovn-glyph" style="--ovn-tone:${tone}">${svg(GLYPH[p.glyph] || GLYPH.bell)}</span>`;
    }
    function chipsHtml(p, extra = []) {
        const sev = p.severity ? [`<span class="ovn-chip sev" style="--ovn-tone:${TONE[p.tone] || TONE.accent}">${esc(p.severity)}</span>`] : [];
        const all = sev.concat((p.chips || []).concat(extra).map(c => `<span class="ovn-chip">${esc(c)}</span>`));
        return all.length ? `<div class="ovn-chips">${all.join('')}</div>` : '';
    }

    // ── API ─────────────────────────────────────────────────
    function isCrossOrigin() {
        try { return new URL(_config.apiBase).origin !== window.location.origin; } catch { return false; }
    }
    function apiFetch(path, opts = {}) {
        const headers = { ...(opts.headers || {}) };
        if (_config.token) headers['Authorization'] = `Bearer ${_config.token}`;
        if (opts.body && typeof opts.body === 'object' && !(opts.body instanceof FormData)) {
            headers['Content-Type'] = 'application/json';
            opts = { ...opts, body: JSON.stringify(opts.body) };
        }
        return fetch(`${_config.apiBase}${path}`, { ...opts, headers, credentials: isCrossOrigin() ? 'omit' : 'include' });
    }
    async function apiJson(path, opts) {
        const res = await apiFetch(path, opts);
        let data = null; try { data = await res.json(); } catch { /* */ }
        if (!res.ok) { const e = new Error((data && data.error) || `HTTP ${res.status}`); e.status = res.status; e.body = data; throw e; }
        return data || {};
    }
    function hasSession() { return !!_config.token || !isCrossOrigin(); }

    // Quiet hours (OpenVibe.Network GET /api/notifications/quiet-hours, 4.30.0): during the person's own window, in their
    // time zone, a toast and its sound wait: the bell and the badge still fill, and a critical notice still shows. Read
    // once when the layer starts and again every ten minutes; a Network that does not answer means no quiet hours.
    let _quiet = null, _quietAt = 0;
    function loadQuiet() {
        if (!hasSession() || Date.now() - _quietAt < 10 * 60000) return;
        _quietAt = Date.now();
        apiJson('/api/notifications/quiet-hours').then((q) => { _quiet = q && typeof q.start === 'string' ? q : null; }).catch(() => { _quiet = null; });
    }
    const minutesOf = (s) => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || '')); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
    function inQuiet() {
        loadQuiet();
        const q = _quiet;
        if (!q || !q.enabled) return false;
        const a = minutesOf(q.start), b = minutesOf(q.end);
        if (a == null || b == null || a === b) return false;
        let now;
        try {
            const parts = new Intl.DateTimeFormat('en-GB', { timeZone: q.tz || 'UTC', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date());
            now = Number(parts.find((x) => x.type === 'hour').value) * 60 + Number(parts.find((x) => x.type === 'minute').value);
        } catch { const d = new Date(); now = d.getUTCHours() * 60 + d.getUTCMinutes(); }
        return a < b ? now >= a && now < b : now >= a || now < b;
    }
    const held = (n) => (n && n.priority) !== 'critical' && inQuiet();

    // ── Cross-tab sync (same origin) ────────────────────────
    function channel() {
        if (_channel !== null) return _channel || null;
        try { _channel = new BroadcastChannel('openvibe-notifications'); _channel.onmessage = (e) => onSyncMessage(e.data || {}); }
        catch { _channel = false; }
        return _channel || null;
    }
    function broadcast(msg) { try { channel()?.postMessage(msg); } catch { /* */ } }
    function onSyncMessage(msg) {
        if (msg.type === 'unread') setBadge(msg.count, { quiet: true });
        else if (msg.type === 'read') { for (const v of _views.values()) applyReadLocally(v, msg.ids || [], msg.all); }
    }

    // ── Sound ───────────────────────────────────────────────
    function playSound(priority) {
        if (!_preferences.sound) return;
        if (priority !== 'critical' && inQuiet()) return;
        const file = SOUNDS[priority]; if (!file) return;
        const url = `${_config.soundBase}/${file}`;
        try {
            if (!_audioCache[url]) _audioCache[url] = new Audio(url);
            const a = _audioCache[url]; a.currentTime = 0; a.volume = priority === 'critical' ? 0.8 : 0.5; a.play().catch(() => {});
        } catch { /* */ }
    }

    // ── Layers: toasts never draw over an open menu, panel or dialog ─────────
    // What counts as open, read from the page itself: this file loads late (after the bell mounts), so an
    // 'openvibe-menu' event fired before it is missed; the menu's own class and every bar toggle's aria-expanded are not.
    const OPEN_LAYERS = '.ovs.is-open, .openvibe-navbar [aria-expanded="true"], .openvibe-notif-panel.open, dialog[open], [aria-modal="true"]:not([hidden])';
    function layerBusy() {
        if (_menuOpen) return true;
        try { if (root.OpenVibePanels && typeof root.OpenVibePanels.anyOpen === 'function' && root.OpenVibePanels.anyOpen()) return true; } catch { /* */ }
        if (document.body && document.body.classList && document.body.classList.contains('ov-panel-open')) return true;
        // Only what is drawn counts: a closed menu may keep aria-modal while it sits at display: none.
        try { for (const el of document.querySelectorAll(OPEN_LAYERS)) if (el.getClientRects().length) return true; } catch { /* */ }
        return false;
    }
    let _layerWatch = false;
    function watchLayers() {
        if (_layerWatch || typeof document === 'undefined') return;
        _layerWatch = true;
        document.addEventListener('openvibe-menu', (e) => { _menuOpen = !!(e && e.detail && e.detail.open); syncLayer(); });
        try {
            // aria-expanded and open change only when something opens or closes, so watching them page-wide is cheap.
            if (typeof root.MutationObserver === 'function' && document.body) new root.MutationObserver(() => syncLayer()).observe(document.body, { attributes: true, subtree: true, attributeFilter: ['aria-expanded', 'open', 'aria-modal'] });
            if (typeof root.MutationObserver === 'function' && document.body) new root.MutationObserver(() => syncLayer()).observe(document.body, { attributes: true, attributeFilter: ['class'] });
        } catch { /* */ }
        // Without an observer, any click may have opened or closed something: check right after it.
        document.addEventListener('click', () => Promise.resolve().then(syncLayer), true);
    }
    function syncLayer() {
        if (!_toastContainer) return;
        const busy = layerBusy();
        const was = _toastContainer.classList.contains('ovn-held');
        if (busy === was) return;
        _toastContainer.classList.toggle('ovn-held', busy);
        for (const el of _toastContainer.querySelectorAll('.openvibe-toast')) busy ? pauseToast(el) : resumeToast(el);
        if (!busy) flushQueue();
    }

    // ── Toasts ──────────────────────────────────────────────
    function ensureToastContainer() {
        if (_toastContainer) return;
        _toastContainer = document.createElement('div');
        _toastContainer.className = 'openvibe-toast-container';
        _toastContainer.setAttribute('role', 'region');
        _toastContainer.setAttribute('aria-label', 'Notifications');
        _toastContainer.setAttribute('aria-live', 'polite');
        document.body.appendChild(_toastContainer);
        watchLayers();
    }
    function placeContainer() {
        const phone = isPhone();
        _toastContainer.classList.toggle('ovn-phone', phone);
        if (phone) {
            // Under whatever bar the site has; above it when the bar is hidden on scroll.
            const bar = document.querySelector('nav.openvibe-navbar, nav.navbar, header.navbar, .navbar');
            const r = bar && bar.getBoundingClientRect ? bar.getBoundingClientRect() : null;
            const top = r && r.bottom > 0 ? Math.round(r.bottom) + 8 : 10;
            _toastContainer.style.setProperty('--ovn-top', top + 'px');
        }
    }
    function visibleToasts() { return _toastContainer ? [..._toastContainer.querySelectorAll('.openvibe-toast:not(.removing)')] : []; }
    function maxVisible() { return isPhone() ? 1 : MAX_TOASTS; }

    // Urgent first: a full stack makes room by letting a lower-priority card go, never a higher one.
    const RANK = { critical: 3, high: 2, normal: 1, low: 0 };
    const rank = (n) => RANK[(n && n.priority) || 'normal'] ?? 1;
    const _shownIds = new Set();      // one notification id is one card, however many times a poll or a push brings it
    function showToast(n) {
        if (!_preferences.toasts) return;
        if (held(n)) return;
        if (_preferences.muted_categories.includes(n.category)) return;
        const id = n && n.id != null ? String(n.id) : null;
        if (id) {
            if (_shownIds.has(id)) return;
            _shownIds.add(id);
            if (_shownIds.size > 500) _shownIds.delete(_shownIds.values().next().value);
        }
        ensureToastContainer();
        const p = present(n);
        // The same notice again within the window joins the card already showing (or waiting).
        const now = Date.now();
        const live = visibleToasts().find(el => el.__ovn && el.__ovn.key === p.key && now - el.__ovn.at < GROUP_WINDOW);
        if (live) { mergeToast(live, n, p); return; }
        const queued = _queue.find(q => q.p.key === p.key);
        if (queued) { queued.count += 1; queued.n = rank(n) >= rank(queued.n) ? n : queued.n; queued.chips = [...new Set(queued.chips.concat(p.chips))]; return; }
        _queue.push({ n, p, count: 1, chips: p.chips.slice() });
        _queue.sort((a, b) => rank(b.n) - rank(a.n));   // stable: arrival order within a priority
        flushQueue();
    }
    function flushQueue() {
        if (!_toastContainer || layerBusy()) { if (_toastContainer) _toastContainer.classList.toggle('ovn-held', layerBusy()); updateMore(); return; }
        placeContainer();
        while (_queue.length) {
            const vis = visibleToasts();
            if (vis.length < maxVisible()) { renderToast(_queue.shift()); continue; }
            const lowest = vis.reduce((a, el) => (rank(el.__ovn.n) < rank(a.__ovn.n) ? el : a), vis[0]);
            if (rank(_queue[0].n) > rank(lowest.__ovn.n)) { dismissToast(lowest); continue; }
            break;
        }
        updateMore();
    }
    /** "+N more" lives inside the card that is showing (a phone shows one at a time), never floating over the page. */
    function updateMore() {
        if (!_toastContainer) return;
        const waiting = _queue.length;
        const first = visibleToasts()[0];
        _toastContainer.querySelectorAll('.openvibe-toast-more').forEach((m) => { if (!waiting || !isPhone() || !first || !first.contains(m)) m.remove(); });
        if (!waiting || !isPhone() || !first) return;
        let more = first.querySelector('.openvibe-toast-more');
        if (!more) {
            more = document.createElement('button');
            more.type = 'button'; more.className = 'openvibe-toast-more';
            more.addEventListener('click', (e) => { e.stopPropagation(); const f = visibleToasts()[0]; if (f) dismissToast(f); else flushQueue(); });
            const sub = first.querySelector('.openvibe-toast-sub');
            (sub || first.querySelector('.openvibe-toast-body') || first).appendChild(more);
        }
        more.textContent = `+${waiting} more`;
        more.setAttribute('aria-label', `${waiting} more notification${waiting === 1 ? '' : 's'}: show the next`);
    }
    function renderToast(q) {
        const { n, p } = q;
        const toast = document.createElement('div');
        toast.className = `openvibe-toast priority-${esc(n.priority || 'normal')}`;
        toast.dataset.notifId = n.id || '';
        toast.tabIndex = 0;
        toast.style.setProperty('--ovn-tone', TONE[p.tone] || TONE.accent);
        if (n.priority === 'critical') toast.setAttribute('role', 'alert');
        toast.__ovn = { key: p.key, at: Date.now(), count: q.count, chips: q.chips.slice(), ids: n.id ? [n.id] : [], n };
        const rich = richOf(n);
        const custom = Array.isArray(rich.actions) ? rich.actions.filter(a => a && a.type !== 'input' && a.label).slice(0, 2) : [];
        const actions = custom.length ? custom : (p.url ? [{ id: 'open', label: p.actionLabel || 'View', url: p.url, style: 'primary' }] : []);
        toast.innerHTML = `
            ${glyphHtml(n, p)}
            <div class="openvibe-toast-body">
                <div class="openvibe-toast-title"><span class="t">${esc(p.title)}</span><span class="n" data-role="n"${q.count > 1 ? '' : ' hidden'}>×${q.count}</span></div>
                <div class="openvibe-toast-sub">${esc(p.label || '')}${p.label ? '<span aria-hidden="true">·</span>' : ''}<span>now</span></div>
                ${p.message ? `<div class="openvibe-toast-msg" data-role="msg">${esc(p.message)}</div>` : ''}
                <div data-role="chips">${chipsHtml({ ...p, chips: q.chips })}</div>
                ${actions.length ? `<div class="openvibe-toast-actions">${actions.map(a => a.url
                    ? `<a href="${esc(a.url)}" data-action="${esc(a.id || 'open')}" class="${a.style === 'primary' ? 'primary' : ''}">${esc(a.label)}</a>`
                    : `<button type="button" data-action="${esc(a.id)}" class="${a.style === 'primary' ? 'primary' : ''}">${esc(a.label)}</button>`).join('')}</div>` : ''}
            </div>
            <button type="button" class="openvibe-toast-close" aria-label="Dismiss">&times;</button>`;
        const duration = TOAST_DURATION[n.priority] ?? 5200;
        toast.__ovnDuration = duration;
        if (duration > 0) {
            const bar = document.createElement('div');
            bar.className = 'openvibe-toast-progress';
            toast.appendChild(bar);
            startTimer(toast, duration);
        }
        toast.querySelector('.openvibe-toast-close').addEventListener('click', (e) => { e.stopPropagation(); dismissToast(toast); });
        toast.addEventListener('click', (e) => {
            if (e.target.closest && e.target.closest('[data-action]')) return;
            const ids = toast.__ovn.ids; if (ids.length) markRead(ids);
            dismissToast(toast);
            if (p.url) navigateTo(p.url);
        });
        toast.addEventListener('keydown', (e) => { if (e.key === 'Escape') dismissToast(toast); });
        toast.querySelectorAll('[data-action]').forEach(btn => btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const ids = toast.__ovn.ids; if (ids.length) markRead(ids);
            const a = actions.find(x => String(x.id || 'open') === btn.dataset.action);
            if (a && a.url) { e.preventDefault(); dismissToast(toast); navigateTo(a.url); return; }
            if (_config.onAction) _config.onAction(n.id, btn.dataset.action, n);
            dismissToast(toast);
        }));
        // Hover or focus holds the timer; a swipe sideways (or up, on a phone) dismisses.
        toast.addEventListener('mouseenter', () => pauseToast(toast));
        toast.addEventListener('mouseleave', () => resumeToast(toast));
        toast.addEventListener('focusin', () => pauseToast(toast));
        toast.addEventListener('focusout', () => resumeToast(toast));
        attachSwipe(toast);
        _toastContainer.appendChild(toast);
    }
    function mergeToast(el, n, p) {
        const st = el.__ovn;
        if (n.id && st.ids.includes(n.id)) return;
        st.count += 1; st.at = Date.now(); st.n = rank(n) >= rank(st.n) ? n : st.n;
        if (n.id) st.ids.push(n.id);
        st.chips = [...new Set(st.chips.concat(p.chips))].slice(0, 8);
        const c = el.querySelector('[data-role="n"]'); if (c) { c.textContent = `×${st.count}`; c.hidden = false; }
        const m = el.querySelector('[data-role="msg"]'); if (m && p.message) m.textContent = p.message;
        const ch = el.querySelector('[data-role="chips"]'); if (ch) ch.innerHTML = chipsHtml({ ...p, chips: st.chips });
        if (el.__ovnDuration > 0) startTimer(el, el.__ovnDuration);
    }
    function startTimer(el, ms) {
        clearTimeout(el.__ovnTimer);
        el.__ovnRemaining = ms; el.__ovnStarted = Date.now();
        const bar = el.querySelector('.openvibe-toast-progress');
        if (bar) { bar.style.transition = 'none'; bar.style.transform = 'scaleX(1)'; const go = () => { bar.style.transition = `transform ${ms}ms linear`; bar.style.transform = 'scaleX(0)'; }; (root.requestAnimationFrame || ((f) => f()))(go); }
        if (_toastContainer && _toastContainer.classList.contains('ovn-held')) { pauseToast(el); return; }
        el.__ovnTimer = setTimeout(() => dismissToast(el), ms);
    }
    function pauseToast(el) {
        if (!el || !el.__ovnTimer) return;
        clearTimeout(el.__ovnTimer); el.__ovnTimer = null;
        el.__ovnRemaining = Math.max(800, (el.__ovnRemaining || 0) - (Date.now() - (el.__ovnStarted || Date.now())));
        const bar = el.querySelector('.openvibe-toast-progress');
        if (bar && root.getComputedStyle) { try { const t = root.getComputedStyle(bar).transform; bar.style.transition = 'none'; bar.style.transform = t && t !== 'none' ? t : 'scaleX(1)'; } catch { /* */ } }
    }
    function resumeToast(el) {
        if (!el || el.__ovnTimer || !(el.__ovnDuration > 0) || el.classList.contains('removing')) return;
        if (_toastContainer && _toastContainer.classList.contains('ovn-held')) return;
        startTimer(el, el.__ovnRemaining || el.__ovnDuration);
    }
    function attachSwipe(el) {
        if (typeof root.PointerEvent !== 'function') return;
        let x0 = null, y0 = null, dx = 0, dy = 0;
        el.addEventListener('pointerdown', (e) => { x0 = e.clientX; y0 = e.clientY; dx = dy = 0; });
        el.addEventListener('pointermove', (e) => {
            if (x0 == null) return;
            dx = e.clientX - x0; dy = e.clientY - y0;
            if (Math.abs(dx) > 8 || dy < -8) { el.style.transition = 'none'; el.style.transform = Math.abs(dx) >= Math.abs(dy) ? `translateX(${dx}px)` : `translateY(${Math.min(0, dy)}px)`; el.style.opacity = String(Math.max(0.2, 1 - Math.max(Math.abs(dx), -dy) / 220)); }
        });
        const end = () => {
            if (x0 == null) return;
            const gone = Math.abs(dx) > 90 || (isPhone() && dy < -40);
            x0 = y0 = null;
            if (gone) { el.__ovnSwiped = true; dismissToast(el); return; }
            el.style.transition = 'transform .2s ease, opacity .2s ease'; el.style.transform = ''; el.style.opacity = '';
        };
        el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
        // A swipe is not a click on the card.
        el.addEventListener('click', (e) => { if (el.__ovnSwiped) { e.stopImmediatePropagation(); e.preventDefault(); } }, true);
    }
    function dismissToast(el) {
        if (!el || !el.parentNode || el.classList.contains('removing')) return;
        clearTimeout(el.__ovnTimer);
        el.classList.add('removing');
        setTimeout(() => { el.remove(); flushQueue(); }, 240);
    }

    // ── The ✦: the Action Center, loaded from beside this file on the first click ──
    let _acLoading = null;
    function actionCenterSrc() {
        if (_config.actionCenterSrc) return _config.actionCenterSrc;
        const m = /^(https?:\/\/[^?#]*\/)notification-ui\.js(?:[?#]|$)/.exec(SELF_SRC);
        return `${m ? m[1] : 'https://openvibe.network/shared/'}action-center.js`;
    }
    function loadActionCenter() {
        if (root.OpenVibeActionCenter) return Promise.resolve(root.OpenVibeActionCenter);
        return _acLoading || (_acLoading = new Promise((ok) => {
            const sc = document.createElement('script');
            sc.src = actionCenterSrc(); sc.async = true;
            sc.onload = () => ok(root.OpenVibeActionCenter || null);
            sc.onerror = () => { _acLoading = null; ok(null); };
            document.head.appendChild(sc);
        }));
    }
    function openActions(anchor) {
        loadActionCenter().then((AC) => { if (AC) AC.toggle({ anchor, token: () => _config.token, apiBase: _config.apiBase }); });
    }
    function createActionsEl() {
        const b = document.createElement('div');
        b.className = 'openvibe-actions-btn';
        b.setAttribute('role', 'button'); b.setAttribute('aria-label', 'Agents'); b.setAttribute('aria-haspopup', 'dialog'); b.setAttribute('aria-expanded', 'false');
        b.title = 'Agents: everything your agents are doing'; b.tabIndex = 0;
        b.innerHTML = svg(GLYPH.spark);
        b.addEventListener('click', () => openActions(b));
        b.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openActions(b); } });
        return b;
    }

    // ── Bell / badge ────────────────────────────────────────
    function createBellEl() {
        const bell = document.createElement('div');
        bell.className = 'openvibe-bell';
        bell.setAttribute('role', 'button'); bell.setAttribute('aria-label', 'Notifications'); bell.tabIndex = 0;
        bell.innerHTML = `${svg(GLYPH.bell)}<span class="badge hidden">0</span>`;
        bell.addEventListener('click', () => togglePanel());
        bell.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); togglePanel(); } });
        _bellEl = bell;
        return bell;
    }
    function setBadge(count, { quiet = false } = {}) {
        const prev = _unreadCount;
        _unreadCount = Math.max(0, Number(count) || 0);
        if (_bellEl) {
            const badge = _bellEl.querySelector('.badge');
            if (_unreadCount > 0) {
                badge.textContent = _unreadCount > 99 ? '99+' : String(_unreadCount);
                badge.classList.remove('hidden');
                if (!quiet && _unreadCount > prev) { _bellEl.classList.add('ringing'); setTimeout(() => _bellEl.classList.remove('ringing'), 700); }
            } else badge.classList.add('hidden');
            _bellEl.setAttribute('aria-label', _unreadCount ? `Notifications, ${_unreadCount} unread` : 'Notifications');
        }
        for (const v of _views.values()) {
            const c = v.root.querySelector('.openvibe-nv-head .count');
            if (c) { c.textContent = _unreadCount > 99 ? '99+' : String(_unreadCount); c.classList.toggle('zero', _unreadCount === 0); }
        }
        if (!quiet) broadcast({ type: 'unread', count: _unreadCount });
        if (_unreadCount !== prev && listShowing()) loadTabCounts();
    }

    // ── List views (panel + inbox share this) ───────────────
    const ICON = {
        search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
        filter: '<path d="M4 6.5h16M7 12h10M10 17.5h4"/>',
        checkAll: '<path d="M2.5 12.5l4.5 4.5L17 7"/><path d="M11.5 16.5l.5.5L22 7"/>',
        bellOn: GLYPH.bell,
        bellOff: '<path d="M6.2 16.2V11a5.8 5.8 0 0 1 9.6-4.4M17.8 10.4v5.8l1.6 2H6"/><path d="M10 20.2a2.1 2.1 0 0 0 4 0M3.5 3.5l17 17"/>',
        gear: GLYPH.gear,
        open: '<path d="M14 4h6v6M20 4l-9 9M19 14v5a1.5 1.5 0 0 1-1.5 1.5h-12A1.5 1.5 0 0 1 4 19V7a1.5 1.5 0 0 1 1.5-1.5H10"/>',
        read: '<path d="M5 12.6l4.6 4.6L19 7.6"/>',
        close: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
        empty: '<path d="M18 37V26a14 14 0 0 1 28 0v11l4 5H14z"/><path d="M27 49a5 5 0 0 0 10 0"/><path d="M50 14l4-4M53 22h5M44 8l1-5"/>',
    };

    function buildView(root, { mode }) {
        const v = { root, mode, tab: 'all', unread: false, q: '', items: [], offset: 0, hasMore: false, loading: false, seq: 0, ids: new Set() };
        root.innerHTML = `
            <div class="openvibe-nv-head">
                <h3>Notifications <span class="count zero">0</span></h3>
                <div class="openvibe-nv-actions">
                    <button type="button" data-act="read-all" title="Mark all as read">${svg(ICON.checkAll)}<span>Mark all read</span></button>
                    <button type="button" data-act="push" title="Push alerts on this device">${svg(ICON.bellOff)}<span>Push alerts</span></button>
                    <a href="${esc(inboxUrl().replace(/\/notifications$/, '/notifications#prefs'))}" data-act="prefs" title="Notification settings">${svg(ICON.gear)}<span>Settings</span></a>
                    ${mode === 'panel' ? `<a href="${esc(inboxUrl())}" data-act="inbox" title="Open the full inbox">${svg(ICON.open)}<span>Open inbox</span></a><button type="button" data-act="close" title="Close">${svg(ICON.close)}<span>Close</span></button>` : ''}
                </div>
            </div>
            <div class="openvibe-nv-note" data-role="note" style="display:none"></div>
            <div class="openvibe-nv-tools">
                <div class="openvibe-nv-find">
                    <div class="openvibe-nv-search">${svg(ICON.search)}<input type="search" placeholder="Search notifications" aria-label="Search notifications" autocomplete="off" spellcheck="false"><button type="button" class="clear" aria-label="Clear search">&times;</button></div>
                    <button type="button" class="openvibe-nv-unread" aria-pressed="false" title="Show only unread">${svg(ICON.filter)}Unread</button>
                </div>
                <div class="openvibe-nv-tabs" role="tablist" aria-label="Notifications">
                    ${TABS.map(([id, label]) => `<button type="button" role="tab" data-tab="${id}" aria-selected="${id === 'all'}" tabindex="${id === 'all' ? '0' : '-1'}">${esc(label)}<span class="n" data-n="${id}"></span></button>`).join('')}
                </div>
            </div>
            <div class="openvibe-nv-list" data-role="list" role="tabpanel" aria-label="All"></div>
            <div class="openvibe-nv-foot"><span data-role="status"></span>${mode === 'dock' ? `<button type="button" class="ovn-foot-read" data-act="read-all-foot">${svg(ICON.checkAll)}Mark all read</button>` : ''}${mode === 'panel' || mode === 'dock' ? `<a href="${esc(inboxUrl())}">Full inbox →</a>` : ''}</div>`;
        const list = root.querySelector('[data-role="list"]');
        const input = root.querySelector('input[type="search"]');
        let qTimer = null;
        input.addEventListener('input', () => {
            root.querySelector('.openvibe-nv-search').classList.toggle('has-q', !!input.value);
            clearTimeout(qTimer); qTimer = setTimeout(() => { v.q = input.value.trim(); reload(v); }, 260);
        });
        root.querySelector('.openvibe-nv-search .clear').addEventListener('click', () => { input.value = ''; v.q = ''; root.querySelector('.openvibe-nv-search').classList.remove('has-q'); reload(v); });
        // Tabs: a click or the arrow keys (Home, End) pick one; the list reloads with Network's ?tab=.
        const tabs = [...root.querySelectorAll('.openvibe-nv-tabs [role="tab"]')];
        const selectTab = (btn, focus) => {
            tabs.forEach((b) => { const on = b === btn; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; });
            if (focus) btn.focus();
            try { btn.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch { /* */ }
            v.tab = btn.dataset.tab;
            list.setAttribute('aria-label', (TABS.find(([id]) => id === v.tab) || ['', 'All'])[1]);
            reload(v);
        };
        tabs.forEach((btn) => btn.addEventListener('click', () => selectTab(btn)));
        const tabRow = root.querySelector('.openvibe-nv-tabs');
        const fade = () => { tabRow.classList.toggle('is-more', tabRow.scrollLeft + tabRow.clientWidth < tabRow.scrollWidth - 4); };
        tabRow.addEventListener('scroll', fade, { passive: true });
        v.fade = fade;
        root.querySelector('.openvibe-nv-tabs').addEventListener('keydown', (e) => {
            const i = tabs.indexOf(document.activeElement);
            if (i < 0) return;
            const j = e.key === 'ArrowRight' ? (i + 1) % tabs.length : e.key === 'ArrowLeft' ? (i - 1 + tabs.length) % tabs.length : e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : -1;
            if (j >= 0) { e.preventDefault(); selectTab(tabs[j], true); }
        });
        const unreadBtn = root.querySelector('.openvibe-nv-unread');
        unreadBtn.addEventListener('click', () => { v.unread = !v.unread; unreadBtn.setAttribute('aria-pressed', String(v.unread)); reload(v); });
        root.querySelector('[data-act="read-all"]').addEventListener('click', () => markAllRead());
        const footRead = root.querySelector('[data-act="read-all-foot"]'); if (footRead) footRead.addEventListener('click', () => markAllRead());
        root.querySelector('[data-act="push"]').addEventListener('click', () => togglePush(v));
        const closeBtn = root.querySelector('[data-act="close"]');
        if (closeBtn) closeBtn.addEventListener('click', () => closePanel());
        // Infinite scroll: load the next page when the user nears the bottom.
        list.addEventListener('scroll', () => {
            if (v.loading || !v.hasMore) return;
            if (list.scrollTop + list.clientHeight >= list.scrollHeight - 120) loadMore(v);
        });
        list.addEventListener('click', (e) => {
            if (e.target.closest('[data-act="ac"]')) { const anchor = _bellEl; closePanel(); openActions(anchor); return; }
            const item = e.target.closest('.openvibe-notif-item');
            if (!item || (item.__ovnSwipedAt && Date.now() - item.__ovnSwipedAt < 450)) return;
            const id = item.dataset.id;
            const ids = (item.dataset.ids || id).split(',').filter(Boolean);
            const act = e.target.closest('[data-row]');
            if (act) {
                e.stopPropagation();
                if (act.dataset.row === 'dismiss') ids.forEach(x => dismiss(v, x));
                else if (act.dataset.row === 'read') markRead(ids);
                else if (act.dataset.row === 'copy') copyText(act.dataset.cmd || '', act);
                return;
            }
            const n = v.items.find(x => String(x.id) === id);
            const unreadIds = ids.filter(x => { const it = v.items.find(y => String(y.id) === x); return it && !isRead(it); });
            if (unreadIds.length) markRead(unreadIds);
            const u = n && present(n).url;
            if (u) navigateTo(u);
        });
        list.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.classList && e.target.classList.contains('ovn-row')) { e.preventDefault(); e.target.click(); } });
        // A thumbnail or avatar that does not load leaves its row (no inline handlers: a site's CSP may forbid them).
        list.addEventListener('error', (e) => {
            const img = e.target;
            if (!img || img.tagName !== 'IMG') return;
            const row = img.closest('.ovn-row');
            if (img.classList.contains('thumb') && row) row.classList.remove('has-thumb');
            img.remove();
        }, true);
        attachRowSwipe(v, list);
        refreshPushButton(v);
        _views.set(root, v);
        paintTabCounts();
        return v;
    }
    /**
     * Touch: a row follows the finger sideways. Past a third of its width (at most 96 px), right marks it read and left
     * clears it (Network's dismiss); short of that it springs back. A vertical move is the list scrolling, not a swipe.
     */
    function attachRowSwipe(v, list) {
        if (typeof root.PointerEvent !== 'function') return;
        let s = null;
        list.addEventListener('pointerdown', (e) => {
            if (e.pointerType === 'mouse') return;
            const row = e.target.closest && e.target.closest('.ovn-row');
            if (!row || e.target.closest('button, a')) return;
            s = { row, item: row.parentNode, x0: e.clientX, y0: e.clientY, dx: 0, on: false, id: e.pointerId };
        });
        list.addEventListener('pointermove', (e) => {
            if (!s || e.pointerId !== s.id) return;
            const dx = e.clientX - s.x0, dy = e.clientY - s.y0;
            if (!s.on) {
                if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) { s = null; return; }
                if (Math.abs(dx) < 12) return;
                s.on = true; s.item.classList.add('swiping');
                try { s.row.setPointerCapture(e.pointerId); } catch { /* */ }
            }
            // Already read: a short give to the right, nothing to do.
            s.dx = dx > 0 && !s.item.classList.contains('unread') ? Math.min(dx, 24) : dx;
            s.item.dataset.swipe = s.dx > 0 ? 'read' : 'clear';
            s.row.style.transform = `translateX(${s.dx}px)`;
        });
        const end = () => {
            if (!s) return;
            const { row, item, dx, on } = s; s = null;
            item.classList.remove('swiping');
            if (!on) return;
            item.__ovnSwipedAt = Date.now();
            const ids = (item.dataset.ids || item.dataset.id || '').split(',').filter(Boolean);
            const w = row.offsetWidth || 320;
            const far = Math.min(96, w / 3);
            const settle = () => setTimeout(() => { if (!item.classList.contains('swiping')) delete item.dataset.swipe; }, 220);
            if (dx < -far) { row.style.transform = `translateX(${-w}px)`; setTimeout(() => ids.forEach((x) => dismiss(v, x)), 180); return; }
            row.style.transform = '';
            if (dx > far && item.classList.contains('unread')) markRead(ids);
            settle();
        };
        list.addEventListener('pointerup', end);
        list.addEventListener('pointercancel', end);
    }
    function copyText(text, btn) {
        const done = () => { if (btn) { const was = btn.textContent; btn.textContent = 'Copied'; setTimeout(() => { btn.textContent = was; }, 1400); } };
        try { if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(text).then(done, () => {}); return; } } catch { /* */ }
        done();
    }

    function renderItems(v, { append = false } = {}) {
        const list = v.root.querySelector('[data-role="list"]');
        // The same notice repeated back to back ("X is live!" six times; three browser checks failing) reads as one
        // row with a count and the sites it covers.
        const groups = [];
        for (const n of v.items) {
            const p = present(n);
            const g = groups[groups.length - 1];
            if (g && g.p.key === p.key) {
                g.ids.push(String(n.id)); if (!isRead(n)) g.unread = true;
                g.chips = [...new Set(g.chips.concat(p.chips))].slice(0, 8);
                if (!g.cmd && p.command) g.cmd = p.command;
            } else groups.push({ n, p, ids: [String(n.id)], unread: !isRead(n), chips: p.chips.slice(), cmd: p.command });
        }
        let lastDay = append ? v.lastDay : null;
        const html = groups.map(({ n, p, ids, unread, chips, cmd }) => {
            try {
                const day = dayLabel(n.created_at);
                const head = day !== lastDay ? `<div class="openvibe-nv-day">${esc(day)}</div>` : '';
                lastDay = day;
                const when = esc(timeAgo(n.created_at));
                const label = p.label ? `<span class="dot"></span><span>${esc(p.label)}</span>` : '';
                const thumb = p.kind === 'ops' ? null : thumbOf(n);
                return `${head}<div class="openvibe-notif-item ${unread ? 'unread' : ''}" data-id="${esc(n.id)}" data-ids="${esc(ids.join(','))}" style="--ovn-tone:${TONE[p.tone] || TONE.accent}">
                    <div class="ovn-under" aria-hidden="true"><span class="read">${svg(ICON.read)}Read</span><span class="clear">Clear${svg(ICON.close)}</span></div>
                    <div class="ovn-row${thumb ? ' has-thumb' : ''}" tabindex="0">
                    ${unread ? '<span class="unread-dot" role="img" aria-label="Unread"></span>' : ''}
                    ${glyphHtml(n, p)}
                    <div class="content">
                        <div class="title"><span class="t">${esc(p.title)}</span>${ids.length > 1 ? `<span class="count" title="${ids.length} times">×${ids.length}</span>` : ''}</div>
                        ${p.message ? `<div class="msg">${esc(p.message)}</div>` : ''}
                        ${chipsHtml({ ...p, chips })}
                        ${cmd ? `<button type="button" class="copy" data-row="copy" data-cmd="${esc(cmd)}">Copy fix command</button>` : ''}
                        <div class="meta"><span title="${esc(parseDate(n.created_at)?.toLocaleString() || '')}">${when}</span>${label}<div class="row-actions">${unread ? `<button type="button" data-row="read" title="Mark as read" aria-label="Mark as read">${svg(ICON.read)}</button>` : ''}<button type="button" data-row="dismiss" title="Clear" aria-label="Clear">${svg(ICON.close)}</button></div></div>
                    </div>
                    ${thumb ? `<img class="thumb" src="${esc(thumb)}" alt="" loading="lazy">` : ''}
                    </div>
                </div>`;
            } catch { return ''; }
        }).join('');
        v.lastDay = lastDay;
        if (!append) list.innerHTML = v.tab === 'agents' ? `<button type="button" class="ovn-ac-link" data-act="ac">${svg(GLYPH.spark)}<span>Everything your agents are doing: running, waiting for you, done</span></button>` : '';
        if (!v.items.length) {
            const [t0, s0] = TAB_EMPTY[v.tab] || TAB_EMPTY.all;
            const acLink = v.tab === 'agents' ? `<button type="button" class="ovn-ac-link" data-act="ac">${svg(GLYPH.spark)}<span>Everything your agents are doing: running, waiting for you, done</span></button>` : '';
            const title = v.q ? 'Nothing matches that search' : (v.unread ? 'You\'re all caught up' : t0);
            const sub = v.q ? 'Try other words.' : (v.unread ? 'Nothing unread here.' : s0);
            list.innerHTML = `${acLink}<div class="openvibe-nv-empty"><svg viewBox="0 0 64 64" aria-hidden="true">${ICON.empty}</svg><b>${esc(title)}</b>${esc(sub)}</div>`;
        } else {
            const old = list.querySelector('.openvibe-nv-more'); if (old) old.remove();
            list.insertAdjacentHTML('beforeend', html);
            if (v.hasMore) list.insertAdjacentHTML('beforeend', `<div class="openvibe-nv-more"><button type="button" data-act="more">Load more</button></div>`);
            const more = list.querySelector('[data-act="more"]'); if (more) more.addEventListener('click', () => loadMore(v));
        }
        const st = v.root.querySelector('[data-role="status"]');
        if (st) st.textContent = v.total != null ? `${v.items.length} of ${v.total}${v.unread ? ' unread' : ''}` : '';
    }

    async function fetchPage(v, offset) {
        const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset) });
        if (v.unread) params.set('unread_only', '1');
        if (v.tab && v.tab !== 'all') params.set('tab', v.tab);
        if (v.q) params.set('q', v.q);
        return apiJson(`/api/notifications?${params}`);
    }
    async function reload(v) {
        const seq = ++v.seq;
        loadTabCounts();
        if (v.fade) setTimeout(v.fade, 0);
        v.loading = true; v.offset = 0; v.items = []; v.ids = new Set(); v.hasMore = false; v.total = null; v.lastDay = null;
        const list = v.root.querySelector('[data-role="list"]');
        list.innerHTML = '<div class="openvibe-nv-more"><span class="spinner"></span></div>';
        try {
            const data = await fetchPage(v, 0);
            if (seq !== v.seq) return;
            v.items = data.notifications || []; v.items.forEach(n => v.ids.add(String(n.id)));
            v.hasMore = !!data.has_more; v.total = data.total ?? null; v.offset = v.items.length;
            renderItems(v);
        } catch (e) {
            if (seq !== v.seq) return;
            list.innerHTML = `<div class="openvibe-nv-empty"><svg viewBox="0 0 64 64" aria-hidden="true">${ICON.empty}</svg><b>${e.status === 401 ? 'Sign in to see your notifications' : 'Could not load notifications'}</b>${e.status === 401 ? '' : 'Check your connection and try again.'}</div>`;
        } finally { if (seq === v.seq) v.loading = false; }
    }
    async function loadMore(v) {
        if (v.loading || !v.hasMore) return;
        const seq = v.seq; v.loading = true;
        const more = v.root.querySelector('.openvibe-nv-more'); if (more) more.innerHTML = '<span class="spinner"></span>';
        try {
            const data = await fetchPage(v, v.offset);
            if (seq !== v.seq) return;
            const fresh = (data.notifications || []).filter(n => !v.ids.has(String(n.id)));
            fresh.forEach(n => v.ids.add(String(n.id)));
            v.items = v.items.concat(fresh); v.hasMore = !!data.has_more; v.offset += (data.notifications || []).length; v.total = data.total ?? v.total;
            // Re-render only the tail to keep the scroll position.
            const old = v.root.querySelector('.openvibe-nv-more'); if (old) old.remove();
            if (fresh.length) { const tail = { ...v, items: fresh }; renderItems(tail, { append: true }); v.lastDay = tail.lastDay; }
            else if (v.hasMore) { const list = v.root.querySelector('[data-role="list"]'); list.insertAdjacentHTML('beforeend', '<div class="openvibe-nv-more"><button type="button" data-act="more">Load more</button></div>'); list.querySelector('[data-act="more"]').addEventListener('click', () => loadMore(v)); }
            const st = v.root.querySelector('[data-role="status"]');
            if (st) st.textContent = v.total != null ? `${v.items.length} of ${v.total}${v.unread ? ' unread' : ''}` : '';
        } catch { /* keep what we have */ }
        finally { v.loading = false; }
    }
    function applyReadLocally(v, ids, all) {
        const set = new Set((ids || []).map(String));
        for (const n of v.items) if (all || set.has(String(n.id))) n.is_read = 1;
        v.root.querySelectorAll('.openvibe-notif-item.unread').forEach(el => {
            const elIds = (el.dataset.ids || el.dataset.id || '').split(',');
            if (all || elIds.some(x => set.has(x))) { el.classList.remove('unread'); el.querySelector('.unread-dot')?.remove(); el.querySelector('[data-row="read"]')?.remove(); }
        });
    }

    // The counts on the tabs (Network GET /api/notifications/unread-by-tab, 4.30.0): read when a list loads, after a read
    // or a clear, and when the badge changes with a list showing; a Network without the route shows none.
    let _tabCounts = null, _tabAt = 0;
    function loadTabCounts(force) {
        if (!hasSession() || !_views.size) return;
        if (!force && Date.now() - _tabAt < 4000) return;
        _tabAt = Date.now();
        apiJson('/api/notifications/unread-by-tab').then((d) => { _tabCounts = (d && d.tabs) || null; paintTabCounts(); }).catch(() => { _tabCounts = null; paintTabCounts(); });
    }
    function paintTabCounts() {
        for (const v of _views.values()) {
            for (const [id, label] of TABS) {
                const el = v.root.querySelector(`[data-n="${id}"]`);
                if (!el) continue;
                const n = id === 'all' || !_tabCounts ? 0 : Math.max(0, Number(_tabCounts[id]) || 0);
                el.textContent = n ? (n > 99 ? '99+' : String(n)) : '';
                el.parentNode.setAttribute('aria-label', n ? `${label}, ${n} unread` : label);
            }
        }
    }
    function listShowing() { return [..._views.values()].some((v) => v.mode !== 'panel' || (_panelEl && _panelEl.classList.contains('open'))); }

    // ── Mutations ───────────────────────────────────────────
    async function markRead(ids) {
        ids = (ids || []).map(String).filter(Boolean);
        if (!ids.length) return;
        for (const v of _views.values()) applyReadLocally(v, ids, false);
        broadcast({ type: 'read', ids });
        try {
            const data = ids.length === 1
                ? await apiJson(`/api/notifications/${encodeURIComponent(ids[0])}/read`, { method: 'POST' })
                : await apiJson('/api/notifications/read-batch', { method: 'POST', body: { ids } });
            if (data && typeof data.unread === 'number') setBadge(data.unread, { quiet: true }), broadcast({ type: 'unread', count: data.unread });
            else pollUnread();
        } catch { pollUnread(); }
        loadTabCounts(true);
    }
    async function markAllRead() {
        for (const v of _views.values()) applyReadLocally(v, [], true);
        setBadge(0);
        if (_tabCounts) { _tabCounts = Object.fromEntries(Object.keys(_tabCounts).map((k) => [k, 0])); paintTabCounts(); }
        broadcast({ type: 'read', all: true });
        try { await apiJson('/api/notifications/read-all', { method: 'POST', body: {} }); } catch { pollUnread(); }
        loadTabCounts(true);
    }
    async function dismiss(v, id) {
        const n = v.items.find(x => String(x.id) === String(id));
        v.items = v.items.filter(x => String(x.id) !== String(id));
        const row = v.root.querySelector(`.openvibe-notif-item[data-id="${CSS.escape(String(id))}"]`);
        if (row) {
            const rest = (row.dataset.ids || '').split(',').filter(x => x && x !== String(id));
            if (rest.length) { row.dataset.ids = rest.join(','); row.dataset.id = rest[0]; const c = row.querySelector('.title .count'); if (c) { if (rest.length > 1) c.textContent = `×${rest.length}`; else c.remove(); } }
            else row.remove();
        }
        if (v.total != null) v.total = Math.max(0, v.total - 1);
        if (!v.items.length) renderItems(v);
        try {
            await apiJson(`/api/notifications/${encodeURIComponent(id)}/dismiss`, { method: 'POST' });
            if (n && !isRead(n)) { setBadge(Math.max(0, _unreadCount - 1), { quiet: true }); loadTabCounts(true); }
        } catch { /* */ }
    }

    // ── Polling / toasts ────────────────────────────────────
    let _polling = false;
    async function pollUnread() {
        if (_polling || !hasSession()) return;
        _polling = true;
        _lastPoll = Date.now();
        try {
            const data = await apiJson('/api/notifications/unread-count');
            const prev = _unreadCount;
            const count = Number(data.count) || 0;
            setBadge(count);
            if (count > prev && _lastSeenAt) {
                // Something new arrived: fetch what's newer than the last thing we saw.
                const params = new URLSearchParams({ unread_only: '1', limit: '5', since: _lastSeenAt });
                const nd = await apiJson(`/api/notifications?${params}`);
                // Only what is unread and newer than the last thing seen, whatever the server answered.
                const since = _lastSeenAt;
                const fresh = (nd.notifications || []).filter(n => n && !n.is_read && (!since || String(n.created_at || '') > since)).slice().reverse();
                for (const n of fresh) { showToast(n); playSound(n.priority); }
                // Any open list should reflect the new items too.
                for (const v of _views.values()) if (v.mode === 'inbox' || (_panelEl && _panelEl.classList.contains('open'))) reload(v);
            }
            const newest = await newestCreatedAt();
            if (newest) _lastSeenAt = newest;
        } catch { /* offline / signed out — try again next tick */ }
        finally { _polling = false; }
    }
    async function newestCreatedAt() {
        try { const d = await apiJson('/api/notifications/newest'); const c = d.notification && d.notification.created_at; return c ? String(c) : null; } catch { return null; }
    }
    function startPolling() {
        stopPolling();
        if (!hasSession()) return;
        newestCreatedAt().then(c => { _lastSeenAt = c || new Date().toISOString(); pollUnread(); });
        _pollTimer = setInterval(() => { if (!liveOpen() || Date.now() - _lastPoll >= REALTIME_POLL) pollUnread(); }, POLL_INTERVAL);
    }
    function stopPolling() { if (_pollTimer) clearInterval(_pollTimer); _pollTimer = null; }

    // ── Realtime (notification-live.js) ─────────────────────
    function liveOpen() { return !!(_live && _live.state().state === 'open'); }
    /** One re-read for a burst of events (a go-live fan-out, a replay after a reconnect); a gap re-reads open lists too. */
    function soon(all) {
        _soonAll = _soonAll || all;
        if (_soon) return;
        _soon = setTimeout(() => {
            _soon = null;
            if (_polling) { soon(false); return; }   // a poll in flight may predate the event: read again after it
            const lists = _soonAll; _soonAll = false;
            pollUnread();
            if (lists) for (const v of _views.values()) reload(v);
        }, 300);
    }
    function liveSrc() {
        if (_config.liveSrc) return _config.liveSrc;
        const m = /^(https?:\/\/[^?#]*\/)notification-ui\.js(?:[?#]|$)/.exec(SELF_SRC);
        return `${m ? m[1] : 'https://openvibe.network/shared/'}notification-live.js`;
    }
    let _liveLoading = null;
    function loadLive() {
        if (root.OVNotificationLive) return Promise.resolve(root.OVNotificationLive);
        return _liveLoading || (_liveLoading = new Promise((ok) => {
            const sc = document.createElement('script');
            sc.src = liveSrc(); sc.async = true;
            sc.onload = () => ok(root.OVNotificationLive || null);
            sc.onerror = () => { _liveLoading = null; ok(null); };
            document.head.appendChild(sc);
        }));
    }
    function startRealtime() {
        if (!_config.realtime || !hasSession() || typeof root.EventSource !== 'function') return;
        if (_live) { _live.restart(); return; }
        loadLive().then((L) => {
            if (!L || _live || !_config.realtime || !hasSession()) return;
            _live = L.create({
                ticketUrl: `${_config.apiBase}/api/v1/realtime/ticket`,
                token: () => _config.token,
                credentials: isCrossOrigin() ? 'omit' : 'include',
                onNotification: () => soon(false),
                onGap: () => soon(true),
            });
            _live.start();
        });
    }
    function stopRealtime() { if (_live) _live.stop(); }
    document.addEventListener('visibilitychange', () => { if (!document.hidden) pollUnread(); });

    // ── Panel ───────────────────────────────────────────────
    function createPanel() {
        const panel = document.createElement('div');
        panel.className = 'openvibe-notif-panel';
        panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', 'Notifications');
        document.body.appendChild(panel);
        buildView(panel, { mode: 'panel' });
        attachSheetDrag(panel);
        document.addEventListener('click', (e) => {
            if (panel.classList.contains('open') && !panel.contains(e.target) && !(_bellEl && _bellEl.contains(e.target))) closePanel();
        });
        document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && panel.classList.contains('open')) closePanel(); });
        _panelEl = panel;
        return panel;
    }
    function closePanel() {
        if (_panelEl && _panelEl.contains(document.activeElement) && _bellEl) { try { _bellEl.focus({ preventScroll: true }); } catch { /* */ } }
        _panelEl?.classList.remove('open'); _bellEl?.classList.remove('open'); _bellEl?.setAttribute('aria-expanded', 'false');
        if (_panelEl) _panelEl.style.transform = '';
        document.documentElement.classList.remove('ovn-sheet-open');
        syncLayer();
    }
    /** Phones: the sheet's head drags down; past 110 px it closes, short of that it springs back. */
    function attachSheetDrag(panel) {
        const head = panel.querySelector('.openvibe-nv-head');
        if (!head || typeof root.PointerEvent !== 'function') return;
        let y0 = null, dy = 0;
        head.addEventListener('pointerdown', (e) => {
            if (!isPhone() || e.pointerType === 'mouse' || e.target.closest('button, a')) return;
            y0 = e.clientY; dy = 0; panel.style.transition = 'none';
            try { head.setPointerCapture(e.pointerId); } catch { /* */ }
        });
        head.addEventListener('pointermove', (e) => { if (y0 == null) return; dy = Math.max(0, e.clientY - y0); panel.style.transform = `translateY(${dy}px)`; });
        const end = () => {
            if (y0 == null) return;
            y0 = null;
            panel.style.transition = 'transform .2s ease';
            if (dy > 110) closePanel(); else panel.style.transform = '';
            setTimeout(() => { panel.style.transition = ''; }, 220);
        };
        head.addEventListener('pointerup', end);
        head.addEventListener('pointercancel', end);
    }
    function togglePanel() {
        if (!_panelEl) createPanel();
        const opening = !_panelEl.classList.contains('open');
        if (opening && window.OpenVibePanels && !_panelEl.__registered) { _panelEl.__registered = true; window.OpenVibePanels.register({ el: _panelEl, openClass: 'open', id: 'notifications', close: () => { if (_panelEl.classList.contains('open')) togglePanel(); } }); window.OpenVibePanels.closeAll(_panelEl); }
        if (opening) {
            // Sit directly under the site's navbar, whatever its height (sticky bars, banners, safe areas).
            const bar = _bellEl && _bellEl.closest('nav, header, .navbar');
            const bottom = bar ? bar.getBoundingClientRect().bottom : (_bellEl ? _bellEl.getBoundingClientRect().bottom : 56);
            _panelEl.style.setProperty('--ovn-top', Math.max(8, Math.round(bottom) + 6) + 'px');
            if (!_panelEl.__esc) { _panelEl.__esc = (e) => { if (e.key === 'Escape' && _panelEl.classList.contains('open')) togglePanel(); }; document.addEventListener('keydown', _panelEl.__esc); }
        }
        if (!opening) { closePanel(); return; }
        _panelEl.classList.add('open');
        _bellEl?.classList.add('open');
        _bellEl?.setAttribute('aria-expanded', 'true');
        document.documentElement.classList.toggle('ovn-sheet-open', isPhone());
        syncLayer();
        reload(_views.get(_panelEl)); refreshPushButton(_views.get(_panelEl)); pollUnread();
        // Focus the chosen tab, so the keyboard starts in the panel (Escape and the bell bring it back).
        setTimeout(() => { try { _panelEl.querySelector('[role="tab"][aria-selected="true"]')?.focus({ preventScroll: true }); } catch { /* */ } }, 0);
    }

    // ── Web Push ────────────────────────────────────────────
    function pushSupported() { return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window && window.isSecureContext; }
    function urlBase64ToUint8Array(b64) {
        const padding = '='.repeat((4 - (b64.length % 4)) % 4);
        const base64 = (b64 + padding).replace(/-/g, '+').replace(/_/g, '/');
        const raw = window.atob(base64); const out = new Uint8Array(raw.length);
        for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
        return out;
    }
    async function currentSubscription() {
        if (!pushSupported()) return null;
        try { const reg = await navigator.serviceWorker.getRegistration(_config.swPath); return reg ? await reg.pushManager.getSubscription() : null; } catch { return null; }
    }
    async function pushStatus() {
        const supported = pushSupported();
        const sub = supported ? await currentSubscription() : null;
        return { supported, permission: supported ? Notification.permission : 'unsupported', subscribed: !!sub };
    }
    async function enablePush() {
        if (!pushSupported()) throw new Error('This browser does not support push notifications');
        if (!hasSession()) throw new Error('Sign in first');
        const perm = await Notification.requestPermission();
        if (perm !== 'granted') throw new Error(perm === 'denied' ? 'Notifications are blocked for this site in your browser settings' : 'Permission not granted');
        const reg = await navigator.serviceWorker.register(_config.swPath, { scope: '/' });
        await navigator.serviceWorker.ready;
        const { publicKey } = await apiJson('/api/push/vapid-key');
        if (!publicKey) throw new Error('Push is not configured on the server');
        let sub = await reg.pushManager.getSubscription();
        if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) });
        await apiJson('/api/push/subscribe', { method: 'POST', body: { subscription: { ...sub.toJSON(), userAgent: navigator.userAgent.slice(0, 200) } } });
        try { localStorage.setItem('ov_push_enabled', '1'); } catch { /* */ }
        return true;
    }
    async function disablePush() {
        const sub = await currentSubscription();
        if (sub) {
            try { await apiJson('/api/push/unsubscribe', { method: 'POST', body: { endpoint: sub.endpoint } }); } catch { /* */ }
            try { await sub.unsubscribe(); } catch { /* */ }
        }
        try { localStorage.removeItem('ov_push_enabled'); } catch { /* */ }
        return true;
    }
    async function refreshPushButton(v) {
        const btn = v && v.root.querySelector('[data-act="push"]');
        if (!btn) return;
        const st = await pushStatus();
        if (!st.supported) { btn.style.display = 'none'; return; }
        btn.style.display = '';
        btn.classList.toggle('on', st.subscribed);
        btn.innerHTML = st.subscribed ? `${svg(ICON.bellOn)}<span>Push on</span>` : `${svg(ICON.bellOff)}<span>Enable push</span>`;
        btn.title = st.subscribed ? 'Push alerts are on for this device: select to turn off' : (st.permission === 'denied' ? 'Notifications are blocked in your browser settings' : 'Get alerts on this device even when the site is closed');
        btn.disabled = st.permission === 'denied' && !st.subscribed;
    }
    async function togglePush(v) {
        const note = v.root.querySelector('[data-role="note"]');
        const say = (msg, ms = 4000) => { if (!note) return; note.textContent = msg; note.style.display = ''; clearTimeout(note._t); note._t = setTimeout(() => { note.style.display = 'none'; }, ms); };
        try {
            const st = await pushStatus();
            if (st.subscribed) { await disablePush(); say('Push alerts are off for this device.'); }
            else { await enablePush(); say('Push alerts are on: you\'ll get them here even when this site is closed.'); }
        } catch (e) { say(e.message || 'Could not change push setting', 6000); }
        for (const view of _views.values()) refreshPushButton(view);
    }

    // ── Public API ──────────────────────────────────────────
    const OpenVibeNotifications = {
        init(opts = {}) {
            Object.assign(_config, opts);
            _quietAt = 0; loadQuiet();   // quiet hours before the first notice can arrive
            injectStyles();
            if (opts.preferences) Object.assign(_preferences, opts.preferences);
            channel();
            startPolling();
            startRealtime();
            // If the user enabled push on this device before, make sure the worker is registered.
            try { if (pushSupported() && localStorage.getItem('ov_push_enabled') === '1') navigator.serviceWorker.register(_config.swPath, { scope: '/' }).catch(() => {}); } catch { /* */ }
        },
        destroy() {
            stopPolling();
            stopRealtime();
            _toastContainer?.remove(); _panelEl?.remove();
            _toastContainer = null; if (_panelEl) _views.delete(_panelEl); _panelEl = null; _queue.length = 0;
        },
        /** Create and inject the bell icon. Returns the DOM element. */
        createBell(container) {
            injectStyles();
            const bell = createBellEl();
            if (container && _config.actions !== false && !container.querySelector('.openvibe-actions-btn')) container.appendChild(createActionsEl());
            if (container) container.appendChild(bell);
            pollUnread();
            return bell;
        },
        /** Open the Action Center (the ✦) from a site's own control. */
        openActions(anchor) { injectStyles(); openActions(anchor || null); },
        /** Full-page inbox (same list, filters, search, infinite scroll) rendered into a container. */
        renderInbox(container, opts = {}) {
            injectStyles();
            if (!container) return null;
            container.classList.add('openvibe-notif-inbox');
            const v = buildView(container, { mode: 'inbox' });
            if (opts.tab) { v.tab = opts.tab; container.querySelectorAll('[data-tab]').forEach(b => { b.classList.toggle('active', b.dataset.tab === opts.tab); b.setAttribute('aria-selected', String(b.dataset.tab === opts.tab)); }); }
            reload(v);
            return v;
        },
        /** The Dock's Activity tab: the bell's list in the Dock's container (no frame, no title, no close). */
        renderDock(container) {
            injectStyles();
            if (!container) return null;
            container.classList.add('openvibe-notif-dock');
            const v = buildView(container, { mode: 'dock' });
            reload(v);
            return v;
        },
        /** Programmatically show a toast (real-time events). Marks nothing on the server. */
        push(notification) {
            showToast(notification);
            playSound(notification.priority);
            if (!notification.id) return;
            setBadge(_unreadCount + 1);
        },
        /** Re-fetch the badge and any open lists (call after an in-page action). */
        refresh() { pollUnread(); for (const v of _views.values()) reload(v); },
        markRead(ids) { return markRead(Array.isArray(ids) ? ids : [ids]); },
        markAllRead,
        setPreferences(prefs) { Object.assign(_preferences, prefs); },
        setToken(token) {
            _config.token = token;
            if (token || !isCrossOrigin()) { startPolling(); startRealtime(); } else { stopPolling(); stopRealtime(); setBadge(0, { quiet: true }); }
        },
        /** The realtime feed's state ({ state: 'off' | 'ticket' | 'connecting' | 'open' | 'backoff' | 'hidden' | 'blocked' | 'failed' | 'signed-out' | 'unavailable', … }), or null when off. */
        realtimeState() { return _live ? _live.state() : null; },
        /** How a notification reads (title, message, chips, tone, glyph, group key): the same for toasts and the list. */
        present,
        togglePanel, closePanel,
        enablePush, disablePush, pushStatus,
        get unreadCount() { return _unreadCount; },
    };

    if (typeof module !== 'undefined' && module.exports) module.exports = OpenVibeNotifications;
    else root.OpenVibeNotifications = OpenVibeNotifications;

})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this);
