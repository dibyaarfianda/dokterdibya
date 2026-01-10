/**
 * Medical Record Viewer with Section Tabs
 * - Loads record data
 * - Horizontal scrollable section tabs
 * - Category-based section visibility
 */

import { api } from '../api.js';
import { showToast, showLoading, hideLoading } from '../app.js';
import { router } from '../router.js';

// Current record state
let currentRecord = null;
let currentSection = 'identity';

// Section definitions
const SECTIONS = {
    identity: { label: 'Identitas', icon: 'fa-id-card', all: true },
    anamnesa: { label: 'Anamnesa', icon: 'fa-notes-medical', all: true },
    physical_exam: { label: 'Pem. Fisik', icon: 'fa-heartbeat', all: true },
    pemeriksaan_obstetri: { label: 'Pem. Obs', icon: 'fa-baby', obstetri: true },
    pemeriksaan_ginekologi: { label: 'Pem. Gyn', icon: 'fa-venus', gyn: true },
    usg: { label: 'USG', icon: 'fa-wave-square', all: true },
    penunjang: { label: 'Penunjang', icon: 'fa-flask', all: true },
    diagnosis: { label: 'Diagnosis', icon: 'fa-stethoscope', all: true },
    plan: { label: 'Planning', icon: 'fa-clipboard-list', all: true },
    resume: { label: 'Resume', icon: 'fa-file-medical-alt', all: true },
    billing: { label: 'Tagihan', icon: 'fa-receipt', billing: true }
};

export async function renderMedicalRecord(container, params = {}) {
    const mrId = params.mrId || sessionStorage.getItem('current_mr_id');

    if (!mrId) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-folder-open"></i>
                <p>Tidak ada rekam medis dipilih</p>
                <button class="btn-primary" onclick="window.history.back()">Kembali</button>
            </div>
        `;
        return;
    }

    // Show loading
    container.innerHTML = `
        <div class="loading-state">
            <i class="fas fa-spinner fa-spin"></i>
            <p>Memuat rekam medis...</p>
        </div>
    `;

    try {
        const response = await api.getRecord(mrId);

        if (!response.success) {
            throw new Error(response.message || 'Gagal memuat rekam medis');
        }

        currentRecord = response.data;
        currentSection = params.section || 'identity';

        renderRecordUI(container);

    } catch (error) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-exclamation-triangle"></i>
                <p>${error.message}</p>
                <button class="btn-secondary" onclick="window.history.back()">Kembali</button>
            </div>
        `;
    }
}

function renderRecordUI(container) {
    const { record, patient, medicalRecords } = currentRecord;
    const category = record.mr_category || 'obstetri';
    const location = record.visit_location || 'klinik_private';
    const isPrivate = location === 'klinik_private';

    // Filter sections based on category
    const visibleSections = Object.entries(SECTIONS).filter(([key, config]) => {
        if (config.all) return true;
        if (config.obstetri && category === 'obstetri') return true;
        if (config.gyn && (category === 'gyn_repro' || category === 'gyn_special')) return true;
        if (config.billing && isPrivate) return true;
        return false;
    });

    container.innerHTML = `
        <div class="medical-record fade-in">
            <!-- Patient Header -->
            <div class="patient-header">
                <div class="patient-info">
                    <div class="patient-name">${patient?.full_name || patient?.name || 'Pasien'}</div>
                    <div class="patient-meta">
                        <span class="mr-badge">${record.mr_id}</span>
                        <span class="category-badge ${getCategoryClass(category)}">${getCategoryLabel(category)}</span>
                        ${!isPrivate ? `<span class="location-badge">${getLocationLabel(location)}</span>` : ''}
                    </div>
                </div>
                <button class="btn-back" id="btn-back">
                    <i class="fas fa-arrow-left"></i>
                </button>
            </div>

            <!-- Section Tabs -->
            <div class="section-tabs" id="section-tabs">
                ${visibleSections.map(([key, config]) => `
                    <button class="section-tab ${key === currentSection ? 'active' : ''}" data-section="${key}">
                        <i class="fas ${config.icon}"></i>
                        <span>${config.label}</span>
                    </button>
                `).join('')}
            </div>

            <!-- Section Content -->
            <div class="section-content" id="section-content">
                <!-- Content will be loaded here -->
            </div>
        </div>
    `;

    // Inject styles
    injectStyles();

    // Setup back button
    container.querySelector('#btn-back').addEventListener('click', () => {
        router.navigate('sunday-clinic');
    });

    // Setup tab clicks
    container.querySelectorAll('.section-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            const section = tab.dataset.section;
            switchSection(section);
        });
    });

    // Scroll active tab into view
    const activeTab = container.querySelector('.section-tab.active');
    if (activeTab) {
        activeTab.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }

    // Load current section content
    loadSectionContent(currentSection);
}

function switchSection(section) {
    currentSection = section;

    // Update tab active state
    document.querySelectorAll('.section-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.section === section);
    });

    // Scroll active tab into view
    const activeTab = document.querySelector('.section-tab.active');
    if (activeTab) {
        activeTab.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }

    // Load section content
    loadSectionContent(section);
}

async function loadSectionContent(section) {
    const contentContainer = document.getElementById('section-content');

    // Show loading
    contentContainer.innerHTML = `
        <div class="loading-state small">
            <i class="fas fa-spinner fa-spin"></i>
        </div>
    `;

    try {
        // Dynamic import of section component
        let html = '';

        switch (section) {
            case 'identity':
                html = renderIdentitySection();
                break;
            case 'anamnesa':
                html = renderAnamnesaSection();
                break;
            case 'physical_exam':
                html = renderPhysicalExamSection();
                break;
            case 'pemeriksaan_obstetri':
                html = renderPemeriksaanObstetriSection();
                break;
            case 'pemeriksaan_ginekologi':
                html = renderPemeriksaanGynSection();
                break;
            case 'usg':
                html = renderUSGSection();
                break;
            case 'penunjang':
                html = renderPenunjangSection();
                break;
            case 'diagnosis':
                html = renderDiagnosisSection();
                break;
            case 'plan':
                html = renderPlanSection();
                break;
            case 'resume':
                html = renderResumeSection();
                break;
            case 'billing':
                html = renderBillingSection();
                break;
            default:
                html = `<div class="empty-state"><p>Section tidak ditemukan</p></div>`;
        }

        contentContainer.innerHTML = html;

        // Setup section-specific event handlers
        setupSectionHandlers(section);

    } catch (error) {
        contentContainer.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-exclamation-triangle"></i>
                <p>${error.message}</p>
            </div>
        `;
    }
}

// ===== Section Renderers =====

function renderIdentitySection() {
    const { record, patient, appointment, intake } = currentRecord;

    return `
        <div class="section-form">
            <div class="info-card">
                <h4>Informasi Pasien</h4>
                <div class="info-row">
                    <span class="label">Nama Lengkap</span>
                    <span class="value">${patient?.full_name || '-'}</span>
                </div>
                <div class="info-row">
                    <span class="label">ID Pasien</span>
                    <span class="value">${patient?.id || '-'}</span>
                </div>
                <div class="info-row">
                    <span class="label">Umur</span>
                    <span class="value">${patient?.age || calculateAge(patient?.date_of_birth) || '-'} tahun</span>
                </div>
                <div class="info-row">
                    <span class="label">No. HP</span>
                    <span class="value">${patient?.phone || patient?.whatsapp || '-'}</span>
                </div>
                <div class="info-row">
                    <span class="label">Email</span>
                    <span class="value">${patient?.email || '-'}</span>
                </div>
            </div>

            <div class="info-card">
                <h4>Informasi Kunjungan</h4>
                <div class="info-row">
                    <span class="label">MR ID</span>
                    <span class="value">${record?.mr_id || '-'}</span>
                </div>
                <div class="info-row">
                    <span class="label">Kategori</span>
                    <span class="value">${getCategoryLabel(record?.mr_category)}</span>
                </div>
                <div class="info-row">
                    <span class="label">Lokasi</span>
                    <span class="value">${getLocationLabel(record?.visit_location)}</span>
                </div>
                <div class="info-row">
                    <span class="label">Status</span>
                    <span class="value">${getStatusLabel(record?.status)}</span>
                </div>
                <div class="info-row">
                    <span class="label">Tanggal</span>
                    <span class="value">${formatDate(record?.created_at)}</span>
                </div>
            </div>

            ${intake ? `
            <div class="info-card">
                <h4>Keluhan (dari Intake)</h4>
                <p class="intake-complaint">${intake?.payload?.chief_complaint || appointment?.chief_complaint || '-'}</p>
            </div>
            ` : ''}
        </div>
    `;
}

function renderAnamnesaSection() {
    const { medicalRecords, record } = currentRecord;
    const anamnesa = medicalRecords?.byType?.anamnesa?.[0]?.record_data || {};
    const category = record?.mr_category || 'obstetri';

    return `
        <div class="section-form">
            <div class="form-group">
                <label>Tanggal & Waktu Pemeriksaan *</label>
                <input type="datetime-local" id="record_datetime" value="${anamnesa.record_datetime || ''}" required>
            </div>

            <div class="form-group">
                <label>Keluhan Utama *</label>
                <textarea id="keluhan_utama" rows="3" placeholder="Keluhan utama pasien...">${anamnesa.keluhan_utama || ''}</textarea>
            </div>

            ${category === 'obstetri' ? `
            <div class="form-divider">Kehamilan</div>
            <div class="form-row">
                <div class="form-group half">
                    <label>HPHT</label>
                    <input type="date" id="hpht" value="${anamnesa.hpht || ''}">
                </div>
                <div class="form-group half">
                    <label>HPL (auto)</label>
                    <input type="date" id="hpl" value="${anamnesa.hpl || ''}" readonly>
                </div>
            </div>

            <div class="form-divider">Riwayat Obstetri</div>
            <div class="form-row four-col">
                <div class="form-group">
                    <label>G</label>
                    <input type="number" id="gravida" value="${anamnesa.gravida || ''}" min="0">
                </div>
                <div class="form-group">
                    <label>P</label>
                    <input type="number" id="para" value="${anamnesa.para || ''}" min="0">
                </div>
                <div class="form-group">
                    <label>A</label>
                    <input type="number" id="abortus" value="${anamnesa.abortus || ''}" min="0">
                </div>
                <div class="form-group">
                    <label>H</label>
                    <input type="number" id="anak_hidup" value="${anamnesa.anak_hidup || ''}" min="0">
                </div>
            </div>
            ` : `
            <div class="form-divider">Riwayat Menstruasi</div>
            <div class="form-row">
                <div class="form-group half">
                    <label>Usia Menarche</label>
                    <input type="number" id="usia_menarche" value="${anamnesa.usia_menarche || ''}" min="0">
                </div>
                <div class="form-group half">
                    <label>Lama Siklus (hari)</label>
                    <input type="number" id="lama_siklus" value="${anamnesa.lama_siklus || ''}" min="0">
                </div>
            </div>
            `}

            <div class="form-divider">Alergi</div>
            <div class="form-group">
                <label>Alergi Obat</label>
                <input type="text" id="alergi_obat" value="${anamnesa.alergi_obat || '-'}" placeholder="-">
            </div>
            <div class="form-group">
                <label>Alergi Makanan</label>
                <input type="text" id="alergi_makanan" value="${anamnesa.alergi_makanan || '-'}" placeholder="-">
            </div>

            <button class="btn-primary btn-save" id="btn-save-anamnesa">
                <i class="fas fa-save"></i> Simpan Anamnesa
            </button>
        </div>
    `;
}

function renderPhysicalExamSection() {
    const { medicalRecords } = currentRecord;
    const pe = medicalRecords?.byType?.physical_exam?.[0]?.record_data || {};

    return `
        <div class="section-form">
            <div class="form-group">
                <label>Tanggal & Waktu Pemeriksaan *</label>
                <input type="datetime-local" id="record_datetime" value="${pe.record_datetime || ''}" required>
            </div>

            <div class="form-divider">Tanda Vital</div>
            <div class="form-row">
                <div class="form-group half">
                    <label>Tekanan Darah</label>
                    <input type="text" id="tekanan_darah" value="${pe.tekanan_darah || ''}" placeholder="120/80">
                </div>
                <div class="form-group half">
                    <label>Nadi (bpm)</label>
                    <input type="number" id="nadi" value="${pe.nadi || ''}" min="0">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group half">
                    <label>Suhu (°C)</label>
                    <input type="number" id="suhu" value="${pe.suhu || ''}" step="0.1" min="30" max="45">
                </div>
                <div class="form-group half">
                    <label>Respirasi</label>
                    <input type="number" id="respirasi" value="${pe.respirasi || ''}" min="0">
                </div>
            </div>

            <div class="form-divider">Antropometri</div>
            <div class="form-row">
                <div class="form-group half">
                    <label>Tinggi Badan (cm)</label>
                    <input type="number" id="tinggi_badan" value="${pe.tinggi_badan || ''}" min="0">
                </div>
                <div class="form-group half">
                    <label>Berat Badan (kg)</label>
                    <input type="number" id="berat_badan" value="${pe.berat_badan || ''}" min="0" step="0.1">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group half">
                    <label>IMT</label>
                    <input type="text" id="imt" value="${pe.imt || ''}" readonly>
                </div>
                <div class="form-group half">
                    <label>Kategori</label>
                    <input type="text" id="kategori_imt" value="${pe.kategori_imt || ''}" readonly>
                </div>
            </div>

            <div class="form-divider">Pemeriksaan Fisik</div>
            <div class="form-group">
                <label>Kepala & Leher</label>
                <textarea id="kepala_leher" rows="2">${pe.kepala_leher || 'Normal'}</textarea>
            </div>
            <div class="form-group">
                <label>Thorax</label>
                <textarea id="thorax" rows="2">${pe.thorax || 'Normal'}</textarea>
            </div>
            <div class="form-group">
                <label>Abdomen</label>
                <textarea id="abdomen" rows="2">${pe.abdomen || 'Normal'}</textarea>
            </div>
            <div class="form-group">
                <label>Ekstremitas</label>
                <textarea id="ekstremitas" rows="2">${pe.ekstremitas || 'Normal'}</textarea>
            </div>

            <button class="btn-primary btn-save" id="btn-save-physical">
                <i class="fas fa-save"></i> Simpan Pemeriksaan Fisik
            </button>
        </div>
    `;
}

function renderPemeriksaanObstetriSection() {
    const { medicalRecords } = currentRecord;
    const pobs = medicalRecords?.byType?.pemeriksaan_obstetri?.[0]?.record_data || {};

    return `
        <div class="section-form">
            <div class="form-group">
                <label>Tanggal & Waktu Pemeriksaan *</label>
                <input type="datetime-local" id="record_datetime" value="${pobs.record_datetime || ''}" required>
            </div>

            <div class="form-row">
                <div class="form-group half">
                    <label>TFU (cm)</label>
                    <input type="number" id="tfu" value="${pobs.tfu || ''}" min="0">
                </div>
                <div class="form-group half">
                    <label>DJJ (bpm)</label>
                    <input type="number" id="djj" value="${pobs.djj || ''}" min="0">
                </div>
            </div>

            <div class="form-group">
                <label>Leopold / Palpasi</label>
                <textarea id="leopold" rows="3">${pobs.leopold || ''}</textarea>
            </div>

            <div class="form-group">
                <label>Vaginal Toucher (VT)</label>
                <textarea id="vt" rows="3">${pobs.vt || ''}</textarea>
            </div>

            <div class="form-group">
                <label>Catatan Lain</label>
                <textarea id="catatan" rows="2">${pobs.catatan || ''}</textarea>
            </div>

            <button class="btn-primary btn-save" id="btn-save-pobs">
                <i class="fas fa-save"></i> Simpan Pemeriksaan Obstetri
            </button>
        </div>
    `;
}

function renderPemeriksaanGynSection() {
    const { medicalRecords } = currentRecord;
    const pgyn = medicalRecords?.byType?.pemeriksaan_ginekologi?.[0]?.record_data || {};

    return `
        <div class="section-form">
            <div class="form-group">
                <label>Tanggal & Waktu Pemeriksaan *</label>
                <input type="datetime-local" id="record_datetime" value="${pgyn.record_datetime || ''}" required>
            </div>

            <div class="form-group">
                <label>Inspeksi</label>
                <textarea id="inspeksi" rows="2">${pgyn.inspeksi || ''}</textarea>
            </div>

            <div class="form-group">
                <label>Inspekulo</label>
                <textarea id="inspekulo" rows="3">${pgyn.inspekulo || ''}</textarea>
            </div>

            <div class="form-group">
                <label>Bimanual</label>
                <textarea id="bimanual" rows="3">${pgyn.bimanual || ''}</textarea>
            </div>

            <div class="form-group">
                <label>Catatan Lain</label>
                <textarea id="catatan" rows="2">${pgyn.catatan || ''}</textarea>
            </div>

            <button class="btn-primary btn-save" id="btn-save-pgyn">
                <i class="fas fa-save"></i> Simpan Pemeriksaan Ginekologi
            </button>
        </div>
    `;
}

function renderUSGSection() {
    const { medicalRecords, record } = currentRecord;
    const usg = medicalRecords?.byType?.usg?.[0]?.record_data || {};
    const category = record?.mr_category || 'obstetri';
    const isObstetri = category === 'obstetri';

    if (isObstetri) {
        return renderUSGObstetriSection(usg);
    } else {
        return renderUSGGynSection(usg);
    }
}

function renderUSGObstetriSection(usg) {
    const trimester = usg.current_trimester || 'second';
    const data = usg[`trimester_${trimester === 'first' ? '1' : trimester === 'second' ? '2' : trimester === 'screening' ? 'screening' : '3'}`] || {};

    return `
        <div class="section-form">
            <div class="form-group">
                <label>Tanggal & Waktu Pemeriksaan *</label>
                <input type="datetime-local" id="record_datetime" value="${usg.record_datetime || ''}" required>
            </div>

            <div class="trimester-tabs">
                <button class="trim-tab ${trimester === 'first' ? 'active' : ''}" data-trim="first">TM 1</button>
                <button class="trim-tab ${trimester === 'second' ? 'active' : ''}" data-trim="second">TM 2</button>
                <button class="trim-tab ${trimester === 'screening' ? 'active' : ''}" data-trim="screening">Screening</button>
                <button class="trim-tab ${trimester === 'third' ? 'active' : ''}" data-trim="third">TM 3</button>
            </div>

            <div class="form-divider">Biometri</div>
            <div class="form-row four-col">
                <div class="form-group">
                    <label>BPD</label>
                    <input type="number" id="bpd" value="${data.bpd || ''}" step="0.1">
                </div>
                <div class="form-group">
                    <label>AC</label>
                    <input type="number" id="ac" value="${data.ac || ''}" step="0.1">
                </div>
                <div class="form-group">
                    <label>FL</label>
                    <input type="number" id="fl" value="${data.fl || ''}" step="0.1">
                </div>
                <div class="form-group">
                    <label>HC</label>
                    <input type="number" id="hc" value="${data.hc || ''}" step="0.1">
                </div>
            </div>

            <div class="form-row">
                <div class="form-group half">
                    <label>EFW (gram)</label>
                    <input type="number" id="efw" value="${data.efw || ''}" min="0">
                </div>
                <div class="form-group half">
                    <label>FHR (bpm)</label>
                    <input type="number" id="heart_rate" value="${data.heart_rate || ''}" min="0">
                </div>
            </div>

            <div class="form-row">
                <div class="form-group half">
                    <label>AFI</label>
                    <input type="number" id="afi" value="${data.afi || ''}" step="0.1">
                </div>
                <div class="form-group half">
                    <label>Plasenta</label>
                    <select id="placenta">
                        <option value="">-</option>
                        <option value="Anterior" ${data.placenta === 'Anterior' ? 'selected' : ''}>Anterior</option>
                        <option value="Posterior" ${data.placenta === 'Posterior' ? 'selected' : ''}>Posterior</option>
                        <option value="Fundus" ${data.placenta === 'Fundus' ? 'selected' : ''}>Fundus</option>
                        <option value="Lateral" ${data.placenta === 'Lateral' ? 'selected' : ''}>Lateral</option>
                    </select>
                </div>
            </div>

            <div class="form-group">
                <label>Gender</label>
                <select id="gender">
                    <option value="">-</option>
                    <option value="male" ${data.gender === 'male' ? 'selected' : ''}>Laki-laki</option>
                    <option value="female" ${data.gender === 'female' ? 'selected' : ''}>Perempuan</option>
                </select>
            </div>

            <div class="form-group">
                <label>Catatan</label>
                <textarea id="notes" rows="2">${usg.notes || ''}</textarea>
            </div>

            <button class="btn-primary btn-save" id="btn-save-usg">
                <i class="fas fa-save"></i> Simpan USG
            </button>
        </div>
    `;
}

function renderUSGGynSection(usg) {
    return `
        <div class="section-form">
            <div class="form-group">
                <label>Tanggal & Waktu Pemeriksaan *</label>
                <input type="datetime-local" id="record_datetime" value="${usg.record_datetime || ''}" required>
            </div>

            <div class="form-divider">Uterus</div>
            <div class="form-group">
                <label>Posisi</label>
                <select id="uterus_posisi">
                    <option value="Anteversi" ${usg.uterus_posisi === 'Anteversi' ? 'selected' : ''}>Anteversi</option>
                    <option value="Retroversi" ${usg.uterus_posisi === 'Retroversi' ? 'selected' : ''}>Retroversi</option>
                </select>
            </div>
            <div class="form-row three-col">
                <div class="form-group">
                    <label>Panjang</label>
                    <input type="number" id="uterus_length" value="${usg.uterus_length || ''}" step="0.1">
                </div>
                <div class="form-group">
                    <label>Lebar</label>
                    <input type="number" id="uterus_width" value="${usg.uterus_width || ''}" step="0.1">
                </div>
                <div class="form-group">
                    <label>Tebal</label>
                    <input type="number" id="uterus_depth" value="${usg.uterus_depth || ''}" step="0.1">
                </div>
            </div>

            <div class="form-group">
                <label>Endometrium (mm)</label>
                <input type="number" id="endometrium_thickness" value="${usg.endometrium_thickness || ''}" step="0.1">
            </div>

            <div class="form-divider">Ovarium</div>
            <div class="form-group">
                <label>Ovarium Kanan</label>
                <textarea id="ovarium_kanan" rows="2">${usg.ovarium_kanan || ''}</textarea>
            </div>
            <div class="form-group">
                <label>Ovarium Kiri</label>
                <textarea id="ovarium_kiri" rows="2">${usg.ovarium_kiri || ''}</textarea>
            </div>

            <div class="form-group">
                <label>Kesan</label>
                <textarea id="kesan" rows="3">${usg.kesan || ''}</textarea>
            </div>

            <button class="btn-primary btn-save" id="btn-save-usg">
                <i class="fas fa-save"></i> Simpan USG
            </button>
        </div>
    `;
}

function renderPenunjangSection() {
    const { medicalRecords } = currentRecord;
    const penunjang = medicalRecords?.byType?.penunjang?.[0]?.record_data || {};

    return `
        <div class="section-form">
            <div class="form-group">
                <label>Tanggal & Waktu *</label>
                <input type="datetime-local" id="record_datetime" value="${penunjang.record_datetime || ''}" required>
            </div>

            <div class="form-group">
                <label>Upload Hasil Lab</label>
                <input type="file" id="lab-files" accept="image/*,.pdf" multiple>
                <p class="help-text">Foto atau PDF hasil lab</p>
            </div>

            <div id="file-list" class="file-list">
                ${(penunjang.files || []).map(f => `
                    <div class="file-item">
                        <i class="fas fa-file"></i>
                        <span>${f.name}</span>
                    </div>
                `).join('')}
            </div>

            ${penunjang.interpretation ? `
            <div class="interpretation-box">
                <h4><i class="fas fa-robot"></i> Interpretasi AI</h4>
                <p>${penunjang.interpretation}</p>
            </div>
            ` : `
            <button class="btn-secondary btn-block" id="btn-interpret" disabled>
                <i class="fas fa-magic"></i> Interpretasi AI
            </button>
            `}

            <button class="btn-primary btn-save" id="btn-save-penunjang">
                <i class="fas fa-save"></i> Simpan Penunjang
            </button>
        </div>
    `;
}

function renderDiagnosisSection() {
    const { medicalRecords } = currentRecord;
    const diag = medicalRecords?.byType?.diagnosis?.[0]?.record_data || {};

    return `
        <div class="section-form">
            <div class="form-group">
                <label>Tanggal & Waktu *</label>
                <input type="datetime-local" id="record_datetime" value="${diag.record_datetime || ''}" required>
            </div>

            <div class="form-group">
                <label>Diagnosis Utama *</label>
                <textarea id="diagnosis_utama" rows="3" placeholder="Diagnosis utama...">${diag.diagnosis_utama || ''}</textarea>
            </div>

            <div class="form-group">
                <label>Diagnosis Sekunder</label>
                <textarea id="diagnosis_sekunder" rows="2" placeholder="Diagnosis tambahan...">${diag.diagnosis_sekunder || ''}</textarea>
            </div>

            <button class="btn-primary btn-save" id="btn-save-diagnosis">
                <i class="fas fa-save"></i> Simpan Diagnosis
            </button>
        </div>
    `;
}

function renderPlanSection() {
    const { medicalRecords } = currentRecord;
    const plan = medicalRecords?.byType?.planning?.[0]?.record_data || {};

    const tindakan = Array.isArray(plan.tindakan) ? plan.tindakan.join('\n') : (plan.tindakan || '');
    const terapi = Array.isArray(plan.terapi) ? plan.terapi.join('\n') : (plan.terapi || '');

    return `
        <div class="section-form">
            <div class="form-group">
                <label>Tanggal & Waktu *</label>
                <input type="datetime-local" id="record_datetime" value="${plan.record_datetime || ''}" required>
            </div>

            <div class="form-group">
                <label>Tindakan</label>
                <textarea id="tindakan" rows="3" placeholder="USG, CTG, dll...">${tindakan}</textarea>
            </div>

            <div class="form-group">
                <label>Terapi / Obat</label>
                <textarea id="terapi" rows="3" placeholder="Vitamin, antibiotik, dll...">${terapi}</textarea>
            </div>

            <div class="form-group">
                <label>Rencana Follow-up</label>
                <textarea id="rencana" rows="2" placeholder="Kontrol 2 minggu lagi...">${plan.rencana || ''}</textarea>
            </div>

            <div class="form-group">
                <label>Edukasi</label>
                <textarea id="edukasi" rows="2" placeholder="Edukasi pasien...">${plan.edukasi || ''}</textarea>
            </div>

            <button class="btn-primary btn-save" id="btn-save-plan">
                <i class="fas fa-save"></i> Simpan Planning
            </button>
        </div>
    `;
}

function renderResumeSection() {
    const { medicalRecords } = currentRecord;
    const resume = medicalRecords?.byType?.resume_medis?.[0]?.record_data || {};

    return `
        <div class="section-form">
            <div class="form-group">
                <label>Resume Medis</label>
                <textarea id="resume" rows="10" placeholder="Resume akan digenerate otomatis...">${resume.resume || ''}</textarea>
            </div>

            <div class="btn-row">
                <button class="btn-secondary" id="btn-generate-resume">
                    <i class="fas fa-magic"></i> Generate
                </button>
                <button class="btn-primary" id="btn-save-resume">
                    <i class="fas fa-save"></i> Simpan
                </button>
            </div>

            <div class="btn-row">
                <button class="btn-secondary btn-block" id="btn-download-pdf">
                    <i class="fas fa-file-pdf"></i> Download PDF
                </button>
            </div>
        </div>
    `;
}

function renderBillingSection() {
    const { record } = currentRecord;
    const mrId = record?.mr_id;

    return `
        <div class="section-form">
            <div class="billing-loading">
                <i class="fas fa-spinner fa-spin"></i>
                <p>Memuat billing...</p>
            </div>
        </div>
    `;
}

// ===== Section Handlers =====

function setupSectionHandlers(section) {
    switch (section) {
        case 'anamnesa':
            setupAnamnesaHandlers();
            break;
        case 'physical_exam':
            setupPhysicalExamHandlers();
            break;
        case 'pemeriksaan_obstetri':
            setupPemeriksaanObstetriHandlers();
            break;
        case 'pemeriksaan_ginekologi':
            setupPemeriksaanGynHandlers();
            break;
        case 'usg':
            setupUSGHandlers();
            break;
        case 'diagnosis':
            setupDiagnosisHandlers();
            break;
        case 'plan':
            setupPlanHandlers();
            break;
        case 'resume':
            setupResumeHandlers();
            break;
        case 'billing':
            loadBillingData();
            break;
    }
}

function setupAnamnesaHandlers() {
    // HPL auto-calculate
    const hphtInput = document.getElementById('hpht');
    const hplInput = document.getElementById('hpl');

    if (hphtInput && hplInput) {
        hphtInput.addEventListener('change', () => {
            if (hphtInput.value) {
                const hpht = new Date(hphtInput.value);
                const hpl = new Date(hpht.getTime() + 280 * 24 * 60 * 60 * 1000);
                hplInput.value = hpl.toISOString().split('T')[0];
            }
        });
    }

    // Save button
    document.getElementById('btn-save-anamnesa')?.addEventListener('click', () => saveSection('anamnesa'));
}

function setupPhysicalExamHandlers() {
    // IMT auto-calculate
    const tbInput = document.getElementById('tinggi_badan');
    const bbInput = document.getElementById('berat_badan');
    const imtInput = document.getElementById('imt');
    const kategoriInput = document.getElementById('kategori_imt');

    const calculateIMT = () => {
        const tb = parseFloat(tbInput.value);
        const bb = parseFloat(bbInput.value);

        if (tb > 0 && bb > 0) {
            const imt = bb / Math.pow(tb / 100, 2);
            imtInput.value = imt.toFixed(1);

            let kategori = '';
            if (imt < 18.5) kategori = 'Underweight';
            else if (imt < 25) kategori = 'Normal';
            else if (imt < 30) kategori = 'Overweight';
            else kategori = 'Obesitas';
            kategoriInput.value = kategori;
        }
    };

    tbInput?.addEventListener('input', calculateIMT);
    bbInput?.addEventListener('input', calculateIMT);

    // Save button
    document.getElementById('btn-save-physical')?.addEventListener('click', () => saveSection('physical_exam'));
}

function setupPemeriksaanObstetriHandlers() {
    document.getElementById('btn-save-pobs')?.addEventListener('click', () => saveSection('pemeriksaan_obstetri'));
}

function setupPemeriksaanGynHandlers() {
    document.getElementById('btn-save-pgyn')?.addEventListener('click', () => saveSection('pemeriksaan_ginekologi'));
}

function setupUSGHandlers() {
    // Trimester tabs
    document.querySelectorAll('.trim-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.trim-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            // TODO: Switch trimester data
        });
    });

    document.getElementById('btn-save-usg')?.addEventListener('click', () => saveSection('usg'));
}

function setupDiagnosisHandlers() {
    document.getElementById('btn-save-diagnosis')?.addEventListener('click', () => saveSection('diagnosis'));
}

function setupPlanHandlers() {
    document.getElementById('btn-save-plan')?.addEventListener('click', () => saveSection('planning'));
}

function setupResumeHandlers() {
    document.getElementById('btn-generate-resume')?.addEventListener('click', generateResume);
    document.getElementById('btn-save-resume')?.addEventListener('click', () => saveSection('resume_medis'));
    document.getElementById('btn-download-pdf')?.addEventListener('click', downloadResumePdf);
}

async function loadBillingData() {
    const { record } = currentRecord;
    const mrId = record?.mr_id;

    try {
        const response = await api.getBilling(mrId);
        const billing = response.data || response;

        const container = document.querySelector('.billing-loading').parentNode;
        container.innerHTML = renderBillingContent(billing);

        // Setup billing handlers
        document.getElementById('btn-confirm-billing')?.addEventListener('click', () => confirmBilling(mrId));
        document.getElementById('btn-mark-paid')?.addEventListener('click', () => markBillingPaid(mrId));

    } catch (error) {
        document.querySelector('.billing-loading').innerHTML = `
            <div class="empty-state small">
                <i class="fas fa-receipt"></i>
                <p>Belum ada billing</p>
            </div>
        `;
    }
}

function renderBillingContent(billing) {
    const items = billing.items || [];
    const total = billing.total || 0;
    const status = billing.status || 'draft';

    return `
        <div class="billing-summary">
            <div class="billing-items">
                ${items.length === 0 ? `
                    <div class="empty-state small">
                        <p>Belum ada item</p>
                    </div>
                ` : items.map(item => `
                    <div class="billing-item">
                        <div class="item-name">${item.item_name}</div>
                        <div class="item-qty">${item.quantity}x</div>
                        <div class="item-price">Rp ${formatNumber(item.price)}</div>
                    </div>
                `).join('')}
            </div>

            <div class="billing-total">
                <span>Total</span>
                <span>Rp ${formatNumber(total)}</span>
            </div>

            <div class="billing-status">
                Status: <span class="status-badge ${status}">${getStatusLabel(status)}</span>
            </div>

            <div class="btn-row">
                ${status !== 'confirmed' && status !== 'paid' ? `
                    <button class="btn-primary" id="btn-confirm-billing">
                        <i class="fas fa-check"></i> Confirm
                    </button>
                ` : ''}
                ${status === 'confirmed' ? `
                    <button class="btn-success" id="btn-mark-paid">
                        <i class="fas fa-money-bill"></i> Mark Paid
                    </button>
                ` : ''}
            </div>
        </div>
    `;
}

// ===== Save Functions =====

async function saveSection(sectionName) {
    const { record } = currentRecord;
    const mrId = record?.mr_id;

    // Validate datetime
    const datetime = document.getElementById('record_datetime')?.value;
    if (!datetime) {
        showToast('Tanggal & waktu pemeriksaan wajib diisi', 'error');
        return;
    }

    // Collect form data based on section
    const data = collectSectionData(sectionName, datetime);

    showLoading();

    try {
        const response = await api.saveSection(mrId, sectionName, data);

        if (response.success) {
            showToast('Data berhasil disimpan');
            // Reload record to get updated data
            const refreshResponse = await api.getRecord(mrId);
            if (refreshResponse.success) {
                currentRecord = refreshResponse.data;
            }
        } else {
            showToast(response.message || 'Gagal menyimpan', 'error');
        }
    } catch (error) {
        showToast(error.message, 'error');
    } finally {
        hideLoading();
    }
}

function collectSectionData(section, datetime) {
    const [date, time] = datetime.split('T');
    const baseData = {
        record_datetime: datetime,
        record_date: date,
        record_time: time
    };

    switch (section) {
        case 'anamnesa':
            return {
                ...baseData,
                keluhan_utama: document.getElementById('keluhan_utama')?.value || '',
                hpht: document.getElementById('hpht')?.value || '',
                hpl: document.getElementById('hpl')?.value || '',
                gravida: parseInt(document.getElementById('gravida')?.value) || 0,
                para: parseInt(document.getElementById('para')?.value) || 0,
                abortus: parseInt(document.getElementById('abortus')?.value) || 0,
                anak_hidup: parseInt(document.getElementById('anak_hidup')?.value) || 0,
                usia_menarche: document.getElementById('usia_menarche')?.value || '',
                lama_siklus: document.getElementById('lama_siklus')?.value || '',
                alergi_obat: document.getElementById('alergi_obat')?.value || '-',
                alergi_makanan: document.getElementById('alergi_makanan')?.value || '-'
            };

        case 'physical_exam':
            return {
                ...baseData,
                tekanan_darah: document.getElementById('tekanan_darah')?.value || '',
                nadi: parseInt(document.getElementById('nadi')?.value) || 0,
                suhu: parseFloat(document.getElementById('suhu')?.value) || 0,
                respirasi: parseInt(document.getElementById('respirasi')?.value) || 0,
                tinggi_badan: parseInt(document.getElementById('tinggi_badan')?.value) || 0,
                berat_badan: parseFloat(document.getElementById('berat_badan')?.value) || 0,
                imt: document.getElementById('imt')?.value || '',
                kategori_imt: document.getElementById('kategori_imt')?.value || '',
                kepala_leher: document.getElementById('kepala_leher')?.value || '',
                thorax: document.getElementById('thorax')?.value || '',
                abdomen: document.getElementById('abdomen')?.value || '',
                ekstremitas: document.getElementById('ekstremitas')?.value || ''
            };

        case 'pemeriksaan_obstetri':
            return {
                ...baseData,
                tfu: document.getElementById('tfu')?.value || '',
                djj: document.getElementById('djj')?.value || '',
                leopold: document.getElementById('leopold')?.value || '',
                vt: document.getElementById('vt')?.value || '',
                catatan: document.getElementById('catatan')?.value || ''
            };

        case 'pemeriksaan_ginekologi':
            return {
                ...baseData,
                inspeksi: document.getElementById('inspeksi')?.value || '',
                inspekulo: document.getElementById('inspekulo')?.value || '',
                bimanual: document.getElementById('bimanual')?.value || '',
                catatan: document.getElementById('catatan')?.value || ''
            };

        case 'usg':
            const activeTrim = document.querySelector('.trim-tab.active')?.dataset.trim || 'second';
            return {
                ...baseData,
                current_trimester: activeTrim,
                bpd: document.getElementById('bpd')?.value || '',
                ac: document.getElementById('ac')?.value || '',
                fl: document.getElementById('fl')?.value || '',
                hc: document.getElementById('hc')?.value || '',
                efw: document.getElementById('efw')?.value || '',
                heart_rate: document.getElementById('heart_rate')?.value || '',
                afi: document.getElementById('afi')?.value || '',
                placenta: document.getElementById('placenta')?.value || '',
                gender: document.getElementById('gender')?.value || '',
                notes: document.getElementById('notes')?.value || '',
                // Gyn fields
                uterus_posisi: document.getElementById('uterus_posisi')?.value || '',
                uterus_length: document.getElementById('uterus_length')?.value || '',
                uterus_width: document.getElementById('uterus_width')?.value || '',
                uterus_depth: document.getElementById('uterus_depth')?.value || '',
                endometrium_thickness: document.getElementById('endometrium_thickness')?.value || '',
                ovarium_kanan: document.getElementById('ovarium_kanan')?.value || '',
                ovarium_kiri: document.getElementById('ovarium_kiri')?.value || '',
                kesan: document.getElementById('kesan')?.value || ''
            };

        case 'diagnosis':
            return {
                ...baseData,
                diagnosis_utama: document.getElementById('diagnosis_utama')?.value || '',
                diagnosis_sekunder: document.getElementById('diagnosis_sekunder')?.value || ''
            };

        case 'planning':
            return {
                ...baseData,
                tindakan: document.getElementById('tindakan')?.value?.split('\n').filter(Boolean) || [],
                terapi: document.getElementById('terapi')?.value?.split('\n').filter(Boolean) || [],
                rencana: document.getElementById('rencana')?.value || '',
                edukasi: document.getElementById('edukasi')?.value || ''
            };

        case 'resume_medis':
            return {
                ...baseData,
                resume: document.getElementById('resume')?.value || ''
            };

        default:
            return baseData;
    }
}

async function generateResume() {
    const { record } = currentRecord;
    showLoading();

    try {
        const response = await api.generateResume(record.mr_id);
        if (response.success) {
            document.getElementById('resume').value = response.data?.resume || response.resume || '';
            showToast('Resume berhasil digenerate');
        } else {
            showToast(response.message || 'Gagal generate resume', 'error');
        }
    } catch (error) {
        showToast(error.message, 'error');
    } finally {
        hideLoading();
    }
}

async function downloadResumePdf() {
    const { record, patient } = currentRecord;
    showLoading();

    try {
        const response = await api.getResumePdf(record.mr_id, patient.id);
        if (response.success && response.downloadUrl) {
            window.open(response.downloadUrl, '_blank');
        } else {
            showToast(response.message || 'Gagal download PDF', 'error');
        }
    } catch (error) {
        showToast(error.message, 'error');
    } finally {
        hideLoading();
    }
}

async function confirmBilling(mrId) {
    if (!confirm('Konfirmasi billing ini?')) return;

    showLoading();
    try {
        const response = await api.confirmBilling(mrId);
        if (response.success) {
            showToast('Billing dikonfirmasi');
            loadBillingData();
        } else {
            showToast(response.message || 'Gagal konfirmasi', 'error');
        }
    } catch (error) {
        showToast(error.message, 'error');
    } finally {
        hideLoading();
    }
}

async function markBillingPaid(mrId) {
    if (!confirm('Tandai sudah dibayar?')) return;

    showLoading();
    try {
        const response = await api.markBillingPaid(mrId);
        if (response.success) {
            showToast('Pembayaran dicatat');
            loadBillingData();
        } else {
            showToast(response.message || 'Gagal mencatat pembayaran', 'error');
        }
    } catch (error) {
        showToast(error.message, 'error');
    } finally {
        hideLoading();
    }
}

// ===== Helper Functions =====

function getCategoryClass(category) {
    return category === 'obstetri' ? 'obstetri' : 'gyn';
}

function getCategoryLabel(category) {
    const labels = { obstetri: 'Obstetri', gyn_repro: 'Gyn Repro', gyn_special: 'Gyn Special' };
    return labels[category] || category;
}

function getLocationLabel(location) {
    const labels = {
        klinik_private: 'Klinik Privat',
        rsia_melinda: 'RSIA Melinda',
        rsud_gambiran: 'RSUD Gambiran',
        rs_bhayangkara: 'RS Bhayangkara'
    };
    return labels[location] || location;
}

function getStatusLabel(status) {
    const labels = {
        draft: 'Draft',
        finalized: 'Selesai',
        confirmed: 'Dikonfirmasi',
        paid: 'Lunas'
    };
    return labels[status] || status;
}

function calculateAge(dob) {
    if (!dob) return null;
    const birth = new Date(dob);
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
    return age;
}

function formatDate(dateStr) {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`;
}

function formatNumber(num) {
    return new Intl.NumberFormat('id-ID').format(num || 0);
}

function injectStyles() {
    if (document.getElementById('medical-record-styles')) return;

    const style = document.createElement('style');
    style.id = 'medical-record-styles';
    style.textContent = `
        .medical-record {
            padding-bottom: 80px;
        }

        .patient-header {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 16px;
            background: var(--color-bg-card);
            border-radius: 0 0 16px 16px;
            margin-bottom: 8px;
        }

        .btn-back {
            width: 40px;
            height: 40px;
            border-radius: 10px;
            background: var(--color-bg-secondary);
            border: none;
            color: var(--color-text);
            font-size: 16px;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        .patient-info {
            flex: 1;
        }

        .patient-name {
            font-size: 18px;
            font-weight: 600;
        }

        .patient-meta {
            display: flex;
            flex-wrap: wrap;
            gap: 6px;
            margin-top: 6px;
        }

        .mr-badge {
            padding: 3px 8px;
            background: var(--color-primary);
            color: white;
            border-radius: 6px;
            font-size: 12px;
            font-weight: 600;
        }

        .category-badge, .location-badge {
            padding: 3px 8px;
            border-radius: 6px;
            font-size: 11px;
            font-weight: 500;
        }

        .category-badge.obstetri {
            background: rgba(236, 72, 153, 0.15);
            color: #ec4899;
        }

        .category-badge.gyn {
            background: rgba(59, 130, 246, 0.15);
            color: #3b82f6;
        }

        .location-badge {
            background: rgba(245, 158, 11, 0.15);
            color: #f59e0b;
        }

        /* Section Tabs */
        .section-tabs {
            display: flex;
            gap: 8px;
            padding: 8px 16px;
            overflow-x: auto;
            -webkit-overflow-scrolling: touch;
            scrollbar-width: none;
        }

        .section-tabs::-webkit-scrollbar {
            display: none;
        }

        .section-tab {
            flex-shrink: 0;
            padding: 10px 14px;
            border: none;
            border-radius: 10px;
            background: var(--color-bg-secondary);
            color: var(--color-text-secondary);
            font-size: 12px;
            font-weight: 500;
            display: flex;
            align-items: center;
            gap: 6px;
            white-space: nowrap;
        }

        .section-tab.active {
            background: var(--color-primary);
            color: white;
        }

        .section-tab i {
            font-size: 14px;
        }

        /* Section Content */
        .section-content {
            padding: 16px;
        }

        .section-form {
            display: flex;
            flex-direction: column;
            gap: 16px;
        }

        .form-group {
            display: flex;
            flex-direction: column;
            gap: 6px;
        }

        .form-group label {
            font-size: 13px;
            font-weight: 500;
            color: var(--color-text-secondary);
        }

        .form-group input,
        .form-group textarea,
        .form-group select {
            padding: 12px;
            border: 1px solid var(--color-bg-card);
            border-radius: 10px;
            background: var(--color-bg-secondary);
            color: var(--color-text);
            font-size: 14px;
            min-height: 44px;
        }

        .form-group textarea {
            min-height: 80px;
            resize: vertical;
        }

        .form-group input:focus,
        .form-group textarea:focus,
        .form-group select:focus {
            outline: none;
            border-color: var(--color-primary);
        }

        .form-group input[readonly] {
            opacity: 0.7;
        }

        .form-row {
            display: flex;
            gap: 12px;
        }

        .form-row .form-group.half {
            flex: 1;
        }

        .form-row.three-col .form-group,
        .form-row.four-col .form-group {
            flex: 1;
        }

        .form-divider {
            font-size: 13px;
            font-weight: 600;
            color: var(--color-primary);
            padding: 8px 0;
            border-top: 1px solid var(--color-bg-card);
            margin-top: 8px;
        }

        .btn-save {
            margin-top: 8px;
        }

        .btn-row {
            display: flex;
            gap: 12px;
            margin-top: 8px;
        }

        .btn-row button {
            flex: 1;
        }

        /* Info Card */
        .info-card {
            background: var(--color-bg-card);
            border-radius: 12px;
            padding: 16px;
        }

        .info-card h4 {
            font-size: 14px;
            font-weight: 600;
            margin-bottom: 12px;
            color: var(--color-primary);
        }

        .info-row {
            display: flex;
            justify-content: space-between;
            padding: 8px 0;
            border-bottom: 1px solid var(--color-bg-secondary);
        }

        .info-row:last-child {
            border-bottom: none;
        }

        .info-row .label {
            color: var(--color-text-secondary);
            font-size: 13px;
        }

        .info-row .value {
            font-weight: 500;
            font-size: 13px;
        }

        .intake-complaint {
            font-style: italic;
            color: var(--color-text-secondary);
        }

        /* Trimester Tabs */
        .trimester-tabs {
            display: flex;
            gap: 8px;
            margin-bottom: 16px;
        }

        .trim-tab {
            flex: 1;
            padding: 10px;
            border: none;
            border-radius: 8px;
            background: var(--color-bg-secondary);
            color: var(--color-text-secondary);
            font-size: 12px;
            font-weight: 500;
        }

        .trim-tab.active {
            background: var(--color-primary);
            color: white;
        }

        /* Billing */
        .billing-summary {
            background: var(--color-bg-card);
            border-radius: 12px;
            padding: 16px;
        }

        .billing-item {
            display: flex;
            gap: 12px;
            padding: 10px 0;
            border-bottom: 1px solid var(--color-bg-secondary);
        }

        .billing-item .item-name {
            flex: 1;
        }

        .billing-item .item-qty {
            color: var(--color-text-secondary);
        }

        .billing-item .item-price {
            font-weight: 500;
        }

        .billing-total {
            display: flex;
            justify-content: space-between;
            padding: 16px 0;
            font-size: 18px;
            font-weight: 600;
        }

        .billing-status {
            text-align: center;
            padding: 12px;
            background: var(--color-bg-secondary);
            border-radius: 8px;
            margin-bottom: 16px;
        }

        .btn-success {
            background: var(--color-success);
        }

        /* Help text */
        .help-text {
            font-size: 12px;
            color: var(--color-text-secondary);
            margin-top: 4px;
        }

        /* File list */
        .file-list {
            display: flex;
            flex-direction: column;
            gap: 8px;
        }

        .file-item {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 10px;
            background: var(--color-bg-secondary);
            border-radius: 8px;
        }

        /* Interpretation box */
        .interpretation-box {
            background: var(--color-bg-secondary);
            border-radius: 12px;
            padding: 16px;
            margin-top: 16px;
        }

        .interpretation-box h4 {
            display: flex;
            align-items: center;
            gap: 8px;
            color: var(--color-primary);
            margin-bottom: 12px;
        }

        .loading-state.small {
            padding: 40px;
            text-align: center;
        }
    `;
    document.head.appendChild(style);
}

// Listen for navigation events
window.addEventListener('navigate:medical-record', async (e) => {
    const { mrId } = e.detail;
    sessionStorage.setItem('current_mr_id', mrId);

    // Import and register if not already
    const { router } = await import('../router.js');

    // Check if route exists
    if (!router.routes['medical-record']) {
        router.register('medical-record', renderMedicalRecord);
    }

    router.navigate('medical-record', { mrId });
});
