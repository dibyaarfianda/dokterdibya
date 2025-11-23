/**
 * Billing Component (Shared / Tagihan)
 * Billing items, payments, invoice
 * Used across all 3 templates (Obstetri, Gyn Repro, Gyn Special)
 *
 * Sections:
 * 1. Billing Items (Consultations, Procedures, Tests, Medications)
 * 2. Total Calculation
 * 3. Payment Information
 * 4. Invoice Actions
 */

export default {
    /**
     * Render the Billing form
     */
    async render(state) {
        const record = state.recordData?.record || {};
        const category = record?.mr_category || 'obstetri';

        // Use old read-only format for obstetri category
        if (category === 'obstetri') {
            return this.renderObstetriFormat(state);
        }

        // Use new detailed format for other categories
        const billing = state.billingData || state.recordData?.billing || {};
        const items = billing.items || [];

        return `
            <div class="card mb-3">
                <div class="card-header bg-danger text-white">
                    <h5 class="mb-0">
                        <i class="fas fa-file-invoice-dollar"></i> Tagihan / Billing
                    </h5>
                </div>
                <div class="card-body">
                    <!-- Billing Items Section -->
                    ${this.renderBillingItems(items)}

                    <hr>

                    <!-- Total Calculation Section -->
                    ${this.renderTotalCalculation(billing)}

                    <hr>

                    <!-- Payment Information Section -->
                    ${this.renderPaymentInformation(billing)}

                    <hr>

                    <!-- Invoice Actions Section -->
                    ${this.renderInvoiceActions(billing, state)}
                </div>
            </div>

            <script>
                window.billingItemCounter = ${items.length};

                // Add Billing Item
                window.addBillingItem = function() {
                    const index = window.billingItemCounter++;
                    const html = \`
                        <tr class="billing-item-row" data-index="\${index}">
                            <td>
                                <select class="form-control form-control-sm" name="billing_items[\${index}][category]"
                                        onchange="window.updateBillingCategory(\${index})">
                                    <option value="">-- Pilih --</option>
                                    <option value="konsultasi">Konsultasi</option>
                                    <option value="tindakan">Tindakan</option>
                                    <option value="usg">USG</option>
                                    <option value="lab">Pemeriksaan Lab</option>
                                    <option value="obat">Obat</option>
                                    <option value="lainnya">Lainnya</option>
                                </select>
                            </td>
                            <td>
                                <input type="text" class="form-control form-control-sm" name="billing_items[\${index}][description]"
                                       placeholder="Deskripsi item" required>
                            </td>
                            <td>
                                <input type="number" class="form-control form-control-sm text-center" name="billing_items[\${index}][quantity]"
                                       value="1" min="1" onchange="window.calculateBillingTotal()">
                            </td>
                            <td>
                                <input type="number" class="form-control form-control-sm text-right" name="billing_items[\${index}][price]"
                                       placeholder="0" min="0" step="1000" onchange="window.calculateBillingTotal()">
                            </td>
                            <td class="text-right">
                                <span class="item-subtotal">Rp 0</span>
                            </td>
                            <td class="text-center">
                                <button type="button" class="btn btn-danger btn-sm"
                                        onclick="window.removeBillingItem(\${index})">
                                    <i class="fas fa-trash"></i>
                                </button>
                            </td>
                        </tr>
                    \`;
                    document.querySelector('#billing-items-table tbody').insertAdjacentHTML('beforeend', html);
                    window.calculateBillingTotal();
                };

                window.removeBillingItem = function(index) {
                    const row = document.querySelector(\`.billing-item-row[data-index="\${index}"]\`);
                    if (row) row.remove();
                    window.calculateBillingTotal();
                };

                window.updateBillingCategory = function(index) {
                    // Optional: Auto-fill prices based on category
                    // This could be integrated with a price list from backend
                };

                // Calculate Total
                window.calculateBillingTotal = function() {
                    let subtotal = 0;

                    document.querySelectorAll('.billing-item-row').forEach(row => {
                        const index = row.dataset.index;
                        const quantity = parseFloat(document.querySelector(\`[name="billing_items[\${index}][quantity]"]\`)?.value) || 0;
                        const price = parseFloat(document.querySelector(\`[name="billing_items[\${index}][price]"]\`)?.value) || 0;
                        const itemSubtotal = quantity * price;

                        // Update item subtotal display
                        const subtotalElement = row.querySelector('.item-subtotal');
                        if (subtotalElement) {
                            subtotalElement.textContent = 'Rp ' + itemSubtotal.toLocaleString('id-ID');
                        }

                        subtotal += itemSubtotal;
                    });

                    // Update subtotal
                    document.getElementById('billing-subtotal').textContent = 'Rp ' + subtotal.toLocaleString('id-ID');

                    // Calculate discount
                    const discountType = document.querySelector('[name="discount_type"]')?.value || 'none';
                    const discountValue = parseFloat(document.querySelector('[name="discount_value"]')?.value) || 0;
                    let discount = 0;

                    if (discountType === 'percentage') {
                        discount = (subtotal * discountValue) / 100;
                    } else if (discountType === 'fixed') {
                        discount = discountValue;
                    }

                    document.getElementById('billing-discount').textContent = 'Rp ' + discount.toLocaleString('id-ID');

                    // Calculate tax (if applicable)
                    const taxRate = parseFloat(document.querySelector('[name="tax_rate"]')?.value) || 0;
                    const afterDiscount = subtotal - discount;
                    const tax = (afterDiscount * taxRate) / 100;

                    document.getElementById('billing-tax').textContent = 'Rp ' + tax.toLocaleString('id-ID');

                    // Calculate grand total
                    const grandTotal = afterDiscount + tax;
                    document.getElementById('billing-grand-total').textContent = 'Rp ' + grandTotal.toLocaleString('id-ID');

                    // Update payment calculation
                    window.calculatePaymentBalance();
                };

                // Calculate Payment Balance
                window.calculatePaymentBalance = function() {
                    const grandTotalText = document.getElementById('billing-grand-total')?.textContent || 'Rp 0';
                    const grandTotal = parseFloat(grandTotalText.replace(/[^0-9]/g, '')) || 0;
                    const amountPaid = parseFloat(document.querySelector('[name="amount_paid"]')?.value) || 0;
                    const balance = grandTotal - amountPaid;

                    const balanceElement = document.getElementById('payment-balance');
                    if (balanceElement) {
                        balanceElement.textContent = 'Rp ' + balance.toLocaleString('id-ID');
                        if (balance > 0) {
                            balanceElement.className = 'text-danger font-weight-bold';
                        } else if (balance === 0) {
                            balanceElement.className = 'text-success font-weight-bold';
                        } else {
                            balanceElement.className = 'text-warning font-weight-bold';
                        }
                    }

                    // Update payment status
                    const statusElement = document.querySelector('[name="payment_status"]');
                    if (statusElement && !statusElement.disabled) {
                        if (balance === 0 && grandTotal > 0) {
                            statusElement.value = 'paid';
                        } else if (amountPaid > 0 && balance > 0) {
                            statusElement.value = 'partial';
                        } else {
                            statusElement.value = 'unpaid';
                        }
                    }
                };

                // Initialize calculations
                window.calculateBillingTotal();

                // Attach event listeners
                document.querySelector('[name="discount_type"]')?.addEventListener('change', window.calculateBillingTotal);
                document.querySelector('[name="discount_value"]')?.addEventListener('input', window.calculateBillingTotal);
                document.querySelector('[name="tax_rate"]')?.addEventListener('input', window.calculateBillingTotal);
                document.querySelector('[name="amount_paid"]')?.addEventListener('input', window.calculatePaymentBalance);
            </script>
        `;
    },

    /**
     * Render Billing Items section
     */
    renderBillingItems(items) {
        return `
            <div class="form-section">
                <h6 class="text-primary mb-3">
                    <i class="fas fa-list"></i> Daftar Item Tagihan
                </h6>

                <div class="table-responsive">
                    <table class="table table-bordered table-sm" id="billing-items-table">
                        <thead class="thead-light">
                            <tr>
                                <th width="15%">Kategori</th>
                                <th width="35%">Deskripsi</th>
                                <th width="10%" class="text-center">Qty</th>
                                <th width="15%" class="text-right">Harga Satuan</th>
                                <th width="15%" class="text-right">Subtotal</th>
                                <th width="10%" class="text-center">Aksi</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${this.renderBillingItemsRows(items)}
                        </tbody>
                    </table>
                </div>

                <button type="button" class="btn btn-sm btn-outline-primary" onclick="window.addBillingItem()">
                    <i class="fas fa-plus"></i> Tambah Item
                </button>

                <div class="mt-3">
                    <small class="text-muted">
                        <strong>Note:</strong> Obat yang diresepkan di bagian "Rencana Tatalaksana" dapat ditambahkan di sini sebagai item billing.
                    </small>
                </div>
            </div>
        `;
    },

    /**
     * Render Billing Items rows
     */
    renderBillingItemsRows(items) {
        if (!items || items.length === 0) {
            return `
                <tr>
                    <td colspan="6" class="text-center text-muted">
                        Belum ada item tagihan. Klik "Tambah Item" untuk menambahkan.
                    </td>
                </tr>
            `;
        }

        return items.map((item, index) => {
            const quantity = item.quantity || 1;
            const price = item.price || 0;
            const subtotal = quantity * price;

            return `
                <tr class="billing-item-row" data-index="${index}">
                    <td>
                        <select class="form-control form-control-sm" name="billing_items[${index}][category]"
                                onchange="window.updateBillingCategory(${index})">
                            <option value="">-- Pilih --</option>
                            <option value="konsultasi" ${item.category === 'konsultasi' ? 'selected' : ''}>Konsultasi</option>
                            <option value="tindakan" ${item.category === 'tindakan' ? 'selected' : ''}>Tindakan</option>
                            <option value="usg" ${item.category === 'usg' ? 'selected' : ''}>USG</option>
                            <option value="lab" ${item.category === 'lab' ? 'selected' : ''}>Pemeriksaan Lab</option>
                            <option value="obat" ${item.category === 'obat' ? 'selected' : ''}>Obat</option>
                            <option value="lainnya" ${item.category === 'lainnya' ? 'selected' : ''}>Lainnya</option>
                        </select>
                    </td>
                    <td>
                        <input type="text" class="form-control form-control-sm" name="billing_items[${index}][description]"
                               value="${item.description || ''}"
                               placeholder="Deskripsi item" required>
                    </td>
                    <td>
                        <input type="number" class="form-control form-control-sm text-center" name="billing_items[${index}][quantity]"
                               value="${quantity}" min="1" onchange="window.calculateBillingTotal()">
                    </td>
                    <td>
                        <input type="number" class="form-control form-control-sm text-right" name="billing_items[${index}][price]"
                               value="${price}" min="0" step="1000" onchange="window.calculateBillingTotal()">
                    </td>
                    <td class="text-right">
                        <span class="item-subtotal">Rp ${subtotal.toLocaleString('id-ID')}</span>
                    </td>
                    <td class="text-center">
                        <button type="button" class="btn btn-danger btn-sm"
                                onclick="window.removeBillingItem(${index})">
                            <i class="fas fa-trash"></i>
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
    },

    /**
     * Render Total Calculation section
     */
    renderTotalCalculation(billing) {
        const subtotal = this.calculateSubtotal(billing.items || []);
        const discountType = billing.discount_type || 'none';
        const discountValue = billing.discount_value || 0;
        const taxRate = billing.tax_rate || 0;

        let discount = 0;
        if (discountType === 'percentage') {
            discount = (subtotal * discountValue) / 100;
        } else if (discountType === 'fixed') {
            discount = discountValue;
        }

        const afterDiscount = subtotal - discount;
        const tax = (afterDiscount * taxRate) / 100;
        const grandTotal = afterDiscount + tax;

        return `
            <div class="form-section">
                <h6 class="text-primary mb-3">
                    <i class="fas fa-calculator"></i> Perhitungan Total
                </h6>

                <div class="row">
                    <div class="col-md-6">
                        <div class="form-group">
                            <label>Tipe Diskon:</label>
                            <select class="form-control" name="discount_type">
                                <option value="none" ${discountType === 'none' ? 'selected' : ''}>Tidak ada diskon</option>
                                <option value="percentage" ${discountType === 'percentage' ? 'selected' : ''}>Persentase (%)</option>
                                <option value="fixed" ${discountType === 'fixed' ? 'selected' : ''}>Nominal (Rp)</option>
                            </select>
                        </div>
                    </div>

                    <div class="col-md-6">
                        <div class="form-group">
                            <label>Nilai Diskon:</label>
                            <input type="number" class="form-control" name="discount_value"
                                   value="${discountValue}" min="0" step="0.01"
                                   placeholder="Masukkan nilai diskon">
                        </div>
                    </div>
                </div>

                <div class="row">
                    <div class="col-md-6">
                        <div class="form-group">
                            <label>Pajak (%):</label>
                            <input type="number" class="form-control" name="tax_rate"
                                   value="${taxRate}" min="0" max="100" step="0.1"
                                   placeholder="Contoh: 10 untuk PPN 10%">
                            <small class="text-muted">Kosongkan jika tidak ada pajak</small>
                        </div>
                    </div>
                </div>

                <hr>

                <div class="row">
                    <div class="col-md-8 text-right">
                        <strong>Subtotal:</strong>
                    </div>
                    <div class="col-md-4 text-right">
                        <span id="billing-subtotal" class="h6">Rp ${subtotal.toLocaleString('id-ID')}</span>
                    </div>
                </div>

                <div class="row mt-2">
                    <div class="col-md-8 text-right">
                        <strong>Diskon:</strong>
                    </div>
                    <div class="col-md-4 text-right">
                        <span id="billing-discount" class="text-danger">Rp ${discount.toLocaleString('id-ID')}</span>
                    </div>
                </div>

                <div class="row mt-2">
                    <div class="col-md-8 text-right">
                        <strong>Pajak:</strong>
                    </div>
                    <div class="col-md-4 text-right">
                        <span id="billing-tax">Rp ${tax.toLocaleString('id-ID')}</span>
                    </div>
                </div>

                <hr>

                <div class="row">
                    <div class="col-md-8 text-right">
                        <strong class="h5">TOTAL:</strong>
                    </div>
                    <div class="col-md-4 text-right">
                        <span id="billing-grand-total" class="h4 text-primary font-weight-bold">
                            Rp ${grandTotal.toLocaleString('id-ID')}
                        </span>
                    </div>
                </div>
            </div>
        `;
    },

    /**
     * Calculate subtotal from items
     */
    calculateSubtotal(items) {
        if (!items || items.length === 0) return 0;

        return items.reduce((total, item) => {
            const quantity = item.quantity || 1;
            const price = item.price || 0;
            return total + (quantity * price);
        }, 0);
    },

    /**
     * Render Payment Information section
     */
    renderPaymentInformation(billing) {
        const paymentStatus = billing.payment_status || 'unpaid';
        const paymentMethod = billing.payment_method || '';
        const amountPaid = billing.amount_paid || 0;
        const paymentDate = billing.payment_date || '';
        const paymentNotes = billing.payment_notes || '';

        // Calculate balance
        const subtotal = this.calculateSubtotal(billing.items || []);
        const discountType = billing.discount_type || 'none';
        const discountValue = billing.discount_value || 0;
        const taxRate = billing.tax_rate || 0;

        let discount = 0;
        if (discountType === 'percentage') {
            discount = (subtotal * discountValue) / 100;
        } else if (discountType === 'fixed') {
            discount = discountValue;
        }

        const afterDiscount = subtotal - discount;
        const tax = (afterDiscount * taxRate) / 100;
        const grandTotal = afterDiscount + tax;
        const balance = grandTotal - amountPaid;

        let balanceClass = 'text-danger';
        if (balance === 0) balanceClass = 'text-success';
        else if (balance < 0) balanceClass = 'text-warning';

        return `
            <div class="form-section">
                <h6 class="text-primary mb-3">
                    <i class="fas fa-money-bill-wave"></i> Informasi Pembayaran
                </h6>

                <div class="row">
                    <div class="col-md-6">
                        <div class="form-group">
                            <label>Status Pembayaran:</label>
                            <select class="form-control" name="payment_status">
                                <option value="unpaid" ${paymentStatus === 'unpaid' ? 'selected' : ''}>
                                    Belum Dibayar
                                </option>
                                <option value="partial" ${paymentStatus === 'partial' ? 'selected' : ''}>
                                    Dibayar Sebagian
                                </option>
                                <option value="paid" ${paymentStatus === 'paid' ? 'selected' : ''}>
                                    Lunas
                                </option>
                            </select>
                        </div>
                    </div>

                    <div class="col-md-6">
                        <div class="form-group">
                            <label>Metode Pembayaran:</label>
                            <select class="form-control" name="payment_method">
                                <option value="">-- Pilih --</option>
                                <option value="cash" ${paymentMethod === 'cash' ? 'selected' : ''}>Tunai (Cash)</option>
                                <option value="debit" ${paymentMethod === 'debit' ? 'selected' : ''}>Kartu Debit</option>
                                <option value="credit" ${paymentMethod === 'credit' ? 'selected' : ''}>Kartu Kredit</option>
                                <option value="transfer" ${paymentMethod === 'transfer' ? 'selected' : ''}>Transfer Bank</option>
                                <option value="e_wallet" ${paymentMethod === 'e_wallet' ? 'selected' : ''}>E-Wallet (OVO, GoPay, dll)</option>
                                <option value="insurance" ${paymentMethod === 'insurance' ? 'selected' : ''}>Asuransi</option>
                                <option value="other" ${paymentMethod === 'other' ? 'selected' : ''}>Lainnya</option>
                            </select>
                        </div>
                    </div>
                </div>

                <div class="row">
                    <div class="col-md-6">
                        <div class="form-group">
                            <label>Jumlah Dibayar:</label>
                            <div class="input-group">
                                <div class="input-group-prepend">
                                    <span class="input-group-text">Rp</span>
                                </div>
                                <input type="number" class="form-control" name="amount_paid"
                                       value="${amountPaid}" min="0" step="1000"
                                       placeholder="0">
                            </div>
                        </div>
                    </div>

                    <div class="col-md-6">
                        <div class="form-group">
                            <label>Tanggal Pembayaran:</label>
                            <input type="date" class="form-control" name="payment_date"
                                   value="${paymentDate}">
                        </div>
                    </div>
                </div>

                <div class="row">
                    <div class="col-md-12">
                        <div class="form-group">
                            <label>Catatan Pembayaran:</label>
                            <textarea class="form-control" name="payment_notes" rows="2"
                                      placeholder="Catatan tambahan tentang pembayaran...">${paymentNotes}</textarea>
                        </div>
                    </div>
                </div>

                <div class="alert alert-${balance > 0 ? 'warning' : (balance === 0 ? 'success' : 'info')} mt-3">
                    <div class="row">
                        <div class="col-md-6">
                            <strong>Sisa Tagihan:</strong>
                        </div>
                        <div class="col-md-6 text-right">
                            <span id="payment-balance" class="${balanceClass} font-weight-bold h5">
                                Rp ${balance.toLocaleString('id-ID')}
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    /**
     * Render Invoice Actions section
     */
    renderInvoiceActions(billing, state) {
        const invoiceNumber = billing.invoice_number || 'Belum dibuat';
        const invoiceDate = billing.invoice_date || '';
        const isConfirmed = billing.is_confirmed || false;

        return `
            <div class="form-section">
                <h6 class="text-primary mb-3">
                    <i class="fas fa-file-invoice"></i> Invoice
                </h6>

                <div class="row mb-3">
                    <div class="col-md-6">
                        <div class="info-group">
                            <label class="text-muted">Nomor Invoice:</label>
                            <div class="info-value">
                                <strong>${invoiceNumber}</strong>
                            </div>
                        </div>
                    </div>

                    <div class="col-md-6">
                        <div class="info-group">
                            <label class="text-muted">Tanggal Invoice:</label>
                            <div class="info-value">
                                ${invoiceDate || 'Belum dibuat'}
                            </div>
                        </div>
                    </div>
                </div>

                <div class="row">
                    <div class="col-md-12">
                        ${isConfirmed ? `
                            <div class="alert alert-success">
                                <i class="fas fa-check-circle"></i>
                                <strong>Invoice sudah dikonfirmasi</strong>
                            </div>
                            <button type="button" class="btn btn-primary" onclick="window.printInvoice()">
                                <i class="fas fa-print"></i> Cetak Invoice
                            </button>
                        ` : `
                            <div class="alert alert-info">
                                <i class="fas fa-info-circle"></i>
                                Invoice akan dibuat setelah Anda menyimpan dan mengkonfirmasi tagihan.
                            </div>
                        `}
                    </div>
                </div>
            </div>

            <script>
                window.printInvoice = function() {
                    // In production, this would call the print invoice API
                    alert('Fungsi cetak invoice akan diimplementasikan pada integrasi backend');
                };
            </script>
        `;
    },

    /**
     * Save billing data
     */
    async save(state) {
        try {
            const data = {
                items: this.collectBillingItemsData(),
                discount_type: document.querySelector('[name="discount_type"]')?.value || 'none',
                discount_value: parseFloat(document.querySelector('[name="discount_value"]')?.value) || 0,
                tax_rate: parseFloat(document.querySelector('[name="tax_rate"]')?.value) || 0,
                payment_status: document.querySelector('[name="payment_status"]')?.value || 'unpaid',
                payment_method: document.querySelector('[name="payment_method"]')?.value || '',
                amount_paid: parseFloat(document.querySelector('[name="amount_paid"]')?.value) || 0,
                payment_date: document.querySelector('[name="payment_date"]')?.value || '',
                payment_notes: document.querySelector('[name="payment_notes"]')?.value || ''
            };

            // Calculate totals
            const subtotal = this.calculateSubtotal(data.items);
            let discount = 0;
            if (data.discount_type === 'percentage') {
                discount = (subtotal * data.discount_value) / 100;
            } else if (data.discount_type === 'fixed') {
                discount = data.discount_value;
            }

            const afterDiscount = subtotal - discount;
            const tax = (afterDiscount * data.tax_rate) / 100;
            const grandTotal = afterDiscount + tax;

            data.subtotal = subtotal;
            data.discount_amount = discount;
            data.tax_amount = tax;
            data.grand_total = grandTotal;
            data.balance = grandTotal - data.amount_paid;

            console.log('[Billing] Saving data:', data);

            // Validation: At least one item required
            if (!data.items || data.items.length === 0) {
                throw new Error('Minimal satu item tagihan harus diisi');
            }

            // In production, this would call the API
            // const response = await apiClient.saveBilling(state.currentMrId, data);

            return {
                success: true,
                data: data
            };

        } catch (error) {
            console.error('[Billing] Save failed:', error);
            return {
                success: false,
                error: error.message
            };
        }
    },

    /**
     * Collect Billing Items data
     */
    collectBillingItemsData() {
        const items = [];
        document.querySelectorAll('.billing-item-row').forEach(row => {
            const index = row.dataset.index;
            const category = document.querySelector(`[name="billing_items[${index}][category]"]`)?.value;
            const description = document.querySelector(`[name="billing_items[${index}][description]"]`)?.value;
            const quantity = parseFloat(document.querySelector(`[name="billing_items[${index}][quantity]"]`)?.value) || 1;
            const price = parseFloat(document.querySelector(`[name="billing_items[${index}][price]"]`)?.value) || 0;

            if (description) {
                items.push({
                    category: category,
                    description: description,
                    quantity: quantity,
                    price: price,
                    subtotal: quantity * price
                });
            }
        });

        return items;
    },

    /**
     * Render old Obstetri format (read-only with confirmation)
     */
    renderObstetriFormat(state) {
        const billing = state.billingData || state.recordData?.billing || {};
        const items = billing.items || [];
        const status = billing.status || 'draft';

        const escapeHtml = (str) => {
            if (!str) return '';
            return String(str)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;');
        };

        const formatRupiah = (amount) => {
            return 'Rp ' + (amount || 0).toLocaleString('id-ID');
        };

        // Calculate total
        let subtotal = 0;
        const itemsHtml = items.map(item => {
            const itemTotal = (item.quantity || 1) * (item.price || 0);
            subtotal += itemTotal;
            return `
                <tr>
                    <td>${escapeHtml(item.item_name)}</td>
                    <td class="text-center">${item.quantity || 1}</td>
                    <td class="text-right">${formatRupiah(item.price)}</td>
                    <td class="text-right font-weight-bold">${formatRupiah(itemTotal)}</td>
                </tr>
            `;
        }).join('');

        // Status badge
        const statusBadge = status === 'confirmed'
            ? '<span class="badge badge-success">Dikonfirmasi</span>'
            : '<span class="badge badge-warning">Draft</span>';

        // Action buttons
        const actionsHtml = status === 'draft'
            ? `<button type="button" class="btn btn-primary" id="btn-confirm-billing">
                   <i class="fas fa-check mr-2"></i>Konfirmasi Tagihan
               </button>`
            : `<button type="button" class="btn btn-success mr-2" id="btn-print-etiket">
                   <i class="fas fa-tag mr-2"></i>Cetak Etiket
               </button>
               <button type="button" class="btn btn-info" id="btn-print-invoice">
                   <i class="fas fa-receipt mr-2"></i>Cetak Invoice
               </button>`;

        return `
            <div class="sc-section">
                <div class="sc-section-header">
                    <h3>Tagihan & Pembayaran</h3>
                </div>
                <div class="sc-card">
                    <div class="d-flex justify-content-between align-items-center mb-3">
                        <h5 class="mb-0">Rincian Tagihan</h5>
                        ${statusBadge}
                    </div>

                    <table class="table table-bordered">
                        <thead class="thead-light">
                            <tr>
                                <th>Item</th>
                                <th width="10%" class="text-center">Qty</th>
                                <th width="20%" class="text-right">Harga</th>
                                <th width="20%" class="text-right">Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${itemsHtml || '<tr><td colspan="4" class="text-center text-muted">Belum ada item tagihan. Item akan muncul setelah Planning disimpan.</td></tr>'}
                            ${itemsHtml ? `
                            <tr class="table-active font-weight-bold">
                                <td colspan="3" class="text-right">GRAND TOTAL</td>
                                <td class="text-right">${formatRupiah(subtotal)}</td>
                            </tr>
                            ` : ''}
                        </tbody>
                    </table>

                    <div class="text-right mt-3">
                        ${actionsHtml}
                    </div>
                </div>
            </div>
        `;
    }
};
