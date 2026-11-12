# Changelog

The OpenVibe Companion's releases. Each one is a `browser/manifest.json` version and a [GitHub
release](https://github.com/OpenVibers/OpenVibe.Extensions/releases); older entries are in the git
history.

## 0.9.2 — 2026-11-11

- **The side panel's Dock is OpenVibe.Shared 4.212.0** (was 4.124.0), copied from the release with the
  Companion's own two patches kept: the read-only Dock token renders the four server controls as links
  to openvibe.codes, and a Live frame that refuses embedding falls back to the still and a **Watch on
  openvibe.live** link (Firefox and an unlisted Chrome id never try the frame).
- The newer Dock brings its **Code** and **Actor** tabs, the one window (`ov-window.js`), the composer,
  the glyph set, the theme loader and the agent sheet/session, all bundled under `browser/shared/`
  because the extension's CSP allows no remote script.
- `AGENT_EMBED_EXTENSION_ORIGINS` on OpenVibe.Live is set to the extension's fixed Chrome id
  (`chrome-extension://bjcjcfcecpkkmfndegkjekoipdmbgakd`), so the panel can frame the agent stream.

## 0.9.1 — 2026-11-07

- **The side panel's agent view can read.** OpenVibe.Codes' two agent-view read routes now accept
  the Companion's Dock token (Network's private `<network>/dock` issuer and keys, the new
  `agent.view` scope only); the panel's four controls stay read-only and open openvibe.codes.
  OpenVibe.Live's embed lists an extension origin when the owner sets
  `AGENT_EMBED_EXTENSION_ORIGINS`.
- When Live's frame is refused (Firefox, whose extension id changes per install, or Chrome before the
  owner sets the id), the panel shows the still and a plain **Watch on openvibe.live** link instead of
  an empty frame. A rendered embed announces itself (`postMessage`, carrying nothing), so a refused
  frame is told apart from a loaded one.
- The OAuth grant asks for `agent.view` alongside `dock`, `activity` and `chat.read`.

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
