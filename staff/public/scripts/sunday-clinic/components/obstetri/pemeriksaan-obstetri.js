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

        return `
            <div class="card mb-3">
                <div class="card-header bg-primary text-white">
                    <h5 class="mb-0">
                        <i class="fas fa-heartbeat"></i> Pemeriksaan Obstetri
                    </h5>
                </div>
                <div class="card-body">
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
