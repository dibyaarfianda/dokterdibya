// Local-only fixture: actual portal assets with synthetic patient/chat APIs.
// Open http://127.0.0.1:8899/__qa-start in the Codex in-app browser.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { Server } = require('socket.io');
const root = path.resolve(__dirname, '../../../..');
const port = Number(process.env.PATIENT_CHAT_QA_PORT) || 8899;
const assetOrigin = process.argv.includes('--deployed-assets') ? 'https://sisiwanita.id' : null;
const user = { id: 'EDGE-QA', name: 'Pasien Contoh', fullname: 'Pasien Contoh', intake_completed: true };
const token = 'fixture.' + Buffer.from(JSON.stringify({ ...user, user_type: 'patient', role: 'patient' })).toString('base64url') + '.fixture';
const room = { id: 1, slug: 'lobby', name: 'Lobby Komunitas', description: 'Percakapan contoh untuk pengujian tampilan', color: '#5c7f72', member_count: 5 };
const requests = [];
const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1:8899');
    const send = (data, type = 'application/json') => { res.writeHead(200, { 'Content-Type': type + '; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(typeof data === 'object' ? JSON.stringify(data) : data); };
    if (url.pathname === '/__qa-start') return send(`<meta name="viewport" content="width=device-width,initial-scale=1"><script src="/scripts/patient-session.js"></script><script>PatientSession.setToken(${JSON.stringify(token)},{persistent:false});PatientSession.setUser(${JSON.stringify(user)},{persistent:false});location.replace('/patient-menu.html');</script>`, 'text/html');
    if (url.pathname === '/__qa-metrics') return send(requests);
    if (url.pathname.startsWith('/api/')) {
        requests.push({ method: req.method, path: url.pathname });
        if (url.pathname === '/api/patients/profile') return send({ success: true, user });
        if (url.pathname === '/api/patients/portal-settings') return send({ success: true, settings: { nickname: 'PasienContoh', notification_sound: 'default' } });
        if (url.pathname === '/api/community-chat/unread') return send({ success: true, total: 3 });
        if (url.pathname === '/api/community-chat/me/profile') return send({ success: true, profile: { nickname: 'PasienContoh' } });
        if (url.pathname === '/api/community-chat/rooms') return send({ success: true, rooms: [room], permissions: { can_write: true } });
        if (url.pathname.endsWith('/messages')) return send({ success: true, room, messages: [
            { id: 1, room_id: 1, sender_id: 'example-a', sender_type: 'patient', sender_name: 'Anggota Contoh', nickname: 'AnggotaContoh', message: 'Selamat datang di chat komunitas.', created_at: '2026-10-25T09:00:00+07:00' },
            { id: 2, room_id: 1, sender_id: 'example-a', sender_type: 'patient', sender_name: 'Anggota Contoh', nickname: 'AnggotaContoh', message: 'Semoga hari ini menyenangkan untuk semuanya.', created_at: '2026-10-25T09:01:00+07:00' }
        ] });
        return send({ success: true, count: 0, data: [], appointments: [], notifications: [], announcements: [], records: [], sessions: [] });
    }
    if (url.pathname === '/sw.js' || url.pathname === '/sisiwanita-sw.js') { res.writeHead(404); return res.end(); }
    const file = path.resolve(root, 'public', '.' + url.pathname);
    if (!file.startsWith(path.join(root, 'public') + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end(); }
    const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.webmanifest': 'application/manifest+json' };
    let data;
    try {
        if (assetOrigin) {
            const response = await fetch(assetOrigin + url.pathname + url.search, { cache: 'no-store' });
            if (!response.ok) throw new Error('Deployed asset HTTP ' + response.status);
            data = Buffer.from(await response.arrayBuffer());
        } else data = fs.readFileSync(file);
    } catch (error) { res.writeHead(502); return res.end(error.message); }
    if (url.pathname === '/community-chat.html') data = Buffer.from(data.toString().replace('https://cdn.socket.io/4.5.4/socket.io.min.js', '/socket.io/socket.io.js'));
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); res.end(data);
});
new Server(server, { transports: ['polling'], allowUpgrades: false });
server.listen(port, '127.0.0.1', () => console.log(`Synthetic portal fixture (${assetOrigin || 'local assets'}): http://127.0.0.1:${port}/__qa-start`));
