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
