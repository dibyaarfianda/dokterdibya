# Setup Email Verification - Hostinger

## Konfigurasi Email Hostinger

### 1. Informasi SMTP Hostinger
Untuk email dengan domain sendiri di Hostinger (info@dokterdibya.com):

```
SMTP Host: smtp.hostinger.com
SMTP Port: 465 (SSL) atau 587 (TLS)
Email: info@dokterdibya.com
Password: [Password email Anda]
```

### 2. Cara Mendapatkan Password Email

**Di cPanel Hostinger:**
1. Login ke **hPanel Hostinger**
2. Pilih domain **dokterdibya.com**
3. Masuk ke **Email** → **Email Accounts**
4. Cari email **info@dokterdibya.com**
5. Jika sudah ada:
   - Klik **Manage** atau **Change Password**
   - Set/lihat password
6. Jika belum ada:
   - Klik **Create Email Account**
   - Email: info
   - Domain: @dokterdibya.com
   - Set password yang kuat
   - Save

### 3. Update File .env

Edit file: `/var/www/dokterdibya/staff/backend/.env`

```bash
# Email Configuration (Hostinger SMTP)
EMAIL_ENABLED=true
EMAIL_HOST=smtp.hostinger.com
EMAIL_PORT=465
EMAIL_SECURE=true
EMAIL_USER=info@dokterdibya.com
EMAIL_PASSWORD=password_email_anda_disini
FRONTEND_URL=https://dokterdibya.com
CLINIC_NAME=Klinik Dr. Dibya
```

**Ganti:** `password_email_anda_disini` dengan password email Anda

### 4. Restart Backend

```bash
cd /var/www/dokterdibya/staff/backend
pm2 restart all
```

### 5. Test Email

Setelah restart, coba register pasien baru:
- Email verification akan otomatis terkirim
- Cek inbox email pasien
- Jika tidak ada, cek **Spam/Junk folder**

### 6. Troubleshooting

#### A. Cek Log Backend
```bash
pm2 logs dibyaklinik-backend | grep -i email
```

**Jika muncul:**
- `Email notifications disabled` → EMAIL_ENABLED belum true
- `Authentication failed` → Password salah
- `Connection timeout` → Port/host salah
- `Email sent successfully` → ✅ Berhasil!

#### B. Test Manual SMTP
```bash
# Test koneksi ke SMTP Hostinger
telnet smtp.hostinger.com 465
# atau
openssl s_client -connect smtp.hostinger.com:465
```

#### C. Cek Environment Variables
```bash
pm2 env 0 | grep EMAIL
```

Pastikan variabel sudah terbaca.

### 7. Alternatif Port

Jika port 465 tidak berfungsi, coba port 587:

```bash
EMAIL_PORT=587
EMAIL_SECURE=false
```

Port 587 menggunakan STARTTLS (bukan SSL langsung).

### 8. Whitelist IP VPS

Kadang Hostinger memblokir SMTP dari IP tertentu:
1. Login hPanel Hostinger
2. Ke **Email** → **Email Settings**
3. Cek **SMTP Restrictions**
4. Whitelist IP VPS Anda jika diperlukan

**Cara cek IP VPS:**
```bash
curl ifconfig.me
```

### 9. Verifikasi Email Berhasil

**Cek di backend log:**
```bash
pm2 logs --lines 20 | grep "Email sent"
```

**Cek di database:**
```sql
SELECT email, verification_token, verification_token_expires 
FROM patients 
WHERE email = 'email_pasien@example.com';
```

Token harus ada dan expiry 24 jam dari sekarang.

### 10. Format Email yang Dikirim

Email akan berisi:
- **Subject:** Verifikasi Email - Klinik Dr. Dibya
- **From:** Klinik Dr. Dibya <info@dokterdibya.com>
- **Content:**
  - Kode verifikasi 6 digit
  - Link verifikasi langsung
  - Expiry warning (24 jam)
  - Design HTML professional

### 11. SPF dan DKIM (Optional tapi Recommended)

Agar email tidak masuk spam:

**Setup di DNS Hostinger:**
1. Masuk **DNS/Zone Editor**
2. Tambahkan **SPF Record:**
   ```
   Type: TXT
   Name: @
   Value: v=spf1 include:_spf.hostinger.com ~all
   ```

3. Tambahkan **DKIM Record:**
   - Di hPanel → Email → DKIM Settings
   - Copy record yang disediakan
   - Paste ke DNS Editor

4. Wait 24-48 jam untuk propagasi

### 12. Test Pengiriman Email

```bash
# Di server, jalankan:
curl -X POST http://localhost:3001/api/patients/register \
  -H "Content-Type: application/json" \
  -d '{
    "fullname": "Test Email",
    "email": "your-real-email@gmail.com",
    "phone": "628123456789",
    "password": "test123"
  }'
```

Cek email Anda (termasuk spam folder).

### 13. Monitoring

**Log email yang terkirim:**
```bash
pm2 logs --lines 100 | grep -i "verification email"
```

**Error email:**
```bash
pm2 logs --lines 100 | grep -i "email error\|failed to send"
```

### 14. Security Checklist

- ✅ Password email kuat (min 12 karakter, kombinasi huruf/angka/simbol)
- ✅ File .env tidak ter-commit ke Git
- ✅ SPF dan DKIM sudah setup
- ✅ Rate limiting aktif (60 detik antar resend)
- ✅ Token expires 24 jam

### 15. Backup Plan

Jika Hostinger SMTP bermasalah, gunakan Gmail SMTP:

```bash
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_SECURE=false
EMAIL_USER=your-gmail@gmail.com
EMAIL_PASSWORD=app_password_here
```

**Cara dapat Gmail App Password:**
1. Google Account → Security
2. 2-Step Verification (enable)
3. App Passwords → Generate
4. Use generated password

---

## Quick Setup Command

```bash
# 1. Edit .env
nano /var/www/dokterdibya/staff/backend/.env

# 2. Tambahkan (ganti PASSWORD):
EMAIL_ENABLED=true
EMAIL_HOST=smtp.hostinger.com
EMAIL_PORT=465
EMAIL_SECURE=true
EMAIL_USER=info@dokterdibya.com
EMAIL_PASSWORD=YOUR_PASSWORD_HERE
FRONTEND_URL=https://dokterdibya.com
CLINIC_NAME=Klinik Dr. Dibya

# 3. Save (Ctrl+X, Y, Enter)

# 4. Restart
pm2 restart all

# 5. Test
pm2 logs dibyaklinik-backend --lines 50
```

---

## Status Saat Ini

- ✅ Database schema ready
- ✅ Backend endpoints ready
- ✅ Frontend page ready
- ⏳ **EMAIL_ENABLED=true** (perlu password)
- ⏳ Restart backend

Tinggal isi password email dan restart!
