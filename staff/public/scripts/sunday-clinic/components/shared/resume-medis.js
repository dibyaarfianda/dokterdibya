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

        // Check if documents have been sent to patient
        const documentsSent = state.documentsSent;
        const hasSentDocuments = documentsSent?.resume || documentsSent?.usg || documentsSent?.lab;

        // Build sent status text
        let sentStatusText = '';
        if (hasSentDocuments) {
            const sentItems = [];
            if (documentsSent.resume) sentItems.push('Resume Medis');
            if (documentsSent.usg) sentItems.push('Foto USG');
            if (documentsSent.lab) sentItems.push('Hasil Lab');
            sentStatusText = sentItems.join(' dan ') + ' telah dikirim ke pasien';
        }

        return `
            <div class="card mb-3" id="resume-medis-card">
                <div class="card-header bg-secondary text-white d-flex justify-content-between align-items-center">
                    <h5 class="mb-0">
                        <i class="fas fa-file-medical-alt"></i> Resume Medis
                    </h5>
                    <div>
                        ${savedResume ? '<span class="badge badge-light"><i class="fas fa-check"></i> Tersimpan</span>' : ''}
                        ${hasSentDocuments ? '<span class="badge badge-success ml-2 sent-badge"><i class="fas fa-paper-plane"></i> Sudah dikirim</span>' : ''}
                    </div>
                </div>
                ${metaHtml}
                <div class="card-body">
                    ${this.renderResumeContent(savedResume, isGenerating)}

                    <div class="d-flex justify-content-between align-items-center mt-4 flex-wrap">
                        <small class="${hasSentDocuments ? 'text-success' : 'text-muted'}" id="resume-status">
                            ${hasSentDocuments ? `<i class="fas fa-check-circle"></i> ${sentStatusText}` : (savedResume ? 'Resume sudah tersedia' : 'Belum ada resume')}
                        </small>
                        <div class="button-group" id="resume-button-group">
                            <button type="button" class="btn btn-primary" id="btn-generate-resume" onclick="window.generateResumeMedis()">
                                <i class="fas fa-magic"></i> Generate AI
                            </button>
                            ${savedResume ? `
                                <button type="button" class="btn btn-success ml-2" id="btn-save-resume" onclick="window.saveResumeMedis()">
                                    <i class="fas fa-save"></i> Simpan
                                </button>
                                <button type="button" class="btn btn-danger ml-2" id="btn-download-pdf" onclick="window.downloadResumePDF()">
                                    <i class="fas fa-file-pdf"></i> PDF
                                </button>
                                <button type="button" class="btn btn-success ml-2" id="btn-send-whatsapp" onclick="window.openWhatsAppModal()">
                                    <i class="fab fa-whatsapp"></i> WhatsApp
                                </button>
                                <button type="button" class="btn btn-info ml-2" id="btn-send-to-patient" onclick="window.openSendToPatientModal()">
                                    <i class="fas fa-share-alt"></i> Kirim ke Pasien
                                </button>
                                <button type="button" class="btn btn-outline-warning ml-2" id="btn-reset-resume" onclick="window.resetResumeMedis()">
                                    <i class="fas fa-redo"></i> Reset
                                </button>
                            ` : ''}
                        </div>
                    </div>

                    <!-- WhatsApp Modal -->
                    <div class="modal fade" id="whatsappResumeModal" tabindex="-1" role="dialog">
                        <div class="modal-dialog" role="document">
                            <div class="modal-content">
                                <div class="modal-header bg-success text-white">
                                    <h5 class="modal-title"><i class="fab fa-whatsapp mr-2"></i>Kirim Resume via WhatsApp</h5>
                                    <button type="button" class="close text-white" data-dismiss="modal">
                                        <span>&times;</span>
                                    </button>
                                </div>
                                <div class="modal-body">
                                    <div class="form-group">
                                        <label for="whatsapp-resume-phone">Nomor WhatsApp Tujuan</label>
                                        <input type="tel" class="form-control" id="whatsapp-resume-phone"
                                               placeholder="Contoh: 081234567890">
                                        <small class="form-text text-muted">
                                            Masukkan nomor HP (08xxx atau 62xxx)
                                        </small>
                                    </div>
                                </div>
                                <div class="modal-footer">
                                    <button type="button" class="btn btn-secondary" data-dismiss="modal">Batal</button>
                                    <button type="button" class="btn btn-success" id="btn-confirm-whatsapp" onclick="window.sendResumeWhatsApp()">
                                        <i class="fab fa-whatsapp mr-1"></i> Kirim
                                    </button>
                                </div>
                            </div>
                        </div>
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
            const formattedResume = this.formatResumeWithColumns(resume);
            return `
                <div class="resume-display" id="resume-display">
                    <div class="card bg-light">
                        <div class="card-body">
                            <div id="resume-content" 
                                 data-plain-text="${this.escapeHtml(resume)}"
                                 style="line-height: 1.8; font-family: 'Frutiger Roman', 'Frutiger', 'Segoe UI', Arial, sans-serif; font-size: 12px; color: #000;">${formattedResume}</div>
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
     * Format resume with 2 columns for USG screening section
     */
    formatResumeWithColumns(resume) {
        if (!resume) return '';
        
        // Split by sections
        const sections = resume.split(/(?=V\. PEMERIKSAAN ULTRASONOGRAFI)/);
        let formatted = '';
        
        for (let section of sections) {
            if (section.includes('Hasil Skrining Kelainan Kongenital:')) {
                // Format USG screening section with 2 columns
                const lines = section.split('\n');
                let result = '';
                let inScreening = false;
                let categories = [];
                let currentCategory = null;
                
                for (let line of lines) {
                    if (line.includes('Hasil Skrining Kelainan Kongenital:')) {
                        inScreening = true;
                        result += '<div style="white-space: pre-wrap;">' + this.escapeHtml(line) + '\n\n';
                        continue;
                    }
                    
                    if (inScreening && (line.match(/^(Kepala dan Otak|Muka dan Leher|Jantung dan Rongga Dada|Tulang Belakang|Anggota Gerak|Rongga Perut):/))) {
                        if (currentCategory) {
                            categories.push(currentCategory);
                        }
                        currentCategory = {
                            title: line,
                            items: []
                        };
                        continue;
                    }
                    
                    if (inScreening && currentCategory && line.trim().startsWith('•')) {
                        currentCategory.items.push(line);
                        continue;
                    }
                    
                    if (inScreening && line.includes('Kesimpulan:')) {
                        if (currentCategory) {
                            categories.push(currentCategory);
                            currentCategory = null;
                        }
                        inScreening = false;
                        
                        // Render categories in 2 columns
                        if (categories.length > 0) {
                            result += '<div style="column-count: 2; column-gap: 15px; margin: 5px 0; color: #000;">';
                            for (let cat of categories) {
                                result += '<div style="break-inside: avoid; margin-bottom: 10px;">';
                                result += this.escapeHtml(cat.title) + '<br>';
                                for (let item of cat.items) {
                                    result += '<span style="color: #000; text-decoration: none;">' + this.escapeHtml(item) + '</span><br>';
                                }
                                result += '</div>';
                            }
                            result += '</div>\n\n';
                            categories = [];
                        }
                        
                        result += this.escapeHtml(line) + '\n';
                        continue;
                    }
                    
                    if (!inScreening || !currentCategory) {
                        result += this.escapeHtml(line) + '\n';
                    }
                }
                
                if (currentCategory) {
                    categories.push(currentCategory);
                }
                if (categories.length > 0) {
                    result += '<div style="column-count: 2; column-gap: 15px; margin: 5px 0; color: #000;">';
                    for (let cat of categories) {
                        result += '<div style="break-inside: avoid; margin-bottom: 10px;">';
                        result += this.escapeHtml(cat.title) + '<br>';
                        for (let item of cat.items) {
                            result += '<span style="color: #000; text-decoration: none;">' + this.escapeHtml(item) + '</span><br>';
                        }
                        result += '</div>';
                    }
                    result += '</div></div>';
                }
                
                formatted += result;
            } else {
                // Regular section - escape and preserve whitespace
                formatted += '<div style="white-space: pre-wrap;">' + this.escapeHtml(section) + '</div>';
            }
        }
        
        return formatted;
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
