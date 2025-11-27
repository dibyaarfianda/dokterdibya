/**
 * Send to Patient Component
 * Handles sending documents (Resume Medis, USG Photos, Lab Results) to patient portal
 */

import stateManager from '../../utils/state-manager.js';

const SendToPatient = {
    /**
     * Render the send to patient modal
     */
    renderModal() {
        return `
            <div class="modal fade" id="sendToPatientModal" tabindex="-1" role="dialog" aria-labelledby="sendToPatientModalLabel" aria-hidden="true">
                <div class="modal-dialog modal-lg" role="document">
                    <div class="modal-content">
                        <div class="modal-header bg-info text-white">
                            <h5 class="modal-title" id="sendToPatientModalLabel">
                                <i class="fas fa-share-alt"></i> Kirim Dokumen ke Pasien
                            </h5>
                            <button type="button" class="close text-white" data-dismiss="modal" aria-label="Close">
                                <span aria-hidden="true">&times;</span>
                            </button>
                        </div>
                        <div class="modal-body">
                            <!-- Patient Info -->
                            <div class="alert alert-light border mb-4">
                                <div class="row">
                                    <div class="col-md-6">
                                        <strong><i class="fas fa-user"></i> Pasien:</strong>
                                        <span id="send-patient-name">-</span>
                                    </div>
                                    <div class="col-md-6">
                                        <strong><i class="fas fa-phone"></i> No. HP:</strong>
                                        <span id="send-patient-phone">-</span>
                                    </div>
                                </div>
                            </div>

                            <!-- Document Selection -->
                            <h6 class="mb-3"><i class="fas fa-file-medical"></i> Pilih Dokumen yang Akan Dikirim:</h6>

                            <div class="document-selection" id="document-selection">
                                <!-- Resume Medis -->
                                <div class="custom-control custom-checkbox mb-3">
                                    <input type="checkbox" class="custom-control-input" id="send-resume-medis" checked>
                                    <label class="custom-control-label" for="send-resume-medis">
                                        <i class="fas fa-file-medical-alt text-primary"></i>
                                        <strong>Resume Medis</strong>
                                        <small class="text-muted d-block">Ringkasan pemeriksaan yang di-generate AI</small>
                                    </label>
                                </div>

                                <!-- Lab Results -->
                                <div class="custom-control custom-checkbox mb-3" id="send-lab-container" style="display: none;">
                                    <input type="checkbox" class="custom-control-input" id="send-lab-results">
                                    <label class="custom-control-label" for="send-lab-results">
                                        <i class="fas fa-flask text-success"></i>
                                        <strong>Hasil Laboratorium</strong>
                                        <small class="text-muted d-block" id="send-lab-count">0 file</small>
                                    </label>
                                </div>

                                <!-- USG Photos (placeholder for future) -->
                                <div class="custom-control custom-checkbox mb-3" id="send-usg-container" style="display: none;">
                                    <input type="checkbox" class="custom-control-input" id="send-usg-photos">
                                    <label class="custom-control-label" for="send-usg-photos">
                                        <i class="fas fa-camera text-info"></i>
                                        <strong>Foto USG</strong>
                                        <small class="text-muted d-block" id="send-usg-count">0 foto</small>
                                    </label>
                                </div>
                            </div>

                            <hr>

                            <!-- Notification Channel -->
                            <h6 class="mb-3"><i class="fas fa-bell"></i> Kirim Notifikasi via:</h6>
                            <div class="row">
                                <div class="col-md-4">
                                    <div class="custom-control custom-checkbox">
                                        <input type="checkbox" class="custom-control-input" id="notify-portal" checked disabled>
                                        <label class="custom-control-label" for="notify-portal">
                                            <i class="fas fa-globe text-primary"></i> Portal Pasien
                                        </label>
                                    </div>
                                </div>
                                <div class="col-md-4">
                                    <div class="custom-control custom-checkbox">
                                        <input type="checkbox" class="custom-control-input" id="notify-whatsapp" checked>
                                        <label class="custom-control-label" for="notify-whatsapp">
                                            <i class="fab fa-whatsapp text-success"></i> WhatsApp
                                        </label>
                                    </div>
                                </div>
                                <div class="col-md-4">
                                    <div class="custom-control custom-checkbox">
                                        <input type="checkbox" class="custom-control-input" id="notify-email" disabled>
                                        <label class="custom-control-label" for="notify-email">
                                            <i class="fas fa-envelope text-secondary"></i> Email
                                            <small class="text-muted">(Coming soon)</small>
                                        </label>
                                    </div>
                                </div>
                            </div>

                            <!-- Status Message -->
                            <div id="send-status-message" class="mt-3" style="display: none;"></div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-dismiss="modal">
                                <i class="fas fa-times"></i> Batal
                            </button>
                            <button type="button" class="btn btn-info" id="btn-confirm-send" onclick="window.confirmSendToPatient()">
                                <i class="fas fa-paper-plane"></i> Kirim ke Pasien
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    /**
     * Open the send to patient modal
     */
    openModal() {
        const state = stateManager.getState();

        // Get patient info
        const patientName = state.patientData?.fullName ||
                           state.patientData?.full_name ||
                           state.intake?.personalInfo?.fullName ||
                           '-';
        const patientPhone = state.patientData?.phone ||
                            state.intake?.contactInfo?.phone ||
                            '-';

        // Update modal with patient info
        document.getElementById('send-patient-name').textContent = patientName;
        document.getElementById('send-patient-phone').textContent = patientPhone;

        // Check if resume exists
        const resumeExists = this.checkResumeExists(state);
        const resumeCheckbox = document.getElementById('send-resume-medis');
        if (resumeCheckbox) {
            resumeCheckbox.disabled = !resumeExists;
            resumeCheckbox.checked = resumeExists;
        }

        // Check if lab results exist
        const labFiles = state.recordData?.penunjang?.files || [];
        const labContainer = document.getElementById('send-lab-container');
        const labCount = document.getElementById('send-lab-count');
        if (labFiles.length > 0) {
            labContainer.style.display = 'block';
            labCount.textContent = `${labFiles.length} file`;
        } else {
            labContainer.style.display = 'none';
        }

        // Clear status message
        const statusEl = document.getElementById('send-status-message');
        if (statusEl) {
            statusEl.style.display = 'none';
            statusEl.innerHTML = '';
        }

        // Show modal
        $('#sendToPatientModal').modal('show');
    },

    /**
     * Check if resume exists
     */
    checkResumeExists(state) {
        // Check in medicalRecords
        const resumeFromDb = state.medicalRecords?.byType?.resume_medis?.data?.resume;
        if (resumeFromDb) return true;

        // Check in recordData
        const resumeFromState = state.recordData?.resume_medis?.resume;
        if (resumeFromState) return true;

        // Check in DOM
        const resumeContent = document.getElementById('resume-content');
        if (resumeContent && resumeContent.dataset.plainText) return true;

        return false;
    },

    /**
     * Get resume content
     */
    getResumeContent(state) {
        // Priority: DOM > recordData > medicalRecords
        const resumeContent = document.getElementById('resume-content');
        if (resumeContent && resumeContent.dataset.plainText) {
            return resumeContent.dataset.plainText;
        }

        const resumeFromState = state.recordData?.resume_medis?.resume;
        if (resumeFromState) return resumeFromState;

        const resumeFromDb = state.medicalRecords?.byType?.resume_medis?.data?.resume;
        if (resumeFromDb) return resumeFromDb;

        return null;
    },

    /**
     * Confirm and send documents to patient
     */
    async confirmSend() {
        const state = stateManager.getState();
        const statusEl = document.getElementById('send-status-message');
        const sendBtn = document.getElementById('btn-confirm-send');

        // Get patient info
        const patientId = state.derived?.patientId ||
                         state.recordData?.patientId ||
                         state.patientData?.id;
        const mrId = state.currentMrId ||
                    state.recordData?.mrId ||
                    state.recordData?.mr_id;

        if (!patientId) {
            this.showStatus('error', 'Patient ID tidak ditemukan');
            return;
        }

        // Collect selected documents
        const documents = [];

        // Resume Medis
        const sendResume = document.getElementById('send-resume-medis')?.checked;
        if (sendResume) {
            const resumeContent = this.getResumeContent(state);
            if (resumeContent) {
                const patientName = state.patientData?.fullName ||
                                   state.patientData?.full_name ||
                                   'Pasien';
                documents.push({
                    type: 'resume_medis',
                    title: `Resume Medis - ${patientName} - ${new Date().toLocaleDateString('id-ID')}`,
                    description: 'Resume medis yang di-generate oleh AI',
                    sourceData: {
                        content: resumeContent,
                        generatedAt: new Date().toISOString()
                    }
                });
            }
        }

        // Lab Results
        const sendLab = document.getElementById('send-lab-results')?.checked;
        if (sendLab) {
            const labFiles = state.recordData?.penunjang?.files || [];
            for (const file of labFiles) {
                documents.push({
                    type: 'lab_result',
                    title: file.name || 'Hasil Lab',
                    filePath: file.key || file.filename,
                    fileUrl: file.url,
                    fileName: file.name,
                    fileType: file.type,
                    fileSize: file.size
                });
            }

            // Lab interpretation
            const labInterpretation = state.recordData?.penunjang?.interpretation;
            if (labInterpretation) {
                documents.push({
                    type: 'lab_interpretation',
                    title: 'Interpretasi Hasil Lab',
                    sourceData: { content: labInterpretation }
                });
            }
        }

        if (documents.length === 0) {
            this.showStatus('error', 'Pilih minimal satu dokumen untuk dikirim');
            return;
        }

        // Collect notification channels
        const notifyChannels = {
            portal: true, // Always true
            whatsapp: document.getElementById('notify-whatsapp')?.checked || false,
            email: document.getElementById('notify-email')?.checked || false
        };

        // Disable button and show loading
        sendBtn.disabled = true;
        sendBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Mengirim...';
        this.showStatus('info', 'Sedang mengirim dokumen ke portal pasien...');

        try {
            const token = window.getToken?.() || localStorage.getItem('vps_auth_token');
            const response = await fetch('/api/patient-documents/publish-from-mr', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    patientId,
                    mrId,
                    documents,
                    notifyChannels
                })
            });

            const result = await response.json();

            if (!response.ok || !result.success) {
                throw new Error(result.message || 'Gagal mengirim dokumen');
            }

            // Get document IDs for WhatsApp notification
            const documentIds = result.documents.map(d => d.id);

            // Send WhatsApp notification if checked
            let whatsappResult = null;
            if (notifyChannels.whatsapp && documentIds.length > 0) {
                this.showStatus('info', 'Mengirim notifikasi WhatsApp...');

                const patientPhone = state.patientData?.phone ||
                                    state.intake?.contactInfo?.phone ||
                                    document.getElementById('send-patient-phone')?.textContent;

                try {
                    const waResponse = await fetch('/api/patient-documents/notify-whatsapp', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${token}`
                        },
                        body: JSON.stringify({
                            patientId,
                            documentIds,
                            phone: patientPhone
                        })
                    });

                    whatsappResult = await waResponse.json();
                } catch (waError) {
                    console.error('WhatsApp notification error:', waError);
                }
            }

            // Build success message
            let successMessage = `
                <i class="fas fa-check-circle"></i>
                Berhasil mengirim ${result.documents.length} dokumen ke portal pasien!
            `;

            if (whatsappResult?.success) {
                if (whatsappResult.method === 'fonnte') {
                    successMessage += `<br><small class="text-success"><i class="fab fa-whatsapp"></i> Notifikasi WhatsApp terkirim otomatis</small>`;
                } else if (whatsappResult.waLink) {
                    successMessage += `
                        <br><small class="text-success"><i class="fab fa-whatsapp"></i> Klik tombol di bawah untuk kirim via WhatsApp:</small>
                        <br><a href="${whatsappResult.waLink}" target="_blank" class="btn btn-success btn-sm mt-2">
                            <i class="fab fa-whatsapp"></i> Buka WhatsApp
                        </a>
                    `;
                }
            }

            this.showStatus('success', successMessage);

            // Reset button
            sendBtn.disabled = false;
            sendBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Kirim ke Pasien';

            // Close modal after delay (longer if WhatsApp link shown)
            const closeDelay = whatsappResult?.waLink ? 10000 : 2000;
            setTimeout(() => {
                $('#sendToPatientModal').modal('hide');
            }, closeDelay);

        } catch (error) {
            console.error('Send to patient error:', error);
            this.showStatus('error', `Gagal mengirim: ${error.message}`);

            sendBtn.disabled = false;
            sendBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Kirim ke Pasien';
        }
    },

    /**
     * Show status message
     */
    showStatus(type, message) {
        const statusEl = document.getElementById('send-status-message');
        if (!statusEl) return;

        const alertClass = {
            'success': 'alert-success',
            'error': 'alert-danger',
            'info': 'alert-info',
            'warning': 'alert-warning'
        }[type] || 'alert-info';

        statusEl.className = `alert ${alertClass} mt-3`;
        statusEl.innerHTML = message;
        statusEl.style.display = 'block';
    }
};

// Expose functions to window for onclick handlers
window.openSendToPatientModal = () => SendToPatient.openModal();
window.confirmSendToPatient = () => SendToPatient.confirmSend();

export default SendToPatient;
