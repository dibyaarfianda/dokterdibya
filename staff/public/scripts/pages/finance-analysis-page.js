    import { getIdToken } from '../vps-auth-v2.js';
    import { createPageRequestScope } from '../staff-api.js';
    import { escapeAttribute, escapeHtml } from '../safe-render.js';

    let financeRequestScope = createPageRequestScope();

    const VPS_API_BASE = ['localhost', '127.0.0.1'].includes(window.location.hostname)
        ? 'http://localhost:3001'
        : window.location.origin.replace(/\/$/, '');

    function formatCurrency(amount) {
        return new Intl.NumberFormat('id-ID', {
            style: 'currency',
            currency: 'IDR',
            minimumFractionDigits: 0
        }).format(amount || 0);
    }

    function withCacheBuster(url) {
        const cacheBuster = `_=${Date.now()}`;
        return url.includes('?') ? `${url}&${cacheBuster}` : `${url}?${cacheBuster}`;
    }

    function formatDateLocal(date) {
        try {
            const parts = new Intl.DateTimeFormat('en-US', {
                timeZone: 'Asia/Jakarta',
                year: 'numeric',
                month: '2-digit',
                day: '2-digit'
            }).formatToParts(date);
            const byType = Object.fromEntries(parts.map(part => [part.type, part.value]));
            return `${byType.year}-${byType.month}-${byType.day}`;
        } catch (error) {
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        }
    }

    async function fetchFinanceStats(token) {
        const today = new Date();
        const todayStr = formatDateLocal(today);

        const url = `${VPS_API_BASE}/api/visits/stats/finance?start_date=${todayStr}&end_date=${todayStr}`;
        const payload = await financeRequestScope.request(url);
        return payload.data; // { totalVisits, totalRevenue, averageBill }
    }

    async function loadKPIStats() {
        const visitsEl = document.getElementById('kpi-total-visits');
        const revenueEl = document.getElementById('kpi-revenue');
        const avgBillEl = document.getElementById('kpi-avg-bill');

        if (!visitsEl || !revenueEl || !avgBillEl) return;

        try {
            const token = await getIdToken();
            if (!token) {
                visitsEl.textContent = '0';
                revenueEl.textContent = formatCurrency(0);
                avgBillEl.textContent = formatCurrency(0);
                return;
            }

            const { totalVisits, totalRevenue, averageBill } = await fetchFinanceStats(token);

            visitsEl.textContent = totalVisits.toLocaleString('id-ID');
            revenueEl.textContent = formatCurrency(totalRevenue);
            avgBillEl.textContent = formatCurrency(averageBill);
        } catch (error) {
            console.error('Error loading KPI stats:', error);
            visitsEl.textContent = '0';
            revenueEl.textContent = formatCurrency(0);
            avgBillEl.textContent = formatCurrency(0);
        }
    }

    async function fetchAnalyticsData(token) {
        const today = new Date();
        const weekAgo = new Date(today);
        weekAgo.setDate(weekAgo.getDate() - 6);
        const monthAgo = new Date(today);
        monthAgo.setDate(monthAgo.getDate() - 29);

        const startDate = formatDateLocal(monthAgo);
        const endDate = formatDateLocal(today);

        const url = withCacheBuster(`${VPS_API_BASE}/api/visits?exclude_dummy=true&start_date=${startDate}&end_date=${endDate}`);
        const payload = await financeRequestScope.request(url);
        const visits = Array.isArray(payload.data) ? payload.data : [];

        return analyzeData(visits);
    }

    function analyzeData(visits) {
        const today = new Date();
        const weekAgo = new Date(today);
        weekAgo.setDate(weekAgo.getDate() - 6);
        const monthAgo = new Date(today);
        monthAgo.setDate(monthAgo.getDate() - 29);

        const weeklyData = [];
        for (let i = 0; i < 7; i++) {
            const date = new Date(weekAgo);
            date.setDate(date.getDate() + i);
            const dateStr = formatDateLocal(date);

            const dayVisits = visits.filter(v => {
                const visitDate = new Date(v.visit_date || v.created_at);
                return formatDateLocal(visitDate) === dateStr;
            });

            const revenue = dayVisits.reduce((sum, v) => {
                const total = Number(v.grand_total ?? v.grandTotal ?? v.total_amount ?? 0);
                return sum + (Number.isFinite(total) ? total : 0);
            }, 0);

            weeklyData.push({ date: dateStr, revenue });
        }

        const monthlyData = [];
        for (let i = 0; i < 30; i++) {
            const date = new Date(monthAgo);
            date.setDate(date.getDate() + i);
            const dateStr = formatDateLocal(date);

            const dayVisits = visits.filter(v => {
                const visitDate = new Date(v.visit_date || v.created_at);
                return formatDateLocal(visitDate) === dateStr;
            });

            const revenue = dayVisits.reduce((sum, v) => {
                const total = Number(v.grand_total ?? v.grandTotal ?? v.total_amount ?? 0);
                return sum + (Number.isFinite(total) ? total : 0);
            }, 0);

            monthlyData.push({ date: dateStr, revenue });
        }

        const drugStats = {};
        visits.forEach(visit => {
            let medications = [];
            if (typeof visit.medications === 'string') {
                try {
                    medications = JSON.parse(visit.medications);
                } catch (e) {
                    console.error('Error parsing medications:', e);
                }
            } else if (Array.isArray(visit.medications)) {
                medications = visit.medications;
            }

            if (Array.isArray(medications)) {
                medications.forEach(drug => {
                    const name = drug.name || 'Unknown';
                    const qty = Number(drug.quantity) || 0;
                    const price = Number(drug.price) || 0;
                    const total = qty * price;

                    if (!drugStats[name]) {
                        drugStats[name] = { name, quantity: 0, revenue: 0 };
                    }
                    drugStats[name].quantity += qty;
                    drugStats[name].revenue += total;
                });
            }
        });

        const topDrugs = Object.values(drugStats)
            .sort((a, b) => b.revenue - a.revenue)
            .slice(0, 10);

        const serviceStats = {};
        visits.forEach(visit => {
            let services = [];
            if (typeof visit.services === 'string') {
                try {
                    services = JSON.parse(visit.services);
                } catch (e) {
                    console.error('Error parsing services:', e);
                }
            } else if (Array.isArray(visit.services)) {
                services = visit.services;
            }

            if (Array.isArray(services)) {
                services.forEach(service => {
                    const name = service.name || 'Unknown';
                    const price = Number(service.price) || 0;

                    if (!serviceStats[name]) {
                        serviceStats[name] = { name, count: 0, revenue: 0 };
                    }
                    serviceStats[name].count += 1;
                    serviceStats[name].revenue += price;
                });
            }
        });

        const topServices = Object.values(serviceStats)
            .sort((a, b) => b.revenue - a.revenue)
            .slice(0, 10);

        return {
            weeklyRevenue: weeklyData,
            monthlyRevenue: monthlyData,
            topDrugs,
            topServices
        };
    }

    function renderWeeklyRevenueChart(data) {
        console.log('[INFO] Rendering weekly revenue chart with', data.length, 'data points');
        const container = document.getElementById('weekly-revenue-chart');
        if (!container) {
            console.error('[ERROR] weekly-revenue-chart container not found');
            return;
        }

        container.innerHTML = '';

        try {
            const options = {
            series: [{
                name: 'Pemasukan',
                data: data.map(d => d.revenue)
            }],
            chart: {
                type: 'area',
                height: 250,
                toolbar: { show: false }
            },
            dataLabels: { enabled: false },
            stroke: { curve: 'smooth', width: 2 },
            xaxis: {
                categories: data.map(d => {
                    const date = new Date(d.date);
                    return date.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
                })
            },
            yaxis: {
                labels: {
                    formatter: function(val) {
                        return formatCurrency(val);
                    }
                }
            },
            tooltip: {
                y: {
                    formatter: function(val) {
                        return formatCurrency(val);
                    }
                }
            },
            fill: {
                type: 'gradient',
                gradient: {
                    shadeIntensity: 1,
                    opacityFrom: 0.7,
                    opacityTo: 0.3
                }
            },
            colors: ['#007bff']
            };

            const chart = new ApexCharts(container, options);
            chart.render();
            console.log('[OK] Weekly chart rendered');

            const total = data.reduce((sum, d) => sum + d.revenue, 0);
            const avg = total / data.length;
            const weeklyTotalEl = document.getElementById('weekly-total');
            const weeklyAvgEl = document.getElementById('weekly-avg');
            if (weeklyTotalEl) weeklyTotalEl.textContent = formatCurrency(total);
            if (weeklyAvgEl) weeklyAvgEl.textContent = formatCurrency(avg);
        } catch (error) {
            console.error('[ERROR] Error rendering weekly chart:', error);
        }
    }

    function renderMonthlyRevenueChart(data) {
        console.log('[INFO] Rendering monthly revenue chart with', data.length, 'data points');
        const container = document.getElementById('monthly-revenue-chart');
        if (!container) {
            console.error('[ERROR] monthly-revenue-chart container not found');
            return;
        }

        container.innerHTML = '';

        try {

        const options = {
            series: [{
                name: 'Pemasukan',
                data: data.map(d => d.revenue)
            }],
            chart: {
                type: 'line',
                height: 250,
                toolbar: { show: false }
            },
            dataLabels: { enabled: false },
            stroke: { curve: 'smooth', width: 2 },
            xaxis: {
                categories: data.map(d => {
                    const date = new Date(d.date);
                    return date.getDate();
                }),
                labels: {
                    rotate: -45,
                    rotateAlways: false
                }
            },
            yaxis: {
                labels: {
                    formatter: function(val) {
                        return formatCurrency(val);
                    }
                }
            },
            tooltip: {
                y: {
                    formatter: function(val) {
                        return formatCurrency(val);
                    }
                }
            },
            colors: ['#28a745']
            };

            const chart = new ApexCharts(container, options);
            chart.render();
            console.log('[OK] Monthly chart rendered');

            const total = data.reduce((sum, d) => sum + d.revenue, 0);
            const avg = total / data.length;
            const monthlyTotalEl = document.getElementById('monthly-total');
            const monthlyAvgEl = document.getElementById('monthly-avg');
            if (monthlyTotalEl) monthlyTotalEl.textContent = formatCurrency(total);
            if (monthlyAvgEl) monthlyAvgEl.textContent = formatCurrency(avg);
        } catch (error) {
            console.error('[ERROR] Error rendering monthly chart:', error);
        }
    }

    function renderTopDrugsTable(drugs) {
        console.log('[INFO] Rendering top drugs table with', drugs.length, 'items');
        const container = document.getElementById('top-drugs-table');
        if (!container) {
            console.error('[ERROR] top-drugs-table container not found');
            return;
        }

        if (!drugs.length) {
            container.innerHTML = '<div class="text-center text-muted py-3">Tidak ada data</div>';
            console.log('[INFO] No drugs data');
            return;
        }

        let html = '<table class="table table-sm table-hover">';
        html += '<thead><tr><th>#</th><th>Nama Obat</th><th>Qty</th><th>Revenue</th></tr></thead>';
        html += '<tbody>';
        drugs.forEach((drug, idx) => {
            html += `<tr>
                <td>${idx + 1}</td>
                <td>${drug.name}</td>
                <td>${drug.quantity}</td>
                <td>${formatCurrency(drug.revenue)}</td>
            </tr>`;
        });
        html += '</tbody></table>';
        container.innerHTML = html;
    }

    function renderTopServicesTable(services) {
        console.log('[INFO] Rendering top services table with', services.length, 'items');
        const container = document.getElementById('top-services-table');
        if (!container) {
            console.error('[ERROR] top-services-table container not found');
            return;
        }

        if (!services.length) {
            container.innerHTML = '<div class="text-center text-muted py-3">Tidak ada data</div>';
            console.log('[INFO] No services data');
            return;
        }

        let html = '<table class="table table-sm table-hover">';
        html += '<thead><tr><th>#</th><th>Nama Tindakan</th><th>Jumlah</th><th>Revenue</th></tr></thead>';
        html += '<tbody>';
        services.forEach((service, idx) => {
            html += `<tr>
                <td>${idx + 1}</td>
                <td>${service.name}</td>
                <td>${service.count}</td>
                <td>${formatCurrency(service.revenue)}</td>
            </tr>`;
        });
        html += '</tbody></table>';
        container.innerHTML = html;
    }

    async function loadAnalytics() {
        try {
            const token = await getIdToken();
            if (!token) {
                throw new Error('No token');
            }

            const data = await fetchAnalyticsData(token);

            if (document.getElementById('weekly-revenue-chart')) {
                renderWeeklyRevenueChart(data.weeklyRevenue);
            }
            if (document.getElementById('monthly-revenue-chart')) {
                renderMonthlyRevenueChart(data.monthlyRevenue);
            }
            if (document.getElementById('top-drugs-table')) {
                renderTopDrugsTable(data.topDrugs);
            }
            if (document.getElementById('top-services-table')) {
                renderTopServicesTable(data.topServices);
            }
        } catch (error) {
            console.error('Error loading analytics:', error);
            const drugsTable = document.getElementById('top-drugs-table');
            const servicesTable = document.getElementById('top-services-table');
            if (drugsTable) drugsTable.innerHTML = '<div class="text-center text-danger py-3">Error loading data</div>';
            if (servicesTable) servicesTable.innerHTML = '<div class="text-center text-danger py-3">Error loading data</div>';
        }
    }

    async function initFinanceAnalysisPage() {
        console.log('[INFO] initFinanceAnalysisPage called');
        if (financeRequestScope.signal.aborted) financeRequestScope = createPageRequestScope();

        const page = document.getElementById('finance-analysis-page');
        if (!page) {
            console.error('[ERROR] finance-analysis-page element not found');
            return;
        }

        console.log('[OK] Page found, checking visibility...');

        const token = await getIdToken();
        if (!token) {
            console.error('[ERROR] No auth token');
            return;
        }

        console.log('[OK] Token obtained, loading data...');

        try {
            await loadKPIStats();
            const hasLegacyAnalyticsContainers = [
                'weekly-revenue-chart',
                'monthly-revenue-chart',
                'top-drugs-table',
                'top-services-table'
            ].some(id => document.getElementById(id));
            if (hasLegacyAnalyticsContainers) {
                await loadAnalytics();
            }
            await loadObatProfitAnalysis();
            // Initialize and load Private Clinic Analysis
            initPrivateClinicMonthSelector();
            await loadPrivateClinicAnalysis();
            console.log('[OK] Finance Analysis data loaded successfully');
        } catch (error) {
            console.error('[ERROR] Error in initFinanceAnalysisPage:', error);
        }
    }

    // Load Obat Profit Analysis
    async function loadObatProfitAnalysis() {
        try {
            const token = await getIdToken();
            if (!token) return;

            // Get first day of current month
            const now = new Date();
            const startDate = formatDateLocal(new Date(now.getFullYear(), now.getMonth(), 1));
            const endDate = formatDateLocal(now);

            // Fetch profit data
            const [profitData, summary] = await Promise.all([
                financeRequestScope.request(`/api/inventory/profit?start_date=${startDate}&end_date=${endDate}`),
                financeRequestScope.request(`/api/inventory/summary?start_date=${startDate}&end_date=${endDate}`)
            ]);

            if (profitData) {
                // Update KPI cards
                const totals = profitData.totals || {};
                document.getElementById('profit-revenue').textContent = 'Rp ' + (totals.totalRevenue || 0).toLocaleString('id-ID');
                document.getElementById('profit-cost').textContent = 'Rp ' + (totals.totalCost || 0).toLocaleString('id-ID');
                document.getElementById('profit-gross').textContent = 'Rp ' + (totals.totalProfit || 0).toLocaleString('id-ID');
                document.getElementById('profit-margin').textContent = (totals.profitMargin || 0) + '%';

                // Update items table
                const tbody = document.getElementById('profit-items-body');
                const items = profitData.items || [];

                if (items.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">Belum ada data penjualan obat bulan ini</td></tr>';
                } else {
                    tbody.innerHTML = items.map(item => {
                        const revenue = parseFloat(item.revenue) || 0;
                        const cost = parseFloat(item.cost) || 0;
                        const profit = parseFloat(item.profit) || 0;
                        const margin = revenue > 0 ? ((profit / revenue) * 100).toFixed(1) : 0;
                        const marginClass = margin >= 30 ? 'text-success' : margin >= 15 ? 'text-warning' : 'text-danger';

                        return `
                            <tr>
                                <td>${escapeHtml(item.name || '-')}</td>
                                <td class="text-right">${item.qty_sold || 0}</td>
                                <td class="text-right">Rp ${revenue.toLocaleString('id-ID')}</td>
                                <td class="text-right">Rp ${cost.toLocaleString('id-ID')}</td>
                                <td class="text-right font-weight-bold ${profit >= 0 ? 'text-success' : 'text-danger'}">
                                    Rp ${profit.toLocaleString('id-ID')}
                                </td>
                                <td class="text-right ${marginClass}">${margin}%</td>
                            </tr>
                        `;
                    }).join('');
                }
            }

            if (summary) {
                // Show expiring items alert
                if (summary.expiringItemsCount > 0) {
                    document.getElementById('expiring-alert').style.display = 'block';
                    document.getElementById('expiring-count').textContent = summary.expiringItemsCount;
                } else {
                    document.getElementById('expiring-alert').style.display = 'none';
                }

                // Show low stock alert
                if (summary.lowStockCount > 0) {
                    document.getElementById('lowstock-alert').style.display = 'block';
                    document.getElementById('lowstock-count').textContent = summary.lowStockCount;
                } else {
                    document.getElementById('lowstock-alert').style.display = 'none';
                }
            }
        } catch (error) {
            console.error('Load obat profit analysis error:', error);
        }
    }

    window.loadObatProfitAnalysis = loadObatProfitAnalysis;

    // Private Clinic Analysis Functions
    function initPrivateClinicMonthSelector() {
        const select = document.getElementById('private-clinic-month');
        if (!select) return;

        const now = new Date();
        select.innerHTML = '';

        // Generate last 12 months
        for (let i = 0; i < 12; i++) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            const label = d.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
            const option = document.createElement('option');
            option.value = value;
            option.textContent = label;
            select.appendChild(option);
        }

        select.addEventListener('change', () => loadPrivateClinicAnalysis());
    }

    async function loadPrivateClinicAnalysis() {
        const token = await getIdToken();
        if (!token) return;

        const monthSelect = document.getElementById('private-clinic-month');
        const month = monthSelect ? monthSelect.value : '';

        try {
            const result = await financeRequestScope.request(`/api/analytics/private-clinic?month=${encodeURIComponent(month)}`);
            const data = result.data;

            // Format currency helper
            const formatRp = (num) => 'Rp ' + Math.round(num || 0).toLocaleString('id-ID');
            const formatPercent = (num) => (num || 0).toFixed(1) + '%';

            // Update KPI cards
            document.getElementById('pc-pendapatan-kotor').textContent = formatRp(data.summary.pendapatanKotor);
            document.getElementById('pc-laba-kotor').textContent = formatRp(data.summary.labaKotor);
            document.getElementById('pc-laba-bersih').textContent = formatRp(data.netProfit.labaBersih);
            document.getElementById('pc-margin-bersih').textContent = formatPercent(data.netProfit.marginLabaBersih);

            // Update KPI side panel
            document.getElementById('pc-kunjungan').textContent = data.summary.totalKunjungan;
            document.getElementById('pc-hari-kerja').textContent = data.summary.totalHariKerja + ' hari';
            document.getElementById('pc-laba-per-hari').textContent = formatRp(data.netProfit.labaPerHari);
            document.getElementById('pc-laba-per-kunjungan').textContent = formatRp(data.netProfit.labaPerKunjungan);

            const staffCost = data.staffCost || {};
            const payrollLabel = staffCost.batchCount > 0
                ? `Gaji Staff (${staffCost.batchCount} batch, ${staffCost.paidStaffCount || 0} staff dibayar, ${staffCost.totalKehadiran || 0} hadir)`
                : 'Gaji Staff (belum ada payroll finalized)';
            const driverPayrollLabel = staffCost.driverPayrollCount > 0
                ? `Gaji Supir (${staffCost.driverPayrollCount} bulan finalized)`
                : 'Gaji Supir (belum ada payroll finalized)';

            // Update Profit Loss Table
            const plTable = document.getElementById('pc-profit-loss-table');
            plTable.innerHTML = `
                <tr class="bg-light"><td colspan="2"><strong>PENDAPATAN</strong></td></tr>
                <tr><td class="pl-4">Tindakan (Jasa Medis)</td><td class="text-right">${formatRp(data.summary.pendapatanTindakan)}</td></tr>
                <tr><td class="pl-4">Penjualan Obat</td><td class="text-right">${formatRp(data.summary.pendapatanObat)}</td></tr>
                <tr class="font-weight-bold"><td>Total Pendapatan Kotor</td><td class="text-right">${formatRp(data.summary.pendapatanKotor)}</td></tr>
                <tr class="bg-light"><td colspan="2"><strong>HPP (HARGA POKOK)</strong></td></tr>
                <tr><td class="pl-4">HPP Obat</td><td class="text-right text-danger">(${formatRp(data.summary.totalHPP)})</td></tr>
                <tr class="font-weight-bold border-top"><td>Laba Kotor</td><td class="text-right text-info">${formatRp(data.summary.labaKotor)}</td></tr>
                <tr class="bg-light"><td colspan="2"><strong>BIAYA OPERASIONAL</strong></td></tr>
                <tr><td class="pl-4">Sewa, Listrik, Air</td><td class="text-right text-muted">Rp 0 <small>(ditanggung RS)</small></td></tr>
                <tr><td class="pl-4">${payrollLabel}</td><td class="text-right text-danger">(${formatRp(staffCost.totalGajiPraktik || 0)})</td></tr>
                <tr><td class="pl-4">${driverPayrollLabel}</td><td class="text-right text-danger">(${formatRp(staffCost.totalGajiSupir || 0)})</td></tr>
                <tr class="font-weight-bold bg-success text-white"><td>LABA BERSIH</td><td class="text-right">${formatRp(data.netProfit.labaBersih)}</td></tr>
                <tr><td class="text-muted">Margin Laba Bersih</td><td class="text-right text-success font-weight-bold">${formatPercent(data.netProfit.marginLabaBersih)}</td></tr>
            `;

            // Update Tindakan by Category
            const tindakanBody = document.getElementById('pc-tindakan-category-body');
            if (data.breakdown.tindakanByCategory.length === 0) {
                tindakanBody.innerHTML = '<tr><td colspan="3" class="text-center text-muted py-3">Tidak ada data</td></tr>';
            } else {
                tindakanBody.innerHTML = data.breakdown.tindakanByCategory.map(cat => `
                    <tr>
                        <td><span class="badge badge-secondary">${cat.category}</span></td>
                        <td class="text-right">${cat.jumlah_transaksi}</td>
                        <td class="text-right font-weight-bold">${formatRp(parseFloat(cat.total_pendapatan))}</td>
                    </tr>
                `).join('');
            }

            // Update Obat Profit
            const obatBody = document.getElementById('pc-obat-profit-body');
            if (data.breakdown.obatAnalysis.length === 0) {
                obatBody.innerHTML = '<tr><td colspan="4" class="text-center text-muted py-3">Tidak ada data</td></tr>';
            } else {
                obatBody.innerHTML = data.breakdown.obatAnalysis.map(obat => {
                    const margin = parseFloat(obat.margin_persen) || 0;
                    const marginClass = margin >= 30 ? 'text-success' : margin >= 15 ? 'text-warning' : 'text-danger';
                    const profit = parseFloat(obat.keuntungan_kotor) || 0;
                    return `
                        <tr>
                            <td>${obat.item_name}</td>
                            <td class="text-right">${obat.total_qty}</td>
                            <td class="text-right">${formatRp(profit)}</td>
                            <td class="text-right ${marginClass} font-weight-bold">${margin.toFixed(1)}%</td>
                        </tr>
                    `;
                }).join('');
            }

            // Update Top Tindakan
            const topBody = document.getElementById('pc-top-tindakan-body');
            if (data.breakdown.topTindakan.length === 0) {
                topBody.innerHTML = '<tr><td colspan="5" class="text-center text-muted py-3">Tidak ada data</td></tr>';
            } else {
                topBody.innerHTML = data.breakdown.topTindakan.map(t => `
                    <tr>
                        <td>${t.item_name}</td>
                        <td><span class="badge badge-info">${t.category}</span></td>
                        <td class="text-right">${t.total_qty}</td>
                        <td class="text-right">${formatRp(parseFloat(t.avg_harga))}</td>
                        <td class="text-right font-weight-bold">${formatRp(parseFloat(t.total_pendapatan))}</td>
                    </tr>
                `).join('');
            }

        } catch (error) {
            console.error('Load private clinic analysis error:', error);
        }
    }

    window.loadPrivateClinicAnalysis = loadPrivateClinicAnalysis;

    // Show expiring items modal (optional)
    window.showExpiringItems = async function() {
        try {
            const data = await financeRequestScope.request('/api/inventory/expiring?days=60');
            const items = data.data || [];

            let html = '<div class="table-responsive"><table class="table table-sm"><thead><tr><th>Obat</th><th>Batch</th><th>Sisa</th><th>Kadaluarsa</th></tr></thead><tbody>';
            items.forEach(item => {
                const expDate = new Date(item.expiry_date).toLocaleDateString('id-ID');
                const daysLeft = item.days_until_expiry;
                const badge = daysLeft <= 0 ? 'badge-danger' : daysLeft <= 30 ? 'badge-warning' : 'badge-secondary';
                html += `<tr>
                    <td>${escapeHtml(item.obat_name)}</td>
                    <td><code>${escapeHtml(item.batch_number || '-')}</code></td>
                    <td>${item.quantity_remaining}</td>
                    <td><span class="badge ${badge}">${expDate}</span> <small>(${daysLeft} hari)</small></td>
                </tr>`;
            });
            html += '</tbody></table></div>';

            // Show in simple alert or modal
            const alertDiv = document.createElement('div');
            alertDiv.innerHTML = `
                <div class="modal fade" id="expiringModal" tabindex="-1">
                    <div class="modal-dialog modal-lg">
                        <div class="modal-content">
                            <div class="modal-header bg-warning">
                                <h5 class="modal-title"><i class="fas fa-exclamation-triangle mr-2"></i>Item Kadaluarsa</h5>
                                <button type="button" class="close" data-dismiss="modal">&times;</button>
                            </div>
                            <div class="modal-body">${html}</div>
                        </div>
                    </div>
                </div>
            `;
            document.body.appendChild(alertDiv);
            $('#expiringModal').modal('show');
            $('#expiringModal').on('hidden.bs.modal', function() {
                alertDiv.remove();
            });
        } catch (error) {
            console.error('Show expiring items error:', error);
        }
    };

    // Export to window for manual calling
    window.initFinanceAnalysisPage = initFinanceAnalysisPage;

    // Hospital Appointments Page - Store current data
    let currentHospitalAppointments = [];
    let currentHospitalLocation = '';

    window.showHospitalAppointmentsPage = async function(location) {
        console.log('[INFO] Loading hospital appointments for:', location);
        currentHospitalLocation = location;

        // Hide all pages
        document.querySelectorAll('[id$="-page"]').forEach(page => page.classList.add('d-none'));

        // Show hospital appointments page
        const hospitalPage = document.getElementById('hospital-appointments-page');
        if (hospitalPage) {
            hospitalPage.classList.remove('d-none');
        }

        const container = document.getElementById('hospital-appointments-container');
        if (!container) return;

        // Show loading
        container.innerHTML = '<div class="text-center py-5"><i class="fas fa-spinner fa-spin fa-3x text-primary"></i><p class="mt-3">Memuat appointment...</p></div>';

        try {
            const result = await financeRequestScope.request(
                `/api/appointments?hospital_location=${encodeURIComponent(location)}&status=scheduled,confirmed`
            );
            currentHospitalAppointments = result.data || [];

            // Hospital info mapping
            const hospitalInfo = {
                'rsia_melinda': { name: 'RSIA Melinda', color: '#e91e63' },
                'rsud_gambiran': { name: 'RSUD Gambiran', color: '#2196f3' },
                'rs_bhayangkara': { name: 'RS Bhayangkara', color: '#2196f3' }
            };

            const hospital = hospitalInfo[location] || { name: location, color: '#607d8b' };

            // Build header with search
            let html = `
                <div class="card mb-3">
                    <div class="card-header" style="background: linear-gradient(135deg, ${hospital.color} 0%, ${hospital.color}dd 100%); color: white;">
                        <h4 class="mb-0"><i class="fas fa-hospital-alt mr-2"></i>${hospital.name} - Appointment</h4>
                    </div>
                    <div class="card-body">
                        <div class="row mb-3">
                            <div class="col-md-6">
                                <div class="input-group">
                                    <div class="input-group-prepend">
                                        <span class="input-group-text"><i class="fas fa-search"></i></span>
                                    </div>
                                    <input type="text" id="hospital-patient-search" class="form-control"
                                           placeholder="Cari nama pasien..."
                                           onkeyup="window.filterHospitalAppointments(this.value)">
                                </div>
                            </div>
                            <div class="col-md-6 text-right">
                                <span class="badge badge-primary p-2" style="font-size: 14px;">
                                    <i class="fas fa-users mr-1"></i>
                                    <span id="hospital-appointments-count">${currentHospitalAppointments.length}</span> Appointment
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
                <div id="hospital-appointments-cards-container"></div>
            `;

            container.innerHTML = html;

            // Render appointments
            renderHospitalAppointments(currentHospitalAppointments, hospital);

        } catch (error) {
            console.error('Error loading hospital appointments:', error);
            container.innerHTML = `
                <div class="alert alert-danger">
                    <i class="fas fa-exclamation-triangle"></i> ${error.message}
                </div>
            `;
        }
    };

    // Filter appointments by patient name
    window.filterHospitalAppointments = function(searchTerm) {
        const term = searchTerm.toLowerCase().trim();

        const filtered = term === ''
            ? currentHospitalAppointments
            : currentHospitalAppointments.filter(apt =>
                apt.patient_name.toLowerCase().includes(term)
            );

        // Hospital info mapping
        const hospitalInfo = {
            'rsia_melinda': { name: 'RSIA Melinda', color: '#e91e63' },
            'rsud_gambiran': { name: 'RSUD Gambiran', color: '#2196f3' },
            'rs_bhayangkara': { name: 'RS Bhayangkara', color: '#2196f3' }
        };

        const hospital = hospitalInfo[currentHospitalLocation] || {
            name: currentHospitalLocation,
            color: '#607d8b'
        };

        // Update count
        const countEl = document.getElementById('hospital-appointments-count');
        if (countEl) {
            countEl.textContent = filtered.length;
        }

        renderHospitalAppointments(filtered, hospital);
    };

    // Render appointments cards
    function renderHospitalAppointments(appointments, hospital) {
        const cardsContainer = document.getElementById('hospital-appointments-cards-container');
        if (!cardsContainer) return;

        if (appointments.length === 0) {
            cardsContainer.innerHTML = `
                <div class="alert alert-info">
                    <i class="fas fa-info-circle"></i> Tidak ada appointment yang sesuai
                </div>
            `;
            return;
        }

        let html = `<div class="row">`;

        appointments.forEach(apt => {
            const date = new Date(apt.appointment_date);
            const dateStr = date.toLocaleDateString('id-ID', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
                year: 'numeric'
            });

            const statusBadge = apt.status === 'confirmed'
                ? '<span class="badge badge-success"><i class="fas fa-check-circle"></i> Terkonfirmasi</span>'
                : '<span class="badge badge-warning"><i class="fas fa-clock"></i> Terjadwal</span>';

            html += `
                <div class="col-md-6 col-lg-4 mb-3">
                    <div class="card" style="border-left: 4px solid ${hospital.color};">
                        <div class="card-header" style="background: linear-gradient(135deg, ${hospital.color}22 0%, ${hospital.color}11 100%);">
                            <h5 class="card-title mb-0">
                                <i class="fas fa-user-circle"></i> ${escapeHtml(apt.patient_name)}
                            </h5>
                        </div>
                        <div class="card-body">
                            <p class="mb-2"><i class="fas fa-hospital text-muted mr-2"></i><strong>${escapeHtml(hospital.name)}</strong></p>
                            <p class="mb-2"><i class="fas fa-calendar text-muted mr-2"></i>${dateStr}</p>
                            <p class="mb-2"><i class="fas fa-clock text-muted mr-2"></i>${apt.appointment_time ? apt.appointment_time.substring(0,5) + ' WIB' : '-'}</p>
                            <p class="mb-2"><i class="fas fa-heartbeat text-muted mr-2"></i>${escapeHtml(apt.appointment_type || 'Konsultasi')}</p>
                            ${apt.complaint ? `<p class="mb-2 small text-muted"><i class="fas fa-comment-medical mr-2"></i>${escapeHtml(apt.complaint)}</p>` : ''}
                            <div class="mt-3">${statusBadge}</div>
                        </div>
                        <div class="card-footer bg-white">
                            <button class="btn btn-primary btn-block" onclick="window.startHospitalExam(${Number(apt.patient_id) || 0}, ${Number(apt.id) || 0}, '${escapeAttribute(hospital.name)}')">
                                <i class="fas fa-stethoscope mr-2"></i>PERIKSA
                            </button>
                        </div>
                    </div>
                </div>
            `;
        });

        html += `</div>`;
        cardsContainer.innerHTML = html;
    }

    window.destroyFinanceAnalysisPage = function() {
        financeRequestScope.abort('Finance Analysis page deactivated');
    };

    document.addEventListener('page:changed', event => {
        if (event.detail?.page !== 'finance-analysis') {
            window.destroyFinanceAnalysisPage();
        }
    });
