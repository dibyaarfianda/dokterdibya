package com.dokterdibya.patient.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.dokterdibya.patient.data.model.*
import com.dokterdibya.patient.data.repository.PatientRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.*
import javax.inject.Inject

@HiltViewModel
class PatientIntakeViewModel @Inject constructor(
    private val repository: PatientRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(PatientIntakeUiState())
    val uiState: StateFlow<PatientIntakeUiState> = _uiState.asStateFlow()

    init {
        loadExistingIntake()
    }

    /**
     * Load existing intake data if available
     */
    private fun loadExistingIntake() {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true)
            repository.getMyIntake().fold(
                onSuccess = { existing ->
                    if (existing != null) {
                        _uiState.value = _uiState.value.copy(
                            isLoading = false,
                            isEditMode = true,
                            existingSubmissionId = existing.submissionId
                        ).prefillFromExisting(existing.payload)
                    } else {
                        _uiState.value = _uiState.value.copy(isLoading = false)
                    }
                },
                onFailure = {
                    _uiState.value = _uiState.value.copy(isLoading = false)
                }
            )
        }
    }

    fun nextStep() {
        val currentStep = _uiState.value.currentStep
        if (currentStep < 3) {
            _uiState.value = _uiState.value.copy(currentStep = currentStep + 1)
        }
    }

    fun previousStep() {
        val currentStep = _uiState.value.currentStep
        if (currentStep > 1) {
            _uiState.value = _uiState.value.copy(currentStep = currentStep - 1)
        }
    }

    // Step 1 - Personal Info updates
    fun updateFullName(value: String) {
        _uiState.value = _uiState.value.copy(fullName = value)
    }
    fun updateDob(value: String) {
        _uiState.value = _uiState.value.copy(dob = value)
    }
    fun updatePhone(value: String) {
        _uiState.value = _uiState.value.copy(phone = value)
    }
    fun updateAddress(value: String) {
        _uiState.value = _uiState.value.copy(address = value)
    }
    fun updateEmergencyContact(value: String) {
        _uiState.value = _uiState.value.copy(emergencyContact = value)
    }
    fun updateMaritalStatus(value: String) {
        _uiState.value = _uiState.value.copy(maritalStatus = value)
    }
    fun updateHusbandName(value: String) {
        _uiState.value = _uiState.value.copy(husbandName = value)
    }
    fun updateOccupation(value: String) {
        _uiState.value = _uiState.value.copy(occupation = value)
    }
    fun updateEducation(value: String) {
        _uiState.value = _uiState.value.copy(education = value)
    }
    fun togglePaymentMethod(method: String) {
        val current = _uiState.value.paymentMethods.toMutableList()
        if (current.contains(method)) {
            current.remove(method)
        } else {
            current.add(method)
        }
        _uiState.value = _uiState.value.copy(paymentMethods = current)
    }
    fun updateInsuranceName(value: String) {
        _uiState.value = _uiState.value.copy(insuranceName = value)
    }

    // Step 2 - Medical History updates
    fun updateBloodType(value: String) {
        _uiState.value = _uiState.value.copy(bloodType = value)
    }
    fun updateRhesus(value: String) {
        _uiState.value = _uiState.value.copy(rhesus = value)
    }
    fun updateAllergyDrugs(value: String) {
        _uiState.value = _uiState.value.copy(allergyDrugs = value)
    }
    fun updateAllergyFood(value: String) {
        _uiState.value = _uiState.value.copy(allergyFood = value)
    }
    fun updateAllergyEnv(value: String) {
        _uiState.value = _uiState.value.copy(allergyEnv = value)
    }
    fun togglePastCondition(condition: String) {
        val current = _uiState.value.pastConditions.toMutableList()
        if (current.contains(condition)) {
            current.remove(condition)
        } else {
            current.add(condition)
        }
        _uiState.value = _uiState.value.copy(pastConditions = current)
    }
    fun toggleFamilyHistory(condition: String) {
        val current = _uiState.value.familyHistory.toMutableList()
        if (current.contains(condition)) {
            current.remove(condition)
        } else {
            current.add(condition)
        }
        _uiState.value = _uiState.value.copy(familyHistory = current)
    }

    // Step 3 - Consent updates
    fun updateSignature(value: String) {
        _uiState.value = _uiState.value.copy(patientSignature = value)
    }
    fun updateConsent(value: Boolean) {
        _uiState.value = _uiState.value.copy(consent = value)
    }
    fun updateFinalAck(value: Boolean) {
        _uiState.value = _uiState.value.copy(finalAck = value)
    }

    /**
     * Submit the intake form
     */
    fun submitForm(onSuccess: () -> Unit) {
        val state = _uiState.value

        // Validate required fields
        if (state.fullName.isBlank() || state.dob.isBlank() || state.phone.isBlank()) {
            _uiState.value = _uiState.value.copy(error = "Mohon isi nama lengkap, tanggal lahir, dan nomor telepon")
            return
        }
        if (state.patientSignature.isBlank()) {
            _uiState.value = _uiState.value.copy(error = "Mohon tanda tangani formulir")
            return
        }
        if (!state.consent || !state.finalAck) {
            _uiState.value = _uiState.value.copy(error = "Mohon setujui pernyataan persetujuan")
            return
        }

        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isSubmitting = true, error = null)

            val now = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply {
                timeZone = TimeZone.getTimeZone("UTC")
            }.format(Date())

            val request = PatientIntakeRequest(
                fullName = state.fullName,
                dob = state.dob,
                phone = state.phone,
                address = state.address.takeIf { it.isNotBlank() },
                emergencyContact = state.emergencyContact.takeIf { it.isNotBlank() },
                maritalStatus = state.maritalStatus.takeIf { it.isNotBlank() },
                husbandName = state.husbandName.takeIf { it.isNotBlank() },
                occupation = state.occupation.takeIf { it.isNotBlank() },
                education = state.education.takeIf { it.isNotBlank() },
                paymentMethod = state.paymentMethods.takeIf { it.isNotEmpty() },
                insuranceName = state.insuranceName.takeIf { it.isNotBlank() },
                bloodType = state.bloodType.takeIf { it.isNotBlank() },
                rhesus = state.rhesus.takeIf { it.isNotBlank() },
                allergyDrugs = state.allergyDrugs.takeIf { it.isNotBlank() },
                allergyFood = state.allergyFood.takeIf { it.isNotBlank() },
                allergyEnv = state.allergyEnv.takeIf { it.isNotBlank() },
                pastConditions = state.pastConditions.takeIf { it.isNotEmpty() },
                familyHistory = state.familyHistory.takeIf { it.isNotEmpty() },
                consent = state.consent,
                finalAck = state.finalAck,
                patientSignature = state.patientSignature,
                metadata = IntakeMetadata(
                    submittedAt = now,
                    deviceTimestamp = now
                )
            )

            val result = if (state.isEditMode) {
                repository.updatePatientIntake(request)
            } else {
                repository.submitPatientIntake(request)
            }

            result.fold(
                onSuccess = { response ->
                    if (response.success) {
                        _uiState.value = _uiState.value.copy(
                            isSubmitting = false,
                            isSubmitted = true
                        )
                        onSuccess()
                    } else if (response.shouldUpdate == true) {
                        // Handle 409 - switch to edit mode and retry
                        _uiState.value = _uiState.value.copy(
                            isEditMode = true,
                            existingSubmissionId = response.existingSubmissionId,
                            isSubmitting = false
                        )
                        submitForm(onSuccess) // Retry as update
                    } else {
                        _uiState.value = _uiState.value.copy(
                            isSubmitting = false,
                            error = response.message ?: "Gagal mengirim formulir"
                        )
                    }
                },
                onFailure = { e ->
                    _uiState.value = _uiState.value.copy(
                        isSubmitting = false,
                        error = e.message ?: "Terjadi kesalahan"
                    )
                }
            )
        }
    }

    fun clearError() {
        _uiState.value = _uiState.value.copy(error = null)
    }
}

data class PatientIntakeUiState(
    val isLoading: Boolean = true,
    val isSubmitting: Boolean = false,
    val isSubmitted: Boolean = false,
    val isEditMode: Boolean = false,
    val existingSubmissionId: String? = null,
    val currentStep: Int = 1,
    val error: String? = null,

    // Step 1 - Personal Info
    val fullName: String = "",
    val dob: String = "",
    val phone: String = "",
    val address: String = "",
    val emergencyContact: String = "",
    val maritalStatus: String = "",
    val husbandName: String = "",
    val occupation: String = "",
    val education: String = "",
    val paymentMethods: List<String> = emptyList(),
    val insuranceName: String = "",

    // Step 2 - Medical History
    val bloodType: String = "",
    val rhesus: String = "",
    val allergyDrugs: String = "",
    val allergyFood: String = "",
    val allergyEnv: String = "",
    val pastConditions: List<String> = emptyList(),
    val familyHistory: List<String> = emptyList(),

    // Step 3 - Consent
    val patientSignature: String = "",
    val consent: Boolean = false,
    val finalAck: Boolean = false
) {
    fun prefillFromExisting(payload: IntakePayload?): PatientIntakeUiState {
        return if (payload != null) {
            copy(
                fullName = payload.fullName ?: "",
                dob = payload.dob ?: "",
                phone = payload.phone ?: "",
                address = payload.address ?: "",
                emergencyContact = payload.emergencyContact ?: "",
                maritalStatus = payload.maritalStatus ?: "",
                husbandName = payload.husbandName ?: "",
                occupation = payload.occupation ?: "",
                education = payload.education ?: "",
                paymentMethods = payload.paymentMethod ?: emptyList(),
                insuranceName = payload.insuranceName ?: "",
                bloodType = payload.bloodType ?: "",
                rhesus = payload.rhesus ?: "",
                allergyDrugs = payload.allergyDrugs ?: "",
                allergyFood = payload.allergyFood ?: "",
                allergyEnv = payload.allergyEnv ?: "",
                pastConditions = payload.pastConditions ?: emptyList(),
                familyHistory = payload.familyHistory ?: emptyList()
            )
        } else this
    }
}
