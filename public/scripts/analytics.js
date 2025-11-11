/**
 * Analytics Dashboard Script
 */

import { getIdToken } from './vps-auth-v2.js';

const API_BASE_URL = window.location.hostname === 'localhost' 
    ? 'http://localhost:3000/api' 
    : '/api';

// Chart instances
let revenueChart, visitsChart, hourChart, demographicsChart, medicationsChart;

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
    // Set default date range (last 30 days)
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);
    
    document.getElementById('startDate').valueAsDate = startDate;
    document.getElementById('endDate').valueAsDate = endDate;
    
    // Load dashboard stats
    loadDashboardStats();
    
    // Load analytics with default date range
    loadAnalytics();
});

/**
 * Load dashboard statistics
 */
async function loadDashboardStats() {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${API_BASE_URL}/analytics/dashboard`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        const result = await response.json();
        
        if (result.success) {
            renderDashboardStats(result.data);
        }
    } catch (error) {
        console.error('Failed to load dashboard stats:', error);
    }
}

/**
 * Render dashboard statistics cards
 */
function renderDashboardStats(stats) {
    const html = `
        <div class="col-lg-3 col-6">
            <div class="small-box bg-info stats-card">
                <div class="inner">
                    <h3>${stats.today.visits_today || 0}</h3>
                    <p>Kunjungan Hari Ini</p>
                </div>
                <div class="icon">
                    <i class="fas fa-calendar-day"></i>
                </div>
            </div>
        </div>
        <div class="col-lg-3 col-6">
            <div class="small-box bg-success stats-card">
                <div class="inner">
                    <h3>${formatCurrency(stats.today.revenue_today || 0)}</h3>
                    <p>Pendapatan Hari Ini</p>
                </div>
                <div class="icon">
                    <i class="fas fa-money-bill-wave"></i>
                </div>
            </div>
        </div>
        <div class="col-lg-3 col-6">
            <div class="small-box bg-warning stats-card">
                <div class="inner">
                    <h3>${stats.thisMonth.visits_this_month || 0}</h3>
                    <p>Kunjungan Bulan Ini</p>
                </div>
                <div class="icon">
                    <i class="fas fa-calendar-alt"></i>
                </div>
            </div>
        </div>
        <div class="col-lg-3 col-6">
            <div class="small-box bg-danger stats-card">
                <div class="inner">
                    <h3>${stats.stock.low_stock_count || 0}</h3>
                    <p>Obat Stok Rendah</p>
                </div>
                <div class="icon">
                    <i class="fas fa-exclamation-triangle"></i>
                </div>
            </div>
        </div>
    `;
    
    document.getElementById('dashboardStats').innerHTML = html;
}

/**
 * Load all analytics data
 */
async function loadAnalytics() {
    const startDate = document.getElementById('startDate').value;
    const endDate = document.getElementById('endDate').value;
    
    if (!startDate || !endDate) {
        alert('Silakan pilih rentang tanggal');
        return;
    }
    
    try {
        const token = localStorage.getItem('token');
        
        // Load all analytics in parallel
        const [revenue, visits, demographics, medications, doctors] = await Promise.all([
            fetch(`${API_BASE_URL}/analytics/revenue?startDate=${startDate}&endDate=${endDate}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            }).then(r => r.json()),
            
            fetch(`${API_BASE_URL}/analytics/visits?startDate=${startDate}&endDate=${endDate}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            }).then(r => r.json()),
            
            fetch(`${API_BASE_URL}/analytics/demographics`, {
                headers: { 'Authorization': `Bearer ${token}` }
            }).then(r => r.json()),
            
            fetch(`${API_BASE_URL}/analytics/medications?startDate=${startDate}&endDate=${endDate}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            }).then(r => r.json()),
            
            fetch(`${API_BASE_URL}/analytics/doctors?startDate=${startDate}&endDate=${endDate}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            }).then(r => r.json())
        ]);
        
        // Render all charts
        if (revenue.success) renderRevenueChart(revenue.data);
        if (visits.success) {
            renderVisitsChart(visits.data);
            renderHourChart(visits.data);
        }
        if (demographics.success) renderDemographicsChart(demographics.data);
        if (medications.success) {
            renderMedicationsChart(medications.data);
            renderLowStockTable(medications.data.lowStockItems);
        }
        if (doctors.success) renderDoctorTable(doctors.data);
        
    } catch (error) {
        console.error('Failed to load analytics:', error);
        alert('Gagal memuat data analytics');
    }
}

/**
 * Render revenue chart
 */
function renderRevenueChart(data) {
    const ctx = document.getElementById('revenueChart').getContext('2d');
    
    if (revenueChart) {
        revenueChart.destroy();
    }
    
    revenueChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: data.dailyRevenue.map(d => formatDate(d.date)),
            datasets: [{
                label: 'Pendapatan (Rp)',
                data: data.dailyRevenue.map(d => d.total_revenue),
                borderColor: 'rgb(75, 192, 192)',
                backgroundColor: 'rgba(75, 192, 192, 0.2)',
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return 'Pendapatan: ' + formatCurrency(context.parsed.y);
                        }
                    }
                }
            }
        }
    });
}

/**
 * Render visits chart
 */
function renderVisitsChart(data) {
    const ctx = document.getElementById('visitsChart').getContext('2d');
    
    if (visitsChart) {
        visitsChart.destroy();
    }
    
    visitsChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: data.dailyVisits.map(d => formatDate(d.date)),
            datasets: [{
                label: 'Jumlah Kunjungan',
                data: data.dailyVisits.map(d => d.visit_count),
                backgroundColor: 'rgba(54, 162, 235, 0.6)'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false
        }
    });
}

/**
 * Render hour distribution chart
 */
function renderHourChart(data) {
    const ctx = document.getElementById('hourChart').getContext('2d');
    
    if (hourChart) {
        hourChart.destroy();
    }
    
    hourChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: data.hourDistribution.map(d => d.hour + ':00'),
            datasets: [{
                label: 'Jumlah Kunjungan',
                data: data.hourDistribution.map(d => d.visit_count),
                backgroundColor: 'rgba(255, 159, 64, 0.6)'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false
        }
    });
}

/**
 * Render demographics chart
 */
function renderDemographicsChart(data) {
    const ctx = document.getElementById('demographicsChart').getContext('2d');
    
    if (demographicsChart) {
        demographicsChart.destroy();
    }
    
    demographicsChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: data.ageDistribution.map(d => d.age_group),
            datasets: [{
                data: data.ageDistribution.map(d => d.count),
                backgroundColor: [
                    'rgba(255, 99, 132, 0.6)',
                    'rgba(54, 162, 235, 0.6)',
                    'rgba(255, 206, 86, 0.6)',
                    'rgba(75, 192, 192, 0.6)',
                    'rgba(153, 102, 255, 0.6)'
                ]
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false
        }
    });
}

/**
 * Render medications chart
 */
function renderMedicationsChart(data) {
    const ctx = document.getElementById('medicationsChart').getContext('2d');
    
    if (medicationsChart) {
        medicationsChart.destroy();
    }
    
    medicationsChart = new Chart(ctx, {
        type: 'horizontalBar',
        data: {
            labels: data.topMedications.map(d => d.name),
            datasets: [{
                label: 'Jumlah Penggunaan',
                data: data.topMedications.map(d => d.usage_count),
                backgroundColor: 'rgba(153, 102, 255, 0.6)'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            indexAxis: 'y'
        }
    });
}

/**
 * Render doctor performance table
 */
function renderDoctorTable(data) {
    const tbody = document.getElementById('doctorTableBody');
    
    if (data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center">Tidak ada data</td></tr>';
        return;
    }
    
    tbody.innerHTML = data.map(doctor => `
        <tr>
            <td>${doctor.doctor_name}</td>
            <td>${doctor.total_visits}</td>
            <td>${doctor.unique_patients}</td>
            <td>${formatCurrency(doctor.avg_revenue_per_visit || 0)}</td>
            <td>${formatCurrency(doctor.total_revenue || 0)}</td>
        </tr>
    `).join('');
}

/**
 * Render low stock table
 */
function renderLowStockTable(data) {
    const tbody = document.getElementById('lowStockTableBody');
    
    if (data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center text-success">Semua stok aman</td></tr>';
        return;
    }
    
    tbody.innerHTML = data.map(item => `
        <tr class="${item.stock === 0 ? 'table-danger' : 'table-warning'}">
            <td>${item.name}</td>
            <td>${item.category || '-'}</td>
            <td>${item.stock}</td>
            <td>${item.min_stock}</td>
            <td>${item.shortage}</td>
        </tr>
    `).join('');
}

/**
 * Export to Excel
 */
async function exportToExcel() {
    alert('Fungsi export Excel akan segera tersedia');
}

/**
 * Format currency to IDR
 */
function formatCurrency(amount) {
    return new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        minimumFractionDigits: 0
    }).format(amount);
}

/**
 * Format date to Indonesian
 */
function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('id-ID', {
        day: '2-digit',
        month: 'short'
    });
}

/**
 * Logout function
 */
function logout() {
    if (confirm('Apakah Anda yakin ingin keluar?')) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.href = 'login.html';
    }
}

// ============================================
// VPS Analytics Integration for Main Dashboard
// ============================================

const VPS_API_BASE = 'https://praktekdrdibya.com';

let analyticsData = {
    weeklyRevenue: [],
    monthlyRevenue: [],
    topDrugs: [],
    topServices: [],
    totalRevenue: 0,
    totalVisits: 0
};

function getWeeklyDateRange() {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 6);
    return { start, end };
}

function getMonthlyDateRange() {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 29);
    return { start, end };
}

async function fetchVisitsData() {
    try {
        const token = await getIdToken();
        if (!token) return [];
        
        const response = await fetch(`${VPS_API_BASE}/api/visits?exclude_dummy=true`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!response.ok) return [];
        
        const result = await response.json();
        if (!result.success || !result.data) return [];
        
        const visits = result.data.map(visit => {
            const visitDate = new Date(visit.visit_date || visit.created_at);
            const services = visit.services || [];
            const obat = visit.medications || [];
            
            return {
                id: visit.id,
                ...visit,
                date: visitDate,
                services,
                obat,
                grandTotal: parseFloat(visit.grand_total || visit.total_amount || 0)
            };
        });
        
        return visits;
    } catch (err) {
        console.error('Failed to fetch visits:', err);
        return [];
    }
}

function analyzeWeeklyRevenue(visits) {
    const { start, end } = getWeeklyDateRange();
    const dailyRevenue = {};
    
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const dateKey = d.toISOString().split('T')[0];
        dailyRevenue[dateKey] = 0;
    }
    
    visits.forEach(visit => {
        const visitDate = new Date(visit.date);
        if (visitDate >= start && visitDate <= end) {
            const dateKey = visitDate.toISOString().split('T')[0];
            dailyRevenue[dateKey] = (dailyRevenue[dateKey] || 0) + (visit.grandTotal || 0);
        }
    });
    
    return Object.entries(dailyRevenue).map(([date, revenue]) => ({
        date,
        dateLabel: new Date(date).toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short' }),
        revenue
    }));
}

function analyzeMonthlyRevenue(visits) {
    const { start, end } = getMonthlyDateRange();
    const dailyRevenue = {};
    
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const dateKey = d.toISOString().split('T')[0];
        dailyRevenue[dateKey] = 0;
    }
    
    visits.forEach(visit => {
        const visitDate = new Date(visit.date);
        if (visitDate >= start && visitDate <= end) {
            const dateKey = visitDate.toISOString().split('T')[0];
            dailyRevenue[dateKey] = (dailyRevenue[dateKey] || 0) + (visit.grandTotal || 0);
        }
    });
    
    return Object.entries(dailyRevenue).map(([date, revenue]) => ({
        date,
        dateLabel: new Date(date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }),
        revenue
    }));
}

function analyzeTopDrugs(visits) {
    const drugStats = {};
    
    visits.forEach(visit => {
        if (visit.obat && Array.isArray(visit.obat)) {
            visit.obat.forEach(item => {
                if (item.category === 'drugs') {
                    const key = item.name;
                    if (!drugStats[key]) {
                        drugStats[key] = {
                            name: item.name,
                            quantity: 0,
                            revenue: 0
                        };
                    }
                    drugStats[key].quantity += item.quantity || 1;
                    drugStats[key].revenue += (item.price || 0) * (item.quantity || 1);
                }
            });
        }
    });
    
    return Object.values(drugStats)
        .sort((a, b) => b.quantity - a.quantity)
        .slice(0, 10);
}

function analyzeTopServices(visits) {
    const serviceStats = {};
    
    visits.forEach(visit => {
        if (visit.services && Array.isArray(visit.services)) {
            visit.services.forEach(service => {
                const key = service.name || service;
                if (!serviceStats[key]) {
                    serviceStats[key] = {
                        name: key,
                        count: 0,
                        revenue: 0
                    };
                }
                serviceStats[key].count += 1;
                serviceStats[key].revenue += service.price || 0;
            });
        }
    });
    
    return Object.values(serviceStats)
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);
}

function calculateTotalStats(visits) {
    const totalRevenue = visits.reduce((sum, visit) => sum + (visit.grandTotal || 0), 0);
    const totalVisits = visits.length;
    
    return { totalRevenue, totalVisits };
}

export async function loadVPSAnalytics() {
    try {
        const visits = await fetchVisitsData();
        
        analyticsData.weeklyRevenue = analyzeWeeklyRevenue(visits);
        analyticsData.monthlyRevenue = analyzeMonthlyRevenue(visits);
        analyticsData.topDrugs = analyzeTopDrugs(visits);
        analyticsData.topServices = analyzeTopServices(visits);
        
        const stats = calculateTotalStats(visits);
        analyticsData.totalRevenue = stats.totalRevenue;
        analyticsData.totalVisits = stats.totalVisits;
        
        return analyticsData;
    } catch (err) {
        console.error('Failed to load analytics:', err);
        return analyticsData;
    }
}

export function renderWeeklyRevenueChart(data) {
    const container = document.getElementById('weekly-revenue-chart');
    if (!container) return;
    
    const maxRevenue = Math.max(...data.map(d => d.revenue), 1);
    
    let html = '<div class="chart-container" style="height: 200px; display: flex; align-items: flex-end; gap: 5px;">';
    
    data.forEach(day => {
        const height = (day.revenue / maxRevenue) * 100;
        html += `
            <div class="chart-bar" style="flex: 1; display: flex; flex-direction: column; align-items: center;">
                <div class="bar-value" style="font-size: 10px; margin-bottom: 5px;">${formatCurrency(day.revenue)}</div>
                <div class="bar" style="width: 100%; height: ${height}%; background: linear-gradient(to top, #007bff, #00d4ff); border-radius: 4px 4px 0 0; min-height: 5px;"></div>
                <div class="bar-label" style="font-size: 11px; margin-top: 5px; text-align: center;">${day.dateLabel}</div>
            </div>
        `;
    });
    
    html += '</div>';
    container.innerHTML = html;
}

export function renderMonthlyRevenueChart(data) {
    const container = document.getElementById('monthly-revenue-chart');
    if (!container) return;
    
    const maxRevenue = Math.max(...data.map(d => d.revenue), 1);
    
    let html = '<div class="chart-container" style="height: 200px; display: flex; align-items: flex-end; gap: 2px; overflow-x: auto;">';
    
    data.forEach(day => {
        const height = (day.revenue / maxRevenue) * 100;
        html += `
            <div class="chart-bar" style="min-width: 20px; display: flex; flex-direction: column; align-items: center;">
                <div class="bar" style="width: 100%; height: ${height}%; background: linear-gradient(to top, #28a745, #7dff7d); border-radius: 4px 4px 0 0; min-height: 3px;" title="${day.dateLabel}: ${formatCurrency(day.revenue)}"></div>
                <div class="bar-label" style="font-size: 9px; margin-top: 3px; writing-mode: vertical-rl; transform: rotate(180deg);">${day.dateLabel.split(' ')[0]}</div>
            </div>
        `;
    });
    
    html += '</div>';
    container.innerHTML = html;
}

export function renderTopDrugsTable(drugs) {
    const container = document.getElementById('top-drugs-table');
    if (!container) return;
    
    if (drugs.length === 0) {
        container.innerHTML = '<p class="text-muted text-center">Belum ada data obat terjual</p>';
        return;
    }
    
    let html = '<table class="table table-sm table-hover"><thead><tr><th>Obat</th><th class="text-right">Qty</th><th class="text-right">Revenue</th></tr></thead><tbody>';
    
    drugs.forEach((drug, index) => {
        html += `
            <tr>
                <td><span class="badge badge-primary mr-2">${index + 1}</span>${drug.name}</td>
                <td class="text-right"><strong>${drug.quantity}</strong></td>
                <td class="text-right text-success">${formatCurrency(drug.revenue)}</td>
            </tr>
        `;
    });
    
    html += '</tbody></table>';
    container.innerHTML = html;
}

export function renderTopServicesTable(services) {
    const container = document.getElementById('top-services-table');
    if (!container) return;
    
    if (services.length === 0) {
        container.innerHTML = '<p class="text-muted text-center">Belum ada data tindakan</p>';
        return;
    }
    
    let html = '<table class="table table-sm table-hover"><thead><tr><th>Tindakan</th><th class="text-right">Count</th><th class="text-right">Revenue</th></tr></thead><tbody>';
    
    services.forEach((service, index) => {
        html += `
            <tr>
                <td><span class="badge badge-success mr-2">${index + 1}</span>${service.name}</td>
                <td class="text-right"><strong>${service.count}x</strong></td>
                <td class="text-right text-success">${formatCurrency(service.revenue)}</td>
            </tr>
        `;
    });
    
    html += '</tbody></table>';
    container.innerHTML = html;
}

export function renderSummaryStats(data) {
    const weeklyTotal = data.weeklyRevenue.reduce((sum, day) => sum + day.revenue, 0);
    const monthlyTotal = data.monthlyRevenue.reduce((sum, day) => sum + day.revenue, 0);
    
    const weeklyAvg = weeklyTotal / 7;
    const weeklyTotalEl = document.getElementById('weekly-total');
    if (weeklyTotalEl) weeklyTotalEl.textContent = formatCurrency(weeklyTotal);
    const weeklyAvgEl = document.getElementById('weekly-avg');
    if (weeklyAvgEl) weeklyAvgEl.textContent = formatCurrency(weeklyAvg);
    
    const monthlyAvg = monthlyTotal / 30;
    const monthlyTotalEl = document.getElementById('monthly-total');
    if (monthlyTotalEl) monthlyTotalEl.textContent = formatCurrency(monthlyTotal);
    const monthlyAvgEl = document.getElementById('monthly-avg');
    if (monthlyAvgEl) monthlyAvgEl.textContent = formatCurrency(monthlyAvg);
    
    const totalRevenueEl = document.getElementById('total-revenue');
    if (totalRevenueEl) totalRevenueEl.textContent = formatCurrency(data.totalRevenue);
    const totalVisitsEl = document.getElementById('total-visits');
    if (totalVisitsEl) totalVisitsEl.textContent = data.totalVisits;
}

export async function initAnalyticsDashboard() {
    const data = await loadVPSAnalytics();
    
    renderWeeklyRevenueChart(data.weeklyRevenue);
    renderMonthlyRevenueChart(data.monthlyRevenue);
    renderTopDrugsTable(data.topDrugs);
    renderTopServicesTable(data.topServices);
    renderSummaryStats(data);
}
