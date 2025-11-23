# Billing System - Quick Reference Guide

## Installation (Choose One)

### Automated (Recommended)
```bash
sudo bash /var/www/dokterdibya/install-billing-system.sh
```

### Manual
```bash
# Install PDFKit
cd /var/www/dokterdibya/staff/backend && npm install pdfkit

# Create directory
sudo mkdir -p /var/www/dokterdibya/database/invoices
sudo chmod 755 /var/www/dokterdibya/database/invoices
sudo chown www-data:www-data /var/www/dokterdibya/database/invoices

# Run migration
mysql -u root -p dokterdibya < staff/backend/migrations/add_billing_revisions.sql

# Restart backend
pm2 restart dokterdibya-backend
```

## User Workflows

### As Dokter
1. Navigate to Billing section
2. Review billing items
3. Click **"Konfirmasi Tagihan"** → Billing confirmed, all users notified
4. Click **"Print Invoice"** or **"Print Etiket"** → PDF generated
5. If revision requested: Receive notification → Approve → Edit → Reconfirm

### As Non-Dokter (Perawat/Bidan/Kasir)
1. Navigate to Billing section
2. Review billing items
3. If changes needed: Click **"Ajukan Usulan"** → Enter message → Send
4. Wait for dokter approval
5. After confirmation: Can print (kasir/admin only)

## Role Permissions

| Action | Dokter | Superadmin | Kasir | Admin | Others |
|--------|--------|------------|-------|-------|--------|
| Confirm | ✅ | ✅ | ❌ | ❌ | ❌ |
| Print | ✅ | ✅ | ✅ | ✅ | ❌ |
| Request Revision | ❌ | ❌ | ✅ | ✅ | ✅ |
| Approve Revision | ✅ | ✅ | ❌ | ❌ | ❌ |

## API Endpoints

```bash
# Confirm billing
POST /api/sunday-clinic/billing/:mrId/confirm
Headers: Authorization: Bearer <token>

# Request revision
POST /api/sunday-clinic/billing/:mrId/request-revision
Body: { "message": "...", "requestedBy": "..." }

# Approve revision
POST /api/sunday-clinic/billing/revisions/:id/approve

# Print invoice
POST /api/sunday-clinic/billing/:mrId/print-invoice

# Print etiket
POST /api/sunday-clinic/billing/:mrId/print-etiket
```

## Troubleshooting

### PDFs Not Generating?
```bash
npm list pdfkit --prefix /var/www/dokterdibya/staff/backend
ls -la /var/www/dokterdibya/database/invoices
pm2 logs dokterdibya-backend --lines 50
```

### Notifications Not Working?
Check browser console (F12) and backend logs:
```bash
pm2 logs dokterdibya-backend --lines 100 | grep "realtime-sync"
```

### Permission Denied?
```bash
sudo chown -R www-data:www-data /var/www/dokterdibya/database/invoices
sudo chmod -R 755 /var/www/dokterdibya/database/invoices
```

### Database Error?
```sql
SHOW TABLES LIKE 'sunday_clinic_billing_revisions';
DESCRIBE sunday_clinic_billings;
```

## File Locations

- **Documentation**: `/var/www/dokterdibya/BILLING_AUTHORIZATION_SYSTEM.md`
- **Summary**: `/var/www/dokterdibya/BILLING_IMPLEMENTATION_SUMMARY.md`
- **Quick Guide**: `/var/www/dokterdibya/BILLING_QUICK_REFERENCE.md`
- **Backend Routes**: `/var/www/dokterdibya/staff/backend/routes/sunday-clinic.js`
- **Frontend Billing**: `/var/www/dokterdibya/staff/public/scripts/sunday-clinic/components/shared/billing.js`
- **PDF Generator**: `/var/www/dokterdibya/staff/backend/utils/pdf-generator.js`
- **Notifications**: `/var/www/dokterdibya/staff/public/scripts/sunday-clinic/utils/billing-notifications.js`
- **Migration**: `/var/www/dokterdibya/staff/backend/migrations/add_billing_revisions.sql`
- **Install Script**: `/var/www/dokterdibya/install-billing-system.sh`
- **PDF Storage**: `/var/www/dokterdibya/database/invoices/`

## Logs

```bash
# Backend logs
pm2 logs dokterdibya-backend

# Real-time logs
pm2 logs dokterdibya-backend --lines 100 --raw

# Error logs only
pm2 logs dokterdibya-backend --err

# Database logs
sudo tail -f /var/log/mysql/error.log
```

## Testing Commands

```bash
# Check PDFKit installation
npm list pdfkit --prefix /var/www/dokterdibya/staff/backend

# Check directory
ls -la /var/www/dokterdibya/database/invoices

# Check database
mysql -u root -p -e "USE dokterdibya; SHOW TABLES LIKE 'sunday_clinic_billing%';"

# Test PDF generation (curl)
curl -X POST http://localhost:3000/api/sunday-clinic/billing/DRD0001/print-invoice \
  -H "Authorization: Bearer <token>"

# Check generated PDFs
ls -lh /var/www/dokterdibya/database/invoices/*.pdf
```

## Support

- Check logs first: `pm2 logs dokterdibya-backend`
- Review full documentation: `BILLING_AUTHORIZATION_SYSTEM.md`
- Implementation details: `BILLING_IMPLEMENTATION_SUMMARY.md`

