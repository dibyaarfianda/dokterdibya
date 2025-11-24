/**
 * Resume Medis Component
 * AI-generated medical summary from all patient data
 */

export default {
    /**
     * Render the Resume Medis section
     */
    async render(state) {
        const { getMedicalRecordContext, renderRecordMeta } = await import('../../utils/helpers.js');
        const context = getMedicalRecordContext(state, 'resume_medis');
        const metaHtml = context ? renderRecordMeta(context, 'resume_medis') : '';
        
        // Get saved resume if exists
        const savedResume = context?.data?.resume || '';
        const isGenerating = false;

        return `
            <div class="sc-section">
                <div class="sc-section-header">
                    <h3><i class="fas fa-file-medical-alt"></i> Resume Medis</h3>
                    <p class="text-muted mb-0">Resume medis yang dihasilkan oleh AI dari seluruh data pemeriksaan</p>
                </div>
                ${metaHtml}
                <div class="sc-card">
                    ${this.renderResumeContent(savedResume, isGenerating)}
                    
                    <div class="button-group mt-4">
                        <button type="button" class="btn btn-primary" id="btn-generate-resume" onclick="window.generateResumeMedis()">
                            <i class="fas fa-magic mr-2"></i>Generate Resume AI
                        </button>
                        ${savedResume ? `
                            <button type="button" class="btn btn-success ml-2" id="btn-save-resume" onclick="window.saveResumeMedis()">
                                <i class="fas fa-save mr-2"></i>Simpan Resume
                            </button>
                            <button type="button" class="btn btn-warning ml-2" id="btn-reset-resume" onclick="window.resetResumeMedis()">
                                <i class="fas fa-redo mr-2"></i>Reset Resume
                            </button>
                        ` : ''}
                    </div>
                </div>
            </div>
        `;
    },

    /**
     * Render resume content area
     */
    renderResumeContent(resume, isGenerating) {
        if (isGenerating) {
            return `
                <div class="alert alert-info" id="resume-generating">
                    <i class="fas fa-spinner fa-spin mr-2"></i>
                    Sedang membuat resume medis dengan AI...
                </div>
            `;
        }

        if (resume) {
            return `
                <div class="resume-display" id="resume-display">
                    <div class="card bg-light">
                        <div class="card-body">
                            <div id="resume-content" style="white-space: pre-wrap; line-height: 1.8; font-family: 'Frutiger Roman', 'Frutiger', 'Segoe UI', Arial, sans-serif; font-size: 12px;">${this.escapeHtml(resume)}</div>
                        </div>
                    </div>
                </div>
            `;
        }

        return `
            <div class="alert alert-warning" id="resume-empty">
                <i class="fas fa-info-circle mr-2"></i>
                Resume medis belum dibuat. Klik tombol "Generate Resume AI" untuk membuat resume otomatis dari data pemeriksaan.
            </div>
        `;
    },

    /**
     * Escape HTML special characters
     */
    escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }
};
