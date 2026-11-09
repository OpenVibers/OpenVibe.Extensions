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
import './shared/ov-locker-core.js';
import './lib/locker-passwords.js';
import './lib/locker-payload.js';
import './lib/locker-api.js';
import './lib/locker-fill.js';
import './lib/locker-clipboard.js';
import './lib/locker-vault.js';

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

const lockerApi = self.OVLockerApi.create({ origin: config.LOCKER_ORIGIN, fetch: self.fetch.bind(self), getToken: () => auth.accessToken() });
const vault = self.OVLockerVault.create({
    core: self.OVLockerCore, payload: self.LockerPayload, passwords: self.LockerPasswords, api: lockerApi,
    storage: platform.storage, tabs: platform.tabs, fill: platform.scripting.fillLogin,
    clipboard: platform.clipboard,
    account: async () => { const a = await auth.account(); return a?.sub || (await auth.status()).mode; },
    scheduleLock: (when) => ext.alarms.create('locker-lock', { when }), cancelLock: () => ext.alarms.clear('locker-lock'),
});
ext.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'locker-lock') vault.state().catch(() => vault.lock());
    if (alarm.name === 'locker-clipboard-clear') platform.clipboard.clear().catch(() => {});
});
// Restore the deadline if a browser dropped an alarm while suspending the worker.
vault.state().then((saved) => { if (saved) return ext.alarms.create('locker-lock', { when: saved.expires }); }).catch(() => vault.lock());
ext.runtime.onStartup.addListener(() => { vault.lock(); });
ext.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && (changes[config.DOCK_ACCOUNT_KEY] || changes[config.NETWORK_TOKEN_KEY])) vault.lock();
});

ext.runtime.onMessage.addListener(function (message, sender, sendResponse) {
    if (message?.target === 'locker-clipboard') return false;
    if (message?.type === 'locker:signin') {
        if (sender?.url !== ext.runtime.getURL('popup.html') || sender.tab || message.clicked !== true) { sendResponse({ ok: false }); return false; }
        vault.lock().then(() => auth.signIn()).then(() => sendResponse({ ok: true }), () => sendResponse({ ok: false }));
        return true;
    }
    const operation = message?.type?.startsWith('locker:')
        ? vault.handle(message, sender, ext.runtime.getURL('popup.html'))
        : router.handle(message, sender);
    operation.then(
        function (answer) { sendResponse(answer || { ok: false }); },
        function (error) { sendResponse({ ok: false, message: message?.type?.startsWith('locker:') ? (error.message.startsWith('That passphrase') || /^(Unlock |Sign in |Use your |The active tab |This login |Enter a username)/.test(error.message) ? error.message : 'Locker could not complete that action. Unlock again and retry.') : 'Something went wrong. Try again later.' }); }
    );
    return true;
});
