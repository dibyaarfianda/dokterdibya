# Patient Birth Shell Delegation Wave 5 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Continue patient portal shell modularization by delegating birth-related shell launch and close controls while leaving birth submit, upload processing, attendance, and booking business flows unchanged.

**Architecture:** Keep `public/scripts/patient-menu-shell.js` as the patient home shell boundary for this wave. Use `data-shell-action` for shell-owned birth launch/close orchestration, and keep compatibility globals because untouched legacy code and tests still call them. Bump the portal shell version from `20260624shellwave4` to `20260624shellwave5` everywhere the current wave version appears.

**Tech Stack:** Plain HTML, browser JavaScript IIFE, Jest source-contract tests, service-worker cache versioning.

---

## Scope Boundary

In scope:
- Birth settings launcher buttons generated inside `public/scripts/patient-menu-shell.js`.
- Birth photo modal close/overlay controls in `public/patient-menu.html`.
- Birth date wheel close/cancel controls in `public/patient-menu.html`.
- Delegated handler map additions in `public/scripts/patient-menu-shell.js`.
- Patient shell version bump to `20260624shellwave5`.

Out of scope:
- Birth data submit buttons: `submitBirthData`, `submitBirthExtra`, `submitBirthTestimonial`.
- Birth date wheel option selection and apply action: `selectBirthDateWheelValue`, `applyBirthDateWheelPicker`.
- Booking cancellation submit flow.
- Attendance confirmation popup.
- Crop/editor upload internals.
- UI redesign, copy changes, backend API, DB schema, auth behavior.

## Files

- Modify: `staff/backend/tests/unit/StaffPatientShellWave1.test.js`
- Modify: `public/patient-menu.html`
- Modify: `public/scripts/patient-menu-shell.js`
- Modify: `public/sw.js`
- Modify: `public/sisiwanita-sw.js`
- Modify: `public/patient-portal.webmanifest`
- Modify: all patient tool pages that currently reference `20260624shellwave4` asset URLs under `public/*.html`
- Modify: `public/scripts/patient-tool-retrofit.js`

## Task 1: Add Source-Contract Coverage For Birth Shell Delegation

- [ ] **Step 1: Add the failing test**

Modify `staff/backend/tests/unit/StaffPatientShellWave1.test.js` by appending this test inside the existing `describe('staff and patient shell wave 1 contracts', ...)` block:

```javascript
    test('patient birth shell launch and close controls use delegated actions', () => {
        const patientMenu = readNormalizedFile('public', 'patient-menu.html');
        const shell = readNormalizedFile('public', 'scripts', 'patient-menu-shell.js');

        expect(shell).toContain('data-shell-action="open-birth-data-modal"');
        expect(shell).toContain('data-shell-action="toggle-birth-congrats"');
        expect(shell).toContain('data-shell-action="birth-photo-picker"');
        expect(shell).toContain('data-shell-action="open-birth-testimonial-modal"');
        expect(shell).toContain("'open-birth-data-modal': function(target, event)");
        expect(shell).toContain("'toggle-birth-congrats': function(target, event)");
        expect(shell).toContain("'birth-photo-picker': function(target, event)");
        expect(shell).toContain("'open-birth-testimonial-modal': function(target, event)");

        expect(patientMenu).toContain('id="birth-photo-modal" data-shell-action="close-birth-photo-modal"');
        expect(patientMenu).toContain('data-shell-action="close-birth-photo-modal" aria-label="Tutup foto kelahiran"');
        expect(patientMenu).toContain('id="birth-date-wheel-modal" data-shell-action="close-birth-date-wheel"');
        expect(patientMenu).toContain('data-shell-action="close-birth-date-wheel" aria-label="Tutup"');
        expect(patientMenu).toContain('data-shell-action="close-birth-date-wheel">Batal</button>');
        expect(shell).toContain("'close-birth-photo-modal': function(target, event)");
        expect(shell).toContain("'close-birth-date-wheel': function(target, event)");

        expect(shell).not.toContain('onclick="openBirthDataModal(event, this.dataset.birthId)"');
        expect(shell).not.toContain('onclick="toggleBirthCongratsFromSettings(this.dataset.birthId,');
        expect(shell).not.toContain('onclick="openBirthPhotoPicker(event, this.dataset.birthId)"');
        expect(shell).not.toContain('onclick="openBirthTestimonialModal(event, this.dataset.birthId)"');
        expect(patientMenu).not.toContain('id="birth-photo-modal" onclick="closeBirthPhotoModal(event)"');
        expect(patientMenu).not.toContain('class="birth-photo-modal-close soundable" onclick="closeBirthPhotoModal(event)"');
        expect(patientMenu).not.toContain('id="birth-date-wheel-modal" onclick="closeBirthDateWheelPicker(event)"');
        expect(patientMenu).not.toContain('class="birth-date-wheel-close soundable" onclick="closeBirthDateWheelPicker(event)"');
    });
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
npm test -- --runTestsByPath tests/unit/StaffPatientShellWave1.test.js --coverage=false
```

Expected: FAIL on missing delegated birth actions because current baseline still has inline `onclick` for these launch/close controls.

## Task 2: Delegate Generated Birth Settings Launch Buttons

- [ ] **Step 1: Replace generated birth settings launch buttons**

Modify `public/scripts/patient-menu-shell.js` in the `birthCongratsSettingsRecords.forEach` action rendering block.

Replace:

```javascript
actions.push('<button type="button" class="settings-birth-action soundable" data-birth-id="' + id + '" onclick="openBirthDataModal(event, this.dataset.birthId)">Lengkapi data kelahiran</button>');
```

with:

```javascript
actions.push('<button type="button" class="settings-birth-action soundable" data-shell-action="open-birth-data-modal" data-birth-id="' + id + '">Lengkapi data kelahiran</button>');
```

Replace:

```javascript
actions.push('<button type="button" class="settings-birth-action soundable ' + (dismissed ? '' : 'secondary') + '" data-birth-id="' + id + '" onclick="toggleBirthCongratsFromSettings(this.dataset.birthId, ' + (dismissed ? 'true' : 'false') + ', event)">' + (dismissed ? 'Tampilkan lagi' : 'Sembunyikan') + '</button>');
```

with:

```javascript
actions.push('<button type="button" class="settings-birth-action soundable ' + (dismissed ? '' : 'secondary') + '" data-shell-action="toggle-birth-congrats" data-birth-id="' + id + '" data-birth-dismissed="' + (dismissed ? 'true' : 'false') + '">' + (dismissed ? 'Tampilkan lagi' : 'Sembunyikan') + '</button>');
```

Replace:

```javascript
actions.push('<button type="button" class="settings-birth-action soundable secondary" data-birth-id="' + id + '" onclick="openBirthPhotoPicker(event, this.dataset.birthId)">Upload foto bayi</button>');
```

with:

```javascript
actions.push('<button type="button" class="settings-birth-action soundable secondary" data-shell-action="birth-photo-picker" data-birth-id="' + id + '">Upload foto bayi</button>');
```

Replace:

```javascript
actions.push('<button type="button" class="settings-birth-action soundable secondary" data-birth-id="' + id + '" onclick="openBirthTestimonialModal(event, this.dataset.birthId)">Kirim testimoni</button>');
```

with:

```javascript
actions.push('<button type="button" class="settings-birth-action soundable secondary" data-shell-action="open-birth-testimonial-modal" data-birth-id="' + id + '">Kirim testimoni</button>');
```

- [ ] **Step 2: Add delegated handlers to `modalActionHandlers`**

In `public/scripts/patient-menu-shell.js`, extend `modalActionHandlers` near existing modal-only actions:

```javascript
            'open-birth-data-modal': function(target, event) {
                openBirthDataModal(event, target.dataset.birthId);
            },
            'toggle-birth-congrats': function(target, event) {
                toggleBirthCongratsFromSettings(target.dataset.birthId, target.dataset.birthDismissed === 'true', event);
            },
            'birth-photo-picker': function(target, event) {
                openBirthPhotoPicker(event, target.dataset.birthId);
            },
            'open-birth-testimonial-modal': function(target, event) {
                openBirthTestimonialModal(event, target.dataset.birthId);
            },
```

- [ ] **Step 3: Run focused test**

Run:

```powershell
npm test -- --runTestsByPath tests/unit/StaffPatientShellWave1.test.js --coverage=false
```

Expected: still FAIL until static birth modal close controls are delegated in Task 3.

## Task 3: Delegate Static Birth Modal Close Controls

- [ ] **Step 1: Replace birth photo modal close controls**

Modify `public/patient-menu.html`.

Replace:

```html
<div class="birth-photo-modal" id="birth-photo-modal" onclick="closeBirthPhotoModal(event)" aria-hidden="true">
    <button type="button" class="birth-photo-modal-close soundable" onclick="closeBirthPhotoModal(event)" aria-label="Tutup foto kelahiran">&times;</button>
    <img id="birth-photo-modal-img" src="" alt="Foto kelahiran" onclick="event.stopPropagation()">
</div>
```

with:

```html
<div class="birth-photo-modal" id="birth-photo-modal" data-shell-action="close-birth-photo-modal" aria-hidden="true">
    <button type="button" class="birth-photo-modal-close soundable" data-shell-action="close-birth-photo-modal" aria-label="Tutup foto kelahiran">&times;</button>
    <img id="birth-photo-modal-img" src="" alt="Foto kelahiran" data-shell-stop-propagation="true">
</div>
```

- [ ] **Step 2: Replace birth date wheel close controls**

Modify `public/patient-menu.html`.

Replace:

```html
<div class="birth-date-wheel-modal" id="birth-date-wheel-modal" onclick="closeBirthDateWheelPicker(event)" aria-hidden="true">
    <section class="birth-date-wheel-card" role="dialog" aria-modal="true" aria-labelledby="birth-date-wheel-title" onclick="event.stopPropagation()">
```

with:

```html
<div class="birth-date-wheel-modal" id="birth-date-wheel-modal" data-shell-action="close-birth-date-wheel" aria-hidden="true">
    <section class="birth-date-wheel-card" role="dialog" aria-modal="true" aria-labelledby="birth-date-wheel-title" data-shell-stop-propagation="true">
```

Replace:

```html
<button type="button" class="birth-date-wheel-close soundable" onclick="closeBirthDateWheelPicker(event)" aria-label="Tutup"><i class="fa-solid fa-xmark"></i></button>
```

with:

```html
<button type="button" class="birth-date-wheel-close soundable" data-shell-action="close-birth-date-wheel" aria-label="Tutup"><i class="fa-solid fa-xmark"></i></button>
```

Replace:

```html
<button type="button" class="ghost-action soundable" onclick="closeBirthDateWheelPicker(event)">Batal</button>
```

with:

```html
<button type="button" class="ghost-action soundable" data-shell-action="close-birth-date-wheel">Batal</button>
```

- [ ] **Step 3: Add shell stop propagation support**

Modify the document click handler for `shellActionHandlers` in `public/scripts/patient-menu-shell.js`.

Before:

```javascript
        document.addEventListener('click', function(event) {
            const trigger = event.target.closest('[data-shell-action]');
            if (!trigger) return;
```

After:

```javascript
        document.addEventListener('click', function(event) {
            if (event.target.closest('[data-shell-stop-propagation]')) {
                event.stopPropagation();
                return;
            }
            const trigger = event.target.closest('[data-shell-action]');
            if (!trigger) return;
```

- [ ] **Step 4: Add delegated handlers to `shellActionHandlers`**

In `public/scripts/patient-menu-shell.js`, extend `shellActionHandlers` near other birth/home shell actions:

```javascript
            'close-birth-photo-modal': function(target, event) {
                closeBirthPhotoModal(event);
            },
            'close-birth-date-wheel': function(target, event) {
                closeBirthDateWheelPicker(event);
            },
```

- [ ] **Step 5: Run focused test**

Run:

```powershell
npm test -- --runTestsByPath tests/unit/StaffPatientShellWave1.test.js --coverage=false
```

Expected: PASS.

## Task 4: Bump Patient Shell Version To Wave 5

- [ ] **Step 1: Replace version string**

Replace every `20260624shellwave4` under `public/` with `20260624shellwave5`.

PowerShell-safe command:

```powershell
$files = rg -l "20260624shellwave4" public
foreach ($file in $files) {
    $text = Get-Content -LiteralPath $file -Raw
    $text = $text -replace '20260624shellwave4', '20260624shellwave5'
    Set-Content -LiteralPath $file -Value $text -NoNewline
}
```

- [ ] **Step 2: Verify no old version remains**

Run:

```powershell
rg "20260624shellwave4" public
```

Expected: no matches and exit code `1`.

## Task 5: Full Local Verification

- [ ] **Step 1: Run focused Jest contracts**

Run:

```powershell
npm test -- --runTestsByPath tests/unit/StaffPatientShellWave1.test.js tests/unit/PatientMenuShellRefactorPhase1.test.js --coverage=false
```

Expected: all tests pass.

- [ ] **Step 2: Run syntax checks**

Run:

```powershell
node --check public/scripts/patient-menu-shell.js
node --check public/scripts/patient-tool-retrofit.js
```

Expected: both commands exit `0`.

- [ ] **Step 3: Run shell audit**

Run:

```powershell
node scripts/audit-shell-uniformity.js
```

Expected: `Shell uniformity audit passed. No findings.`

- [ ] **Step 4: Run diff whitespace check**

Run:

```powershell
git diff --check
```

Expected: no whitespace errors. CRLF warnings are acceptable if they match existing local Git behavior.

- [ ] **Step 5: Inspect remaining inline handlers**

Run:

```powershell
rg "onclick=" public/patient-menu.html public/scripts/patient-menu-shell.js -n
```

Expected: remaining matches are business/page logic only: birth submit/apply/select, booking cancel submit, attendance confirmation, crop/photo internals, and other explicitly out-of-scope feature handlers.

## Task 6: Commit, Push, Deploy, And Verify Live

- [ ] **Step 1: Stage only related files**

Run:

```powershell
git add public staff/backend/tests/unit/StaffPatientShellWave1.test.js
git status --short --branch
```

Expected: only patient shell/version/test changes staged; `.codex-remote-attachments/` remains untracked and unstaged.

- [ ] **Step 2: Commit without co-author**

Run:

```powershell
git commit -m "Delegate patient birth shell controls"
```

- [ ] **Step 3: Push main**

Run:

```powershell
git push origin main
```

- [ ] **Step 4: Deploy with VPS safe path**

Use the Windows SSH VPS deploy procedure:

```powershell
@'
set -euo pipefail
cd /var/www/dokterdibya
printf 'BRANCH=%s\n' "$(git branch --show-current)"
printf 'HEAD=%s\n' "$(git rev-parse --short HEAD)"
printf 'TRACKED_DIRTY_COUNT=%s\n' "$(git status --porcelain --untracked-files=no | wc -l)"
git status --short --branch
'@ | ssh root@72.60.78.188 "tr -d '\015' | bash -s"
```

If `TRACKED_DIRTY_COUNT=0`, continue:

```powershell
@'
set -euo pipefail
cd /var/www/dokterdibya
backup_branch="backup/pre-patient-shellwave5-$(date +%Y%m%d-%H%M%S)"
git branch "$backup_branch"
printf 'BACKUP_BRANCH=%s\n' "$backup_branch"
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  printf 'ABORT_TRACKED_DIRTY\n'
  git status --short --branch
  exit 2
fi
git fetch origin main
git pull --ff-only origin main
if [ -x ./fix-permissions.sh ]; then ./fix-permissions.sh; fi
printf 'HEAD=%s\n' "$(git rev-parse --short HEAD)"
git status --short --branch
'@ | ssh root@72.60.78.188 "tr -d '\015' | bash -s"
```

- [ ] **Step 5: Verify live assets through nginx**

Run:

```powershell
@'
set -euo pipefail
printf 'PATIENT_MENU_VERSION:\n'
curl -ksS -H 'Host: sisiwanita.id' https://127.0.0.1/patient-menu.html | grep -E "PATIENT_SHELL_VERSION|patient-menu-shell\.js\?v=|patient-portal\.webmanifest\?v=|PATIENT_SERVICE_WORKER_URL"
printf '\nPATIENT_BIRTH_ACTIONS:\n'
curl -ksS -H 'Host: sisiwanita.id' https://127.0.0.1/scripts/patient-menu-shell.js?v=20260624shellwave5 | grep -E "open-birth-data-modal|toggle-birth-congrats|birth-photo-picker|open-birth-testimonial-modal|close-birth-photo-modal|close-birth-date-wheel"
printf '\nPATIENT_SW_VERSION:\n'
curl -ksS -H 'Host: sisiwanita.id' https://127.0.0.1/sw.js?v=20260624shellwave5 | grep "CACHE_VERSION"
printf '\nSISIWANITA_SW_VERSION:\n'
curl -ksS -H 'Host: sisiwanita.id' https://127.0.0.1/sisiwanita-sw.js?v=20260624shellwave5 | grep "CACHE_VERSION"
printf '\nMANIFEST_VERSION:\n'
curl -ksS -H 'Host: sisiwanita.id' https://127.0.0.1/patient-portal.webmanifest?v=20260624shellwave5 | grep "start_url"
printf '\nHEALTH:\n'
curl -ksS -H 'Host: dokterdibya.com' https://127.0.0.1/api/health
'@ | ssh root@72.60.78.188 "tr -d '\015' | bash -s"
```

Expected:
- `PATIENT_SHELL_VERSION = '20260624shellwave5'`
- `patient-menu-shell.js?v=20260624shellwave5`
- delegated birth action strings are present in live shell JS
- both service workers and manifest use `20260624shellwave5`
- `/api/health` returns healthy JSON

## Self-Review

- Spec coverage: This plan covers the next narrow patient shell refactor slice and avoids business-submit behavior.
- Placeholder scan: No placeholders are intentionally left.
- Type consistency: All planned action names map to existing function names in `public/scripts/patient-menu-shell.js` and use existing `data-birth-id` data.
