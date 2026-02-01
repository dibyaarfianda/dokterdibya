/**
 * App Version Routes
 * Handles app version checking for mobile apps
 */

const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

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
 * POST /api/app-version/update
 * Update app version config (admin only)
 * Requires authentication
 */
router.post('/update', async (req, res) => {
    try {
        // Check for admin token (simple check)
        const authHeader = req.headers.authorization;
        if (!authHeader) {
            return res.status(401).json({
                success: false,
                message: 'Authorization required'
            });
        }

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
