/**
 * Pemeriksaan Penunjang Component
 * Laboratory and supporting examination results with AI interpretation
 *
 * Features:
 * - Upload lab result images/PDFs
 * - AI interpretation using OpenAI GPT-4o Vision
 * - Professional display with clinic logo
 */

import stateManager from '../../utils/state-manager.js';

export default {
    /**
     * Render the Penunjang form
     */
    async render(state) {
        // Try to load from medicalRecords (database) first, then fallback to recordData
        const penunjangFromDb = state.medicalRecords?.byType?.penunjang?.data || {};
        const penunjangFromState = state.recordData?.penunjang || {};

        // Merge database and state data (state takes priority for real-time updates)
        const penunjang = {
            ...penunjangFromDb,
            ...penunjangFromState
        };

        const uploadedFiles = penunjang.files || [];
        const interpretation = penunjang.interpretation || '';

        // Get metadata for display
        const { getMedicalRecordContext, renderRecordMeta } = await import('../../utils/helpers.js');
        const context = getMedicalRecordContext(state, 'penunjang');
        const metaHtml = context ? renderRecordMeta(context, 'penunjang') : '';

        return `
            <div class="sc-section">
                <div class="sc-section-header">
                    <h3>Pemeriksaan Penunjang</h3>
                </div>
                ${metaHtml}
                <div class="sc-card">
                    <!-- Upload Section -->
                    <div class="form-group">
                        <label>Upload Hasil Laboratorium</label>
                        <div class="custom-file mb-3">
                            <input
                                type="file"
                                class="custom-file-input"
                                id="penunjang-file-upload"
                                accept="image/*,.pdf"
                                multiple
                            >
                            <label class="custom-file-label" for="penunjang-file-upload">
                                Pilih file...
                            </label>
                        </div>
                        <small class="form-text text-muted">
                            Format: JPG, PNG, PDF. Maksimal 10MB per file.
                        </small>
                    </div>

                    <!-- Uploaded Files List -->
                    <div id="penunjang-files-list" class="mb-3">
                        ${this.renderFilesList(uploadedFiles)}
                    </div>

                    <!-- AI Interpretation Button -->
                    ${uploadedFiles.length > 0 ? `
                        <button
                            type="button"
                            class="btn btn-info btn-block mb-3"
                            id="penunjang-interpret-btn"
                            ${interpretation ? 'disabled' : ''}
                        >
                            <i class="fas fa-robot"></i>
                            ${interpretation ? 'Sudah Diinterpretasi' : 'Interpretasi dengan AI'}
                        </button>
                    ` : ''}

                    <!-- AI Interpretation Display -->
                    <div id="penunjang-interpretation-display">
                        ${interpretation ? this.renderInterpretation(interpretation) : ''}
                    </div>

                    <!-- Hidden field to store interpretation -->
                    <input
                        type="hidden"
                        id="penunjang-interpretation"
                        name="penunjang[interpretation]"
                        value="${interpretation}"
                    >

                    <!-- Hidden field to store file paths -->
                    <input
                        type="hidden"
                        id="penunjang-files"
                        name="penunjang[files]"
                        value="${JSON.stringify(uploadedFiles).replace(/"/g, '&quot;')}"
                    >
                </div>
            </div>
        `;
    },

    /**
     * Render uploaded files list
     */
    renderFilesList(files) {
        if (!files || files.length === 0) {
            return '<p class="text-muted">Belum ada file yang diupload</p>';
        }

        return `
            <div class="list-group">
                ${files.map((file, index) => `
                    <div class="list-group-item d-flex justify-content-between align-items-center">
                        <div>
                            <i class="fas fa-file-${this.getFileIcon(file.type)}"></i>
                            <a href="${file.url}" target="_blank" class="ml-2">
                                ${file.name}
                            </a>
                            <small class="text-muted ml-2">(${this.formatFileSize(file.size)})</small>
                        </div>
                        <button
                            type="button"
                            class="btn btn-sm btn-danger penunjang-remove-file"
                            data-index="${index}"
                        >
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                `).join('')}
            </div>
        `;
    },

    /**
     * Render AI interpretation with professional formatting
     */
    renderInterpretation(interpretation) {
        return `
            <div class="interpretation-result border rounded p-3 bg-light">
                <div class="d-flex align-items-center mb-3">
                    <img
                        src="/images/logo.png"
                        alt="Dokter Dibya"
                        style="height: 40px;"
                        class="mr-3"
                    >
                    <div>
                        <h6 class="mb-0">Interpretasi Hasil Laboratorium</h6>
                        <small class="text-muted">Diinterpretasi oleh AI Medical Assistant</small>
                    </div>
                </div>
                <div class="interpretation-content" style="white-space: pre-wrap; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
${interpretation}
                </div>
                <hr>
                <small class="text-muted">
                    <i class="fas fa-info-circle"></i>
                    Interpretasi ini dihasilkan oleh AI dan harus diverifikasi oleh tenaga medis profesional.
                </small>
            </div>
        `;
    },

    /**
     * Get file icon based on type
     */
    getFileIcon(type) {
        if (type?.startsWith('image/')) return 'image';
        if (type?.includes('pdf')) return 'pdf';
        return 'alt';
    },

    /**
     * Format file size for display
     */
    formatFileSize(bytes) {
        if (!bytes) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
    },

    /**
     * Initialize event handlers
     */
    async initHandlers(state) {
        console.log('[Penunjang] initHandlers called');

        // File upload handler
        const fileInput = document.getElementById('penunjang-file-upload');
        console.log('[Penunjang] fileInput found:', !!fileInput);

        if (fileInput) {
            fileInput.addEventListener('change', async (e) => {
                console.log('[Penunjang] File selected:', e.target.files);
                await this.handleFileUpload(e, state);
            });
        }

        // Interpret button handler
        const interpretBtn = document.getElementById('penunjang-interpret-btn');
        if (interpretBtn) {
            interpretBtn.addEventListener('click', async () => {
                await this.handleInterpretation(state);
            });
        }

        // Remove file handlers
        document.querySelectorAll('.penunjang-remove-file').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const index = parseInt(e.currentTarget.dataset.index);
                this.removeFile(index, state);
            });
        });

        // Custom file input label update
        if (fileInput) {
            fileInput.addEventListener('change', function() {
                const fileName = this.files.length > 1
                    ? `${this.files.length} files selected`
                    : (this.files[0]?.name || 'Pilih file...');
                const label = this.nextElementSibling;
                label.textContent = fileName;
            });
        }
    },

    /**
     * Handle file upload
     */
    async handleFileUpload(event, state) {
        const files = Array.from(event.target.files);
        if (files.length === 0) return;

        // Validate file size (10MB max per file)
        const maxSize = 10 * 1024 * 1024;
        for (const file of files) {
            if (file.size > maxSize) {
                alert(`File ${file.name} terlalu besar. Maksimal 10MB.`);
                return;
            }
        }

        try {
            const formData = new FormData();
            files.forEach(file => formData.append('files', file));

            const token = window.getToken?.() || localStorage.getItem('vps_auth_token');
            const response = await fetch('/api/lab-results/upload', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                },
                body: formData
            });

            if (!response.ok) {
                throw new Error('Upload failed');
            }

            const result = await response.json();

            // Get current state from stateManager (not local copy)
            const currentState = stateManager.getState();
            const recordData = currentState.recordData || {};
            const penunjang = recordData.penunjang || {};

            // Merge new files with existing
            const updatedFiles = [...(penunjang.files || []), ...result.files];

            // Update recordData with new penunjang files
            recordData.penunjang = {
                ...penunjang,
                files: updatedFiles
            };

            // Update stateManager directly
            stateManager.setState({ recordData: recordData });

            // Save to database
            await this.savePenunjangToDatabase(updatedFiles, penunjang.interpretation || '');

            // Re-render component with updated state
            await this.refresh(stateManager.getState());

            alert('File berhasil diupload!');
        } catch (error) {
            console.error('Upload error:', error);
            alert('Gagal upload file. Silakan coba lagi.');
        }
    },

    /**
     * Save penunjang data to database
     */
    async savePenunjangToDatabase(files, interpretation) {
        try {
            const state = stateManager.getState();
            const patientId = state.derived?.patientId ||
                             state.recordData?.patientId ||
                             state.patientData?.id;

            // Get the current MR ID (visit ID) for proper record association
            const mrId = state.currentMrId ||
                        state.recordData?.mrId ||
                        state.recordData?.mr_id;

            console.log('[Penunjang] Saving to database:', { patientId, mrId, filesCount: files.length });

            if (!patientId) {
                console.warn('[Penunjang] Patient ID not found, skipping database save');
                return;
            }

            const token = window.getToken?.() || localStorage.getItem('vps_auth_token');
            if (!token) {
                console.warn('[Penunjang] No auth token, skipping database save');
                return;
            }

            const response = await fetch('/api/medical-records', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    patientId: patientId,
                    visitId: mrId, // Associate with current visit
                    type: 'penunjang',
                    data: {
                        files: files,
                        interpretation: interpretation
                    },
                    timestamp: new Date().toISOString()
                })
            });

            if (!response.ok) {
                const errText = await response.text();
                console.error('[Penunjang] Failed to save to database:', errText);
            } else {
                const result = await response.json();
                console.log('[Penunjang] Saved to database successfully:', result);
            }
        } catch (error) {
            console.error('[Penunjang] Error saving to database:', error);
        }
    },

    /**
     * Handle AI interpretation
     */
    async handleInterpretation(state) {
        const btn = document.getElementById('penunjang-interpret-btn');
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Menginterpretasi...';

        try {
            // Get current state from stateManager
            const currentState = stateManager.getState();
            const recordData = currentState.recordData || {};
            const penunjang = recordData.penunjang || {};
            const files = penunjang.files || [];

            if (files.length === 0) {
                alert('Tidak ada file untuk diinterpretasi');
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-robot"></i> Interpretasi dengan AI';
                return;
            }

            const token = window.getToken?.() || localStorage.getItem('vps_auth_token');
            const response = await fetch('/api/lab-results/interpret', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ files })
            });

            if (!response.ok) {
                throw new Error('Interpretation failed');
            }

            const result = await response.json();

            // Update recordData with interpretation
            recordData.penunjang = {
                ...penunjang,
                interpretation: result.interpretation
            };

            // Update stateManager directly
            stateManager.setState({ recordData: recordData });

            // Save to database
            await this.savePenunjangToDatabase(files, result.interpretation);

            // Re-render component with updated state
            await this.refresh(stateManager.getState());

        } catch (error) {
            console.error('Interpretation error:', error);
            alert('Gagal menginterpretasi hasil lab. Silakan coba lagi.');
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-robot"></i> Interpretasi dengan AI';
        }
    },

    /**
     * Remove uploaded file
     */
    async removeFile(index, state) {
        if (!confirm('Hapus file ini?')) return;

        // Get current state from stateManager
        const currentState = stateManager.getState();
        const recordData = currentState.recordData || {};
        const penunjang = recordData.penunjang || {};
        const files = [...(penunjang.files || [])];

        // Remove the file at index
        files.splice(index, 1);

        // Update recordData
        recordData.penunjang = {
            ...penunjang,
            files: files
        };

        // Update stateManager
        stateManager.setState({ recordData: recordData });

        // Save to database
        await this.savePenunjangToDatabase(files, penunjang.interpretation || '');

        // Refresh with updated state
        await this.refresh(stateManager.getState());
    },

    /**
     * Refresh component display
     */
    async refresh(state) {
        // IMPORTANT: Find the outer .sc-section container first to avoid duplicate headers
        // The render() method outputs the full section including header, so we must replace the whole section
        let container = document.querySelector('.sc-section:has(#penunjang-file-upload)');

        if (!container) {
            container = document.querySelector('[data-section="penunjang"]');
        }

        if (container) {
            const html = await this.render(state);
            container.outerHTML = html;
            await this.initHandlers(state);
        } else {
            console.warn('[Penunjang] Container not found for refresh');
        }
    },

    /**
     * Collect form data for saving
     */
    async collectData() {
        const interpretation = document.getElementById('penunjang-interpretation')?.value || '';
        const filesJson = document.getElementById('penunjang-files')?.value || '[]';
        const files = JSON.parse(filesJson.replace(/&quot;/g, '"'));

        return {
            interpretation,
            files
        };
    },

    /**
     * Validate form data
     */
    async validate() {
        // Penunjang is optional
        return { valid: true, errors: [] };
    },

    /**
     * Called after component is rendered to DOM
     */
    async afterRender(state) {
        console.log('[Penunjang] afterRender called');
        await this.initHandlers(state);
    }
};
