# Billing Authorization & Notification System

## Overview
Comprehensive 8-step billing workflow with role-based authorization, PDF generation, real-time notifications, and revision request system for Sunday Clinic.

## System Requirements
- Node.js v14+
- MySQL 5.7+
- PDFKit npm package
- WebSocket/realtime-sync system

## Installation Steps

### 1. Install Dependencies
```bash
cd /var/www/dokterdibya/staff/backend
npm install pdfkit
```

### 2. Create Invoices Directory
```bash
mkdir -p /var/www/dokterdibya/database/invoices
chmod 755 /var/www/dokterdibya/database/invoices
chown www-data:www-data /var/www/dokterdibya/database/invoices
```

### 3. Run Database Migration
```bash
mysql -u root -p dokterdibya < /var/www/dokterdibya/staff/backend/migrations/add_billing_revisions.sql
```

Or manually execute:
```sql
-- Create billing revisions table
CREATE TABLE IF NOT EXISTS sunday_clinic_billing_revisions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    mr_id VARCHAR(50) NOT NULL,
    message TEXT NOT NULL,
    requested_by VARCHAR(255) NOT NULL,
    status ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
    approved_at TIMESTAMP NULL,
    approved_by VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_mr_id (mr_id),
    INDEX idx_status (status),
    FOREIGN KEY (mr_id) REFERENCES sunday_clinic_records(mr_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Add print tracking columns to billings table
ALTER TABLE sunday_clinic_billings
ADD COLUMN printed_at TIMESTAMP NULL AFTER confirmed_by,
ADD COLUMN printed_by VARCHAR(255) AFTER printed_at;
```

### 4. Restart Backend Server
```bash
pm2 restart dokterdibya-backend
# or
systemctl restart dokterdibya-backend
```

## Architecture

### Components

1. **Frontend (Billing Component)**
   - File: `staff/public/scripts/sunday-clinic/components/shared/billing.js`
   - Role-based button rendering
   - Event handlers for all billing actions
   - Real-time notification listeners

2. **Backend Routes**
   - File: `staff/backend/routes/sunday-clinic.js`
   - 6 new endpoints for billing workflow
   - Role authorization checks
   - Real-time broadcasting

3. **PDF Generator**
   - File: `staff/backend/utils/pdf-generator.js`
   - Invoice generation (A4 format)
   - Etiket generation (10x15cm label)
   - Automatic file naming and storage

4. **Notification System**
   - File: `staff/public/scripts/sunday-clinic/utils/billing-notifications.js`
   - Real-time event broadcasting
   - Modal notifications for users
   - Dokter-specific revision alerts

5. **Database Tables**
   - `sunday_clinic_billings` - Main billing records
   - `sunday_clinic_billing_items` - Line items
   - `sunday_clinic_billing_revisions` - Revision requests

## Workflow Steps

### Step 1: Dokter Confirms Billing
**Role Required:** `dokter` or `superadmin`

**Frontend:**
```javascript
// Button only visible to dokter
<button class="btn btn-success" id="confirm-billing">Konfirmasi Tagihan</button>

// Event handler
document.getElementById('confirm-billing').addEventListener('click', async () => {
    const response = await fetch(`/api/sunday-clinic/billing/${mrId}/confirm`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
    });
    // Broadcasts notification to all users
});
```

**Backend:**
```javascript
POST /api/sunday-clinic/billing/:mrId/confirm
- Verifies dokter role
- Updates billing status to 'confirmed'
- Records confirmed_at and confirmed_by
- Broadcasts notification via realtime-sync
```

**Notification:**
All non-dokter users receive:
> "Dokter telah selesai memeriksa [Nama Pasien]. Tagihan terkonfirmasi."

### Step 2: Print Buttons Enabled
After confirmation, print buttons become active:
- **Print Etiket** - 10x15cm label with patient info
- **Print Invoice** - A4 full invoice

**Conditional Rendering:**
```javascript
const isPrinterRole = ['dokter', 'superadmin', 'kasir', 'admin'].includes(userRole);
const isConfirmed = billing.status === 'confirmed';
const canPrint = isPrinterRole && isConfirmed;

<button disabled="${!canPrint}">Print Etiket</button>
<button disabled="${!canPrint}">Print Invoice</button>
```

### Step 3: PDF Generation (Invoice Format)
**Endpoint:** `POST /api/sunday-clinic/billing/:mrId/print-invoice`

**PDF Specifications:**
- Size: A4 (210mm x 297mm)
- Sections:
  1. Clinic header with logo and contact info
  2. Invoice number (MR ID) and date
  3. Patient information (name, MR, date of birth)
  4. Itemized table (tindakan, obat, admin fees)
  5. Subtotal and grand total
  6. Footer with signature area

**File Naming:** `{MR_ID}inv.pdf` (e.g., `DRD0001inv.pdf`)

**Storage:** `/database/invoices/`

### Step 4: Real-time Alert Notification
**Technology:** WebSocket via realtime-sync module

**Event Flow:**
```
Dokter confirms billing
    ↓
Backend broadcasts event
    ↓
realtime-sync distributes to all connected clients
    ↓
Frontend listeners receive event
    ↓
Modal notification displayed to non-dokter users
```

**Event Payload:**
```javascript
{
    type: 'billing_confirmed',
    mrId: 'DRD0001',
    patientName: 'Ibu Contoh',
    doctorName: 'Dr. John',
    timestamp: '2025-01-01T10:00:00.000Z'
}
```

### Step 5: Auto-generate PDF Files
**Invoice PDF:**
- Triggered by: "Print Invoice" button click
- Backend generates PDF using PDFKit
- Saves to `/database/invoices/{mrId}inv.pdf`
- Returns download link
- Updates `printed_at` and `printed_by` columns

**Etiket PDF:**
- Triggered by: "Print Etiket" button click
- Generates 10x15cm label
- Saves to `/database/invoices/{mrId}e.pdf`
- Simplified format for label printers

### Step 6: Request Revision (Non-Dokter)
**Role:** Any role except dokter

**Frontend:**
```javascript
<button class="btn btn-warning" id="request-revision">Ajukan Usulan</button>

document.getElementById('request-revision').addEventListener('click', async () => {
    const message = prompt('Masukkan usulan revisi:');
    if (!message) return;
    
    await fetch(`/api/sunday-clinic/billing/${mrId}/request-revision`, {
        method: 'POST',
        headers: { 
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
            message, 
            requestedBy: currentStaffIdentity.name 
        })
    });
});
```

**Backend:**
```javascript
POST /api/sunday-clinic/billing/:mrId/request-revision
- Inserts revision request into sunday_clinic_billing_revisions
- Broadcasts notification to all dokter users
- Returns success confirmation
```

### Step 7: Dokter Receives Revision Request
**Notification Method:** Modal confirmation dialog

**Frontend Listener:**
```javascript
window.realtimeSync.on('revision_requested', (data) => {
    const userRole = window.currentStaffIdentity?.role || '';
    const isDokter = userRole === 'dokter' || userRole === 'superadmin';

    if (isDokter) {
        const message = `Usulan revisi untuk ${data.patientName} dari ${data.requestedBy}:\n\n"${data.message}"`;
        
        if (confirm(message + '\n\nSetujui usulan ini?')) {
            // Approve revision
            fetch(`/api/sunday-clinic/billing/revisions/${data.revisionId}/approve`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });
        }
    }
});
```

**Backend:**
```javascript
POST /api/sunday-clinic/billing/revisions/:id/approve
- Verifies dokter role
- Updates revision status to 'approved'
- Reverts billing status to 'draft'
- Records approved_at and approved_by
- Allows dokter to make changes and reconfirm
```

### Step 8: Reconfirmation After Approval
**Workflow:**
1. Dokter approves revision request
2. Billing status automatically reverts to 'draft'
3. Print buttons become disabled
4. Dokter makes necessary changes to billing
5. Dokter clicks "Konfirmasi Tagihan" again
6. Billing status returns to 'confirmed'
7. Print buttons re-enabled
8. Cycle repeats if needed

## API Endpoints

### 1. Confirm Billing
```
POST /api/sunday-clinic/billing/:mrId/confirm
Authorization: Bearer <token>
Role Required: dokter, superadmin

Response:
{
    "success": true,
    "message": "Billing berhasil dikonfirmasi",
    "patientName": "Ibu Contoh"
}
```

### 2. Request Revision
```
POST /api/sunday-clinic/billing/:mrId/request-revision
Authorization: Bearer <token>
Content-Type: application/json

Body:
{
    "message": "Mohon ditambahkan biaya konsultasi",
    "requestedBy": "Perawat Siti"
}

Response:
{
    "success": true,
    "message": "Usulan revisi berhasil dikirim"
}
```

### 3. Get Pending Revisions
```
GET /api/sunday-clinic/billing/revisions/pending
Authorization: Bearer <token>
Role Required: dokter, superadmin

Response:
{
    "success": true,
    "revisions": [
        {
            "id": 1,
            "mr_id": "DRD0001",
            "patient_name": "Ibu Contoh",
            "message": "Mohon ditambahkan biaya konsultasi",
            "requested_by": "Perawat Siti",
            "status": "pending",
            "created_at": "2025-01-01T10:00:00.000Z"
        }
    ]
}
```

### 4. Approve Revision
```
POST /api/sunday-clinic/billing/revisions/:id/approve
Authorization: Bearer <token>
Role Required: dokter, superadmin

Response:
{
    "success": true,
    "message": "Usulan revisi disetujui"
}
```

### 5. Print Etiket
```
POST /api/sunday-clinic/billing/:mrId/print-etiket
Authorization: Bearer <token>
Role Required: dokter, superadmin, kasir, admin

Response:
{
    "success": true,
    "message": "Etiket berhasil dicetak",
    "filepath": "/database/invoices/DRD0001e.pdf",
    "filename": "DRD0001e.pdf"
}
```

### 6. Print Invoice
```
POST /api/sunday-clinic/billing/:mrId/print-invoice
Authorization: Bearer <token>
Role Required: dokter, superadmin, kasir, admin

Response:
{
    "success": true,
    "message": "Invoice berhasil dicetak",
    "filepath": "/database/invoices/DRD0001inv.pdf",
    "filename": "DRD0001inv.pdf"
}
```

## Role Permissions

| Role | Confirm Billing | Print | Request Revision | Approve Revision |
|------|----------------|-------|------------------|------------------|
| dokter | ✅ | ✅ | ❌ | ✅ |
| superadmin | ✅ | ✅ | ❌ | ✅ |
| kasir | ❌ | ✅ | ✅ | ❌ |
| admin | ❌ | ✅ | ✅ | ❌ |
| bidan | ❌ | ❌ | ✅ | ❌ |
| perawat | ❌ | ❌ | ✅ | ❌ |
| managerial | ❌ | ❌ | ✅ | ❌ |

## Database Schema

### sunday_clinic_billing_revisions
```sql
CREATE TABLE sunday_clinic_billing_revisions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    mr_id VARCHAR(50) NOT NULL,
    message TEXT NOT NULL,
    requested_by VARCHAR(255) NOT NULL,
    status ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
    approved_at TIMESTAMP NULL,
    approved_by VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_mr_id (mr_id),
    INDEX idx_status (status),
    FOREIGN KEY (mr_id) REFERENCES sunday_clinic_records(mr_id) ON DELETE CASCADE
);
```

### sunday_clinic_billings (additions)
```sql
ALTER TABLE sunday_clinic_billings
ADD COLUMN printed_at TIMESTAMP NULL,
ADD COLUMN printed_by VARCHAR(255);
```

## Testing Checklist

### Basic Functionality
- [ ] Dokter can confirm billing
- [ ] Non-dokter cannot confirm billing (403 error)
- [ ] Print buttons disabled before confirmation
- [ ] Print buttons enabled after confirmation
- [ ] Invoice PDF generates correctly
- [ ] Etiket PDF generates correctly
- [ ] PDFs saved to /database/invoices directory
- [ ] File naming follows {mrId}inv.pdf and {mrId}e.pdf pattern

### Notification System
- [ ] Billing confirmation broadcasts to all users
- [ ] Non-dokter users receive notification modal
- [ ] Modal displays correct patient name and doctor name
- [ ] Modal auto-closes after 10 seconds
- [ ] Modal can be closed manually

### Revision Workflow
- [ ] Non-dokter can request revision
- [ ] Revision request saves to database
- [ ] Revision notification broadcasts to dokter
- [ ] Dokter receives confirmation dialog
- [ ] Dokter can approve revision
- [ ] Billing reverts to draft after approval
- [ ] Print buttons disabled after revert
- [ ] Dokter can make changes and reconfirm
- [ ] Revision status updates to 'approved'

### Security & Authorization
- [ ] JWT token required for all endpoints
- [ ] Role checks enforced on backend
- [ ] Frontend buttons hidden based on role
- [ ] Unauthorized access returns 403
- [ ] SQL injection prevented
- [ ] XSS protection in place

### Edge Cases
- [ ] Handles missing patient data gracefully
- [ ] Handles network errors
- [ ] Handles PDF generation errors
- [ ] Handles concurrent confirmation attempts
- [ ] Handles invalid MR IDs
- [ ] Handles realtime-sync unavailability

## Troubleshooting

### PDFs Not Generating
```bash
# Check if pdfkit is installed
npm list pdfkit

# Install if missing
npm install pdfkit

# Check directory permissions
ls -la /var/www/dokterdibya/database/invoices

# Fix permissions if needed
sudo chown -R www-data:www-data /var/www/dokterdibya/database/invoices
sudo chmod -R 755 /var/www/dokterdibya/database/invoices
```

### Notifications Not Working
```bash
# Check if realtime-sync is available
grep "realtime-sync" /var/www/dokterdibya/staff/backend/routes/sunday-clinic.js

# Check backend logs
pm2 logs dokterdibya-backend --lines 100

# Check browser console for WebSocket errors
# Open browser DevTools > Console
```

### Database Errors
```bash
# Check if migration ran successfully
mysql -u root -p -e "SHOW TABLES LIKE 'sunday_clinic_billing_revisions';" dokterdibya

# Check table structure
mysql -u root -p -e "DESCRIBE sunday_clinic_billing_revisions;" dokterdibya

# Check for orphaned records
mysql -u root -p -e "SELECT * FROM sunday_clinic_billing_revisions WHERE mr_id NOT IN (SELECT mr_id FROM sunday_clinic_records);" dokterdibya
```

### Permission Denied Errors
```bash
# Check file permissions
ls -la /var/www/dokterdibya/database/invoices

# Check process user
ps aux | grep node

# Fix ownership
sudo chown -R www-data:www-data /var/www/dokterdibya/database
```

## Performance Considerations

### PDF Generation
- PDFs generated on-demand (not pre-generated)
- Average generation time: 200-500ms per PDF
- Consider caching for frequently accessed invoices
- Monitor disk space in /database/invoices

### Database Queries
- Indexed on mr_id, status columns
- Efficient JOINs for patient name lookup
- Pagination recommended for revision list (if many revisions)

### Real-time Broadcasting
- Lightweight JSON payloads
- Event filtering on client side
- Automatic reconnection handled by realtime-sync

## Future Enhancements

### Phase 2 (Optional)
- [ ] Batch printing multiple invoices
- [ ] Email invoice to patient
- [ ] SMS notification on billing confirmation
- [ ] Export billing history to Excel
- [ ] Advanced reporting and analytics
- [ ] Revision history tracking (audit log)
- [ ] Billing templates for common procedures
- [ ] Payment integration (credit card, e-wallet)

### Phase 3 (Optional)
- [ ] Mobile app for billing management
- [ ] Barcode/QR code for invoices
- [ ] Integration with accounting software
- [ ] Multi-currency support
- [ ] Automated backup of PDF files
- [ ] Cloud storage integration (AWS S3, Google Drive)

## Support & Maintenance

### Regular Maintenance
- Monitor /database/invoices disk usage
- Archive old PDF files (older than 1 year)
- Review and clean up old revision requests
- Update PDFKit library periodically
- Test notification system weekly

### Contact
For issues or questions:
- Developer: GitHub Copilot
- Documentation: /var/www/dokterdibya/BILLING_AUTHORIZATION_SYSTEM.md
- Backend Code: /var/www/dokterdibya/staff/backend/routes/sunday-clinic.js
- Frontend Code: /var/www/dokterdibya/staff/public/scripts/sunday-clinic/components/shared/billing.js

