'use strict';

module.exports = function attachChatNotificationRoutes(router, { verifyToken, isPatientUser, chatNotifications }) {
    const patientOnly = (req, res, next) => {
        if (!isPatientUser(req.user)) return res.status(403).json({ success: false, message: 'Pengaturan ini hanya untuk pasien.' });
        next();
    };
    router.get('/me/notifications', verifyToken, patientOnly, async (req, res) => {
        try {
            res.json({ success: true, settings: await chatNotifications.getSettings(String(req.user.id)) });
        } catch (error) {
            res.status(500).json({ success: false, message: 'Gagal memuat pengaturan notifikasi chat.' });
        }
    });
    router.put('/me/notifications', verifyToken, patientOnly, async (req, res) => {
        try {
            res.json({ success: true, settings: await chatNotifications.setSettings(String(req.user.id), req.body?.enabled) });
        } catch (error) {
            res.status(error.status || 500).json({ success: false, message: error.status ? error.message : 'Gagal menyimpan pengaturan notifikasi chat.' });
        }
    });
};
