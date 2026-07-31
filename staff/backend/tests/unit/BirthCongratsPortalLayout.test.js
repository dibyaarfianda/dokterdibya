const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '../../../..');
const patientMenu = fs.readFileSync(path.join(repoRoot, 'public', 'patient-menu.html'), 'utf8');
const patientMenuShell = fs.readFileSync(path.join(repoRoot, 'public', 'scripts', 'patient-menu-shell.js'), 'utf8');
const patientPortalSource = `${patientMenu}\n${patientMenuShell}`;
const patientRoutes = fs.readFileSync(path.join(repoRoot, 'staff', 'backend', 'routes', 'patients.js'), 'utf8');

describe('Birth congratulations portal layout', () => {
    test('home congratulations card remains compact without clipping actions', () => {
        expect(patientMenu).toContain('.birth-congrats-home');
        expect(patientMenu).toMatch(/\.birth-congrats-home\s*\{[\s\S]*max-width:\s*390px/);
        expect(patientMenu).toContain('min-height: min(calc(100vw - 28px), 390px)');
        expect(patientMenu).toContain('.birth-congrats-hero');
        expect(patientMenu).toContain('--birth-photo-width: 176px;');
        expect(patientMenu).toContain('--birth-photo-height: 308px;');
        expect(patientMenu).toMatch(/\.birth-congrats-body\s*\{[^}]*display:\s*flex/);
        expect(patientMenu).toMatch(/\.birth-congrats-body\s*\{[^}]*flex-direction:\s*column/);
        expect(patientMenu).toMatch(/\.birth-congrats-hero\s*\{[^}]*grid-template-columns:\s*var\(--birth-photo-width\) minmax\(0,\s*1fr\)/);
        expect(patientMenu).toMatch(/\.birth-congrats-photo-wrap\s*\{[\s\S]*height:\s*var\(--birth-photo-height\)/);
        expect(patientMenu).toContain('class="birth-congrats-metrics-card"');
        expect(patientMenu).not.toContain('.birth-congrats-photo-wrap { width: 100%; height: 150px; }');
    });

    test('home congratulations card keeps patient actions visible below long doctor messages', () => {
        expect(patientMenu).toMatch(/\.birth-congrats-home\s*\{[\s\S]*height:\s*auto/);
        expect(patientMenu).not.toMatch(/^\s+height:\s*min\(calc\(100vw - 28px\), 390px\);/m);
        expect(patientMenu).not.toMatch(/^\s+height:\s*min\(calc\(100vw - 28px\), 360px\);/m);
        expect(patientMenu).toMatch(/\.birth-congrats-body\s*\{[\s\S]*overflow:\s*visible/);
        expect(patientMenu).toMatch(/<div class="birth-congrats-body">\s*<div class="birth-congrats-hero">[\s\S]*<\/div>\s*<div class="birth-congrats-metrics-card">[\s\S]*<\/div>\s*<div class="birth-congrats-message-card">[\s\S]*<\/div>\s*<\/div>\s*<div class="birth-congrats-card-actions">/);
    });

    test('new patient portal carries over legacy birth congratulations interactions', () => {
        expect(patientPortalSource).toContain('openBirthPhotoModal');
        expect(patientPortalSource).toContain('birth-photo-modal');
        expect(patientPortalSource).toContain('/api/patient/birth-pending');
        expect(patientPortalSource).toContain('/api/patient/birth-data/');
        expect(patientPortalSource).toContain('/api/patient/birth-extra/');
        expect(patientPortalSource).toContain('/api/patient/birth-photo/');
        expect(patientPortalSource).toContain('/api/patient/birth-testimonial/');
        expect(patientPortalSource).toContain('Lengkapi data kelahiran');
        expect(patientPortalSource).toContain('Upload foto bayi');
        expect(patientPortalSource).toContain('Kirim testimoni');
        expect(patientPortalSource).toContain('patient_data_submitted');
        expect(patientPortalSource).toContain('patient_testimonial');
        expect(patientPortalSource).toContain('hidePregnancyTrackerHome');
    });

    test('edit detail birth modal can update date, time, weight, and length', () => {
        expect(patientPortalSource).toContain('renderBirthDateWheelInput(\'birth-extra\', record.birth_date)');
        expect(patientPortalSource).toContain('function renderBirthDateWheelInput(prefix, value)');
        expect(patientPortalSource).toContain('birth-date-trigger');
        expect(patientPortalSource).toContain('data-shell-action="open-birth-date-wheel"');
        expect(patientPortalSource).toContain('data-birth-date-prefix="\' + escapeHtml(prefix) + \'"');
        expect(patientPortalSource).not.toContain("onclick=\"openBirthDateWheelPicker(event, \\'' + prefix + '\\')\"");
        expect(patientPortalSource).toContain('id="\' + prefix + \'-day" type="hidden"');
        expect(patientPortalSource).toContain('id="\' + prefix + \'-month" type="hidden"');
        expect(patientPortalSource).toContain('id="\' + prefix + \'-year" type="hidden"');
        expect(patientPortalSource).toContain('birth-date-wheel-modal');
        expect(patientPortalSource).toContain('function openBirthDateWheelPicker(event, prefix)');
        expect(patientPortalSource).toContain('function selectBirthDateWheelValue(type, value)');
        expect(patientPortalSource).toContain('function applyBirthDateWheelPicker(event)');
        expect(patientPortalSource).toContain('window.openBirthDateWheelPicker = openBirthDateWheelPicker;');
        expect(patientPortalSource).toContain('window.selectBirthDateWheelValue = selectBirthDateWheelValue;');
        expect(patientPortalSource).toContain('window.applyBirthDateWheelPicker = applyBirthDateWheelPicker;');
        expect(patientPortalSource).toContain("return renderBirthDateWheelOption('day', day, String(day));");
        expect(patientPortalSource).toContain("return renderBirthDateWheelOption('month', month, String(month));");
        expect(patientPortalSource).toContain("return renderBirthDateWheelOption('year', year, String(year));");
        expect(patientPortalSource).not.toContain("renderBirthDateWheelOption('day', day, String(day), 'Tanggal')");
        expect(patientPortalSource).not.toContain("renderBirthDateWheelOption('year', year, String(year), 'Tahun')");
        expect(patientMenu).not.toContain('.birth-date-wheel-option small');
        expect(patientMenu).toMatch(/\.birth-date-wheel-option\s*\{[\s\S]*font-size:\s*18px/);
        expect(patientMenu).toMatch(/\.birth-date-wheel-option\.active\s*\{[\s\S]*font-size:\s*22px/);
        expect(patientPortalSource).not.toContain('id="birth-extra-date"');
        expect(patientPortalSource).not.toContain('type="number" class="settings-input" inputmode="numeric" min="1" max="31"');
        expect(patientPortalSource).toContain('id="birth-extra-time" type="time"');
        expect(patientPortalSource).toContain('for="birth-extra-time">Jam Lahir');
        expect(patientPortalSource).toContain('Silhkan isi data bayi Ibu');
        expect(patientPortalSource).not.toContain('Edit keterangan tambahan yang dulu tersedia di portal lama.');
        expect(patientPortalSource).toContain('id="birth-extra-weight"');
        expect(patientPortalSource).toContain('for="birth-extra-weight">BERAT LAHIR (GRAM)');
        expect(patientPortalSource).toContain('id="birth-extra-length"');
        expect(patientPortalSource).toContain('for="birth-extra-length">PANJANG BADAN (CM)');
        expect(patientPortalSource).not.toContain('showPicker');
        expect(patientPortalSource).toContain('const birthDateValue = normalizeBirthDatePartsSubmitInput(\'birth-extra\');');
        expect(patientPortalSource).toContain('birth_date: birthDateValue');
        expect(patientPortalSource).toContain('birth_weight: birthWeightDigits');
        expect(patientRoutes).toContain('const { birth_date, birth_time, birth_weight, birth_length } = req.body;');
        expect(patientRoutes).toContain('birth_date = COALESCE(?, birth_date)');
        expect(patientRoutes).toContain('birth_weight = COALESCE(?, birth_weight)');
    });

    test('edit detail birth weight accepts exactly four gram digits', () => {
        expect(patientPortalSource).toContain('inputmode="numeric"');
        expect(patientPortalSource).toContain('maxlength="4"');
        expect(patientPortalSource).toContain(String.raw`pattern="\\d{4}"`);
        expect(patientPortalSource).toContain('placeholder="3400"');
        expect(patientPortalSource).toContain('normalizeBirthWeightGramsInput(record.birth_weight || record.weight || \'\')');
        expect(patientPortalSource).toContain('const birthWeightDigits = normalizeBirthWeightGramsInput(document.getElementById(\'birth-extra-weight\')?.value || \'\');');
        expect(patientPortalSource).toContain(String.raw`if (!/^\d{4}$/.test(birthWeightDigits))`);
        expect(patientPortalSource).toContain('birth_weight: birthWeightDigits');
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
        expect(patientMenu).toContain('id="announcement-preview" class="section-title announcement-preview-title"');
        expect(patientPortalSource).toContain("preview.textContent = 'Update dari SisiWanita';");
        expect(patientPortalSource).not.toContain("preview.textContent = truncatePreviewText(first.message || first.title, 86);");
        expect(patientMenu).not.toMatch(/\.birth-congrats-kicker\s*\{[^}]*color:\s*var\(--rose\)/);
        expect(patientMenu).not.toMatch(/\.birth-congrats-heading\s*\{[^}]*font-size:\s*21px/);
    });

    test('birth congratulations now uses a photo-first hierarchy with reference-style panels', () => {
        expect(patientMenu).toContain('class="birth-congrats-identity"');
        expect(patientMenu).toContain('class="birth-congrats-divider"');
        expect(patientMenu).toMatch(/\.birth-congrats-photo-wrap\s*\{[\s\S]*border-radius:\s*28px/);
        expect(patientMenu).toContain('class="birth-congrats-message-card"');
        expect(patientMenu).toContain('class="birth-congrats-message-avatar"');
        expect(patientMenu).toContain('id="birth-congrats-doctor-avatar-img"');
        expect(patientMenu).toContain('id="birth-congrats-doctor-avatar-fallback"');
        expect(patientMenu).toContain('id="birth-congrats-doctor-detail"');
        expect(patientMenu).toContain('id="birth-congrats-doctor-specialty"');
        expect(patientMenu).toContain('class="birth-congrats-metric-icon"');
        expect(patientMenu).toMatch(/@media \(max-width: 520px\) \{[\s\S]*--birth-photo-width:\s*150px/);
    });

    test('patient birth endpoints return fields needed by the new portal', () => {
        expect(patientRoutes).toContain('patient_testimonial');
        expect(patientRoutes).toContain('patient_data_submitted');
        expect(patientRoutes).toContain('photo_url');
        expect(patientRoutes).toContain('/api/patient/birth-photo/:id');
        expect(patientRoutes).toContain('/api/patient/birth-testimonial/:id');
    });

    test('patient birth photo routes use backend proxy urls instead of direct R2 signed links', () => {
        expect(patientRoutes).toContain("function getR2ProxyUrl(key)");
        expect(patientRoutes).toContain('photoUrl = getR2ProxyUrl(birth.photo_r2_key);');
        expect(patientRoutes).toContain('data.photo_url = getR2ProxyUrl(data.photo_r2_key);');
        expect(patientRoutes).toContain('const proxyUrl = getR2ProxyUrl(uploadResult.key);');
        expect(patientRoutes).toContain('photo_url: proxyUrl');
        expect(patientRoutes).not.toContain('photo_url: signedUrl');
    });

    test('birth congratulations home route prefers the latest child record when multiple births exist', () => {
        const routeSection = patientRoutes.match(/router\.get\('\/api\/patient\/birth-congratulations'[\s\S]*?const doctorProfile = await findBirthDoctorProfile/);
        expect(routeSection).not.toBeNull();
        expect(routeSection[0]).toMatch(/ORDER BY child_number DESC,\s*created_at DESC/);
        expect(routeSection[0]).not.toMatch(/ORDER BY child_number ASC/);
        expect(routeSection[0]).toContain('const data = rows[0];');
    });

    test('birth congratulations response and card bind doctor avatar from staff profile', () => {
        expect(patientRoutes).toContain('doctor_photo_url');
        expect(patientRoutes).toContain('/api/users/${doctorProfile.new_id}/photo');
        expect(patientRoutes).toContain('function findBirthDoctorProfile');
        expect(patientPortalSource).toContain("const doctorAvatarUrl = String(data.doctor_photo_url || '').trim();");
        expect(patientPortalSource).toContain("const doctorAvatar = document.getElementById('birth-congrats-doctor-avatar-img');");
        expect(patientPortalSource).toContain("const doctorAvatarFallback = document.getElementById('birth-congrats-doctor-avatar-fallback');");
    });

    test('birth congratulations hides the birth-status subtitle and doubles the baby name size', () => {
        expect(patientMenu).toMatch(/\.birth-congrats-baby-block h3\s*\{[\s\S]*font-size:\s*30px/);
        expect(patientMenu).toContain('<p id="birth-congrats-subtitle"></p>');
        expect(patientMenu).not.toContain("document.getElementById('birth-congrats-subtitle').textContent = genderLabel + ' Anda telah lahir dengan selamat.';");
        expect(patientMenu).not.toContain('Buah hati Anda telah lahir dengan selamat.');
        expect(patientMenu).not.toContain('Putra Anda telah lahir dengan selamat.');
        expect(patientMenu).not.toContain('Putri Anda telah lahir dengan selamat.');
    });
});
