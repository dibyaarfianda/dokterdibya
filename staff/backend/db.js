require('dotenv').config();
const mysql = require('mysql2/promise');
const logger = require('./utils/logger');

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT) || 10,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0,
    connectTimeout: 10000,
    acquireTimeout: 10000,
    timeout: 30000,
    timezone: '+07:00' // GMT+7 (Jakarta/Indonesian time)
});

// Connection health check
pool.on('connection', (connection) => {
    logger.info('New database connection established');
    
    connection.on('error', (err) => {
        logger.error('Database connection error:', err);
    });
});

// Test connection on startup
(async () => {
    try {
        const connection = await pool.getConnection();
        logger.info('Database connection pool initialized successfully');
        connection.release();
    } catch (err) {
        logger.error('Failed to initialize database connection pool:', err);
        process.exit(1);
    }
})();

// Graceful pool closure
process.on('SIGINT', async () => {
    try {
        await pool.end();
        logger.info('Database connection pool closed');
        process.exit(0);
    } catch (err) {
        logger.error('Error closing database pool:', err);
        process.exit(1);
    }
});

module.exports = pool;
