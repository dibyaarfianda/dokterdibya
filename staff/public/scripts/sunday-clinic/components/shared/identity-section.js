/**
 * Identity Section Component (Shared)
 * Displays patient demographics and basic information
 * Used across all 3 templates (Obstetri, Gyn Repro, Gyn Special)
 *
 * Sections:
 * 1. Medical Record Information
 * 2. Patient Demographics
 * 3. Contact Information
 * 4. Emergency Contact
 * 5. Visit Information
 */

export default {
    /**
     * Render the Identity section
     */
    async render(state) {
        const patient = state.patientData || {};
        const record = state.recordData?.record || {};
        const appointment = state.appointmentData || {};

        return `
            <div class="card mb-3">
                <div class="card-header bg-secondary text-white">
                    <h5 class="mb-0">
                        <i class="fas fa-id-card"></i> Identitas Pasien
                    </h5>
                </div>
                <div class="card-body">
                    <!-- Medical Record Information -->
                    ${this.renderMedicalRecordInfo(record, patient)}

                    <hr>

                    <!-- Patient Demographics -->
                    ${this.renderDemographics(patient)}

                    <hr>

                    <!-- Contact Information -->
                    ${this.renderContactInfo(patient)}

                    <hr>

                    <!-- Emergency Contact -->
                    ${this.renderEmergencyContact(patient)}

                    <hr>

                    <!-- Visit Information -->
                    ${this.renderVisitInfo(appointment, record)}
                </div>
            </div>
        `;
    },

    /**
     * Render Medical Record Information
     */
    renderMedicalRecordInfo(record, patient) {
        const mrId = record.mr_id || 'N/A';
        const mrCategory = record.mr_category || 'obstetri';
        const patientId = patient.patient_id || patient.id || 'N/A';
        const registrationDate = patient.created_at ? this.formatDate(patient.created_at) : 'N/A';

        const categoryLabels = {
            'obstetri': { label: 'Obstetri', icon: 'baby', color: 'primary' },
            'gyn_repro': { label: 'Ginekologi Reproduksi', icon: 'venus', color: 'success' },
            'gyn_special': { label: 'Ginekologi Khusus', icon: 'user-md', color: 'info' }
        };

        const category = categoryLabels[mrCategory] || categoryLabels['obstetri'];

        return `
            <div class="form-section">
                <h6 class="text-primary mb-3">
                    <i class="fas fa-file-medical"></i> Informasi Rekam Medis
                </h6>

                <div class="row">
                    <div class="col-md-4">
                        <div class="info-group">
                            <label class="text-muted mb-1">No. Rekam Medis (MR ID):</label>
                            <div class="info-value">
                                <strong class="h5 text-${category.color}">${mrId}</strong>
                            </div>
                        </div>
                    </div>

                    <div class="col-md-4">
                        <div class="info-group">
                            <label class="text-muted mb-1">Kategori:</label>
                            <div class="info-value">
                                <span class="badge badge-${category.color} badge-lg">
                                    <i class="fas fa-${category.icon}"></i> ${category.label}
                                </span>
                            </div>
                        </div>
                    </div>

                    <div class="col-md-4">
                        <div class="info-group">
                            <label class="text-muted mb-1">ID Pasien:</label>
                            <div class="info-value">
                                <strong>${patientId}</strong>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="row mt-3">
                    <div class="col-md-4">
                        <div class="info-group">
                            <label class="text-muted mb-1">Tanggal Registrasi:</label>
                            <div class="info-value">
                                ${registrationDate}
                            </div>
                        </div>
                    </div>

                    <div class="col-md-4">
                        <div class="info-group">
                            <label class="text-muted mb-1">Status:</label>
                            <div class="info-value">
                                <span class="badge badge-success">
                                    <i class="fas fa-check-circle"></i> Aktif
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    /**
     * Render Patient Demographics
     */
    renderDemographics(patient) {
        const fullName = patient.full_name || patient.name || 'N/A';
        const dob = patient.date_of_birth || patient.dob || '';
        const dobFormatted = dob ? this.formatDate(dob) : 'N/A';
        const age = dob ? this.calculateAge(dob) : 'N/A';
        const gender = patient.gender || 'female';
        const genderLabel = gender === 'male' ? 'Laki-laki' : 'Perempuan';
        const genderIcon = gender === 'male' ? 'mars' : 'venus';
        const maritalStatus = patient.marital_status || 'unknown';
        const religion = patient.religion || 'N/A';
        const occupation = patient.occupation || 'N/A';
        const education = patient.education || 'N/A';

        const maritalStatusLabels = {
            'single': 'Belum Menikah',
            'married': 'Menikah',
            'divorced': 'Bercerai',
            'widowed': 'Janda/Duda',
            'unknown': 'Tidak Diketahui'
        };

        return `
            <div class="form-section">
                <h6 class="text-primary mb-3">
                    <i class="fas fa-user"></i> Data Demografis
                </h6>

                <div class="row">
                    <div class="col-md-6">
                        <div class="info-group mb-3">
                            <label class="text-muted mb-1">Nama Lengkap:</label>
                            <div class="info-value">
                                <strong class="h6">${fullName}</strong>
                            </div>
                        </div>
                    </div>

                    <div class="col-md-3">
                        <div class="info-group mb-3">
                            <label class="text-muted mb-1">Jenis Kelamin:</label>
                            <div class="info-value">
                                <i class="fas fa-${genderIcon}"></i> ${genderLabel}
                            </div>
                        </div>
                    </div>

                    <div class="col-md-3">
                        <div class="info-group mb-3">
                            <label class="text-muted mb-1">Status Pernikahan:</label>
                            <div class="info-value">
                                ${maritalStatusLabels[maritalStatus] || maritalStatus}
                            </div>
                        </div>
                    </div>
                </div>

                <div class="row">
                    <div class="col-md-4">
                        <div class="info-group mb-3">
                            <label class="text-muted mb-1">Tanggal Lahir:</label>
                            <div class="info-value">
                                ${dobFormatted}
                            </div>
                        </div>
                    </div>

                    <div class="col-md-2">
                        <div class="info-group mb-3">
                            <label class="text-muted mb-1">Usia:</label>
                            <div class="info-value">
                                <strong>${age}</strong> tahun
                            </div>
                        </div>
                    </div>

                    <div class="col-md-3">
                        <div class="info-group mb-3">
                            <label class="text-muted mb-1">Agama:</label>
                            <div class="info-value">
                                ${religion}
                            </div>
                        </div>
                    </div>

                    <div class="col-md-3">
                        <div class="info-group mb-3">
                            <label class="text-muted mb-1">Pendidikan:</label>
                            <div class="info-value">
                                ${education}
                            </div>
                        </div>
                    </div>
                </div>

                <div class="row">
                    <div class="col-md-12">
                        <div class="info-group mb-3">
                            <label class="text-muted mb-1">Pekerjaan:</label>
                            <div class="info-value">
                                ${occupation}
                            </div>
                        </div>
                    </div>
                </div>

                <div class="row">
                    <div class="col-md-12">
                        <div class="info-group mb-3">
                            <label class="text-muted mb-1">Alamat:</label>
                            <div class="info-value">
                                ${patient.address || 'N/A'}
                            </div>
                        </div>
                    </div>
                </div>

                <div class="row">
                    <div class="col-md-6">
                        <div class="info-group mb-3">
                            <label class="text-muted mb-1">Kota:</label>
                            <div class="info-value">
                                ${patient.city || 'N/A'}
                            </div>
                        </div>
                    </div>

                    <div class="col-md-3">
                        <div class="info-group mb-3">
                            <label class="text-muted mb-1">Provinsi:</label>
                            <div class="info-value">
                                ${patient.province || 'N/A'}
                            </div>
                        </div>
                    </div>

                    <div class="col-md-3">
                        <div class="info-group mb-3">
                            <label class="text-muted mb-1">Kode Pos:</label>
                            <div class="info-value">
                                ${patient.postal_code || 'N/A'}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    /**
     * Render Contact Information
     */
    renderContactInfo(patient) {
        const phone = patient.phone || patient.phone_number || 'N/A';
        const email = patient.email || 'N/A';
        const whatsapp = patient.whatsapp || phone;

        return `
            <div class="form-section">
                <h6 class="text-primary mb-3">
                    <i class="fas fa-phone"></i> Informasi Kontak
                </h6>

                <div class="row">
                    <div class="col-md-4">
                        <div class="info-group mb-3">
                            <label class="text-muted mb-1">Nomor Telepon:</label>
                            <div class="info-value">
                                <i class="fas fa-phone"></i>
                                <a href="tel:${phone}">${phone}</a>
                            </div>
                        </div>
                    </div>

                    <div class="col-md-4">
                        <div class="info-group mb-3">
                            <label class="text-muted mb-1">WhatsApp:</label>
                            <div class="info-value">
                                <i class="fab fa-whatsapp text-success"></i>
                                <a href="https://wa.me/${whatsapp.replace(/[^0-9]/g, '')}" target="_blank">
                                    ${whatsapp}
                                </a>
                            </div>
                        </div>
                    </div>

                    <div class="col-md-4">
                        <div class="info-group mb-3">
                            <label class="text-muted mb-1">Email:</label>
                            <div class="info-value">
                                <i class="fas fa-envelope"></i>
                                <a href="mailto:${email}">${email}</a>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    /**
     * Render Emergency Contact
     */
    renderEmergencyContact(patient) {
        const emergencyContact = patient.emergency_contact || {};
        const name = emergencyContact.name || patient.emergency_contact_name || 'N/A';
        const relationship = emergencyContact.relationship || patient.emergency_contact_relationship || 'N/A';
        const phone = emergencyContact.phone || patient.emergency_contact_phone || 'N/A';

        return `
            <div class="form-section">
                <h6 class="text-primary mb-3">
                    <i class="fas fa-user-friends"></i> Kontak Darurat
                </h6>

                <div class="row">
                    <div class="col-md-4">
                        <div class="info-group mb-3">
                            <label class="text-muted mb-1">Nama:</label>
                            <div class="info-value">
                                <strong>${name}</strong>
                            </div>
                        </div>
                    </div>

                    <div class="col-md-4">
                        <div class="info-group mb-3">
                            <label class="text-muted mb-1">Hubungan:</label>
                            <div class="info-value">
                                ${relationship}
                            </div>
                        </div>
                    </div>

                    <div class="col-md-4">
                        <div class="info-group mb-3">
                            <label class="text-muted mb-1">Nomor Telepon:</label>
                            <div class="info-value">
                                <i class="fas fa-phone"></i>
                                <a href="tel:${phone}">${phone}</a>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    /**
     * Render Visit Information
     */
    renderVisitInfo(appointment, record) {
        const visitDate = appointment.appointment_date || record.created_at || '';
        const visitDateFormatted = visitDate ? this.formatDate(visitDate) : 'N/A';
        const visitType = appointment.visit_type || 'kunjungan_rutin';
        const doctor = appointment.doctor_name || 'N/A';
        const referral = appointment.referral_source || 'N/A';

        const visitTypeLabels = {
            'kunjungan_pertama': 'Kunjungan Pertama',
            'kunjungan_rutin': 'Kunjungan Rutin',
            'kunjungan_lanjutan': 'Kunjungan Lanjutan',
            'kunjungan_darurat': 'Kunjungan Darurat',
            'konsultasi': 'Konsultasi'
        };

        return `
            <div class="form-section">
                <h6 class="text-primary mb-3">
                    <i class="fas fa-calendar-check"></i> Informasi Kunjungan
                </h6>

                <div class="row">
                    <div class="col-md-4">
                        <div class="info-group mb-3">
                            <label class="text-muted mb-1">Tanggal Kunjungan:</label>
                            <div class="info-value">
                                <i class="fas fa-calendar"></i> ${visitDateFormatted}
                            </div>
                        </div>
                    </div>

                    <div class="col-md-4">
                        <div class="info-group mb-3">
                            <label class="text-muted mb-1">Jenis Kunjungan:</label>
                            <div class="info-value">
                                ${visitTypeLabels[visitType] || visitType}
                            </div>
                        </div>
                    </div>

                    <div class="col-md-4">
                        <div class="info-group mb-3">
                            <label class="text-muted mb-1">Dokter:</label>
                            <div class="info-value">
                                <i class="fas fa-user-md"></i> ${doctor}
                            </div>
                        </div>
                    </div>
                </div>

                <div class="row">
                    <div class="col-md-12">
                        <div class="info-group mb-3">
                            <label class="text-muted mb-1">Sumber Rujukan:</label>
                            <div class="info-value">
                                ${referral}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    /**
     * Calculate age from date of birth
     */
    calculateAge(dob) {
        const birthDate = new Date(dob);
        const today = new Date();
        let age = today.getFullYear() - birthDate.getFullYear();
        const monthDiff = today.getMonth() - birthDate.getMonth();

        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
            age--;
        }

        return age;
    },

    /**
     * Format date to readable format
     */
    formatDate(dateString) {
        if (!dateString) return 'N/A';

        const date = new Date(dateString);
        const options = {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        };

        return date.toLocaleDateString('id-ID', options);
    },

    /**
     * Save identity data
     * Note: Identity section is mostly read-only display of existing data
     * Any changes to patient demographics should be done through patient management
     */
    async save(state) {
        try {
            console.log('[IdentitySection] Identity section is read-only, no save operation needed');

            return {
                success: true,
                message: 'Identity section displayed successfully',
                data: {
                    patient_id: state.patientData?.patient_id || state.patientData?.id,
                    mr_id: state.recordData?.record?.mr_id
                }
            };

        } catch (error) {
            console.error('[IdentitySection] Save failed:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
};
