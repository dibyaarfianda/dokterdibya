/**
 * Simple SPA Router
 */

class Router {
    constructor() {
        this.routes = {};
        this.currentPage = null;
    }

    register(name, handler) {
        this.routes[name] = handler;
    }

    async navigate(pageName, params = {}) {
        const handler = this.routes[pageName];
        if (!handler) {
            console.error(`Route not found: ${pageName}`);
            return;
        }

        // Update active nav item
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.toggle('active', item.dataset.page === pageName);
        });

        // Update page title
        const titles = {
            dashboard: 'Dashboard',
            queue: 'Antrian Hari Ini',
            patients: 'Cari Pasien',
            billing: 'Billing',
            notifications: 'Notifikasi'
        };
        document.getElementById('page-title').textContent = titles[pageName] || pageName;

        // Clear and render new page
        const container = document.getElementById('page-container');
        container.innerHTML = '<div class="loading-page"><div class="spinner"></div></div>';
        container.scrollTop = 0;

        try {
            this.currentPage = pageName;
            await handler(container, params);
        } catch (error) {
            console.error('Page render error:', error);
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-exclamation-triangle"></i>
                    <p>Gagal memuat halaman</p>
                    <p class="text-muted">${error.message}</p>
                </div>
            `;
        }
    }

    getCurrentPage() {
        return this.currentPage;
    }
}

export const router = new Router();
export default router;
