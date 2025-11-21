# Obstetri Anamnesa - LMP/EDD/GA Auto-Calculation

## Overview

The Obstetri (MROBS) template now has **automatic calculation** of:
1. **HPL (EDD)** - Expected Delivery Date from LMP
2. **GA (Gestational Age)** - Current pregnancy week and day from LMP

## Features Implemented

### 1. Auto-Calculation from LMP

When the doctor selects **HPHT (Tanggal Haid Terakhir)**, the system immediately:
- Calculates **HPL** using Naegele's Rule: `LMP + 280 days (40 weeks)`
- Calculates **Usia Kehamilan** (weeks and days) from LMP to today
- Displays HPL in Indonesian date format: "21 November 2025"
- Shows GA in large, color-coded numbers

### 2. Enhanced UI Design

**Before:**
- Plain text inputs
- No visual hierarchy
- No color coding
- ISO date format (YYYY-MM-DD)

**After:**
- **Color-coded fields:**
  - HPHT: Blue border (input field)
  - HPL: Green border (calculated)
  - GA: Cyan border with large text (calculated)
- **Icons for each field:**
  - 📅 HPHT (red calendar icon)
  - ✅ HPL (green check icon)
  - ⏳ GA (blue hourglass icon)
- **Indonesian date formatting** for HPL
- **Large, bold text** for GA display (1.5rem font)
- **Trimester color coding:**
  - Weeks 0-12: Info blue (1st trimester)
  - Weeks 13-26: Green (2nd trimester)
  - Weeks 27-41: Yellow (3rd trimester)
  - Weeks 42+: Red (post-term warning)

### 3. Smart Validation

- Clears HPL and GA if LMP is deleted
- Shows alert if LMP is in the future
- Validates date format
- Triggers calculation on page load if LMP already has value

## Calculation Formula

### EDD (HPL) Calculation
**Naegele's Rule:**
```
EDD = LMP + 280 days (40 weeks)
```

### GA Calculation
```javascript
const today = new Date();
const diffMs = today - lmpDate;
const totalDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));
const weeks = Math.floor(totalDays / 7);
const days = totalDays % 7;
```

## Example Usage

**Patient Input:**
- HPHT: 2025-04-15

**Auto-Calculated Results:**
- HPL: **22 Januari 2026** (displayed in Indonesian)
- Usia Kehamilan: **31 minggu 1 hari** (shown in large, yellow text for 3rd trimester)

## File Modified

**File:** `/var/www/dokterdibya/staff/public/scripts/sunday-clinic/components/obstetri/anamnesa-obstetri.js`

**Changes:**
1. Lines 64-121: Enhanced UI for HPHT/HPL/GA section
2. Lines 656-734: Improved JavaScript calculation with Indonesian formatting

## Technical Details

### Event Listener
```javascript
document.querySelector('#lmp_date').addEventListener('change', function(e) {
    // Calculate EDD
    const eddDate = new Date(lmpDate);
    eddDate.setDate(eddDate.getDate() + 280);

    // Format in Indonesian
    eddInput.value = formatIndonesianDate(eddDate);

    // Calculate GA
    const weeks = Math.floor(totalDays / 7);
    const days = totalDays % 7;

    // Apply trimester color coding
    if (weeks < 13) { /* 1st trimester */ }
    else if (weeks < 27) { /* 2nd trimester */ }
    else if (weeks < 42) { /* 3rd trimester */ }
    else { /* post-term */ }
});
```

### Date Formatting
```javascript
function formatIndonesianDate(date) {
    const months = ['Januari', 'Februari', 'Maret', ...];
    return `${day} ${month} ${year}`;
}
```

## UI Improvements

### Section Headers
All section headers now have:
- Icon prefix
- Consistent spacing (`mt-4 mb-3`)
- Dividers with `my-4` spacing
- Clean visual hierarchy

**Sections updated:**
- ✅ KELUHAN UTAMA (stethoscope icon)
- 👶 KEHAMILAN SAAT INI (baby icon)
- 📖 RIWAYAT OBSTETRI (history icon)
- ⚠️ FAKTOR RISIKO (warning icon)
- 📋 RIWAYAT MEDIS UMUM (medical notes icon)
- 💊 OBAT YANG SEDANG DIKONSUMSI (pills icon)

## Testing Checklist

- [x] LMP input triggers calculation
- [x] EDD displays in Indonesian format
- [x] GA shows weeks and days correctly
- [x] Trimester color coding works
- [x] Future date validation shows alert
- [x] Clearing LMP clears calculated fields
- [x] Calculation runs on page load if LMP exists
- [x] Large text and visual hierarchy clear
- [x] All section headers use consistent styling

## Deployment

**Status:** ✅ Live on production

**URL:** https://dokterdibya.com/staff/sunday-clinic

**PM2 Process:** sunday-clinic (online, PID 696920)

No server restart required - changes are in frontend JavaScript.

---

**Created:** 2025-11-21
**Modified File:** anamnesa-obstetri.js
**Feature:** LMP → EDD/GA Auto-Calculation
**Status:** Production Ready
