const { instrumentStatusLogging, scoreNginxStatusLog } = require('../../services/nginxReleaseStatus');
const fs = require('fs');
const path = require('path');

const site = `include /etc/nginx/snippets/dokterdibya-staff-assets-map.conf;
server {
  listen 80;
  server_name dokterdibya.com www.dokterdibya.com;
  location / { return 301 https://dokterdibya.com$request_uri; }
}
server {
  listen 443 ssl http2;
  server_name dokterdibya.com www.dokterdibya.com;
  location /api/ { proxy_pass http://localhost:3000; }
  location ^~ /api/integration/comm/clinic-monitor { access_log off; proxy_pass http://localhost:3000; }
  location /staff/public/ { access_log off; root /var/www/dokterdibya; }
}
`;

test('dedicated status-only Nginx log covers proxy errors and formerly unlogged locations', () => {
    const candidate = instrumentStatusLogging(site);
    expect(candidate).toContain('include /etc/nginx/snippets/dokterdibya-status-log-format.conf;');
    expect(candidate).toContain('access_log /var/log/nginx/dokterdibya-status.log dokterdibya_status;');
    expect(candidate).not.toContain('access_log off;');
    expect((candidate.match(/access_log \/var\/log\/nginx\/dokterdibya-status\.log dokterdibya_status;/g) || [])).toHaveLength(3);
    expect(() => instrumentStatusLogging(candidate)).toThrow();
});

test('Nginx release gate counts proxy-generated 502 across a completed post-cutover window', () => {
    const now = 1800000300000;
    const cutover = now - 300000;
    const lines = Array.from({ length: 100 }, (_, index) => `${(cutover + index * 3000) / 1000} ${index < 2 ? 502 : 200}`).join('\n');
    expect(scoreNginxStatusLog(lines, { now, cutover }).errorRatePercent).toBe(2);
    expect(() => scoreNginxStatusLog(lines, { now, cutover, maxErrorRatePercent: 1 })).toThrow();
    expect(() => scoreNginxStatusLog(lines, { now: cutover + 60000, cutover })).toThrow();
    expect(() => scoreNginxStatusLog('1800000000.000 200 /api/patient/123', { now, cutover })).toThrow();
});

test('Nginx release gate cannot forget errors at the start of cutover when checked late', () => {
    const cutover = 1800000000000;
    const now = cutover + 330000;
    const lines = [
        `${cutover / 1000} 200`,
        `${(cutover + 1000) / 1000} 502`,
        `${(cutover + 30000) / 1000} 200`,
        `${(cutover + 299000) / 1000} 200`,
        `${(cutover + 329000) / 1000} 200`
    ].join('\n');
    expect(scoreNginxStatusLog(lines, { now, cutover }).total).toBe(4);
    expect(() => scoreNginxStatusLog(lines, { now, cutover, maxErrorRatePercent: 1 })).toThrow();
});

test('release runbook records the observation start before the PM2 cutover command', () => {
    const runbook = fs.readFileSync(path.resolve(__dirname, '../../../../deployment/STAFF_ASSET_RELEASES.md'), 'utf8');
    const capture = runbook.indexOf('CUTOVER_MS="$(date +%s%3N)"');
    const checkout = runbook.indexOf('git merge --ff-only "$TARGET_SHA"');
    const reload = runbook.indexOf('pm2 reload ecosystem.config.js --only dibyaklinik-backend --update-env');
    expect(capture).toBeGreaterThan(checkout);
    expect(reload).toBeGreaterThan(capture);
    expect(runbook).toContain('UPSTREAM_STAGE="$SITE.stage-upstream-$UPSTREAM_STAMP"');
    expect(runbook).toContain('restore_upstream_nginx()');
    expect(runbook).toContain('test ! -e "$UPSTREAM_BACKUP" && test ! -L "$UPSTREAM_BACKUP"');
    expect(runbook).toMatch(/```sh\nset -Eeuo pipefail\nSITE=\/etc\/nginx\/sites-enabled\/dokterdibya\.com\nUPSTREAM_STAMP=/);
    expect(runbook).toMatch(/```sh\nset -Eeuo pipefail\nCURRENT_ASSET_VERSION=/);
});
