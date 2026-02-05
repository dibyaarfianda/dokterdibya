/**
 * Payment Modal Component - Xendit Integration
 * Handles payment method selection, QR display, VA display, and status polling
 */

// Payment Modal State
const PaymentModal = {
    mrId: null,
    billingTotal: 0,
    currentPayment: null,
    pollingInterval: null,
    countdownInterval: null,

    /**
     * Initialize payment modal
     * @param {string} mrId - Medical record ID
     * @param {number} total - Billing total amount
     */
    async init(mrId, total) {
        this.mrId = mrId;
        this.billingTotal = total;
        this.currentPayment = null;

        // Check for existing active payment
        await this.checkExistingPayment();

        // Render modal content
        this.renderMethodSelection();

        // Show modal
        $('#paymentModal').modal('show');

        // Start Socket.IO listener for instant payment notification
        this.setupSocketListener();
    },

    /**
     * Check for existing active payment
     */
    async checkExistingPayment() {
        try {
            const token = window.getToken ? window.getToken() : localStorage.getItem('vps_auth_token');
            const response = await fetch(`/api/sunday-clinic/billing/${this.mrId}/payment-details`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const result = await response.json();

            if (result.success && result.data && result.data.status === 'pending') {
                this.currentPayment = result.data;
            }
        } catch (error) {
            console.error('[PaymentModal] Check existing payment failed:', error);
        }
    },

    /**
     * Render payment method selection
     */
    renderMethodSelection() {
        const content = document.getElementById('payment-modal-content');
        if (!content) return;

        // If there's an existing pending payment, show it instead
        if (this.currentPayment) {
            if (this.currentPayment.payment_method === 'qris') {
                this.renderQRISDisplay(this.currentPayment);
            } else {
                this.renderVADisplay(this.currentPayment);
            }
            return;
        }

        content.innerHTML = `
            <div class="payment-method-selection">
                <p class="text-center mb-3">
                    <strong>Total Tagihan:</strong>
                    <span class="text-primary h4 ml-2">Rp ${this.formatCurrency(this.billingTotal)}</span>
                </p>

                <h6 class="mb-3">Pilih Metode Pembayaran:</h6>

                <!-- QRIS Option -->
                <div class="payment-method-card mb-2" data-method="qris">
                    <div class="d-flex align-items-center">
                        <i class="fas fa-qrcode fa-2x text-primary mr-3"></i>
                        <div class="flex-grow-1">
                            <strong>QRIS</strong>
                            <small class="d-block text-muted">Scan QR dengan e-wallet atau m-banking</small>
                        </div>
                        <i class="fas fa-chevron-right text-muted"></i>
                    </div>
                </div>

                <!-- VA Options -->
                <div class="payment-method-card mb-2" data-method="va_bca">
                    <div class="d-flex align-items-center">
                        <img src="/staff/public/images/banks/bca.png" alt="BCA" class="bank-logo mr-3" onerror="this.outerHTML='<i class=\\'fas fa-university fa-2x text-info mr-3\\'></i>'">
                        <div class="flex-grow-1">
                            <strong>Virtual Account BCA</strong>
                            <small class="d-block text-muted">Transfer via Bank Central Asia</small>
                        </div>
                        <i class="fas fa-chevron-right text-muted"></i>
                    </div>
                </div>

                <div class="payment-method-card mb-2" data-method="va_bni">
                    <div class="d-flex align-items-center">
                        <img src="/staff/public/images/banks/bni.png" alt="BNI" class="bank-logo mr-3" onerror="this.outerHTML='<i class=\\'fas fa-university fa-2x text-warning mr-3\\'></i>'">
                        <div class="flex-grow-1">
                            <strong>Virtual Account BNI</strong>
                            <small class="d-block text-muted">Transfer via Bank Negara Indonesia</small>
                        </div>
                        <i class="fas fa-chevron-right text-muted"></i>
                    </div>
                </div>

                <div class="payment-method-card mb-2" data-method="va_bri">
                    <div class="d-flex align-items-center">
                        <img src="/staff/public/images/banks/bri.png" alt="BRI" class="bank-logo mr-3" onerror="this.outerHTML='<i class=\\'fas fa-university fa-2x text-primary mr-3\\'></i>'">
                        <div class="flex-grow-1">
                            <strong>Virtual Account BRI</strong>
                            <small class="d-block text-muted">Transfer via Bank Rakyat Indonesia</small>
                        </div>
                        <i class="fas fa-chevron-right text-muted"></i>
                    </div>
                </div>

                <div class="payment-method-card mb-2" data-method="va_mandiri">
                    <div class="d-flex align-items-center">
                        <img src="/staff/public/images/banks/mandiri.png" alt="Mandiri" class="bank-logo mr-3" onerror="this.outerHTML='<i class=\\'fas fa-university fa-2x text-info mr-3\\'></i>'">
                        <div class="flex-grow-1">
                            <strong>Virtual Account Mandiri</strong>
                            <small class="d-block text-muted">Transfer via Bank Mandiri</small>
                        </div>
                        <i class="fas fa-chevron-right text-muted"></i>
                    </div>
                </div>

                <!-- Credit Card Option -->
                <div class="payment-method-card mb-2" data-method="credit_card">
                    <div class="d-flex align-items-center">
                        <i class="fas fa-credit-card fa-2x text-success mr-3"></i>
                        <div class="flex-grow-1">
                            <strong>Kartu Kredit/Debit</strong>
                            <small class="d-block text-muted">Visa, Mastercard, JCB</small>
                        </div>
                        <i class="fas fa-chevron-right text-muted"></i>
                    </div>
                </div>
            </div>

            <div class="modal-footer px-0 pb-0">
                <button type="button" class="btn btn-secondary" data-dismiss="modal">Batal</button>
            </div>
        `;

        // Add click handlers
        content.querySelectorAll('.payment-method-card').forEach(card => {
            card.addEventListener('click', () => {
                this.selectMethod(card.dataset.method);
            });
        });
    },

    /**
     * Select payment method and create payment
     * @param {string} method - Payment method code
     */
    async selectMethod(method) {
        const content = document.getElementById('payment-modal-content');

        // Credit card has its own form
        if (method === 'credit_card') {
            this.renderCreditCardForm();
            return;
        }

        // Show loading
        content.innerHTML = `
            <div class="text-center py-5">
                <i class="fas fa-spinner fa-spin fa-3x text-primary mb-3"></i>
                <p>Membuat pembayaran...</p>
            </div>
        `;

        try {
            const token = window.getToken ? window.getToken() : localStorage.getItem('vps_auth_token');
            const response = await fetch(`/api/sunday-clinic/billing/${this.mrId}/create-payment`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ payment_method: method })
            });

            const result = await response.json();

            if (!result.success) {
                throw new Error(result.message || 'Gagal membuat pembayaran');
            }

            this.currentPayment = result.data;

            // Render payment details based on method
            if (method === 'qris') {
                this.renderQRISDisplay(result.data);
            } else {
                this.renderVADisplay(result.data);
            }

            // Start polling for status
            this.startPolling();

        } catch (error) {
            console.error('[PaymentModal] Create payment failed:', error);
            content.innerHTML = `
                <div class="text-center py-4">
                    <i class="fas fa-exclamation-circle fa-3x text-danger mb-3"></i>
                    <p class="text-danger">${error.message}</p>
                    <button type="button" class="btn btn-primary" onclick="PaymentModal.renderMethodSelection()">
                        <i class="fas fa-arrow-left mr-2"></i>Kembali
                    </button>
                </div>
            `;
        }
    },

    /**
     * Render QRIS payment display
     * @param {Object} data - Payment data
     */
    renderQRISDisplay(data) {
        const content = document.getElementById('payment-modal-content');

        // Generate QR code URL (use Xendit hosted if available, otherwise generate locally)
        const qrImageHtml = data.qris_url
            ? `<img src="${data.qris_url}" alt="QRIS" class="qr-image" style="max-width: 200px;">`
            : `<canvas id="qrcode-canvas"></canvas>`;

        content.innerHTML = `
            <div class="payment-qris-display text-center">
                <div class="qr-container mb-3">
                    ${qrImageHtml}
                </div>

                <p class="text-muted mb-2">Scan QR code dengan aplikasi:</p>
                <div class="ewallet-logos mb-3">
                    <span class="badge badge-light mr-1">GoPay</span>
                    <span class="badge badge-light mr-1">OVO</span>
                    <span class="badge badge-light mr-1">DANA</span>
                    <span class="badge badge-light mr-1">ShopeePay</span>
                    <span class="badge badge-light">M-Banking</span>
                </div>

                <div class="amount-display mb-3">
                    <strong>Total:</strong>
                    <span class="h4 text-primary ml-2">Rp ${this.formatCurrency(data.amount)}</span>
                </div>

                <div class="countdown-display text-danger mb-3">
                    <i class="fas fa-clock mr-1"></i>
                    Kadaluarsa dalam: <span id="payment-countdown">${this.formatCountdown(data.expires_in_seconds)}</span>
                </div>

                <div class="status-display mb-3">
                    <span class="badge badge-warning">
                        <i class="fas fa-hourglass-half mr-1"></i>Menunggu Pembayaran
                    </span>
                </div>
            </div>

            <div class="modal-footer px-0 pb-0">
                <button type="button" class="btn btn-secondary" onclick="PaymentModal.cancelAndClose()">
                    Batalkan
                </button>
                <button type="button" class="btn btn-outline-primary" onclick="PaymentModal.checkStatus()">
                    <i class="fas fa-sync-alt mr-1"></i>Cek Status
                </button>
            </div>
        `;

        // Generate QR code locally if no URL provided
        if (!data.qris_url && data.qris_string) {
            this.generateLocalQR(data.qris_string);
        }

        // Start countdown
        this.startCountdown(data.expires_in_seconds);
    },

    /**
     * Render Virtual Account payment display
     * @param {Object} data - Payment data
     */
    renderVADisplay(data) {
        const content = document.getElementById('payment-modal-content');

        const bankName = data.va_bank_name || data.va_bank_code;

        content.innerHTML = `
            <div class="payment-va-display">
                <div class="va-info-card text-center p-4 bg-light rounded mb-3">
                    <h6 class="mb-3">${bankName}</h6>

                    <p class="text-muted mb-1">Nomor Virtual Account:</p>
                    <div class="va-number-container d-flex align-items-center justify-content-center mb-3">
                        <span class="va-number h3 mb-0 mr-2" id="va-number">${data.va_number}</span>
                        <button type="button" class="btn btn-sm btn-outline-primary copy-btn" onclick="PaymentModal.copyVANumber()">
                            <i class="fas fa-copy"></i>
                        </button>
                    </div>
                    <small class="text-success d-none" id="copy-success">
                        <i class="fas fa-check mr-1"></i>Tersalin!
                    </small>

                    <hr>

                    <div class="amount-display">
                        <strong>Total Bayar:</strong>
                        <span class="h4 text-primary d-block mt-2">Rp ${this.formatCurrency(data.amount)}</span>
                    </div>
                </div>

                <div class="countdown-display text-center text-danger mb-3">
                    <i class="fas fa-clock mr-1"></i>
                    Kadaluarsa dalam: <span id="payment-countdown">${this.formatCountdown(data.expires_in_seconds)}</span>
                </div>

                <div class="status-display text-center mb-3">
                    <span class="badge badge-warning">
                        <i class="fas fa-hourglass-half mr-1"></i>Menunggu Pembayaran
                    </span>
                </div>

                <div class="payment-instructions bg-light p-3 rounded">
                    <h6><i class="fas fa-info-circle mr-2"></i>Cara Pembayaran:</h6>
                    <ol class="mb-0 pl-3">
                        <li>Buka aplikasi ${bankName} atau m-banking</li>
                        <li>Pilih menu Transfer > Virtual Account</li>
                        <li>Masukkan nomor VA di atas</li>
                        <li>Konfirmasi jumlah dan lakukan pembayaran</li>
                    </ol>
                </div>
            </div>

            <div class="modal-footer px-0 pb-0">
                <button type="button" class="btn btn-secondary" onclick="PaymentModal.cancelAndClose()">
                    Batalkan
                </button>
                <button type="button" class="btn btn-outline-primary" onclick="PaymentModal.checkStatus()">
                    <i class="fas fa-sync-alt mr-1"></i>Cek Status
                </button>
            </div>
        `;

        // Start countdown
        this.startCountdown(data.expires_in_seconds);
    },

    /**
     * Render Credit Card payment form
     */
    renderCreditCardForm() {
        const content = document.getElementById('payment-modal-content');

        content.innerHTML = `
            <div class="payment-cc-form">
                <div class="amount-display text-center mb-3">
                    <strong>Total Tagihan:</strong>
                    <span class="h4 text-primary ml-2">Rp ${this.formatCurrency(this.billingTotal)}</span>
                </div>

                <div class="card-brands text-center mb-3">
                    <img src="https://cdn.jsdelivr.net/gh/nickinack/cc-icons@master/visa.svg" alt="Visa" class="cc-icon mx-1" style="height: 24px;">
                    <img src="https://cdn.jsdelivr.net/gh/nickinack/cc-icons@master/mastercard.svg" alt="Mastercard" class="cc-icon mx-1" style="height: 24px;">
                    <img src="https://cdn.jsdelivr.net/gh/nickinack/cc-icons@master/jcb.svg" alt="JCB" class="cc-icon mx-1" style="height: 24px;">
                </div>

                <form id="cc-payment-form">
                    <div class="form-group">
                        <label for="cc-number">Nomor Kartu</label>
                        <input type="text" class="form-control" id="cc-number" placeholder="1234 5678 9012 3456"
                               maxlength="19" autocomplete="cc-number" required>
                    </div>

                    <div class="form-row">
                        <div class="form-group col-md-6">
                            <label for="cc-expiry">Berlaku Hingga</label>
                            <input type="text" class="form-control" id="cc-expiry" placeholder="MM/YY"
                                   maxlength="5" autocomplete="cc-exp" required>
                        </div>
                        <div class="form-group col-md-6">
                            <label for="cc-cvv">CVV</label>
                            <input type="text" class="form-control" id="cc-cvv" placeholder="123"
                                   maxlength="4" autocomplete="cc-csc" required>
                        </div>
                    </div>

                    <div class="form-group">
                        <label for="cc-name">Nama di Kartu</label>
                        <input type="text" class="form-control" id="cc-name" placeholder="NAMA LENGKAP"
                               autocomplete="cc-name" required style="text-transform: uppercase;">
                    </div>

                    <div class="alert alert-info small">
                        <i class="fas fa-lock mr-1"></i>
                        Transaksi aman dengan enkripsi SSL. Data kartu tidak disimpan di server kami.
                    </div>

                    <div id="cc-error-message" class="alert alert-danger d-none"></div>
                </form>
            </div>

            <div class="modal-footer px-0 pb-0">
                <button type="button" class="btn btn-secondary" onclick="PaymentModal.renderMethodSelection()">
                    <i class="fas fa-arrow-left mr-1"></i>Kembali
                </button>
                <button type="button" class="btn btn-success" id="btn-pay-cc" onclick="PaymentModal.processCreditCard()">
                    <i class="fas fa-lock mr-1"></i>Bayar Sekarang
                </button>
            </div>
        `;

        // Setup input formatters
        this.setupCreditCardInputs();
    },

    /**
     * Setup credit card input formatters
     */
    setupCreditCardInputs() {
        const numberInput = document.getElementById('cc-number');
        const expiryInput = document.getElementById('cc-expiry');
        const cvvInput = document.getElementById('cc-cvv');

        // Format card number with spaces
        if (numberInput) {
            numberInput.addEventListener('input', (e) => {
                let value = e.target.value.replace(/\D/g, '');
                value = value.replace(/(.{4})/g, '$1 ').trim();
                e.target.value = value.substring(0, 19);
            });
        }

        // Format expiry MM/YY
        if (expiryInput) {
            expiryInput.addEventListener('input', (e) => {
                let value = e.target.value.replace(/\D/g, '');
                if (value.length >= 2) {
                    value = value.substring(0, 2) + '/' + value.substring(2);
                }
                e.target.value = value.substring(0, 5);
            });
        }

        // CVV only numbers
        if (cvvInput) {
            cvvInput.addEventListener('input', (e) => {
                e.target.value = e.target.value.replace(/\D/g, '').substring(0, 4);
            });
        }
    },

    /**
     * Process credit card payment
     */
    async processCreditCard() {
        const numberInput = document.getElementById('cc-number');
        const expiryInput = document.getElementById('cc-expiry');
        const cvvInput = document.getElementById('cc-cvv');
        const nameInput = document.getElementById('cc-name');
        const errorDiv = document.getElementById('cc-error-message');
        const payBtn = document.getElementById('btn-pay-cc');

        // Validate inputs
        const cardNumber = numberInput.value.replace(/\s/g, '');
        const expiry = expiryInput.value;
        const cvv = cvvInput.value;
        const cardName = nameInput.value.toUpperCase();

        if (cardNumber.length < 13 || cardNumber.length > 19) {
            this.showCCError('Nomor kartu tidak valid');
            return;
        }

        if (!/^\d{2}\/\d{2}$/.test(expiry)) {
            this.showCCError('Format expired tidak valid (MM/YY)');
            return;
        }

        if (cvv.length < 3) {
            this.showCCError('CVV tidak valid');
            return;
        }

        if (cardName.length < 3) {
            this.showCCError('Nama pemegang kartu diperlukan');
            return;
        }

        // Hide error, show loading
        errorDiv.classList.add('d-none');
        payBtn.disabled = true;
        payBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i>Memproses...';

        try {
            // Check if Xendit.js is loaded
            if (typeof Xendit === 'undefined') {
                throw new Error('Xendit SDK belum dimuat. Silakan refresh halaman.');
            }

            // Parse expiry
            const [expMonth, expYear] = expiry.split('/');
            const fullYear = '20' + expYear;

            // Tokenize card using Xendit.js
            const tokenData = await this.tokenizeCard({
                card_number: cardNumber,
                card_exp_month: expMonth,
                card_exp_year: fullYear,
                card_cvn: cvv,
                is_multiple_use: false,
                should_authenticate: true
            });

            if (tokenData.status === 'IN_REVIEW' && tokenData.payer_authentication_url) {
                // 3DS authentication required
                await this.handle3DSAuthentication(tokenData);
            } else if (tokenData.status === 'VERIFIED') {
                // Card verified, create charge
                await this.createCardCharge(tokenData.id);
            } else {
                throw new Error('Status tokenisasi tidak valid: ' + tokenData.status);
            }

        } catch (error) {
            console.error('[PaymentModal] Credit card error:', error);
            this.showCCError(error.message || 'Gagal memproses pembayaran');
            payBtn.disabled = false;
            payBtn.innerHTML = '<i class="fas fa-lock mr-1"></i>Bayar Sekarang';
        }
    },

    /**
     * Tokenize card using Xendit.js
     * @param {Object} cardData - Card details
     * @returns {Promise<Object>} Token data
     */
    tokenizeCard(cardData) {
        return new Promise((resolve, reject) => {
            Xendit.card.createToken(cardData, (err, token) => {
                if (err) {
                    reject(new Error(err.message || 'Tokenisasi gagal'));
                } else {
                    resolve(token);
                }
            });
        });
    },

    /**
     * Handle 3DS authentication
     * @param {Object} tokenData - Token with 3DS URL
     */
    async handle3DSAuthentication(tokenData) {
        const content = document.getElementById('payment-modal-content');

        content.innerHTML = `
            <div class="payment-3ds">
                <div class="text-center mb-3">
                    <h6><i class="fas fa-shield-alt mr-2"></i>Verifikasi Keamanan 3D Secure</h6>
                    <p class="text-muted small">Silakan selesaikan verifikasi di bawah ini</p>
                </div>
                <div class="embed-responsive embed-responsive-4by3" style="min-height: 400px;">
                    <iframe id="3ds-iframe" src="${tokenData.payer_authentication_url}"
                            class="embed-responsive-item" frameborder="0"></iframe>
                </div>
            </div>
        `;

        // Listen for 3DS completion via postMessage
        window.addEventListener('message', async (event) => {
            if (event.data && event.data.status) {
                if (event.data.status === 'VERIFIED') {
                    // 3DS successful, create charge
                    await this.createCardCharge(tokenData.id, tokenData.authentication_id);
                } else {
                    this.showCCError('Verifikasi 3DS gagal. Silakan coba lagi.');
                    this.renderCreditCardForm();
                }
            }
        }, { once: true });
    },

    /**
     * Create card charge after tokenization
     * @param {string} tokenId - Xendit token ID
     * @param {string} authId - Authentication ID (optional, for 3DS)
     */
    async createCardCharge(tokenId, authId = null) {
        const content = document.getElementById('payment-modal-content');

        content.innerHTML = `
            <div class="text-center py-5">
                <i class="fas fa-spinner fa-spin fa-3x text-primary mb-3"></i>
                <p>Memproses pembayaran...</p>
            </div>
        `;

        try {
            const token = window.getToken ? window.getToken() : localStorage.getItem('vps_auth_token');
            const response = await fetch(`/api/sunday-clinic/billing/${this.mrId}/create-card-charge`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    token_id: tokenId,
                    authentication_id: authId
                })
            });

            const result = await response.json();

            if (!result.success) {
                throw new Error(result.message || 'Gagal memproses pembayaran');
            }

            if (result.data.status === 'captured') {
                // Payment successful
                this.handleSuccess();
            } else {
                throw new Error('Status pembayaran: ' + result.data.status);
            }

        } catch (error) {
            console.error('[PaymentModal] Card charge failed:', error);
            this.showCCError(error.message);
            setTimeout(() => {
                this.renderCreditCardForm();
            }, 3000);
        }
    },

    /**
     * Show credit card error message
     * @param {string} message - Error message
     */
    showCCError(message) {
        const errorDiv = document.getElementById('cc-error-message');
        if (errorDiv) {
            errorDiv.textContent = message;
            errorDiv.classList.remove('d-none');
        } else {
            // Fallback if error div not found
            if (window.showError) {
                window.showError(message);
            } else {
                alert(message);
            }
        }
    },

    /**
     * Generate QR code locally using qrcode library
     * @param {string} qrString - QRIS string
     */
    generateLocalQR(qrString) {
        const canvas = document.getElementById('qrcode-canvas');
        if (!canvas) return;

        // Check if QRCode library is available
        if (typeof QRCode !== 'undefined') {
            QRCode.toCanvas(canvas, qrString, {
                width: 200,
                margin: 2
            }, function(error) {
                if (error) console.error('[PaymentModal] QR generation error:', error);
            });
        } else {
            console.warn('[PaymentModal] QRCode library not available');
            canvas.outerHTML = '<p class="text-muted">QR Code: ' + qrString.substring(0, 50) + '...</p>';
        }
    },

    /**
     * Copy VA number to clipboard
     */
    async copyVANumber() {
        const vaNumber = document.getElementById('va-number');
        const successMsg = document.getElementById('copy-success');

        if (!vaNumber) return;

        try {
            await navigator.clipboard.writeText(vaNumber.textContent);

            // Show success message
            if (successMsg) {
                successMsg.classList.remove('d-none');
                setTimeout(() => {
                    successMsg.classList.add('d-none');
                }, 2000);
            }
        } catch (error) {
            // Fallback for older browsers
            const textArea = document.createElement('textarea');
            textArea.value = vaNumber.textContent;
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);

            if (successMsg) {
                successMsg.classList.remove('d-none');
                setTimeout(() => {
                    successMsg.classList.add('d-none');
                }, 2000);
            }
        }
    },

    /**
     * Start countdown timer
     * @param {number} seconds - Seconds until expiry
     */
    startCountdown(seconds) {
        this.stopCountdown();

        let remaining = seconds;
        const countdownEl = document.getElementById('payment-countdown');

        this.countdownInterval = setInterval(() => {
            remaining--;

            if (countdownEl) {
                countdownEl.textContent = this.formatCountdown(remaining);
            }

            if (remaining <= 0) {
                this.stopCountdown();
                this.handleExpired();
            }
        }, 1000);
    },

    /**
     * Stop countdown timer
     */
    stopCountdown() {
        if (this.countdownInterval) {
            clearInterval(this.countdownInterval);
            this.countdownInterval = null;
        }
    },

    /**
     * Start polling for payment status
     */
    startPolling() {
        this.stopPolling();

        this.pollingInterval = setInterval(() => {
            this.checkStatus(true);
        }, 5000);
    },

    /**
     * Stop polling
     */
    stopPolling() {
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
            this.pollingInterval = null;
        }
    },

    /**
     * Check payment status
     * @param {boolean} silent - If true, don't show loading
     */
    async checkStatus(silent = false) {
        if (!this.currentPayment) return;

        const statusBtn = document.querySelector('.btn-outline-primary');
        if (!silent && statusBtn) {
            statusBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i>Mengecek...';
            statusBtn.disabled = true;
        }

        try {
            const token = window.getToken ? window.getToken() : localStorage.getItem('vps_auth_token');
            const response = await fetch(
                `/api/sunday-clinic/billing/${this.mrId}/payment-status/${this.currentPayment.payment_id}`,
                { headers: { 'Authorization': `Bearer ${token}` } }
            );

            const result = await response.json();

            if (result.success && result.data) {
                if (result.data.status === 'paid') {
                    this.handleSuccess();
                } else if (result.data.status === 'expired' || result.data.status === 'failed') {
                    this.handleExpired();
                }
            }
        } catch (error) {
            console.error('[PaymentModal] Check status failed:', error);
        } finally {
            if (!silent && statusBtn) {
                statusBtn.innerHTML = '<i class="fas fa-sync-alt mr-1"></i>Cek Status';
                statusBtn.disabled = false;
            }
        }
    },

    /**
     * Setup Socket.IO listener for instant payment notification
     */
    setupSocketListener() {
        if (window.socket) {
            // Remove existing listener first
            window.socket.off('payment_received');
            window.socket.off('billing_paid');

            // Listen for payment received
            window.socket.on('payment_received', (data) => {
                if (data.mrId === this.mrId) {
                    console.log('[PaymentModal] Payment received via Socket.IO:', data);
                    this.handleSuccess();
                }
            });

            window.socket.on('billing_paid', (data) => {
                if (data.mrId === this.mrId) {
                    console.log('[PaymentModal] Billing paid via Socket.IO:', data);
                    this.handleSuccess();
                }
            });
        }
    },

    /**
     * Handle successful payment
     */
    handleSuccess() {
        this.stopPolling();
        this.stopCountdown();

        const content = document.getElementById('payment-modal-content');
        if (content) {
            content.innerHTML = `
                <div class="text-center py-5">
                    <div class="success-animation mb-3">
                        <i class="fas fa-check-circle fa-5x text-success"></i>
                    </div>
                    <h4 class="text-success mb-3">Pembayaran Berhasil!</h4>
                    <p class="text-muted">Tagihan telah dilunasi.</p>
                </div>

                <div class="modal-footer px-0 pb-0">
                    <button type="button" class="btn btn-success" onclick="PaymentModal.closeAndRefresh()">
                        <i class="fas fa-check mr-2"></i>Selesai
                    </button>
                </div>
            `;
        }

        // Show toast notification
        if (window.showSuccess) {
            window.showSuccess('Pembayaran berhasil diterima!');
        }
    },

    /**
     * Handle expired payment
     */
    handleExpired() {
        this.stopPolling();
        this.stopCountdown();

        const content = document.getElementById('payment-modal-content');
        if (content) {
            content.innerHTML = `
                <div class="text-center py-4">
                    <i class="fas fa-clock fa-4x text-warning mb-3"></i>
                    <h5 class="text-warning">Pembayaran Kadaluarsa</h5>
                    <p class="text-muted">Waktu pembayaran telah habis.</p>

                    <button type="button" class="btn btn-primary" onclick="PaymentModal.retry()">
                        <i class="fas fa-redo mr-2"></i>Coba Lagi
                    </button>
                </div>

                <div class="modal-footer px-0 pb-0">
                    <button type="button" class="btn btn-secondary" data-dismiss="modal">Tutup</button>
                </div>
            `;
        }
    },

    /**
     * Cancel payment and close modal
     */
    async cancelAndClose() {
        if (this.currentPayment && this.currentPayment.status === 'pending') {
            try {
                const token = window.getToken ? window.getToken() : localStorage.getItem('vps_auth_token');
                await fetch(
                    `/api/sunday-clinic/billing/${this.mrId}/cancel-payment/${this.currentPayment.payment_id}`,
                    {
                        method: 'POST',
                        headers: { 'Authorization': `Bearer ${token}` }
                    }
                );
            } catch (error) {
                console.error('[PaymentModal] Cancel payment failed:', error);
            }
        }

        this.close();
    },

    /**
     * Retry payment
     */
    retry() {
        this.currentPayment = null;
        this.renderMethodSelection();
    },

    /**
     * Close modal
     */
    close() {
        this.stopPolling();
        this.stopCountdown();
        this.currentPayment = null;
        $('#paymentModal').modal('hide');
    },

    /**
     * Close modal and refresh billing section
     */
    closeAndRefresh() {
        this.close();

        // Refresh billing section
        if (window.handleSectionChange) {
            window.handleSectionChange('billing', { pushHistory: false });
        }
    },

    /**
     * Format currency
     * @param {number} amount
     * @returns {string}
     */
    formatCurrency(amount) {
        return new Intl.NumberFormat('id-ID').format(amount);
    },

    /**
     * Format countdown
     * @param {number} seconds
     * @returns {string}
     */
    formatCountdown(seconds) {
        if (seconds <= 0) return '00:00';

        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;

        if (hours > 0) {
            return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
        }
        return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
};

// Export to window for global access
window.PaymentModal = PaymentModal;

// Convenience function to open payment modal
window.openPaymentModal = function(mrId, total) {
    // If total not provided, get from billing data
    if (!total && window.stateManager) {
        const state = window.stateManager.getState();
        total = state.billingData?.total || 0;
    }

    PaymentModal.init(mrId, total);
};

// Cleanup on modal close
$(document).ready(function() {
    $('#paymentModal').on('hidden.bs.modal', function() {
        PaymentModal.stopPolling();
        PaymentModal.stopCountdown();
    });
});
