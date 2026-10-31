# Store privacy answers: OpenVibe Companion

Written from the code at this commit (`browser/`), not from intentions. If the code changes what it
reads, sends or stores, change this file, the README's "What it can see" table and
`browser_specific_settings.gecko.data_collection_permissions` together.

## Single purpose (Chrome Web Store)

> Help with the page in the active tab, only when the person opens the Companion: coupon codes for the shop they are on (looked up on OpenVibe Coupons by hostname and tried in the page's coupon box on request), and one-press hand-offs of that page to OpenVibe services (Rent, Watch, Food, Reviews) in a tab the person sees.

## Permission justifications (Chrome Web Store)

| Permission | Justification |
|---|---|
| `activeTab` | When the person opens the popup, it reads the active tab's address and title, to look up coupon codes for that site by its hostname and to fill the hand-off buttons. No access to any tab before that click, and none to other tabs. |
| `scripting` | Four buttons inject a script packaged in the extension into the active tab's top frame, only after the press: "Try these codes on this page" runs `lib/autoapply.js` (finds the coupon box, types each code, reads whether the order total changed), "Save its rating to OpenVibe Reviews" runs `lib/rating.js` (reads the rating the page states), and "Keep on my Rent board" and "Check the rent" run `lib/listing.js` (reads the price, city and bedrooms a listing states). None makes a request or reads cookies or storage. |
| `storage` | Keeps the optional `cpx_` install token, and the Dock's sign-in: the OAuth access token in `storage.session` (memory) and the rotating refresh token in `storage.local` (never synced). A pasted 0.7.0 `networkToken` is kept only as that fallback. |
| `identity` | Starts the Dock's one-click sign-in (`launchWebAuthFlow`) at openvibe.network; the code returns to the browser's own extension redirect URL. No password is read by the extension. |
| Host permission `https://openvibe.coupons/*` | The one API the extension calls: look up a merchant by hostname, list its codes, and report whether a code worked. |
| Remote code | **No.** All JavaScript is in the package; the CSP is `script-src 'self'` with no `eval`. |

## Data usage (Chrome Web Store "Privacy practices" tab)

Tick these data types, because each leaves the device in some case:

| Type | Ticked | What, when, where |
|---|---|---|
| Web history | **Yes** | The active tab's **hostname** goes to openvibe.coupons when the popup opens on a site. On a hand-off press, the page's address (credentials, fragment and tracking parameters removed) and title go to openvibe.rent, openvibe.watch, openvibe.food or openvibe.reviews in the address of a tab the person sees. |
| Website content | **Yes** | On "Save its rating to OpenVibe Reviews": the business name, rating, scale, count of ratings and city the page states, in the address of the openvibe.reviews tab. On "Compare delivery apps": the restaurant or store name taken from the page title, to openvibe.food. On "Keep on my Rent board" and "Check the rent": the price, its currency, the city and region (never the street) and the bedrooms the listing states, in the address of the openvibe.rent tab. |
| Authentication information | **Yes** | Only if the person connects the extension: the `cpx_` install token they pasted is sent to openvibe.coupons as `Authorization: Bearer` on its API calls. The Dock's one-click sign-in sends an OAuth access token to openvibe.network and openvibe.chat as `Authorization: Bearer` (scopes `dock`, `activity`, `chat.read`) and keeps a refresh token on this device. |
| User activity | No | No clicks, keystrokes or scrolls are recorded. A report sends a code id, `worked`/`failed` and an optional reason the person chose, which is the person's own feedback. |
| Financial and payment information | No | `lib/autoapply.js` reads the order total in the page to tell which codes lowered it; the total stays in the popup and is never sent. |
| Personally identifiable information, health, personal communications, location | No | Not read. (The city sent with a rating is the business's, and with a listing the home's, from the page; never the person's.) |

Certify all three: the data is not sold to third parties; it is not used or transferred for
purposes unrelated to the single purpose; it is not used or transferred to determine
creditworthiness or for lending.

**Privacy policy URL:** https://openvibe.coupons/companion (owner: confirm the page carries the
"what it reads and sends" text above, or link the OpenVibe privacy page that does).

## Firefox (AMO)

`browser_specific_settings.gecko.data_collection_permissions.required` declares, for the same
reasons as the table above: `authenticationInfo`, `browsingActivity`, `websiteContent`. AMO shows
these to the person at install. Nothing is optional, because nothing is collected that the person
didn't press for, and the token is the person's own choice on the settings page.

In Firefox, MV3 host permissions can be withheld at install; the settings page then shows "Allow
access to openvibe.coupons".
