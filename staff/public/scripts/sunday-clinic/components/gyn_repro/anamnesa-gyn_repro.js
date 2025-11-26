/**
 * Anamnesa Component for Gyn Repro (Reproductive/Fertility)
 * Using obstetri-style layout (sc-section, sc-grid, sc-card)
 */

import stateManager from '../../utils/state-manager.js';
import apiClient from '../../utils/api-client.js';

export default {
    /**
     * Render the Anamnesa form - obstetri style
     */
    async render(state) {
        const anamnesa = state.recordData?.anamnesa || {};
        const chiefComplaint = state.recordData?.appointment?.chief_complaint || '';

        // Get metadata context for display
        let metaHtml = '';
        try {
            const { getMedicalRecordContext, renderRecordMeta } = await import('../../utils/helpers.js');
            const context = getMedicalRecordContext(state, 'anamnesa');
            if (context) {
                metaHtml = renderRecordMeta(context, 'anamnesa');
            }
        } catch (error) {
            console.error('[Anamnesa] Failed to load metadata:', error);
        }

        const escapeHtml = (str) => {
            if (!str) return '';
            return String(str)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;');
        };

        return `
            <div class="sc-section">
                <div class="sc-section-header">
                    <h3>Anamnesa Ginekologi</h3>
                    <button class="btn btn-primary btn-sm" id="anamnesa-save" onclick="window.saveAnamnesaGyn()">
                        <i class="fas fa-save"></i> Simpan
                    </button>
                </div>
                ${metaHtml}

                ${chiefComplaint ? `
                <div class="alert alert-info mb-3">
                    <strong><i class="fas fa-comment-medical"></i> Keluhan dari Booking:</strong> ${escapeHtml(chiefComplaint)}
                </div>
                ` : ''}

                <div class="sc-grid two">
                    <div class="sc-card">
                        <h4>Keluhan & Riwayat Menstruasi</h4>
                        <div class="form-group mb-3">
                            <label class="font-weight-bold">Keluhan Utama</label>
                            <textarea class="form-control" id="anamnesa-keluhan-utama" rows="3" placeholder="Keluhan yang dirasakan, sejak kapan, memberat/tidak...">${escapeHtml(anamnesa.keluhan_utama || '')}</textarea>
                        </div>

                        <div class="row">
                            <div class="col-6">
                                <div class="form-group mb-3">
                                    <label class="font-weight-bold">Usia Menarche</label>
                                    <div class="input-group">
                                        <input type="number" class="form-control" id="anamnesa-usia-menarche" min="8" max="20" value="${escapeHtml(anamnesa.usia_menarche || '')}">
                                        <div class="input-group-append"><span class="input-group-text">tahun</span></div>
                                    </div>
                                </div>
                            </div>
                            <div class="col-6">
                                <div class="form-group mb-3">
                                    <label class="font-weight-bold">Siklus Menstruasi</label>
                                    <div class="input-group">
                                        <input type="number" class="form-control" id="anamnesa-siklus-mens" min="14" max="60" value="${escapeHtml(anamnesa.siklus_mens || '')}">
                                        <div class="input-group-append"><span class="input-group-text">hari</span></div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div class="row">
                            <div class="col-6">
                                <div class="form-group mb-3">
                                    <label class="font-weight-bold">HPHT</label>
                                    <input type="date" class="form-control" id="anamnesa-hpht" value="${escapeHtml(anamnesa.hpht || '')}">
                                </div>
                            </div>
                            <div class="col-6">
                                <div class="form-group mb-3">
                                    <label class="font-weight-bold">Durasi Menstruasi</label>
                                    <div class="input-group">
                                        <input type="number" class="form-control" id="anamnesa-durasi-mens" min="1" max="14" value="${escapeHtml(anamnesa.durasi_mens || '')}">
                                        <div class="input-group-append"><span class="input-group-text">hari</span></div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div class="row">
                            <div class="col-6">
                                <div class="form-group mb-3">
                                    <label class="font-weight-bold">Jumlah Perdarahan</label>
                                    <select class="form-control" id="anamnesa-jumlah-perdarahan">
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
                                    <select class="form-control" id="anamnesa-dismenore">
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
                                    <input type="number" class="form-control" id="anamnesa-gravida" min="0" value="${escapeHtml(anamnesa.gravida || '')}">
                                </div>
                            </div>
                            <div class="col-3">
                                <div class="form-group mb-3">
                                    <label class="font-weight-bold">Para</label>
                                    <input type="number" class="form-control" id="anamnesa-para" min="0" value="${escapeHtml(anamnesa.para || '')}">
                                </div>
                            </div>
                            <div class="col-3">
                                <div class="form-group mb-3">
                                    <label class="font-weight-bold">Abortus</label>
                                    <input type="number" class="form-control" id="anamnesa-abortus" min="0" value="${escapeHtml(anamnesa.abortus || '')}">
                                </div>
                            </div>
                            <div class="col-3">
                                <div class="form-group mb-3">
                                    <label class="font-weight-bold">Anak Hidup</label>
                                    <input type="number" class="form-control" id="anamnesa-anak-hidup" min="0" value="${escapeHtml(anamnesa.anak_hidup || '')}">
                                </div>
                            </div>
                        </div>
                        <div class="form-group mb-3">
                            <label class="font-weight-bold">Cara Persalinan Terakhir</label>
                            <select class="form-control" id="anamnesa-cara-persalinan">
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
                            <label class="font-weight-bold">Penyakit yang pernah dialami:</label>
                            <div class="row">
                                <div class="col-6">
                                    <div class="custom-control custom-checkbox mb-2">
                                        <input type="checkbox" class="custom-control-input" id="riwayat-kista" ${anamnesa.riwayat_kista ? 'checked' : ''}>
                                        <label class="custom-control-label" for="riwayat-kista">Kista</label>
                                    </div>
                                    <div class="custom-control custom-checkbox mb-2">
                                        <input type="checkbox" class="custom-control-input" id="riwayat-mioma" ${anamnesa.riwayat_mioma ? 'checked' : ''}>
                                        <label class="custom-control-label" for="riwayat-mioma">Mioma</label>
                                    </div>
                                    <div class="custom-control custom-checkbox mb-2">
                                        <input type="checkbox" class="custom-control-input" id="riwayat-endometriosis" ${anamnesa.riwayat_endometriosis ? 'checked' : ''}>
                                        <label class="custom-control-label" for="riwayat-endometriosis">Endometriosis</label>
                                    </div>
                                </div>
                                <div class="col-6">
                                    <div class="custom-control custom-checkbox mb-2">
                                        <input type="checkbox" class="custom-control-input" id="riwayat-benjolan" ${anamnesa.riwayat_benjolan ? 'checked' : ''}>
                                        <label class="custom-control-label" for="riwayat-benjolan">Benjolan</label>
                                    </div>
                                    <div class="custom-control custom-checkbox mb-2">
                                        <input type="checkbox" class="custom-control-input" id="riwayat-perdarahan-hub" ${anamnesa.riwayat_perdarahan_hub ? 'checked' : ''}>
                                        <label class="custom-control-label" for="riwayat-perdarahan-hub">Perdarahan Hubungan</label>
                                    </div>
                                    <div class="custom-control custom-checkbox mb-2">
                                        <input type="checkbox" class="custom-control-input" id="riwayat-keputihan" ${anamnesa.riwayat_keputihan ? 'checked' : ''}>
                                        <label class="custom-control-label" for="riwayat-keputihan">Keputihan</label>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="form-group mb-3">
                            <label class="font-weight-bold">Penyakit Lainnya</label>
                            <input type="text" class="form-control" id="anamnesa-penyakit-kandungan-lain" value="${escapeHtml(anamnesa.penyakit_kandungan_lain || '')}">
                        </div>
                        <div class="form-group mb-3">
                            <label class="font-weight-bold">Riwayat Pengobatan/Operasi Gyn</label>
                            <textarea class="form-control" id="anamnesa-riwayat-pengobatan-gyn" rows="2">${escapeHtml(anamnesa.riwayat_pengobatan_gyn || '')}</textarea>
                        </div>

                        <h4>Riwayat Skrining</h4>
                        <div class="form-group mb-3">
                            <div class="row">
                                <div class="col-4">
                                    <div class="custom-control custom-checkbox">
                                        <input type="checkbox" class="custom-control-input" id="skrining-iva" ${anamnesa.skrining_iva ? 'checked' : ''}>
                                        <label class="custom-control-label" for="skrining-iva">IVA</label>
                                    </div>
                                </div>
                                <div class="col-4">
                                    <div class="custom-control custom-checkbox">
                                        <input type="checkbox" class="custom-control-input" id="skrining-papsmear" ${anamnesa.skrining_papsmear ? 'checked' : ''}>
                                        <label class="custom-control-label" for="skrining-papsmear">Pap Smear</label>
                                    </div>
                                </div>
                                <div class="col-4">
                                    <div class="custom-control custom-checkbox">
                                        <input type="checkbox" class="custom-control-input" id="skrining-kolposkopi" ${anamnesa.skrining_kolposkopi ? 'checked' : ''}>
                                        <label class="custom-control-label" for="skrining-kolposkopi">Kolposkopi</label>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="form-group mb-3">
                            <label class="font-weight-bold">Hasil Skrining</label>
                            <input type="text" class="form-control" id="anamnesa-hasil-skrining" value="${escapeHtml(anamnesa.hasil_skrining || '')}">
                        </div>

                        <h4>Riwayat Lainnya</h4>
                        <div class="form-group mb-3">
                            <label class="font-weight-bold">Riwayat Penyakit Keluarga</label>
                            <textarea class="form-control" id="anamnesa-riwayat-keluarga" rows="2">${escapeHtml(anamnesa.riwayat_keluarga || '')}</textarea>
                        </div>
                        <div class="row">
                            <div class="col-4">
                                <div class="form-group mb-3">
                                    <label class="font-weight-bold">Alergi Obat</label>
                                    <input type="text" class="form-control" id="anamnesa-alergi-obat" value="${escapeHtml(anamnesa.alergi_obat || '')}">
                                </div>
                            </div>
                            <div class="col-4">
                                <div class="form-group mb-3">
                                    <label class="font-weight-bold">Alergi Makanan</label>
                                    <input type="text" class="form-control" id="anamnesa-alergi-makanan" value="${escapeHtml(anamnesa.alergi_makanan || '')}">
                                </div>
                            </div>
                            <div class="col-4">
                                <div class="form-group mb-3">
                                    <label class="font-weight-bold">Alergi Lingkungan</label>
                                    <input type="text" class="form-control" id="anamnesa-alergi-lingkungan" value="${escapeHtml(anamnesa.alergi_lingkungan || '')}">
                                </div>
                            </div>
                        </div>
                        <div class="row">
                            <div class="col-6">
                                <div class="form-group mb-3">
                                    <label class="font-weight-bold">Metode KB Terakhir</label>
                                    <input type="text" class="form-control" id="anamnesa-metode-kb" value="${escapeHtml(anamnesa.metode_kb || '')}">
                                </div>
                            </div>
                            <div class="col-6">
                                <div class="form-group mb-3">
                                    <label class="font-weight-bold">Kegagalan KB</label>
                                    <input type="text" class="form-control" id="anamnesa-kegagalan-kb" value="${escapeHtml(anamnesa.kegagalan_kb || '')}">
                                </div>
                            </div>
                        </div>
                        <div class="form-group mb-3">
                            <label class="font-weight-bold">Catatan Tambahan</label>
                            <textarea class="form-control" id="anamnesa-catatan" rows="2">${escapeHtml(anamnesa.catatan || '')}</textarea>
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
        window.saveAnamnesaGyn = () => this.save();
    },

    /**
     * Collect form data
     */
    collectFormData() {
        return {
            keluhan_utama: document.getElementById('anamnesa-keluhan-utama')?.value || '',
            usia_menarche: document.getElementById('anamnesa-usia-menarche')?.value || '',
            siklus_mens: document.getElementById('anamnesa-siklus-mens')?.value || '',
            hpht: document.getElementById('anamnesa-hpht')?.value || '',
            durasi_mens: document.getElementById('anamnesa-durasi-mens')?.value || '',
            jumlah_perdarahan: document.getElementById('anamnesa-jumlah-perdarahan')?.value || '',
            dismenore: document.getElementById('anamnesa-dismenore')?.value || '',
            gravida: document.getElementById('anamnesa-gravida')?.value || '',
            para: document.getElementById('anamnesa-para')?.value || '',
            abortus: document.getElementById('anamnesa-abortus')?.value || '',
            anak_hidup: document.getElementById('anamnesa-anak-hidup')?.value || '',
            cara_persalinan: document.getElementById('anamnesa-cara-persalinan')?.value || '',
            riwayat_kista: document.getElementById('riwayat-kista')?.checked || false,
            riwayat_mioma: document.getElementById('riwayat-mioma')?.checked || false,
            riwayat_endometriosis: document.getElementById('riwayat-endometriosis')?.checked || false,
            riwayat_benjolan: document.getElementById('riwayat-benjolan')?.checked || false,
            riwayat_perdarahan_hub: document.getElementById('riwayat-perdarahan-hub')?.checked || false,
            riwayat_keputihan: document.getElementById('riwayat-keputihan')?.checked || false,
            penyakit_kandungan_lain: document.getElementById('anamnesa-penyakit-kandungan-lain')?.value || '',
            riwayat_pengobatan_gyn: document.getElementById('anamnesa-riwayat-pengobatan-gyn')?.value || '',
            skrining_iva: document.getElementById('skrining-iva')?.checked || false,
            skrining_papsmear: document.getElementById('skrining-papsmear')?.checked || false,
            skrining_kolposkopi: document.getElementById('skrining-kolposkopi')?.checked || false,
            hasil_skrining: document.getElementById('anamnesa-hasil-skrining')?.value || '',
            riwayat_keluarga: document.getElementById('anamnesa-riwayat-keluarga')?.value || '',
            alergi_obat: document.getElementById('anamnesa-alergi-obat')?.value || '',
            alergi_makanan: document.getElementById('anamnesa-alergi-makanan')?.value || '',
            alergi_lingkungan: document.getElementById('anamnesa-alergi-lingkungan')?.value || '',
            metode_kb: document.getElementById('anamnesa-metode-kb')?.value || '',
            kegagalan_kb: document.getElementById('anamnesa-kegagalan-kb')?.value || '',
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
                stateManager.updateSectionData('anamnesa', data);

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
        Object.keys(anamnesa).forEach(key => {
            const el = document.getElementById(`anamnesa-${key.replace(/_/g, '-')}`);
            if (el) {
                if (el.type === 'checkbox') {
                    el.checked = anamnesa[key] || false;
                } else {
                    el.value = anamnesa[key] || '';
                }
            }
        });
    }
};
