const express = require('express');
const router = express.Router();
const db = require('../db');

/**
 * GET /api/app/version
 * Returns the latest version info for the Android app
 * Used by the app to check for updates
 */
router.get('/version', async (req, res) => {
    try {
        // Get version from settings table, or return default
        const [settings] = await db.query(
            "SELECT setting_value FROM settings WHERE setting_key = 'android_app_version'"
        );

        let versionInfo = {
            versionCode: 1,
            versionName: "1.0.0",
            downloadUrl: "https://dokterdibya.com/dokterdibya-patient-latest.apk",
            releaseNotes: "Versi awal aplikasi dokterDIBYA untuk pasien.",
            forceUpdate: false,
            minVersionCode: 1
        };

        // Parse from settings if available
        if (settings.length > 0 && settings[0].setting_value) {
            try {
                const parsed = JSON.parse(settings[0].setting_value);
                versionInfo = { ...versionInfo, ...parsed };
            } catch (e) {
                // Use default if parsing fails
            }
        }

        res.json({
            success: true,
            version: versionInfo
        });
    } catch (error) {
        console.error('App version check error:', error);
        // Return default even on error
        res.json({
            success: true,
            version: {
                versionCode: 1,
                versionName: "1.0.0",
                downloadUrl: "https://dokterdibya.com/dokterdibya-patient-latest.apk",
                releaseNotes: "Versi awal aplikasi.",
                forceUpdate: false,
                minVersionCode: 1
            }
        });
    }
});

/**
 * POST /api/app/version (Admin only)
 * Update app version info
 */
router.post('/version', async (req, res) => {
    try {
        const { versionCode, versionName, downloadUrl, releaseNotes, forceUpdate, minVersionCode } = req.body;

        const versionInfo = JSON.stringify({
            versionCode: versionCode || 1,
            versionName: versionName || "1.0.0",
            downloadUrl: downloadUrl || "https://dokterdibya.com/dokterdibya-patient-latest.apk",
            releaseNotes: releaseNotes || "",
            forceUpdate: forceUpdate || false,
            minVersionCode: minVersionCode || 1
        });

        // Upsert into settings
        await db.query(
            `INSERT INTO settings (setting_key, setting_value)
             VALUES ('android_app_version', ?)
             ON DUPLICATE KEY UPDATE setting_value = ?`,
            [versionInfo, versionInfo]
        );

        res.json({
            success: true,
            message: 'Version info updated'
        });
    } catch (error) {
        console.error('Update app version error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update version info'
        });
    }
});

module.exports = router;
