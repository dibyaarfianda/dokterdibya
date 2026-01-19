# Publish dokterDIBYA ke Google Play Store

## Prerequisites

### 1. Google Play Developer Account
- Buat akun di https://play.google.com/console
- Biaya: **$25 USD** (sekali bayar seumur hidup)
- Gunakan akun Google yang akan menjadi publisher permanen

### 2. Assets yang Diperlukan

| Asset | Ukuran | Status | Lokasi |
|-------|--------|--------|--------|
| App Icon | 512x512 PNG | ✅ Ready | `android-chrome-512x512.png` |
| Feature Graphic | 1024x500 PNG | ❌ Perlu dibuat | - |
| Screenshots (min 2) | Variable | ❌ Perlu diambil | - |
| Privacy Policy URL | - | ❌ Perlu dibuat | `https://dokterdibya.com/privacy-policy.html` |

### 3. Release APK/AAB
- Keystore sudah ada: `dokterdibya.keystore`
- key.properties sudah dikonfigurasi
- Build harus dilakukan di **komputer lokal** (BUKAN VPS)

---

## Langkah 1: Buat Assets yang Kurang

### Feature Graphic (1024x500)
Buat gambar promosi dengan:
- Logo dokterDIBYA
- Tagline: "Portal Pasien Digital"
- Background gradient gelap (#0f0f1a → #1a1a2e)

Tools: Canva, Figma, atau Photoshop

### Screenshots (Minimum 2, Recommended 4-8)
Ambil screenshot dari:
1. Halaman Login
2. Dashboard Pasien
3. Booking Appointment
4. Riwayat Kunjungan
5. Hasil Pemeriksaan

**Ukuran yang diterima:**
- Phone: 16:9 atau 9:16 (contoh: 1080x1920)
- Minimum: 320px, Maximum: 3840px

### Privacy Policy
Buat halaman di `https://dokterdibya.com/privacy-policy.html`
Konten minimal:
- Data yang dikumpulkan
- Cara penggunaan data
- Keamanan data
- Kontak

---

## Langkah 2: Build Release APK/AAB

### Di Komputer Lokal (WAJIB!)

```bash
# 1. Clone/download project
git clone [repo] atau scp dari server

# 2. Masuk ke folder
cd mobile-app

# 3. Install dependencies
npm install

# 4. Sync Capacitor
npx cap sync android

# 5. Build Release AAB (untuk Play Store)
cd android
./gradlew bundleRelease

# Hasil: android/app/build/outputs/bundle/release/app-release.aab
```

**PENTING:**
- Google Play Store sekarang mewajibkan **AAB (Android App Bundle)**, bukan APK
- Gunakan `bundleRelease` bukan `assembleRelease`

---

## Langkah 3: Upload ke Play Console

### 3.1 Buat App Baru
1. Login ke https://play.google.com/console
2. Klik **"Create app"**
3. Isi informasi:
   - App name: `dokterDIBYA`
   - Default language: `Indonesian - Bahasa Indonesia`
   - App or game: `App`
   - Free or paid: `Free`
4. Accept declarations
5. Klik **Create app**

### 3.2 Set Up Your App (Dashboard)

#### App Access
- Pilih: **"All functionality is available without special access"**
- Atau jika perlu login: **"All or some functionality is restricted"** → jelaskan cara akses

#### Ads
- Pilih: **"No, my app does not contain ads"**

#### Content Rating
1. Klik **Start questionnaire**
2. Email: support@dokterdibya.com
3. Category: **Utility, Productivity, Communication, or Other**
4. Jawab pertanyaan (semua "No" untuk app kesehatan standar)
5. Submit → akan dapat rating (biasanya "Everyone")

#### Target Audience
- Target age: **18 and over** (untuk app kesehatan)
- Bukan untuk anak-anak

#### News App
- Pilih: **"No"**

#### COVID-19 Contact Tracing / Status Apps
- Pilih: **"No"** (kecuali memang ada fitur ini)

#### Data Safety
Ini WAJIB dan detail. Isi sesuai data yang dikumpulkan:

**Data Collected:**
- Personal info: Name, Email, Phone number ✓
- Health info: Health info ✓
- App activity: App interactions ✓

**Data Shared:**
- None (tidak dijual ke pihak ketiga)

**Security Practices:**
- Data is encrypted in transit ✓
- Data can be deleted ✓

#### Government Apps
- Pilih: **"No"**

#### Financial Features
- Pilih sesuai (jika ada pembayaran dalam app)

### 3.3 Store Listing

#### Main Store Listing
```
App name: dokterDIBYA
Short description (max 80 chars):
Portal pasien digital - booking, rekam medis, dan riwayat kesehatan Anda

Full description (max 4000 chars):
dokterDIBYA adalah aplikasi portal pasien yang memudahkan Anda mengelola kesehatan.

Fitur Utama:
• Booking Online - Jadwalkan kunjungan kapan saja
• Rekam Medis Digital - Akses riwayat kesehatan Anda
• Hasil Pemeriksaan - Lihat hasil lab dan USG
• Notifikasi - Pengingat jadwal kunjungan
• Kalender Kesuburan - Tracking siklus menstruasi

Keamanan:
• Data terenkripsi dan aman
• Login dengan Google atau email
• Akses hanya untuk Anda dan dokter

Hubungi kami:
• Email: support@dokterdibya.com
• Website: dokterdibya.com
```

#### Graphics
1. **App icon** - Upload `android-chrome-512x512.png`
2. **Feature graphic** - Upload gambar 1024x500
3. **Screenshots** - Upload minimal 2 screenshot

#### Categorization
- App category: **Medical**
- Tags: health, medical, appointment, clinic

### 3.4 Release Management

#### Create Production Release
1. Go to **Production** → **Create new release**
2. Upload AAB file (`app-release.aab`)
3. Release name: `1.0.2`
4. Release notes (lihat template di bawah)
5. **Review release** → **Start rollout to Production**

---

## Release Notes Templates

### Versi 1.0.0 - Initial Release (Bahasa Indonesia)

```
Selamat datang di dokterDIBYA! 🏥

Aplikasi portal pasien resmi dari Klinik dokterDIBYA untuk memudahkan Anda mengelola kesehatan.

Fitur Utama:
✓ Login dengan Google atau Email
✓ Booking appointment online 24/7
✓ Lihat jadwal praktek dokter
✓ Akses riwayat kunjungan
✓ Rekam medis digital
✓ Hasil pemeriksaan USG
✓ Kalender kesuburan
✓ Notifikasi pengingat jadwal

Keamanan:
• Data terenkripsi dan aman
• Akses hanya untuk Anda dan dokter

Hubungi kami jika ada pertanyaan:
support@dokterdibya.com
```

### Versi 1.0.0 - Initial Release (English)

```
Welcome to dokterDIBYA! 🏥

Official patient portal app from dokterDIBYA Clinic to help you manage your health easily.

Main Features:
✓ Login with Google or Email
✓ Online appointment booking 24/7
✓ View doctor's schedule
✓ Access visit history
✓ Digital medical records
✓ USG examination results
✓ Fertility calendar
✓ Schedule reminder notifications

Security:
• Encrypted and secure data
• Access only for you and your doctor

Contact us if you have questions:
support@dokterdibya.com
```

### Template Update (untuk versi selanjutnya)

```
Pembaruan dokterDIBYA v[VERSION]

Yang baru:
• [Fitur baru 1]
• [Fitur baru 2]

Perbaikan:
• [Bug fix 1]
• [Bug fix 2]

Peningkatan:
• Performa aplikasi lebih cepat
• Stabilitas ditingkatkan

Terima kasih telah menggunakan dokterDIBYA!
```

### Contoh Update v1.1.0

```
Pembaruan dokterDIBYA v1.1.0

Yang baru:
• Notifikasi push untuk pengingat jadwal
• Fitur chat dengan admin klinik
• Tampilan baru halaman riwayat kunjungan

Perbaikan:
• Login Google lebih stabil
• Kalender kesuburan lebih akurat

Peningkatan:
• Loading lebih cepat
• UI lebih responsif

Terima kasih telah menggunakan dokterDIBYA!
```

### Tips Release Notes

1. **Bahasa:** Gunakan Bahasa Indonesia karena target user lokal
2. **Emoji:** Boleh digunakan tapi jangan berlebihan (1-2 saja)
3. **Panjang:** Max 500 karakter untuk tampil lengkap di Play Store
4. **Format:** Gunakan bullet points (•, ✓, -) untuk readability
5. **Tone:** Friendly tapi profesional
6. **Jangan:** Menyebutkan bug kritis atau masalah keamanan secara detail

---

## Langkah 4: Review Process

### Timeline
- Review biasanya: **1-3 hari kerja**
- App baru bisa lebih lama: **hingga 7 hari**

### Possible Rejection Reasons & Fixes

| Alasan | Solusi |
|--------|--------|
| Missing privacy policy | Tambahkan URL privacy policy |
| Login required but no test account | Berikan test credentials di App Access |
| Health claims | Jangan klaim menyembuhkan penyakit |
| Missing data safety | Lengkapi Data Safety form |
| Broken functionality | Test app sebelum submit |

---

## Langkah 5: Post-Launch

### Monitor
- Check **Statistics** untuk downloads
- Monitor **Reviews** dan respond
- Check **Crashes & ANRs** di Android Vitals

### Updates
1. Increment `versionCode` di `build.gradle`
2. Update `versionName`
3. Build new AAB
4. Create new release di Play Console

---

## Quick Reference

### File Locations
```
mobile-app/
├── android-chrome-512x512.png  # App icon (ready)
├── dokterdibya.keystore        # Signing key
├── android/
│   ├── key.properties          # Keystore config
│   └── app/
│       ├── build.gradle        # Version config
│       └── build/outputs/bundle/release/
│           └── app-release.aab # Upload this!
```

### Version Bumping
Edit `android/app/build.gradle`:
```gradle
defaultConfig {
    versionCode 3        // Increment this (integer)
    versionName "1.0.3"  // User-visible version
}
```

### Build Commands
```bash
# Sync after web changes
npx cap sync android

# Build release AAB
cd android && ./gradlew bundleRelease

# Build release APK (for direct distribution)
cd android && ./gradlew assembleRelease
```

---

## Checklist Sebelum Submit

- [ ] Google Play Developer account aktif ($25 paid)
- [ ] App icon 512x512 ✅
- [ ] Feature graphic 1024x500
- [ ] Screenshots (min 2)
- [ ] Privacy policy URL live
- [ ] AAB file built dan signed
- [ ] App tested di device fisik
- [ ] Store listing lengkap (title, description)
- [ ] Content rating completed
- [ ] Data safety form filled
- [ ] Target audience set (18+)

---

## Bantuan

Jika ada masalah:
1. Check Play Console **Policy status**
2. Review **Pre-launch report** (automated testing)
3. Baca email dari Google Play team

Dokumentasi resmi: https://support.google.com/googleplay/android-developer
