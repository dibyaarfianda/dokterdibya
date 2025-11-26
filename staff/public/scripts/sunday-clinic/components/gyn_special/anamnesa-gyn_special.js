/**
 * Anamnesa Component for Gyn Special
 * Structured form for gynecological anamnesis
 */

import stateManager from '../../utils/state-manager.js';
import apiClient from '../../utils/api-client.js';

export default {
    /**
     * Render the Anamnesa form
     */
    async render(state) {
        const anamnesa = state.recordData?.anamnesa || {};
        const chiefComplaint = state.recordData?.appointment?.chief_complaint || '';
        const isSaved = !!anamnesa.saved_at;

        return `
            <div class="card mb-3">
                <div class="card-header bg-primary text-white d-flex justify-content-between align-items-center">
                    <h5 class="mb-0">
                        <i class="fas fa-clipboard-list"></i> Anamnesa Ginekologi
                    </h5>
                    ${isSaved ? '<span class="badge badge-light"><i class="fas fa-check"></i> Tersimpan</span>' : ''}
                </div>
                <div class="card-body">
                    ${chiefComplaint ? `
                    <div class="alert alert-info mb-3">
                        <strong><i class="fas fa-comment-medical"></i> Keluhan dari Booking:</strong><br>
                        ${this.escapeHtml(chiefComplaint)}
                    </div>
                    ` : ''}

                    <!-- Keluhan Utama -->
                    <div class="form-section mb-4">
                        <h6 class="section-title text-primary border-bottom pb-2 mb-3">
                            <i class="fas fa-notes-medical"></i> Keluhan Utama
                        </h6>
                        <div class="form-group">
                            <textarea id="anamnesa-keluhan-utama" class="form-control" rows="4"
                                placeholder="Keluhan yang dirasakan, sejak kapan, memberat/tidak, sudah dapat terapi/belum, sudah pernah periksa/belum, dulu pernah merasakan keluhan yang sama atau tidak">${this.escapeHtml(anamnesa.keluhan_utama || '')}</textarea>
                        </div>
                    </div>

                    <!-- Riwayat Menstruasi -->
                    <div class="form-section mb-4">
                        <h6 class="section-title text-primary border-bottom pb-2 mb-3">
                            <i class="fas fa-calendar-alt"></i> Riwayat Menstruasi
                        </h6>
                        <div class="row">
                            <div class="col-md-6">
                                <div class="form-group">
                                    <label>Usia Menarche (menstruasi pertama)</label>
                                    <div class="input-group">
                                        <input type="number" id="anamnesa-usia-menarche" class="form-control"
                                            placeholder="Contoh: 12" min="8" max="20"
                                            value="${this.escapeHtml(anamnesa.usia_menarche || '')}">
                                        <div class="input-group-append">
                                            <span class="input-group-text">tahun</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div class="col-md-6">
                                <div class="form-group">
                                    <label>Siklus Menstruasi</label>
                                    <div class="input-group">
                                        <input type="number" id="anamnesa-siklus-mens" class="form-control"
                                            placeholder="21-35 hari (normal)" min="14" max="60"
                                            value="${this.escapeHtml(anamnesa.siklus_mens || '')}">
                                        <div class="input-group-append">
                                            <span class="input-group-text">hari</span>
                                        </div>
                                    </div>
                                    <small class="text-muted">Hari pertama mens bulan kemarin s/d hari pertama mens saat ini</small>
                                </div>
                            </div>
                        </div>
                        <div class="row">
                            <div class="col-md-6">
                                <div class="form-group">
                                    <label>Tanggal HPHT (Hari Pertama Haid Terakhir)</label>
                                    <input type="date" id="anamnesa-hpht" class="form-control"
                                        value="${this.escapeHtml(anamnesa.hpht || '')}">
                                </div>
                            </div>
                            <div class="col-md-6">
                                <div class="form-group">
                                    <label>Durasi Menstruasi</label>
                                    <div class="input-group">
                                        <input type="number" id="anamnesa-durasi-mens" class="form-control"
                                            placeholder="5-7 hari (normal)" min="1" max="14"
                                            value="${this.escapeHtml(anamnesa.durasi_mens || '')}">
                                        <div class="input-group-append">
                                            <span class="input-group-text">hari</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="row">
                            <div class="col-md-6">
                                <div class="form-group">
                                    <label>Jumlah Perdarahan</label>
                                    <select id="anamnesa-jumlah-perdarahan" class="form-control">
                                        <option value="">-- Pilih --</option>
                                        <option value="sedikit" ${anamnesa.jumlah_perdarahan === 'sedikit' ? 'selected' : ''}>Sedikit</option>
                                        <option value="normal" ${anamnesa.jumlah_perdarahan === 'normal' ? 'selected' : ''}>Normal</option>
                                        <option value="banyak" ${anamnesa.jumlah_perdarahan === 'banyak' ? 'selected' : ''}>Banyak</option>
                                    </select>
                                </div>
                            </div>
                            <div class="col-md-6">
                                <div class="form-group">
                                    <label>Intensitas Nyeri Menstruasi (Dismenore)</label>
                                    <select id="anamnesa-dismenore" class="form-control">
                                        <option value="">-- Pilih --</option>
                                        <option value="tidak_ada" ${anamnesa.dismenore === 'tidak_ada' ? 'selected' : ''}>Tidak Ada Nyeri</option>
                                        <option value="ringan" ${anamnesa.dismenore === 'ringan' ? 'selected' : ''}>Nyeri Ringan</option>
                                        <option value="berat" ${anamnesa.dismenore === 'berat' ? 'selected' : ''}>Nyeri Berat (mengganggu aktivitas)</option>
                                    </select>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Riwayat Obstetri -->
                    <div class="form-section mb-4">
                        <h6 class="section-title text-primary border-bottom pb-2 mb-3">
                            <i class="fas fa-baby"></i> Riwayat Obstetri (bila sudah menikah)
                        </h6>
                        <div class="row">
                            <div class="col-md-3">
                                <div class="form-group">
                                    <label>Gravida (G)</label>
                                    <input type="number" id="anamnesa-gravida" class="form-control"
                                        placeholder="Jumlah kehamilan" min="0"
                                        value="${this.escapeHtml(anamnesa.gravida || '')}">
                                    <small class="text-muted">Jumlah kehamilan</small>
                                </div>
                            </div>
                            <div class="col-md-3">
                                <div class="form-group">
                                    <label>Para (P)</label>
                                    <input type="number" id="anamnesa-para" class="form-control"
                                        placeholder="Jumlah persalinan" min="0"
                                        value="${this.escapeHtml(anamnesa.para || '')}">
                                    <small class="text-muted">Jumlah persalinan</small>
                                </div>
                            </div>
                            <div class="col-md-3">
                                <div class="form-group">
                                    <label>Abortus (A)</label>
                                    <input type="number" id="anamnesa-abortus" class="form-control"
                                        placeholder="Jumlah keguguran" min="0"
                                        value="${this.escapeHtml(anamnesa.abortus || '')}">
                                    <small class="text-muted">Jumlah keguguran</small>
                                </div>
                            </div>
                            <div class="col-md-3">
                                <div class="form-group">
                                    <label>Anak Hidup</label>
                                    <input type="number" id="anamnesa-anak-hidup" class="form-control"
                                        placeholder="Jumlah anak" min="0"
                                        value="${this.escapeHtml(anamnesa.anak_hidup || '')}">
                                    <small class="text-muted">Jumlah anak hidup</small>
                                </div>
                            </div>
                        </div>
                        <div class="form-group">
                            <label>Cara Persalinan Terakhir</label>
                            <select id="anamnesa-cara-persalinan" class="form-control">
                                <option value="">-- Pilih --</option>
                                <option value="belum_pernah" ${anamnesa.cara_persalinan === 'belum_pernah' ? 'selected' : ''}>Belum Pernah Melahirkan</option>
                                <option value="normal" ${anamnesa.cara_persalinan === 'normal' ? 'selected' : ''}>Normal (Pervaginam)</option>
                                <option value="sesar" ${anamnesa.cara_persalinan === 'sesar' ? 'selected' : ''}>Operasi Sesar</option>
                                <option value="vakum" ${anamnesa.cara_persalinan === 'vakum' ? 'selected' : ''}>Vakum/Forceps</option>
                            </select>
                        </div>
                    </div>

                    <!-- Riwayat Penyakit Kandungan -->
                    <div class="form-section mb-4">
                        <h6 class="section-title text-primary border-bottom pb-2 mb-3">
                            <i class="fas fa-venus"></i> Riwayat Penyakit Kandungan
                        </h6>
                        <div class="form-group">
                            <label>Penyakit kandungan yang pernah/sedang dialami</label>
                            <div class="row">
                                <div class="col-md-4">
                                    <div class="custom-control custom-checkbox mb-2">
                                        <input type="checkbox" class="custom-control-input" id="riwayat-kista"
                                            ${anamnesa.riwayat_kista ? 'checked' : ''}>
                                        <label class="custom-control-label" for="riwayat-kista">Kista</label>
                                    </div>
                                    <div class="custom-control custom-checkbox mb-2">
                                        <input type="checkbox" class="custom-control-input" id="riwayat-mioma"
                                            ${anamnesa.riwayat_mioma ? 'checked' : ''}>
                                        <label class="custom-control-label" for="riwayat-mioma">Mioma/Fibroid</label>
                                    </div>
                                </div>
                                <div class="col-md-4">
                                    <div class="custom-control custom-checkbox mb-2">
                                        <input type="checkbox" class="custom-control-input" id="riwayat-benjolan"
                                            ${anamnesa.riwayat_benjolan ? 'checked' : ''}>
                                        <label class="custom-control-label" for="riwayat-benjolan">Benjolan di Kemaluan</label>
                                    </div>
                                    <div class="custom-control custom-checkbox mb-2">
                                        <input type="checkbox" class="custom-control-input" id="riwayat-perdarahan-hub"
                                            ${anamnesa.riwayat_perdarahan_hub ? 'checked' : ''}>
                                        <label class="custom-control-label" for="riwayat-perdarahan-hub">Perdarahan Setelah Berhubungan</label>
                                    </div>
                                </div>
                                <div class="col-md-4">
                                    <div class="custom-control custom-checkbox mb-2">
                                        <input type="checkbox" class="custom-control-input" id="riwayat-keputihan"
                                            ${anamnesa.riwayat_keputihan ? 'checked' : ''}>
                                        <label class="custom-control-label" for="riwayat-keputihan">Keputihan Berulang</label>
                                    </div>
                                    <div class="custom-control custom-checkbox mb-2">
                                        <input type="checkbox" class="custom-control-input" id="riwayat-endometriosis"
                                            ${anamnesa.riwayat_endometriosis ? 'checked' : ''}>
                                        <label class="custom-control-label" for="riwayat-endometriosis">Endometriosis</label>
                                    </div>
                                </div>
                            </div>
                            <div class="form-group mt-2">
                                <label>Penyakit kandungan lainnya (jika ada)</label>
                                <input type="text" id="anamnesa-penyakit-kandungan-lain" class="form-control"
                                    placeholder="Sebutkan penyakit kandungan lainnya..."
                                    value="${this.escapeHtml(anamnesa.penyakit_kandungan_lain || '')}">
                            </div>
                        </div>
                        <div class="form-group">
                            <label>Pengobatan/Operasi Ginekologi yang Pernah Dijalani</label>
                            <textarea id="anamnesa-riwayat-pengobatan-gyn" class="form-control" rows="2"
                                placeholder="Contoh: minum obat hormon, pernah operasi kista/mioma, dll">${this.escapeHtml(anamnesa.riwayat_pengobatan_gyn || '')}</textarea>
                        </div>
                        <div class="form-group">
                            <label>Riwayat Skrining Mulut Rahim</label>
                            <div class="row">
                                <div class="col-md-4">
                                    <div class="custom-control custom-checkbox mb-2">
                                        <input type="checkbox" class="custom-control-input" id="skrining-iva"
                                            ${anamnesa.skrining_iva ? 'checked' : ''}>
                                        <label class="custom-control-label" for="skrining-iva">IVA</label>
                                    </div>
                                </div>
                                <div class="col-md-4">
                                    <div class="custom-control custom-checkbox mb-2">
                                        <input type="checkbox" class="custom-control-input" id="skrining-papsmear"
                                            ${anamnesa.skrining_papsmear ? 'checked' : ''}>
                                        <label class="custom-control-label" for="skrining-papsmear">Pap Smear</label>
                                    </div>
                                </div>
                                <div class="col-md-4">
                                    <div class="custom-control custom-checkbox mb-2">
                                        <input type="checkbox" class="custom-control-input" id="skrining-kolposkopi"
                                            ${anamnesa.skrining_kolposkopi ? 'checked' : ''}>
                                        <label class="custom-control-label" for="skrining-kolposkopi">Kolposkopi</label>
                                    </div>
                                </div>
                            </div>
                            <div class="form-group mt-2">
                                <label>Hasil Skrining (jika pernah)</label>
                                <input type="text" id="anamnesa-hasil-skrining" class="form-control"
                                    placeholder="Tuliskan hasil skrining jika ada..."
                                    value="${this.escapeHtml(anamnesa.hasil_skrining || '')}">
                            </div>
                        </div>
                    </div>

                    <!-- Riwayat Penyakit Lainnya -->
                    <div class="form-section mb-4">
                        <h6 class="section-title text-primary border-bottom pb-2 mb-3">
                            <i class="fas fa-history"></i> Riwayat Penyakit Lainnya
                        </h6>
                        <div class="form-group">
                            <label>Riwayat Penyakit Keluarga</label>
                            <textarea id="anamnesa-riwayat-keluarga" class="form-control" rows="2"
                                placeholder="Contoh: DM, Hipertensi, Kanker, Penyakit jantung, dll">${this.escapeHtml(anamnesa.riwayat_keluarga || '')}</textarea>
                        </div>
                        <div class="form-group">
                            <label>Riwayat Alergi</label>
                            <div class="row">
                                <div class="col-md-4">
                                    <label class="small text-muted">Alergi Obat</label>
                                    <input type="text" id="anamnesa-alergi-obat" class="form-control"
                                        placeholder="Nama obat yang alergi..."
                                        value="${this.escapeHtml(anamnesa.alergi_obat || '')}">
                                </div>
                                <div class="col-md-4">
                                    <label class="small text-muted">Alergi Makanan</label>
                                    <input type="text" id="anamnesa-alergi-makanan" class="form-control"
                                        placeholder="Nama makanan yang alergi..."
                                        value="${this.escapeHtml(anamnesa.alergi_makanan || '')}">
                                </div>
                                <div class="col-md-4">
                                    <label class="small text-muted">Alergi Lingkungan</label>
                                    <input type="text" id="anamnesa-alergi-lingkungan" class="form-control"
                                        placeholder="Contoh: debu, dingin, dll"
                                        value="${this.escapeHtml(anamnesa.alergi_lingkungan || '')}">
                                </div>
                            </div>
                        </div>
                        <div class="form-group">
                            <label>Riwayat Kontrasepsi (KB)</label>
                            <div class="row">
                                <div class="col-md-6">
                                    <label class="small text-muted">Metode KB Terakhir</label>
                                    <select id="anamnesa-metode-kb" class="form-control">
                                        <option value="">-- Pilih --</option>
                                        <option value="tidak_pernah" ${anamnesa.metode_kb === 'tidak_pernah' ? 'selected' : ''}>Tidak Pernah KB</option>
                                        <option value="pil" ${anamnesa.metode_kb === 'pil' ? 'selected' : ''}>Pil KB</option>
                                        <option value="suntik_1bln" ${anamnesa.metode_kb === 'suntik_1bln' ? 'selected' : ''}>Suntik 1 Bulan</option>
                                        <option value="suntik_3bln" ${anamnesa.metode_kb === 'suntik_3bln' ? 'selected' : ''}>Suntik 3 Bulan</option>
                                        <option value="implant" ${anamnesa.metode_kb === 'implant' ? 'selected' : ''}>Implant/Susuk</option>
                                        <option value="iud" ${anamnesa.metode_kb === 'iud' ? 'selected' : ''}>IUD/Spiral</option>
                                        <option value="kondom" ${anamnesa.metode_kb === 'kondom' ? 'selected' : ''}>Kondom</option>
                                        <option value="steril" ${anamnesa.metode_kb === 'steril' ? 'selected' : ''}>Sterilisasi (MOW/MOP)</option>
                                        <option value="kalender" ${anamnesa.metode_kb === 'kalender' ? 'selected' : ''}>Kalender/Alami</option>
                                    </select>
                                </div>
                                <div class="col-md-6">
                                    <label class="small text-muted">Riwayat Kegagalan KB</label>
                                    <select id="anamnesa-kegagalan-kb" class="form-control">
                                        <option value="">-- Pilih --</option>
                                        <option value="tidak" ${anamnesa.kegagalan_kb === 'tidak' ? 'selected' : ''}>Tidak Pernah</option>
                                        <option value="ya" ${anamnesa.kegagalan_kb === 'ya' ? 'selected' : ''}>Pernah (hamil saat KB)</option>
                                    </select>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Catatan Tambahan -->
                    <div class="form-section mb-3">
                        <h6 class="section-title text-primary border-bottom pb-2 mb-3">
                            <i class="fas fa-sticky-note"></i> Catatan Tambahan
                        </h6>
                        <div class="form-group">
                            <textarea id="anamnesa-catatan" class="form-control" rows="3"
                                placeholder="Catatan tambahan lainnya...">${this.escapeHtml(anamnesa.catatan || '')}</textarea>
                        </div>
                    </div>

                    <div class="d-flex justify-content-between align-items-center mt-3">
                        <small class="text-muted" id="anamnesa-status">
                            ${isSaved ? `Terakhir disimpan: ${new Date(anamnesa.saved_at).toLocaleString('id-ID')}` : 'Belum disimpan'}
                        </small>
                        <div>
                            <button type="button" class="btn btn-outline-secondary btn-sm mr-2" id="anamnesa-reset">
                                <i class="fas fa-undo"></i> Reset
                            </button>
                            <button type="button" class="btn btn-primary" id="anamnesa-save">
                                <i class="fas fa-save"></i> Simpan
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    /**
     * Setup event listeners after render
     */
    afterRender(state) {
        const saveBtn = document.getElementById('anamnesa-save');
        const resetBtn = document.getElementById('anamnesa-reset');

        if (saveBtn) {
            saveBtn.addEventListener('click', () => this.save());
        }

        if (resetBtn) {
            resetBtn.addEventListener('click', () => this.reset(state));
        }
    },

    /**
     * Collect form data
     */
    collectFormData() {
        return {
            // Keluhan Utama
            keluhan_utama: document.getElementById('anamnesa-keluhan-utama')?.value || '',

            // Riwayat Menstruasi
            usia_menarche: document.getElementById('anamnesa-usia-menarche')?.value || '',
            siklus_mens: document.getElementById('anamnesa-siklus-mens')?.value || '',
            hpht: document.getElementById('anamnesa-hpht')?.value || '',
            durasi_mens: document.getElementById('anamnesa-durasi-mens')?.value || '',
            jumlah_perdarahan: document.getElementById('anamnesa-jumlah-perdarahan')?.value || '',
            dismenore: document.getElementById('anamnesa-dismenore')?.value || '',

            // Riwayat Obstetri
            gravida: document.getElementById('anamnesa-gravida')?.value || '',
            para: document.getElementById('anamnesa-para')?.value || '',
            abortus: document.getElementById('anamnesa-abortus')?.value || '',
            anak_hidup: document.getElementById('anamnesa-anak-hidup')?.value || '',
            cara_persalinan: document.getElementById('anamnesa-cara-persalinan')?.value || '',

            // Riwayat Penyakit Kandungan - Checkboxes
            riwayat_kista: document.getElementById('riwayat-kista')?.checked || false,
            riwayat_mioma: document.getElementById('riwayat-mioma')?.checked || false,
            riwayat_benjolan: document.getElementById('riwayat-benjolan')?.checked || false,
            riwayat_perdarahan_hub: document.getElementById('riwayat-perdarahan-hub')?.checked || false,
            riwayat_keputihan: document.getElementById('riwayat-keputihan')?.checked || false,
            riwayat_endometriosis: document.getElementById('riwayat-endometriosis')?.checked || false,
            penyakit_kandungan_lain: document.getElementById('anamnesa-penyakit-kandungan-lain')?.value || '',
            riwayat_pengobatan_gyn: document.getElementById('anamnesa-riwayat-pengobatan-gyn')?.value || '',

            // Skrining
            skrining_iva: document.getElementById('skrining-iva')?.checked || false,
            skrining_papsmear: document.getElementById('skrining-papsmear')?.checked || false,
            skrining_kolposkopi: document.getElementById('skrining-kolposkopi')?.checked || false,
            hasil_skrining: document.getElementById('anamnesa-hasil-skrining')?.value || '',

            // Riwayat Penyakit Lainnya
            riwayat_keluarga: document.getElementById('anamnesa-riwayat-keluarga')?.value || '',
            alergi_obat: document.getElementById('anamnesa-alergi-obat')?.value || '',
            alergi_makanan: document.getElementById('anamnesa-alergi-makanan')?.value || '',
            alergi_lingkungan: document.getElementById('anamnesa-alergi-lingkungan')?.value || '',
            metode_kb: document.getElementById('anamnesa-metode-kb')?.value || '',
            kegagalan_kb: document.getElementById('anamnesa-kegagalan-kb')?.value || '',

            // Catatan
            catatan: document.getElementById('anamnesa-catatan')?.value || '',

            saved_at: new Date().toISOString()
        };
    },

    /**
     * Save anamnesa data
     */
    async save() {
        const state = stateManager.getState();
        const mrId = state.currentMrId ||
                     state.recordData?.mrId ||
                     state.recordData?.mr_id ||
                     state.recordData?.record?.mrId ||
                     state.recordData?.record?.mr_id;

        if (!mrId) {
            console.error('[AnamnesaGynSpecial] MR ID not found in state:', state);
            alert('Error: MR ID tidak ditemukan');
            return { success: false };
        }

        const saveBtn = document.getElementById('anamnesa-save');
        if (saveBtn) {
            saveBtn.disabled = true;
            saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Menyimpan...';
        }

        try {
            const data = this.collectFormData();

            const response = await apiClient.saveSection(mrId, 'anamnesa', data);

            if (response.success) {
                // Update state
                stateManager.updateSectionData('anamnesa', data);

                // Update UI
                const statusEl = document.getElementById('anamnesa-status');
                if (statusEl) {
                    statusEl.textContent = `Terakhir disimpan: ${new Date().toLocaleString('id-ID')}`;
                }

                // Show success feedback
                if (saveBtn) {
                    saveBtn.innerHTML = '<i class="fas fa-check"></i> Tersimpan!';
                    setTimeout(() => {
                        saveBtn.innerHTML = '<i class="fas fa-save"></i> Simpan';
                        saveBtn.disabled = false;
                    }, 2000);
                }
            } else {
                throw new Error(response.message || 'Gagal menyimpan');
            }

            return response;
        } catch (error) {
            console.error('Error saving anamnesa:', error);
            alert('Gagal menyimpan: ' + error.message);

            if (saveBtn) {
                saveBtn.innerHTML = '<i class="fas fa-save"></i> Simpan';
                saveBtn.disabled = false;
            }

            return { success: false, error: error.message };
        }
    },

    /**
     * Reset form to original state
     */
    reset(state) {
        const anamnesa = state.recordData?.anamnesa || {};

        // Reset all text inputs
        const textFields = [
            'anamnesa-keluhan-utama', 'anamnesa-usia-menarche', 'anamnesa-siklus-mens',
            'anamnesa-hpht', 'anamnesa-durasi-mens', 'anamnesa-gravida', 'anamnesa-para',
            'anamnesa-abortus', 'anamnesa-anak-hidup', 'anamnesa-penyakit-kandungan-lain',
            'anamnesa-riwayat-pengobatan-gyn', 'anamnesa-hasil-skrining', 'anamnesa-riwayat-keluarga',
            'anamnesa-alergi-obat', 'anamnesa-alergi-makanan', 'anamnesa-alergi-lingkungan',
            'anamnesa-catatan'
        ];

        textFields.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                const fieldName = id.replace('anamnesa-', '').replace(/-/g, '_');
                el.value = anamnesa[fieldName] || '';
            }
        });

        // Reset select fields
        const selectFields = [
            'anamnesa-jumlah-perdarahan', 'anamnesa-dismenore', 'anamnesa-cara-persalinan',
            'anamnesa-metode-kb', 'anamnesa-kegagalan-kb'
        ];

        selectFields.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                const fieldName = id.replace('anamnesa-', '').replace(/-/g, '_');
                el.value = anamnesa[fieldName] || '';
            }
        });

        // Reset checkboxes
        const checkboxFields = [
            'riwayat-kista', 'riwayat-mioma', 'riwayat-benjolan', 'riwayat-perdarahan-hub',
            'riwayat-keputihan', 'riwayat-endometriosis', 'skrining-iva', 'skrining-papsmear',
            'skrining-kolposkopi'
        ];

        checkboxFields.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                const fieldName = id.replace(/-/g, '_');
                el.checked = anamnesa[fieldName] || false;
            }
        });
    },

    /**
     * Escape HTML to prevent XSS
     */
    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
};
