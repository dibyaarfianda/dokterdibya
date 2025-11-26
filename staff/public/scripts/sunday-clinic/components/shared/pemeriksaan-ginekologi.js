/**
 * Pemeriksaan Ginekologi Component (Shared for gyn_repro & gyn_special)
 * Simple text area for gynecological examination notes
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

        return `
            <div class="card mb-3">
                <div class="card-header bg-success text-white d-flex justify-content-between align-items-center">
                    <h5 class="mb-0">
                        <i class="fas fa-venus"></i> Pemeriksaan Ginekologi
                    </h5>
                    ${isSaved ? '<span class="badge badge-light"><i class="fas fa-check"></i> Tersimpan</span>' : ''}
                </div>
                <div class="card-body">
                    <div class="form-group">
                        <label>Hasil Pemeriksaan Ginekologi:</label>
                        <textarea id="gyn-exam-content" class="form-control" rows="12"
                                  placeholder="Tuliskan hasil pemeriksaan ginekologi...

Contoh:
- Inspeksi vulva: normal / kelainan
- Inspekulo: vagina, porsio, fluor albus
- Pemeriksaan bimanual: uterus, adneksa
- Pemeriksaan rektovaginal (jika diperlukan)
- Temuan lain">${this.escapeHtml(savedContent)}</textarea>
                    </div>

                    <div class="d-flex justify-content-between align-items-center mt-3">
                        <small class="text-muted" id="gyn-exam-status">
                            ${isSaved ? `Terakhir disimpan: ${new Date(gynExam.saved_at).toLocaleString('id-ID')}` : 'Belum disimpan'}
                        </small>
                        <div>
                            <button type="button" class="btn btn-outline-secondary btn-sm mr-2" id="gyn-exam-reset">
                                <i class="fas fa-undo"></i> Reset
                            </button>
                            <button type="button" class="btn btn-success" id="gyn-exam-save">
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
        const saveBtn = document.getElementById('gyn-exam-save');
        const resetBtn = document.getElementById('gyn-exam-reset');

        if (saveBtn) {
            saveBtn.addEventListener('click', () => this.save());
        }

        if (resetBtn) {
            resetBtn.addEventListener('click', () => this.reset(state));
        }
    },

    /**
     * Save pemeriksaan ginekologi data
     */
    async save() {
        const content = document.getElementById('gyn-exam-content')?.value || '';
        const mrId = stateManager.getState().recordData?.record?.mr_id;

        if (!mrId) {
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
     * Reset form to original state
     */
    reset(state) {
        const originalContent = state.recordData?.pemeriksaan_ginekologi?.content || '';
        const textarea = document.getElementById('gyn-exam-content');
        if (textarea) {
            textarea.value = originalContent;
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
