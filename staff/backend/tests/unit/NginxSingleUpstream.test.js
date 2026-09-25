const { pinSingleUpstream } = require('../../scripts/prepare-nginx-single-upstream');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const site = `include /etc/nginx/snippets/dokterdibya-staff-assets-map.conf;
include /etc/nginx/snippets/dokterdibya-status-log-format.conf;
server { listen 80; server_name dokterdibya.com www.dokterdibya.com; }
server {
  listen 443 ssl http2;
  server_name dokterdibya.com www.dokterdibya.com;
  proxy_pass http://localhost:3000;
  proxy_pass http://localhost:3000;
  proxy_pass http://localhost:3000;
  proxy_pass http://localhost:3000/socket.io/;
  proxy_pass http://localhost:3000/socket.io/;
  proxy_pass http://localhost:3000/;
  proxy_pass http://127.0.0.1:3000;
  proxy_pass http://127.0.0.1:3000/sunday-clinic/;
}`;

test('pins only the six Dokter Dibya localhost proxies to one backend address', () => {
    const candidate = pinSingleUpstream(site);
    expect(candidate).toBe(site.replaceAll('proxy_pass http://localhost:3000',
        'proxy_pass http://127.0.0.1:3000'));
    expect(candidate).not.toContain('proxy_pass http://localhost:3000');
    expect(() => pinSingleUpstream(candidate)).toThrow();
});

test('refuses a changed site shape or a partial proxy rewrite', () => {
    expect(() => pinSingleUpstream(site.replace('proxy_pass http://localhost:3000;', 'proxy_pass http://127.0.0.1:3000;'))).toThrow();
    expect(() => pinSingleUpstream(site.replace('dokterdibya-status-log-format.conf;', 'other.conf;'))).toThrow();
    expect(() => pinSingleUpstream(site.replace('server_name dokterdibya.com www.dokterdibya.com;', 'server_name other.example;'))).toThrow();
});

test('preparation requires the exact observed checksum and never overwrites a candidate', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dd-nginx-upstream-'));
    try {
        const sourcePath = path.join(dir, 'site.conf');
        const candidatePath = path.join(dir, 'candidate.conf');
        fs.writeFileSync(sourcePath, site);
        const sha256 = crypto.createHash('sha256').update(site).digest('hex');
        const script = path.resolve(__dirname, '../../scripts/prepare-nginx-single-upstream.js');
        const run = checksum => spawnSync(process.execPath, [script, '--site', sourcePath,
            '--candidate', candidatePath, '--expected-sha256', checksum], { encoding: 'utf8' });
        expect(run('0'.repeat(64)).status).not.toBe(0);
        expect(fs.existsSync(candidatePath)).toBe(false);
        expect(run(sha256).status).toBe(0);
        expect(fs.readFileSync(candidatePath, 'utf8')).toBe(pinSingleUpstream(site));
        expect(run(sha256).status).not.toBe(0);
        expect(fs.readFileSync(candidatePath, 'utf8')).toBe(pinSingleUpstream(site));
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});
