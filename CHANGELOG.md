# Changelog

The OpenVibe Companion's releases. Each one is a `browser/manifest.json` version and a [GitHub
release](https://github.com/OpenVibers/OpenVibe.Extensions/releases); older entries are in the git
history.

## 0.9.0 — 2026-11-07

- **The side panel's Dock is the current released one.** `browser/shared/` moves from OpenVibe.Shared
  4.57.0 to 4.124.0: the Vibe tab, the timer, the realtime notification feed and the Agents tab's
  **agent view** — the person's desk stream, the task line and worked time, and the owner's
  **Pause/Resume**, **Curtain now**, **Mute/Unmute** and **End** controls. The new files are
  `dock-vibe.js`, `dock-agent.js`, `dock-timer.js` and `notification-live.js`; `dock.js`,
  `action-center.js`, `notification-ui.js`, `ov-mark.js` and `kit.css` are updated in place.
- **Manifest:** one host permission, `https://openvibe.codes/*`, for the agent view's API and its
  still. The CSP now allows that origin in `connect-src`, `frame-src https://openvibe.live` for the
  embed, `img-src 'self' blob:` for the still, and `style-src 'self' 'unsafe-inline'` because the
  Dock draws its own styles in a `<style>` element (scripts stay `'self'` only).
- `panel.js` passes OpenVibe.Codes' origin (`agentBase`) to the Dock; `lib/config.js` names it.
- `scripts/check-panel.js` and `test/panel.test.js` load the unpacked extension in headless Chrome
  and check the Agents tab draws the agent view with its four controls, its styles and no CSP
  refusal.
- Known, pending outside this repository: OpenVibe.Codes' session check refuses the Dock's
  `<network>/dock`-issued OAuth token, and OpenVibe.Live's `frame-ancestors` does not list an
  extension origin, so the live view stays hidden in production until one of them accepts it.

## 0.8.1 — 2026-11-06

- The side panel opens on the page's Dock state and follows it: `dock.open({ doc })` gets the tab,
  chat, agent and unread counts the page had, and the panel re-reads them every 30 s and when it
  comes back.

## 0.8.0 — 2026-11-06

- One-click Dock sign-in: the Network's OAuth public client `companion` (PKCE S256, no secret),
  read-only scopes `dock`, `activity` and `chat.read`; the access token in `storage.session`, the
  rotating refresh token in `storage.local`, and Sign out revokes the family. The 0.7.0 pasted
  token remains a fallback.

## 0.7.0 — 2026-10-30

- The OpenVibe Dock in the side panel (Chrome `side_panel`, Firefox `sidebar_action`) on every site:
  the released OpenVibe.Shared Dock (4.54.0, then 4.57.0), bundled because the CSP allows no remote
  script, reading and writing the same Network state as the Dock on a site.
