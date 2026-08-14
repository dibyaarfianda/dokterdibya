const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('./auth');
const PatientDemoService = require('../services/PatientDemoService');

const SAFE_PUBLIC_GET_PREFIXES = [
    '/api/articles',
    '/api/announcements',
    '/api/birth-classes/sessions/public',
    '/api/practice-schedules',
    '/api/doctors',
    '/api/greeting-cards/active',
    '/api/app-version'
];

const EXPLICIT_BLOCK_MARKERS = [
    'payment', 'pay', 'xendit', 'fcm', 'push-token', 'email', 'whatsapp',
    'upload', 'usg-photos', 'lab-results', 'community-chat', 'support-chat',
    'patient-questions', 'tanya-subscriptions', 'subscriptions', 'public-post', 'reaction'
];

function requestPath(req) {
    return String(req.originalUrl || req.url || '').split('?')[0];
}

function bearerToken(req) {
    const header = req.headers.authorization || req.headers.Authorization || '';
    const match = String(header).match(/^Bearer\s+(.+)$/i);
    return match ? match[1] : null;
}

function decodeDemoToken(req) {
    const token = bearerToken(req);
    if (!token) return null;
    try {
        const payload = jwt.verify(token, JWT_SECRET);
        return payload.demo_mode === true ? payload : null;
    } catch (_error) {
        return null;
    }
}

function unreadCount(items) {
    return items.filter((item) => !item.is_read).length;
}

function isExplicitlyBlocked(pathname) {
    const normalized = pathname.toLowerCase();
    return EXPLICIT_BLOCK_MARKERS.some((marker) => normalized.includes(marker));
}

function unsupported(res, pathname, method) {
    return res.status(method === 'GET' ? 404 : 403).json({
        success: false,
        code: method === 'GET' ? 'DEMO_ENDPOINT_UNSUPPORTED' : 'UNKNOWN_DEMO_MUTATION',
        message: method === 'GET'
            ? 'Data ini belum tersedia dalam fixture dummy.'
            : 'Aksi ini diblokir pada mode dummy dan tidak diteruskan ke sistem produksi.',
        path: pathname
    });
}

function sanitizeText(value, max = 4000) {
    return String(value == null ? '' : value).trim().slice(0, max);
}

async function handleGet(req, res, state, pathname) {
    if (pathname === '/api/patients/profile' || pathname === '/api/patients/me') {
        return res.json({ success: true, user: state.profile, patient: state.profile });
    }
    if (pathname === '/api/patients/portal-settings') {
        return res.json({ success: true, settings: state.settings });
    }
    if (pathname === '/api/patients/pregnancy-tracker') {
        return res.json({ success: true, data: state.pregnancy });
    }
    if (pathname === '/api/patients/medications') {
        return res.json({ success: true, data: state.trackers.vitamins || [] });
    }
    if (pathname === '/api/patients/daily-quote') {
        return res.json({ success: true, quote: 'Hari ini adalah contoh yang aman untuk menguji portal.', author: 'Mode Dummy', is_demo: true });
    }
    if (pathname === '/api/patients/birth-record') return res.json({ success: true, data: null, birthRecord: null });
    if (pathname === '/api/patient-documents/unread-counts') {
        const counts = state.documents.reduce((result, item) => {
            if (!item.is_read) result[item.document_type] = (result[item.document_type] || 0) + 1;
            return result;
        }, {});
        return res.json({ success: true, counts, total: unreadCount(state.documents) });
    }
    if (pathname === '/api/patient-documents/my-documents') {
        const type = req.query?.type;
        const documents = type ? state.documents.filter((item) => item.document_type === type) : state.documents;
        return res.json({ success: true, documents });
    }
    const documentContent = pathname.match(/^\/api\/patient-documents\/([^/]+)\/content$/);
    if (documentContent) {
        const document = state.documents.find((item) => String(item.id) === documentContent[1]);
        return document ? res.json({ success: true, document }) : res.status(404).json({ success: false, message: 'Dokumen dummy tidak ditemukan.' });
    }
    if (pathname === '/api/patient-notifications' || pathname === '/api/patient-notifications/with-announcements') {
        return res.json({ success: true, notifications: state.notifications, items: state.notifications, unread_count: unreadCount(state.notifications) });
    }
    if (pathname === '/api/patient-notifications/count') {
        return res.json({ success: true, count: unreadCount(state.notifications) });
    }
    if (pathname === '/api/patient-notifications/queue-reminder-settings') {
        return res.json({ success: true, settings: {
            enabled: Boolean(state.settings.queue_reminder_enabled),
            minutes: Number(state.settings.queue_reminder_minutes || 30)
        } });
    }
    if (pathname === '/api/sunday-appointments/my-bookings') {
        return res.json({ success: true, bookings: state.bookings });
    }
    if (pathname === '/api/sunday-appointments/my-pending-confirmation') {
        return res.json({ success: true, appointment: state.bookings.find((item) => item.status === 'pending_confirmation') || null });
    }
    if (pathname === '/api/sunday-appointments/sundays') {
        return res.json({ success: true, sundays: Array.from(new Set(state.bookings.map((item) => item.date))) });
    }
    if (pathname === '/api/sunday-appointments/available') {
        return res.json({ success: true, sessions: [
            { session: 'morning', label: 'Pagi', availableSlots: [1, 2, 4, 5], is_demo: true },
            { session: 'afternoon', label: 'Siang', availableSlots: [1, 2, 3], is_demo: true }
        ] });
    }
    if (/^\/api\/sunday-clinic\/patient-visits\//.test(pathname)) {
        return res.json({ success: true, data: state.visits });
    }
    if (pathname === '/api/sunday-clinic/queue/settings') return res.json({ success: true, settings: state.queue.settings, ...state.queue.settings });
    if (pathname === '/api/sunday-clinic/queue/public') return res.json({ success: true, queue: state.queue.items, data: state.queue.items, is_demo: true });
    if (pathname === '/api/billings/my-billings') return res.json({ success: true, count: state.billings.length, data: state.billings });
    if (pathname === '/api/patient-billing/my-bills') return res.json({ success: true, count: state.billings.length, data: state.billings, bills: state.billings });
    const patientBillingDetail = pathname.match(/^\/api\/patient-billing\/([^/]+)\/details$/);
    if (patientBillingDetail) {
        const item = state.billings.find((billing) => String(billing.id) === patientBillingDetail[1]);
        return item ? res.json({ success: true, data: item, billing: item }) : res.status(404).json({ success: false, message: 'Tagihan simulasi tidak ditemukan.' });
    }
    if (/^\/api\/billings\/[^/]+$/.test(pathname)) {
        const item = state.billings.find((billing) => String(billing.id) === pathname.split('/').pop());
        return item ? res.json({ success: true, data: item }) : res.status(404).json({ success: false, message: 'Tagihan simulasi tidak ditemukan.' });
    }
    if (pathname === '/api/patient-workdesk' || pathname === '/api/patient-workdesk/layout') return res.json({ success: true, data: state.workdesk, workdesk: state.workdesk, layout: state.workdesk });
    if (pathname === '/api/patient-feedback') return res.json({ success: true, data: state.feedback, feedback: state.feedback });
    if (pathname === '/api/patient-stories' || pathname === '/api/patient-stories/my' || pathname === '/api/patient-stories/my-stories') return res.json({ success: true, data: state.stories, stories: state.stories });
    const storyDetail = pathname.match(/^\/api\/patient-stories\/([^/]+)$/);
    if (storyDetail) {
        const story = state.stories.find((item) => String(item.id) === storyDetail[1]);
        return story ? res.json({ success: true, data: story, story }) : res.status(404).json({ success: false, message: 'Cerita dummy tidak ditemukan.' });
    }
    if (pathname.startsWith('/api/kick-counter')) return res.json({ success: true, data: state.trackers.kick_counter, ...state.trackers.kick_counter });
    if (pathname.startsWith('/api/contraction-timer')) return res.json({ success: true, data: state.trackers.contraction_timer, ...state.trackers.contraction_timer });
    if (pathname.startsWith('/api/fertility-calendar')) return res.json({ success: true, data: state.trackers.fertility_calendar, ...state.trackers.fertility_calendar });
    if (pathname.startsWith('/api/patient/birth-')) return res.json({ success: true, data: [], items: [], congratulations: null, pending: null });
    if (pathname === '/api/patient/estimasi-biaya') return res.json({ success: true, data: { low: 5000000, high: 12000000, currency: 'IDR', is_demo: true } });
    if (pathname === '/api/patient-intake/my-intake') return res.json({ success: true, data: null, intake: null, is_demo: true });
    if (pathname === '/api/patient-questions/can-ask') return res.json({ success: true, canAsk: false, reason: 'Pertanyaan nyata dinonaktifkan pada mode dummy.' });
    if (SAFE_PUBLIC_GET_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return null;
    return unsupported(res, pathname, 'GET');
}

async function handleMutation(req, res, state, pathname, sessionId) {
    if (pathname === '/api/patients/portal-settings' && req.method === 'PUT') {
        const allowed = ['theme', 'queue_reminder_enabled', 'queue_reminder_minutes'];
        const next = await PatientDemoService.updateState(sessionId, 'settings_updated', (draft) => {
            for (const key of allowed) if (Object.prototype.hasOwnProperty.call(req.body || {}, key)) draft.settings[key] = req.body[key];
            return draft;
        });
        return res.json({ success: true, settings: next.settings });
    }
    if (pathname === '/api/patient-notifications/queue-reminder-settings' && req.method === 'PUT') {
        const next = await PatientDemoService.updateState(sessionId, 'queue_reminder_updated', (draft) => {
            if (Object.prototype.hasOwnProperty.call(req.body || {}, 'enabled')) draft.settings.queue_reminder_enabled = Boolean(req.body.enabled);
            if (Object.prototype.hasOwnProperty.call(req.body || {}, 'minutes')) draft.settings.queue_reminder_minutes = Math.max(5, Math.min(180, Number(req.body.minutes) || 30));
            return draft;
        });
        return res.json({ success: true, settings: next.settings });
    }
    if (pathname === '/api/patient-notifications/read-all' && req.method === 'POST') {
        await PatientDemoService.updateState(sessionId, 'notifications_read_all', (draft) => {
            draft.notifications.forEach((item) => { item.is_read = true; });
            return draft;
        });
        return res.json({ success: true });
    }
    const notificationRead = pathname.match(/^\/api\/patient-notifications\/([^/]+)\/read$/);
    if (notificationRead && req.method === 'POST') {
        await PatientDemoService.updateState(sessionId, 'notification_read', (draft) => {
            const item = draft.notifications.find((entry) => String(entry.id) === notificationRead[1]);
            if (item) item.is_read = true;
            return draft;
        });
        return res.json({ success: true });
    }
    if (pathname === '/api/patient-notifications/mark-read-by-link' && req.method === 'POST') {
        await PatientDemoService.updateState(sessionId, 'notification_link_read', (draft) => {
            draft.notifications.filter((item) => item.link === req.body?.link).forEach((item) => { item.is_read = true; });
            return draft;
        });
        return res.json({ success: true });
    }
    const documentView = pathname.match(/^\/api\/patient-documents\/([^/]+)\/view$/);
    if (documentView && req.method === 'POST') {
        await PatientDemoService.updateState(sessionId, 'document_viewed', (draft) => {
            const item = draft.documents.find((entry) => String(entry.id) === documentView[1]);
            if (item) { item.is_read = true; item.viewed_at = new Date().toISOString(); }
            return draft;
        });
        return res.json({ success: true, message: 'Dokumen dummy ditandai sudah dibaca.' });
    }
    if (pathname === '/api/sunday-appointments/book' && req.method === 'POST') {
        const next = await PatientDemoService.updateState(sessionId, 'booking_created', (draft) => {
            const id = `DEMO-BOOKING-${Date.now()}`;
            draft.bookings.push({
                id,
                appointment_date: sanitizeText(req.body?.date || req.body?.appointment_date, 10),
                date: sanitizeText(req.body?.date || req.body?.appointment_date, 10),
                session: sanitizeText(req.body?.session || 'morning', 20),
                slot_number: Number(req.body?.slot_number || req.body?.slot || 1),
                slot_time: sanitizeText(req.body?.slot_time || '09:00', 5),
                chief_complaint: sanitizeText(req.body?.chief_complaint || 'Booking simulasi'),
                category: sanitizeText(req.body?.category || 'general', 40),
                status: 'pending_confirmation',
                is_demo: true
            });
            return draft;
        });
        const appointment = next.bookings[next.bookings.length - 1];
        return res.status(201).json({ success: true, appointmentId: appointment.id, status: appointment.status, requiresConfirmation: true, details: appointment });
    }
    const bookingAction = pathname.match(/^\/api\/sunday-appointments\/([^/]+)\/(cancel|confirm-attendance|cancel-attendance)$/);
    if (bookingAction && ['PUT', 'POST'].includes(req.method)) {
        const nextStatus = bookingAction[2] === 'cancel' || bookingAction[2] === 'cancel-attendance' ? 'cancelled' : 'confirmed';
        await PatientDemoService.updateState(sessionId, `booking_${bookingAction[2]}`, (draft) => {
            const item = draft.bookings.find((entry) => String(entry.id) === bookingAction[1]);
            if (item) item.status = nextStatus;
            return draft;
        });
        return res.json({ success: true, status: nextStatus });
    }
    if (pathname === '/api/patient-workdesk' && ['POST', 'PUT', 'PATCH'].includes(req.method)) {
        const next = await PatientDemoService.updateState(sessionId, 'workdesk_updated', (draft) => {
            if (Object.prototype.hasOwnProperty.call(req.body || {}, 'notes')) draft.workdesk.notes = sanitizeText(req.body.notes, 10000);
            if (Array.isArray(req.body?.tasks)) draft.workdesk.tasks = req.body.tasks.slice(0, 100);
            return draft;
        });
        return res.json({ success: true, data: next.workdesk });
    }
    if (pathname === '/api/patient-workdesk/layout' && ['POST', 'PUT'].includes(req.method)) {
        const next = await PatientDemoService.updateState(sessionId, 'workdesk_layout_updated', (draft) => {
            draft.workdesk = { ...draft.workdesk, ...(req.body || {}) };
            return draft;
        });
        return res.json({ success: true, data: next.workdesk, layout: next.workdesk });
    }
    if (pathname === '/api/patient-workdesk/reset' && req.method === 'POST') {
        const next = await PatientDemoService.updateState(sessionId, 'workdesk_reset', (draft) => {
            draft.workdesk = { notes: '', tasks: [] };
            return draft;
        });
        return res.json({ success: true, data: next.workdesk });
    }
    if (pathname === '/api/patients/track-page' && req.method === 'POST') {
        await PatientDemoService.audit({ sessionId, action: 'demo_page_view', method: 'POST', path: pathname, metadata: { page: sanitizeText(req.body?.page || req.body?.path, 160) } });
        return res.json({ success: true, is_demo: true });
    }
    if (pathname === '/api/patient-feedback' && req.method === 'POST') {
        const next = await PatientDemoService.updateState(sessionId, 'feedback_created', (draft) => {
            draft.feedback.push({ id: `DEMO-FEEDBACK-${Date.now()}`, category: sanitizeText(req.body?.category || 'bug', 40), message: sanitizeText(req.body?.message || req.body?.content), status: 'demo_only' });
            return draft;
        });
        return res.status(201).json({ success: true, data: next.feedback[next.feedback.length - 1] });
    }
    if (pathname === '/api/patient-stories' && req.method === 'POST') {
        const next = await PatientDemoService.updateState(sessionId, 'story_created', (draft) => {
            draft.stories.push({ id: `DEMO-STORY-${Date.now()}`, title: sanitizeText(req.body?.title, 160), content: sanitizeText(req.body?.content, 10000), status: 'demo_only' });
            return draft;
        });
        return res.status(201).json({ success: true, data: next.stories[next.stories.length - 1] });
    }
    if (pathname.startsWith('/api/kick-counter') && ['POST', 'PUT', 'DELETE'].includes(req.method)) {
        const next = await PatientDemoService.updateState(sessionId, 'kick_counter_updated', (draft) => {
            if (req.method === 'DELETE') draft.trackers.kick_counter = { count: 0, events: [] };
            else {
                draft.trackers.kick_counter.count = Number(req.body?.count ?? (draft.trackers.kick_counter.count + 1));
                draft.trackers.kick_counter.events.push({ at: new Date().toISOString(), type: sanitizeText(req.body?.type || 'kick', 20) });
            }
            return draft;
        });
        return res.json({ success: true, data: next.trackers.kick_counter, ...next.trackers.kick_counter });
    }
    if (pathname.startsWith('/api/contraction-timer') && ['POST', 'PUT', 'DELETE'].includes(req.method)) {
        const next = await PatientDemoService.updateState(sessionId, 'contraction_timer_updated', (draft) => {
            if (req.method === 'DELETE') draft.trackers.contraction_timer = { events: [], active: false };
            else draft.trackers.contraction_timer.events.push({ ...req.body, at: new Date().toISOString(), is_demo: true });
            return draft;
        });
        return res.json({ success: true, data: next.trackers.contraction_timer, ...next.trackers.contraction_timer });
    }
    if (pathname.startsWith('/api/fertility-calendar') && ['POST', 'PUT', 'PATCH'].includes(req.method)) {
        const next = await PatientDemoService.updateState(sessionId, 'fertility_tracker_updated', (draft) => {
            draft.trackers.fertility_calendar = { ...draft.trackers.fertility_calendar, ...(req.body || {}) };
            return draft;
        });
        return res.json({ success: true, data: next.trackers.fertility_calendar });
    }
    await PatientDemoService.audit({
        sessionId,
        action: 'unknown_mutation_blocked',
        method: req.method,
        path: pathname,
        metadata: { code: 'UNKNOWN_DEMO_MUTATION' }
    });
    return unsupported(res, pathname, req.method);
}

async function patientDemoGuard(req, res, next) {
    try {
        const payload = decodeDemoToken(req);
        if (!payload) return next();

        const pathname = requestPath(req);
        res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
        const active = await PatientDemoService.assertActiveSession(payload.demo_session_id);
        if (!active) {
            return res.status(401).json({ success: false, code: 'DEMO_SESSION_REVOKED', message: 'Sesi dummy telah berakhir atau dicabut. Buka kembali dari staff panel.' });
        }

        const isSafeQuestionProbe = req.method === 'GET' && pathname === '/api/patient-questions/can-ask';
        if (!isSafeQuestionProbe && isExplicitlyBlocked(pathname)) {
            await PatientDemoService.audit({ sessionId: payload.demo_session_id, action: 'blocked_action', method: req.method, path: pathname, metadata: { reason: 'external_or_production_effect' } });
            return res.status(403).json({ success: false, code: 'DEMO_ACTION_BLOCKED', message: 'Aksi ini dinonaktifkan pada mode dummy.' });
        }

        const state = await PatientDemoService.getState();
        const result = req.method === 'GET'
            ? await handleGet(req, res, state, pathname)
            : await handleMutation(req, res, state, pathname, payload.demo_session_id);
        if (result === null) return next();
        return result;
    } catch (error) {
        return next(error);
    }
}

module.exports = patientDemoGuard;
module.exports.decodeDemoToken = decodeDemoToken;
module.exports.isExplicitlyBlocked = isExplicitlyBlocked;
module.exports.EXPLICIT_BLOCK_MARKERS = EXPLICIT_BLOCK_MARKERS;
