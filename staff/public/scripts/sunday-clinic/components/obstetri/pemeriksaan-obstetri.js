/**
 * Pemeriksaan Obstetri Component
 * Obstetric examination for pregnant patients
 *
 * Fields:
 * - TFU (Tinggi Fundus Uteri - Fundal Height)
 * - DJJ (Denyut Jantung Janin - Fetal Heart Rate)
 * - VT (Vaginal Toucher)
 */

export default {
    /**
     * Render the Pemeriksaan Obstetri form
     */
    async render(state) {
        const obstetricExam = state.recordData?.pemeriksaan_obstetri || {};
        const defaultText = obstetricExam.findings || 'TFU:\nDJJ:\nVT:';

        // Get saved datetime or default to current time
        const now = new Date();
        const defaultDatetime = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}T${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        const recordDatetime = obstetricExam.record_datetime || defaultDatetime;

        // Get metadata for display
        const { getMedicalRecordContext, renderRecordMeta } = await import('../../utils/helpers.js');
        const context = getMedicalRecordContext(state, 'pemeriksaan_obstetri');
        const metaHtml = context ? renderRecordMeta(context, 'pemeriksaan_obstetri') : '';

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
                    <h3>Pemeriksaan Obstetri</h3>
                </div>
                ${metaHtml}
                <div class="form-group mb-3" style="max-width: 300px;">
                    <label class="font-weight-bold text-primary">
                        <i class="fas fa-clock mr-1"></i>Tanggal & Jam Pemeriksaan <span class="text-danger">*</span>
                    </label>
                    <input type="datetime-local"
                           class="form-control"
                           id="pemeriksaan-obstetri-datetime"
                           value="${escapeHtml(recordDatetime)}"
                           autocomplete="off"
                           required>
                </div>
                <div class="sc-card">
                    <div class="form-group">
                        <label for="pemeriksaan-obstetri-findings">
                            Hasil Pemeriksaan Obstetri
                        </label>
                        <textarea
                            class="form-control"
                            id="pemeriksaan-obstetri-findings"
                            name="pemeriksaan_obstetri[findings]"
                            rows="8"
                            placeholder="TFU:&#10;DJJ:&#10;VT:"
                        >${defaultText}</textarea>
                        <small class="form-text text-muted">
                            TFU = Tinggi Fundus Uteri, DJJ = Denyut Jantung Janin, VT = Vaginal Toucher
                        </small>
                    </div>

                    <div class="text-right mt-3">
                        <button type="button" class="btn btn-primary" id="save-pemeriksaan-obstetri" onclick="window.savePemeriksaanObstetri()">
                            <i class="fas fa-save mr-2"></i>Simpan Pemeriksaan Obstetri
                        </button>
                    </div>
                </div>
            </div>
        `;
    },

    /**
     * Collect form data for saving
     */
    async collectData() {
        const findings = document.getElementById('pemeriksaan-obstetri-findings')?.value || '';

        return {
            findings: findings.trim()
        };
    },

    /**
     * Validate form data
     */
    async validate() {
        // Pemeriksaan obstetri is optional, no strict validation needed
        return { valid: true, errors: [] };
    }
};
