/**
 * Dashboard Page
 */

import { api } from '../api.js';
import { auth } from '../auth.js';
import { router } from '../router.js';

function getGreeting() {
    const hour = new Date().getHours();
    if (hour < 12) return 'Selamat Pagi';
    if (hour < 15) return 'Selamat Siang';
    if (hour < 18) return 'Selamat Sore';
    return 'Selamat Malam';
}

function formatDate() {
    const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    const months = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
                    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
    const now = new Date();
    return `${days[now.getDay()]}, ${now.getDate()} ${months[now.getMonth()]} ${now.getFullYear()}`;
}

export async function renderDashboard(container) {
    const userName = auth.getUserName();

    // Initial render with loading state
    container.innerHTML = `
        <div class="fade-in">
            <!-- Welcome Card -->
            <div class="welcome-card">
                <div class="welcome-greeting">${getGreeting()},</div>
                <div class="welcome-name">${userName}</div>
                <div class="welcome-date">${formatDate()}</div>
            </div>

            <!-- Stats Grid -->
            <div class="stats-grid" id="stats-grid">
                <div class="stat-card" data-nav="queue">
                    <div class="stat-icon purple"><i class="fas fa-clipboard-list"></i></div>
                    <div class="stat-value" id="stat-queue">-</div>
                    <div class="stat-label">Antrian Hari Ini</div>
                </div>
                <div class="stat-card" data-nav="billing">
                    <div class="stat-icon orange"><i class="fas fa-file-invoice-dollar"></i></div>
                    <div class="stat-value" id="stat-pending">-</div>
                    <div class="stat-label">Pending Billing</div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon teal"><i class="fas fa-users"></i></div>
                    <div class="stat-value" id="stat-patients">-</div>
                    <div class="stat-label">Total Pasien</div>
                </div>
                <div class="stat-card" data-nav="notifications">
                    <div class="stat-icon green"><i class="fas fa-bell"></i></div>
                    <div class="stat-value" id="stat-notif">-</div>
                    <div class="stat-label">Notifikasi Baru</div>
                </div>
            </div>

            <!-- Quick Actions -->
            <div class="section-title">Aksi Cepat</div>
            <button class="action-btn" id="btn-walkin">
                <i class="fas fa-user-plus"></i>
                <span>Pasien Walk-in</span>
            </button>
            <button class="action-btn" id="btn-search">
                <i class="fas fa-search"></i>
                <span>Cari Pasien</span>
            </button>
        </div>
    `;

    // Add click handlers for stat cards
    container.querySelectorAll('.stat-card[data-nav]').forEach(card => {
        card.addEventListener('click', () => {
            router.navigate(card.dataset.nav);
        });
    });

    // Quick action handlers
    document.getElementById('btn-walkin')?.addEventListener('click', () => {
        // TODO: Implement walk-in modal
        alert('Fitur walk-in akan segera hadir');
    });

    document.getElementById('btn-search')?.addEventListener('click', () => {
        router.navigate('patients');
    });

    // Fetch stats
    try {
        // Get dashboard stats
        const statsResponse = await api.getDashboardStats();
        if (statsResponse.success && statsResponse.stats) {
            const stats = statsResponse.stats;
            document.getElementById('stat-patients').textContent = stats.totalPatients || 0;
        }

        // Get today's queue count
        const queueResponse = await api.getTodayQueue();
        if (queueResponse.success) {
            document.getElementById('stat-queue').textContent = queueResponse.queue?.length || 0;
        }

        // Get notification count
        const notifResponse = await api.getNotificationCount();
        if (notifResponse.success) {
            document.getElementById('stat-notif').textContent = notifResponse.count || 0;
        }

        // Pending billings count (we'll estimate from queue with unconfirmed status)
        // This would need a dedicated endpoint, using 0 for now
        document.getElementById('stat-pending').textContent = '0';

    } catch (error) {
        console.error('Failed to load dashboard stats:', error);
    }
}
