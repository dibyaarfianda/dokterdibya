#!/usr/bin/env node
/**
 * Broadcast announcement about latest updates using existing API + Socket.IO
 * Usage: node broadcast-announcement-via-api.js
 * Run from: /var/www/dokterdibya/staff/backend/scripts/
 *
 * This script uses the existing POST /api/announcements endpoint which:
 * - Inserts to database
 * - Emits Socket.IO event to all connected clients (real-time!)
 * - Sends push notifications to all patients
 */

require('dotenv').config({ path: '../.env' });
const axios = require('axios');
const logger = require('../utils/logger');

const API_BASE = process.env.API_BASE || 'http://localhost:3000';
// Get a valid admin token for API authentication
const ADMIN_TOKEN = process.env.ADMIN_BROADCAST_TOKEN || process.env.JWT_SECRET;

async function broadcastAnnouncement() {
    try {
        console.log('\n🎉 Broadcasting announcement via Socket.IO + Push Notifications...\n');

        const announcementData = {
            title: '🎉 Pembaruan Portal Pasien - Perbaikan Album USG & Performa',
            message: 'Kami telah merilis 5 pembaruan untuk meningkatkan pengalaman Anda. Silakan reload portal untuk mendapatkan update terbaru!',
            formatted_content: `<h3>Pembaruan Terbaru Portal Dokter Dibya</h3><p>Kami dengan senang hati mengumumkan beberapa perbaikan penting untuk portal pasien Anda:</p><ul><li><strong>✅ Perbaikan Album USG</strong> - Foto USG sekarang dapat dimuat dengan lebih cepat dan stabil</li><li><strong>⚡ Optimasi Performa</strong> - Portal sekarang menggunakan smart caching untuk loading yang lebih baik</li><li><strong>🔧 Pesan Error yang Lebih Jelas</strong> - Jika ada masalah, Anda akan melihat pesan yang lebih detail untuk membantu kami</li><li><strong>📱 Dukungan PWA Lebih Baik</strong> - Service worker dioptimalkan untuk update otomatis tanpa perlu hard reset</li><li><strong>🚀 Performa Cache Ditingkatkan</strong> - Data cache secara otomatis diperbarui dengan versi terbaru</li></ul><p><strong>Apa yang perlu Anda lakukan?</strong></p><p>Cukup reload halaman (tekan F5) atau buka kembali aplikasi. Semua update akan langsung berlaku!</p><p>Terima kasih telah menggunakan Portal Dokter Dibya. Kami terus berinovasi untuk memberikan layanan terbaik.</p>`,
            content_type: 'html',
            priority: 'high',
            status: 'active'
        };

        console.log('📡 Sending to POST /api/announcements...');

        const response = await axios.post(`${API_BASE}/api/announcements`, announcementData, {
            headers: {
                'Authorization': `Bearer ${ADMIN_TOKEN}`,
                'Content-Type': 'application/json'
            }
        });

        if (response.data.success) {
            console.log('✅ Announcement created successfully!\n');
            console.log(`📊 Details:`);
            console.log(`   - ID: ${response.data.data.id}`);
            console.log(`   - Title: ${response.data.data.title}`);
            console.log(`   - Priority: ${response.data.data.priority.toUpperCase()}`);
            console.log(`   - Status: ${response.data.data.status.toUpperCase()}`);

            console.log('\n🌐 Socket.IO Events Triggered:');
            console.log('   - announcement:new event emitted to all connected clients');
            console.log('   - Push notifications sent to all patients');

            console.log('\n💡 Benefits of System Broadcast:');
            console.log('   ✓ Real-time delivery via Socket.IO');
            console.log('   ✓ Push notifications automatically sent');
            console.log('   ✓ Database insertion handled');
            console.log('   ✓ No manual script needed');

            console.log('\n✨ Update broadcast complete!\n');
            process.exit(0);
        } else {
            throw new Error(response.data.message || 'Failed to create announcement');
        }
    } catch (error) {
        console.error('\n❌ Error broadcasting announcement:');
        console.error(error.response?.data || error.message);
        logger.error('Broadcast announcement error', error);
        process.exit(1);
    }
}

// Run if called directly
if (require.main === module) {
    broadcastAnnouncement();
}

module.exports = { broadcastAnnouncement };
