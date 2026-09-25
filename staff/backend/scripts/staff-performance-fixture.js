const http = require('http');
const path = require('path');
const fs = require('fs');
const express = require('express');
const { Server } = require('socket.io');
const { ROLE_IDS, ROLE_NAMES } = require('../constants/roles');

const STAFF_PUBLIC = path.resolve(__dirname, '../../public');
const STAFF_CACHE_VERSION = fs.readFileSync(path.join(STAFF_PUBLIC, 'index-adminlte.html'), 'utf8')
    .match(/window\.STAFF_CACHE_VERSION\s*=\s*'([^']+)'/)?.[1];
if (!STAFF_CACHE_VERSION) throw new Error('Staff cache version unavailable');
const FIXTURE_TOKEN = [
    Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url'),
    Buffer.from(JSON.stringify({ id: 'ci-fixture', user_type: 'staff', role: ROLE_NAMES.FRONT_OFFICE,
        exp: Math.floor(Date.now() / 1000) + 600 })).toString('base64url'),
    'fixture-only'
].join('.');

function syntheticApi(method, pathname) {
    const today = new Date().toISOString().slice(0, 10);
    if (method === 'GET') {
        if (pathname === '/api/auth/me') return { success: true, data: { user: {
            id: 'ci-fixture', uid: 'ci-fixture', name: 'CI Fixture', role: ROLE_NAMES.FRONT_OFFICE,
            role_id: ROLE_IDS.FRONT_OFFICE, user_type: 'staff', is_superadmin: false,
            profile_completed: true, photo_url: '/staff/public/android-chrome-192x192.png', permissions: []
        } } };
        if (pathname === '/api/dashboard-stats') return { success: true,
            stats: { totalPatients: 0, gynaeCases: 0, nextSundayAppointments: 0, nextSundayDate: today },
            appointments: [] };
        if (pathname === '/api/patients') return { success: true, data: [], count: 0,
            pagination: { total: 0, page: 1, totalPages: 1, limit: 10, nextCursor: null } };
        if (pathname === '/api/visits/stats/daily' || pathname === '/api/logs'
            || pathname === '/api/chat/messages' || pathname === '/api/users/ci-fixture/roles') {
            return { success: true, data: [] };
        }
        if (pathname === '/api/ai/daily-greeting') return { success: true,
            data: { greeting: 'Selamat datang, CI Fixture' } };
        if (pathname === '/api/role-visibility/my/menus') return { success: true, data: {} };
        if (pathname === '/api/sunday-clinic/queue/today') return { success: true,
            date: today, count: 0, data: [] };
        if (pathname === '/api/sunday-clinic/queue/settings') return { success: true,
            is_queue_visible: false, doctor_arrived: false, is_on_break: false,
            breaks: [], queue_label: 'Fixture' };
        if (pathname === '/api/registration-codes/public') return { success: true, code: null };
        if (pathname === '/api/support-chat/staff/count') return { success: true, count: 0 };
    }
    if (method === 'POST') {
        if (pathname === '/api/logs' || pathname === '/api/rum') return { success: true };
        if (pathname === '/api/notifications/badge-counts') return { success: true,
            counts: { klinik_private: 0, rsia_melinda: 0, rsud_gambiran: 0,
                rs_bhayangkara: 0, artikel: 0 } };
    }
    return null;
}

async function startStaffPerformanceFixture({ port = 0 } = {}) {
    const app = express();
    const unexpected = [];
    app.disable('x-powered-by');
    app.use(express.json({ limit: '64kb' }));
    app.get('/staff/public/index-adminlte.html', (_req, res) => {
        res.set('Cache-Control', 'no-store');
        res.sendFile(path.join(STAFF_PUBLIC, 'index-adminlte.html'));
    });
    app.get('/staff/public/sw.js', (_req, res) => {
        res.set('Cache-Control', 'no-store');
        res.sendFile(path.join(STAFF_PUBLIC, 'sw.js'));
    });
    app.use('/staff/public', express.static(STAFF_PUBLIC, {
        fallthrough: false,
        setHeaders: res => res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
    }));
    app.use('/api', (req, res) => {
        res.set('Cache-Control', 'no-store');
        const response = syntheticApi(req.method, new URL(req.originalUrl, 'http://localhost').pathname);
        if (response) return res.json(response);
        unexpected.push('api');
        return res.status(503).json({ success: false, error: 'Unexpected fixture request' });
    });
    app.use((req, res) => {
        unexpected.push('asset');
        res.status(503).send('Unexpected fixture request');
    });

    const server = http.createServer(app);
    const io = new Server(server, { transports: ['polling'], allowUpgrades: false, serveClient: false });
    io.on('connection', socket => socket.emit('users:list', []));
    try {
        await new Promise((resolve, reject) => {
            server.once('error', reject);
            server.listen(port, '::1', () => {
                server.off('error', reject);
                resolve();
            });
        });
    } catch (error) {
        await new Promise(resolve => io.close(resolve));
        throw error;
    }
    const actualPort = server.address().port;
    return {
        url: `http://[::1]:${actualPort}/staff/public/index-adminlte.html`,
        token: FIXTURE_TOKEN,
        cacheVersion: STAFF_CACHE_VERSION,
        assertClean: () => {
            if (unexpected.length) throw new Error(`Unexpected fixture request (${unexpected.length})`);
        },
        close: async () => {
            await new Promise(resolve => io.close(resolve));
            if (server.listening) await new Promise(resolve => server.close(resolve));
        }
    };
}

module.exports = { startStaffPerformanceFixture };
