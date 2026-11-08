'use strict';
// This offscreen document stays alive after the popup closes; it never reads the clipboard.
const clipboard = OVLockerClipboard.create({ write(value) {
    const field = document.getElementById('clipboard');
    // A nonempty selection ensures Chrome fires copy even when clearing to the empty string.
    field.value = value || ' '; field.select();
    const copy = (event) => { event.clipboardData.setData('text/plain', value); event.preventDefault(); };
    document.addEventListener('copy', copy, { once: true });
    try { if (!document.execCommand('copy')) throw new Error('Clipboard unavailable'); }
    finally { document.removeEventListener('copy', copy); field.value = ''; }
} });
chrome.runtime.onMessage.addListener((message, sender, reply) => {
    if (message?.target !== 'locker-clipboard' || sender.id !== chrome.runtime.id || sender.url !== chrome.runtime.getURL('background.js')) return;
    (message.clear ? clipboard.clear() : clipboard.write(message.value)).then(() => reply({ ok: true }), () => reply({ ok: false }));
    return true;
});
