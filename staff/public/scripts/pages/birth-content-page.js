import { createPageRequestScope } from '../staff-api.js';
import { escapeHtml, escapeAttribute, sanitizeUrl } from '../safe-render.js';
import { showToast } from '../toast.js';

const requestScopes = new Map();
const birthCongratsData = new Map();
function startRequestScope(key) {
    requestScopes.get(key)?.abort('Request replaced');
    const scope = createPageRequestScope();
    requestScopes.set(key, scope);
    return scope;
}

function abortRequestScopes() {
    requestScopes.forEach(scope => scope.abort());
    requestScopes.clear();
}

function isAbortError(error) {
    return error?.name === 'AbortError';
}

function notify(message, type = 'info') {
    showToast(message, type);
}

function formatBirthDate(value) {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleDateString('id-ID', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
}

function birthPhotoMarkup(url, alt, maxHeight) {
    const safeUrl = sanitizeUrl(url);
    if (!safeUrl) return '';
    return `<div class="text-center mb-3"><img src="${escapeAttribute(safeUrl)}" alt="${escapeAttribute(alt)}" style="max-width:100%;max-height:${maxHeight}px;border-radius:10px;object-fit:cover;"></div>`;
}

function syncLegacyBirthData() {
    window.birthCongratsData = Object.fromEntries(birthCongratsData.entries());
}

export async function showBirthCongratsPage() {
    await window.activateRegisteredStaffPage?.('birth-congrats');
    await loadBirthCongratsList();
}

export async function showBirthTestimonialsPage() {
    await window.activateRegisteredStaffPage?.('birth-testimonials');
    await loadBirthTestimonialsList();
}

export async function loadBirthCongratsList() {
    const container = document.getElementById('birth-congrats-list');
    if (!container) return;

    container.innerHTML = `
        <div class="text-center text-muted py-5">
            <i class="fas fa-spinner fa-spin fa-2x mb-3"></i>
            <p>Memuat data...</p>
        </div>`;

    const scope = startRequestScope('birth-congrats-list');
    try {
        const result = await scope.request('/api/patients/birth-congratulations/all');
        if (!result?.success) throw new Error(result?.message || 'Gagal memuat data');

        const items = Array.isArray(result.data) ? result.data : [];
        birthCongratsData.clear();
        items.forEach(item => birthCongratsData.set(String(item.patient_id), item));
        syncLegacyBirthData();

        if (items.length === 0) {
            container.innerHTML = `
                <div class="text-center text-muted py-5">
                    <i class="fas fa-baby fa-3x mb-3" style="color:#007bff;opacity:.5;"></i>
                    <p>Belum ada data ucapan kelahiran</p>
                    <button type="button" class="btn btn-primary btn-sm" data-action="birth-add">
                        <i class="fas fa-plus mr-1"></i>Tambah Baru
                    </button>
                </div>`;
            return;
        }

        const cards = items.map(item => {
            const patientId = String(item.patient_id ?? '');
            const genderIcon = item.gender === 'male'
                ? 'fa-mars text-info'
                : item.gender === 'female'
                    ? 'fa-venus text-danger'
                    : 'fa-question text-muted';
            const genderText = item.gender === 'male'
                ? 'Laki-laki'
                : item.gender === 'female'
                    ? 'Perempuan'
                    : '-';
            const statusBadge = item.is_published
                ? '<span class="badge badge-success"><i class="fas fa-eye"></i> Tampil</span>'
                : '<span class="badge badge-secondary"><i class="fas fa-eye-slash"></i> Sembunyi</span>';
            const message = item.message
                ? `<div class="alert alert-light mb-0 mt-2" style="font-size:12px;font-style:italic;border-left:3px solid #007bff;">"${escapeHtml(item.message)}"</div>`
                : '';

            return `
                <div class="col-md-6 col-lg-4 mb-4">
                    <div class="card h-100" style="border:2px solid #90caf9;border-radius:15px;overflow:hidden;">
                        <div class="card-header" style="background:linear-gradient(135deg,#e3f2fd,#bbdefb);border-bottom:none;">
                            <div class="d-flex justify-content-between align-items-center">
                                <h5 class="mb-0" style="color:#1976d2;"><i class="fas fa-baby mr-2"></i>${escapeHtml(item.baby_name || 'Baby')}</h5>
                                ${statusBadge}
                            </div>
                            <small class="text-muted">Ibu: ${escapeHtml(item.patient_name || '-')}</small>
                        </div>
                        <div class="card-body">
                            ${birthPhotoMarkup(item.photo_url, 'Foto kelahiran', 150)}
                            <div class="row text-center mb-2">
                                <div class="col-6"><small class="text-muted d-block">Tanggal</small><strong style="font-size:12px;">${escapeHtml(formatBirthDate(item.birth_date))}</strong></div>
                                <div class="col-6"><small class="text-muted d-block">Jam</small><strong>${escapeHtml(item.birth_time ? `${String(item.birth_time).substring(0, 5)} WIB` : '-')}</strong></div>
                            </div>
                            <div class="row text-center mb-2">
                                <div class="col-4"><small class="text-muted d-block">Berat</small><strong>${escapeHtml(item.birth_weight || '-')}</strong></div>
                                <div class="col-4"><small class="text-muted d-block">Panjang</small><strong>${escapeHtml(item.birth_length || '-')}</strong></div>
                                <div class="col-4"><small class="text-muted d-block">Gender</small><strong><i class="fas ${genderIcon}"></i> ${genderText}</strong></div>
                            </div>
                            ${message}
                        </div>
                        <div class="card-footer bg-white text-right">
                            <button type="button" class="btn btn-outline-info btn-sm" data-action="birth-edit" data-patient-id="${escapeAttribute(patientId)}">
                                <i class="fas fa-edit"></i> Edit
                            </button>
                            <button type="button" class="btn btn-outline-danger btn-sm" data-action="birth-delete" data-patient-id="${escapeAttribute(patientId)}">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </div>
                </div>`;
        }).join('');

        container.innerHTML = `<div class="row">${cards}</div>`;
    } catch (error) {
        if (isAbortError(error)) return;
        console.error('Error loading birth congratulations:', error);
        container.innerHTML = `<div class="alert alert-danger">Gagal memuat data: ${escapeHtml(error.message)}</div>`;
    }
}

export async function loadBirthTestimonialsList() {
    const container = document.getElementById('birth-testimonials-list');
    if (!container) return;

    container.innerHTML = `
        <div class="text-center text-muted py-5">
            <i class="fas fa-spinner fa-spin fa-2x mb-3"></i>
            <p>Memuat testimoni...</p>
        </div>`;

    const scope = startRequestScope('birth-testimonials-list');
    try {
        const result = await scope.request('/api/birth-testimonials');
        if (!result?.success) throw new Error(result?.message || 'Gagal memuat testimoni');

        const items = Array.isArray(result.data) ? result.data : [];
        if (items.length === 0) {
            container.innerHTML = `
                <div class="text-center text-muted py-5">
                    <i class="fas fa-comment-slash fa-3x mb-3" style="opacity:.5;"></i>
                    <p>Belum ada testimoni pasien.</p>
                </div>`;
            return;
        }

        const cards = items.map(item => {
            const submittedAt = item.patient_testimonial_submitted_at
                ? `${new Date(item.patient_testimonial_submitted_at).toLocaleString('id-ID', {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                    timeZone: 'Asia/Jakarta'
                })} WIB`
                : '-';
            return `
                <div class="col-md-6 col-lg-4 mb-3">
                    <div class="card h-100 border-info">
                        <div class="card-header bg-info text-white">
                            <div class="d-flex justify-content-between align-items-center">
                                <strong>${escapeHtml(item.patient_name || '-')}</strong>
                                <span class="badge badge-light text-info">Anak ke-${escapeHtml(item.child_number || '-')}</span>
                            </div>
                            <small>${escapeHtml(item.baby_name || 'Si Kecil')} • ${escapeHtml(formatBirthDate(item.birth_date))}</small>
                        </div>
                        <div class="card-body">
                            ${birthPhotoMarkup(item.photo_url, 'Foto bayi', 140)}
                            <p class="mb-2" style="font-size:13px;line-height:1.6;white-space:pre-wrap;">${escapeHtml(item.patient_testimonial || '')}</p>
                            <div class="small text-muted">Dikirim: ${escapeHtml(submittedAt)}</div>
                        </div>
                    </div>
                </div>`;
        }).join('');

        container.innerHTML = `<div class="row">${cards}</div>`;
    } catch (error) {
        if (isAbortError(error)) return;
        console.error('Error loading birth testimonials:', error);
        container.innerHTML = `<div class="alert alert-danger">Gagal memuat testimoni: ${escapeHtml(error.message)}</div>`;
    }
}

async function loadPatientsForBirthCongrats() {
    const select = document.getElementById('bc-patient-id');
    if (!select) return;
    select.innerHTML = '<option value="">-- Memuat pasien... --</option>';

    const scope = startRequestScope('birth-patients');
    try {
        const result = await scope.request('/api/patients?view=basic&limit=1000');
        const patients = result?.success && Array.isArray(result.data) ? result.data : [];
        select.innerHTML = [
            '<option value="">-- Pilih Pasien --</option>',
            ...patients.map(patient => `<option value="${escapeAttribute(patient.id)}">${escapeHtml(patient.full_name)} (${escapeHtml(patient.id)})</option>`)
        ].join('');
    } catch (error) {
        if (isAbortError(error)) return;
        console.error('Error loading patients:', error);
        select.innerHTML = '<option value="">-- Error loading --</option>';
    }
}

export async function showAddBirthCongratsModal() {
    const form = document.getElementById('birthCongratsForm');
    if (!form) return;

    form.reset();
    document.getElementById('bc-edit-id').value = '';
    document.getElementById('birthCongratsModalTitle').textContent = 'Tambah Ucapan Kelahiran';
    document.getElementById('bc-photo-preview').style.display = 'none';
    document.getElementById('bc-is-published').checked = true;
    selectBirthCongratsColor('pink');
    await loadPatientsForBirthCongrats();
    window.jQuery?.('#birthCongratsModal').modal('show');
}

export function selectBirthCongratsColor(color) {
    const allowedColors = new Set(['pink', 'blue', 'green', 'purple', 'gold', 'peach']);
    const selectedColor = allowedColors.has(color) ? color : 'pink';
    const input = document.getElementById('bc-theme-color');
    if (input) input.value = selectedColor;
    document.querySelectorAll('#bc-color-options .color-box').forEach(box => {
        box.style.borderColor = box.dataset.color === selectedColor ? '#333' : 'transparent';
    });
}

export async function saveBirthCongrats() {
    const patientId = document.getElementById('bc-patient-id')?.value;
    if (!patientId) {
        notify('Pilih pasien terlebih dahulu', 'error');
        return;
    }

    const data = {
        baby_name: document.getElementById('bc-baby-name')?.value || '',
        birth_date: document.getElementById('bc-birth-date')?.value || null,
        birth_time: document.getElementById('bc-birth-time')?.value || null,
        birth_weight: document.getElementById('bc-birth-weight')?.value || '',
        birth_length: document.getElementById('bc-birth-length')?.value || '',
        gender: document.getElementById('bc-gender')?.value || null,
        message: document.getElementById('bc-message')?.value || '',
        is_published: document.getElementById('bc-is-published')?.checked ? 1 : 0,
        theme_color: document.getElementById('bc-theme-color')?.value || 'pink'
    };

    const scope = startRequestScope('birth-save');
    try {
        await scope.request(`/api/patients/${encodeURIComponent(patientId)}/birth-congratulations`, {
            method: 'POST',
            body: JSON.stringify(data)
        });

        const photo = document.getElementById('bc-photo')?.files?.[0];
        if (photo) {
            const formData = new FormData();
            formData.append('photo', photo);
            try {
                await scope.request(`/api/patients/${encodeURIComponent(patientId)}/birth-congratulations/photo`, {
                    method: 'POST',
                    body: formData
                });
            } catch (error) {
                if (isAbortError(error)) return;
                console.error('Photo upload failed:', error);
                notify('Data tersimpan, tapi foto gagal diupload', 'warning');
            }
        }

        notify('Ucapan kelahiran berhasil disimpan', 'success');
        window.jQuery?.('#birthCongratsModal').modal('hide');
        await loadBirthCongratsList();
    } catch (error) {
        if (isAbortError(error)) return;
        console.error('Error saving birth congratulations:', error);
        notify(`Gagal menyimpan: ${error.message}`, 'error');
    }
}

export async function editBirthCongrats(patientId, existingData = null) {
    await showAddBirthCongratsModal();
    const data = existingData || birthCongratsData.get(String(patientId));
    document.getElementById('bc-edit-id').value = patientId;
    document.getElementById('birthCongratsModalTitle').textContent = 'Edit Ucapan Kelahiran';
    document.getElementById('bc-patient-id').value = patientId;
    if (!data) return;

    document.getElementById('bc-baby-name').value = data.baby_name || '';
    document.getElementById('bc-birth-date').value = data.birth_date ? String(data.birth_date).split('T')[0] : '';
    document.getElementById('bc-birth-time').value = data.birth_time || '';
    document.getElementById('bc-birth-weight').value = data.birth_weight || '';
    document.getElementById('bc-birth-length').value = data.birth_length || '';
    document.getElementById('bc-gender').value = data.gender || '';
    document.getElementById('bc-message').value = data.message || '';
    document.getElementById('bc-is-published').checked = data.is_published == 1;
    selectBirthCongratsColor(data.theme_color || 'pink');

    const safePhotoUrl = sanitizeUrl(data.photo_url);
    const preview = document.getElementById('bc-photo-preview');
    const image = preview?.querySelector('img');
    if (safePhotoUrl && preview && image) {
        image.src = safePhotoUrl;
        preview.style.display = 'block';
    }
}

export async function deleteBirthCongrats(patientId) {
    if (!window.confirm('Hapus ucapan kelahiran untuk pasien ini?')) return;

    const scope = startRequestScope('birth-delete');
    try {
        await scope.request(`/api/patients/${encodeURIComponent(patientId)}/birth-congratulations`, {
            method: 'DELETE'
        });
        notify('Ucapan kelahiran berhasil dihapus', 'success');
        await loadBirthCongratsList();
    } catch (error) {
        if (isAbortError(error)) return;
        console.error('Error deleting birth congratulations:', error);
        notify('Gagal menghapus', 'error');
    }
}

function previewSelectedPhoto(input) {
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.addEventListener('load', event => {
        const preview = document.getElementById('bc-photo-preview');
        const image = preview?.querySelector('img');
        if (!preview || !image) return;
        image.src = event.target.result;
        preview.style.display = 'block';
    }, { once: true });
    reader.readAsDataURL(file);
    const label = document.querySelector('label[for="bc-photo"]');
    if (label) label.textContent = file.name;
}

document.addEventListener('click', event => {
    const target = event.target.closest('[data-action]');
    if (!target) return;
    const action = target.dataset.action;
    if (!action?.startsWith('birth-')) return;
    event.preventDefault();

    if (action === 'birth-add') showAddBirthCongratsModal();
    if (action === 'birth-save') saveBirthCongrats();
    if (action === 'birth-color') selectBirthCongratsColor(target.dataset.color);
    if (action === 'birth-edit') editBirthCongrats(target.dataset.patientId);
    if (action === 'birth-delete') deleteBirthCongrats(target.dataset.patientId);
});

document.addEventListener('change', event => {
    if (event.target?.id === 'bc-photo') previewSelectedPhoto(event.target);
});

document.addEventListener('page:changed', () => {
    abortRequestScopes();
});

Object.assign(window, {
    showBirthCongratsPage,
    loadBirthCongratsList,
    showBirthTestimonialsPage,
    loadBirthTestimonialsList,
    showAddBirthCongratsModal,
    saveBirthCongrats,
    editBirthCongrats,
    deleteBirthCongrats,
    selectBirthCongratsColor
});
