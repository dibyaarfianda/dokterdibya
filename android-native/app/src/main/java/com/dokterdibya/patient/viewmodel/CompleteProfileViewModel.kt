package com.dokterdibya.patient.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.dokterdibya.patient.data.repository.PatientRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

data class CompleteProfileUiState(
    val fullname: String = "",
    val phone: String = "",
    val birthDate: String = "",
    val registrationCode: String = "",
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
                },
                onFailure = { /* Ignore, user will fill in */ }
            )
        }
    }

    fun updateFullname(value: String) {
        _uiState.value = _uiState.value.copy(fullname = value, error = null)
    }

    fun updatePhone(value: String) {
        // Only allow digits, auto-add 628 prefix
        val cleaned = value.filter { it.isDigit() }
        _uiState.value = _uiState.value.copy(phone = cleaned, error = null)
    }

    fun updateBirthDate(value: String) {
        _uiState.value = _uiState.value.copy(birthDate = value, error = null)
    }

    fun updateRegistrationCode(value: String) {
        _uiState.value = _uiState.value.copy(registrationCode = value.uppercase(), error = null)
    }

    fun clearError() {
        _uiState.value = _uiState.value.copy(error = null)
    }

    fun submit() {
        val state = _uiState.value

        // Validation
        if (state.fullname.isBlank()) {
            _uiState.value = state.copy(error = "Nama lengkap wajib diisi")
            return
        }

        if (state.phone.isBlank()) {
            _uiState.value = state.copy(error = "Nomor telepon wajib diisi")
            return
        }

        // Phone validation: must start with 628 and have 11-14 digits total
        val phone = if (state.phone.startsWith("0")) {
            "62" + state.phone.substring(1)
        } else if (state.phone.startsWith("8")) {
            "62" + state.phone
        } else {
            state.phone
        }

        if (!phone.startsWith("628") || phone.length < 11 || phone.length > 15) {
            _uiState.value = state.copy(error = "Format nomor telepon tidak valid (contoh: 6281234567890)")
            return
        }

        if (state.birthDate.isBlank()) {
            _uiState.value = state.copy(error = "Tanggal lahir wajib diisi")
            return
        }

        if (state.registrationCode.isBlank()) {
            _uiState.value = state.copy(error = "Kode registrasi wajib diisi")
            return
        }

        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true, error = null)

            patientRepository.completeProfile(
                fullname = state.fullname.trim(),
                phone = phone,
                birthDate = state.birthDate,
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
}
