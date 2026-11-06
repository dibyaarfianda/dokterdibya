# WhatsApp Business — Sub-proyek 0+1: Fondasi Meta Cloud API + Reminder Pasien

Tanggal: 2026-11-07
Status: desain disetujui per bagian dalam percakapan; menunggu review spec tertulis.

## 1. Tujuan

Nomor WhatsApp Business klinik (saat ini hanya dipakai di aplikasi WA Business di HP) dihubungkan ke Meta WhatsApp Cloud API lewat *coexistence*, lalu dipakai untuk mengirim reminder otomatis ke pasien:

1. **Janji Klinik Privat** — mengajak pasien konfirmasi kehadiran supaya booking tidak dibatalkan otomatis.
2. **Kontrol ulang** — mengingatkan pasien untuk booking kontrol sesuai anjuran dokter.

Kriteria berhasil:
- Pasien dengan booking Klinik Privat besok menerima tepat 1 pesan template pada H-1 pukul 18:00 WIB.
- Pasien yang masih `pending_confirmation` pada hari-H menerima tepat 1 pesan peringatan pukul 07:00 WIB.
- Pasien dengan `kontrol_date` = hari ini + 3 (kunjungan Klinik Privat, belum booking) menerima tepat 1 pesan pukul 09:00 WIB.
- Menjalankan job yang sama dua kali tidak pernah menghasilkan pesan kedua.
- Pasien yang membalas STOP/BERHENTI tidak menerima reminder apa pun setelahnya.
- Tidak ada pesan yang ditandai "terkirim" kecuali Meta mengembalikan `message_id`.
- Staf tetap bisa membalas chat manual dari aplikasi WA Business di HP.

## 2. Keputusan yang sudah disetujui

| Topik | Keputusan |
|---|---|
| Pemecahan | 5 sub-proyek berurutan: **0 Fondasi + 1 Reminder (spec ini)** → 2 Auto-jawab harga dari tabel `tindakan` (whitelist) → 3 Pengumuman staf ke WA → 4 Komunitas SISIwanita ↔ WA |
| Koneksi | Meta Cloud API langsung via coexistence (bukan BSP, bukan Fonnte) |
| Jenis reminder | Janji Klinik Privat + Kontrol ulang |
| Reminder janji | H-1 18:00 (semua `pending_confirmation`/`confirmed` besok) + hari-H 07:00 (hanya yang masih `pending_confirmation`). Reminder "2 jam sebelum" **dihapus** untuk hemat biaya |
| Sumber tanggal kontrol | Input terstruktur baru di Planning (bukan parsing teks `rencana`) |
| Waktu reminder kontrol | H-3 sebelum `kontrol_date` |
| Lokasi reminder kontrol | Hanya kunjungan `visit_location = 'klinik_private'` |
| Isi pesan | Tanpa data klinis (tanpa keluhan, diagnosis, tindakan) |
| Opt-out | Setiap template memuat "Balas STOP…"; balasan STOP/BERHENTI dicatat |

## 3. Fakta yang ditemukan (dasar desain)

[High confidence — dibaca dari kode di worktree dan query agregat read-only ke DB produksi 2026-11-07]

- `staff/backend/services/whatsappService.js` sudah punya `sendViaMetaCloud()` dengan dukungan `templateName`/`templateComponents`.
- `staff/backend/services/appointmentReminder.js` (H-1 + 2 jam) **tidak pernah berjalan di produksi**: `sunday_appointments.reminder_h1_sent_at` terisi 0 baris. Tidak dijadwalkan di `appointmentScheduler.js`; hanya lewat `scripts/run-reminders.js` dan endpoint manual di `routes/notifications.js`.
- `appointmentReminder.js` memakai jam sesi hardcode (08:00/13:00/17:00) yang **salah**. `booking_settings` di produksi: sesi 1 = Minggu 09:00–18:30 slot 10 menit; sesi 2 = Sabtu 13:00–18:00 slot 15 menit. Jam slot yang benar dihitung oleh `getSlotTimeFromSettings()` di `services/booking-session-settings.js`.
- `utils/notification.js` `sendWhatsAppAuto()` mengembalikan `success: true, method: 'manual'` saat tidak ada provider aktif, sehingga pemanggil akan menandai reminder terkirim padahal tidak.
- Alur konfirmasi kehadiran (`appointmentScheduler.js`): popup portal aktif H-1 18:00 dan hari-H 07:00; booking yang masih `pending_confirmation` dibatalkan otomatis 14:00 hari-H. Semua booking baru dimulai `pending_confirmation` (`requiresAttendanceConfirmation()` selalu `true`).
- Form Planning yang aktif adalah `renderObstetriFormat` di `staff/public/scripts/sunday-clinic/components/shared/plan.js` (textarea `tindakan`, `terapi`, `rencana`). Bagian "Jadwal Kontrol Berikutnya" (`renderFollowUp`) ada di blok yang di-disable. Dari 1.301 record `planning`, 0 mengisi `next_visit_date`/`next_visit_interval`; 611 dari 799 record 6 bulan terakhir menyebut "kontrol" di teks bebas.
- Planning disimpan oleh `savePlanningObstetri()` (`main.js`) → `POST /api/medical-records`; `record_data` disimpan sebagai JSON. Data dikumpulkan oleh `getPlanningFormData()` (`main.js`).
- Nilai lokasi: `sunday_clinic_records.visit_location = 'klinik_private'`; `disabled_practice_dates.location = 'klinik_privat'` (ejaan berbeda — pakai sesuai tabel).
- `patients`: `full_name`, `phone`, `whatsapp` (711 dari 724 pasien punya `phone`). Belum ada kolom consent/opt-out. Belum ada tabel WhatsApp apa pun.
- Body parser global (`server.js`) tidak menyimpan raw body; verifikasi signature Meta butuh raw body.
- DB produksi: MariaDB 10.11 (mendukung `JSON_EXTRACT`/`JSON_UNQUOTE`).

## 4. Arsitektur

```
Meta Cloud API ──webhook──▶ routes/whatsapp-webhook.js ──▶ WhatsAppWebhookService
                                                             ├─ status → wa_messages
                                                             └─ inbound STOP/BERHENTI → wa_opt_outs

appointmentScheduler.js (node-cron, Asia/Jakarta)
   ├─ 18:00  WhatsAppReminderJobs.runJanjiH1()
   ├─ 07:00  WhatsAppReminderJobs.runJanjiBelumKonfirmasi()
   └─ 09:00  WhatsAppReminderJobs.runKontrolH3()
                     │
                     ▼
            WhatsAppTemplateSender ──▶ whatsappService.sendViaMetaCloud(template)
                     │
                     └─ wa_messages (klaim idempoten sebelum kirim) + cek wa_opt_outs
```

### 4.1 Unit dan tanggung jawab

| Unit | File (baru kecuali disebut) | Tugas |
|---|---|---|
| Konfigurasi template | `staff/backend/config/whatsapp-templates.js` | Nama template, bahasa `id`, urutan parameter body per `purpose` |
| Pengirim template | `staff/backend/services/WhatsAppTemplateSender.js` | Normalisasi nomor, cek opt-out, klaim baris `wa_messages`, kirim via `whatsappService.sendViaMetaCloud`, tulis hasil. Tidak pernah memakai fallback wa.me |
| Job reminder | `staff/backend/services/WhatsAppReminderJobs.js` | Query penerima untuk 3 job, susun parameter, panggil sender, jeda 1 detik antar pesan, kembalikan ringkasan `{total, sent, skipped, failed}` |
| Webhook | `staff/backend/routes/whatsapp-webhook.js` + `staff/backend/services/WhatsAppWebhookService.js` | Verifikasi GET, verifikasi HMAC POST, proses status & opt-out |
| Penjadwal | `staff/backend/services/appointmentScheduler.js` (ubah) | Daftarkan 3 cron job baru |
| Mount route | `staff/backend/server.js` (ubah) | Mount webhook **sebelum** `express.json()` global, dengan `express.raw({ type: 'application/json', limit: '1mb' })` |
| Input kontrol | `plan.js` + `main.js` (ubah) | UI "Kontrol berikutnya" + ikut tersimpan di JSON planning |
| Migration | `staff/backend/migrations/20261107_whatsapp_messages.sql` | Tabel `wa_messages`, `wa_opt_outs` |
| Uji kirim | `staff/backend/scripts/whatsapp-send-test-template.js` | Kirim satu template uji ke satu nomor dari VPS (bagian 12.3) |

`appointmentReminder.js`, `scripts/run-reminders.js`, dan endpoint manual di `routes/notifications.js` **tidak diubah** dalam sub-proyek ini (tidak pernah aktif; tidak dijadwalkan). Penghapusannya dicatat sebagai pekerjaan lanjutan agar tidak ada dua jalur reminder.

## 5. Data

### 5.1 Migration `20261107_whatsapp_messages.sql`

Tabel dibuat hanya lewat migration (tanpa `CREATE TABLE` saat runtime, sesuai pola repo).

```sql
CREATE TABLE IF NOT EXISTS wa_messages (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    direction ENUM('outbound','inbound') NOT NULL,
    purpose VARCHAR(40) NULL,            -- janji_h1 | janji_belum_konfirmasi | kontrol_h3 (outbound); NULL untuk inbound
    ref_type VARCHAR(40) NULL,           -- sunday_appointment | medical_record
    ref_id VARCHAR(40) NULL,             -- id appointment / id medical_records
    patient_id VARCHAR(50) NULL,
    phone VARCHAR(20) NOT NULL,          -- format 62xxxxxxxx
    template_name VARCHAR(80) NULL,
    wa_message_id VARCHAR(128) NULL,
    status ENUM('claimed','sent','delivered','read','failed','skipped','received') NOT NULL,
    error_message VARCHAR(500) NULL,
    body_text TEXT NULL,                 -- hanya untuk inbound
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_wa_outbound_purpose_ref (purpose, ref_id),
    UNIQUE KEY uq_wa_message_id (wa_message_id),
    KEY idx_wa_phone (phone),
    KEY idx_wa_created (created_at)
);

CREATE TABLE IF NOT EXISTS wa_opt_outs (
    phone VARCHAR(20) PRIMARY KEY,       -- format 62xxxxxxxx
    opted_out_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    source VARCHAR(40) NOT NULL          -- inbound_stop | staff
);
```

Catatan: baris inbound memiliki `purpose` dan `ref_id` NULL; di MariaDB beberapa NULL tidak melanggar UNIQUE, jadi unique key outbound tidak mengganggu inbound.

### 5.2 Field kontrol di JSON planning

Ditambahkan ke `record_data` planning (snake_case, sesuai aturan anamnesa/planning):

| Key | Nilai |
|---|---|
| `kontrol_interval` | `''` \| `1_minggu` \| `2_minggu` \| `1_bulan` \| `3_bulan` \| `6_bulan` \| `tanggal` \| `tidak_perlu` |
| `kontrol_date` | `YYYY-MM-DD` atau `''` |

- Interval dihitung dari **tanggal pemeriksaan planning** (`record_date` / bagian tanggal `record_datetime`), bukan dari hari ini, memakai komponen tanggal lokal (tanpa `toISOString()`).
- `tanggal` → dokter memilih tanggal manual.
- `tidak_perlu` → `kontrol_date = ''`, tidak ada reminder.
- Data lama tanpa key ini dianggap tidak punya jadwal kontrol.

## 6. Template WhatsApp (diajukan oleh user di WhatsApp Manager)

Kategori **Utility**, bahasa **Indonesian (`id`)**. Teks final bisa disesuaikan saat pengajuan; jika berubah, `config/whatsapp-templates.js` mengikuti nama dan urutan parameter.

**`janji_h1`** — parameter: {{1}} nama, {{2}} tanggal (mis. "Minggu, 9 November 2026"), {{3}} jam slot (mis. "09:30")
> Halo {{1}}, ini pengingat janji temu Anda di Klinik Privat dr. Dibya besok, {{2}} pukul {{3}} WIB. Mohon konfirmasi kehadiran Anda melalui sisiwanita.id. Balas STOP jika tidak ingin menerima pengingat lagi.

**`janji_belum_konfirmasi`** — parameter: {{1}} nama, {{2}} jam slot
> Halo {{1}}, booking Anda hari ini pukul {{2}} WIB di Klinik Privat dr. Dibya belum dikonfirmasi. Mohon konfirmasi melalui sisiwanita.id sebelum pukul 14.00 WIB agar booking tidak dibatalkan otomatis. Balas STOP jika tidak ingin menerima pengingat lagi.

**`kontrol_h3`** — parameter: {{1}} nama, {{2}} tanggal kontrol
> Halo {{1}}, sesuai anjuran dokter, jadwal kontrol Anda di Klinik Privat dr. Dibya adalah sekitar {{2}}. Silakan booking jadwal melalui sisiwanita.id. Balas STOP jika tidak ingin menerima pengingat lagi.

Format tanggal memakai `DibyaDateTime.date()` yang sudah dipakai di `whatsappService.js`.

## 7. Alur job

Semua job: cron dengan `{ timezone: 'Asia/Jakarta' }`, guard "sedang berjalan" per job agar tidak tumpang-tindih, dan dimatikan bila flag env-nya bukan `'true'`.

### 7.1 `runJanjiH1()` — setiap hari 18:00 (`WA_REMINDER_JANJI_ENABLED`)

Penerima: `sunday_appointments` dengan
- `appointment_date = CURDATE() + 1`,
- `status IN ('pending_confirmation','confirmed')`,
- `patient_phone` tidak kosong,
- tanggal tidak ada di `disabled_practice_dates` (`location IS NULL OR location = 'klinik_privat'`) — pola `NOT_DISABLED_PRACTICE_DATE_SQL` yang sudah ada.

`purpose = 'janji_h1'`, `ref_type = 'sunday_appointment'`, `ref_id = appointment.id`. Jam slot = `getSlotTimeFromSettings(await getSessionSettings(), session, slot_number)`. Jika jam slot `null`, pesan tetap dikirim dengan parameter jam diganti label sesi dari `getSessionLabelFromSettings()`.

### 7.2 `runJanjiBelumKonfirmasi()` — setiap hari 07:00 (`WA_REMINDER_JANJI_ENABLED`)

Sama seperti 7.1 tetapi `appointment_date = CURDATE()` dan `status = 'pending_confirmation'`. `purpose = 'janji_belum_konfirmasi'`. Job ini dijalankan setelah job popup 07:00 yang sudah ada (keduanya independen; urutan tidak mempengaruhi hasil).

### 7.3 `runKontrolH3()` — setiap hari 09:00 (`WA_REMINDER_KONTROL_ENABLED`)

Penerima: record `medical_records` `record_type = 'planning'` di mana
- `JSON_UNQUOTE(JSON_EXTRACT(record_data, '$.kontrol_date')) = CURDATE() + 3`,
- record tersebut adalah planning **terbaru** untuk `mr_id`-nya,
- `sunday_clinic_records.visit_location = 'klinik_private'` untuk `mr_id` tersebut,
- pasien (`patients.id = sunday_clinic_records.patient_id`) punya nomor (`whatsapp`, jika kosong `phone`),
- pasien **tidak** punya `sunday_appointments` dengan `status IN ('pending_confirmation','confirmed')` dan `appointment_date` antara `CURDATE()` dan `kontrol_date + 7 hari`.

`purpose = 'kontrol_h3'`, `ref_type = 'medical_record'`, `ref_id = medical_records.id`. Nama dari `patients.full_name`.

### 7.4 `WhatsAppTemplateSender.send({ purpose, refType, refId, patientId, phone, params })`

1. Jika `whatsappService.meta.enabled` false → kembalikan `failed` (`meta_not_configured`) **tanpa** menulis baris log, supaya unique key tidak terpakai dan reminder bisa terkirim setelah konfigurasi diperbaiki. (Job juga memeriksa ini sekali sebelum loop — lihat di bawah.)
2. Normalisasi nomor dengan `whatsappService.formatPhoneNumber()`. Nomor kosong/tidak valid → kembalikan `skipped` (tanpa baris log).
3. Jika nomor ada di `wa_opt_outs` → `INSERT IGNORE` baris `status = 'skipped'`, `error_message = 'opted_out'`; kembalikan `skipped`.
4. Klaim: `INSERT IGNORE INTO wa_messages (... status = 'claimed')`. Jika `affectedRows = 0` → sudah pernah diklaim/dikirim; kembalikan `skipped` (idempotensi).
5. Kirim `sendViaMetaCloud(phone, null, { templateName, templateLanguage: 'id', templateComponents: [{ type: 'body', parameters: [...] }] })`.
6. Sukses (ada `messageId`) → update `status = 'sent'`, `wa_message_id`. Gagal → `status = 'failed'`, `error_message` (dipotong 500 karakter).

Tidak ada retry otomatis. Baris `failed` tetap memegang unique key sehingga job berikutnya tidak mengirim ulang; pengiriman ulang manual di luar lingkup.

Satu kali per job, sebelum loop:
- jika `whatsappService.meta.enabled` false → job berhenti dengan satu `logger.warn`, tanpa query penerima dan tanpa baris log;
- jika tabel `wa_messages` belum ada (`ER_NO_SUCH_TABLE`) → job berhenti dengan satu `logger.warn` (pola `staff_menu_seen`).

Baris yang tertinggal berstatus `claimed` (proses mati di tengah kirim) tidak dikirim ulang otomatis; ini disengaja agar tidak ada risiko pesan ganda.

## 8. Webhook

Path: `/api/whatsapp/webhook`. Route ini publik (tanpa token staf/pasien) — perlu didaftarkan di `config/accessControlRegistry.js` sebagai pengecualian webhook, mengikuti cara `xendit-webhook` (`payment_webhook`) dikecualikan; nama pengecualian ditentukan saat plan setelah membaca registry.

### 8.1 `GET`
Jika `hub.mode === 'subscribe'` dan `hub.verify_token === WHATSAPP_CLOUD_VERIFY_TOKEN` → balas `200` dengan teks `hub.challenge`. Selain itu `403`.

### 8.2 `POST`
1. Hitung `sha256=` + HMAC-SHA256(raw body, `WHATSAPP_CLOUD_APP_SECRET`), bandingkan dengan header `X-Hub-Signature-256` memakai `crypto.timingSafeEqual`. Tidak cocok / header hilang / app secret kosong → `401`, tanpa memproses dan tanpa me-log isi payload.
2. Parse JSON. Untuk setiap `entry[].changes[].value`:
   - `statuses[]`: update `wa_messages` berdasarkan `wa_message_id` ke `delivered` / `read` / `failed` (ambil `errors[0].title` ke `error_message`). Status tidak boleh mundur (mis. `read` tidak ditimpa `delivered`); `failed` selalu boleh menimpa.
   - `messages[]` bertipe `text`: simpan baris inbound (`status = 'received'`, `body_text` dipotong 1.000 karakter, `wa_message_id` unik → `INSERT IGNORE` untuk duplikat). Jika teks setelah trim & uppercase sama dengan `STOP` atau `BERHENTI` → `INSERT IGNORE` ke `wa_opt_outs` (`source = 'inbound_stop'`).
   - Tipe lain diabaikan.
3. Selalu balas `200` setelah signature valid (termasuk jika sebagian event gagal diproses — kegagalan di-log), agar Meta tidak mengulang terus.

Tidak ada balasan otomatis ke pasien di sub-proyek ini. Pesan inbound tetap tampil di aplikasi WA Business (coexistence) untuk dibalas staf.

## 9. UI input kontrol (Planning)

Di `renderObstetriFormat` (`plan.js`), di bawah textarea `rencana`, tambahkan grup kecil **"Kontrol berikutnya"**:
- Tombol pilihan (radio bergaya tombol): 1 mgg · 2 mgg · 1 bln · 3 bln · 6 bln · Pilih tanggal · Tidak perlu.
- Input `type="date"` yang muncul hanya saat "Pilih tanggal".
- Teks kecil hasil hitung: "Kontrol ≈ Minggu, 23 November 2026".
- Nilai tersimpan dibaca kembali saat form dibuka ulang.

`getPlanningFormData()` (`main.js`) menambahkan `kontrol_interval` dan `kontrol_date`. Tidak ada field yang diwajibkan; tanpa pilihan, tidak ada reminder.

Perlu diverifikasi saat plan (belum dibaca): apakah sinkronisasi Medify (`MEDIFY_SOAP_SYNC_SECTIONS` berisi `planning`) dan `docboard-planning.js` / `previous-planning.js` mengabaikan key tambahan dengan aman.

Setelah perubahan frontend: bump versi aset staff sesuai prosedur rilis staff (`window.__assetVersion`, `STAFF_PWA_VERSION`, dan versi skrip Sunday Clinic terkait).

## 10. Konfigurasi `.env`

Ditambahkan ke `staff/backend/.env.example` (nilai asli hanya di VPS):

```
WA_PROVIDER=meta
WHATSAPP_CLOUD_ENABLED=true
WHATSAPP_CLOUD_API_VERSION=v21.0
WHATSAPP_CLOUD_PHONE_NUMBER_ID=
WHATSAPP_CLOUD_ACCESS_TOKEN=
WHATSAPP_CLOUD_APP_SECRET=        # baru: verifikasi X-Hub-Signature-256
WHATSAPP_CLOUD_VERIFY_TOKEN=      # baru: verifikasi GET webhook
WA_REMINDER_JANJI_ENABLED=false   # baru
WA_REMINDER_KONTROL_ENABLED=false # baru
```

`WHATSAPP_CLOUD_API_VERSION` default `v21.0` di kode; versi yang masih didukung Meta saat deploy **perlu diverifikasi**.

## 11. Langkah setup oleh user (di luar kode)

1. Verifikasi bisnis di Meta Business Manager.
2. Buat Meta App dengan produk WhatsApp; onboard nomor klinik lewat **coexistence** (aplikasi WA Business versi terbaru, konfirmasi dari aplikasi).
3. Buat System User dengan token permanen (izin `whatsapp_business_messaging`, `whatsapp_business_management`); catat App Secret, Phone Number ID, Verify Token (string acak buatan sendiri).
4. Ajukan 3 template di bagian 6; tunggu status Approved.
5. Isi `.env` di VPS, jalankan migration, reload backend.
6. Daftarkan webhook `https://dokterdibya.com/api/whatsapp/webhook` + Verify Token; subscribe field `messages`.
7. Uji: kirim template ke nomor sendiri (lihat 12.3), lalu nyalakan `WA_REMINDER_JANJI_ENABLED`, kemudian `WA_REMINDER_KONTROL_ENABLED`.

[Medium confidence] Syarat coexistence (versi aplikasi minimum, negara yang didukung, stabilitas) bersumber dari dokumentasi pihak ketiga; **perlu verifikasi** di dokumentasi Meta saat onboarding.

## 12. Pengujian

### 12.1 Unit test (jest, dijalankan di VPS sesuai resep runner yang ada; bandingkan dengan baseline kegagalan main)
- Webhook: signature valid / salah / header hilang / app secret kosong; GET verify benar & salah.
- Webhook: status `sent→delivered→read`, `read` tidak mundur ke `delivered`, `failed` menimpa; duplikat inbound; STOP, `berhenti ` (spasi/huruf kecil) → opt-out; teks lain tidak.
- Sender: nomor kosong, opt-out, klaim kedua → skipped, Meta tidak dikonfigurasi → failed, sukses → sent + `wa_message_id`, error Meta → failed.
- Job: pemilihan penerima H-1 (libur dilewati, status `cancelled` dilewati), hari-H (hanya `pending_confirmation`), kontrol H-3 (lokasi non-klinik dilewati, sudah booking dilewati, bukan planning terbaru dilewati).
- Idempotensi: job dijalankan dua kali → satu pemanggilan kirim per penerima.
- Hitung `kontrol_date` dari interval: akhir bulan (31 Jan + 1 bln), tanpa pergeseran zona waktu.

### 12.2 Uji UI di browser
- Planning: pilih interval → tanggal hasil tampil → simpan → buka ulang → nilai sama; "Pilih tanggal" & "Tidak perlu".

### 12.3 Uji nyata (setelah template Approved)
- Script CLI `staff/backend/scripts/whatsapp-send-test-template.js <nomor> <purpose>` dijalankan di VPS (tanpa endpoint HTTP, tanpa UI). Script memakai parameter contoh, mengirim lewat `WhatsAppTemplateSender` dengan `purpose = 'test_<purpose>'` dan `ref_id` = timestamp, lalu mencetak status dan `wa_message_id` (tanpa mencetak token).
- Verifikasi: pesan diterima di HP, lalu baris `wa_messages` berubah ke `delivered`/`read` lewat webhook.
- Verifikasi opt-out: balas STOP dari HP uji → nomor muncul di `wa_opt_outs`; kirim ulang → `skipped`.

## 13. Biaya

[Low confidence — tarif belum diverifikasi; perlu cek rate card Meta] Template Utility Indonesia ≈ Rp356/pesan + PPN 11% bila di luar jendela 24 jam. Dengan ±180 booking/bulan (539 booking dalam 90 hari terakhir) dan 1–2 pesan per booking: ±Rp70–150 ribu/bulan untuk reminder janji, ditambah reminder kontrol.

## 14. Risiko & keterbatasan

- **Opt-in pasien:** kebijakan Meta mensyaratkan persetujuan pasien sebelum bisnis mengirim pesan [Medium confidence; perlu verifikasi kebijakan terbaru]. Spec ini hanya menyediakan opt-out. Checkbox persetujuan di booking adalah pekerjaan lanjutan.
- **Coexistence:** dilaporkan kurang stabil dibanding nomor khusus API; jika bermasalah, alternatifnya nomor terpisah khusus API.
- **Kontrol bergantung kebiasaan dokter:** tanpa klik pada input kontrol, tidak ada reminder.
- **Pesan gagal tidak dikirim ulang otomatis.**
- **Teks hari-H menyebut batas 14.00** sesuai aturan expiry yang ada; bila aturan expiry berubah, template harus diajukan ulang.

## 15. Di luar lingkup (sub-proyek berikutnya / lanjutan)

- Auto-jawab harga (sub-proyek 2), pengumuman staf (3), komunitas SISIwanita (4).
- Balasan otomatis apa pun ke pesan masuk.
- UI log/inbox WhatsApp di panel staf.
- Checkbox opt-in saat booking.
- Menghapus `appointmentReminder.js`, `scripts/run-reminders.js`, dan endpoint manual reminder lama.
- Mengubah `sendWhatsAppAuto()` / fallback wa.me untuk fitur lain.
- Reminder janji RS, jadwal operasi via template, reminder 2 jam.
