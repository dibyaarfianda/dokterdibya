# Pengeluaran Obat RS: Medify Melinda Sync

Approved by the user on 2026-11-23. Build confirmed the same day.

## Why

The user needs RSIA Melinda drug usage on demand, without Claude opening Medify and without loading Medify. The data supports pharmacy order decisions, such as which items are urgent by usage speed.

## Goals

- A nightly VPS job copies the Medify "Pengeluaran Obat" report into the clinic database.
- A Staff Panel page, "Pengeluaran Obat RS", shows the data with month, depot and item-type filters, and downloads Excel.
- Opening the page or downloading Excel never contacts Medify.

## Non-goals

- No patient data, receipts or per-patient billing.
- No current stock, purchase orders or marketplace prices.
- No "receipt value" presented as fact. The report price is about 11% below bill prices on the one bill checked, so the page labels values as "Nilai Laporan".
- No manual sync button (not in the approved design).

## Anti-goals

- Never write to Medify. The job calls only the fixed report path.
- Never retry aggressively or run depots in parallel.
- Never replace good stored data with a partial or invalid report.

## Approaches

1. **Monthly depot report on the VPS (chosen by the user).** One small xlsx per depot per month. It has no patient columns and uses the existing stored Medify login.
2. Per-case Billing pages. Closer to receipts, but about 545 KB per case and full of patient context. Rejected.
3. Medify "Penjualan Farmasi" report. It returned HTTP 500 during testing. Rejected.

## Design decided with the user

- Runs on the VPS at 02:00 WIB with the stored login (`medify_credentials`, `MedifyHttpSession`).
- Each night fetches the current month for 8 depots, one at a time, 4 seconds apart.
- On days 1 to 5 of a month it also refreshes the previous month.
- It stops on an error or a slow response.
- Stored per drug, depot and month.
- Page filters: month, depot, item type. Excel download.

## Source

```text
GET https://simrs.melinda.co.id/farmasi/{depo}/laporan/pengeluaran-obat
    ?tanggal_awal=dd/mm/yyyy&tanggal_akhir=dd/mm/yyyy&obat_bebas=on&obat_resep=on&export_as=xls
```

Depots: `depo-rawat-jalan`, `depo-rawat-inap`, `depo-ruang-bayi`, `depo-vk`, `depo-ok`, `depo-aster`, `depo-icu`, `depo-hcu`.

The sheet has a two-row header (rows 9 and 10), data rows numbered in column A, and a `T O T A L` row. Columns: no, kode, nama, then JML and HARGA for JUMLAH, INACBG, 23 HARI and DUK RS. HARGA is a line total. Verified from the VPS account on 2026-11-23.

## Builder decisions

- **Access:** existing permission `integrations.view` (doctor by default) for the page and the export.
- **Storage:** `melinda_drug_usage` (one row per month, depot, item), `melinda_drug_usage_reports` (one row per month and depot, with Medify totals) and `melinda_drug_usage_runs` (run log). Created only by a migration.
- **Validation before saving:** the header must match, the file must have a total row, quantities must equal the Medify total exactly, and the value must be within the rounding limit of Rp0.5 per line, minimum Rp10 (Medify rounds each line). A failed report stops the run and leaves stored data untouched.
- **Replace rule:** each month and depot is replaced in one transaction.
- **Slow response:** over 30 seconds stops the run after saving that valid report.
- **Item type:** Obat or Alkes/BHP from a keyword rule on the item name, labelled as an estimate.
- **Concurrency:** a MySQL named lock prevents overlapping runs.
- **Backfill:** `--from YYYY-MM --to YYYY-MM`, starting at 2026-10.
- **Page freshness:** shows the last successful sync, and warns if the latest run failed or is older than 36 hours.
