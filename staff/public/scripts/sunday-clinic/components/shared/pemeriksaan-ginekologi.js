/**
 * Pemeriksaan Ginekologi Component (Shared for gyn_repro & gyn_special)
 * Simple text area for gynecological examination notes
 * Using obstetri-style CSS (sc-section, sc-grid, sc-card)
 */

import stateManager from '../../utils/state-manager.js';
import apiClient from '../../utils/api-client.js';

export default {
    /**
     * Render the Pemeriksaan Ginekologi form
     */
    async render(state) {
        const gynExam = state.recordData?.pemeriksaan_ginekologi || {};
        const savedContent = gynExam.content || '';
        const isSaved = !!gynExam.saved_at;

        // Get metadata context for display
        let metaHtml = '';
        try {
            const { getMedicalRecordContext, renderRecordMeta } = await import('../../utils/helpers.js');
            const context = getMedicalRecordContext(state, 'pemeriksaan_ginekologi');
            if (context) {
                metaHtml = renderRecordMeta(context, 'pemeriksaan_ginekologi');
            }
        } catch (error) {
            console.error('[PemeriksaanGinekologi] Failed to load metadata:', error);
        }

        return `
            <div class="sc-section">
                <div class="sc-section-header">
                    <h3>Pemeriksaan Ginekologi</h3>
                    <button class="btn btn-primary btn-sm" id="gyn-exam-save">
                        <i class="fas fa-save"></i> Simpan
                    </button>
                </div>
                ${metaHtml}

                <div class="sc-grid two">
                    <div class="sc-card">
                        <h4>Hasil Pemeriksaan</h4>
                        <div class="form-group mb-3">
                            <textarea id="gyn-exam-content" class="form-control" rows="15"
                                placeholder="Tuliskan hasil pemeriksaan ginekologi...

Contoh:
- Inspeksi vulva: normal / kelainan
- Inspekulo: vagina, porsio, fluor albus
- Pemeriksaan bimanual: uterus, adneksa
- Pemeriksaan rektovaginal (jika diperlukan)
- Temuan lain">${this.escapeHtml(savedContent)}</textarea>
                        </div>
                    </div>

                    <div class="sc-card">
                        <h4>Panduan Pemeriksaan</h4>
                        <div class="alert alert-light border">
                            <strong>Inspeksi Vulva:</strong>
                            <ul class="mb-2 small">
                                <li>Bentuk, warna, edema</li>
                                <li>Lesi, massa, discharge</li>
                                <li>Klitoris, labia, introitus</li>
                            </ul>

                            <strong>Pemeriksaan Inspekulo:</strong>
                            <ul class="mb-2 small">
                                <li>Vagina: mukosa, discharge</li>
                                <li>Porsio: warna, konsistensi, lesi</li>
                                <li>Fluor albus: warna, bau, konsistensi</li>
                            </ul>

                            <strong>Pemeriksaan Bimanual:</strong>
                            <ul class="mb-2 small">
                                <li>Uterus: ukuran, posisi, konsistensi, nyeri</li>
                                <li>Adneksa: massa, nyeri</li>
                                <li>Forniks: bebas, nyeri</li>
                            </ul>

                            <strong>Temuan Abnormal:</strong>
                            <ul class="mb-0 small">
                                <li>Massa / Tumor</li>
                                <li>Perdarahan</li>
                                <li>Discharge abnormal</li>
                                <li>Nyeri tekan / Nyeri goyang</li>
                            </ul>
                        </div>
                    </div>
                </div>

                <div class="mt-3 text-muted small" id="gyn-exam-status">
                    ${isSaved ? `<i class="fas fa-check text-success"></i> Terakhir disimpan: ${new Date(gynExam.saved_at).toLocaleString('id-ID')}` : '<i class="fas fa-info-circle"></i> Belum disimpan'}
                </div>
            </div>
        `;
    },

    /**
     * Setup event listeners after render
     */
    afterRender(state) {
        const saveBtn = document.getElementById('gyn-exam-save');

        if (saveBtn) {
            saveBtn.addEventListener('click', () => this.save());
        }
    },

    /**
     * Save pemeriksaan ginekologi data
     */
    async save() {
        const content = document.getElementById('gyn-exam-content')?.value || '';
        const state = stateManager.getState();
        const mrId = state.currentMrId ||
                     state.recordData?.mrId ||
                     state.recordData?.mr_id ||
                     state.recordData?.record?.mrId ||
                     state.recordData?.record?.mr_id;

        if (!mrId) {
            console.error('[PemeriksaanGinekologi] MR ID not found in state:', state);
            alert('Error: MR ID tidak ditemukan');
            return { success: false };
        }

        const saveBtn = document.getElementById('gyn-exam-save');
        if (saveBtn) {
            saveBtn.disabled = true;
            saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Menyimpan...';
        }

        try {
            const response = await apiClient.saveSection(mrId, 'pemeriksaan_ginekologi', {
                content: content,
                saved_at: new Date().toISOString()
            });

            if (response.success) {
                // Update state
                stateManager.updateSectionData('pemeriksaan_ginekologi', {
                    content: content,
                    saved_at: new Date().toISOString()
                });

                // Update UI
                const statusEl = document.getElementById('gyn-exam-status');
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
            console.error('Error saving pemeriksaan ginekologi:', error);
            alert('Gagal menyimpan: ' + error.message);

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
