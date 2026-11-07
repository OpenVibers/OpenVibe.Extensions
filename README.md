# OpenVibe.Extensions

> OpenVibe's first-party client surfaces: today, the **OpenVibe Companion** browser extension.

**Status:** alpha (roadmap Wave 18, client part). The extension builds, its tests pass, and headless
Chrome loads the unpacked 0.9.0 build with no console or CSP errors (2026-11-07, Chrome 156 via
CDP `Extensions.loadUnpacked`; the side panel's Agents tab draws the Dock's agent view against stubbed first parties, see the credential note below). A development build of
the coupon part looked up codes and sent a report against a local OpenVibe.Coupons. Mozilla's
`web-ext lint` (what addons.mozilla.org runs on upload) passes with no errors, warnings or notices
and runs in CI; it hasn't been loaded in a running Firefox yet. It is **not published** to any
store yet: the store zips, listing text and privacy answers are ready (`npm run pack:stores`,
[store/](store/)), and only the owner's developer-account step is left. OpenVibe.Coupons is
public at `https://openvibe.coupons` since 2026-10-09, so the release build talks to the live
Coupons API. On 2026-10-22 Coupons held 169 codes for 16 of its 37 merchants, all from the DealNews feed through
OpenVibe.Sources; it had issued no install token and received no code report.
**Decision record:** [ADR-023](https://github.com/OpenVibers/OpenVibe.Contracts/blob/main/docs/adr/ADR-023-client-surfaces.md) (first-party client surfaces and their home). Roadmap §4.2 D.
**License:** MIT.

## Purpose

Client code ships on a different schedule from servers: store review, browser updates and
per-install permissions. ADR-023 gives clients their own repository.

| Surface | Directory | State |
|---|---|---|
| OpenVibe Companion (Chromium and Firefox, Manifest V3) | `browser/` | alpha, described below (it was the OpenVibe Coupons Helper until 0.2.0) |
| Kiosk companion (Firefox, new-tab and history bridge for the /kiosk page) | `kiosk-companion/` | Moved from OpenVibe.Live `browser-extension/openvibe-kiosk-companion/` (ADR-023, Live 9c5aa64); Live keeps a redirect README |
| Hardware / Raspberry Pi companions (streamer and controller scripts) | `hardware/` | Moved from OpenVibe.Live `hardware/` (ADR-023, Live 9c5aa64); Live keeps a redirect README |
| Desktop client | — | Planned by ADR-023 for the long term. Nothing exists. |

## The OpenVibe Companion (`browser/`)

One button in the browser for the OpenVibe sites that work with the page you are on:

- **Keep on my Rent board.** On a rental listing (Craigslist, Facebook Marketplace, Zillow,
  Apartments.com, Zumper, Airbnb and the rest) or any page, it opens
  [openvibe.rent/board](https://openvibe.rent/board) with the listing's address and title filled in,
  and the price and city the page states (`lib/listing.js` reads them when you press: the structured data
  the site publishes for search engines, else its price tag), so every listing from every site sits in one
  list with your notes and how far you got. You check them there before saving. On a rental site this is
  the main button.
- **Check the rent.** On a rental listing it opens [openvibe.rent/fair](https://openvibe.rent/fair) with the listing's
  address and title, and the monthly rent in dollars, the bedrooms and the city the page states (read the same way;
  a sale price or another currency is left out). Rent reads what is missing from the address and title (and says
  which it read), and compares the rent with the city's median for that size from the Census Bureau.
- **Watch this page.** It opens a new watch on [OpenVibe.Watch](https://openvibe.watch) for the page,
  which tells you (or runs your agent) when it changes.
- **Compare delivery apps.** On DoorDash, Uber Eats, Grubhub, Seamless, Caviar or Instacart it opens
  [openvibe.food/delivery](https://openvibe.food/delivery) with the restaurant or store's name (read from the page
  title, never the address or the cart), and every app's own search for it opens from there.
- **Save its rating to OpenVibe Reviews.** On Glassdoor, Indeed, Yelp, the BBB, Trustpilot, Google Maps or
  Tripadvisor, it reads the rating the page states (the structured data the site publishes for search engines, else
  the stars' own label, like "4.5 star rating") and opens [openvibe.reviews/save](https://openvibe.reviews/save) with
  the page's address, its name and the numbers. You check them against the page there and save; the rating then shows
  beside that site's link on the OpenVibe.Reviews page, with the date. On a review site this is the main button.
- **Try these codes on this page.** At a shop's cart or checkout, one button types the codes OpenVibe.Coupons knows
  into the page's own coupon box, presses that box's Apply button, and reads the order total before and after. It
  stops at the first code that lowers the total and leaves it applied. Codes reported working go first, codes
  reported not working are never tried, and at most ten are tried. It never presses checkout, pay, order, cart or
  remove buttons, never submits a form and never presses Enter. With no Apply button next to the box it presses
  nothing. If you connected the extension, you can send what happened to OpenVibe.Coupons in one click.
- **Coupon codes.** On a shop's website it shows the codes
  [OpenVibe.Coupons](https://github.com/OpenVibers/OpenVibe.Coupons) knows for that shop:

- the code, with a Copy button
- its status (validity unknown, reported working, reported not working)
- its confidence, or "no reports", and its expiry, or "Expiry unknown"
- its restrictions, or "No restrictions stated"
- how to apply it

If you connected the extension, you can report whether a code worked. The codes are shown to copy;
the Companion never rewrites links or adds referral tags.

### What it can see, and what it sends

| | |
|---|---|
| **Permissions** | `activeTab`, `identity`, `scripting`, `storage`, and `sidePanel` in the Chrome build (Firefox's `sidebar_action` needs no permission of its own). The host permissions are four OpenVibe origins: `https://openvibe.coupons/*` (the coupon API), `https://openvibe.network/*` (the Dock's state), `https://openvibe.codes/*` (the Dock's agent view and its four controls) and `https://openvibe.chat/*` (the Dock's Chats tab). `identity` starts the Dock's one-click OAuth sign-in (`chrome.identity.launchWebAuthFlow` / Firefox's `browser.identity`). `scripting` is used for four buttons: "Try these codes on this page" injects the packaged `lib/autoapply.js`, "Save its rating to OpenVibe Reviews" injects `lib/rating.js`, and "Keep on my Rent board" and "Check the rent" inject `lib/listing.js`, into the active tab (the access `activeTab` gives after you press the button), in its top frame and the extension's isolated world. |
| **Not requested** | `<all_urls>`, `tabs`, `cookies`, `webRequest`, `history`, optional permissions, content scripts, a background worker, web-accessible resources, `externally_connectable`. |
| **Read from the page** | The active tab's **URL and title**, when you open the popup (that's what `activeTab` grants). The page's content only when you press "Try these codes on this page": `lib/autoapply.js` finds the coupon box, its Apply button and the order total, types the codes in, and returns to the popup which codes changed the total. It makes no request, reads no cookies or storage, and sends nothing anywhere; `test/manifest.test.js` scans it for that. On a review site, "Save its rating to OpenVibe Reviews" runs `lib/rating.js`, which only reads: the page's name, its rating, the scale, how many ratings, and the city from its structured data. "Keep on my Rent board" and "Check the rent" run `lib/listing.js`, which only reads: the price and its currency, the city and region (never the street) and the bedrooms, from the structured data, else the page's price tag. Browser pages, files, IP addresses and local names are "not a site", and nothing is sent or offered for them. |
| **Sent by the extension** | The Coupons part sends to `https://openvibe.coupons` only, and only the **hostname** (`lib/host.js` drops the path, query, fragment, port and credentials first): `GET /api/v1/merchants/resolve?host=`, the merchant id (`GET /api/v1/merchants/:id/coupons`), and, when you report, the code id plus `worked` or `failed` with an optional reason. Every request goes with `credentials: 'omit'` (no cookies), `referrerPolicy: 'no-referrer'` and `redirect: 'error'`. The Dock sends the person's own bearer to `https://openvibe.network` (its state, `/api/v1/me/dock`), `https://openvibe.chat` (Chats), and, when the Agents tab needs it, `https://openvibe.codes` (the agent view and its controls). |
| **Hand-offs (only when you press the button)** | "Keep on my Rent board", "Check the rent", "Watch this page", "Compare delivery apps" and "Save its rating to OpenVibe Reviews" open **a new tab you see** on `https://openvibe.rent/board`, `https://openvibe.rent/fair`, `https://openvibe.watch/watches/new`, `https://openvibe.food/delivery` or `https://openvibe.reviews/save`, with the page's address and title (and, for Reviews, the rating read from it; for Rent, the price, city and bedrooms read from it) in that tab's address. `lib/handoff.js` removes the credentials, the fragment and tracking parameters (`utm_*`, `fbclid`, `gclid`, …) first. The extension makes no request for it, nothing opens on its own, and nothing is saved until you save it on that site. `platform.tabs.open()` refuses any other origin, and the permission audit allows only `https://openvibe.<tld>` hand-off origins. |
| **Stored** | The optional `cpx_` install token in `storage.local` (never synced); for the Dock, the one-click OAuth access token in `storage.session` (memory, cleared when the browser closes) and the rotating refresh token in `storage.local` (this device, not synced). A pasted 0.7.0 `networkToken` is still accepted as a fallback until a later release removes it. |
| **CSP** | `default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob:; connect-src https://openvibe.coupons https://openvibe.network https://openvibe.chat https://openvibe.codes; frame-src https://openvibe.live; object-src 'none'; base-uri 'none'`. The Dock draws its own styles in a `<style>` element (styles only; script stays `'self'`), the agent view shows its still from a local `blob:`, and its Live embed is the only frame. There is no inline script, no remote code, no `eval`, and no `innerHTML` in the extension's own code: the popup builds DOM nodes and sets text. |

### The credential: an install token, never a session

The extension works without any credential, with the API's tighter anonymous rate limits. To
report:

1. On [openvibe.coupons/connect-extension](https://openvibe.coupons/connect-extension), sign in and
   create a token for this browser. It is shown once.
2. Paste it into the extension's settings. The extension checks that the API accepts it before
   saving it.

A `cpx_` token has two scopes, `coupons.lookup` and optionally `coupons.report`. It can't submit
codes, moderate, or read anything private, and it isn't an OpenVibe Network session. The extension
refuses to store anything that isn't a `cpx_` token, so a Network JWT can't be pasted in by
mistake. Revoking the token on the site takes effect on its next request, and the popup then says
the browser was disconnected. "Disconnect" in the settings removes the token from the browser.

Because the extension exposes nothing to web pages (no content scripts, no
`externally_connectable`, no web-accessible resources) and holds no first-party credential, a
malicious shop page can't use it to reach anyone's data. The server side of the same guarantee is
covered in Coupons' own tests: lookups are identical for every caller, and the API ignores cookies.

### The Dock in the side panel

The **OpenVibe Dock** — the pill, the card with its Vibe, Agents, Chats and Activity tabs — sits in
the browser's side panel (Chrome's `side_panel`, Firefox's `sidebar_action`), on every site. It is the
released OpenVibe.Shared Dock 4.124.0, bundled under `browser/shared/` because the extension's CSP allows no
remote script, and it reads and writes the same state on the Network as the Dock on a site, so it
opens where the person left off. It hands that state to the Dock as it opens (the page's tab, chat, agent and
unread counts) and re-reads it every 30 s, so a change on the page reaches the open side panel.

The Agents tab draws the person's own desk stream the same way a site's Dock does: the Live embed, the
task line, and the owner's **Pause/Resume**, **Curtain now**, **Mute/Unmute** and **End** controls. The
view is read with the person's token from OpenVibe.Codes (`GET /api/v1/me/agent-view`); the extension
allows Codes and Live's embed for exactly that. Codes' normal session check does not yet accept the
Dock's read-only OAuth token (issuer `<network>/dock`), so a production side panel keeps the view
hidden until Codes or the Network accepts that credential; `scripts/check-panel.js` proves the bundled
Dock itself draws it. Live's embed also allows first-party site origins, not an extension origin yet.

It needs the person's own OpenVibe sign-in. Press **Sign in** in the panel or the settings page: the
Network's account chooser opens, the extension is a public OAuth client (`companion`, PKCE S256, no
secret), and the Dock gets a read-only token (`dock`, `activity`, `chat.read`) that refreshes itself.
The access token is kept in `storage.session`; the rotating refresh token in `storage.local`, on this
device. Sign out revokes it at the Network, and the account page (`/my`) lists it under **Signed-in
apps**. The 0.7.0 pasted-token path is still in the settings page as a fallback until a later release
removes it.

### Layout

```
browser/
  manifest.json          MV3; Chromium (minimum_chrome_version 114) and Firefox (gecko id, strict_min_version 128)
  panel.html / panel.js  the Dock in the side panel: the Network's state, the same tabs as the Dock on a site
  panel.css             the Dock fills the panel (no floating card, no pill)
  shared/               the released OpenVibe.Shared Dock 4.124.0, bundled: the CSP allows no remote script
                        (dock.js, dock-vibe.js, dock-agent.js, dock-timer.js, action-center.js,
                        notification-ui.js, notification-live.js, ov-mark.js, kit.css)
  popup.html / popup.js  DOM wiring only
  options.html / .js     connect (save a checked token), disconnect, grant the API host permission
  lib/config.js          API_ORIGIN (Coupons), NETWORK_ORIGIN and CHAT_ORIGIN (the Dock), CODES_ORIGIN (its agent view); HANDOFF_ORIGINS (Rent, Watch, Food, Reviews)
  lib/host.js            URL → hostname (everything else dropped)
  lib/handoff.js         the Rent board, Watch, Food delivery and Reviews addresses, built from a cleaned URL; which sites are rentals and review sites
  lib/autoapply.js       "Try these codes on this page": injected into the active tab only when you press it
  lib/rating.js          "Save its rating to OpenVibe Reviews": reads a review site's rating, injected only when you press it
  lib/listing.js         "Keep on my Rent board" / "Check the rent": reads a listing's price, city and bedrooms, injected only when you press
  lib/api.js             the only code that makes requests to the Coupons API
  lib/network-api.js     the Dock's state on the Network (GET/PUT /api/v1/me/dock), with the person's own token
  lib/auth.js            the Dock's one-click OAuth sign-in: PKCE, state, refresh, sign-out
  lib/controller.js      popup logic without the DOM (tested in Node)
  lib/platform.js        chrome.* / browser.*: tabs.query, tabs.create (hand-off pages only), storage.local, permissions
  lib/format.js          wording ("Expiry unknown", "No restrictions stated", …)
  icons/                 generated by scripts/icons.js
scripts/
  audit.js               the permission audit (manifest, CSP, pages)
  pack.js                zip for loading, or --stores: the Chrome and Firefox store zips (runs the audit first)
  check-autoapply.js     lib/autoapply.js on test/fixtures/checkout-*.html in headless Chrome (CDP, no dependencies)
  check-panel.js         the unpacked extension in headless Chrome: the panel's Agents tab draws the agent view (CDP, no dependencies)
  icons.js               draws the icons (no dependencies)
```

## Tests (Node 22, no browser, no dependencies)

```bash
npm test
```

| Requirement | Test |
|---|---|
| The manifest permission audit fails if anything widens: extra permissions, `<all_urls>` or broader hosts, content scripts, a background worker, web-accessible resources, `externally_connectable`, optional permissions, `unsafe-eval`, remote script or connect sources, any style source beyond `'unsafe-inline'`, any image beyond `'self' blob:`, any frame beyond Live, MV2. The first-party origins agree across config, host permissions and CSP. Pages have no inline or remote script. The code never uses cookies, scripting, dynamic code, HTML injection or `storage.sync`, and only `lib/api.js`, `lib/network-api.js`, `lib/auth.js` and the bundled Dock fetch. | `test/manifest.test.js` |
| The side panel in a real headless Chrome: the unpacked extension opens `panel.html` on the Agents tab with a stubbed Network/Chat/Codes, and the agent view draws its stream frame, line, meta and Pause/Resume, Curtain now, Mute/Unmute and End, with its styles applied and no CSP refusal. Skipped when no Chrome is installed. | `test/panel.test.js` (`scripts/check-panel.js`) |
| API client against a stub: routes; no `Authorization` without a token; never cookies, referrers or redirects; errors as codes (revoked, scope, 429, 503); timeouts; refused input. | `test/api-client.test.js` |
| The Coupons part never sends page content or URLs beyond the hostname. The popup controller runs on checkout URLs full of personal data, and every request the stub receives is inspected. Non-shop pages send nothing. Only `tabs.query` and `storage.local` are touched, and only `cpx_` tokens are stored there. | `test/privacy.test.js` |
| The hand-offs: nothing opens when the popup opens; a button opens one tab on openvibe.rent or openvibe.watch with the cleaned address (no credentials, fragment or tracking parameters); the Coupons API still gets the hostname only; `tabs.open` refuses other origins; rental sites lead with the board. | `test/handoff.test.js` |
| `scripts/pack.js`: the zip is exactly `browser/`, audited and reproducible. A development build rewrites the origin in all three places. Remote `http` origins are refused. | `test/pack.test.js` |

Beyond the automated tests, the coupon flow was checked by hand on 2026-09-22:

- Headless Chrome 150, loaded through CDP `Extensions.loadUnpacked`, accepted the manifest and
  rendered both pages with no console errors or CSP violations.
- A development build then called a local OpenVibe.Coupons (its test harness) with no CORS
  configured. It resolved a shop, listed its code, and posted a report with a `cpx_` token. The
  report was stored with channel `extension`.

On 2026-11-07 the same CDP load ran the side panel in headless Chrome 156 (now `test/panel.test.js`
and `scripts/check-panel.js`): with a stubbed Network, Chat and Codes, `panel.html` opened on the
Agents tab, drew the agent view's Live frame, task line and `Paused by @ada` meta, and showed
Pause/Resume, Curtain now, Mute/Unmute and End, with the Dock's styles applied and no CSP refusal.
The 2026-09-22 coupon flow is not in CI; the panel check is, and it skips when no Chrome is installed.
Firefox hasn't been tried.

## Packing (never published from here)

```bash
npm run pack                        # dist/openvibe-companion-<version>.zip  (API https://openvibe.coupons)
npm run pack:stores                 # dist/openvibe-companion-<version>-chrome.zip and -firefox.zip (store uploads)
npm run lint:firefox                # Mozilla web-ext lint, warnings as errors (CI runs it)
node scripts/pack.js --api http://localhost:4850   # dist/…-dev.zip for a local Coupons (localhost/127.0.0.1 or https only)
```

Each version's zip is attached to its [GitHub release](https://github.com/OpenVibers/OpenVibe.Extensions/releases/latest).
To load it:

- **Chromium:** `chrome://extensions`, turn on Developer mode, choose "Load unpacked" and pick the
  unzipped folder.
- **Firefox:** `about:debugging`, "This Firefox", "Load Temporary Add-on", and pick
  `manifest.json`.

In Firefox, host permissions for MV3 extensions can be withheld. If they are, the settings page
shows "Allow access to openvibe.coupons".

## Before a store release (for the lead)

1. **OpenVibe.Coupons is already public** (see its README; live at `https://openvibe.coupons` since
   2026-10-09). The release build talks to `https://openvibe.coupons` for codes and to
   `https://openvibe.network`, `https://openvibe.chat` and `https://openvibe.codes` for the Dock,
   each named in the manifest and the CSP and nothing else.
2. **Store listings:** `npm run pack:stores` builds `dist/openvibe-companion-<version>-chrome.zip`
   (no `browser_specific_settings`) and `-firefox.zip` (no `minimum_chrome_version`), byte for byte
   reproducible. Upload them with the fields in [store/listing.md](store/listing.md), the single
   purpose, permission justifications and data disclosures in [store/privacy.md](store/privacy.md)
   (written from the code; `browser_specific_settings.gecko.data_collection_permissions` declares
   `authenticationInfo`, `browsingActivity` and `websiteContent` to match), and the shots in
   [store/screenshots.md](store/screenshots.md). Never upload from CI.
3. **CORS (optional):** set `COUPONS_EXTENSION_ORIGINS` on Coupons to the Chrome Web Store id
   (`chrome-extension://<id>`) and, if wanted, `moz-extension://*`. The extension doesn't need it,
   because its host permission covers the API. CORS only helps when a browser withholds that
   permission, and only for lookups.
4. **Version:** bump `browser/manifest.json` for every store upload. Stores refuse a version
   they've already seen.

## Depends on

- [OpenVibe.Rent](https://github.com/OpenVibers/OpenVibe.Rent) `/board?url=&title=` and
  [OpenVibe.Watch](https://github.com/OpenVibers/OpenVibe.Watch) `/watches/new?template=page&url=&name=`
  (pages, not APIs: the person signs in there as usual).
- [OpenVibe.Coupons](https://github.com/OpenVibers/OpenVibe.Coupons) public API:
  - `GET /api/v1/merchants/resolve?host=`
  - `GET /api/v1/merchants/:id/coupons`
  - `POST /api/v1/coupons/:id/report`
  - `cpx_` install tokens from `/connect-extension`
- [OpenVibe.Codes](https://github.com/OpenVibers/OpenVibe.Codes) `/api/v1/me/agent-view` (the
  Dock's agent view: the state, the still, and the pause, curtain, mute and end controls). Its
  session check does not accept the Dock's `<network>/dock`-issued OAuth token yet, so the view is
  bundled and verified against a stub but stays hidden in production until Codes or Network accepts
  that credential.
- [OpenVibe.Live](https://github.com/OpenVibers/OpenVibe.Live) `/embed/agent/<ags_id>?vt=…`, the
  agent view's frame. Its `frame-ancestors` list is first-party site origins; an extension origin is
  not on it yet.
- No npm dependencies. Tests and scripts use Node's standard library.

---

Part of the [OpenVibe network](https://openvibe.network). Built in the open by [OpenVibers](https://github.com/OpenVibers).
