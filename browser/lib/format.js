/*
 * Words for what the API returns. Unknown is shown as unknown — never as a friendly default.
 */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.OVFormat = api;
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';
    const STATUS = {
        unknown: 'Validity unknown',
        reported_working: 'Reported working',
        reported_failed: 'Reported not working',
        expired: 'Expired',
        disabled: 'Taken down',
    };

    function status(s) { return STATUS[s] || 'Validity unknown'; }

    function confidence(c) {
        if (!c || c.confidence == null) return 'No reports in the last ' + ((c && c.reports && c.reports.window_days) || 30) + ' days';
        const n = (c.reports.worked || 0) + (c.reports.failed || 0);
        return 'Confidence ' + Math.round(c.confidence * 100) + '% from ' + n + ' recent report' + (n === 1 ? '' : 's');
    }

    function expiry(e) {
        if (!e || !e.known || !e.expires_at) return 'Expiry unknown';
        const d = e.expires_at.slice(0, 10);
        return e.precision === 'date' ? 'Expires ' + d + ' (end of day, UTC)' : 'Expires ' + d + ' ' + e.expires_at.slice(11, 16) + ' UTC';
    }

    function restrictions(list) {
        if (!list || !list.length) return ['No restrictions stated'];
        return list.map(function (r) {
            if (r.kind === 'min_spend') return 'Minimum spend ' + r.amount;
            if (r.kind === 'category') return 'Category: ' + r.value;
            if (r.kind === 'new_customers_only') return 'New customers only';
            if (r.kind === 'region') return 'Region: ' + r.value;
            return String(r.value || '');
        });
    }

    return { status, confidence, expiry, restrictions, STATUS };
});
