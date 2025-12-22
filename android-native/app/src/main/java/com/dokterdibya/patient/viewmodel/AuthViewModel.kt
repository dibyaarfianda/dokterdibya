package com.dokterdibya.patient.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.dokterdibya.patient.data.repository.PatientRepository
import com.dokterdibya.patient.data.repository.TokenRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import javax.inject.Inject

data class AuthUiState(
    val isLoading: Boolean = false,
    val isLoggedIn: Boolean = false,
    val needsProfileCompletion: Boolean = false,
    val needsRegistrationCode: Boolean = false,
    val patientId: String? = null,
    val error: String? = null
)

@HiltViewModel
class AuthViewModel @Inject constructor(
    private val patientRepository: PatientRepository,
    private val tokenRepository: TokenRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(AuthUiState())
    val uiState: StateFlow<AuthUiState> = _uiState.asStateFlow()

    val isLoggedIn = tokenRepository.isLoggedIn()

    fun handleGoogleAuthCode(authCode: String) {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true, error = null)

            patientRepository.googleLogin(authCode).fold(
                onSuccess = { response ->
                    if (response.success) {
                        // Check if profile is complete
                        val patient = response.patientData
                        val needsCompletion = patient?.birthDate.isNullOrBlank()

                        android.util.Log.d("AuthViewModel", "Login success - birthDate: ${patient?.birthDate}, needsCompletion: $needsCompletion")

                        // For new users (needs profile completion), check if registration code is required
                        var needsRegCode = false
                        if (needsCompletion) {
                            // Check if user already has a validated registration code
                            val hasCode = tokenRepository.hasRegistrationCode().first()
                            android.util.Log.d("AuthViewModel", "hasRegistrationCode: $hasCode")
                            if (!hasCode) {
                                // Check if registration code is required from server settings
                                val codeRequired = patientRepository.isRegistrationCodeRequired()
                                    .getOrDefault(false)
                                android.util.Log.d("AuthViewModel", "isRegistrationCodeRequired: $codeRequired")
                                needsRegCode = codeRequired
                            }
                        }

                        android.util.Log.d("AuthViewModel", "Final state - needsProfileCompletion: $needsCompletion, needsRegCode: $needsRegCode")

                        _uiState.value = _uiState.value.copy(
                            isLoading = false,
                            isLoggedIn = true,
                            needsProfileCompletion = needsCompletion,
                            needsRegistrationCode = needsRegCode,
                            patientId = patient?.id
                        )
                    } else {
                        _uiState.value = _uiState.value.copy(
                            isLoading = false,
                            error = response.message ?: "Login gagal"
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

    fun setLoading(loading: Boolean) {
        _uiState.value = _uiState.value.copy(isLoading = loading)
    }

    fun setError(error: String?) {
        _uiState.value = _uiState.value.copy(error = error)
    }

    fun clearError() {
        _uiState.value = _uiState.value.copy(error = null)
    }

    // Called after registration code is validated
    fun onRegistrationCodeValidated() {
        _uiState.value = _uiState.value.copy(needsRegistrationCode = false)
    }

    // Check profile completion for returning users
    fun checkProfileCompletion() {
        viewModelScope.launch {
            patientRepository.getProfile().fold(
                onSuccess = { patient ->
                    val needsCompletion = patient.birthDate.isNullOrBlank()
                    _uiState.value = _uiState.value.copy(
                        isLoggedIn = true,
                        needsProfileCompletion = needsCompletion,
                        patientId = patient.id
                    )
                },
                onFailure = {
                    // If profile fetch fails, just go to home
                    _uiState.value = _uiState.value.copy(
                        isLoggedIn = true,
                        needsProfileCompletion = false
                    )
                }
            )
        }
    }

    // Fetch patient ID for notification service
    fun fetchPatientId() {
        viewModelScope.launch {
            patientRepository.getProfile().fold(
                onSuccess = { patient ->
                    _uiState.value = _uiState.value.copy(patientId = patient.id)
                },
                onFailure = { /* Ignore */ }
            )
        }
    }
}
