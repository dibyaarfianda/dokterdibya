const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '../../../..');
const patientMenu = fs.readFileSync(path.join(repoRoot, 'public', 'patient-menu.html'), 'utf8');
const patientRoutes = fs.readFileSync(path.join(repoRoot, 'staff', 'backend', 'routes', 'patients.js'), 'utf8');

describe('Birth congratulations portal layout', () => {
    test('home congratulations card remains compact without clipping actions', () => {
        expect(patientMenu).toContain('.birth-congrats-home');
        expect(patientMenu).toMatch(/\.birth-congrats-home\s*\{[\s\S]*max-width:\s*390px/);
        expect(patientMenu).toContain('min-height: min(calc(100vw - 28px), 390px)');
        expect(patientMenu).toContain('grid-template-columns: var(--birth-photo-size) minmax(0, 1fr)');
        expect(patientMenu).not.toContain('.birth-congrats-body { grid-template-columns: 1fr; }');
        expect(patientMenu).not.toContain('.birth-congrats-photo-wrap { width: 100%; height: 150px; }');
    });

    test('home congratulations card keeps patient actions visible below long doctor messages', () => {
        expect(patientMenu).toMatch(/\.birth-congrats-home\s*\{[\s\S]*height:\s*auto/);
        expect(patientMenu).not.toMatch(/^\s+height:\s*min\(calc\(100vw - 28px\), 390px\);/m);
        expect(patientMenu).not.toMatch(/^\s+height:\s*min\(calc\(100vw - 28px\), 360px\);/m);
        expect(patientMenu).toMatch(/\.birth-congrats-body\s*\{[\s\S]*overflow:\s*visible/);
        expect(patientMenu).toMatch(/<div class="birth-congrats-body">[\s\S]*<\/div>\s*<div class="birth-congrats-card-actions">/);
    });

    test('new patient portal carries over legacy birth congratulations interactions', () => {
        expect(patientMenu).toContain('openBirthPhotoModal');
        expect(patientMenu).toContain('birth-photo-modal');
        expect(patientMenu).toContain('/api/patient/birth-pending');
        expect(patientMenu).toContain('/api/patient/birth-data/');
        expect(patientMenu).toContain('/api/patient/birth-extra/');
        expect(patientMenu).toContain('/api/patient/birth-photo/');
        expect(patientMenu).toContain('/api/patient/birth-testimonial/');
        expect(patientMenu).toContain('Lengkapi data kelahiran');
        expect(patientMenu).toContain('Upload foto bayi');
        expect(patientMenu).toContain('Kirim testimoni');
        expect(patientMenu).toContain('patient_data_submitted');
        expect(patientMenu).toContain('patient_testimonial');
        expect(patientMenu).toContain('hidePregnancyTrackerHome');
    });

    test('edit detail birth modal can update date, time, weight, and length', () => {
        expect(patientMenu).toContain('renderBirthDateWheelInput(\'birth-extra\', record.birth_date)');
        expect(patientMenu).toContain('function renderBirthDateWheelInput(prefix, value)');
        expect(patientMenu).toContain('birth-date-trigger');
        expect(patientMenu).toContain("onclick=\"openBirthDateWheelPicker(event, \\'' + prefix + '\\')\"");
        expect(patientMenu).toContain('id="\' + prefix + \'-day" type="hidden"');
        expect(patientMenu).toContain('id="\' + prefix + \'-month" type="hidden"');
        expect(patientMenu).toContain('id="\' + prefix + \'-year" type="hidden"');
        expect(patientMenu).toContain('birth-date-wheel-modal');
        expect(patientMenu).toContain('function openBirthDateWheelPicker(event, prefix)');
        expect(patientMenu).toContain('function selectBirthDateWheelValue(type, value)');
        expect(patientMenu).toContain('function applyBirthDateWheelPicker(event)');
        expect(patientMenu).toContain('window.openBirthDateWheelPicker = openBirthDateWheelPicker;');
        expect(patientMenu).toContain('window.selectBirthDateWheelValue = selectBirthDateWheelValue;');
        expect(patientMenu).toContain('window.applyBirthDateWheelPicker = applyBirthDateWheelPicker;');
        expect(patientMenu).toContain("return renderBirthDateWheelOption('day', day, String(day));");
        expect(patientMenu).toContain("return renderBirthDateWheelOption('month', month, String(month));");
        expect(patientMenu).toContain("return renderBirthDateWheelOption('year', year, String(year));");
        expect(patientMenu).not.toContain("renderBirthDateWheelOption('day', day, String(day), 'Tanggal')");
        expect(patientMenu).not.toContain("renderBirthDateWheelOption('year', year, String(year), 'Tahun')");
        expect(patientMenu).not.toContain('.birth-date-wheel-option small');
        expect(patientMenu).toMatch(/\.birth-date-wheel-option\s*\{[\s\S]*font-size:\s*18px/);
        expect(patientMenu).toMatch(/\.birth-date-wheel-option\.active\s*\{[\s\S]*font-size:\s*22px/);
        expect(patientMenu).not.toContain('id="birth-extra-date"');
        expect(patientMenu).not.toContain('type="number" class="settings-input" inputmode="numeric" min="1" max="31"');
        expect(patientMenu).toContain('id="birth-extra-time" type="time"');
        expect(patientMenu).toContain('for="birth-extra-time">Jam Lahir');
        expect(patientMenu).toContain('Silhkan isi data bayi Ibu');
        expect(patientMenu).not.toContain('Edit keterangan tambahan yang dulu tersedia di portal lama.');
        expect(patientMenu).toContain('id="birth-extra-weight"');
        expect(patientMenu).toContain('for="birth-extra-weight">BERAT LAHIR (GRAM)');
        expect(patientMenu).toContain('id="birth-extra-length"');
        expect(patientMenu).toContain('for="birth-extra-length">PANJANG BADAN (CM)');
        expect(patientMenu).not.toContain('showPicker');
        expect(patientMenu).toContain('const birthDateValue = normalizeBirthDatePartsSubmitInput(\'birth-extra\');');
        expect(patientMenu).toContain('birth_date: birthDateValue');
        expect(patientMenu).toContain('birth_weight: birthWeightDigits');
        expect(patientRoutes).toContain('const { birth_date, birth_time, birth_weight, birth_length } = req.body;');
        expect(patientRoutes).toContain('birth_date = COALESCE(?, birth_date)');
        expect(patientRoutes).toContain('birth_weight = COALESCE(?, birth_weight)');
    });

    test('edit detail birth weight accepts exactly four gram digits', () => {
        expect(patientMenu).toContain('inputmode="numeric"');
        expect(patientMenu).toContain('maxlength="4"');
        expect(patientMenu).toContain(String.raw`pattern="\\d{4}"`);
        expect(patientMenu).toContain('placeholder="3400"');
        expect(patientMenu).toContain('normalizeBirthWeightGramsInput(record.birth_weight || record.weight || \'\')');
        expect(patientMenu).toContain('const birthWeightDigits = normalizeBirthWeightGramsInput(document.getElementById(\'birth-extra-weight\')?.value || \'\');');
        expect(patientMenu).toContain(String.raw`if (!/^\d{4}$/.test(birthWeightDigits))`);
        expect(patientMenu).toContain('birth_weight: birthWeightDigits');
        expect(patientRoutes).toContain(String.raw`const normalizedBirthWeight = String(birth_weight || '').replace(/\D/g, '');`);
        expect(patientRoutes).toContain(String.raw`if (!/^\d{4}$/.test(normalizedBirthWeight))`);
        expect(patientRoutes).toContain("const storedBirthWeight = `${normalizedBirthWeight} gram`;");
    });

    test('birth congratulations uses the static portal color without decorative corners', () => {
        expect(patientMenu).not.toContain('birth-corner-accent');
        expect(patientMenu).not.toContain('applyBirthCongratsTheme');
        expect(patientMenu).not.toContain('getBirthTheme');
        expect(patientMenu).not.toContain('theme_color');
        expect(patientMenu).not.toContain('--birth-accent');
        expect(patientMenu).toContain('background: radial-gradient(circle, rgba(179,95,123,0.18), transparent 70%)');
        expect(patientMenu).toContain('color: var(--rose)');
    });

    test('birth congratulations and info panel reuse portal heading typography', () => {
        expect(patientMenu).toContain('class="section-kicker birth-congrats-kicker"');
        expect(patientMenu).toContain('class="section-title birth-congrats-heading"');
        expect(patientMenu).toContain('class="section-kicker announcement-panel-kicker">Info Terbaru</div>');
        expect(patientMenu).toContain("preview.textContent = 'UPDATE DARI SISIWANITA';");
        expect(patientMenu).not.toContain("preview.textContent = truncatePreviewText(first.message || first.title, 86);");
        expect(patientMenu).not.toMatch(/\.birth-congrats-kicker\s*\{[^}]*color:\s*var\(--rose\)/);
        expect(patientMenu).not.toMatch(/\.birth-congrats-heading\s*\{[^}]*font-size:\s*21px/);
    });

    test('patient birth endpoints return fields needed by the new portal', () => {
        expect(patientRoutes).toContain('patient_testimonial');
        expect(patientRoutes).toContain('patient_data_submitted');
        expect(patientRoutes).toContain('photo_url');
        expect(patientRoutes).toContain('/api/patient/birth-photo/:id');
        expect(patientRoutes).toContain('/api/patient/birth-testimonial/:id');
    });
});
