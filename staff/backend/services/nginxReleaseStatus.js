const STATUS_LOG = '/var/log/nginx/dokterdibya-status.log';
const STATUS_FORMAT_INCLUDE = '/etc/nginx/snippets/dokterdibya-status-log-format.conf';
const STATUS_DIRECTIVE = `access_log ${STATUS_LOG} dokterdibya_status;`;

function instrumentStatusLogging(source) {
    if (typeof source !== 'string' || source.includes(STATUS_FORMAT_INCLUDE)
        || source.includes(STATUS_LOG)) throw new Error('Nginx status logging already configured or invalid');
    const servers = [...source.matchAll(/^server\s*\{/gm)];
    const ssl = [...source.matchAll(/^[ \t]*listen 443 ssl http2;[ \t]*$/gm)];
    const names = [...source.matchAll(/^[ \t]*server_name dokterdibya\.com www\.dokterdibya\.com;[ \t]*$/gm)];
    if (servers.length !== 2 || ssl.length !== 1 || names.length !== 2
        || !(servers[1].index < ssl[0].index && ssl[0].index < names[1].index)
        || source.match(/^include \/etc\/nginx\/snippets\/dokterdibya-staff-assets-map\.conf;$/gm)?.length !== 1) {
        throw new Error('Unexpected Dokter Dibya Nginx site shape');
    }
    const include = `include /etc/nginx/snippets/dokterdibya-staff-assets-map.conf;`;
    const withFormat = source.replace(include, `${include}\ninclude ${STATUS_FORMAT_INCLUDE};`);
    const httpsNames = [...withFormat.matchAll(/^[ \t]*server_name dokterdibya\.com www\.dokterdibya\.com;[ \t]*$/gm)][1];
    const newline = withFormat.indexOf('\n', httpsNames.index);
    const withServerLog = `${withFormat.slice(0, newline + 1)}    ${STATUS_DIRECTIVE}\n${withFormat.slice(newline + 1)}`;
    const httpsStart = [...withServerLog.matchAll(/^[ \t]*listen 443 ssl http2;[ \t]*$/gm)][0].index;
    const beforeHttps = withServerLog.slice(0, httpsStart);
    const https = withServerLog.slice(beforeHttps.length).replaceAll('access_log off;', STATUS_DIRECTIVE);
    return beforeHttps + https;
}

function scoreNginxStatusLog(contents, { now = Date.now(), cutover, maxErrorRatePercent = Infinity } = {}) {
    if (!Number.isSafeInteger(now) || !Number.isSafeInteger(cutover)
        || now - cutover < 300000 || now - cutover > 86400000) {
        throw new Error('Full post-cutover Nginx observation window required');
    }
    if (typeof contents !== 'string') throw new Error('Nginx status-only log required');
    // Score the first complete release window, not a later rolling window that
    // can silently forget errors during the cutover itself.
    const start = cutover;
    const end = cutover + 300000;
    let total = 0;
    let serverErrors = 0;
    let first = Infinity;
    let last = -Infinity;
    for (const line of contents.split(/\r?\n/)) {
        if (!line) continue;
        const match = /^(\d{10}(?:\.\d{3})?) ([1-5]\d\d)$/.exec(line);
        if (!match) throw new Error('Nginx status log is not status-only');
        const at = Math.round(Number(match[1]) * 1000);
        if (at < start || at >= end) continue;
        total++;
        if (Number(match[2]) >= 500) serverErrors++;
        first = Math.min(first, at);
        last = Math.max(last, at);
    }
    if (total === 0 || first > start + 5000 || last < end - 5000) {
        throw new Error('Nginx status observations do not cover five minutes');
    }
    const errorRatePercent = serverErrors / total * 100;
    if (errorRatePercent > maxErrorRatePercent) throw new Error('Nginx 5xx release gate exceeded');
    return { total, serverErrors, errorRatePercent, windowSeconds: 300 };
}

module.exports = { instrumentStatusLogging, scoreNginxStatusLog, STATUS_LOG, STATUS_FORMAT_INCLUDE };
