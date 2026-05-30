require('dotenv').config();
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const compression = require('compression');
const mysql = require('mysql2/promise');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const logger = require('./utils/logger');
const {
    BLOCKED_PATIENT_MESSAGE,
    isPatientIdentityBlocked,
    isPatientRequestIpBlocked,
    rememberBlockedPatientRequestIp
} = require('./utils/patientAccessBlocklist');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const { requestLogger, performanceLogger } = require('./middleware/requestLogger');
const { metricsMiddleware, getMetrics, resetMetrics } = require('./middleware/metrics');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./config/swagger');
const activityLogger = require('./services/activityLogger');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: process.env.CORS_ORIGIN || '*',
        methods: ['GET', 'POST']
    },
    pingTimeout: 60000,
    pingInterval: 25000,
    transports: ['polling'], // POLLING ONLY - mobile ISPs kill WebSocket connections
    allowEIO3: true,
    allowUpgrades: false, // Prevent upgrade to websocket
    maxHttpBufferSize: 1e8, // 100MB - fix 413 errors for large polling payloads
    httpCompression: true // Compress polling data
});

// Make io globally available for routes to emit events
global.io = io;
app.set('io', io);

const PORT = process.env.PORT || 3000;

const sundayClinicPagePath = path.join(__dirname, '../public/sunday-clinic.html');

// Trust proxy (for Nginx reverse proxy)
app.set('trust proxy', 1);

// Security headers
app.use(helmet({
    contentSecurityPolicy: false, // Disable if using inline scripts
    crossOriginEmbedderPolicy: false
}));

// Response compression
app.use(compression());

// Performance metrics tracking
app.use(metricsMiddleware);

// Request logging
app.use(requestLogger);
app.use(performanceLogger);

// CORS - allow multiple origins including Chrome extension and mobile apps
const allowedOrigins = [
    process.env.CORS_ORIGIN,
    'https://simrs.melinda.co.id',  // Chrome extension for SIMRS Melinda export
    'capacitor://localhost',        // Capacitor Android/iOS app
    'http://localhost',             // Capacitor local dev
    'ionic://localhost',            // Ionic apps
    'https://localhost'             // Secure localhost
].filter(Boolean);

app.use(cors({
    origin: function(origin, callback) {
        // Allow requests with no origin (mobile apps, Postman, etc)
        if (!origin) return callback(null, true);

        if (allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(null, false);
        }
    },
    credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Smart rate limiting — IP-keyed, endpoint-tiered
const { authLimiter, expensiveLimiter, standardLimiter, coalesce, getCoalesceStats } = require('./middleware/rateLimiter');
app.use('/api/auth/', authLimiter);
app.use('/api/ai/', expensiveLimiter);
app.use('/api/medical-import/', expensiveLimiter);
app.use('/api/usg-bulk-upload/', expensiveLimiter);
app.use('/api/pdf/', expensiveLimiter);
app.use('/api/', standardLimiter);

// Request coalescing for high-traffic GET endpoints
app.use('/api/notifications/count', coalesce);
app.use('/api/dashboard-stats', coalesce);
app.use('/api/patients', coalesce);
app.use('/api/visits/stats', coalesce);

// Database connection pool
const pool = require('./db');

// Import routes
const obatRoutes = require('./routes/obat');
const tindakanRoutes = require('./routes/05-public-tindakan');
const patientsRoutes = require('./routes/patients');
const patientsAuthRoutes = require('./routes/patients-auth');
const tindakanProtectedRoutes = require('./routes/02-tindakan-api');
const visitsRoutes = require('./routes/visits');
const medicalExamsRoutes = require('./routes/medical-exams');
const appointmentsRoutes = require('./routes/appointments');
const appointmentArchiveRoutes = require('./routes/appointment-archive');
const dashboardStatsRoutes = require('./routes/dashboard-stats');

// Real-time routes
const chatRoutes = require('./routes/chat');
const logsRoutes = require('./routes/logs');
const statusRoutes = require('./routes/status');

// Auth routes
const authRoutes = require('./routes/auth');

// API v1 routes
const v1Routes = require('./routes/v1');

// PDF and Notification routes
const pdfRoutes = require('./routes/pdf');
const notificationRoutes = require('./routes/notifications');
// REMOVED: const emailSettingsRoutes = require('./routes/email-settings');

// Analytics routes
const analyticsRoutes = require('./routes/analytics');
const patientIntakeRoutes = require('./routes/patient-intake');
const medicalRecordsRoutes = require('./routes/medical-records');
const patientRecordsRoutes = require('./routes/patient-records');
const billingsRoutes = require('./routes/billings');
const visitInvoicesRoutes = require('./routes/visit-invoices');
const aiRoutes = require('./routes/ai');
const kickCounterRoutes = require('./routes/kick-counter');
const rumRoutes = require('./routes/rum');
const communityChatRoutes = require('./routes/community-chat');
const supportChatRoutes = require('./routes/support-chat');

// Pass Socket.io to routes
chatRoutes.setSocketIO(io);
logsRoutes.setSocketIO(io);
statusRoutes.setSocketIO(io);

// Serve static staff assets with cache headers
// Versioned assets (?v=xxx) get long cache; HTML gets no-cache
app.use(express.static(path.join(__dirname, '../public'), {
    setHeaders: (res, filePath) => {
        if (filePath.endsWith('.html')) {
            res.setHeader('Cache-Control', 'no-cache, must-revalidate');
        } else if (filePath.match(/\.(js|css)$/)) {
            // JS/CSS use ?v= versioning, safe to cache for 7 days
            res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
        } else if (filePath.match(/\.(png|jpg|jpeg|svg|webp|ico|gif|woff2?|ttf|eot)$/)) {
            // Static images/fonts cached for 30 days
            res.setHeader('Cache-Control', 'public, max-age=2592000, immutable');
        }
    }
}));

// Serve uploaded files (lab results, etc.)
app.use('/uploads', express.static(path.join(__dirname, '../uploads'), {
    maxAge: '7d'
}));

// Sunday Clinic dynamic routes (e.g., /sunday-clinic/mr0001/identitas)
app.get(/^\/sunday-clinic\/[\w-]+(?:\/.*)?$/, (req, res) => {
    res.sendFile(sundayClinicPagePath);
});

// Use routes

// ==================== PATIENT ACCESS BLOCKER ====================
// Block patients from accessing staff-only API routes
// Whitelist: routes that patients CAN access
const PATIENT_ALLOWED_ROUTES = [
    '/api/patients',           // Patient auth & profile
    '/api/patient/',           // Patient-specific endpoints (birth-congratulations, etc)
    '/api/birth-classes',      // Kelas Dr. Dibya public schedule & registration
    '/api/patient-intake',     // Patient intake form submission
    '/api/patient-documents',  // Patient documents (USG, lab results, uploads)
    '/api/patient-questions',  // Tanya Dokter - Q&A with doctor
    '/api/sunday-appointments', // Sunday clinic booking
    '/api/hospital-appointments', // Hospital booking
    '/api/articles',           // Public articles
    '/api/patient-notifications', // Patient notifications
    '/api/polls',              // Patient voting
    '/api/announcements',      // Public announcements
    '/api/greeting-cards/active', // Greeting cards (active only)
    '/api/fertility-calendar', // Fertility cycle tracking
    '/api/app',                // Mobile app version check
    '/api/app-version',        // App version check for updates
    '/api/billings/my-billings', // Patient visit history (my own billings)
    '/api/billings/',          // Billing details (with id path)
    '/api/usg-photos',         // USG photos access
    '/api/practice-schedules', // Practice schedules for all locations
    '/api/tanya-subscriptions', // Tanya Dokter - Subscription & payments
    '/api/registration-codes', // Registration code validation (for new patients)
    '/api/kick-counter',       // Kick counter for fetal movement tracking
    '/api/doctors',            // List available doctors for Q&A
    '/api/patient-billing',    // Patient billing & online payment
    '/api/community-chat',     // Community profile + chat rooms
    '/api/sunday-clinic/queue/public', // Live queue for patient portal (names masked)
    '/api/sunday-clinic/queue/settings', // Queue visibility toggle (patients need to check)
    '/api/patient-feedback',   // Patient feedback / masukan untuk pengembang
    '/api/patient-workdesk',   // Patient My Corner / workdesk sync
    '/api/support-chat',       // Support chat (bot + staff escalation)
];

app.use('/api', async (req, res, next) => {
    const fullPath = req.originalUrl || req.url;
    const isPatientFacingRoute = fullPath.startsWith('/api/auth/patient-login')
        || PATIENT_ALLOWED_ROUTES.some(route => fullPath.startsWith(route));

    if (isPatientFacingRoute && await isPatientRequestIpBlocked(req)) {
        logger.warn('Patient API request blocked by IP blocklist', {
            path: fullPath,
            ip: req.ip
        });
        return res.status(403).json({
            success: false,
            message: BLOCKED_PATIENT_MESSAGE
        });
    }

    const authHeader = req.headers['authorization'] || req.headers['Authorization'];

    // No auth header = let route handle it
    if (!authHeader) return next();

    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') return next();

    try {
        const jwt = require('jsonwebtoken');
        const payload = jwt.verify(parts[1], process.env.JWT_SECRET);

        // Check if this is a patient token
        if (payload.user_type === 'patient' || payload.role === 'patient') {
            if (isPatientIdentityBlocked(payload)) {
                rememberBlockedPatientRequestIp(req);
                logger.warn('Blocked patient token rejected', {
                    userId: payload.id,
                    email: payload.email,
                    path: req.originalUrl || req.url,
                    ip: req.ip
                });
                return res.status(403).json({
                    success: false,
                    message: BLOCKED_PATIENT_MESSAGE
                });
            }

            // Check if route is whitelisted for patients
            const isAllowed = PATIENT_ALLOWED_ROUTES.some(route => fullPath.startsWith(route));

            if (!isAllowed) {
                // Log blocked path for debugging
                console.log('[BLOCKED]', fullPath);
                logger.warn('Patient attempted staff route access', {
                    userId: payload.id,
                    email: payload.email,
                    path: fullPath,
                    ip: req.ip
                });
                return res.status(403).json({
                    success: false,
                    message: 'Akses ditolak. Anda tidak memiliki izin untuk mengakses halaman ini.'
                });
            }
        }
    } catch (err) {
        // Invalid token - let route handle it
    }

    next();
});
// ==================== END PATIENT ACCESS BLOCKER ====================

// API v1 (modern, service-based)
app.use('/api/v1', v1Routes);

// Patient authentication routes (must be before patientsRoutes to avoid conflicts)
app.use('/api/patients', patientsAuthRoutes);

// Legacy routes (keep for backward compatibility)
app.use('/', tindakanRoutes);
app.use('/', obatRoutes);
app.use('/', patientsRoutes);
app.use('/', tindakanProtectedRoutes);
app.use('/public/visits', visitsRoutes);
app.use('/public/medical-exams', medicalExamsRoutes);
app.use('/public/appointments', appointmentsRoutes);

app.use('/api/visits', visitsRoutes);
app.use('/api/medical-exams', medicalExamsRoutes);
app.use('/api/appointments', appointmentsRoutes);

// Sunday appointments routes (patient booking system)
const sundayAppointmentsRoutes = require('./routes/sunday-appointments');
app.use('/api/sunday-appointments', sundayAppointmentsRoutes);

// Hospital appointments routes
const hospitalAppointmentsRoutes = require('./routes/hospital-appointments');
app.use('/api/hospital-appointments', hospitalAppointmentsRoutes);

// Appointment archive routes
app.use('/api/appointment-archive', appointmentArchiveRoutes);

// Dashboard statistics routes
app.use('/api/dashboard-stats', dashboardStatsRoutes);

// Sunday clinic record routes
const sundayClinicRoutes = require('./routes/sunday-clinic');
app.use('/api/sunday-clinic', sundayClinicRoutes);

// Setup Socket.io handlers for Sunday Clinic
if (sundayClinicRoutes.setupSocketHandlers) {
    sundayClinicRoutes.setupSocketHandlers(io);
}

if (communityChatRoutes.setupSocketHandlers) {
    communityChatRoutes.setupSocketHandlers(io);
}

if (supportChatRoutes.setupSocketHandlers) {
    supportChatRoutes.setupSocketHandlers(io);
}

// Lab results routes (upload and AI interpretation)
const labResultsRoutes = require('./routes/lab-results');
app.use('/api/lab-results', labResultsRoutes);

// USG photos routes (upload ultrasound images)
const usgPhotosRoutes = require('./routes/usg-photos');
app.use('/api/usg-photos', usgPhotosRoutes);

// USG bulk upload routes (bulk upload from RSIA Melinda)
const usgBulkUploadRoutes = require('./routes/usg-bulk-upload');
app.use('/api/usg-bulk-upload', usgBulkUploadRoutes);

// Patient documents routes (share documents with patients)
const patientDocumentsRoutes = require('./routes/patient-documents');
app.use('/api/patient-documents', patientDocumentsRoutes);

// R2 storage proxy (for CDN connectivity issues)
const r2ProxyRoutes = require('./routes/r2-proxy');
app.use('/api/r2', r2ProxyRoutes);

// Practice schedules routes
const practiceSchedulesRoutes = require('./routes/practice-schedules');
app.use('/api/practice-schedules', practiceSchedulesRoutes);

// Real-time routes
app.use('/', chatRoutes);
app.use('/', logsRoutes);
app.use('/', statusRoutes);

// Auth routes
app.use('/', authRoutes);

// PDF and Notification routes
app.use('/api/pdf', pdfRoutes);
app.use('/api/notifications', notificationRoutes);
// REMOVED: app.use('/api/email-settings', emailSettingsRoutes);

// Analytics routes
app.use('/api/analytics', analyticsRoutes);
app.use('/', patientIntakeRoutes);

// Medical Records routes
app.use('/', medicalRecordsRoutes);
app.use('/', patientRecordsRoutes);

// Medical Import routes (parse text files to fill medical records)
const medicalImportRoutes = require('./routes/medical-import');
app.use('/', medicalImportRoutes);

// Import Field Configuration routes (manage field mappings and keywords)
const importConfigRoutes = require('./routes/import-config');
app.use('/api/import-config', importConfigRoutes);

// Billing routes
app.use('/api/billings', billingsRoutes);

// Patient billing & payment routes
const patientBillingRoutes = require('./routes/patient-billing');
app.use('/api/patient-billing', patientBillingRoutes);

// Patient estimasi biaya (pregnancy cost estimate) — tester only
const patientEstimasiBiayaRoutes = require('./routes/patient-estimasi-biaya');
app.use('/api/patient/estimasi-biaya', patientEstimasiBiayaRoutes);

// Greeting cards routes
const greetingCardsRoutes = require('./routes/greeting-cards');
app.use('/api/greeting-cards', greetingCardsRoutes);

// Announcements routes
const announcementsRoutes = require('./routes/announcements');
app.use('/api/announcements', announcementsRoutes);

// Staff Announcements routes (internal staff only)
const staffAnnouncementsRoutes = require('./routes/staff-announcements');
app.use('/api/staff-announcements', staffAnnouncementsRoutes);

// Visit invoice routes for printing and tracking
app.use('/api/visit-invoices', visitInvoicesRoutes);

// AI routes (Smart Triage, Summary, Chatbot)
app.use('/', aiRoutes);

// Kick Counter routes (fetal movement tracking)
app.use('/api/kick-counter', kickCounterRoutes);

// Role Management routes
const rolesRoutes = require('./routes/roles');
app.use('/', rolesRoutes);

// Role Visibility routes (menu visibility per role)
const roleVisibilityRoutes = require('./routes/role-visibility');
app.use('/api/role-visibility', roleVisibilityRoutes);

// Booking Settings routes (admin control for patient booking sessions)
const bookingSettingsRoutes = require('./routes/booking-settings');
app.use('/api/booking-settings', bookingSettingsRoutes);

// Kelas Dr. Dibya routes
const birthClassRoutes = require('./routes/birth-classes');
app.use('/api/birth-classes', birthClassRoutes);

// Staff Notifications routes
const notificationsRoutes = require('./routes/notifications');
app.use('/api/notifications', notificationsRoutes);

// Patient Notifications routes (for patient portal)
const patientNotificationsRoutes = require('./routes/patient-notifications');
app.use('/api/patient-notifications', patientNotificationsRoutes);

// Poll/Voting routes (staff + patient portal)
const pollsRoutes = require('./routes/polls');
app.use('/api/polls', pollsRoutes);

// Patient Activity routes (aggregated patient activities for admin dashboard)
const patientActivityRoutes = require('./routes/patient-activity');
app.use('/api/patient-activity', patientActivityRoutes);

// Patient Access Blocklist routes (dokter/superadmin only)
const patientAccessBlocklistRoutes = require('./routes/patient-access-blocklist');
app.use('/api/patient-access-blocklist', patientAccessBlocklistRoutes);

// Registration Codes routes (for patient registration control)
const registrationCodesRoutes = require('./routes/registration-codes');
app.use('/api/registration-codes', registrationCodesRoutes);

// Pregnancy cost estimate configuration routes
const estimasiBiayaRoutes = require('./routes/estimasi-biaya');
app.use('/api/estimasi-biaya', estimasiBiayaRoutes);

// Subscriptions routes (Midtrans payment for premium features)
const subscriptionsRoutes = require('./routes/subscriptions');
app.use('/api/subscriptions', subscriptionsRoutes);

// Suppliers routes (for inventory management)
const suppliersRoutes = require('./routes/suppliers');
app.use('/api/suppliers', suppliersRoutes);

// Inventory routes (stock batches, movements, FIFO)
const inventoryRoutes = require('./routes/inventory');
app.use('/api/inventory', inventoryRoutes);

// Obat Sales routes (medication sales for hospital patients)
const obatSalesRoutes = require('./routes/obat-sales');
app.use('/api/obat-sales', obatSalesRoutes);

// Health articles routes (public + admin)
const articlesRoutes = require('./routes/articles');
app.use('/api/articles', articlesRoutes);

// Invoice history routes
const invoicesRoutes = require('./routes/invoices');
app.use('/api/invoices', invoicesRoutes);

// Fertility Calendar routes (patient)
const fertilityCalendarRoutes = require('./routes/fertility-calendar');
app.use('/api/fertility-calendar', fertilityCalendarRoutes);

// App routes (mobile app version, etc)
const appRoutes = require('./routes/app');
app.use('/api/app', appRoutes);

// USG Image Reader (AI Vision)
const usgReaderRoutes = require('./routes/usg-reader');
app.use('/api/usg-reader', usgReaderRoutes);

// MEDIFY Batch Import (Puppeteer)
const medifyBatchRoutes = require('./routes/medify-batch');
app.use('/api/medify-batch', medifyBatchRoutes);

// Tanya Dokter - Patient Questions
const patientQuestionsRoutes = require('./routes/patient-questions');
app.use('/api/patient-questions', patientQuestionsRoutes);

// Patient Feedback (masukan untuk pengembang portal)
const patientFeedbackRoutes = require('./routes/patient-feedback');
app.use('/api/patient-feedback', patientFeedbackRoutes);

// Patient My Corner / Workdesk
const patientWorkdeskRoutes = require('./routes/patient-workdesk');
app.use('/api/patient-workdesk', patientWorkdeskRoutes);

// Support Chat — bot + staff escalation
app.use('/api/support-chat', supportChatRoutes);

// Staff Points (aggregated support-chat ratings + duty per month)
const staffPointsRoutes = require('./routes/staff-points');
app.use('/api/staff-points', staffPointsRoutes);

// Staff Briefing (Briefing Poli Minggu — daily checklist + duty logs)
const staffBriefingRoutes = require('./routes/staff-briefing');
app.use('/api/staff-briefing', staffBriefingRoutes);

// Staff Workdesk (Kantor Saya) routes
const staffWorkdeskRoutes = require('./routes/staff-workdesk');
app.use('/api/staff-workdesk', staffWorkdeskRoutes);

app.use('/api/community-chat', communityChatRoutes);

// Tanya Dokter - Subscriptions & Payments
const tanyaSubscriptionsRoutes = require('./routes/tanya-subscriptions');
app.use('/api/tanya-subscriptions', tanyaSubscriptionsRoutes);
// Webhook endpoint (no auth)
app.use('/api/tanya-payments', tanyaSubscriptionsRoutes);

// Xendit Payment Webhook (for billing online payments)
const xenditWebhookRoutes = require('./routes/xendit-webhook');
app.use('/api/webhooks/xendit', xenditWebhookRoutes);

// Doctors endpoint (for Q&A doctor selection)
const doctorsRoutes = require('./routes/doctors');
app.use('/api/doctors', doctorsRoutes);

// Tanya Stats endpoint (revenue reporting for Q&A)
const tanyaStatsRoutes = require('./routes/tanya-stats');
app.use('/api/tanya-stats', tanyaStatsRoutes);

// App Version endpoint (for mobile app updates)
const appVersionRoutes = require('./routes/app-version');
app.use('/api/app-version', appVersionRoutes);

// COMM Integration endpoints (API key authenticated)
const commIntegrationRoutes = require('./routes/comm-integration');
app.use('/api/integration/comm', commIntegrationRoutes);

const operationDataIntegrationRoutes = require('./routes/operation-data-integration');
app.use('/api/integration/operation-data', operationDataIntegrationRoutes);

// DocBoard routes (Doctor Scheduler PWA)
const docboardRoutes = require('./routes/docboard');
app.use('/api/docboard', docboardRoutes);

// Serve DocBoard PWA static files (production build)
const docboardDistPath = path.join(__dirname, '../../docboard/dist');
app.use('/docboard', express.static(docboardDistPath, {
    setHeaders: (res, filePath) => {
        if (filePath.endsWith('.html')) {
            res.setHeader('Cache-Control', 'no-cache, must-revalidate');
        } else if (filePath.match(/\.[a-f0-9]+\.(js|css)$/)) {
            // Vite hashed assets - cache for 1 year
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        }
    }
}));

// DocBoard SPA fallback - serve index.html for all /docboard/* routes
app.get('/docboard/*', (req, res) => {
    res.sendFile(path.join(docboardDistPath, 'index.html'));
});

// API Documentation
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
    customSiteTitle: 'Dibya Klinik API Documentation',
    customCss: '.swagger-ui .topbar { display: none }',
    swaggerOptions: {
        persistAuthorization: true
    }
}));

// RUM (Real User Monitoring) telemetry - no auth required
app.use('/api/rum', rumRoutes);

// Metrics endpoint (includes cache stats + RUM summary)
app.get('/api/metrics', (req, res) => {
    const metrics = getMetrics();
    const { getRumSummary, getCacheStats, getCostSummary } = require('./routes/rum');
    const { getDbStats } = require('./middleware/dbMonitor');
    const pdfQueue = require('./services/pdfQueue');
    metrics.rum = getRumSummary();
    metrics.cache = getCacheStats();
    metrics.db = getDbStats();
    metrics.cost = getCostSummary();
    metrics.cost.socketEventsEmitted = _socketEmitCount;
    metrics.cost.activeSocketConnections = io.sockets.sockets.size;
    metrics.coalescing = getCoalesceStats();
    metrics.pdfQueue = pdfQueue.getStats();
    metrics.enrichment = patientsRoutes.getEnrichmentStats ? patientsRoutes.getEnrichmentStats() : {};
    metrics.cluster = {
        pid: process.pid,
        workerId: process.env.NODE_APP_INSTANCE || 0,
        uptime: Math.floor(process.uptime()),
    };
    res.json(metrics);
});

// Reset metrics endpoint (admin only)
app.post('/api/metrics/reset', (req, res) => {
    resetMetrics();
    res.json({ success: true, message: 'Metrics reset successfully' });
});

// Enhanced health check
app.get('/api/health', async (req, res) => {
    try {
        const startTime = Date.now();
        await pool.query('SELECT 1');
        const dbLatency = Date.now() - startTime;
        
        const metrics = getMetrics();
        
        res.json({ 
            status: 'healthy', 
            timestamp: new Date().toISOString(),
            database: {
                status: 'connected',
                latencyMs: dbLatency
            },
            system: metrics.system,
            uptime: Math.floor(process.uptime())
        });
    } catch (error) {
        res.status(500).json({ 
            status: 'unhealthy',
            timestamp: new Date().toISOString(),
            error: error.message 
        });
    }
});

// Basic API routes
app.get('/api/patients', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM patients ORDER BY created_at DESC LIMIT 10');
        res.json({ success: true, data: rows });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 404 handler - must be after all routes
app.use(notFoundHandler);

// Global error handler - must be last
app.use(errorHandler);

// Global state for current selected patient
let currentSelectedPatient = null;

// Initialize real-time sync with Socket.IO
const realtimeSync = require('./realtime-sync');
realtimeSync.init(io);
logger.info('Real-time sync initialized with Socket.IO');

// Initialize appointment schedulers
const appointmentScheduler = require('./services/appointmentScheduler');
appointmentScheduler.initSchedulers();
logger.info('Appointment schedulers initialized');

// Track socket emission volume for cost observability
const _origIoEmit = io.emit.bind(io);
let _socketEmitCount = 0;
io.emit = function (...args) {
    _socketEmitCount++;
    return _origIoEmit(...args);
};

// Debounced users:list broadcast — coalesces rapid connect/disconnect events
let _usersListTimer = null;
function broadcastUsersList() {
    if (_usersListTimer) return; // already scheduled
    _usersListTimer = setTimeout(() => {
        _usersListTimer = null;
        const list = [];
        for (const [, client] of io.sockets.sockets) {
            if (client.userName) {
                list.push({
                    userId: client.userId,
                    name: client.userName,
                    role: client.userRole,
                    photo: client.userPhoto,
                    activity: client.userActivity || 'Idle',
                    timestamp: client.activityTimestamp || new Date().toISOString()
                });
            }
        }
        io.emit('users:list', list);
    }, 500);
}

// Socket.io connection handling
io.on('connection', (socket) => {
    const clientIp = socket.handshake.headers['x-forwarded-for'] || socket.handshake.address;
    const transport = socket.conn.transport.name;
    logger.info(`Client connected: ${socket.id} from ${clientIp} via ${transport}`);

    // User registration
    socket.on('user:register', (data) => {
        if (!data || !data.userId || !data.name) {
            logger.warn(`Invalid user:register data received: ${JSON.stringify(data)}`);
            return;
        }

        socket.userId = data.userId;
        socket.userName = data.name;
        socket.userRole = data.role;
        socket.userActivity = 'Baru bergabung';
        socket.userPhoto = data.photo || null;
        socket.activityTimestamp = new Date().toISOString();

        // Broadcast to others that a new user connected
        socket.broadcast.emit('user:connected', {
            userId: data.userId,
            name: data.name,
            role: data.role,
            photo: socket.userPhoto,
            activity: 'Baru bergabung',
            timestamp: socket.activityTimestamp
        });
        
        // Debounced broadcast of online users list
        broadcastUsersList();
        
        // Send current selected patient to newly connected user (if any)
        if (currentSelectedPatient) {
            socket.emit('patient:selected', currentSelectedPatient);
        }
    });
    
    // Activity update — throttled to max 1 broadcast per 2 seconds per socket
    socket.on('activity:update', (data) => {
        socket.userActivity = data.activity;
        socket.activityTimestamp = data.timestamp;

        const now = Date.now();
        if (!socket._lastActivityBroadcast || now - socket._lastActivityBroadcast > 2000) {
            socket._lastActivityBroadcast = now;
            socket.broadcast.emit('user:activity', {
                userId: data.userId,
                activity: data.activity,
                timestamp: data.timestamp
            });
        }
    });
    
    // Patient selection broadcast
    socket.on('patient:select', async (data) => {
        // Log activity to database
        await activityLogger.log(
            data.userId,
            data.userName,
            activityLogger.ACTIONS.VIEW_PATIENT,
            `Memilih pasien: ${data.patientName}`,
            io
        );

        // Store current selected patient globally
        currentSelectedPatient = data;

        // Broadcast to all other clients
        socket.broadcast.emit('patient:selected', data);
    });
    
    // Anamnesa update broadcast
    socket.on('anamnesa:update', async (data) => {

        // Log activity to database
        await activityLogger.log(
            data.userId,
            data.userName,
            activityLogger.ACTIONS.UPDATE_MR,
            `Update anamnesa: ${data.patientName}`,
            io
        );

        socket.broadcast.emit('anamnesa:updated', data);
    });

    // Physical exam update broadcast
    socket.on('physical:update', async (data) => {

        // Log activity to database
        await activityLogger.log(
            data.userId,
            data.userName,
            activityLogger.ACTIONS.UPDATE_MR,
            `Update pemeriksaan fisik: ${data.patientName}`,
            io
        );

        socket.broadcast.emit('physical:updated', data);
    });

    // USG exam update broadcast
    socket.on('usg:update', async (data) => {

        // Log activity to database
        await activityLogger.log(
            data.userId,
            data.userName,
            activityLogger.ACTIONS.UPDATE_MR,
            `Update USG: ${data.patientName}`,
            io
        );

        socket.broadcast.emit('usg:updated', data);
    });

    // Lab exam update broadcast
    socket.on('lab:update', async (data) => {

        // Log activity to database
        await activityLogger.log(
            data.userId,
            data.userName,
            activityLogger.ACTIONS.UPDATE_MR,
            `Update pemeriksaan penunjang: ${data.patientName}`,
            io
        );

        socket.broadcast.emit('lab:updated', data);
    });
    
    // Billing update broadcast
    socket.on('billing:update', async (data) => {

        // Log activity to database
        await activityLogger.log(
            data.userId,
            data.userName,
            activityLogger.ACTIONS.UPDATE_INVOICE,
            `Update billing: ${data.patientName}`,
            io
        );

        socket.broadcast.emit('billing:updated', data);
    });

    // Visit completion broadcast
    socket.on('visit:complete', async (data) => {

        // Log activity to database
        await activityLogger.log(
            data.userId,
            data.userName,
            activityLogger.ACTIONS.FINALIZE_VISIT,
            `Menyelesaikan kunjungan: ${data.patientName}`,
            io
        );

        socket.broadcast.emit('visit:completed', data);
    });
    
    // Announcement broadcast (to all clients including patients)
    socket.on('announcement:new', (data) => {
        io.emit('announcement:new', data);
    });
    
    // Get online users list
    socket.on('users:get-list', () => {
        const onlineUsers = [];
        for (const [id, client] of io.sockets.sockets) {
            if (client.userName) {
                onlineUsers.push({
                    userId: client.userId,
                    name: client.userName,
                    role: client.userRole,
                    photo: client.userPhoto
                });
            }
        }
        socket.emit('users:list', onlineUsers);
    });
    
    socket.on('disconnect', (reason) => {
        logger.info(`Client disconnected: ${socket.id} (${socket.userName || 'unknown'}) reason: ${reason}`);

        // Broadcast to others that user disconnected
        if (socket.userId) {
            socket.broadcast.emit('user:disconnected', {
                userId: socket.userId,
                name: socket.userName
            });
        }
        
        // Debounced broadcast of updated users list
        broadcastUsersList();
    });
});

// Async PDF queue routes
const pdfQueueRoutes = require('./routes/pdf-queue');
app.use('/api/pdf/queue', pdfQueueRoutes);

// SLO dashboard
const sloRoutes = require('./routes/slo');
app.use('/api/slo', sloRoutes);

// Start server
server.listen(PORT, () => {
    logger.info(`Backend server running on port ${PORT}`);
    logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
    logger.info('Socket.io real-time enabled');

    // Signal PM2 that the process is ready (for zero-downtime reload)
    if (typeof process.send === 'function') {
        process.send('ready');
    }
});

// Graceful shutdown — handles both SIGTERM (PM2 reload) and SIGINT (Ctrl+C)
function gracefulShutdown(signal) {
    logger.info(`${signal} received, closing server...`);
    server.close(async () => {
        logger.info('HTTP server closed');
        try {
            await pool.end();
            logger.info('Database connections closed');
        } catch (err) {
            logger.error('Error closing database pool:', err);
        }
        process.exit(0);
    });

    // Force exit after 10s if graceful shutdown stalls
    setTimeout(() => {
        logger.warn('Forced exit after 10s timeout');
        process.exit(1);
    }, 10000).unref();
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

process.on('uncaughtException', (err) => {
    // MySQL2 pool connection errors are recoverable - don't crash
    if (err.message && err.message.includes("Cannot read properties of undefined (reading 'once')")) {
        logger.warn('MySQL2 pool connection error caught - pool will auto-recover');
        return;
    }
    logger.error('Uncaught Exception:', err);
    process.exit(1);
});

process.on('unhandledRejection', (err) => {
    logger.error('Unhandled Rejection:', err);
    process.exit(1);
});

