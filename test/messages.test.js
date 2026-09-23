'use strict';
/**
 * What the popup says when a report is refused: each refusal the Coupons API can give a report has
 * its own clear message, never the generic "Something went wrong".
 */
const assert = require('assert');
const host = require('../browser/lib/host');
const { createApiClient } = require('../browser/lib/api');
const { createPlatform } = require('../browser/lib/platform');
const { createController, messageFor } = require('../browser/lib/controller');
const config = require('../browser/lib/config');
const { check, done, startStub, fakeExt, COUPON, GOOD_TOKEN, NO_REPORT_TOKEN, SUBMITTER_TOKEN } = require('./helpers/harness');

const GENERIC = messageFor(null);

(async () => {
    const stub = await startStub();
    const popup = (token) => {
        const platform = createPlatform(fakeExt({ url: 'https://acme-outdoor.com/', token }), { ...config, API_ORIGIN: stub.origin });
        const api = createApiClient({ origin: stub.origin, fetch, getToken: platform.storage.getToken });
        return createController({ api, platform, host });
    };

    await check('reporting on a code you submitted (403 report.own_submission) says so', async () => {
        const r = await popup(SUBMITTER_TOKEN).report(COUPON.id, 'worked');
        assert.strictEqual(r.ok, false);
        assert.strictEqual(r.code, 'report.own_submission');
        assert.strictEqual(r.message, 'You can’t report on a code you submitted.');
        assert.notStrictEqual(r.message, GENERIC);
    });

    await check('the other report refusals keep their own messages; a successful report is thanked', async () => {
        const scope = await popup(NO_REPORT_TOKEN).report(COUPON.id, 'worked');
        assert.strictEqual(scope.code, 'token.scope');
        assert.notStrictEqual(scope.message, GENERIC);
        const ok = await popup(GOOD_TOKEN).report(COUPON.id, 'worked');
        assert.strictEqual(ok.ok, true);
        for (const code of ['report.own_submission', 'report.rate_limited', 'coupon.not_active', 'auth.required', 'token.revoked']) {
            assert.notStrictEqual(messageFor({ code }), GENERIC, code);
        }
    });

    await stub.close();
    done();
})();
