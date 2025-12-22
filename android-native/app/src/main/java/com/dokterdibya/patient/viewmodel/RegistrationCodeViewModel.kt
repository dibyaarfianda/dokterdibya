package com.dokterdibya.patient.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.dokterdibya.patient.data.repository.PatientRepository
import com.dokterdibya.patient.data.repository.TokenRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

data class RegistrationCodeUiState(
    val code: String = "",
    val isLoading: Boolean = false,
    val isValid: Boolean = false,
    val error: String? = null
)

@HiltViewModel
class RegistrationCodeViewModel @Inject constructor(
    private val patientRepository: PatientRepository,
    private val tokenRepository: TokenRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(RegistrationCodeUiState())
    val uiState: StateFlow<RegistrationCodeUiState> = _uiState.asStateFlow()

    /**
     * Update code input - sanitize to uppercase alphanumeric, max 6 chars
     * Only allows A-Z and 2-9 (no 0, 1, I, O to avoid confusion)
     */
    fun updateCode(input: String) {
        // Sanitize: uppercase, remove invalid chars, max 6
        val sanitized = input
            .uppercase()
            .filter { it in 'A'..'Z' || it in '2'..'9' }
            .take(6)

        _uiState.value = _uiState.value.copy(
            code = sanitized,
            error = null
        )
    }

    /**
     * Validate the registration code against backend
     */
    fun validateCode() {
        val code = _uiState.value.code

        // Check minimum length
        if (code.length < 6) {
            _uiState.value = _uiState.value.copy(
                error = "Kode harus 6 karakter"
            )
            return
        }

        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true, error = null)

            patientRepository.validateRegistrationCode(code).fold(
                onSuccess = {
                    _uiState.value = _uiState.value.copy(
                        isLoading = false,
                        isValid = true,
                        error = null
                    )
                },
                onFailure = { error ->
                    _uiState.value = _uiState.value.copy(
                        isLoading = false,
                        isValid = false,
                        error = error.message ?: "Kode registrasi tidak valid"
                    )
                }
            )
        }
    }

    fun clearError() {
        _uiState.value = _uiState.value.copy(error = null)
    }

    fun resetValidation() {
        _uiState.value = _uiState.value.copy(isValid = false)
    }
}
