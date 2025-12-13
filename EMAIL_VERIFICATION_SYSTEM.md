# Email Verification System - Documentation

## Gambaran Umum

Sistem verifikasi email untuk memastikan pasien menggunakan email yang valid sebelum dapat mengakses layanan klinik.

## Flow Registrasi Baru

```text
1. User Register (email, password, dll)
   ↓
2. System:
   - Generate 6 digit verification code
   - Store code in database (expires 24 hours)
   - Send email with code
   - Create JWT token (email_verified = false)
   ↓
3. Redirect to /verify-email.html
   ↓
4. User input 6 digit code
   ↓
5. System verify code
   ↓
6. If valid:
   - Update email_verified = 1
   - Redirect to /complete-birthdate.html
   ↓
7. Complete birthdate
   ↓
8. Complete profile
   ↓
9. Access dashboard
```

## Database Schema

### Kolom Baru di Tabel `patients`

```sql
-- Status verifikasi email
email_verified TINYINT(1) DEFAULT 0
  - 0 = belum diverifikasi
  - 1 = sudah diverifikasi

-- Token verifikasi (6 digit code)
verification_token VARCHAR(255) DEFAULT NULL

-- Waktu expiry token (24 jam)
verification_token_expires DATETIME DEFAULT NULL
```

## API Endpoints

### 1. POST /api/patients/register

**Perubahan:** Sekarang generate verification token dan kirim email

**Request:**

```json
{
  "fullname": "John Doe",
  "email": "john@example.com",
  "phone": "6281234567890",
  "password": "password123"
}
```

**Response:**
```json
{
  "message": "Registrasi berhasil. Silakan cek email Anda untuk verifikasi.",
  "token": "jwt_token_here",
  "user": {
    "id": "12345",
    "fullname": "John Doe",
    "email": "john@example.com",
    "phone": "6281234567890",
    "role": "patient",
    "email_verified": false
  },
  "requires_verification": true
}
```

**Email yang dikirim:**

- Subject: "Verifikasi Email - Klinik Dr. Dibya"
- Berisi: 6 digit code
- Link verifikasi: `https://dokterdibya.com/verify-email.html?token=123456&email=john@example.com`
- Expiry: 24 jam

### 2. POST /api/patients/verify-email

**Fungsi:** Verifikasi kode yang diinput user

**Request:**

```json
{
  "email": "john@example.com",
  "token": "123456"
}
```

**Response Success:**

```json
{
  "success": true,
  "message": "Email berhasil diverifikasi!",
  "user": {
    "id": "12345",
    "full_name": "John Doe",
    "email": "john@example.com",
    "email_verified": true
  }
}
```

**Response Error:**

```json
{
  "message": "Kode verifikasi tidak valid"
}
// atau
{
  "message": "Kode verifikasi sudah kadaluarsa. Silakan minta kode baru."
}
// atau
{
  "message": "Email sudah diverifikasi sebelumnya"
}
```

### 3. POST /api/patients/resend-verification

**Fungsi:** Kirim ulang kode verifikasi baru

**Request:**

```json
{
  "email": "john@example.com"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Kode verifikasi baru telah dikirim ke email Anda"
}
```

### 4. GET /api/patients/profile

**Perubahan:** Sekarang return `email_verified` field

**Response:**

```json
{
  "user": {
    "id": "12345",
    "full_name": "John Doe",
    "email": "john@example.com",
    "phone": "6281234567890",
    "email_verified": 1,
    "birth_date": "1990-01-01",
    "profile_completed": 1
  }
}
```

## Frontend Files

### 1. /verify-email.html

**Halaman verifikasi email dengan fitur:**

- Input 6 digit code
- Auto-fill jika dari link email
- Timer untuk resend (60 detik)
- Tombol "Kirim Ulang Kode"
- Success animation
- Responsive design

**URL Parameters:**

- `token` - Kode verifikasi (optional, auto-fill)
- `email` - Email user (optional, auto-fill)

**Example:**

```text
https://dokterdibya.com/verify-email.html?token=123456&email=john@example.com
```

### 2. /js/auth.js

**Update:**

#### signUpWithEmail()

```javascript
// Redirect ke verify-email setelah register
window.location.href = '/verify-email.html';
```

#### checkProfileCompletionAndRedirect()

```javascript
// Cek email_verified PERTAMA sebelum yang lain
if (profile.email_verified === 0) {
    window.location.href = '/verify-email.html';
    return;
}

// Kemudian cek birth_date
if (!profile.birth_date) {
    window.location.href = '/complete-birthdate.html';
    return;
}

// Terakhir cek profile_completed
if (profile.profile_completed === 1) {
    window.location.href = '/patient-dashboard.html';
} else {
    window.location.href = '/complete-profile.html';
}
```

## Email Service Configuration

Email menggunakan **nodemailer** melalui `NotificationService`.

### Environment Variables Required

```bash
# Enable/disable email
EMAIL_ENABLED=true

# SMTP Configuration
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_SECURE=false
EMAIL_USER=your-email@gmail.com
EMAIL_PASSWORD=your-app-password

# Frontend URL for verification links
FRONTEND_URL=https://dokterdibya.com

# Clinic info
CLINIC_NAME=Klinik Dr. Dibya
```

### Gmail Setup

1. Enable 2-Factor Authentication
2. Generate App Password
3. Use App Password in `EMAIL_PASSWORD`

## Special Cases

### Google Sign-In Users

- **Automatic verification:** `email_verified = 1`
- Google sudah verify email, tidak perlu verifikasi lagi
- Langsung ke birthdate/profile completion

### Existing Users

- User yang sudah terdaftar sebelum sistem verifikasi
- `email_verified = 0` by default
- Akan diminta verifikasi saat login berikutnya
- Opsi: Bulk update existing users ke `email_verified = 1`

## Testing

### 1. Test Email Service

```javascript
const NotificationService = require('./utils/notification');
const notif = new NotificationService();

notif.sendEmail({
    to: 'test@example.com',
    subject: 'Test Email',
    html: '<h1>Test</h1>'
});
```

### 2. Test Registration Flow

```bash
# 1. Register new user
curl -X POST http://localhost:3001/api/patients/register \
  -H "Content-Type: application/json" \
  -d '{
    "fullname": "Test User",
    "email": "test@example.com",
    "phone": "6281234567890",
    "password": "password123"
  }'

# Response akan ada verification_token di email

# 2. Verify email
curl -X POST http://localhost:3001/api/patients/verify-email \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "token": "123456"
  }'

# 3. Check profile
curl -X GET http://localhost:3001/api/patients/profile \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### 3. Test Database

```sql
-- Check verification status
SELECT id, full_name, email, email_verified, verification_token, verification_token_expires
FROM patients 
WHERE email = 'test@example.com';

-- Manual verify (for testing)
UPDATE patients 
SET email_verified = 1, verification_token = NULL, verification_token_expires = NULL
WHERE email = 'test@example.com';
```

## Security Considerations

### Token Security

- ✅ 6 digit random code (1 million combinations)
- ✅ Expires after 24 hours
- ✅ Stored hashed in database (optional enhancement)
- ✅ Rate limiting on resend (60 seconds)
- ✅ Token cleared after verification

### Best Practices

1. **Rate Limiting:** Limit verification attempts (e.g., 5 per hour)
2. **IP Tracking:** Log failed verification attempts
3. **Email Throttling:** Limit resend emails (current: 60 seconds)
4. **Token Complexity:** Could upgrade to alphanumeric for more security

## Troubleshooting

### Email tidak terkirim

```bash
# Check email service status
pm2 logs dibyaklinik-backend | grep -i email

# Check environment variables
pm2 env 0 | grep EMAIL

# Test SMTP connection
curl -v telnet://smtp.gmail.com:587
```

### User tidak bisa verify

```sql
-- Check token status
SELECT email, verification_token, verification_token_expires 
FROM patients 
WHERE email = 'user@example.com';

-- Check if expired
SELECT email, 
       verification_token_expires,
       NOW() as current_time,
       CASE WHEN verification_token_expires < NOW() THEN 'EXPIRED' ELSE 'VALID' END as status
FROM patients 
WHERE email = 'user@example.com';
```

### Manual verification (emergency)

```sql
UPDATE patients 
SET email_verified = 1, 
    verification_token = NULL, 
    verification_token_expires = NULL
WHERE email = 'user@example.com';
```

## Future Enhancements

1. **SMS Verification:** Alternatif untuk email
2. **Magic Link:** Link sekali klik tanpa code
3. **Biometric:** Face ID / Touch ID untuk mobile
4. **2FA:** Two-factor authentication
5. **Email Change:** Verifikasi ulang saat ganti email
6. **Notification:** Push notification untuk mobile app

## Versi

- **Created:** 13 November 2025
- **Backend Restart:** #78
- **Status:** ✅ Production Ready
