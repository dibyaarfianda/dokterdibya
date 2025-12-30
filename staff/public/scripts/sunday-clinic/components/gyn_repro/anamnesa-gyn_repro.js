/**
 * Anamnesa Component for Gyn Repro
 * Structured form for gynecological anamnesis
 * Using obstetri-style CSS (sc-section, sc-grid, sc-card)
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

        // Get saved datetime or default to current time
        const now = new Date();
        const defaultDatetime = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}T${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        const recordDatetime = anamnesa.record_datetime || defaultDatetime;

        // Get metadata context for display
        let metaHtml = '';
        try {
            const { getMedicalRecordContext, renderRecordMeta } = await import('../../utils/helpers.js');
            const context = getMedicalRecordContext(state, 'anamnesa');
            if (context) {
                metaHtml = renderRecordMeta(context, 'anamnesa');
            }
        } catch (error) {
            console.error('[AnamnesaGynRepro] Failed to load metadata:', error);
        }

        return `
            <div class="sc-section">
                <div class="sc-section-header">
                    <h3>Anamnesa Ginekologi</h3>
                    <button class="btn btn-primary btn-sm" id="anamnesa-save">
                        <i class="fas fa-save"></i> Simpan
                    </button>
                </div>
                ${metaHtml}
                <div class="form-group mb-3" style="max-width: 300px;">
                    <label class="font-weight-bold text-primary">
                        <i class="fas fa-clock mr-1"></i>Tanggal & Jam Pemeriksaan <span class="text-danger">*</span>
                    </label>
                    <input type="datetime-local"
                           class="form-control"
                           id="anamnesa-datetime"
                           value="${this.escapeHtml(recordDatetime)}"
                           autocomplete="off"
                           required>
                </div>

                ${chiefComplaint ? `
                <div class="alert alert-info mb-3">
                    <strong><i class="fas fa-comment-medical"></i> Keluhan dari Booking:</strong><br>
                    ${this.escapeHtml(chiefComplaint)}
                </div>
                ` : ''}

                <div class="sc-grid two">
                    <div class="sc-card">
                        <h4>Keluhan & Riwayat Menstruasi</h4>

                        <div class="form-group mb-3">
                            <label class="font-weight-bold">Keluhan Utama</label>
                            <textarea id="anamnesa-keluhan-utama" class="form-control" rows="3"
                                placeholder="Keluhan yang dirasakan, sejak kapan, memberat/tidak, sudah dapat terapi/belum">${this.escapeHtml(anamnesa.keluhan_utama || '')}</textarea>
                        </div>

                        <div class="form-group mb-3">
                            <label class="font-weight-bold">Usia Menarche</label>
                            <div class="input-group">
                                <input type="number" id="anamnesa-usia-menarche" class="form-control"
                                    placeholder="Contoh: 12" min="8" max="20"
                                    value="${this.escapeHtml(anamnesa.usia_menarche || '')}">
                                <div class="input-group-append">
                                    <span class="input-group-text">tahun</span>
                                </div>
                            </div>
                        </div>

                        <div class="row">
                            <div class="col-6">
                                <div class="form-group mb-3">
                                    <label class="font-weight-bold">Siklus Menstruasi</label>
                                    <div class="input-group">
                                        <input type="number" id="anamnesa-siklus-mens" class="form-control"
                                            placeholder="21-35" min="14" max="60"
                                            value="${this.escapeHtml(anamnesa.siklus_mens || '')}">
                                        <div class="input-group-append">
                                            <span class="input-group-text">hari</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div class="col-6">
                                <div class="form-group mb-3">
                                    <label class="font-weight-bold">Durasi Menstruasi</label>
                                    <div class="input-group">
                                        <input type="number" id="anamnesa-durasi-mens" class="form-control"
                                            placeholder="5-7" min="1" max="14"
                                            value="${this.escapeHtml(anamnesa.durasi_mens || '')}">
                                        <div class="input-group-append">
                                            <span class="input-group-text">hari</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div class="form-group mb-3">
                            <label class="font-weight-bold">HPHT (Hari Pertama Haid Terakhir)</label>
                            <input type="date" id="anamnesa-hpht" class="form-control"
                                value="${this.escapeHtml(anamnesa.hpht || '')}">
                        </div>

                        <div class="row">
                            <div class="col-6">
                                <div class="form-group mb-3">
                                    <label class="font-weight-bold">Jumlah Perdarahan</label>
                                    <select id="anamnesa-jumlah-perdarahan" class="form-control">
                                        <option value="">-- Pilih --</option>
                                        <option value="sedikit" ${anamnesa.jumlah_perdarahan === 'sedikit' ? 'selected' : ''}>Sedikit</option>
                                        <option value="normal" ${anamnesa.jumlah_perdarahan === 'normal' ? 'selected' : ''}>Normal</option>
                                        <option value="banyak" ${anamnesa.jumlah_perdarahan === 'banyak' ? 'selected' : ''}>Banyak</option>
                                    </select>
                                </div>
                            </div>
                            <div class="col-6">
                                <div class="form-group mb-3">
                                    <label class="font-weight-bold">Dismenore</label>
                                    <select id="anamnesa-dismenore" class="form-control">
                                        <option value="">-- Pilih --</option>
                                        <option value="tidak_ada" ${anamnesa.dismenore === 'tidak_ada' ? 'selected' : ''}>Tidak Ada</option>
                                        <option value="ringan" ${anamnesa.dismenore === 'ringan' ? 'selected' : ''}>Ringan</option>
                                        <option value="berat" ${anamnesa.dismenore === 'berat' ? 'selected' : ''}>Berat</option>
                                    </select>
                                </div>
                            </div>
                        </div>

                        <h4>Riwayat Obstetri</h4>
                        <div class="row">
                            <div class="col-3">
                                <div class="form-group mb-3">
                                    <label class="font-weight-bold">Gravida</label>
                                    <input type="number" id="anamnesa-gravida" class="form-control"
                                        placeholder="G" min="0" value="${this.escapeHtml(anamnesa.gravida || '')}">
                                </div>
                            </div>
                            <div class="col-3">
                                <div class="form-group mb-3">
                                    <label class="font-weight-bold">Para</label>
                                    <input type="number" id="anamnesa-para" class="form-control"
                                        placeholder="P" min="0" value="${this.escapeHtml(anamnesa.para || '')}">
                                </div>
                            </div>
                            <div class="col-3">
                                <div class="form-group mb-3">
                                    <label class="font-weight-bold">Abortus</label>
                                    <input type="number" id="anamnesa-abortus" class="form-control"
                                        placeholder="A" min="0" value="${this.escapeHtml(anamnesa.abortus || '')}">
                                </div>
                            </div>
                            <div class="col-3">
                                <div class="form-group mb-3">
                                    <label class="font-weight-bold">Hidup</label>
                                    <input type="number" id="anamnesa-anak-hidup" class="form-control"
                                        placeholder="H" min="0" value="${this.escapeHtml(anamnesa.anak_hidup || '')}">
                                </div>
                            </div>
                        </div>

                        <div class="form-group mb-3">
                            <label class="font-weight-bold">Cara Persalinan Terakhir</label>
                            <select id="anamnesa-cara-persalinan" class="form-control">
                                <option value="">-- Pilih --</option>
                                <option value="belum_pernah" ${anamnesa.cara_persalinan === 'belum_pernah' ? 'selected' : ''}>Belum Pernah</option>
                                <option value="normal" ${anamnesa.cara_persalinan === 'normal' ? 'selected' : ''}>Normal</option>
                                <option value="sesar" ${anamnesa.cara_persalinan === 'sesar' ? 'selected' : ''}>Sesar</option>
                                <option value="vakum" ${anamnesa.cara_persalinan === 'vakum' ? 'selected' : ''}>Vakum/Forceps</option>
                            </select>
                        </div>
                    </div>

                    <div class="sc-card">
                        <h4>Riwayat Penyakit Kandungan</h4>

                        <div class="form-group mb-3">
                            <label class="font-weight-bold">Penyakit yang pernah/sedang dialami:</label>
                            <div class="row">
                                <div class="col-6">
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
                                    <div class="custom-control custom-checkbox mb-2">
                                        <input type="checkbox" class="custom-control-input" id="riwayat-endometriosis"
                                            ${anamnesa.riwayat_endometriosis ? 'checked' : ''}>
                                        <label class="custom-control-label" for="riwayat-endometriosis">Endometriosis</label>
                                    </div>
                                </div>
                                <div class="col-6">
                                    <div class="custom-control custom-checkbox mb-2">
                                        <input type="checkbox" class="custom-control-input" id="riwayat-benjolan"
                                            ${anamnesa.riwayat_benjolan ? 'checked' : ''}>
                                        <label class="custom-control-label" for="riwayat-benjolan">Benjolan</label>
                                    </div>
                                    <div class="custom-control custom-checkbox mb-2">
                                        <input type="checkbox" class="custom-control-input" id="riwayat-perdarahan-hub"
                                            ${anamnesa.riwayat_perdarahan_hub ? 'checked' : ''}>
                                        <label class="custom-control-label" for="riwayat-perdarahan-hub">Perdarahan Hub</label>
                                    </div>
                                    <div class="custom-control custom-checkbox mb-2">
                                        <input type="checkbox" class="custom-control-input" id="riwayat-keputihan"
                                            ${anamnesa.riwayat_keputihan ? 'checked' : ''}>
                                        <label class="custom-control-label" for="riwayat-keputihan">Keputihan</label>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div class="form-group mb-3">
                            <label class="font-weight-bold">Penyakit Kandungan Lainnya</label>
                            <input type="text" id="anamnesa-penyakit-kandungan-lain" class="form-control"
                                placeholder="Sebutkan jika ada..."
                                value="${this.escapeHtml(anamnesa.penyakit_kandungan_lain || '')}">
                        </div>

                        <div class="form-group mb-3">
                            <label class="font-weight-bold">Pengobatan/Operasi Ginekologi</label>
                            <textarea id="anamnesa-riwayat-pengobatan-gyn" class="form-control" rows="2"
                                placeholder="Contoh: pernah operasi kista, minum obat hormon...">${this.escapeHtml(anamnesa.riwayat_pengobatan_gyn || '')}</textarea>
                        </div>

                        <h4>Skrining Mulut Rahim</h4>
                        <div class="form-group mb-3">
                            <div class="row">
                                <div class="col-4">
                                    <div class="custom-control custom-checkbox">
                                        <input type="checkbox" class="custom-control-input" id="skrining-iva"
                                            ${anamnesa.skrining_iva ? 'checked' : ''}>
                                        <label class="custom-control-label" for="skrining-iva">IVA</label>
                                    </div>
                                </div>
                                <div class="col-4">
                                    <div class="custom-control custom-checkbox">
                                        <input type="checkbox" class="custom-control-input" id="skrining-papsmear"
                                            ${anamnesa.skrining_papsmear ? 'checked' : ''}>
                                        <label class="custom-control-label" for="skrining-papsmear">Pap Smear</label>
                                    </div>
                                </div>
                                <div class="col-4">
                                    <div class="custom-control custom-checkbox">
                                        <input type="checkbox" class="custom-control-input" id="skrining-kolposkopi"
                                            ${anamnesa.skrining_kolposkopi ? 'checked' : ''}>
                                        <label class="custom-control-label" for="skrining-kolposkopi">Kolposkopi</label>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div class="form-group mb-3">
                            <label class="font-weight-bold">Hasil Skrining</label>
                            <input type="text" id="anamnesa-hasil-skrining" class="form-control"
                                placeholder="Tuliskan hasil skrining jika ada..."
                                value="${this.escapeHtml(anamnesa.hasil_skrining || '')}">
                        </div>

                        <h4>Riwayat Lainnya</h4>
                        <div class="form-group mb-3">
                            <label class="font-weight-bold">Riwayat Penyakit Keluarga</label>
                            <textarea id="anamnesa-riwayat-keluarga" class="form-control" rows="2"
                                placeholder="DM, Hipertensi, Kanker, dll">${this.escapeHtml(anamnesa.riwayat_keluarga || '')}</textarea>
                        </div>

                        <div class="form-group mb-3">
                            <label class="font-weight-bold">Alergi</label>
                            <div class="row">
                                <div class="col-4">
                                    <input type="text" id="anamnesa-alergi-obat" class="form-control"
                                        placeholder="Obat" value="${this.escapeHtml(anamnesa.alergi_obat || '')}">
                                </div>
                                <div class="col-4">
                                    <input type="text" id="anamnesa-alergi-makanan" class="form-control"
                                        placeholder="Makanan" value="${this.escapeHtml(anamnesa.alergi_makanan || '')}">
                                </div>
                                <div class="col-4">
                                    <input type="text" id="anamnesa-alergi-lingkungan" class="form-control"
                                        placeholder="Lingkungan" value="${this.escapeHtml(anamnesa.alergi_lingkungan || '')}">
                                </div>
                            </div>
                        </div>

                        <h4>Riwayat KB</h4>
                        <div class="row">
                            <div class="col-6">
                                <div class="form-group mb-3">
                                    <label class="font-weight-bold">Metode KB</label>
                                    <select id="anamnesa-metode-kb" class="form-control">
                                        <option value="">-- Pilih --</option>
                                        <option value="tidak_pernah" ${anamnesa.metode_kb === 'tidak_pernah' ? 'selected' : ''}>Tidak Pernah</option>
                                        <option value="pil" ${anamnesa.metode_kb === 'pil' ? 'selected' : ''}>Pil</option>
                                        <option value="suntik_1bln" ${anamnesa.metode_kb === 'suntik_1bln' ? 'selected' : ''}>Suntik 1 Bulan</option>
                                        <option value="suntik_3bln" ${anamnesa.metode_kb === 'suntik_3bln' ? 'selected' : ''}>Suntik 3 Bulan</option>
                                        <option value="implant" ${anamnesa.metode_kb === 'implant' ? 'selected' : ''}>Implant</option>
                                        <option value="iud" ${anamnesa.metode_kb === 'iud' ? 'selected' : ''}>IUD</option>
                                        <option value="kondom" ${anamnesa.metode_kb === 'kondom' ? 'selected' : ''}>Kondom</option>
                                        <option value="steril" ${anamnesa.metode_kb === 'steril' ? 'selected' : ''}>Sterilisasi</option>
                                    </select>
                                </div>
                            </div>
                            <div class="col-6">
                                <div class="form-group mb-3">
                                    <label class="font-weight-bold">Kegagalan KB</label>
                                    <select id="anamnesa-kegagalan-kb" class="form-control">
                                        <option value="">-- Pilih --</option>
                                        <option value="tidak" ${anamnesa.kegagalan_kb === 'tidak' ? 'selected' : ''}>Tidak Pernah</option>
                                        <option value="ya" ${anamnesa.kegagalan_kb === 'ya' ? 'selected' : ''}>Pernah</option>
                                    </select>
                                </div>
                            </div>
                        </div>

                        <div class="form-group mb-3">
                            <label class="font-weight-bold">Catatan Tambahan</label>
                            <textarea id="anamnesa-catatan" class="form-control" rows="2"
                                placeholder="Catatan lainnya...">${this.escapeHtml(anamnesa.catatan || '')}</textarea>
                        </div>
                    </div>
                </div>

                <div class="mt-3 text-muted small" id="anamnesa-status">
                    ${isSaved ? `<i class="fas fa-check text-success"></i> Terakhir disimpan: ${new Date(anamnesa.saved_at).toLocaleString('id-ID')}` : '<i class="fas fa-info-circle"></i> Belum disimpan'}
                </div>
            </div>
        `;
    },

    /**
     * Setup event listeners after render
     */
    afterRender(state) {
        const saveBtn = document.getElementById('anamnesa-save');

        if (saveBtn) {
            saveBtn.addEventListener('click', () => this.save());
        }
    },

    /**
     * Collect form data
     */
    collectFormData() {
        const recordDatetime = document.getElementById('anamnesa-datetime')?.value || '';
        return {
            // Datetime
            record_datetime: recordDatetime,
            record_date: recordDatetime.split('T')[0] || '',
            record_time: recordDatetime.split('T')[1] || '',

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
            console.error('[AnamnesaGynRepro] MR ID not found in state:', state);
            window.showToast('error', 'Error: MR ID tidak ditemukan');
            return { success: false };
        }

        const saveBtn = document.getElementById('anamnesa-save');
        if (saveBtn) {
            saveBtn.disabled = true;
            saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Menyimpan...';
        }

        try {
            // Validate datetime is filled
            const recordDatetime = document.getElementById('anamnesa-datetime')?.value || '';
            if (!recordDatetime) {
                window.showToast('error', 'Tanggal & Jam Pemeriksaan harus diisi');
                if (saveBtn) {
                    saveBtn.innerHTML = '<i class="fas fa-save"></i> Simpan';
                    saveBtn.disabled = false;
                }
                return { success: false };
            }

            const data = this.collectFormData();

            const response = await apiClient.saveSection(mrId, 'anamnesa', data);

            if (response.success) {
                // Update state
                stateManager.updateSectionData('anamnesa', data);

                // Update UI
                const statusEl = document.getElementById('anamnesa-status');
                if (statusEl) {
                    statusEl.innerHTML = `<i class="fas fa-check text-success"></i> Terakhir disimpan: ${new Date().toLocaleString('id-ID')}`;
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
            window.showToast('error', 'Gagal menyimpan: ' + error.message);

            if (saveBtn) {
                saveBtn.innerHTML = '<i class="fas fa-save"></i> Simpan';
                saveBtn.disabled = false;
            }

            return { success: false, error: error.message };
        }
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
