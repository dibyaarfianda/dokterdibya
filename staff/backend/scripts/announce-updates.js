#!/usr/bin/env node
/**
 * Broadcast announcement about latest updates to all patients
 * Usage: node announce-updates.js
 * Run from: /var/www/dokterdibya/staff/backend/scripts/
 */

require('dotenv').config({ path: '../.env' });
const db = require('../db');
const logger = require('../utils/logger');

async function broadcastAnnouncement() {
    try {
        console.log('\n🎉 Broadcasting announcement about 5 latest updates...\n');

        const announcementData = {
            title: '🎉 Pembaruan Portal Pasien - Perbaikan Album USG & Performa',
            message: 'Kami telah merilis 5 pembaruan untuk meningkatkan pengalaman Anda. Silakan reload portal untuk mendapatkan update terbaru!',
            formatted_content: `<h3>Pembaruan Terbaru Portal Dokter Dibya</h3><p>Kami dengan senang hati mengumumkan beberapa perbaikan penting untuk portal pasien Anda:</p><ul><li><strong>✅ Perbaikan Album USG</strong> - Foto USG sekarang dapat dimuat dengan lebih cepat dan stabil</li><li><strong>⚡ Optimasi Performa</strong> - Portal sekarang menggunakan smart caching untuk loading yang lebih baik</li><li><strong>🔧 Pesan Error yang Lebih Jelas</strong> - Jika ada masalah, Anda akan melihat pesan yang lebih detail untuk membantu kami</li><li><strong>📱 Dukungan PWA Lebih Baik</strong> - Service worker dioptimalkan untuk update otomatis tanpa perlu hard reset</li><li><strong>🚀 Performa Cache Ditingkatkan</strong> - Data cache secara otomatis diperbarui dengan versi terbaru</li></ul><p><strong>Apa yang perlu Anda lakukan?</strong></p><p>Cukup reload halaman (tekan F5) atau buka kembali aplikasi. Semua update akan langsung berlaku!</p><p>Terima kasih telah menggunakan Portal Dokter Dibya. Kami terus berinovasi untuk memberikan layanan terbaik.</p>`,
            content_type: 'html',
            created_by: 'system',
            created_by_name: 'Sistem Dokter Dibya',
            priority: 'urgent',
            status: 'active'
        };

        console.log('📝 Inserting announcement to database...');

        const [result] = await db.query(
            `INSERT INTO announcements (
                title, message, formatted_content, content_type,
                created_by, created_by_name, priority, status, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
            [
                announcementData.title,
                announcementData.message,
                announcementData.formatted_content,
                announcementData.content_type,
                announcementData.created_by,
                announcementData.created_by_name,
                announcementData.priority,
                announcementData.status
            ]
        );

        console.log('✅ Announcement created successfully!\n');
        console.log(`📊 Details:`);
        console.log(`   - ID: ${result.insertId}`);
        console.log(`   - Title: ${announcementData.title}`);
        console.log(`   - Priority: ${announcementData.priority.toUpperCase()}`);
        console.log(`   - Status: ${announcementData.status.toUpperCase()}`);
        console.log(`   - Created: ${new Date().toLocaleString('id-ID')}`);

        // Get announcement count
        const [countResult] = await db.query('SELECT COUNT(*) as total FROM announcements WHERE status = "active"');
        console.log(`\n📢 Total active announcements: ${countResult[0].total}\n`);

        console.log('💡 Patients will see notification when they open the portal next time.\n');
        console.log('✨ Update broadcast complete!\n');

        process.exit(0);
    } catch (error) {
        console.error('\n❌ Error creating announcement:', error.message);
        console.error(error);
        logger.error('Broadcast announcement error', error);
        process.exit(1);
    }
}

// Run if called directly
if (require.main === module) {
    broadcastAnnouncement();
}

module.exports = { broadcastAnnouncement };
