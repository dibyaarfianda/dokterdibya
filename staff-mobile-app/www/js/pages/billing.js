/**
 * Billing Page
 */

import { api } from '../api.js';
import { showToast } from '../app.js';

export async function renderBilling(container) {
    container.innerHTML = `
        <div class="fade-in">
            <div class="search-bar">
                <i class="fas fa-search"></i>
                <input type="text" id="billing-search" placeholder="Cari MR ID atau nama pasien...">
            </div>

            <div class="tab-buttons mb-4" style="display: flex; gap: 8px;">
                <button class="tab-btn active" data-tab="pending">Pending</button>
                <button class="tab-btn" data-tab="confirmed">Dikonfirmasi</button>
                <button class="tab-btn" data-tab="paid">Lunas</button>
            </div>

            <div id="billing-list">
                <div class="empty-state">
                    <i class="fas fa-spinner fa-spin"></i>
                    <p>Memuat billing...</p>
                </div>
            </div>
        </div>
    `;

    // Add tab button styles
    if (!document.getElementById('tab-styles')) {
        const style = document.createElement('style');
        style.id = 'tab-styles';
        style.textContent = `
            .tab-btn {
                flex: 1;
                padding: 10px 12px;
                background: var(--bg-card);
                border: 1px solid var(--border-color);
                border-radius: 8px;
                color: var(--text-secondary);
                font-size: 13px;
                font-weight: 500;
                cursor: pointer;
                transition: all 0.2s;
            }
            .tab-btn.active {
                background: var(--color-primary);
                border-color: var(--color-primary);
                color: white;
            }
        `;
        document.head.appendChild(style);
    }

    const searchInput = document.getElementById('billing-search');
    const listContainer = document.getElementById('billing-list');
    let allBillings = [];
    let currentTab = 'pending';

    // Tab handlers
    container.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            container.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentTab = btn.dataset.tab;
            filterAndRender();
        });
    });

    // Search filter
    searchInput.addEventListener('input', filterAndRender);

    function filterAndRender() {
        const query = searchInput.value.toLowerCase();
        let filtered = allBillings;

        // Filter by tab
        if (currentTab === 'pending') {
            filtered = filtered.filter(b => !b.is_confirmed);
        } else if (currentTab === 'confirmed') {
            filtered = filtered.filter(b => b.is_confirmed && !b.is_paid);
        } else if (currentTab === 'paid') {
            filtered = filtered.filter(b => b.is_paid);
        }

        // Filter by search
        if (query) {
            filtered = filtered.filter(b =>
                b.mr_id?.toLowerCase().includes(query) ||
                b.patient_name?.toLowerCase().includes(query)
            );
        }

        renderBillingList(listContainer, filtered);
    }

    // Load billings from today's queue
    try {
        const response = await api.getTodayQueue();
        if (response.success) {
            // Transform queue items to billing format
            allBillings = (response.queue || []).filter(q => q.mr_id).map(q => ({
                mr_id: q.mr_id,
                patient_name: q.patient_name,
                patient_id: q.patient_id,
                status: q.status,
                is_confirmed: q.billing_confirmed || false,
                is_paid: q.billing_paid || false,
                total_amount: q.billing_total || 0,
                appointment_time: q.appointment_time || q.time
            }));
            filterAndRender();
        }
    } catch (error) {
        listContainer.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-exclamation-triangle"></i>
                <p>${error.message}</p>
            </div>
        `;
    }
}

function renderBillingList(container, billings) {
    if (!billings || billings.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-file-invoice"></i>
                <p>Tidak ada billing</p>
            </div>
        `;
        return;
    }

    container.innerHTML = billings.map(billing => {
        let statusClass = 'waiting';
        let statusLabel = 'Draft';

        if (billing.is_paid) {
            statusClass = 'paid';
            statusLabel = 'Lunas';
        } else if (billing.is_confirmed) {
            statusClass = 'done';
            statusLabel = 'Dikonfirmasi';
        }

        const amount = billing.total_amount ? formatCurrency(billing.total_amount) : '-';

        return `
            <div class="list-item billing-item" data-mr="${billing.mr_id}">
                <div class="list-item-icon">
                    <i class="fas fa-file-invoice-dollar"></i>
                </div>
                <div class="list-item-content">
                    <div class="list-item-title">${billing.patient_name || 'Unknown'}</div>
                    <div class="list-item-subtitle">${billing.mr_id}</div>
                </div>
                <div class="list-item-meta">
                    <div class="list-item-time">${amount}</div>
                    <span class="status-badge ${statusClass}">${statusLabel}</span>
                </div>
            </div>
        `;
    }).join('');

    // Add click handlers
    container.querySelectorAll('.billing-item').forEach(item => {
        item.addEventListener('click', () => {
            showBillingDetail(item.dataset.mr);
        });
    });
}

function formatCurrency(amount) {
    return new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        minimumFractionDigits: 0
    }).format(amount);
}

async function showBillingDetail(mrId) {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal-content" style="max-height: 80vh; overflow-y: auto;">
            <div class="modal-header">
                <h3>Detail Billing</h3>
                <button class="modal-close"><i class="fas fa-times"></i></button>
            </div>
            <div class="modal-body" id="billing-detail-body">
                <div class="empty-state">
                    <i class="fas fa-spinner fa-spin"></i>
                    <p>Memuat data...</p>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    modal.querySelector('.modal-close').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.remove();
    });

    try {
        const response = await api.getBilling(mrId);
        if (response.success) {
            const billing = response.billing || response;
            const bodyEl = document.getElementById('billing-detail-body');

            const items = billing.items || [];
            const total = billing.total_amount || items.reduce((sum, i) => sum + (i.subtotal || 0), 0);

            bodyEl.innerHTML = `
                <div class="detail-section">
                    <div class="detail-label">MR ID</div>
                    <div class="detail-value">${mrId}</div>
                </div>
                <div class="detail-section">
                    <div class="detail-label">Pasien</div>
                    <div class="detail-value">${billing.patient_name || '-'}</div>
                </div>
                <div class="detail-section">
                    <div class="detail-label">Status</div>
                    <div class="detail-value">
                        ${billing.is_paid ? '<span class="status-badge paid">Lunas</span>' :
                          billing.is_confirmed ? '<span class="status-badge done">Dikonfirmasi</span>' :
                          '<span class="status-badge waiting">Draft</span>'}
                    </div>
                </div>

                <div class="section-title mt-4">Items</div>
                ${items.length > 0 ? items.map(item => `
                    <div class="card" style="margin-bottom: 8px; padding: 12px;">
                        <div style="display: flex; justify-content: space-between;">
                            <div>
                                <div style="font-weight: 500;">${item.name || item.item_name}</div>
                                <div class="text-muted" style="font-size: 12px;">${item.type || 'item'} × ${item.quantity || 1}</div>
                            </div>
                            <div class="text-right">
                                <div>${formatCurrency(item.subtotal || item.price)}</div>
                            </div>
                        </div>
                    </div>
                `).join('') : '<div class="text-muted">Tidak ada item</div>'}

                <div class="card" style="margin-top: 16px; padding: 16px; background: var(--color-primary);">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <div style="font-weight: 600;">Total</div>
                        <div class="amount-large" style="color: white;">${formatCurrency(total)}</div>
                    </div>
                </div>

                <div class="mt-4" id="billing-actions">
                    ${!billing.is_confirmed ? `
                        <button class="btn btn-success btn-block mb-2" id="btn-confirm">
                            <i class="fas fa-check"></i> Konfirmasi Billing
                        </button>
                    ` : ''}
                    ${billing.is_confirmed && !billing.is_paid ? `
                        <button class="btn btn-success btn-block mb-2" id="btn-paid">
                            <i class="fas fa-money-bill"></i> Tandai Lunas
                        </button>
                    ` : ''}
                </div>
            `;

            // Action handlers
            document.getElementById('btn-confirm')?.addEventListener('click', async () => {
                try {
                    const res = await api.confirmBilling(mrId);
                    if (res.success) {
                        showToast('Billing dikonfirmasi');
                        modal.remove();
                        // Refresh billing list
                        const container = document.getElementById('page-container');
                        const { renderBilling } = await import('./billing.js');
                        renderBilling(container);
                    } else {
                        throw new Error(res.message);
                    }
                } catch (err) {
                    showToast(err.message, 'error');
                }
            });

            document.getElementById('btn-paid')?.addEventListener('click', async () => {
                try {
                    const res = await api.markBillingPaid(mrId);
                    if (res.success) {
                        showToast('Billing ditandai lunas');
                        modal.remove();
                        const container = document.getElementById('page-container');
                        const { renderBilling } = await import('./billing.js');
                        renderBilling(container);
                    } else {
                        throw new Error(res.message);
                    }
                } catch (err) {
                    showToast(err.message, 'error');
                }
            });

        } else {
            throw new Error(response.message || 'Gagal memuat billing');
        }
    } catch (error) {
        document.getElementById('billing-detail-body').innerHTML = `
            <div class="empty-state">
                <i class="fas fa-exclamation-triangle"></i>
                <p>${error.message}</p>
            </div>
        `;
    }
}
