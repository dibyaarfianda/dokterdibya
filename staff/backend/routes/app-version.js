/**
 * App Version Routes
 * Handles app version checking and download tracking for mobile apps
 */

const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const db = require('../db');
const { verifyToken } = require('../middleware/auth');

// Path to version config file
const VERSION_CONFIG_PATH = path.join(__dirname, '../../../public/app-version.json');

/**
 * GET /api/app-version
 * Get current app version info
 * Query params:
 *   - platform: 'android' or 'ios'
 *   - current_version_code: current app version code (optional)
 */
router.get('/', async (req, res) => {
    try {
        const { platform = 'android', current_version_code } = req.query;

        // Read version config
        let versionConfig;
        try {
            const configData = fs.readFileSync(VERSION_CONFIG_PATH, 'utf8');
            versionConfig = JSON.parse(configData);
        } catch (readError) {
            console.error('Error reading version config:', readError);
            return res.status(500).json({
                success: false,
                message: 'Version config not found'
            });
        }

        // Get platform-specific config
        const platformConfig = versionConfig[platform];
        if (!platformConfig) {
            return res.status(400).json({
                success: false,
                message: 'Invalid platform'
            });
        }

        // Check if update is needed
        let updateAvailable = false;
        let updateRequired = false;

        if (current_version_code) {
            const currentCode = parseInt(current_version_code);
            updateAvailable = currentCode < platformConfig.version_code;
            updateRequired = currentCode < platformConfig.min_version_code;
        }

        res.json({
            success: true,
            platform,
            version: platformConfig.version,
            version_code: platformConfig.version_code,
            min_version_code: platformConfig.min_version_code,
            download_url: platformConfig.download_url,
            release_notes: platformConfig.release_notes,
            force_update: platformConfig.force_update || updateRequired,
            update_available: updateAvailable,
            update_required: updateRequired,
            updated_at: versionConfig.updated_at
        });

    } catch (error) {
        console.error('Error checking app version:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to check app version'
        });
    }
});

/**
 * GET /api/app-version/download/:platform
 * Track download and redirect to APK file
 */
router.get('/download/:platform', async (req, res) => {
    try {
        const { platform } = req.params;
        const { v: version } = req.query;

        // Read version config to get download URL
        let versionConfig;
        try {
            const configData = fs.readFileSync(VERSION_CONFIG_PATH, 'utf8');
            versionConfig = JSON.parse(configData);
        } catch (readError) {
            return res.status(404).send('Version config not found');
        }

        const platformConfig = versionConfig[platform];
        if (!platformConfig || !platformConfig.download_url) {
            return res.status(404).send('Download not available for this platform');
        }

        // Get client IP
        const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
                   req.headers['x-real-ip'] ||
                   req.connection?.remoteAddress ||
                   req.ip ||
                   'unknown';

        // Get user agent
        const userAgent = req.headers['user-agent'] || 'unknown';

        // Log download to database
        try {
            await db.query(`
                INSERT INTO app_downloads (platform, version, ip_address, user_agent)
                VALUES (?, ?, ?, ?)
            `, [platform, version || platformConfig.version, ip, userAgent]);
        } catch (dbError) {
            console.error('Error logging download:', dbError);
            // Continue with redirect even if logging fails
        }

        // Redirect to actual download file
        const downloadUrl = platformConfig.download_url.startsWith('http')
            ? platformConfig.download_url
            : platformConfig.download_url;

        res.redirect(downloadUrl);

    } catch (error) {
        console.error('Error processing download:', error);
        res.status(500).send('Download failed');
    }
});

/**
 * GET /api/app-version/stats
 * Get download statistics (staff only)
 */
router.get('/stats', verifyToken, async (req, res) => {
    try {
        // Total downloads
        const [totalResult] = await db.query(`
            SELECT COUNT(*) as total FROM app_downloads
        `);

        // Downloads by platform
        const [byPlatform] = await db.query(`
            SELECT platform, COUNT(*) as count
            FROM app_downloads
            GROUP BY platform
        `);

        // Downloads by version
        const [byVersion] = await db.query(`
            SELECT version, platform, COUNT(*) as count
            FROM app_downloads
            GROUP BY version, platform
            ORDER BY count DESC
        `);

        // Downloads today
        const [todayResult] = await db.query(`
            SELECT COUNT(*) as count FROM app_downloads
            WHERE downloaded_at >= CURDATE() AND downloaded_at < DATE_ADD(CURDATE(), INTERVAL 1 DAY)
        `);

        // Downloads this week
        const [weekResult] = await db.query(`
            SELECT COUNT(*) as count FROM app_downloads
            WHERE downloaded_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
        `);

        // Downloads this month
        const [monthResult] = await db.query(`
            SELECT COUNT(*) as count FROM app_downloads
            WHERE downloaded_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
        `);

        // Daily downloads for chart (last 30 days)
        const [dailyDownloads] = await db.query(`
            SELECT DATE(downloaded_at) as date, COUNT(*) as count
            FROM app_downloads
            WHERE downloaded_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
            GROUP BY DATE(downloaded_at)
            ORDER BY date ASC
        `);

        // Unique IPs (approximate unique users)
        const [uniqueIps] = await db.query(`
            SELECT COUNT(DISTINCT ip_address) as count FROM app_downloads
        `);

        res.json({
            success: true,
            stats: {
                total: totalResult[0].total,
                today: todayResult[0].count,
                this_week: weekResult[0].count,
                this_month: monthResult[0].count,
                unique_users: uniqueIps[0].count,
                by_platform: byPlatform,
                by_version: byVersion,
                daily_downloads: dailyDownloads
            }
        });

    } catch (error) {
        console.error('Error getting download stats:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get download statistics'
        });
    }
});

/**
 * GET /api/app-version/logs
 * Get download logs (staff only)
 */
router.get('/logs', verifyToken, async (req, res) => {
    try {
        const { limit = 50, offset = 0, platform, date } = req.query;

        let query = `
            SELECT id, platform, version, ip_address, user_agent, downloaded_at
            FROM app_downloads
            WHERE 1=1
        `;
        const params = [];

        if (platform) {
            query += ' AND platform = ?';
            params.push(platform);
        }

        if (date) {
            query += ' AND downloaded_at >= ? AND downloaded_at < DATE_ADD(?, INTERVAL 1 DAY)';
            params.push(date, date);
        }

        query += ' ORDER BY downloaded_at DESC LIMIT ? OFFSET ?';
        params.push(parseInt(limit), parseInt(offset));

        const [logs] = await db.query(query, params);

        // Get total count
        let countQuery = 'SELECT COUNT(*) as total FROM app_downloads WHERE 1=1';
        const countParams = [];

        if (platform) {
            countQuery += ' AND platform = ?';
            countParams.push(platform);
        }

        if (date) {
            countQuery += ' AND downloaded_at >= ? AND downloaded_at < DATE_ADD(?, INTERVAL 1 DAY)';
            countParams.push(date, date);
        }

        const [countResult] = await db.query(countQuery, countParams);

        res.json({
            success: true,
            logs,
            total: countResult[0].total,
            limit: parseInt(limit),
            offset: parseInt(offset)
        });

    } catch (error) {
        console.error('Error getting download logs:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get download logs'
        });
    }
});

/**
 * POST /api/app-version/update
 * Update app version config (admin only)
 */
router.post('/update', verifyToken, async (req, res) => {
    try {
        const { platform, version, version_code, min_version_code, download_url, release_notes, force_update } = req.body;

        if (!platform || !version || !version_code) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields: platform, version, version_code'
            });
        }

        // Read current config
        let versionConfig;
        try {
            const configData = fs.readFileSync(VERSION_CONFIG_PATH, 'utf8');
            versionConfig = JSON.parse(configData);
        } catch (readError) {
            versionConfig = { android: {}, ios: {}, updated_at: null };
        }

        // Update platform config
        versionConfig[platform] = {
            version,
            version_code: parseInt(version_code),
            min_version_code: min_version_code ? parseInt(min_version_code) : parseInt(version_code),
            download_url: download_url || versionConfig[platform]?.download_url,
            release_notes: release_notes || '',
            force_update: force_update || false
        };
        versionConfig.updated_at = new Date().toISOString().split('T')[0];

        // Write updated config
        fs.writeFileSync(VERSION_CONFIG_PATH, JSON.stringify(versionConfig, null, 2));

        res.json({
            success: true,
            message: 'Version config updated',
            config: versionConfig
        });

    } catch (error) {
        console.error('Error updating app version:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update version config'
        });
    }
});

module.exports = router;
