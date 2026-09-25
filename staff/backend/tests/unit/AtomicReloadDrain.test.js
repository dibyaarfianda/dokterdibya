const fs = require('fs');
const path = require('path');
const ecosystem = require('../../ecosystem.config');

test('PM2 and application drain outlive a 300-second in-flight Medify request', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../../server.js'), 'utf8');
    const shutdown = source.slice(source.indexOf('// Graceful shutdown'), source.indexOf("process.on('SIGTERM'"));
    const forceExitMs = Number(shutdown.match(/\},\s*(\d+)\)\.unref\(\)/)?.[1]);
    const app = ecosystem.apps.find(item => item.name === 'dibyaklinik-backend');

    expect(shutdown).toContain('server.close(async () => {');
    expect(forceExitMs).toBeGreaterThan(300000);
    expect(app.exec_mode).toBe('cluster');
    expect(app.wait_ready).toBe(true);
    expect(app.kill_timeout).toBeGreaterThanOrEqual(forceExitMs + 15000);
});
