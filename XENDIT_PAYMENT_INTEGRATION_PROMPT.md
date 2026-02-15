# Xendit Payment Integration with Tagihan - Implementation Prompt

## Task Overview
Integrate Xendit payment gateway into the DokterDibya billing system to enable invoice-based (Tagihan) payments with the following payment methods:
- **QRIS** (Quick Response Code Indonesian Standard)
- **Virtual Accounts (VA)**: BCA, BNI, BRI, Mandiri

## Current System Context
The application already has:
- Billing system in `/staff/public/scripts/sunday-clinic/components/shared/billing.js`
- Backend API routes in `/staff/backend/routes/sunday-clinic.js`
- PDF invoice generation in `/staff/backend/utils/pdf-generator.js`
- Database schema with `sunday_clinic_billings` and `sunday_clinic_billing_items` tables
- Real-time notification system via WebSockets

## Requirements

### 1. Xendit API Integration
- Implement Xendit Node.js SDK integration
- Store Xendit API Key securely in environment variables
- Create utility module: `/staff/backend/utils/xendit-payment.js`

### 2. Invoice/Tagihan Payment Methods
Implement these Xendit payment methods:
- **QRIS Payment**: Dynamic QR code generation for each invoice
- **Virtual Accounts**:
  - BCA (Bank Central Asia)
  - BNI (Bank Negara Indonesia)
  - BRI (Bank Rakyat Indonesia)
  - Mandiri (Bank Mandiri)

### 3. Database Schema Extensions
Add tables to track payment information:
```sql
-- Invoice/Tagihan Payment Tracking
CREATE TABLE tagihan_payments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    mr_id VARCHAR(50) NOT NULL,
    invoice_id VARCHAR(100) UNIQUE,
    xendit_id VARCHAR(100) UNIQUE,
    payment_method ENUM('qris', 'va_bca', 'va_bni', 'va_bri', 'va_mandiri'),
    va_number VARCHAR(50),
    qris_code LONGTEXT,
    amount_total DECIMAL(15, 2),
    amount_paid DECIMAL(15, 2) DEFAULT 0,
    payment_status ENUM('pending', 'paid', 'expired', 'failed') DEFAULT 'pending',
    payment_code VARCHAR(50),
    paid_at TIMESTAMP NULL,
    expired_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_mr_id (mr_id),
    INDEX idx_xendit_id (xendit_id),
    INDEX idx_status (payment_status),
    FOREIGN KEY (mr_id) REFERENCES sunday_clinic_records(mr_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Payment Details Log
CREATE TABLE tagihan_payment_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tagihan_payment_id INT,
    event_type VARCHAR(50),
    event_data JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tagihan_payment_id) REFERENCES tagihan_payments(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### 4. Backend API Endpoints
Create these endpoints in `/staff/backend/routes/sunday-clinic.js`:

#### 4.1 Create Tagihan Payment
```
POST /api/sunday-clinic/billing/:mrId/create-payment
Request:
{
  payment_method: 'qris' | 'va_bca' | 'va_bni' | 'va_bri' | 'va_mandiri',
  amount: number
}
Response:
{
  success: true,
  data: {
    xendit_id: string,
    va_number?: string,
    qris_code?: string,
    invoice_url: string,
    expires_at: timestamp
  }
}
```

#### 4.2 Check Payment Status
```
GET /api/sunday-clinic/billing/:mrId/payment-status/:xenditId
Response:
{
  success: true,
  data: {
    status: 'pending' | 'paid' | 'expired' | 'failed',
    amount_paid: number,
    paid_at?: timestamp
  }
}
```

#### 4.3 Webhook Handler (for Xendit callbacks)
```
POST /api/webhooks/xendit/payment-notification
- Verify webhook signature
- Update payment status in DB
- Broadcast real-time notification
- Update billing confirmation status
```

#### 4.4 Get Invoice Payment Details
```
GET /api/sunday-clinic/billing/:mrId/payment-details
Response:
{
  success: true,
  data: {
    invoice_id: string,
    payment_method: string,
    va_number?: string,
    qris_code?: string,
    amount: number,
    status: string,
    created_at: timestamp,
    expires_at: timestamp
  }
}
```

### 5. Frontend Integration
#### 5.1 Billing Component Update
File: `/staff/public/scripts/sunday-clinic/components/shared/billing.js`
- Add payment method selection UI
- Display payment details (VA number, QRIS code)
- Show payment status and countdown timer
- Copy-to-clipboard for VA numbers
- Display QR code image for QRIS

#### 5.2 Payment Modal Component
Create: `/staff/public/scripts/sunday-clinic/components/shared/payment-modal.js`
- Modal for selecting payment method
- Display VA number with copy button
- Display QRIS as scannable QR code image
- Real-time status polling
- Success/failure notifications

#### 5.3 Invoice Display Updates
- Show "Waiting for Payment" status on invoices
- Add payment details section to invoice PDF
- Include VA numbers and QRIS code in invoice
- Add payment expiration countdown

### 6. Features to Implement

#### 6.1 Payment Method Selection
- Radio button group for payment methods
- Display available banks for VA option
- Show QR code preview for QRIS

#### 6.2 Payment Details Display
- Show VA number with auto-copy functionality
- Show QRIS as scannable QR code (use qrcode library)
- Countdown timer to expiration
- Manual refresh button

#### 6.3 Payment Verification
- Real-time status polling (every 5-10 seconds)
- Webhook handler for instant notifications
- Update billing confirmation when payment received
- Broadcast notifications to all users

#### 6.4 Payment History
- Store all payment attempts and webhooks
- Display payment logs per invoice
- Track payment expiration
- Handle retry mechanism

### 7. Security Considerations
- Store Xendit API key in `.env` file (never commit)
- Verify webhook signatures using Xendit's public key
- Validate payment amounts before processing
- Rate limit payment creation endpoints
- Use HTTPS for all payment communication
- Implement CORS properly for payment domain

### 8. Error Handling
- Handle network errors gracefully
- Retry logic for failed API calls
- User-friendly error messages in UI
- Log all errors for debugging
- Handle webhook failures and retries

### 9. Testing
- Test payment creation for all methods (QRIS, VA x4)
- Test webhook payload verification
- Test payment confirmation and status updates
- Test error scenarios and edge cases
- Manual testing with Xendit sandbox environment

### 10. Deliverables

**Backend Files to Create/Update:**
1. `/staff/backend/utils/xendit-payment.js` - Xendit API utility
2. `/staff/backend/routes/sunday-clinic.js` - Add payment endpoints
3. `/staff/backend/migrations/add_xendit_payment_tables.sql` - Database migrations
4. `.env.example` - Add XENDIT_API_KEY variable

**Frontend Files to Create/Update:**
1. `/staff/public/scripts/sunday-clinic/components/shared/payment-modal.js` - New modal component
2. `/staff/public/scripts/sunday-clinic/components/shared/billing.js` - Update with payment integration
3. `/staff/public/sunday-clinic.html` - Add payment modal and scripts

**Package Dependencies:**
- `xendit`: Xendit SDK
- `qrcode`: For QRIS QR code generation
- `axios` (if not already present): For HTTP requests
- `dotenv`: For environment variables

**Configuration:**
- Add XENDIT_API_KEY to `.env`
- Add XENDIT_WEBHOOK_SECRET to `.env`
- Configure webhook endpoint URL in Xendit dashboard

## Implementation Notes
- Use existing WebSocket notification system for real-time updates
- Integrate with existing PDF invoice system (add payment details to PDF)
- Follow existing code style and patterns
- Maintain role-based access control
- Ensure backward compatibility with existing billing system
- Add proper TypeScript-style JSDoc comments for clarity

## Success Criteria
✅ Users can select payment method when confirming billing
✅ QRIS payment generates scannable QR code
✅ VA payments generate account numbers for all 4 banks
✅ Payment status updates in real-time when payment received
✅ Webhooks properly handle payment confirmations
✅ Invoice reflects payment status
✅ All payment methods tested successfully
✅ Error handling covers edge cases
✅ UI is user-friendly and responsive
