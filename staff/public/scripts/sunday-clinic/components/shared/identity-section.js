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
        const intake = state.intakeData || {};
        const category = record.mr_category || 'obstetri';

        // Use old simple format for obstetri category
        if (category === 'obstetri') {
            return this.renderObstetriFormat(state);
        }

        // Use new detailed format for other categories
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
                    ${this.renderDemographics(patient, intake)}

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
     * Render old Obstetri format (simple)
     */
    renderObstetriFormat(state) {
        const patient = state.patientData || {};
        const record = state.recordData?.record || {};
        const intake = state.intakeData || {};
        const intakePayload = intake.payload || {};

        const formatValue = (val) => val || '-';
        const formatPhone = (phone) => phone ? phone.replace(/(\d{4})(\d{4})(\d{4})/, '$1-$2-$3') : '-';

        // Get data from patient or intake payload
        const fullName = patient.fullName || patient.full_name || intakePayload.full_name || patient.name;
        const patientId = patient.id || patient.patient_id;
        const dateOfBirth = patient.birthDate || patient.date_of_birth || intakePayload.dob;
        const phone = patient.phone || patient.phone_number || patient.whatsapp;
        const email = patient.email || intakePayload.email;
        const address = patient.address || intakePayload.address;
        const maritalStatus = patient.marital_status || intakePayload.marital_status;
        const husbandName = patient.husband_name || intakePayload.husband_name;
        const husbandAge = patient.husband_age || intakePayload.husband_age;
        const husbandOccupation = patient.husband_occupation || intakePayload.husband_occupation;
        const occupation = patient.occupation || intakePayload.occupation;
        const education = patient.education || intakePayload.education;
        const insurance = patient.insurance || intakePayload.insurance;
        const emergencyPhone = patient.emergency_contact_phone || intakePayload.emergency_contact_phone;

        const height = patient.height || intakePayload.height;

        const primaryRows = [
            ['Nama Lengkap', formatValue(fullName)],
            ['ID Pasien', formatValue(patientId)],
            ['Usia', formatValue(dateOfBirth ? this.calculateAge(dateOfBirth) + ' tahun' : '')],
            ['Tinggi Badan', formatValue(height ? height + ' cm' : '')],
            ['Telepon', formatPhone(phone)],
            ['Kontak Darurat', formatPhone(emergencyPhone)],
            ['Email', formatValue(email)],
            ['Alamat', formatValue(address)],
            ['Status Pernikahan', formatValue(this.getMaritalStatusLabel(maritalStatus))],
            ['Nama Suami', formatValue(husbandName)],
            ['Umur Suami', formatValue(husbandAge ? husbandAge + ' tahun' : '')],
            ['Pekerjaan Suami', formatValue(husbandOccupation)],
            ['Pekerjaan Ibu', formatValue(occupation)],
            ['Pendidikan', formatValue(education)],
            ['Asuransi', formatValue(insurance || 'Tidak ada')]
        ];

        const intakeRows = [
            ['Status Intake', formatValue(intake.status ? this.getIntakeStatusLabel(intake.status) : '')],
            ['Diterima', formatValue(intake.created_at ? this.formatDate(intake.created_at) : '')],
            ['Diverifikasi', formatValue(intake.reviewed_at ? this.formatDate(intake.reviewed_at) : '')],
            ['Direview Oleh', formatValue(intake.reviewed_by_name)],
            ['Catatan Review', formatValue(intake.review_notes)]
        ];

        return `
            <div class="sc-section">
                <div class="sc-section-header">
                    <h3>Identitas Pasien</h3>
                </div>
                <div class="sc-card">
                    <h4>Data Utama</h4>
                    <table class="table table-sm table-bordered" style="table-layout: fixed; width: 100%;">
                        <colgroup>
                            <col style="width: 22%;">
                            <col style="width: 78%;">
                        </colgroup>
                        <tbody>
                            ${primaryRows.map(([label, value]) => `
                                <tr>
                                    <th style="font-size: 9px; padding: 4px 6px;">${label}</th>
                                    <td style="font-size: 9px; padding: 4px 6px; word-break: break-word;">${value}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    },

    getMaritalStatusLabel(status) {
        const labels = {
            'single': 'Belum Menikah',
            'married': 'Menikah',
            'divorced': 'Bercerai',
            'widowed': 'Janda/Duda',
            'unknown': 'Tidak Diketahui'
        };
        return labels[status] || status;
    },

    getIntakeStatusLabel(status) {
        const labels = {
            'pending': 'Menunggu Review',
            'approved': 'Disetujui',
            'rejected': 'Ditolak'
        };
        return labels[status] || status;
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
    renderDemographics(patient, intake = {}) {
        const intakePayload = intake.payload || {};
        const fullName = patient.full_name || patient.name || 'N/A';
        const dob = patient.date_of_birth || patient.dob || '';
        const dobFormatted = dob ? this.formatDate(dob) : 'N/A';
        const age = dob ? this.calculateAge(dob) : 'N/A';
        const height = patient.height || intakePayload.height || '';
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
                    <div class="col-md-3">
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

                    <div class="col-md-2">
                        <div class="info-group mb-3">
                            <label class="text-muted mb-1">Tinggi Badan:</label>
                            <div class="info-value">
                                ${height ? `<strong>${height}</strong> cm` : 'N/A'}
                            </div>
                        </div>
                    </div>

                    <div class="col-md-2">
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
     * Format date to European format (DD/MM/YYYY)
     */
    formatDate(dateString) {
        if (!dateString) return 'N/A';

        const date = new Date(dateString);
        if (isNaN(date.getTime())) return 'N/A';

        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();

        return `${day}/${month}/${year}`;
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
