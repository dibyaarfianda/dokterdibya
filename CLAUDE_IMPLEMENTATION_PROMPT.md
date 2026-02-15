# Claude Implementation Prompt: Patient Billing Payment Integration

**Objective**: Implement Xendit payment gateway for patient portal (Capacitor Android app), specifically for trial with patient "Nanda Ananda"

**Scope**: Backend routes, database setup, frontend UI, JavaScript payment logic, integration, and deployment

**Timeline**: 6 phases, estimated 18-20 hours total

**Critical Constraints**:
- Zero app re-download required (Capacitor webview serves from web)
- Trial mode: Show billing only for patient Nanda Ananda
- Payment methods: QRIS, Virtual Accounts (BCA, BNI, BRI, Mandiri)
- Existing Xendit utilities already in place at `/staff/backend/utils/xendit-payment.js`

---

## PHASE 1: Backend Route Implementation (3 hours)

### Objective
Create patient-facing API endpoints for billing and payment management

### Files to Create
**File**: `/staff/backend/routes/patient-billing-trial.js` (350 lines)

### Requirements

#### 1.1 Endpoint: GET /api/trial/patient-billing/me
**Purpose**: Verify patient and return patient billing overview

**Implementation**:
```javascript
const express = require('express');
const router = express.Router();
const db = require('../database');
const xenditPayment = require('../utils/xendit-payment');
const { verifyPatientToken } = require('../middleware/auth');

// GET /api/trial/patient-billing/me
router.get('/me', verifyPatientToken, async (req, res) => {
  try {
    const patientId = req.patient.id;
    
    // TRIAL MODE: Only allow Nanda Ananda (patient_id = 1, verify with name)
    const [patient] = await db.query(
      'SELECT id, name, email, phone FROM patient WHERE id = ?',
      [patientId]
    );
    
    if (!patient) {
      return res.status(404).json({ error: 'Patient not found' });
    }
    
    if (patient.name.toLowerCase() !== 'nanda ananda') {
      console.log(`[TRIAL_PAYMENT] Access denied for patient: ${patient.name}`);
      return res.status(403).json({ 
        error: 'Payment feature only available for authorized trial patients' 
      });
    }
    
    console.log(`[TRIAL_PAYMENT] Accessing payment for patient: ${patient.name}`);
    
    // Get pending bills for this patient
    const [bills] = await db.query(
      `SELECT 
        id, mr_no, amount, status, created_at, updated_at, bill_description
       FROM tagihan 
       WHERE patient_id = ? AND status IN ('pending', 'partial')
       ORDER BY created_at DESC
       LIMIT 20`,
      [patientId]
    );
    
    // Get payment status for each bill
    const billsWithPayments = await Promise.all(
      bills.map(async (bill) => {
        const [payments] = await db.query(
          `SELECT id, amount, status, payment_method, created_at 
           FROM tagihan_payments 
           WHERE bill_id = ? 
           ORDER BY created_at DESC`,
          [bill.id]
        );
        return { ...bill, payments };
      })
    );
    
    res.json({
      success: true,
      patient: {
        id: patient.id,
        name: patient.name,
        email: patient.email
      },
      bills: billsWithPayments,
      paymentMethods: xenditPayment.getSupportedMethods()
    });
  } catch (error) {
    console.error('[TRIAL_PAYMENT] Error in GET /me:', error);
    res.status(500).json({ error: 'Server error' });
  }
});
```

**Expected Response**:
```json
{
  "success": true,
  "patient": {
    "id": 1,
    "name": "Nanda Ananda",
    "email": "nanda@example.com"
  },
  "bills": [
    {
      "id": 1,
      "mr_no": "TRIAL001",
      "amount": 250000,
      "status": "pending",
      "created_at": "2026-02-06T10:00:00Z",
      "payments": []
    }
  ],
  "paymentMethods": ["qris", "va_bca", "va_bni", "va_bri", "va_mandiri"]
}
```

#### 1.2 Endpoint: POST /api/trial/patient-billing/:mrId/create-payment
**Purpose**: Create payment request and return QRIS/VA details

**Implementation**:
```javascript
// POST /api/trial/patient-billing/:mrId/create-payment
router.post('/:mrId/create-payment', verifyPatientToken, async (req, res) => {
  try {
    const patientId = req.patient.id;
    const { mrId } = req.params;
    const { paymentMethod } = req.body;
    
    // Verify patient is trial patient
    const [patient] = await db.query(
      'SELECT id, name FROM patient WHERE id = ?',
      [patientId]
    );
    
    if (!patient || patient.name.toLowerCase() !== 'nanda ananda') {
      return res.status(403).json({ error: 'Unauthorized for trial payment' });
    }
    
    // Get bill for this MR
    const [bill] = await db.query(
      'SELECT id, amount, mr_no FROM tagihan WHERE patient_id = ? AND mr_no = ?',
      [patientId, mrId]
    );
    
    if (!bill) {
      return res.status(404).json({ error: 'Bill not found' });
    }
    
    // Validate payment method
    const validMethods = ['qris', 'va_bca', 'va_bni', 'va_bri', 'va_mandiri'];
    if (!validMethods.includes(paymentMethod)) {
      return res.status(400).json({ error: 'Invalid payment method' });
    }
    
    console.log(`[TRIAL_PAYMENT] Creating ${paymentMethod} payment for bill: ${bill.mr_no}, Amount: ${bill.amount}`);
    
    let paymentData;
    
    if (paymentMethod === 'qris') {
      paymentData = await xenditPayment.createQRISPayment({
        referenceId: `${bill.mr_no}-${Date.now()}`,
        amount: bill.amount,
        description: `DokterDibya Bill - ${bill.mr_no}`
      });
    } else {
      const bankCode = paymentMethod.split('_')[1].toUpperCase();
      paymentData = await xenditPayment.createVAPayment({
        bankCode: bankCode,
        referenceId: `${bill.mr_no}-${Date.now()}`,
        amount: bill.amount,
        description: `DokterDibya Bill - ${bill.mr_no}`
      });
    }
    
    // Store payment record in database
    const [result] = await db.query(
      `INSERT INTO tagihan_payments 
       (bill_id, patient_id, amount, status, payment_method, xendit_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, NOW())`,
      [bill.id, patientId, bill.amount, 'pending', paymentMethod, paymentData.id]
    );
    
    console.log(`[TRIAL_PAYMENT] Payment created: ${paymentData.id}`);
    
    res.json({
      success: true,
      payment: {
        id: result.insertId,
        xenditId: paymentData.id,
        amount: bill.amount,
        method: paymentMethod,
        qrisString: paymentData.qrisString || null,
        vaNumber: paymentData.vaNumber || null,
        vaBank: paymentData.bankCode || null,
        expiryTime: paymentData.expiryTime
      }
    });
  } catch (error) {
    console.error('[TRIAL_PAYMENT] Error in create-payment:', error);
    res.status(500).json({ error: 'Failed to create payment' });
  }
});
```

**Expected Response (QRIS)**:
```json
{
  "success": true,
  "payment": {
    "id": 1,
    "xenditId": "qr_xxxx",
    "amount": 250000,
    "method": "qris",
    "qrisString": "00020126...",
    "vaNumber": null,
    "vaBank": null,
    "expiryTime": "2026-02-07T10:00:00Z"
  }
}
```

**Expected Response (Virtual Account)**:
```json
{
  "success": true,
  "payment": {
    "id": 1,
    "xenditId": "va_xxxx",
    "amount": 250000,
    "method": "va_bca",
    "qrisString": null,
    "vaNumber": "70012345678",
    "vaBank": "BCA",
    "expiryTime": "2026-02-07T10:00:00Z"
  }
}
```

#### 1.3 Endpoint: GET /api/trial/patient-billing/:mrId/payment-status/:paymentId
**Purpose**: Check payment status and update database on success

**Implementation**:
```javascript
// GET /api/trial/patient-billing/:mrId/payment-status/:paymentId
router.get('/:mrId/payment-status/:paymentId', verifyPatientToken, async (req, res) => {
  try {
    const patientId = req.patient.id;
    const { mrId, paymentId } = req.params;
    
    // Verify patient is trial patient
    const [patient] = await db.query(
      'SELECT id, name FROM patient WHERE id = ?',
      [patientId]
    );
    
    if (!patient || patient.name.toLowerCase() !== 'nanda ananda') {
      return res.status(403).json({ error: 'Unauthorized for trial payment' });
    }
    
    // Get payment record
    const [payment] = await db.query(
      `SELECT tp.*, t.amount as bill_amount 
       FROM tagihan_payments tp
       JOIN tagihan t ON tp.bill_id = t.id
       WHERE tp.id = ? AND tp.patient_id = ? AND t.mr_no = ?`,
      [paymentId, patientId, mrId]
    );
    
    if (!payment) {
      return res.status(404).json({ error: 'Payment record not found' });
    }
    
    console.log(`[TRIAL_PAYMENT] Checking status for payment: ${payment.xendit_id}`);
    
    // Check status from Xendit
    const xenditStatus = await xenditPayment.checkPaymentStatus(payment.xendit_id);
    
    console.log(`[TRIAL_PAYMENT] Xendit status: ${xenditStatus.status}`);
    
    // Update payment status if succeeded
    if (xenditStatus.status === 'COMPLETED' && payment.status !== 'success') {
      await db.query(
        'UPDATE tagihan_payments SET status = ?, updated_at = NOW() WHERE id = ?',
        ['success', paymentId]
      );
      
      // Update bill status to paid if full payment received
      const [billPayments] = await db.query(
        'SELECT SUM(amount) as totalPaid FROM tagihan_payments WHERE bill_id = ? AND status = "success"',
        [payment.bill_id]
      );
      
      if (billPayments[0].totalPaid >= payment.bill_amount) {
        await db.query(
          'UPDATE tagihan SET status = ? WHERE id = ?',
          ['paid', payment.bill_id]
        );
        console.log(`[TRIAL_PAYMENT] Bill marked as paid: ${payment.bill_id}`);
      }
    }
    
    res.json({
      success: true,
      payment: {
        id: paymentId,
        xenditId: payment.xendit_id,
        status: xenditStatus.status,
        amount: payment.amount,
        method: payment.payment_method
      }
    });
  } catch (error) {
    console.error('[TRIAL_PAYMENT] Error in payment-status:', error);
    res.status(500).json({ error: 'Failed to check payment status' });
  }
});

module.exports = router;
```

**Expected Response**:
```json
{
  "success": true,
  "payment": {
    "id": 1,
    "xenditId": "qr_xxxx",
    "status": "COMPLETED",
    "amount": 250000,
    "method": "qris"
  }
}
```

### Integration with Server
**File**: `/staff/backend/server.js`

**Change 1**: Add route import at top (after other route imports)
```javascript
const patientBillingTrialRoutes = require('./routes/patient-billing-trial');
```

**Change 2**: Add route and whitelist (find where other patient routes are registered)
```javascript
// Patient billing payment routes (TRIAL MODE)
app.use('/api/trial/patient-billing/', patientBillingTrialRoutes);

// Update PATIENT_ALLOWED_ROUTES
const PATIENT_ALLOWED_ROUTES = [
  '/api/patient/',
  '/api/patients/',
  '/api/trial/patient-billing/',  // ADD THIS LINE
  // ... existing routes
];
```

### Testing
```bash
# Test 1: Get patient overview
curl -H "Authorization: Bearer <PATIENT_JWT>" \
  https://dokterdibya.com/api/trial/patient-billing/me

# Test 2: Create QRIS payment
curl -X POST \
  -H "Authorization: Bearer <PATIENT_JWT>" \
  -H "Content-Type: application/json" \
  -d '{"paymentMethod":"qris"}' \
  https://dokterdibya.com/api/trial/patient-billing/TRIAL001/create-payment

# Test 3: Check payment status
curl -H "Authorization: Bearer <PATIENT_JWT>" \
  https://dokterdibya.com/api/trial/patient-billing/TRIAL001/payment-status/1
```

---

## PHASE 2: Database Setup & Test Data (2 hours)

### Objective
Prepare database tables and create trial patient data

### 2.1 Verify Database Tables Exist

**Check existing tables**:
```bash
mysql -u root -p dokterdibya -e "SHOW TABLES LIKE 'tagihan%';"
```

**Expected output**:
```
tagihan
tagihan_payments
tagihan_payment_logs
```

### 2.2 Create Tables if Missing

**SQL Script** (save as `/staff/backend/schema/trial-payment-tables.sql`):
```sql
-- Bills/Invoices table
CREATE TABLE IF NOT EXISTS tagihan (
  id INT AUTO_INCREMENT PRIMARY KEY,
  patient_id INT NOT NULL,
  mr_no VARCHAR(50) UNIQUE NOT NULL,
  amount DECIMAL(15,2) NOT NULL,
  status ENUM('pending', 'partial', 'paid', 'cancelled') DEFAULT 'pending',
  bill_description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (patient_id) REFERENCES patient(id),
  INDEX idx_patient_id (patient_id),
  INDEX idx_status (status)
);

-- Payment records table
CREATE TABLE IF NOT EXISTS tagihan_payments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  bill_id INT NOT NULL,
  patient_id INT NOT NULL,
  amount DECIMAL(15,2) NOT NULL,
  status ENUM('pending', 'success', 'failed', 'cancelled') DEFAULT 'pending',
  payment_method VARCHAR(50),
  xendit_id VARCHAR(255) UNIQUE,
  xendit_response JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (bill_id) REFERENCES tagihan(id),
  FOREIGN KEY (patient_id) REFERENCES patient(id),
  INDEX idx_bill_id (bill_id),
  INDEX idx_patient_id (patient_id),
  INDEX idx_xendit_id (xendit_id)
);

-- Payment logs for debugging
CREATE TABLE IF NOT EXISTS tagihan_payment_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  payment_id INT,
  log_type VARCHAR(50),
  log_message TEXT,
  log_data JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (payment_id) REFERENCES tagihan_payments(id),
  INDEX idx_payment_id (payment_id)
);
```

**Execute**:
```bash
mysql -u root -p dokterdibya < /staff/backend/schema/trial-payment-tables.sql
```

### 2.3 Create Trial Patient Data

**SQL Script** (save as `/staff/backend/schema/trial-patient-data.sql`):
```sql
-- Find Nanda Ananda patient
SELECT id, name, email FROM patient WHERE name LIKE '%Nanda%' LIMIT 5;

-- If Nanda Ananda exists (e.g., id = 1), create test bills
INSERT INTO tagihan (patient_id, mr_no, amount, status, bill_description)
VALUES 
  (1, 'TRIAL001', 250000, 'pending', 'Consultation and lab tests'),
  (1, 'TRIAL002', 150000, 'pending', 'Medication refill'),
  (1, 'TRIAL003', 500000, 'pending', 'USG examination');

-- Verify bills created
SELECT id, mr_no, amount, status FROM tagihan WHERE patient_id = 1;
```

**Execute**:
```bash
mysql -u root -p dokterdibya < /staff/backend/schema/trial-patient-data.sql
```

### 2.4 Verify Setup

```bash
# Check tables created
mysql -u root -p dokterdibya -e "DESC tagihan; DESC tagihan_payments;"

# Check test data
mysql -u root -p dokterdibya -e "SELECT * FROM tagihan WHERE patient_id = 1;"
```

---

## PHASE 3: Frontend HTML & UI Components (4 hours)

### Objective
Create billing and payment UI in mobile app

### 3.1 Update Index.html - Add Billing Menu Item

**File**: `/mobile-app/www/index.html`

**Find the patient dashboard menu section** (around line 800-900):
```html
<!-- Add this new menu item in the dashboard navigation -->
<div id="billingMenuItem" class="menu-item" onclick="showBillingPage()" style="display:none;">
  <span class="menu-icon">💳</span>
  <span class="menu-text">Pembayaran</span>
</div>
```

### 3.2 Add Billing Page HTML

**Add to index.html** (inside `<body>`, after other pages):
```html
<!-- BILLING PAGE -->
<div id="billingPage" class="page" style="display:none;">
  <div class="page-header">
    <button class="back-btn" onclick="closeBillingPage()">←</button>
    <h1>Pembayaran Tagihan</h1>
    <div></div>
  </div>
  
  <div id="billingContent" class="page-content">
    <!-- Loading state -->
    <div id="billingLoading" class="loading-container" style="display:none;">
      <div class="spinner"></div>
      <p>Memuat data tagihan...</p>
    </div>
    
    <!-- Bills list -->
    <div id="billsList" style="display:none;">
      <div id="billsContainer"></div>
    </div>
    
    <!-- Error state -->
    <div id="billingError" class="error-message" style="display:none;">
      <p id="errorText"></p>
      <button class="btn-primary" onclick="loadBillingData()">Coba Lagi</button>
    </div>
  </div>
</div>

<!-- PAYMENT MODAL -->
<div id="paymentModal" class="modal" style="display:none;">
  <div class="modal-content payment-modal">
    <div class="modal-header">
      <h2>Bayar Tagihan</h2>
      <button class="close-btn" onclick="closePaymentModal()">×</button>
    </div>
    
    <div class="modal-body">
      <!-- Step 1: Select Payment Method -->
      <div id="paymentStep1" class="payment-step" style="display:block;">
        <h3>Pilih Metode Pembayaran</h3>
        <div class="payment-methods">
          <div class="method-card" onclick="selectPaymentMethod('qris')">
            <div class="method-icon">📱</div>
            <div class="method-name">QRIS</div>
            <div class="method-desc">Scan dengan aplikasi banking</div>
          </div>
          
          <div class="method-card" onclick="selectPaymentMethod('va_bca')">
            <div class="method-icon">🏦</div>
            <div class="method-name">Transfer BCA</div>
            <div class="method-desc">Virtual Account</div>
          </div>
          
          <div class="method-card" onclick="selectPaymentMethod('va_bni')">
            <div class="method-icon">🏦</div>
            <div class="method-name">Transfer BNI</div>
            <div class="method-desc">Virtual Account</div>
          </div>
          
          <div class="method-card" onclick="selectPaymentMethod('va_bri')">
            <div class="method-icon">🏦</div>
            <div class="method-name">Transfer BRI</div>
            <div class="method-desc">Virtual Account</div>
          </div>
          
          <div class="method-card" onclick="selectPaymentMethod('va_mandiri')">
            <div class="method-icon">🏦</div>
            <div class="method-name">Transfer Mandiri</div>
            <div class="method-desc">Virtual Account</div>
          </div>
        </div>
      </div>
      
      <!-- Step 2: Payment Details -->
      <div id="paymentStep2" class="payment-step" style="display:none;">
        <h3>Detail Pembayaran</h3>
        
        <div class="payment-details">
          <div class="detail-row">
            <span class="detail-label">Nomor MR:</span>
            <span class="detail-value" id="detailMrNo"></span>
          </div>
          
          <div class="detail-row">
            <span class="detail-label">Jumlah:</span>
            <span class="detail-value" id="detailAmount"></span>
          </div>
          
          <div class="detail-row">
            <span class="detail-label">Metode:</span>
            <span class="detail-value" id="detailMethod"></span>
          </div>
        </div>
        
        <div id="paymentDisplay" style="margin-top: 20px;"></div>
        
        <button class="btn-primary" onclick="continuePayment()" id="continueBtn">
          Lanjutkan
        </button>
      </div>
      
      <!-- Step 3: Payment Success -->
      <div id="paymentStep3" class="payment-step" style="display:none;">
        <div class="success-message">
          <div class="success-icon">✓</div>
          <h3>Pembayaran Berhasil!</h3>
          <p id="successText"></p>
        </div>
        
        <button class="btn-primary" onclick="closeBillingPage()">
          Kembali
        </button>
      </div>
    </div>
  </div>
</div>

<!-- UPDATE NOTIFICATION MODAL -->
<div id="updateNotificationModal" class="modal" style="display:none;">
  <div class="modal-content">
    <div class="modal-header">
      <h2>Update Tersedia</h2>
    </div>
    <div class="modal-body">
      <p>Fitur pembayaran telah tersedia! Silakan refresh aplikasi untuk update.</p>
    </div>
    <div class="modal-footer">
      <button class="btn-primary" onclick="reloadApplication()">
        Update Sekarang
      </button>
    </div>
  </div>
</div>
```

### 3.3 Add CSS Styles

**Add to index.html** (in `<style>` section):
```css
/* BILLING PAGE STYLES */
.billing-card {
  background: white;
  border-radius: 12px;
  padding: 15px;
  margin-bottom: 12px;
  border-left: 4px solid #007AFF;
  display: flex;
  justify-content: space-between;
  align-items: center;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.billing-card .bill-info {
  flex: 1;
}

.billing-card .bill-mr {
  font-weight: 600;
  font-size: 16px;
  margin-bottom: 4px;
}

.billing-card .bill-amount {
  font-size: 18px;
  color: #FF3B30;
  font-weight: 700;
}

.billing-card .bill-status {
  font-size: 12px;
  color: #666;
  margin-top: 4px;
}

.billing-card .bill-status.pending {
  color: #FF9500;
}

.billing-card .bill-action {
  margin-left: 12px;
}

.billing-card .btn-pay {
  background: #007AFF;
  color: white;
  border: none;
  padding: 8px 16px;
  border-radius: 8px;
  font-weight: 600;
  cursor: pointer;
}

/* PAYMENT MODAL STYLES */
.payment-modal {
  max-width: 100%;
}

.payment-step {
  animation: fadeIn 0.3s ease-in;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

.payment-methods {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin: 20px 0;
}

.method-card {
  background: #f5f5f5;
  border: 2px solid transparent;
  border-radius: 12px;
  padding: 16px;
  text-align: center;
  cursor: pointer;
  transition: all 0.3s ease;
}

.method-card:hover,
.method-card.selected {
  border-color: #007AFF;
  background: #E8F4FF;
  transform: scale(1.02);
}

.method-icon {
  font-size: 32px;
  margin-bottom: 8px;
}

.method-name {
  font-weight: 600;
  font-size: 14px;
  margin-bottom: 4px;
}

.method-desc {
  font-size: 12px;
  color: #666;
}

.payment-details {
  background: #f9f9f9;
  border-radius: 12px;
  padding: 16px;
  margin: 16px 0;
}

.detail-row {
  display: flex;
  justify-content: space-between;
  padding: 12px 0;
  border-bottom: 1px solid #eee;
}

.detail-row:last-child {
  border-bottom: none;
}

.detail-label {
  color: #666;
  font-size: 14px;
}

.detail-value {
  font-weight: 600;
  font-size: 14px;
}

/* QRIS DISPLAY */
#qrisDisplay {
  text-align: center;
  padding: 20px;
  background: white;
  border-radius: 12px;
  margin: 16px 0;
}

#qrisImage {
  width: 100%;
  max-width: 300px;
  margin: 16px auto;
  display: block;
}

#qrisText {
  font-size: 12px;
  color: #666;
  margin-top: 12px;
  word-break: break-all;
  background: #f5f5f5;
  padding: 12px;
  border-radius: 8px;
}

/* VA DISPLAY */
#vaDisplay {
  text-align: center;
  padding: 20px;
  background: white;
  border-radius: 12px;
  margin: 16px 0;
}

#vaNumber {
  font-size: 24px;
  font-weight: 700;
  letter-spacing: 2px;
  margin: 16px 0;
  padding: 12px;
  background: #f5f5f5;
  border-radius: 8px;
  word-break: break-all;
}

.va-bank {
  font-size: 14px;
  color: #666;
  margin-bottom: 12px;
}

.va-instructions {
  background: #FFF3CD;
  border-left: 4px solid #FF9500;
  padding: 12px;
  border-radius: 4px;
  font-size: 12px;
  margin: 12px 0;
  text-align: left;
}

/* SUCCESS MESSAGE */
.success-message {
  text-align: center;
  padding: 40px 20px;
}

.success-icon {
  font-size: 64px;
  margin-bottom: 16px;
  animation: scaleIn 0.5s ease;
}

@keyframes scaleIn {
  from { transform: scale(0.5); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}

.success-message h3 {
  font-size: 20px;
  margin-bottom: 12px;
}

.success-message p {
  color: #666;
  font-size: 14px;
}

/* LOADING SPINNER */
.loading-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
}

.spinner {
  width: 40px;
  height: 40px;
  border: 4px solid #f3f3f3;
  border-top: 4px solid #007AFF;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

/* ERROR MESSAGE */
.error-message {
  background: #FEE;
  color: #C33;
  padding: 20px;
  border-radius: 8px;
  margin: 20px;
  text-align: center;
}

.error-message p {
  margin-bottom: 16px;
}

/* BUTTON STYLES */
.btn-primary {
  width: 100%;
  padding: 14px;
  background: #007AFF;
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  margin-top: 16px;
  transition: background 0.3s ease;
}

.btn-primary:hover {
  background: #0051D5;
}

.btn-primary:disabled {
  background: #ccc;
  cursor: not-allowed;
}
```

### 3.4 Update Patient Dashboard to Show Billing Menu

**Find in index.html** (search for patient dashboard menu):
```javascript
// Add this JavaScript code to show/hide billing menu based on app version check
function initializePaymentFeature() {
  // Check if payment_feature is enabled in app-version
  fetch('/api/app-version/check')
    .then(res => res.json())
    .then(data => {
      if (data.payment_feature === true) {
        document.getElementById('billingMenuItem').style.display = 'flex';
      }
    })
    .catch(err => console.log('[TRIAL_PAYMENT] Version check skipped', err));
}

// Call on page load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializePaymentFeature);
} else {
  initializePaymentFeature();
}
```

---

## PHASE 4: JavaScript Payment Logic (4 hours)

### Objective
Implement payment function logic

### 4.1 Create Payment JavaScript File

**File**: `/mobile-app/www/scripts/payment.js` (600+ lines)

```javascript
// ============================================
// PATIENT BILLING PAYMENT SYSTEM
// Trial mode for patient Nanda Ananda
// ============================================

// Global state
let currentBill = null;
let currentPaymentId = null;
let selectedPaymentMethod = null;
let statusCheckInterval = null;

// ============================================
// BILLING PAGE FUNCTIONS
// ============================================

function showBillingPage() {
  console.log('[TRIAL_PAYMENT] Opening billing page');
  document.getElementById('billingPage').style.display = 'flex';
  loadBillingData();
}

function closeBillingPage() {
  console.log('[TRIAL_PAYMENT] Closing billing page');
  document.getElementById('billingPage').style.display = 'none';
  closePaymentModal();
}

async function loadBillingData() {
  const loading = document.getElementById('billingLoading');
  const billsList = document.getElementById('billsList');
  const errorDiv = document.getElementById('billingError');
  
  loading.style.display = 'flex';
  billsList.style.display = 'none';
  errorDiv.style.display = 'none';
  
  try {
    const token = localStorage.getItem('patientToken');
    
    const response = await fetch('/api/trial/patient-billing/me', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }
    
    const data = await response.json();
    
    console.log('[TRIAL_PAYMENT] Bills loaded:', data.bills.length);
    
    displayBills(data.bills);
    
    loading.style.display = 'none';
    billsList.style.display = 'block';
    
  } catch (error) {
    console.error('[TRIAL_PAYMENT] Error loading bills:', error);
    loading.style.display = 'none';
    errorDiv.style.display = 'block';
    document.getElementById('errorText').textContent = 
      'Gagal memuat data tagihan: ' + error.message;
  }
}

function displayBills(bills) {
  const container = document.getElementById('billsContainer');
  container.innerHTML = '';
  
  if (bills.length === 0) {
    container.innerHTML = '<p style="text-align:center;color:#666;padding:20px;">Tidak ada tagihan</p>';
    return;
  }
  
  bills.forEach(bill => {
    const card = document.createElement('div');
    card.className = 'billing-card';
    
    const statusClass = bill.status === 'pending' ? 'pending' : '';
    const statusText = bill.status === 'pending' ? 'Menunggu Pembayaran' : 'Pembayaran Sebagian';
    
    const paidAmount = bill.payments
      .filter(p => p.status === 'success')
      .reduce((sum, p) => sum + p.amount, 0);
    
    card.innerHTML = `
      <div class="bill-info">
        <div class="bill-mr">${bill.mr_no}</div>
        <div class="bill-amount">${formatCurrency(bill.amount)}</div>
        <div class="bill-status ${statusClass}">${statusText}</div>
        ${paidAmount > 0 ? `<div class="bill-status" style="color:#34C759;">Terbayar: ${formatCurrency(paidAmount)}</div>` : ''}
      </div>
      <div class="bill-action">
        <button class="btn-pay" onclick="openPaymentModal('${bill.mr_no}', ${bill.id}, ${bill.amount})">
          Bayar
        </button>
      </div>
    `;
    
    container.appendChild(card);
  });
}

// ============================================
// PAYMENT MODAL FUNCTIONS
// ============================================

function openPaymentModal(mrNo, billId, amount) {
  console.log(`[TRIAL_PAYMENT] Opening payment modal for ${mrNo}, Amount: ${amount}`);
  
  currentBill = { mrNo, billId, amount };
  selectedPaymentMethod = null;
  
  // Reset modal to step 1
  document.getElementById('paymentStep1').style.display = 'block';
  document.getElementById('paymentStep2').style.display = 'none';
  document.getElementById('paymentStep3').style.display = 'none';
  
  // Clear selections
  document.querySelectorAll('.method-card').forEach(card => {
    card.classList.remove('selected');
  });
  
  document.getElementById('paymentModal').style.display = 'flex';
}

function closePaymentModal() {
  document.getElementById('paymentModal').style.display = 'none';
  currentBill = null;
  selectedPaymentMethod = null;
  clearInterval(statusCheckInterval);
}

function selectPaymentMethod(method) {
  console.log(`[TRIAL_PAYMENT] Selected payment method: ${method}`);
  
  selectedPaymentMethod = method;
  
  // Update UI
  document.querySelectorAll('.method-card').forEach(card => {
    card.classList.remove('selected');
  });
  
  event.currentTarget.classList.add('selected');
  
  // Move to step 2
  setTimeout(() => {
    document.getElementById('paymentStep1').style.display = 'none';
    document.getElementById('paymentStep2').style.display = 'block';
    
    // Fill in details
    document.getElementById('detailMrNo').textContent = currentBill.mrNo;
    document.getElementById('detailAmount').textContent = formatCurrency(currentBill.amount);
    document.getElementById('detailMethod').textContent = getMethodDisplayName(method);
    
  }, 300);
}

// ============================================
// PAYMENT CREATION & PROCESSING
// ============================================

async function continuePayment() {
  if (!selectedPaymentMethod || !currentBill) {
    alert('Data pembayaran tidak lengkap');
    return;
  }
  
  const continueBtn = document.getElementById('continueBtn');
  continueBtn.disabled = true;
  continueBtn.textContent = 'Membuat pembayaran...';
  
  try {
    console.log(`[TRIAL_PAYMENT] Creating payment: ${currentBill.mrNo}, Method: ${selectedPaymentMethod}`);
    
    const token = localStorage.getItem('patientToken');
    
    const response = await fetch(
      `/api/trial/patient-billing/${currentBill.mrNo}/create-payment`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ paymentMethod: selectedPaymentMethod })
      }
    );
    
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }
    
    const paymentData = await response.json();
    currentPaymentId = paymentData.payment.id;
    
    console.log('[TRIAL_PAYMENT] Payment created:', paymentData.payment.xenditId);
    
    // Display payment details
    displayPaymentDetails(paymentData.payment);
    
    // Start polling for payment status
    startStatusPolling(currentBill.mrNo, currentPaymentId);
    
    continueBtn.disabled = false;
    continueBtn.textContent = 'Lanjutkan';
    
  } catch (error) {
    console.error('[TRIAL_PAYMENT] Error creating payment:', error);
    alert('Gagal membuat pembayaran: ' + error.message);
    continueBtn.disabled = false;
    continueBtn.textContent = 'Lanjutkan';
  }
}

function displayPaymentDetails(payment) {
  const display = document.getElementById('paymentDisplay');
  display.innerHTML = '';
  
  if (payment.method === 'qris') {
    showQRISDisplay(payment);
  } else {
    showVADisplay(payment);
  }
}

function showQRISDisplay(payment) {
  const display = document.getElementById('paymentDisplay');
  
  display.innerHTML = `
    <div id="qrisDisplay">
      <div>Scan QRIS dengan aplikasi banking Anda</div>
      <canvas id="qrisCanvas" style="width:100%;max-width:300px;margin:16px auto;display:block;"></canvas>
      <div id="qrisText" style="margin-top:12px;word-break:break-all;font-size:11px;color:#999;"></div>
      <div style="margin-top:16px;color:#666;font-size:12px;">
        <p>Pembayaran akan dikonfirmasi secara otomatis</p>
      </div>
    </div>
  `;
  
  // Generate and display QRIS code using QRCode library
  // You'll need to add: <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
  // to the index.html <head>
  
  const canvas = document.getElementById('qrisCanvas');
  if (window.QRCode) {
    new QRCode(canvas, {
      text: payment.qrisString,
      width: 300,
      height: 300
    });
  }
  
  document.getElementById('qrisText').textContent = payment.qrisString;
  
  console.log('[TRIAL_PAYMENT] QRIS display shown');
}

function showVADisplay(payment) {
  const display = document.getElementById('paymentDisplay');
  
  display.innerHTML = `
    <div id="vaDisplay">
      <div class="va-bank">Nomor Virtual Account ${payment.vaBank}</div>
      <div id="vaNumber">${formatVANumber(payment.vaNumber)}</div>
      <div class="va-instructions">
        <strong>Cara Pembayaran:</strong><br>
        1. Buka aplikasi banking ${payment.vaBank}<br>
        2. Pilih menu Transfer/Pembayaran<br>
        3. Masukkan nomor di atas<br>
        4. Jumlah: ${formatCurrency(currentBill.amount)}<br>
        5. Konfirmasi pembayaran
      </div>
      <div style="margin-top:16px;color:#666;font-size:12px;">
        <p>Pembayaran akan dikonfirmasi secara otomatis</p>
      </div>
    </div>
  `;
  
  console.log(`[TRIAL_PAYMENT] VA display shown: ${payment.vaNumber}`);
}

// ============================================
// STATUS POLLING & PAYMENT VERIFICATION
// ============================================

function startStatusPolling(mrNo, paymentId) {
  console.log(`[TRIAL_PAYMENT] Starting status polling for payment: ${paymentId}`);
  
  // Clear any existing interval
  if (statusCheckInterval) {
    clearInterval(statusCheckInterval);
  }
  
  // Check immediately
  checkPaymentStatus(mrNo, paymentId);
  
  // Then check every 5 seconds
  statusCheckInterval = setInterval(() => {
    checkPaymentStatus(mrNo, paymentId);
  }, 5000);
  
  // Stop polling after 30 minutes
  setTimeout(() => {
    clearInterval(statusCheckInterval);
    console.log('[TRIAL_PAYMENT] Polling timeout after 30 minutes');
  }, 30 * 60 * 1000);
}

async function checkPaymentStatus(mrNo, paymentId) {
  try {
    const token = localStorage.getItem('patientToken');
    
    const response = await fetch(
      `/api/trial/patient-billing/${mrNo}/payment-status/${paymentId}`,
      {
        headers: { 'Authorization': `Bearer ${token}` }
      }
    );
    
    if (!response.ok) {
      throw new Error(`Status check failed: ${response.status}`);
    }
    
    const data = await response.json();
    const status = data.payment.status;
    
    console.log(`[TRIAL_PAYMENT] Payment status: ${status}`);
    
    if (status === 'COMPLETED') {
      handlePaymentSuccess();
    }
    
  } catch (error) {
    console.error('[TRIAL_PAYMENT] Error checking status:', error);
  }
}

function handlePaymentSuccess() {
  console.log('[TRIAL_PAYMENT] Payment success detected!');
  
  // Clear polling
  clearInterval(statusCheckInterval);
  
  // Show success step
  document.getElementById('paymentStep2').style.display = 'none';
  document.getElementById('paymentStep3').style.display = 'block';
  
  document.getElementById('successText').textContent = 
    `Pembayaran ${formatCurrency(currentBill.amount)} telah diterima. Terima kasih!`;
  
  // Reload billing data after 3 seconds
  setTimeout(() => {
    loadBillingData();
  }, 3000);
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

function formatCurrency(amount) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0
  }).format(amount);
}

function formatVANumber(vaNumber) {
  // Add spaces every 4 digits for readability
  return vaNumber.replace(/(\d{4})/g, '$1 ').trim();
}

function getMethodDisplayName(method) {
  const names = {
    'qris': 'QRIS',
    'va_bca': 'Transfer BCA',
    'va_bni': 'Transfer BNI',
    'va_bri': 'Transfer BRI',
    'va_mandiri': 'Transfer Mandiri'
  };
  return names[method] || method;
}

// ============================================
// VERSION CHECK & UPDATE NOTIFICATION
// ============================================

async function checkAppVersionAndNotify() {
  try {
    const response = await fetch('/api/app-version/check');
    const data = await response.json();
    
    if (data.payment_feature === true && 
        !localStorage.getItem('paymentFeatureNotified')) {
      
      console.log('[TRIAL_PAYMENT] Payment feature available, showing notification');
      
      document.getElementById('updateNotificationModal').style.display = 'flex';
      localStorage.setItem('paymentFeatureNotified', 'true');
    }
  } catch (error) {
    console.log('[TRIAL_PAYMENT] Version check failed:', error);
  }
}

function reloadApplication() {
  console.log('[TRIAL_PAYMENT] Reloading application...');
  location.reload();
}

// ============================================
// INITIALIZATION
// ============================================

// Run version check and version notifications on app load
document.addEventListener('DOMContentLoaded', () => {
  checkAppVersionAndNotify();
});
```

### 4.2 Add QR Code Library

**Add to index.html** (in `<head>` section):
```html
<script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
```

### 4.3 Link JavaScript File

**Add to index.html** (before closing `</body>`):
```html
<script src="scripts/payment.js"></script>
```

---

## PHASE 5: Integration & System Configuration (3 hours)

### Objective
Integrate all components and enable feature

### 5.1 Update app-version.js

**File**: `/staff/backend/routes/app-version.js`

**Find the response object around line 150-200** and add payment_feature flag:
```javascript
const response = {
  version: currentVersion,
  versionCode: 1,
  forceUpdate: false,
  payment_feature: true,  // ADD THIS LINE - Enable payment feature for trial
  message: 'Fitur pembayaran tersedia!'
};
```

### 5.2 Verify Middleware & Authentication

**Check**: `/staff/backend/middleware/auth.js` has `verifyPatientToken` function

**If missing, create it**:
```javascript
const jwt = require('jsonwebtoken');

function verifyPatientToken(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.patient = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

module.exports = { verifyPatientToken };
```

### 5.3 Environment Variables

**Verify in `.env`** (should already exist from staff billing setup):
```
XENDIT_SECRET_KEY=xnd_...
XENDIT_WEBHOOK_TOKEN=whtoken_...
JWT_SECRET=your_jwt_secret
```

### 5.4 Database Connection Verification

**Check**: `/staff/backend/database.js` exports connection pool

**If using different pattern**, update patient-billing-trial.js imports accordingly

### 5.5 CORS Configuration

**Verify in server.js** that CORS allows `capacitor://localhost`:
```javascript
const cors = require('cors');

app.use(cors({
  origin: [
    'http://localhost',
    'https://localhost',
    'http://localhost:8080',
    'capacitor://localhost',
    'https://dokterdibya.com',
    process.env.ALLOWED_ORIGINS?.split(',')
  ],
  credentials: true
}));
```

### 5.6 Test Endpoints with curl

```bash
# Get patient token first
# (This depends on your auth system, use valid patient JWT)

PATIENT_TOKEN="your_patient_jwt_token"

# Test 1: Get patient overview
curl -X GET \
  -H "Authorization: Bearer $PATIENT_TOKEN" \
  https://dokterdibya.com/api/trial/patient-billing/me

# Test 2: Create QRIS payment
curl -X POST \
  -H "Authorization: Bearer $PATIENT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"paymentMethod":"qris"}' \
  https://dokterdibya.com/api/trial/patient-billing/TRIAL001/create-payment

# Test 3: Check payment status
curl -X GET \
  -H "Authorization: Bearer $PATIENT_TOKEN" \
  https://dokterdibya.com/api/trial/patient-billing/TRIAL001/payment-status/1
```

---

## PHASE 6: Deployment & Testing (3 hours)

### Objective
Deploy to production and conduct comprehensive testing

### 6.1 Pre-Deployment Checklist

- [ ] All 3 backend files created/updated
- [ ] Database tables verified/created
- [ ] Test data (Nanda Ananda bills) created
- [ ] HTML updated with billing UI
- [ ] JavaScript payment.js included
- [ ] CSS styles applied
- [ ] Xendit API keys verified in .env
- [ ] CORS configured for capacitor://localhost
- [ ] Patient token generation working
- [ ] Version check returns payment_feature: true

### 6.2 Deployment Steps

**Step 1**: Deploy backend files
```bash
# 1. Create patient-billing-trial.js
cp /path/to/patient-billing-trial.js /staff/backend/routes/

# 2. Update server.js with route registration and whitelist
# (Use replace_string_in_file tool)

# 3. Verify app-version.js has payment_feature: true
grep "payment_feature" /staff/backend/routes/app-version.js
```

**Step 2**: Deploy frontend files
```bash
# 1. Update index.html with:
#    - Billing menu item
#    - Billing page HTML
#    - Payment modal HTML
#    - CSS styles

# 2. Create payment.js with all functions

# 3. Verify QR code library link in index.html
```

**Step 3**: Restart services
```bash
# Restart Node.js backend
pm2 restart dokterdibya-backend

# Verify web server serves updated HTML
curl https://dokterdibya.com/mobile-app/www/index.html | grep -i "billing"
```

### 6.3 Testing Checklist

#### Backend API Tests (use curl or Postman)
- [ ] GET /api/trial/patient-billing/me returns bills
- [ ] POST /:mrId/create-payment with method=qris returns payment.qrisString
- [ ] POST /:mrId/create-payment with method=va_bca returns payment.vaNumber
- [ ] GET /:mrId/payment-status/:paymentId returns status
- [ ] Status check returns PENDING initially
- [ ] Sending payment updates status to COMPLETED
- [ ] Non-trial patient (not Nanda Ananda) gets 403 error

#### Frontend UI Tests (on Capacitor Android)
- [ ] Billing menu item appears on dashboard
- [ ] Click "Pembayaran" opens billing page
- [ ] Bill list displays with correct MR numbers and amounts
- [ ] Click "Bayar" opens payment modal
- [ ] All 5 payment method cards are clickable
- [ ] Selecting method moves to step 2
- [ ] Step 2 shows payment details
- [ ] QRIS method displays QR code
- [ ] VA methods display virtual account numbers
- [ ] Continue button creates payment
- [ ] Loading indicator shows during creation
- [ ] After success, shows step 3 success screen
- [ ] Bills reload automatically after payment

#### Payment Flow Tests
- [ ] QRIS: Full end-to-end payment with Xendit
- [ ] VA BCA: Full end-to-end payment with Xendit
- [ ] VA BNI: Full end-to-end payment with Xendit
- [ ] VA BRI: Full end-to-end payment with Xendit
- [ ] VA Mandiri: Full end-to-end payment with Xendit
- [ ] Payment status updates within 5 seconds of payment
- [ ] Success screen displays correct amount
- [ ] Database records created for payment
- [ ] Bill status changes to "paid" after successful payment

#### Update Notification Tests
- [ ] App version check runs on load
- [ ] If payment_feature: true, shows update modal
- [ ] Click "Update Sekarang" reloads page
- [ ] After reload, billing menu is visible

#### Error Handling Tests
- [ ] Non-trial patient sees error message
- [ ] Invalid payment method returns error
- [ ] Bill not found returns 404
- [ ] Network error shows retry button
- [ ] Expired payment shows error state

### 6.4 Database Verification Queries

```bash
# Check bills created
mysql -u root -p dokterdibya -e "SELECT * FROM tagihan WHERE patient_id = 1;"

# Check payment records
mysql -u root -p dokterdibya -e "SELECT * FROM tagihan_payments WHERE patient_id = 1;"

# Check payment logs
mysql -u root -p dokterdibya -e "SELECT * FROM tagihan_payment_logs LIMIT 10;"

# Verify Xendit IDs stored
mysql -u root -p dokterdibya -e "SELECT id, bill_id, xendit_id, status FROM tagihan_payments WHERE patient_id = 1;"
```

### 6.5 Production Verification

```bash
# Verify endpoints accessible
curl https://dokterdibya.com/api/trial/patient-billing/me \
  -H "Authorization: Bearer $TOKEN" | jq .

# Check app serves updated HTML
curl https://dokterdibya.com/mobile-app/www/index.html | grep "paymentModal"

# Verify payment.js loaded
curl https://dokterdibya.com/mobile-app/www/scripts/payment.js | grep -i "function"

# Check version endpoint
curl https://dokterdibya.com/api/app-version/check | jq .payment_feature
```

### 6.6 Success Criteria

✅ **All Requirements Met**:
1. Backend API endpoints working and accessible
2. Patient Nanda Ananda can create payments
3. Both QRIS and VA payments functional
4. Status polling updates automatically
5. Database records created for all transactions
6. Mobile app UI displays correctly
7. No app redownload required
8. Update notification works (web-based)
9. Zero errors in console logs (only [TRIAL_PAYMENT] debug logs)
10. Complete payment flow testable end-to-end

---

## DEBUGGING TIPS

### Console Logs to Monitor
All payment-related logs are prefixed with `[TRIAL_PAYMENT]` for easy filtering in browser console:
```javascript
console.log('[TRIAL_PAYMENT] Opening billing page');
console.log('[TRIAL_PAYMENT] Creating QRIS payment');
console.log('[TRIAL_PAYMENT] Payment status: COMPLETED');
```

### Common Issues & Solutions

**Issue**: Patient gets 403 error
- **Solution**: Verify patient name matches "Nanda Ananda" exactly in database

**Issue**: QRIS code not displaying
- **Solution**: Check QRCode library is loaded (check network tab for CDN script)

**Issue**: Status polling not updating
- **Solution**: Check JWT token is valid and hasn't expired

**Issue**: Payment created but status stuck on PENDING
- **Solution**: Check Xendit webhook is receiving payment confirmations

**Issue**: Database error creating payment record
- **Solution**: Verify tagihan_payments table exists and columns match

### Backend Logs

```bash
# Watch backend logs
tail -f /staff/backend/logs/app.log | grep TRIAL_PAYMENT

# Search for specific patient
grep "Nanda Ananda" /staff/backend/logs/app.log

# Monitor Xendit webhooks
grep "xendit_id" /staff/backend/logs/app.log
```

### Frontend Logs

```javascript
// Open browser DevTools (F12) and filter console:
// Filter: [TRIAL_PAYMENT]

// Check localStorage for tokens
localStorage.getItem('patientToken')
localStorage.getItem('paymentFeatureNotified')
```

---

## NEXT STEPS AFTER DEPLOYMENT

1. **Monitor First 24 Hours**: Watch server logs for errors
2. **User Testing**: Have Nanda Ananda test full payment flow
3. **Xendit Verification**: Confirm payments received in Xendit dashboard
4. **Scale Up**: After successful trial, extend to more patients
5. **Full Release**: Remove trial patient check and make available to all

---

## FILES CHECKLIST

**Backend Files**:
- ✅ `/staff/backend/routes/patient-billing-trial.js` (NEW - create)
- ✅ `/staff/backend/server.js` (MODIFY - add route + whitelist)
- ✅ `/staff/backend/routes/app-version.js` (MODIFY - add payment_feature flag)

**Frontend Files**:
- ✅ `/mobile-app/www/index.html` (MODIFY - add billing HTML/CSS)
- ✅ `/mobile-app/www/scripts/payment.js` (NEW - create)

**Database Files**:
- ✅ `/staff/backend/schema/trial-payment-tables.sql` (NEW - create)
- ✅ `/staff/backend/schema/trial-patient-data.sql` (NEW - create)

**Existing Reusable Files** (no changes needed):
- `/staff/backend/utils/xendit-payment.js` - Reused for patient endpoint
- `/staff/backend/capacitor.config.ts` - Already configured
- `/staff/backend/middleware/auth.js` - Already has JWT verification

---

**End of Implementation Prompt**

---

# Addendum: V3 Payments API (Payment Requests) Migration Plan

**Objective**: Add Xendit v3 `payment_requests` flow while keeping existing QRIS/VA as fallback.

## Scope
- Backend only: extend `/staff/backend/utils/xendit-payment.js`
- Existing routes (`/api/patient-billing/*`) can call new helper when `payment_method === 'qris'`
- Webhook remains `/api/webhooks/xendit/payment`

## Why v3
- Unified API for multiple payment methods
- Can still produce QR codes for QRIS
- Better extensibility for future channels

## Implementation Steps

### 1) Add v3 base URL support
**File**: `/staff/backend/utils/xendit-payment.js`
- Add `paymentsBaseUrl: 'https://api.xendit.co'` (same base)
- Ensure `getAxiosInstance()` can be reused for `/v3/payment_requests`

### 2) Implement createPaymentRequest()
**File**: `/staff/backend/utils/xendit-payment.js`
- New function `createPaymentRequest({ amount, mrId, patientName, method })`
- Build payload for QRIS (QR code) using v3:
  - `amount` (integer)
  - `currency: 'IDR'`
  - `reference_id` **and** `external_id` (same value)
  - `description`
  - `payment_method: { type: 'QRIS', reusable: false }`
  - `expires_at` ISO
  - `callback_url` to `https://dokterdibya.com/api/webhooks/xendit/payment`
  - `metadata` with `mr_id`, `patient_name`

### 3) Update QRIS creation to use v3
**File**: `/staff/backend/utils/xendit-payment.js`
- In `createQRISPayment()`, call `createPaymentRequest()` internally
- Map v3 response to existing return shape:
  - `qris_string` from v3 QR data
  - `qris_url` from v3 QR image URL
  - `xendit_id` from v3 payment request ID

### 4) Update getPaymentStatus()
**File**: `/staff/backend/utils/xendit-payment.js`
- If record was created via v3, call `/v3/payment_requests/{id}`
- Map statuses to existing `paid/pending/expired/cancelled`

### 5) Webhook parsing for v3
**File**: `/staff/backend/utils/xendit-payment.js`
- Extend `parseWebhookPayload()` to handle v3 event payloads:
  - Identify `payment_request` or `payment_method` fields
  - Extract `reference_id`/`external_id`, `amount`, and `status`
  - Map to `type: 'qris'` when payment method is QRIS

### 6) Fallback logic (optional)
- If v3 returns `CHANNEL_UNAVAILABLE`, fallback to VA options in UI

## Testing
- Create QRIS via v3 and confirm QR image shows
- Pay QRIS and verify webhook updates bill status
- Confirm `external_id` is present in requests

## Rollback
- Keep old QRIS `/qr_codes` flow; toggle with env flag:
  - `XENDIT_USE_V3_PAYMENT_REQUESTS=true|false`

---

# Claude Task: Implement v3 Flow + Run Tests

**Goal**: Implement Xendit `v3/payment_requests` for QRIS and run an end-to-end test.

## Files to Modify
- `/staff/backend/utils/xendit-payment.js`
- `/staff/backend/routes/patient-billing.js` (if needed to pass method flag)
- `/staff/backend/routes/billing-payment.js` (if needed to pass method flag)

## Implementation Steps
1) **Add env toggle**
  - Read `XENDIT_USE_V3_PAYMENT_REQUESTS` (default `false`).

2) **Add helper: createPaymentRequestV3()** in `/staff/backend/utils/xendit-payment.js`
  - Use POST `/v3/payment_requests`.
  - Payload for QRIS:
    - `amount` (integer)
    - `currency: 'IDR'`
    - `reference_id` and `external_id` (same value)
    - `description`
    - `payment_method: { type: 'QRIS', reusable: false }`
    - `expires_at` ISO
    - `callback_url: 'https://dokterdibya.com/api/webhooks/xendit/payment'`
    - `metadata: { mr_id, patient_name }`

3) **Update createQRISPayment()**
  - If `XENDIT_USE_V3_PAYMENT_REQUESTS=true`, call `createPaymentRequestV3()`.
  - Map v3 response to existing return shape:
    - `xendit_id`
    - `reference_id`
    - `qris_string`
    - `qris_url`

4) **Update getPaymentStatus()**
  - If v3 used, call `/v3/payment_requests/{id}` and map status.

5) **Update webhook parsing**
  - Extend `parseWebhookPayload()` to detect v3 `payment_request` payloads.
  - Map QRIS to `type: 'qris'` and extract `reference_id/external_id`.

6) **Restart backend**
  - `pm2 restart dibyaklinik-backend`

## Tests (Run in order)
1) **Create QRIS payment**
  - Use existing API `POST /api/patient-billing/:billId/create-payment` with `payment_method=qris`.
  - Verify response includes `qris_url` or `qris_string` and non-empty `xendit_id`.

2) **Check status**
  - Call `GET /api/patient-billing/:billId/payment-status/:paymentId`.

3) **Log verification**
  - Confirm no `external_id missing` errors.
  - If `CHANNEL_UNAVAILABLE`, note provider outage (not a code issue).

## Success Criteria
- QRIS creation returns valid `xendit_id` with QR data.
- No API validation error for `external_id`.
- Status endpoint works.



This document contains all specifications needed to implement the patient billing payment feature. Follow phases sequentially and run the testing checklist after each phase to ensure stability before proceeding.
