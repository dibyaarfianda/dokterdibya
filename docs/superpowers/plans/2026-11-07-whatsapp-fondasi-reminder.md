# WhatsApp Fondasi + Reminder Pasien Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Kirim reminder janji Klinik Privat (H-1 18:00, hari-H 07:00) dan kontrol ulang (H-3 09:00) sebagai template Meta WhatsApp Cloud API, dengan webhook status/opt-out dan log idempoten.

**Architecture:** Tiga service backend kecil dengan dependency injection (`WhatsAppTemplateSender`, `WhatsAppWebhookService`, `WhatsAppReminderJobs`) di atas `whatsappService.sendViaMetaCloud` yang sudah ada; job didaftarkan di `appointmentScheduler.js`; webhook di-mount sebelum body parser global dengan raw parser. Frontend Planning mendapat input "Kontrol berikutnya" yang disimpan sebagai `kontrol_interval`/`kontrol_date` di JSON planning.

**Tech Stack:** Node.js/Express, MariaDB 10.11 (mysql2 `db.query`), node-cron 4 (`{ timezone: 'Asia/Jakarta' }`), jest 30 + supertest, ES module frontend (Sunday Clinic), puppeteer browser fixture.

**Spec:** `docs/superpowers/specs/2026-11-07-whatsapp-fondasi-reminder-design.md`

## Global Constraints

- Tabel hanya dibuat lewat `staff/backend/migrations/20261107_whatsapp_messages.sql` — tidak ada `CREATE TABLE` saat runtime.
- Nama key planning baru snake_case: `kontrol_interval`, `kontrol_date`.
- Nilai interval: `''`, `1_minggu`, `2_minggu`, `1_bulan`, `3_bulan`, `6_bulan`, `tanggal`, `tidak_perlu`.
- Lokasi: `sunday_clinic_records.visit_location = 'klinik_private'`; `disabled_practice_dates.location = 'klinik_privat'`.
- Template: bahasa `id`; nama `janji_h1` (nama, tanggal, jam), `janji_belum_konfirmasi` (nama, jam), `kontrol_h3` (nama, tanggal).
- Purpose = nama template; purpose uji = `test_<nama template>`.
- Tanggal: komponen lokal, **jangan** `toISOString()` untuk tanggal; pakai `formatDateLocal` dari `staff/backend/utils/date` di backend.
- Format tanggal pesan: `DibyaDateTime.date(d, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })` dari `public/scripts/date-time-format.js`.
- Isi pesan tanpa data klinis (tanpa keluhan/diagnosis/tindakan).
- Fallback wa.me **tidak pernah** dianggap terkirim. `sendWhatsAppAuto()` dan `appointmentReminder.js` tidak diubah.
- Flag env: `WA_REMINDER_JANJI_ENABLED`, `WA_REMINDER_KONTROL_ENABLED` (aktif hanya bila `=== 'true'`); env Meta baru: `WHATSAPP_CLOUD_APP_SECRET`, `WHATSAPP_CLOUD_VERIFY_TOKEN`.
- Jeda 1000 ms antar pesan dalam satu job.
- Commit tanpa baris `Co-Authored-By` (CLAUDE.md proyek).
- Test dijalankan di VPS (tidak ada Node lokal) dengan resep runner di memory `vps-jest-runner-and-drug-audit-status`: salin slim worktree ke `/tmp/<nama>`, symlink `node_modules`, lalu `JWT_SECRET=test node node_modules/jest/bin/jest.js --coverage=false --runInBand --forceExit <pattern>`. Bandingkan kegagalan dengan baseline main, jangan "perbaiki" kegagalan lama.

## Review Focus

1. **Format nomor berbeda untuk orang yang sama** — Meta mengirim `628…`, booking menyimpan `0812-…`/`+62 812…`; opt-out harus tetap berlaku. → test di Task 1 (`opt-out matches across phone formats`).
2. **Payload webhook valid-signature tapi isi aneh** (JSON rusak, `entry` kosong, tipe pesan gambar) — harus 200 dan tidak crash. → test di Task 2 dan Task 3.
3. **Planning diedit ulang tanpa kontrol** — planning terbaru tanpa `kontrol_date` tidak boleh memicu reminder dari planning lama. → test di Task 4 (`uses only latest planning per mr_id`).
4. **Tanggal relatif terhadap "sekarang"** — job 18:00 tanggal 2026-11-07 harus menargetkan `2026-11-08`, dan 31 Jan + 1 bulan = 28/29 Feb. → test di Task 4 dan Task 6.
5. **Meta belum dikonfigurasi padahal flag sudah `true`** — tidak boleh ada baris log yang "menghabiskan" unique key. → test di Task 1 dan Task 4.

---

### Task 1: Migration, konfigurasi template, dan `WhatsAppTemplateSender`

**Files:**
- Create: `staff/backend/migrations/20261107_whatsapp_messages.sql` (isi persis bagian 5.1 spec)
- Create: `staff/backend/config/whatsapp-templates.js`
- Create: `staff/backend/services/WhatsAppTemplateSender.js`
- Test: `staff/backend/tests/unit/WhatsAppTemplateSender.test.js`

**Interfaces:**
- Produces:
  - `WHATSAPP_TEMPLATES` (frozen): `{ janji_h1: { name, language: 'id', params: ['nama','tanggal','jam'] }, janji_belum_konfirmasi: { …, params: ['nama','jam'] }, kontrol_h3: { …, params: ['nama','tanggal'] } }`
  - `resolveTemplate(purpose: string) -> { name, language, params } | null` — `test_` prefix dilepas sebelum lookup.
  - `buildBodyComponents(template, values: object) -> [{ type: 'body', parameters: [{ type: 'text', text: string }] }]` — urutan mengikuti `template.params`; nilai kosong → throw `Error('missing_param:<key>')`.
  - `createWhatsAppTemplateSender({ db, whatsapp, logger }) -> { isConfigured(): boolean, send(input): Promise<SendResult> }`
  - `input = { purpose, refType, refId, patientId, phone, values }`; `SendResult = { status: 'sent'|'skipped'|'failed', reason?: string, messageId?: string }`
  - `whatsapp` = objek dengan `meta.enabled`, `formatPhoneNumber(phone)`, `sendViaMetaCloud(phone, message, options)` (default: `require('./whatsappService')`).

- [ ] **Step 1: Tulis test yang gagal**

Gunakan `fakeDb()` berbasis Map seperti `tests/unit/StaffMenuBadges.test.js` (mengenali `SELECT 1 FROM wa_opt_outs`, `INSERT IGNORE INTO wa_messages`, `UPDATE wa_messages`) dan `fakeWhatsapp({ enabled, result })`. Test:
- `skips without a log row when Meta is not configured` — `meta.enabled=false` → `{ status: 'failed', reason: 'meta_not_configured' }`; tidak ada query `INSERT`.
- `skips empty or invalid phone` → `{ status: 'skipped', reason: 'invalid_phone' }`; tidak ada `INSERT`.
- `opt-out matches across phone formats` — opt-out `6281234567890`, input phone `'0812-3456-7890'` → `skipped`/`opted_out`, ada `INSERT IGNORE` dengan status `'skipped'`, `sendViaMetaCloud` tidak dipanggil.
- `second claim for same purpose and ref is skipped` — `affectedRows: 0` pada klaim → `skipped`/`already_claimed`, tidak kirim.
- `sends template and records message id` — hasil `{ success: true, messageId: 'wamid.X' }` → `{ status: 'sent', messageId: 'wamid.X' }`; `sendViaMetaCloud` dipanggil dengan `('6281234567890', null, { templateName: 'janji_h1', templateLanguage: 'id', templateComponents: [{ type:'body', parameters:[{type:'text',text:'Ani'},{type:'text',text:'Minggu, 8 November 2026'},{type:'text',text:'09:30'}] }] })`; `UPDATE` berisi `status = 'sent'` dan `'wamid.X'`.
- `records Meta error as failed` — `{ success:false, error:'x'.repeat(600) }` → `failed`; `error_message` dipotong 500 karakter.
- `test purpose uses base template` — `resolveTemplate('test_kontrol_h3').name === 'kontrol_h3'`; `resolveTemplate('unknown') === null`.

- [ ] **Step 2: Jalankan, pastikan gagal** — `… jest.js --coverage=false --runInBand --forceExit tests/unit/WhatsAppTemplateSender.test.js` → FAIL "Cannot find module".

- [ ] **Step 3: Implementasi** — buat migration (SQL persis spec 5.1), config, dan sender dengan urutan langkah spec 7.4 (cek konfigurasi → normalisasi → opt-out → klaim `INSERT IGNORE … status='claimed'` → kirim → update). `purpose` tidak dikenal → `failed`/`unknown_template` tanpa baris log.

- [ ] **Step 4: Jalankan, pastikan lulus** — perintah sama → PASS 7 test.

- [ ] **Step 5: Commit** — `git add` ketiga file + test; `git commit -m "Add WhatsApp template sender with idempotent message log"`.

---

### Task 2: `WhatsAppWebhookService` (signature + pemrosesan payload)

**Files:**
- Create: `staff/backend/services/WhatsAppWebhookService.js`
- Test: `staff/backend/tests/unit/WhatsAppWebhookService.test.js`

**Interfaces:**
- Consumes: tabel `wa_messages`, `wa_opt_outs` (Task 1); `whatsappService.formatPhoneNumber`.
- Produces:
  - `verifySignature(rawBody: Buffer, header: string|undefined, appSecret: string|undefined) -> boolean` — `sha256=` + HMAC-SHA256 hex, `crypto.timingSafeEqual`; panjang beda/header hilang/secret kosong → `false`.
  - `createWhatsAppWebhookService({ db, logger, formatPhone }) -> { handlePayload(payload: object): Promise<{ statuses: number, inbound: number, optOuts: number }> }`

- [ ] **Step 1: Tulis test yang gagal**
- `verifySignature accepts matching HMAC` / `rejects wrong signature` / `rejects missing header` / `rejects empty secret`.
- `status updates never move backwards` — fake db mencatat SQL+params; event `delivered` lalu `read` lalu `delivered`: `UPDATE` untuk `delivered` kedua harus memuat kondisi rank (assert params berisi target status dan SQL memuat `FIELD(status`), dan service mengirim `failed` dengan `error_message = errors[0].title`.
- `inbound STOP variants opt out` — teks `'STOP'`, `' berhenti '`, `'Stop'` → `INSERT IGNORE INTO wa_opt_outs` dengan phone `628…` dan `'inbound_stop'`; teks `'stop dulu ya'` → tidak opt-out.
- `inbound text stored once` — `INSERT IGNORE INTO wa_messages` dengan `direction='inbound'`, `status='received'`, `body_text` dipotong 1000.
- `ignores non-text messages and empty entries` — `{ entry: [] }`, `{ entry:[{ changes:[{ value:{ messages:[{ type:'image' }] } }] }] }`, `{}` → resolve `{ statuses:0, inbound:0, optOuts:0 }` tanpa throw.

- [ ] **Step 2: Jalankan, pastikan gagal** → FAIL "Cannot find module".

- [ ] **Step 3: Implementasi** — iterasi `entry[].changes[].value`; rank status `claimed < sent < delivered < read`; `failed` selalu menimpa; status non-failed tidak menimpa `failed`. Kegagalan satu event di-`logger.warn` tanpa isi pesan, lalu lanjut.

- [ ] **Step 4: Jalankan, pastikan lulus** → PASS.

- [ ] **Step 5: Commit** — `git commit -m "Add WhatsApp webhook signature check and status/opt-out processing"`.

---

### Task 3: Route webhook, mount, access-control, `.env.example`

**Files:**
- Create: `staff/backend/routes/whatsapp-webhook.js`
- Modify: `staff/backend/server.js` (mount tepat setelah blok `/api/rum`, sebelum `app.use(express.json({ limit: '10mb' …`, ±baris 168)
- Modify: `staff/backend/config/accessControlRegistry.js` (`NAMED_EXEMPTIONS` + aturan di bawah `xendit-webhook`, ±baris 380)
- Modify: `staff/backend/.env.example` (blok spec bagian 10)
- Test: `staff/backend/tests/unit/WhatsAppWebhookRoute.test.js`

**Interfaces:**
- Consumes: `verifySignature`, `createWhatsAppWebhookService` (Task 2).
- Produces: `createWhatsAppWebhookRouter({ service, verifyToken = process.env.WHATSAPP_CLOUD_VERIFY_TOKEN, appSecret = process.env.WHATSAPP_CLOUD_APP_SECRET } = {}) -> express.Router` dengan `router.get('/', …)` dan `router.post('/', express.raw({ type: 'application/json', limit: '1mb' }), …)`. Mount: `app.use('/api/whatsapp/webhook', require('./routes/whatsapp-webhook').createWhatsAppWebhookRouter());`

- [ ] **Step 1: Tulis test yang gagal** (supertest pada `express()` yang hanya memasang router)
- `GET verify returns challenge` — `?hub.mode=subscribe&hub.verify_token=tok&hub.challenge=123` → 200, body `'123'`; token salah → 403.
- `POST with bad signature is 401 and not processed` — `service.handlePayload` tidak dipanggil.
- `POST with valid signature returns 200 and processes` — `handlePayload` dipanggil dengan objek hasil parse.
- `POST valid signature but malformed JSON returns 200` — body `'{bad'` dengan signature yang cocok → 200, `handlePayload` tidak dipanggil, `logger.warn` terpanggil.
- `POST returns 200 when processing throws` — `handlePayload` reject → 200.
- Tidak perlu test registry baru: `tests/unit/AccessControlCatalogRegistry.test.js` sudah menginventaris semua file di `routes/`, jadi route baru otomatis diperiksa di Step 4.

- [ ] **Step 2: Jalankan, pastikan gagal** → FAIL "Cannot find module".

- [ ] **Step 3: Implementasi** route, mount, exemption `'messaging_webhook'` + `if (route.sourceFile === 'whatsapp-webhook') return { exemption: 'messaging_webhook', ruleId: 'whatsapp-webhook' };`, dan `.env.example`.

- [ ] **Step 4: Jalankan test baru + `tests/unit/AccessControlCatalogRegistry.test.js`** → test baru PASS; registry tidak menambah entri `whatsapp-webhook` di `unresolved` (kegagalan lama sesuai baseline boleh tetap ada).

- [ ] **Step 5: Commit** — `git commit -m "Mount Meta WhatsApp webhook with raw-body signature verification"`.

---

### Task 4: `WhatsAppReminderJobs` (pemilihan penerima 3 job)

**Files:**
- Create: `staff/backend/services/WhatsAppReminderJobs.js`
- Test: `staff/backend/tests/unit/WhatsAppReminderJobs.test.js`

**Interfaces:**
- Consumes: `createWhatsAppTemplateSender(...).send/isConfigured` (Task 1); `getSessionSettings`, `getSlotTimeFromSettings`, `getSessionLabelFromSettings` dari `services/booking-session-settings.js`; `formatDateLocal`.
- Produces: `createWhatsAppReminderJobs({ db, sender, sessionSettings, logger, now = () => new Date(), sleep = ms => new Promise(r => setTimeout(r, ms)) }) -> { runJanjiH1(), runJanjiBelumKonfirmasi(), runKontrolH3() }`; masing-masing `Promise<{ total, sent, skipped, failed } | { disabled: true, reason: 'meta_not_configured' | 'table_missing' }>`.

Query kontrol (algoritma "planning terbaru per mr_id" tidak ditentukan oleh signature):

```sql
SELECT mr.id AS record_id, scr.patient_id, p.full_name,
       COALESCE(NULLIF(p.whatsapp, ''), p.phone) AS phone,
       JSON_UNQUOTE(JSON_EXTRACT(mr.record_data, '$.kontrol_date')) AS kontrol_date
FROM medical_records mr
JOIN (SELECT mr_id, MAX(id) AS latest_id FROM medical_records
      WHERE record_type = 'planning' GROUP BY mr_id) latest ON latest.latest_id = mr.id
JOIN sunday_clinic_records scr ON scr.mr_id = mr.mr_id
JOIN patients p ON p.id = scr.patient_id
WHERE scr.visit_location = 'klinik_private'
  AND JSON_UNQUOTE(JSON_EXTRACT(mr.record_data, '$.kontrol_date')) = ?
  AND NOT EXISTS (SELECT 1 FROM sunday_appointments sa
                  WHERE sa.patient_id = scr.patient_id
                    AND sa.status IN ('pending_confirmation','confirmed')
                    AND sa.appointment_date BETWEEN ? AND DATE_ADD(?, INTERVAL 7 DAY))
```
Parameter: `[kontrolDate, today, kontrolDate]`. Query janji memakai `NOT EXISTS` libur persis seperti `NOT_DISABLED_PRACTICE_DATE_SQL` di `appointmentScheduler.js` (salin konstanta, jangan impor dari scheduler agar tidak ada siklus), dengan tanggal sebagai parameter `?`.

- [ ] **Step 1: Tulis test yang gagal** (fake db mencocokkan SQL via regex, fake sender merekam panggilan, `now = () => new Date(2026, 10, 7, 18, 0)`, `sleep = jest.fn()`). Nilai `tanggal` yang diharapkan dihitung di test dengan `DibyaDateTime.date(new Date(2026, 10, 8), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })` (tidak di-hardcode); string di bawah hanya ilustrasi.
- `janji H-1 targets tomorrow with slot time` — query params memuat `'2026-11-08'`; status `IN ('pending_confirmation','confirmed')`; sender dipanggil dengan `{ purpose:'janji_h1', refType:'sunday_appointment', refId:'101', values:{ nama:'Ani', tanggal:'Minggu, 8 November 2026', jam:'09:30' } }` (session 1, slot 4, setting start 09:00 slot 10).
- `janji H-1 falls back to session label when slot time is null`.
- `belum konfirmasi targets today pending only` — params `'2026-11-07'`, SQL hanya `status = 'pending_confirmation'`, purpose `janji_belum_konfirmasi`, values `{ nama, jam }`.
- `kontrol H-3 targets today plus 3 and sends kontrol template` — params `['2026-11-10','2026-11-07','2026-11-10']`; values `{ nama, tanggal:'Selasa, 10 November 2026' }`, `refType:'medical_record'`.
- `uses only latest planning per mr_id` — SQL memuat `MAX(id) AS latest_id` dan join `latest.latest_id = mr.id`.
- `stops before querying when Meta is not configured` — `sender.isConfigured()` false → `{ disabled:true, reason:'meta_not_configured' }`, tidak ada query penerima.
- `stops when wa_messages table is missing` — preflight `SELECT 1 FROM wa_messages LIMIT 1` reject `{ code:'ER_NO_SUCH_TABLE' }` → `{ disabled:true, reason:'table_missing' }`.
- `counts results and sleeps between messages` — 3 penerima (sent/skipped/failed) → `{ total:3, sent:1, skipped:1, failed:1 }`; `sleep` dipanggil 2 kali dengan `1000`.
- `idempotent across two runs` — sender fake yang mengembalikan `skipped` untuk klaim kedua; dua kali `runJanjiH1()` → `sent` total 1.

- [ ] **Step 2: Jalankan, pastikan gagal** → FAIL "Cannot find module".
- [ ] **Step 3: Implementasi** sesuai spec 7.1–7.3.
- [ ] **Step 4: Jalankan, pastikan lulus** → PASS.
- [ ] **Step 5: Commit** — `git commit -m "Add WhatsApp reminder recipient jobs for janji and kontrol"`.

---

### Task 5: Daftarkan job di scheduler

**Files:**
- Modify: `staff/backend/services/appointmentScheduler.js` (fungsi baru `startWhatsAppReminderScheduler()`, dipanggil di `initSchedulers()` **setelah** `startPracticeConfirmationExpiryJob()`)
- Test: `staff/backend/tests/unit/WhatsAppReminderScheduler.test.js`

**Interfaces:**
- Consumes: `createWhatsAppReminderJobs` (Task 4), `createWhatsAppTemplateSender` (Task 1) — di-`require` di dalam callback cron (pola `DocBoardPushService`).

- [ ] **Step 1: Tulis test yang gagal** (mock seperti `tests/unit/ClinicConfirmationScheduler.test.js`, plus `jest.mock('../../services/WhatsAppReminderJobs')`)
- `registers three WhatsApp jobs in Asia/Jakarta` — selain job lama, ada tambahan `'0 18 * * *'`, `'0 7 * * *'`, `'0 9 * * *'` dengan timezone `'Asia/Jakarta'` (hitung kemunculan: `0 18` dan `0 7` masing-masing 2, `0 9` 1).
- `janji jobs do nothing unless WA_REMINDER_JANJI_ENABLED is 'true'` — panggil callback terakhir untuk `'0 18 * * *'` dengan env tidak di-set → `runJanjiH1` tidak dipanggil; dengan `'true'` → dipanggil sekali.
- `kontrol job respects WA_REMINDER_KONTROL_ENABLED`.
- `overlapping run is skipped` — callback dipanggil dua kali tanpa menunggu → `runJanjiH1` dipanggil sekali.
- Jalankan juga `tests/unit/ClinicConfirmationScheduler.test.js` — harus tetap PASS (callback `0 18`/`0 7` pertama tetap milik popup).

- [ ] **Step 2: Jalankan, pastikan gagal** → FAIL pada jumlah cron.
- [ ] **Step 3: Implementasi** — flag dibaca saat callback berjalan; guard `running` per job; error di-`logger.error`.
- [ ] **Step 4: Jalankan kedua file test** → PASS.
- [ ] **Step 5: Commit** — `git commit -m "Schedule WhatsApp janji and kontrol reminders behind env flags"`.

---

### Task 6: Helper tanggal kontrol + snapshot planning

**Files:**
- Create: `staff/public/scripts/sunday-clinic/utils/kontrol-schedule.js` (ES module)
- Modify: `staff/public/scripts/sunday-clinic/utils/docboard-planning.js` (`normalizePlanningSnapshot` menambah `kontrol_interval`, `kontrol_date`)
- Test: `staff/backend/tests/unit/SundayClinicKontrolSchedule.test.js` (pola `runHelper` data-URL dari `tests/unit/SundayClinicDocBoardPlanning.test.js`)
- Modify test: `staff/backend/tests/unit/SundayClinicDocBoardPlanning.test.js`

**Interfaces:**
- Produces:
  - `KONTROL_INTERVALS` = `[{value:'1_minggu',label:'1 mgg'},{value:'2_minggu',label:'2 mgg'},{value:'1_bulan',label:'1 bln'},{value:'3_bulan',label:'3 bln'},{value:'6_bulan',label:'6 bln'},{value:'tanggal',label:'Pilih tanggal'},{value:'tidak_perlu',label:'Tidak perlu'}]`
  - `computeKontrolDate(baseDate: 'YYYY-MM-DD', interval: string, manualDate = '') -> 'YYYY-MM-DD' | ''` — minggu = +7/+14 hari; bulan = tambah bulan dengan clamp ke hari terakhir bulan tujuan; `tanggal` → `manualDate` bila valid `YYYY-MM-DD`; `tidak_perlu`/`''`/tidak dikenal/`baseDate` tidak valid → `''`.

- [ ] **Step 1: Tulis test yang gagal**
- `computeKontrolDate('2026-11-07','1_minggu') === '2026-11-14'`; `'2_minggu'` → `'2026-11-21'`; `('2026-01-31','1_bulan')` → `'2026-02-28'`; `('2028-01-31','1_bulan')` → `'2028-02-29'`; `('2026-08-31','6_bulan')` → `'2027-02-28'`; `('2026-11-07','tanggal','2026-12-01')` → `'2026-12-01'`; `('2026-11-07','tanggal','')` → `''`; `('2026-11-07','tidak_perlu')` → `''`; `('', '1_minggu')` → `''`.
- Di `SundayClinicDocBoardPlanning.test.js`: `hasUnsavedPlanning` mengembalikan `true` bila hanya `kontrol_interval` berbeda, `false` bila persisted lama tanpa key kontrol dan current `kontrol_interval: ''`.

- [ ] **Step 2: Jalankan, pastikan gagal**.
- [ ] **Step 3: Implementasi** — aritmetika tanggal dengan `new Date(y, m, d)` lokal, keluaran dari `getFullYear/getMonth/getDate`.
- [ ] **Step 4: Jalankan kedua file test** → PASS.
- [ ] **Step 5: Commit** — `git commit -m "Add kontrol date helper and include kontrol fields in planning snapshot"`.

---

### Task 7: UI "Kontrol berikutnya" di Planning + bump aset

**Files:**
- Modify: `staff/public/scripts/sunday-clinic/components/shared/plan.js` — `renderObstetriFormat`: `planData` menambah `kontrol_interval`, `kontrol_date` (dari `savedData` lalu `statePlan`); markup grup setelah blok textarea `planning-rencana` dan sebelum `data-planned-sc`; binding di `afterRender`.
- Modify: `staff/public/scripts/sunday-clinic/main.js` — `getPlanningFormData()` (±baris 1407) menambah `kontrol_interval` dan `kontrol_date = computeKontrolDate(record_date, interval, manualDate)`.
- Modify: `staff/public/index-adminlte.html:14` (`STAFF_CACHE_VERSION`) dan `staff/public/sw.js:7` (`STAFF_PWA_VERSION`) → versi berikutnya yang belum dipakai (cek `ls /var/www/dokterdibya-staff-releases` di VPS sebelum memilih; per 2026-11-07 v495 sudah live dari branch lain, jadi kemungkinan `v496`).
- Test: `staff/backend/tests/browser/planning-save-all-fixture.cjs` (tambah skenario)

**Interfaces:**
- Consumes: `KONTROL_INTERVALS`, `computeKontrolDate` (Task 6).
- DOM yang diandalkan test: tombol `[data-kontrol-interval="<value>"]` (radio bergaya `btn-group-toggle` Bootstrap, tanpa CSS baru), `input#planning-kontrol-interval` (hidden), `input#planning-kontrol-date-manual[type=date]` (tersembunyi kecuali `tanggal`), `#planning-kontrol-summary` (teks "Kontrol ≈ <DibyaDateTime.date …>" atau kosong).

- [ ] **Step 1: Tulis skenario browser yang gagal** di `planning-save-all-fixture.cjs`: klik `[data-kontrol-interval="2_minggu"]` dengan `planning-datetime = 2026-11-07T09:00` → summary memuat "21 November 2026"; Simpan → body POST `/api/medical-records` berisi `kontrol_interval:'2_minggu'`, `kontrol_date:'2026-11-21'`; render ulang dengan data tersimpan → tombol `2_minggu` aktif; pilih `tanggal` + `2026-12-01` → `kontrol_date:'2026-12-01'`; pilih `tidak_perlu` → `kontrol_date:''`.
- [ ] **Step 2: Jalankan di VPS, pastikan gagal** — `PUPPETEER_EXECUTABLE_PATH=/root/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome node tests/browser/planning-save-all-fixture.cjs` → assertion gagal (selector tidak ada).
- [ ] **Step 3: Implementasi** markup, binding, `getPlanningFormData`, dan bump versi. Semua nilai yang dirender lewat `escapeHtml` yang sudah ada.
- [ ] **Step 4: Jalankan fixture** → lulus; jalankan juga `planning-previous-control.cjs` → tetap lulus.
- [ ] **Step 5: Verifikasi Medify tidak terdampak** — `grep -rn "kontrol_" staff/backend/services staff/backend/workers` hanya menemukan `WhatsAppReminderJobs.js`; baca builder SOAP yang dipakai `SundayClinicSaveEffects.js:171` dan pastikan ia memilih key planning secara eksplisit (bukan menyalin seluruh objek). Jika menyalin seluruh objek, **berhenti dan tanya user** sebelum lanjut.
- [ ] **Step 6: Commit** — `git commit -m "Add Kontrol berikutnya picker to Sunday Clinic Planning and bump staff assets"`.

---

### Task 8: Script uji kirim

**Files:**
- Create: `staff/backend/scripts/whatsapp-send-test-template.js`
- Test: `staff/backend/tests/unit/WhatsAppSendTestTemplateScript.test.js`

**Interfaces:**
- Consumes: `createWhatsAppTemplateSender` (Task 1).
- Produces: `main(argv: string[], deps = { sender, out = console }) -> Promise<number>` (exit code) dan `if (require.main === module) main(process.argv.slice(2)).then(code => process.exit(code))`. Argumen: `<nomor> <janji_h1|janji_belum_konfirmasi|kontrol_h3>`. Nilai contoh: nama `'Uji Coba'`, tanggal = format besok, jam `'09:00'`. Memanggil `send({ purpose: 'test_<template>', refType: 'test', refId: String(Date.now()), patientId: null, phone, values })`.

- [ ] **Step 1: Tulis test yang gagal** — argumen kurang/template tidak dikenal → exit `2`, sender tidak dipanggil; sukses → exit `0`, output memuat `sent` dan `wamid.X`, output **tidak** memuat nilai `WHATSAPP_CLOUD_ACCESS_TOKEN` yang di-set di env test; `failed` → exit `1`.
- [ ] **Step 2: Jalankan, pastikan gagal**.
- [ ] **Step 3: Implementasi**.
- [ ] **Step 4: Jalankan, pastikan lulus**.
- [ ] **Step 5: Commit** — `git commit -m "Add CLI to send a WhatsApp test template"`.

---

### Task 9: Regresi penuh, push, dan serah terima deploy

**Files:** tidak ada perubahan kode.

- [ ] **Step 1: Suite penuh di VPS** dengan resep runner (nohup + marker DONE, `--maxWorkers=2`). Bandingkan daftar `✕` dengan baseline main yang dijalankan dengan cara yang sama (`comm`); kegagalan baru = 0.
- [ ] **Step 2: Push branch** — `git push origin claude/whatsapp-business-reminder-ai-e9e2ad`.
- [ ] **Step 3: Laporkan ke user** dan **minta persetujuan sebelum deploy produksi**. Urutan deploy (tidak dijalankan tanpa persetujuan): backup `mysqldump` tabel terkait ke `/root/backups/` → jalankan migration → stage aset versi baru (memory `staff-asset-release-staging`) → ff-merge → `pm2 reload ecosystem.config.js --only dibyaklinik-backend --update-env` → cek `/api/health` 200 dan `GET /api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=salah` → 403. Kedua flag `WA_REMINDER_*` tetap `false` sampai user menyelesaikan langkah setup Meta (spec bagian 11).
