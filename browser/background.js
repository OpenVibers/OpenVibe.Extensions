/*
 * The Companion's background worker: the one place that answers the page.
 *
 * The button the page draws (browser/lib/mask-fill.js) asks this worker two things: may a mask be
 * offered here, and which address should this field get. The worker holds the person's sign-in, talks
 * to OpenVibe.Mail and never puts the token into the page: the page is told an address and the words
 * that go with it, nothing else.
 *
 * The message boundary lives in lib/mask-router.js (so it can be tested on its own): a page may ask
 * only for an offer and for an address, and the site is taken from the tab's own address, never from
 * the page's word. An address only ever comes after a real click on the button: the page script checks
 * that itself, and a script on the page cannot forge a click.
 */
import './lib/config.js';
import './lib/platform.js';
import './lib/auth.js';
import './lib/mask.js';
import './lib/mask-service.js';
import './lib/mail-api.js';
import './lib/mask-router.js';

const ext = self.browser || self.chrome;
const config = self.OVConfig;
const platform = self.OVPlatform.createPlatform(ext, config);
const auth = self.OVAuth.createAuth({ platform: platform, config: config, fetch: self.fetch.bind(self) });
const mail = self.OVMail.createMailClient({
    origin: config.MAIL_ORIGIN,
    fetch: self.fetch.bind(self),
    getToken: function () { return auth.accessToken(); },
    timeoutMs: config.TIMEOUT_MS,
});
const service = self.OVMaskService.createMaskService({
    rules: self.OVMask,
    auth: auth,
    mail: mail,
    storage: platform.storage,
    scope: config.MAIL_SCOPE,
    muteKey: config.MASK_MUTE_KEY,
});

/** One of our own pages (the popup), not a page of the web. */
function isOwnPage(sender) {
    if (!sender || !ext.runtime || !ext.runtime.id) return false;
    if (sender.id && sender.id !== ext.runtime.id) return false;
    const url = String(sender.url || '');
    return url.indexOf(ext.runtime.getURL('')) === 0;
}

const router = self.OVMaskRouter.createRouter({ rules: self.OVMask, service: service, isOwnPage: isOwnPage });

ext.runtime.onMessage.addListener(function (message, sender, sendResponse) {
    router.handle(message, sender).then(
        function (answer) { sendResponse(answer || { ok: false }); },
        function () { sendResponse({ ok: false, message: 'Something went wrong. Try again later.' }); }
    );
    return true;
});
