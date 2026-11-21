# Pencairan saldo: status "Sedang ditransfer" (short design)

Status: Approved by Boss 2026-11-21 ("Yes, build it" to: add a "sedang diproses" status so patients can't cancel a withdrawal mid-transfer).
Builds on: `2026-11-21-prepay-packages-booking-deposit-design.md` (Tahap 3, withdrawal requests).

## Why

Today a patient can cancel a pending withdrawal at any moment. If staff are already transferring the money by hand and the patient cancels, the saldo comes back, the patient can spend it at the cashier, and the clinic pays twice. Staff only get a warning afterwards ("Pasien sudah membatalkan pengajuan ini…").

## What changes

- New request status `processing` ("Sedang ditransfer") between `pending` and `done`.
- Staff (billing.reset) press **"Mulai transfer"** on a pending request before they transfer. The confirm dialog shows bank, account and holder and says the patient can no longer cancel.
- While `processing`:
  - the patient cannot cancel: 409 "Pengajuan ini sedang ditransfer oleh klinik dan tidak dapat dibatalkan. Hubungi klinik bila ada yang perlu diubah.";
  - the amount stays held (cashier, direct refunds and new requests all use live − hold, as for `pending`);
  - a second "Mulai transfer" is refused with who started it, so two cashiers never transfer the same request.
- Staff close a `processing` request with "Sudah ditransfer" (records the refund, as today) or "Tolak" (transfer failed, wrong account).
- New columns `processing_by` (staff display name) and `processing_at`, shown in the Pencairan tab ("oleh Kasir · 21/11/2026 10:05").
- Patient page labels: `pending` "Menunggu" (with Batalkan), `processing` "Sedang ditransfer" (no Batalkan, short note why).

## Approaches considered

1. **Explicit "Mulai transfer" step (chosen).** One click before the transfer locks the request. Clear, auditable, and it also warns a second cashier.
2. Lock the request automatically when staff open the Pencairan tab. Rejected: just viewing the list would block every patient's cancel, and it records nobody.
3. No patient cancel at all. Rejected: Boss wanted cancel; it is only unsafe once staff start.

## Calls I made (Boss can change them)

- The backend still accepts "Sudah ditransfer" on a `pending` request (an old cached staff page may still send it). The new page only shows it after "Mulai transfer".
- No "back to Menunggu" button. A mistaken start is closed with "Tolak" and a note; the patient can submit again.
- No patient notification and no new red dot when a transfer starts.
- Staff asset version v499; patient asset version 20261122paket2.

## Out of scope

Automatic transfers (Duitku Disbursement), the cashier preview hold explanation, and the other Tahap 3 deferred minors.
