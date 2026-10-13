# Polling Mitos (sisiwanita.id)

Halaman polling publik tanpa login, diakses lewat QR. Jawaban teks diklasifikasi AI (Claude) ke kategori mitos yang diatur admin.

- Publik: `https://sisiwanita.id/polling.html?p=<kode-link>` (file `public/polling.html`)
- Admin (dokter/superadmin): `https://dokterdibya.com/staff/public/polling-mitos.html`
- API: `/api/public-polls/:slug` (publik) dan `/api/public-polls/admin/*` (verifyStaffToken + requireSuperadmin)

## Deploy

```bash
cd /var/www/dokterdibya
git pull origin main
mysql -u root dibyaklinik < staff/backend/migrations/20261012_public_polls.sql
cd staff/backend && npm install   # menambah @anthropic-ai/sdk
```

Tambahkan ke `staff/backend/.env`:

```
ANTHROPIC_API_KEY=sk-ant-...
# opsional
# PUBLIC_POLL_AI_MODEL=claude-opus-5-5
# PUBLIC_POLL_BASE_URL=https://sisiwanita.id
```

Lalu `pm2 restart all` dan cek `/api/health`.

Nginx dan DNS sisiwanita.id tidak perlu diubah: `polling.html` sudah tercakup blok `location ~* \.html$` dan `/api/` sudah di-proxy ke backend (lihat `sisiwanita.id.nginx.conf.example`).

## Perilaku

- Satu jawaban per IP (`UNIQUE(poll_id, dedupe_key)`). Bila opsi "Batasi satu jawaban per IP" dimatikan, pembatasan memakai token acak di localStorage perangkat; IP tetap dicatat.
- IP dibaca dari `cf-connecting-ip` / `x-real-ip` / `x-forwarded-for` (helper `getRequestIp`, sama dengan blocklist pasien).
- Klasifikasi berjalan di antrean background satu per satu setelah jawaban tersimpan. Pengisi tidak menunggu AI.
- Kalau API key belum diset atau AI gagal, jawaban tetap tersimpan dengan status `pending`/`failed`; admin bisa klik "Klasifikasi yang menunggu/gagal".
- Admin bisa koreksi kategori per jawaban (manual override tidak ditimpa klasifikasi ulang).
- Gambar header disimpan di DB (diperkecil ke lebar 1200px, WEBP).
