# SRIKANDI KEDIRI — MASTER INDEX
## Paket Dokumen Legal, Keamanan, dan Operasional (API-Only)

Dokumen ini adalah pintu masuk utama untuk review dan persetujuan paket kontrak **SRIKANDI KEDIRI**.

---

## 1) Daftar Dokumen Inti

1. Checklist Legal & Keamanan
   - `SRIKANDI_KEDIRI_CHECKLIST_LEGAL_API_ONLY.md`
2. Template Pasal Kontrak (dokumen induk)
   - `SRIKANDI_KEDIRI_TEMPLATE_PASAL_KONTRAK.md`
3. Lampiran A — SLA
   - `SRIKANDI_KEDIRI_LAMPIRAN_A_SLA.md`
4. Lampiran B — Standar Keamanan Minimum
   - `SRIKANDI_KEDIRI_LAMPIRAN_B_STANDAR_KEAMANAN_MINIMUM.md`
5. Lampiran C — Daftar Data KIA Minimum
   - `SRIKANDI_KEDIRI_LAMPIRAN_C_DAFTAR_DATA_KIA_MINIMUM.md`
6. Lampiran D — Respons Insiden & Notifikasi 24 Jam
   - `SRIKANDI_KEDIRI_LAMPIRAN_D_RESPONS_INSIDEN_DAN_NOTIFIKASI.md`
7. Lampiran E — Serah-Terima Terminasi (Exit Procedure)
   - `SRIKANDI_KEDIRI_LAMPIRAN_E_PROSEDUR_SERAH_TERIMA_TERMINASI.md`

---

## 2) Urutan Review yang Disarankan

### Tahap 1 — Governance & Legal Dasar
- Review dokumen:
  - `SRIKANDI_KEDIRI_CHECKLIST_LEGAL_API_ONLY.md`
  - `SRIKANDI_KEDIRI_TEMPLATE_PASAL_KONTRAK.md`
- Fokus:
  - kepemilikan data (Pemkot Kediri)
  - peran developer utama
  - dasar hukum pemrosesan
  - larangan penggunaan data di luar tujuan

### Tahap 2 — Risiko Operasional & Keamanan
- Review dokumen:
  - `SRIKANDI_KEDIRI_LAMPIRAN_A_SLA.md`
  - `SRIKANDI_KEDIRI_LAMPIRAN_B_STANDAR_KEAMANAN_MINIMUM.md`
  - `SRIKANDI_KEDIRI_LAMPIRAN_D_RESPONS_INSIDEN_DAN_NOTIFIKASI.md`
- Fokus:
  - target SLA realistis
  - kontrol minimum keamanan
  - kewajiban notifikasi insiden 1x24 jam
  - bukti audit dan eskalasi

### Tahap 3 — Data Scope & Exit Readiness
- Review dokumen:
  - `SRIKANDI_KEDIRI_LAMPIRAN_C_DAFTAR_DATA_KIA_MINIMUM.md`
  - `SRIKANDI_KEDIRI_LAMPIRAN_E_PROSEDUR_SERAH_TERIMA_TERMINASI.md`
- Fokus:
  - data minimization
  - pembatasan field sensitif
  - prosedur transisi dan penghapusan data

---

## 3) Checklist Approval Internal

### A. Approval Legal
- [ ] Kepemilikan data telah jelas dan tegas
- [ ] Klausul pemrosesan data dan NDA disetujui
- [ ] Klausul insiden dan notifikasi disetujui
- [ ] Klausul serah-terima dan terminasi disetujui

### B. Approval Teknis
- [ ] Arsitektur API-only feasible
- [ ] SLA dapat dipenuhi oleh tim operasional
- [ ] Kontrol keamanan minimum dapat diimplementasikan
- [ ] Prosedur DR/backup/restore siap

### C. Approval Bisnis/Pemerintah
- [ ] Ruang lingkup layanan sesuai kebutuhan Kediri
- [ ] Mekanisme rujukan KIA terakomodasi
- [ ] KPI dan pelaporan bulanan disepakati

---

## 4) Data Isian yang Harus Difinalkan Sebelum TTD

Isi placeholder di dokumen kontrak/lampiran:
- Nama instansi resmi PIHAK PERTAMA
- Nama legal PIHAK KEDUA (developer utama)
- Kontak PIC teknis, legal, dan on-call insiden
- Nilai SLA final (jika berubah dari default)
- Forum sengketa final
- Daftar subkontraktor/subprosesor (jika ada)
- Lokasi data center/region cloud

---

## 5) Output yang Harus Siap Saat Penandatanganan

- Kontrak induk final
- Lampiran A–E final
- Checklist legal/compliance terisi status dan bukti
- Berita acara persetujuan internal

---

## 6) Catatan Implementasi

- Dokumen ini adalah baseline operasional; dapat diperbarui melalui addendum resmi.
- Setiap perubahan penting (SLA, data scope, keamanan, terminasi) wajib terdokumentasi dan disetujui para pihak.

---

## 7) Log Revisi

- Versi: v1.0
- Tanggal: __________
- Disusun oleh: __________
- Diperiksa oleh: __________
- Disetujui oleh: __________
