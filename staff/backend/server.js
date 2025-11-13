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
    }
});
const PORT = process.env.PORT || 3000;

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

// Analytics routes
const analyticsRoutes = require('./routes/analytics');
const patientIntakeRoutes = require('./routes/patient-intake');
const medicalRecordsRoutes = require('./routes/medical-records');
const patientRecordsRoutes = require('./routes/patient-records');
const billingsRoutes = require('./routes/billings');

// Pass Socket.io to routes
chatRoutes.setSocketIO(io);
logsRoutes.setSocketIO(io);
statusRoutes.setSocketIO(io);

// Serve static staff assets directly from the merged repo
app.use(express.static(path.join(__dirname, '../public')));

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

// Analytics routes
app.use('/api/analytics', analyticsRoutes);
app.use('/', patientIntakeRoutes);

// Medical Records routes
app.use('/', medicalRecordsRoutes);
app.use('/', patientRecordsRoutes);

// Billing routes
app.use('/api/billings', billingsRoutes);

// Role Management routes
const rolesRoutes = require('./routes/roles');
app.use('/', rolesRoutes);

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

// Socket.io connection handling
io.on('connection', (socket) => {
    logger.info(`Client connected: ${socket.id}`);
    
    // User registration
    socket.on('user:register', (data) => {
        socket.userId = data.userId;
        socket.userName = data.name;
        socket.userRole = data.role;
        socket.userActivity = 'Baru bergabung';
        socket.userPhoto = data.photo || null;
        socket.activityTimestamp = new Date().toISOString();
        
        logger.info(`User registered on socket: ${data.name} (${data.role})`);
        
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
    
    socket.on('disconnect', () => {
        logger.info(`Client disconnected: ${socket.id} (${socket.userName || 'unknown'})`);
        
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

