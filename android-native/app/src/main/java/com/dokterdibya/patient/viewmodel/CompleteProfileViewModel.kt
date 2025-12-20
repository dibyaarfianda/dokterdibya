package com.dokterdibya.patient.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.dokterdibya.patient.data.repository.PatientRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.Period
import javax.inject.Inject

data class CompleteProfileUiState(
    // Step 1: Basic Info
    val fullname: String = "",
    val birthDate: String = "",
    val age: Int? = null,
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

    // Step 6: Additional Info
    val occupation: String = "",
    val education: String = "",
    val insurance: String = "",

    // Step 7: Registration
    val registrationCode: String = "",
    val consentChecked: Boolean = false,

    // UI State
    val currentStep: Int = 1,
    val totalSteps: Int = 7,
    val isLoading: Boolean = false,
    val error: String? = null,
    val isSuccess: Boolean = false
)

@HiltViewModel
class CompleteProfileViewModel @Inject constructor(
    private val patientRepository: PatientRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(CompleteProfileUiState())
    val uiState: StateFlow<CompleteProfileUiState> = _uiState.asStateFlow()

    init {
        loadProfile()
    }

    private fun loadProfile() {
        viewModelScope.launch {
            patientRepository.getProfile().fold(
                onSuccess = { patient ->
                    _uiState.value = _uiState.value.copy(
                        fullname = patient.name,
                        phone = patient.phone ?: "",
                        birthDate = patient.birthDate ?: ""
                    )
                    // Calculate age if birthDate exists
                    patient.birthDate?.let { calculateAge(it) }
                },
                onFailure = { /* Ignore, user will fill in */ }
            )
        }
    }

    // Step navigation
    fun nextStep() {
        val state = _uiState.value
        if (!validateCurrentStep()) return

        // Skip spouse info if not married
        val nextStep = if (state.currentStep == 4 && state.maritalStatus != "menikah") {
            state.currentStep + 2 // Skip step 5
        } else {
            state.currentStep + 1
        }

        if (nextStep <= state.totalSteps) {
            _uiState.value = state.copy(currentStep = nextStep, error = null)
        }
    }

    fun prevStep() {
        val state = _uiState.value
        // Skip spouse info if not married
        val prevStep = if (state.currentStep == 6 && state.maritalStatus != "menikah") {
            state.currentStep - 2 // Skip step 5
        } else {
            state.currentStep - 1
        }

        if (prevStep >= 1) {
            _uiState.value = state.copy(currentStep = prevStep, error = null)
        }
    }

    private fun validateCurrentStep(): Boolean {
        val state = _uiState.value
        return when (state.currentStep) {
            1 -> {
                when {
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
            2 -> {
                when {
                    state.phone.isBlank() -> {
                        _uiState.value = state.copy(error = "Nomor telepon wajib diisi")
                        false
                    }
                    else -> true
                }
            }
            4 -> {
                if (state.maritalStatus.isBlank()) {
                    _uiState.value = state.copy(error = "Pilih status pernikahan")
                    false
                } else true
            }
            7 -> {
                when {
                    state.registrationCode.isBlank() -> {
                        _uiState.value = state.copy(error = "Kode registrasi wajib diisi")
                        false
                    }
                    !state.consentChecked -> {
                        _uiState.value = state.copy(error = "Anda harus menyetujui penggunaan data")
                        false
                    }
                    else -> true
                }
            }
            else -> true
        }
    }

    // Field updates
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

    fun updateOccupation(value: String) {
        _uiState.value = _uiState.value.copy(occupation = value, error = null)
    }

    fun updateEducation(value: String) {
        _uiState.value = _uiState.value.copy(education = value, error = null)
    }

    fun updateInsurance(value: String) {
        _uiState.value = _uiState.value.copy(insurance = value, error = null)
    }

    fun updateRegistrationCode(value: String) {
        _uiState.value = _uiState.value.copy(registrationCode = value.uppercase(), error = null)
    }

    fun updateConsentChecked(value: Boolean) {
        _uiState.value = _uiState.value.copy(consentChecked = value, error = null)
    }

    fun clearError() {
        _uiState.value = _uiState.value.copy(error = null)
    }

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

            patientRepository.completeProfileFull(
                fullname = state.fullname.trim(),
                phone = phone,
                birthDate = state.birthDate,
                age = state.age,
                nik = state.nik.ifBlank { null },
                emergencyContact = formatPhoneNumber(state.emergencyContact).ifBlank { null },
                address = state.address.ifBlank { null },
                maritalStatus = state.maritalStatus.ifBlank { null },
                husbandName = state.husbandName.ifBlank { null },
                husbandAge = state.husbandAge.toIntOrNull(),
                husbandJob = state.husbandJob.ifBlank { null },
                occupation = state.occupation.ifBlank { null },
                education = state.education.ifBlank { null },
                insurance = state.insurance.ifBlank { null },
                registrationCode = state.registrationCode.trim()
            ).fold(
                onSuccess = {
                    _uiState.value = _uiState.value.copy(
                        isLoading = false,
                        isSuccess = true
                    )
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
