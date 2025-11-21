# Patient Intake - Pregnancy History Section Redesign

## Date: 2025-11-21

## Overview

Completely redesigned the "Riwayat Kehamilan" (Pregnancy History) section with:
1. **Simplified title** - Changed from "Riwayat Kehamilan Sebelumnya" to "Riwayat Kehamilan"
2. **New dropdown** - "Ini kehamilan ke berapa?" (1-9 options)
3. **Dynamic table** - Shows only relevant previous pregnancy rows based on selection
4. **Clearer columns** - Normal/SC, Lahir dimana, Usia anak
5. **"Hamil ini" row** - Always visible at bottom to represent current pregnancy

## Changes Made

### 1. Section Title

**Before:**
```html
<h2 class="step-title">Riwayat Kehamilan Sebelumnya</h2>
```

**After:**
```html
<h2 class="step-title">Riwayat Kehamilan</h2>
```

**Reason:** "Riwayat Kehamilan" is more inclusive - covers both previous AND current pregnancy

### 2. New Required Field: Pregnancy Number

Added dropdown before the table:

```html
<div class="field" style="margin-bottom: 1.5rem;">
    <label for="pregnancy_number">Ini kehamilan ke berapa? *</label>
    <select id="pregnancy_number" name="pregnancy_number" required>
        <option value="">Pilih</option>
        <option value="1">1 (Kehamilan Pertama)</option>
        <option value="2">2</option>
        <option value="3">3</option>
        <option value="4">4</option>
        <option value="5">5</option>
        <option value="6">6</option>
        <option value="7">7</option>
        <option value="8">8</option>
        <option value="9">9</option>
    </select>
</div>
```

**Purpose:**
- Determines how many previous pregnancy rows to show
- Required field (marked with *)
- Clear labeling for first-time mothers

### 3. Updated Table Columns

**Old Columns:**
- No
- Tahun (Year)
- Mode Persalinan (Delivery mode)
- Komplikasi (Complications)
- Berat Bayi (gr) (Baby weight in grams)
- Anak Hidup (Child alive)

**New Columns:**
- Anak (Child number)
- Lahir Normal/SC (Delivery type)
- Lahir dimana (Where delivered)
- Usia anak (Child's current age)

**Changes:**
- ✅ Removed: Year, Complications, Baby weight, Alive status
- ✅ Added: Delivery location, Child's current age
- ✅ Simplified: Delivery type (Normal/SC/Vakum/Forcep)

**Rationale:**
- **Simpler for patients** - Less medical terminology
- **More practical** - Location and child age are easier to remember than exact year and weight
- **Better UX** - Dropdown selects instead of free text where possible

### 4. New Column Details

#### Column 1: Anak (Child Number)
- Static text: 1, 2, 3, etc.
- Not editable
- Clear numbering

#### Column 2: Lahir Normal/SC
**Dropdown options:**
```html
<select name="preg_delivery_1">
    <option value="">Pilih</option>
    <option value="normal">Normal</option>
    <option value="sc">SC</option>
    <option value="vakum">Vakum</option>
    <option value="forcep">Forcep</option>
</select>
```

**Values:**
- `normal` - Vaginal delivery
- `sc` - Cesarean section
- `vakum` - Vacuum-assisted delivery
- `forcep` - Forceps-assisted delivery

#### Column 3: Lahir dimana
**Dropdown options:**
```html
<select name="preg_location_1">
    <option value="">Pilih</option>
    <option value="bidan">Bidan</option>
    <option value="dokter">Dokter</option>
    <option value="rs">Rumah Sakit</option>
    <option value="rumah">Rumah</option>
</select>
```

**Values:**
- `bidan` - Midwife/birthing center
- `dokter` - Doctor's clinic
- `rs` - Hospital
- `rumah` - Home birth

#### Column 4: Usia anak
**Free text input:**
```html
<input type="text" name="preg_child_age_1" placeholder="Contoh: 3 bulan">
```

**Examples:**
- "3 bulan" (3 months)
- "4 tahun" (4 years)
- "1.5 tahun" (1.5 years)
- "6 bulan" (6 months)

**Format:** Free text to accommodate various age descriptions

### 5. Dynamic Row Visibility

**Logic:**
- **Pregnancy #1**: No previous rows shown (first-time mother)
- **Pregnancy #2**: Show row 1 (1 previous child)
- **Pregnancy #3**: Show rows 1-2 (2 previous children)
- **Pregnancy #4**: Show rows 1-3 (3 previous children)
- **Pregnancy #5**: Show rows 1-4 (4 previous children)
- **Pregnancy #6**: Show rows 1-5 (5 previous children)
- **Pregnancy #7**: Show rows 1-6 (6 previous children)
- **Pregnancy #8**: Show rows 1-7 (7 previous children)
- **Pregnancy #9**: Show rows 1-8 (8 previous children)

**JavaScript Implementation:**
```javascript
pregnancyNumberSelect.addEventListener('change', function() {
    const selectedNumber = parseInt(this.value);

    // Hide all rows first
    for (let i = 1; i <= 8; i++) {
        document.getElementById(`pregnancy-row-${i}`).style.display = 'none';
    }

    // Show rows for previous pregnancies
    if (selectedNumber > 1 && selectedNumber <= 9) {
        const numberOfPreviousPregnancies = selectedNumber - 1;
        for (let i = 1; i <= numberOfPreviousPregnancies; i++) {
            document.getElementById(`pregnancy-row-${i}`).style.display = 'table-row';
        }
    }
});
```

### 6. "Hamil ini" Row (Current Pregnancy)

**Always visible row at bottom:**
```html
<tr style="background-color: #e3f2fd;">
    <td style="font-weight: bold;">Hamil ini</td>
    <td colspan="3" style="text-align: center; font-style: italic; color: #666;">
        Kehamilan saat ini
    </td>
</tr>
```

**Purpose:**
- Visual reminder that this is about current pregnancy
- Separates previous pregnancies from current one
- Helps patients understand the table context

**Styling:**
- Light blue background (#e3f2fd)
- Bold "Hamil ini" text
- Italic "Kehamilan saat ini" message
- Spans all 4 columns

### 7. Table Styling

Enhanced table appearance with:
```css
style="width: 100%; border-collapse: collapse;"
```

**Header styling:**
- Background: #f8f9fa (light gray)
- Padding: 0.75rem
- Border: 1px solid #dee2e6

**Cell styling:**
- Padding: 0.5rem
- Border: 1px solid #dee2e6
- Full-width selects and inputs

**Responsive:**
- Table scrolls horizontally on mobile
- Inputs and selects fill cell width
- Clean borders and spacing

## User Experience Flow

### Scenario 1: First-Time Mother (Kehamilan #1)

1. Patient selects "1 (Kehamilan Pertama)" from dropdown
2. **No previous pregnancy rows appear**
3. Only sees "Hamil ini" row (current pregnancy)
4. Clean, simple form for first-time mothers

### Scenario 2: Second Pregnancy (Kehamilan #2)

1. Patient selects "2" from dropdown
2. **Row 1 appears** for first child
3. Patient fills:
   - Lahir Normal/SC: Normal
   - Lahir dimana: Bidan
   - Usia anak: 3 tahun
4. "Hamil ini" row shows current pregnancy

### Scenario 3: Fourth Pregnancy (Kehamilan #4)

1. Patient selects "4" from dropdown
2. **Rows 1, 2, 3 appear** for three previous children
3. Patient fills details for each:
   - Child 1: SC, Rumah Sakit, 6 tahun
   - Child 2: Normal, Dokter, 4 tahun
   - Child 3: Normal, Bidan, 2 tahun
4. "Hamil ini" row represents current (4th) pregnancy

## Example Data Structure

### Patient with 3 Previous Pregnancies

**Form Submission Payload:**
```json
{
  "pregnancy_number": "4",
  "preg_delivery_1": "sc",
  "preg_location_1": "rs",
  "preg_child_age_1": "6 tahun",
  "preg_delivery_2": "normal",
  "preg_location_2": "dokter",
  "preg_child_age_2": "4 tahun",
  "preg_delivery_3": "normal",
  "preg_location_3": "bidan",
  "preg_child_age_3": "2 tahun"
}
```

### First-Time Mother

**Form Submission Payload:**
```json
{
  "pregnancy_number": "1"
  // No previous pregnancy fields
}
```

## Benefits

### For Patients

✅ **Clearer questions** - "Ini kehamilan ke berapa?" is direct and simple
✅ **Less confusion** - Only see fields relevant to their pregnancy number
✅ **Easier to fill** - Dropdown selects instead of free text
✅ **Better memory cues** - Child's age easier to remember than birth year
✅ **Visual clarity** - "Hamil ini" row clearly marks current pregnancy

### For Medical Staff

✅ **Quick overview** - Pregnancy number immediately visible
✅ **Delivery history** - Normal vs SC pattern clear
✅ **Birth location** - Home vs hospital deliveries tracked
✅ **Child age context** - Helps assess spacing between pregnancies
✅ **Data quality** - Dropdown values ensure consistency

### For System

✅ **Dynamic form** - Reduces unnecessary fields
✅ **Better validation** - Required pregnancy number field
✅ **Cleaner data** - Structured dropdown values
✅ **Easier analysis** - Consistent delivery type coding

## Data Mapping

### Old Field Names → New Field Names

| Old Field | New Field | Type | Notes |
|-----------|-----------|------|-------|
| - | `pregnancy_number` | Dropdown | NEW - Required |
| `preg_year_1` | ❌ Removed | - | Year not captured |
| `preg_mode_1` | `preg_delivery_1` | Dropdown | Normal/SC/Vakum/Forcep |
| `preg_complication_1` | ❌ Removed | - | Complications not captured |
| `preg_weight_1` | ❌ Removed | - | Baby weight not captured |
| `preg_alive_1` | ❌ Removed | - | Child alive status not captured |
| - | `preg_location_1` | Dropdown | NEW - Bidan/Dokter/RS/Rumah |
| - | `preg_child_age_1` | Text | NEW - Free text age |

### Why Remove Fields?

**Year (preg_year):**
- Child's current age is more practical
- Age provides better spacing assessment
- Easier for patients to remember

**Complications (preg_complication):**
- Too complex for patient intake form
- Should be discussed in consultation
- Better captured by staff during anamnesa

**Baby Weight (preg_weight):**
- Difficult for patients to remember exact weight
- Not critical for initial screening
- Can be discussed during consultation if relevant

**Child Alive (preg_alive):**
- Sensitive question for intake form
- Can be inferred from child age
- Better discussed privately with doctor

## Testing Scenarios

### Test 1: First-Time Mother
- [x] Select "1 (Kehamilan Pertama)"
- [x] No previous rows appear
- [x] "Hamil ini" row visible
- [x] Form submission successful

### Test 2: Second Pregnancy
- [x] Select "2"
- [x] Row 1 appears
- [x] Fill delivery type, location, age
- [x] "Hamil ini" row visible
- [x] Data saves correctly

### Test 3: Fifth Pregnancy
- [x] Select "5"
- [x] Rows 1-4 appear
- [x] Fill all four previous pregnancies
- [x] "Hamil ini" row visible
- [x] All data submits properly

### Test 4: Change Selection
- [x] Select "4" (shows 3 rows)
- [x] Change to "2" (shows 1 row, hides rows 2-3)
- [x] Change back to "4" (shows 3 rows again)
- [x] Row visibility updates correctly

### Test 5: Dropdown Values
- [x] All delivery type options selectable
- [x] All location options selectable
- [x] Age text input accepts various formats
- [x] Form validates required fields

## Files Modified

### 1. `/var/www/dokterdibya/public/patient-intake.html`

**Lines 882-1108** - Complete section replacement

**Changes:**
- Updated section title
- Added pregnancy number dropdown
- New table structure with 4 columns
- 8 hidden rows (pregnancy-row-1 through pregnancy-row-8)
- "Hamil ini" row always visible
- Enhanced table styling

### 2. `/var/www/dokterdibya/public/scripts/patient-intake.js`

**Lines 1444-1477** - New JavaScript for dynamic rows

**Changes:**
- Event listener for pregnancy_number select
- Show/hide logic for table rows
- Auto-trigger on page load if value exists

## Backward Compatibility

**Existing Submissions:**
- Old format with `preg_year_1`, `preg_complication_1`, etc. remains valid in database
- New submissions use `pregnancy_number`, `preg_delivery_1`, `preg_location_1`, `preg_child_age_1`

**No Database Migration Required:**
- All fields stored in JSON payload
- Variable field names handled by system

## Visual Example

### Form Display (Pregnancy #3)

```
┌────────────────────────────────────────────────────────────────────┐
│ Riwayat Kehamilan                                                  │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│ Ini kehamilan ke berapa? *                                         │
│ [Dropdown: 3 ▼]                                                    │
│                                                                    │
├─────┬────────────────┬─────────────────┬───────────────────────────┤
│Anak │Lahir Normal/SC │Lahir dimana     │Usia anak                 │
├─────┼────────────────┼─────────────────┼───────────────────────────┤
│  1  │[SC ▼]          │[Rumah Sakit ▼]  │[6 tahun _______________] │
│  2  │[Normal ▼]      │[Dokter ▼]       │[3 tahun _______________] │
├─────┴────────────────┴─────────────────┴───────────────────────────┤
│ Hamil ini          │ Kehamilan saat ini                           │
└────────────────────────────────────────────────────────────────────┘
```

## Deployment

**Status:** ✅ Live on production

**URL:** https://dokterdibya.com/patient-intake.html

**No Server Restart Required:** Frontend-only changes

**Cache Clearing:** Users may need hard refresh (Ctrl+F5)

---

**Created:** 2025-11-21
**Author:** Claude Code Assistant
**Type:** Major Form Redesign
**Impact:** High (improves UX significantly for pregnancy history)
