# SRIKANDI KEDIRI — Lampiran B
## Standar Keamanan Minimum (API-Only)

Dokumen ini menetapkan kontrol keamanan minimum untuk platform data KIA **SRIKANDI KEDIRI**.

## 1. Prinsip Dasar

- **API-only access**: tidak ada akses langsung publik ke database
- **Least privilege**: hak akses minimum sesuai kebutuhan tugas
- **Defense in depth**: kontrol berlapis pada jaringan, identitas, aplikasi, dan data
- **Auditability**: semua akses dan perubahan penting harus dapat diaudit

## 2. Keamanan Jaringan

- Database wajib berada di private subnet tanpa public IP
- Port database hanya terbuka untuk service API terotorisasi
- WAF/API gateway wajib aktif untuk endpoint publik
- Segmentasi jaringan antar environment: dev/staging/prod terpisah
- Akses administratif ke production melalui jalur aman (VPN/jump host) dan approval

## 3. Keamanan Identitas & Akses

- Autentikasi API memakai OAuth2/OIDC atau standar setara
- Komunikasi service-to-service menggunakan mTLS (minimal untuk endpoint sensitif)
- MFA wajib untuk akun admin dan operator berprivilege
- Rotasi secret/token/kredensial terjadwal
- Akses produksi bersifat sementara, berbasis tiket, dan tercatat
- Nonaktifkan akses user dalam ≤ 24 jam setelah mutasi/terminasi personel

## 4. Keamanan Aplikasi/API

- Input/output validation untuk semua endpoint
- Rate limiting per klien dan endpoint
- Proteksi brute-force dan abuse traffic
- Error response tidak boleh mengungkap data sensitif/stack trace internal
- API versioning dan deprecation policy wajib terdokumentasi
- Dependency scanning dan patching rutin (minimal bulanan)

## 5. Perlindungan Data

- TLS 1.2+ untuk seluruh trafik in-transit
- Enkripsi at-rest untuk database, backup, dan object storage
- Kunci enkripsi dikelola terpisah (KMS/HSM) dengan kontrol akses ketat
- Data minimization: hanya elemen data KIA yang diperlukan
- Pseudonimisasi/tokenisasi identifier lintas institusi
- Masking data sensitif pada log, monitoring, dan dump diagnostik

## 6. Logging, Monitoring, dan Audit Trail

- Audit trail immutable untuk akses data sensitif dan aksi admin
- Log minimal memuat: siapa, kapan, endpoint/aksi, hasil, sumber akses
- Sinkronisasi waktu server (NTP) wajib aktif
- Alert keamanan real-time untuk anomali akses dan lonjakan traffic
- Retensi log audit minimum: **2 tahun** (atau sesuai kebijakan yang lebih ketat)

## 7. Backup, DR, dan Ketersediaan

- Backup terenkripsi minimal harian
- Uji restore minimal bulanan
- RPO maksimum: 24 jam
- RTO maksimum: 8 jam
- Rencana DR/BCP terdokumentasi dan diuji berkala

## 8. Keamanan Operasional

- Change management wajib (approval + rollback plan)
- Pemisahan tugas (segregation of duties) untuk admin, developer, dan operator
- Larangan penggunaan akun bersama (shared account)
- Seluruh personel/subkontraktor wajib NDA aktif
- Pelatihan keamanan dan privasi minimal tiap 6 bulan

## 9. Manajemen Insiden Keamanan

- Deteksi, triase, containment, eradication, recovery wajib terdokumentasi
- Notifikasi awal insiden ke PIHAK PERTAMA maksimal **1 x 24 jam**
- RCA untuk insiden major wajib diterbitkan maksimal `5 hari kerja`
- Tindakan preventif pasca-insiden wajib ditracking sampai selesai

## 10. Uji Keamanan Berkala

- Vulnerability scanning: minimal bulanan
- Penetration test: minimal 1 kali sebelum go-live dan selanjutnya minimal tahunan
- Remediasi temuan critical/high harus memiliki SLA perbaikan tertulis

## 11. Kepatuhan dan Audit

- Bukti kontrol keamanan harus tersedia saat audit
- PIHAK PERTAMA berhak meminta audit teknis berkala
- Temuan audit wajib ditindaklanjuti dengan rencana perbaikan dan tenggat

---

## Checklist Kepatuhan Lampiran B

- [ ] Semua kontrol minimum diterapkan pada environment produksi
- [ ] Bukti konfigurasi keamanan terdokumentasi
- [ ] Uji keamanan awal (pre go-live) selesai
- [ ] Proses respons insiden diuji (tabletop/simulasi)
- [ ] Review legal/compliance menyatakan sesuai

---

## Tanda Persetujuan Lampiran B

PIHAK PERTAMA,                               PIHAK KEDUA,

Nama: ____________________                   Nama: ____________________
Jabatan: ____________________                Jabatan: ____________________
Tanggal: ____________________                Tanggal: ____________________
