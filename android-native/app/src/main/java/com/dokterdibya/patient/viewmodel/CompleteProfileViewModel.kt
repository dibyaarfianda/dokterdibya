package com.dokterdibya.patient.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.dokterdibya.patient.data.model.IntakeMetadata
import com.dokterdibya.patient.data.model.PatientIntakeRequest
import com.dokterdibya.patient.data.repository.PatientRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.Period
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter
import javax.inject.Inject

data class CompleteProfileUiState(
    // Registration Code (shown at top of Step 1 if required)
    val registrationCode: String = "",
    val registrationCodeRequired: Boolean = false,
    val registrationCodeValidated: Boolean = false,
    val registrationCodeValidating: Boolean = false,

    // Step 1: Basic Info
    val fullname: String = "",
    val birthDate: String = "",
    val age: Int? = null,
    val height: String = "",
    val heightUnknown: Boolean = false,
    val nik: String = "",

    // Step 2: Contact
    val phone: String = "",
    val emergencyContact: String = "",

    // Step 3: Address
    val address: String = "",

    // Step 4: Marital Status
    val maritalStatus: String = "", // single, menikah, cerai

    // Step 5: Spouse Info (if married)
    val husbandName: String = "",
    val husbandAge: String = "",
    val husbandJob: String = "",

    // Step 6: Children & Obstetric Info
    val hasChildren: String = "", // "ya" or "tidak"
    val livingChildrenCount: String = "",
    val youngestChildAge: String = "",
    val totalPregnancies: String = "",
    val normalDeliveryCount: String = "",
    val cesareanDeliveryCount: String = "",
    val miscarriageCount: String = "",
    val hadEctopic: String = "", // "ya" or "tidak"

    // Step 7: Social & Payment
    val occupation: String = "",
    val education: String = "",
    val paymentMethods: Set<String> = emptySet(), // "self", "bpjs", "insurance"
    val insuranceName: String = "",

    // Step 8: Blood & Allergies
    val bloodType: String = "",
    val rhesus: String = "",
    val allergyDrugs: String = "",
    val allergyFood: String = "",
    val allergyEnv: String = "",

    // Step 9: Medical History
    val medName1: String = "",
    val medDose1: String = "",
    val medFreq1: String = "",
    val medName2: String = "",
    val medDose2: String = "",
    val medFreq2: String = "",
    val medName3: String = "",
    val medDose3: String = "",
    val medFreq3: String = "",
    val pastConditions: Set<String> = emptySet(),
    val pastConditionsDetail: String = "",
    val familyHistory: Set<String> = emptySet(),
    val familyHistoryDetail: String = "",

    // Step 10: Confirmation
    val patientSignature: String = "",
    val consentChecked: Boolean = false,
    val finalAckChecked: Boolean = false,

    // Existing intake info (for update mode)
    val isExistingIntake: Boolean = false,
    val existingSubmissionId: String? = null,
    val existingQuickId: String? = null,

    // UI State
    val currentStep: Int = 1,
    val totalSteps: Int = 10,
    val isLoading: Boolean = false,
    val error: String? = null,
    val isSuccess: Boolean = false,
    val successMessage: String? = null
)

@HiltViewModel
class CompleteProfileViewModel @Inject constructor(
    private val patientRepository: PatientRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(CompleteProfileUiState())
    val uiState: StateFlow<CompleteProfileUiState> = _uiState.asStateFlow()

    // Medical condition options (same as web)
    val pastConditionOptions = listOf(
        "diabetes" to "Diabetes",
        "hipertensi" to "Hipertensi (Darah Tinggi)",
        "asma" to "Asma",
        "jantung" to "Penyakit Jantung",
        "ginjal" to "Penyakit Ginjal",
        "tiroid" to "Gangguan Tiroid",
        "anemia" to "Anemia",
        "hepatitis" to "Hepatitis",
        "tbc" to "TBC",
        "hiv" to "HIV/AIDS",
        "autoimun" to "Penyakit Autoimun",
        "kanker" to "Kanker",
        "epilepsi" to "Epilepsi",
        "depresi" to "Depresi/Gangguan Mental",
        "lainnya" to "Lainnya"
    )

    val familyHistoryOptions = listOf(
        "diabetes" to "Diabetes",
        "hipertensi" to "Hipertensi",
        "jantung" to "Penyakit Jantung",
        "kanker" to "Kanker",
        "stroke" to "Stroke",
        "asma" to "Asma",
        "autoimun" to "Penyakit Autoimun",
        "kelainan_darah" to "Kelainan Darah",
        "cacat_lahir" to "Cacat Lahir",
        "lainnya" to "Lainnya"
    )

    val educationOptions = listOf(
        "" to "Pilih pendidikan",
        "sd" to "SD",
        "smp" to "SMP",
        "sma" to "SMA/SMK",
        "d3" to "D3",
        "s1" to "S1",
        "s2" to "S2",
        "s3" to "S3"
    )

    val bloodTypeOptions = listOf(
        "" to "Pilih golongan darah",
        "A" to "A",
        "B" to "B",
        "AB" to "AB",
        "O" to "O",
        "tidak_tahu" to "Tidak tahu"
    )

    val rhesusOptions = listOf(
        "" to "Pilih rhesus",
        "positif" to "Positif (+)",
        "negatif" to "Negatif (-)",
        "tidak_tahu" to "Tidak tahu"
    )

    init {
        loadProfile()
        loadExistingIntake()
        checkRegistrationCodeRequired()
    }

    private fun checkRegistrationCodeRequired() {
        viewModelScope.launch {
            patientRepository.isRegistrationCodeRequired().fold(
                onSuccess = { required ->
                    _uiState.value = _uiState.value.copy(registrationCodeRequired = required)
                },
                onFailure = {
                    // Default to required if can't check
                    _uiState.value = _uiState.value.copy(registrationCodeRequired = true)
                }
            )
        }
    }

    fun updateRegistrationCode(value: String) {
        // Only allow alphanumeric, uppercase, max 6 chars
        val cleaned = value.uppercase().filter { it.isLetterOrDigit() }.take(6)
        _uiState.value = _uiState.value.copy(
            registrationCode = cleaned,
            registrationCodeValidated = false,
            error = null
        )
    }

    fun validateRegistrationCode() {
        val code = _uiState.value.registrationCode
        if (code.length != 6) {
            _uiState.value = _uiState.value.copy(error = "Kode registrasi harus 6 karakter")
            return
        }

        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(registrationCodeValidating = true, error = null)

            patientRepository.validateRegistrationCode(code).fold(
                onSuccess = { valid ->
                    if (valid) {
                        _uiState.value = _uiState.value.copy(
                            registrationCodeValidating = false,
                            registrationCodeValidated = true,
                            error = null
                        )
                    } else {
                        _uiState.value = _uiState.value.copy(
                            registrationCodeValidating = false,
                            registrationCodeValidated = false,
                            error = "Kode registrasi tidak valid atau sudah kadaluarsa"
                        )
                    }
                },
                onFailure = { error ->
                    _uiState.value = _uiState.value.copy(
                        registrationCodeValidating = false,
                        registrationCodeValidated = false,
                        error = error.message ?: "Gagal memvalidasi kode"
                    )
                }
            )
        }
    }

    private fun loadProfile() {
        viewModelScope.launch {
            patientRepository.getProfile().fold(
                onSuccess = { patient ->
                    // Use current state to preserve registrationCodeRequired from parallel coroutine
                    val current = _uiState.value
                    _uiState.value = current.copy(
                        fullname = patient.name,
                        phone = patient.phone ?: "",
                        birthDate = patient.birthDate ?: ""
                    )
                    patient.birthDate?.let { calculateAge(it) }
                },
                onFailure = { /* Ignore, user will fill in */ }
            )
        }
    }

    private fun loadExistingIntake() {
        viewModelScope.launch {
            patientRepository.getMyIntake().fold(
                onSuccess = { existing ->
                    if (existing != null) {
                        val payload = existing.payload
                        // Use current state to preserve registrationCodeRequired from parallel coroutine
                        val current = _uiState.value
                        _uiState.value = current.copy(
                            isExistingIntake = true,
                            existingSubmissionId = existing.submissionId,
                            existingQuickId = existing.quickId,
                            // Pre-fill from existing intake
                            fullname = payload?.fullName ?: current.fullname,
                            birthDate = payload?.dob ?: current.birthDate,
                            age = payload?.age ?: current.age,
                            height = payload?.height ?: "",
                            heightUnknown = payload?.heightUnknown ?: false,
                            nik = payload?.nik ?: "",
                            phone = payload?.phone ?: current.phone,
                            emergencyContact = payload?.emergencyContact ?: "",
                            address = payload?.address ?: "",
                            maritalStatus = payload?.maritalStatus ?: "",
                            husbandName = payload?.husbandName ?: "",
                            husbandAge = payload?.husbandAge ?: "",
                            husbandJob = payload?.husbandJob ?: "",
                            hasChildren = payload?.hasChildren ?: "",
                            livingChildrenCount = payload?.livingChildrenCount ?: "",
                            youngestChildAge = payload?.youngestChildAge ?: "",
                            totalPregnancies = payload?.totalPregnancies ?: "",
                            normalDeliveryCount = payload?.normalDeliveryCount ?: "",
                            cesareanDeliveryCount = payload?.cesareanDeliveryCount ?: "",
                            miscarriageCount = payload?.miscarriageCount ?: "",
                            hadEctopic = payload?.hadEctopic ?: "",
                            occupation = payload?.occupation ?: "",
                            education = payload?.education ?: "",
                            paymentMethods = payload?.paymentMethod?.toSet() ?: emptySet(),
                            insuranceName = payload?.insuranceName ?: "",
                            bloodType = payload?.bloodType ?: "",
                            rhesus = payload?.rhesus ?: "",
                            allergyDrugs = payload?.allergyDrugs ?: "",
                            allergyFood = payload?.allergyFood ?: "",
                            allergyEnv = payload?.allergyEnv ?: "",
                            medName1 = payload?.medName1 ?: "",
                            medDose1 = payload?.medDose1 ?: "",
                            medFreq1 = payload?.medFreq1 ?: "",
                            medName2 = payload?.medName2 ?: "",
                            medDose2 = payload?.medDose2 ?: "",
                            medFreq2 = payload?.medFreq2 ?: "",
                            medName3 = payload?.medName3 ?: "",
                            medDose3 = payload?.medDose3 ?: "",
                            medFreq3 = payload?.medFreq3 ?: "",
                            pastConditions = payload?.pastConditions?.toSet() ?: emptySet(),
                            pastConditionsDetail = payload?.pastConditionsDetail ?: "",
                            familyHistory = payload?.familyHistory?.toSet() ?: emptySet(),
                            familyHistoryDetail = payload?.familyHistoryDetail ?: ""
                        )
                    }
                },
                onFailure = { /* No existing intake */ }
            )
        }
    }

    // Step navigation
    fun nextStep() {
        val state = _uiState.value
        if (!validateCurrentStep()) return

        var nextStep = state.currentStep + 1

        // Skip spouse info (step 5) if not married
        if (state.currentStep == 4 && state.maritalStatus != "menikah") {
            nextStep = 7 // Skip to social/payment
        }
        // Skip children/obstetric (step 6) if not married
        else if (state.currentStep == 5 && state.maritalStatus == "menikah") {
            nextStep = 6 // Go to children step
        }

        if (nextStep <= state.totalSteps) {
            _uiState.value = state.copy(currentStep = nextStep, error = null)
        }
    }

    fun prevStep() {
        val state = _uiState.value
        var prevStep = state.currentStep - 1

        // Skip spouse info (step 5) and children (step 6) when going back if not married
        if (state.currentStep == 7 && state.maritalStatus != "menikah") {
            prevStep = 4 // Go back to marital status
        }
        // Skip children (step 6) when going back from step 7 to step 5
        else if (state.currentStep == 7 && state.maritalStatus == "menikah" && state.hasChildren != "ya") {
            prevStep = 5 // Go back to spouse info
        }

        if (prevStep >= 1) {
            _uiState.value = state.copy(currentStep = prevStep, error = null)
        }
    }

    private fun validateCurrentStep(): Boolean {
        val state = _uiState.value
        return when (state.currentStep) {
            1 -> { // Basic Info + Registration Code
                when {
                    // Check registration code first if required
                    state.registrationCodeRequired && state.registrationCode.isBlank() -> {
                        _uiState.value = state.copy(error = "Kode registrasi wajib diisi")
                        false
                    }
                    state.registrationCodeRequired && state.registrationCode.length != 6 -> {
                        _uiState.value = state.copy(error = "Kode registrasi harus 6 karakter")
                        false
                    }
                    state.registrationCodeRequired && !state.registrationCodeValidated -> {
                        _uiState.value = state.copy(error = "Kode registrasi belum divalidasi. Tekan tombol Validasi.")
                        false
                    }
                    state.fullname.isBlank() -> {
                        _uiState.value = state.copy(error = "Nama lengkap wajib diisi")
                        false
                    }
                    state.birthDate.isBlank() -> {
                        _uiState.value = state.copy(error = "Tanggal lahir wajib diisi")
                        false
                    }
                    else -> true
                }
            }
            2 -> { // Contact
                when {
                    state.phone.isBlank() -> {
                        _uiState.value = state.copy(error = "Nomor telepon wajib diisi")
                        false
                    }
                    else -> true
                }
            }
            4 -> { // Marital Status
                if (state.maritalStatus.isBlank()) {
                    _uiState.value = state.copy(error = "Pilih status pernikahan")
                    false
                } else true
            }
            10 -> { // Confirmation
                when {
                    state.patientSignature.isBlank() -> {
                        _uiState.value = state.copy(error = "Tanda tangan (ketik nama) wajib diisi")
                        false
                    }
                    !state.consentChecked -> {
                        _uiState.value = state.copy(error = "Anda harus menyetujui penggunaan data")
                        false
                    }
                    !state.finalAckChecked -> {
                        _uiState.value = state.copy(error = "Anda harus mengkonfirmasi kebenaran data")
                        false
                    }
                    else -> true
                }
            }
            else -> true
        }
    }

    // ==================== Field Updates ====================

    fun updateFullname(value: String) {
        _uiState.value = _uiState.value.copy(fullname = value, error = null)
    }

    fun updateBirthDate(value: String) {
        _uiState.value = _uiState.value.copy(birthDate = value, error = null)
        calculateAge(value)
    }

    private fun calculateAge(birthDateStr: String) {
        try {
            val parts = birthDateStr.split("-")
            if (parts.size == 3) {
                val birthDate = LocalDate.of(parts[0].toInt(), parts[1].toInt(), parts[2].toInt())
                val age = Period.between(birthDate, LocalDate.now()).years
                _uiState.value = _uiState.value.copy(age = age)
            }
        } catch (e: Exception) {
            // Ignore parsing errors
        }
    }

    fun updateHeight(value: String) {
        val cleaned = value.filter { it.isDigit() }
        _uiState.value = _uiState.value.copy(height = cleaned, error = null)
    }

    fun updateHeightUnknown(value: Boolean) {
        _uiState.value = _uiState.value.copy(
            heightUnknown = value,
            height = if (value) "" else _uiState.value.height,
            error = null
        )
    }

    fun updateNik(value: String) {
        val cleaned = value.filter { it.isDigit() }.take(16)
        _uiState.value = _uiState.value.copy(nik = cleaned, error = null)
    }

    fun updatePhone(value: String) {
        val cleaned = value.filter { it.isDigit() }
        _uiState.value = _uiState.value.copy(phone = cleaned, error = null)
    }

    fun updateEmergencyContact(value: String) {
        val cleaned = value.filter { it.isDigit() }
        _uiState.value = _uiState.value.copy(emergencyContact = cleaned, error = null)
    }

    fun updateAddress(value: String) {
        _uiState.value = _uiState.value.copy(address = value, error = null)
    }

    fun updateMaritalStatus(value: String) {
        _uiState.value = _uiState.value.copy(maritalStatus = value, error = null)
    }

    fun updateHusbandName(value: String) {
        _uiState.value = _uiState.value.copy(husbandName = value, error = null)
    }

    fun updateHusbandAge(value: String) {
        val cleaned = value.filter { it.isDigit() }
        _uiState.value = _uiState.value.copy(husbandAge = cleaned, error = null)
    }

    fun updateHusbandJob(value: String) {
        _uiState.value = _uiState.value.copy(husbandJob = value, error = null)
    }

    fun updateHasChildren(value: String) {
        _uiState.value = _uiState.value.copy(hasChildren = value, error = null)
    }

    fun updateLivingChildrenCount(value: String) {
        val cleaned = value.filter { it.isDigit() }
        _uiState.value = _uiState.value.copy(livingChildrenCount = cleaned, error = null)
    }

    fun updateYoungestChildAge(value: String) {
        val cleaned = value.filter { it.isDigit() }
        _uiState.value = _uiState.value.copy(youngestChildAge = cleaned, error = null)
    }

    fun updateTotalPregnancies(value: String) {
        val cleaned = value.filter { it.isDigit() }
        _uiState.value = _uiState.value.copy(totalPregnancies = cleaned, error = null)
    }

    fun updateNormalDeliveryCount(value: String) {
        val cleaned = value.filter { it.isDigit() }
        _uiState.value = _uiState.value.copy(normalDeliveryCount = cleaned, error = null)
    }

    fun updateCesareanDeliveryCount(value: String) {
        val cleaned = value.filter { it.isDigit() }
        _uiState.value = _uiState.value.copy(cesareanDeliveryCount = cleaned, error = null)
    }

    fun updateMiscarriageCount(value: String) {
        val cleaned = value.filter { it.isDigit() }
        _uiState.value = _uiState.value.copy(miscarriageCount = cleaned, error = null)
    }

    fun updateHadEctopic(value: String) {
        _uiState.value = _uiState.value.copy(hadEctopic = value, error = null)
    }

    fun updateOccupation(value: String) {
        _uiState.value = _uiState.value.copy(occupation = value, error = null)
    }

    fun updateEducation(value: String) {
        _uiState.value = _uiState.value.copy(education = value, error = null)
    }

    fun togglePaymentMethod(method: String) {
        val current = _uiState.value.paymentMethods.toMutableSet()
        if (current.contains(method)) {
            current.remove(method)
        } else {
            current.add(method)
        }
        _uiState.value = _uiState.value.copy(paymentMethods = current, error = null)
    }

    fun updateInsuranceName(value: String) {
        _uiState.value = _uiState.value.copy(insuranceName = value, error = null)
    }

    fun updateBloodType(value: String) {
        _uiState.value = _uiState.value.copy(bloodType = value, error = null)
    }

    fun updateRhesus(value: String) {
        _uiState.value = _uiState.value.copy(rhesus = value, error = null)
    }

    fun updateAllergyDrugs(value: String) {
        _uiState.value = _uiState.value.copy(allergyDrugs = value, error = null)
    }

    fun updateAllergyFood(value: String) {
        _uiState.value = _uiState.value.copy(allergyFood = value, error = null)
    }

    fun updateAllergyEnv(value: String) {
        _uiState.value = _uiState.value.copy(allergyEnv = value, error = null)
    }

    // Medication updates
    fun updateMedName1(value: String) { _uiState.value = _uiState.value.copy(medName1 = value, error = null) }
    fun updateMedDose1(value: String) { _uiState.value = _uiState.value.copy(medDose1 = value, error = null) }
    fun updateMedFreq1(value: String) { _uiState.value = _uiState.value.copy(medFreq1 = value, error = null) }
    fun updateMedName2(value: String) { _uiState.value = _uiState.value.copy(medName2 = value, error = null) }
    fun updateMedDose2(value: String) { _uiState.value = _uiState.value.copy(medDose2 = value, error = null) }
    fun updateMedFreq2(value: String) { _uiState.value = _uiState.value.copy(medFreq2 = value, error = null) }
    fun updateMedName3(value: String) { _uiState.value = _uiState.value.copy(medName3 = value, error = null) }
    fun updateMedDose3(value: String) { _uiState.value = _uiState.value.copy(medDose3 = value, error = null) }
    fun updateMedFreq3(value: String) { _uiState.value = _uiState.value.copy(medFreq3 = value, error = null) }

    fun togglePastCondition(condition: String) {
        val current = _uiState.value.pastConditions.toMutableSet()
        if (current.contains(condition)) {
            current.remove(condition)
        } else {
            current.add(condition)
        }
        _uiState.value = _uiState.value.copy(pastConditions = current, error = null)
    }

    fun updatePastConditionsDetail(value: String) {
        _uiState.value = _uiState.value.copy(pastConditionsDetail = value, error = null)
    }

    fun toggleFamilyHistory(condition: String) {
        val current = _uiState.value.familyHistory.toMutableSet()
        if (current.contains(condition)) {
            current.remove(condition)
        } else {
            current.add(condition)
        }
        _uiState.value = _uiState.value.copy(familyHistory = current, error = null)
    }

    fun updateFamilyHistoryDetail(value: String) {
        _uiState.value = _uiState.value.copy(familyHistoryDetail = value, error = null)
    }

    fun updatePatientSignature(value: String) {
        _uiState.value = _uiState.value.copy(patientSignature = value, error = null)
    }

    fun updateConsentChecked(value: Boolean) {
        _uiState.value = _uiState.value.copy(consentChecked = value, error = null)
    }

    fun updateFinalAckChecked(value: Boolean) {
        _uiState.value = _uiState.value.copy(finalAckChecked = value, error = null)
    }

    fun clearError() {
        _uiState.value = _uiState.value.copy(error = null)
    }

    // ==================== Submit ====================

    fun submit() {
        if (!validateCurrentStep()) return

        val state = _uiState.value

        // Format phone number
        val phone = formatPhoneNumber(state.phone)
        if (!phone.startsWith("628") || phone.length < 11 || phone.length > 15) {
            _uiState.value = state.copy(error = "Format nomor telepon tidak valid")
            return
        }

        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true, error = null)

            val now = ZonedDateTime.now()
            val request = PatientIntakeRequest(
                fullName = state.fullname.trim(),
                dob = state.birthDate,
                phone = phone,
                age = state.age,
                height = state.height.ifBlank { null },
                heightUnknown = state.heightUnknown,
                nik = state.nik.ifBlank { null },
                address = state.address.ifBlank { null },
                emergencyContact = formatPhoneNumber(state.emergencyContact).ifBlank { null },
                maritalStatus = state.maritalStatus.ifBlank { null },
                husbandName = state.husbandName.ifBlank { null },
                husbandAge = state.husbandAge.ifBlank { null },
                husbandJob = state.husbandJob.ifBlank { null },
                hasChildren = state.hasChildren.ifBlank { null },
                livingChildrenCount = state.livingChildrenCount.ifBlank { null },
                youngestChildAge = state.youngestChildAge.ifBlank { null },
                totalPregnancies = state.totalPregnancies.ifBlank { null },
                normalDeliveryCount = state.normalDeliveryCount.ifBlank { null },
                cesareanDeliveryCount = state.cesareanDeliveryCount.ifBlank { null },
                miscarriageCount = state.miscarriageCount.ifBlank { null },
                hadEctopic = state.hadEctopic.ifBlank { null },
                occupation = state.occupation.ifBlank { null },
                education = state.education.ifBlank { null },
                paymentMethod = state.paymentMethods.toList().ifEmpty { null },
                insuranceName = state.insuranceName.ifBlank { null },
                bloodType = state.bloodType.ifBlank { null },
                rhesus = state.rhesus.ifBlank { null },
                allergyDrugs = state.allergyDrugs.ifBlank { null },
                allergyFood = state.allergyFood.ifBlank { null },
                allergyEnv = state.allergyEnv.ifBlank { null },
                medName1 = state.medName1.ifBlank { null },
                medDose1 = state.medDose1.ifBlank { null },
                medFreq1 = state.medFreq1.ifBlank { null },
                medName2 = state.medName2.ifBlank { null },
                medDose2 = state.medDose2.ifBlank { null },
                medFreq2 = state.medFreq2.ifBlank { null },
                medName3 = state.medName3.ifBlank { null },
                medDose3 = state.medDose3.ifBlank { null },
                medFreq3 = state.medFreq3.ifBlank { null },
                pastConditions = state.pastConditions.toList().ifEmpty { null },
                pastConditionsDetail = state.pastConditionsDetail.ifBlank { null },
                familyHistory = state.familyHistory.toList().ifEmpty { null },
                familyHistoryDetail = state.familyHistoryDetail.ifBlank { null },
                consent = state.consentChecked,
                finalAck = state.finalAckChecked,
                patientSignature = state.patientSignature.trim(),
                metadata = IntakeMetadata(
                    submittedAt = now.format(DateTimeFormatter.ISO_OFFSET_DATE_TIME),
                    deviceTimestamp = now.toInstant().toEpochMilli().toString()
                )
            )

            val result = if (state.isExistingIntake) {
                patientRepository.updatePatientIntake(request)
            } else {
                patientRepository.submitPatientIntake(request)
            }

            result.fold(
                onSuccess = { response ->
                    if (response.success) {
                        _uiState.value = _uiState.value.copy(
                            isLoading = false,
                            isSuccess = true,
                            successMessage = "Formulir berhasil ${if (state.isExistingIntake) "diperbarui" else "dikirim"}! Kode: ${response.quickId ?: ""}"
                        )
                    } else if (response.shouldUpdate == true) {
                        // Duplicate - offer to update
                        _uiState.value = _uiState.value.copy(
                            isLoading = false,
                            isExistingIntake = true,
                            existingSubmissionId = response.existingSubmissionId,
                            existingQuickId = response.quickId,
                            error = response.message ?: "Formulir sudah ada. Tekan kirim lagi untuk memperbarui."
                        )
                    } else {
                        _uiState.value = _uiState.value.copy(
                            isLoading = false,
                            error = response.message ?: "Gagal mengirim formulir"
                        )
                    }
                },
                onFailure = { error ->
                    _uiState.value = _uiState.value.copy(
                        isLoading = false,
                        error = error.message ?: "Terjadi kesalahan"
                    )
                }
            )
        }
    }

    private fun formatPhoneNumber(phone: String): String {
        if (phone.isBlank()) return ""
        return when {
            phone.startsWith("0") -> "62" + phone.substring(1)
            phone.startsWith("8") -> "62$phone"
            else -> phone
        }
    }
}
