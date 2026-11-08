(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api; else root.OVLockerFill = api;
})(globalThis, function () {
    'use strict';
    // Self-contained: Chrome serializes this function into the isolated world of frame 0.
    function fill(login, submit, clicked) {
        if (clicked !== true || window !== window.top || location.origin !== login.site) return { ok: false };
        function visible(input) {
            const style = getComputedStyle(input);
            return !input.disabled && !input.readOnly && input.type !== 'hidden' && style.display !== 'none' && style.visibility === 'visible'
                && Number(style.opacity) !== 0 && Array.from(input.getClientRects()).some((rect) => rect.width > 0 && rect.height > 0) && !input.closest('[inert]');
        }
        const passwords = Array.from(document.querySelectorAll('input[type="password"]')).filter(visible);
        if (passwords.length !== 1) return { ok: false }; // Ambiguous signup / change-password forms need the person.
        const password = passwords[0];
        const fields = Array.from((password.form || document).querySelectorAll('input')).filter(visible);
        const username = fields.find((el) => el.autocomplete === 'username')
            || fields.find((el) => el.type === 'email')
            || fields.find((el) => el.type === 'text' && /user|login|email/i.test(el.name + ' ' + el.id));
        if (!username || (submit && !password.form)) return { ok: false };
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        for (const [input, value] of [[username, login.username], [password, login.password]]) {
            // Page event handlers may navigate, remove a field, or replace the form between writes.
            if (window !== window.top || location.origin !== login.site || !input.isConnected || !visible(input)) return { ok: false };
            setter.call(input, value);
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
        }
        if (submit) {
            if (location.origin !== login.site || window !== window.top || !password.isConnected) return { ok: false };
            HTMLFormElement.prototype.requestSubmit.call(password.form);
        }
        return { ok: true };
    }
    return { fill };
});
