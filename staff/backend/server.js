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
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const { requestLogger, performanceLogger } = require('./middleware/requestLogger');
const { metricsMiddleware, getMetrics, resetMetrics } = require('./middleware/metrics');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./config/swagger');

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

// Middleware
app.use(cors({
    origin: process.env.CORS_ORIGIN,
    credentials: true
}));
app.use(express.json({ limit: '10mb' }));

// Rate limiting COMPLETELY DISABLED for development
// Uncomment and configure for production use
/*
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: 'Too many login attempts, please try again later',
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true,
});
app.use('/api/auth/', authLimiter);

const limiter = rateLimit({
    windowMs: 60000,
    max: 1000,
    message: 'Too many requests from this IP, please try again later',
    standardHeaders: true,
    legacyHeaders: false,
});
app.use('/api/', limiter);
*/

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

// Pass Socket.io to routes
chatRoutes.setSocketIO(io);
logsRoutes.setSocketIO(io);
statusRoutes.setSocketIO(io);

// Serve static staff assets directly from the merged repo
app.use(express.static(path.join(__dirname, '../public')));

// Serve uploaded files (lab results, etc.)
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Sunday Clinic dynamic routes (e.g., /sunday-clinic/mr0001/identitas)
app.get(/^\/sunday-clinic\/[\w-]+(?:\/.*)?$/, (req, res) => {
    res.sendFile(sundayClinicPagePath);
});

// Use routes
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

// Lab results routes (upload and AI interpretation)
const labResultsRoutes = require('./routes/lab-results');
app.use('/api/lab-results', labResultsRoutes);

// USG photos routes (upload ultrasound images)
const usgPhotosRoutes = require('./routes/usg-photos');
app.use('/api/usg-photos', usgPhotosRoutes);

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

// Announcements routes
const announcementsRoutes = require('./routes/announcements');
app.use('/api/announcements', announcementsRoutes);

// Visit invoice routes for printing and tracking
app.use('/api/visit-invoices', visitInvoicesRoutes);

// AI routes (Smart Triage, Summary, Chatbot)
app.use('/', aiRoutes);

// Role Management routes
const rolesRoutes = require('./routes/roles');
app.use('/', rolesRoutes);

// Role Visibility routes (menu visibility per role)
const roleVisibilityRoutes = require('./routes/role-visibility');
app.use('/api/role-visibility', roleVisibilityRoutes);

// Booking Settings routes (admin control for patient booking sessions)
const bookingSettingsRoutes = require('./routes/booking-settings');
app.use('/api/booking-settings', bookingSettingsRoutes);

// Staff Notifications routes
const notificationsRoutes = require('./routes/notifications');
app.use('/api/notifications', notificationsRoutes);

// Patient Notifications routes (for patient portal)
const patientNotificationsRoutes = require('./routes/patient-notifications');
app.use('/api/patient-notifications', patientNotificationsRoutes);

// Registration Codes routes (for patient registration control)
const registrationCodesRoutes = require('./routes/registration-codes');
app.use('/api/registration-codes', registrationCodesRoutes);

// Subscriptions routes (Midtrans payment for premium features)
const subscriptionsRoutes = require('./routes/subscriptions');
app.use('/api/subscriptions', subscriptionsRoutes);

// Suppliers routes (for inventory management)
const suppliersRoutes = require('./routes/suppliers');
app.use('/api/suppliers', suppliersRoutes);

// Inventory routes (stock batches, movements, FIFO)
const inventoryRoutes = require('./routes/inventory');
app.use('/api/inventory', inventoryRoutes);

// API Documentation
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
    customSiteTitle: 'Dibya Klinik API Documentation',
    customCss: '.swagger-ui .topbar { display: none }',
    swaggerOptions: {
        persistAuthorization: true
    }
}));

// Metrics endpoint
app.get('/api/metrics', (req, res) => {
    const metrics = getMetrics();
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

        logger.info(`User registered on socket: ${data.name} (${data.role}) [ID: ${data.userId}]`);
        
        // Broadcast to others that a new user connected
        socket.broadcast.emit('user:connected', {
            userId: data.userId,
            name: data.name,
            role: data.role,
            photo: socket.userPhoto,
            activity: 'Baru bergabung',
            timestamp: socket.activityTimestamp
        });
        
        // Send current online users list to all clients (including newly connected)
        const onlineUsersList = [];
        for (const [id, client] of io.sockets.sockets) {
            if (client.userName) {
                onlineUsersList.push({
                    userId: client.userId,
                    name: client.userName,
                    role: client.userRole,
                    photo: client.userPhoto,
                    activity: client.userActivity || 'Idle',
                    timestamp: client.activityTimestamp || new Date().toISOString()
                });
            }
        }
        io.emit('users:list', onlineUsersList);
        
        // Send current selected patient to newly connected user (if any)
        if (currentSelectedPatient) {
            logger.info(`Sending current patient to new user ${data.name}: ${currentSelectedPatient.patientName} (ID: ${currentSelectedPatient.patientId})`);
            socket.emit('patient:selected', currentSelectedPatient);
        } else {
            logger.info(`No current patient selected, skipping auto-select for ${data.name}`);
        }
    });
    
    // Activity update
    socket.on('activity:update', (data) => {
        socket.userActivity = data.activity;
        socket.activityTimestamp = data.timestamp;
        
        // Broadcast activity to all other clients
        socket.broadcast.emit('user:activity', {
            userId: data.userId,
            activity: data.activity,
            timestamp: data.timestamp
        });
    });
    
    // Patient selection broadcast
    socket.on('patient:select', (data) => {
        logger.info(`Patient selected by ${data.userName}: ${data.patientName} (ID: ${data.patientId})`);
        
        // Store current selected patient globally
        currentSelectedPatient = data;
        logger.info(`Current selected patient stored: ${JSON.stringify(currentSelectedPatient)}`);
        
        // Broadcast to all other clients (including future connections)
        socket.broadcast.emit('patient:selected', data);
        logger.info(`Broadcast patient:selected to all other clients`);
    });
    
    // Anamnesa update broadcast
    socket.on('anamnesa:update', (data) => {
        logger.info(`Anamnesa updated by ${data.userName} for ${data.patientName}`);
        socket.broadcast.emit('anamnesa:updated', data);
    });
    
    // Physical exam update broadcast
    socket.on('physical:update', (data) => {
        logger.info(`Physical exam updated by ${data.userName} for ${data.patientName}`);
        socket.broadcast.emit('physical:updated', data);
    });
    
    // USG exam update broadcast
    socket.on('usg:update', (data) => {
        logger.info(`USG exam updated by ${data.userName} for ${data.patientName}`);
        socket.broadcast.emit('usg:updated', data);
    });
    
    // Lab exam update broadcast
    socket.on('lab:update', (data) => {
        logger.info(`Lab exam updated by ${data.userName} for ${data.patientName}`);
        socket.broadcast.emit('lab:updated', data);
    });
    
    // Billing update broadcast
    socket.on('billing:update', (data) => {
        logger.info(`Billing updated by ${data.userName} for ${data.patientName}`);
        socket.broadcast.emit('billing:updated', data);
    });
    
    // Visit completion broadcast
    socket.on('visit:complete', (data) => {
        logger.info(`Visit completed by ${data.userName} for ${data.patientName}`);
        socket.broadcast.emit('visit:completed', data);
    });
    
    // Announcement broadcast (to all clients including patients)
    socket.on('announcement:new', (data) => {
        logger.info(`New announcement created: ${data.title} by ${data.created_by_name}`);
        // Broadcast to all connected clients
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
        
        // Broadcast updated online users list to all remaining clients
        const onlineUsersList = [];
        for (const [id, client] of io.sockets.sockets) {
            if (client.userName) {
                onlineUsersList.push({
                    userId: client.userId,
                    name: client.userName,
                    role: client.userRole
                });
            }
        }
        io.emit('users:list', onlineUsersList);
    });
});

// Start server
server.listen(PORT, () => {
    logger.info(`Backend server running on port ${PORT}`);
    logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
    logger.info('Socket.io real-time enabled');
});

// Graceful shutdown
process.on('SIGTERM', async () => {
    logger.info('SIGTERM received, closing server...');
    server.close(async () => {
        logger.info('HTTP server closed');
        await pool.end();
        logger.info('Database connections closed');
        process.exit(0);
    });
});

process.on('uncaughtException', (err) => {
    logger.error('Uncaught Exception:', err);
    process.exit(1);
});

process.on('unhandledRejection', (err) => {
    logger.error('Unhandled Rejection:', err);
    process.exit(1);
});

