# Billing System - Visual Flow Diagrams

## Complete 8-Step Workflow

```text
┌─────────────────────────────────────────────────────────────────────┐
│                     BILLING AUTHORIZATION WORKFLOW                  │
└─────────────────────────────────────────────────────────────────────┘

    ┌──────────┐
    │  DOKTER  │
    └────┬─────┘
         │
         │ [1] Konfirmasi Tagihan
         ▼
    ┌────────────────┐
    │ Billing Status │ ──► confirmed
    │   confirmed    │     + timestamp
    └───────┬────────┘     + dokter name
            │
            │ [2] Real-time Broadcast
            ▼
    ┌───────────────────────────────────┐
    │   Notification to All Users       │ ──► "Dokter telah selesai
    │   (except dokter)                 │     memeriksa [Pasien]"
    └───────────────────────────────────┘
            │
            │ [3] Print Buttons Enabled
            ▼
    ┌─────────────┬─────────────┐
    │Print Invoice│Print Etiket │ ──► Only for dokter/kasir/admin
    └──────┬──────┴──────┬──────┘
           │             │
           │ [4]         │ [5]
           ▼             ▼
    ┌──────────┐  ┌──────────┐
    │ A4 PDF   │  │10x15 PDF │ ──► Saved to /database/invoices/
    │ Invoice  │  │ Etiket   │     {mrId}inv.pdf, {mrId}e.pdf
    └──────────┘  └──────────┘
           │             │
           └──────┬──────┘
                  │
                  │ Update printed_at, printed_by
                  ▼
    ┌───────────────────────────────────┐
    │   Billing Tracking Updated        │
    └───────────────────────────────────┘


    ═══════════════ REVISION WORKFLOW ═══════════════

    ┌───────────────┐
    │  NON-DOKTER   │
    │  (Any Staff)  │
    └───────┬───────┘
            │
            │ [6] Ajukan Usulan (Request Revision)
            ▼
    ┌─────────────────────┐
    │ Revision Request    │ ──► message + requester name
    │ Saved to Database   │     status = 'pending'
    └──────────┬──────────┘
               │
               │ [7] Real-time Notification
               ▼
    ┌──────────────────────────────────┐
    │  Dokter Receives Modal Dialog    │ ──► "Usulan revisi dari [Staff]:"
    │  "Setujui usulan ini?"           │     Shows revision message
    └──────────────┬───────────────────┘
                   │
                   │ Dokter clicks "OK"
                   ▼
    ┌───────────────────────────────┐
    │  Revision Approved            │ ──► status = 'approved'
    │  Billing → draft              │     approved_at + approved_by
    │  Print Buttons → disabled     │
    └──────────────┬────────────────┘
                   │
                   │ [8] Dokter makes changes
                   ▼
    ┌───────────────────────────────┐
    │  Dokter Re-confirms Billing   │ ──► Back to Step [1]
    │  (Konfirmasi Tagihan again)   │     Cycle repeats
    └───────────────────────────────┘
```

## Role-Based Access Control

```text
┌────────────────────────────────────────────────────────────────┐
│                      ROLE PERMISSIONS MATRIX                   │
└────────────────────────────────────────────────────────────────┘

    ┌──────────────────┬───────┬────────────┬────────┬───────────┐
    │     ACTION       │DOKTER │ SUPERADMIN │ KASIR  │  OTHERS   │
    ├──────────────────┼───────┼────────────┼────────┼───────────┤
    │ Konfirmasi       │  ✅   │     ✅     │   ❌   │    ❌     │
    │ Tagihan          │       │            │        │           │
    ├──────────────────┼───────┼────────────┼────────┼───────────┤
    │ Print Invoice    │  ✅   │     ✅     │   ✅   │    ❌     │
    │ Print Etiket     │  ✅   │     ✅     │   ✅   │    ❌     │
    ├──────────────────┼───────┼────────────┼────────┼───────────┤
    │ Ajukan Usulan    │  ❌   │     ❌     │   ✅   │    ✅     │
    │ (Revision)       │       │            │        │           │
    ├──────────────────┼───────┼────────────┼────────┼───────────┤
    │ Approve Revision │  ✅   │     ✅     │   ❌   │    ❌     │
    └──────────────────┴───────┴────────────┴────────┴───────────┘

    Legend:
    ✅ = Allowed
    ❌ = Forbidden (403 response)
```

## Database Schema Relationships

```text
┌────────────────────────────────────────────────────────────────┐
│                      DATABASE STRUCTURE                        │
└────────────────────────────────────────────────────────────────┘

    ┌──────────────────────────────┐
    │ sunday_clinic_records        │
    │ ──────────────────────────   │
    │ • mr_id (PK)            ◄────┼─────┐
    │ • patient_id                 │     │
    │ • ...                        │     │ FK
    └──────────────────────────────┘     │
                                         │
    ┌────────────────────────────────────┼────┐
    │ sunday_clinic_billings             │    │
    │ ──────────────────────────         │    │
    │ • id (PK)                          │    │
    │ • mr_id (UNIQUE) ──────────────────┘    │
    │ • patient_id                            │
    │ • subtotal                              │
    │ • total                                 │
    │ • status (draft/confirmed/paid)         │ FK
    │ • confirmed_at                          │
    │ • confirmed_by                          │
    │ • printed_at         ◄──────────────────┼─────┐
    │ • printed_by                            │     │
    │ • billing_data (JSON)                   │     │
    └──────────┬──────────────────────────────┘     │
               │                                     │
               │ FK (billing_id)                     │
               ▼                                     │
    ┌──────────────────────────────┐                │
    │ sunday_clinic_billing_items  │                │
    │ ──────────────────────────   │                │
    │ • id (PK)                    │                │
    │ • billing_id (FK)            │                │
    │ • item_type (enum)           │                │
    │ • item_code                  │                │
    │ • item_name                  │                │
    │ • quantity                   │                │
    │ • price                      │                │
    │ • total                      │                │
    └──────────────────────────────┘                │
                                                    │
    ┌───────────────────────────────────────────────┘
    │
    │ FK (mr_id)
    ▼
    ┌──────────────────────────────────┐
    │ sunday_clinic_billing_revisions  │
    │ ──────────────────────────────   │
    │ • id (PK)                        │
    │ • mr_id (FK)                     │
    │ • message                        │
    │ • requested_by                   │
    │ • status (pending/approved)      │
    │ • approved_at                    │
    │ • approved_by                    │
    └──────────────────────────────────┘
```

## Real-time Notification Flow

```text
┌────────────────────────────────────────────────────────────────┐
│                   NOTIFICATION ARCHITECTURE                    │
└────────────────────────────────────────────────────────────────┘

    Dokter Action (Confirm)
           │
           ▼
    ┌──────────────────┐
    │  Backend Route   │ sunday-clinic.js
    │  POST /confirm   │
    └────────┬─────────┘
             │
             │ realtimeSync.broadcast()
             ▼
    ┌─────────────────────────┐
    │   realtime-sync Module  │ WebSocket Server
    │   (Server-side)         │
    └────────┬────────────────┘
             │
             │ Broadcast to all connected clients
             ▼
    ┌────────────────────────────────────────────┐
    │   All Connected Browser Clients            │
    └───┬────────────────────────────────────┬───┘
        │                                    │
        ▼                                    ▼
    ┌─────────────┐                  ┌─────────────┐
    │ Non-Dokter  │                  │   Dokter    │
    │   Client    │                  │   Client    │
    └──────┬──────┘                  └──────┬──────┘
           │                                │
           │ billing_confirmed              │ (no action)
           ▼                                │
    ┌──────────────────────┐               │
    │ Modal Notification   │               │
    │ "Dokter telah        │               │
    │  selesai memeriksa"  │               │
    └──────────────────────┘               │
                                           │
    Staff Action (Request Revision)        │
           │                               │
           ▼                               │
    ┌──────────────────┐                  │
    │  Backend Route   │                  │
    │ POST /request-   │                  │
    │    revision      │                  │
    └────────┬─────────┘                  │
             │                             │
             │ realtimeSync.broadcast()    │
             ▼                             │
    ┌────────────────────┐                │
    │  realtime-sync     │                │
    └────────┬───────────┘                │
             │                             │
             │ revision_requested          │
             ▼                             ▼
    ┌────────────────────────────────────────┐
    │         Dokter Clients Only            │
    └──────────────────┬─────────────────────┘
                       │
                       ▼
    ┌─────────────────────────────────┐
    │ Confirmation Dialog             │
    │ "Usulan revisi dari [Staff]:"   │
    │ "[Message]"                     │
    │                                 │
    │ [Setujui?] [OK] [Cancel]        │
    └─────────────────────────────────┘
```

## PDF Generation Process

```text
┌────────────────────────────────────────────────────────────────┐
│                    PDF GENERATION WORKFLOW                     │
└────────────────────────────────────────────────────────────────┘

    User clicks "Print Invoice" or "Print Etiket"
           │
           ▼
    ┌──────────────────────────┐
    │  Frontend Event Handler  │ billing.js
    └──────────┬───────────────┘
               │
               │ POST /api/.../print-invoice
               ▼
    ┌──────────────────────────┐
    │  Backend Route Handler   │ sunday-clinic.js
    └──────────┬───────────────┘
               │
               │ 1. Fetch billing data
               │ 2. Fetch patient data
               │ 3. Fetch record data
               ▼
    ┌──────────────────────────┐
    │   PDFGenerator Class     │ pdf-generator.js
    │   generateInvoice() or   │
    │   generateEtiket()       │
    └──────────┬───────────────┘
               │
               │ PDFKit Library
               ▼
    ┌──────────────────────────┐
    │   Create PDF Document    │
    │   • Header               │
    │   • Patient Info         │
    │   • Items Table          │
    │   • Total                │
    │   • Footer               │
    └──────────┬───────────────┘
               │
               │ Save to filesystem
               ▼
    ┌──────────────────────────────────────┐
    │  /database/invoices/{mrId}inv.pdf    │ Invoice (A4)
    │  /database/invoices/{mrId}e.pdf      │ Etiket (10x15cm)
    └──────────┬───────────────────────────┘
               │
               │ Update database
               ▼
    ┌──────────────────────────┐
    │  sunday_clinic_billings  │
    │  • printed_at = NOW()    │
    │  • printed_by = user     │
    └──────────┬───────────────┘
               │
               │ Return download link
               ▼
    ┌──────────────────────────┐
    │   Frontend Downloads     │
    │   PDF to User            │
    └──────────────────────────┘
```

## Installation Process Flowchart

```text
┌────────────────────────────────────────────────────────────────┐
│                    INSTALLATION WORKFLOW                       │
└────────────────────────────────────────────────────────────────┘

    Start: sudo bash install-billing-system.sh
           │
           ▼
    ┌──────────────────────────┐
    │  Check Root Permissions  │
    └──────────┬───────────────┘
               │ [OK]
               ▼
    ┌──────────────────────────┐
    │  Install PDFKit Package  │ npm install pdfkit
    └──────────┬───────────────┘
               │ [Success]
               ▼
    ┌──────────────────────────┐
    │ Create Invoices Dir      │ mkdir -p /database/invoices
    │ Set Permissions          │ chmod 755, chown www-data
    └──────────┬───────────────┘
               │ [Created]
               ▼
    ┌──────────────────────────┐
    │  Run Database Migration  │ Execute add_billing_revisions.sql
    │  • Create revisions table│
    │  • Add printed columns   │
    └──────────┬───────────────┘
               │ [Migrated]
               ▼
    ┌──────────────────────────┐
    │  Restart Backend Server  │ pm2 restart or systemctl restart
    └──────────┬───────────────┘
               │ [Restarted]
               ▼
    ┌──────────────────────────┐
    │  Verify Installation     │
    │  • Check PDFKit          │
    │  • Check directory       │
    │  • Check tables          │
    │  • Check columns         │
    └──────────┬───────────────┘
               │ [All OK]
               ▼
    ┌──────────────────────────┐
    │  Installation Complete!  │ ✅
    │  Ready for Production    │
    └──────────────────────────┘
```

## Security Layers

```text
┌────────────────────────────────────────────────────────────────┐
│                      SECURITY ARCHITECTURE                     │
└────────────────────────────────────────────────────────────────┘

    User Request
           │
           ▼
    ┌──────────────────────────┐
    │  1. JWT Authentication   │ verifyToken middleware
    │     • Valid token?       │
    │     • Not expired?       │
    └──────────┬───────────────┘
               │ [Authenticated]
               ▼
    ┌──────────────────────────┐
    │  2. Role Authorization   │ Role check in backend
    │     • dokter for confirm │
    │     • kasir for print    │
    │     • any for revision   │
    └──────────┬───────────────┘
               │ [Authorized]
               ▼
    ┌──────────────────────────┐
    │  3. Input Validation     │ Sanitize user input
    │     • SQL injection      │
    │     • XSS prevention     │
    │     • Type checking      │
    └──────────┬───────────────┘
               │ [Valid]
               ▼
    ┌──────────────────────────┐
    │  4. Business Logic       │ Process request
    │     • Check status       │
    │     • Update database    │
    │     • Generate PDF       │
    └──────────┬───────────────┘
               │ [Processed]
               ▼
    ┌──────────────────────────┐
    │  5. Audit Trail          │ Log all actions
    │     • confirmed_by       │
    │     • printed_by         │
    │     • approved_by        │
    └──────────┬───────────────┘
               │ [Logged]
               ▼
    ┌──────────────────────────┐
    │  6. Response             │ Return result to user
    └──────────────────────────┘
```

